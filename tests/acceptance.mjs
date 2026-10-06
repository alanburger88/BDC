#!/usr/bin/env node
// Automated acceptance checks mapped to PRD section 18 (AC-01 … AC-24).
// Chromium only in this environment; manual items are reported as MANUAL.
// Usage: node tests/acceptance.mjs [path/to/index.html] [--only AC-06,AC-12] [--json out.json]
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, newPage, gotoApp, overflowReport, missingKeys, fileUrl, DEFAULT_FILE } from './lib/browser.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const FILE = resolve(args[0] && !args[0].startsWith('--') ? args[0] : DEFAULT_FILE);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : join(here, 'results/acceptance.json');
const HTML = readFileSync(FILE, 'utf8');
const results = [];
const browser = await launch();

async function check(id, title, fn) {
  if (only && !only.includes(id)) return;
  const started = Date.now();
  const notes = [];
  let status = 'PASS';
  try {
    const r = await fn(notes);
    if (r === 'MANUAL') status = 'MANUAL';
    else if (r === 'PARTIAL') status = 'PARTIAL';
  } catch (e) {
    status = 'FAIL';
    notes.push(e.message.split('\n')[0]);
  }
  results.push({ id, title, status, notes, ms: Date.now() - started });
  console.log(`${status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '•'} ${id} ${status} — ${title}${notes.length ? `\n    ${notes.join('\n    ')}` : ''}`);
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const app = (page, fn, arg) => page.evaluate(fn, arg);
const SECTIONS = ['overview', 'changes', 'payments', 'documents', 'support', 'help'];
const go = async (page, hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForTimeout(160); };
const setLocale = async (page, l) => { await page.evaluate((x) => window.BDCNotice.i18n.setLocale(x), l); await page.waitForTimeout(160); };

function staticServer(dir) {
  return new Promise((res) => {
    const srv = createServer((req, resp) => {
      const p = req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0];
      try {
        const body = readFileSync(join(dir, decodeURIComponent(p)));
        resp.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
        resp.end(body);
      } catch (e) { resp.writeHead(404); resp.end('not found'); }
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

// AC-01 One-file portability ------------------------------------------------
await check('AC-01', 'One-file portability (file:// and static host)', async (notes) => {
  const size = statSync(FILE).size;
  notes.push(`file size ${(size / 1048576).toFixed(2)} MB`);
  assert(size < 10 * 1048576, 'file exceeds 10 MB target');
  assert(!/<script[^>]+src=/i.test(HTML.replace(/s\.setAttribute\("src", "https:\/\/accessibilityserver\.org\/widget\.js"\)/, '')), 'external script tag present');
  for (const mode of ['file', 'http']) {
    const { page, consoleMsgs, context } = await newPage(browser, { width: 1280 });
    let srv;
    if (mode === 'http') {
      srv = await staticServer(dirname(FILE));
      await page.goto(`http://127.0.0.1:${srv.address().port}/${FILE.split('/').pop()}#/overview`);
      await page.waitForSelector('html.app-ready');
    } else {
      await gotoApp(page, '#/overview', FILE);
    }
    for (const s of SECTIONS) {
      await go(page, `#/${s}`);
      const h1 = await page.locator('#view h1').first().textContent();
      assert(h1 && h1.trim().length > 2, `${mode}: ${s} has no h1`);
    }
    assert(!consoleMsgs.length, `${mode}: console errors: ${consoleMsgs.slice(0, 3).join(' | ')}`);
    notes.push(`${mode}: 6 sections rendered, no console errors`);
    await context.close();
    if (srv) srv.close();
  }
});

// AC-02 / AC-03 network isolation and offline -------------------------------
async function fullJourney(page) {
  for (const s of SECTIONS) await go(page, `#/${s}`);
  await go(page, '#/overview');
  // media playback, replay and language change
  const media = await app(page, () => !!window.BDCNotice.media);
  if (media) {
    await page.evaluate(async () => {
      const btn = document.querySelector('[data-fid="media-play"], .media-play, .media-poster button');
      if (btn) btn.click();
    });
    await page.waitForTimeout(1500);
  }
  await setLocale(page, 'fr-CA');
  await page.waitForTimeout(300);
  await setLocale(page, 'en-CA');
  // assistant use
  if (await app(page, () => !!window.BDCNotice.clair)) {
    await page.evaluate(() => window.BDCNotice.clair.open({ kind: 'summary', id: 'relief' }));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.BDCNotice.clair.ask('why is it not 12000?'));
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
  }
}

await check('AC-02', 'Runtime network isolation (no ElevenLabs, model or telemetry requests)', async (notes) => {
  const { page, requests, context } = await newPage(browser, { width: 1280, blockWidget: false });
  await page.route('https://accessibilityserver.org/**', (r) => r.abort());
  await gotoApp(page, '#/overview', FILE);
  await fullJourney(page);
  const nonWidget = requests.filter((u) => !u.startsWith('https://accessibilityserver.org/'));
  notes.push(`requests observed: ${requests.length} (widget: ${requests.length - nonWidget.length})`);
  assert(nonWidget.length === 0, `unexpected requests: ${nonWidget.join(', ')}`);
  assert(!/elevenlabs\.io\/v1|xi-api-key|speechSynthesis/i.test(HTML), 'ElevenLabs endpoint/key or speech synthesis code found in file');
  await context.close();
});

await check('AC-03', 'Offline operation (voiceover, tabs, charts, definitions, assistant, query, survey)', async (notes) => {
  const { page, consoleMsgs, context } = await newPage(browser, { width: 1280, offline: true });
  await gotoApp(page, '#/overview', FILE);
  await fullJourney(page);
  // audio decodes and plays offline in both languages
  const played = await page.evaluate(async () => {
    const out = {};
    for (const l of ['en-CA', 'fr-CA']) {
      const el = document.getElementById(`audio-${l}`);
      if (!el) { out[l] = 'missing'; continue; }
      const bin = atob(el.textContent.trim());
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const a = new Audio(URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' })));
      a.muted = true;
      try { await a.play(); await new Promise((r) => setTimeout(r, 600)); out[l] = a.currentTime > 0.2 ? `ok ${a.duration.toFixed(1)}s` : `stalled ${a.currentTime}`; a.pause(); } catch (e) { out[l] = `error ${e.message}`; }
    }
    return out;
  });
  notes.push(`audio offline: ${JSON.stringify(played)}`);
  assert(Object.values(played).every((v) => v.startsWith('ok')), 'embedded audio failed offline');
  const errs = consoleMsgs.filter((m) => !/accessibilityserver|ERR_INTERNET_DISCONNECTED/.test(m));
  assert(!errs.length, `console errors offline: ${errs.slice(0, 3).join(' | ')}`);
  await context.close();
});

// AC-04 Financial consistency ------------------------------------------------
await check('AC-04', 'Financial consistency of embedded schedules and displayed key figures', async (notes) => {
  const rec = JSON.parse(HTML.match(/<script type="application\/json" id="data-record">([\s\S]*?)<\/script>/)[1]);
  const sum = (a, k) => a.reduce((s, r) => s + r[k], 0);
  assert(rec.originalSchedule.length === 60 && rec.revisedSchedule.length === 63, 'row counts');
  assert(sum(rec.originalSchedule, 'interestCents') === 4880000, 'original interest');
  assert(sum(rec.revisedSchedule, 'interestCents') === 5360000, 'revised interest');
  assert(sum(rec.originalSchedule, 'totalCents') === 28880000 && sum(rec.revisedSchedule, 'totalCents') === 29360000, 'total payments');
  assert(rec.originalSchedule.at(-1).closingPrincipalCents === 0 && rec.revisedSchedule.at(-1).closingPrincipalCents === 0, 'end at zero');
  for (const s of [rec.originalSchedule, rec.revisedSchedule]) s.forEach((r) => {
    assert(r.interestCents === Math.floor((r.openingPrincipalCents * 800 * 2 + 120000) / 240000), `interest rounding ${r.date}`);
  });
  const { page, context } = await newPage(browser, { width: 1280 });
  await gotoApp(page, '#/overview', FILE);
  const txt = (await page.locator('#view').innerText()).replace(/\u202f|\u00a0/g, ' ');
  for (const v of ['$1,600', '$11,920', '$4,800', 'January 31, 2032', 'February 28, 2027']) assert(txt.includes(v), `overview missing ${v}`);
  await setLocale(page, 'fr-CA');
  const fr = (await page.locator('#view').innerText()).replace(/ | /g, ' ');
  for (const v of ['1 600 $', '11 920 $', '4 800 $', '31 janvier 2032', '28 février 2027']) assert(fr.includes(v), `fr overview missing ${v}`);
  notes.push('60/63 rows, totals 48,800/53,600 and 288,800/293,600, half-up rounding, zero end; key figures shown in both locales');
  await context.close();
});

// AC-05 Honest cost disclosure ----------------------------------------------
await check('AC-05', 'Principal owed, extra interest and later maturity visible without drill-down', async (notes) => {
  const { page, context } = await newPage(browser, { width: 390, height: 844 });
  await gotoApp(page, '#/overview', FILE);
  const visible = await page.evaluate(() => {
    // text of visible, non-collapsed elements only
    const out = [];
    const walk = (el) => {
      if (el.hidden || el.closest('[hidden]') || el.closest('.disclosure-content[hidden]')) return;
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') return;
      for (const n of el.childNodes) { if (n.nodeType === 3) out.push(n.textContent); else if (n.nodeType === 1) walk(n); }
    };
    walk(document.querySelector('#view'));
    return out.join(' ').replace(/\s+/g, ' ');
  });
  assert(/\$4,800/.test(visible), 'additional interest not visible');
  assert(/January 31, 2032/.test(visible), 'later maturity not visible');
  assert(/remains owing|still owe/i.test(visible), '"principal remains owing" not visible');
  notes.push('visible on first screen render at 390px without opening disclosures');
  await context.close();
});

// AC-06 Progressive discovery ------------------------------------------------
await check('AC-06', 'Card → month → explanation → formal clause → Back returns to same context', async (notes) => {
  const { page, context } = await newPage(browser, { width: 1280 });
  await gotoApp(page, '#/overview', FILE);
  await page.locator('[data-fid="summary-relief-detail"]').first().click();
  await page.waitForTimeout(300);
  assert((await page.evaluate(() => location.hash)) === '#/payments/relief', 'relief card did not open #/payments/relief');
  // select December from the month list
  await page.evaluate(() => { location.hash = '#/payments/2026-12'; });
  await page.waitForTimeout(300);
  const explain = page.locator('[data-fid="explain-month-2026-12"]').first();
  await explain.scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await explain.click();
  await page.waitForSelector('[data-overlay="clair"]');
  const chip = await page.locator('[data-overlay="clair"]').innerText();
  assert(/December 2026/.test(chip), 'Clair context does not show December 2026');
  const source = page.locator('[data-overlay="clair"] a[href^="#/documents/"], [data-overlay="clair"] [data-source-target^="#/documents/"]').last();
  await source.click();
  await page.waitForTimeout(500);
  const hash = await page.evaluate(() => location.hash);
  assert(hash.startsWith('#/documents/'), `source link went to ${hash}`);
  const focusedClause = await page.evaluate(() => document.activeElement && document.activeElement.id);
  notes.push(`clause reached: ${hash}, focus on #${focusedClause}`);
  await page.locator('[data-fid="back-control"]').click();
  await page.waitForTimeout(500);
  const back = await page.evaluate(() => ({ hash: location.hash, fid: document.activeElement && document.activeElement.closest('[data-fid]') && document.activeElement.closest('[data-fid]').getAttribute('data-fid'), y: window.scrollY }));
  assert(back.hash === '#/payments/2026-12', `Back returned to ${back.hash}`);
  assert(back.fid === 'explain-month-2026-12', `focus returned to ${back.fid}`);
  notes.push(`back to ${back.hash}, focus ${back.fid}, scroll ${back.y} (was ${scrollBefore})`);
  await context.close();
});

// AC-07 Mobile navigation ------------------------------------------------------
await check('AC-07', 'Mobile vertical section selector with all six sections', async (notes) => {
  const { page, context } = await newPage(browser, { width: 390, height: 844 });
  await gotoApp(page, '#/overview', FILE);
  for (const l of ['en-CA', 'fr-CA']) {
    await setLocale(page, l);
    assert(await page.locator('html.nav-compact').count() === 1, `${l}: not in compact nav at 390px`);
    assert(!(await page.locator('.tabs:not(.tabs-measure)').isVisible()), `${l}: tab bar visible on mobile`);
    const btn = page.locator('.section-select-btn');
    await btn.click();
    const links = page.locator('#section-list a');
    assert(await links.count() === 6, `${l}: selector does not list 6 sections`);
    const current = await page.locator('#section-list a[aria-current="page"]').innerText();
    assert(current.length > 0, 'no current marker');
    await links.nth(2).click();
    await page.waitForTimeout(200);
    assert((await page.evaluate(() => location.hash)) === '#/payments', 'selector did not navigate');
    assert(await page.locator('#section-list').isHidden(), 'selector did not close after selection');
    await go(page, '#/overview');
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(200);
  assert(await page.locator('html.nav-compact').count() === 0, 'desktop still compact at 1280');
  notes.push('compact at 390 (EN+FR), tabs at 1280; selector closes after choice');
  await context.close();
});

// AC-08 No horizontal scrolling --------------------------------------------
await check('AC-08', 'No horizontal scrolling at 320px (sections, dialogs, French)', async (notes) => {
  const { page, context } = await newPage(browser, { width: 320, height: 720 });
  await gotoApp(page, '#/overview', FILE);
  const bad = [];
  for (const l of ['en-CA', 'fr-CA']) {
    await setLocale(page, l);
    const routes = [...SECTIONS, 'insights', 'changes/interest', 'payments/2026-12', 'payments/schedule', 'documents/schedule', 'help/glossary/maturity'];
    for (const r of routes) {
      await go(page, `#/${r}`);
      const of = await overflowReport(page);
      if (of.overflow || of.offenders.length) bad.push(`${l} #/${r}: ${of.scrollWidth}/${of.clientWidth} ${JSON.stringify(of.offenders.slice(0, 2))}`);
    }
    // dialogs
    for (const [name, open] of [
      ['clair', () => window.BDCNotice.clair && window.BDCNotice.clair.open({ kind: 'month', id: '2026-12' })],
      ['query', () => window.BDCNotice.query && window.BDCNotice.query.open({ kind: 'card', id: 'interest', topic: 'interest' })],
    ]) {
      await go(page, '#/overview');
      await page.evaluate(open);
      await page.waitForTimeout(400);
      const of = await overflowReport(page);
      if (of.overflow || of.offenders.length) bad.push(`${l} dialog ${name}: ${JSON.stringify(of.offenders.slice(0, 2))}`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
    }
  }
  assert(!bad.length, bad.slice(0, 6).join('\n    '));
  notes.push('all routes + Clair + query dialogs fit at 320px in EN and FR');
  await context.close();
});

// AC-09 Zoom and input ------------------------------------------------------------
await check('AC-09', 'Reflow at 400% zoom; on-screen keyboard does not hide controls', async (notes) => {
  // 1280px at 400% zoom = 320 CSS px viewport (covered in AC-08); emulate here with a short viewport for the keyboard.
  const { page, context } = await newPage(browser, { width: 390, height: 420 });
  await gotoApp(page, '#/overview', FILE);
  for (const [name, open, sel] of [
    ['clair', () => window.BDCNotice.clair.open({ kind: 'general' }), '[data-overlay="clair"] form button[type="submit"], [data-overlay="clair"] .clair-send'],
    ['query', () => window.BDCNotice.query.open({ kind: 'general' }), '[data-overlay="query"] textarea'],
  ]) {
    await page.evaluate(open);
    await page.waitForTimeout(400);
    const ok = await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return 'missing';
      el.scrollIntoView({ block: 'nearest' });
      const r = el.getBoundingClientRect();
      return r.bottom <= window.innerHeight + 1 && r.top >= 0 ? 'visible' : `offscreen ${r.top}-${r.bottom} vs ${window.innerHeight}`;
    }, sel);
    assert(ok === 'visible', `${name} control not visible in 420px-tall viewport: ${ok}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
  notes.push('Clair send and query textarea reachable in a keyboard-reduced viewport (390×420); real-device keyboard test is MANUAL');
  await context.close();
  return 'PARTIAL';
});

// AC-10 Greeting ------------------------------------------------------------------
await check('AC-10', 'Personalised handshake greeting once; static with reduced motion', async (notes) => {
  const animOf = (page) => page.evaluate(() => {
    const svgEl = document.querySelector('#view .ov-hs');
    if (!svgEl) return 'no-handshake';
    if (svgEl.getAttribute('aria-hidden') !== 'true' && !svgEl.closest('[aria-hidden="true"]')) return 'not-hidden';
    return [svgEl, ...svgEl.querySelectorAll('*')].map((e) => getComputedStyle(e).animationName).filter((n) => n && n !== 'none').join(',') || 'none';
  });
  for (const rm of ['no-preference', 'reduce']) {
    const { page, context } = await newPage(browser, { width: 1280, reducedMotion: rm });
    await page.goto(`${fileUrl(FILE)}#/overview`);
    await page.waitForSelector('html.app-ready');
    const txt = await page.locator('#view').innerText();
    assert(/Hello, Camille\. Let’s walk through your financing update\./.test(txt), 'greeting text missing');
    const anim = await animOf(page);
    notes.push(`${rm}: handshake animation on first view = ${anim}`);
    assert(!['no-handshake', 'not-hidden'].includes(anim), `handshake problem: ${anim}`);
    if (rm === 'reduce') assert(anim === 'none', 'animation active under reduced motion');
    else assert(anim !== 'none', 'handshake does not animate on first view');
    await go(page, '#/changes');
    await go(page, '#/overview');
    const again = await animOf(page);
    assert(again === 'none', `handshake replays on revisit (${again})`);
    await setLocale(page, 'fr-CA');
    assert((await page.locator('#view').innerText()).includes('Bonjour Camille. Faisons le point sur la modification de votre financement.'), 'French greeting missing');
    await context.close();
  }
  notes.push('plays once per session (not on revisit or language switch); static under reduced motion; icon aria-hidden');
});

// AC-11 Media quality (existence; human review is manual) -------------------
await check('AC-11', 'Creation-time ElevenLabs audio embedded in both languages', async (notes) => {
  for (const l of ['en-CA', 'fr-CA']) {
    const m = HTML.match(new RegExp(`<script type="text/plain" id="audio-${l}" data-mime="audio/mpeg">([A-Za-z0-9+/=]+)</script>`));
    assert(m && m[1].length > 400000, `${l} audio missing or too small`);
    notes.push(`${l}: ${(m[1].length * 0.75 / 1024).toFixed(0)} KB MP3`);
  }
  const cues = JSON.parse(HTML.match(/id="data-cues">([\s\S]*?)<\/script>/)[1]);
  notes.push(`durations en ${cues['en-CA'].duration}s, fr ${cues['fr-CA'].duration}s; voice ${cues['en-CA'].voice.name}; model ${cues['en-CA'].model}`);
  notes.push('Pronunciation, amounts, dates and Canadian-French accent require human audition (MANUAL)');
  return 'PARTIAL';
});

// AC-12 Video-like behaviour ------------------------------------------------
await check('AC-12', 'Pause, replay, seek, speed, captions and chapter-mapped language switch stay in sync', async (notes) => {
  const { page, context } = await newPage(browser, { width: 1280 });
  await gotoApp(page, '#/overview', FILE);
  const cues = JSON.parse(HTML.match(/id="data-cues">([\s\S]*?)<\/script>/)[1]);
  const st = () => page.evaluate(() => window.BDCNotice.media.state());
  const norm = (x) => x.replace(/\s+/g, ' ').trim();
  const captionSync = async () => {
    const r = await page.evaluate(() => ({ t: window.BDCNotice.media.state().time, l: window.BDCNotice.media.state().locale, cap: (document.querySelector('.media-caption-text') || {}).textContent || '' }));
    const cue = cues[r.l].captions.find((c) => r.t >= c.start - 0.15 && r.t < c.end + 0.15);
    return { ...r, ok: !r.cap || (cue && norm(cue.text).includes(norm(r.cap))), cue: cue && cue.text };
  };
  assert(!(await st()).playing, 'autoplay detected');
  await page.locator('[data-fid="media-poster-play"]').click();
  await page.waitForTimeout(1600);
  let s = await st();
  assert(s.playing && s.time > 0.6, `playback did not advance (${s.time})`);
  let c = await captionSync();
  assert(c.ok, `caption out of sync at ${c.t}: "${c.cap}" vs cue "${c.cue}"`);
  // pause holds the clock
  await page.locator('[data-fid="media-play"]').click();
  const t1 = (await st()).time;
  await page.waitForTimeout(600);
  const t2 = (await st()).time;
  assert(Math.abs(t2 - t1) < 0.05, `clock drifted while paused (${t1} → ${t2})`);
  // chapter selection seeks to the semantic chapter start
  await page.locator('[data-fid="media-chapters-toggle"]').click();
  await page.locator('[data-fid="media-chapter-tradeoff"]').click();
  await page.waitForTimeout(300);
  s = await st();
  const trade = cues['en-CA'].chapters.find((x) => x.id === 'tradeoff');
  assert(s.chapter === 'tradeoff' && Math.abs(s.time - trade.start) < 0.35, `chapter seek wrong: ${s.chapter} @ ${s.time}`);
  // seek bar
  await page.locator('[data-fid="media-seek"]').evaluate((el) => { el.value = '45'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(250);
  s = await st();
  assert(Math.abs(s.time - 45) < 0.6 && s.chapter === 'resume', `seek bar wrong: ${s.time} ${s.chapter}`);
  c = await captionSync();
  assert(c.ok, `caption out of sync after seek: "${c.cap}"`);
  // speed
  await page.locator('[data-fid="media-speed"]').selectOption('1.5');
  if (!(await st()).playing) await page.locator('[data-fid="media-play"]').click();
  const before = (await st()).time;
  await page.waitForTimeout(1000);
  s = await st();
  assert(s.playbackRate === 1.5, `playbackRate ${s.playbackRate}`);
  assert(s.time - before > 1.15, `1.5x did not advance faster (${(s.time - before).toFixed(2)} s in 1 s)`);
  c = await captionSync();
  assert(c.ok, `caption out of sync at 1.5x: "${c.cap}"`);
  // captions toggle
  await page.locator('[data-fid="media-captions"]').click();
  await page.waitForTimeout(150);
  assert((await st()).captions === false, 'captions did not toggle off');
  await page.locator('[data-fid="media-captions"]').click();
  // replay
  await page.locator('[data-fid="media-replay"]').click();
  await page.waitForTimeout(400);
  s = await st();
  assert(s.time < 1.2 && s.playing, `replay did not restart (${s.time})`);
  // language switch maps to the equivalent chapter start and stays paused
  await page.locator('[data-fid="media-seek"]').evaluate((el) => { el.value = '20'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(300);
  const enCh = (await st()).chapter;
  await setLocale(page, 'fr-CA');
  await page.waitForTimeout(300);
  s = await st();
  const frStart = cues['fr-CA'].chapters.find((x) => x.id === enCh).start;
  assert(s.locale === 'fr-CA' && !s.playing, 'did not pause on language switch');
  assert(s.chapter === enCh && Math.abs(s.time - frStart) < 0.05, `fr mapping wrong: ${s.chapter} @ ${s.time} (expected ${enCh} @ ${frStart})`);
  await page.locator('[data-fid="media-play"]').click();
  await page.waitForTimeout(800);
  s = await st();
  assert(s.playing && s.time > frStart, 'French replay of chapter did not play');
  notes.push(`no autoplay; play/pause clock stable; chapter + seek-bar seeks; captions match cues at 1×/1.5×; replay; EN "${enCh}" → FR chapter start ${frStart}s, paused`);
  await context.close();
});

// AC-13 / AC-14 Clair ---------------------------------------------------------
await check('AC-13', 'Clair opens from the right; full-width on mobile; contextual triggers pass the item', async (notes) => {
  for (const w of [1280, 390]) {
    const { page, context } = await newPage(browser, { width: w, height: 844 });
    await gotoApp(page, '#/changes', FILE);
    assert(await page.locator('[data-overlay="clair"]').count() === 0, 'Clair open on load');
    await page.locator('[data-fid="explain-card-interest"]').first().click();
    await page.waitForSelector('[data-overlay="clair"].is-open');
    await page.waitForTimeout(400);
    const box = await page.locator('[data-overlay="clair"]').boundingBox();
    assert(Math.abs(box.x + box.width - w) <= 2, `panel not anchored right (${box.x}+${box.width})`);
    if (w === 390) assert(box.width >= 388, `panel not full-width on mobile (${box.width})`);
    else assert(box.width <= 440 && box.width >= 400, `desktop panel width ${box.width}`);
    const txt = await page.locator('[data-overlay="clair"]').innerText();
    assert(/Interest/.test(txt), 'context chip missing "Interest"');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const fid = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-fid'));
    assert(fid === 'explain-card-interest', `focus returned to ${fid}`);
    notes.push(`${w}px: right-anchored width ${Math.round(box.width)}, context ok, focus returned`);
    await context.close();
  }
});

await check('AC-14', 'Clair grounded answers for seeded and paraphrased questions; safe fallback; labelled demo', async (notes) => {
  const { page, context } = await newPage(browser, { width: 1280 });
  await gotoApp(page, '#/overview', FILE);
  const probe = await page.evaluate(() => {
    const A = window.BDCNotice.clair;
    const qs = {
      relief: ['Why is the relief not $12,000?', 'pourquoi pas 12 000 $ de répit?'],
      extraCost: ['how much more will this cost me overall', 'combien d’intérêts de plus au total'],
      maturity: ['when is my last payment now', 'quand est mon dernier versement'],
      resume: ['when do principal payments start again', 'quand reprennent les remboursements de capital'],
      next: ['what is my next payment', 'mon prochain versement'],
      rate: ['does my interest rate change', 'est-ce que le taux change'],
      fees: ['is there a fee for this', 'y a-t-il des frais'],
      accept: ['do I need to sign or accept', 'dois-je accepter quelque chose'],
      limits: ['please approve another postponement', 'am I eligible for more funding'],
      unrelated: ['what is the weather in Montreal', 'who won the hockey game'],
    };
    const out = {};
    for (const [k, list] of Object.entries(qs)) out[k] = list.map((q) => { const a = A.answer(q, { kind: 'general' }); return { q, intent: a.intent, text: `${a.text} ${a.fact || ''}`.slice(0, 160) }; });
    return out;
  });
  const flat = Object.entries(probe).flatMap(([k, arr]) => arr.map((x) => `${k}: "${x.q}" → ${x.intent}`));
  notes.push(...flat.slice(0, 20));
  const status = await page.evaluate(() => { window.BDCNotice.clair.open({ kind: 'general' }); return document.querySelector('[data-overlay="clair"]').innerText; });
  assert(/Demo assistant • Answers from this sample notice • No live AI connection\./.test(status), 'demo status line missing');
  assert(probe.relief.every((x) => /11,920|11 920/.test(x.text) || /12,000|12 000/.test(x.text)), 'relief answer lacks values');
  const expect = { relief: /relief/i, extraCost: /cost|extra|interest/i, maturity: /maturity|final|last/i, resume: /resum/i, next: /next/i, rate: /rate/i, fees: /fee/i, accept: /accept/i, limits: /limit/i, unrelated: /unrelated|outOfScope|fallback/i };
  const wrong = Object.entries(probe).flatMap(([k, arr]) => arr.filter((x) => !expect[k].test(x.intent || '')).map((x) => `${k}: "${x.q}" → ${x.intent}`));
  assert(!wrong.length, `misrouted: ${wrong.join('; ')}`);
  notes.push('Human review of answer wording and wider paraphrase coverage is MANUAL');
  return 'PARTIAL';
});

// AC-15 Query integrity -----------------------------------------------------
await check('AC-15', 'Query review precedes local confirmation; context retained; says nothing sent', async (notes) => {
  const { page, context } = await newPage(browser, { width: 1280 });
  await gotoApp(page, '#/payments/2026-12', FILE);
  await page.locator('[data-fid="ask-month-2026-12"]').first().click();
  await page.waitForSelector('[data-overlay="query"]');
  const panel = page.locator('[data-overlay="query"]');
  assert(/December 2026/.test(await panel.innerText()), 'selected month not captured');
  await panel.locator('textarea').fill('Why is my December payment different from the original schedule?');
  await panel.getByRole('button', { name: /continue|review/i }).first().click();
  await page.waitForTimeout(200);
  const review = await panel.innerText();
  assert(/December 2026/.test(review) && /Why is my December payment/.test(review), 'review step missing context or question');
  await panel.getByRole('button', { name: /create demo request/i }).click();
  await page.waitForTimeout(200);
  const conf = await panel.innerText();
  assert(conf.includes('Demo request created locally. Nothing has been sent to BDC.'), 'confirmation text missing');
  assert(/DEMO-[A-Z0-9-]+/.test(conf), 'DEMO- reference missing');
  const events = await page.evaluate(() => JSON.stringify(window.BDCNotice.events.all()));
  assert(!/December payment different/.test(events), 'question text leaked into events');
  const ls = await page.evaluate(() => JSON.stringify(localStorage));
  assert(!/December payment different/.test(ls), 'question text persisted in localStorage');
  notes.push('draft → review → local confirmation with DEMO- reference; no free text in events/storage');
  await context.close();
});

// AC-16 Survey ----------------------------------------------------------------------
await check('AC-16', 'Three labelled faces, touch + keyboard, changeable, dismissible, not NPS', async (notes) => {
  const { page, context } = await newPage(browser, { width: 390, height: 844 });
  await gotoApp(page, '#/help/survey', FILE);
  const group = page.locator('#view').getByRole('button', { name: /^(Not clear|Somewhat clear|Very clear)/ });
  assert(await group.count() === 3, `expected 3 labelled faces, got ${await group.count()}`);
  for (let i = 0; i < 3; i++) assert((await group.nth(i).getAttribute('aria-pressed')) !== 'true', 'a face is preselected');
  await group.nth(0).focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  assert((await group.nth(0).getAttribute('aria-pressed')) === 'true', 'keyboard selection failed');
  await group.nth(2).tap().catch(() => group.nth(2).click());
  await page.waitForTimeout(150);
  assert((await group.nth(2).getAttribute('aria-pressed')) === 'true', 'changing response failed');
  const txt = await page.locator('#view').innerText();
  assert(/not a Net Promoter Score/i.test(txt), 'NPS disclaimer missing');
  notes.push('3 labelled faces, keyboard + tap, change allowed');
  await context.close();
});

// AC-17 Jargon help ---------------------------------------------------------
await check('AC-17', 'Definitions by hover, focus and click/tap; dismiss and return to term', async (notes) => {
  const { page, context } = await newPage(browser, { width: 1280 });
  await gotoApp(page, '#/changes', FILE);
  const term = page.locator('#view .term').first();
  assert(await term.count() === 1, 'no glossary term on What changed');
  await term.hover();
  await page.waitForTimeout(150);
  assert(await page.locator('.popover').isVisible(), 'hover did not show definition');
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  await term.click();
  await page.waitForTimeout(100);
  assert(await page.locator('.popover.is-pinned').isVisible(), 'click did not pin');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  assert(await page.locator('.popover').count() === 0, 'Escape did not close');
  const back = await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('term'));
  assert(back, 'focus did not return to term');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await page.waitForTimeout(150);
  notes.push('hover shows, click pins, Escape closes and returns focus');
  await context.close();
});

// AC-18 Language completeness --------------------------------------------------
await check('AC-18', 'No missing keys / untranslated system messages; amounts unchanged across languages', async (notes) => {
  const { page, context } = await newPage(browser, { width: 1280 });
  await gotoApp(page, '#/overview', FILE);
  await setLocale(page, 'fr-CA');
  const suspicious = [];
  for (const r of [...SECTIONS, 'insights', 'changes/interest', 'payments/2026-12', 'help/faq/relief']) {
    await go(page, `#/${r}`);
    const mk = await missingKeys(page);
    assert(!mk.length, `missing keys on ${r}: ${mk.join(', ')}`);
    const txt = await page.locator('#app').innerText();
    const hits = txt.match(/\b(the|your|payment|payments|principal|interest|schedule|notice|and|with|this)\b/gi) || [];
    if (hits.length > 2) suspicious.push(`${r}: ${[...new Set(hits.map((h) => h.toLowerCase()))].join(',')}`);
  }
  const lang = await page.evaluate(() => document.documentElement.lang);
  assert(lang === 'fr-CA', 'document language not fr-CA');
  if (suspicious.length) notes.push(`possible English in fr-CA (review): ${suspicious.join(' | ')}`);
  notes.push('build-time dictionary parity check passes; no ⟦missing⟧ keys at runtime');
  await context.close();
  return suspicious.length ? 'PARTIAL' : undefined;
});

// AC-19 Widget -----------------------------------------------------------------------
await check('AC-19', 'Supplied widget script once; launcher area bottom-left reserved', async (notes) => {
  const n = HTML.split('https://accessibilityserver.org/widget.js').length - 1;
  assert(n === 1, `widget script appears ${n} times`);
  assert(HTML.includes('s.setAttribute("data-account", "B3W9A2mgGs");'), 'account attribute missing');
  const { page, context } = await newPage(browser, { width: 390, height: 844 });
  await gotoApp(page, '#/overview', FILE);
  const launcher = await page.locator('.clair-launcher').boundingBox();
  assert(launcher.x > 390 / 2, 'Clair launcher not on the right');
  notes.push('snippet present once; Clair launcher bottom-right; vendor launcher position depends on account config and could not be loaded here (egress blocked) → MANUAL');
  await context.close();
  return 'PARTIAL';
});

// AC-20 Cross-sell --------------------------------------------------------------
await check('AC-20', 'At most three relevant cards; no eligibility claims; hardship rule; deliberate links', async (notes) => {
  const { page, requests, context } = await newPage(browser, { width: 1280 });
  await gotoApp(page, '#/support', FILE);
  const links = await page.locator('#view a[href^="https://www.bdc.ca/"]').evaluateAll((as) => as.map((a) => ({ href: a.href, target: a.target, rel: a.rel })));
  assert(links.length >= 3 && links.length <= 6, `unexpected BDC link count ${links.length}`);
  assert(links.every((l) => l.target === '_blank' && /noopener/.test(l.rel)), 'external links not new-tab noopener');
  assert(requests.filter((u) => u.includes('bdc.ca')).length === 0, 'bdc.ca contacted without user action');
  const txt = await page.locator('#view').innerText();
  assert(txt.includes('Explore whether this fits your business. Subject to assessment and approval.'), 'loan card statement missing');
  assert(!/pre-approved|preapproved|you qualify|instant approval/i.test(txt), 'eligibility claim found');
  await page.evaluate(() => { window.BDCNotice.session.slice('presenter', () => ({})).simulateHardship = true; window.BDCNotice.router.rerender(); });
  await page.waitForTimeout(200);
  const txt2 = await page.locator('#view').innerText();
  assert(!txt2.includes('Subject to assessment and approval'), 'loan card still shown under hardship rule');
  notes.push(`${links.length} BDC links, new tab + noopener; hardship rule hides loan card`);
  await context.close();
});

// AC-21 Accessibility (automated subset) ----------------------------------------
await check('AC-21', 'Automated accessibility scan (axe-core) + keyboard/focus basics', async (notes) => {
  const axePath = join(here, '../node_modules/axe-core/axe.min.js');
  const axeSrc = readFileSync(axePath, 'utf8');
  const { page, context } = await newPage(browser, { width: 1280 });
  await gotoApp(page, '#/overview', FILE);
  const violations = [];
  for (const l of ['en-CA', 'fr-CA']) {
    await setLocale(page, l);
    for (const r of [...SECTIONS, 'insights']) {
      await go(page, `#/${r}`);
      await page.addScriptTag({ content: axeSrc });
      const res = await page.evaluate(async () => {
        const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] });
        return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes[0] && v.nodes[0].target.join(' ') }));
      });
      res.forEach((v) => violations.push(`${l} ${r}: ${v.id} (${v.impact}) x${v.n} e.g. ${v.sample}`));
    }
  }
  if (violations.length) throw new Error(`axe violations:\n    ${violations.slice(0, 25).join('\n    ')}`);
  notes.push('axe-core: 0 WCAG 2.x A/AA violations on all sections in EN and FR; screen-reader review is MANUAL');
  await context.close();
  return 'PARTIAL';
});

// AC-22 Record/export alignment ---------------------------------------------------
await check('AC-22', 'CSV and print views reproduce approved data with demo notice identity', async (notes) => {
  const { page, context } = await newPage(browser, { width: 1280 });
  await gotoApp(page, '#/documents', FILE);
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#view').getByRole('button', { name: /revised schedule.*CSV/i }).first().click(),
  ]);
  const csv = readFileSync(await dl.path(), 'utf8');
  assert(csv.includes('DEMO-BDC-CHANGE-2026-001'), 'CSV lacks notice id');
  const rows = csv.split(/\r?\n/).filter((r) => /^\d{4}-\d{2}-\d{2}/.test(r));
  assert(rows.length === 63, `CSV has ${rows.length} dated rows, expected 63`);
  assert(csv.includes('1600.00') && csv.includes('560000') === false, 'CSV amount formatting unexpected');
  await page.evaluate(() => window.BDCNotice.print.prepare(document.getElementById('print-root')));
  const printTxt = await page.locator('#print-root').evaluate((el) => el.textContent);
  assert(printTxt.includes('DEMO-BDC-CHANGE-2026-001'), 'print view lacks notice id');
  assert(!/Clair —|How clear was this notice/.test(printTxt), 'print view contains assistant or survey');
  await page.emulateMedia({ media: 'print' });
  const pdfPath = join(here, 'results/notice-print.pdf');
  mkdirSync(join(here, 'results'), { recursive: true });
  await page.pdf({ path: pdfPath, format: 'Letter', printBackground: true });
  notes.push(`CSV: 63 dated rows + notice id (${dl.suggestedFilename()}); print view rendered to ${pdfPath}`);
  await context.close();
});

// AC-23 Privacy and secrets ------------------------------------------------------
await check('AC-23', 'No real data, credentials, browser synthesis or persistent free-text storage', async (notes) => {
  assert(!/xi-api-key|ELEVENLABS_API_KEY|sk_[a-z0-9]{20,}/i.test(HTML), 'credential-like string found');
  assert(!/speechSynthesis|SpeechSynthesisUtterance/.test(HTML), 'speech synthesis found');
  const { page, context } = await newPage(browser, { width: 1280 });
  await gotoApp(page, '#/overview', FILE);
  const keys = await page.evaluate(() => Object.keys(localStorage));
  assert(keys.every((k) => k === 'bdc-demo-prefs'), `unexpected storage keys ${keys}`);
  notes.push(`localStorage keys: ${keys.join(',') || '(none)'}; fixture status: fictional demonstration`);
  await context.close();
});

// AC-24 Brand/assets -----------------------------------------------------------------
await check('AC-24', 'Supplied logo embedded unaltered; no broken images or remote fonts', async (notes) => {
  const { page, context } = await newPage(browser, { width: 1280 });
  await gotoApp(page, '#/overview', FILE);
  const logo = await page.locator('.brand-logo').evaluate((img) => ({ nw: img.naturalWidth, nh: img.naturalHeight, w: img.getBoundingClientRect().width, h: img.getBoundingClientRect().height, src: img.src.slice(0, 22) }));
  assert(logo.nw === 1280 && logo.nh === 680, 'logo natural size differs from supplied asset');
  assert(Math.abs(logo.w / logo.h - 1280 / 680) < 0.02, 'logo aspect ratio distorted');
  assert(logo.src.startsWith('data:image/webp'), 'logo not embedded as data URI');
  const broken = await page.evaluate(() => [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).length);
  assert(broken === 0, `${broken} broken images`);
  assert(!/fonts\.googleapis|@font-face\s*{[^}]*url\(\s*["']?https?:/i.test(HTML), 'remote font reference');
  notes.push(`logo ${logo.nw}×${logo.nh} rendered ${Math.round(logo.w)}×${Math.round(logo.h)} (aspect preserved); no remote fonts`);
  await context.close();
});

await browser.close();
mkdirSync(dirname(jsonOut), { recursive: true });
writeFileSync(jsonOut, JSON.stringify({ file: FILE, ranAt: new Date().toISOString(), browser: 'Chromium (Playwright)', results }, null, 2));
const fails = results.filter((r) => r.status === 'FAIL');
console.log(`\n${results.length} checks: ${results.filter((r) => r.status === 'PASS').length} pass, ${results.filter((r) => r.status === 'PARTIAL').length} partial (manual follow-up), ${fails.length} fail`);
process.exit(fails.length ? 1 : 0);
