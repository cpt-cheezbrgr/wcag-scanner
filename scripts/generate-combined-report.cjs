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

// ─── Site manifest (name → JSON filename) ─────────────────────────────────────
const SITES = [
  { name: 'Mount Carmel Health System',         file: 'mountcarmelhealth_com_2026-03-30_17-50-15.json' },
  { name: 'MercyOne',                          file: 'www_mercyone_org_2026-03-24_15-34-45.json' },
  { name: 'Saint Alphonsus',                   file: 'www_saintalphonsus_org_2026-03-24_00-55-50.json' },
  { name: 'Saint Agnes Medical Center',        file: 'www_samc_com_2026-03-23_20-53-58.json' },
  { name: 'St. Joseph Mercy Health System',    file: 'www_sjmed_com_2026-03-24_14-06-35.json' },
  { name: "St. Mary's Health Care System",     file: 'www_stmaryshealthcaresystem_org_2026-03-23_18-53-01.json' },
  { name: 'Trinity Health (Corporate)',        file: 'www_trinity_health_org_2026-03-19_20-22-43.json' },
  { name: 'Holy Cross Hospital (FL)',          file: 'www_holy_cross_com_2026-03-28_16-39-39.json' },
  { name: 'Holy Cross Health (MD)',            file: 'www_holycrosshealth_org_2026-03-28_15-35-35.json' },
  { name: 'Loyola Medicine',                   file: 'www_loyolamedicine_org_2026-03-28_04-03-36.json' },
  { name: "St. Joseph's Health (Syracuse)",    file: 'www_sjhsyr_org_2026-03-28_15-14-21.json' },
  { name: "St. Peter's Health Partners",       file: 'www_sphp_com_2026-03-28_18-30-11.json' },
  { name: 'Trinity Health Plan Medicare',      file: 'www_thpmedicare_org_2026-03-30_12-30-05.json' },
  { name: 'Trinity Health At Home',            file: 'www_trinityhealthathome_org_2026-03-28_21-04-35.json' },
  { name: 'Trinity Health Mid-Atlantic',       file: 'www_trinityhealthma_org_2026-03-29_14-50-23.json' },
  { name: 'Trinity Health Michigan',           file: 'www_trinityhealthmichigan_org_2026-03-30_13-14-56.json' },
  { name: 'Trinity Health of New England',     file: 'www_trinityhealthofne_org_2026-03-28_23-24-51.json' },
  { name: 'Trinity Health PACE',               file: 'www_trinityhealthpace_org_2026-03-28_20-25-39.json' },
  { name: 'Trinity Health Senior Communities', file: 'www_trinityhealthseniorcommunities_org_2026-03-28_23-06-22.json' },
];

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
  'Site',
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
const summaryRows = [['Site', 'URL', 'Pages Scanned', 'Pages With Violations', 'Critical Violations', 'Serious Violations', 'Total Violation Types', 'Total Instances']];

let grandTotalRows = 0;

// ─── Process each site ───────────────────────────────────────────────────────
for (const site of SITES) {
  const filePath = path.join(REPORTS_DIR, site.file);
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠  Missing: ${site.file} — skipping`);
    continue;
  }

  process.stdout.write(`Processing ${site.name}...`);
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
        site.name,
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
    { wch: 30 }, { wch: 35 }, { wch: 60 }, { wch: 40 }, { wch: 20 },
    { wch: 28 }, { wch: 10 }, { wch: 8  }, { wch: 60 }, { wch: 10 }, { wch: 50 },
  ];
  // Freeze top row
  ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
  const sheetName = site.name.slice(0, 31); // Excel sheet name limit
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  // Add to summary
  summaryRows.push([
    site.name,
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
  { wch: 35 }, { wch: 40 }, { wch: 15 }, { wch: 22 },
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
