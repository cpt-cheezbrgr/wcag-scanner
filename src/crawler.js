/**
 * Multi-page BFS crawler.
 * Discovers internal links and emits pages to scan.
 */

import { EventEmitter } from 'events';

export class Crawler extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxDepth = options.maxDepth ?? 3;
    this.maxPages = options.maxPages ?? 50; // 0 = unlimited
    this.includePattern = options.includePattern ? new RegExp(options.includePattern) : null;
    this.excludePattern = options.excludePattern ? new RegExp(options.excludePattern) : null;
    this.respectRobots = options.respectRobots ?? true;

    this.visited = new Set();
    this.queue = []; // { url, depth }
    this.disallowed = new Set();
  }

  /**
   * Normalize a URL: remove fragments, optionally strip query strings.
   */
  normalizeUrl(rawUrl, baseUrl) {
    try {
      const resolved = new URL(rawUrl, baseUrl);
      // Strip fragment
      resolved.hash = '';
      // Normalize trailing slash for root only
      return resolved.href;
    } catch {
      return null;
    }
  }

  /**
   * Check if a URL belongs to the same origin as the start URL.
   */
  isSameOrigin(url, origin) {
    try {
      return new URL(url).origin === origin;
    } catch {
      return false;
    }
  }

  /**
   * Fetch and parse robots.txt for disallowed paths.
   */
  async loadRobotsTxt(startUrl) {
    if (!this.respectRobots) return;
    try {
      const { origin } = new URL(startUrl);
      const robotsUrl = `${origin}/robots.txt`;
      const resp = await fetch(robotsUrl, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) return;
      const text = await resp.text();
      let capturing = false;
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (/^user-agent:\s*\*/i.test(trimmed)) { capturing = true; continue; }
        if (/^user-agent:/i.test(trimmed)) { capturing = false; continue; }
        if (capturing && /^disallow:/i.test(trimmed)) {
          const path = trimmed.replace(/^disallow:\s*/i, '').trim();
          if (path) this.disallowed.add(path);
        }
      }
    } catch {
      // robots.txt is optional
    }
  }

  isDisallowed(url) {
    if (!this.respectRobots || this.disallowed.size === 0) return false;
    const path = new URL(url).pathname;
    for (const disallowedPath of this.disallowed) {
      if (path.startsWith(disallowedPath)) return true;
    }
    return false;
  }

  shouldCrawl(url, origin) {
    if (!this.isSameOrigin(url, origin)) return false;
    if (this.isDisallowed(url)) return false;
    if (this.includePattern && !this.includePattern.test(url)) return false;
    if (this.excludePattern && this.excludePattern.test(url)) return false;
    // Skip non-HTML resources
    if (/\.(pdf|jpg|jpeg|png|gif|svg|webp|css|js|json|xml|zip|doc|docx|xls|xlsx|ppt|pptx|mp4|mp3|wav|woff|woff2|ttf|ico)(\?|$)/i.test(url)) return false;
    return true;
  }

  /**
   * Extract links from a Playwright page object.
   */
  async extractLinks(page, baseUrl) {
    const hrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
    );
    const origin = new URL(baseUrl).origin;
    const links = [];
    for (const href of hrefs) {
      const normalized = this.normalizeUrl(href, baseUrl);
      if (!normalized) continue;
      if (!this.shouldCrawl(normalized, origin)) continue;
      if (!this.visited.has(normalized)) links.push(normalized);
    }
    return [...new Set(links)];
  }

  /**
   * Main crawl loop. Accepts a Playwright browser instance and a scan function.
   * scanFn signature: async (url, browser, options) => pageResult
   * pageResult must include extractedLinks[] when options.origin is passed.
   * @param {string} startUrl
   * @param {Function} scanFn
   * @param {object} browser - Playwright browser
   * @returns {Array} all page results
   */
  async crawl(startUrl, scanFn, browser) {
    const normalizedStart = this.normalizeUrl(startUrl, startUrl);
    if (!normalizedStart) throw new Error(`Invalid start URL: ${startUrl}`);

    const origin = new URL(normalizedStart).origin;
    await this.loadRobotsTxt(normalizedStart);

    this.queue = [{ url: normalizedStart, depth: 0 }];
    this.visited.add(normalizedStart);

    const results = [];
    // In unlimited mode treat depth as effectively infinite
    const effectiveMaxDepth = this.maxPages === 0 ? Infinity : this.maxDepth;

    while (this.queue.length > 0 && (this.maxPages === 0 || results.length < this.maxPages)) {
      const { url, depth } = this.queue.shift();

      this.emit('page:start', { url, depth, index: results.length + 1, total: this.visited.size });

      // Run the accessibility scan. Also extract links from the same page load
      // (no separate navigation — avoids double-load and networkidle timeout issues).
      const shouldExtract = depth < effectiveMaxDepth;
      const pageResult = await scanFn(url, browser, { origin: shouldExtract ? origin : null });
      results.push(pageResult);

      this.emit('page:done', {
        url,
        depth,
        index: results.length,
        violations: pageResult.axe?.violations?.length ?? 0,
        heuristics: pageResult.heuristics?.length ?? 0,
        error: pageResult.error,
      });

      // Enqueue newly discovered internal links
      if (shouldExtract && pageResult.extractedLinks?.length) {
        for (const rawLink of pageResult.extractedLinks) {
          const normalized = this.normalizeUrl(rawLink, url);
          if (!normalized) continue;
          if (!this.shouldCrawl(normalized, origin)) continue;
          if (this.visited.has(normalized)) continue;
          this.visited.add(normalized);
          this.queue.push({ url: normalized, depth: depth + 1 });
        }
      }
    }

    this.emit('done', { total: results.length });
    return results;
  }
}
