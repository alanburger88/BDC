#!/usr/bin/env node
/* Creation-time tool: screenshots of the Financing Change Notice at each simulated
 * device size. The walkthrough shows them while the live notice loads, and as the
 * fallback when the notice cannot be shown inside the page.
 *
 *   node walkthrough/tools/previews.mjs
 *
 * Needs Playwright (Chromium) and Python with Pillow for the WebP conversion. */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl } from '../../tests/lib/browser.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NOTICE = resolve(ROOT, '..', 'dist', 'index.html');
const OUT = join(ROOT, 'src', 'assets', 'previews');
const devices = JSON.parse(readFileSync(join(ROOT, 'src', 'content', 'walkthrough.json'), 'utf8')).devices;
const SCALE = { desktop: 1.5, tablet: 1.5, mobile: 2 };

const tmp = mkdtempSync(join(tmpdir(), 'wt-previews-'));
const browser = await launch();
try {
  for (const [id, d] of Object.entries(devices)) {
    const context = await browser.newContext({ viewport: { width: d.w, height: d.h }, deviceScaleFactor: SCALE[id], reducedMotion: 'reduce', locale: 'en-CA' });
    const page = await context.newPage();
    await page.route('https://accessibilityserver.org/**', (route) => route.abort());
    await page.goto(`${fileUrl(NOTICE)}#/overview`);
    await page.waitForSelector('html.app-ready');
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(tmp, `${id}.png`) });
    await context.close();
  }
} finally {
  await browser.close();
}
execFileSync('python3', ['-c', `
import sys
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
for name in ${JSON.stringify(Object.keys(devices))}:
    Image.open(f"{src}/{name}.png").convert("RGB").save(f"{out}/notice-{name}.webp", "WEBP", quality=80, method=6)
`, tmp, OUT], { stdio: 'inherit' });
rmSync(tmp, { recursive: true, force: true });
console.log(`previews written to ${OUT}`);
