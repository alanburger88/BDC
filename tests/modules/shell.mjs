#!/usr/bin/env node
// Core/shell behaviour: tabs keyboard pattern, compact selector, language
// switch focus/route preservation, reset dialog, unknown routes, skip link.
import { launch, newPage, gotoApp, DEFAULT_FILE } from '../lib/browser.mjs';

const file = process.argv[2] || DEFAULT_FILE;
const results = [];
const ok = (name, cond, extra = '') => { results.push([cond, name, extra]); };
const browser = await launch();
const { page, consoleMsgs } = await newPage(browser, { width: 1280 });
await gotoApp(page, '#/overview', file);

// Tabs: roving tabindex + arrow keys + Home/End (automatic activation)
await page.locator('#tab-overview').focus();
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(150);
ok('ArrowRight activates next tab', (await page.evaluate(() => location.hash)) === '#/changes');
ok('focus stays on the active tab', (await page.evaluate(() => document.activeElement.id)) === 'tab-changes');
await page.keyboard.press('End');
await page.waitForTimeout(150);
ok('End goes to last tab', (await page.evaluate(() => location.hash)) === '#/help');
await page.keyboard.press('Home');
await page.waitForTimeout(150);
ok('Home goes to first tab', (await page.evaluate(() => location.hash)) === '#/overview');
ok('only one tab is tabbable', (await page.locator('[role="tab"][tabindex="0"]').count()) === 1);
ok('tabpanel labelled by active tab', (await page.locator('#view').getAttribute('aria-labelledby')) === 'tab-overview');

// Language switch keeps route and focus, sets document language
await page.evaluate(() => { location.hash = '#/payments'; });
await page.waitForTimeout(150);
await page.locator('[data-fid="lang-fr-CA"]').click();
await page.waitForTimeout(250);
ok('document lang is fr-CA', (await page.evaluate(() => document.documentElement.lang)) === 'fr-CA');
ok('route preserved on language switch', (await page.evaluate(() => location.hash)) === '#/payments');
ok('focus restored to language toggle', (await page.evaluate(() => document.activeElement.getAttribute('data-fid'))) === 'lang-fr-CA');
ok('tabs relabelled in French', (await page.locator('#tab-payments').innerText()).includes('Versements'));
ok('banner in French', (await page.locator('.demo-banner').innerText()).includes('Démonstration conceptuelle'));
ok('language_changed event logged', await page.evaluate(() => window.BDCNotice.events.all().some((e) => e.type === 'language_changed' && e.id === 'fr-CA')));
await page.locator('[data-fid="lang-en-CA"]').click();
await page.waitForTimeout(200);

// Unknown route falls back to overview
await page.evaluate(() => { location.hash = '#/nope/123'; });
await page.waitForTimeout(250);
ok('unknown route returns to overview', (await page.evaluate(() => location.hash)) === '#/overview');

// Browser back/forward
await page.evaluate(() => { location.hash = '#/documents'; });
await page.waitForTimeout(150);
await page.evaluate(() => { location.hash = '#/support'; });
await page.waitForTimeout(150);
await page.goBack();
await page.waitForTimeout(200);
ok('browser Back restores previous section', (await page.evaluate(() => location.hash)) === '#/documents');
await page.goForward();
await page.waitForTimeout(200);
ok('browser Forward works', (await page.evaluate(() => location.hash)) === '#/support');

// Reset dialog: focus trap, cancel returns focus, confirm clears events
const before = await page.evaluate(() => window.BDCNotice.events.all().length);
await page.locator('[data-fid="footer-reset"]').click();
await page.waitForSelector('[data-overlay="reset"]');
ok('app inert while dialog open', (await page.locator('#app[inert]').count()) === 1);
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
ok('Escape closes dialog and returns focus', (await page.evaluate(() => document.activeElement.getAttribute('data-fid'))) === 'footer-reset');
await page.locator('[data-fid="footer-reset"]').click();
await page.locator('[data-fid="reset-confirm"]').click();
await page.waitForTimeout(250);
const after = await page.evaluate(() => window.BDCNotice.events.all().length);
ok('reset clears demo events', after < before && (await page.evaluate(() => location.hash)) === '#/overview', `${before}→${after}`);

// Compact selector at 390px
await page.setViewportSize({ width: 390, height: 800 });
await page.waitForTimeout(200);
ok('compact nav at 390px', (await page.locator('html.nav-compact').count()) === 1);
const btn = page.locator('.section-select-btn');
ok('selector names current section', (await btn.innerText()).includes('Sections: Overview'));
await btn.click();
ok('selector expanded', (await btn.getAttribute('aria-expanded')) === 'true');
await page.keyboard.press('Escape');
ok('Escape closes selector and returns focus', (await btn.getAttribute('aria-expanded')) === 'false' && (await page.evaluate(() => document.activeElement.classList.contains('section-select-btn'))));
await btn.click();
await page.locator('#section-list a').nth(3).click();
await page.waitForTimeout(250);
ok('selector navigates and moves focus to heading', (await page.evaluate(() => location.hash)) === '#/documents' && (await page.evaluate(() => document.activeElement.hasAttribute('data-view-heading'))));

// Skip link
await page.setViewportSize({ width: 1280, height: 900 });
await page.keyboard.press('Shift+Tab');
await page.evaluate(() => document.querySelector('.skip-link').focus());
await page.keyboard.press('Enter');
await page.waitForTimeout(100);
ok('skip link focuses main without changing route', (await page.evaluate(() => document.activeElement.id)) === 'main' && (await page.evaluate(() => location.hash)) === '#/documents');

ok('no console errors', consoleMsgs.length === 0, consoleMsgs.slice(0, 3).join(' | '));
await browser.close();
let failed = 0;
for (const [c, n, e] of results) { if (!c) failed += 1; console.log(`${c ? '✓' : '✗'} ${n}${e ? ` (${e})` : ''}`); }
process.exit(failed ? 1 : 0);
