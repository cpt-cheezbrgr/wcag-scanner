/**
 * WCAG Scanner Web UI — Express server with REST API + Server-Sent Events for live progress.
 */

import express from 'express';
import { createServer } from 'http';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, writeFileSync, readdirSync, readFileSync, statSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { createBrowser, scanPage } from './scanner.js';
import { Crawler } from './crawler.js';
import { aggregateResults, generateHtmlReport, generateJsonReport } from './reporter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PUBLIC_DIR = join(ROOT, 'public');
const REPORTS_DIR = join(ROOT, 'reports');

mkdirSync(REPORTS_DIR, { recursive: true });

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
  const { url, maxDepth = 3, maxPages = 50, format = 'both', includePattern, excludePattern, respectRobots = true } = req.body;

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
    options: { maxDepth, maxPages, format, includePattern, excludePattern, respectRobots },
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
    try {
      browser = await createBrowser(true);

      const crawler = new Crawler({ maxDepth, maxPages, respectRobots, includePattern, excludePattern });

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

      const allResults = await crawler.crawl(url, scanPage, browser);
      const aggregated = aggregateResults(allResults);

      // Save reports
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').substring(0, 19);
      const safeDomain = new URL(url).hostname.replace(/[^a-z0-9]/gi, '_');
      const baseName = `${safeDomain}_${timestamp}`;
      const savedReports = [];

      if (format === 'html' || format === 'both') {
        const htmlPath = join(REPORTS_DIR, `${baseName}.html`);
        writeFileSync(htmlPath, generateHtmlReport(aggregated, url));
        savedReports.push({ type: 'html', filename: `${baseName}.html`, path: htmlPath });
      }

      const jsonPath = join(REPORTS_DIR, `${baseName}.json`);
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
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const filePath = join(REPORTS_DIR, f);
        const stat = statSync(filePath);
        try {
          const data = JSON.parse(readFileSync(filePath, 'utf-8'));
          return {
            filename: f,
            startUrl: data.startUrl,
            scannedAt: data.summary?.scannedAt,
            totalPages: data.summary?.totalPages,
            totalViolations: data.summary?.totalViolations,
            complianceScore: data.summary?.complianceScore,
            size: stat.size,
          };
        } catch {
          return { filename: f, scannedAt: stat.mtime.toISOString() };
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
