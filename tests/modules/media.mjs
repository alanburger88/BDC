#!/usr/bin/env node
// Media module QA: the personalised animated explanation player.
// Poster (no autoplay), lazy audio decoding, playback clock vs scenes and
// captions, seeking, chapters, speed, captions/transcript toggles, keyboard,
// mute/volume, replay, chapter-mapped language switching, pausing on leaving
// the overview, end card actions, session reset, reduced motion, offline
// playback, network isolation, layout at 320-1280 px in both languages,
// forced colours (Windows High Contrast), and the missing-audio error path
// (built here with --silent-audio).
//
// Usage: node tests/modules/media.mjs [path/to/index.html] [--shots dir]
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, newPage, gotoApp, overflowReport, missingKeys, DEFAULT_FILE } from '../lib/browser.mjs';

const args = process.argv.slice(2);
const file = args[0] && !args[0].startsWith('--') ? args[0] : DEFAULT_FILE;
const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

const results = [];
const ok = (name, cond, extra = '') => {
  results.push([!!cond, name]);
  console.log(`${cond ? '✓' : '✗'} ${name}${!cond && extra ? `  → ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`);
};
const wait = (page, ms) => page.waitForTimeout(ms);

/* ---------- helpers ---------- */

// The overview module mounts the player itself; an isolated build (no
// overview module) gets a harness view that mounts it the same way - into a
// container that is not yet attached to the document, exactly like the
// overview's mediaSection() does.
async function ensurePlayer(page) {
  if (await page.evaluate(() => !!document.querySelector('.media-player'))) return 'overview';
  await page.evaluate(() => {
    const App = window.BDCNotice;
    const mods = App.build && App.build.modules;
    if (Array.isArray(mods) && !mods.includes('overview')) {
      App.router.registerView('overview', {
        render(el) {
          el.append(App.ui.sectionHeader({ title: 'Media harness' }));
          const c = document.createElement('div');
          c.className = 'media-harness';
          App.media.mount(c); // detached, like the overview
          el.append(h2Wrap(c));
          function h2Wrap(m) { const sec = document.createElement('section'); const hd = document.createElement('h2'); hd.textContent = 'Harness'; sec.append(hd, m); return sec; }
        },
      });
    } else {
      let c = document.querySelector('.media-harness');
      if (!c) { c = document.createElement('div'); c.className = 'media-harness'; document.getElementById('view').after(c); }
      App.media.mount(c);
    }
  });
  await page.waitForSelector('.media-player');
  return 'harness';
}

async function clickFid(page, fid) {
  const loc = page.locator(`.media-player [data-fid="${fid}"], [data-fid="${fid}"]`).first();
  await loc.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await loc.click();
}

async function setRange(page, cls, value) {
  await page.evaluate(([c, v]) => {
    const el = document.querySelector(`.media-player ${c}`);
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, [cls, value]);
}

const state = (page) => page.evaluate(() => window.BDCNotice.media.state());

// What the cues say should be visible at the current clock time, next to
// what the player actually shows.
const snapshot = (page) => page.evaluate(() => {
  const App = window.BDCNotice;
  const st = App.media.state();
  const cues = App.readEmbeddedJSON('data-cues')[st.locale];
  const tm = st.time;
  const ch = [...cues.chapters].reverse().find((c) => tm + 0.002 >= c.start) || cues.chapters[0];
  const caps = cues.captions.filter((c) => c.chapter === ch.id);
  let cap = caps[0];
  for (const c of caps) if (tm + 0.1 >= c.start) cap = c;
  const capEl = document.querySelector('.media-player .media-caption-text');
  const capBar = document.querySelector('.media-player .media-caption');
  return {
    st,
    expectedChapter: ch.id,
    expectedCaption: cap ? cap.text : '',
    active: [...document.querySelectorAll('.media-player .media-scene.is-active')].map((s) => s.dataset.scene),
    caption: capEl ? capEl.textContent : '',
    captionVisible: !!(capBar && !capBar.hidden && capEl && !capEl.hidden && capEl.getClientRects().length),
    valuetext: document.querySelector('.media-player .media-seek').getAttribute('aria-valuetext'),
    timeText: document.querySelector('.media-player .media-time').textContent,
    chapterLabel: document.querySelector('.media-player .media-chapter-label').textContent,
  };
});
const inSync = (s) => s.active.length === 1 && s.active[0] === s.expectedChapter && s.st.chapter === s.expectedChapter && !!s.caption && s.expectedCaption.includes(s.caption);
// "0:41 / 1:00" (visible clock) -> "0 min 41 s of 1 min 0 s" (seek bar value text)
const spokenOf = (timeText, word) => timeText.split(' / ').map((x) => { const [m, sec] = x.split(':'); return `${Number(m)} min ${Number(sec)} s`; }).join(` ${word} `);
const cueData = (page, locale) => page.evaluate((l) => window.BDCNotice.readEmbeddedJSON('data-cues')[l], locale);
const events = (page) => page.evaluate(() => window.BDCNotice.events.all().map((e) => `${e.type}:${e.id}`));

// Overflow inside the player (always), and of the document (isolated builds).
async function mediaOverflow(page, mode) {
  const of = await overflowReport(page);
  const media = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out = [];
    document.querySelectorAll('.media-player, .media-player *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return;
      if (r.right > vw + 1 || r.left < -1) out.push(`${el.tagName.toLowerCase()}.${String(el.className.baseVal !== undefined ? el.className.baseVal : el.className).split(' ')[0]} ${Math.round(r.left)}-${Math.round(r.right)}`);
    });
    return out.slice(0, 6);
  });
  return { media, doc: mode === 'harness' && (of.overflow || of.offenders.length) ? of : null };
}

const browser = await launch();

/* ======================================================================
 * 1. Main journey (en-CA, 1280 px)
 * ==================================================================== */
const main = await newPage(browser, { width: 1280, height: 900 });
const { page } = main;
await gotoApp(page, '#/overview', file);
await page.evaluate(() => { if (window.BDCNotice.i18n.locale !== 'en-CA') window.BDCNotice.i18n.setLocale('en-CA'); });
await wait(page, 150);
const mode = await ensurePlayer(page);
console.log(`(player mounted by ${mode})`);
const enCues = await cueData(page, 'en-CA');
const frCues = await cueData(page, 'fr-CA');
const enCh = Object.fromEntries(enCues.chapters.map((c) => [c.id, c]));
const frCh = Object.fromEntries(frCues.chapters.map((c) => [c.id, c]));

// Poster, no autoplay, deferred decoding
let s = await state(page);
const poster = await page.evaluate(() => {
  const p = document.querySelector('.media-player .media-poster');
  return { visible: !!p && !p.hidden && p.getClientRects().length > 0, text: p ? p.innerText : '', play: !!p.querySelector('[data-fid="media-poster-play"]') };
});
ok('poster shown with title and Play button', poster.visible && poster.text.includes('Your personalised explanation') && poster.play, poster);
ok('poster personalised: "For Camille Roy · Atelier Boréal Inc."', poster.text.includes('For Camille Roy · Atelier Boréal Inc.'));
ok('poster shows duration from cues (1:00)', poster.text.includes('1:00') && Math.floor(enCues.duration) === 60);
ok('no autoplay: paused at 0:00', !s.playing && s.time === 0 && !s.engaged, s);
ok('audio not decoded before first Play (deferred)', s.decoded.length === 0 && !s.audioReady, s.decoded);
const names = await page.evaluate(() => [...document.querySelectorAll('.media-player button, .media-player input, .media-player select')]
  .filter((el) => el.getClientRects().length)
  .map((el) => ({ fid: el.getAttribute('data-fid'), name: (el.getAttribute('aria-label') || el.textContent || '').trim() })));
ok('every visible control has an accessible name', names.length >= 10 && names.every((n) => n.name.length > 1), names.filter((n) => n.name.length <= 1));
ok('seek bar aria-valuetext uses the spoken form "0 min 0 s of 1 min 0 s" (not clock digits)', (await page.getAttribute('.media-player .media-seek', 'aria-valuetext')) === '0 min 0 s of 1 min 0 s');
ok('captions on by default', (await page.getAttribute('[data-fid="media-captions"]', 'aria-pressed')) === 'true');
const hasFs = await page.evaluate(() => !!document.querySelector('[data-fid="media-fullscreen"]') === !!(document.fullscreenEnabled && Element.prototype.requestFullscreen));
ok('fullscreen button shown only when supported', hasFs);
if (shots) await page.locator('.media-player').screenshot({ path: `${shots}/en-CA-1280-poster.png` });

// Play from the poster
await clickFid(page, 'media-poster-play');
await page.waitForFunction(() => window.BDCNotice.media.state().time > 1.5, null, { timeout: 8000 }).catch(() => {});
s = await state(page);
ok('Play starts playback and currentTime advances', s.playing && s.time > 1.5, s);
ok('audio decoded lazily for en-CA only', s.decoded.join() === 'en-CA' && s.audioReady, s.decoded);
ok('focus moves from poster to the Play/Pause control', (await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-fid'))) === 'media-play');
ok('Play/Pause control now reads "Pause"', (await page.getAttribute('[data-fid="media-play"]', 'aria-label')) === 'Pause');
let ev = await events(page);
ok('events: video_started en-CA then video_chapter_viewed en-CA:welcome', ev.indexOf('video_started:en-CA') > -1 && ev.indexOf('video_started:en-CA') < ev.indexOf('video_chapter_viewed:en-CA:welcome'), ev);
await clickFid(page, 'media-play');
await wait(page, 200);
const p1 = await snapshot(page);
await wait(page, 400);
const p2 = await snapshot(page);
ok('Pause stops the clock (no drift while paused)', !p2.st.playing && p1.st.time === p2.st.time, [p1.st.time, p2.st.time]);
ok('scene and caption match the cue at the paused time', inSync(p2), p2);
if (shots) await page.locator('.media-player').screenshot({ path: `${shots}/en-CA-1280-playing.png` });

// Seeking through every chapter keeps scenes, captions and labels in sync
const seekTimes = [enCh.welcome.start + 2.5, enCh.relief.start + 3, enCh.difference.start + 6, enCh.tradeoff.start + 9, enCh.resume.start + 6, enCh['next-step'].start + 7];
let allSync = true;
const bad = [];
for (const tm of seekTimes) {
  await setRange(page, '.media-seek', tm.toFixed(1));
  const sn = await snapshot(page);
  if (!inSync(sn) || sn.valuetext !== spokenOf(sn.timeText, 'of') || !sn.timeText.endsWith('/ 1:00')) { allSync = false; bad.push(sn); }
}
ok('seek bar: each chapter shows its scene and caption; value text is the visible m:ss clock in spoken form', allSync, bad[0]);
const ticks = await page.locator('.media-player .media-tick').count();
ok('seek bar marks the 5 chapter boundaries', ticks === 5);

// Keyboard on the seek bar
await setRange(page, '.media-seek', '10');
await page.locator('.media-player .media-seek').focus();
await page.keyboard.press('ArrowRight');
s = await state(page);
ok('ArrowRight on the seek bar moves +5 s', Math.abs(s.time - 15) < 0.15, s.time);
await page.keyboard.press('Home');
ok('Home on the seek bar returns to 0:00', (await state(page)).time === 0);

// Chapters: open the list and select "The trade-off"
await clickFid(page, 'media-chapters-toggle');
const chList = await page.evaluate(() => ({
  expanded: document.querySelector('[data-fid="media-chapters-toggle"]').getAttribute('aria-expanded'),
  titles: [...document.querySelectorAll('.media-player .media-ch-title')].map((e) => e.textContent),
}));
ok('chapter list opens with 6 titled chapters', chList.expanded === 'true' && chList.titles.length === 6 && chList.titles[3] === 'The trade-off', chList);
await clickFid(page, 'media-chapter-tradeoff');
await wait(page, 350);
s = await state(page);
ok('chapter selection plays from that chapter', s.playing && s.chapter === 'tradeoff', s);
await clickFid(page, 'media-play');
await wait(page, 200);
let sn = await snapshot(page);
ok('trade-off: scene 4 and its first caption are shown', sn.active[0] === 'tradeoff' && sn.st.time >= enCh.tradeoff.start && sn.st.time < enCh.tradeoff.start + 1.5 && 'There is a trade-off.'.includes(sn.caption), sn);
ok('current chapter is indicated (aria-current + label)', (await page.getAttribute('[data-fid="media-chapter-tradeoff"]', 'aria-current')) === 'true' && sn.chapterLabel === 'Chapter 4 of 6 · The trade-off', sn.chapterLabel);
ev = await events(page);
ok('S-20: a chapter played for under 1 s is not logged as viewed yet', !ev.includes('video_chapter_viewed:en-CA:tradeoff') && !ev.includes('video_chapter_viewed:en-CA:difference'), ev);
if (shots) await page.locator('.media-player').screenshot({ path: `${shots}/en-CA-1280-tradeoff-chapters.png` });
await clickFid(page, 'media-play');
await page.waitForFunction((st) => window.BDCNotice.media.state().time > st + 1.3, enCh.tradeoff.start, { timeout: 6000 }).catch(() => {});
await clickFid(page, 'media-play');
ev = await events(page);
ok('event video_chapter_viewed en-CA:tradeoff once the chapter has played for about 1 s', ev.includes('video_chapter_viewed:en-CA:tradeoff'), ev);
await clickFid(page, 'media-chapters-toggle');

// Exact chapter start (paused) shows that chapter's first caption, not the previous chapter's last one
await setRange(page, '.media-seek', enCh.difference.start);
sn = await snapshot(page);
ok('at a chapter start the caption belongs to that chapter', sn.active[0] === 'difference' && sn.caption && enCues.captions.find((c) => c.chapter === 'difference').text.includes(sn.caption), sn);

// Speed
await page.selectOption('.media-player [data-fid="media-speed"]', '1.5');
s = await state(page);
ok('speed 1.5× sets audio playbackRate', s.playbackRate === 1.5 && s.rate === 1.5, s);
await clickFid(page, 'media-play');
await wait(page, 150);
const r0 = (await state(page)).time;
await wait(page, 1200);
const r1 = (await state(page)).time;
await clickFid(page, 'media-play');
ok('1.5× advances the clock faster than real time', r1 - r0 > 1.3, (r1 - r0).toFixed(2));
const speedOpts = await page.$$eval('.media-player [data-fid="media-speed"] option', (o) => o.map((x) => x.textContent));
ok('speed options 0.75×, 1×, 1.25×, 1.5×', speedOpts.join('|') === '0.75×|1×|1.25×|1.5×', speedOpts);
await page.selectOption('.media-player [data-fid="media-speed"]', '1');
await wait(page, 100);

// Captions toggle
await clickFid(page, 'media-captions');
sn = await snapshot(page);
ok('captions can be turned off', !sn.captionVisible && !sn.st.captions && (await page.getAttribute('[data-fid="media-captions"]', 'aria-pressed')) === 'false');
await clickFid(page, 'media-captions');
sn = await snapshot(page);
ok('captions can be turned back on', sn.captionVisible && sn.st.captions);

// Transcript
await clickFid(page, 'media-transcript-toggle');
const tx = await page.evaluate(() => {
  const el = document.querySelector('.media-player .media-transcript');
  return {
    visible: !!el && !el.hidden && el.getClientRects().length > 0,
    expanded: document.querySelector('[data-fid="media-transcript-toggle"]').getAttribute('aria-expanded'),
    headings: [...el.querySelectorAll('.media-tx-heading button')].map((b) => b.querySelector('.media-tx-chtitle').textContent),
    text: el.innerText,
    current: [...el.querySelectorAll('.media-tx-chapter.is-current')].map((c) => c.dataset.chapter),
    currentCap: (el.querySelector('.media-tx-cap.is-current') || {}).textContent || '',
  };
});
ok('transcript opens (aria-expanded) with 6 chapter headings', tx.visible && tx.expanded === 'true' && tx.headings.length === 6, tx.headings);
ok('transcript contains every caption of the narration', enCues.captions.every((c) => tx.text.includes(c.text)));
ok('transcript marks the current chapter and caption', tx.current.join() === 'difference' && tx.currentCap.length > 0, tx);
await clickFid(page, 'media-tx-resume');
await wait(page, 300);
s = await state(page);
ok('transcript chapter heading seeks to that chapter', s.chapter === 'resume' && s.time >= enCh.resume.start && s.time < enCh.resume.start + 1.5, s);
await clickFid(page, 'media-play');
await wait(page, 150);
if (shots) await page.locator('.media-player').screenshot({ path: `${shots}/en-CA-1280-transcript.png` });

// Keyboard on the stage
await page.locator('.media-player .media-stage').focus();
await page.keyboard.press('Space');
await wait(page, 250);
const kb1 = await state(page);
await page.keyboard.press('Space');
await wait(page, 200);
const kb2 = await state(page);
ok('Space on the focused stage toggles play/pause', kb1.playing && !kb2.playing, [kb1.playing, kb2.playing]);
const focusRing = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
ok('stage shows a visible focus indicator', focusRing === 'solid', focusRing);

// Space on the Play/Pause button (native button activation)
await page.locator('[data-fid="media-play"]').focus();
await page.keyboard.press('Space');
await wait(page, 250);
const kb3 = await state(page);
await page.keyboard.press('Space');
await wait(page, 200);
ok('Space on the Play/Pause button toggles playback', kb3.playing && !(await state(page)).playing);
ok('stage hint describes the keyboard shortcuts', /Press Space to play or pause\..*5 seconds/.test(await page.evaluate(() => document.getElementById(document.querySelector('.media-player .media-stage').getAttribute('aria-describedby')).textContent)));

// Fullscreen (optional): toggles when the browser allows it, otherwise stays in the normal view without errors
if (await page.locator('[data-fid="media-fullscreen"]').count()) {
  await clickFid(page, 'media-fullscreen');
  await wait(page, 300);
  const fs = await page.evaluate(() => ({ on: !!document.fullscreenElement && document.fullscreenElement.classList.contains('media-fs'), label: document.querySelector('[data-fid="media-fullscreen"]').getAttribute('aria-label') }));
  if (fs.on) {
    ok('fullscreen: player frame goes full screen and the button offers "Exit full screen"', fs.label === 'Exit full screen', fs);
    await page.evaluate(() => document.exitFullscreen());
    await wait(page, 300);
  }
  ok('fullscreen: normal view restored with the "Full screen" label', !(await page.evaluate(() => !!document.fullscreenElement)) && (await page.getAttribute('[data-fid="media-fullscreen"]', 'aria-label')) === 'Full screen');
}

// S-16: any modal overlay (a dialog, Clair, the query form) makes the page
// behind it inert, so the narration pauses - and stays paused once it closes.
for (const how of ['dialog', 'clair-launcher', 'overview-cta-ask']) {
  const avail = how === 'dialog' || await page.evaluate((f) => { const el = document.querySelector(`[data-fid="${f}"]`); return !!(el && el.getClientRects().length); }, how);
  if (!avail) { console.log(`  (${how} not in this build)`); continue; }
  if (!(await state(page)).playing) await clickFid(page, 'media-play');
  await page.waitForFunction(() => window.BDCNotice.media.state().playing, null, { timeout: 4000 }).catch(() => {});
  await wait(page, 300);
  const p0 = await state(page);
  if (how === 'dialog') {
    await page.evaluate(() => window.BDCNotice.overlay.open({ id: 'media-qa-dialog', variant: 'dialog', title: 'QA', render(body) { body.append(document.createTextNode('QA')); } }));
  } else {
    await page.locator(`[data-fid="${how}"]`).click();
  }
  await wait(page, 250);
  const a = await page.evaluate(() => ({ ...window.BDCNotice.media.state(), inert: document.getElementById('app').hasAttribute('inert') }));
  await wait(page, 600);
  const b = await state(page);
  await page.keyboard.press('Escape');
  await wait(page, 500);
  const c = await page.evaluate(() => ({ ...window.BDCNotice.media.state(), inert: document.getElementById('app').hasAttribute('inert') }));
  ok(`S-16: opening ${how === 'dialog' ? 'a dialog' : how} pauses the narration; it stays paused after the overlay closes`,
    p0.playing && a.inert && !a.playing && Math.abs(b.time - a.time) < 0.01 && !c.inert && !c.playing && Math.abs(c.time - a.time) < 0.01,
    { before: p0.playing, open: [a.inert, a.playing, a.time], later: b.time, closed: [c.inert, c.playing, c.time] });
}

// Mute and volume
await clickFid(page, 'media-mute');
s = await state(page);
ok('mute toggles (aria-pressed)', s.muted && (await page.getAttribute('[data-fid="media-mute"]', 'aria-pressed')) === 'true');
await setRange(page, '.media-volume', 40);
s = await state(page);
ok('volume slider sets volume and unmutes', Math.abs(s.volume - 0.4) < 0.001 && !s.muted && (await page.getAttribute('.media-player .media-volume', 'aria-valuetext')) === '40%', s);
await setRange(page, '.media-volume', 100);

// Replay
await clickFid(page, 'media-replay');
await wait(page, 300);
s = await state(page);
ok('Replay restarts from the beginning and plays', s.playing && s.time < 1.2 && s.chapter === 'welcome', s);

// Language switch while playing in "Where the difference comes from"
await setRange(page, '.media-seek', (enCh.difference.start + 4).toFixed(1));
await wait(page, 200);
await page.locator('[data-fid="lang-fr-CA"]').click();
await wait(page, 150);
s = await state(page);
ok('language switch pauses playback', !s.playing && s.locale === 'fr-CA', s);
ok('fr-CA: positioned at the START of the same chapter in the French track', s.chapter === 'difference' && Math.abs(s.time - frCh.difference.start) < 0.06, { time: s.time, frStart: frCh.difference.start, enStart: enCh.difference.start });
await page.waitForFunction(() => window.BDCNotice.media.state().audioReady, null, { timeout: 5000 }).catch(() => {});
await wait(page, 150);
s = await state(page);
ok('French audio decoded lazily; audio clock at the French chapter start', s.audioReady && s.audioLocale === 'fr-CA' && s.decoded.includes('fr-CA') && Math.abs(s.time - frCh.difference.start) < 0.06 && !s.playing, s);
sn = await snapshot(page);
ok('fr-CA: scene and French caption in sync', inSync(sn) && frCues.captions.some((c) => c.text.includes(sn.caption)), sn);
const fr = await page.evaluate(() => ({
  play: document.querySelector('[data-fid="media-play"]').getAttribute('aria-label'),
  label: document.querySelector('.media-player .media-chapter-label').textContent,
  vt: document.querySelector('.media-player .media-seek').getAttribute('aria-valuetext'),
  tx: document.querySelector('.media-player .media-transcript').innerText,
  speed: [...document.querySelectorAll('[data-fid="media-speed"] option')].map((o) => o.textContent),
  note: document.querySelector('.media-player .media-note').textContent,
}));
ok('fr-CA labels: controls, chapter, spoken seek value', fr.play === 'Lecture' && fr.label === 'Chapitre 3 sur 6 · D’où vient l’écart' && new RegExp(`^\\d+ min \\d+ s sur ${Math.floor(frCues.duration / 60)} min ${Math.floor(frCues.duration % 60)} s$`).test(fr.vt), fr);
ok('fr-CA transcript (still open) shows the French narration', frCues.captions.every((c) => fr.tx.includes(c.text)) && fr.tx.includes('Transcription'));
ok('fr-CA speed labels use the French decimal comma (no-break space before ×)', fr.speed.join('|') === '0,75\u00a0×|1\u00a0×|1,25\u00a0×|1,5\u00a0×', fr.speed);
ok('fr-CA note: offline, never contacts ElevenLabs', fr.note.includes('ne communique jamais avec ElevenLabs'));
if (shots) await page.locator('.media-player').screenshot({ path: `${shots}/fr-CA-1280-switched.png` });
await clickFid(page, 'media-play');
await page.waitForFunction((st) => window.BDCNotice.media.state().time > st + 0.8, frCh.difference.start, { timeout: 6000 }).catch(() => {});
s = await state(page);
ok('French narration plays from the mapped chapter', s.playing && s.time > frCh.difference.start + 0.8, s);
ev = await events(page);
ok('event video_started fr-CA', ev.includes('video_started:fr-CA'));
// back to English from the French "tradeoff" chapter
await setRange(page, '.media-seek', (frCh.tradeoff.start + 5).toFixed(1));
await wait(page, 150);
await page.locator('[data-fid="lang-en-CA"]').click();
await wait(page, 200);
s = await state(page);
ok('switching back maps to the English start of the same chapter', !s.playing && s.locale === 'en-CA' && s.chapter === 'tradeoff' && Math.abs(s.time - enCh.tradeoff.start) < 0.06, s);

// Leaving the overview pauses playback; coming back keeps the position
await clickFid(page, 'media-play');
await wait(page, 500);
const before = await state(page);
await page.evaluate(() => window.BDCNotice.router.go('#/changes'));
await wait(page, 250);
s = await state(page);
ok('navigating away from the overview pauses playback', before.playing && !s.playing, [before.playing, s.playing]);
await page.evaluate(() => window.BDCNotice.router.go('#/overview'));
await wait(page, 250);
await ensurePlayer(page);
const back = await state(page);
ok('returning re-attaches the same player state (position, locale, paused)', back.mounted && !back.playing && Math.abs(back.time - s.time) < 0.05 && back.locale === 'en-CA' && back.engaged, back);
ok('single player instance in the document', (await page.locator('.media-player').count()) === 1);

// End of narration → end card with real actions
await setRange(page, '.media-seek', (enCues.duration - 1.0).toFixed(1));
await clickFid(page, 'media-play');
await page.waitForFunction(() => window.BDCNotice.media.state().ended, null, { timeout: 6000 }).catch(() => {});
s = await state(page);
const end = await page.evaluate(() => {
  const el = document.querySelector('.media-player .media-endcard');
  return { visible: !!el && !el.hidden && el.getClientRects().length > 0, text: el ? el.innerText : '', buttons: [...el.querySelectorAll('a, button')].map((b) => b.textContent.trim()) };
});
ok('end card appears when the narration ends', s.ended && !s.playing && end.visible, s);
await wait(page, 120);
ok('end of the explanation is announced politely to screen readers', (await page.evaluate(() => document.getElementById('live-polite').textContent)) === 'The explanation has ended. Your next-step options are shown in the player.');
ok('end card: Review the revised schedule (+ Clair / question when present), Watch again', end.buttons.includes('Review the revised schedule') && end.buttons.includes('Watch again') && end.text.includes('No acceptance is required through this notice.'), end.buttons);
ev = await events(page);
ok('S-20: reaching the end after skipping most of the narration is not logged as video_completed', !ev.includes('video_completed:en-CA'), ev);
const endScene = await page.evaluate(() => document.querySelector('.media-player .media-scene.is-active').innerText);
ok('next-step scene is a depiction only (no controls inside scenes)', (await page.locator('.media-player .media-scene button, .media-player .media-scene a').count()) === 0 && endScene.includes('Review the revised schedule'));
// The scene-6 options are pictures, not look-alike controls: no box, fill,
// shadow or rounded button shape, nothing focusable, and the whole scene is hidden
// from assistive technology (the narration is in captions and transcript).
const s6 = await page.evaluate(() => {
  const sc = document.querySelector('.media-player .media-scene[data-scene="next-step"]');
  const items = [...sc.querySelectorAll('.media-option')];
  const boxed = (el) => {
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor;
    const sides = ['Top', 'Right', 'Bottom', 'Left'].filter((sd) => parseFloat(cs[`border${sd}Width`]) > 0 && cs[`border${sd}Style`] !== 'none');
    return { bgTransparent: bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent', bgImage: cs.backgroundImage, shadow: cs.boxShadow, sides: sides.length, radius: parseFloat(cs.borderTopLeftRadius) || 0 };
  };
  return {
    hidden: sc.getAttribute('aria-hidden'),
    texts: items.map((el) => el.textContent.trim()),
    looks: items.map(boxed),
    focusable: sc.querySelectorAll('button, a, input, select, textarea, [tabindex], [role="button"], [role="link"]').length,
    tiles: document.querySelectorAll('.media-player .media-tile').length,
  };
});
ok('scene 6: "Review the revised schedule", "Explain with AI", "Ask a question" shown as plain picture items (no box, fill, shadow or rounded button shape)',
  s6.hidden === 'true' && s6.texts.join('|') === 'Review the revised schedule|Explain with AI|Ask a question' && s6.focusable === 0 && s6.tiles === 0
  && s6.looks.every((l) => l.bgTransparent && l.bgImage === 'none' && l.shadow === 'none' && l.sides <= 1 && l.radius === 0), s6);
if (shots) await page.locator('.media-player').screenshot({ path: `${shots}/en-CA-1280-endcard.png` });

// Cross-module end-card actions (only when Clair / the query form are in this build)
for (const [fid, api, kind] of [['media-end-clair', 'clair', 'Clair'], ['media-end-query', 'query', 'query form']]) {
  const present = await page.evaluate(([f, a]) => !!(window.BDCNotice[a] && document.querySelector(`[data-fid="${f}"]`)), [fid, api]);
  if (!present) { console.log(`  (${kind} not in this build: end-card action not shown, as designed)`); continue; }
  await page.evaluate((a) => {
    const App = window.BDCNotice;
    const orig = App[a].open;
    window.__ctx = null;
    App[a].open = (ctx, trig) => { window.__ctx = { ctx, trig: trig && trig.getAttribute('data-fid') }; App[a].open = orig; return orig(ctx, trig); };
  }, api);
  await clickFid(page, fid);
  await wait(page, 350);
  const r = await page.evaluate((a) => ({ ...window.__ctx, open: window.BDCNotice[a].isOpen(), playing: window.BDCNotice.media.state().playing }), api);
  ok(`end card "${kind}" opens with the next-step chapter context and its trigger`, r.open && r.ctx && r.ctx.kind === 'chapter' && r.ctx.id === 'next-step' && r.trig === fid && !r.playing, r);
  await page.keyboard.press('Escape');
  await wait(page, 350);
  ok(`closing the ${kind} returns focus to the end-card button`, (await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-fid'))) === fid);
}
await clickFid(page, 'media-end-schedule');
await wait(page, 300);
ok('"Review the revised schedule" navigates to #/payments/schedule', (await page.evaluate(() => location.hash)) === '#/payments/schedule');
await page.evaluate(() => window.BDCNotice.router.go('#/overview'));
await wait(page, 250);
await ensurePlayer(page);

// Session reset returns the player to its poster
await page.evaluate(() => window.BDCNotice.shell.resetDemo());
await wait(page, 300);
await ensurePlayer(page);
s = await state(page);
const posterBack = await page.evaluate(() => !document.querySelector('.media-player .media-poster').hidden);
ok('session reset stops and resets the player (poster, 0:00)', !s.playing && s.time === 0 && !s.engaged && posterBack, s);
await page.evaluate(() => window.BDCNotice.media.focus());
ok('App.media.focus() focuses the poster Play button', (await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-fid'))) === 'media-poster-play');

/* ---------- Layout in both languages ---------- */
await page.evaluate(() => {
  // Open everything that adds content: transcript + chapters, mid-scene
  const st = window.BDCNotice.media.state();
  if (!st.transcriptOpen) document.querySelector('[data-fid="media-transcript-toggle"]').click();
  if (!st.chaptersOpen) document.querySelector('[data-fid="media-chapters-toggle"]').click();
});
for (const locale of ['en-CA', 'fr-CA']) {
  await page.evaluate((l) => window.BDCNotice.i18n.setLocale(l), locale);
  await wait(page, 150);
  await ensurePlayer(page);
  const c = locale === 'en-CA' ? enCues : frCues;
  for (const w of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width: w, height: 900 });
    await wait(page, 150);
    const problems = [];
    for (const tm of [c.chapters[1].start + 7, c.chapters[2].start + 12, c.chapters[3].start + 12]) {
      await setRange(page, '.media-seek', tm.toFixed(1));
      await wait(page, 60);
      const of = await mediaOverflow(page, mode);
      if (of.media.length) problems.push(`media overflow @${tm.toFixed(0)}s ${of.media.join(', ')}`);
      if (of.doc) problems.push(`document overflow ${of.doc.scrollWidth}/${of.doc.clientWidth} ${JSON.stringify(of.doc.offenders.slice(0, 3))}`);
    }
    const geo = await page.evaluate(() => {
      const cv = document.querySelector('.media-player .media-canvas').getBoundingClientRect();
      const fs = parseFloat(getComputedStyle(document.querySelector('.media-player .media-scene.is-active')).fontSize);
      const capInside = (() => { const cap = document.querySelector('.media-player .media-caption').getBoundingClientRect(); return cap.top < cv.bottom; })();
      return { ratio: cv.height / cv.width, width: cv.width, fs, capInside };
    });
    if (geo.width >= 640 && Math.abs(geo.ratio - 9 / 16) > 0.02) problems.push(`stage not 16:9 at ${w}px (${geo.ratio.toFixed(3)})`);
    if (geo.width >= 640 && !geo.capInside) problems.push('captions not inside the stage on desktop');
    if (geo.width < 640 && (geo.ratio <= 9 / 16 + 0.1 || geo.fs < 13 || geo.capInside)) problems.push(`narrow stage not reflowed (ratio ${geo.ratio.toFixed(2)}, ${geo.fs}px, caption inside ${geo.capInside})`);
    ok(`${locale} ${w}px: no overflow; ${geo.width >= 640 ? '16:9 stage, captions in stage' : 'reflowed stage, captions below'}`, problems.length === 0, problems.join(' | '));
    if (shots && ((locale === 'fr-CA' && (w === 320 || w === 390)) || w === 1280)) {
      await setRange(page, '.media-seek', (c.chapters[3].start + 12).toFixed(1));
      await wait(page, 600); // let the scene fade settle
      await page.locator('.media-player').screenshot({ path: `${shots}/${locale}-${w}-layout.png` });
    }
  }
}

/* ---------- Captions: at most two lines, natural break points ---------- */
const NUMERIC = new Set(('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand first second third '
  + 'january february march april may june july august september october november december dollar dollars and un une deux trois quatre cinq sept huit neuf dix onze douze treize quatorze quinze seize vingt trente quarante cinquante soixante cent cents mille '
  + 'janvier février mars avril mai juin juillet août septembre octobre novembre décembre et').split(' '));
const GLUE = new Set('a an the of to for in on at by with and or your le la les un une des du de au aux à et ou en pour par sur dans vos votre'.split(' '));
const bareW = (w) => String(w || '').toLowerCase().replace(/^[«“"(]+|[»”"),.;:!?]+$/g, '');
const numericW = (w) => !!bareW(w) && bareW(w).split(/[-–]/).every((x) => NUMERIC.has(x));
for (const locale of ['en-CA', 'fr-CA']) {
  await page.evaluate((l) => window.BDCNotice.i18n.setLocale(l), locale);
  await wait(page, 120);
  await ensurePlayer(page);
  for (const w of [320, 390, 1280]) {
    await page.setViewportSize({ width: w, height: 900 });
    await wait(page, 200);
    const r = await page.evaluate(() => {
      const App = window.BDCNotice;
      const cues = App.readEmbeddedJSON('data-cues')[App.media.state().locale];
      const seek = document.querySelector('.media-player .media-seek');
      const capEl = document.querySelector('.media-player .media-caption-text');
      const seq = [];
      let maxLines = 0;
      for (let tm = 0; tm <= cues.duration; tm += 0.1) {
        seek.value = String(tm);
        seek.dispatchEvent(new Event('input', { bubbles: true }));
        const txt = capEl.textContent;
        if (!txt) continue;
        const inline = getComputedStyle(capEl).display === 'inline';
        const lines = inline ? capEl.getClientRects().length : Math.round(capEl.getBoundingClientRect().height / parseFloat(getComputedStyle(capEl).lineHeight));
        maxLines = Math.max(maxLines, lines);
        const capIndex = cues.captions.findIndex((c) => c.text.includes(txt));
        const last = seq[seq.length - 1];
        if (!last || last.text !== txt) seq.push({ capIndex, text: txt });
      }
      return { maxLines, seq, captions: cues.captions.map((c) => c.text) };
    });
    const problems = [];
    if (r.maxLines > 2) problems.push(`caption wraps to ${r.maxLines} lines`);
    // every caption is fully shown, chunk by chunk, in order
    r.captions.forEach((text, i) => {
      const parts = r.seq.filter((x) => x.capIndex === i).map((x) => x.text);
      if (parts.join(' ') !== text) problems.push(`caption ${i} chunks do not rebuild the text: ${JSON.stringify(parts)}`);
      for (let k = 1; k < parts.length; k += 1) {
        const a = parts[k - 1].split(' ').pop();
        const b = parts[k].split(' ')[0];
        if (numericW(a) && numericW(b) && !/,$/.test(a)) problems.push(`split inside a spoken amount/date: "${parts[k - 1]}" | "${parts[k]}"`);
        if (GLUE.has(bareW(a))) problems.push(`chunk ends on a function word: "${parts[k - 1]}"`);
      }
    });
    ok(`${locale} ${w}px: captions never exceed two lines and break at natural points`, problems.length === 0, problems.slice(0, 3).join(' || '));
  }
}

/* ---------- Controls keep a stable height across chapters ---------- */
for (const [locale, w] of [['fr-CA', 320], ['en-CA', 390], ['fr-CA', 768]]) {
  await page.evaluate((l) => window.BDCNotice.i18n.setLocale(l), locale);
  await page.setViewportSize({ width: w, height: 900 });
  await wait(page, 200);
  await ensurePlayer(page);
  const hs = await page.evaluate(() => {
    const App = window.BDCNotice;
    const cues = App.readEmbeddedJSON('data-cues')[App.media.state().locale];
    const seek = document.querySelector('.media-player .media-seek');
    return cues.chapters.map((ch) => {
      seek.value = String(ch.start + 1);
      seek.dispatchEvent(new Event('input', { bubbles: true }));
      const fr = document.querySelector('.media-player .media-frame').getBoundingClientRect().height;
      const all = document.querySelector('.media-player').getBoundingClientRect().height;
      return `${Math.round(fr)}/${Math.round(all)}`;
    });
  });
  ok(`${locale} ${w}px: player (frame, chapter list, transcript) does not jump when the chapter changes`, new Set(hs).size === 1, hs);
}
await page.setViewportSize({ width: 1280, height: 900 });

/* ---------- Copy, amounts and accessible names in both languages ---------- */
const EXPECT = {
  'en-CA': { relief: ['$1,600'], difference: ['$12,000', '$80', '$11,920'], tradeoff: ['+$4,800', 'Original final payment', 'October 31, 2031', 'Revised final payment', 'January 31, 2032', '$80'], resume: ['$5,600', '$4,000', '$1,600', 'February 28, 2027'], welcome: ['Camille Roy', 'Atelier Boréal Inc.', 'Effective November 1, 2026'] },
  // Same terms as the rest of the app (changes / payments): « Dernier versement initial / révisé »
  'fr-CA': { relief: ['1 600 $'], difference: ['12 000 $', '80 $', '11 920 $'], tradeoff: ['+4 800 $', 'Dernier versement initial', '31 octobre 2031', 'Dernier versement révisé', '31 janvier 2032', '80 $'], resume: ['5 600 $', '4 000 $', '1 600 $', '28 février 2027'], welcome: ['Camille Roy', 'Atelier Boréal Inc.', 'En vigueur le 1er novembre 2026'] },
};
for (const locale of ['en-CA', 'fr-CA']) {
  await page.evaluate((l) => window.BDCNotice.i18n.setLocale(l), locale);
  await wait(page, 150);
  await ensurePlayer(page);
  const info = await page.evaluate(() => {
    const norm = (x) => x.replace(/[\s  ]+/g, ' ').trim();
    const scenes = {};
    document.querySelectorAll('.media-player .media-scene').forEach((sc) => { scenes[sc.dataset.scene] = norm(sc.textContent); });
    const big = document.querySelector('.media-player [data-fid="media-poster-play"]');
    const App = window.BDCNotice;
    const cues = App.readEmbeddedJSON('data-cues')[App.i18n.locale];
    return {
      scenes,
      relief1600: (scenes.relief.match(/1,600|1 600/g) || []).length,
      all: norm(document.querySelector('.media-player').textContent),
      dict: JSON.stringify(App.i18n._dicts[App.i18n.locale].media) + JSON.stringify(cues.captions),
      frSpacing: (() => {
        const out = [];
        const walk = (v, k) => {
          if (typeof v === 'string') { if (/ [:»]|« |[ \u00a0\u202f][;!?]/.test(v)) out.push(`${k}: ${v}`); } else if (v && typeof v === 'object') Object.entries(v).forEach(([kk, vv]) => walk(vv, `${k}.${kk}`));
        };
        walk(App.i18n._dicts['fr-CA'].media, 'media');
        return out;
      })(),
      bigName: big.getAttribute('aria-label'),
      bigText: big.textContent.trim(),
      current: document.querySelector('.media-player .media-ch-now').textContent,
    };
  });
  const miss = [];
  for (const [scene, list] of Object.entries(EXPECT[locale])) for (const v of list) if (!info.scenes[scene].includes(v)) miss.push(`${scene}: ${v}`);
  ok(`${locale}: every scene shows the fixture amounts and dates (formatted for the locale)`, miss.length === 0 && info.relief1600 >= 4, miss.concat(`relief 1600 count ${info.relief1600}`));
  ok(`${locale}: the $80 is never added on top of the $4,800`, !/4[,\s]?880/.test(info.all));
  const banned = /savings|interest-free|holiday|économie|sans intérêt|congé/i.test(info.dict);
  const forg = (info.dict.match(/.{0,12}\b(forgiveness|remise de dette)/g) || []).every((m) => /not (debt )?forgiveness|non (d’)?une remise de dette/.test(m));
  ok(`${locale}: no savings/holiday/interest-free wording; forgiveness only ever negated`, !banned && forg);
  ok(`${locale}: big Play button's accessible name contains its visible text (label in name)`, info.bigName.toLowerCase().includes(info.bigText.toLowerCase()), [info.bigName, info.bigText]);
  ok(`${locale}: current-chapter tag does not claim "now playing" while paused`, info.current === (locale === 'en-CA' ? 'Current' : 'En cours'), info.current);
  if (locale === 'fr-CA') {
    ok('fr-CA: final payment never called « échéance d’origine / révisée » in the video', !/échéance d’origine|échéance révisée|Dernière échéance/.test(info.dict), info.scenes.tradeoff);
    ok('fr-CA: media dictionary uses U+00A0 before : and inside « » (never a breaking space) and no space before ; ! ?', info.frSpacing.length === 0, info.frSpacing);
  }
}
await page.evaluate(() => window.BDCNotice.i18n.setLocale('en-CA'));
await wait(page, 150);
await ensurePlayer(page);

/* ---------- Scene changes never overlap two scenes' text ---------- */
await setRange(page, '.media-seek', (enCh.relief.start + 2).toFixed(1));
await wait(page, 600);
const overlap = await page.evaluate(async () => {
  const seek = document.querySelector('.media-player .media-seek');
  const a = document.querySelector('.media-player .media-scene[data-scene="relief"]');
  const b = document.querySelector('.media-player .media-scene[data-scene="difference"]');
  const cues = window.BDCNotice.readEmbeddedJSON('data-cues')['en-CA'];
  seek.value = String(cues.chapters[2].start + 2);
  seek.dispatchEvent(new Event('input', { bubbles: true }));
  let worst = 0;
  const t0 = performance.now();
  while (performance.now() - t0 < 600) {
    await new Promise((r) => requestAnimationFrame(r));
    worst = Math.max(worst, Math.min(parseFloat(getComputedStyle(a).opacity), parseFloat(getComputedStyle(b).opacity)));
  }
  return { worst, endA: getComputedStyle(a).opacity, endB: getComputedStyle(b).opacity };
});
ok('scene change fades out before fading in (no overlapping text)', overlap.worst < 0.05 && overlap.endA === '0' && overlap.endB === '1', overlap);

/* ---------- Chapters panel: Escape closes it and returns focus ---------- */
await clickFid(page, 'media-chapters-toggle');
await page.locator('[data-fid="media-chapter-relief"]').focus();
await page.keyboard.press('Escape');
const esc = await page.evaluate(() => ({ hidden: document.querySelector('.media-player .media-chapters').hidden, focus: document.activeElement && document.activeElement.getAttribute('data-fid'), expanded: document.querySelector('[data-fid="media-chapters-toggle"]').getAttribute('aria-expanded') }));
ok('Escape closes the chapter list and returns focus to the Chapters button', esc.hidden && esc.focus === 'media-chapters-toggle' && esc.expanded === 'false', esc);
ok('player mounted into a detached container measures itself once attached (stable label height set)', await page.evaluate(() => !!document.querySelector('.media-player .media-chapter-label').style.minHeight));

const mk = await missingKeys(page);
ok('no missing dictionary keys', mk.length === 0, mk);
ok('no console errors or warnings', main.consoleMsgs.length === 0, main.consoleMsgs.slice(0, 5));
const ext = main.requests.filter((u) => !u.startsWith('https://accessibilityserver.org/'));
ok('zero external requests during playback, seeking, replay and language changes', ext.length === 0, ext);
await main.context.close();

/* ======================================================================
 * 2. Narrow end card + poster screenshots (fr-CA 320 / 390)
 * ==================================================================== */
for (const w of [320, 390]) {
  const n = await newPage(browser, { width: w, height: 844 });
  await gotoApp(n.page, '#/overview', file);
  await n.page.evaluate(() => window.BDCNotice.i18n.setLocale('fr-CA'));
  await wait(n.page, 150);
  const m2 = await ensurePlayer(n.page);
  if (shots) await n.page.locator('.media-player').screenshot({ path: `${shots}/fr-CA-${w}-poster.png` });
  const c = frCues;
  await setRange(n.page, '.media-seek', (c.duration - 0.8).toFixed(1));
  await clickFid(n.page, 'media-play');
  await n.page.waitForFunction(() => window.BDCNotice.media.state().ended, null, { timeout: 6000 }).catch(() => {});
  const of = await mediaOverflow(n.page, m2);
  const endOk = await n.page.evaluate(() => {
    const el = document.querySelector('.media-player .media-endcard');
    return !!el && !el.hidden && el.innerText.includes('Consulter le calendrier révisé');
  });
  ok(`fr-CA ${w}px: end card fits without overflow`, endOk && of.media.length === 0 && !of.doc, of);
  if (shots) await n.page.locator('.media-player').screenshot({ path: `${shots}/fr-CA-${w}-endcard.png` });
  await n.context.close();
}

/* ======================================================================
 * 3. Reduced motion
 * ==================================================================== */
{
  const rm = await newPage(browser, { width: 1280, height: 900, reducedMotion: 'reduce' });
  await gotoApp(rm.page, '#/overview', file);
  await ensurePlayer(rm.page);
  const c = await cueData(rm.page, 'en-CA');
  await setRange(rm.page, '.media-seek', (c.chapters[1].start + 0.05).toFixed(2));
  const r = await rm.page.evaluate(() => {
    const sc = document.querySelector('.media-player .media-scene.is-active');
    const vars = [...sc.querySelectorAll('[style*="--b"], [style*="--p"]')].map((el) => [el.style.getPropertyValue('--b'), el.style.getPropertyValue('--p')].filter(Boolean)).flat();
    return {
      scene: sc.dataset.scene,
      reduced: document.querySelector('.media-player').classList.contains('is-reduced'),
      allFinal: vars.length > 0 && vars.every((v) => v === '1'),
      transition: getComputedStyle(sc).transitionDuration,
    };
  });
  ok('reduced motion: stable final scene state, no transitions', r.scene === 'relief' && r.reduced && r.allFinal && r.transition.split(',').every((d) => parseFloat(d) < 0.01), r);
  await clickFid(rm.page, 'media-play');
  await rm.page.waitForFunction((st) => window.BDCNotice.media.state().time > st + 0.8, c.chapters[1].start, { timeout: 6000 }).catch(() => {});
  const st2 = await state(rm.page);
  ok('reduced motion: controls and narration unchanged', st2.playing && st2.chapter === 'relief', st2);
  if (shots) await rm.page.locator('.media-player').screenshot({ path: `${shots}/en-CA-1280-reduced.png` });
  await rm.context.close();
}

/* ======================================================================
 * 4. Offline: both voiceovers play with the network disabled
 * ==================================================================== */
{
  const off = await newPage(browser, { width: 1024, height: 900 });
  await gotoApp(off.page, '#/overview', file);
  await off.context.setOffline(true);
  await ensurePlayer(off.page);
  await clickFid(off.page, 'media-poster-play');
  await off.page.waitForFunction(() => window.BDCNotice.media.state().time > 1, null, { timeout: 8000 }).catch(() => {});
  const a = await state(off.page);
  await off.page.locator('[data-fid="lang-fr-CA"]').click();
  await wait(off.page, 200);
  await clickFid(off.page, 'media-play');
  await off.page.waitForFunction(() => window.BDCNotice.media.state().time > 1 && window.BDCNotice.media.state().locale === 'fr-CA', null, { timeout: 8000 }).catch(() => {});
  const b = await state(off.page);
  ok('offline: English and French narration both play', a.playing && a.time > 1 && b.playing && b.locale === 'fr-CA' && b.time > 1, [a, b]);
  const ext2 = off.requests.filter((u) => !u.startsWith('https://accessibilityserver.org/'));
  ok('offline: no requests other than the (blocked) accessibility widget', ext2.length === 0, ext2);
  ok('offline: no console errors', off.consoleMsgs.length === 0, off.consoleMsgs.slice(0, 4));
  await off.context.close();
}

/* ======================================================================
 * 5. Missing audio → clear inline error + usable transcript (--silent-audio)
 * ==================================================================== */
{
  const dir = mkdtempSync(join(tmpdir(), 'media-silent-'));
  const silent = join(dir, 'index.html');
  const b = spawnSync(process.execPath, [join(root, 'tools/build.mjs'), '--modules', 'media', '--silent-audio', '--quiet', '--out', silent], { encoding: 'utf8' });
  ok('silent-audio build succeeds', b.status === 0, (b.stderr || b.stdout || '').slice(0, 400));
  if (b.status === 0) {
    const e = await newPage(browser, { width: 390, height: 844 });
    await gotoApp(e.page, '#/overview', silent);
    await ensurePlayer(e.page);
    ok('silent build has no embedded audio element', (await e.page.locator('#audio-en-CA, #audio-fr-CA').count()) === 0);
    await clickFid(e.page, 'media-poster-play');
    await wait(e.page, 250);
    const r = await e.page.evaluate(() => {
      const err = document.querySelector('.media-player .media-error');
      const tx = document.querySelector('.media-player .media-transcript');
      return {
        error: err && !err.hidden ? err.innerText.trim() : '',
        tx: tx && !tx.hidden ? tx.innerText : '',
        headings: tx ? tx.querySelectorAll('.media-tx-heading button').length : 0,
        announced: document.getElementById('live-assertive').textContent,
        state: window.BDCNotice.media.state(),
      };
    });
    ok('missing audio: clear inline error message', r.error === 'The narration can’t be played here. The full transcript is below.', r.error);
    ok('missing audio: transcript opened and fully readable', r.headings === 6 && r.tx.includes('Hello Camille.') && r.tx.includes('No acceptance is required through this notice.'), r.headings);
    ok('missing audio: player not playing, error state exposed', !r.state.playing && r.state.error, r.state);
    const place = await e.page.evaluate(() => {
      const err = document.querySelector('.media-player .media-error');
      const stage = document.querySelector('.media-player .media-stage');
      const controls = document.querySelector('.media-player .media-controls');
      const cap = document.querySelector('.media-player .media-caption');
      return {
        inFrame: !!err.closest('.media-frame'),
        between: !!(stage.compareDocumentPosition(err) & Node.DOCUMENT_POSITION_FOLLOWING) && !!(err.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING),
        captionHidden: cap.hidden,
      };
    });
    ok('missing audio: the message sits inside the player, between the stage and the controls', place.inFrame && place.between, place);
    ok('missing audio: no orphaned caption fragments (caption bar hidden; transcript instead)', place.captionHidden, place);
    // Narrow frame: the secondary controls open from "More controls"
    if (await e.page.locator('[data-fid="media-more"]').isVisible()) await clickFid(e.page, 'media-more');
    await clickFid(e.page, 'media-chapters-toggle');
    await clickFid(e.page, 'media-chapter-resume');
    await wait(e.page, 100);
    const sc = await e.page.evaluate(() => document.querySelector('.media-player .media-scene.is-active').dataset.scene);
    ok('missing audio: chapters still navigate the visual scenes', sc === 'resume', sc);
    const finalState = await e.page.evaluate(() => [...document.querySelectorAll('.media-player .media-scene.is-active [style*="--b"]')].every((el) => el.style.getPropertyValue('--b') === '1'));
    ok('missing audio: scenes shown complete (no clock to drive reveals)', finalState);
    await e.page.locator('[data-fid="lang-fr-CA"]').click();
    await wait(e.page, 200);
    await clickFid(e.page, 'media-play');
    await wait(e.page, 200);
    const frErr = await e.page.evaluate(() => document.querySelector('.media-player .media-error').innerText.trim());
    ok('missing audio (fr-CA): French error message', frErr === 'La narration ne peut pas être lue ici. La transcription complète se trouve ci-dessous.', frErr);
    if (shots) await e.page.locator('.media-player').screenshot({ path: `${shots}/fr-CA-390-error.png` });
    const ext3 = e.requests.filter((u) => !u.startsWith('https://accessibilityserver.org/'));
    ok('missing audio: no network request and no speech synthesis', ext3.length === 0 && !(await e.page.evaluate(() => window.speechSynthesis && window.speechSynthesis.speaking)), ext3);
    ok('missing audio: no console errors', e.consoleMsgs.length === 0, e.consoleMsgs.slice(0, 4));
    await e.context.close();
  }
  rmSync(dir, { recursive: true, force: true });
}

/* ======================================================================
 * 6. Forced colours (Windows High Contrast): the seek bar, chapter ticks,
 *    volume slider, pressed/expanded state, poster and end card stay visible.
 *    Forced colours drop gradients, shadows and author colours, so this is
 *    checked on rendered pixels, in dark and light high-contrast themes.
 * ==================================================================== */
{
  // Pixel statistics of an element screenshot, decoded in a blank page
  const decoder = await (await browser.newContext()).newPage();
  const pixels = async (loc) => {
    const b64 = (await loc.screenshot()).toString('base64');
    return decoder.evaluate(async (data) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      const counts = new Map();
      for (let i = 0; i < d.length; i += 4) { const k = `${d[i]},${d[i + 1]},${d[i + 2]}`; counts.set(k, (counts.get(k) || 0) + 1); }
      const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      const total = d.length / 4;
      return { dominant: sorted[0][0], other: 1 - sorted[0][1] / total, colours: sorted.length };
    }, b64);
  };
  // Forced colours keep the alpha of the author colour (transparent stays transparent)
  const opaque = (bg) => { const m = /rgba?\(([^)]+)\)/.exec(bg || ''); if (!m) return false; const a = m[1].split(',')[3]; return a === undefined || Number(a) >= 0.99; };
  for (const scheme of ['dark', 'light']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, forcedColors: 'active', colorScheme: scheme });
    const fc = await context.newPage();
    const errs = [];
    fc.on('pageerror', (e) => errs.push(e.message));
    await gotoApp(fc, '#/overview', file);
    await ensurePlayer(fc);
    ok(`forced colours (${scheme}): media query active`, await fc.evaluate(() => matchMedia('(forced-colors: active)').matches));
    const poster = await fc.evaluate(() => getComputedStyle(document.querySelector('.media-player .media-poster')).backgroundColor);
    ok(`forced colours (${scheme}): poster keeps an opaque background (scene 1 does not show through)`, opaque(poster), poster);
    await setRange(fc, '.media-seek', 25);
    await fc.evaluate(() => { document.querySelector('[data-fid="media-chapters-toggle"]').click(); });
    await wait(fc, 200);
    const seekPx = await pixels(fc.locator('.media-player .media-seek-wrap'));
    // the track spans the full width: border, progress fill, ticks and thumb
    ok(`forced colours (${scheme}): seek track, progress, thumb and chapter ticks are drawn`, seekPx.other > 0.12 && seekPx.colours >= 3, seekPx);
    const ticksPx = await fc.evaluate(() => [...document.querySelectorAll('.media-player .media-tick')].map((el) => { const cs = getComputedStyle(el); return { bg: cs.backgroundColor, h: el.getBoundingClientRect().height, fca: cs.forcedColorAdjust }; }));
    ok(`forced colours (${scheme}): chapter ticks use a system colour that crosses the track`, ticksPx.length === 5 && ticksPx.every((tk) => tk.fca === 'none' && tk.h > 8 && opaque(tk.bg)), ticksPx);
    const volPx = await pixels(fc.locator('.media-player .media-volume'));
    ok(`forced colours (${scheme}): volume slider is drawn`, volPx.other > 0.12, volPx);
    // Captions (pressed) and Chapters (expanded) vs Transcript (collapsed)
    const cc = await pixels(fc.locator('[data-fid="media-captions"]'));
    const chp = await pixels(fc.locator('[data-fid="media-chapters-toggle"]'));
    const txb = await pixels(fc.locator('[data-fid="media-transcript-toggle"]'));
    ok(`forced colours (${scheme}): pressed Captions and expanded Chapters are visibly marked (system selection colour)`, cc.dominant !== txb.dominant && chp.dominant !== txb.dominant && cc.dominant === chp.dominant, { cc, chp, txb });
    await fc.locator('[data-fid="media-captions"]').focus();
    await fc.keyboard.press('Shift+Tab');
    await fc.keyboard.press('Tab');
    const ring = await fc.evaluate(() => { const cs = getComputedStyle(document.activeElement); return { fid: document.activeElement.getAttribute('data-fid'), style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), color: cs.outlineColor, bg: cs.backgroundColor }; });
    ok(`forced colours (${scheme}): focus ring on a pressed button differs from its fill`, ring.fid === 'media-captions' && ring.style === 'solid' && ring.width >= 2 && ring.color !== ring.bg, ring);
    // Scene data graphics: the principal/interest bar of scene 5 stays drawn
    await setRange(fc, '.media-seek', (enCh.resume.end - 0.5).toFixed(1));
    await wait(fc, 500);
    const barPx = await pixels(fc.locator('.media-player .media-scene--resume .media-bar'));
    ok(`forced colours (${scheme}): scene payment bar (hatched principal + interest) is drawn`, barPx.other > 0.3 && barPx.colours >= 3, barPx);
    // End card (real actions) is opaque over scene 6
    await setRange(fc, '.media-seek', (enCues.duration - 0.6).toFixed(1));
    await clickFid(fc, 'media-play');
    await fc.waitForFunction(() => window.BDCNotice.media.state().ended, null, { timeout: 6000 }).catch(() => {});
    const endBg = await fc.evaluate(() => { const el = document.querySelector('.media-player .media-endcard'); return { hidden: el.hidden, bg: getComputedStyle(el).backgroundColor }; });
    ok(`forced colours (${scheme}): end card is opaque over scene 6`, !endBg.hidden && opaque(endBg.bg), endBg);
    if (shots) await fc.locator('.media-player .media-frame').screenshot({ path: `${shots}/fc-${scheme}-1280-endcard.png` });
    ok(`forced colours (${scheme}): no page errors`, errs.length === 0, errs);
    await context.close();
  }
  await decoder.context().close();
}

/* ======================================================================
 * 7. S-20: viewing events follow what was actually played
 *    - jumping to the end while playing is not a completed viewing, and the
 *      chapters crossed by the jump are not "viewed";
 *    - a full viewing logs video_completed and every chapter. The narration
 *      is played at 4x the selected speed here (test-only patch of the media
 *      element's playbackRate setter) to keep the run short.
 * ==================================================================== */
{
  const vids = (pg) => pg.evaluate(() => window.BDCNotice.events.all().filter((e) => e.type.startsWith('video')).map((e) => `${e.type}:${e.id}`));
  const jp = await newPage(browser, { width: 1280, height: 900 });
  await gotoApp(jp.page, '#/overview', file);
  await ensurePlayer(jp.page);
  await clickFid(jp.page, 'media-poster-play');
  await jp.page.waitForFunction(() => window.BDCNotice.media.state().time > 1.4, null, { timeout: 8000 }).catch(() => {});
  await jp.page.locator('.media-player .media-seek').focus();
  await jp.page.keyboard.press('End');
  await jp.page.waitForFunction(() => window.BDCNotice.media.state().ended, null, { timeout: 4000 }).catch(() => {});
  await wait(jp.page, 300);
  let ve = await vids(jp.page);
  const jst = await state(jp.page);
  ok('S-20: End on the seek bar while playing shows the end card but logs no video_completed and no viewed chapter it skipped',
    jst.ended && ve.includes('video_chapter_viewed:en-CA:welcome') && !ve.includes('video_completed:en-CA') && !ve.some((x) => /:(relief|difference|tradeoff|resume|next-step)$/.test(x)), ve);
  // Seeking across chapters while playing: only the chapter that then plays for ~1 s counts
  await setRange(jp.page, '.media-seek', (enCh.difference.start + 1).toFixed(1));
  await clickFid(jp.page, 'media-play');
  await wait(jp.page, 400);
  await setRange(jp.page, '.media-seek', (enCh.resume.start + 0.5).toFixed(1));
  await jp.page.waitForFunction((st) => window.BDCNotice.media.state().time > st + 1.3, enCh.resume.start + 0.5, { timeout: 6000 }).catch(() => {});
  await clickFid(jp.page, 'media-play');
  ve = await vids(jp.page);
  ok('S-20: a chapter passed through for under 1 s is not viewed; one played for 1 s is', !ve.includes('video_chapter_viewed:en-CA:difference') && ve.includes('video_chapter_viewed:en-CA:resume'), ve);
  await jp.context.close();

  const fw = await newPage(browser, { width: 1280, height: 900 });
  await gotoApp(fw.page, '#/overview', file);
  await fw.page.evaluate(() => {
    const P = HTMLMediaElement.prototype;
    for (const k of ['playbackRate', 'defaultPlaybackRate']) {
      const d = Object.getOwnPropertyDescriptor(P, k);
      Object.defineProperty(P, k, { configurable: true, get() { return d.get.call(this); }, set(v) { d.set.call(this, v * 4); } });
    }
  });
  await ensurePlayer(fw.page);
  await clickFid(fw.page, 'media-poster-play');
  await fw.page.waitForFunction(() => window.BDCNotice.media.state().ended, null, { timeout: 40000 }).catch(() => {});
  await wait(fw.page, 200);
  ve = await vids(fw.page);
  const chapters = enCues.chapters.map((c) => `video_chapter_viewed:en-CA:${c.id}`);
  ok('S-20: watching the whole narration logs video_completed and all six chapters, in order', (await state(fw.page)).ended && ve.includes('video_completed:en-CA')
    && chapters.every((c) => ve.includes(c)) && chapters.every((c, i) => i === 0 || ve.indexOf(c) > ve.indexOf(chapters[i - 1])) && ve.indexOf('video_completed:en-CA') > ve.indexOf(chapters[5]), ve);
  ok('S-20: full viewing has no console errors', fw.consoleMsgs.length === 0, fw.consoleMsgs.slice(0, 4));
  await fw.context.close();
}

/* ======================================================================
 * 8. S-01: scene 2 month rows - the label and the value never overlap
 *    (the value wraps below the label when both don't fit), at any width.
 * ==================================================================== */
{
  const rw = await newPage(browser, { width: 320, height: 900, reducedMotion: 'reduce' });
  await gotoApp(rw.page, '#/overview', file);
  await ensurePlayer(rw.page);
  for (const locale of ['en-CA', 'fr-CA']) {
    await rw.page.evaluate((l) => window.BDCNotice.i18n.setLocale(l), locale);
    await wait(rw.page, 150);
    await ensurePlayer(rw.page);
    const c = locale === 'en-CA' ? enCues : frCues;
    const bad = [];
    for (let w = 300; w <= 1300; w += (w < 700 ? 10 : 50)) {
      await rw.page.setViewportSize({ width: w, height: 900 });
      await wait(rw.page, 40);
      await setRange(rw.page, '.media-seek', (c.chapters[1].end - 0.5).toFixed(1));
      const r = await rw.page.evaluate(() => {
        const out = [];
        const rectsOf = (el) => { const rg = document.createRange(); rg.selectNodeContents(el); return [...rg.getClientRects()].filter((q) => q.width > 0); };
        document.querySelectorAll('.media-player .media-scene[data-scene="relief"] .media-row').forEach((row, i) => {
          const lab = row.querySelector('.media-row-label');
          const vals = [...row.querySelectorAll('.media-row-value span')].filter((sp) => !sp.children.length && Number(getComputedStyle(sp).opacity) >= 0.5);
          const lr = rectsOf(lab);
          const rr = row.getBoundingClientRect();
          for (const v of vals) {
            for (const b of rectsOf(v)) {
              if (b.right > rr.right + 0.5 || b.left < rr.left - 0.5) out.push(`row ${i} value outside the row`);
              for (const a of lr) {
                const vo = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                const ho = Math.min(a.right, b.right) - Math.max(a.left, b.left);
                if (vo > 1 && ho > -2) out.push(`row ${i} "${lab.textContent}"/"${v.textContent}" overlap ${ho.toFixed(1)}px`);
              }
            }
          }
        });
        return out;
      });
      if (r.length) bad.push(`${w}px: ${r[0]}`);
    }
    ok(`S-01 ${locale}: scene 2 row labels and values never overlap (300-1300 px)`, bad.length === 0, bad.slice(0, 4));
  }
  await rw.context.close();
}

/* ======================================================================
 * 9. S-02: on phones the stage, the captions and the controls fit on one
 *    screen, in every chapter, on the poster and on the end card; text stays
 *    at least 12 px; the secondary controls open from "More controls".
 * ==================================================================== */
for (const [w, hgt] of [[320, 568], [320, 640], [360, 640], [375, 667], [390, 844]]) {
  for (const locale of ['en-CA', 'fr-CA']) {
    const ph = await newPage(browser, { width: w, height: hgt });
    await gotoApp(ph.page, '#/overview', file);
    await ph.page.evaluate((l) => { if (window.BDCNotice.i18n.locale !== l) window.BDCNotice.i18n.setLocale(l); }, locale);
    await wait(ph.page, 150);
    await ensurePlayer(ph.page);
    const c = locale === 'en-CA' ? enCues : frCues;
    const measure = () => ph.page.evaluate(() => {
      const frame = document.querySelector('.media-player .media-frame');
      const canvas = document.querySelector('.media-player .media-canvas');
      const parts = ['.media-canvas', '.media-caption', '.media-controls'].map((q) => document.querySelector(`.media-player ${q}`).getBoundingClientRect());
      const scene = document.querySelector('.media-player .media-scene.is-active');
      let minFs = 99;
      let minEl = '';
      const roots = [scene, document.querySelector('.media-player .media-caption'), document.querySelector('.media-player .media-controls')];
      for (const root of roots) {
        if (!root) continue;
        root.querySelectorAll('*').forEach((el) => {
          const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
          if (!own || !el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') return;
          if (el.closest('.sr-only') || (el.classList.contains('media-btn-text') && getComputedStyle(el).position === 'absolute')) return;
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if (fs < minFs) { minFs = fs; minEl = el.className || el.tagName; }
        });
      }
      // overlap: stage parts stacked without overlapping each other
      const stacked = parts[0].bottom <= parts[1].top + 0.5 && parts[1].bottom <= parts[2].top + 0.5;
      return {
        vh: window.innerHeight,
        frame: Math.round(frame.getBoundingClientRect().height),
        overflow: scene ? scene.scrollHeight > canvas.clientHeight + 1 : false,
        minFs, minEl, stacked, scene: scene ? scene.dataset.scene : '',
      };
    });
    const problems = [];
    let maxFrame = 0;
    for (const ch of c.chapters) {
      for (const tm of [ch.start + 1.5, ch.end - 0.4]) {
        await setRange(ph.page, '.media-seek', tm.toFixed(1));
        const m = await measure();
        maxFrame = Math.max(maxFrame, m.frame);
        if (m.frame > m.vh) problems.push(`${ch.id}@${tm.toFixed(1)}: frame ${m.frame} > ${m.vh}`);
        if (m.overflow) problems.push(`${ch.id}: scene overflows the stage`);
        if (m.minFs < 12) problems.push(`${ch.id}: ${m.minEl} at ${m.minFs}px`);
        if (!m.stacked) problems.push(`${ch.id}: stage, captions and controls overlap`);
      }
    }
    // poster (fresh player state) and end card
    await ph.page.evaluate(() => window.BDCNotice.shell.resetDemo());
    await wait(ph.page, 200);
    await ensurePlayer(ph.page);
    const posterFrame = (await measure()).frame;
    if (posterFrame > hgt) problems.push(`poster frame ${posterFrame} > ${hgt}`);
    await setRange(ph.page, '.media-seek', (c.duration - 0.5).toFixed(1));
    await clickFid(ph.page, 'media-play');
    await ph.page.waitForFunction(() => window.BDCNotice.media.state().ended, null, { timeout: 6000 }).catch(() => {});
    const endFrame = (await measure()).frame;
    if (endFrame > hgt) problems.push(`end card frame ${endFrame} > ${hgt}`);
    ok(`S-02 ${locale} ${w}x${hgt}: stage + captions + controls fit on one screen (max ${maxFrame}px), text ≥ 12px, no overlap`, problems.length === 0, problems.slice(0, 4));

    // "More controls": one row of buttons; the secondary controls open on demand
    const more = await ph.page.evaluate(() => {
      const btn = document.querySelector('.media-player [data-fid="media-more"]');
      const vis = (f) => { const el = document.querySelector(`.media-player [data-fid="${f}"]`); return !!(el && el.getClientRects().length); };
      const rowTops = new Set([...document.querySelectorAll('.media-player .media-ctl-row button, .media-player .media-ctl-row select, .media-player .media-ctl-row input')]
        .filter((el) => el.getClientRects().length).map((el) => { const q = el.getBoundingClientRect(); return Math.round((q.top + q.bottom) / 2 / 12); }));
      return { shown: vis('media-more'), expanded: btn.getAttribute('aria-expanded'), controls: btn.getAttribute('aria-controls'), name: btn.getAttribute('aria-label'), secondary: ['media-chapters-toggle', 'media-speed', 'media-captions', 'media-transcript-toggle'].map(vis), rows: rowTops.size };
    });
    await clickFid(ph.page, 'media-more');
    const opened = await ph.page.evaluate(() => {
      const btn = document.querySelector('.media-player [data-fid="media-more"]');
      const vis = (f) => { const el = document.querySelector(`.media-player [data-fid="${f}"]`); return !!(el && el.getClientRects().length); };
      return { expanded: btn.getAttribute('aria-expanded'), target: !!document.getElementById(btn.getAttribute('aria-controls')), secondary: ['media-chapters-toggle', 'media-speed', 'media-captions', 'media-transcript-toggle'].map(vis), frame: Math.round(document.querySelector('.media-player .media-frame').getBoundingClientRect().height) };
    });
    await clickFid(ph.page, 'media-captions');
    const capOff = (await state(ph.page)).captions === false;
    await clickFid(ph.page, 'media-captions');
    const moreName = locale === 'en-CA' ? 'More controls' : 'Autres commandes';
    ok(`S-02 ${locale} ${w}px: one row of buttons; "${moreName}" (aria-expanded) reveals chapters, speed, captions and transcript`,
      more.shown && more.expanded === 'false' && more.name === moreName && more.secondary.every((v) => !v) && more.rows === 1
      && opened.expanded === 'true' && opened.target && opened.secondary.every(Boolean) && capOff, { more, opened, capOff });
    const of = await mediaOverflow(ph.page, mode);
    ok(`S-02 ${locale} ${w}px: no horizontal overflow with the secondary controls open`, of.media.length === 0 && !of.doc, of);
    if (shots && (w === 320 || w === 375)) await ph.page.locator('.media-player .media-frame').screenshot({ path: `${shots}/${locale}-${w}x${hgt}-more.png` });
    ok(`S-02 ${locale} ${w}px: no console errors`, ph.consoleMsgs.length === 0, ph.consoleMsgs.slice(0, 3));
    await ph.context.close();
  }
}
// Wider frames show every control and no "More controls" toggle
{
  const wd = await newPage(browser, { width: 768, height: 900 });
  await gotoApp(wd.page, '#/overview', file);
  await ensurePlayer(wd.page);
  const r = await wd.page.evaluate(() => {
    const vis = (f) => { const el = document.querySelector(`.media-player [data-fid="${f}"]`); return !!(el && el.getClientRects().length); };
    return { more: vis('media-more'), all: ['media-chapters-toggle', 'media-speed', 'media-captions', 'media-transcript-toggle', 'media-volume'].map(vis) };
  });
  ok('768px: every control shown directly; no "More controls" toggle', !r.more && r.all.every(Boolean), r);
  await wd.context.close();
}

await browser.close();
const failed = results.filter(([c]) => !c).length;
console.log(failed ? `\n${failed} of ${results.length} media checks failed` : `\n✓ all ${results.length} media checks passed`);
process.exit(failed ? 1 : 0);
