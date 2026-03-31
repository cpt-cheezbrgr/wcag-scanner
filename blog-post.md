# We Built an Accessibility Scanner to Meet the May 2026 Federal Deadline — Here's How

Healthcare organizations across the country are facing a hard deadline. The U.S. Department of Health and Human Services finalized a rule under Section 504 of the Rehabilitation Act requiring that any healthcare organization receiving federal funding — think Medicare and Medicaid — must make their websites and digital services conform to **WCAG 2.1 Level AA** accessibility standards by **May 11, 2026**.

For large organizations with dozens of websites and thousands of pages, that raises an immediate and practical question: *where do we even start?*

That question is what led us to build the WCAG 2.1 AA Accessibility Scanner.

---

## Why Existing Tools Weren't Enough

There are plenty of accessibility checkers out there. Browser extensions like axe DevTools or WAVE let you inspect a single page at a time. That works fine for a five-page marketing site. It does not work for a healthcare system with ten regional hospital websites, each containing thousands of pages of physician directories, service listings, patient resources, and blog content.

We needed something that could:

- Crawl an **entire website automatically**, following links the way a user would
- Scan **every page** for WCAG violations, not just the homepage
- **Persist results** across sessions so an overnight scan doesn't disappear if the server hiccups
- Generate **actionable reports** that a developer or content team could actually use

So we built it.

---

## What It Does

The scanner is a Node.js application with two interfaces: a web UI you run locally in your browser, and a command-line tool for scripting and automation.

You give it a URL. It launches a headless Chromium browser, loads the page, and runs the industry-standard **axe-core accessibility engine** against it — the same engine used by Deque, Microsoft, and Google in their own accessibility tooling. Then it collects every link on the page, adds them to a queue, and repeats the process across the entire site using a breadth-first crawl.

On top of automated rule scanning, we added **custom heuristic checks** that go beyond what axe-core catches on its own: videos without captions, audio set to autoplay, missing skip navigation links, iframes without titles, forms missing autocomplete attributes, and CSS that suppresses focus outlines.

As each page is scanned, results are written to disk in real time. If a scan runs overnight and the server is interrupted, the results up to that point are preserved and the scan can be resumed. For large sites — we've scanned sites with 4,000+ pages — this kind of fault tolerance isn't a nice-to-have, it's essential.

When the scan completes, the tool generates a standalone HTML report with:

- A summary of all violations ranked by severity (Critical, Serious, Moderate, Minor)
- A WCAG 2.1 AA criteria grid showing pass/fail status across all 50 success criteria
- A manual review checklist for the roughly 43% of criteria that no automated tool can assess
- Specific remediation guidance for each violation, including the affected HTML

---

## How It Was Built

The tech stack is deliberately straightforward:

- **Playwright** drives the headless Chromium browser, loading pages exactly as a real user would — JavaScript executed, dynamic content rendered
- **axe-core** (via @axe-core/playwright) runs the accessibility analysis on each loaded page
- **Express.js** serves the web UI and REST API
- **Server-Sent Events** stream live scan progress to the browser so you can watch pages being scanned in real time
- **Node.js** ties it all together, with scan results saved locally as JSON and HTML

One of the trickier engineering challenges was scale. axe-core returns detailed data for every rule it checks on every page — including full HTML node details for every passing rule. For a 2,000-page site, that data ballooned into 200–500MB JSON files that would crash Node.js before they could be saved. We solved this by trimming pass node details before storage (the report only needs rule IDs, not full HTML snippets), which brought typical report sizes down from hundreds of megabytes to under 20MB.

Another challenge was deduplication. Marketing links often include UTM tracking parameters — `?utm_source=email&utm_campaign=spring` — that make the same page look like dozens of unique URLs. We added query string stripping so the crawler treats these as the same page, preventing inflated page counts and redundant scans.

The entire project lives on GitHub: [github.com/cpt-cheezbrgr/wcag-scanner](https://github.com/cpt-cheezbrgr/wcag-scanner)

---

## What We Found

Running the scanner across six healthcare websites — spanning nearly 17,000 pages — surfaced a clear pattern. The most widespread issue by far was **color contrast**: text and interactive elements that don't meet the 4.5:1 contrast ratio required by WCAG 1.4.3. This affected virtually every page on every site.

The second major finding was that many violations traced back to **shared CMS components** — the same tab widget, card component, and badge element appearing across all sites with the same ARIA errors. The implication is significant: fix the component once at the platform level, and the violation disappears across thousands of pages simultaneously.

We also found consistent issues with embedded YouTube players (which inject inaccessible buttons), iframes missing title attributes, and images without alt text.

---

## What's Next

The scanner is under active development. Scans for additional sites are in progress, and we're generating remediation plans from the data to prioritize fixes before the May 11 deadline.

If you're a healthcare organization still figuring out where you stand on WCAG compliance, the clock is running. Automated scanning is the fastest way to get a baseline — and it's a starting point, not a finish line. About 43% of WCAG criteria still require human review. But knowing where the automated violations are lets you direct that human effort where it matters most.

The deadline is real. The work is doable. Start scanning.
