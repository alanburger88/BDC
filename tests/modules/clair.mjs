#!/usr/bin/env node
// Clair (demo assistant) module test: panel behaviour, contextual answers,
// bilingual intent engine, limits, source links, mobile layout, language
// switching, reset and network isolation.
// Usage: node tests/modules/clair.mjs [path/to/index.html] [--shots dir]
import { mkdirSync } from 'node:fs';
import { launch, newPage, gotoApp, overflowReport, missingKeys, DEFAULT_FILE } from '../lib/browser.mjs';

const args = process.argv.slice(2);
const file = args[0] && !args[0].startsWith('--') ? args[0] : DEFAULT_FILE;
const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });

const STATUS_EN = 'Demo assistant • Answers from this sample notice • No live AI connection.';
const STATUS_FR = 'Assistant de démonstration • Réponses tirées de cet avis type • Aucune connexion à une IA en direct.';
const FORBIDDEN = /forgiv|interest[- ]free|holiday|saving|remise de dette|sans int[ée]r[êe]t|cong[ée]|[ée]conomi|[ée]pargn|⟦/i;

let failures = 0;
function check(name, ok, detail) {
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${!ok && detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
}

const browser = await launch();
const { page, requests, consoleMsgs } = await newPage(browser, { width: 1280, height: 900 });
await gotoApp(page, '#/overview', file);
await page.evaluate(() => window.BDCNotice.i18n.setLocale('en-CA'));
await page.waitForTimeout(100);

const PANEL = '[data-overlay="clair"]';
const openPanel = async () => { await page.waitForSelector(`${PANEL}.is-open`); await page.waitForTimeout(320); };
const closedPanel = async () => { await page.waitForSelector(PANEL, { state: 'detached' }); await page.waitForTimeout(120); };
const lastClair = () => page.evaluate(() => {
  const els = document.querySelectorAll('.clair-log .clair-msg--clair[data-msg]');
  const el = els[els.length - 1];
  return el ? { intent: el.dataset.intent, text: el.querySelector('.clair-msg-text').textContent, lang: el.getAttribute('lang'), fact: (el.querySelector('.clair-fact-text') || {}).textContent || '', inline: el.querySelectorAll('.clair-chips--inline button').length, ask: !!el.querySelector('.clair-ask'), source: (el.querySelector('.clair-source') || {}).textContent || '' } : null;
});
const typeAsk = async (text) => {
  const before = await page.$$eval('.clair-log .clair-msg--clair[data-msg]', (els) => els.length);
  await page.fill('#clair-input', text);
  await page.press('#clair-input', 'Enter');
  await page.waitForFunction((n) => document.querySelectorAll('.clair-log .clair-msg--clair[data-msg]').length > n, before);
  return lastClair();
};

// 1. Closed on load; launcher present
check('panel is closed on initial load', (await page.$(PANEL)) === null);
check('Clair launcher is present (bottom right)', await page.evaluate(() => {
  const b = document.querySelector('.clair-launcher');
  if (!b) return false;
  const r = b.getBoundingClientRect();
  return r.right > window.innerWidth - 60 && r.bottom > window.innerHeight - 100;
}));

// 2. General open from the launcher (keyboard)
await page.focus('.clair-launcher');
await page.keyboard.press('Enter');
await openPanel();
const general = await page.evaluate(() => ({
  title: document.querySelector('[data-overlay="clair"] .overlay-title').textContent,
  status: document.querySelector('.clair-status').textContent,
  chip: document.querySelector('.clair-chip .chip-text').textContent,
  removable: !!document.querySelector('.clair-chip-remove'),
  greeting: !!document.querySelector('.clair-msg--greeting'),
  suggestions: document.querySelectorAll('.clair-suggest .clair-chip-btn').length,
  log: document.querySelector('.clair-log').getAttribute('role'),
  rect: document.querySelector('[data-overlay="clair"]').getBoundingClientRect().toJSON(),
  modal: document.querySelector('[data-overlay="clair"]').getAttribute('aria-modal'),
  inputMax: document.querySelector('#clair-input').getAttribute('maxlength'),
  label: document.querySelector('label[for="clair-input"]').textContent,
}));
check('title is "Clair — Your financing guide"', general.title === 'Clair — Your financing guide', general.title);
check('status line text is exact (EN)', general.status === STATUS_EN, general.status);
check('key disclaimer phrase is kept on one line', await page.$eval('.clair-status-key', (el) => el.textContent === 'No live AI connection.' && getComputedStyle(el).display === 'inline-block'));
check('general context chip, no remove control', general.chip === 'This notice (general question)' && !general.removable, general.chip);
check('greeting shown and 3–5 suggestions', general.greeting && general.suggestions >= 3 && general.suggestions <= 5, general.suggestions);
check('conversation uses role="log"; dialog is modal', general.log === 'log' && general.modal === 'true');
check('input has a label and maxlength ~300', general.label.length > 3 && general.inputMax === '300');
check('panel slides in on the right at 420px', Math.round(general.rect.width) === 420 && Math.round(general.rect.right) === 1280, general.rect);
check('no explain event for a general open', await page.evaluate(() => !window.BDCNotice.events.all().some((e) => e.type === 'explain_requested')));

// 3. Escape closes and focus returns to the launcher
await page.keyboard.press('Escape');
await closedPanel();
check('Escape closes the panel', (await page.$(PANEL)) === null);
check('focus returns to the launcher', await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-fid') === 'clair-launcher'));

// 4. Contextual open: the CAD 11,920 card
await page.evaluate(() => window.BDCNotice.clair.open({ kind: 'summary', id: 'relief', fid: 'x' }, document.querySelector('.clair-launcher')));
await openPanel();
const ctx = await page.evaluate(() => ({
  chip: document.querySelector('.clair-chip .chip-text').textContent,
  removable: !!document.querySelector('.clair-chip-remove'),
  user: [...document.querySelectorAll('.clair-msg--user .clair-msg-text')].map((e) => e.textContent),
  factLabel: (document.querySelector('.clair-msg--clair .clair-fact-label') || {}).textContent,
  event: window.BDCNotice.events.all().some((e) => e.type === 'explain_requested' && e.id === 'summary:relief'),
}));
const reliefAns = await lastClair();
check('context chip shows the selected item with a remove control', ctx.chip === 'Lower payments, November to January' && ctx.removable, ctx.chip);
check('user bubble "Explain: <item>" added immediately', ctx.user.includes('Explain: Lower payments, November to January'), ctx.user);
check('relief answer: $12,000 delayed, $80 more interest, net $11,920', reliefAns && reliefAns.intent === 'whyRelief' && /\$12,000/.test(reliefAns.text) && /\$80/.test(reliefAns.text) && /\$11,920/.test(reliefAns.text), reliefAns);
check('relief answer states principal remains owing', /remains owing/.test(reliefAns.text));
check('supporting fact distinguishes original vs revised', ctx.factLabel === 'Supporting fact' && /\$16,720\.00 in the original schedule/.test(reliefAns.fact) && /\$4,800\.00 in the revised schedule/.test(reliefAns.fact), reliefAns.fact);
check('source link "See in your notice: 7. Effect on interest…" (the clause that reconciles $11,920) and "Ask a person"', /^See in your notice: 7\. Effect on interest and total payments/.test(reliefAns.source) && reliefAns.ask, reliefAns.source);
check('relief source link targets #/documents/cost', await page.evaluate(() => [...document.querySelectorAll('.clair-log .clair-source')].pop().getAttribute('href') === '#/documents/cost'));
check('explain_requested logged with summary:relief', ctx.event);
await page.waitForTimeout(120);
check('new answer announced in short form', await page.evaluate(() => { const t = document.getElementById('live-polite').textContent; return t.startsWith('Clair:') && t.length <= 260; }));

// Focus containment
let trapped = true;
for (let i = 0; i < 30; i += 1) {
  await page.keyboard.press('Tab');
  if (!(await page.evaluate(() => !!document.activeElement.closest('[data-overlay="clair"]')))) { trapped = false; break; }
}
check('focus stays inside the panel while it is open', trapped);
check('visible focus indicator on focused control', await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2; }));

// 5. Typed questions in the panel (EN, with French typed while UI is English)
let a = await typeAsk('how much more will I pay');
check('typed EN paraphrase → total extra cost ($4,800 incl. $80)', a.intent === 'totalCost' && /\$4,800/.test(a.text) && /\$80/.test(a.text) && /already included/.test(a.text), a);
check('input cleared and focus kept in input after sending', await page.evaluate(() => document.activeElement.id === 'clair-input' && document.activeElement.value === ''));
await page.waitForTimeout(900);
check('newest question is scrolled into view', await page.evaluate(() => {
  const sc = document.querySelector('.clair-scroll').getBoundingClientRect();
  const users = document.querySelectorAll('.clair-log .clair-msg--user');
  const r = users[users.length - 1].getBoundingClientRect();
  return r.top >= sc.top - 1 && r.top < sc.bottom - 40;
}));
a = await typeAsk('do I still pay interest during the postponement');
await page.waitForTimeout(120);
const live = await page.evaluate(() => document.getElementById('live-polite').textContent);
check('announcement keeps decimals intact and stays short', a.intent === 'continuingInterest' && live.includes('8.00% fixed rate') && live.length < a.text.length + 10 && live.length <= 260, live);
a = await typeAsk('quand se termine le prêt');
check('French typed in English UI → maturity, answered in English', a.intent === 'maturity' && /October 31, 2031/.test(a.text) && /January 31, 2032/.test(a.text), a);
a = await typeAsk('what about december');
check('month question → December original vs revised row', a.intent === 'month' && /\$1,573\.33/.test(a.text) && /\$1,600\.00/.test(a.text), a);

// Suggestion chip (keyboard: Enter), focus stays on the suggestions
const sugg = await page.$eval('.clair-suggest .clair-chip-btn', (b) => b.dataset.suggestion);
await page.focus('.clair-suggest .clair-chip-btn');
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
a = await lastClair();
check('suggestion chip (Enter) asks its question', a.intent === sugg, `${sugg} → ${a.intent}`);
check('focus stays on a suggestion chip after it is used', await page.evaluate(() => !!document.activeElement.closest('.clair-suggest')));

// Remove context
await page.click('.clair-chip-remove');
await page.waitForTimeout(100);
check('removing the context switches to a general chip', await page.evaluate(() => document.querySelector('.clair-chip .chip-text').textContent === 'This notice (general question)' && !document.querySelector('.clair-chip-remove')));

// 6. Limits and unrelated questions
a = await typeAsk('Can you approve another postponement?');
check('approve request → limit explained + Ask a person', a.intent === 'limitApprove' && /can’t approve/.test(a.text) && a.ask, a);
a = await typeAsk('I want to change my payment');
check('change request → limit explained', a.intent === 'limitChange' && /can’t change/.test(a.text) && a.ask, a);
a = await typeAsk('Am I eligible for more funding?');
check('eligibility → cannot assess eligibility', a.intent === 'limitEligibility' && /can’t assess eligibility/.test(a.text), a);
a = await typeAsk('pay now');
check('pay now → cannot process payments', a.intent === 'limitPay' && /can’t process payments/.test(a.text), a);
a = await typeAsk("what's the weather in Montreal?");
check('unrelated → "I can only help with this sample notice." + suggestions', a.intent === 'unrelated' && /^I can only help with this sample notice\./.test(a.text) && a.inline >= 3, a);
a = await typeAsk('zzqx blorp');
check('unsupported → honest fallback with suggestions and Ask a person', a.intent === 'fallback' && /only answer questions about this sample notice/.test(a.text) && a.inline >= 3 && a.ask, a);
await page.fill('#clair-input', '   ');
await page.press('#clair-input', 'Enter');
await page.waitForTimeout(80);
check('empty question shows an inline error and adds nothing', await page.evaluate(() => !document.querySelector('.clair-error').hidden && document.querySelector('#clair-input').getAttribute('aria-invalid') === 'true'));
check('empty-question error is announced (assertive)', await page.evaluate(() => document.getElementById('live-assertive').textContent === 'Type a question first.'));
const hostile = '<img src=x onerror="window.__pwned=1">';
await typeAsk(hostile);
check('user text is rendered as text, never HTML', await page.evaluate((h) => !window.__pwned && [...document.querySelectorAll('.clair-msg--user .clair-msg-text')].some((e) => e.textContent === h) && !document.querySelector('.clair-log img'), hostile));

// R-12: a contextual open scrolls its "Explain" bubble to the top; the current-context chip
// (and its remove control) must stay visible above the conversation, not scroll away with it.
const chipInView = () => page.evaluate(() => {
  const c = document.querySelector('.clair-chip');
  const r = c.getBoundingClientRect();
  const x = document.querySelector('.clair-chip-remove');
  const xr = x ? x.getBoundingClientRect() : null;
  const hitAt = (rr) => { const el = document.elementFromPoint(rr.left + rr.width / 2, rr.top + rr.height / 2); return !!el && !!el.closest('.clair-chip'); };
  return { label: c.querySelector('.chip-text').textContent, inScroll: !!c.closest('.clair-scroll'), scrollTop: Math.round(document.querySelector('.clair-scroll').scrollTop), visible: r.top >= 0 && r.bottom <= innerHeight && hitAt(r), removeVisible: !!xr && hitAt(xr) };
});
await page.evaluate(() => window.BDCNotice.clair.open({ kind: 'month', id: '2026-12', fid: 'explain-month-2026-12' }));
await page.waitForTimeout(400);
const chipA = await chipInView();
check('R-12: context opened on a long conversation → chip "December 2026 payment" + remove control visible (not inside the scrolling log)', chipA.label === 'December 2026 payment' && chipA.visible && chipA.removeVisible && !chipA.inScroll && chipA.scrollTop > 0, chipA);
await page.evaluate(() => window.BDCNotice.clair.open({ kind: 'summary', id: 'relief' }));
await page.waitForTimeout(400);
const chipB = await chipInView();
check('R-12: a second context while open → chip updates and stays visible', chipB.label === 'Lower payments, November to January' && chipB.visible && chipB.removeVisible && !chipB.inScroll, chipB);

await page.keyboard.press('Escape');
await closedPanel();
check('Escape closes the contextual panel; focus returns to its trigger', await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-fid') === 'clair-launcher'));

// 7. Intent engine coverage (pure answer function), both languages
const engine = await page.evaluate(() => {
  const C = window.BDCNotice.clair;
  const cases = [
    ['What changed in my loan?', 'whatChanged'], ['Qu’est-ce qui change?', 'whatChanged'],
    ['When does the change take effect?', 'effectiveDate'], ['Quand la modification entre-t-elle en vigueur?', 'effectiveDate'],
    ['When is my next payment?', 'nextPayment'], ['Quand aura lieu mon prochain versement?', 'nextPayment'],
    ['Which months are postponed?', 'postponementPeriod'], ['Combien de temps dure le report?', 'postponementPeriod'],
    ['What does principal mean?', 'principalMeaning'], ['C’est quoi le capital?', 'principalMeaning'],
    ['Do I still pay interest?', 'continuingInterest'], ['Est-ce que je paie encore des intérêts?', 'continuingInterest'],
    ['why not 12000', 'whyRelief'], ['pourquoi pas 12 000', 'whyRelief'],
    ['how much more will I pay', 'totalCost'], ['combien de plus', 'totalCost'],
    ['when does it end', 'maturity'], ['quand se termine le prêt', 'maturity'],
    ['When do principal payments resume?', 'resume'], ['Quand les remboursements de capital reprennent-ils?', 'resume'],
    ['Does my interest rate change?', 'rate'], ['Mon taux d’intérêt change-t-il?', 'rate'],
    ['Is there a fee?', 'fees'], ['Y a-t-il des frais?', 'fees'],
    ['Do I need to accept anything?', 'acceptance'], ['Dois-je signer quelque chose?', 'acceptance'],
    ['How do I print or export this?', 'printExport'], ['Comment télécharger le calendrier en CSV?', 'printExport'],
    ['How do I ask a person?', 'queryPrep'], ['Comment poser une question?', 'queryPrep'],
    ['What support is available?', 'support'], ['Quel soutien est offert?', 'support'],
    ['Is my debt reduced?', 'debtReduced'], ['Est-ce que je dois toujours le capital?', 'debtReduced'],
    ['Is interest capitalised?', 'capitalisedInterest'], ['Des intérêts sont-ils capitalisés?', 'capitalisedInterest'],
    ['What is my balance after the postponement?', 'balanceAfter'], ['Solde après le report?', 'balanceAfter'],
    ['Is this a live AI?', 'aboutClair'], ['Es-tu une IA?', 'aboutClair'],
    ['decembre 2026', 'month'], ['What is my February payment?', 'month'],
    ['hello', 'greeting'], ['merci', 'thanks'],
    ['Change my payment', 'limitChange'], ['Modifier mon versement', 'limitChange'],
    ['Approve another postponement', 'limitApprove'], ['Un autre report, svp', 'limitApprove'],
    ['Can I get more funding?', 'limitEligibility'], ['Suis-je admissible à plus de financement?', 'limitEligibility'],
    ['make a payment', 'limitPay'], ['payer maintenant', 'limitPay'],
    ['Who won the hockey game?', 'unrelated'], ['Quelle est la météo?', 'unrelated'], ['What is the stock market doing?', 'unrelated'],
    ['What’s new?', 'whatChanged'], ['résume l’avis', 'whatChanged'], ['quand le report se termine-t-il', 'resume'], ['à partir de quand', 'effectiveDate'],
    ['what is the APR', 'rate'], ['what is the $80', 'whyRelief'], ['interest', 'term'], ['c’est quoi la trésorerie?', 'term'], ['amortization', 'term'],
    ['capital', 'principalMeaning'], ['es-tu une vraie personne', 'aboutClair'], ['est-ce que je dois faire quelque chose', 'acceptance'],
  ];
  return cases.map(([q, exp]) => ({ q, exp, got: C.answer(q, { kind: 'general' }).intent }));
});
const missed = engine.filter((r) => r.got !== r.exp);
const intentsCovered = new Set(engine.filter((r) => r.got === r.exp).map((r) => r.exp));
check(`intent engine: ${engine.length - missed.length}/${engine.length} paraphrases (EN + FR) classified`, missed.length === 0, missed);
check(`≥12 intents verified in both languages (${intentsCovered.size})`, intentsCovered.size >= 12);

// QA regressions: paraphrases that used to get the wrong payment, a description of the current
// change instead of Clair's limits, or the off-topic / generic fallback (R-13, R-18, R-19, R-25, R-26)
const qa = await page.evaluate(() => {
  const A = window.BDCNotice;
  const run = (loc, q, ctx) => { A.i18n.setLocale(loc); const a = A.clair.answer(q, ctx || { kind: 'general' }); return { loc, q, intent: a.intent, text: a.text, monthId: a.monthId, src: a.source && a.source.target, ask: a.askPerson }; };
  const E = (q, ctx) => run('en-CA', q, ctx);
  const F = (q, ctx) => run('fr-CA', q, ctx);
  const out = {
    limits: [
      [E('I need another deferral'), 'limitApprove'], [F('Puis-je reporter d’autres mois?'), 'limitApprove'], [E('Can I postpone more months?'), 'limitApprove'],
      [E('Please defer February too'), 'limitApprove'], [F('Reportez aussi février'), 'limitApprove'],
      [F('Je veux changer mon paiement'), 'limitChange'], [E('Change my payment'), 'limitChange'], [F('Pouvez-vous modifier mon versement?'), 'limitChange'],
      [E('Lower my interest rate'), 'limitChange'], [F('Pouvez-vous baisser mon taux?'), 'limitChange'],
      [F('Pouvez-vous augmenter mon prêt?'), 'limitEligibility'], [E('Can you increase my loan?'), 'limitEligibility'],
      [F('Est-ce que je dois moins?'), 'debtReduced'], [E('Do I owe less now?'), 'debtReduced'],
      [E('What happens if I miss a payment?'), 'hardship'], [E('I can’t afford the February payment'), 'hardship'], [F('Je ne peux pas payer le versement de février'), 'hardship'],
      [E('I am having trouble paying'), 'hardship'], [F('J’ai de la difficulté à payer'), 'hardship'], [F('Que se passe-t-il si je manque un versement?'), 'hardship'],
    ],
    // Questions (not requests) keep their factual answers
    questions: [
      [E('Is February postponed too?'), 'month'], [F('Est-ce que février est reporté aussi?'), null, 'limitApprove'], [E('Will my payment change?'), null, 'limitChange'],
      [E('Can you explain why my payment is lower?'), null, 'limitChange'], [E('Why can’t I pay online?'), 'limitPay'],
      [F('Mon taux va-t-il changer?'), 'rate'], [F('Est-ce que mon taux va changer?'), 'rate'], [F('Est-ce que le taux va changer avec le report?'), 'rate'],
      [E('Will my rate change?'), 'rate'], [F('Est-ce que mon taux change?'), 'rate'], [F('Je veux changer mon taux'), 'limitChange'],
      [E('What do I owe after the postponement?'), 'balanceAfter'], [F('Combien me restera-t-il à rembourser après le report?'), 'balanceAfter'],
      [E('Why was this notice issued?'), 'purpose'], [E('What is the total interest?'), 'totalCost'], [E('How many months are postponed?'), 'postponementPeriod'],
      [E('When is my next payment?'), 'nextPayment'], [E('When is my final payment now?'), 'maturity'], [F('Quand se termine le prêt?'), 'maturity'],
      [F('Est-ce que ça touche mon hypothèque?'), 'unrelated'], [E('I have an issue with the schedule'), null, 'issueDate'],
    ],
    resume: [E('What is my first payment after the postponement?'), F('Quel est mon premier versement après le report?'), F('Quand est mon premier versement complet?'),
      E('When is my first full payment?'), E('What is my first principal payment?'), E('How much is my payment after the postponement?'), E('When is my next payment after the postponement?')],
    lastPost: [E('When is the last payment of the postponement?'), E('What is the last payment before principal resumes?'), F('Quand est mon dernier versement d’intérêts seulement?'), F('Quel est le dernier versement du report?')],
    after: [E('What is the payment after January?'), F('Quel est le versement après janvier?'), E('What is the payment before February?'), E('What about after the December payment?')],
    totals: [E('What are my total payments?'), E('What is the total of all payments?'), E('How much will I pay overall?'), E('What is the total amount repaid?'), F('Quel est le total de tous les versements?')],
    counts: [E('How many payments are left?'), E('How many payments?'), F('Combien de versements reste-t-il?')],
    issued: [E('When was this notice issued?'), F('Quand cet avis a-t-il été émis?')],
    loan: [E('What is the loan amount?'), F('Quel est le montant du prêt?')],
    misconception: [E('Do I pay $4,880 extra?'), F('Est-ce que je paie 4 880 $ de plus?'), E('Is the $80 added on top of the $4,800?')],
    year: [E('How much will I pay in 2027?'), F('Combien vais-je payer en 2027?')],
    yearOutside: E('How much will I pay in 2035?'),
    assumptionsFr: [F('Que signifient ces hypothèses?', { kind: 'clause', id: 'assumptions' }), F('Expliquez les hypothèses', { kind: 'clause', id: 'assumptions' }), F('Quelles sont les hypothèses?'), F('hypothèses'), F('Quelles hypothèses ont été utilisées pour le calcul?')],
    assumptionsEn: [E('What do these assumptions mean?', { kind: 'clause', id: 'assumptions' }), E('What are the assumptions?')],
  };
  A.i18n.setLocale('en-CA');
  return out;
});
const wrongLimits = qa.limits.filter(([r, exp]) => r.intent !== exp).map(([r, exp]) => `${r.q} → ${r.intent} (want ${exp})`);
check(`R-13: request paraphrases explain Clair's limits; hardship routes to a person (${qa.limits.length}, EN + FR)`, wrongLimits.length === 0, wrongLimits);
check('R-13: limit and hardship answers offer "Ask a person" and quote no payment figure for hardship', qa.limits.every(([r]) => r.ask) && qa.limits.filter(([r]) => r.intent === 'hardship').every(([r]) => !/\d/.test(r.text) && /person|personne/.test(r.text)), qa.limits.filter(([r]) => r.intent === 'hardship').map(([r]) => r.text));
const wrongQ = qa.questions.filter(([r, exp, not]) => (exp && r.intent !== exp) || (not && r.intent === not)).map(([r, exp, not]) => `${r.q} → ${r.intent} (want ${exp || `not ${not}`})`);
check(`questions (not requests) keep factual answers; "hypothèque" stays off-topic (${qa.questions.length})`, wrongQ.length === 0, wrongQ);
check('R-18: first payment after the postponement → resume ($5,600 on February 28, 2027), both locales', qa.resume.every((r) => r.intent === 'resume' && (/\$5,600/.test(r.text) && /February 28, 2027/.test(r.text) || /5\s600\s\$/.test(r.text) && /28\sfévrier\s2027/.test(r.text))), qa.resume.map((r) => `${r.q} → ${r.intent}`));
check('R-18: last payment of the postponement → $1,600 interest only on January 31, 2027 (not the 2032 maturity)', qa.lastPost.every((r) => r.intent === 'lastPostponement' && !/2032/.test(r.text) && (/\$1,600 on January 31, 2027, interest only/.test(r.text) || /1\s600\s\$, le 31\sjanvier\s2027/.test(r.text))), qa.lastPost.map((r) => `${r.q} → ${r.intent}: ${r.text.slice(0, 80)}`));
check('R-18: "after January" → February 2027 row; "before February" → January 2027 row', qa.after[0].monthId === '2027-02' && /\$5,600\.00/.test(qa.after[0].text) && qa.after[1].monthId === '2027-02' && qa.after[2].monthId === '2027-01' && qa.after[3].monthId === '2027-01', qa.after.map((r) => `${r.q} → ${r.intent} ${r.monthId}`));
check('R-19: total payments → $293,600.00 revised vs $288,800.00 original (both locales)', qa.totals.every((r) => r.intent === 'totalPayments' && (/\$293,600\.00/.test(r.text) && /\$288,800\.00/.test(r.text) || /293\s600,00\s\$/.test(r.text) && /288\s800,00\s\$/.test(r.text))), qa.totals.map((r) => `${r.q} → ${r.intent}`));
check('R-19: payment counts → 63 revised vs 60 original', qa.counts.every((r) => r.intent === 'paymentCount' && /63/.test(r.text) && /60/.test(r.text)), qa.counts.map((r) => `${r.q} → ${r.intent}`));
check('R-19: issue date → October 6, 2026 / 6 octobre 2026', qa.issued[0].intent === 'issueDate' && /October 6, 2026/.test(qa.issued[0].text) && qa.issued[1].intent === 'issueDate' && /6\soctobre\s2026/.test(qa.issued[1].text), qa.issued.map((r) => `${r.q} → ${r.intent}`));
check('R-19: loan amount → $240,000.00 starting principal, no invented balance', qa.loan.every((r) => r.intent === 'loanAmount' && /240[,\s]000,?\.?00/.test(r.text)), qa.loan.map((r) => `${r.q} → ${r.intent}: ${r.text.slice(0, 60)}`));
check('R-19: "$4,880 extra?" is corrected: the $80 is already inside the $4,800 (never added again)', qa.misconception.every((r) => r.intent === 'totalCost' && !/4[,\s]?880/.test(r.text) && (/already included/.test(r.text) || /déjà compris/.test(r.text))), qa.misconception.map((r) => `${r.q} → ${r.intent}`));
check('R-19: a calendar year → Payments year view with that year\'s payment counts (no computed sum); outside years say so', qa.year.every((r) => r.intent === 'year' && r.src === '#/payments' && /2027/.test(r.text)) && qa.yearOutside.intent === 'year' && /2035/.test(qa.yearOutside.text) && /no payment/.test(qa.yearOutside.text), [...qa.year, qa.yearOutside].map((r) => `${r.q} → ${r.intent} ${r.src}`));
const noFallback = [...qa.resume, ...qa.totals, ...qa.counts, ...qa.issued, ...qa.loan, ...qa.misconception, ...qa.year].filter((r) => ['fallback', 'unrelated'].includes(r.intent));
check('R-19: none of these in-scope questions gets the "only this sample notice" fallback', noFallback.length === 0, noFallback.map((r) => r.q));
check('R-25: French "hypothèses" questions → assumptions answer (also in the clause context), like English', [...qa.assumptionsFr, ...qa.assumptionsEn].every((r) => r.intent === 'assumptions' && r.src === '#/documents/assumptions'), [...qa.assumptionsFr, ...qa.assumptionsEn].map((r) => `${r.q} → ${r.intent}`));

// R-33: French spacing in the clair namespace - U+00A0 before ":" and "»" and after "«", no space before ; ? !
const frSpacing = await page.evaluate(() => {
  const bad = [];
  (function walk(v, path) {
    if (typeof v === 'string') {
      if (/[  ][:»]|«[  ]|[^\s ][:»]|«[^ ]|[\s ][;?!]/.test(v)) bad.push(`${path}: ${v.slice(0, 60)}`);
    } else if (v && typeof v === 'object') Object.keys(v).forEach((k) => walk(v[k], `${path}.${k}`));
  }(window.BDCNotice.i18n._dicts['fr-CA'].clair, 'clair'));
  return bad;
});
check('R-33: clair fr-CA strings use U+00A0 before ":" / "»" and after "«", and no space before ; ? !', frSpacing.length === 0, frSpacing.slice(0, 5));
const demoFr = await page.evaluate(() => { const A = window.BDCNotice; A.i18n.setLocale('fr-CA'); const t = A.clair.answer(null, { kind: 'section', id: 'insights' }).text; A.i18n.setLocale('en-CA'); return t; });
check('French Clair calls the Demo insights page « Statistiques de la démo »', demoFr.includes('« Statistiques de la démo »') && !/Aperçu/i.test(demoFr), demoFr);

// Words that must not be read as off-topic: French "stocks" (inventory) and "new" (not "news")
const notUnrelated = await page.evaluate(() => ['pourquoi le report pour mes stocks saisonniers', 'what is the new maturity date', 'quelles sont les nouvelles dates', 'does the schedule match the notice']
  .map((q) => [q, window.BDCNotice.clair.answer(q, { kind: 'general' }).intent]).filter(([, i]) => i === 'unrelated'));
check('inventory "stocks", "new" and "match" are not treated as unrelated', notUnrelated.length === 0, notUnrelated);

// Polarity: answers must not open with a Yes/No that contradicts the question
const polarity = await page.evaluate(() => {
  const A = (q) => window.BDCNotice.clair.answer(q, { kind: 'general' }).text;
  return [
    ['Do I still owe the $12,000?', A('Do I still owe the $12,000?')], ['Is my debt forgiven?', A('Is my debt forgiven?')],
    ['Is this interest-free?', A('Is this interest-free?')], ['Do I still pay interest?', A('Do I still pay interest?')],
    ['Is my rate the same?', A('Is my rate the same?')], ['What do I need to do?', A('What do I need to do?')],
    ['Est-ce que je dois encore les 12 000 $?', A('Est-ce que je dois encore les 12 000 $?')],
  ].filter(([, txt]) => /^(yes|no|oui|non)\b/i.test(txt));
});
check('answers are polarity-neutral (no leading Yes/No that could contradict the question)', polarity.length === 0, polarity);
const owe = await page.evaluate(() => window.BDCNotice.clair.answer('Do I still owe the $12,000?', { kind: 'general' }).text);
check('"Do I still owe it?" → still owed, not reduced', /still owe the same principal/.test(owe) && /\$12,000/.test(owe), owe);

// Term questions use the approved glossary definition plus how it applies here
const termAns = await page.evaluate(() => window.BDCNotice.clair.answer('amortisation?', { kind: 'general' }));
check('glossary-term question → definition + application + glossary source', termAns.intent === 'term' && /^Repayment of principal over a schedule\./.test(termAns.text) && /63 payments instead of 60/.test(termAns.text) && termAns.source.target === '#/help/glossary/amortisation', termAns);

// FAQ contexts (help module ids) map to their intents
const faq = await page.evaluate(() => ['relief', 'debt-reduced', 'still-interest', 'final-payment', 'restart', 'fee', 'why-notice', 'accept', 'capitalised', 'rate', 'next-payment']
  .map((id) => [id, window.BDCNotice.clair.answer(null, { kind: 'faq', id }).intent]));
const faqExp = { relief: 'whyRelief', 'debt-reduced': 'debtReduced', 'still-interest': 'continuingInterest', 'final-payment': 'maturity', restart: 'resume', fee: 'fees', 'why-notice': 'purpose', accept: 'acceptance', capitalised: 'capitalisedInterest', rate: 'rate', 'next-payment': 'nextPayment' };
check('FAQ contexts answer their own question (e.g. relief FAQ → why $11,920)', faq.every(([id, i]) => faqExp[id] === i), faq);

// Every answer and every context answer, both locales: values, wording, no missing keys
const audit = await page.evaluate((forbiddenSrc) => {
  const A = window.BDCNotice;
  const re = new RegExp(forbiddenSrc, 'i');
  const problems = [];
  const intents = ['whatChanged', 'purpose', 'effectiveDate', 'nextPayment', 'postponementPeriod', 'principalMeaning', 'continuingInterest', 'whyRelief', 'relief', 'totalCost', 'maturity', 'resume', 'rate', 'fees', 'unchanged', 'acceptance', 'printExport', 'queryPrep', 'support', 'debtReduced', 'capitalisedInterest', 'balanceAfter', 'accountant', 'aboutClair', 'greeting', 'thanks', 'limitChange', 'limitApprove', 'limitEligibility', 'limitPay', 'unrelated', 'fallback',
    'lastPostponement', 'totalPayments', 'paymentCount', 'issueDate', 'loanAmount', 'hardship', 'assumptions'];
  const ctxs = [];
  A.CHANGE_CARDS.forEach((id) => ctxs.push({ kind: 'card', id }));
  A.SUMMARY_CARDS.forEach((id) => ctxs.push({ kind: 'summary', id }));
  A.rec.months.forEach((m) => ctxs.push({ kind: 'month', id: m.id }));
  A.CLAUSES.forEach((id) => ctxs.push({ kind: 'clause', id }));
  A.TERMS.forEach((id) => ctxs.push({ kind: 'term', id }));
  A.CHAPTERS.forEach((id) => ctxs.push({ kind: 'chapter', id }));
  A.RESOURCES.forEach((id) => ctxs.push({ kind: 'resource', id }));
  ['payments', 'balance'].forEach((id) => ctxs.push({ kind: 'chart', id }));
  ['relief', 'cost'].forEach((id) => ctxs.push({ kind: 'infographic', id }));
  [...A.SECTIONS, 'insights'].forEach((id) => ctxs.push({ kind: 'section', id }));
  ['why-notice', 'accept', 'debt-reduced', 'rate', 'capitalised', 'next-payment', 'still-interest', 'relief', 'restart', 'final-payment', 'fee', 'ask', 'accountant', 'print-export'].forEach((id) => ctxs.push({ kind: 'faq', id }));
  let n = 0;
  for (const loc of ['en-CA', 'fr-CA']) {
    A.i18n.setLocale(loc);
    const all = intents.map((i) => A.clair.answer({ intent: i }, { kind: 'general' })).concat(ctxs.map((c) => A.clair.answer(null, c)))
      .concat(A.rec.years.map((year) => A.clair.answer({ intent: 'year', year }, { kind: 'general' })));
    for (const ans of all) {
      n += 1;
      const txt = `${ans.text} ${ans.fact || ''} ${ans.source ? ans.source.text : ''}`;
      if (!ans.text || ans.lang !== loc) problems.push(`${loc} ${ans.intent}: empty or wrong lang`);
      if (re.test(txt)) problems.push(`${loc} ${ans.intent} ${ans.context || ''}: forbidden/missing → ${txt.slice(0, 120)}`);
      if (ans.source && !/^#\/(documents|payments|changes|help|support)(\/|$)/.test(ans.source.target)) problems.push(`${loc} ${ans.intent}: bad source ${ans.source.target}`);
      if (ans.context && !ans.fact && ans.intent !== 'aboutDemo') problems.push(`${loc} ${ans.context}: no supporting fact`);
    }
  }
  const fr = A.clair.answer(null, { kind: 'summary', id: 'relief' });
  A.i18n.setLocale('en-CA');
  return { n, problems, fr: fr.text };
}, FORBIDDEN.source);
check(`all ${audit.n} answers/context answers well-formed in both locales (no forbidden framing, valid sources, facts present)`, audit.problems.length === 0, audit.problems.slice(0, 6));
check('French relief answer uses fixture values formatted for fr-CA', /12\s000\s\$/.test(audit.fr) && /11\s920\s\$/.test(audit.fr) && /80\s\$/.test(audit.fr), audit.fr);

// 8. Source link: close, open the clause, keep a return path to the originating control
await page.evaluate(() => window.BDCNotice.clair.open({ kind: 'month', id: '2026-12', fid: 'explain-month-2026-12' }, document.querySelector('.clair-launcher')));
await openPanel();
const monthAns = await lastClair();
check('month context answer covers both schedules', monthAns.intent === 'month' && /\$5,573\.33/.test(monthAns.text) && /Original: \$4,000\.00 principal/.test(monthAns.fact), monthAns);
const href = await page.$eval('.clair-log .clair-msg--clair[data-msg]:last-of-type .clair-source', (el) => el.getAttribute('href'));
await page.click('.clair-log .clair-msg--clair[data-msg]:last-of-type .clair-source');
await page.waitForTimeout(250);
const nav = await page.evaluate(() => {
  const stack = window.BDCNotice.session.slice('backStack');
  return { open: !!document.querySelector('[data-overlay="clair"]'), hash: location.hash, top: stack[stack.length - 1] };
});
check('source link closes the panel and opens the notice clause', !nav.open && nav.hash === href && href === '#/documents/postponement', nav);
check('return path points back to the originating Explain control', nav.top && nav.top.fid === 'explain-month-2026-12' && nav.top.ctx && nav.top.ctx.kind === 'month' && nav.top.ctx.id === '2026-12' && nav.top.from === '#/overview', nav.top);
await page.evaluate(() => window.BDCNotice.router.back());
await page.waitForTimeout(250);
check('Back returns to the originating view', await page.evaluate(() => location.hash === '#/overview'));

// 8b. A section-level source (#/support) has no item: focus must land on the view heading, never on <body>
await page.evaluate(() => window.BDCNotice.clair.open({ kind: 'general' }, document.querySelector('.clair-launcher')));
await openPanel();
await typeAsk('What support is available?');
const supHref = await page.evaluate(() => [...document.querySelectorAll('.clair-log .clair-source')].pop().getAttribute('href'));
await page.evaluate(() => [...document.querySelectorAll('.clair-log .clair-source')].pop().click());
await page.waitForTimeout(400);
const supFocus = await page.evaluate(() => ({ hash: location.hash, tag: document.activeElement.tagName, heading: document.activeElement.hasAttribute('data-view-heading') }));
check('section-level source (#/support) closes the panel and focuses the view heading', supHref === '#/support' && supFocus.hash === '#/support' && supFocus.heading, { supHref, ...supFocus });
await page.evaluate(() => window.BDCNotice.router.back());
await page.waitForTimeout(250);
check('Back from the support section returns focus to the Clair launcher', await page.evaluate(() => location.hash === '#/overview' && document.activeElement.getAttribute('data-fid') === 'clair-launcher'));

// Clause context: chip shows the full item label; the Explain bubble uses the clause title (no double colon)
await page.evaluate(() => window.BDCNotice.clair.open({ kind: 'clause', id: 'cost', fid: 'explain-clause-cost' }, document.querySelector('.clair-launcher')));
await openPanel();
const clauseCtx = await page.evaluate(() => ({ chip: document.querySelector('.clair-chip .chip-text').textContent, user: [...document.querySelectorAll('.clair-msg--user .clair-msg-text')].pop().textContent, src: [...document.querySelectorAll('.clair-log .clair-source')].pop().getAttribute('href') }));
check('clause context: chip "Notice clause: 7. …", bubble "Explain: 7. …", source is that clause', clauseCtx.chip === 'Notice clause: 7. Effect on interest and total payments' && clauseCtx.user === 'Explain: 7. Effect on interest and total payments' && clauseCtx.src === '#/documents/cost', clauseCtx);
await page.keyboard.press('Escape');
await closedPanel();

// Unsent draft survives close/reopen (memory only)
await page.evaluate(() => window.BDCNotice.clair.open({ kind: 'general' }, document.querySelector('.clair-launcher')));
await openPanel();
await page.fill('#clair-input', 'draft question');
await page.keyboard.press('Escape');
await closedPanel();
await page.evaluate(() => window.BDCNotice.clair.open({ kind: 'general' }, document.querySelector('.clair-launcher')));
await openPanel();
check('unsent draft is kept for the session when the panel is reopened', await page.evaluate(() => document.querySelector('#clair-input').value === 'draft question'));
await page.fill('#clair-input', '');
await page.keyboard.press('Escape');
await closedPanel();

// 9. Ask a person (query module if present; otherwise the Help route)
await page.evaluate(() => window.BDCNotice.clair.open({ kind: 'card', id: 'interest', fid: 'explain-card-interest' }, document.querySelector('.clair-launcher')));
await openPanel();
const hasQuery = await page.evaluate(() => !!window.BDCNotice.query);
await page.click('.clair-log .clair-msg--clair[data-msg]:last-of-type .clair-ask');
await page.waitForTimeout(300);
if (hasQuery) {
  check('"Ask a person" switches to the local query form', await page.evaluate(() => window.BDCNotice.overlay.current() === 'query'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
} else {
  check('"Ask a person" (no query module in this build) opens Help › Ask a question', await page.evaluate(() => !document.querySelector('[data-overlay="clair"]') && location.hash === '#/help/ask'));
  await page.evaluate(() => window.BDCNotice.router.back());
  await page.waitForTimeout(200);
}

if (shots) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => window.BDCNotice.session.reset());
  await page.evaluate(() => window.BDCNotice.clair.open({ kind: 'general' }, document.querySelector('.clair-launcher')));
  await openPanel();
  await page.screenshot({ path: `${shots}/clair-en-CA-1280-general.png` });
  await typeAsk('zzqx blorp');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${shots}/clair-en-CA-1280-fallback.png` });
  await page.keyboard.press('Escape');
  await closedPanel();
  await page.evaluate(() => window.BDCNotice.clair.open({ kind: 'summary', id: 'relief', fid: 'x' }, document.querySelector('.clair-launcher')));
  await openPanel();
  await page.screenshot({ path: `${shots}/clair-en-CA-1280.png` });
  await page.keyboard.press('Escape');
  await closedPanel();
  await page.setViewportSize({ width: 768, height: 1000 });
  await page.evaluate(() => window.BDCNotice.clair.open({ kind: 'month', id: '2026-12', fid: 'x' }, document.querySelector('.clair-launcher')));
  await openPanel();
  await page.screenshot({ path: `${shots}/clair-en-CA-768-month.png` });
  await page.keyboard.press('Escape');
  await closedPanel();
  await page.setViewportSize({ width: 1280, height: 900 });
}

// 10. Mobile: full-width dialog, send button visible (also with a short "keyboard" viewport)
for (const [w, h] of [[390, 844], [320, 640], [390, 420]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(150);
  await page.evaluate(() => window.BDCNotice.clair.open({ kind: 'month', id: '2027-02', fid: 'explain-month-2027-02' }, document.querySelector('.clair-launcher')));
  await openPanel();
  const m = await page.evaluate(() => {
    const p = document.querySelector('[data-overlay="clair"]').getBoundingClientRect();
    const s = document.querySelector('.clair-send').getBoundingClientRect();
    const i = document.querySelector('#clair-input').getBoundingClientRect();
    return { pw: p.width, pl: p.left, sendVisible: s.bottom <= window.innerHeight && s.right <= window.innerWidth && s.width > 0, inputW: i.width, vw: document.documentElement.clientWidth };
  });
  check(`${w}×${h}: panel is a full-width dialog`, Math.round(m.pw) === m.vw && Math.round(m.pl) === 0, m);
  check(`${w}×${h}: send button and input visible`, m.sendVisible && m.inputW >= 120, m);
  const chipM = await chipInView();
  check(`${w}×${h}: current-context chip and its remove control stay in view (R-12)`, chipM.label === 'February 2027 payment' && chipM.visible && chipM.removeVisible && !chipM.inScroll, chipM);
  if (w < 360) {
    const send = await page.evaluate(() => { const b = document.querySelector('.clair-send'); return { w: b.getBoundingClientRect().width, name: b.textContent.trim(), input: document.querySelector('#clair-input').getBoundingClientRect().width }; });
    check(`${w}px: Send is icon-only but keeps its accessible name; input ≥ 200px`, send.w <= 52 && send.name === 'Send' && send.input >= 200, send);
  }
  const of = await overflowReport(page);
  check(`${w}×${h}: no horizontal overflow`, !of.overflow && of.offenders.length === 0, of.offenders.slice(0, 3));
  await page.keyboard.press('Escape');
  await closedPanel();
}

// 11. Language switch while open: chrome re-renders, old messages keep their language
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => window.BDCNotice.clair.open({ kind: 'general' }, document.querySelector('.clair-launcher')));
await openPanel();
const enMsg = await typeAsk('When is my next payment?');
await page.evaluate(() => window.BDCNotice.i18n.setLocale('fr-CA'));
await page.waitForTimeout(200);
const afterSwitch = await page.evaluate((id) => ({
  title: document.querySelector('[data-overlay="clair"] .overlay-title').textContent,
  status: document.querySelector('.clair-status').textContent,
  placeholder: document.querySelector('#clair-input').getAttribute('placeholder'),
  send: document.querySelector('.clair-send .btn-label').textContent,
  close: document.querySelector('[data-overlay="clair"] .overlay-close').getAttribute('aria-label'),
  oldLang: [...document.querySelectorAll('.clair-log .clair-msg--clair[data-msg]')].pop().getAttribute('lang'),
  oldText: [...document.querySelectorAll('.clair-log .clair-msg--clair[data-msg]')].pop().querySelector('.clair-msg-text').textContent,
  tag: ([...document.querySelectorAll('.clair-log .clair-msg--clair[data-msg]')].pop().querySelector('.clair-lang') || {}).textContent,
  sugg: document.querySelector('.clair-suggest .clair-chip-btn').textContent,
  open: !!document.querySelector('[data-overlay="clair"]'),
}));
check('fr-CA: panel stays open; title and status line in French (exact)', afterSwitch.open && afterSwitch.title === 'Clair — Votre guide du financement' && afterSwitch.status === STATUS_FR, afterSwitch);
check('fr-CA: input, send, close and suggestions re-rendered in French', afterSwitch.placeholder.startsWith('Posez') && afterSwitch.send === 'Envoyer' && afterSwitch.close === 'Fermer' && !/^(Why|When|What|Do|Is)\b/.test(afterSwitch.sugg), afterSwitch);
check('fr-CA: earlier English answer kept in English with lang="en-CA" and a language tag', afterSwitch.oldLang === 'en-CA' && afterSwitch.oldText === enMsg.text && afterSwitch.tag === 'En anglais', afterSwitch);
const frMsg = await typeAsk('Pourquoi pas 12 000 $?');
check('fr-CA: new answer in French (lang="fr-CA") with fr-CA amounts', frMsg.lang === 'fr-CA' && frMsg.intent === 'whyRelief' && /11\s920\s\$/.test(frMsg.text) && /capital/.test(frMsg.text), frMsg);
const frLimit = await typeAsk('Pouvez-vous modifier mon versement?');
check('fr-CA: restricted request answered with French limit', frLimit.intent === 'limitChange' && /Je ne peux pas modifier/.test(frLimit.text), frLimit);
await page.waitForTimeout(900);
if (shots) await page.screenshot({ path: `${shots}/clair-fr-CA-390.png` });
const mk = await missingKeys(page);
check('no missing dictionary keys (fr-CA, panel open)', mk.length === 0, mk);
await page.keyboard.press('Escape');
await closedPanel();

if (shots) {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.evaluate(() => window.BDCNotice.clair.open({ kind: 'summary', id: 'relief', fid: 'x' }, document.querySelector('.clair-launcher')));
  await openPanel();
  await page.screenshot({ path: `${shots}/clair-fr-CA-320.png` });
  await page.evaluate(() => { document.querySelector('.clair-scroll').scrollTop = 99999; });
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${shots}/clair-fr-CA-320-bottom.png` });
  await page.keyboard.press('Escape');
  await closedPanel();
  await page.setViewportSize({ width: 390, height: 420 });
  await page.evaluate(() => window.BDCNotice.clair.open({ kind: 'general' }, document.querySelector('.clair-launcher')));
  await openPanel();
  await page.screenshot({ path: `${shots}/clair-fr-CA-390x420.png` });
  await page.keyboard.press('Escape');
  await closedPanel();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => window.BDCNotice.clair.open({ kind: 'clause', id: 'cost', fid: 'x' }, document.querySelector('.clair-launcher')));
  await openPanel();
  await page.screenshot({ path: `${shots}/clair-fr-CA-1280-clause.png` });
  await page.keyboard.press('Escape');
  await closedPanel();
}

// 12. Conversation persists for the session; reset clears it
await page.evaluate(() => window.BDCNotice.clair.open({ kind: 'general' }, document.querySelector('.clair-launcher')));
await openPanel();
const persisted = await page.$$eval('.clair-log .clair-msg[data-msg]', (els) => els.length);
check('conversation persists across close/reopen', persisted >= 4, persisted);
await page.keyboard.press('Escape');
await closedPanel();
await page.evaluate(() => window.BDCNotice.session.reset());
await page.evaluate(() => window.BDCNotice.clair.open({ kind: 'general' }, document.querySelector('.clair-launcher')));
await openPanel();
check('demo reset clears the conversation', await page.evaluate(() => document.querySelectorAll('.clair-log .clair-msg[data-msg]').length === 0 && !!document.querySelector('.clair-msg--greeting')));
await page.keyboard.press('Escape');
await closedPanel();
await page.evaluate(() => window.BDCNotice.i18n.setLocale('en-CA'));

// 12b. Reduced motion: the panel appears without a slide transition
{
  const rm = await newPage(browser, { width: 1280, height: 900, reducedMotion: 'reduce' });
  await gotoApp(rm.page, '#/overview', file);
  await rm.page.evaluate(() => window.BDCNotice.clair.open({ kind: 'general' }, document.querySelector('.clair-launcher')));
  await rm.page.waitForSelector('[data-overlay="clair"].is-open');
  check('reduced motion: panel opens without the slide transition', await rm.page.evaluate(() => document.querySelector('[data-overlay="clair"]').classList.contains('no-motion')));
  await rm.context.close();
}

// 13. Isolation
const ext = requests.filter((u) => !u.startsWith('https://accessibilityserver.org/'));
check('no external network requests', ext.length === 0, ext);
check('no storage used by Clair (session state is in memory)', await page.evaluate(() => { try { return !Object.keys(localStorage).some((k) => /clair/i.test(k) || /clair/i.test(localStorage.getItem(k) || '')); } catch (e) { return true; } }));
check('no console errors or warnings', consoleMsgs.length === 0, consoleMsgs.slice(0, 5));

await browser.close();
console.log(failures ? `\n✗ clair: ${failures} check(s) failed` : '\n✓ clair: all checks passed');
process.exit(failures ? 1 : 0);
