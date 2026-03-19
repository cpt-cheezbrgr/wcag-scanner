/**
 * WCAG Scanner Web UI — Frontend JavaScript
 */

const IMPACT_COLORS = {
  critical: '#c0392b',
  serious: '#e67e22',
  moderate: '#f1c40f',
  minor: '#3498db',
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const scanForm = document.getElementById('scan-form');
const urlInput = document.getElementById('url-input');
const depthSlider = document.getElementById('depth-slider');
const depthValue = document.getElementById('depth-value');
const pagesSlider = document.getElementById('pages-slider');
const pagesValue = document.getElementById('pages-value');
const scanBtn = document.getElementById('scan-btn');
const advancedToggle = document.getElementById('advanced-toggle');
const advancedFields = document.getElementById('advanced-fields');
const allPagesCheck = document.getElementById('all-pages-check');

const welcomeState = document.getElementById('welcome-state');
const scanState = document.getElementById('scan-state');
const resultsState = document.getElementById('results-state');

const scanUrlDisplay = document.getElementById('scan-url-display');
const progressBar = document.getElementById('progress-bar');
const progressBarWrap = document.getElementById('progress-bar-wrap');
const pagesStatus = document.getElementById('pages-status');
const currentUrlStatus = document.getElementById('current-url-status');
const pagesLog = document.getElementById('pages-log');

const pastList = document.getElementById('past-list');
const pastEmpty = document.getElementById('past-empty');

// ── State ─────────────────────────────────────────────────────────────────────
let currentJobId = null;
let currentScanData = null;
let maxPagesForJob = 50;

// ── Slider labels ─────────────────────────────────────────────────────────────
depthSlider.addEventListener('input', () => { depthValue.textContent = depthSlider.value; });
pagesSlider.addEventListener('input', () => { pagesValue.textContent = pagesSlider.value; });

allPagesCheck.addEventListener('change', () => {
  const unlimited = allPagesCheck.checked;
  pagesSlider.disabled = unlimited;
  pagesValue.textContent = unlimited ? '∞' : pagesSlider.value;
});

// ── Advanced options toggle ───────────────────────────────────────────────────
advancedToggle.addEventListener('click', () => {
  const open = advancedFields.classList.toggle('open');
  advancedToggle.textContent = (open ? '▼' : '▶') + ' Advanced options';
  advancedToggle.setAttribute('aria-expanded', String(open));
  advancedFields.setAttribute('aria-hidden', String(!open));
});

// ── States ────────────────────────────────────────────────────────────────────
function showState(state) {
  welcomeState.hidden = state !== 'welcome';
  scanState.hidden = state !== 'scanning';
  resultsState.hidden = state !== 'results';
}

// ── Scan form submit ──────────────────────────────────────────────────────────
scanForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();
  if (!url) { urlInput.focus(); return; }
  try { new URL(url); } catch {
    urlInput.setCustomValidity('Please enter a valid URL including https://');
    urlInput.reportValidity();
    return;
  }
  urlInput.setCustomValidity('');
  await startScan(url);
});

async function startScan(url) {
  const maxDepth = parseInt(depthSlider.value, 10);
  const maxPages = allPagesCheck.checked ? 0 : parseInt(pagesSlider.value, 10);
  const includePattern = document.getElementById('include-pattern').value.trim() || undefined;
  const excludePattern = document.getElementById('exclude-pattern').value.trim() || undefined;
  const respectRobots = document.getElementById('robots-select').value === 'true';

  maxPagesForJob = maxPages;
  scanBtn.disabled = true;
  scanBtn.textContent = 'Scanning…';

  // Reset scanning UI
  pagesLog.innerHTML = '';
  if (maxPages === 0) {
    progressBar.classList.add('indeterminate');
    progressBar.style.width = '';
  } else {
    progressBar.classList.remove('indeterminate');
    progressBar.style.width = '0%';
  }
  pagesStatus.textContent = '0 pages scanned';
  currentUrlStatus.textContent = '';
  scanUrlDisplay.textContent = url;
  showState('scanning');

  try {
    const resp = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, maxDepth, maxPages, format: 'both', includePattern, excludePattern, respectRobots }),
    });
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || 'Failed to start scan');
    }
    const { jobId } = await resp.json();
    currentJobId = jobId;
    listenToJob(jobId, maxPages);
  } catch (err) {
    alert(`Scan failed: ${err.message}`);
    resetForm();
    showState('welcome');
  }
}

function listenToJob(jobId, maxPages) {
  const evtSource = new EventSource(`/api/scan/${jobId}`);
  let scannedCount = 0;

  evtSource.addEventListener('init', (e) => {
    const data = JSON.parse(e.data);
    pagesStatus.textContent = `${data.progress.pagesScanned} pages scanned`;
  });

  evtSource.addEventListener('progress', (e) => {
    const data = JSON.parse(e.data);

    if (data.type === 'page:start') {
      const pct = maxPages === 0 ? 50 : Math.min(Math.round((data.index / maxPages) * 90), 90);
      progressBar.style.width = pct + '%';
      progressBarWrap.setAttribute('aria-valuenow', pct);
      currentUrlStatus.textContent = shortenUrl(data.url, 40);

      // Add pending log entry
      const entry = document.createElement('div');
      entry.className = 'log-entry pending';
      entry.dataset.url = data.url;
      entry.innerHTML = `<span class="log-status">⟳</span><span class="log-url">${escHtml(shortenUrl(data.url, 70))}</span>`;
      pagesLog.appendChild(entry);
      pagesLog.scrollTop = pagesLog.scrollHeight;
    }

    if (data.type === 'page:done') {
      scannedCount = data.index;
      pagesStatus.textContent = `${scannedCount} page${scannedCount !== 1 ? 's' : ''} scanned`;
      currentUrlStatus.textContent = '';

      // Update log entry
      const entries = pagesLog.querySelectorAll(`.log-entry[data-url]`);
      let entry = null;
      entries.forEach(el => { if (el.dataset.url === data.url) entry = el; });

      if (entry) {
        const hasViolations = (data.violations || 0) + (data.heuristics || 0) > 0;
        const hasError = !!data.error;
        entry.className = `log-entry ${hasError ? 'done-err' : hasViolations ? 'done-warn' : 'done-clean'}`;
        const icon = hasError ? '✗' : hasViolations ? '⚠' : '✓';
        const countText = hasError
          ? 'error'
          : hasViolations
          ? `${data.violations || 0}v ${data.heuristics || 0}h`
          : 'clean';
        const countClass = hasViolations || hasError ? 'has-violations' : 'clean';
        entry.innerHTML = `<span class="log-status">${icon}</span><span class="log-url">${escHtml(shortenUrl(data.url, 60))}</span><span class="log-count ${countClass}">${countText}</span>`;
        pagesLog.scrollTop = pagesLog.scrollHeight;
      }
    }
  });

  evtSource.addEventListener('done', async (e) => {
    evtSource.close();
    progressBar.classList.remove('indeterminate');
    progressBar.style.width = '100%';
    progressBarWrap.setAttribute('aria-valuenow', 100);

    const data = JSON.parse(e.data);
    // Fetch full report data
    const jsonReport = data.reports.find(r => r.type === 'json');
    if (jsonReport) {
      try {
        const resp = await fetch(`/api/reports/${jsonReport.filename}`);
        const reportData = await resp.json();
        renderResults(reportData, data.reports);
      } catch {
        renderResults({ summary: data.summary }, data.reports);
      }
    } else {
      renderResults({ summary: data.summary }, data.reports);
    }

    resetForm();
    loadPastReports();
    showState('results');
  });

  evtSource.addEventListener('error', (e) => {
    evtSource.close();
    let msg = 'Scan encountered an error.';
    try { msg = JSON.parse(e.data).message; } catch {}
    alert(`Scan error: ${msg}`);
    resetForm();
    showState('welcome');
  });

  // Fallback: if SSE isn't supported, poll
  if (typeof EventSource === 'undefined') {
    pollJob(jobId);
  }
}

async function pollJob(jobId) {
  const interval = setInterval(async () => {
    try {
      const resp = await fetch(`/api/job/${jobId}`);
      const job = await resp.json();
      if (job.status === 'done') {
        clearInterval(interval);
        loadPastReports();
        showState('welcome');
        resetForm();
      } else if (job.status === 'error') {
        clearInterval(interval);
        alert(`Scan error: ${job.error}`);
        resetForm();
        showState('welcome');
      }
    } catch {}
  }, 2000);
}

function resetForm() {
  scanBtn.disabled = false;
  scanBtn.textContent = 'Start Accessibility Scan';
}

// ── Render results ────────────────────────────────────────────────────────────
function renderResults(data, reports) {
  currentScanData = data;
  const s = data.summary || {};

  // Title
  document.getElementById('results-title').textContent = 'Scan Results';
  document.getElementById('results-meta').textContent =
    `${s.totalPages || 0} pages · ${new Date(s.scannedAt || Date.now()).toLocaleString()}`;

  // Report links
  const htmlReport = (reports || []).find(r => r.type === 'html');
  const jsonReport = (reports || []).find(r => r.type === 'json');
  const htmlLink = document.getElementById('html-report-link');
  const jsonLink = document.getElementById('json-report-link');
  if (htmlReport) { htmlLink.href = `/reports/${htmlReport.filename}`; htmlLink.hidden = false; }
  if (jsonReport) { jsonLink.href = `/api/reports/${jsonReport.filename}`; jsonLink.hidden = false; }

  // Summary cards
  const scoreColor = (s.complianceScore || 0) >= 80 ? '#27ae60' : (s.complianceScore || 0) >= 60 ? '#e67e22' : '#c0392b';
  const grid = document.getElementById('summary-grid');
  grid.innerHTML = [
    { value: (s.complianceScore || 0) + '%', label: 'Automated Score', color: scoreColor },
    { value: s.totalViolations || 0, label: 'Violations', color: (s.totalViolations || 0) > 0 ? '#c0392b' : '#27ae60' },
    { value: s.impactCounts?.critical || 0, label: 'Critical', color: '#c0392b' },
    { value: s.impactCounts?.serious || 0, label: 'Serious', color: '#e67e22' },
    { value: s.impactCounts?.moderate || 0, label: 'Moderate', color: '#f1c40f' },
    { value: s.impactCounts?.minor || 0, label: 'Minor', color: '#3498db' },
    { value: s.totalHeuristicIssues || 0, label: 'Heuristic', color: '#9b59b6' },
    { value: s.totalPages || 0, label: 'Pages', color: '#2c3e50' },
  ].map(c => `
    <div class="summary-card">
      <div class="value" style="color:${c.color}">${c.value}</div>
      <div class="label">${c.label}</div>
    </div>
  `).join('');

  // Violations
  const violations = data.violations || [];
  document.getElementById('violations-count-badge').textContent = violations.length;
  const vList = document.getElementById('violations-list');
  const filterBar = document.getElementById('filter-bar');

  if (violations.length === 0) {
    vList.innerHTML = '<div class="empty-state">No automated violations detected.</div>';
    filterBar.innerHTML = '';
  } else {
    const impactGroups = ['critical', 'serious', 'moderate', 'minor'];
    const counts = {};
    impactGroups.forEach(i => counts[i] = violations.filter(v => v.impact === i).length);

    filterBar.innerHTML = `
      <button class="filter-btn active" onclick="filterViolations('all',this)">All (${violations.length})</button>
      ${impactGroups.filter(i => counts[i] > 0).map(i =>
        `<button class="filter-btn" onclick="filterViolations('${i}',this)">${cap(i)} (${counts[i]})</button>`
      ).join('')}
    `;

    vList.innerHTML = violations.map(v => renderViolationCard(v, false)).join('');
  }

  // Heuristics
  const heuristics = data.heuristics || [];
  document.getElementById('heuristics-count-badge').textContent = heuristics.length;
  const hList = document.getElementById('heuristics-list');
  hList.innerHTML = heuristics.length
    ? heuristics.map(h => renderViolationCard(h, true)).join('')
    : '<div class="empty-state">No heuristic issues detected.</div>';

  // Incomplete
  const incomplete = data.incomplete || [];
  document.getElementById('incomplete-count-badge').textContent = incomplete.length;
  const iList = document.getElementById('incomplete-list');
  iList.innerHTML = incomplete.length
    ? incomplete.map(v => `
        <div class="violation-row" style="border-left-color:#888">
          <div class="v-header">
            <span class="badge badge-review">needs review</span>
            <span class="v-title">${escHtml(v.help || v.id)}</span>
          </div>
          <div class="v-desc">${escHtml(v.description || '')}</div>
          ${v.helpUrl ? `<div class="v-fix"><a href="${escHtml(v.helpUrl)}" target="_blank" rel="noopener">View guidance ↗</a></div>` : ''}
          <div class="v-pages">Affected pages: ${(v.affectedPages || []).length}</div>
        </div>
      `).join('')
    : '<div class="empty-state">No items flagged for review.</div>';
}

function renderViolationCard(v, isHeuristic) {
  const impact = v.impact || 'moderate';
  const wcagTags = (v.tags || v.wcagCriteria || [])
    .filter(t => /wcag\d/.test(t) || /^\d+\.\d+\.\d+$/.test(t))
    .map(t => `<span class="wcag-tag">${escHtml(t.replace('wcag', 'WCAG '))}</span>`)
    .join(' ');

  const pages = (v.affectedPages || []);
  const pagesText = pages.length > 0
    ? `Affects ${pages.length} page${pages.length !== 1 ? 's' : ''}: ` +
      pages.slice(0, 3).map(p => `<a href="${escHtml(p.url)}" target="_blank" rel="noopener">${escHtml(p.title || p.url)}</a>`).join(', ') +
      (pages.length > 3 ? ` and ${pages.length - 3} more` : '')
    : '';

  const remediation = v.remediation || '';
  const helpUrl = v.helpUrl || '';

  return `
    <div class="violation-row impact-${isHeuristic ? 'heuristic' : impact}" data-impact="${escHtml(impact)}">
      <div class="v-header">
        <span class="badge badge-${isHeuristic ? 'heuristic' : impact}">${isHeuristic ? 'heuristic' : escHtml(impact)}</span>
        ${wcagTags}
        <span class="v-title">${escHtml(v.help || v.title || v.id || '')}</span>
      </div>
      <div class="v-desc">${escHtml(v.description || '')}</div>
      ${remediation || helpUrl
        ? `<div class="v-fix">
            ${remediation ? escHtml(remediation) : ''}
            ${helpUrl ? ` <a href="${escHtml(helpUrl)}" target="_blank" rel="noopener">View fix guidance ↗</a>` : ''}
           </div>`
        : ''}
      ${v.needsManualReview && v.manualNote
        ? `<div style="background:#fff9e6;border-left:3px solid #f39c12;padding:6px 10px;margin-top:6px;border-radius:0 4px 4px 0;font-size:0.82rem">
            👁 <strong>Manual review:</strong> ${escHtml(v.manualNote)}
           </div>`
        : ''}
      ${pagesText ? `<div class="v-pages">${pagesText}</div>` : ''}
    </div>
  `;
}

window.filterViolations = function (impact, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('#violations-list .violation-row').forEach(row => {
    row.style.display = (impact === 'all' || row.dataset.impact === impact) ? '' : 'none';
  });
};

// ── Past reports ──────────────────────────────────────────────────────────────
async function loadPastReports() {
  try {
    const resp = await fetch('/api/reports');
    const reports = await resp.json();
    if (reports.length === 0) {
      pastList.innerHTML = '<li class="empty-state">No past reports yet.</li>';
      return;
    }
    pastList.innerHTML = reports.map(r => `
      <li class="past-item" tabindex="0" role="button" data-filename="${escHtml(r.filename)}"
          aria-label="View report for ${escHtml(r.startUrl || r.filename)}">
        <div class="past-item-url">${escHtml(r.startUrl || r.filename)}</div>
        <div class="past-item-meta">
          <span>${r.scannedAt ? new Date(r.scannedAt).toLocaleDateString() : ''}</span>
          ${r.totalPages != null ? `<span>${r.totalPages} pages</span>` : ''}
          ${r.totalViolations != null ? `<span style="color:${r.totalViolations > 0 ? '#c0392b' : '#27ae60'}">${r.totalViolations} violations</span>` : ''}
          ${r.complianceScore != null ? `<span class="past-item-score" style="color:${r.complianceScore >= 80 ? '#27ae60' : r.complianceScore >= 60 ? '#e67e22' : '#c0392b'}">${r.complianceScore}% score</span>` : ''}
        </div>
      </li>
    `).join('');

    pastList.querySelectorAll('.past-item').forEach(item => {
      const open = () => loadReport(item.dataset.filename);
      item.addEventListener('click', open);
      item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') open(); });
    });
  } catch {
    pastList.innerHTML = '<li class="empty-state">Could not load past reports.</li>';
  }
}

async function loadReport(filename) {
  try {
    const resp = await fetch(`/api/reports/${filename}`);
    const data = await resp.json();
    const baseName = filename.replace('.json', '');
    const htmlFilename = baseName + '.html';
    renderResults(data, [
      { type: 'html', filename: htmlFilename },
      { type: 'json', filename },
    ]);
    showState('results');
  } catch (err) {
    alert(`Could not load report: ${err.message}`);
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function shortenUrl(url, max) {
  return url.length > max ? url.substring(0, max - 1) + '…' : url;
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Restart server ────────────────────────────────────────────────────────────
const restartBtn = document.getElementById('restart-btn');

restartBtn.addEventListener('click', async () => {
  if (!confirm('Restart the server? Any running scans will be cancelled.')) return;
  restartBtn.disabled = true;
  restartBtn.textContent = '↺ Restarting…';

  try {
    await fetch('/api/restart', { method: 'POST' });
  } catch {}

  // Poll until server is back up
  const poll = setInterval(async () => {
    try {
      await fetch('/api/ping');
      clearInterval(poll);
      restartBtn.textContent = '↺ Restart Server';
      restartBtn.disabled = false;
      loadPastReports();
    } catch {}
  }, 500);

  // Give up after 30s
  setTimeout(() => {
    clearInterval(poll);
    restartBtn.textContent = '↺ Restart Server';
    restartBtn.disabled = false;
  }, 30000);
});

// ── Init ──────────────────────────────────────────────────────────────────────
loadPastReports();
showState('welcome');
