#!/usr/bin/env node
// Payments & impact module QA: range filter (keyboard radios, totals, grouped
// years remembered), paired payment chart (wide/narrow layouts, mouse and
// keyboard month selection, focus kept on the control), selected-month detail
// (both schedules, why it differs, Explain/Ask/notice actions, close), range
// switching for out-of-range months, special routes (relief, cost, schedule),
// separate infographics with record values, balance chart + data views, CSV
// exports (content, filenames, events), fr-CA, 320px reflow, honest wording.
// Usage: node tests/modules/payments.mjs [path/to/index.html]
import { readFileSync } from 'node:fs';
import { launch, newPage, gotoApp, overflowReport, missingKeys, DEFAULT_FILE } from '../lib/browser.mjs';

const file = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : DEFAULT_FILE;
let failed = 0;
function check(name, ok, detail) {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${!ok && detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
}
const wait = (page, ms = 250) => page.waitForTimeout(ms);
// Collapse all whitespace (incl. no-break spaces in fr-CA amounts) for comparisons.
const N = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const hash = (page) => page.evaluate(() => location.hash);
const go = async (page, h) => { await page.evaluate((x) => { location.hash = x; }, h); await wait(page, 300); };
const activeFid = (page) => page.evaluate(() => {
  const a = document.activeElement;
  const el = a && a.closest('[data-fid]');
  return el ? el.getAttribute('data-fid') : null;
});
const viewText = (page, sel = '#view') => page.locator(sel).first().innerText().then(N);
const visibleCards = (page) => page.evaluate(() => [...document.querySelectorAll('.pay-mcard')].filter((b) => !b.closest('[hidden]')).map((b) => b.dataset.month));
const checkedRange = (page) => page.evaluate(() => (document.querySelector('input[name="pay-range"]:checked') || {}).value || null);

// Expected strings computed in the page from the issued record (follow the active locale).
const expected = (page) => page.evaluate(() => {
  const A = window.BDCNotice;
  const R = A.record;
  const D = R.derived;
  const m = (c) => A.fmt.money(c);
  const w = (c) => A.fmt.money(c, { compact: true });
  return {
    locale: A.i18n.locale,
    relief: w(D.nearTermPaymentReductionCents),
    deferred: w(D.principalDeferredCents),
    extra3: w(D.additionalInterestFirstThreeMonthsCents),
    extra: w(D.additionalLifetimeInterestCents),
    extraSigned: A.fmt.money(D.additionalLifetimeInterestCents, { compact: true, signed: true }),
    origNear: m(D.originalNearTermPaymentsCents),
    revNear: m(D.revisedNearTermPaymentsCents),
    reliefSigned: A.fmt.money(-D.nearTermPaymentReductionCents, { signed: true }),
    origInt: w(D.originalTotalInterestCents),
    revInt: w(D.revisedTotalInterestCents),
    origTotal: w(D.originalTotalPaymentsCents),
    revTotal: w(D.revisedTotalPaymentsCents),
    origTotalCents: m(D.originalTotalPaymentsCents),
    revTotalCents: m(D.revisedTotalPaymentsCents),
    lifetimeSigned: A.fmt.money(D.additionalLifetimeInterestCents, { signed: true }),
    origMaturity: A.fmt.date(R.change.originalMaturity),
    revMaturity: A.fmt.date(R.change.revisedMaturity),
    resume: A.fmt.date(R.change.resumePrincipalDate),
    years: A.rec.years.slice(),
    noPayment: A.i18n.t('common.noPayment'),
  };
});

const monthRow = (page, id) => page.evaluate((mid) => {
  const A = window.BDCNotice;
  const c = A.rec.month(mid);
  const f = (row) => (row ? ['openingPrincipalCents', 'principalCents', 'interestCents', 'totalCents', 'closingPrincipalCents'].map((k) => A.fmt.money(row[k])) : null);
  // "December 2026" / fr "de décembre 2026", "d’avril 2027" (elision before a vowel)
  const my = A.fmt.date(mid, 'monthYear');
  const of = A.i18n.t(/^[aeiouyàâéèêëîïôûùüœ]/i.test(my) ? 'payments.ofMonthVowel' : 'payments.ofMonth', { month: my });
  const title = A.i18n.t('payments.detail.title', { month: of });
  return { o: f(c.original), r: f(c.revised), diff: A.fmt.money(c.differenceCents, { signed: true }), title: title.charAt(0).toLocaleUpperCase(A.i18n.locale) + title.slice(1) };
}, id);

const detailValues = (page) => page.evaluate(() => {
  const d = document.querySelector('.pay-detail');
  if (!d) return null;
  const rows = [...d.querySelectorAll('.pay-drow:not(.pay-drow--head)')];
  return {
    month: d.dataset.month || null,
    title: (d.querySelector('.pay-detail-title') || {}).textContent || '',
    o: rows.map((r) => (r.querySelector('.pay-dval--o .pay-dval-v') || {}).textContent),
    r: rows.map((r) => (r.querySelector('.pay-dval--r .pay-dval-v') || {}).textContent),
    diff: (d.querySelector('.pay-detail-diff') || {}).textContent || '',
    why: (d.querySelector('.pay-detail-why') || {}).textContent || '',
    text: d.textContent,
    explain: !!d.querySelector(`[data-fid="explain-month-${d.dataset.month}"]`),
    ask: !!d.querySelector(`[data-fid="ask-month-${d.dataset.month}"]`),
    notice: (d.querySelector(`[data-fid="notice-schedule-from-month-${d.dataset.month}"]`) || { getAttribute: () => null }).getAttribute('href'),
    close: !!d.querySelector('[data-fid="pay-detail-close"]'),
  };
});

const browser = await launch();

/* ======================= en-CA, desktop ======================= */
{
  const { page, consoleMsgs, requests, context } = await newPage(browser, { width: 1280, height: 900 });
  await gotoApp(page, '#/payments', file);
  const e = await expected(page);

  // Level 1 structure
  const s = await page.evaluate(() => {
    const v = document.getElementById('view');
    return {
      h1: v.querySelectorAll('h1').length,
      h1Text: (v.querySelector('h1') || {}).textContent,
      demo: !!v.querySelector('.demo-note'),
      summary: (v.querySelector('.pay-summary') || {}).textContent || '',
      terms: [...new Set([...v.querySelectorAll('.term[data-term]')].map((b) => b.dataset.term))],
      infos: [...v.querySelectorAll('.pay-info')].map((x) => x.id),
      text: v.innerText,
    };
  });
  check('en: exactly one h1 (section header)', s.h1 === 1 && /month by month/i.test(s.h1Text), s);
  check('en: illustrative demo note shown', s.demo);
  check('en: key-effect summary uses record values', [e.relief, e.extra, e.revMaturity, e.resume].every((x) => N(s.summary).includes(N(x))), N(s.summary));
  check('en: glossary triggers (principal, interest, outstanding, amortisation, cashFlow)', ['principal', 'interest', 'outstanding', 'amortisation', 'cashFlow'].every((x) => s.terms.includes(x)), s.terms);
  check('en: two separate infographic cards (relief, cost)', JSON.stringify(s.infos) === JSON.stringify(['pay-relief', 'pay-cost']), s.infos);
  check('en: no forbidden framing (forgiveness/savings/interest-free/holiday)', !/forgiv|saving|interest[- ]free|holiday/i.test(s.text), (s.text.match(/forgiv|saving|interest[- ]free|holiday/i) || [])[0]);

  // Infographics
  const relief = N(await page.locator('#pay-relief').innerText());
  check('en: relief equation 12,000 − 80 = 11,920 and Nov–Jan totals', [e.deferred, e.extra3, e.relief, e.origNear, e.revNear].every((x) => relief.includes(N(x))), relief);
  check('en: relief explain button wired', await page.locator('#pay-relief [data-fid="explain-infographic-relief"]').count() === 1);
  const cost = N(await page.locator('#pay-cost').innerText());
  check('en: cost infographic shows interest, payments, maturity and +4,800', [e.origInt, e.revInt, e.extraSigned, e.origTotal, e.revTotal, e.origMaturity, e.revMaturity].every((x) => cost.includes(N(x))), cost);
  check('en: cost note says the $80 is already included in the $4,800', cost.includes(`${N(e.extra3)} of additional interest within the first three months is already part of the ${N(e.extra)}`), cost);
  check('en: cost explain button wired', await page.locator('#pay-cost [data-fid="explain-infographic-cost"]').count() === 1);

  // Filter defaults and keyboard radios
  check('en: filter has 3 radios in a fieldset with legend', await page.locator('fieldset.pay-filter legend').count() === 1 && await page.locator('fieldset.pay-filter input[type="radio"]').count() === 3);
  check('en: default range is first six months (6 cards)', (await checkedRange(page)) === '6' && (await visibleCards(page)).length === 6, await visibleCards(page));
  await page.locator('[data-fid="pay-range-6"]').focus();
  await page.keyboard.press('ArrowLeft');
  await wait(page);
  check('en: ArrowLeft selects "First three months" (3 cards), focus stays on radio', (await checkedRange(page)) === '3' && (await visibleCards(page)).length === 3 && (await activeFid(page)) === 'pay-range-3', { r: await checkedRange(page), f: await activeFid(page) });
  const totals3 = N(await page.locator('.pay-totals').innerText());
  check('en: 3-month totals 16,720.00 vs 4,800.00, 11,920.00 lower', totals3.includes(N(e.origNear)) && totals3.includes(N(e.revNear)) && totals3.includes(`${N(e.reliefSigned)} lower`), totals3);
  const card0 = N(await page.locator('[data-fid="pay-month-2026-11"]').innerText());
  check('en: month card labels Original / Revised / Difference with sign and word', /Original/.test(card0) && /Revised/.test(card0) && /−\$4,000\.00 lower/.test(card0), card0);

  await page.locator('label[for="pay-range-all"]').click();
  await wait(page);
  const yearsInfo = await page.evaluate(() => [...document.querySelectorAll('.pay-year-btn')].map((b) => [b.getAttribute('data-fid'), b.getAttribute('aria-expanded')]));
  check('en: full term groups by year, only the first year open', yearsInfo.length === e.years.length && yearsInfo.filter(([, x]) => x === 'true').length === 1 && yearsInfo[0][1] === 'true', yearsInfo);
  check('en: full term shows 2 cards by default (never 63 expanded)', (await visibleCards(page)).length === 2, (await visibleCards(page)).length);
  const totalsAll = N(await page.locator('.pay-totals').innerText());
  check('en: full-term totals 288,800 vs 293,600 (+4,800 higher)', totalsAll.includes(N(e.origTotalCents)) && totalsAll.includes(N(e.revTotalCents)) && totalsAll.includes(`${N(e.lifetimeSigned)} higher`), totalsAll);
  await page.locator('[data-fid="pay-year-2027"]').click();
  await wait(page, 150);
  check('en: opening 2027 shows its 12 months', (await visibleCards(page)).length === 14);
  const yearHead = N(await page.locator('[data-fid="pay-year-2027"]').innerText());
  check('en: year header shows yearly totals', /Original \$[\d,]+\.\d\d\s*·?\s*Revised \$[\d,]+\.\d\d/.test(yearHead), yearHead);
  const lastYearHead = N(await page.locator(`[data-fid="pay-year-${e.years[e.years.length - 1]}"]`).innerText());
  check('en: final year header says "Original: no payment" (original schedule ended)', /Original: no payment\s*·?\s*Revised \$[\d,]+\.\d\d/.test(lastYearHead), lastYearHead);
  await go(page, '#/overview');
  await go(page, '#/payments');
  check('en: range and open years remembered for the session', (await checkedRange(page)) === 'all' && (await page.getAttribute('[data-fid="pay-year-2027"]', 'aria-expanded')) === 'true');
  await page.locator('label[for="pay-range-6"]').click();
  await wait(page);

  // Paired payment chart (wide)
  const chart = await page.evaluate(() => {
    const host = document.querySelector('.pay-chart-host');
    return {
      layout: host && host.dataset.layout,
      buttons: [...document.querySelectorAll('.pay-chart-host .pay-hit')].map((b) => [b.dataset.month, b.getAttribute('aria-label')]),
      svgHidden: (host.querySelector('svg') || {}).getAttribute?.('aria-hidden'),
      patterns: host.querySelectorAll('pattern').length,
      totals: [...host.querySelectorAll('.pay-svg-total')].length,
      ticks: [...host.querySelectorAll('.pay-svg-tick')].map((x) => x.textContent),
      legend: [...document.querySelectorAll('.pay-chart-card .pay-legend-item')].map((x) => x.textContent),
      unit: (document.querySelector('.pay-chart-card .pay-unit') || {}).textContent,
    };
  });
  check('en: payment chart uses the wide paired-column layout at 1280px', chart.layout === 'wide', chart.layout);
  check('en: six month controls, Nov 2026 – Apr 2027', JSON.stringify(chart.buttons.map((b) => b[0])) === JSON.stringify(['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04']), chart.buttons.map((b) => b[0]));
  check('en: month controls have full accessible names', /^November 2026: original payment \$5,600\.00, revised payment \$1,600\.00, −\$4,000\.00 lower/.test(chart.buttons[0][1]), chart.buttons[0][1]);
  check('en: chart SVG decorative, hatched pattern, 12 direct total labels', chart.svgHidden === 'true' && chart.patterns >= 2 && chart.totals === 12, chart);
  check('en: dollar y-axis with unit label and 4-item legend', chart.ticks.includes('$0') && chart.ticks.includes('$6,000') && /CAD/.test(chart.unit) && chart.legend.length === 4, chart);
  await page.locator('[data-fid="pay-chart-2026-12"]').click();
  await wait(page, 350);
  check('en: clicking December selects #/payments/2026-12', (await hash(page)) === '#/payments/2026-12');
  check('en: focus stays on the December chart control', (await activeFid(page)) === 'pay-chart-2026-12', await activeFid(page));
  check('en: December visibly highlighted in chart (band + aria-current)', await page.locator('.pay-chart-host .pay-svg-sel').count() === 1 && (await page.getAttribute('[data-fid="pay-chart-2026-12"]', 'aria-current')) === 'true');
  const ro = N(await page.locator('.pay-readout').innerText());
  check('en: readout shows the selected month figures', ro.includes('December 2026') && ro.includes('$5,573.33') && ro.includes('$1,600.00') && !/null|undefined/.test(ro), ro);
  await page.keyboard.press('ArrowRight');
  check('en: ArrowRight moves focus to the next month control', (await activeFid(page)) === 'pay-chart-2027-01', await activeFid(page));
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  check('en: keyboard focus on chart control is visible', outline && outline !== 'none', outline);
  await page.keyboard.press('Enter');
  await wait(page, 350);
  check('en: Enter selects January 2027, focus kept', (await hash(page)) === '#/payments/2027-01' && (await activeFid(page)) === 'pay-chart-2027-01', { h: await hash(page), f: await activeFid(page) });
  await page.keyboard.press('Space');
  await wait(page, 350);
  check('en: Space on the selected control keeps it selected', (await hash(page)) === '#/payments/2027-01');

  // Detail panel for December (reached by browser navigation)
  await go(page, '#/payments/2026-12');
  const dec = await detailValues(page);
  const decExp = await monthRow(page, '2026-12');
  check('en: detail title "December 2026 payment"', N(dec.title) === N(decExp.title), dec.title);
  check('en: detail shows original opening/principal/interest/total/closing', JSON.stringify(dec.o.map(N)) === JSON.stringify(decExp.o.map(N)), dec.o);
  check('en: detail shows revised opening/principal/interest/total/closing', JSON.stringify(dec.r.map(N)) === JSON.stringify(decExp.r.map(N)), dec.r);
  check('en: detail shows signed difference with word', N(dec.diff).includes(`${N(decExp.diff)} lower`), dec.diff);
  check('en: why it differs explains postponement and higher interest', /principal postponement/.test(dec.why) && /\$26\.67 more/.test(dec.why), dec.why);
  check('en: Explain (explain-month-2026-12), Ask and notice clause actions', dec.explain && dec.ask && dec.notice === '#/documents/schedule', dec);
  check('en: Explain/Ask guarded when Clair/query are absent (no error on click)', await (async () => {
    const before = consoleMsgs.length;
    await page.locator('[data-fid="explain-month-2026-12"]').click();
    await wait(page, 150);
    if (await page.locator('[data-overlay]').count()) await page.keyboard.press('Escape');
    return consoleMsgs.length === before;
  })());

  // Month card selection keeps focus on the card
  await page.locator('[data-fid="pay-month-2027-02"]').click();
  await wait(page, 350);
  check('en: selecting the February card navigates and keeps focus on it', (await hash(page)) === '#/payments/2027-02' && (await activeFid(page)) === 'pay-month-2027-02', { h: await hash(page), f: await activeFid(page) });
  const feb = await detailValues(page);
  check('en: February detail explains resumed principal and higher interest', /Principal payments of \$4,000 resume this month/.test(feb.why) && /\$80\.00 more/.test(feb.why) && /\$240,000 instead of \$228,000/.test(feb.why), feb.why);
  check('en: selected card marked (aria-current + visible label)', (await page.getAttribute('[data-fid="pay-month-2027-02"]', 'aria-current')) === 'true' && /Selected/.test(await page.locator('[data-fid="pay-month-2027-02"]').innerText()));
  await page.locator('[data-fid="pay-month-detail-2027-02"]').click();
  await wait(page, 500);
  check('en: "See the breakdown" moves focus to the detail panel', (await activeFid(page)) === 'pay-detail', await activeFid(page));
  await page.locator('[data-fid="pay-detail-close"]').click();
  await wait(page, 350);
  check('en: Close returns to #/payments with focus on the card', (await hash(page)) === '#/payments' && (await activeFid(page)) === 'pay-month-2027-02', { h: await hash(page), f: await activeFid(page) });
  check('en: empty detail state shown after closing', await page.locator('.pay-detail--empty').count() === 1);

  // Out-of-range month switches the range and opens its year
  await page.locator('label[for="pay-range-3"]').click();
  await wait(page);
  await go(page, '#/payments/2030-05');
  const yr = await page.getAttribute('[data-fid="pay-year-2030"]', 'aria-expanded');
  check('en: out-of-range month switches to full term and opens its year', (await checkedRange(page)) === 'all' && yr === 'true' && (await visibleCards(page)).includes('2030-05'), { r: await checkedRange(page), yr });
  await go(page, '#/payments/2027-04');
  check('en: month 6 keeps full term (already contains it)', (await checkedRange(page)) === 'all');
  await page.locator('label[for="pay-range-3"]').click();
  await wait(page);
  check('en: switching range keeps the selected month and notes it is outside', (await hash(page)) === '#/payments/2027-04' && (await detailValues(page)).month === '2027-04' && await page.locator('.pay-outside').count() === 1);
  // The detail panel's "Explain with AI" context follows the filter (period) after a range change.
  const explainCtx = await page.evaluate(() => {
    const A = window.BDCNotice;
    const had = Object.prototype.hasOwnProperty.call(A, 'clair');
    const prev = A.clair;
    let got = null;
    A.clair = { open(ctx) { got = ctx; } };
    document.querySelector('[data-fid="explain-month-2027-04"]').click();
    if (had) A.clair = prev; else delete A.clair;
    return got;
  });
  check('en: detail Explain context carries the month and the current range', explainCtx && explainCtx.kind === 'month' && explainCtx.id === '2027-04' && explainCtx.period === '3' && explainCtx.fid === 'explain-month-2027-04', explainCtx);
  await go(page, '#/overview');
  await go(page, '#/payments/2027-03');
  check('en: month index 4 switches "first three" to "first six"', (await checkedRange(page)) === '6');

  // Extended month (original null)
  await go(page, '#/payments/2031-12');
  const ext = await detailValues(page);
  check('en: added month shows "no payment" for the original schedule', ext.text.includes(e.noPayment) && ext.o.every((x) => /^—/.test(N(x))) && /Added month/.test(ext.text) && /fully repaid on October 31, 2031/.test(ext.why), ext);
  await go(page, '#/payments/2032-01');
  check('en: final revised month explained', /last payment of the revised schedule/.test((await detailValues(page)).why));

  // Special routes, reached by in-app navigation (focus moves to the item)
  await go(page, '#/overview');
  await page.evaluate(() => window.BDCNotice.ui.goWithReturn('#/payments/relief', { kind: 'summary', id: 'relief' }, 'summary-relief-detail'));
  await wait(page, 600);
  check('en: #/payments/relief sets first three months and focuses the cash-flow infographic', (await checkedRange(page)) === '3' && (await page.evaluate(() => document.activeElement && document.activeElement.id)) === 'pay-relief', await page.evaluate(() => document.activeElement && document.activeElement.id));
  const back = page.locator('[data-fid="back-control"]');
  check('en: Back control shown when reached from another place', await back.count() === 1 && /Back to Overview/.test(await back.innerText()), await back.count() ? await back.innerText() : 'none');
  await back.click();
  await wait(page, 400);
  check('en: Back returns to Overview', (await hash(page)) === '#/overview');
  await page.evaluate(() => window.BDCNotice.router.go('#/payments/cost', { focus: 'item' }));
  await wait(page, 600);
  check('en: #/payments/cost focuses the cost infographic', (await page.evaluate(() => document.activeElement && document.activeElement.id)) === 'pay-cost');
  await page.evaluate(() => window.BDCNotice.router.go('#/payments/schedule', { focus: 'item' }));
  await wait(page, 600);
  check('en: #/payments/schedule switches to full term and focuses the month list', (await checkedRange(page)) === 'all' && (await page.evaluate(() => document.activeElement && document.activeElement.id)) === 'pay-months');

  // Balance chart + data views
  const bal = await page.evaluate(() => {
    const host = document.querySelector('.pay-chart-host--balance');
    return {
      lines: host.querySelectorAll('.pay-svg-line').length,
      band: host.querySelectorAll('.pay-svg-band').length,
      labels: [...host.querySelectorAll('.pay-svg-endlabel')].map((x) => x.textContent),
      ticks: [...host.querySelectorAll('.pay-svg-tick')].map((x) => x.textContent),
    };
  });
  check('en: balance chart has two lines and the postponement band', bal.lines === 2 && bal.band === 1, bal);
  check('en: balance chart direct end labels', bal.labels.some((x) => /Original.*repaid October 2031/.test(x)) && bal.labels.some((x) => /Revised.*repaid January 2032/.test(x)), bal.labels);
  const endPos = await page.evaluate(() => {
    const host = document.querySelector('.pay-chart-host--balance');
    const svgR = host.querySelector('svg').getBoundingClientRect();
    return [...host.querySelectorAll('.pay-svg-endlabel')].map((t) => {
      const r = t.getBoundingClientRect();
      return { cls: t.getAttribute('class'), right: (r.right - svgR.left) / svgR.width };
    });
  });
  check('en: both balance labels sit at the end of their lines (right part of the plot)', endPos.length === 2 && endPos.every((x) => x.right > 0.7), endPos);
  check('en: balance y-axis $0 to $240,000', bal.ticks.includes('$0') && bal.ticks.includes('$240,000'), bal.ticks);
  const tg = page.locator('[data-fid="pay-data-toggle-payments"]');
  check('en: "Show the numbers" toggle collapsed by default', (await tg.getAttribute('aria-expanded')) === 'false' && /Show the numbers/.test(await tg.innerText()));
  await tg.click();
  await wait(page, 150);
  const dv = await page.evaluate(() => ({
    table: !!document.querySelector('#pay-data-payments .pay-dv-table table') && getComputedStyle(document.querySelector('#pay-data-payments .pay-dv-table')).display !== 'none',
    rows: document.querySelectorAll('#pay-data-payments tbody tr').length,
    cardsHidden: getComputedStyle(document.querySelector('#pay-data-payments .pay-dv-cards')).display === 'none',
  }));
  check('en: payment data view is a 6-row table on wide screens', dv.table && dv.rows === 6 && dv.cardsHidden, dv);
  check('en: toggle label switches to "Hide the numbers"', (await tg.getAttribute('aria-expanded')) === 'true' && /Hide the numbers/.test(await tg.innerText()));
  await page.locator('[data-fid="pay-data-toggle-balance"]').click();
  await wait(page, 150);
  const bdv = N(await page.locator('#pay-data-balance table').innerText());
  check('en: balance data view lists key dates incl. "Repaid"', /November 1, 2026/.test(bdv) && /Repaid/.test(bdv) && /January 31, 2032/.test(bdv) && (await page.locator('#pay-data-balance tbody tr').count()) === 9, bdv);

  // CSV builders
  const csvs = await page.evaluate(() => Object.fromEntries(window.BDCNotice.payments.CSV_KINDS.map((kd) => [kd, window.BDCNotice.payments.csv(kd)])));
  const dated = (c) => c.content.split(/\r\n/).filter((r) => /^\d{4}-\d{2}-\d{2},/.test(r));
  const last = (c) => c.content.trim().split(/\r\n/).pop();
  const rv = csvs['revised-full'];
  check('en: revised CSV filename', rv.filename === 'DEMO-BDC-CHANGE-2026-001_revised-schedule.csv', rv.filename);
  check('en: CSV starts with UTF-8 BOM and preamble (notice, version, loan, status)', rv.content.startsWith('﻿Notice identifier,DEMO-BDC-CHANGE-2026-001\r\nRecord version,1.0\r\nLoan identifier,DEMO-4821\r\nStatus,Fictional demonstration – not a BDC offer or agreement'), rv.content.slice(0, 200));
  check('en: CSV has a blank row then localized header', /\r\n\r\nPayment date,Payment number,Opening principal,Principal,Interest,Total payment,Closing principal\r\n/.test(rv.content));
  check('en: revised CSV has 63 dated rows, machine decimals', dated(rv).length === 63 && dated(rv)[0] === '2026-11-30,1,240000.00,0.00,1600.00,1600.00,240000.00' && !rv.content.includes('560000'), dated(rv)[0]);
  check('en: revised CSV totals row (240,000 / 53,600 / 293,600)', last(rv) === 'Total,,,240000.00,53600.00,293600.00,', last(rv));
  const ov = csvs['original-full'];
  check('en: original CSV 60 rows, totals 48,800 / 288,800', ov.filename.endsWith('_original-schedule.csv') && dated(ov).length === 60 && last(ov) === 'Total,,,240000.00,48800.00,288800.00,', [dated(ov).length, last(ov)]);
  const s3 = csvs['selection-3'];
  check('en: selection-3 CSV compares both schedules with difference', dated(s3).length === 3 && dated(s3)[0] === '2026-11-30,240000.00,4000.00,1600.00,5600.00,236000.00,240000.00,0.00,1600.00,1600.00,240000.00,-4000.00', dated(s3)[0]);
  check('en: selection-3 totals reconcile (16,720 vs 4,800; −11,920)', last(s3) === 'Total,,12000.00,4720.00,16720.00,,,0.00,4800.00,4800.00,,-11920.00', last(s3));
  const sa = csvs['selection-all'];
  check('en: selection-all 63 rows, original blank after Oct 2031, +4,800 total', dated(sa).length === 63 && dated(sa)[62].startsWith('2032-01-31,,,,,,4000.00,') && last(sa).endsWith(',4800.00') && sa.filename.endsWith('_selection-full-term.csv'), [dated(sa)[62], last(sa)]);
  check('en: selection-6 filename', csvs['selection-6'].filename === 'DEMO-BDC-CHANGE-2026-001_selection-first-6-months.csv');

  // Downloads through the UI + events
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-fid="pay-dl-revised"]').click()]);
  const dlText = readFileSync(await dl.path(), 'utf8');
  check('en: "Download full revised schedule (CSV)" downloads the file', dl.suggestedFilename() === 'DEMO-BDC-CHANGE-2026-001_revised-schedule.csv' && dlText.includes('DEMO-BDC-CHANGE-2026-001') && dlText.split(/\r?\n/).filter((r) => /^\d{4}-\d{2}-\d{2}/.test(r)).length === 63, dl.suggestedFilename());
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.locator('[data-fid="pay-dl-selection"]').click()]);
  check('en: "Download displayed selection" follows the current range', dl2.suggestedFilename() === 'DEMO-BDC-CHANGE-2026-001_selection-full-term.csv', dl2.suggestedFilename());
  const [dl3] = await Promise.all([page.waitForEvent('download'), page.locator('[data-fid="pay-dl-original"]').click()]);
  check('en: "Download full original schedule" works', dl3.suggestedFilename() === 'DEMO-BDC-CHANGE-2026-001_original-schedule.csv');
  const ev = await page.evaluate(() => window.BDCNotice.events.all().filter((x) => x.type === 'schedule_exported').map((x) => x.id));
  check('en: schedule_exported events logged with identifiers only', JSON.stringify(ev) === JSON.stringify(['revised-full', 'selection-all', 'original-full']), ev);
  check('en: download buttons have accessible names matching /revised schedule.*CSV/', await page.locator('#view').getByRole('button', { name: /revised schedule.*CSV/i }).count() >= 1);

  /* ---------------- fr-CA ---------------- */
  await go(page, '#/payments/2027-02');
  await page.locator('label[for="pay-range-6"]').click();
  await wait(page);
  await page.locator('[data-fid="pay-range-6"]').focus();
  await page.evaluate(() => window.BDCNotice.i18n.setLocale('fr-CA'));
  await wait(page, 400);
  const ef = await expected(page);
  check('fr: selection, range and focus preserved after language switch', (await hash(page)) === '#/payments/2027-02' && (await checkedRange(page)) === '6' && (await activeFid(page)) === 'pay-range-6', { h: await hash(page), r: await checkedRange(page), f: await activeFid(page) });
  const labels = await page.evaluate(() => [...document.querySelectorAll('.pay-filter label')].map((l) => l.textContent));
  check('fr: filter labels', JSON.stringify(labels) === JSON.stringify(['Trois premiers mois', 'Six premiers mois', 'Durée restante complète']), labels);
  const ft = await detailValues(page);
  const febFr = await monthRow(page, '2027-02');
  check('fr: detail title and amounts in fr-CA format', N(ft.title) === N(febFr.title) && N(ft.title) === 'Versement de février 2027' && JSON.stringify(ft.r.map(N)) === JSON.stringify(febFr.r.map(N)) && N(ft.r[3]) === '5 600,00 $', { t: ft.title, r: ft.r });
  const elision = [];
  for (const id of ['2027-04', '2027-08', '2027-10']) {
    await go(page, `#/payments/${id}`);
    elision.push(N((await detailValues(page)).title));
  }
  check('fr: month titles elide before a vowel (d’avril, d’août, d’octobre)', JSON.stringify(elision) === JSON.stringify(['Versement d’avril 2027', 'Versement d’août 2027', 'Versement d’octobre 2027']), elision);
  await go(page, '#/payments/2027-02');
  const elidedTerms = await page.evaluate(() => [...document.querySelectorAll('#view .term')].filter((b) => {
    const prev = b.previousSibling;
    return prev && prev.nodeType === 3 && /[’']$/.test(prev.textContent);
  }).map((b) => `${b.previousSibling.textContent.slice(-12)}|${b.textContent}`));
  check('fr: no elided word split from a glossary term (e.g. “d’ / intérêts”)', elidedTerms.length === 0, elidedTerms);
  const startLabel = await page.evaluate(() => (document.querySelector('#pay-data-balance tbody th') || {}).textContent || '');
  check('fr: first-of-month date written “1er novembre 2026”', /^1er novembre 2026/.test(N(startLabel)), startLabel);
  check('fr: difference uses "de plus"', /\+80,00 \$ de plus/.test(N(ft.diff)), ft.diff);
  const frText = await viewText(page);
  check('fr: key values present (11 920 $, 4 800 $, 31 janvier 2032)', [ef.relief, ef.extra, ef.revMaturity].every((x) => frText.includes(N(x))), [ef.relief, ef.extra, ef.revMaturity]);
  check('fr: no forbidden framing (remise de dette/sans intérêt/congé/économie)', !/remise|sans intérêt|congé|économi/i.test(frText), (frText.match(/remise|sans intérêt|congé|économi/i) || [])[0]);
  check('fr: chart month control names in French', /^Avril 2027 : versement initial 5 466,67 \$, versement révisé 5 546,67 \$, \+80,00 \$ de plus/.test(N(await page.getAttribute('[data-fid="pay-chart-2027-04"]', 'aria-label'))), await page.getAttribute('[data-fid="pay-chart-2027-04"]', 'aria-label'));
  check('fr: balance end labels in French', (await page.locator('.pay-chart-host--balance .pay-svg-endlabel').allTextContents()).some((x) => /Révisé.*remboursé en janv/.test(x)));
  const frCsv = await page.evaluate(() => window.BDCNotice.payments.csv('selection-6'));
  check('fr: CSV localized labels, same machine numbers', frCsv.content.includes('Numéro de l’avis,DEMO-BDC-CHANGE-2026-001') && frCsv.content.includes('Statut,Démonstration fictive – ni une offre ni une entente de BDC') && frCsv.content.includes('Date du versement,Initial – Capital au début') && frCsv.content.includes('2026-11-30,240000.00,4000.00,1600.00,5600.00'), frCsv.content.slice(0, 400));
  const mk = await missingKeys(page);
  check('fr: no missing dictionary keys', mk.length === 0, mk);
  await page.locator('[data-fid="pay-chart-2026-11"]').click();
  await wait(page, 350);
  check('fr: chart selection works in French, focus kept', (await hash(page)) === '#/payments/2026-11' && (await activeFid(page)) === 'pay-chart-2026-11');

  check('desktop: no console errors', consoleMsgs.length === 0, consoleMsgs.slice(0, 5));
  check('desktop: no unexpected network requests', requests.filter((u) => !u.startsWith('https://accessibilityserver.org/')).length === 0, requests);
  await context.close();
}

/* ======================= 1024 px: layout, journey, resize ======================= */
{
  const { page, consoleMsgs, context } = await newPage(browser, { width: 1024, height: 800 });
  await gotoApp(page, '#/payments', file);
  const overlaps = async () => page.evaluate(() => {
    const host = document.querySelector('.pay-chart-host');
    const boxes = [...host.querySelectorAll('.pay-svg-total')].map((t) => t.getBoundingClientRect());
    let n = 0;
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) n += 1;
      }
    }
    return { layout: host.dataset.layout, labels: boxes.length, overlaps: n };
  });
  for (const l of ['en-CA', 'fr-CA']) {
    await page.evaluate((x) => window.BDCNotice.i18n.setLocale(x), l);
    await wait(page, 300);
    const o = await overlaps();
    check(`1024 ${l}: paired-column chart with 12 non-overlapping direct labels`, o.layout === 'wide' && o.labels === 12 && o.overlaps === 0, o);
  }
  await page.evaluate(() => window.BDCNotice.i18n.setLocale('en-CA'));
  await wait(page, 300);

  // AC-06 journey: cash-flow card -> month -> formal clause -> Back returns to the same month card with state intact
  await go(page, '#/overview');
  await page.evaluate(() => window.BDCNotice.ui.goWithReturn('#/payments/relief', { kind: 'summary', id: 'relief' }, 'summary-relief-detail'));
  await wait(page, 600);
  await page.locator('[data-fid="pay-month-2026-12"]').click();
  await wait(page, 400);
  check('journey: December selected from the three-month list', (await hash(page)) === '#/payments/2026-12' && (await checkedRange(page)) === '3' && (await activeFid(page)) === 'pay-month-2026-12');
  await page.locator('[data-fid="notice-schedule-from-month-2026-12"]').click();
  await wait(page, 400);
  check('journey: notice link opens the schedule clause route', (await hash(page)) === '#/documents/schedule', await hash(page));
  await page.evaluate(() => window.BDCNotice.router.back());
  await wait(page, 500);
  check('journey: Back returns to December with the filter and focus intact', (await hash(page)) === '#/payments/2026-12' && (await checkedRange(page)) === '3' && (await activeFid(page)) === 'notice-schedule-from-month-2026-12' && (await detailValues(page)).month === '2026-12', { h: await hash(page), r: await checkedRange(page), f: await activeFid(page) });

  // A resize that redraws the chart keeps keyboard focus on the same month control
  await page.locator('[data-fid="pay-chart-2027-01"]').focus();
  await page.setViewportSize({ width: 1180, height: 800 });
  await wait(page, 400);
  check('resize: chart redraw keeps focus on the month control', (await activeFid(page)) === 'pay-chart-2027-01', await activeFid(page));
  check('1024: no console errors', consoleMsgs.length === 0, consoleMsgs.slice(0, 5));
  await context.close();
}

/* ======================= narrow widths ======================= */
{
  const { page, consoleMsgs, context } = await newPage(browser, { width: 390, height: 844 });
  await gotoApp(page, '#/payments', file);
  const n = await page.evaluate(() => ({
    layout: document.querySelector('.pay-chart-host').dataset.layout,
    rows: document.querySelectorAll('.pay-chart-host .pay-hit--row').length,
    svgW: document.querySelector('.pay-chart-host svg').getAttribute('width'),
    hostW: document.querySelector('.pay-chart-host').clientWidth,
  }));
  check('390: payment chart switches to the horizontal month-row layout', n.layout === 'narrow' && n.rows === 6 && Number(n.svgW) === n.hostW, n);
  await page.locator('.pay-chart-host [data-fid="pay-chart-2027-02"]').click();
  await wait(page, 350);
  check('390: tapping a month row selects it, focus kept', (await hash(page)) === '#/payments/2027-02' && (await activeFid(page)) === 'pay-chart-2027-02');
  await page.locator('[data-fid="pay-data-toggle-payments"]').click();
  await wait(page, 150);
  const dvn = await page.evaluate(() => ({
    cards: document.querySelectorAll('#pay-data-payments .pay-dv-card').length,
    cardsShown: getComputedStyle(document.querySelector('#pay-data-payments .pay-dv-cards')).display !== 'none',
    tableHidden: getComputedStyle(document.querySelector('#pay-data-payments .pay-dv-table')).display === 'none',
  }));
  check('390: data view renders stacked month cards, not a table', dvn.cards === 6 && dvn.cardsShown && dvn.tableHidden, dvn);
  const order = await page.evaluate(() => {
    const list = document.querySelector('.pay-list-col').getBoundingClientRect();
    const det = document.querySelector('.pay-detail').getBoundingClientRect();
    return det.top >= list.bottom - 1;
  });
  check('390: detail panel directly after the list (single column)', order);

  const bad = [];
  await page.setViewportSize({ width: 320, height: 720 });
  for (const l of ['en-CA', 'fr-CA']) {
    await page.evaluate((x) => window.BDCNotice.i18n.setLocale(x), l);
    for (const r of ['payments', 'payments/2026-12', 'payments/relief', 'payments/cost', 'payments/schedule', 'payments/2031-12']) {
      await go(page, `#/${r}`);
      await page.evaluate(() => document.querySelectorAll('.pay-data-toggle[aria-expanded="false"]').forEach((b) => b.click()));
      await wait(page, 120);
      const of = await overflowReport(page);
      if (of.overflow || of.offenders.length) bad.push(`${l} #/${r}: ${of.scrollWidth}/${of.clientWidth} ${JSON.stringify(of.offenders.slice(0, 2))}`);
    }
  }
  check('320: no horizontal overflow (en + fr, data views open)', bad.length === 0, bad);
  const narrowLayout = await page.evaluate(() => document.querySelector('.pay-chart-host').dataset.layout);
  check('320: narrow chart layout', narrowLayout === 'narrow');
  check('narrow: no console errors', consoleMsgs.length === 0, consoleMsgs.slice(0, 5));
  await context.close();
}

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\n✓ payments module checks passed');
process.exit(failed ? 1 : 0);
