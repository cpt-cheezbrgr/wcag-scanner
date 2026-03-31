/**
 * WCAG Combined Portfolio Report Generator
 * Produces two outputs:
 *   1. WCAG-Combined-Report.csv  — every page × violation row across all sites
 *   2. WCAG-Combined-Report.xlsx — one sheet per site + a portfolio summary sheet
 *
 * Run: node --max-old-space-size=6144 scripts/generate-combined-report.cjs
 */

const fs   = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const REPORTS_DIR = path.join(__dirname, '..', 'reports');
const OUT_DIR     = path.join(__dirname, '..');

// ─── Site manifest — auto-discovered from reports directory ──────────────────
// Picks the most recent completed JSON for each hostname.
const SITES = fs.readdirSync(REPORTS_DIR)
  .filter(f => f.endsWith('.meta.json'))
  .reduce((acc, metaFile) => {
    const meta = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, metaFile), 'utf-8'));
    if (meta.status !== 'completed' || !meta.summary?.totalPages || meta.summary.totalPages < 2) return acc;
    const jsonFile = metaFile.replace('.meta.json', '.json');
    if (!fs.existsSync(path.join(REPORTS_DIR, jsonFile))) return acc;
    const host = new URL(meta.startUrl).hostname.replace(/^www\./, '');
    // Keep only the most recent scan per hostname
    const existing = acc.find(s => s.host === host);
    if (!existing || jsonFile > existing.file) {
      if (existing) acc.splice(acc.indexOf(existing), 1);
      acc.push({ host, file: jsonFile });
    }
    return acc;
  }, [])
  .sort((a, b) => a.host.localeCompare(b.host));

// ─── Helpers ─────────────────────────────────────────────────────────────────
function wcagFromTags(tags = []) {
  const t = tags.find(t => /^wcag\d{3,}/.test(t));
  if (!t) return '';
  const num = t.replace('wcag', '');
  const m = num.match(/^(\d)(\d{1,2})(\d*)$/);
  if (!m) return num;
  return [m[1], m[2], m[3]].filter(Boolean).join('.');
}

function escapeCsv(val) {
  const s = String(val ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

// ─── Column definitions ──────────────────────────────────────────────────────
const COLS = [
  'Site URL',
  'Page URL',
  'Page Title',
  'Scanned At',
  'Violation ID',
  'Impact',
  'WCAG',
  'Description',
  'Instances on Page',
  'Help URL',
];

// ─── Open CSV output stream ──────────────────────────────────────────────────
const csvPath = path.join(OUT_DIR, 'WCAG-Combined-Report.csv');
const csvStream = fs.createWriteStream(csvPath, { encoding: 'utf8' });
csvStream.write('\uFEFF'); // BOM for Excel UTF-8 detection
csvStream.write(COLS.join(',') + '\n');

// ─── Excel workbook ──────────────────────────────────────────────────────────
const wb = XLSX.utils.book_new();
const summaryRows = [['Site URL', 'Pages Scanned', 'Pages With Violations', 'Critical Violations', 'Serious Violations', 'Total Violation Types', 'Total Instances']];

let grandTotalRows = 0;

// ─── Process each site ───────────────────────────────────────────────────────
for (const site of SITES) {
  const filePath = path.join(REPORTS_DIR, site.file);
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠  Missing: ${site.file} — skipping`);
    continue;
  }

  process.stdout.write(`Processing ${site.host}...`);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  // Build violation lookup from top-level violations array
  const violationMeta = {};
  for (const v of data.violations || []) {
    violationMeta[v.id] = {
      description: v.help || v.description || '',
      wcag: wcagFromTags(v.tags),
      helpUrl: v.helpUrl || '',
    };
  }

  const siteUrl = data.startUrl || '';
  const sheetRows = [COLS];

  let pagesWithViolations = 0;
  let criticalTypes = new Set();
  let seriousTypes = new Set();
  let totalInstances = 0;

  for (const page of data.pages || []) {
    const pageViolations = page.axe?.violations || [];
    if (pageViolations.length === 0) continue;
    pagesWithViolations++;

    for (const v of pageViolations) {
      const meta = violationMeta[v.id] || {};
      const impact = (v.impact || '').toUpperCase();
      const instances = v.nodes?.length ?? 0;
      totalInstances += instances;

      if (impact === 'CRITICAL') criticalTypes.add(v.id);
      if (impact === 'SERIOUS')  seriousTypes.add(v.id);

      const row = [
        siteUrl,
        page.url || '',
        page.pageTitle || '',
        page.scannedAt || '',
        v.id,
        impact,
        meta.wcag || wcagFromTags(v.tags),
        meta.description,
        instances,
        meta.helpUrl,
      ];

      // CSV
      csvStream.write(row.map(escapeCsv).join(',') + '\n');
      // Excel sheet
      sheetRows.push(row);
      grandTotalRows++;
    }
  }

  // Add site sheet to workbook
  const ws = XLSX.utils.aoa_to_sheet(sheetRows);
  // Column widths
  ws['!cols'] = [
    { wch: 40 }, { wch: 60 }, { wch: 40 }, { wch: 20 },
    { wch: 28 }, { wch: 10 }, { wch: 8  }, { wch: 60 }, { wch: 10 }, { wch: 50 },
  ];
  // Freeze top row
  ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
  const sheetName = site.host.slice(0, 31); // Excel sheet name limit
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  // Add to summary
  summaryRows.push([
    siteUrl,
    data.pages?.length ?? 0,
    pagesWithViolations,
    criticalTypes.size,
    seriousTypes.size,
    criticalTypes.size + seriousTypes.size,
    totalInstances,
  ]);

  console.log(` ✓  ${sheetRows.length - 1} rows`);
}

// ─── Summary sheet (prepend) ─────────────────────────────────────────────────
const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
summaryWs['!cols'] = [
  { wch: 40 }, { wch: 15 }, { wch: 22 },
  { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 18 },
];
summaryWs['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
XLSX.utils.book_append_sheet(wb, summaryWs, 'Portfolio Summary');

// Move summary to front
wb.SheetNames = ['Portfolio Summary', ...wb.SheetNames.filter(n => n !== 'Portfolio Summary')];

// ─── Write Excel ──────────────────────────────────────────────────────────────
const xlsxPath = path.join(OUT_DIR, 'WCAG-Combined-Report.xlsx');
XLSX.writeFile(wb, xlsxPath);

csvStream.end();

console.log('');
console.log(`✓ CSV  → ${csvPath}`);
console.log(`✓ XLSX → ${xlsxPath}`);
console.log(`  Total rows: ${grandTotalRows.toLocaleString()}`);
