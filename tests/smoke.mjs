#!/usr/bin/env node
// Smoke test: every route in both languages at several widths. Reports console
// errors, missing dictionary keys, horizontal overflow and external requests.
// Usage: node tests/smoke.mjs [path/to/index.html] [--shots dir] [--routes overview,changes] [--widths 320,1280]
import { mkdirSync } from 'node:fs';
import { launch, newPage, gotoApp, overflowReport, missingKeys, DEFAULT_FILE } from './lib/browser.mjs';

const args = process.argv.slice(2);
const file = args[0] && !args[0].startsWith('--') ? args[0] : DEFAULT_FILE;
const opt = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
const shots = opt('--shots', null);
const routes = opt('--routes', 'overview,changes,payments,documents,support,help,insights').split(',');
const widths = opt('--widths', '320,390,768,1024,1440').split(',').map(Number);
const locales = opt('--locales', 'en-CA,fr-CA').split(',');
if (shots) mkdirSync(shots, { recursive: true });

const browser = await launch();
let failures = 0;
const { page, requests, consoleMsgs } = await newPage(browser, { width: widths[0] });
await gotoApp(page, '#/overview', file);
for (const locale of locales) {
  await page.evaluate((l) => window.BDCNotice.i18n.setLocale(l), locale);
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 900 });
    for (const r of routes) {
      await page.evaluate((h) => { location.hash = h; }, `#/${r}`);
      await page.waitForTimeout(120);
      const of = await overflowReport(page);
      const mk = await missingKeys(page);
      const problems = [];
      if (of.overflow || of.offenders.length) problems.push(`overflow scrollWidth=${of.scrollWidth} client=${of.clientWidth} ${JSON.stringify(of.offenders.slice(0, 4))}`);
      if (mk.length) problems.push(`missing keys ${mk.slice(0, 6).join(', ')}`);
      if (problems.length) { failures += 1; console.log(`✗ ${locale} ${w}px #/${r}: ${problems.join(' | ')}`); }
      if (shots) await page.screenshot({ path: `${shots}/${locale}-${w}-${r}.png`, fullPage: true });
    }
  }
}
if (consoleMsgs.length) { failures += 1; console.log(`✗ console:\n  ${[...new Set(consoleMsgs)].slice(0, 20).join('\n  ')}`); }
const ext = requests.filter((u) => !u.startsWith('https://accessibilityserver.org/'));
if (ext.length) { failures += 1; console.log(`✗ unexpected external requests: ${ext.join(', ')}`); }
console.log(failures ? `\n${failures} problem group(s)` : '✓ smoke passed');
await browser.close();
process.exit(failures ? 1 : 0);
