/**
 * WCAG Scanner Web UI — Express server with REST API + Server-Sent Events for live progress.
 */

import express from 'express';
import { createServer } from 'http';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, writeFileSync, readdirSync, readFileSync, statSync, unlinkSync, existsSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { createBrowser, scanPage } from './scanner.js';
import { Crawler } from './crawler.js';
import { aggregateResults, generateHtmlReport, generateJsonReport } from './reporter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PUBLIC_DIR = join(ROOT, 'public');
const REPORTS_DIR = join(ROOT, 'reports');

mkdirSync(REPORTS_DIR, { recursive: true });

/**
 * Strip axe pass node details and extractedLinks from a page result before saving.
 * This prevents report files from ballooning to 200-500MB for large sites.
 * The reporter only needs pass rule IDs (not full node HTML) and violation details.
 */
function trimResult(result) {
  return {
    url: result.url,
    pageTitle: result.pageTitle,
    scannedAt: result.scannedAt,
    error: result.error,
    heuristics: result.heuristics,
    axe: result.axe ? {
      violations: result.axe.violations,
      incomplete: result.axe.incomplete,
      passes: (result.axe.passes || []).map(p => ({ id: p.id, tags: p.tags })),
    } : null,
    // extractedLinks used during crawl only — not stored in reports
  };
}

const app = express();
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// In-memory job store
const jobs = new Map();
// SSE clients: jobId -> Set of res objects
const sseClients = new Map();

function broadcast(jobId, event, data) {
  const clients = sseClients.get(jobId);
  if (!clients) return;
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(message); } catch {}
  }
}

// POST /api/scan — start a scan job
app.post('/api/scan', async (req, res) => {
  const { url, maxDepth = 3, maxPages = 50, format = 'both', includePattern, excludePattern, respectRobots = true, stripQueryStrings = true } = req.body;

  if (!url) return res.status(400).json({ error: 'url is required' });
  try { new URL(url); } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  const jobId = uuidv4();
  const job = {
    id: jobId,
    url,
    status: 'running',
    startedAt: new Date().toISOString(),
    options: { maxDepth, maxPages, format, includePattern, excludePattern, respectRobots, stripQueryStrings },
    progress: { pagesScanned: 0, pagesDiscovered: 0, currentUrl: null },
    reports: [],
    summary: null,
    error: null,
  };
  jobs.set(jobId, job);
  sseClients.set(jobId, new Set());

  res.json({ jobId });

  // Run scan asynchronously
  (async () => {
    let browser;

    // Generate file paths upfront so checkpoints can be written incrementally
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').substring(0, 19);
    const safeDomain = new URL(url).hostname.replace(/[^a-z0-9]/gi, '_');
    const baseName = `${safeDomain}_${timestamp}`;
    const jsonPath = join(REPORTS_DIR, `${baseName}.json`);
    const htmlPath = join(REPORTS_DIR, `${baseName}.html`);

    // Accumulate trimmed page results for checkpointing and final report
    const partialResults = [];

    // Small metadata sidecar — written alongside the main JSON so the sidebar
    // can read it instantly without loading the full (potentially 500MB) file.
    const writeMeta = (status, errorMsg = null) => {
      try {
        const meta = {
          startUrl: url,
          status,
          startedAt: job.startedAt,
          options: { maxDepth, maxPages, format, includePattern, excludePattern, respectRobots, stripQueryStrings },
          ...(errorMsg ? { error: errorMsg } : {}),
          summary: { totalPages: partialResults.length, scannedAt: job.startedAt },
          pendingUrlsCount: crawlerRef ? crawlerRef.queue.length : 0,
        };
        writeFileSync(jsonPath.replace('.json', '.meta.json'), JSON.stringify(meta));
      } catch { /* non-fatal */ }
    };

    // Write checkpoint every 10 pages to disk (survives crashes/restarts).
    let checkpointDirty = false;
    let crawlerRef = null; // set after crawler is created
    const visitedPath = jsonPath.replace('.json', '.visited.json');

    const writeCheckpoint = (status = 'in-progress', errorMsg = null) => {
      try {
        const pendingUrls = crawlerRef ? crawlerRef.queue.map(i => i.url) : [];
        const partial = {
          startUrl: url,
          status,
          startedAt: job.startedAt,
          options: { maxDepth, maxPages, format, includePattern, excludePattern, respectRobots, stripQueryStrings },
          ...(errorMsg ? { error: errorMsg } : {}),
          summary: { totalPages: partialResults.length, scannedAt: job.startedAt },
          pendingUrls,
          pages: partialResults,
        };
        writeFileSync(jsonPath, JSON.stringify(partial, null, 2));
        // Small sidecar: just visited + pending URLs — used by resume to avoid
        // loading the full (potentially hundreds of MB) checkpoint JSON.
        const visitedUrls = crawlerRef ? [...crawlerRef.visited] : partialResults.map(p => p.url);
        writeFileSync(visitedPath, JSON.stringify({ visitedUrls, pendingUrls }));
        writeMeta(status, errorMsg);
        checkpointDirty = false;
      } catch { /* non-fatal */ }
    };

    // Write an initial checkpoint + meta so the file exists immediately
    writeCheckpoint();

    try {
      browser = await createBrowser(true);

      const crawler = new Crawler({ maxDepth, maxPages, respectRobots, includePattern, excludePattern, stripQueryStrings });
      crawlerRef = crawler;

      crawler.on('page:start', ({ url: pageUrl, index }) => {
        job.progress.currentUrl = pageUrl;
        job.progress.pagesDiscovered = index;
        broadcast(jobId, 'progress', {
          type: 'page:start',
          url: pageUrl,
          index,
          pagesScanned: job.progress.pagesScanned,
        });
      });

      crawler.on('page:done', ({ url: pageUrl, index, violations, heuristics, error }) => {
        job.progress.pagesScanned = index;
        broadcast(jobId, 'progress', {
          type: 'page:done',
          url: pageUrl,
          index,
          violations,
          heuristics,
          error,
        });
      });

      // Wrap scanPage: trim and store each result, checkpoint every 10 pages
      const scanPageWithCheckpoint = async (pageUrl, browser, options) => {
        const result = await scanPage(pageUrl, browser, options);
        partialResults.push(trimResult(result));
        checkpointDirty = true;
        if (partialResults.length % 10 === 0) writeCheckpoint();
        // Return original result (with extractedLinks) so the crawler can use it
        return result;
      };

      await crawler.crawl(url, scanPageWithCheckpoint, browser);

      // Write any remaining pages that haven't been checkpointed yet
      if (checkpointDirty) writeCheckpoint();

      // Aggregate using the already-trimmed results (passes only have id+tags, no nodes)
      const aggregated = aggregateResults(partialResults);

      // Finalize: overwrite checkpoint JSON with complete aggregated report
      const savedReports = [];

      if (format === 'html' || format === 'both') {
        writeFileSync(htmlPath, generateHtmlReport(aggregated, url));
        savedReports.push({ type: 'html', filename: `${baseName}.html`, path: htmlPath });
      }

      writeFileSync(jsonPath, generateJsonReport(aggregated, url));
      savedReports.push({ type: 'json', filename: `${baseName}.json`, path: jsonPath });

      job.status = 'done';
      job.completedAt = new Date().toISOString();
      job.reports = savedReports;
      job.summary = aggregated.summary;

      broadcast(jobId, 'done', {
        jobId,
        summary: aggregated.summary,
        reports: savedReports.map(r => ({ type: r.type, filename: r.filename })),
      });

    } catch (err) {
      job.status = 'error';
      job.error = err.message;
      // Flush any un-checkpointed pages, then mark as interrupted
      writeCheckpoint('interrupted', err.message);
      broadcast(jobId, 'error', { message: err.message });
    } finally {
      if (browser) await browser.close();
      // Close SSE connections after a delay
      setTimeout(() => {
        const clients = sseClients.get(jobId);
        if (clients) { for (const res of clients) try { res.end(); } catch {} }
        sseClients.delete(jobId);
      }, 5000);
    }
  })();
});

// GET /api/scan/:jobId — SSE stream for live progress
app.get('/api/scan/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  // If job is done/error, send final state immediately
  if (job.status === 'done' || job.status === 'error') {
    res.json(job);
    return;
  }

  // SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Send current state
  res.write(`event: init\ndata: ${JSON.stringify({ jobId, status: job.status, progress: job.progress })}\n\n`);

  const clients = sseClients.get(jobId) || new Set();
  clients.add(res);
  sseClients.set(jobId, clients);

  req.on('close', () => {
    clients.delete(res);
  });
});

// GET /api/job/:jobId — job status (polling alternative)
app.get('/api/job/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// GET /api/reports — list saved reports
app.get('/api/reports', (req, res) => {
  try {
    const files = readdirSync(REPORTS_DIR)
      .filter(f => f.endsWith('.json') && !f.endsWith('.meta.json'))
      .map(f => {
        const filePath = join(REPORTS_DIR, f);
        const stat = statSync(filePath);
        const metaPath = filePath.replace('.json', '.meta.json');
        const htmlPath = filePath.replace('.json', '.html');
        try {
          // Prefer the small .meta.json sidecar — avoids reading 200-500MB report files
          const data = existsSync(metaPath)
            ? JSON.parse(readFileSync(metaPath, 'utf-8'))
            : JSON.parse(readFileSync(filePath, 'utf-8'));
          return {
            filename: f,
            startUrl: data.startUrl,
            scannedAt: data.summary?.scannedAt || data.startedAt,
            totalPages: data.summary?.totalPages,
            totalViolations: data.summary?.totalViolations,
            complianceScore: data.summary?.complianceScore,
            status: data.status || 'completed',
            hasHtml: existsSync(htmlPath),
            pendingUrlsCount: data.pendingUrlsCount ?? (data.pendingUrls?.length ?? 0),
            size: stat.size,
          };
        } catch {
          return { filename: f, scannedAt: stat.mtime.toISOString(), status: 'completed', hasHtml: existsSync(htmlPath) };
        }
      })
      .sort((a, b) => new Date(b.scannedAt) - new Date(a.scannedAt));
    res.json(files);
  } catch {
    res.json([]);
  }
});

// GET /api/reports/:filename — fetch report JSON data
app.get('/api/reports/:filename', (req, res) => {
  const filename = req.params.filename.replace(/[^a-z0-9_\-.]/gi, '');
  if (!filename.endsWith('.json')) return res.status(400).json({ error: 'JSON files only' });
  try {
    const filePath = join(REPORTS_DIR, filename);
    const data = readFileSync(filePath, 'utf-8');
    res.type('json').send(data);
  } catch {
    res.status(404).json({ error: 'Report not found' });
  }
});

// POST /api/reports/:filename/finalize — generate HTML report from a partial checkpoint
app.post('/api/reports/:filename/finalize', async (req, res) => {
  const filename = req.params.filename.replace(/[^a-z0-9_\-.]/gi, '');
  if (!filename.endsWith('.json')) return res.status(400).json({ error: 'JSON files only' });

  const jsonPath = join(REPORTS_DIR, filename);
  if (!existsSync(jsonPath)) return res.status(404).json({ error: 'Report not found' });

  try {
    const data = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    if (!data.pages || data.pages.length === 0) {
      return res.status(400).json({ error: 'No page data in checkpoint' });
    }

    const aggregated = aggregateResults(data.pages);
    const htmlPath = jsonPath.replace('.json', '.html');
    const metaPath = jsonPath.replace('.json', '.meta.json');

    writeFileSync(htmlPath, generateHtmlReport(aggregated, data.startUrl));

    // Update checkpoint status to completed and add aggregated summary
    data.status = 'completed';
    data.summary = aggregated.summary;
    writeFileSync(jsonPath, JSON.stringify(data, null, 2));

    // Update meta sidecar
    if (existsSync(metaPath)) {
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      meta.status = 'completed';
      meta.summary = aggregated.summary;
      writeFileSync(metaPath, JSON.stringify(meta));
    }

    res.json({
      success: true,
      htmlFilename: filename.replace('.json', '.html'),
      summary: aggregated.summary,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reports/:filename/resume — resume an interrupted scan from its checkpoint
app.post('/api/reports/:filename/resume', async (req, res) => {
  const filename = req.params.filename.replace(/[^a-z0-9_\-.]/gi, '');
  if (!filename.endsWith('.json')) return res.status(400).json({ error: 'JSON files only' });

  const existingPath = join(REPORTS_DIR, filename);
  if (!existsSync(existingPath)) return res.status(404).json({ error: 'Report not found' });

  const metaPath = existingPath.replace('.json', '.meta.json');
  const visitedPath = existingPath.replace('.json', '.visited.json');

  // Load checkpoint info. Always check the small meta.json sidecar first —
  // reading the full checkpoint JSON (200-500MB) into memory crashes Node.js
  // and drops the connection, causing a "Load failed" error in the browser.
  let url, savedOptions = {}, previousResults = [], pendingUrls = [], visitedUrls = [];
  let checkpointStartedAt = new Date().toISOString();

  if (existsSync(metaPath)) {
    // Fast path: read only the tiny sidecar files
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
    if (meta.status === 'completed') return res.status(400).json({ error: 'Scan already completed — open the report to view results.' });
    url = meta.startUrl;
    savedOptions = meta.options || {};
    checkpointStartedAt = meta.startedAt || checkpointStartedAt;
    if (existsSync(visitedPath)) {
      const v = JSON.parse(readFileSync(visitedPath, 'utf-8'));
      visitedUrls = v.visitedUrls || [];
      pendingUrls = v.pendingUrls || [];
    }
  } else {
    // No sidecar — fall back to parsing the checkpoint JSON directly.
    // Only safe for small files; large ones will have crashed before sidecar
    // support was added. Limit to 50MB to avoid OOM.
    const fileSize = statSync(existingPath).size;
    const TOO_LARGE = 50 * 1024 * 1024; // 50MB
    if (fileSize > TOO_LARGE) {
      return res.status(500).json({ error: 'This scan predates sidecar file support and is too large to resume. Delete it and start a fresh scan.' });
    }
    let checkpoint;
    try {
      checkpoint = JSON.parse(readFileSync(existingPath, 'utf-8'));
    } catch (err) {
      return res.status(500).json({ error: 'Could not parse checkpoint: ' + err.message });
    }
    if (!checkpoint.startUrl) return res.status(400).json({ error: 'Checkpoint missing startUrl' });
    if (checkpoint.status === 'completed') return res.status(400).json({ error: 'Scan already completed — open the report to view results.' });
    url = checkpoint.startUrl;
    savedOptions = checkpoint.options || {};
    previousResults = checkpoint.pages || [];
    pendingUrls = checkpoint.pendingUrls || [];
    visitedUrls = previousResults.map(p => p.url).filter(Boolean);
    checkpointStartedAt = checkpoint.startedAt || checkpointStartedAt;
  }

  if (!url) return res.status(400).json({ error: 'Could not determine start URL from checkpoint' });

  const { maxDepth = 3, maxPages = 0, format = 'both', includePattern, excludePattern, respectRobots = true, stripQueryStrings = true } = savedOptions;

  const jobId = uuidv4();
  const job = {
    id: jobId,
    url,
    status: 'running',
    startedAt: new Date().toISOString(),
    resumedFrom: filename,
    previousPages: previousResults.length,
    options: { maxDepth, maxPages, format, includePattern, excludePattern, respectRobots, stripQueryStrings },
    progress: { pagesScanned: previousResults.length, pagesDiscovered: previousResults.length, currentUrl: null },
    reports: [],
    summary: null,
    error: null,
  };
  jobs.set(jobId, job);
  sseClients.set(jobId, new Set());

  res.json({ jobId, previousPages: previousResults.length, pendingUrls: pendingUrls.length });

  (async () => {
    let browser;
    const jsonPath = existingPath; // overwrite the same checkpoint file
    const htmlPath = existingPath.replace('.json', '.html');
    const metaPath = existingPath.replace('.json', '.meta.json');

    // Start with previously scanned results already in memory (may be empty for large checkpoints)
    const partialResults = [...previousResults];

    let checkpointDirty = false;
    let crawlerRef = null;
    const resumeVisitedPath = existingPath.replace('.json', '.visited.json');

    const writeMeta = (status, errorMsg = null) => {
      try {
        const meta = {
          startUrl: url, status,
          startedAt: checkpointStartedAt,
          options: savedOptions,
          ...(errorMsg ? { error: errorMsg } : {}),
          summary: { totalPages: partialResults.length, scannedAt: checkpointStartedAt },
          pendingUrlsCount: crawlerRef ? crawlerRef.queue.length : 0,
        };
        writeFileSync(metaPath, JSON.stringify(meta));
      } catch {}
    };

    const writeResumeCheckpoint = (status = 'in-progress', errorMsg = null) => {
      try {
        const pendingUrlsList = crawlerRef ? crawlerRef.queue.map(i => i.url) : [];
        const partial = {
          startUrl: url, status,
          startedAt: checkpointStartedAt,
          options: savedOptions,
          ...(errorMsg ? { error: errorMsg } : {}),
          summary: { totalPages: partialResults.length, scannedAt: checkpointStartedAt },
          pendingUrls: pendingUrlsList,
          pages: partialResults,
        };
        writeFileSync(jsonPath, JSON.stringify(partial, null, 2));
        // Update visited sidecar
        const allVisited = crawlerRef ? [...crawlerRef.visited] : partialResults.map(p => p.url).filter(Boolean);
        writeFileSync(resumeVisitedPath, JSON.stringify({ visitedUrls: allVisited, pendingUrls: pendingUrlsList }));
        writeMeta(status, errorMsg);
        checkpointDirty = false;
      } catch {}
    };

    try {
      browser = await createBrowser(true);

      // Remaining page budget (0 = unlimited)
      const remainingPages = maxPages === 0 ? 0 : Math.max(1, maxPages - previousResults.length);
      const crawler = new Crawler({ maxDepth, maxPages: remainingPages, respectRobots, includePattern, excludePattern });
      crawlerRef = crawler;

      // Pre-populate visited set from previously scanned pages + visited sidecar
      for (const u of visitedUrls) crawler.visited.add(u);
      for (const page of previousResults) { if (page.url) crawler.visited.add(page.url); }

      // Pre-populate queue from checkpoint if available, otherwise start fresh from root
      if (pendingUrls.length > 0) {
        for (const pendingUrl of pendingUrls) {
          if (!crawler.visited.has(pendingUrl)) {
            crawler.visited.add(pendingUrl);
            crawler.queue.push({ url: pendingUrl, depth: 1 });
          }
        }
      }
      // If no pendingUrls, crawl() will start from the root URL and the
      // pre-populated visited set will cause already-scanned pages to be skipped.

      crawler.on('page:start', ({ url: pageUrl, index }) => {
        const totalIndex = previousResults.length + index;
        job.progress.currentUrl = pageUrl;
        job.progress.pagesDiscovered = totalIndex;
        broadcast(jobId, 'progress', { type: 'page:start', url: pageUrl, index: totalIndex, pagesScanned: job.progress.pagesScanned });
      });

      crawler.on('page:done', ({ url: pageUrl, index, violations, heuristics, error }) => {
        job.progress.pagesScanned = previousResults.length + index;
        broadcast(jobId, 'progress', { type: 'page:done', url: pageUrl, index: previousResults.length + index, violations, heuristics, error });
      });

      const scanPageWithCheckpoint = async (pageUrl, browser, options) => {
        const result = await scanPage(pageUrl, browser, options);
        partialResults.push(trimResult(result));
        checkpointDirty = true;
        if (partialResults.length % 10 === 0) writeResumeCheckpoint();
        return result;
      };

      await crawler.crawl(url, scanPageWithCheckpoint, browser);
      if (checkpointDirty) writeResumeCheckpoint();

      const aggregated = aggregateResults(partialResults);
      const savedReports = [];

      if (format === 'html' || format === 'both') {
        writeFileSync(htmlPath, generateHtmlReport(aggregated, url));
        savedReports.push({ type: 'html', filename: filename.replace('.json', '.html'), path: htmlPath });
      }

      writeFileSync(jsonPath, generateJsonReport(aggregated, url));
      savedReports.push({ type: 'json', filename, path: jsonPath });

      // Update meta to reflect completion
      try {
        const meta = { startUrl: url, status: 'completed', startedAt: checkpoint.startedAt, options: savedOptions, summary: aggregated.summary, pendingUrlsCount: 0 };
        writeFileSync(metaPath, JSON.stringify(meta));
      } catch {}

      job.status = 'done';
      job.completedAt = new Date().toISOString();
      job.reports = savedReports;
      job.summary = aggregated.summary;

      broadcast(jobId, 'done', {
        jobId,
        summary: aggregated.summary,
        reports: savedReports.map(r => ({ type: r.type, filename: r.filename })),
      });

    } catch (err) {
      job.status = 'error';
      job.error = err.message;
      writeResumeCheckpoint('interrupted', err.message);
      broadcast(jobId, 'error', { message: err.message });
    } finally {
      if (browser) await browser.close();
      setTimeout(() => {
        const clients = sseClients.get(jobId);
        if (clients) { for (const res of clients) try { res.end(); } catch {} }
        sseClients.delete(jobId);
      }, 5000);
    }
  })();
});

// DELETE /api/reports/:filename — delete a report (removes both JSON and HTML files)
app.delete('/api/reports/:filename', (req, res) => {
  const filename = req.params.filename.replace(/[^a-z0-9_\-.]/gi, '');
  if (!filename.endsWith('.json')) return res.status(400).json({ error: 'JSON files only' });

  const jsonPath = join(REPORTS_DIR, filename);
  const htmlPath = join(REPORTS_DIR, filename.replace('.json', '.html'));

  if (!existsSync(jsonPath)) return res.status(404).json({ error: 'Report not found' });

  try {
    unlinkSync(jsonPath);
    if (existsSync(htmlPath)) unlinkSync(htmlPath);
    const metaPath = join(REPORTS_DIR, filename.replace('.json', '.meta.json'));
    if (existsSync(metaPath)) unlinkSync(metaPath);
    const visitedPath = join(REPORTS_DIR, filename.replace('.json', '.visited.json'));
    if (existsSync(visitedPath)) unlinkSync(visitedPath);
    res.json({ deleted: filename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/restart — gracefully restart the server process (requires --watch or process manager)
app.post('/api/restart', (req, res) => {
  res.json({ message: 'Restarting server...' });
  setTimeout(() => process.exit(0), 300);
});

// GET /api/ping — health check
app.get('/api/ping', (req, res) => res.json({ ok: true }));

// GET /reports/:filename — serve HTML reports
app.get('/reports/:filename', (req, res) => {
  const filename = req.params.filename.replace(/[^a-z0-9_\-.]/gi, '');
  if (!filename.endsWith('.html')) return res.status(400).send('HTML files only');
  try {
    res.sendFile(join(REPORTS_DIR, filename));
  } catch {
    res.status(404).send('Report not found');
  }
});

const PORT = process.env.PORT || 3000;
const server = createServer(app);
server.listen(PORT, () => {
  console.log('');
  console.log('  ┌─────────────────────────────────────────────┐');
  console.log('  │   WCAG 2.1 AA Scanner — Web UI              │');
  console.log(`  │   http://localhost:${PORT}                       │`);
  console.log('  │                                             │');
  console.log('  │   HHS Section 504 Compliance Tool           │');
  console.log('  └─────────────────────────────────────────────┘');
  console.log('');
});

export { app };
