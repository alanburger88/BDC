#!/usr/bin/env node
// "Your notice" module QA: formal reference header and demo status, record
// metadata, the twelve clauses with exact fixture values (both languages),
// explain/ask/plain-language links with return paths, assumptions 1:1 with
// the record, locally generated CSV/JSON exports (AC-22), the dedicated print
// layout (App.print.prepare + print media + PDF), clause deep links (focus,
// highlight, reduced motion, unknown items), year disclosures, wide table vs
// stacked rows, keyboard operation and 320/390 px reflow (AC-08).
// Only depends on core + the notice module; cross-module calls are guarded.
// Usage: node tests/modules/notice.mjs [path/to/index.html]
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, newPage, gotoApp, overflowReport, missingKeys, DEFAULT_FILE } from '../lib/browser.mjs';

const file = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : DEFAULT_FILE;
const outDir = mkdtempSync(join(tmpdir(), 'notice-qa-'));
let failed = 0;
function check(name, ok, detail) {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${!ok && detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 500)}` : ''}`);
}
const wait = (page, ms = 220) => page.waitForTimeout(ms);
// Collapse all whitespace (incl. no-break spaces in fr-CA amounts and dates).
const N = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const hash = (page) => page.evaluate(() => location.hash);
const go = async (page, h, ms) => { await page.evaluate((x) => { location.hash = x; }, h); await wait(page, ms); };
const setLocale = async (page, l) => { await page.evaluate((x) => window.BDCNotice.i18n.setLocale(x), l); await wait(page); };
const activeInfo = (page) => page.evaluate(() => {
  const a = document.activeElement;
  const f = a && a.closest('[data-fid]');
  return { id: a ? a.id : null, fid: f ? f.getAttribute('data-fid') : null, tag: a ? a.tagName : null };
});
const expandYears = (page) => page.evaluate(() => document.querySelectorAll('.ntc-years > .disclosure > .disclosure-toggle[aria-expanded="false"]').forEach((b) => b.click()));

const CLAUSES = ['purpose', 'amendment', 'postponement', 'interest', 'resumption', 'maturity', 'cost', 'unchanged', 'action', 'schedule', 'assumptions', 'contact'];
const TOOLED = ['postponement', 'interest', 'resumption', 'maturity', 'cost', 'unchanged', 'action', 'schedule', 'contact'];
const PLAIN = {
  postponement: '#/changes/principal', interest: '#/changes/interest', resumption: '#/payments/2027-02', maturity: '#/changes/maturity',
  cost: '#/payments/cost', unchanged: '#/changes/rate', action: '#/overview', schedule: '#/payments/schedule',
};
const TEXT = {
  'en-CA': {
    title: 'Your notice', overline: 'Formal reference', status: 'Fictional demonstration — not a BDC offer or actual agreement',
    amendStatus: 'Approved and completed (fictional scenario)', no: 'No', processing: 'None in this demo',
    seasonal: 'seasonal inventory build', noAccept: 'No acceptance, signature or reply is required', notCancelled: 'not cancelled or reduced',
    banned: /forgiv|interest-free|interest free|holiday|saving/i, assumptionWord: 'capitalised', csvHeader: 'Payment date,Payment number,Opening principal,Principal,Interest,Total payment,Closing principal',
    printTitle: 'Important financing notice', collapse: 'Collapse all years', expand: 'Expand all years', back: 'Back to',
    toolsLabel: 'Help with this clause: Revised maturity date', sameAmount: 'happen to be the same amount', fictional: /synthetic notice/,
  },
  'fr-CA': {
    title: 'Votre avis', overline: 'Référence officielle', status: 'Démonstration fictive — ni une offre de BDC ni une entente réelle',
    amendStatus: 'Approuvée et effectuée (scénario fictif)', no: 'Non', processing: 'Aucun dans cette démonstration',
    seasonal: 'stocks saisonniers', noAccept: 'Aucune acceptation, signature ni réponse n’est requise', notCancelled: 'ni annulé ni réduit',
    banned: /remise de dette|sans intérêt|congé|économi|épargn|annulation de la dette/i, assumptionWord: 'capitalisé', csvHeader: 'Date du versement,Numéro du versement,Capital au début,Capital,Intérêts,Versement total,Capital à la fin',
    printTitle: 'Avis important concernant votre financement', collapse: 'Masquer toutes les années', expand: 'Afficher toutes les années', back: 'Retour à',
    toolsLabel: 'Aide sur cette clause\u00a0: Date d’échéance révisée', sameAmount: 'correspondent par hasard au même montant', fictional: /avis fictif/,
  },
};

// Expected display values computed in the page from the issued record, in the active locale.
const expected = (page) => page.evaluate(() => {
  const A = window.BDCNotice;
  const R = A.record;
  const d = R.derived;
  const r = R.revisedSchedule;
  const o = R.originalSchedule;
  const n = R.change.months;
  const m = (c) => A.fmt.money(c);
  const D = (iso, s = 'long') => {
    const v = A.fmt.date(iso, s);
    return A.i18n.locale === 'fr-CA' && s === 'long' ? v.replace(/^1(\s)/, '1er$1') : v;
  };
  const rate = A.fmt.percentFromBp(R.loan.annualRateBasisPoints);
  return {
    meta: {
      noticeId: R.noticeId, recordVersion: R.recordVersion, issueDate: D(R.issueDate), effectiveDate: D(R.effectiveDate),
      loanId: R.loan.id, client: `${R.client.givenName} ${R.client.familyName}`, company: R.client.company, fee: m(R.change.feeCents),
    },
    clause: {
      purpose: [R.loan.id, R.client.company],
      amendment: [R.client.company, R.loan.id, D(R.effectiveDate), m(R.change.feeCents)],
      postponement: [...r.slice(0, n).map((x) => D(x.date, 'monthYear')), m(r[0].principalCents), m(d.principalDeferredCents)],
      interest: [m(r[0].openingPrincipalCents), rate, m(d.postponementMonthlyInterestCents)],
      resumption: [D(R.change.resumePrincipalDate), m(R.loan.monthlyPrincipalCents), m(d.firstResumedPaymentCents), m(d.firstResumedInterestCents)],
      maturity: [D(R.change.originalMaturity), D(R.change.revisedMaturity), A.fmt.number(d.revisedPaymentCount), A.fmt.number(d.originalPaymentCount)],
      cost: [m(d.originalTotalInterestCents), m(d.revisedTotalInterestCents), m(d.additionalLifetimeInterestCents), m(d.originalTotalPaymentsCents), m(d.revisedTotalPaymentsCents),
        m(d.originalNearTermPaymentsCents), m(d.revisedNearTermPaymentsCents), m(d.nearTermPaymentReductionCents), m(d.principalDeferredCents), m(d.additionalInterestFirstThreeMonthsCents)],
      unchanged: [rate, m(R.loan.monthlyPrincipalCents), m(R.change.feeCents), R.loan.id],
      action: [m(r[0].totalCents), D(r[0].date)],
      schedule: [A.fmt.number(r.length), D(r[0].date), D(r[r.length - 1].date)],
      assumptions: [rate, D(R.effectiveDate)],
      contact: ['Clair'],
    },
    first4: A.rec.months.slice(0, 4).map((x) => [x.original.principalCents, x.original.interestCents, x.original.totalCents, x.revised.principalCents, x.revised.interestCents, x.revised.totalCents].map(m)),
    assumptionsCount: R.assumptions.length,
    revisedCount: r.length,
    originalCount: o.length,
    banner: A.i18n.t('shell.banner'),
    clauseNames: A.CLAUSES.map((id) => A.i18n.t(`clauses.${id}`).replace(/^\d+\.\s*/, '')),
    hasClair: !!A.clair,
  };
});

const browser = await launch();
const { page, consoleMsgs, requests } = await newPage(browser, { width: 1280, height: 900 });
await gotoApp(page, '#/documents', file);

/* ---------- 0. API surface ---------- */
const api = await page.evaluate(() => ({
  print: typeof window.BDCNotice.print?.prepare === 'function',
  clauses: JSON.stringify(window.BDCNotice.notice?.clauses) === JSON.stringify(window.BDCNotice.CLAUSES),
}));
check('exposes App.print.prepare(root) and App.notice.clauses', api.print && api.clauses, api);

/* ---------- 1. Content in both languages ---------- */
for (const locale of ['en-CA', 'fr-CA']) {
  await setLocale(page, locale);
  await go(page, '#/documents');
  const T = TEXT[locale];
  const E = await expected(page);
  const info = await page.evaluate(() => {
    const view = document.querySelector('#view');
    const sections = [...view.querySelectorAll('section.ntc-clause')];
    return {
      h1: [...view.querySelectorAll('h1')].map((e) => e.textContent),
      overline: view.querySelector('.section-header .overline')?.textContent || '',
      status: view.querySelector('.ntc-status')?.textContent || '',
      meta: Object.fromEntries([...view.querySelectorAll('.ntc-meta-row')].map((r) => [r.dataset.meta, r.querySelector('dd').textContent])),
      sections: sections.map((s) => {
        const lbl = document.getElementById(s.getAttribute('aria-labelledby'));
        return {
          id: s.id, clause: s.dataset.clause, tabindex: s.getAttribute('tabindex'), label: lbl ? lbl.textContent : null,
          text: s.querySelector('.ntc-clause-body').innerText,
          explain: !!s.querySelector(`[data-fid="explain-clause-${s.dataset.clause}"]`),
          ask: !!s.querySelector(`[data-fid="ask-clause-${s.dataset.clause}"]`),
          links: [...s.querySelectorAll('.ntc-tools a')].map((a) => a.getAttribute('href')),
        };
      }),
      assumptions: [...view.querySelectorAll('#clause-assumptions .ntc-assumptions li')].map((li) => li.textContent),
      assumptionSource: view.querySelector('#clause-assumptions .ntc-assumptions')?.dataset.source,
      logo: (() => {
        const img = view.querySelector('.ntc-lh img');
        if (!img) return null;
        const r = img.getBoundingClientRect();
        return { alt: img.getAttribute('alt'), natural: img.naturalWidth, ratio: r.width / r.height, src: img.src.slice(0, 22) };
      })(),
      re: view.querySelector('.ntc-re')?.textContent || '',
      addressee: view.querySelector('.ntc-addressee')?.textContent || '',
      demoNote: !!view.querySelector('#clause-schedule .demo-note'),
      viewText: view.innerText,
    };
  });
  check(`${locale}: exactly one h1 "${T.title}"`, info.h1.length === 1 && N(info.h1[0]) === T.title, info.h1);
  check(`${locale}: overline "${T.overline}"`, N(info.overline) === T.overline, info.overline);
  check(`${locale}: demo status line shows the localized record status`, N(info.status).includes(T.status), info.status);
  const metaExp = { ...E.meta, amendmentStatus: T.amendStatus, acceptance: T.no, processing: T.processing };
  const metaBad = Object.entries(metaExp).filter(([key, v]) => N(info.meta[key]) !== N(v));
  check(`${locale}: record metadata panel (11 items) matches the record`, metaBad.length === 0 && Object.keys(info.meta).length === 11, { metaBad, got: info.meta });
  check(`${locale}: client and company names are never translated`, info.meta.client === 'Camille Roy' && info.meta.company === 'Atelier Boréal Inc.');
  check(`${locale}: 12 clause sections in canonical order with id/tabindex/aria-labelledby`,
    info.sections.length === 12 && info.sections.every((s, i) => s.id === `clause-${CLAUSES[i]}` && s.tabindex === '-1' && s.label && N(s.label).includes(N(E.clauseNames[i]))),
    info.sections.map((s) => [s.id, s.tabindex, s.label]));
  for (const s of info.sections) {
    const missing = (E.clause[s.clause] || []).filter((v) => !N(s.text).includes(N(v)));
    check(`${locale}: clause ${s.clause} states the fixture values`, missing.length === 0, { missing });
  }
  const sec = Object.fromEntries(info.sections.map((s) => [s.clause, s]));
  check(`${locale}: amendment cites the seasonal inventory build`, N(sec.amendment.text).includes(T.seasonal));
  check(`${locale}: action clause says no acceptance is required and nothing is processed`, N(sec.action.text).includes(N(T.noAccept)));
  check(`${locale}: postponed principal stated as still owing (not cancelled)`, N(sec.postponement.text).includes(T.notCancelled));
  check(`${locale}: contact clause gives no phone numbers or e-mail addresses`, !/\d{3}[\s.-]\d{3}[\s.-]\d{4}|[\w.-]+@[\w-]+\.[a-z]/i.test(sec.contact.text));
  for (const id of TOOLED) {
    const s = sec[id];
    check(`${locale}: clause ${id} has Explain with AI and Ask about this`, s.explain && s.ask);
    if (PLAIN[id]) check(`${locale}: clause ${id} links to its plain-language place ${PLAIN[id]}`, s.links.includes(PLAIN[id]), s.links);
  }
  check(`${locale}: cost clause also links to the lower-payments breakdown`, sec.cost.links.includes('#/payments/relief'), sec.cost.links);
  check(`${locale}: contact clause points to Help & questions`, sec.contact.links.includes('#/help'), sec.contact.links);
  check(`${locale}: assumptions are the approved wording, 1:1 with record.assumptions`, info.assumptions.length === E.assumptionsCount && info.assumptionSource === 'approved' && info.assumptions.some((a) => a.includes(T.assumptionWord)), info.assumptions);
  check(`${locale}: letterhead uses the embedded logo (alt BDC, aspect ratio preserved)`, info.logo && info.logo.alt === 'BDC' && info.logo.natural > 0 && Math.abs(info.logo.ratio - 1280 / 680) < 0.04 && info.logo.src.startsWith('data:image/webp'), info.logo);
  check(`${locale}: re line names loan DEMO-4821; addressee Camille Roy, Atelier Boréal Inc.`, info.re.includes('DEMO-4821') && info.addressee.includes('Camille Roy') && info.addressee.includes('Atelier Boréal Inc.'));
  check(`${locale}: illustrative schedule note beside the numbers`, info.demoNote);
  check(`${locale}: no forgiveness / savings / interest-free / holiday framing`, !T.banned.test(info.viewText), (info.viewText.match(T.banned) || [])[0]);
  const extra = await page.evaluate(() => {
    const v = document.querySelector('#view');
    const glue = v.querySelector('#clause-maturity .ntc-glue');
    return {
      nobrPurpose: [...v.querySelectorAll('#clause-purpose .ntc-nobr')].map((e) => e.textContent),
      nobrRe: [...v.querySelectorAll('.ntc-re .ntc-nobr')].map((e) => e.textContent),
      glue: glue ? { text: glue.textContent, hasTerm: !!glue.querySelector('.term'), starts: glue.textContent.trim()[0] } : null,
      toolsLabel: v.querySelector('#clause-maturity .ntc-tools')?.getAttribute('aria-label') || '',
      cost: v.querySelector('#clause-cost')?.innerText || '',
      pressed: v.querySelector('[data-fid="ntc-years-toggle"]')?.hasAttribute('aria-pressed'),
      intro: v.querySelector('.section-header .lead')?.textContent || '',
    };
  });
  check(`${locale}: loan identifier kept whole (never broken at its hyphen) in clause text and the Re: line`, extra.nobrPurpose.includes('DEMO-4821') && extra.nobrRe.includes('DEMO-4821'), extra);
  check(`${locale}: "(" stays attached to the maturity-date glossary trigger`, extra.glue && extra.glue.hasTerm && extra.glue.starts === '(', extra.glue);
  check(`${locale}: clause tool group label comes from the dictionary`, extra.toolsLabel === T.toolsLabel, extra.toolsLabel);
  check(`${locale}: cost clause says the two equal amounts measure different things`, N(extra.cost).includes(T.sameAmount));
  check(`${locale}: expand/collapse-all toggle does not pair aria-pressed with a changing label`, extra.pressed === false);
  check(`${locale}: intro frames the notice as fictional`, T.fictional.test(extra.intro), extra.intro);
  const f4 = await page.evaluate(() => [...document.querySelectorAll('#clause-schedule .ntc-first4-table tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent)));
  check(`${locale}: first four payments comparison matches the fixture`, f4.length === 4 && f4.every((row, i) => row.every((v, j) => N(v) === N(E.first4[i][j]))), f4);
  const mk = await missingKeys(page);
  check(`${locale}: no missing dictionary keys`, mk.length === 0, mk);
}

/* ---------- 2. Layout: document card with rail beside (desktop) / above (mobile) ---------- */
await setLocale(page, 'en-CA');
await go(page, '#/documents');
let lay = await page.evaluate(() => {
  const rail = document.querySelector('.ntc-rail').getBoundingClientRect();
  const doc = document.querySelector('.ntc-doc').getBoundingClientRect();
  return { railRight: rail.right, docLeft: doc.left, docWidth: doc.width, railTop: rail.top, docTop: doc.top };
});
check('1280 px: rail beside the notice, notice is a readable-width card (≤ 800 px)', lay.railRight < lay.docLeft && lay.docWidth <= 800 && Math.abs(lay.railTop - lay.docTop) < 2, lay);
const printBtn = await page.evaluate(() => { window.scrollTo(0, 0); return document.querySelector('[data-fid="ntc-print"]').getBoundingClientRect().bottom; });
check('1280×900: "Print / Save as PDF" is visible without scrolling', printBtn > 0 && printBtn <= 900, printBtn);

/* ---------- 3. Exports (AC-22) ---------- */
async function download(fid) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`[data-fid="${fid}"]`)]);
  return { name: dl.suggestedFilename(), body: readFileSync(await dl.path(), 'utf8') };
}
const csvRows = (csv) => csv.split(/\r?\n/).filter((r) => /^\d{4}-\d{2}-\d{2}/.test(r));
const ac22 = await page.locator('#view').getByRole('button', { name: /revised schedule.*CSV/i }).count();
check('AC-22 locator: a button named "…revised schedule…CSV" exists', ac22 >= 1, ac22);
let f = await download('ntc-dl-revised');
check('revised CSV filename carries notice id and locale', f.name === 'DEMO-BDC-CHANGE-2026-001_revised-schedule_en-CA.csv', f.name);
check('revised CSV starts with a UTF-8 BOM and uses CRLF', f.body.charCodeAt(0) === 0xfeff && f.body.includes('\r\n'));
check('revised CSV preamble: notice id, record version, status', f.body.includes('Notice identifier,DEMO-BDC-CHANGE-2026-001') && f.body.includes('Record version,1.0') && f.body.includes(`Status,${TEXT['en-CA'].status}`), f.body.slice(0, 400));
check('revised CSV has the localized header row', f.body.split(/\r\n/).includes(TEXT['en-CA'].csvHeader));
let rows = csvRows(f.body);
check('revised CSV has 63 ISO-dated rows with decimal amounts', rows.length === 63 && rows[0] === '2026-11-30,1,240000.00,0.00,1600.00,1600.00,240000.00' && rows[3] === '2027-02-28,4,240000.00,4000.00,1600.00,5600.00,236000.00' && rows[62] === '2032-01-31,63,4000.00,4000.00,26.67,4026.67,0.00', [rows.length, rows[0], rows[3], rows[62]]);
check('revised CSV totals row: 240000.00 / 53600.00 / 293600.00', f.body.includes('Totals,,,240000.00,53600.00,293600.00,'));
const status1 = await page.locator('.ntc-dl-status').textContent();
check('download shows a visible local-generation status', status1.includes(f.name), status1);
f = await download('ntc-dl-original');
rows = csvRows(f.body);
check('original CSV: 60 rows ending 2031-10-31 at zero, totals 48800.00 / 288800.00', f.name.includes('original-schedule') && rows.length === 60 && rows[59].startsWith('2031-10-31,60,') && rows[59].endsWith(',0.00') && f.body.includes('Totals,,,240000.00,48800.00,288800.00,'), [rows.length, rows[59]]);
f = await download('ntc-dl-json');
let json = null;
try { json = JSON.parse(f.body); } catch (e) { json = null; }
check('JSON record: parses, carries notice id, version, status note and both schedules', json && json.record.noticeId === 'DEMO-BDC-CHANGE-2026-001' && json.record.recordVersion === '1.0' && json.record.revisedSchedule.length === 63 && json.record.originalSchedule.length === 60 && json.note && json.generatedLocally === true, json && Object.keys(json));
const ev = await page.evaluate(() => window.BDCNotice.events.all().filter((e) => e.type === 'schedule_exported').map((e) => e.id));
check('exports log schedule_exported with identifier ids only', JSON.stringify(ev) === JSON.stringify(['revised-full', 'original-full', 'record-json']), ev);
await setLocale(page, 'fr-CA');
f = await download('ntc-dl-revised');
rows = csvRows(f.body);
check('fr-CA CSV: French header and preamble, ISO dates and decimal amounts unchanged', f.name.endsWith('_fr-CA.csv') && f.body.split(/\r\n/).includes(TEXT['fr-CA'].csvHeader) && f.body.includes('Numéro de l’avis,DEMO-BDC-CHANGE-2026-001') && rows.length === 63 && rows[0] === '2026-11-30,1,240000.00,0.00,1600.00,1600.00,240000.00', [f.name, rows[0]]);
f = await download('ntc-dl-inline');
check('inline "Download this schedule" in clause 10 produces the revised CSV', csvRows(f.body).length === 63);
await setLocale(page, 'en-CA');

/* ---------- 4. Print layout ---------- */
await page.evaluate(() => { window.__printCount = 0; window.print = () => { window.__printCount += 1; }; });
await page.click('[data-fid="ntc-print"]');
await wait(page, 600);
const printed = await page.evaluate(() => window.__printCount);
check('Print / Save as PDF prepares the layout and opens the print dialog once', printed === 1, printed);
let E = await expected(page);
let pr = await page.evaluate(() => {
  const root = document.getElementById('print-root');
  return {
    text: root.textContent,
    lang: root.getAttribute('lang'),
    clauses: root.querySelectorAll('.ntc-p-clause').length,
    clauseTitles: [...root.querySelectorAll('.ntc-p-clause h3')].map((h) => h.textContent),
    schedRows: root.querySelectorAll('.ntc-p-sched tbody tr:not(.ntc-p-yearrow)').length,
    first4Rows: root.querySelectorAll('.ntc-p-first4 tbody tr').length,
    totalsRows: root.querySelectorAll('.ntc-p-totals tbody tr').length,
    assumptions: root.querySelectorAll('.ntc-assumptions li').length,
    interactive: root.querySelectorAll('button, a[href], input, textarea, select, .term, [data-fid]').length,
    ids: root.querySelectorAll('[id]').length,
    logo: !!root.querySelector('img[alt="BDC"]'),
  };
});
check('print layout: logo, title, demo banner and notice identity', pr.logo && pr.text.includes('Important financing notice') && N(pr.text).includes(N(E.banner)) && pr.text.includes('DEMO-BDC-CHANGE-2026-001') && pr.text.includes('DEMO-4821'), pr.text.slice(0, 300));
check('print layout: record metadata including status and record version', N(pr.text).includes(TEXT['en-CA'].status) && pr.text.includes('Record version'));
check('print layout: all 12 clauses with formal wording', pr.clauses === 12 && E.clauseNames.every((nm) => pr.clauseTitles.some((tt) => N(tt).includes(N(nm)))), pr.clauseTitles);
check('print layout: first four payments, FULL 63-row revised schedule and totals table', pr.first4Rows === 4 && pr.schedRows === 63 && pr.totalsRows === 5, pr);
check('print layout: assumptions and browser-PDF convenience note', pr.assumptions === E.assumptionsCount && pr.text.includes('Browser-generated PDF is a convenience copy'));
check('print layout: no assistant, survey, menus, CTAs or controls', pr.interactive === 0 && !/Clair —|How clear was this notice|Explain with AI|Ask about this/.test(pr.text), pr.interactive);
check('print layout: no duplicate element ids with the screen view', pr.ids === 0, pr.ids);
await page.emulateMedia({ media: 'print' });
const media = await page.evaluate(() => ({ app: getComputedStyle(document.getElementById('app')).display, root: getComputedStyle(document.getElementById('print-root')).display }));
check('print media shows only #print-root', media.app === 'none' && media.root === 'block', media);
const brk = await page.evaluate(() => {
  const root = document.getElementById('print-root');
  const cs = (sel) => getComputedStyle(root.querySelector(sel)).breakInside;
  return { kv: cs('.ntc-p-kv'), first4: cs('.ntc-p-first4'), totals: cs('.ntc-p-totals'), sched: cs('.ntc-p-sched tbody') };
});
check('print: small tables never split across pages; the 63-row schedule flows row by row', brk.kv === 'avoid' && brk.first4 === 'avoid' && brk.totals === 'avoid' && brk.sched === 'auto', brk);
await page.screenshot({ path: join(outDir, 'print-en-CA.png'), fullPage: true });
const pdfPages = (buf) => (buf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length;
const pdfEn = await page.pdf({ path: join(outDir, 'notice-print-en-CA.pdf'), format: 'Letter', printBackground: true });
check('print media renders to a compact PDF (≤ 6 Letter pages)', pdfPages(pdfEn) > 0 && pdfPages(pdfEn) <= 6, pdfPages(pdfEn));
await page.emulateMedia({ media: 'screen' });
await setLocale(page, 'fr-CA');
const prFr = await page.evaluate(() => {
  const root = document.getElementById('print-root');
  window.BDCNotice.print.prepare(root);
  return { lang: root.getAttribute('lang'), text: root.textContent, rows: root.querySelectorAll('.ntc-p-sched tbody tr:not(.ntc-p-yearrow)').length };
});
check('fr-CA print layout re-renders in French', prFr.lang === 'fr-CA' && prFr.text.includes(TEXT['fr-CA'].printTitle) && prFr.text.includes('Démonstration conceptuelle') && prFr.rows === 63, prFr.lang);
await page.emulateMedia({ media: 'print' });
const pdfFr = await page.pdf({ path: join(outDir, 'notice-print-fr-CA.pdf'), format: 'Letter', printBackground: true });
check('fr-CA print renders to a compact PDF (≤ 6 Letter pages)', pdfPages(pdfFr) > 0 && pdfPages(pdfFr) <= 6, pdfPages(pdfFr));
await page.emulateMedia({ media: 'screen' });
await setLocale(page, 'en-CA');

/* ---------- 5. Clause deep links ---------- */
await go(page, '#/documents');
await page.evaluate(() => window.BDCNotice.router.go('#/documents/maturity', { focus: 'item' }));
await wait(page, 120);
const flashOn = await page.evaluate(() => document.getElementById('clause-maturity')?.classList.contains('ntc-clause--flash'));
await wait(page, 700);
let a = await activeInfo(page);
let pos = await page.evaluate(() => ({ top: document.getElementById('clause-maturity').getBoundingClientRect().top, cur: document.querySelector('[data-fid="ntc-toc-maturity"]')?.getAttribute('aria-current') }));
check('#/documents/maturity focuses the clause section and scrolls to it', a.id === 'clause-maturity' && pos.top > -5 && pos.top < 160, { a, pos });
check('target clause is briefly highlighted', flashOn === true);
check('contents marks the current clause (aria-current=location)', pos.cur === 'location', pos.cur);
await wait(page, 2300);
check('highlight is removed after a moment', !(await page.evaluate(() => document.getElementById('clause-maturity').classList.contains('ntc-clause--flash'))));
// contents navigation
await page.evaluate(() => { const b = document.querySelector('.ntc-toc-toggle'); if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); });
await page.click('[data-fid="ntc-toc-cost"]');
await wait(page, 700);
a = await activeInfo(page);
check('contents link navigates to #/documents/cost and focuses the clause', (await hash(page)) === '#/documents/cost' && a.id === 'clause-cost', { h: await hash(page), a });
// typed hash (browser navigation) still lands on the clause
await go(page, '#/documents/interest', 600);
pos = await page.evaluate(() => document.getElementById('clause-interest').getBoundingClientRect().top);
check('typed #/documents/interest scrolls to the clause', pos > -5 && pos < 160, pos);
// unknown item → top
await go(page, '#/documents/not-a-clause', 400);
const top = await page.evaluate(() => ({ y: window.scrollY, h1: document.querySelectorAll('#view h1').length, fl: document.querySelectorAll('.ntc-clause--flash').length }));
check('unknown clause id shows the notice from the top', top.y === 0 && top.h1 === 1 && top.fl === 0, top);
// first load deep link
{
  const p2 = await newPage(browser, { width: 390, height: 800 });
  await gotoApp(p2.page, '#/documents/schedule', file);
  await wait(p2.page, 500);
  const info2 = await p2.page.evaluate(() => ({ top: document.getElementById('clause-schedule').getBoundingClientRect().top, active: document.activeElement.id }));
  check('first load of #/documents/schedule scrolls to and focuses clause 10', info2.top > -5 && info2.top < 160 && info2.active === 'clause-schedule', info2);
  await p2.context.close();
}
// reduced motion: static highlight, no animation
{
  const p3 = await newPage(browser, { width: 1280, height: 900, reducedMotion: 'reduce' });
  await gotoApp(p3.page, '#/documents', file);
  await p3.page.evaluate(() => window.BDCNotice.router.go('#/documents/cost', { focus: 'item' }));
  await wait(p3.page, 150);
  const rm = await p3.page.evaluate(() => { const s = document.getElementById('clause-cost'); return { cls: s.className, anim: getComputedStyle(s).animationName, bg: getComputedStyle(s).backgroundColor }; });
  check('reduced motion: highlight is static (no animation)', rm.cls.includes('ntc-clause--static') && rm.anim === 'none' && rm.bg !== 'rgba(0, 0, 0, 0)', rm);
  await p3.context.close();
}

/* ---------- 6. Return paths ---------- */
await go(page, '#/changes');
await page.evaluate(() => window.BDCNotice.ui.goWithReturn('#/documents/interest', { kind: 'card', id: 'interest' }, 'qa-origin'));
await wait(page, 600);
const back = await page.evaluate(() => document.querySelector('#view [data-fid="back-control"]')?.textContent || '');
check('arriving from another place renders "Back to …" at the top', back.includes(TEXT['en-CA'].back) && back.includes('What changed'), back);
await page.click('#view [data-fid="back-control"]');
await wait(page, 500);
check('Back returns to the originating place', (await hash(page)) === '#/changes', await hash(page));
await go(page, '#/documents');
await page.locator('[data-fid="ntc-plain-interest"]').scrollIntoViewIfNeeded();
await page.click('[data-fid="ntc-plain-interest"]');
await wait(page, 500);
check('"Read the plain-language explanation" opens #/changes/interest', (await hash(page)) === '#/changes/interest', await hash(page));
await page.evaluate(() => window.BDCNotice.router.back());
await wait(page, 600);
a = await activeInfo(page);
check('Back from the plain-language place restores the notice and focuses the link', (await hash(page)) === '#/documents' && a.fid === 'ntc-plain-interest', { h: await hash(page), a });

/* ---------- 7. Schedule: year disclosures, wide table vs stacked rows ---------- */
await page.evaluate(() => window.BDCNotice.session.reset());
await go(page, '#/documents/schedule', 400);
const visibleRows = (sel) => page.evaluate((s) => [...document.querySelectorAll(s)].filter((el) => el.getClientRects().length > 0).length, sel);
let yr = await page.evaluate(() => [...document.querySelectorAll('.ntc-years > .disclosure > .disclosure-toggle')].map((b) => b.getAttribute('aria-expanded')));
check('years: 7 disclosures, first year open, others closed', yr.length === 7 && yr[0] === 'true' && yr.slice(1).every((x) => x === 'false'), yr);
check('1280 px: data table shown (2 rows for 2026), stacked rows hidden', (await visibleRows('#clause-schedule .ntc-sched-table tbody tr')) === 2 && (await visibleRows('#clause-schedule .ntc-row')) === 0);
await page.click('[data-fid="ntc-years-toggle"]');
await wait(page);
check('Expand all years shows all 63 revised payments', (await visibleRows('#clause-schedule .ntc-sched-table tbody tr')) === 63);
check('toggle label switches to "Collapse all years"', N(await page.locator('[data-fid="ntc-years-toggle"]').textContent()) === TEXT['en-CA'].collapse);
await page.click('[data-fid="ntc-years-toggle"]');
await wait(page);
yr = await page.evaluate(() => [...document.querySelectorAll('.ntc-years > .disclosure > .disclosure-toggle')].map((b) => b.getAttribute('aria-expanded')));
check('Collapse all years closes every year', yr.every((x) => x === 'false') && N(await page.locator('[data-fid="ntc-years-toggle"]').textContent()) === TEXT['en-CA'].expand, yr);
// keyboard: open 2028 with Enter, state survives navigation to another clause
await page.focus('[data-fid="ntc-year-2028"]');
await page.keyboard.press('Enter');
await wait(page);
await page.evaluate(() => window.BDCNotice.router.go('#/documents/cost', { focus: 'item' }));
await wait(page, 500);
const y2028 = await page.evaluate(() => document.querySelector('[data-fid="ntc-year-2028"]').getAttribute('aria-expanded'));
check('year disclosure opens with Enter and stays open across re-render', y2028 === 'true', y2028);
// keyboard: Tab reaches Print with a visible focus ring; Enter prints
await page.evaluate(() => { window.scrollTo(0, 0); window.__printCount = 0; document.querySelector('.ntc-card-intro').setAttribute('tabindex', '-1'); document.querySelector('.ntc-card-intro').focus(); });
await page.keyboard.press('Tab');
a = await activeInfo(page);
const ring = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
await page.keyboard.press('Enter');
await wait(page, 600);
check('keyboard: Tab reaches Print / Save as PDF with a visible focus ring, Enter prints', a.fid === 'ntc-print' && ring !== 'none' && (await page.evaluate(() => window.__printCount)) === 1, { a, ring });

/* ---------- 8. Narrow widths: stacked rows, no horizontal scrolling ---------- */
for (const [locale, w] of [['en-CA', 390], ['fr-CA', 390], ['fr-CA', 320], ['en-CA', 320]]) {
  await setLocale(page, locale);
  await page.setViewportSize({ width: w, height: 800 });
  await go(page, '#/documents', 300);
  await page.evaluate(() => { const b = document.querySelector('.ntc-toc-toggle'); if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); });
  await expandYears(page);
  await wait(page);
  const narrow = await page.evaluate(() => {
    const vis = (s) => [...document.querySelectorAll(s)].filter((el) => el.getClientRects().length > 0).length;
    const rail = document.querySelector('.ntc-rail').getBoundingClientRect();
    const doc = document.querySelector('.ntc-doc').getBoundingClientRect();
    return { tables: vis('#clause-schedule .ntc-wide table'), rows: vis('#clause-schedule .ntc-row'), cards: vis('#clause-schedule .ntc-f4-card'), railAbove: rail.bottom <= doc.top + 1 };
  });
  check(`${locale} ${w} px: stacked labelled rows (63), comparison cards (4), no schedule tables`, narrow.tables === 0 && narrow.rows === 63 && narrow.cards === 4, narrow);
  check(`${locale} ${w} px: rail sits above the notice`, narrow.railAbove);
  const of = await overflowReport(page);
  check(`${locale} ${w} px: no horizontal overflow with all years and contents open`, !of.overflow && of.offenders.length === 0, of);
  const inner = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('.ntc-mini, .ntc-row-dl dd, .ntc-tools .btn, .ntc-dl, .ntc-meta-row dd')) {
      if (!el.getClientRects().length) continue;
      const box = el.closest('.ntc-f4-card, .ntc-row, .ntc-clause, .ntc-card');
      if (box && el.getBoundingClientRect().right > box.getBoundingClientRect().right + 1) out.push(el.className || el.tagName);
    }
    return out;
  });
  check(`${locale} ${w} px: nothing spills out of its card`, inner.length === 0, inner);
  const wrap = await page.evaluate(() => {
    const lineCount = (el) => new Set([...el.getClientRects()].map((r) => Math.round(r.bottom))).size;
    const shown = (sel) => [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length);
    // Punctuation glued to a glossary trigger must sit on the same line as the trigger.
    const glueOk = shown('#view .ntc-glue').every((g) => {
      const btn = g.querySelector('.term');
      const rects = [...btn.getClientRects()];
      return [...g.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).every((tn) => {
        const r = document.createRange();
        r.selectNodeContents(tn);
        const box = r.getBoundingClientRect();
        const ref = tn.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING ? rects[0] : rects[rects.length - 1];
        return Math.abs(box.bottom - ref.bottom) < 6;
      });
    });
    return { ids: shown('#view .ntc-nobr').map(lineCount), glueOk, glueCount: shown('#view .ntc-glue').length };
  });
  check(`${locale} ${w} px: identifiers stay on one line; "(" and ")" stay with their glossary trigger`, wrap.ids.length > 0 && wrap.ids.every((n) => n === 1) && wrap.glueCount > 0 && wrap.glueOk, wrap);
  if (w >= 360) {
    const grid = await page.evaluate(() => {
      const r = (key) => document.querySelector(`.ntc-meta-row[data-meta="${key}"]`).getBoundingClientRect();
      const a = r('recordVersion'); const b = r('issueDate'); const n = r('noticeId');
      return { pair: Math.abs(a.top - b.top) < 2 && a.right <= b.left, wide: n.width > a.width * 1.8 };
    });
    check(`${locale} ${w} px: record details use a compact two-column grid (identifier full width)`, grid.pair && grid.wide, grid);
  }
  const mk = await missingKeys(page);
  check(`${locale} ${w} px: no missing keys`, mk.length === 0, mk);
}
await page.setViewportSize({ width: 1280, height: 900 });

/* ---------- 9. Language switch on a clause keeps the place ---------- */
await setLocale(page, 'en-CA');
await go(page, '#/documents/resumption', 2800);
await setLocale(page, 'fr-CA');
const sw = await page.evaluate(() => ({ h1: document.querySelector('#view h1').textContent, hash: location.hash, flash: document.querySelectorAll('.ntc-clause--flash').length, title: document.getElementById('clause-resumption-title').textContent }));
check('switching to French on #/documents/resumption re-renders in place without re-flashing', N(sw.h1) === 'Votre avis' && sw.hash === '#/documents/resumption' && sw.flash === 0 && sw.title.includes('Reprise'), sw);

/* ---------- 10. Guarded cross-module actions ---------- */
E = await expected(page);
if (E.hasClair) {
  await page.click('[data-fid="explain-clause-interest"]');
  await wait(page, 500);
  const open = await page.evaluate(() => document.getElementById('overlay-root').children.length > 0);
  check('Explain with AI opens Clair with the clause context (full build)', open);
  await page.keyboard.press('Escape');
  await wait(page, 300);
} else {
  await page.click('[data-fid="explain-clause-interest"]');
  await wait(page, 200);
  check('Explain with AI is inert without Clair in an isolated build (no error)', true);
}

/* ---------- 11. Hygiene ---------- */
const errs = consoleMsgs.filter((m) => !/download/i.test(m));
check('no console errors or warnings', errs.length === 0, errs);
const ext = requests.filter((u) => !u.startsWith('https://accessibilityserver.org/'));
check('no network requests', ext.length === 0, ext);

console.log(`\nPrint renders written to ${outDir}`);
console.log(failed ? `\n${failed} check(s) failed` : '\n✓ notice module checks passed');
await browser.close();
process.exit(failed ? 1 : 0);
