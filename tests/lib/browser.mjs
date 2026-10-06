// Shared Playwright helpers for the QA scripts (Chromium only in this environment).
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  const candidates = ['playwright', '/opt/node22/lib/node_modules/playwright', '/usr/local/lib/node_modules_global/playwright', '/opt/node-tools/node_modules/playwright'];
  for (const c of candidates) {
    try { return require(c); } catch (e) { /* next */ }
  }
  throw new Error('playwright not found');
}
export const { chromium } = loadPlaywright();

export const DEFAULT_FILE = resolve(new URL('../../dist/index.html', import.meta.url).pathname);
export const fileUrl = (p = DEFAULT_FILE) => pathToFileURL(resolve(p)).href;

export async function launch(opts = {}) {
  return chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--disable-features=PrivacySandboxSettings4'],
    ...opts,
  });
}

/** New page with request logging. Blocks the accessibility widget by default
 * (no egress here) so tests are deterministic; records every non-local request. */
export async function newPage(browser, { width = 1280, height = 900, reducedMotion = 'no-preference', offline = false, blockWidget = true, locale } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion, deviceScaleFactor: 1, locale });
  if (offline) await context.setOffline(true);
  const requests = [];
  const consoleMsgs = [];
  const page = await context.newPage();
  page.on('request', (req) => {
    const url = req.url();
    if (!url.startsWith('file:') && !url.startsWith('data:') && !url.startsWith('blob:') && !url.startsWith('http://127.0.0.1') && !url.startsWith('http://localhost')) requests.push(url);
  });
  if (blockWidget) await page.route('https://accessibilityserver.org/**', (route) => route.abort());
  page.on('console', (msg) => {
    if (!['error', 'warning'].includes(msg.type())) return;
    // The blocked accessibility widget surfaces as a generic resource failure
    if (blockWidget && /Failed to load resource: net::ERR_(FAILED|INTERNET_DISCONNECTED)/.test(msg.text()) && /accessibilityserver\.org/.test((msg.location() || {}).url || 'accessibilityserver.org')) return;
    consoleMsgs.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on('requestfailed', (req) => { if (!req.url().startsWith('https://accessibilityserver.org/')) consoleMsgs.push(`requestfailed: ${req.url()}`); });
  page.on('pageerror', (err) => consoleMsgs.push(`pageerror: ${err.message}`));
  return { context, page, requests, consoleMsgs };
}

export async function gotoApp(page, hash = '#/overview', file = DEFAULT_FILE) {
  await page.goto(`${fileUrl(file)}${hash}`);
  await page.waitForSelector('html.app-ready');
  await page.waitForTimeout(150);
}

/** Horizontal overflow check: document and every element wider than the viewport. */
export async function overflowReport(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const vw = de.clientWidth;
    const offenders = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('.tabs-measure, .sr-only, #print-root')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.position === 'fixed' && el.closest('.popover')) continue;
      if (r.right > vw + 1 || r.left < -1) {
        offenders.push({ tag: el.tagName.toLowerCase(), cls: (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || '', id: el.id, right: Math.round(r.right), left: Math.round(r.left), text: (el.textContent || '').trim().slice(0, 50) });
      }
    }
    return { scrollWidth: de.scrollWidth, clientWidth: vw, overflow: de.scrollWidth > vw + 1, offenders: offenders.slice(0, 15) };
  });
}

export async function missingKeys(page) {
  return page.evaluate(() => {
    const txt = document.body.innerText + [...document.querySelectorAll('[aria-label],[title],[placeholder],[alt]')].map((e) => e.getAttribute('aria-label') + e.getAttribute('title') + e.getAttribute('placeholder') + e.getAttribute('alt')).join(' ');
    const m = txt.match(/⟦[^⟧]+⟧/g) || [];
    return [...new Set(m)].concat([...(window.BDCNotice?.i18n?._missing || [])]);
  });
}
