/**
 * Report generator — produces HTML and JSON reports from scan results.
 */

import { MANUAL_REVIEW_CRITERIA } from './scanner.js';

const IMPACT_ORDER = { critical: 0, serious: 1, moderate: 2, minor: 3 };
const IMPACT_COLOR = {
  critical: '#c0392b',
  serious: '#e67e22',
  moderate: '#f1c40f',
  minor: '#3498db',
};
const IMPACT_BG = {
  critical: '#fdf2f2',
  serious: '#fef9f0',
  moderate: '#fffef0',
  minor: '#f0f7ff',
};

// All WCAG 2.1 AA success criteria with their axe rule IDs where automatable
const WCAG_CRITERIA = [
  { id: '1.1.1', title: 'Non-text Content', level: 'A', automated: true, axeRules: ['image-alt', 'input-image-alt', 'area-alt', 'role-img-alt', 'svg-img-alt'] },
  { id: '1.2.1', title: 'Audio-only & Video-only (Prerecorded)', level: 'A', automated: false },
  { id: '1.2.2', title: 'Captions (Prerecorded)', level: 'A', automated: 'partial', axeRules: ['video-caption'] },
  { id: '1.2.3', title: 'Audio Description or Media Alternative', level: 'A', automated: false },
  { id: '1.2.4', title: 'Captions (Live)', level: 'AA', automated: false },
  { id: '1.2.5', title: 'Audio Description (Prerecorded)', level: 'AA', automated: false },
  { id: '1.3.1', title: 'Info and Relationships', level: 'A', automated: true, axeRules: ['aria-required-children', 'aria-required-parent', 'definition-list', 'dlitem', 'list', 'listitem', 'p-as-heading', 'scope-attr-valid', 'table-duplicate-name', 'td-headers-attr', 'th-has-data-cells'] },
  { id: '1.3.2', title: 'Meaningful Sequence', level: 'A', automated: 'partial', axeRules: ['reading-order-visual'] },
  { id: '1.3.3', title: 'Sensory Characteristics', level: 'A', automated: false },
  { id: '1.3.4', title: 'Orientation', level: 'AA', automated: false },
  { id: '1.3.5', title: 'Identify Input Purpose', level: 'AA', automated: 'partial', axeRules: ['autocomplete-valid'] },
  { id: '1.4.1', title: 'Use of Color', level: 'A', automated: false },
  { id: '1.4.2', title: 'Audio Control', level: 'A', automated: false },
  { id: '1.4.3', title: 'Contrast (Minimum)', level: 'AA', automated: true, axeRules: ['color-contrast', 'color-contrast-enhanced'] },
  { id: '1.4.4', title: 'Resize Text', level: 'AA', automated: false },
  { id: '1.4.5', title: 'Images of Text', level: 'AA', automated: false },
  { id: '1.4.10', title: 'Reflow', level: 'AA', automated: false },
  { id: '1.4.11', title: 'Non-text Contrast', level: 'AA', automated: 'partial', axeRules: ['color-contrast'] },
  { id: '1.4.12', title: 'Text Spacing', level: 'AA', automated: false },
  { id: '1.4.13', title: 'Content on Hover or Focus', level: 'AA', automated: false },
  { id: '2.1.1', title: 'Keyboard', level: 'A', automated: 'partial', axeRules: ['accesskeys', 'focusable-no-name', 'scrollable-region-focusable', 'tabindex'] },
  { id: '2.1.2', title: 'No Keyboard Trap', level: 'A', automated: false },
  { id: '2.2.1', title: 'Timing Adjustable', level: 'A', automated: false },
  { id: '2.2.2', title: 'Pause, Stop, Hide', level: 'A', automated: false },
  { id: '2.3.1', title: 'Three Flashes or Below Threshold', level: 'A', automated: false },
  { id: '2.4.1', title: 'Bypass Blocks', level: 'A', automated: 'partial', axeRules: ['bypass', 'skip-link'] },
  { id: '2.4.2', title: 'Page Titled', level: 'A', automated: true, axeRules: ['document-title'] },
  { id: '2.4.3', title: 'Focus Order', level: 'A', automated: false },
  { id: '2.4.4', title: 'Link Purpose (In Context)', level: 'A', automated: 'partial', axeRules: ['link-name', 'link-in-text-block'] },
  { id: '2.4.5', title: 'Multiple Ways', level: 'AA', automated: false },
  { id: '2.4.6', title: 'Headings and Labels', level: 'AA', automated: 'partial', axeRules: ['empty-heading', 'heading-order'] },
  { id: '2.4.7', title: 'Focus Visible', level: 'AA', automated: 'partial', axeRules: ['focus-visible'] },
  { id: '2.5.1', title: 'Pointer Gestures', level: 'A', automated: false },
  { id: '2.5.2', title: 'Pointer Cancellation', level: 'A', automated: false },
  { id: '2.5.3', title: 'Label in Name', level: 'A', automated: 'partial', axeRules: ['label-content-name-mismatch'] },
  { id: '2.5.4', title: 'Motion Actuation', level: 'A', automated: false },
  { id: '3.1.1', title: 'Language of Page', level: 'A', automated: true, axeRules: ['html-has-lang', 'html-lang-valid'] },
  { id: '3.1.2', title: 'Language of Parts', level: 'AA', automated: false },
  { id: '3.2.1', title: 'On Focus', level: 'A', automated: false },
  { id: '3.2.2', title: 'On Input', level: 'A', automated: false },
  { id: '3.2.3', title: 'Consistent Navigation', level: 'AA', automated: false },
  { id: '3.2.4', title: 'Consistent Identification', level: 'AA', automated: false },
  { id: '3.3.1', title: 'Error Identification', level: 'A', automated: 'partial', axeRules: ['aria-required-attr'] },
  { id: '3.3.2', title: 'Labels or Instructions', level: 'A', automated: true, axeRules: ['label', 'label-content-name-mismatch', 'select-name'] },
  { id: '3.3.3', title: 'Error Suggestion', level: 'AA', automated: false },
  { id: '3.3.4', title: 'Error Prevention (Legal, Financial, Data)', level: 'AA', automated: false },
  { id: '4.1.1', title: 'Parsing', level: 'A', automated: true },
  { id: '4.1.2', title: 'Name, Role, Value', level: 'A', automated: true, axeRules: ['aria-allowed-attr', 'aria-allowed-role', 'aria-hidden-body', 'aria-hidden-focus', 'aria-input-field-name', 'aria-required-attr', 'aria-roledescription', 'aria-toggle-field-name', 'aria-valid-attr', 'aria-valid-attr-value', 'button-name', 'frame-focusable-content', 'frame-title', 'input-button-name', 'select-name'] },
  { id: '4.1.3', title: 'Status Messages', level: 'AA', automated: 'partial', axeRules: ['aria-live-region-text'] },
];

/**
 * Aggregate and deduplicate results across all pages.
 */
export function aggregateResults(pageResults) {
  const violationMap = new Map(); // ruleId -> aggregated violation
  const incompleteMap = new Map();
  let totalPasses = 0;
  let totalViolationInstances = 0;
  let totalHeuristicIssues = 0;

  for (const page of pageResults) {
    if (!page.axe) continue;

    totalPasses += page.axe.passes?.length ?? 0;

    for (const violation of (page.axe.violations ?? [])) {
      totalViolationInstances += violation.nodes?.length ?? 0;
      if (!violationMap.has(violation.id)) {
        violationMap.set(violation.id, {
          ...violation,
          affectedPages: [],
          totalNodes: 0,
        });
      }
      const agg = violationMap.get(violation.id);
      agg.affectedPages.push({
        url: page.url,
        title: page.pageTitle,
        nodeCount: violation.nodes?.length ?? 0,
        nodes: violation.nodes?.slice(0, 3), // Keep up to 3 example nodes per page
      });
      agg.totalNodes += violation.nodes?.length ?? 0;
    }

    for (const incomplete of (page.axe.incomplete ?? [])) {
      if (!incompleteMap.has(incomplete.id)) {
        incompleteMap.set(incomplete.id, {
          ...incomplete,
          affectedPages: [],
        });
      }
      incompleteMap.get(incomplete.id).affectedPages.push({
        url: page.url,
        title: page.pageTitle,
      });
    }

    totalHeuristicIssues += page.heuristics?.length ?? 0;
  }

  const violations = [...violationMap.values()].sort(
    (a, b) => (IMPACT_ORDER[a.impact] ?? 99) - (IMPACT_ORDER[b.impact] ?? 99)
  );
  const incomplete = [...incompleteMap.values()];

  // Aggregate heuristics
  const heuristicMap = new Map();
  for (const page of pageResults) {
    for (const h of (page.heuristics ?? [])) {
      const key = h.title;
      if (!heuristicMap.has(key)) {
        heuristicMap.set(key, { ...h, affectedPages: [] });
      }
      heuristicMap.get(key).affectedPages.push({ url: page.url, title: page.pageTitle });
    }
  }

  // Compute compliance score
  const totalIssues = violations.length + incomplete.length;
  const totalChecks = totalPasses + totalIssues;
  const score = totalChecks > 0 ? Math.round((totalPasses / totalChecks) * 100) : 0;

  // Determine status per WCAG criterion
  const allViolationRules = new Set(violations.flatMap(v => [v.id]));
  const allPassRules = new Set(
    pageResults.flatMap(p => (p.axe?.passes ?? []).map(pass => pass.id))
  );

  const criteriaStatus = WCAG_CRITERIA.map(criterion => {
    const relevantRules = criterion.axeRules ?? [];
    const hasViolation = relevantRules.some(r => allViolationRules.has(r));
    const hasPassed = relevantRules.some(r => allPassRules.has(r));

    let status;
    if (criterion.automated === false) {
      status = 'manual';
    } else if (hasViolation) {
      status = 'fail';
    } else if (hasPassed) {
      status = 'pass';
    } else {
      status = 'not-tested';
    }

    return { ...criterion, status };
  });

  return {
    summary: {
      totalPages: pageResults.length,
      pagesWithErrors: pageResults.filter(p => p.error).length,
      totalViolations: violations.length,
      totalViolationInstances,
      totalIncomplete: incomplete.length,
      totalHeuristicIssues,
      complianceScore: score,
      impactCounts: {
        critical: violations.filter(v => v.impact === 'critical').length,
        serious: violations.filter(v => v.impact === 'serious').length,
        moderate: violations.filter(v => v.impact === 'moderate').length,
        minor: violations.filter(v => v.impact === 'minor').length,
      },
      scannedAt: new Date().toISOString(),
    },
    violations,
    incomplete,
    heuristics: [...heuristicMap.values()],
    criteriaStatus,
    manualReviewCriteria: MANUAL_REVIEW_CRITERIA,
    pages: pageResults,
  };
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function impactBadge(impact) {
  const color = IMPACT_COLOR[impact] || '#888';
  return `<span class="badge" style="background:${color}">${escapeHtml(impact)}</span>`;
}

function criteriaStatusIcon(status) {
  switch (status) {
    case 'pass': return '<span class="status-icon pass" title="Passed automated check">✓</span>';
    case 'fail': return '<span class="status-icon fail" title="Failed automated check">✗</span>';
    case 'manual': return '<span class="status-icon manual" title="Requires manual testing">👁</span>';
    case 'not-tested': return '<span class="status-icon not-tested" title="Not applicable / not detected">—</span>';
    default: return '';
  }
}

/**
 * Generate the full HTML report as a string.
 */
export function generateHtmlReport(aggregated, startUrl) {
  const { summary, violations, incomplete, heuristics, criteriaStatus, manualReviewCriteria, pages } = aggregated;
  const scoreColor = summary.complianceScore >= 80 ? '#27ae60' : summary.complianceScore >= 60 ? '#e67e22' : '#c0392b';

  // Group criteria by principle
  const principles = [
    { num: '1', name: 'Perceivable' },
    { num: '2', name: 'Operable' },
    { num: '3', name: 'Understandable' },
    { num: '4', name: 'Robust' },
  ];

  function renderViolation(v, isHeuristic = false) {
    const pagesHtml = (v.affectedPages ?? []).map(p =>
      `<li><a href="${escapeHtml(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.title || p.url)}</a>${p.nodeCount ? ` <small>(${p.nodeCount} instance${p.nodeCount !== 1 ? 's' : ''})</small>` : ''}</li>`
    ).join('');

    const criteriaHtml = (v.tags ?? v.wcagCriteria ?? [])
      .filter(t => /wcag\d/.test(t) || /^\d+\.\d+\.\d+$/.test(t))
      .map(t => `<span class="tag">${escapeHtml(t.replace('wcag', 'WCAG '))}</span>`)
      .join(' ');

    const nodesHtml = !isHeuristic && v.affectedPages?.[0]?.nodes?.length
      ? `<details class="node-details">
          <summary>Example elements</summary>
          <div class="nodes">
            ${v.affectedPages[0].nodes.map(n => `
              <div class="node-item">
                <div class="node-target">${escapeHtml((n.target || []).join(', '))}</div>
                <code class="node-html">${escapeHtml(n.html || '')}</code>
                ${n.failureSummary ? `<div class="node-failure">${escapeHtml(n.failureSummary)}</div>` : ''}
              </div>
            `).join('')}
          </div>
        </details>`
      : '';

    const elementHtml = isHeuristic && v.element
      ? `<details class="node-details"><summary>Detected element</summary><code class="node-html">${escapeHtml(v.element)}</code></details>`
      : '';

    const manualNoteHtml = v.needsManualReview && v.manualNote
      ? `<div class="manual-note">👁 <strong>Manual review required:</strong> ${escapeHtml(v.manualNote)}</div>`
      : '';

    return `
      <div class="violation-card ${isHeuristic ? 'heuristic' : ''}" data-impact="${escapeHtml(v.impact || '')}">
        <div class="violation-header">
          <div class="violation-title">
            ${impactBadge(v.impact || 'moderate')}
            ${isHeuristic ? '<span class="badge heuristic-badge">heuristic</span>' : ''}
            <strong>${escapeHtml(v.help || v.title || v.id)}</strong>
          </div>
          <div class="violation-criteria">${criteriaHtml}</div>
        </div>
        <p class="violation-desc">${escapeHtml(v.description)}</p>
        <div class="violation-fix">
          <strong>How to fix:</strong> ${escapeHtml(v.helpUrl ? '' : (v.remediation || ''))}
          ${v.helpUrl ? `<a href="${escapeHtml(v.helpUrl)}" target="_blank" rel="noopener">View fix guidance ↗</a>` : ''}
          ${!v.helpUrl && v.remediation ? '' : ''}
        </div>
        ${manualNoteHtml}
        ${nodesHtml}
        ${elementHtml}
        ${pagesHtml ? `<details class="pages-details"><summary>Affected pages (${v.affectedPages?.length ?? 0})</summary><ul class="page-list">${pagesHtml}</ul></details>` : ''}
      </div>
    `;
  }

  const violationsHtml = violations.length
    ? violations.map(v => renderViolation(v, false)).join('')
    : '<p class="empty-state">No automated violations detected. See manual review section.</p>';

  const heuristicsHtml = heuristics.length
    ? heuristics.map(h => renderViolation(h, true)).join('')
    : '<p class="empty-state">No heuristic issues detected.</p>';

  const incompleteHtml = incomplete.length
    ? incomplete.map(v => `
      <div class="violation-card incomplete">
        <div class="violation-header">
          <div class="violation-title">
            <span class="badge" style="background:#888">needs review</span>
            <strong>${escapeHtml(v.help || v.id)}</strong>
          </div>
        </div>
        <p class="violation-desc">${escapeHtml(v.description)}</p>
        ${v.helpUrl ? `<div class="violation-fix"><a href="${escapeHtml(v.helpUrl)}" target="_blank" rel="noopener">View guidance ↗</a></div>` : ''}
        <p><small>Affected pages: ${(v.affectedPages || []).length}</small></p>
      </div>
    `).join('')
    : '<p class="empty-state">No items flagged for review.</p>';

  const criteriaGridHtml = principles.map(p => {
    const items = criteriaStatus.filter(c => c.id.startsWith(p.num + '.'));
    return `
      <div class="criteria-group">
        <h3 class="criteria-principle">Principle ${p.num}: ${p.name}</h3>
        <div class="criteria-grid">
          ${items.map(c => `
            <div class="criteria-cell status-${c.status}" title="${escapeHtml(c.title)} (${c.automated === false ? 'manual' : c.automated === 'partial' ? 'partial automation' : 'automated'})">
              ${criteriaStatusIcon(c.status)}
              <span class="criteria-id">${c.id}</span>
              <span class="criteria-level">${c.level}</span>
              <span class="criteria-title">${escapeHtml(c.title)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  const manualChecklistHtml = manualReviewCriteria.map(c => `
    <div class="manual-item">
      <label class="manual-check">
        <input type="checkbox" class="manual-checkbox">
        <span class="manual-id">${c.id} (${c.level})</span>
        <strong>${escapeHtml(c.title)}</strong>
      </label>
      <p class="manual-desc">${escapeHtml(c.description)}</p>
    </div>
  `).join('');

  const pagesTableHtml = pages.map((p, i) => {
    const vCount = p.axe?.violations?.reduce((sum, v) => sum + (v.nodes?.length ?? 0), 0) ?? 0;
    const hCount = p.heuristics?.length ?? 0;
    return `
      <tr class="${p.error ? 'error-row' : ''}">
        <td>${i + 1}</td>
        <td><a href="${escapeHtml(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.pageTitle || p.url)}</a><br><small>${escapeHtml(p.url)}</small></td>
        <td>${p.axe?.violations?.length ?? (p.error ? '—' : 0)}</td>
        <td>${vCount}</td>
        <td>${hCount}</td>
        <td>${p.error ? `<span class="error-badge">Error: ${escapeHtml(p.error.substring(0, 60))}</span>` : '✓'}</td>
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WCAG 2.1 AA Report — ${escapeHtml(startUrl)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; background: #f5f7fa; color: #2c3e50; line-height: 1.6; }
    .header { background: #1a2940; color: #fff; padding: 32px 40px; }
    .header h1 { margin: 0 0 8px; font-size: 1.8rem; }
    .header .meta { opacity: 0.75; font-size: 0.9rem; }
    .header a { color: #7ecdf5; }
    .container { max-width: 1200px; margin: 0 auto; padding: 32px 24px; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; margin-bottom: 32px; }
    .summary-card { background: #fff; border-radius: 10px; padding: 20px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .summary-card .value { font-size: 2.4rem; font-weight: 700; line-height: 1; }
    .summary-card .label { font-size: 0.82rem; color: #7f8c8d; margin-top: 6px; text-transform: uppercase; letter-spacing: 0.05em; }
    .score-card .value { color: ${scoreColor}; }
    .section { background: #fff; border-radius: 10px; padding: 28px; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.07); }
    .section h2 { margin-top: 0; font-size: 1.3rem; border-bottom: 2px solid #ecf0f1; padding-bottom: 12px; }
    .section h2 .count { background: #ecf0f1; color: #7f8c8d; font-size: 0.85rem; padding: 2px 8px; border-radius: 20px; margin-left: 8px; vertical-align: middle; }
    .violation-card { border: 1px solid #e8ecf0; border-radius: 8px; padding: 20px; margin-bottom: 16px; }
    .violation-card[data-impact="critical"] { border-left: 4px solid ${IMPACT_COLOR.critical}; background: ${IMPACT_BG.critical}; }
    .violation-card[data-impact="serious"] { border-left: 4px solid ${IMPACT_COLOR.serious}; background: ${IMPACT_BG.serious}; }
    .violation-card[data-impact="moderate"] { border-left: 4px solid ${IMPACT_COLOR.moderate}; background: ${IMPACT_BG.moderate}; }
    .violation-card[data-impact="minor"] { border-left: 4px solid ${IMPACT_COLOR.minor}; background: ${IMPACT_BG.minor}; }
    .violation-card.heuristic { border-left: 4px solid #9b59b6; }
    .violation-card.incomplete { border-left: 4px solid #95a5a6; }
    .violation-header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 10px; }
    .violation-title { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .violation-criteria { display: flex; flex-wrap: wrap; gap: 4px; }
    .violation-desc { margin: 0 0 12px; color: #444; }
    .violation-fix { background: #f0f7f0; border-radius: 6px; padding: 10px 14px; margin-bottom: 10px; font-size: 0.9rem; }
    .badge { display: inline-block; color: #fff; font-size: 0.75rem; padding: 2px 8px; border-radius: 20px; font-weight: 600; text-transform: uppercase; }
    .badge.heuristic-badge { background: #9b59b6; }
    .tag { background: #e8ecf0; color: #5d6d7e; font-size: 0.75rem; padding: 2px 6px; border-radius: 4px; }
    .manual-note { background: #fff9e6; border-left: 3px solid #f39c12; padding: 8px 12px; margin: 8px 0; border-radius: 0 6px 6px 0; font-size: 0.88rem; }
    details { margin-top: 10px; }
    summary { cursor: pointer; color: #2980b9; font-size: 0.88rem; user-select: none; }
    .node-item { background: #f8f9fa; border-radius: 6px; padding: 10px; margin: 8px 0; }
    .node-target { font-weight: 600; font-size: 0.85rem; color: #555; margin-bottom: 4px; }
    .node-html { display: block; font-size: 0.82rem; word-break: break-all; background: #eef; padding: 6px; border-radius: 4px; white-space: pre-wrap; }
    .node-failure { margin-top: 6px; font-size: 0.85rem; color: #c0392b; }
    .page-list { margin: 8px 0; padding-left: 20px; font-size: 0.88rem; }
    .page-list li { margin: 4px 0; }
    .empty-state { color: #95a5a6; font-style: italic; padding: 16px 0; }
    .filter-bar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
    .filter-btn { background: #ecf0f1; border: none; border-radius: 20px; padding: 6px 16px; cursor: pointer; font-size: 0.85rem; transition: background 0.2s; }
    .filter-btn:hover, .filter-btn.active { background: #2980b9; color: #fff; }
    /* Criteria grid */
    .criteria-group { margin-bottom: 24px; }
    .criteria-principle { font-size: 1rem; color: #555; margin-bottom: 12px; }
    .criteria-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; }
    .criteria-cell { border: 1px solid #e0e0e0; border-radius: 8px; padding: 10px; font-size: 0.8rem; display: flex; flex-direction: column; gap: 2px; }
    .criteria-cell.status-pass { background: #f0fdf4; border-color: #86efac; }
    .criteria-cell.status-fail { background: #fef2f2; border-color: #fca5a5; }
    .criteria-cell.status-manual { background: #fffbeb; border-color: #fcd34d; }
    .criteria-cell.status-not-tested { background: #f9fafb; border-color: #e5e7eb; color: #9ca3af; }
    .status-icon { font-size: 1rem; }
    .status-icon.pass { color: #16a34a; }
    .status-icon.fail { color: #dc2626; }
    .status-icon.manual { }
    .status-icon.not-tested { color: #9ca3af; }
    .criteria-id { font-weight: 700; font-size: 0.85rem; }
    .criteria-level { font-size: 0.7rem; color: #888; background: #f0f0f0; border-radius: 3px; padding: 1px 4px; width: fit-content; }
    .criteria-title { font-size: 0.78rem; color: #555; }
    /* Legend */
    .legend { display: flex; flex-wrap: wrap; gap: 16px; font-size: 0.82rem; margin-bottom: 20px; }
    .legend-item { display: flex; align-items: center; gap: 6px; }
    /* Manual checklist */
    .manual-item { border: 1px solid #fcd34d; border-radius: 8px; padding: 16px; margin-bottom: 12px; background: #fffbeb; }
    .manual-check { display: flex; align-items: flex-start; gap: 10px; cursor: pointer; }
    .manual-check input { margin-top: 3px; flex-shrink: 0; }
    .manual-id { background: #f59e0b; color: #fff; font-size: 0.75rem; padding: 2px 8px; border-radius: 20px; white-space: nowrap; }
    .manual-desc { margin: 8px 0 0 28px; font-size: 0.88rem; color: #555; }
    /* Pages table */
    table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
    th { background: #f5f7fa; text-align: left; padding: 10px 12px; border-bottom: 2px solid #e0e0e0; }
    td { padding: 10px 12px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
    tr:hover td { background: #fafbfc; }
    .error-row td { background: #fff5f5; }
    .error-badge { color: #c0392b; font-size: 0.82rem; }
    .print-note { font-size: 0.8rem; color: #aaa; text-align: center; padding: 24px; }
    @media print {
      .filter-bar, summary { display: none; }
      details { open: true; }
      details[open] { display: block; }
    }
    @media (max-width: 600px) {
      .container { padding: 16px; }
      .header { padding: 20px; }
      .summary-grid { grid-template-columns: repeat(2, 1fr); }
    }
  </style>
</head>
<body>
<header class="header">
  <h1>WCAG 2.1 AA Accessibility Report</h1>
  <div class="meta">
    Site: <a href="${escapeHtml(startUrl)}" target="_blank" rel="noopener">${escapeHtml(startUrl)}</a>
    &nbsp;·&nbsp; Generated: ${new Date(summary.scannedAt).toLocaleString()}
    &nbsp;·&nbsp; ${summary.totalPages} page${summary.totalPages !== 1 ? 's' : ''} scanned
  </div>
</header>

<div class="container">

  <!-- Summary Cards -->
  <div class="summary-grid">
    <div class="summary-card score-card">
      <div class="value">${summary.complianceScore}%</div>
      <div class="label">Automated Score</div>
    </div>
    <div class="summary-card">
      <div class="value" style="color:${summary.totalViolations > 0 ? IMPACT_COLOR.critical : '#27ae60'}">${summary.totalViolations}</div>
      <div class="label">Unique Violations</div>
    </div>
    <div class="summary-card">
      <div class="value" style="color:${IMPACT_COLOR.critical}">${summary.impactCounts.critical}</div>
      <div class="label">Critical</div>
    </div>
    <div class="summary-card">
      <div class="value" style="color:${IMPACT_COLOR.serious}">${summary.impactCounts.serious}</div>
      <div class="label">Serious</div>
    </div>
    <div class="summary-card">
      <div class="value" style="color:${IMPACT_COLOR.moderate}">${summary.impactCounts.moderate}</div>
      <div class="label">Moderate</div>
    </div>
    <div class="summary-card">
      <div class="value" style="color:${IMPACT_COLOR.minor}">${summary.impactCounts.minor}</div>
      <div class="label">Minor</div>
    </div>
    <div class="summary-card">
      <div class="value">${summary.totalHeuristicIssues}</div>
      <div class="label">Heuristic Issues</div>
    </div>
    <div class="summary-card">
      <div class="value">${summary.totalPages}</div>
      <div class="label">Pages Scanned</div>
    </div>
  </div>

  <!-- Automated Violations -->
  <div class="section">
    <h2>Automated Violations <span class="count">${violations.length}</span></h2>
    <div class="filter-bar">
      <button class="filter-btn active" onclick="filterViolations('all', this)">All (${violations.length})</button>
      <button class="filter-btn" onclick="filterViolations('critical', this)">Critical (${summary.impactCounts.critical})</button>
      <button class="filter-btn" onclick="filterViolations('serious', this)">Serious (${summary.impactCounts.serious})</button>
      <button class="filter-btn" onclick="filterViolations('moderate', this)">Moderate (${summary.impactCounts.moderate})</button>
      <button class="filter-btn" onclick="filterViolations('minor', this)">Minor (${summary.impactCounts.minor})</button>
    </div>
    <div id="violations-container">
      ${violationsHtml}
    </div>
  </div>

  <!-- Heuristic Checks -->
  <div class="section">
    <h2>Heuristic & Structural Issues <span class="count">${heuristics.length}</span></h2>
    <p style="color:#555;font-size:0.9rem">These issues were detected by pattern analysis beyond axe-core, targeting additional WCAG criteria. Some require manual confirmation.</p>
    ${heuristicsHtml}
  </div>

  <!-- Needs Review (axe incomplete) -->
  <div class="section">
    <h2>Needs Manual Review — axe-core Flagged <span class="count">${incomplete.length}</span></h2>
    <p style="color:#555;font-size:0.9rem">axe-core could not automatically determine if these are violations. Each requires manual inspection.</p>
    ${incompleteHtml}
  </div>

  <!-- WCAG Criteria Status Grid -->
  <div class="section">
    <h2>WCAG 2.1 AA Criteria Coverage</h2>
    <div class="legend">
      <div class="legend-item"><span class="status-icon pass">✓</span> Passed automated check</div>
      <div class="legend-item"><span class="status-icon fail">✗</span> Failed automated check</div>
      <div class="legend-item"><span class="status-icon manual">👁</span> Requires manual testing</div>
      <div class="legend-item"><span class="status-icon not-tested">—</span> Not applicable / not detected</div>
    </div>
    ${criteriaGridHtml}
  </div>

  <!-- Manual Testing Checklist -->
  <div class="section">
    <h2>Manual Testing Checklist <span class="count">${manualReviewCriteria.length} criteria</span></h2>
    <p style="color:#555;font-size:0.9rem">
      These WCAG 2.1 AA criteria cannot be fully automated. Use this checklist during manual testing.
      Check each item off as you verify it. <strong>Note: this checklist is not saved — print the page to preserve your progress.</strong>
    </p>
    ${manualChecklistHtml}
  </div>

  <!-- Pages Scanned -->
  <div class="section">
    <h2>Pages Scanned <span class="count">${pages.length}</span></h2>
    <div style="overflow-x:auto">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Page</th>
            <th>Unique Rules Violated</th>
            <th>Total Instances</th>
            <th>Heuristic Issues</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${pagesTableHtml}</tbody>
      </table>
    </div>
  </div>

  <p class="print-note">
    Report generated by WCAG Scanner · WCAG 2.1 Level AA ·
    HHS Section 504 compliance deadline: May 11, 2026 (large recipients) · May 10, 2027 (small recipients)
  </p>
</div>

<script>
  function filterViolations(impact, btn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('#violations-container .violation-card').forEach(card => {
      if (impact === 'all' || card.dataset.impact === impact) {
        card.style.display = '';
      } else {
        card.style.display = 'none';
      }
    });
  }
</script>
</body>
</html>`;
}

/**
 * Generate a JSON report.
 */
export function generateJsonReport(aggregated, startUrl) {
  return JSON.stringify({ startUrl, ...aggregated }, null, 2);
}
