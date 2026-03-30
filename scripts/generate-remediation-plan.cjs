/**
 * WCAG 2.1 AA Remediation Plan Generator
 * Produces a Word document from scan data.
 * Run: node scripts/generate-remediation-plan.js
 */

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak, LevelFormat,
  ExternalHyperlink, TableOfContents,
} = require('docx');
const fs = require('fs');
const path = require('path');

// ─── Colour palette ──────────────────────────────────────────────────────────
const RED    = 'C0392B';
const ORANGE = 'E67E22';
const NAVY   = '1B3A6B';
const LIGHT_BLUE = 'D6E4F0';
const LIGHT_GREY = 'F5F5F5';
const MID_GREY   = 'DDDDDD';
const WHITE  = 'FFFFFF';

// ─── Border helpers ───────────────────────────────────────────────────────────
const thin  = (color = MID_GREY) => ({ style: BorderStyle.SINGLE, size: 1, color });
const none  = () => ({ style: BorderStyle.NIL, size: 0, color: 'FFFFFF' });
const allBorders  = (color = MID_GREY) => ({ top: thin(color), bottom: thin(color), left: thin(color), right: thin(color) });
const noBorders   = () => ({ top: none(), bottom: none(), left: none(), right: none() });

// ─── Reusable paragraph styles ────────────────────────────────────────────────
const p = (text, opts = {}) => new Paragraph({
  children: [new TextRun({ text, font: 'Arial', size: opts.size || 22, bold: opts.bold, color: opts.color, italics: opts.italics })],
  spacing: { before: opts.before ?? 80, after: opts.after ?? 80 },
  alignment: opts.align || AlignmentType.LEFT,
  numbering: opts.numbering,
  pageBreakBefore: opts.pageBreak,
});

const bullet = (text, opts = {}) => new Paragraph({
  numbering: { reference: opts.numbered ? 'numbers' : 'bullets', level: opts.level || 0 },
  spacing: { before: 60, after: 60 },
  children: [new TextRun({ text, font: 'Arial', size: opts.size || 22, bold: opts.bold, color: opts.color })],
});

const heading1 = (text, anchor, pageBreak = false) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  pageBreakBefore: pageBreak,
  spacing: { before: 280, after: 160 },
  children: [new TextRun({ text, font: 'Arial', size: 32, bold: true, color: NAVY })],
});

const heading2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 220, after: 120 },
  children: [new TextRun({ text, font: 'Arial', size: 26, bold: true, color: NAVY })],
});

const heading3 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_3,
  spacing: { before: 180, after: 80 },
  children: [new TextRun({ text, font: 'Arial', size: 24, bold: true, color: '333333' })],
});

const spacer = (n = 1) => Array.from({ length: n }, () => p(''));

// ─── Table helpers ────────────────────────────────────────────────────────────
const headerCell = (text, width, color = NAVY, textColor = WHITE, align = AlignmentType.LEFT) =>
  new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: allBorders(NAVY),
    shading: { fill: color, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: align,
      spacing: { before: 0, after: 0 },
      children: [new TextRun({ text, font: 'Arial', size: 20, bold: true, color: textColor })],
    })],
  });

const dataCell = (text, width, opts = {}) =>
  new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: allBorders(MID_GREY),
    shading: { fill: opts.fill || WHITE, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: opts.align || AlignmentType.LEFT,
      spacing: { before: 0, after: 0 },
      children: [new TextRun({ text, font: 'Arial', size: opts.size || 20, bold: opts.bold, color: opts.color || '333333' })],
    })],
  });

// ─── Scan data ───────────────────────────────────────────────────────────────
const scanDate = 'March 19–30, 2026';

const sites = [
  {
    name: 'MercyOne',
    url:  'https://www.mercyone.org',
    pages: 5162, violations: 16, critical: 7, serious: 9,
    score: 100, instances: 3434, heuristics: 22057,
    violations_detail: [
      { id: 'color-contrast',         impact: 'SERIOUS',  pages: 5100, wcag: '1.4.3', help: 'Elements must meet minimum color contrast ratio thresholds' },
      { id: 'image-alt',              impact: 'CRITICAL', pages: 180,  wcag: '1.1.1', help: 'Images must have alternative text' },
      { id: 'button-name',            impact: 'CRITICAL', pages: 90,   wcag: '4.1.2', help: 'Buttons must have discernible text (YouTube player buttons)' },
      { id: 'link-name',              impact: 'SERIOUS',  pages: 420,  wcag: '2.4.4', help: 'Links must have discernible text (empty card links)' },
      { id: 'aria-required-children', impact: 'CRITICAL', pages: 22,   wcag: '4.1.2', help: 'ARIA roles must contain required child elements (hgm-tabs)' },
      { id: 'aria-valid-attr-value',  impact: 'CRITICAL', pages: 18,   wcag: '4.1.2', help: 'ARIA attributes must conform to valid values (hgm-tabs)' },
      { id: 'frame-title',            impact: 'SERIOUS',  pages: 110,  wcag: '2.4.1', help: 'Frames and iframes must have an accessible name' },
      { id: 'list / listitem',        impact: 'SERIOUS',  pages: 95,   wcag: '1.3.1', help: 'List elements must use correct parent/child structure' },
      { id: 'aria-prohibited-attr',   impact: 'SERIOUS',  pages: 80,   wcag: '4.1.2', help: 'Elements must only use permitted ARIA attributes (YouTube)' },
      { id: 'autocomplete-valid',     impact: 'SERIOUS',  pages: 4,    wcag: '1.3.5', help: 'autocomplete attribute must be used correctly ("disable" → "off")' },
      { id: 'select-name',            impact: 'CRITICAL', pages: 55,   wcag: '4.1.2', help: 'Select elements must have accessible names' },
      { id: 'aria-allowed-attr',      impact: 'CRITICAL', pages: 70,   wcag: '4.1.2', help: 'Elements must only use supported ARIA attributes' },
    ],
  },
  {
    name: 'Saint Alphonsus',
    url:  'https://www.saintalphonsus.org',
    pages: 4126, violations: 22, critical: 8, serious: 14,
    score: 100, instances: null, heuristics: null,
    violations_detail: [
      { id: 'color-contrast',         impact: 'SERIOUS',  pages: 1208, wcag: '1.4.3', help: 'Elements must meet minimum color contrast ratio thresholds' },
      { id: 'link-name',              impact: 'SERIOUS',  pages: 587,  wcag: '2.4.4', help: 'Links must have discernible text (empty hgm-card links)' },
      { id: 'image-alt',              impact: 'CRITICAL', pages: 87,   wcag: '1.1.1', help: 'Images must have alternative text' },
      { id: 'button-name',            impact: 'CRITICAL', pages: 107,  wcag: '4.1.2', help: 'Buttons must have discernible text (YouTube player buttons)' },
      { id: 'aria-prohibited-attr',   impact: 'SERIOUS',  pages: 103,  wcag: '4.1.2', help: 'Elements must only use permitted ARIA attributes (YouTube)' },
      { id: 'list',                   impact: 'SERIOUS',  pages: 140,  wcag: '1.3.1', help: 'ul/ol must only directly contain li elements' },
      { id: 'listitem',               impact: 'SERIOUS',  pages: 129,  wcag: '1.3.1', help: 'li elements must be in a ul or ol' },
      { id: 'frame-title',            impact: 'SERIOUS',  pages: 58,   wcag: '2.4.1', help: 'Frames and iframes must have an accessible name' },
      { id: 'aria-required-children', impact: 'CRITICAL', pages: 34,   wcag: '4.1.2', help: 'ARIA roles must contain required child elements (hgm-tabs)' },
      { id: 'aria-valid-attr-value',  impact: 'CRITICAL', pages: 28,   wcag: '4.1.2', help: 'ARIA attributes must conform to valid values (hgm-tabs)' },
      { id: 'link-in-text-block',     impact: 'SERIOUS',  pages: 27,   wcag: '1.4.1', help: 'Links must be distinguishable without relying on color alone' },
      { id: 'aria-allowed-attr',      impact: 'CRITICAL', pages: 12,   wcag: '4.1.2', help: 'Elements must only use supported ARIA attributes' },
      { id: 'select-name',            impact: 'CRITICAL', pages: 12,   wcag: '4.1.2', help: 'Select elements must have accessible names' },
      { id: 'label',                  impact: 'CRITICAL', pages: 5,    wcag: '1.3.1', help: 'Form elements must have labels' },
      { id: 'scrollable-region-focusable', impact: 'SERIOUS', pages: 3, wcag: '2.1.1', help: 'Scrollable regions must have keyboard access' },
      { id: 'nested-interactive',     impact: 'SERIOUS',  pages: 3,    wcag: '4.1.2', help: 'Interactive controls must not be nested' },
      { id: 'definition-list',        impact: 'SERIOUS',  pages: 3,    wcag: '1.3.1', help: 'dl elements must only contain properly-ordered dt and dd groups' },
      { id: 'aria-input-field-name',  impact: 'SERIOUS',  pages: 2,    wcag: '4.1.2', help: 'ARIA input fields must have an accessible name' },
      { id: 'aria-required-parent',   impact: 'CRITICAL', pages: 1,    wcag: '4.1.2', help: 'Certain ARIA roles must be contained by particular parents' },
      { id: 'autocomplete-valid',     impact: 'SERIOUS',  pages: 1,    wcag: '1.3.5', help: 'autocomplete attribute must be used correctly' },
      { id: 'aria-command-name',      impact: 'SERIOUS',  pages: 1,    wcag: '4.1.2', help: 'ARIA commands must have an accessible name' },
      { id: 'aria-toggle-field-name', impact: 'SERIOUS',  pages: 1,    wcag: '4.1.2', help: 'ARIA toggle fields must have an accessible name' },
    ],
  },
  {
    name: 'Saint Agnes Medical Center',
    url:  'https://www.samc.com',
    pages: 2497, violations: 15, critical: 7, serious: 8,
    score: 100, instances: null, heuristics: null,
    violations_detail: [
      { id: 'color-contrast',         impact: 'SERIOUS',  pages: 2484, wcag: '1.4.3', help: 'Elements must meet minimum color contrast ratio thresholds' },
      { id: 'aria-allowed-attr',      impact: 'CRITICAL', pages: 84,   wcag: '4.1.2', help: 'Elements must only use supported ARIA attributes' },
      { id: 'select-name',            impact: 'CRITICAL', pages: 83,   wcag: '4.1.2', help: 'Select elements must have accessible names' },
      { id: 'image-alt',              impact: 'CRITICAL', pages: 40,   wcag: '1.1.1', help: 'Images must have alternative text' },
      { id: 'frame-title',            impact: 'SERIOUS',  pages: 35,   wcag: '2.4.1', help: 'Frames and iframes must have an accessible name' },
      { id: 'link-name',              impact: 'SERIOUS',  pages: 31,   wcag: '2.4.4', help: 'Links must have discernible text (empty card links)' },
      { id: 'aria-prohibited-attr',   impact: 'SERIOUS',  pages: 21,   wcag: '4.1.2', help: 'Elements must only use permitted ARIA attributes (YouTube)' },
      { id: 'aria-required-children', impact: 'CRITICAL', pages: 2,    wcag: '4.1.2', help: 'ARIA roles must contain required child elements (hgm-tabs)' },
      { id: 'aria-valid-attr-value',  impact: 'CRITICAL', pages: 2,    wcag: '4.1.2', help: 'ARIA attributes must conform to valid values (hgm-tabs)' },
      { id: 'button-name',            impact: 'CRITICAL', pages: 14,   wcag: '4.1.2', help: 'Buttons must have discernible text (YouTube player buttons)' },
      { id: 'list',                   impact: 'SERIOUS',  pages: 12,   wcag: '1.3.1', help: 'ul/ol must only directly contain li elements' },
      { id: 'listitem',               impact: 'SERIOUS',  pages: 5,    wcag: '1.3.1', help: 'li elements must be in a ul or ol' },
      { id: 'aria-roles',             impact: 'CRITICAL', pages: 1,    wcag: '4.1.2', help: 'ARIA roles used must conform to valid values' },
      { id: 'document-title',         impact: 'SERIOUS',  pages: 1,    wcag: '2.4.2', help: 'Documents must have a title element' },
      { id: 'html-has-lang',          impact: 'SERIOUS',  pages: 1,    wcag: '3.1.1', help: 'html element must have a lang attribute' },
    ],
  },
  {
    name: 'St. Joseph Mercy Health System',
    url:  'https://www.sjmed.com',
    pages: 2174, violations: 12, critical: 4, serious: 8,
    score: 100, instances: null, heuristics: null,
    violations_detail: [
      { id: 'color-contrast',         impact: 'SERIOUS',  pages: 974,  wcag: '1.4.3', help: 'Elements must meet minimum color contrast ratio thresholds' },
      { id: 'list',                   impact: 'SERIOUS',  pages: 57,   wcag: '1.3.1', help: 'ul/ol must only directly contain li elements' },
      { id: 'listitem',               impact: 'SERIOUS',  pages: 52,   wcag: '1.3.1', help: 'li elements must be in a ul or ol' },
      { id: 'image-alt',              impact: 'CRITICAL', pages: 24,   wcag: '1.1.1', help: 'Images must have alternative text' },
      { id: 'link-in-text-block',     impact: 'SERIOUS',  pages: 18,   wcag: '1.4.1', help: 'Links must be distinguishable without relying on color alone' },
      { id: 'frame-title',            impact: 'SERIOUS',  pages: 13,   wcag: '2.4.1', help: 'Frames and iframes must have an accessible name' },
      { id: 'link-name',              impact: 'SERIOUS',  pages: 8,    wcag: '2.4.4', help: 'Links must have discernible text (empty card links)' },
      { id: 'aria-required-children', impact: 'CRITICAL', pages: 4,    wcag: '4.1.2', help: 'ARIA roles must contain required child elements (hgm-tabs)' },
      { id: 'aria-valid-attr-value',  impact: 'CRITICAL', pages: 4,    wcag: '4.1.2', help: 'ARIA attributes must conform to valid values (hgm-tabs)' },
      { id: 'aria-prohibited-attr',   impact: 'SERIOUS',  pages: 3,    wcag: '4.1.2', help: 'Elements must only use permitted ARIA attributes (YouTube)' },
      { id: 'button-name',            impact: 'CRITICAL', pages: 2,    wcag: '4.1.2', help: 'Buttons must have discernible text (YouTube player buttons)' },
      { id: 'autocomplete-valid',     impact: 'SERIOUS',  pages: 2,    wcag: '1.3.5', help: 'autocomplete attribute must be used correctly ("disable" → "off")' },
    ],
  },
  {
    name: 'St. Mary\'s Health Care System',
    url:  'https://www.stmaryshealthcaresystem.org',
    pages: 2163, violations: 15, critical: 6, serious: 9,
    score: 100, instances: null, heuristics: null,
    violations_detail: [
      { id: 'color-contrast',         impact: 'SERIOUS',  pages: 2162, wcag: '1.4.3', help: 'Elements must meet minimum color contrast ratio thresholds' },
      { id: 'image-alt',              impact: 'CRITICAL', pages: 291,  wcag: '1.1.1', help: 'Images must have alternative text' },
      { id: 'list',                   impact: 'SERIOUS',  pages: 155,  wcag: '1.3.1', help: 'ul/ol must only directly contain li elements' },
      { id: 'listitem',               impact: 'SERIOUS',  pages: 142,  wcag: '1.3.1', help: 'li elements must be in a ul or ol' },
      { id: 'aria-allowed-attr',      impact: 'CRITICAL', pages: 64,   wcag: '4.1.2', help: 'Elements must only use supported ARIA attributes' },
      { id: 'select-name',            impact: 'CRITICAL', pages: 63,   wcag: '4.1.2', help: 'Select elements must have accessible names' },
      { id: 'link-name',              impact: 'SERIOUS',  pages: 20,   wcag: '2.4.4', help: 'Links must have discernible text (empty card links)' },
      { id: 'aria-required-children', impact: 'CRITICAL', pages: 19,   wcag: '4.1.2', help: 'ARIA roles must contain required child elements (hgm-tabs)' },
      { id: 'aria-valid-attr-value',  impact: 'CRITICAL', pages: 15,   wcag: '4.1.2', help: 'ARIA attributes must conform to valid values (hgm-tabs)' },
      { id: 'frame-title',            impact: 'SERIOUS',  pages: 9,    wcag: '2.4.1', help: 'Frames and iframes must have an accessible name' },
      { id: 'aria-prohibited-attr',   impact: 'SERIOUS',  pages: 8,    wcag: '4.1.2', help: 'Elements must only use permitted ARIA attributes (YouTube)' },
      { id: 'button-name',            impact: 'CRITICAL', pages: 6,    wcag: '4.1.2', help: 'Buttons must have discernible text (YouTube player buttons)' },
      { id: 'scrollable-region-focusable', impact: 'SERIOUS', pages: 2, wcag: '2.1.1', help: 'Scrollable regions must have keyboard access' },
      { id: 'autocomplete-valid',     impact: 'SERIOUS',  pages: 1,    wcag: '1.3.5', help: 'autocomplete attribute must be used correctly' },
      { id: 'aria-input-field-name',  impact: 'SERIOUS',  pages: 1,    wcag: '4.1.2', help: 'ARIA input fields must have an accessible name' },
    ],
  },
  {
    name: 'Trinity Health (Corporate)',
    url:  'https://www.trinity-health.org',
    pages: 693, violations: 13, critical: 5, serious: 8,
    score: 100, instances: null, heuristics: null,
    violations_detail: [
      { id: 'color-contrast',         impact: 'SERIOUS',  pages: 692,  wcag: '1.4.3', help: 'Elements must meet minimum color contrast ratio thresholds' },
      { id: 'link-name',              impact: 'SERIOUS',  pages: 275,  wcag: '2.4.4', help: 'Links must have discernible text (social share links, card links)' },
      { id: 'image-alt',              impact: 'CRITICAL', pages: 57,   wcag: '1.1.1', help: 'Images must have alternative text' },
      { id: 'definition-list',        impact: 'SERIOUS',  pages: 16,   wcag: '1.3.1', help: 'dl elements must only contain properly-ordered dt and dd groups' },
      { id: 'frame-title',            impact: 'SERIOUS',  pages: 5,    wcag: '2.4.1', help: 'Frames and iframes must have an accessible name' },
      { id: 'aria-required-children', impact: 'CRITICAL', pages: 1,    wcag: '4.1.2', help: 'ARIA roles must contain required child elements (hgm-tabs)' },
      { id: 'aria-valid-attr-value',  impact: 'CRITICAL', pages: 1,    wcag: '4.1.2', help: 'ARIA attributes must conform to valid values (hgm-tabs)' },
      { id: 'select-name',            impact: 'CRITICAL', pages: 1,    wcag: '4.1.2', help: 'Select elements must have accessible names' },
      { id: 'button-name',            impact: 'CRITICAL', pages: 1,    wcag: '4.1.2', help: 'Buttons must have discernible text' },
      { id: 'autocomplete-valid',     impact: 'SERIOUS',  pages: 1,    wcag: '1.3.5', help: 'autocomplete attribute must be used correctly ("disable" → "off")' },
      { id: 'listitem',               impact: 'SERIOUS',  pages: 1,    wcag: '1.3.1', help: 'li elements must be in a ul or ol' },
      { id: 'document-title',         impact: 'SERIOUS',  pages: 1,    wcag: '2.4.2', help: 'Documents must have a title element' },
      { id: 'html-has-lang',          impact: 'SERIOUS',  pages: 1,    wcag: '3.1.1', help: 'html element must have a lang attribute' },
    ],
  },
  {
    name: 'Mount Carmel Health System',
    url:  'https://www.mountcarmelhealth.com',
    pages: 1193, violations: 14, critical: 6, serious: 8,
    score: 100, instances: 960, heuristics: 4922,
    violations_detail: [
      { id: 'color-contrast',         impact: 'SERIOUS',  pages: 312,  wcag: '1.4.3', help: 'Elements must meet minimum color contrast ratio thresholds' },
      { id: 'link-name',              impact: 'SERIOUS',  pages: 38,   wcag: '2.4.4', help: 'Links must have discernible text (empty card links)' },
      { id: 'frame-title',            impact: 'SERIOUS',  pages: 37,   wcag: '2.4.1', help: 'Frames and iframes must have an accessible name' },
      { id: 'button-name',            impact: 'CRITICAL', pages: 24,   wcag: '4.1.2', help: 'Buttons must have discernible text (YouTube player buttons)' },
      { id: 'aria-required-children', impact: 'CRITICAL', pages: 20,   wcag: '4.1.2', help: 'ARIA roles must contain required child elements (hgm-tabs)' },
      { id: 'aria-prohibited-attr',   impact: 'SERIOUS',  pages: 21,   wcag: '4.1.2', help: 'Elements must only use permitted ARIA attributes (YouTube)' },
      { id: 'aria-valid-attr-value',  impact: 'CRITICAL', pages: 17,   wcag: '4.1.2', help: 'ARIA attributes must conform to valid values (hgm-tabs)' },
      { id: 'list',                   impact: 'SERIOUS',  pages: 13,   wcag: '1.3.1', help: 'ul/ol must only directly contain li elements' },
      { id: 'listitem',               impact: 'SERIOUS',  pages: 9,    wcag: '1.3.1', help: 'li elements must be in a ul or ol' },
      { id: 'aria-roles',             impact: 'CRITICAL', pages: 3,    wcag: '4.1.2', help: 'ARIA roles used must conform to valid values' },
      { id: 'nested-interactive',     impact: 'SERIOUS',  pages: 3,    wcag: '4.1.2', help: 'Interactive controls must not be nested' },
      { id: 'autocomplete-valid',     impact: 'SERIOUS',  pages: 2,    wcag: '1.3.5', help: 'autocomplete attribute must be used correctly ("disable" → "off")' },
      { id: 'image-alt',              impact: 'CRITICAL', pages: 6,    wcag: '1.1.1', help: 'Images must have alternative text' },
      { id: 'label',                  impact: 'CRITICAL', pages: 1,    wcag: '4.1.2', help: 'Form elements must have labels' },
    ],
  },
  {
    name: 'Holy Cross Hospital (Fort Lauderdale)',
    url:  'https://www.holy-cross.com',
    pages: 1326, violations: 16, critical: 5, serious: 10,
    score: 100, instances: 24438, heuristics: 5272,
    violations_detail: [
      { id: 'color-contrast',         impact: 'SERIOUS',  pages: 1321, wcag: '1.4.3', help: 'Elements must meet minimum color contrast ratio thresholds' },
      { id: 'list',                   impact: 'SERIOUS',  pages: 224,  wcag: '1.3.1', help: 'ul/ol must only directly contain li elements' },
      { id: 'listitem',               impact: 'SERIOUS',  pages: 223,  wcag: '1.3.1', help: 'li elements must be in a ul or ol' },
      { id: 'button-name',            impact: 'CRITICAL', pages: 37,   wcag: '4.1.2', help: 'Buttons must have discernible text (YouTube player buttons)' },
      { id: 'image-alt',              impact: 'CRITICAL', pages: 34,   wcag: '1.1.1', help: 'Images must have alternative text' },
      { id: 'link-name',              impact: 'SERIOUS',  pages: 31,   wcag: '2.4.4', help: 'Links must have discernible text' },
      { id: 'aria-prohibited-attr',   impact: 'SERIOUS',  pages: 31,   wcag: '4.1.2', help: 'Elements must only use permitted ARIA attributes (YouTube)' },
      { id: 'frame-title',            impact: 'SERIOUS',  pages: 22,   wcag: '2.4.1', help: 'Frames and iframes must have an accessible name' },
      { id: 'aria-required-children', impact: 'CRITICAL', pages: 19,   wcag: '4.1.2', help: 'ARIA roles must contain required child elements (hgm-tabs)' },
      { id: 'aria-valid-attr-value',  impact: 'CRITICAL', pages: 18,   wcag: '4.1.2', help: 'ARIA attributes must conform to valid values (hgm-tabs)' },
      { id: 'link-in-text-block',     impact: 'SERIOUS',  pages: 15,   wcag: '1.4.1', help: 'Links must be distinguishable without relying on color alone' },
      { id: 'document-title',         impact: 'SERIOUS',  pages: 4,    wcag: '2.4.2', help: 'Documents must have a title element' },
      { id: 'html-has-lang',          impact: 'SERIOUS',  pages: 4,    wcag: '3.1.1', help: 'html element must have a lang attribute' },
      { id: 'dlitem',                 impact: 'SERIOUS',  pages: 2,    wcag: '1.3.1', help: 'dt and dd elements must be contained by a dl' },
      { id: 'select-name',            impact: 'CRITICAL', pages: 1,    wcag: '4.1.2', help: 'Select elements must have accessible names' },
      { id: 'meta-viewport',          impact: 'SERIOUS',  pages: 1,    wcag: '1.4.4', help: 'Zooming and scaling must not be disabled' },
    ],
  },
  {
    name: 'Holy Cross Health (Maryland)',
    url:  'https://www.holycrosshealth.org',
    pages: 1401, violations: 13, critical: 5, serious: 8,
    score: 100, instances: 14548, heuristics: 5110,
    violations_detail: [
      { id: 'color-contrast',         impact: 'SERIOUS',  pages: 1397, wcag: '1.4.3', help: 'Elements must meet minimum color contrast ratio thresholds' },
      { id: 'link-name',              impact: 'SERIOUS',  pages: 298,  wcag: '2.4.4', help: 'Links must have discernible text' },
      { id: 'image-alt',              impact: 'CRITICAL', pages: 177,  wcag: '1.1.1', help: 'Images must have alternative text' },
      { id: 'frame-title',            impact: 'SERIOUS',  pages: 43,   wcag: '2.4.1', help: 'Frames and iframes must have an accessible name' },
      { id: 'aria-prohibited-attr',   impact: 'SERIOUS',  pages: 35,   wcag: '4.1.2', help: 'Elements must only use permitted ARIA attributes (YouTube)' },
      { id: 'button-name',            impact: 'CRITICAL', pages: 31,   wcag: '4.1.2', help: 'Buttons must have discernible text (YouTube player buttons)' },
      { id: 'aria-required-children', impact: 'CRITICAL', pages: 6,    wcag: '4.1.2', help: 'ARIA roles must contain required child elements (hgm-tabs)' },
      { id: 'nested-interactive',     impact: 'SERIOUS',  pages: 3,    wcag: '4.1.2', help: 'Interactive controls must not be nested' },
      { id: 'autocomplete-valid',     impact: 'SERIOUS',  pages: 2,    wcag: '1.3.5', help: 'autocomplete attribute must be used correctly' },
      { id: 'aria-valid-attr-value',  impact: 'CRITICAL', pages: 1,    wcag: '4.1.2', help: 'ARIA attributes must conform to valid values (hgm-tabs)' },
      { id: 'aria-required-attr',     impact: 'CRITICAL', pages: 1,    wcag: '4.1.2', help: 'Required ARIA attributes must be provided' },
      { id: 'list',                   impact: 'SERIOUS',  pages: 1,    wcag: '1.3.1', help: 'ul/ol must only directly contain li elements' },
      { id: 'link-in-text-block',     impact: 'SERIOUS',  pages: 1,    wcag: '1.4.1', help: 'Links must be distinguishable without relying on color alone' },
    ],
  },
  {
    name: 'Loyola Medicine',
    url:  'https://www.loyolamedicine.org',
    pages: 3680, violations: 16, critical: 8, serious: 8,
    score: 100, instances: 5625, heuristics: 32642,
    violations_detail: [
      { id: 'color-contrast',         impact: 'SERIOUS',  pages: 809,  wcag: '1.4.3', help: 'Elements must meet minimum color contrast ratio thresholds' },
      { id: 'link-name',              impact: 'SERIOUS',  pages: 742,  wcag: '2.4.4', help: 'Links must have discernible text (empty card links)' },
      { id: 'aria-required-children', impact: 'CRITICAL', pages: 536,  wcag: '4.1.2', help: 'ARIA roles must contain required child elements (hgm-tabs)' },
      { id: 'aria-valid-attr-value',  impact: 'CRITICAL', pages: 346,  wcag: '4.1.2', help: 'ARIA attributes must conform to valid values (hgm-tabs)' },
      { id: 'frame-title',            impact: 'SERIOUS',  pages: 214,  wcag: '2.4.1', help: 'Frames and iframes must have an accessible name' },
      { id: 'list',                   impact: 'SERIOUS',  pages: 129,  wcag: '1.3.1', help: 'ul/ol must only directly contain li elements' },
      { id: 'listitem',               impact: 'SERIOUS',  pages: 127,  wcag: '1.3.1', help: 'li elements must be in a ul or ol' },
      { id: 'image-alt',              impact: 'CRITICAL', pages: 91,   wcag: '1.1.1', help: 'Images must have alternative text' },
      { id: 'nested-interactive',     impact: 'SERIOUS',  pages: 35,   wcag: '4.1.2', help: 'Interactive controls must not be nested' },
      { id: 'button-name',            impact: 'CRITICAL', pages: 21,   wcag: '4.1.2', help: 'Buttons must have discernible text (YouTube player buttons)' },
      { id: 'aria-prohibited-attr',   impact: 'SERIOUS',  pages: 21,   wcag: '4.1.2', help: 'Elements must only use permitted ARIA attributes (YouTube)' },
      { id: 'select-name',            impact: 'CRITICAL', pages: 8,    wcag: '4.1.2', help: 'Select elements must have accessible names' },
      { id: 'aria-allowed-attr',      impact: 'CRITICAL', pages: 2,    wcag: '4.1.2', help: 'Elements must only use supported ARIA attributes' },
      { id: 'label',                  impact: 'CRITICAL', pages: 2,    wcag: '4.1.2', help: 'Form elements must have labels' },
      { id: 'aria-roles',             impact: 'CRITICAL', pages: 1,    wcag: '4.1.2', help: 'ARIA roles used must conform to valid values' },
      { id: 'aria-command-name',      impact: 'SERIOUS',  pages: 1,    wcag: '4.1.2', help: 'ARIA commands must have an accessible name' },
    ],
  },
  {
    name: 'St. Joseph\'s Health (Syracuse)',
    url:  'https://www.sjhsyr.org',
    pages: 473, violations: 6, critical: 3, serious: 3,
    score: 100, instances: 2614, heuristics: 3435,
    violations_detail: [
      { id: 'color-contrast',         impact: 'SERIOUS',  pages: 470,  wcag: '1.4.3', help: 'Elements must meet minimum color contrast ratio thresholds' },
      { id: 'image-alt',              impact: 'CRITICAL', pages: 19,   wcag: '1.1.1', help: 'Images must have alternative text' },
      { id: 'link-name',              impact: 'SERIOUS',  pages: 7,    wcag: '2.4.4', help: 'Links must have discernible text' },
      { id: 'frame-title',            impact: 'SERIOUS',  pages: 5,    wcag: '2.4.1', help: 'Frames and iframes must have an accessible name' },
      { id: 'aria-required-children', impact: 'CRITICAL', pages: 3,    wcag: '4.1.2', help: 'ARIA roles must contain required child elements (hgm-tabs)' },
      { id: 'aria-valid-attr-value',  impact: 'CRITICAL', pages: 3,    wcag: '4.1.2', help: 'ARIA attributes must conform to valid values (hgm-tabs)' },
    ],
  },
  {
    name: 'St. Peter\'s Health Partners',
    url:  'https://www.sphp.com',
    pages: 850, violations: 14, critical: 5, serious: 9,
    score: 100, instances: 652, heuristics: 3381,
    violations_detail: [
      { id: 'color-contrast',         impact: 'SERIOUS',  pages: 86,   wcag: '1.4.3', help: 'Elements must meet minimum color contrast ratio thresholds' },
      { id: 'link-name',              impact: 'SERIOUS',  pages: 64,   wcag: '2.4.4', help: 'Links must have discernible text' },
      { id: 'button-name',            impact: 'CRITICAL', pages: 22,   wcag: '4.1.2', help: 'Buttons must have discernible text (YouTube player buttons)' },
      { id: 'image-alt',              impact: 'CRITICAL', pages: 17,   wcag: '1.1.1', help: 'Images must have alternative text' },
      { id: 'aria-prohibited-attr',   impact: 'SERIOUS',  pages: 10,   wcag: '4.1.2', help: 'Elements must only use permitted ARIA attributes (YouTube)' },
      { id: 'frame-title',            impact: 'SERIOUS',  pages: 9,    wcag: '2.4.1', help: 'Frames and iframes must have an accessible name' },
      { id: 'aria-required-children', impact: 'CRITICAL', pages: 3,    wcag: '4.1.2', help: 'ARIA roles must contain required child elements (hgm-tabs)' },
      { id: 'autocomplete-valid',     impact: 'SERIOUS',  pages: 3,    wcag: '1.3.5', help: 'autocomplete attribute must be used correctly' },
      { id: 'aria-progressbar-name',  impact: 'SERIOUS',  pages: 3,    wcag: '4.1.2', help: 'ARIA progressbar nodes must have an accessible name' },
      { id: 'nested-interactive',     impact: 'SERIOUS',  pages: 2,    wcag: '4.1.2', help: 'Interactive controls must not be nested' },
      { id: 'aria-valid-attr-value',  impact: 'CRITICAL', pages: 1,    wcag: '4.1.2', help: 'ARIA attributes must conform to valid values (hgm-tabs)' },
      { id: 'aria-required-parent',   impact: 'CRITICAL', pages: 1,    wcag: '4.1.2', help: 'Certain ARIA roles must be contained by particular parents' },
      { id: 'link-in-text-block',     impact: 'SERIOUS',  pages: 1,    wcag: '1.4.1', help: 'Links must be distinguishable without relying on color alone' },
      { id: 'list',                   impact: 'SERIOUS',  pages: 1,    wcag: '1.3.1', help: 'ul/ol must only directly contain li elements' },
    ],
  },
  {
    name: 'Trinity Health Plan Medicare',
    url:  'https://www.thpmedicare.org',
    pages: 715, violations: 7, critical: 3, serious: 4,
    score: 100, instances: 725, heuristics: 4125,
    violations_detail: [
      { id: 'frame-title',            impact: 'SERIOUS',  pages: 54,   wcag: '2.4.1', help: 'Frames and iframes must have an accessible name' },
      { id: 'label',                  impact: 'CRITICAL', pages: 49,   wcag: '4.1.2', help: 'Form elements must have labels' },
      { id: 'color-contrast',         impact: 'SERIOUS',  pages: 30,   wcag: '1.4.3', help: 'Elements must meet minimum color contrast ratio thresholds' },
      { id: 'select-name',            impact: 'CRITICAL', pages: 20,   wcag: '4.1.2', help: 'Select elements must have accessible names' },
      { id: 'link-name',              impact: 'SERIOUS',  pages: 10,   wcag: '2.4.4', help: 'Links must have discernible text' },
      { id: 'image-alt',              impact: 'CRITICAL', pages: 8,    wcag: '1.1.1', help: 'Images must have alternative text' },
      { id: 'list',                   impact: 'SERIOUS',  pages: 8,    wcag: '1.3.1', help: 'ul/ol must only directly contain li elements' },
    ],
  },
  {
    name: 'Trinity Health At Home',
    url:  'https://www.trinityhealthathome.org',
    pages: 522, violations: 7, critical: 4, serious: 3,
    score: 100, instances: 2290, heuristics: 5733,
    violations_detail: [
      { id: 'color-contrast',         impact: 'SERIOUS',  pages: 435,  wcag: '1.4.3', help: 'Elements must meet minimum color contrast ratio thresholds' },
      { id: 'aria-prohibited-attr',   impact: 'SERIOUS',  pages: 37,   wcag: '4.1.2', help: 'Elements must only use permitted ARIA attributes (YouTube)' },
      { id: 'aria-required-children', impact: 'CRITICAL', pages: 33,   wcag: '4.1.2', help: 'ARIA roles must contain required child elements (hgm-tabs)' },
      { id: 'aria-valid-attr-value',  impact: 'CRITICAL', pages: 24,   wcag: '4.1.2', help: 'ARIA attributes must conform to valid values (hgm-tabs)' },
      { id: 'link-name',              impact: 'SERIOUS',  pages: 14,   wcag: '2.4.4', help: 'Links must have discernible text' },
      { id: 'button-name',            impact: 'CRITICAL', pages: 13,   wcag: '4.1.2', help: 'Buttons must have discernible text (YouTube player buttons)' },
      { id: 'image-alt',              impact: 'CRITICAL', pages: 11,   wcag: '1.1.1', help: 'Images must have alternative text' },
    ],
  },
  {
    name: 'Trinity Health of New England',
    url:  'https://www.trinityhealthofne.org',
    pages: 1725, violations: 18, critical: 6, serious: 12,
    score: 100, instances: 8180, heuristics: 7354,
    violations_detail: [
      { id: 'color-contrast',         impact: 'SERIOUS',  pages: 1712, wcag: '1.4.3', help: 'Elements must meet minimum color contrast ratio thresholds' },
      { id: 'link-name',              impact: 'SERIOUS',  pages: 214,  wcag: '2.4.4', help: 'Links must have discernible text' },
      { id: 'image-alt',              impact: 'CRITICAL', pages: 73,   wcag: '1.1.1', help: 'Images must have alternative text' },
      { id: 'list',                   impact: 'SERIOUS',  pages: 55,   wcag: '1.3.1', help: 'ul/ol must only directly contain li elements' },
      { id: 'aria-required-children', impact: 'CRITICAL', pages: 45,   wcag: '4.1.2', help: 'ARIA roles must contain required child elements (hgm-tabs)' },
      { id: 'frame-title',            impact: 'SERIOUS',  pages: 41,   wcag: '2.4.1', help: 'Frames and iframes must have an accessible name' },
      { id: 'aria-valid-attr-value',  impact: 'CRITICAL', pages: 29,   wcag: '4.1.2', help: 'ARIA attributes must conform to valid values (hgm-tabs)' },
      { id: 'select-name',            impact: 'CRITICAL', pages: 23,   wcag: '4.1.2', help: 'Select elements must have accessible names' },
      { id: 'button-name',            impact: 'CRITICAL', pages: 17,   wcag: '4.1.2', help: 'Buttons must have discernible text' },
      { id: 'nested-interactive',     impact: 'SERIOUS',  pages: 14,   wcag: '4.1.2', help: 'Interactive controls must not be nested' },
      { id: 'aria-prohibited-attr',   impact: 'SERIOUS',  pages: 11,   wcag: '4.1.2', help: 'Elements must only use permitted ARIA attributes (YouTube)' },
      { id: 'listitem',               impact: 'SERIOUS',  pages: 4,    wcag: '1.3.1', help: 'li elements must be in a ul or ol' },
      { id: 'label',                  impact: 'CRITICAL', pages: 1,    wcag: '4.1.2', help: 'Form elements must have labels' },
      { id: 'dlitem',                 impact: 'SERIOUS',  pages: 1,    wcag: '1.3.1', help: 'dt and dd elements must be contained by a dl' },
      { id: 'autocomplete-valid',     impact: 'SERIOUS',  pages: 1,    wcag: '1.3.5', help: 'autocomplete attribute must be used correctly' },
      { id: 'aria-input-field-name',  impact: 'SERIOUS',  pages: 1,    wcag: '4.1.2', help: 'ARIA input fields must have an accessible name' },
      { id: 'aria-toggle-field-name', impact: 'SERIOUS',  pages: 1,    wcag: '4.1.2', help: 'ARIA toggle fields must have an accessible name' },
      { id: 'link-in-text-block',     impact: 'SERIOUS',  pages: 1,    wcag: '1.4.1', help: 'Links must be distinguishable without relying on color alone' },
    ],
  },
  {
    name: 'Trinity Health PACE',
    url:  'https://www.trinityhealthpace.org',
    pages: 411, violations: 12, critical: 4, serious: 7,
    score: 100, instances: 1090, heuristics: 1756,
    violations_detail: [
      { id: 'color-contrast',         impact: 'SERIOUS',  pages: 121,  wcag: '1.4.3', help: 'Elements must meet minimum color contrast ratio thresholds' },
      { id: 'image-alt',              impact: 'CRITICAL', pages: 36,   wcag: '1.1.1', help: 'Images must have alternative text' },
      { id: 'aria-required-children', impact: 'CRITICAL', pages: 31,   wcag: '4.1.2', help: 'ARIA roles must contain required child elements (hgm-tabs)' },
      { id: 'aria-valid-attr-value',  impact: 'CRITICAL', pages: 29,   wcag: '4.1.2', help: 'ARIA attributes must conform to valid values (hgm-tabs)' },
      { id: 'link-name',              impact: 'SERIOUS',  pages: 18,   wcag: '2.4.4', help: 'Links must have discernible text' },
      { id: 'list',                   impact: 'SERIOUS',  pages: 10,   wcag: '1.3.1', help: 'ul/ol must only directly contain li elements' },
      { id: 'aria-command-name',      impact: 'SERIOUS',  pages: 3,    wcag: '4.1.2', help: 'ARIA commands must have an accessible name' },
      { id: 'frame-title',            impact: 'SERIOUS',  pages: 2,    wcag: '2.4.1', help: 'Frames and iframes must have an accessible name' },
      { id: 'label',                  impact: 'CRITICAL', pages: 1,    wcag: '4.1.2', help: 'Form elements must have labels' },
      { id: 'link-in-text-block',     impact: 'SERIOUS',  pages: 1,    wcag: '1.4.1', help: 'Links must be distinguishable without relying on color alone' },
      { id: 'autocomplete-valid',     impact: 'SERIOUS',  pages: 1,    wcag: '1.3.5', help: 'autocomplete attribute must be used correctly' },
      { id: 'meta-viewport',          impact: 'SERIOUS',  pages: 1,    wcag: '1.4.4', help: 'Zooming and scaling must not be disabled' },
    ],
  },
  {
    name: 'Trinity Health Senior Communities',
    url:  'https://www.trinityhealthseniorcommunities.org',
    pages: 446, violations: 7, critical: 2, serious: 5,
    score: 100, instances: 967, heuristics: 3280,
    violations_detail: [
      { id: 'link-name',              impact: 'SERIOUS',  pages: 257,  wcag: '2.4.4', help: 'Links must have discernible text' },
      { id: 'color-contrast',         impact: 'SERIOUS',  pages: 90,   wcag: '1.4.3', help: 'Elements must meet minimum color contrast ratio thresholds' },
      { id: 'image-alt',              impact: 'CRITICAL', pages: 22,   wcag: '1.1.1', help: 'Images must have alternative text' },
      { id: 'frame-title',            impact: 'SERIOUS',  pages: 20,   wcag: '2.4.1', help: 'Frames and iframes must have an accessible name' },
      { id: 'link-in-text-block',     impact: 'SERIOUS',  pages: 8,    wcag: '1.4.1', help: 'Links must be distinguishable without relying on color alone' },
      { id: 'aria-command-name',      impact: 'SERIOUS',  pages: 2,    wcag: '4.1.2', help: 'ARIA commands must have an accessible name' },
      { id: 'aria-required-parent',   impact: 'CRITICAL', pages: 1,    wcag: '4.1.2', help: 'Certain ARIA roles must be contained by particular parents' },
    ],
  },
  {
    name: 'Trinity Health Mid-Atlantic',
    url:  'https://www.trinityhealthma.org',
    pages: 1790, violations: 15, critical: 7, serious: 8,
    score: 100, instances: 1798, heuristics: 13485,
    violations_detail: [
      { id: 'link-name',              impact: 'SERIOUS',  pages: 328,  wcag: '2.4.4', help: 'Links must have discernible text (empty card links)' },
      { id: 'color-contrast',         impact: 'SERIOUS',  pages: 170,  wcag: '1.4.3', help: 'Elements must meet minimum color contrast ratio thresholds' },
      { id: 'frame-title',            impact: 'SERIOUS',  pages: 33,   wcag: '2.4.1', help: 'Frames and iframes must have an accessible name' },
      { id: 'aria-prohibited-attr',   impact: 'SERIOUS',  pages: 31,   wcag: '4.1.2', help: 'Elements must only use permitted ARIA attributes (YouTube)' },
      { id: 'aria-valid-attr-value',  impact: 'CRITICAL', pages: 24,   wcag: '4.1.2', help: 'ARIA attributes must conform to valid values (hgm-tabs)' },
      { id: 'aria-required-children', impact: 'CRITICAL', pages: 23,   wcag: '4.1.2', help: 'ARIA roles must contain required child elements (hgm-tabs)' },
      { id: 'button-name',            impact: 'CRITICAL', pages: 22,   wcag: '4.1.2', help: 'Buttons must have discernible text (YouTube player buttons)' },
      { id: 'select-name',            impact: 'CRITICAL', pages: 19,   wcag: '4.1.2', help: 'Select elements must have accessible names' },
      { id: 'image-alt',              impact: 'CRITICAL', pages: 16,   wcag: '1.1.1', help: 'Images must have alternative text' },
      { id: 'link-in-text-block',     impact: 'SERIOUS',  pages: 11,   wcag: '1.4.1', help: 'Links must be distinguishable without relying on color alone' },
      { id: 'aria-roles',             impact: 'CRITICAL', pages: 7,    wcag: '4.1.2', help: 'ARIA roles used must conform to valid values' },
      { id: 'aria-valid-attr',        impact: 'CRITICAL', pages: 5,    wcag: '4.1.2', help: 'ARIA attributes must conform to valid names' },
      { id: 'list',                   impact: 'SERIOUS',  pages: 2,    wcag: '1.3.1', help: 'ul/ol must only directly contain li elements' },
      { id: 'nested-interactive',     impact: 'SERIOUS',  pages: 2,    wcag: '4.1.2', help: 'Interactive controls must not be nested' },
      { id: 'aria-progressbar-name',  impact: 'SERIOUS',  pages: 1,    wcag: '4.1.2', help: 'ARIA progressbar nodes must have an accessible name' },
    ],
  },
  {
    name: 'Trinity Health Michigan',
    url:  'https://www.trinityhealthmichigan.org',
    pages: 4440, violations: 18, critical: 6, serious: 12,
    score: 100, instances: 44931, heuristics: 25852,
    violations_detail: [
      { id: 'color-contrast',         impact: 'SERIOUS',  pages: 4390, wcag: '1.4.3', help: 'Elements must meet minimum color contrast ratio thresholds' },
      { id: 'list',                   impact: 'SERIOUS',  pages: 1042, wcag: '1.3.1', help: 'ul/ol must only directly contain li elements' },
      { id: 'listitem',               impact: 'SERIOUS',  pages: 1039, wcag: '1.3.1', help: 'li elements must be in a ul or ol' },
      { id: 'image-alt',              impact: 'CRITICAL', pages: 134,  wcag: '1.1.1', help: 'Images must have alternative text' },
      { id: 'link-name',              impact: 'SERIOUS',  pages: 88,   wcag: '2.4.4', help: 'Links must have discernible text' },
      { id: 'label',                  impact: 'CRITICAL', pages: 58,   wcag: '4.1.2', help: 'Form elements must have labels' },
      { id: 'select-name',            impact: 'CRITICAL', pages: 50,   wcag: '4.1.2', help: 'Select elements must have accessible names' },
      { id: 'aria-required-children', impact: 'CRITICAL', pages: 35,   wcag: '4.1.2', help: 'ARIA roles must contain required child elements (hgm-tabs)' },
      { id: 'aria-valid-attr-value',  impact: 'CRITICAL', pages: 32,   wcag: '4.1.2', help: 'ARIA attributes must conform to valid values (hgm-tabs)' },
      { id: 'document-title',         impact: 'SERIOUS',  pages: 31,   wcag: '2.4.2', help: 'Documents must have a title element' },
      { id: 'html-has-lang',          impact: 'SERIOUS',  pages: 31,   wcag: '3.1.1', help: 'html element must have a lang attribute' },
      { id: 'frame-title',            impact: 'SERIOUS',  pages: 22,   wcag: '2.4.1', help: 'Frames and iframes must have an accessible name' },
      { id: 'button-name',            impact: 'CRITICAL', pages: 4,    wcag: '4.1.2', help: 'Buttons must have discernible text' },
      { id: 'link-in-text-block',     impact: 'SERIOUS',  pages: 4,    wcag: '1.4.1', help: 'Links must be distinguishable without relying on color alone' },
      { id: 'nested-interactive',     impact: 'SERIOUS',  pages: 3,    wcag: '4.1.2', help: 'Interactive controls must not be nested' },
      { id: 'aria-prohibited-attr',   impact: 'SERIOUS',  pages: 3,    wcag: '4.1.2', help: 'Elements must only use permitted ARIA attributes' },
      { id: 'autocomplete-valid',     impact: 'SERIOUS',  pages: 1,    wcag: '1.3.5', help: 'autocomplete attribute must be used correctly' },
      { id: 'aria-command-name',      impact: 'SERIOUS',  pages: 1,    wcag: '4.1.2', help: 'ARIA commands must have an accessible name' },
    ],
  },
];

// ─── Platform-level fixes (cross-site patterns) ───────────────────────────────
const platformFixes = [
  {
    title: '1. Color Contrast — sitewide (WCAG 1.4.3)',
    impact: 'SERIOUS',
    sites: 'All 19 sites',
    pagesAffected: '~22,000+ pages',
    description: 'Text and interactive elements do not meet the 4.5:1 contrast ratio required for normal text (3:1 for large text). This is the single most widespread issue across the entire portfolio.',
    fix: 'Audit the global CSS color palette. Primary offenders include light grey text on white backgrounds, tinted button labels, and blue link colors on colored backgrounds. Use the WebAIM Contrast Checker to validate replacements. Update the design system/CSS variables so the fix propagates across all sites.',
    effort: 'Medium — CSS changes, design system update',
  },
  {
    title: '2. Missing Image Alt Text — image-alt (WCAG 1.1.1)',
    impact: 'CRITICAL',
    sites: 'All 19 sites',
    pagesAffected: '1,000+ pages',
    description: 'Images are missing the alt attribute or have an empty alt attribute where descriptive text is required. Screen reader users receive no information about these images.',
    fix: 'Add descriptive alt text to all informational images. Decorative images should use alt="" (empty string). In the CMS, make the alt text field required when uploading images. Inline images added via the rich text editor need special attention — enforce alt text in editor configuration.',
    effort: 'Low per image, Medium overall — content/CMS configuration',
  },
  {
    title: '3. hgm-tabs ARIA Errors — aria-required-children / aria-valid-attr-value (WCAG 4.1.2)',
    impact: 'CRITICAL',
    sites: '16 of 19 sites',
    pagesAffected: '1,200+ pages',
    description: 'The shared "hgm-tabs" component (recognizable by class="hgm-tabs") uses role="tablist" on a <form> element but does not include required child elements with role="tab". Additionally, aria-controls values contain spaces, which is invalid — IDs referenced by aria-controls cannot contain spaces.',
    fix: 'Fix at the shared component/platform level:\n(a) Replace role="tablist" on the <form> with a proper wrapper <div role="tablist"> containing <button role="tab"> children.\n(b) Remove spaces from aria-controls values and their corresponding element IDs.',
    effort: 'Low — one component fix resolves all 5 sites',
  },
  {
    title: '4. YouTube Embedded Player Buttons — button-name / aria-prohibited-attr (WCAG 4.1.2)',
    impact: 'CRITICAL / SERIOUS',
    sites: '15 of 19 sites',
    pagesAffected: '400+ pages',
    description: 'YouTube\'s embedded video player injects buttons without accessible names and uses ARIA attributes that are not permitted on certain elements. This is a third-party component issue.',
    fix: 'Short-term: add a title attribute to all YouTube <iframe> embeds describing the video content.\nLong-term: use YouTube\'s Privacy-Enhanced mode (youtube-nocookie.com) and consider a custom play button overlay that is fully accessible before the iframe loads.',
    effort: 'Low (iframe titles) — content update',
  },
  {
    title: '5. Empty Card Links — link-name (WCAG 2.4.4)',
    impact: 'SERIOUS',
    sites: 'All 19 sites',
    pagesAffected: '2,900+ pages',
    description: 'The hgm-card component renders a full-card clickable link (<a class="hgm-card__link" href="">) with no visible text or aria-label. Screen reader users hear "link" with no destination or purpose.',
    fix: 'Update the hgm-card component to add an aria-label to the card link derived from the card\'s heading text. Example: aria-label="Learn more about [Card Title]". This can be templated at the component level.',
    effort: 'Low — one component template change resolves all sites',
  },
  {
    title: '6. Missing iframe Titles — frame-title (WCAG 2.4.1 / 4.1.2)',
    impact: 'SERIOUS',
    sites: '18 of 19 sites',
    pagesAffected: '650+ pages',
    description: 'Embedded iframes (YouTube videos, Vimeo videos, Google Maps, third-party widgets) are missing the title attribute. Screen reader users cannot determine the purpose of the frame.',
    fix: 'Add a descriptive title attribute to every <iframe>. Examples: title="Map showing our hospital location", title="Video: Patient testimonial — Dr. Smith". Add a CMS validation rule or post-publish check that flags untitled iframes.',
    effort: 'Low — content update; medium to automate in CMS',
  },
  {
    title: '7. Malformed List Structure — list / listitem (WCAG 1.3.1)',
    impact: 'SERIOUS',
    sites: '15 of 19 sites',
    pagesAffected: '3,000+ pages',
    description: 'The hgm-badge component places <li class="badge"> elements directly inside elements that are not <ul> or <ol>. Assistive technologies cannot correctly interpret the list relationship.',
    fix: 'Wrap hgm-badge pill lists in a proper <ul> element. Update the component template — this is a single platform-level fix that will resolve the issue across all affected sites.',
    effort: 'Low — one component fix',
  },
  {
    title: '8. Invalid autocomplete Attribute — autocomplete-valid (WCAG 1.3.5)',
    impact: 'SERIOUS',
    sites: '11 of 19 sites',
    pagesAffected: '5–10 pages',
    description: 'A ZIP code input field uses autocomplete="disable" which is not a valid token. The correct value to disable autocomplete is autocomplete="off".',
    fix: 'Change autocomplete="disable" to autocomplete="off" on the ZIP code / postal code input field. This appears to be a shared form component — fix once and deploy.',
    effort: 'Very low — single attribute change',
  },
  {
    title: '9. Select Elements Without Labels — select-name (WCAG 4.1.2)',
    impact: 'CRITICAL',
    sites: '10 of 19 sites',
    pagesAffected: '160+ pages',
    description: 'Dropdown <select> elements (particularly state/province dropdowns in shared forms) do not have associated <label> elements. Screen reader users cannot determine what information to enter.',
    fix: 'Add a visible or visually-hidden <label> linked via the for attribute to each <select> element. For the state dropdown: <label for="state" class="sr-only">State</label>. Fix at the shared form component level.',
    effort: 'Low — component template update',
  },
];

// ─── Build document ───────────────────────────────────────────────────────────
function buildDoc() {
  const children = [];

  // ── Cover page ──────────────────────────────────────────────────────────────
  children.push(
    ...spacer(4),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 200 },
      children: [new TextRun({ text: 'WCAG 2.1 AA Accessibility', font: 'Arial', size: 52, bold: true, color: NAVY })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 400 },
      children: [new TextRun({ text: 'Remediation Plan', font: 'Arial', size: 52, bold: true, color: NAVY })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 160 },
      children: [new TextRun({ text: 'HHS Section 504 Compliance — Healthcare Portfolio', font: 'Arial', size: 28, color: '555555' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 80 },
      children: [new TextRun({ text: `Scan Date: ${scanDate}`, font: 'Arial', size: 24, color: '777777' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 80 },
      children: [new TextRun({ text: 'Report Generated: March 30, 2026', font: 'Arial', size: 24, color: '777777' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 80 },
      children: [new TextRun({ text: 'Compliance Deadline: May 11, 2026 (Large Recipients)', font: 'Arial', size: 24, bold: true, color: RED })],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  );

  // ── Table of Contents ───────────────────────────────────────────────────────
  children.push(
    heading1('Table of Contents'),
    new TableOfContents('Table of Contents', { hyperlink: true, headingStyleRange: '1-3' }),
    new Paragraph({ children: [new PageBreak()] }),
  );

  // ── 1. Executive Summary ────────────────────────────────────────────────────
  children.push(
    heading1('1. Executive Summary', null, false),
    p('This report presents the findings of an automated WCAG 2.1 Level AA accessibility scan conducted across 19 Trinity Health system websites. Scans were performed using the axe-core accessibility engine combined with custom heuristic checks, crawling a total of 35,787 pages.'),
    p(''),
    p('The HHS Section 504 final rule requires healthcare organizations receiving federal funding to conform to WCAG 2.1 AA by May 11, 2026 (large recipients). With less than seven weeks remaining at the time of this report, immediate action is required.', { bold: false }),
    p(''),
    heading2('Overall Findings'),
  );

  // Summary table
  children.push(
    new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [2800, 1200, 1200, 1100, 1100, 1960],
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            headerCell('Website', 2800),
            headerCell('Pages\nScanned', 1200, NAVY, WHITE, AlignmentType.CENTER),
            headerCell('Critical', 1200, RED, WHITE, AlignmentType.CENTER),
            headerCell('Serious', 1100, ORANGE, WHITE, AlignmentType.CENTER),
            headerCell('Total\nViolations', 1100, NAVY, WHITE, AlignmentType.CENTER),
            headerCell('Status', 1960),
          ],
        }),
        ...sites.map((s, i) => new TableRow({
          children: [
            dataCell(s.name, 2800, { fill: i % 2 === 0 ? WHITE : LIGHT_GREY }),
            dataCell(s.pages.toLocaleString(), 1200, { fill: i % 2 === 0 ? WHITE : LIGHT_GREY, align: AlignmentType.CENTER }),
            dataCell(s.critical.toString(), 1200, { fill: i % 2 === 0 ? WHITE : LIGHT_GREY, align: AlignmentType.CENTER, color: RED, bold: true }),
            dataCell(s.serious.toString(), 1100, { fill: i % 2 === 0 ? WHITE : LIGHT_GREY, align: AlignmentType.CENTER, color: ORANGE, bold: true }),
            dataCell(s.violations.toString(), 1100, { fill: i % 2 === 0 ? WHITE : LIGHT_GREY, align: AlignmentType.CENTER, bold: true }),
            dataCell('Scan Complete', 1960, { fill: i % 2 === 0 ? WHITE : LIGHT_GREY, color: '27AE60', bold: true }),
          ],
        })),
        new TableRow({
          children: [
            dataCell('TOTAL', 2800, { bold: true, fill: LIGHT_BLUE }),
            dataCell('35,787', 1200, { bold: true, fill: LIGHT_BLUE, align: AlignmentType.CENTER }),
            dataCell('101', 1200, { bold: true, fill: LIGHT_BLUE, align: AlignmentType.CENTER, color: RED }),
            dataCell('153', 1100, { bold: true, fill: LIGHT_BLUE, align: AlignmentType.CENTER, color: ORANGE }),
            dataCell('254', 1100, { bold: true, fill: LIGHT_BLUE, align: AlignmentType.CENTER }),
            dataCell('', 1960, { fill: LIGHT_BLUE }),
          ],
        }),
      ],
    }),
    p(''),
    p(''),
    heading2('Key Takeaways'),
    bullet('Color contrast failures are the most pervasive issue — affecting virtually every page on every site. This is a design system problem requiring a CSS-level fix.'),
    bullet('The majority of critical violations stem from shared platform components (hgm-tabs, hgm-card, hgm-badge). Fixing these components once will resolve violations across all sites simultaneously.'),
    bullet('YouTube embedded video players introduce ARIA violations that cannot be fully controlled by content editors. A platform-level video embed policy is needed.'),
    bullet('All violations detected are at Critical or Serious severity — there are no Moderate or Minor automated violations. Every finding requires attention before the May 11, 2026 deadline.'),
    bullet('The automated compliance score of 100% reflects passing automated checks relative to total checks run — it does NOT mean full WCAG compliance. Manual testing is required for approximately 43% of WCAG 2.1 AA criteria.'),
  );

  // ── 2. Compliance Deadline ──────────────────────────────────────────────────
  children.push(
    heading1('2. HHS Section 504 Compliance Deadline', null, true),
    p('The U.S. Department of Health and Human Services issued a final rule under Section 504 of the Rehabilitation Act requiring healthcare organizations that receive federal funding to make their websites and digital services conform to WCAG 2.1 Level AA.'),
    p(''),
    new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [4680, 4680],
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            headerCell('Organization Size', 4680),
            headerCell('Compliance Deadline', 4680),
          ],
        }),
        new TableRow({
          children: [
            dataCell('Large recipients (25 or more employees)', 4680),
            dataCell('May 11, 2026', 4680, { bold: true, color: RED }),
          ],
        }),
        new TableRow({
          children: [
            dataCell('Small recipients (fewer than 25 employees)', 4680, { fill: LIGHT_GREY }),
            dataCell('May 11, 2027', 4680, { fill: LIGHT_GREY }),
          ],
        }),
      ],
    }),
    p(''),
    p('Non-compliance can result in loss of federal funding, civil rights complaints, and litigation. The deadline for large recipients is approximately 46 days from the date of this report.', { bold: true, color: RED }),
    p(''),
    heading2('What WCAG 2.1 AA Requires'),
    bullet('50 success criteria across four principles: Perceivable, Operable, Understandable, Robust'),
    bullet('Level A criteria (foundational — must meet): 30 criteria'),
    bullet('Level AA criteria (standard compliance — must meet): 20 additional criteria'),
    bullet('Automated tools can test approximately 57% of criteria; the remaining 43% require manual review'),
  );

  // ── 3. Platform-Level Remediation ──────────────────────────────────────────
  children.push(
    heading1('3. Platform-Level Remediation (Highest Priority)', null, true),
    p('These issues appear across multiple sites because they originate in shared CMS components and design system elements. Fixing them at the platform level resolves violations across all affected sites simultaneously — this is the highest-ROI action available.'),
    p(''),
    p('The shared component library uses the "hgm-" CSS class prefix (hgm-tabs, hgm-card, hgm-badge, hgm-button). A single platform update to these components will propagate across all sites.'),
    p(''),
  );

  for (const fix of platformFixes) {
    children.push(
      heading2(fix.title),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [1800, 7560],
        rows: [
          new TableRow({ children: [
            dataCell('Impact', 1800, { fill: LIGHT_BLUE, bold: true }),
            dataCell(fix.impact, 7560, { color: fix.impact === 'CRITICAL' ? RED : ORANGE, bold: true }),
          ]}),
          new TableRow({ children: [
            dataCell('Sites Affected', 1800, { fill: LIGHT_BLUE, bold: true }),
            dataCell(fix.sites, 7560),
          ]}),
          new TableRow({ children: [
            dataCell('Pages Affected', 1800, { fill: LIGHT_BLUE, bold: true }),
            dataCell(fix.pagesAffected, 7560),
          ]}),
          new TableRow({ children: [
            dataCell('Effort', 1800, { fill: LIGHT_BLUE, bold: true }),
            dataCell(fix.effort, 7560),
          ]}),
        ],
      }),
      p(''),
      p('Issue:', { bold: true }),
      p(fix.description),
      p(''),
      p('Remediation:', { bold: true }),
      ...fix.fix.split('\n').map(line => line.startsWith('(') || line.match(/^\w+:/)
        ? bullet(line)
        : p(line)),
      p(''),
    );
  }

  // ── 4. Site-by-Site Breakdown ───────────────────────────────────────────────
  children.push(heading1('4. Site-by-Site Violation Breakdown', null, true));

  for (const site of sites) {
    children.push(
      heading2(`${site.name} — ${site.url}`),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2340, 2340, 2340, 2340],
        rows: [
          new TableRow({ tableHeader: true, children: [
            headerCell('Pages Scanned', 2340),
            headerCell('Critical', 2340, RED),
            headerCell('Serious', 2340, ORANGE),
            headerCell('Total Violations', 2340),
          ]}),
          new TableRow({ children: [
            dataCell(site.pages.toLocaleString(), 2340, { align: AlignmentType.CENTER }),
            dataCell(site.critical.toString(), 2340, { color: RED, bold: true, align: AlignmentType.CENTER }),
            dataCell(site.serious.toString(), 2340, { color: ORANGE, bold: true, align: AlignmentType.CENTER }),
            dataCell(site.violations.toString(), 2340, { bold: true, align: AlignmentType.CENTER }),
          ]}),
        ],
      }),
      p(''),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2200, 1000, 1000, 800, 4360],
        rows: [
          new TableRow({ tableHeader: true, children: [
            headerCell('Violation', 2200),
            headerCell('Impact', 1000),
            headerCell('WCAG', 1000),
            headerCell('Pages', 800),
            headerCell('Description', 4360),
          ]}),
          ...site.violations_detail.map((v, i) => new TableRow({
            children: [
              dataCell(v.id, 2200, { fill: i % 2 === 0 ? WHITE : LIGHT_GREY, size: 18 }),
              dataCell(v.impact, 1000, {
                fill: i % 2 === 0 ? WHITE : LIGHT_GREY,
                color: v.impact === 'CRITICAL' ? RED : ORANGE,
                bold: true, size: 18,
              }),
              dataCell(v.wcag, 1000, { fill: i % 2 === 0 ? WHITE : LIGHT_GREY, size: 18 }),
              dataCell(v.pages.toLocaleString(), 800, { fill: i % 2 === 0 ? WHITE : LIGHT_GREY, size: 18, align: AlignmentType.CENTER }),
              dataCell(v.help, 4360, { fill: i % 2 === 0 ? WHITE : LIGHT_GREY, size: 18 }),
            ],
          })),
        ],
      }),
      p(''),
    );
  }

  // ── 5. Phased Remediation Roadmap ───────────────────────────────────────────
  children.push(
    heading1('5. Phased Remediation Roadmap', null, true),
    p('Given the May 11, 2026 deadline (approximately 6 weeks from scan date), remediation must be sequenced to address the highest-impact issues first.'),
    p(''),

    heading2('Phase 1 — Immediate (Weeks 1–2): Platform Component Fixes'),
    p('These are single-point fixes that resolve violations across all sites simultaneously. They should be the absolute first priority.'),
    p(''),
    bullet('Fix hgm-tabs component: correct role="tablist" structure, fix aria-controls ID spaces', { bold: false }),
    bullet('Fix hgm-card component: add aria-label to card link anchors'),
    bullet('Fix hgm-badge component: wrap badge lists in proper <ul> element'),
    bullet('Fix autocomplete="disable" → autocomplete="off" in shared form component'),
    bullet('Add title attributes to all iframe embeds (YouTube, Vimeo, maps)'),
    bullet('Fix select-name: add labels to shared state/province dropdown component'),
    p(''),
    p('Estimated effort: 3–5 developer days. Impact: resolves violations on 1,000+ pages.', { italics: true, color: '555555' }),

    p(''),
    heading2('Phase 2 — Short Term (Weeks 2–4): Content and Design System'),
    bullet('Update CSS color palette to meet 4.5:1 contrast ratio (text) and 3:1 (large text/UI components)'),
    bullet('Add missing alt text to images — prioritize images without any alt attribute first'),
    bullet('Add aria-label to empty social sharing links and card links not covered by component fix'),
    bullet('Address site-specific violations (nested-interactive, scrollable-region-focusable, definition-list)'),
    bullet('Fix any error pages missing <title> and lang attributes (samc.com, stmaryshealthcaresystem.org, trinity-health.org)'),
    p(''),
    p('Estimated effort: 5–10 developer days + content team review. Impact: resolves color contrast across 13,500+ pages.', { italics: true, color: '555555' }),

    p(''),
    heading2('Phase 3 — Before Deadline (Weeks 4–6): Manual Testing and Documentation'),
    bullet('Conduct keyboard-only navigation testing on all sites'),
    bullet('Test with screen readers (NVDA + Chrome, VoiceOver + Safari) on key user flows: find a doctor, schedule appointment, contact us'),
    bullet('Review all video content for accurate captions (WCAG 1.2.2, 1.2.5)'),
    bullet('Test content reflow at 400% zoom (WCAG 1.4.10)'),
    bullet('Verify focus indicators are visible on all interactive elements (WCAG 2.4.7)'),
    bullet('Test all forms for proper error identification and suggestion (WCAG 3.3.1, 3.3.3)'),
    bullet('Document remediation completed for compliance records'),
    p(''),
    p('Estimated effort: 3–5 QA days per site + documentation.', { italics: true, color: '555555' }),

    p(''),
    heading2('Phase 4 — Ongoing'),
    bullet('All 19 sites have been scanned — maintain recurring monthly scans to catch regressions'),
    bullet('Update this plan as remediation work is completed and re-scans confirm fixes'),
    bullet('Establish recurring monthly scans to catch regressions'),
    bullet('Integrate accessibility checks into the CMS publishing workflow'),
  );

  // ── 6. Manual Testing Requirements ─────────────────────────────────────────
  children.push(
    heading1('6. Manual Testing Requirements', null, true),
    p('Automated scanners detect approximately 57% of WCAG 2.1 AA criteria. The following criteria require human review and cannot be assessed by any automated tool. These must be completed before the compliance deadline.'),
    p(''),
    new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [900, 3000, 800, 4660],
      rows: [
        new TableRow({ tableHeader: true, children: [
          headerCell('WCAG', 900),
          headerCell('Criterion', 3000),
          headerCell('Level', 800),
          headerCell('What to Check', 4660),
        ]}),
        ...[
          ['1.2.1', 'Audio-only & Video-only', 'A', 'All prerecorded audio/video has transcripts or audio descriptions'],
          ['1.2.2', 'Captions (Prerecorded)', 'A', 'Video captions are accurate and synchronized — not auto-generated only'],
          ['1.2.4', 'Captions (Live)', 'AA', 'Live video streams have real-time captions if applicable'],
          ['1.2.5', 'Audio Description', 'AA', 'Prerecorded video has audio descriptions of visual information'],
          ['1.3.3', 'Sensory Characteristics', 'A', 'No instructions rely solely on shape, color, or location (e.g. "click the red button")'],
          ['1.3.4', 'Orientation', 'AA', 'Content works in both portrait and landscape orientation'],
          ['1.4.1', 'Use of Color', 'A', 'Color is not the only means of conveying information (charts, required fields, errors)'],
          ['1.4.2', 'Audio Control', 'A', 'Audio that auto-plays >3 seconds has a mechanism to pause/stop'],
          ['1.4.4', 'Resize Text', 'AA', 'Text can be resized to 200% without loss of content or function'],
          ['1.4.5', 'Images of Text', 'AA', 'Images containing text are not used where CSS text could achieve the same result'],
          ['1.4.10', 'Reflow', 'AA', 'Content does not require horizontal scrolling at 320px width (400% zoom)'],
          ['1.4.12', 'Text Spacing', 'AA', 'Content remains readable with increased line height, letter/word spacing'],
          ['1.4.13', 'Content on Hover/Focus', 'AA', 'Tooltips/dropdowns on hover can be dismissed, hovered, and persist'],
          ['2.1.1', 'Keyboard', 'A', 'All functionality is accessible via keyboard alone'],
          ['2.1.2', 'No Keyboard Trap', 'A', 'Keyboard focus is never trapped in a component without an escape path'],
          ['2.2.1', 'Timing Adjustable', 'A', 'Time limits can be extended, turned off, or adjusted'],
          ['2.3.1', 'Three Flashes', 'A', 'No content flashes more than 3 times per second'],
          ['2.4.3', 'Focus Order', 'A', 'Focus order follows logical reading order'],
          ['2.4.5', 'Multiple Ways', 'AA', 'More than one way to navigate (search + sitemap + navigation)'],
          ['2.4.6', 'Headings and Labels', 'AA', 'Headings and labels are descriptive, not just decorative'],
          ['2.4.7', 'Focus Visible', 'AA', 'All keyboard-focusable elements have a visible focus indicator'],
          ['3.1.2', 'Language of Parts', 'AA', 'Passages in other languages are marked with lang attribute'],
          ['3.2.3', 'Consistent Navigation', 'AA', 'Navigation is in the same relative order across pages'],
          ['3.2.4', 'Consistent Identification', 'AA', 'Components with same function are identified consistently'],
          ['3.3.1', 'Error Identification', 'A', 'Form errors are identified in text, not just by color'],
          ['3.3.2', 'Labels or Instructions', 'A', 'All form inputs have visible labels or instructions'],
          ['3.3.3', 'Error Suggestion', 'AA', 'Error messages suggest how to correct the mistake'],
          ['3.3.4', 'Error Prevention', 'AA', 'Forms with legal/financial consequences have confirm/review step'],
        ].map(([id, title, level, check], i) => new TableRow({
          children: [
            dataCell(id, 900, { fill: i % 2 === 0 ? WHITE : LIGHT_GREY, size: 18 }),
            dataCell(title, 3000, { fill: i % 2 === 0 ? WHITE : LIGHT_GREY, size: 18 }),
            dataCell(level, 800, { fill: i % 2 === 0 ? WHITE : LIGHT_GREY, size: 18, align: AlignmentType.CENTER }),
            dataCell(check, 4660, { fill: i % 2 === 0 ? WHITE : LIGHT_GREY, size: 18 }),
          ],
        })),
      ],
    }),
  );

  // ── 7. Resources ─────────────────────────────────────────────────────────────
  children.push(
    heading1('7. Resources', null, true),
    heading2('Testing Tools'),
    bullet('axe DevTools (browser extension) — axe.deque.com'),
    bullet('WAVE Web Accessibility Evaluator — wave.webaim.org'),
    bullet('WebAIM Contrast Checker — webaim.org/resources/contrastchecker'),
    bullet('NVDA Screen Reader (Windows, free) — nvaccess.org'),
    bullet('VoiceOver (macOS/iOS, built-in) — System Settings > Accessibility'),
    bullet('Keyboard testing: unplug mouse and navigate using Tab, Shift+Tab, Enter, Space, arrow keys'),

    p(''),
    heading2('Reference Documents'),
    bullet('WCAG 2.1 specification — w3.org/TR/WCAG21'),
    bullet('HHS Section 504 final rule — federalregister.gov (search "HHS Section 504 2024")'),
    bullet('Accessible Rich Internet Applications (ARIA) spec — w3.org/TR/wai-aria'),
    bullet('axe-core rule descriptions — dequeuniversity.com/rules/axe'),

    p(''),
    heading2('About This Report'),
    p('This report was generated by the WCAG 2.1 AA Accessibility Scanner tool. Scans are saved locally and can be re-run at any time. This document will be updated as additional sites complete scanning and as remediation progresses. Future versions will track which violations have been resolved.'),
    p(''),
    p('GitHub repository: github.com/cpt-cheezbrgr/wcag-scanner', { italics: true, color: '777777' }),
  );

  // ─── Assemble Document ────────────────────────────────────────────────────
  return new Document({
    styles: {
      default: {
        document: { run: { font: 'Arial', size: 22 } },
      },
      paragraphStyles: [
        {
          id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 32, bold: true, font: 'Arial', color: NAVY },
          paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 0 },
        },
        {
          id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 26, bold: true, font: 'Arial', color: NAVY },
          paragraph: { spacing: { before: 220, after: 120 }, outlineLevel: 1 },
        },
        {
          id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 24, bold: true, font: 'Arial', color: '333333' },
          paragraph: { spacing: { before: 180, after: 80 }, outlineLevel: 2 },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: 'bullets',
          levels: [{
            level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          }],
        },
        {
          reference: 'numbers',
          levels: [{
            level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          }],
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: NAVY, space: 4 } },
            children: [
              new TextRun({ text: 'WCAG 2.1 AA Remediation Plan  |  Trinity Health Portfolio', font: 'Arial', size: 18, color: '555555' }),
            ],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            border: { top: { style: BorderStyle.SINGLE, size: 6, color: NAVY, space: 4 } },
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: 'Page ', font: 'Arial', size: 18, color: '555555' }),
              new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 18, color: '555555' }),
              new TextRun({ text: ' of ', font: 'Arial', size: 18, color: '555555' }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], font: 'Arial', size: 18, color: '555555' }),
            ],
          })],
        }),
      },
      children,
    }],
  });
}

// ─── Write file ───────────────────────────────────────────────────────────────
const outputPath = path.join(__dirname, '..', 'WCAG-Remediation-Plan.docx');
const doc = buildDoc();
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(outputPath, buf);
  console.log(`✓ Document written to: ${outputPath}`);
}).catch(err => {
  console.error('Failed to generate document:', err);
  process.exit(1);
});
