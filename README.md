# WCAG 2.1 AA Accessibility Scanner

A multi-page website accessibility scanner built for HHS Section 504 compliance. Scans entire websites for WCAG 2.1 Level AA violations and generates detailed reports with remediation guidance. Operates as both a web application and a command-line tool.

---

## Why This Was Built

The U.S. Department of Health and Human Services (HHS) issued a final rule under Section 504 of the Rehabilitation Act requiring healthcare organizations that receive federal funding to make their websites and digital services conform to **WCAG 2.1 Level AA** accessibility standards.

**Compliance deadlines:**
- Large recipients (25+ employees): **May 11, 2026**
- Small recipients: **May 11, 2027**

Non-compliance can result in loss of federal funding and civil rights liability. This tool was built to help healthcare organizations identify accessibility violations across their entire web presence before the deadline, prioritize remediation work, and produce documentation of their compliance efforts.

---

## How It Works

The scanner combines three complementary approaches to test accessibility:

**1. Automated rule scanning (axe-core)**
Uses the industry-standard axe-core engine to test each page against machine-checkable WCAG 2.1 AA rules — things like missing image alt text, insufficient color contrast, form fields without labels, and invalid ARIA attributes.

**2. Heuristic checks**
Custom-written checks that go beyond what axe-core catches: videos without captions, audio elements set to autoplay, missing skip navigation links, PDFs linked from the page, iframes without titles, CSS that suppresses focus outlines, and form fields collecting personal information without proper autocomplete attributes.

**3. Manual review checklist**
34 WCAG 2.1 AA criteria cannot be reliably tested by any automated tool (e.g., whether captions are accurate, whether content makes logical sense, whether timing controls exist). The HTML report includes a manual review checklist covering all of these with specific guidance on what a human reviewer should check.

**Multi-page crawling**
The scanner follows links across an entire website using breadth-first search (BFS), scanning every reachable internal page. It respects `robots.txt`, stays within the same domain, skips non-HTML resources (PDFs, images, etc.), and supports configurable depth and page limits.

---

## Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Browser automation | [Playwright](https://playwright.dev/) | Headless Chromium — loads pages as a real browser |
| Accessibility engine | [axe-core](https://github.com/dequelabs/axe-core) / [@axe-core/playwright](https://github.com/dequelabs/axe-core-playwright) | Industry-standard WCAG rule testing |
| Web server | [Express.js](https://expressjs.com/) | REST API + serves the web UI |
| Real-time progress | Server-Sent Events (SSE) | Streams scan progress to the browser live |
| CLI framework | [Commander.js](https://github.com/tj/commander.js) | Command-line interface and argument parsing |
| CLI output | [Chalk](https://github.com/chalk/chalk) + [Ora](https://github.com/sindresorhus/ora) | Colored terminal output and spinners |
| Report IDs | [uuid](https://github.com/uuidjs/uuid) | Unique scan job identifiers |
| Runtime | Node.js (ES Modules) | Server and CLI runtime |

---

## Project Structure

```
wcag-scanner/
├── src/
│   ├── server.js       — Express web server, REST API, SSE, report saving
│   ├── scanner.js      — Core page scanner (axe-core + heuristics)
│   ├── crawler.js      — BFS multi-page crawler
│   ├── reporter.js     — HTML and JSON report generator
│   └── cli.js          — Command-line interface
├── public/
│   ├── index.html      — Web UI
│   └── app.js          — Frontend JavaScript
├── scripts/
│   └── start.js        — Auto-restart server launcher
├── reports/            — Saved scan reports (auto-created, git-ignored)
└── package.json
```

---

## Setup and Installation

**Requirements:** Node.js 18 or later

```bash
# 1. Clone the repository
git clone https://github.com/cpt-cheezbrgr/wcag-scanner.git
cd wcag-scanner

# 2. Install dependencies
npm install

# 3. Install the Playwright browser (Chromium)
npx playwright install chromium

# 4. Start the web server
npm start
```

The server starts on **http://localhost:3000**.

---

## Using the Web UI

Navigate to **http://localhost:3000** in your browser.

### Starting a Scan

1. Enter the full URL of the website to scan (e.g., `https://www.example.com`)
2. Set **Crawl Depth** — how many link-levels deep to follow (1–10). Depth 3 means: the start page, pages linked from it, and pages linked from those.
3. Set **Max Pages to Scan** — a cap on total pages (up to 500), or check **Scan all pages (no limit)** to crawl the entire site
4. Optionally expand **Advanced Options** to set include/exclude URL patterns or disable robots.txt compliance
5. Click **Start Accessibility Scan**

### During a Scan

The progress panel shows each page as it is scanned, with a live count of violations found. For unlimited scans, an animated progress bar indicates the scan is running. Results are saved to disk every 10 pages so they are not lost if the server is interrupted.

### Viewing Reports

Completed scans appear in the **Past Reports** sidebar on the left. Click any report to load it in the main panel. Reports are saved permanently to the `reports/` directory and persist across server restarts.

To delete a report, click the **×** button on any past report entry.

### Restarting the Server

The **Restart Server** button in the header restarts the Node.js server process (useful after updates). The page will automatically reconnect once the server is back up.

---

## Using the CLI

The CLI is useful for scripting scans or integrating into automated workflows.

```bash
npm run scan -- scan <url> [options]
```

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `-d, --depth <n>` | `3` | Maximum crawl depth |
| `-m, --max-pages <n>` | `50` | Max pages to scan (`0` = unlimited) |
| `-o, --output <dir>` | `./reports` | Directory to save reports |
| `-f, --format <fmt>` | `html` | Report format: `html`, `json`, or `both` |
| `--no-robots` | — | Ignore robots.txt restrictions |
| `--include <pattern>` | — | Only crawl URLs matching this regex |
| `--exclude <pattern>` | — | Skip URLs matching this regex |
| `--open` | — | Open HTML report in browser when done |

### Examples

```bash
# Scan up to 50 pages, 3 levels deep
npm run scan -- scan https://www.example.com

# Scan entire site with no page limit
npm run scan -- scan https://www.example.com --max-pages 0

# Scan only the /services section, save JSON + HTML
npm run scan -- scan https://www.example.com --include "/services" --format both

# Scan 100 pages, ignore robots.txt, open report when done
npm run scan -- scan https://www.example.com --max-pages 100 --no-robots --open
```

---

## Understanding the Reports

### Compliance Score

The automated compliance score reflects what percentage of testable WCAG 2.1 AA criteria passed automated checks. **This score does not represent full compliance** — approximately 40% of WCAG criteria require human judgment and are listed in the Manual Review Checklist within the report.

### Violation Severity

| Level | Meaning |
|-------|---------|
| **Critical** | Blocks access entirely for users with disabilities |
| **Serious** | Significant barrier — must be fixed |
| **Moderate** | Meaningful difficulty — should be fixed |
| **Minor** | Low impact — fix when possible |

### WCAG Criteria Grid

The HTML report includes a grid showing the pass/fail/manual status of all 50 WCAG 2.1 AA success criteria, so you can see at a glance which areas need attention.

### Manual Review Checklist

34 criteria that cannot be automated are listed with specific guidance on what to check — for example: verifying caption accuracy on videos, confirming content does not require horizontal scrolling at 400% zoom, checking that error messages identify the field with the error.

---

## Report Files

Reports are saved to the `reports/` directory as:
- `{domain}_{timestamp}.html` — Human-readable report, standalone (no external dependencies)
- `{domain}_{timestamp}.json` — Machine-readable data for programmatic use or archiving

The `reports/` directory is excluded from git (`.gitignore`) so scan data stays local and does not get committed to the repository.

---

## Configuration Reference

### Crawl Depth vs. Max Pages

These two settings work together:

- **Depth** controls how far from the start URL the crawler will follow links. Depth 1 = only the start page. Depth 2 = start page + pages it links to. Depth 3 = one more level, etc.
- **Max Pages** is a hard cap on total pages regardless of depth. The crawler stops whichever limit is hit first.
- Setting Max Pages to `0` (or checking "Scan all pages") removes the page cap entirely and sets depth to unlimited as well.

### robots.txt

By default the scanner respects `robots.txt` disallow rules. Disable this with `--no-robots` (CLI) or the **Ignore robots.txt** checkbox in Advanced Options (web UI).

### URL Patterns (Advanced)

Use regex patterns to constrain the crawl:
- **Include pattern**: only follow links whose URL matches this pattern (e.g., `/services|/about`)
- **Exclude pattern**: skip URLs matching this pattern (e.g., `/blog|/news`)

---

## Limitations

- **Dynamic content**: Pages that require user login, or that load content via JavaScript after significant delay, may not be fully scanned.
- **Automation gap**: No automated tool can test 100% of WCAG criteria. This scanner covers approximately 57% of WCAG 2.1 AA criteria automatically. A full compliance assessment requires manual testing.
- **Caption accuracy**: The scanner can detect whether a video element has a `<track>` element, but cannot verify whether the captions are accurate.
- **Color-only indicators**: Whether color alone is used to convey meaning (e.g., red-only error states) cannot be reliably detected automatically.
- **Cognitive accessibility**: Criteria related to plain language, reading level, and consistent navigation require human review.

---

## GitHub Repository

[https://github.com/cpt-cheezbrgr/wcag-scanner](https://github.com/cpt-cheezbrgr/wcag-scanner)
