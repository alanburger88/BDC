#!/usr/bin/env node
// "What changed" module QA: before/after cards with textual badges and the
// three contextual routes (AC-06), principal-still-owing and 12,000 vs 11,920
// reconciliation (AC-05), unchanged terms, detail views (stacked month cards,
// glossary terms, actions, Back with focus return), unknown-item fallback,
// language switching on a detail, keyboard activation and 320/390 px reflow
// (AC-08) in en-CA and fr-CA. Only depends on core + the changes module.
// Usage: node tests/modules/changes.mjs [path/to/index.html]
import { existsSync, readFileSync } from 'node:fs';
import { launch, newPage, gotoApp, overflowReport, missingKeys, DEFAULT_FILE } from '../lib/browser.mjs';

const file = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : DEFAULT_FILE;
let failed = 0;
function check(name, ok, detail) {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${!ok && detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 400)}` : ''}`);
}
const wait = (page, ms = 220) => page.waitForTimeout(ms);
// Collapse all whitespace (incl. no-break spaces in fr-CA amounts and dates) for comparisons.
const N = (str) => String(str || '').replace(/\s+/g, ' ').trim();
const hash = (page) => page.evaluate(() => location.hash);
const go = async (page, h) => { await page.evaluate((x) => { location.hash = x; }, h); await wait(page); };
const setLocale = async (page, l) => { await page.evaluate((x) => window.BDCNotice.i18n.setLocale(x), l); await wait(page); };
const activeFid = (page) => page.evaluate(() => {
  const a = document.activeElement;
  const el = a && a.closest('[data-fid]');
  return el ? el.getAttribute('data-fid') : null;
});
const viewText = (page, sel = '#view') => page.evaluate((s) => document.querySelector(s)?.innerText || '', sel);
const txtOf = (info) => [info.recon, info.unchanged, info.glance, ...info.cards.map((c) => c.text)].join('\n');
// Structural a11y: duplicate ids / focus ids, dangling aria-labelledby, unnamed groups, heading skips.
const structure = (page) => page.evaluate(() => {
  const v = document.querySelector('#view');
  const count = (list) => list.reduce((m, x) => { m[x] = (m[x] || 0) + 1; return m; }, {});
  const dup = (m) => Object.keys(m).filter((x) => m[x] > 1);
  const heads = [...v.querySelectorAll('h1,h2,h3,h4')].map((e) => +e.tagName[1]);
  return {
    dupIds: dup(count([...v.querySelectorAll('[id]')].map((e) => e.id))),
    dupFids: dup(count([...document.querySelectorAll('[data-fid]')].map((e) => e.getAttribute('data-fid')))),
    dangling: [...v.querySelectorAll('[aria-labelledby]')].map((e) => e.getAttribute('aria-labelledby')).filter((ids) => ids.split(' ').some((id) => !document.getElementById(id))),
    unnamed: [...v.querySelectorAll('[role="group"]')].filter((g) => !g.getAttribute('aria-labelledby') && !g.getAttribute('aria-label')).length,
    skips: heads.filter((lv, i) => i > 0 && lv - heads[i - 1] > 1).length,
  };
});

// The "Why 11,920 and not 12,000?" card: Explain, Ask, notice clause 7 and the month-by-month link (R-15).
const reconActions = (page, sfx = '') => page.evaluate((x) => {
  const r = document.querySelector('#view .chg-recon');
  if (!r) return null;
  return {
    explain: !!r.querySelector(`[data-fid="chg-explain-relief${x}"]`),
    ask: !!r.querySelector(`[data-fid="chg-ask-relief${x}"]`),
    notice: r.querySelector(`a.btn-notice-link[data-fid="chg-notice-recon${x}"]`)?.getAttribute('href') || null,
    relief: r.querySelector(`a[data-fid="chg-relief-recon${x}"]`)?.getAttribute('href') || null,
  };
}, sfx);
// French elision: never « de » before a vowel-initial month (d’avril, d’août, d’octobre) (R-21/R-27).
const MISSING_ELISION = /\bde (avril|août|octobre)\b/i;

const CARDS = ['principal', 'interest', 'next-payment', 'maturity', 'fees', 'rate', 'debt'];
const CLAUSE = { principal: 'postponement', interest: 'interest', 'next-payment': 'postponement', maturity: 'maturity', fees: 'unchanged', rate: 'unchanged', debt: 'cost' };
const TEXT = {
  'en-CA': {
    title: 'What changes in your repayments',
    before: 'Before',
    after: 'After',
    seeDetail: 'See the detail',
    unchanged: 'Unchanged',
    octLink: 'See the October 2031 payment',
    banned: /forgiv|interest-free|interest free|holiday|saving/i,
    debtDetailTitle: 'Lower payments do not reduce what you owe',
  },
  'fr-CA': {
    title: 'Ce qui change dans vos remboursements',
    before: 'Avant',
    after: 'Après',
    seeDetail: 'Voir le détail',
    unchanged: 'Inchangé',
    octLink: 'Voir le versement d’octobre 2031',
    banned: /remise de dette|sans intérêt|congé|économi|annulation de la dette/i,
    debtDetailTitle: 'Des versements moins élevés ne réduisent pas votre dette',
  },
};

// Expected values computed in the page from the issued record so they follow the active locale.
const expected = (page) => page.evaluate(() => {
  const A = window.BDCNotice;
  const R = A.record;
  const D = R.derived;
  const o = R.originalSchedule;
  const r = R.revisedSchedule;
  const m = (c) => A.fmt.money(c);
  const w = (c) => A.fmt.money(c, { compact: true });
  const d = (iso) => A.fmt.date(iso, 'long');
  const n = R.change.months;
  return {
    principal: [w(R.loan.monthlyPrincipalCents), w(0), d(R.change.resumePrincipalDate), A.fmt.date(r[0].date, 'month'), A.fmt.date(r[2].date, 'month')],
    interest: [...o.slice(0, n).map((x) => m(x.interestCents)), m(r[0].interestCents), w(D.originalTotalInterestCents), w(D.revisedTotalInterestCents), A.fmt.money(D.additionalLifetimeInterestCents, { signed: true, compact: true })],
    'next-payment': [m(o[0].totalCents), m(r[0].totalCents), d(r[0].date)],
    maturity: [d(R.change.originalMaturity), d(R.change.revisedMaturity), String(D.originalPaymentCount), String(D.revisedPaymentCount)],
    fees: [m(R.change.feeCents)],
    rate: [A.fmt.percentFromBp(R.loan.annualRateBasisPoints)],
    debt: [w(o[n].openingPrincipalCents), w(r[n].openingPrincipalCents), d(r[n].date), w(D.principalDeferredCents)],
    recon: [w(D.principalDeferredCents), w(D.additionalInterestFirstThreeMonthsCents), w(D.nearTermPaymentReductionCents), m(D.originalNearTermPaymentsCents), m(D.revisedNearTermPaymentsCents), w(D.additionalLifetimeInterestCents)],
    unchanged: [R.loan.id, A.fmt.percentFromBp(R.loan.annualRateBasisPoints), w(R.loan.monthlyPrincipalCents), R.loan.currency],
    hasClair: !!A.clair,
    hasQuery: !!A.query,
  };
});

const browser = await launch();
const { page, consoleMsgs, requests } = await newPage(browser, { width: 1280, height: 900 });
await gotoApp(page, '#/changes', file);

/* ---------- 1. List view content in both languages ---------- */
for (const locale of ['en-CA', 'fr-CA']) {
  await setLocale(page, locale);
  await go(page, '#/changes');
  const T = TEXT[locale];
  const exp = await expected(page);
  const info = await page.evaluate(() => {
    const view = document.querySelector('#view');
    return {
      h1: [...view.querySelectorAll('h1')].map((e) => e.textContent),
      cards: [...view.querySelectorAll('article[data-card]')].map((c) => {
        const id = c.dataset.card;
        const detail = c.querySelector(`a[data-fid="chg-detail-${id}"]`);
        return {
          id,
          text: c.innerText,
          badges: [...c.querySelectorAll('.badge')].map((b) => b.textContent.trim()).filter(Boolean),
          detailHref: detail ? detail.getAttribute('href') : null,
          detailLabel: detail ? detail.textContent.trim() : null,
          explain: !!c.querySelector(`[data-fid="explain-card-${id}"]`),
          ask: !!c.querySelector(`[data-fid="ask-card-${id}"]`),
          notice: [...c.querySelectorAll('a.btn-notice-link')].map((a) => a.getAttribute('href')),
          links: [...c.querySelectorAll('a')].map((a) => a.getAttribute('href')),
          labels: [...c.querySelectorAll('.compare-label')].map((l) => l.textContent.trim()),
        };
      }),
      recon: view.querySelector('.chg-recon')?.innerText || '',
      unchanged: view.querySelector('.chg-unchanged')?.innerText || '',
      glance: view.querySelector('.chg-glance')?.innerText || '',
      demoNote: !!view.querySelector('.demo-note'),
      tables: view.querySelectorAll('table').length,
      unnamedGroups: [...view.querySelectorAll('[role="group"]')].filter((g) => !g.getAttribute('aria-labelledby') && !g.getAttribute('aria-label')).length,
      flowWhen: [...view.querySelectorAll('.chg-flow-when')].map((e) => e.textContent),
    };
  });
  check(`${locale}: exactly one h1 with the module title`, info.h1.length === 1 && N(info.h1[0]) === T.title, info.h1);
  check(`${locale}: all seven change cards render`, CARDS.every((id) => info.cards.some((c) => c.id === id)) && info.cards.length === 7, info.cards.map((c) => c.id));
  check(`${locale}: illustrative demo note present`, info.demoNote);
  for (const c of info.cards) {
    const missingVals = exp[c.id].filter((v) => !N(c.text).includes(N(v)));
    check(`${locale}: ${c.id} card shows fixture values`, missingVals.length === 0, { missing: missingVals });
    check(`${locale}: ${c.id} card has a textual badge`, c.badges.length > 0, c.badges);
    check(`${locale}: ${c.id} card has See the detail → #/changes/${c.id}`, c.detailHref === `#/changes/${c.id}` && N(c.detailLabel) === T.seeDetail, c);
    check(`${locale}: ${c.id} card has Explain with AI and Ask about this`, c.explain && c.ask);
    check(`${locale}: ${c.id} card links to notice clause ${CLAUSE[c.id]}`, c.notice.includes(`#/documents/${CLAUSE[c.id]}`), c.notice);
    check(`${locale}: ${c.id} card labels Before/After explicitly`, c.labels.includes(T.before) && c.labels.includes(T.after), c.labels);
  }
  const interest = info.cards.find((c) => c.id === 'interest');
  const maturity = info.cards.find((c) => c.id === 'maturity');
  check(`${locale}: interest card links to the total-cost comparison`, interest && interest.links.includes('#/payments/cost'));
  check(`${locale}: maturity card links to the full schedule`, maturity && maturity.links.includes('#/payments/schedule'));
  const ra = await reconActions(page);
  check(`${locale}: reconciliation card has Explain, Ask about this, View this in your notice (clause 7) and the month-by-month link`, ra && ra.explain && ra.ask && ra.notice === '#/documents/cost' && ra.relief === '#/payments/relief', ra);
  const fees = info.cards.find((c) => c.id === 'fees');
  const rate = info.cards.find((c) => c.id === 'rate');
  check(`${locale}: change-fee badge is the standard “${T.unchanged}”, like the rate card and the Overview`, fees && rate && JSON.stringify(fees.badges) === JSON.stringify([T.unchanged]) && JSON.stringify(rate.badges) === JSON.stringify([T.unchanged]), { fees: fees && fees.badges, rate: rate && rate.badges });
  const reconMissing = exp.recon.filter((v) => !N(info.recon).includes(N(v)));
  check(`${locale}: reconciliation shows 12,000 − 80 = 11,920 and 16,720 vs 4,800`, reconMissing.length === 0, { missing: reconMissing });
  const unchMissing = exp.unchanged.filter((v) => !N(info.unchanged).includes(N(v)));
  check(`${locale}: unchanged terms list rate, instalment, currency and loan id`, unchMissing.length === 0, { missing: unchMissing });
  check(`${locale}: at-a-glance band states trade-off and principal still owing`, N(info.glance).includes(N(exp.recon[5])) && N(info.glance).includes(N(exp.recon[0])));
  check(`${locale}: no wide tables in the list`, info.tables === 0);
  check(`${locale}: every before/after group has an accessible name`, info.unnamedGroups === 0, info.unnamedGroups);
  if (locale === 'fr-CA') check('fr-CA: month names stay lower-case inside phrases (De novembre…)', info.flowWhen.length === 3 && info.flowWhen[0].startsWith('De ') && !/[a-zà-ÿ,] (Janvier|Février|Mars|Avril|Mai|Juin|Juillet|Août|Septembre|Octobre|Novembre|Décembre)/.test(txtOf(info)), info.flowWhen);
  const txt = await viewText(page);
  check(`${locale}: no forgiveness / savings / interest-free / holiday wording`, !T.banned.test(txt), (txt.match(T.banned) || [])[0]);
  const mk = await missingKeys(page);
  check(`${locale}: no missing dictionary keys on the list`, mk.length === 0, mk);
}

/* ---------- 2. Interactions (en-CA) ---------- */
await setLocale(page, 'en-CA');
await go(page, '#/changes');

// See the detail → focus lands on the detail heading; Back returns focus to the originating control
await page.click('a[data-fid="chg-detail-interest"]');
await wait(page, 450);
check('See the detail navigates to #/changes/interest', (await hash(page)) === '#/changes/interest', await hash(page));
let d = await page.evaluate(() => ({
  h1: document.querySelectorAll('#view h1').length,
  focus: document.activeElement && document.activeElement.id,
  months: document.querySelectorAll('#view .chg-month').length,
  tables: document.querySelectorAll('#view table').length,
  back: !!document.querySelector('#view [data-fid="back-control"]'),
  terms: [...document.querySelectorAll('#view .term')].map((tm) => tm.dataset.term),
  explain: !!document.querySelector('#view [data-fid="explain-card-interest"]'),
  ask: !!document.querySelector('#view [data-fid="ask-card-interest"]'),
  notice: !!document.querySelector('#view a.btn-notice-link[href="#/documents/interest"]'),
  month: !!document.querySelector('#view a[data-fid="chg-month-interest"][href="#/payments/2026-12"]'),
  cost: !!document.querySelector('#view a[href="#/payments/cost"]'),
}));
check('detail has one h1 and focus lands on it', d.h1 === 1 && d.focus === 'chg-detail-title', d);
check('interest detail shows four stacked month cards and no table', d.months === 4 && d.tables === 0, d);
check('interest detail shows Back control', d.back);
check('interest detail definitions use glossary triggers', ['interest', 'outstanding', 'fixedRate'].every((x) => d.terms.includes(x)), d.terms);
check('interest detail offers explain, ask, notice, month and cost actions', d.explain && d.ask && d.notice && d.month && d.cost, d);
const interestDetail = N(await viewText(page));
const e = await expected(page);
check('interest detail shows the first-four-payments comparison values', ['$1,600.00', '$1,573.33', '$1,546.67', '$1,520.00', '$5,600.00', '$5,520.00'].every((v) => interestDetail.includes(v)) && interestDetail.includes(N(e.interest[4])) && interestDetail.includes(N(e.interest[5])));
await page.click('[data-fid="back-control"]');
await wait(page, 450);
check('Back returns to #/changes', (await hash(page)) === '#/changes', await hash(page));
check('Back restores focus to the originating See the detail control', (await activeFid(page)) === 'chg-detail-interest', await activeFid(page));

// Keyboard activation of See the detail
await page.focus('a[data-fid="chg-detail-maturity"]');
await page.keyboard.press('Enter');
await wait(page, 450);
d = await page.evaluate(() => ({ months: document.querySelectorAll('#view .chg-month').length, tracks: document.querySelectorAll('#view .chg-timeline .chg-track').length, schedule: !!document.querySelector('#view a[href="#/payments/schedule"]'), text: document.querySelector('#view').innerText }));
check('keyboard Enter opens the maturity detail', (await hash(page)) === '#/changes/maturity', await hash(page));
check('maturity detail compares last original vs last revised payments', d.months === 4 && d.tracks === 2 && d.schedule && N(d.text).includes('October 31, 2031') && N(d.text).includes('January 31, 2032'), { months: d.months, tracks: d.tracks });
const fv = await page.evaluate(() => {
  const el = document.querySelector('#view a[data-fid="chg-schedule-detail"]');
  el.focus();
  const cs = getComputedStyle(el);
  return { outline: cs.outlineStyle, width: cs.outlineWidth };
});
await page.keyboard.press('Shift+Tab');
await page.keyboard.press('Tab');
const fv2 = await page.evaluate(() => { const cs = getComputedStyle(document.activeElement); return { outline: cs.outlineStyle, width: parseFloat(cs.outlineWidth) }; });
check('keyboard focus is visible on actions', fv2.outline !== 'none' && fv2.width >= 2, { fv, fv2 });

// Other items navigation inside details
await page.click('a[data-fid="chg-other-rate"]');
await wait(page, 450);
d = await page.evaluate(() => ({ h1: document.querySelector('#view h1')?.textContent || '', focus: document.activeElement && document.activeElement.id, formula: !!document.querySelector('#view .chg-formula') }));
check('other-items link opens the rate detail with focus on its heading', (await hash(page)) === '#/changes/rate' && N(d.h1).includes(N(e.rate[0])) && d.focus === 'chg-detail-title' && d.formula, d);

// Back from a detail reached via other-items still returns to the list
await page.click('[data-fid="back-control"]');
await wait(page, 400);
check('Back from a chained detail returns to the list', (await hash(page)) === '#/changes', await hash(page));

// Notice link from a card keeps a return path
await page.click('article[data-card="principal"] a.btn-notice-link');
await wait(page, 400);
check('View this in your notice opens #/documents/postponement', (await hash(page)) === '#/documents/postponement', await hash(page));
await page.evaluate(() => window.BDCNotice.router.back());
await wait(page, 450);
check('returning from the notice restores the card control focus', (await hash(page)) === '#/changes' && (await activeFid(page)) === 'notice-postponement-from-card-principal', { hash: await hash(page), fid: await activeFid(page) });

// Total-cost link from the interest card
await page.click('a[data-fid="chg-cost-interest"]');
await wait(page, 400);
check('interest card cost link opens #/payments/cost', (await hash(page)) === '#/payments/cost', await hash(page));
await page.evaluate(() => window.BDCNotice.router.back());
await wait(page, 400);

// Explain / Ask: open the overlay when those modules exist, never error when they do not
const before = consoleMsgs.length;
await page.click('article[data-card="debt"] [data-fid="explain-card-debt"]');
await wait(page, 350);
if (e.hasClair) {
  check('Explain with AI opens Clair', await page.evaluate(() => !!document.querySelector('.overlay.is-open')));
  await page.keyboard.press('Escape');
  await wait(page, 300);
} else {
  check('Explain with AI is safe without the Clair module', consoleMsgs.length === before, consoleMsgs.slice(before));
}
await page.click('article[data-card="debt"] [data-fid="ask-card-debt"]');
await wait(page, 350);
if (e.hasQuery) {
  check('Ask about this opens the query form', await page.evaluate(() => !!document.querySelector('.overlay.is-open')));
  await page.keyboard.press('Escape');
  await wait(page, 300);
} else {
  check('Ask about this is safe without the query module', consoleMsgs.length === before, consoleMsgs.slice(before));
}

// Debt detail: balance comparison at key dates + glossary popover
await go(page, '#/changes/debt');
d = await page.evaluate(() => ({
  bal: document.querySelectorAll('#view .chg-bal').length,
  points: document.querySelectorAll('#view .chg-points li').length,
  recon: !!document.querySelector('#view .chg-recon'),
  text: document.querySelector('#view').innerText,
}));
check('debt detail compares principal owing at four key dates', d.bal === 4 && N(d.text).includes('$240,000') && N(d.text).includes('$228,000'), d.bal);
check('debt detail explains why lower payments are not a debt reduction', d.points >= 4 && d.recon);
await page.click('#view .chg-definition .term');
await wait(page, 250);
check('glossary term opens a definition popover', await page.evaluate(() => !!document.querySelector('.popover')));
await page.keyboard.press('Escape');
await wait(page, 200);
check('Escape closes the definition popover', await page.evaluate(() => !document.querySelector('.popover')));

// Principal and next-payment details
await go(page, '#/changes/principal');
d = await page.evaluate(() => ({ months: [...document.querySelectorAll('#view .chg-month')].map((m) => m.dataset.month), back: !!document.querySelector('#view [data-fid="chg-back-list"]') }));
check('principal detail shows the three postponed months plus the first resumed', JSON.stringify(d.months) === JSON.stringify(['2026-11', '2026-12', '2027-01', '2027-02']), d.months);
check('direct entry to a detail shows a Back to What changed link', d.back);
await page.click('#view [data-fid="chg-back-list"]');
await wait(page, 400);
check('Back to What changed lands on the same card in the list', (await hash(page)) === '#/changes' && (await activeFid(page)) === 'chg-detail-principal', { hash: await hash(page), fid: await activeFid(page) });
// A tab click from a detail reached with a return path must not leave a self-pointing Back control on the list
await page.click('a[data-fid="chg-detail-rate"]');
await wait(page, 400);
await page.evaluate(() => window.BDCNotice.router.go('#/changes', { focus: 'heading' }));
await wait(page, 400);
check('list shows no "Back to What changed" after returning to it by tab', (await hash(page)) === '#/changes' && !(await page.evaluate(() => !!document.querySelector('#view [data-fid="back-control"]'))));
await go(page, '#/changes/next-payment');
d = await page.evaluate(() => ({ months: document.querySelectorAll('#view .chg-month').length, steps: document.querySelectorAll('#view .chg-step').length }));
check('next-payment detail shows the payment breakdown and upcoming payments', d.months === 1 && d.steps === 4, d);
await go(page, '#/changes/fees');
check('fees detail shows the fee, additional interest and total payments', await page.evaluate(() => document.querySelectorAll('#view .chg-kv dt').length === 4));
d = await page.evaluate(() => [...document.querySelectorAll('#view .chg-detail-badges .badge')].map((b) => b.textContent.trim()));
check('fees detail badge is the standard “Unchanged”', JSON.stringify(d) === JSON.stringify([TEXT['en-CA'].unchanged]), d);

// Reconciliation on the principal and debt details carries the same routes (unique -detail focus ids)
for (const id of ['principal', 'debt']) {
  await go(page, `#/changes/${id}`);
  const rd = await reconActions(page, '-detail');
  check(`${id} detail reconciliation has Explain, Ask, notice clause 7 and month-by-month link`, rd && rd.explain && rd.ask && rd.notice === '#/documents/cost' && rd.relief === '#/payments/relief', rd);
}

// Reconciliation notice link opens clause 7 and Back returns focus to it
await go(page, '#/changes');
if (await page.$('[data-fid="chg-notice-recon"]')) {
  await page.click('[data-fid="chg-notice-recon"]');
  await wait(page, 400);
  check('reconciliation “View this in your notice” opens #/documents/cost', (await hash(page)) === '#/documents/cost', await hash(page));
  await page.evaluate(() => window.BDCNotice.router.back());
  await wait(page, 450);
  check('returning from clause 7 restores focus to the reconciliation notice link', (await hash(page)) === '#/changes' && (await activeFid(page)) === 'chg-notice-recon', { hash: await hash(page), fid: await activeFid(page) });
} else {
  check('reconciliation “View this in your notice” link exists', false);
}
if (e.hasQuery && (await page.$('[data-fid="chg-ask-relief"]'))) {
  await page.click('[data-fid="chg-ask-relief"]');
  await wait(page, 350);
  check('reconciliation Ask about this opens the query form', await page.evaluate(() => !!document.querySelector('.overlay.is-open')));
  await page.keyboard.press('Escape');
  await wait(page, 300);
}

// Month links: plain month in English, elided month phrase in French (d’octobre, de novembre)
for (const locale of ['en-CA', 'fr-CA']) {
  await setLocale(page, locale);
  await go(page, '#/changes/maturity');
  d = await page.evaluate(() => {
    const n2 = (x) => String(x || '').replace(/\s+/g, ' ').trim();
    return {
      oct: n2(document.querySelector('#view a[data-fid="chg-mlink-maturity-2031-10"]')?.textContent),
      links: [...document.querySelectorAll('#view .chg-month-link a, #view a[data-fid="chg-month-maturity"]')].map((a) => n2(a.textContent)),
    };
  });
  check(`${locale}: October 2031 month link reads “${TEXT[locale].octLink}”`, d.oct === TEXT[locale].octLink, d);
  if (locale === 'fr-CA') check('fr-CA: month links use « de » / « d’ » correctly (no « de octobre »)', d.links.length === 5 && d.links.every((x) => /^Voir le versement (d’|de )/.test(x) && !MISSING_ELISION.test(x)), d.links);
}
await setLocale(page, 'en-CA');

// Unknown item falls back to the list
await go(page, '#/changes/not-a-card');
check('unknown item renders the list', await page.evaluate(() => document.querySelectorAll('#view article[data-card]').length === 7));

// Language switch on a detail keeps the route and translates the heading
await go(page, '#/changes/debt');
await setLocale(page, 'fr-CA');
d = await page.evaluate(() => ({ h: location.hash, h1: document.querySelector('#view h1')?.textContent || '' }));
check('switching to French keeps the detail route and translates it', d.h === '#/changes/debt' && N(d.h1) === TEXT['fr-CA'].debtDetailTitle, d);
const frText = await viewText(page);
check('fr-CA detail uses Canadian French formatting', /240\s000\s\$/.test(frText) && /28\sfévrier\s2027/.test(frText));
await setLocale(page, 'en-CA');

/* ---------- 3. Reflow, keys and wording on every route at narrow widths ---------- */
// Accessible names of #view (when it is a region) and every named section landmark inside it; returns duplicated names.
const landmarkNameClashes = (page) => page.evaluate(() => {
  const v = document.querySelector('#view');
  const name = (el) => {
    const by = el.getAttribute('aria-labelledby');
    const txt = by ? by.split(' ').map((id) => document.getElementById(id)?.textContent || '').join(' ') : (el.getAttribute('aria-label') || '');
    return txt.replace(/\s+/g, ' ').trim().toLowerCase();
  };
  const names = [...v.querySelectorAll('section[aria-labelledby], section[aria-label], [role="region"]')].map(name).filter(Boolean);
  if (v.getAttribute('role') === 'region') names.push(name(v));
  return names.filter((x, i) => names.indexOf(x) !== i);
});
const routes = ['#/changes', ...CARDS.map((c) => `#/changes/${c}`)];
for (const locale of ['en-CA', 'fr-CA']) {
  await setLocale(page, locale);
  for (const w of [320, 390]) {
    await page.setViewportSize({ width: w, height: 800 });
    const problems = [];
    for (const r of routes) {
      await go(page, r);
      const of = await overflowReport(page);
      const mk = await missingKeys(page);
      const txt = await viewText(page);
      const h1s = await page.evaluate(() => document.querySelectorAll('#view h1').length);
      if (w === 390) {
        const st = await structure(page);
        if (st.dupIds.length || st.dupFids.length || st.dangling.length || st.unnamed || st.skips) problems.push(`${r} structure ${JSON.stringify(st)}`);
      }
      if (of.overflow || of.offenders.length) problems.push(`${r} overflow ${JSON.stringify(of.offenders.slice(0, 3))}`);
      if (mk.length) problems.push(`${r} missing ${mk.slice(0, 3).join(',')}`);
      if (TEXT[locale].banned.test(txt)) problems.push(`${r} banned wording`);
      if (locale === 'fr-CA' && MISSING_ELISION.test(txt)) problems.push(`${r} missing elision: ${txt.match(MISSING_ELISION)[0]}`);
      if (h1s !== 1) problems.push(`${r} has ${h1s} h1`);
      // #view is a named region in compact mode: no region inside it may share its name (axe landmark-unique, R-49)
      const dupLandmarks = await landmarkNameClashes(page);
      if (dupLandmarks.length) problems.push(`${r} landmark name clash ${JSON.stringify(dupLandmarks)}`);
    }
    check(`${locale} ${w}px: all changes routes reflow with one h1, no missing keys${w === 390 ? ', unique ids/focus ids, named groups, no heading skips' : ''}`, problems.length === 0, problems);
  }
}

// axe-core landmark-unique on the list at 320 px (compact navigation) in both languages, when axe-core is installed
const axePath = new URL('../../node_modules/axe-core/axe.min.js', import.meta.url).pathname;
if (existsSync(axePath)) {
  const axeSrc = readFileSync(axePath, 'utf8');
  await page.setViewportSize({ width: 320, height: 800 });
  for (const locale of ['en-CA', 'fr-CA']) {
    await setLocale(page, locale);
    await go(page, '#/changes');
    if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ content: axeSrc });
    const res = await page.evaluate(async () => {
      const r = await window.axe.run(document, { runOnly: { type: 'rule', values: ['landmark-unique', 'region', 'landmark-no-duplicate-main'] }, resultTypes: ['violations'] });
      return { compact: document.documentElement.classList.contains('nav-compact'), v: r.violations.map((x) => `${x.id}: ${x.nodes.map((n) => n.target.join(' ')).join(' | ')}`) };
    });
    check(`${locale} 320px: axe landmark-unique passes on #/changes (compact nav)`, res.v.length === 0, res);
  }
} else {
  console.log('- axe-core not installed: landmark-unique scan skipped');
}

// French typography in the changes namespace: U+00A0 before « : » and inside « », no space before ; ? ! (R-33)
const frSpacing = await page.evaluate(() => {
  const bad = [];
  const walk = (o, path) => {
    if (typeof o === 'string') {
      if (/ [:;?!]/.test(o) || /[\u00a0\u202f][;?!]/.test(o) || /[^\u00a0\u202f]:\s/.test(o) || /«[^\u00a0\u202f]/.test(o) || /[^\u00a0\u202f]»/.test(o)) bad.push(path);
    } else if (o && typeof o === 'object') Object.entries(o).forEach(([k2, v]) => walk(v, `${path}.${k2}`));
  };
  walk(window.BDCNotice.i18n._dicts['fr-CA'].changes, 'changes');
  return bad;
});
check('fr-CA changes dictionary uses no-break spaces before “:” and inside « », none before ; ? !', frSpacing.length === 0, frSpacing);

check('no console errors', consoleMsgs.length === 0, [...new Set(consoleMsgs)].slice(0, 5));
check('no unexpected network requests', requests.filter((u) => !u.startsWith('https://accessibilityserver.org/')).length === 0, requests);

await browser.close();
console.log(failed ? `\n✗ ${failed} check(s) failed` : '\n✓ changes module checks passed');
process.exit(failed ? 1 : 0);
