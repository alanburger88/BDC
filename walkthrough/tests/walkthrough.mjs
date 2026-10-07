#!/usr/bin/env node
/* Walkthrough QA (Chromium). Serves walkthrough/dist with its Netlify _headers and checks:
 * layout at 11 screen sizes, the persistent controls, progress, persistence, the slide
 * view, every live stop's "Show me" action at each simulated device, the fallback when
 * the notice can't be embedded, the Content-Security-Policy, and an axe-core scan.
 *
 *   node walkthrough/tools/build.mjs && node walkthrough/tests/walkthrough.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../../tests/lib/browser.mjs';
import { serve } from './server.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const DIST = process.env.WT_DIST || join(here, '..', 'dist'); // WT_DIST: test another build folder
const axeSrc = readFileSync(join(here, '..', '..', 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const content = JSON.parse(readFileSync(join(DIST, 'js', 'content.js'), 'utf8').replace(/^[\s\S]*?window\.WT_CONTENT = /, '').replace(/;\s*$/, ''));
const deck = JSON.parse(readFileSync(join(here, '..', 'src', 'content', 'deck.json'), 'utf8'));

const results = [];
let failed = 0;
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail: ok ? '' : String(detail).slice(0, 600) });
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `\n    ${String(detail).slice(0, 600)}`}`);
}

const STEP_HASHES = [
  '#/welcome', '#/how-it-works',
  ...content.slides.map((s) => `#/slides/${s.n}`),
  ...content.live.stops.map((s) => `#/live/${s.id}`),
];
const VIEWPORTS = [[320, 640], [375, 667], [390, 844], [700, 1000], [740, 900], [768, 1024], [820, 1180], [1024, 768], [1180, 820], [1280, 800], [1366, 657], [1366, 768], [1440, 900], [1536, 864], [1920, 1080], [1280, 600]];

const srv = await serve(DIST);
const browser = await launch();

async function newPage({ width = 1440, height = 900, reducedMotion = 'reduce', url = srv.url, bypassCSP = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion, bypassCSP });
  const page = await context.newPage();
  const problems = [];
  page.on('console', (m) => {
    const t = m.text();
    if (/Content Security Policy|Refused to/.test(t)) problems.push(`csp: ${t}`);
    else if (m.type() === 'error' && !/ERR_FAILED|ERR_ABORTED/.test(t)) problems.push(`${m.type()}: ${t}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.route('https://accessibilityserver.org/**', (r) => r.abort());
  page.base = url;
  return { context, page, problems };
}
async function open(page, hash) {
  await page.goto(`${page.base}/${hash}`);
  await page.waitForSelector('html.wt-ready', { state: 'attached' });
  await page.waitForTimeout(120);
}
const waitReady = (page) => page.waitForFunction(() => window.WT_NOTICE && window.WT_NOTICE.state() === 'ready', null, { timeout: 20000 });

function overflow(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const vw = de.clientWidth;
    const bad = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('.is-offstage, .sr-only, dialog:not([open]), .sprite')) continue;
      const cs = getComputedStyle(el);
      if (cs.position === 'absolute' && cs.clipPath === 'inset(50%)') continue; // visually hidden label
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      if (r.right > vw + 1 || r.left < -1) bad.push(`${el.tagName.toLowerCase()}.${String(el.className.baseVal ?? el.className).split(' ')[0]} [${Math.round(r.left)}..${Math.round(r.right)}]`);
    }
    return { sw: de.scrollWidth, vw, bad: bad.slice(0, 6) };
  });
}

try {
  /* ---------------- content ---------------- */
  {
    const notes = deck.slides.map((s) => s.notes.replace(/\s+/g, ' ').trim());
    const rebuilt = content.slides.map((s) => ['notice', 'why', 'keep'].map((g) => s.talk[g]).filter(Boolean).join(' '));
    check('talk tracks are the speaker notes, verbatim, for all 18 slides', notes.length === 18 && notes.every((n, i) => n === rebuilt[i]),
      notes.map((n, i) => (n === rebuilt[i] ? null : i + 1)).filter(Boolean).join(', '));
    check('33 steps: 2 intro, 18 slides, 13 live (12 stops + wrap-up)', STEP_HASHES.length === 33);
  }

  /* ---------------- every step renders ---------------- */
  {
    const { page, problems } = await newPage({ width: 1440, height: 900 });
    const missing = [];
    const titles = [];
    for (const hash of STEP_HASHES) {
      await open(page, hash);
      const info = await page.evaluate(() => {
        const h1 = document.querySelector('.layer:not(.is-offstage) h1');
        return { h1: h1 && h1.textContent.trim(), hash: location.hash, title: document.title };
      });
      if (!info.h1 || info.hash !== hash) missing.push(`${hash} -> ${info.hash} h1=${info.h1}`);
      titles.push(info.title);
    }
    check('each of the 33 steps opens from its URL and shows a heading', !missing.length, missing.join('; '));
    check('the browser tab title names the step', new Set(titles).size === 33, titles.slice(0, 4).join(' | '));
    await open(page, '#/slides/3');
    await page.evaluate(() => { location.hash = '#/nothing-here'; });
    await page.waitForTimeout(150);
    check('an unknown address typed during a visit keeps the current step', await page.evaluate(() => location.hash === '#/slides/3'));
    {
      const fresh = await newPage({ width: 1280, height: 800 });
      await open(fresh.page, '#/nothing-here');
      check('an unknown address on arrival opens the welcome step', await fresh.page.evaluate(() => location.hash === '#/welcome' && !!document.querySelector('.welcome-title')));
      await fresh.context.close();
    }
    // slide images
    const broken = [];
    for (const s of content.slides) {
      await open(page, `#/slides/${s.n}`);
      const ok = await page.evaluate(async () => { const img = document.querySelector('.slide-frame img'); if (!img.complete) await img.decode().catch(() => {}); return img.naturalWidth > 0 && img.alt.length > 10; });
      if (!ok) broken.push(s.n);
    }
    check('all 18 slide images load and have alternative text', !broken.length, broken.join(', '));
    // talk track rendered
    await open(page, '#/slides/6');
    const talk = await page.evaluate(() => [...document.querySelectorAll('.talk-block')].map((b) => [b.querySelector('h2').textContent, b.querySelector('p').textContent]));
    check('slide 6 shows What to notice, Why it matters and Keep in mind', talk.length === 3 && talk[0][0] === 'What to notice' && talk[1][0] === 'Why it matters' && talk[2][0] === 'Keep in mind', JSON.stringify(talk));
    await page.click('details.more summary');
    const slideText = await page.evaluate(() => document.querySelectorAll('.slide-text-list li').length);
    check('“Read the slide text” reveals the slide transcript', slideText >= 3, slideText);
    check('no console errors or CSP violations while visiting every step', !problems.length, problems.join('\n'));
    await page.context().close();
  }

  /* ---------------- layout at every size ---------------- */
  {
    const sample = ['#/welcome', '#/how-it-works', '#/slides/1', '#/slides/9', '#/slides/18', '#/live/meet', '#/live/financials', '#/live/close'];
    const issues = [];
    const fit = [];
    const controls = [];
    for (const [w, hgt] of VIEWPORTS) {
      const { page, problems } = await newPage({ width: w, height: hgt });
      for (const hash of sample) {
        await open(page, hash);
        if (hash.startsWith('#/live/') && hash !== '#/live/close') await page.waitForTimeout(250);
        const o = await overflow(page);
        if (o.sw > o.vw + 1 || o.bad.length) issues.push(`${w}x${hgt} ${hash}: scrollWidth ${o.sw}/${o.vw} ${o.bad.join(', ')}`);
        if (hash === '#/live/meet') {
          for (const dev of ['desktop', 'tablet', 'mobile']) {
            await page.click(`#device-switch [data-device="${dev}"]`);
            await page.waitForTimeout(150);
            const f = await page.evaluate(() => {
              const area = document.querySelector('.device-area').getBoundingClientRect();
              const holder = document.querySelector('.device-holder').getBoundingClientRect();
              const dev = document.querySelector('.device').getBoundingClientRect();
              return { ok: holder.width <= area.width + 1 && dev.right <= document.documentElement.clientWidth + 1 && dev.left >= -1 && Math.abs(dev.width - holder.width) < 2, area: [Math.round(area.width), Math.round(area.height)], dev: [Math.round(dev.width), Math.round(dev.height)], caption: document.querySelector('.device-caption').textContent };
            });
            if (!f.ok) fit.push(`${w}x${hgt} ${dev}: ${JSON.stringify(f)}`);
            const o2 = await overflow(page);
            if (o2.sw > o2.vw + 1) issues.push(`${w}x${hgt} live ${dev}: scrollWidth ${o2.sw}/${o2.vw}`);
          }
        }
      }
      // intro and wrap-up: in the one-screen layout, content either fits or fades to show there is more
      if (w >= 1024 && hgt >= 620) {
        for (const hash of ['#/welcome', '#/how-it-works', '#/live/close']) {
          await open(page, hash);
          await page.waitForTimeout(80);
          const f = await page.evaluate(() => { const p = document.querySelector('.layer:not(.is-offstage) .page'); return { over: p.scrollHeight > p.clientHeight + 4, cue: p.classList.contains('is-clipped') }; });
          if (f.over && !f.cue) issues.push(`${w}x${hgt} ${hash}: content is cut off without a scroll cue`);
        }
      }
      // persistent controls: visible, named, at least 40px tall
      const c = await page.evaluate(() => {
        const ids = ['btn-back', 'btn-next', 'btn-contents', 'btn-open', 'btn-restart'];
        const els = [...ids.map((id) => document.getElementById(id)), ...document.querySelectorAll('#mode-switch .seg-btn, #device-switch .seg-btn')];
        return els.map((e) => {
          const r = e.getBoundingClientRect();
          const name = (e.getAttribute('aria-label') || e.innerText || e.textContent).trim();
          const inView = r.top >= 0 && r.bottom <= window.innerHeight + 1 && r.width > 0;
          return { id: e.id || e.dataset.mode || e.dataset.device, name, ok: inView && r.height >= 39 && name.length > 1, h: Math.round(r.height) };
        }).filter((x) => !x.ok);
      });
      if (c.length) controls.push(`${w}x${hgt}: ${JSON.stringify(c)}`);
      if (problems.length) issues.push(`${w}x${hgt} console: ${problems.join(' | ')}`);
      await page.context().close();
    }
    check(`no horizontal scrolling and no unannounced cut-off content on ${VIEWPORTS.length} screen sizes (8 steps each, live view in 3 devices)`, !issues.length, issues.join('\n'));
    check('the simulated device always fits its stage (desktop, tablet, mobile at every size)', !fit.length, fit.join('\n'));
    check('all persistent controls are on screen, named and at least 40px tall at every size', !controls.length, controls.join('\n'));
  }

  /* ---------------- controls and navigation ---------------- */
  {
    const { page, problems } = await newPage({ width: 1440, height: 900 });
    await open(page, '#/welcome');
    check('Back is disabled on the first step', await page.isDisabled('#btn-back'));
    await page.click('#btn-next');
    check('Next moves one step and keeps focus on Next', await page.evaluate(() => location.hash === '#/how-it-works' && document.activeElement.id === 'btn-next'));
    await page.keyboard.press('ArrowRight');
    check('the right arrow key moves to the next step', await page.evaluate(() => location.hash === '#/slides/1'));
    await page.keyboard.press('PageDown');
    await page.keyboard.press('PageDown');
    check('presentation clickers (Page Down) advance slides', await page.evaluate(() => location.hash === '#/slides/3'));
    await page.keyboard.press('ArrowLeft');
    check('the left arrow key goes back', await page.evaluate(() => location.hash === '#/slides/2'));
    const progress = await page.evaluate(() => ({ text: document.getElementById('progress-text').textContent, now: document.getElementById('progress-bar').getAttribute('aria-valuenow'), max: document.getElementById('progress-bar').getAttribute('aria-valuemax'), next: document.getElementById('progress-next').textContent, part: document.querySelector('.part-btn[aria-current="step"]').textContent }));
    check('progress shows the part, the slide number and what is next', progress.text === '2. Presentation · Slide 2 of 18' && progress.now === '4' && progress.max === '33' && progress.next === 'Up next: The “last mile” friction gap' && /Presentation/.test(progress.part), JSON.stringify(progress));

    // mode switch keeps the place in each part
    await open(page, '#/slides/7');
    await page.click('#mode-switch [data-mode="live"]');
    check('Live statement switch opens the first live stop', await page.evaluate(() => location.hash === '#/live/meet'));
    await page.click('#mode-switch [data-mode="presentation"]');
    check('Presentation switch returns to the slide you left (slide 7)', await page.evaluate(() => location.hash === '#/slides/7'));
    await open(page, '#/slides/4');
    await page.click('#device-switch [data-device="mobile"]');
    check('choosing a screen size from a slide opens the live statement in that size', await page.evaluate(() => location.hash.startsWith('#/live/') && document.querySelector('.device').classList.contains('device--mobile')));

    // contents
    await open(page, '#/slides/5');
    await page.click('#btn-contents');
    const toc = await page.evaluate(() => ({ open: document.getElementById('dlg-contents').open, items: document.querySelectorAll('.toc-item').length, current: document.querySelector('.toc-item[aria-current="step"]')?.textContent, focus: document.activeElement.classList.contains('toc-item') }));
    check('Contents lists all 33 steps, marks the current one and focuses it', toc.open && toc.items === 33 && /Slide 5/.test(toc.current) && toc.focus, JSON.stringify(toc));
    await page.click('.toc-item >> text=Interactive financial transparency');
    check('choosing a step in Contents goes there and closes the list', await page.evaluate(() => location.hash === '#/slides/10' && !document.getElementById('dlg-contents').open && document.activeElement.id === 'step-title'));
    await page.click('#btn-contents');
    await page.keyboard.press('Escape');
    check('Escape closes Contents and returns focus to the Contents button', await page.evaluate(() => !document.getElementById('dlg-contents').open && document.activeElement.id === 'btn-contents'));

    // open in new tab
    const link = await page.evaluate(() => { const a = document.getElementById('btn-open'); return { target: a.target, rel: a.rel, href: a.getAttribute('href'), name: a.textContent.trim() }; });
    check('Open live statement is a link to the notice that opens a new tab', link.target === '_blank' && /noopener/.test(link.rel) && /^notice\/index\.html#\//.test(link.href) && /new tab/.test(link.name), JSON.stringify(link));
    const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('#btn-open')]);
    await popup.waitForSelector('html.app-ready', { state: 'attached', timeout: 15000 });
    check('the new tab shows the Financing Change Notice', /Important financing notice/.test(await popup.title()));
    await popup.close();

    // zoomed slide
    await open(page, '#/slides/8');
    await page.click('.slide-zoom-btn');
    await page.keyboard.press('ArrowRight');
    const zoom = await page.evaluate(() => ({ open: document.getElementById('dlg-slide').open, count: document.getElementById('zoom-count').textContent, hash: location.hash }));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    const afterZoom = await page.evaluate(() => ({ open: document.getElementById('dlg-slide').open, focus: document.activeElement.className }));
    for (const [w, hgt] of [[1920, 1080], [820, 1180], [390, 844]]) {
      const z = await newPage({ width: w, height: hgt });
      await open(z.page, '#/slides/7');
      const inline = await z.page.evaluate(() => { const r = document.querySelector('.slide-frame img').getBoundingClientRect(); return r.width * r.height; });
      await z.page.click('.slide-zoom-btn');
      await z.page.waitForTimeout(150);
      const big = await z.page.evaluate(() => { const r = document.querySelector('.slide-zoom img').getBoundingClientRect(); return { area: r.width * r.height, inView: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1, bar: document.querySelector('.slide-zoom-bar').scrollWidth <= innerWidth }; });
      check(`Enlarge slide shows the slide larger and fully on screen at ${w}x${hgt}`, big.area > inline * 1.15 && big.inView && big.bar, JSON.stringify({ inline: Math.round(inline), ...big, area: Math.round(big.area) }));
      await z.context.close();
    }
    check('Enlarge slide opens a full view; arrow keys move through slides; Escape closes it', zoom.open && zoom.count === 'Slide 9 of 18' && zoom.hash === '#/slides/9' && !afterZoom.open && /slide-zoom-btn/.test(afterZoom.focus), JSON.stringify({ zoom, afterZoom }));

    // links between slides and stops
    await open(page, '#/slides/7');
    await page.click('text=See it in the live statement');
    check('“See it in the live statement” on slide 7 opens the matching stop', await page.evaluate(() => location.hash === '#/live/financials'));
    await page.click('.link-row');
    check('“From the presentation: slide 7” returns to the slide', await page.evaluate(() => location.hash === '#/slides/7'));

    // end of the walkthrough
    await open(page, '#/live/close');
    check('Next is disabled on the last step', await page.isDisabled('#btn-next'));
    check('the wrap-up step offers Open live statement, Review the slides and Restart', await page.evaluate(() => {
      const t = document.querySelector('.close-actions').textContent;
      return /Open live statement/.test(t) && /Review the slides/.test(t) && /Restart the walkthrough/.test(t) && document.querySelectorAll('.recap a').length === 5;
    }));
    check('no console errors or CSP violations while using the controls', !problems.length, problems.join('\n'));
    await page.context().close();
  }

  /* ---------------- persistence and restart ---------------- */
  {
    const { context, page } = await newPage({ width: 1280, height: 800 });
    await open(page, '#/slides/7');
    await page.goto(`${page.base}/`);
    await page.waitForSelector('html.wt-ready', { state: 'attached' });
    const resume = await page.evaluate(() => ({ hash: location.hash, btn: [...document.querySelectorAll('.welcome-actions button')].map((b) => b.textContent.trim()), meta: document.querySelector('.welcome-meta').textContent }));
    check('returning without a step address offers to continue where you left off', resume.hash === '#/welcome' && /Continue where you left off/.test(resume.btn[0]) && /slide 7/.test(resume.meta), JSON.stringify(resume));
    await page.click('.welcome-actions .btn-primary');
    check('Continue returns to slide 7', await page.evaluate(() => location.hash === '#/slides/7'));

    // restart clears the place and the live notice activity
    await open(page, '#/live/next-step');
    await waitReady(page);
    await page.click('#btn-showme');
    await page.waitForTimeout(400);
    const frame = page.frames().find((f) => f.url().includes('/notice/'));
    await frame.click('[data-fid="overview-mark-reviewed"]');
    await frame.click('[data-fid="lang-fr-CA"]');
    await page.click('#btn-restart');
    check('Restart asks for confirmation', await page.evaluate(() => document.getElementById('dlg-restart').open));
    await page.click('#btn-restart-confirm');
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => {
      const w = window.WT_NOTICE.frame().contentWindow;
      return { hash: location.hash, focus: document.activeElement.id, saved: JSON.parse(localStorage.getItem('isw-bdc-walkthrough-v1')), lang: w.BDCNotice.i18n.locale, route: w.location.hash, reviewed: w.BDCNotice.events.counts().marked_reviewed };
    });
    check('after Restart: welcome step, heading focused, saved place cleared', after.hash === '#/welcome' && after.focus === 'step-title' && after.saved && after.saved.resumeId === null && after.saved.lastSlide === 1, JSON.stringify(after));
    check('after Restart the live notice is back to English, on the overview, with no activity', after.lang === 'en-CA' && after.route === '#/overview' && after.reviewed === 0, JSON.stringify(after));
    await context.close();
  }

  /* ---------------- live stops at each device ---------------- */
  for (const [w, hgt, dev] of [[1440, 900, 'desktop'], [1440, 900, 'tablet'], [820, 1180, 'tablet'], [390, 844, 'mobile']]) {
    const { page, problems } = await newPage({ width: w, height: hgt });
    await open(page, '#/live/meet');
    await waitReady(page);
    await page.click(`#device-switch [data-device="${dev}"]`);
    const stops = content.live.stops.filter((s) => !s.close);
    const bad = [];
    for (let i = 0; i < stops.length; i += 1) {
      const s = stops[i];
      if (i) await page.click('#btn-next');
      await page.waitForTimeout(500);
      const enter = await page.evaluate(() => window.WT_NOTICE.frame().contentWindow.location.hash);
      if (s.enter && s.enter.route && enter !== s.enter.route) bad.push(`${s.id}: entered at ${enter}, expected ${s.enter.route}`);
      await page.click('#btn-showme');
      await page.waitForTimeout(900);
      const r = await page.evaluate(() => {
        const f = window.WT_NOTICE.frame();
        const d = f.contentDocument;
        const A = f.contentWindow.BDCNotice;
        const lit = [...d.querySelectorAll('[style*="outline"]')].filter((e) => e.style.outline.includes('solid')).map((e) => e.getAttribute('data-fid') || e.className);
        return { path: f.contentWindow.location.pathname, hash: f.contentWindow.location.hash, lang: A.i18n.locale, overlay: A.overlay.current(), popover: A.popover.isOpen(), lit, device: document.querySelector('.device').className, status: document.querySelector('.guide-status').textContent };
      });
      const sh = s.show || {};
      const want = [];
      if (r.path !== '/notice/index.html') want.push(`frame left the notice: ${r.path}`);
      if (sh.route && r.hash !== sh.route && !sh.click) want.push(`route ${r.hash} != ${sh.route}`);
      if (sh.spotlight && !r.lit.includes(sh.spotlight)) want.push(`no highlight on ${sh.spotlight} (${r.lit})`);
      if (sh.spotlightSelector && !r.lit.length) want.push(`no highlight for ${sh.spotlightSelector}`);
      if (sh.click === 'term-postponement-1' && !r.popover) want.push('definition did not open');
      if (sh.click && sh.click.startsWith('ask-') && r.overlay !== 'query') want.push(`question form not open (${r.overlay})`);
      if (sh.clair && r.overlay !== 'clair') want.push(`Clair not open (${r.overlay})`);
      if (sh.toggleLang && r.lang !== 'fr-CA') want.push(`language ${r.lang}`);
      if (sh.device === 'cycle' && !r.device.includes(dev === 'mobile' ? 'desktop' : 'mobile')) want.push(`device ${r.device}`);
      if (!r.status) want.push('no status message');
      if (want.length) bad.push(`${s.id}: ${want.join('; ')}`);
      if (sh.device === 'cycle') await page.click(`#device-switch [data-device="${dev}"]`);
    }
    check(`every live stop's “Show me” works (${dev} view at ${w}x${hgt})`, !bad.length, bad.join('\n'));
    check(`no console errors or CSP violations in the live statement (${dev} at ${w}x${hgt})`, !problems.length, problems.join('\n'));
    if (dev === 'desktop') {
      const counts = await page.evaluate(() => {
        const c = window.WT_NOTICE.frame().contentWindow.BDCNotice.events.counts();
        return { glossary: c.glossary_opened, lang: c.language_changed, sections: c.section_viewed };
      });
      check('the notice records the visit for Session insights (definitions, language, sections)', counts.glossary >= 1 && counts.lang >= 1 && counts.sections >= 3, JSON.stringify(counts));
    }
    await page.context().close();
  }

  /* ---------------- history, clicker keys, stop entry, demo device ---------------- */
  {
    const { page, problems } = await newPage({ width: 1440, height: 900 });
    await open(page, '#/welcome');
    await page.click('#btn-next');
    await page.click('#btn-next');
    await page.goBack();
    await page.waitForTimeout(200);
    check('browser Back returns to the previous step', await page.evaluate(() => location.hash === '#/how-it-works' && !!document.querySelector('.how-title')));
    await page.goForward();
    await page.waitForTimeout(200);
    check('browser Forward returns to the next step', await page.evaluate(() => location.hash === '#/slides/1'));

    // a panel open in the notice must not undo the walkthrough's history
    await open(page, '#/live/clair');
    await waitReady(page);
    await page.click('#btn-showme');
    await page.waitForTimeout(800);
    await page.click('#btn-next');
    await page.waitForTimeout(1200);
    const afterClair = await page.evaluate(() => { const w = window.WT_NOTICE.frame().contentWindow; return { hash: location.hash, overlay: w.BDCNotice.overlay.current(), route: w.location.hash }; });
    check('moving on with Clair open closes it and keeps the new step', afterClair.hash === '#/live/queries' && afterClair.overlay === null && afterClair.route === '#/payments', JSON.stringify(afterClair));
    await page.goBack();
    await page.waitForTimeout(600);
    check('browser Back after that returns to the Clair stop', await page.evaluate(() => location.hash === '#/live/clair'));

    // stop 7 starts clean after stop 6 opened the question form
    await open(page, '#/live/queries');
    await page.waitForTimeout(500);
    await page.click('#btn-showme');
    await page.waitForTimeout(900);
    await page.click('#btn-next');
    await page.waitForTimeout(1200);
    const lang = await page.evaluate(() => { const w = window.WT_NOTICE.frame().contentWindow; return { hash: location.hash, overlay: w.BDCNotice.overlay.current(), route: w.location.hash, y: w.scrollY }; });
    check('the language stop opens on a clean overview (no leftover form, scrolled to the top)', lang.hash === '#/live/languages' && lang.overlay === null && lang.route === '#/overview' && lang.y === 0, JSON.stringify(lang));

    // presentation clicker while the notice has focus
    const frame = page.frames().find((f) => f.url().includes('/notice/'));
    await frame.click('[data-fid="tab-changes"]');
    await page.keyboard.press('PageDown');
    await page.waitForTimeout(300);
    check('Page Down from a clicker advances the walkthrough even when the notice has focus', await page.evaluate(() => location.hash === '#/live/responsive'));
    await page.keyboard.press('PageUp');
    await page.waitForTimeout(300);
    check('Page Up goes back from inside the notice too', await page.evaluate(() => location.hash === '#/live/languages'));

    // open links: overview outside live stops; the wrap-up button too
    await open(page, '#/live/insights');
    await page.waitForTimeout(800);
    await page.click('#btn-next');
    const hrefs = await page.evaluate(() => ({ top: document.getElementById('btn-open').getAttribute('href'), close: document.querySelector('.close-actions a').getAttribute('href') }));
    check('after Session insights, the wrap-up and header links open the notice overview', hrefs.top === 'notice/index.html#/overview' && hrefs.close === 'notice/index.html#/overview', JSON.stringify(hrefs));
    check('no console errors in the history and clicker checks', !problems.length, problems.join('\n'));
    await page.context().close();
  }
  {
    const { page } = await newPage({ width: 390, height: 844 });
    await open(page, '#/live/responsive');
    await waitReady(page);
    await page.click('#btn-showme');
    const during = await page.evaluate(() => document.querySelector('.device').className);
    await page.click('#btn-next');
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({ device: document.querySelector('.device').className, pressed: document.querySelector('#device-switch [aria-pressed="true"]')?.dataset.device }));
    check('the responsive stop demonstrates another size, then restores the visitor’s size on Next', /device--desktop/.test(during) && /device--mobile/.test(after.device) && after.pressed === 'mobile', JSON.stringify({ during, after }));
    // phones: the stop heading comes before the device
    const order = await page.evaluate(() => document.getElementById('guide-title').getBoundingClientRect().top < document.querySelector('.device-area').getBoundingClientRect().top);
    check('on phones the stop’s heading is shown above the device', order);
    await page.context().close();
  }
  {
    const { page } = await newPage({ width: 1440, height: 900 });
    await open(page, '#/welcome');
    await page.click('text=Go straight to the live statement');
    const parts = await page.evaluate(() => [...document.querySelectorAll('.parts-list li')].map((li) => li.className));
    check('skipping ahead does not mark the skipped parts as completed', parts[0] !== 'is-done' && parts[1] !== 'is-done', JSON.stringify(parts));
    await open(page, '#/slides/3');
    const dev = await page.evaluate(() => [...document.querySelectorAll('#device-switch .seg-btn')].map((b) => [b.getAttribute('aria-pressed'), b.title]));
    check('outside the live statement no screen size looks selected, and each explains it opens the live statement', dev.every(([p, t]) => p === 'false' && /Show the live statement/.test(t)), JSON.stringify(dev));
    await page.context().close();
  }

  /* ---------------- focus is not taken by the notice on Next ---------------- */
  {
    const { page } = await newPage({ width: 1440, height: 900 });
    await open(page, '#/live/meet');
    await waitReady(page);
    for (let i = 0; i < 5; i += 1) { await page.click('#btn-next'); await page.waitForTimeout(450); }
    check('moving between stops keeps keyboard focus on Next (the notice never takes it)', await page.evaluate(() => document.activeElement.id === 'btn-next'));
    await page.context().close();
  }

  /* ---------------- fallback when embedding is blocked ---------------- */
  {
    const blocked = await serve(DIST, { extraHeaders: (path) => (path.startsWith('/notice/') ? { 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'" } : null) });
    const { page } = await newPage({ width: 1280, height: 800, url: blocked.url });
    await open(page, '#/live/meet');
    await page.waitForFunction(() => ['blocked', 'failed'].includes(window.WT_NOTICE.state()), null, { timeout: 25000 });
    const fb = await page.evaluate(() => {
      const ov = document.querySelector('.device-overlay');
      const poster = document.querySelector('.device-poster');
      const a = ov.querySelector('a');
      return { visible: !ov.hidden, heading: ov.querySelector('h2').textContent, link: a && a.textContent.trim(), href: a && a.getAttribute('href'), target: a && a.target, poster: poster.complete && poster.naturalWidth > 0 && getComputedStyle(poster).visibility === 'visible', alt: poster.alt };
    });
    check('blocked embedding: a preview in the device frame and a prominent “Open live statement”', fb.visible && /can't be shown/.test(fb.heading) && /Open live statement/.test(fb.link) && fb.target === '_blank' && /^notice\/index\.html/.test(fb.href) && fb.poster && /Preview/.test(fb.alt), JSON.stringify(fb));
    await page.click('#btn-showme');
    await page.waitForTimeout(250);
    check('“Show me” explains what to do when the notice is unavailable', /isn’t available|still loading/.test(await page.textContent('.guide-status')));
    const o = await overflow(page);
    check('the fallback view has no horizontal scrolling', o.sw <= o.vw + 1, JSON.stringify(o));
    await page.context().close();
    await blocked.close();
  }

  /* ---------------- accessibility (axe-core) ---------------- */
  {
    const violations = [];
    for (const [w, hgt] of [[1440, 900], [390, 844]]) {
      // The page's CSP forbids injected scripts; axe needs one, so this context bypasses it.
      const { page } = await newPage({ width: w, height: hgt, bypassCSP: true });
      const scan = async (label) => {
        await page.addScriptTag({ content: axeSrc });
        const r = await page.evaluate(async () => {
          const res = await window.axe.run({ exclude: [['iframe']] }, { iframes: false, runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] });
          return res.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
        });
        r.forEach((v) => violations.push(`${w}px ${label}: ${v}`));
      };
      for (const hash of ['#/welcome', '#/how-it-works', '#/slides/6', '#/live/clair', '#/live/close']) {
        await open(page, hash);
        if (hash === '#/slides/6' || hash === '#/live/clair') { await page.waitForTimeout(200); await page.click('.layer:not(.is-offstage) details.more summary'); }
        await scan(hash);
      }
      await page.click('#btn-contents');
      await scan('contents dialog');
      await page.keyboard.press('Escape');
      await page.click('#btn-restart');
      await scan('restart dialog');
      await page.context().close();
    }
    check('axe-core: no WCAG 2.2 A/AA violations (5 steps and 2 dialogs, desktop and phone)', !violations.length, violations.join('\n'));
  }
} catch (e) {
  check('test run completed', false, e.stack || e.message);
} finally {
  await browser.close();
  await srv.close();
}

const RESULTS = process.env.WT_RESULTS || join(here, 'results');
mkdirSync(RESULTS, { recursive: true });
writeFileSync(join(RESULTS, 'walkthrough.json'), `${JSON.stringify({ ranAt: new Date().toISOString(), passed: results.filter((r) => r.ok).length, failed, results }, null, 2)}\n`);
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
