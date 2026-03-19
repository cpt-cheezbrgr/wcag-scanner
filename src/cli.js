#!/usr/bin/env node
/**
 * WCAG Scanner CLI
 * Usage: node src/cli.js scan <url> [options]
 */

import { program } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { writeFileSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createBrowser, scanPage } from './scanner.js';
import { Crawler } from './crawler.js';
import { aggregateResults, generateHtmlReport, generateJsonReport } from './reporter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

program
  .name('wcag-scan')
  .description('WCAG 2.1 AA accessibility scanner — HHS Section 504 compliance tool')
  .version('1.0.0');

program
  .command('scan <url>')
  .description('Scan a website for WCAG 2.1 AA accessibility violations')
  .option('-d, --depth <n>', 'Maximum crawl depth', '3')
  .option('-m, --max-pages <n>', 'Maximum number of pages to scan (0 = unlimited)', '50')
  .option('-o, --output <dir>', 'Output directory for reports', './reports')
  .option('-f, --format <fmt>', 'Report format: html, json, or both', 'html')
  .option('--no-robots', 'Ignore robots.txt restrictions')
  .option('--include <pattern>', 'Only crawl URLs matching this regex pattern')
  .option('--exclude <pattern>', 'Skip URLs matching this regex pattern')
  .option('--open', 'Open HTML report in browser when done')
  .action(async (url, opts) => {
    console.log('');
    console.log(chalk.bold.blue('  WCAG 2.1 AA Accessibility Scanner'));
    console.log(chalk.gray('  HHS Section 504 Compliance Tool'));
    console.log('');

    // Validate URL
    try {
      new URL(url);
    } catch {
      console.error(chalk.red(`  ✗ Invalid URL: ${url}`));
      process.exit(1);
    }

    const maxDepth = parseInt(opts.depth, 10);
    const maxPages = parseInt(opts.maxPages, 10);
    const outputDir = resolve(opts.output);
    const format = opts.format;

    console.log(chalk.cyan(`  Target:    ${url}`));
    console.log(chalk.cyan(`  Max depth: ${maxDepth}  |  Max pages: ${maxPages === 0 ? 'unlimited' : maxPages}`));
    console.log(chalk.cyan(`  Output:    ${outputDir}`));
    console.log('');

    mkdirSync(outputDir, { recursive: true });

    let browser;
    const spinner = ora({ text: 'Launching browser...', color: 'cyan' }).start();

    try {
      browser = await createBrowser(true);
      spinner.succeed('Browser ready');
      console.log('');

      const crawler = new Crawler({
        maxDepth,
        maxPages,
        respectRobots: opts.robots !== false,
        includePattern: opts.include,
        excludePattern: opts.exclude,
      });

      const results = [];
      let pageIndex = 0;

      crawler.on('page:start', ({ url: pageUrl, index }) => {
        pageIndex = index;
        spinner.start(chalk.gray(`  [${index}] Scanning: ${pageUrl.length > 80 ? pageUrl.substring(0, 77) + '...' : pageUrl}`));
      });

      crawler.on('page:done', ({ url: pageUrl, index, violations, heuristics, error }) => {
        const summary = [];
        if (violations > 0) summary.push(chalk.red(`${violations} violation${violations !== 1 ? 's' : ''}`));
        if (heuristics > 0) summary.push(chalk.yellow(`${heuristics} heuristic`));
        if (error) summary.push(chalk.red('ERROR'));

        const status = error
          ? chalk.red('✗')
          : violations > 0
          ? chalk.yellow('⚠')
          : chalk.green('✓');

        spinner.stopAndPersist({
          symbol: status,
          text: chalk.gray(`[${index}] ${pageUrl.length > 70 ? pageUrl.substring(0, 67) + '...' : pageUrl}`) +
            (summary.length ? '  ' + summary.join(', ') : chalk.green('  clean')),
        });
      });

      const allResults = await crawler.crawl(url, scanPage, browser);
      console.log('');

      // Aggregate
      spinner.start('Generating report...');
      const aggregated = aggregateResults(allResults);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').substring(0, 19);
      const safeDomain = new URL(url).hostname.replace(/[^a-z0-9]/gi, '_');
      const baseName = `${safeDomain}_${timestamp}`;

      const generated = [];

      if (format === 'html' || format === 'both') {
        const htmlPath = join(outputDir, `${baseName}.html`);
        writeFileSync(htmlPath, generateHtmlReport(aggregated, url));
        generated.push({ type: 'HTML', path: htmlPath });
      }

      if (format === 'json' || format === 'both') {
        const jsonPath = join(outputDir, `${baseName}.json`);
        writeFileSync(jsonPath, generateJsonReport(aggregated, url));
        generated.push({ type: 'JSON', path: jsonPath });
      }

      spinner.succeed('Report generated');
      console.log('');

      // Print summary
      const { summary: s } = aggregated;
      console.log(chalk.bold('  ─── Scan Summary ────────────────────────────────────'));
      console.log(`  Pages scanned:       ${chalk.bold(s.totalPages)}`);
      console.log(`  Unique violations:   ${s.totalViolations > 0 ? chalk.red.bold(s.totalViolations) : chalk.green.bold(s.totalViolations)}`);
      console.log(`    ${chalk.red('●')} Critical:          ${chalk.bold(s.impactCounts.critical)}`);
      console.log(`    ${chalk.yellow('●')} Serious:           ${chalk.bold(s.impactCounts.serious)}`);
      console.log(`    ${chalk.yellow('●')} Moderate:          ${chalk.bold(s.impactCounts.moderate)}`);
      console.log(`    ${chalk.blue('●')} Minor:             ${chalk.bold(s.impactCounts.minor)}`);
      console.log(`  Heuristic issues:    ${chalk.bold(s.totalHeuristicIssues)}`);
      console.log(`  Needs manual review: ${chalk.bold(s.totalIncomplete)}`);
      console.log(`  Automated score:     ${chalk.bold(s.complianceScore + '%')}`);
      console.log('  ─────────────────────────────────────────────────────');
      console.log('');

      if (s.impactCounts.critical > 0 || s.impactCounts.serious > 0) {
        console.log(chalk.red.bold('  ⚠ Critical/serious violations found — action required before May 11, 2026 deadline.'));
        console.log('');
      }

      for (const { type, path } of generated) {
        console.log(`  ${chalk.green('✓')} ${type} report: ${chalk.underline(path)}`);
      }
      console.log('');

      if (opts.open && generated.find(g => g.type === 'HTML')) {
        const htmlReport = generated.find(g => g.type === 'HTML');
        const { default: open } = await import('open').catch(() => ({ default: null }));
        if (open) {
          await open(htmlReport.path);
        } else {
          console.log(chalk.gray(`  To open: open "${htmlReport.path}"`));
        }
      }

    } catch (err) {
      spinner.fail(chalk.red(`Scan failed: ${err.message}`));
      console.error(err);
      process.exit(1);
    } finally {
      if (browser) await browser.close();
    }
  });

program.parse();
