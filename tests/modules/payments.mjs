#!/usr/bin/env node
// Payments & impact module QA: range filter (keyboard radios, totals, grouped
// years remembered), paired payment chart (wide/narrow layouts, mouse and
// keyboard month selection, focus kept on the control), selected-month detail
// (both schedules, why it differs, Explain/Ask/notice actions, close), range
// switching for out-of-range months, special routes (relief, cost, schedule),
// separate infographics with record values, balance chart + data views, CSV
// exports (content, filenames, events), fr-CA, 320px reflow, honest wording.
// Recipient view: no demo / fictional / illustrative / local-generation wording
// in the view, its aria-labels, the dictionaries or the CSV files (both locales).
// QA fixes covered: R-20 (approved range totals vs labelled sums, per-schedule year
// counts), R-22 (unsigned amount + direction word), R-23/R-38 (one exporter for the full
// schedules, aligned selection CSV labels), R-33 (fr-CA spacing), R-36 (fr wording),
// R-45 (forced colours: selected range and chart parts use system colours).
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
// Same patterns as the build's recipient gate (tools/build.mjs RECIPIENT_BANNED), plus the old demo ids.
const RECIPIENT_BANNED = [
  /\b(?:demos?|démos?|démonstrations?|demonstrations?|fictional|fictives?|fictifs?|synthetic|synthétiques?|illustrative|illustratifs?|illustrations?|illustrated|illustrée?s?|prototypes?|conceptuelle|concept|presenter|présentat(?:eur|rice|ion))\b/i,
  /this example|cet exemple|sample notice|avis type|not a BDC offer|non une offre de BDC|not connected to BDC|aucun lien avec les systèmes|no live AI|aucune connexion à une IA|nothing (?:is|was|has been) sent|rien n.a été envoyé|n.est (?:envoyé|transmis)|\blocally\b|\blocalement\b|in this browser|dans ce navigateur|\bDEMO-/i,
];
const bannedHits = (text) => RECIPIENT_BANNED.map((re) => (String(text).match(re) || [])[0]).filter(Boolean);
// Visible text plus the accessible names a screen reader announces (chart controls, SVG titles).
const recipientText = (page) => page.evaluate(() => {
  const root = document.getElementById('view');
  const attrs = [...root.querySelectorAll('[aria-label], [title], [alt], [aria-description]')]
    .flatMap((el) => ['aria-label', 'title', 'alt', 'aria-description'].map((a) => el.getAttribute(a)).filter(Boolean));
  const svgTitles = [...root.querySelectorAll('svg title, svg desc')].map((x) => x.textContent);
  return `${root.innerText}\n${attrs.join('\n')}\n${svgTitles.join('\n')}`;
});
const recordIds = (page) => page.evaluate(() => ({ notice: window.BDCNotice.record.noticeId, loan: window.BDCNotice.record.loan.id, version: window.BDCNotice.record.recordVersion }));
// Scan the payments routes (data views open) in the active locale; returns "route: hit" strings.
async function scanRoutes(page) {
  const out = [];
  for (const r of ['payments', 'payments/2027-02', 'payments/relief', 'payments/cost', 'payments/schedule', 'payments/2031-12']) {
    await go(page, `#/${r}`);
    await page.evaluate(() => document.querySelectorAll('.pay-data-toggle[aria-expanded="false"]').forEach((b) => b.click()));
    await wait(page, 120);
    bannedHits(await recipientText(page)).forEach((hit) => out.push(`#/${r}: ${hit}`));
  }
  return out;
}
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
    reliefAmt: A.fmt.money(D.nearTermPaymentReductionCents),
    origInt: w(D.originalTotalInterestCents),
    revInt: w(D.revisedTotalInterestCents),
    origTotal: w(D.originalTotalPaymentsCents),
    revTotal: w(D.revisedTotalPaymentsCents),
    origTotalCents: m(D.originalTotalPaymentsCents),
    revTotalCents: m(D.revisedTotalPaymentsCents),
    lifetimeAmt: A.fmt.money(D.additionalLifetimeInterestCents),
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
  return { o: f(c.original), r: f(c.revised), diff: A.fmt.money(Math.abs(c.differenceCents)), title: title.charAt(0).toLocaleUpperCase(A.i18n.locale) + title.slice(1) };
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
      cadNote: (v.querySelector('.pay-cad-note') || {}).textContent || '',
      cad: window.BDCNotice.i18n.t('common.amountsInCAD'),
      summary: (v.querySelector('.pay-summary') || {}).textContent || '',
      terms: [...new Set([...v.querySelectorAll('.term[data-term]')].map((b) => b.dataset.term))],
      infos: [...v.querySelectorAll('.pay-info')].map((x) => x.id),
      text: v.innerText,
    };
  });
  check('en: exactly one h1 (section header)', s.h1 === 1 && /month by month/i.test(s.h1Text), s);
  check('en: currency note shown ("Amounts in Canadian dollars.")', N(s.cadNote) === N(s.cad) && s.cad === 'Amounts in Canadian dollars.', s.cadNote);
  const ids = await recordIds(page);
  check('record identifiers are the issued ones (no DEMO- prefix)', ids.notice && ids.loan && !/^DEMO-/i.test(ids.notice) && !/^DEMO-/i.test(ids.loan), ids);
  const dl0 = N(await page.locator('.pay-downloads').innerText());
  check('en: downloads intro describes the files plainly', dl0.includes('Download the months shown or a full schedule. In the CSV files, amounts are plain numbers in Canadian dollars, ready for a spreadsheet.'), dl0);
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
  const totals3 = N(await page.locator('.pay-totals-wrap').innerText());
  check('en: 3-month totals are the approved record values 16,720.00 vs 4,800.00, $11,920.00 lower', totals3.includes(N(e.origNear)) && totals3.includes(N(e.revNear)) && totals3.includes(`${N(e.reliefAmt)} lower`) && !totals3.includes('−') && (await page.getAttribute('.pay-totals-wrap', 'data-source')) === 'record' && /^Total payments for the months shown: First three months/.test(totals3), totals3);
  const card0 = N(await page.locator('[data-fid="pay-month-2026-11"]').innerText());
  check('en: month card labels Original / Revised / Difference as amount + word, no minus sign (R-22)', /Original/.test(card0) && /Revised/.test(card0) && /Difference \$4,000\.00 lower/.test(card0) && !card0.includes('−'), card0);
  // R-20: the six-month selection has no approved total, so it is a clearly labelled sum with an explanation
  await page.locator('label[for="pay-range-6"]').click();
  await wait(page);
  const totals6 = N(await page.locator('.pay-totals-wrap').innerText());
  check('en: 6-month block is labelled as a sum of the payments shown, not an approved total (R-20)', (await page.getAttribute('.pay-totals-wrap', 'data-source')) === 'sum' && /^Sum of the payments shown: First six months/.test(totals6) && /Difference between the sums \$11,680\.00 lower/.test(totals6) && /not a figure from your notice/.test(totals6), totals6);
  check('en: 6-month note explains why the sum differs from the $11,920 relief (Feb–Apr higher)', totals6.includes(`From February 2027 to April 2027, principal payments have resumed and each revised payment is higher than the original, so this difference is smaller than the ${N(e.relief)} of lower payments from November 2026 to January 2027.`), totals6);
  check('en: 6-month totals list is described by its note', (await page.getAttribute('.pay-totals', 'aria-describedby')) === 'pay-totals-note' && await page.locator('#pay-totals-note').count() === 1);

  await page.locator('label[for="pay-range-all"]').click();
  await wait(page);
  const yearsInfo = await page.evaluate(() => [...document.querySelectorAll('.pay-year-btn')].map((b) => [b.getAttribute('data-fid'), b.getAttribute('aria-expanded')]));
  check('en: full term groups by year, only the first year open', yearsInfo.length === e.years.length && yearsInfo.filter(([, x]) => x === 'true').length === 1 && yearsInfo[0][1] === 'true', yearsInfo);
  check('en: full term shows 2 cards by default (never 63 expanded)', (await visibleCards(page)).length === 2, (await visibleCards(page)).length);
  const totalsAll = N(await page.locator('.pay-totals-wrap').innerText());
  check('en: full-term totals are the approved record values 288,800 (60 payments) vs 293,600 (63 payments), $4,800.00 higher', (await page.getAttribute('.pay-totals-wrap', 'data-source')) === 'record' && totalsAll.includes(`${N(e.origTotalCents)} 60 payments`) && totalsAll.includes(`${N(e.revTotalCents)} 63 payments`) && totalsAll.includes(`Difference ${N(e.lifetimeAmt)} higher`) && !/[−+]/.test(totalsAll), totalsAll);
  await page.locator('[data-fid="pay-year-2027"]').click();
  await wait(page, 150);
  check('en: opening 2027 shows its 12 months', (await visibleCards(page)).length === 14);
  const yearHead = N(await page.locator('[data-fid="pay-year-2027"]').innerText());
  check('en: year header labels each schedule\'s payment count and the sum of its payments', yearHead === '2027 Original: 12 payments totalling $64,800.00 Revised: 12 payments totalling $61,733.33', yearHead);
  const y2031 = N(await page.locator('[data-fid="pay-year-2031"]').innerText());
  check('en: 2031 header gives the original schedule its own count (10 payments, not "12 months") (R-20)', y2031 === '2031 Original: 10 payments totalling $41,466.67 Revised: 12 payments totalling $50,400.00' && !/months/.test(y2031), y2031);
  const lastYearHead = N(await page.locator(`[data-fid="pay-year-${e.years[e.years.length - 1]}"]`).innerText());
  check('en: final year header says "Original: no payments" and "Revised: 1 payment of …"', lastYearHead === '2032 Original: no payments Revised: 1 payment of $4,026.67', lastYearHead);
  check('en: year hint says the amounts are sums of each schedule\'s payments', /sum of its payments in that year/.test(await page.locator('.pay-years-hint').innerText()));
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
  check('en: month controls have full accessible names, difference as amount + word (R-22)', /^November 2026: original payment \$5,600\.00, revised payment \$1,600\.00, \$4,000\.00 lower\. Show the breakdown\.$/.test(chart.buttons[0][1]) && chart.buttons.every((b) => !/[−+]\$/.test(b[1])), chart.buttons[0][1]);
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
  check('en: detail shows the difference as amount + word, no minus sign', /^Difference in total payment\s*/.test(N(dec.diff)) && N(dec.diff).endsWith(`${N(decExp.diff)} lower`) && !dec.diff.includes('−'), dec.diff);
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
  check('en: added month shows "no payment" for the original schedule', ext.text.includes(e.noPayment) && ext.o.every((x) => /^—/.test(N(x))) && /Added month/.test(ext.text) && /fully repaid on October\s31, 2031/.test(ext.why), ext);
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
  check('en: balance data view lists key dates incl. "Repaid"', /November\s1, 2026/.test(bdv) && /Repaid/.test(bdv) && /January\s31, 2032/.test(bdv) && (await page.locator('#pay-data-balance tbody tr').count()) === 9, bdv);

  // CSV builders (R-23/R-38: the full schedules come from the notice exporter when present;
  // the selection CSV and the fallback use the same labels, status wording, BOM and CRLF)
  const csvs = await page.evaluate(() => Object.fromEntries(window.BDCNotice.payments.CSV_KINDS.map((kd) => [kd, window.BDCNotice.payments.csv(kd)])));
  const lines = (c) => c.content.replace(/^﻿/, '').split('\r\n');
  const dated = (c) => lines(c).filter((r) => /^\d{4}-\d{2}-\d{2},/.test(r));
  const last = (c) => c.content.trim().split(/\r\n/).pop();
  const viaNotice = await page.evaluate(() => {
    const A = window.BDCNotice;
    if (!A.notice || typeof A.notice.csv !== 'function') return null;
    const notice = { revised: A.notice.csv('revised'), original: A.notice.csv('original') };
    const keep = A.notice;
    delete A.notice; // exercise the local fallback builder
    const fallback = { revised: A.payments.csv('revised-full'), original: A.payments.csv('original-full') };
    A.notice = keep;
    return { notice, fallback };
  });
  const rv = csvs['revised-full'];
  const ov = csvs['original-full'];
  check('en: revised CSV filename matches the notice tab (notice id + locale)', rv.filename === `${ids.notice}_revised-schedule_en-CA.csv` && ov.filename === `${ids.notice}_original-schedule_en-CA.csv`, [rv.filename, ov.filename]);
  if (viaNotice) {
    check('en: full revised/original CSVs are exactly the notice exporter\'s files (R-23)', rv.content === viaNotice.notice.revised.content && rv.filename === viaNotice.notice.revised.filename && ov.content === viaNotice.notice.original.content && ov.filename === viaNotice.notice.original.filename);
    check('en: local fallback builder reproduces the notice exporter byte for byte', viaNotice.fallback.revised.content === viaNotice.notice.revised.content && viaNotice.fallback.revised.filename === viaNotice.notice.revised.filename && viaNotice.fallback.original.content === viaNotice.notice.original.content, [viaNotice.fallback.revised.content.slice(0, 300), viaNotice.notice.revised.content.slice(0, 300)]);
  } else {
    console.log('  (notice module not in this build: checking the local fallback only)');
  }
  check('en: CSV starts with UTF-8 BOM and the notice metadata labels/status', rv.content.startsWith(`﻿Notice,${ids.notice}\r\nRecord version,${ids.version}\r\nStatus,Approved and completed\r\nLoan,${ids.loan}\r\n`) && lines(rv).includes(`Source,"BDC notice ${ids.notice}, record version ${ids.version}"`), rv.content.slice(0, 300));
  const metaLabels = (c) => lines(c).slice(0, lines(c).indexOf('')).map((row) => row.split(',')[0]);
  check('en: CSV metadata block is the 11 shared labels, no disclaimer line', JSON.stringify(metaLabels(rv)) === JSON.stringify(['Notice', 'Record version', 'Status', 'Loan', 'Company', 'Schedule', 'Issue date', 'Effective date', 'Currency', 'Number of payments', 'Source']), metaLabels(rv));
  const csvHits = Object.entries(csvs).flatMap(([kd, c]) => bannedHits(c.content).concat(bannedHits(c.filename)).map((hit) => `${kd}: ${hit}`));
  check('en: no demo/fictional/illustrative/local wording in any CSV (5 kinds)', csvHits.length === 0, csvHits);
  if (viaNotice) {
    const fbHits = [...bannedHits(viaNotice.fallback.revised.content), ...bannedHits(viaNotice.fallback.original.content)];
    check('en: fallback CSV builder has no demo/fictional/illustrative/local wording', fbHits.length === 0, fbHits);
  }
  check('en: CSV uses CRLF line endings only', !/[^\r]\n/.test(rv.content) && !/[^\r]\n/.test(csvs['selection-6'].content));
  check('en: CSV has a blank row then localized header', /\r\n\r\nPayment date,Payment number,Opening principal,Principal,Interest,Total payment,Closing principal\r\n/.test(rv.content));
  check('en: revised CSV has 63 dated rows, machine decimals', dated(rv).length === 63 && dated(rv)[0] === '2026-11-30,1,240000.00,0.00,1600.00,1600.00,240000.00' && !rv.content.includes('560000'), dated(rv)[0]);
  check('en: revised CSV totals row (240,000 / 53,600 / 293,600)', last(rv) === 'Totals,,,240000.00,53600.00,293600.00,', last(rv));
  check('en: original CSV 60 rows, totals 48,800 / 288,800', dated(ov).length === 60 && last(ov) === 'Totals,,,240000.00,48800.00,288800.00,', [dated(ov).length, last(ov)]);
  const s3 = csvs['selection-3'];
  // Shared metadata rows carry the same labels (and values) as the notice exporter's file
  const meta = (c) => lines(c).slice(0, lines(c).indexOf(''));
  const ms = meta(s3);
  const mr = meta(rv);
  check('en: selection CSV metadata uses the notice labels (Notice, Record version, Status, Loan, …, Source)', ms.length === mr.length && ms.every((row, i) => (i === 5 || i === 9 ? row.split(',')[0] === (i === 5 ? 'Schedule' : 'Number of months') : row === mr[i])) && ms[5] === 'Schedule,Original and revised payments compared – First three months' && ms[9] === 'Number of months,3', { ms, mr });
  check('en: selection-3 CSV compares both schedules with difference', dated(s3).length === 3 && dated(s3)[0] === '2026-11-30,240000.00,4000.00,1600.00,5600.00,236000.00,240000.00,0.00,1600.00,1600.00,240000.00,-4000.00', dated(s3)[0]);
  check('en: selection-3 totals are the approved values (16,720 vs 4,800; −11,920)', last(s3) === 'Totals,,12000.00,4720.00,16720.00,,,0.00,4800.00,4800.00,,-11920.00', last(s3));
  const s6 = csvs['selection-6'];
  check('en: selection-6 totals row is labelled as a sum of the rows above (R-20)', last(s6) === 'Sum of the rows above,,24000.00,9200.00,33200.00,,,12000.00,9520.00,21520.00,,-11680.00', last(s6));
  const sa = csvs['selection-all'];
  check('en: selection-all 63 rows, original blank after Oct 2031, approved totals +4,800', dated(sa).length === 63 && dated(sa)[62].startsWith('2032-01-31,,,,,,4000.00,') && last(sa) === 'Totals,,240000.00,48800.00,288800.00,,,240000.00,53600.00,293600.00,,4800.00' && sa.filename === `${ids.notice}_selection-full-term_en-CA.csv`, [dated(sa)[62], last(sa), sa.filename]);
  check('en: selection-6 filename', s6.filename === `${ids.notice}_selection-first-6-months_en-CA.csv`, s6.filename);

  // Downloads through the UI + events
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-fid="pay-dl-revised"]').click()]);
  const dlText = readFileSync(await dl.path(), 'utf8');
  check('en: "Download full revised schedule (CSV)" downloads the same file as the notice tab', dl.suggestedFilename() === `${ids.notice}_revised-schedule_en-CA.csv` && dlText.split(/\r?\n/).filter((r) => /^\d{4}-\d{2}-\d{2}/.test(r)).length === 63 && (!viaNotice || dlText.replace(/^﻿/, '') === viaNotice.notice.revised.content.replace(/^﻿/, '')), dl.suggestedFilename());
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.locator('[data-fid="pay-dl-selection"]').click()]);
  check('en: "Download displayed selection" follows the current range', dl2.suggestedFilename() === `${ids.notice}_selection-full-term_en-CA.csv`, dl2.suggestedFilename());
  const [dl3] = await Promise.all([page.waitForEvent('download'), page.locator('[data-fid="pay-dl-original"]').click()]);
  check('en: "Download full original schedule" works', dl3.suggestedFilename() === `${ids.notice}_original-schedule_en-CA.csv`, dl3.suggestedFilename());
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
  check('fr: difference is amount + "de plus", no plus sign (R-22)', /^Écart du versement total\s*80,00 \$ de plus$/.test(N(ft.diff)), ft.diff);
  const frText = await viewText(page);
  check('fr: key values present (11 920 $, 4 800 $, 31 janvier 2032)', [ef.relief, ef.extra, ef.revMaturity].every((x) => frText.includes(N(x))), [ef.relief, ef.extra, ef.revMaturity]);
  check('fr: no forbidden framing (remise de dette/sans intérêt/congé/économie)', !/remise|sans intérêt|congé|économi/i.test(frText), (frText.match(/remise|sans intérêt|congé|économi/i) || [])[0]);
  check('fr: chart month control names in French, amount + word, no-break space before « : »', /^Avril 2027\u00a0: versement initial 5 466,67 \$, versement révisé 5 546,67 \$, 80,00 \$ de plus\./.test((await page.getAttribute('[data-fid="pay-chart-2027-04"]', 'aria-label')).replace(/[\u202f]/g, ' ').replace(/(\d)\u00a0(\d)/g, '$1 $2').replace(/\u00a0\$/g, ' $')), await page.getAttribute('[data-fid="pay-chart-2027-04"]', 'aria-label'));
  check('fr: balance end labels in French', (await page.locator('.pay-chart-host--balance .pay-svg-endlabel').allTextContents()).some((x) => /Révisé.*remboursé en janv/.test(x)));
  const frCsv = await page.evaluate(() => {
    const A = window.BDCNotice;
    return { s3: A.payments.csv('selection-3'), s6: A.payments.csv('selection-6'), rv: A.payments.csv('revised-full'), notice: A.notice && A.notice.csv ? A.notice.csv('revised') : null };
  });
  const frLines = (c) => c.content.replace(/^﻿/, '').split('\r\n');
  check('fr: selection CSV uses the notice labels and status (Avis, Version du dossier, État, Prêt, Source) (R-38)', [`Avis,${ids.notice}`, `Version du dossier,${ids.version}`, 'État,Approuvée et effectuée', `Prêt,${ids.loan}`, `Source,"Avis de BDC ${ids.notice}, version du dossier ${ids.version}"`].every((row) => frLines(frCsv.s6).includes(row)) && !/Statut|Création|Numéro de l’avis/.test(frCsv.s6.content), frCsv.s6.content.slice(0, 500));
  const frCsvHits = Object.entries(frCsv).filter(([, c]) => c).flatMap(([kd, c]) => bannedHits(c.content).map((hit) => `${kd}: ${hit}`));
  check('fr: no demo/fictional/illustrative/local wording in the French CSV files', frCsvHits.length === 0, frCsvHits);
  check('fr: CSV header and machine numbers', frCsv.s6.content.includes('Date du versement,Initial – Capital au début') && frCsv.s6.content.includes('2026-11-30,240000.00,4000.00,1600.00,5600.00') && frCsv.s6.filename.endsWith('_fr-CA.csv'), frCsv.s6.filename);
  check('fr: totals rows « Totaux » (approved) and « Somme des lignes ci-dessus » (six months)', frLines(frCsv.s3).filter(Boolean).pop().startsWith('Totaux,') && frLines(frCsv.s6).filter(Boolean).pop().startsWith('Somme des lignes ci-dessus,'), [frLines(frCsv.s3).filter(Boolean).pop(), frLines(frCsv.s6).filter(Boolean).pop()]);
  check('fr: full revised CSV is the notice tab\'s French file', frCsv.rv.filename === `${ids.notice}_revised-schedule_fr-CA.csv` && (!frCsv.notice || frCsv.rv.content === frCsv.notice.content) && frLines(frCsv.rv).filter(Boolean).pop().startsWith('Totaux,'), frCsv.rv.filename);
  // R-36: a schedule is not repaid; the loan is
  await go(page, '#/payments/2031-12');
  const frAdded = N((await detailValues(page)).why);
  check('fr: « Selon le calendrier initial, le prêt était entièrement remboursé… » (R-36)', frAdded.includes('Selon le calendrier initial, le prêt était entièrement remboursé le 31 octobre 2031.') && !/calendrier initial (était|est) (entièrement )?remboursé/.test(frAdded), frAdded);
  const frBal = N(await page.locator('.pay-balance-card .pay-text-summary').innerText());
  check('fr: balance summary says the loan is repaid under each schedule (R-36)', frBal.includes('Selon le calendrier initial, le prêt est entièrement remboursé le 31 octobre 2031; selon le calendrier révisé, le 31 janvier 2032.') && !/calendrier initial est remboursé/.test(frBal), frBal);
  // R-33: Canadian French spacing in the whole payments namespace
  const frSpacing = await page.evaluate(() => {
    const bad = [];
    (function walk(v, path) {
      if (typeof v === 'string') { if (/ [:;?!»]|« | [;?!]/.test(v)) bad.push(`${path}: ${v.slice(0, 50)}`); } else if (v && typeof v === 'object') Object.keys(v).forEach((key) => walk(v[key], `${path}.${key}`));
    }(window.BDCNotice.i18n.tv('payments'), 'payments'));
    return bad;
  });
  check('fr: no ordinary space before « : » or inside « », none before ; ? ! (R-33)', frSpacing.length === 0, frSpacing);
  const frYears = await page.evaluate(() => [...document.querySelectorAll('.pay-year-btn')].map((b) => b.innerText.replace(/\s+/g, ' ').trim()));
  check('fr: year headers « Initial : 10 versements totalisant … » with per-schedule counts', frYears.includes('2031 Initial : 10 versements totalisant 41 466,67 $ Révisé : 12 versements totalisant 50 400,00 $') && frYears.includes('2032 Initial : aucun versement Révisé : 1 versement de 4 026,67 $'), frYears);
  await go(page, '#/payments/2027-02');
  const mk = await missingKeys(page);
  check('fr: no missing dictionary keys', mk.length === 0, mk);
  await page.locator('[data-fid="pay-chart-2026-11"]').click();
  await wait(page, 350);
  check('fr: chart selection works in French, focus kept', (await hash(page)) === '#/payments/2026-11' && (await activeFid(page)) === 'pay-chart-2026-11');
  check('fr: downloads intro describes the files plainly', N(await page.locator('.pay-downloads').innerText()).includes('Téléchargez les mois affichés ou un calendrier complet. Dans les fichiers CSV, les montants sont des nombres simples en dollars canadiens, prêts pour un tableur.'));

  // Recipient view: no demo / fictional / illustrative / local wording on any payments route,
  // in visible text, aria-labels or chart titles, nor in either dictionary.
  const frScan = await scanRoutes(page);
  check('fr: recipient view — no demo/fictional/illustrative/local wording on payments routes (text + aria)', frScan.length === 0, frScan);
  await page.evaluate(() => window.BDCNotice.i18n.setLocale('en-CA'));
  await wait(page, 300);
  const enScan = await scanRoutes(page);
  check('en: recipient view — no demo/fictional/illustrative/local wording on payments routes (text + aria)', enScan.length === 0, enScan);
  const dictBad = await page.evaluate(() => {
    const out = [];
    for (const l of ['en-CA', 'fr-CA']) {
      (function walk(v, path) {
        if (typeof v === 'string') out.push([path, v]);
        else if (v && typeof v === 'object') Object.keys(v).forEach((key) => walk(v[key], `${path}.${key}`));
      }(window.BDCNotice.i18n._dicts[l].payments, `${l}.payments`));
    }
    return out;
  });
  const dictHits = dictBad.filter(([, v]) => bannedHits(v).length).map(([path, v]) => `${path}: ${bannedHits(v)[0]}`);
  check('payments dictionaries (en-CA + fr-CA) have no demo/fictional/illustrative/local wording', dictHits.length === 0, dictHits);

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

/* ======================= forced colours (R-45) ======================= */
{
  const { page, consoleMsgs, context } = await newPage(browser, { width: 1280, height: 900 });
  await page.emulateMedia({ forcedColors: 'active', colorScheme: 'dark' });
  await gotoApp(page, '#/payments/2026-12', file);
  const fc = await page.evaluate(() => {
    const probe = document.createElement('div');
    document.body.appendChild(probe);
    const sys = (c) => { probe.style.color = c; return getComputedStyle(probe).color; };
    const S = { canvas: sys('Canvas'), text: sys('CanvasText'), highlight: sys('Highlight'), gray: sys('GrayText') };
    probe.remove();
    const cs = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el) : null; };
    const checked = cs('input[name="pay-range"]:checked + label');
    const unchecked = cs('input[name="pay-range"]:not(:checked) + label');
    return {
      S,
      checkedBg: checked.backgroundColor,
      uncheckedBg: unchecked.backgroundColor,
      month: cs('.pay-chart-host .pay-svg-month:not(.is-selected)').fill,
      monthSel: cs('.pay-chart-host .pay-svg-month.is-selected').fill,
      total: cs('.pay-chart-host .pay-svg-total').fill,
      tick: cs('.pay-chart-host .pay-svg-tick').fill,
      revP: cs('.pay-chart-host .pay-seg--ri').fill,
      revLine: cs('.pay-chart-host--balance .pay-svg-line--r').stroke,
      endLabel: cs('.pay-chart-host--balance .pay-svg-endlabel').fill,
      hbarR: cs('.pay-hbar--r').backgroundColor,
      hbarX: cs('.pay-hbar--x').backgroundColor,
    };
  });
  check('forced colours: selected range shows Highlight, unlike the other options', fc.checkedBg === fc.S.highlight && fc.uncheckedBg !== fc.checkedBg, fc);
  check('forced colours: chart month, total and axis labels use CanvasText; selected month Highlight', [fc.month, fc.total, fc.tick, fc.endLabel].every((x) => x === fc.S.text) && fc.monthSel === fc.S.highlight, fc);
  check('forced colours: bars and lines use system colours (not invisible navy)', fc.revP === fc.S.gray && fc.revLine === fc.S.text && fc.hbarR === fc.S.text && fc.hbarX === fc.S.highlight, fc);
  check('forced colours: no console errors', consoleMsgs.length === 0, consoleMsgs.slice(0, 5));
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
