/**
 * Core WCAG 2.1 AA scanner — runs axe-core + custom heuristic checks via Playwright.
 */

import { AxeBuilder } from '@axe-core/playwright';
import { chromium } from 'playwright';

// WCAG 2.1 AA criteria that require manual review (cannot be fully automated)
export const MANUAL_REVIEW_CRITERIA = [
  {
    id: '1.2.1',
    title: 'Audio-only and Video-only (Prerecorded)',
    description: 'Provide alternatives for time-based media. Check all prerecorded audio-only and video-only content for transcripts or audio descriptions.',
    level: 'A',
  },
  {
    id: '1.2.2',
    title: 'Captions (Prerecorded)',
    description: 'Verify all prerecorded video content with audio has accurate synchronized captions. Auto-detect flags video elements, but caption accuracy requires human review.',
    level: 'A',
  },
  {
    id: '1.2.3',
    title: 'Audio Description or Media Alternative (Prerecorded)',
    description: 'Check that prerecorded video content has audio descriptions or a text alternative describing visual information.',
    level: 'A',
  },
  {
    id: '1.2.4',
    title: 'Captions (Live)',
    description: 'Verify live video content with audio has real-time captions. Only applicable if the site streams live content.',
    level: 'AA',
  },
  {
    id: '1.2.5',
    title: 'Audio Description (Prerecorded)',
    description: 'Verify prerecorded video content has audio descriptions for all significant visual information not conveyed in the main audio track.',
    level: 'AA',
  },
  {
    id: '1.3.3',
    title: 'Sensory Characteristics',
    description: 'Check that instructions do not rely solely on shape, color, size, visual location, orientation, or sound (e.g., "click the round button" or "see the diagram on the right").',
    level: 'A',
  },
  {
    id: '1.3.4',
    title: 'Orientation',
    description: 'Test that content does not restrict its view and operation to a single display orientation unless essential.',
    level: 'AA',
  },
  {
    id: '1.3.5',
    title: 'Identify Input Purpose',
    description: 'Verify form fields that collect personal information use appropriate autocomplete attributes (e.g., autocomplete="email", "name", "tel").',
    level: 'AA',
  },
  {
    id: '1.4.1',
    title: 'Use of Color',
    description: 'Verify color is not the only visual means of conveying information (e.g., required fields marked only by red color, charts without patterns).',
    level: 'A',
  },
  {
    id: '1.4.2',
    title: 'Audio Control',
    description: 'Check that any audio playing automatically for more than 3 seconds has a mechanism to pause, stop, or control volume.',
    level: 'A',
  },
  {
    id: '1.4.5',
    title: 'Images of Text',
    description: 'Verify that images containing text (other than logos) are not used where real text could achieve the same visual presentation.',
    level: 'AA',
  },
  {
    id: '1.4.10',
    title: 'Reflow',
    description: 'Test that content does not require horizontal scrolling at 320px width (400% zoom on 1280px display). Check by zooming browser to 400%.',
    level: 'AA',
  },
  {
    id: '1.4.12',
    title: 'Text Spacing',
    description: 'Test by overriding CSS: line-height ≥1.5x, letter-spacing ≥0.12em, word spacing ≥0.16em, paragraph spacing ≥2x. Content and functionality should remain intact.',
    level: 'AA',
  },
  {
    id: '1.4.13',
    title: 'Content on Hover or Focus',
    description: 'Verify that content appearing on hover/focus (tooltips, dropdowns) is dismissible, hoverable, and persistent.',
    level: 'AA',
  },
  {
    id: '2.1.2',
    title: 'No Keyboard Trap',
    description: 'Manually navigate with Tab key through the entire page to verify focus never gets trapped in a component without a way to escape.',
    level: 'A',
  },
  {
    id: '2.2.1',
    title: 'Timing Adjustable',
    description: 'If any time limits exist, verify users can turn off, adjust, or extend them (e.g., session timeouts, auto-refreshing content).',
    level: 'A',
  },
  {
    id: '2.2.2',
    title: 'Pause, Stop, Hide',
    description: 'Check that any moving, blinking, scrolling, or auto-updating content can be paused, stopped, or hidden by the user.',
    level: 'A',
  },
  {
    id: '2.3.1',
    title: 'Three Flashes or Below Threshold',
    description: 'Check that no content flashes more than 3 times per second, or verify flashing is below general and red flash thresholds.',
    level: 'A',
  },
  {
    id: '2.4.3',
    title: 'Focus Order',
    description: 'Tab through the page in order; verify focus moves in a sequence that preserves meaning and operability (generally top-to-bottom, left-to-right).',
    level: 'A',
  },
  {
    id: '2.4.5',
    title: 'Multiple Ways',
    description: 'Verify there are multiple ways to locate pages (e.g., site search, site map, navigation links, related links).',
    level: 'AA',
  },
  {
    id: '2.4.6',
    title: 'Headings and Labels',
    description: 'Review all headings and form labels to verify they are descriptive and accurately describe their associated content or purpose.',
    level: 'AA',
  },
  {
    id: '2.4.7',
    title: 'Focus Visible',
    description: 'Tab through all interactive elements and verify each has a clearly visible focus indicator (not removed via outline:none without a replacement).',
    level: 'AA',
  },
  {
    id: '2.5.1',
    title: 'Pointer Gestures',
    description: 'Verify that all functionality using multipoint or path-based gestures (pinch, swipe) can also be operated with a single pointer.',
    level: 'A',
  },
  {
    id: '2.5.2',
    title: 'Pointer Cancellation',
    description: 'Verify that single-pointer actions can be aborted or undone, and that down-events are not used to execute functionality.',
    level: 'A',
  },
  {
    id: '2.5.3',
    title: 'Label in Name',
    description: 'Check that visible labels on controls are included in or match the accessible name (e.g., a button labeled "Submit" should not have aria-label="Send").',
    level: 'A',
  },
  {
    id: '2.5.4',
    title: 'Motion Actuation',
    description: 'Verify functionality triggered by device motion (shake, tilt) can also be operated via UI controls, and motion response can be disabled.',
    level: 'A',
  },
  {
    id: '3.1.2',
    title: 'Language of Parts',
    description: 'Check that passages in a different language than the page have the lang attribute set on their containing element.',
    level: 'AA',
  },
  {
    id: '3.2.1',
    title: 'On Focus',
    description: 'Verify that focusing on any component does not automatically trigger a context change (e.g., no auto-submit on focus, no unexpected navigation).',
    level: 'A',
  },
  {
    id: '3.2.2',
    title: 'On Input',
    description: 'Verify that changing a form field\'s value does not automatically cause a context change unless users are informed beforehand.',
    level: 'A',
  },
  {
    id: '3.2.3',
    title: 'Consistent Navigation',
    description: 'Verify that navigation menus appearing on multiple pages are in the same relative order each time they appear.',
    level: 'AA',
  },
  {
    id: '3.2.4',
    title: 'Consistent Identification',
    description: 'Check that components with the same function are identified consistently (e.g., search icons always have the same label).',
    level: 'AA',
  },
  {
    id: '3.3.3',
    title: 'Error Suggestion',
    description: 'Verify that when input errors are detected, suggestions for correction are provided (e.g., "Please enter a valid email address like name@example.com").',
    level: 'AA',
  },
  {
    id: '3.3.4',
    title: 'Error Prevention (Legal, Financial, Data)',
    description: 'For pages that submit legal, financial, or data transactions: verify submissions are reversible, checked for errors, and/or confirmable before final submission.',
    level: 'AA',
  },
];

// Custom heuristic checks that supplement axe-core
async function runHeuristicChecks(page, url) {
  const findings = await page.evaluate(() => {
    const results = [];

    // 1.2.2 / 1.2.5 — Video elements without tracks
    const videos = document.querySelectorAll('video');
    videos.forEach((video, i) => {
      const tracks = video.querySelectorAll('track[kind="captions"], track[kind="subtitles"]');
      const src = video.src || video.querySelector('source')?.src || `video #${i + 1}`;
      if (tracks.length === 0) {
        results.push({
          type: 'heuristic',
          wcagCriteria: ['1.2.2', '1.2.5'],
          impact: 'serious',
          title: 'Video missing captions track',
          description: 'This <video> element has no <track kind="captions"> or <track kind="subtitles"> element. Prerecorded video with audio must have captions.',
          remediation: 'Add a <track kind="captions" src="captions.vtt" srclang="en" label="English"> element inside the <video> tag. Alternatively use a video platform that supports closed captions.',
          element: video.outerHTML.substring(0, 200),
          needsManualReview: true,
          manualNote: 'Even with a <track> element, verify that captions are accurate, synchronized, and complete.',
        });
      }
    });

    // 1.2.1 — Audio elements without transcripts (heuristic: no nearby text with transcript)
    const audios = document.querySelectorAll('audio');
    audios.forEach((audio, i) => {
      const tracks = audio.querySelectorAll('track');
      results.push({
        type: 'heuristic',
        wcagCriteria: ['1.2.1'],
        impact: 'serious',
        title: 'Audio element detected — verify transcript provided',
        description: 'An <audio> element was found. Prerecorded audio-only content requires a text transcript.',
        remediation: 'Provide a text transcript of all spoken content and relevant sounds near the audio player or via a clearly linked page.',
        element: audio.outerHTML.substring(0, 200),
        needsManualReview: true,
        manualNote: 'Manually verify a text transcript is available and complete for this audio content.',
      });
    });

    // 2.2.2 — Auto-playing / animated content
    const autoplay = document.querySelectorAll('video[autoplay], audio[autoplay]');
    autoplay.forEach(el => {
      results.push({
        type: 'heuristic',
        wcagCriteria: ['1.4.2', '2.2.2'],
        impact: 'serious',
        title: 'Auto-playing media detected',
        description: 'Media with autoplay attribute found. Auto-playing audio/video can be disorienting for screen reader users and people with cognitive disabilities.',
        remediation: 'Remove the autoplay attribute, or ensure the content plays for less than 3 seconds, or provide a clearly visible pause/stop/mute control at the top of the page.',
        element: el.outerHTML.substring(0, 200),
        needsManualReview: false,
      });
    });

    // 1.3.5 — Form inputs missing autocomplete
    const personalInputTypes = ['email', 'tel', 'url', 'text'];
    const personalInputNames = /name|first|last|given|family|email|phone|tel|address|city|state|zip|postal|country|birth|dob|sex|gender|cc|card|cvv|expir/i;
    const inputs = document.querySelectorAll('input, textarea');
    inputs.forEach(input => {
      const type = input.type || 'text';
      const name = (input.name || input.id || input.placeholder || '').toLowerCase();
      if (personalInputTypes.includes(type) && personalInputNames.test(name) && !input.autocomplete) {
        results.push({
          type: 'heuristic',
          wcagCriteria: ['1.3.5'],
          impact: 'moderate',
          title: 'Form input may be missing autocomplete attribute',
          description: `Input field "${input.name || input.id || input.placeholder}" appears to collect personal information but has no autocomplete attribute.`,
          remediation: 'Add an appropriate autocomplete attribute (e.g., autocomplete="email", autocomplete="name", autocomplete="tel") to help users with cognitive disabilities and assistive technologies.',
          element: input.outerHTML.substring(0, 300),
          needsManualReview: true,
          manualNote: 'Verify if this field collects personal data and apply the correct autocomplete token from the HTML spec.',
        });
      }
    });

    // 2.4.1 — Skip to main content link
    const allLinks = Array.from(document.querySelectorAll('a'));
    const skipLinks = allLinks.filter(a => {
      const href = a.href || '';
      const text = a.textContent.toLowerCase().trim();
      return (href.includes('#main') || href.includes('#content') || href.includes('#skip')) ||
             (text.includes('skip') && (text.includes('main') || text.includes('content') || text.includes('navigation')));
    });
    if (skipLinks.length === 0) {
      results.push({
        type: 'heuristic',
        wcagCriteria: ['2.4.1'],
        impact: 'moderate',
        title: 'No skip navigation link detected',
        description: 'No "Skip to main content" link was found. Keyboard and screen reader users must tab through all navigation on every page without a skip link.',
        remediation: 'Add a skip link as the first focusable element: <a href="#main-content" class="skip-link">Skip to main content</a>. Style it to be visible on focus.',
        element: null,
        needsManualReview: true,
        manualNote: 'Verify the skip link is the first element reached by keyboard and that it works correctly.',
      });
    }

    // PDF links — flag for accessibility review
    const pdfLinks = allLinks.filter(a => /\.pdf(\?|#|$)/i.test(a.href));
    if (pdfLinks.length > 0) {
      results.push({
        type: 'heuristic',
        wcagCriteria: ['1.1.1', '1.3.1'],
        impact: 'moderate',
        title: `${pdfLinks.length} PDF link(s) detected — require accessibility audit`,
        description: 'PDF files require separate accessibility testing. PDFs must have proper tagging, reading order, alt text for images, and document structure.',
        remediation: 'Run PDFs through Adobe Acrobat\'s accessibility checker or axe PDF. Ensure all PDFs are tagged, have a document title, logical reading order, and alt text for images.',
        element: pdfLinks.slice(0, 3).map(a => a.outerHTML).join('\n'),
        needsManualReview: true,
        manualNote: 'Open each PDF and run the built-in accessibility check. Test with a screen reader.',
      });
    }

    // iframe content
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach(frame => {
      if (!frame.title || frame.title.trim() === '') {
        results.push({
          type: 'heuristic',
          wcagCriteria: ['4.1.2'],
          impact: 'serious',
          title: 'iframe missing title attribute',
          description: 'An <iframe> element has no title attribute. Screen readers cannot identify the purpose of untitled iframes.',
          remediation: 'Add a descriptive title attribute: <iframe title="Payment form" ...>',
          element: frame.outerHTML.substring(0, 200),
          needsManualReview: false,
        });
      }
    });

    // outline:none on focusable elements (2.4.7 — focus visible)
    const focusable = document.querySelectorAll('a, button, input, select, textarea, [tabindex]');
    let outlineNoneCount = 0;
    focusable.forEach(el => {
      const style = window.getComputedStyle(el);
      if (style.outline === 'none' || style.outlineStyle === 'none' || style.outlineWidth === '0px') {
        outlineNoneCount++;
      }
    });
    if (outlineNoneCount > 0) {
      results.push({
        type: 'heuristic',
        wcagCriteria: ['2.4.7'],
        impact: 'serious',
        title: `${outlineNoneCount} focusable element(s) may have focus outline suppressed`,
        description: 'Focusable elements with outline:none make keyboard focus invisible, blocking keyboard-only users from knowing where they are on the page.',
        remediation: 'Remove outline:none or replace with a custom visible focus style using outline, box-shadow, or border with sufficient contrast.',
        element: null,
        needsManualReview: true,
        manualNote: 'Tab through the page to visually verify every interactive element shows a clearly visible focus indicator.',
      });
    }

    // Images with empty or missing alt — reinforce with context
    const imgs = document.querySelectorAll('img:not([alt])');
    imgs.forEach(img => {
      results.push({
        type: 'heuristic',
        wcagCriteria: ['1.1.1'],
        impact: 'critical',
        title: 'Image missing alt attribute entirely',
        description: 'Image has no alt attribute at all. Screen readers may read the file name instead.',
        remediation: 'Add alt="" for decorative images, or a descriptive alt text for informative images.',
        element: img.outerHTML.substring(0, 200),
        needsManualReview: false,
      });
    });

    // Check for text contrast issues via inline styles (supplement axe)
    // Detect elements with very light text color explicitly set
    const lightColorPattern = /color:\s*(#f[0-9a-f]{5}|#[0-9a-f]{3}|white|rgba?\s*\(\s*2[5-9]\d|rgba?\s*\(\s*[3-9]\d{2})/i;
    document.querySelectorAll('[style]').forEach(el => {
      if (lightColorPattern.test(el.getAttribute('style') || '') && el.textContent.trim().length > 0) {
        results.push({
          type: 'heuristic',
          wcagCriteria: ['1.4.3'],
          impact: 'serious',
          title: 'Potential low-contrast text via inline style',
          description: 'An element uses a light inline color style that may not meet the 4.5:1 contrast ratio requirement.',
          remediation: 'Use a contrast checker (e.g., WebAIM Contrast Checker) to verify the text/background ratio is at least 4.5:1 for normal text or 3:1 for large text (18pt+ or 14pt+ bold).',
          element: el.outerHTML.substring(0, 200),
          needsManualReview: true,
          manualNote: 'Verify actual contrast ratio using browser DevTools color picker or a dedicated contrast analysis tool.',
        });
      }
    });

    return results;
  });

  return findings;
}

/**
 * Scan a single page for WCAG 2.1 AA violations.
 * @param {string} url
 * @param {object} browser - Playwright browser instance (reuse across pages)
 * @returns {object} scan result for this page
 */
export async function scanPage(url, browser) {
  const context = await browser.newContext({
    userAgent: 'WCAG-Scanner/1.0 (Accessibility Audit Tool)',
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  let axeResults = null;
  let heuristicResults = [];
  let pageTitle = '';
  let error = null;

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    pageTitle = await page.title();

    // Run axe-core with all WCAG 2.1 A + AA tags
    axeResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    // Run custom heuristic checks
    heuristicResults = await runHeuristicChecks(page, url);
  } catch (err) {
    error = err.message;
  } finally {
    await context.close();
  }

  return {
    url,
    pageTitle,
    scannedAt: new Date().toISOString(),
    error,
    axe: axeResults
      ? {
          violations: axeResults.violations,
          incomplete: axeResults.incomplete,
          passes: axeResults.passes,
          inapplicable: axeResults.inapplicable,
        }
      : null,
    heuristics: heuristicResults,
  };
}

/**
 * Create and return a shared browser instance.
 */
export async function createBrowser(headless = true) {
  return chromium.launch({ headless });
}
