#!/usr/bin/env node
// Help module QA: searchable FAQ (EN + FR, accent-insensitive), accordion by
// click, keyboard and route (#/help/faq/<id>), glossary route focus and the
// inline-term → glossary → Back round trip (AC-17), inline term popover
// (hover / keyboard focus / click, Escape returns focus), ask card route, and
// the three-face snap survey (AC-16): no preselection, keyboard + click,
// change, optional comment for unhappy/neutral only, dismiss/restore, events
// without free text. Also honest copy, fixture values and 320px reflow, plus
// review regressions: one money format per answer, typed-URL focus, inline back
// naming the question, focus kept on a language switch, pinned definitions and
// search, external survey mounts (ids, locale, reset) and tablet/320px layout.
// Usage: node tests/modules/help.mjs [path/to/index.html] [--shots dir]
import { mkdirSync } from 'node:fs';
import { launch, newPage, gotoApp, overflowReport, missingKeys, DEFAULT_FILE } from '../lib/browser.mjs';

const args = process.argv.slice(2);
const file = args[0] && !args[0].startsWith('--') ? args[0] : DEFAULT_FILE;
const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });

let failed = 0;
function check(name, ok, detail) {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${!ok && detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
}
const wait = (page, ms = 250) => page.waitForTimeout(ms);
const N = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const hash = (page) => page.evaluate(() => location.hash);
const active = (page) => page.evaluate(() => {
  const a = document.activeElement;
  const f = a && a.closest('[data-fid]');
  return { id: a ? a.id : null, fid: f ? f.getAttribute('data-fid') : null, tag: a ? a.tagName : null, cls: a ? String(a.className) : '' };
});
async function go(page, target, focus = 'item') {
  await page.evaluate(([h, f]) => window.BDCNotice.router.go(h, { focus: f }), [target, focus]);
  await wait(page, 350);
}
async function freshHelp(page) {
  await page.evaluate(() => { window.BDCNotice.session.reset(); });
  await go(page, '#/overview', 'heading');
  await go(page, '#/help', 'heading');
}
async function setLocale(page, l) {
  await page.evaluate((x) => window.BDCNotice.i18n.setLocale(x), l);
  await wait(page, 300);
}
async function shot(page, name, opts = {}) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: !!opts.full });
}
const visibleIds = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => !e.hidden && e.offsetParent !== null).map((e) => e.id), sel);

const FAQ_REQUIRED = ['why-notice', 'still-interest', 'debt-reduced', 'relief', 'restart', 'rate', 'fee', 'accept', 'accountant', 'ask'];
const FAQ_EXTRA = ['next-payment', 'final-payment', 'capitalised', 'print-export'];
const BANNED = {
  'en-CA': /forgiv|interest-free|interest free|holiday|saving/i,
  'fr-CA': /remise de dette|annulation|sans intérêt|congé|économie|pardon/i,
};
const TEXT = {
  'en-CA': {
    title: 'Help & questions',
    groups: ['Understanding the change', 'Payments and cost', 'Getting help'],
    back: 'Back to your notice',
    question: 'How clear was this notice?',
    labels: ['Not clear', 'Somewhat clear', 'Very clear'],
    note: 'Local demo response only. Not a Net Promoter Score and not a record of your understanding or consent.',
    search: 'maturity',
  },
  'fr-CA': {
    title: 'Aide et questions',
    groups: ['Comprendre la modification', 'Versements et coûts', 'Obtenir de l’aide'],
    back: 'Retour à votre avis',
    question: 'Cet avis était-il clair?',
    labels: ['Pas clair', 'Assez clair', 'Très clair'],
    note: 'Réponse de démonstration locale seulement.',
    search: 'echeance',
  },
};

const browser = await launch();
const { page, consoleMsgs, requests } = await newPage(browser, { width: 1280, height: 900, reducedMotion: 'reduce' });
await gotoApp(page, '#/help', file);

/* ------------------------------------------------------------------ */
/* Structure and copy in both languages                                */
/* ------------------------------------------------------------------ */
for (const locale of ['en-CA', 'fr-CA']) {
  await setLocale(page, locale);
  await freshHelp(page);
  const T = TEXT[locale];
  const s = await page.evaluate(() => {
    const v = document.getElementById('view');
    const A = window.BDCNotice;
    return {
      h1: N(v.querySelector('h1') && v.querySelector('h1').textContent),
      h1Count: v.querySelectorAll('h1').length,
      groups: [...v.querySelectorAll('.hlp-faq-group-title')].map((e) => N(e.textContent)),
      faqIds: [...v.querySelectorAll('.hlp-faq-item')].map((e) => e.id),
      accordion: [...v.querySelectorAll('.hlp-faq-btn')].every((b) => b.getAttribute('aria-expanded') === 'false' && document.getElementById(b.getAttribute('aria-controls')) && document.getElementById(b.getAttribute('aria-controls')).hidden),
      glossary: [...v.querySelectorAll('.hlp-gl-item')].map((e) => ({ id: e.id, tab: e.getAttribute('tabindex'), term: N(e.querySelector('.hlp-gl-term').textContent), def: N(e.querySelector('.hlp-gl-def').textContent) })),
      expectedGloss: A.TERMS.map((id) => ({ id: `glossary-${id}`, term: A.i18n.t(`glossary.${id}.term`), def: A.i18n.t(`glossary.${id}.definition`) })),
      glossNotice: v.querySelectorAll('.hlp-gl-item .btn-notice-link').length,
      back: (() => { const a = v.querySelector('[data-fid="hlp-to-notice"]'); return a ? { text: N(a.textContent), href: a.getAttribute('href') } : null; })(),
      search: (() => { const i = v.querySelector('input[type="search"]'); const l = i && document.querySelector(`label[for="${i.id}"]`); return { input: !!i, label: l ? N(l.textContent) : null }; })(),
      ask: !!document.getElementById('help-ask'),
      surveyQ: N((v.querySelector('.hlp-sv-question') || {}).textContent),
      faces: [...v.querySelectorAll('.hlp-sv-face')].map((b) => ({ label: N(b.textContent), pressed: b.getAttribute('aria-pressed'), tag: b.tagName, name: b.getAttribute('aria-label') })),
      group: (() => { const g = v.querySelector('.hlp-sv-faces'); const lab = g && document.getElementById(g.getAttribute('aria-labelledby')); return g ? { role: g.getAttribute('role'), label: lab ? N(lab.textContent) : null } : null; })(),
      note: N((v.querySelector('.hlp-sv-note') || {}).textContent),
      text: v.innerText,
    };
    function N(x) { return String(x || '').replace(/\s+/g, ' ').trim(); }
  });
  check(`${locale}: single h1 "${T.title}"`, s.h1 === T.title && s.h1Count === 1, s.h1);
  check(`${locale}: three FAQ groups`, JSON.stringify(s.groups) === JSON.stringify(T.groups), s.groups);
  check(`${locale}: all required + extra FAQ ids rendered as faq-<id>`, [...FAQ_REQUIRED, ...FAQ_EXTRA].every((id) => s.faqIds.includes(`faq-${id}`)), s.faqIds);
  check(`${locale}: FAQ accordions start collapsed with aria-controls`, s.accordion);
  check(`${locale}: 10 glossary entries with core term + definition, tabindex -1`, s.glossary.length === 10 && s.expectedGloss.every((g, i) => s.glossary[i] && s.glossary[i].id === g.id && N(s.glossary[i].term) === N(g.term) && N(s.glossary[i].def) === N(g.def) && s.glossary[i].tab === '-1'), s.glossary.slice(0, 2));
  check(`${locale}: glossary "See in this notice" links`, s.glossNotice === 10, s.glossNotice);
  check(`${locale}: route back to the notice`, s.back && s.back.text === T.back && s.back.href === '#/documents', s.back);
  check(`${locale}: labelled search input`, s.search.input && !!s.search.label, s.search);
  check(`${locale}: ask card present`, s.ask);
  check(`${locale}: survey question`, s.surveyQ === T.question, s.surveyQ);
  check(`${locale}: three labelled face buttons, none preselected`, s.faces.length === 3 && s.faces.every((f, i) => f.tag === 'BUTTON' && f.label === T.labels[i] && f.pressed === 'false' && !f.name), s.faces);
  check(`${locale}: faces grouped and labelled by the question`, s.group && s.group.role === 'group' && s.group.label === T.question, s.group);
  check(`${locale}: survey is not NPS / not consent note`, s.note.startsWith(T.note), s.note);
  check(`${locale}: no forbidden framing in help copy (incl. collapsed answers)`, !BANNED[locale].test(s.text) && !BANNED[locale].test(await page.evaluate(() => document.getElementById('view').textContent)));
  check(`${locale}: no missing dictionary keys`, (await missingKeys(page)).length === 0, await missingKeys(page));
}

/* ------------------------------------------------------------------ */
/* FAQ values, click, keyboard, route                                  */
/* ------------------------------------------------------------------ */
await setLocale(page, 'en-CA');
await freshHelp(page);
{
  const exp = await page.evaluate(() => {
    const A = window.BDCNotice;
    const D = A.record.derived;
    const m = (c) => A.fmt.money(c, { compact: true });
    return { relief: m(D.nearTermPaymentReductionCents), deferred: m(D.principalDeferredCents), extra3: m(D.additionalInterestFirstThreeMonthsCents), extra: m(D.additionalLifetimeInterestCents), origNear: m(D.originalNearTermPaymentsCents), revNear: m(D.revisedNearTermPaymentsCents), resume: A.fmt.date(A.record.change.resumePrincipalDate, 'long'), revMaturity: A.fmt.date(A.record.change.revisedMaturity, 'long') };
  });
  // click
  await page.click('#faq-relief-btn');
  await wait(page, 150);
  const r = await page.evaluate(() => ({ exp: document.getElementById('faq-relief-btn').getAttribute('aria-expanded'), hidden: document.getElementById('faq-relief-panel').hidden, q: document.getElementById('faq-relief-btn').textContent, a: document.getElementById('faq-relief-panel').textContent.replace(/\s+/g, ' ') }));
  check('click opens an FAQ (aria-expanded=true, panel shown)', r.exp === 'true' && !r.hidden, r);
  check('relief question uses fixture amounts', N(r.q).includes(N(exp.relief)) && N(r.q).includes(N(exp.deferred)), r.q);
  check('relief answer reconciles 12,000 − 80 = 11,920 and 80 within 4,800', [exp.deferred, exp.extra3, exp.relief, exp.extra, exp.origNear, exp.revNear].every((x) => N(r.a).includes(N(x))), r.a);
  check('relief answer has "See in this notice" and inline glossary terms', await page.evaluate(() => !!document.querySelector('#faq-relief-panel .btn-notice-link') && document.querySelectorAll('#faq-relief-panel .term').length >= 2));
  await page.click('#faq-relief-btn');
  await wait(page, 100);
  check('second click collapses it', await page.evaluate(() => document.getElementById('faq-relief-btn').getAttribute('aria-expanded') === 'false' && document.getElementById('faq-relief-panel').hidden));
  // keyboard
  await page.focus('#faq-restart-btn');
  await page.keyboard.press('Enter');
  await wait(page, 100);
  const kb1 = await page.evaluate(() => document.getElementById('faq-restart-btn').getAttribute('aria-expanded'));
  await page.keyboard.press('Space');
  await wait(page, 100);
  const kb2 = await page.evaluate(() => document.getElementById('faq-restart-btn').getAttribute('aria-expanded'));
  check('keyboard Enter opens and Space closes an FAQ', kb1 === 'true' && kb2 === 'false', [kb1, kb2]);
  // expand / collapse all
  await page.click('[data-fid="hlp-expand-all"]');
  await wait(page, 100);
  const allOpen = await page.evaluate(() => [...document.querySelectorAll('.hlp-faq-btn')].every((b) => b.getAttribute('aria-expanded') === 'true'));
  await page.click('[data-fid="hlp-expand-all"]');
  await wait(page, 100);
  const allClosed = await page.evaluate(() => [...document.querySelectorAll('.hlp-faq-btn')].every((b) => b.getAttribute('aria-expanded') === 'false'));
  check('Expand all / Collapse all', allOpen && allClosed);
  // route
  await go(page, '#/help/faq/final-payment', 'item');
  const rt = await page.evaluate(() => ({ exp: document.getElementById('faq-final-payment-btn').getAttribute('aria-expanded'), a: document.getElementById('faq-final-payment-panel').textContent.replace(/\s+/g, ' '), act: document.activeElement && document.activeElement.id }));
  check('#/help/faq/<id> opens and focuses that item', rt.exp === 'true' && rt.act === 'faq-final-payment', rt);
  check('final-payment answer shows the revised maturity from the record', N(rt.a).includes(N(exp.revMaturity)), rt.a.slice(0, 120));
  await go(page, '#/help/faq/accountant', 'item');
  const acc = await page.evaluate(() => document.getElementById('faq-accountant-panel').textContent);
  check('accountant answer: demo cannot grant access, authorised-user journey', /cannot give anyone access/.test(acc) && /Client Space/.test(acc) && /authorise/.test(acc), acc.slice(0, 160));
}

/* ------------------------------------------------------------------ */
/* Search (EN + FR, accent-insensitive)                                */
/* ------------------------------------------------------------------ */
for (const locale of ['en-CA', 'fr-CA']) {
  await setLocale(page, locale);
  await freshHelp(page);
  await page.fill('#hlp-search-input', TEXT[locale].search);
  await wait(page, 150);
  const faqV = await visibleIds(page, '.hlp-faq-item');
  const glV = await visibleIds(page, '.hlp-gl-item');
  const status = N(await page.evaluate(() => { const s = document.getElementById('hlp-search-status'); return s && !s.hidden ? s.textContent : ''; }));
  check(`${locale}: search "${TEXT[locale].search}" finds maturity term and final-payment FAQ`, glV.includes('glossary-maturity') && faqV.includes('faq-final-payment') && glV.length < 10 && faqV.length < 14, { faqV, glV });
  check(`${locale}: result count shown`, status.length > 0 && status.includes(String(faqV.length + glV.length)), status);
  await wait(page, 800);
  const live = await page.evaluate(() => document.getElementById('live-polite').textContent);
  check(`${locale}: result count announced politely`, live.includes(String(faqV.length + glV.length)), live);
  if (locale === 'fr-CA') {
    await page.fill('#hlp-search-input', 'interets');
    await wait(page, 150);
    const v2 = await visibleIds(page, '.hlp-gl-item');
    check('fr-CA: "interets" (no accents) finds "Intérêts"', v2.includes('glossary-interest'), v2);
  }
  await page.fill('#hlp-search-input', 'zzqxv');
  await wait(page, 150);
  const none = await page.evaluate(() => ({ none: !document.querySelector('.hlp-none').hidden, title: document.querySelector('.hlp-none-title').textContent, faq: [...document.querySelectorAll('.hlp-faq-item')].filter((e) => !e.hidden).length, gl: [...document.querySelectorAll('.hlp-gl-item')].filter((e) => !e.hidden).length, ask: !!document.querySelector('[data-fid="hlp-none-ask"]') }));
  check(`${locale}: "No results" state with a way to ask`, none.none && none.faq === 0 && none.gl === 0 && none.ask && none.title.includes('zzqxv'), none);
  if (locale === 'fr-CA') await shot(page, 'fr-CA-1280-search-none');
  await page.click('[data-fid="hlp-search-clear"]');
  await wait(page, 150);
  const cleared = await page.evaluate(() => ({ v: document.getElementById('hlp-search-input').value, faq: [...document.querySelectorAll('.hlp-faq-item')].filter((e) => !e.hidden).length, gl: [...document.querySelectorAll('.hlp-gl-item')].filter((e) => !e.hidden).length, focus: document.activeElement.id, none: document.querySelector('.hlp-none').hidden }));
  check(`${locale}: clear button restores everything and keeps focus in search`, cleared.v === '' && cleared.faq === 14 && cleared.gl === 10 && cleared.focus === 'hlp-search-input' && cleared.none, cleared);
  // Answer-only match is flagged; locale switch keeps the query
  await page.fill('#hlp-search-input', locale === 'en-CA' ? 'inventory' : 'stocks');
  await wait(page, 150);
  const found = await page.evaluate(() => ({ items: [...document.querySelectorAll('.hlp-faq-item')].filter((e) => !e.hidden).map((e) => e.id), tag: !document.querySelector('#faq-why-notice .hlp-found').hidden }));
  check(`${locale}: answer-only match is shown with "Found in the answer"`, found.items.includes('faq-why-notice') && found.tag, found);
  // Search text never reaches the event log
  check(`${locale}: search text is not logged`, !(await page.evaluate(() => JSON.stringify(window.BDCNotice.events.all()))).match(/inventory|stocks|zzqxv|echeance|maturity/));
}
// Escape clears the search
await page.focus('#hlp-search-input');
await page.keyboard.press('Escape');
await wait(page, 100);
check('Escape in the search field clears it', await page.evaluate(() => document.getElementById('hlp-search-input').value === '' && [...document.querySelectorAll('.hlp-faq-item')].every((e) => !e.hidden)));

/* ------------------------------------------------------------------ */
/* Glossary route and inline term popover (AC-17)                      */
/* ------------------------------------------------------------------ */
await setLocale(page, 'en-CA');
await freshHelp(page);
await go(page, '#/help/glossary/maturity', 'item');
const gl = await active(page);
check('#/help/glossary/<id> focuses the glossary entry', gl.id === 'glossary-maturity', gl);
check('glossary target is highlighted', await page.evaluate(() => document.getElementById('glossary-maturity').classList.contains('hlp-target')));
await go(page, '#/help/faq/relief', 'item');
const termSel = '#faq-relief-panel .term[data-term="interest"]';
// hover
await page.hover(termSel);
await wait(page, 200);
const hov = await page.evaluate((s) => { const p = document.querySelector('.popover'); const tr = document.querySelector(s); return { open: !!p, pinned: p ? p.classList.contains('is-pinned') : null, exp: tr.getAttribute('aria-expanded'), text: p ? p.textContent : '' }; }, termSel);
check('inline term: hover opens the definition', hov.open && !hov.pinned && hov.exp === 'true' && /cost of borrowing/i.test(hov.text), hov);
await page.mouse.move(5, 5);
await wait(page, 450);
check('inline term: moving away closes the hover definition', await page.evaluate(() => !document.querySelector('.popover')));
// keyboard focus
await page.focus('#faq-relief-btn');
await page.keyboard.press('Tab');
await wait(page, 200);
const kf = await page.evaluate(() => ({ term: document.activeElement.getAttribute('data-term'), open: !!document.querySelector('.popover') }));
check('inline term: keyboard focus opens the definition', kf.term === 'principal' && kf.open, kf);
await page.keyboard.press('Escape');
await wait(page, 150);
const esc = await page.evaluate(() => ({ open: !!document.querySelector('.popover'), term: document.activeElement.getAttribute('data-term'), path: location.hash }));
check('inline term: Escape closes and focus stays on the term', !esc.open && esc.term === 'principal' && esc.path === '#/help/faq/relief', esc);
// click pins
await page.click(termSel);
await wait(page, 200);
const pin = await page.evaluate(() => { const p = document.querySelector('.popover'); return { open: !!p, pinned: p ? p.classList.contains('is-pinned') : false }; });
check('inline term: click pins the definition', pin.open && pin.pinned, pin);
await shot(page, 'en-CA-1280-term-popover');
const termFid = await page.evaluate((s) => document.querySelector(s).getAttribute('data-fid'), termSel);
await page.click('.popover [data-fid="glossary-link-interest"]');
await wait(page, 450);
const land = await page.evaluate(() => ({ hash: location.hash, act: document.activeElement.id, inline: !!document.querySelector('#glossary-interest [data-fid="hlp-back-inline"]'), top: !!document.querySelector('[data-fid="back-control"]') }));
check('"See in glossary" lands on the glossary entry with focus', land.hash === '#/help/glossary/interest' && land.act === 'glossary-interest', land);
check('back controls offered at top and beside the entry', land.top && land.inline, land);
await shot(page, 'en-CA-1280-glossary-target');
await page.click('#glossary-interest [data-fid="hlp-back-inline"]');
await wait(page, 450);
const ret = await page.evaluate(() => ({ hash: location.hash, fid: document.activeElement.getAttribute('data-fid'), open: document.getElementById('faq-relief-btn').getAttribute('aria-expanded') }));
check('Back returns to the original term inside the open answer', ret.hash === '#/help/faq/relief' && ret.fid === termFid && ret.open === 'true', { ret, termFid });
await page.keyboard.press('Escape');

/* ------------------------------------------------------------------ */
/* Ask card                                                            */
/* ------------------------------------------------------------------ */
await go(page, '#/help/ask', 'item');
check('#/help/ask focuses the ask card', (await active(page)).id === 'help-ask');
const hasQuery = await page.evaluate(() => !!(window.BDCNotice.query && window.BDCNotice.query.open));
await page.click('[data-fid="hlp-ask-question"]');
await wait(page, 300);
if (hasQuery) {
  check('Ask a question opens the local query form', await page.evaluate(() => window.BDCNotice.overlay.isOpen()));
  await page.keyboard.press('Escape');
  await wait(page, 200);
} else {
  check('Ask a question without the query module shows an honest note', await page.evaluate(() => { const m = document.querySelector('.hlp-ask-msg'); return m && !m.hidden && m.textContent.length > 10; }));
}
check('ask card states nothing is sent to BDC', /Nothing is sent to BDC/.test(await page.evaluate(() => document.getElementById('help-ask').textContent)));

/* ------------------------------------------------------------------ */
/* Snap survey (AC-16)                                                 */
/* ------------------------------------------------------------------ */
await freshHelp(page);
const survey = () => page.evaluate(() => ({
  pressed: [...document.querySelectorAll('.hlp-sv-face')].map((b) => b.getAttribute('aria-pressed')),
  thanks: !!document.querySelector('.hlp-sv-thanks') && !document.querySelector('.hlp-sv-thanks').hidden,
  follow: !!document.querySelector('.hlp-sv-follow') && !document.querySelector('.hlp-sv-follow').hidden,
  events: window.BDCNotice.events.all().filter((e) => e.type === 'survey_submitted').map((e) => e.id),
  state: window.BDCNotice.survey.state(),
  focus: document.activeElement.getAttribute('data-fid'),
}));
let sv = await survey();
check('survey: nothing preselected, no response logged', sv.pressed.every((p) => p === 'false') && !sv.thanks && !sv.follow && sv.events.length === 0 && sv.state.rating === null, sv);
// keyboard: Tab from "Hide survey" to the first face, Enter
await page.focus('[data-fid="hlp-sv-hide"]');
await page.keyboard.press('Tab');
check('survey: Tab reaches the first face', (await active(page)).fid === 'hlp-sv-unhappy');
await page.keyboard.press('Enter');
await wait(page, 150);
sv = await survey();
check('survey: Enter selects "unhappy", shows thanks and the optional comment', sv.pressed.join() === 'true,false,false' && sv.thanks && sv.follow && sv.events.join() === 'unhappy' && sv.focus === 'hlp-sv-unhappy', sv);
check('survey: help offer shown (ask a question / FAQ)', await page.evaluate(() => !!document.querySelector('[data-fid="hlp-sv-ask"]') && !!document.querySelector('[data-fid="hlp-sv-faq"]')));
const COMMENT = 'The resume date confused me QXJ';
await page.fill('.hlp-sv-comment', COMMENT);
await page.focus('[data-fid="hlp-sv-unhappy"]');
await page.keyboard.press('Tab');
await page.keyboard.press('Space');
await wait(page, 150);
sv = await survey();
check('survey: Tab + Space changes to "neutral"; comment stays available', sv.pressed.join() === 'false,true,false' && sv.follow && sv.events.join() === 'unhappy,neutral', sv);
if (shots) { await page.setViewportSize({ width: 390, height: 900 }); await setLocale(page, 'fr-CA'); await page.evaluate(() => document.getElementById('help-survey').scrollIntoView()); await shot(page, 'fr-CA-390-survey-neutral'); await setLocale(page, 'en-CA'); await page.setViewportSize({ width: 1280, height: 900 }); }
// R-01 (PRD §15): the comment keeps the language it was typed in, with lang on the field and a
// "Written in …" tag (read with the field) once the interface language differs.
const commentLang = () => page.evaluate(() => {
  const ta = document.querySelector('#help-survey .hlp-sv-comment');
  const tag = document.querySelector('#help-survey .hlp-sv-lang');
  const described = (ta.getAttribute('aria-describedby') || '').split(/\s+/);
  return {
    value: ta.value, lang: ta.getAttribute('lang'), tag: tag ? tag.textContent.trim() : null, tagLang: tag ? tag.getAttribute('lang') : null,
    describedByTag: !!tag && described.includes(tag.id), slotHidden: getComputedStyle(document.querySelector('#help-survey .hlp-sv-lang-slot')).display === 'none',
    stored: window.BDCNotice.session.slice('survey').commentLang,
  };
});
let cl = await commentLang();
check('survey comment: lang="en-CA" once typed in English; no tag while the interface is English', cl.value === COMMENT && cl.lang === 'en-CA' && cl.tag === null && cl.slotHidden, cl);
await setLocale(page, 'fr-CA');
cl = await commentLang();
check('survey comment after switching to French: kept as typed, lang="en-CA", tagged « Rédigé en anglais » (fr-CA tag, described-by)', cl.value === COMMENT && cl.lang === 'en-CA' && cl.tag === 'Rédigé en anglais' && cl.tagLang === 'fr-CA' && cl.describedByTag, cl);
if (shots) { await page.setViewportSize({ width: 320, height: 800 }); await page.evaluate(() => document.querySelector('#help-survey .hlp-sv-field').scrollIntoView()); await shot(page, 'fr-CA-320-survey-comment-lang'); await page.setViewportSize({ width: 1280, height: 900 }); }
await page.type('#help-survey .hlp-sv-comment', ' more');
cl = await commentLang();
check('survey comment: continuing to type in French keeps the original language label', cl.lang === 'en-CA' && cl.tag === 'Rédigé en anglais' && cl.value.endsWith(' more'), cl);
await page.fill('#help-survey .hlp-sv-comment', '');
cl = await commentLang();
check('survey comment: clearing the field drops its language and tag', cl.lang === null && cl.tag === null && !cl.stored, cl);
await page.fill('#help-survey .hlp-sv-comment', 'La date de reprise');
await setLocale(page, 'en-CA');
cl = await commentLang();
check('survey comment typed in French then switched to English: lang="fr-CA", tagged "Written in French"', cl.value === 'La date de reprise' && cl.lang === 'fr-CA' && cl.tag === 'Written in French' && cl.tagLang === 'en-CA' && cl.describedByTag, cl);
if (shots) { await page.setViewportSize({ width: 320, height: 800 }); await page.evaluate(() => document.querySelector('#help-survey .hlp-sv-field').scrollIntoView()); await shot(page, 'en-CA-320-survey-comment-lang'); await page.setViewportSize({ width: 1280, height: 900 }); }
await page.fill('#help-survey .hlp-sv-comment', '');
await page.fill('#help-survey .hlp-sv-comment', COMMENT);
cl = await commentLang();
check('survey comment retyped in English: no tag, lang="en-CA"', cl.lang === 'en-CA' && cl.tag === null, cl);
await page.click('[data-fid="hlp-sv-happy"]');
await wait(page, 150);
sv = await survey();
check('survey: click "happy" changes response and hides the comment', sv.pressed.join() === 'false,false,true' && !sv.follow && sv.thanks && sv.events.join() === 'unhappy,neutral,happy', sv);
await page.click('[data-fid="hlp-sv-happy"]');
await wait(page, 100);
check('survey: re-selecting the same face does not log again', (await survey()).events.length === 3);
const evAll = await page.evaluate(() => JSON.stringify(window.BDCNotice.events.all()));
check('survey: events carry identifiers only (no comment text)', !evAll.includes('QXJ') && !evAll.includes('confused'));
check('survey: state() exposes rating/dismissed only, never the comment', (() => { const s = sv.state; return s.rating === 'happy' && s.dismissed === false && s.hasComment === true && !JSON.stringify(s).includes('QXJ'); })(), sv.state);
// dismiss / restore
await page.click('[data-fid="hlp-sv-hide"]');
await wait(page, 150);
const hid = await page.evaluate(() => ({ faces: document.querySelectorAll('.hlp-sv-face').length, show: !!document.querySelector('[data-fid="hlp-sv-show"]'), focus: document.activeElement.getAttribute('data-fid'), st: window.BDCNotice.survey.state() }));
check('survey: "Hide survey" dismisses it and focuses "Show survey"', hid.faces === 0 && hid.show && hid.focus === 'hlp-sv-show' && hid.st.dismissed, hid);
await go(page, '#/overview', 'heading');
await go(page, '#/help', 'heading');
check('survey: stays hidden for the session', await page.evaluate(() => document.querySelectorAll('.hlp-sv-face').length === 0 && !!document.querySelector('[data-fid="hlp-sv-show"]')));
await page.click('[data-fid="hlp-sv-show"]');
await wait(page, 150);
const shown = await page.evaluate(() => ({ pressed: [...document.querySelectorAll('.hlp-sv-face')].map((b) => b.getAttribute('aria-pressed')).join(), focus: document.activeElement.getAttribute('data-fid'), comment: (document.querySelector('.hlp-sv-comment') || {}).value }));
check('survey: "Show survey" restores it with the response intact', shown.pressed === 'false,false,true' && shown.focus === 'hlp-sv-happy', shown);
// Language switch keeps survey and FAQ state
await page.click('#faq-fee-btn');
await setLocale(page, 'fr-CA');
const fr = await page.evaluate(() => ({ pressed: [...document.querySelectorAll('.hlp-sv-face')].map((b) => b.getAttribute('aria-pressed')).join(), label: document.querySelector('.hlp-sv-face[aria-pressed="true"]').textContent.trim(), fee: document.getElementById('faq-fee-btn').getAttribute('aria-expanded'), feeQ: document.getElementById('faq-fee-btn').textContent.trim() }));
check('language switch keeps survey response and open FAQ', fr.pressed === 'false,false,true' && fr.label === 'Très clair' && fr.fee === 'true' && fr.feeQ.startsWith('Y a-t-il des frais'), fr);
check('fr-CA: no missing keys after interactions', (await missingKeys(page)).length === 0, await missingKeys(page));
// Reset clears the survey
await page.evaluate(() => window.BDCNotice.session.reset());
check('reset clears the survey state', await page.evaluate(() => { const s = window.BDCNotice.survey.state(); return s.rating === null && !s.dismissed && !s.hasComment; }));
await go(page, '#/help/survey', 'item');
check('#/help/survey focuses the survey', (await active(page)).id === 'help-survey');

/* ------------------------------------------------------------------ */
/* Reflow at 320px with expanded content (both languages)              */
/* ------------------------------------------------------------------ */
for (const locale of ['fr-CA', 'en-CA']) {
  await setLocale(page, locale);
  await page.setViewportSize({ width: 320, height: 800 });
  await freshHelp(page);
  await page.click('[data-fid="hlp-expand-all"]');
  await page.click('[data-fid="hlp-sv-neutral"]');
  await wait(page, 200);
  const of = await overflowReport(page);
  check(`${locale}: 320px, all answers + survey follow-up open, no horizontal overflow`, !of.overflow && of.offenders.length === 0, of);
  await page.click('#faq-relief-panel .term[data-term="interest"]');
  await wait(page, 200);
  const sheet = await page.evaluate(() => { const p = document.querySelector('.popover'); if (!p) return null; const r = p.getBoundingClientRect(); return { sheet: p.classList.contains('popover--sheet'), left: r.left, right: r.right, vw: document.documentElement.clientWidth }; });
  check(`${locale}: 320px term definition opens as a bottom sheet inside the viewport`, sheet && sheet.sheet && sheet.left >= 0 && sheet.right <= sheet.vw, sheet);
  if (locale === 'fr-CA') await shot(page, 'fr-CA-320-term-sheet');
  await page.keyboard.press('Escape');
  await page.fill('#hlp-search-input', 'zzqxv');
  await wait(page, 150);
  const of2 = await overflowReport(page);
  check(`${locale}: 320px no-results state fits`, !of2.overflow && of2.offenders.length === 0, of2);
  if (locale === 'fr-CA') {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => document.querySelector('.hlp-search').scrollIntoView());
    await shot(page, 'fr-CA-320-search-none');
  }
}

/* ------------------------------------------------------------------ */
/* Touch: tap a face on a touch device                                 */
/* ------------------------------------------------------------------ */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });
  const tp = await ctx.newPage();
  const errs = [];
  tp.on('pageerror', (e) => errs.push(e.message));
  await tp.route('https://accessibilityserver.org/**', (route) => route.abort());
  await gotoApp(tp, '#/help/survey', file);
  await tp.tap('[data-fid="hlp-sv-unhappy"]');
  await tp.waitForTimeout(150);
  await tp.tap('[data-fid="hlp-sv-happy"]');
  await tp.waitForTimeout(150);
  const t1 = await tp.evaluate(() => ({ pressed: [...document.querySelectorAll('.hlp-sv-face')].map((b) => b.getAttribute('aria-pressed')).join(), ev: window.BDCNotice.events.all().filter((e) => e.type === 'survey_submitted').map((e) => e.id).join() }));
  check('touch: tapping faces selects and changes the response', t1.pressed === 'false,false,true' && t1.ev === 'unhappy,happy' && errs.length === 0, { t1, errs });
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* Regression checks from the adversarial review                       */
/* ------------------------------------------------------------------ */
await page.setViewportSize({ width: 1280, height: 900 });
await setLocale(page, 'en-CA');
await freshHelp(page);
{
  // One money format per answer: $1,600 next to $4,000, never $1,600.00 next to $4,000.
  const fmt = await page.evaluate(() => {
    const A = window.BDCNotice;
    const D = A.record.derived;
    const txt = (id) => document.getElementById(`faq-${id}-panel`).textContent.replace(/\s+/g, ' ');
    return {
      relief: txt('relief'),
      restart: txt('restart'),
      final: txt('final-payment'),
      interest: A.fmt.money(D.postponementMonthlyInterestCents, { compact: true }),
      first: A.fmt.money(D.firstResumedPaymentCents, { compact: true }),
      last: A.fmt.money(A.record.revisedSchedule[A.record.revisedSchedule.length - 1].totalCents, { compact: true }),
      fullInterest: A.fmt.money(D.postponementMonthlyInterestCents),
    };
  });
  check('amounts use one format within an answer (no "$1,600.00" beside "$4,000")',
    N(fmt.relief).includes(N(fmt.interest)) && !N(fmt.relief).includes(N(fmt.fullInterest)) && N(fmt.restart).includes(N(fmt.first)) && !/\.00\b/.test(fmt.relief + fmt.restart), { relief: fmt.relief.slice(0, 200), restart: fmt.restart.slice(0, 120) });
  check('cents are kept where they exist (final payment)', N(fmt.final).includes(N(fmt.last)) && /\.\d\d/.test(fmt.last), fmt.last);
}
// Typed URL / browser navigation to an item scrolls to it and moves focus there.
await page.evaluate(() => { location.hash = '#/overview'; });
await wait(page, 250);
await page.evaluate(() => { location.hash = '#/help/faq/rate'; });
await wait(page, 450);
{
  const typed = await page.evaluate(() => ({ act: document.activeElement.id, exp: document.getElementById('faq-rate-btn').getAttribute('aria-expanded'), top: Math.round(document.getElementById('faq-rate').getBoundingClientRect().top) }));
  check('typed #/help/faq/<id> opens, scrolls to and focuses the item', typed.act === 'faq-rate' && typed.exp === 'true' && typed.top >= -2 && typed.top < 200, typed);
}
// Inline back names the question; language switch keeps focus and the highlight on the entry.
await go(page, '#/help/faq/relief', 'item');
await page.click('#faq-relief-panel .term[data-term="interest"]');
await wait(page, 200);
await page.click('.popover [data-fid="glossary-link-interest"]');
await wait(page, 450);
{
  const ib = await page.evaluate(() => { const b = document.querySelector('#glossary-interest [data-fid="hlp-back-inline"]'); return b ? { text: b.textContent.trim(), aria: b.getAttribute('aria-label') } : null; });
  const q = await page.evaluate(() => document.getElementById('faq-relief-btn') ? '' : window.BDCNotice.i18n.t('help.faq.items.relief.q', {}));
  check('inline back names the originating question', ib && ib.text === 'Back to the question' && /^Back to the question: Why is the relief/.test(ib.aria) && !/⟦/.test(ib.aria + q), ib);
  await page.focus('#glossary-interest');
  await setLocale(page, 'fr-CA');
  const after = await page.evaluate(() => ({ act: document.activeElement.id, target: document.getElementById('glossary-interest').classList.contains('hlp-target'), back: (document.querySelector('#glossary-interest [data-fid="hlp-back-inline"]') || {}).textContent }));
  check('language switch keeps focus and highlight on the targeted glossary entry', after.act === 'glossary-interest' && after.target && /Retour à la question/.test(after.back || ''), after);
  await setLocale(page, 'en-CA');
}
// Pinned definition: Tab into it, Escape returns focus to the term.
await go(page, '#/help/faq/still-interest', 'item');
{
  const sel = '#faq-still-interest-panel .term[data-term="interest"]';
  await page.click(sel);
  await wait(page, 200);
  await page.keyboard.press('Tab');
  const inPop = await page.evaluate(() => !!document.activeElement.closest('.popover'));
  await page.keyboard.press('Escape');
  await wait(page, 150);
  const back = await page.evaluate((s) => ({ open: !!document.querySelector('.popover'), onTerm: document.activeElement === document.querySelector(s) }), sel);
  check('pinned definition: Tab moves into it, Escape closes and returns focus to the term', inPop && !back.open && back.onTerm, { inPop, back });
  // A search that hides the answer also closes its pinned definition.
  await page.click(sel);
  await wait(page, 150);
  await page.fill('#hlp-search-input', 'accountant');
  await wait(page, 150);
  check('search hiding an answer closes its pinned definition', await page.evaluate(() => !document.querySelector('.popover') && !window.BDCNotice.popover.isOpen()));
  const metaEn = await page.evaluate(() => [...document.querySelectorAll('.hlp-section-meta')].filter((e) => !e.hidden).map((e) => e.textContent));
  check('per-section counts name what they count', metaEn.some((m) => /questions$/.test(m)) && metaEn.some((m) => /terms$/.test(m)), metaEn);
  await setLocale(page, 'fr-CA');
  const metaFr = await page.evaluate(() => [...document.querySelectorAll('.hlp-section-meta')].filter((e) => !e.hidden).map((e) => e.textContent));
  check('fr-CA: counts agree in gender (Questions affichées / Termes affichés)', metaFr.some((m) => m.startsWith('Questions affichées')) && metaFr.some((m) => m.startsWith('Termes affichés')), metaFr);
  await page.fill('#hlp-search-input', 'zzqxv');
  await wait(page, 150);
  const noneTxt = await page.evaluate(() => ({ body: document.querySelector('.hlp-none-body').textContent, clairBtn: !!document.querySelector('[data-fid="hlp-none-clair"]') }));
  check('no-results text mentions Clair only when Clair is in this build', /Clair/.test(noneTxt.body) === noneTxt.clairBtn, noneTxt);
  await page.fill('#hlp-search-input', '');
  await setLocale(page, 'en-CA');
}
// The general "Ask a question" does not preselect a topic for the person.
{
  const hasQ = await page.evaluate(() => !!(window.BDCNotice.query && window.BDCNotice.query.open));
  if (hasQ) {
    await freshHelp(page);
    await page.click('[data-fid="hlp-ask-question"]');
    await wait(page, 350);
    const topic = await page.evaluate(() => { const s = document.getElementById('qry-topic'); return s ? s.value : null; });
    check('general "Ask a question" leaves the topic for the person to choose', topic === '' || topic === null, topic);
    await page.keyboard.press('Escape');
    await wait(page, 250);
    check('closing the query form returns focus to "Ask a question"', (await active(page)).fid === 'hlp-ask-question');
  }
}
// App.survey.mount outside Help: stable ids, follows language switches, cleared by reset.
await go(page, '#/help', 'heading');
{
  await page.evaluate(() => { const d = document.createElement('div'); d.id = 'ext-survey'; document.body.appendChild(d); window.BDCNotice.survey.mount(d, { headingLevel: 3 }); });
  const ids = await page.evaluate(() => [...document.querySelectorAll('#ext-survey [id]')].map((e) => e.id));
  const unique = await page.evaluate((list) => list.every((id) => document.querySelectorAll(`#${CSS.escape(id)}`).length === 1), ids);
  check('external survey mount: ids are unique in the page and use a stable prefix', ids.length > 0 && unique && ids.every((id) => /^hlp-sv-m-\d+/.test(id)), ids);
  check('external survey mount: h3 question, no preselection', await page.evaluate(() => !!document.querySelector('#ext-survey h3.hlp-sv-question') && [...document.querySelectorAll('#ext-survey .hlp-sv-face')].every((b) => b.getAttribute('aria-pressed') === 'false')));
  await page.click('#ext-survey .hlp-sv-face[data-rating="happy"]');
  await wait(page, 100);
  check('selection in one mount updates the other', await page.evaluate(() => document.querySelector('#help-survey .hlp-sv-face[data-rating="happy"]').getAttribute('aria-pressed') === 'true'));
  await setLocale(page, 'fr-CA');
  check('external survey mount re-renders in French', await page.evaluate(() => document.querySelector('#ext-survey .hlp-sv-question').textContent === 'Cet avis était-il clair?' && document.querySelector('#ext-survey .hlp-sv-face[aria-pressed="true"]').textContent.trim() === 'Très clair'));
  await page.evaluate(() => window.BDCNotice.session.reset());
  await wait(page, 200);
  check('reset returns an on-screen survey to unanswered', await page.evaluate(() => [...document.querySelectorAll('#ext-survey .hlp-sv-face')].every((b) => b.getAttribute('aria-pressed') === 'false') && document.querySelector('#ext-survey .hlp-sv-thanks').hidden));
  await page.evaluate(() => document.getElementById('ext-survey').remove());
  await setLocale(page, 'en-CA');
}
// Layout: tablet puts the inquiry card and survey side by side; survey header stays on one row at 320.
await page.setViewportSize({ width: 768, height: 900 });
await freshHelp(page);
{
  const lay = await page.evaluate(() => { const a = document.getElementById('help-ask').getBoundingClientRect(); const s = document.getElementById('help-survey').getBoundingClientRect(); return { aTop: Math.round(a.top), sTop: Math.round(s.top), aRight: Math.round(a.right), sLeft: Math.round(s.left) }; });
  check('768px: inquiry card and survey sit side by side', lay.aTop === lay.sTop && lay.aRight <= lay.sLeft, lay);
  await shot(page, 'en-CA-768-side');
}
for (const locale of ['fr-CA', 'en-CA']) {
  await setLocale(page, locale);
  await page.setViewportSize({ width: 320, height: 800 });
  await freshHelp(page);
  const head = await page.evaluate(() => { const o = document.querySelector('.hlp-sv-overline').getBoundingClientRect(); const b = document.querySelector('.hlp-sv-hide').getBoundingClientRect(); return { oTop: Math.round(o.top), oBottom: Math.round(o.bottom), bTop: Math.round(b.top), bBottom: Math.round(b.bottom) }; });
  check(`${locale}: 320px "Hide survey" shares the overline row`, head.bTop < head.oBottom && head.oTop < head.bBottom, head);
  if (locale === 'fr-CA') { await page.evaluate(() => document.getElementById('help-survey').scrollIntoView()); await shot(page, 'fr-CA-320-survey'); }
}
await page.setViewportSize({ width: 1280, height: 900 });

// R-37 / R-33: Clair is « l’assistant de démonstration »; Canadian French typography in the help namespace.
{
  const dict = await page.evaluate(() => window.BDCNotice.i18n._dicts['fr-CA'].help);
  const all = [];
  const walk = (o, p) => {
    if (typeof o === 'string') all.push([p, o]);
    else if (o && typeof o === 'object') Object.keys(o).forEach((key) => walk(o[key], `${p}.${key}`));
  };
  walk(dict, 'help');
  const clairStrings = all.filter(([, v]) => /Clair,|Clair est/.test(v));
  check('fr-CA help: Clair is always « l’assistant de démonstration », never « guide »', clairStrings.length >= 3 && clairStrings.every(([, v]) => v.includes('l’assistant de démonstration')) && !all.some(([, v]) => /guide de démonstration/.test(v)), clairStrings);
  const bad = all.filter(([, v]) => /[\s\u00a0\u202f][;?!]/.test(v) || / :/.test(v) || /« | »/.test(v));
  check('fr-CA help dictionary: no-break space before « : » and inside « », no space before ; ? !', bad.length === 0, bad);
}
check('no console errors', consoleMsgs.length === 0, consoleMsgs.slice(0, 5));
check('no unexpected network requests', requests.filter((u) => !u.startsWith('https://accessibilityserver.org/')).length === 0, requests);

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\n✓ help module checks passed');
process.exit(failed ? 1 : 0);
