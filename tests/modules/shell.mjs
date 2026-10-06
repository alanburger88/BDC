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

/* ------------------------------------------------------------------ */
/* QA fixes (core): one fresh page per group so state does not leak    */
/* ------------------------------------------------------------------ */
const wait = (p, ms = 150) => p.waitForTimeout(ms);
const fresh = async (hash = '#/overview', width = 1280, height = 900) => {
  const ctx = await newPage(browser, { width, height });
  await gotoApp(ctx.page, hash, file);
  return ctx;
};
const allMsgs = [];

// R-06: notice_opened is the first event, with the section of the first route
{
  const { page: p, context, consoleMsgs: cm } = await fresh('#/payments');
  const ev = await p.evaluate(() => window.BDCNotice.events.all().slice(0, 2).map((e) => `${e.type}:${e.section}`));
  ok('R-06 notice_opened precedes the first section_viewed', ev[0] === 'notice_opened:payments' && ev[1] === 'section_viewed:payments', ev);
  allMsgs.push(...cm);
  await context.close();
}

// R-09/R-29, R-03, R-33: localised nav landmark, French labels and spacing
{
  const { page: p, context, consoleMsgs: cm } = await fresh();
  ok('R-09 nav landmark label is English in en-CA', (await p.locator('nav.section-nav').getAttribute('aria-label')) === 'Notice sections');
  await p.locator('[data-fid="lang-fr-CA"]').click();
  await wait(p, 250);
  ok('R-09 nav landmark label follows the switch to fr-CA', (await p.locator('nav.section-nav').getAttribute('aria-label')) === 'Sections de l’avis');
  const fr = await p.evaluate(() => {
    const A = window.BDCNotice;
    const bad = [];
    const walk = (v, path) => {
      if (typeof v === 'string') { if (/ [:;?!»]|« |[\u00a0\u202f];/.test(v)) bad.push(path); } else if (v && typeof v === 'object') Object.keys(v).forEach((k) => walk(v[k], `${path}.${k}`));
    };
    ['common', 'shell', 'nav', 'items', 'clauses', 'chapters', 'glossary'].forEach((ns) => walk(A.i18n._dicts['fr-CA'][ns], ns));
    return {
      insights: A.i18n.t('nav.insights'),
      footer: document.querySelector('[data-fid="footer-insights"]').textContent.trim(),
      bad,
    };
  });
  ok('R-03 French "Demo insights" label is distinct from the Overview tab', fr.insights === 'Statistiques de la démo' && fr.footer === 'Statistiques de la démo' && !/Aperçu/.test(fr.insights), fr);
  ok('R-33 core fr-CA strings use U+00A0 before : and inside « », no space before ;', fr.bad.length === 0, fr.bad);
  allMsgs.push(...cm);
  await context.close();
}

// R-41: on #/insights (no tab selected) the first tab keeps the roving tabindex
{
  const { page: p, context, consoleMsgs: cm } = await fresh('#/insights', 1280);
  const tabs = await p.evaluate(() => [...document.querySelectorAll('[role="tab"]')].map((t) => `${t.id}:${t.getAttribute('tabindex')}:${t.getAttribute('aria-selected')}`));
  ok('R-41 first tab tabbable and none selected on #/insights', tabs[0] === 'tab-overview:0:false' && tabs.slice(1).every((x) => x.endsWith(':-1:false')), tabs);
  await p.locator('[data-fid="lang-fr-CA"]').focus();
  await p.keyboard.press('Tab');
  ok('R-41 Tab from the language toggle reaches the tablist', (await p.evaluate(() => document.activeElement.id)) === 'tab-overview');
  await p.keyboard.press('ArrowRight');
  await wait(p, 200);
  ok('R-41 arrow keys work from that entry tab', (await p.evaluate(() => location.hash)) === '#/changes');
  allMsgs.push(...cm);
  await context.close();
}

// R-16: tabs only where they fit inside the container's content box
{
  const { page: p, context, consoleMsgs: cm } = await fresh();
  const bad = [];
  const compactAt = {};
  for (const loc of ['en-CA', 'fr-CA']) {
    await p.evaluate((l) => window.BDCNotice.i18n.setLocale(l), loc);
    for (const w of [880, 900, 920, 940, 960, 980, 1000, 1024]) {
      await p.setViewportSize({ width: w, height: 800 });
      await wait(p, 120);
      const r = await p.evaluate(() => {
        const t = document.querySelector('.tabs:not(.tabs-measure)');
        const nav = document.querySelector('nav.section-nav').getBoundingClientRect();
        const last = t.querySelector('[role="tab"]:last-child').getBoundingClientRect();
        return { compact: document.documentElement.classList.contains('nav-compact'), sw: t.scrollWidth, cw: t.clientWidth, lastRight: last.right, navRight: nav.right };
      });
      compactAt[`${loc}-${w}`] = r.compact;
      if (!r.compact && (r.sw > r.cw || r.lastRight > r.navRight + 1)) bad.push({ loc, w, ...r });
    }
  }
  ok('R-16 tabs never overflow into the gutter (880–1024px, both languages)', bad.length === 0, bad);
  ok('R-16 compact selector at 880px EN and 940px FR', compactAt['en-CA-880'] && compactAt['fr-CA-940'], compactAt);
  ok('R-16 full tabs still shown at 1024px in both languages', !compactAt['en-CA-1024'] && !compactAt['fr-CA-1024'], compactAt);
  allMsgs.push(...cm);
  await context.close();
}

// R-04: detail_opened keeps FAQ/glossary sub-identifiers and skips routes with no real item
{
  const { page: p, context, consoleMsgs: cm } = await fresh();
  await p.evaluate(() => window.BDCNotice.events.reset());
  for (const hsh of ['#/help/faq/relief', '#/help/faq/fee', '#/help/glossary/principal', '#/help/glossary/interest', '#/payments/9999-99', '#/documents/bogus', '#/help/faq/constructor', '#/payments/2026-12', '#/documents/postponement', '#/changes/interest', '#/support/learning']) {
    await p.evaluate((x) => { location.hash = x; }, hsh);
    await wait(p, 200);
  }
  const ids = await p.evaluate(() => window.BDCNotice.events.all().filter((e) => e.type === 'detail_opened').map((e) => e.id));
  const hasHelp = await p.evaluate(() => window.BDCNotice.i18n.has('help.faq.items'));
  const expect = [...(hasHelp ? ['help:faq:relief', 'help:faq:fee'] : []), 'help:glossary:principal', 'help:glossary:interest', 'payments:2026-12', 'documents:postponement', 'changes:interest', 'support:learning'];
  ok('R-04 detail_opened ids are specific and only for real items', JSON.stringify(ids) === JSON.stringify(expect), ids);
  allMsgs.push(...cm);
  await context.close();
}

// R-11: Back → Forward → Back keeps the December context and the "Back to…" control
{
  const { page: p, context, consoleMsgs: cm } = await fresh('#/payments/2026-12');
  await wait(p, 300);
  const fid = 'explain-month-2026-12';
  if (await p.evaluate((f) => !!window.BDCNotice.util.findByFid(f), fid)) {
    await p.evaluate((f) => { const el = window.BDCNotice.util.findByFid(f); el.scrollIntoView({ block: 'center' }); el.focus(); }, fid);
    await wait(p, 100);
    const y0 = await p.evaluate(() => Math.round(window.scrollY));
    // As Clair's source link does: the panel is gone (focus on body) when the route changes.
    await p.evaluate((f) => { document.activeElement.blur(); window.BDCNotice.router.go('#/documents/postponement', { origin: { fid: f, ctx: { kind: 'month', id: '2026-12' } }, focus: 'item' }); }, fid);
    await wait(p, 500);
    await p.goBack(); await wait(p, 500);
    const b1 = await p.evaluate(() => ({ hash: location.hash, y: Math.round(scrollY), f: document.activeElement.getAttribute('data-fid') }));
    await p.goForward(); await wait(p, 500);
    const fw = await p.evaluate(() => ({ hash: location.hash, back: (document.querySelector('[data-fid="back-control"]') || {}).textContent || null }));
    await p.goBack(); await wait(p, 500);
    const b2 = await p.evaluate(() => ({ hash: location.hash, y: Math.round(scrollY), f: document.activeElement.getAttribute('data-fid') }));
    ok('R-11 first browser Back restores scroll and focus', b1.hash === '#/payments/2026-12' && Math.abs(b1.y - y0) <= 2 && b1.f === fid, { y0, b1 });
    ok('R-11 browser Forward shows the "Back to…" control again', fw.hash === '#/documents/postponement' && /December 2026/.test(fw.back || ''), fw);
    ok('R-11 second browser Back restores scroll and focus again', b2.hash === '#/payments/2026-12' && Math.abs(b2.y - y0) <= 2 && b2.f === fid, { y0, b2 });
  } else {
    ok('R-11 (payments module not in this build: skipped)', true);
  }
  allMsgs.push(...cm);
  await context.close();
}

// Glossary popovers: R-05 (no hover counting), R-40 (dark parent), R-42 (narrow), R-43 (Escape)
{
  const { page: p, context, consoleMsgs: cm } = await fresh('#/overview', 1280);
  const glossaryCount = () => p.evaluate(() => window.BDCNotice.events.all().filter((e) => e.type === 'glossary_opened').length);
  const term = p.locator('#view .term').first();
  if (await term.count()) {
    const c0 = await glossaryCount();
    for (let i = 0; i < 3; i += 1) { await term.hover(); await wait(p, 120); await p.mouse.move(2, 2); await wait(p, 350); }
    ok('R-05 hover previews are not logged as glossary_opened', (await glossaryCount()) === c0);
    await term.click(); await wait(p, 150);
    ok('R-05 a click that pins a definition is logged once', (await glossaryCount()) === c0 + 1);
    await p.keyboard.press('Escape'); await wait(p, 100);

    // R-43: Escape with focus elsewhere is left to the focused control
    await term.click(); await wait(p, 150);
    await p.locator('.popover .popover-def').click(); // focus leaves the term without a new target
    await p.evaluate(() => {
      window.__escSeen = 0;
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.__escSeen += 1; });
      document.querySelector('[data-fid="footer-reset"]').focus({ preventScroll: true });
    });
    await p.keyboard.press('Escape'); await wait(p, 100);
    const r43 = await p.evaluate(() => ({ seen: window.__escSeen, focus: document.activeElement.getAttribute('data-fid'), open: window.BDCNotice.popover.isOpen() }));
    ok('R-43 Escape elsewhere is not captured by a pinned popover and focus does not jump back', r43.seen === 1 && r43.focus === 'footer-reset', r43);
    await p.evaluate(() => window.BDCNotice.popover.close());
    // Focus inside: Escape closes and returns to the term
    await term.focus(); await p.keyboard.press('Enter'); await wait(p, 150);
    await p.keyboard.press('Tab');
    await p.keyboard.press('Escape'); await wait(p, 100);
    ok('R-43 Escape inside the popover still closes it and returns focus to the term', await p.evaluate(() => !window.BDCNotice.popover.isOpen() && document.activeElement.classList.contains('term')));
    // Pinned definition closes when keyboard focus moves past it
    await p.keyboard.press('Enter'); await wait(p, 150);
    for (let i = 0; i < 5; i += 1) await p.keyboard.press('Tab');
    await wait(p, 100);
    ok('R-42 a pinned definition closes once focus moves outside it', await p.evaluate(() => !window.BDCNotice.popover.isOpen() && !document.activeElement.closest('.popover')));
    // Hover preview with focus elsewhere: Escape dismisses it without moving focus
    await p.evaluate(() => document.querySelector('[data-fid="footer-reset"]').focus({ preventScroll: true }));
    await term.hover(); await wait(p, 150);
    await p.keyboard.press('Escape'); await wait(p, 100);
    ok('Escape dismisses a hover preview in place', await p.evaluate(() => !window.BDCNotice.popover.isOpen() && document.activeElement.getAttribute('data-fid') === 'footer-reset'));
    await p.mouse.move(2, 2);
  }
  // R-40: popover opened from a term on a dark surface keeps light-surface colours
  const heroTerm = p.locator('#view .on-dark .term').first();
  if (await heroTerm.count()) {
    for (const loc of ['en-CA', 'fr-CA']) {
      await p.evaluate((l) => window.BDCNotice.i18n.setLocale(l), loc);
      await wait(p, 200);
      await p.evaluate(() => window.scrollTo(0, 0));
      await p.locator('#view .on-dark .term').first().click(); await wait(p, 200);
      const col = await p.evaluate(() => {
        const pop = document.querySelector('.popover');
        const link = pop.querySelector('.btn-link');
        return { bg: getComputedStyle(pop).backgroundColor, link: getComputedStyle(link).color, text: getComputedStyle(pop.querySelector('.popover-def')).color };
      });
      ok(`R-40 ${loc} hero popover link and text are dark on white`, col.bg === 'rgb(255, 255, 255)' && col.link === 'rgb(24, 44, 61)' && col.text === 'rgb(34, 34, 34)', col);
      const rings = [];
      for (let i = 0; i < 3; i += 1) {
        await p.keyboard.press('Tab');
        rings.push(await p.evaluate(() => { const a = document.activeElement; return a.closest('.popover') ? getComputedStyle(a).outlineColor : 'outside'; }));
      }
      ok(`R-40 ${loc} focus rings inside the hero popover use the standard blue`, rings.every((r) => r === 'rgb(43, 89, 255)'), rings);
      await p.keyboard.press('Escape'); await wait(p, 100);
      await p.evaluate(() => window.BDCNotice.popover.close());
    }
    await p.evaluate(() => window.BDCNotice.i18n.setLocale('en-CA'));
  }
  allMsgs.push(...cm);
  await context.close();
}

// R-42: below 600px a term does not open on focus; Enter opens the sheet above which the term stays visible
{
  const { page: p, context, consoleMsgs: cm } = await fresh('#/changes', 320, 640);
  const t0 = p.locator('#view .term').first();
  if (await t0.count()) {
    // The last term on the page, scrolled to the bottom edge, where a sheet would cover it
    await p.evaluate(() => {
      const ts = [...document.querySelectorAll('#view .term')];
      const t = ts[ts.length - 1];
      const b = document.createElement('button'); b.id = 'zz-before'; b.textContent = 'x'; t.parentNode.insertBefore(b, t);
      window.scrollTo(0, window.scrollY + t.getBoundingClientRect().bottom - window.innerHeight + 24);
      b.focus({ preventScroll: true });
    });
    await p.keyboard.press('Tab'); await wait(p, 200);
    const onFocus = await p.evaluate(() => ({ onTerm: document.activeElement.classList.contains('term'), open: window.BDCNotice.popover.isOpen() }));
    await p.evaluate(() => document.getElementById('zz-before').remove());
    ok('R-42 narrow: keyboard focus on a term does not open the sheet', onFocus.onTerm && !onFocus.open, onFocus);
    const covered = await p.evaluate(() => window.innerHeight - document.activeElement.getBoundingClientRect().bottom < 120);
    await p.keyboard.press('Enter'); await wait(p, 250);
    const sh = await p.evaluate(() => {
      const pop = document.querySelector('.popover');
      if (!pop) return null;
      const t = document.activeElement.getBoundingClientRect();
      return { sheet: pop.classList.contains('popover--sheet'), termBottom: Math.round(t.bottom), sheetTop: Math.round(pop.getBoundingClientRect().top), onTerm: document.activeElement.classList.contains('term') };
    });
    ok('R-42 narrow: Enter opens the sheet and the focused term is scrolled above it', covered && sh && sh.sheet && sh.onTerm && sh.termBottom <= sh.sheetTop, { covered, sh });
    for (let i = 0; i < 6; i += 1) await p.keyboard.press('Tab');
    await wait(p, 100);
    ok('R-42 narrow: tabbing past the sheet closes it', await p.evaluate(() => !window.BDCNotice.popover.isOpen()));
  }
  allMsgs.push(...cm);
  await context.close();
}

// R-02: full-width panels keep the bottom-left launcher zone free of controls on phones
{
  const { page: p, context, consoleMsgs: cm } = await fresh('#/overview', 360, 740);
  const zone = { l: 16, r: 72, t: 740 - 72, b: 740 - 16 };
  const check = (label) => p.evaluate(([z, lbl]) => {
    const ov = document.querySelector('.overlay');
    if (!ov) return { lbl, missing: true };
    const ctrls = [...ov.querySelectorAll('input, textarea, button, a, select')].filter((e) => e.getClientRects().length);
    // Visible part of a control: clipped by any scrolling ancestor inside the panel
    const visible = (e) => {
      let r = e.getBoundingClientRect();
      let { left, top, right, bottom } = r;
      for (let a = e.parentElement; a && a !== ov.parentElement; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (/(auto|scroll|hidden)/.test(cs.overflowY + cs.overflowX)) {
          r = a.getBoundingClientRect();
          left = Math.max(left, r.left); top = Math.max(top, r.top); right = Math.min(right, r.right); bottom = Math.min(bottom, r.bottom);
        }
      }
      return { left, top, right, bottom };
    };
    const hits = ctrls.filter((e) => { const r = visible(e); return r.right > r.left && r.bottom > r.top && r.left < z.r && r.right > z.l && r.top < z.b && r.bottom > z.t; }).map((e) => e.getAttribute('data-fid') || e.className);
    const vh = window.innerHeight;
    const offscreen = ctrls.filter((e) => { const r = e.getBoundingClientRect(); return r.bottom > vh + 1 && !e.closest('.clair-scroll, .qry-scroll'); }).map((e) => e.getAttribute('data-fid') || e.className);
    return { lbl, hits, offscreen };
  }, [zone, label]);
  const results2 = [];
  if (await p.locator('[data-fid="clair-launcher"]').count() && await p.evaluate(() => !!window.BDCNotice.clair)) {
    await p.click('[data-fid="clair-launcher"]'); await wait(p, 450);
    results2.push(await check('clair'));
    await p.keyboard.press('Escape'); await wait(p, 300);
  }
  if (await p.evaluate(() => !!window.BDCNotice.query)) {
    await p.evaluate(() => window.BDCNotice.query.open({ kind: 'general' }, null)); await wait(p, 450);
    results2.push(await check('query'));
    await p.keyboard.press('Escape'); await wait(p, 300);
  }
  ok('R-02 no panel control sits in the bottom-left launcher zone at 360×740', results2.every((r) => !r.missing && r.hits.length === 0 && r.offscreen.length === 0), results2);
  // Short viewport (keyboard open): the reservation is dropped, send/continue stay visible
  await p.setViewportSize({ width: 360, height: 480 });
  await wait(p, 200);
  const short = [];
  if (await p.evaluate(() => !!window.BDCNotice.clair)) {
    await p.click('[data-fid="clair-launcher"]'); await wait(p, 450);
    short.push(await p.evaluate(() => { const b = document.querySelector('.overlay [data-fid="clair-send"], .overlay .clair-send'); if (!b) return { missing: true }; const r = b.getBoundingClientRect(); return { bottom: Math.round(r.bottom), vh: window.innerHeight }; }));
    await p.keyboard.press('Escape'); await wait(p, 300);
  }
  ok('R-02 short viewport: Clair send control stays in view', short.every((s) => !s.missing && s.bottom <= s.vh), short);
  allMsgs.push(...cm);
  await context.close();
}

ok('no console errors (QA fix checks)', allMsgs.length === 0, allMsgs.slice(0, 3).join(' | '));
await browser.close();
let failed = 0;
for (const [c, n, e] of results) { if (!c) failed += 1; const x = typeof e === 'string' ? e : JSON.stringify(e); console.log(`${c ? '✓' : '✗'} ${n}${x ? ` (${x.slice(0, 600)})` : ''}`); }
process.exit(failed ? 1 : 0);
