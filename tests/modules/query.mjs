#!/usr/bin/env node
// Query form + Demo insights module QA (PRD sections 10 and 17, AC-15, AC-23).
// Query: context capture and removal, accessible validation (error summary,
// aria-invalid, 1,000-character limit), review before creation, exact local
// confirmation, DEMO- reference, copy and downloads, draft persistence across
// close/reopen, locale switch keeping the question's language, session reset,
// identifier-only events and no persistent storage of the question.
// Insights: counts, live timeline, milestones, export, hardship switch,
// widget status, usability tasks, French and 320px layout.
// Usage: node tests/modules/query.mjs [path/to/index.html] [--shots dir]
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { launch, newPage, gotoApp, overflowReport, missingKeys, DEFAULT_FILE } from '../lib/browser.mjs';

// Optional axe-core scan (devDependency); skipped if it is not installed.
const AXE_PATH = new URL('../../node_modules/axe-core/axe.min.js', import.meta.url).pathname;
const axeSrc = existsSync(AXE_PATH) ? readFileSync(AXE_PATH, 'utf8') : null;

const args = process.argv.slice(2);
const file = args[0] && !args[0].startsWith('--') ? args[0] : DEFAULT_FILE;
const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });

const CONFIRM_EN = 'Demo request created locally. Nothing has been sent to BDC.';
const CONFIRM_FR = 'Demande de démonstration créée localement. Rien n’a été envoyé à BDC.';
const Q1 = 'Why is my December payment different from the original schedule?';
const Q_DRAFT = 'Could you explain the new final payment date?';
const Q_FR_TYPED_EN = 'Is the interest rate still fixed?';
const BANNED = /forgiv|interest[- ]free|holiday|saving|remise de dette|sans int[ée]r[êe]t|cong[ée] de|[ée]conomi|[ée]pargn/i;

let failures = 0;
function check(name, ok, detail) {
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${!ok && detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
}
const N = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const shot = async (page, name, fullPage = false) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage }); };

const browser = await launch();
const { page, context, requests, consoleMsgs } = await newPage(browser, { width: 1280, height: 900 });
try { await context.grantPermissions(['clipboard-read', 'clipboard-write']); } catch (e) { /* not available for this origin */ }
await gotoApp(page, '#/overview', file);
await page.evaluate(() => window.BDCNotice.i18n.setLocale('en-CA'));
await page.waitForTimeout(100);

const PANEL = '[data-overlay="query"]';
const panelOpen = async () => { await page.waitForSelector(`${PANEL}.is-open`); await page.waitForTimeout(320); };
const panelClosed = async () => { await page.waitForSelector(PANEL, { state: 'detached' }); await page.waitForTimeout(150); };
const panelText = () => page.evaluate((s) => document.querySelector(s)?.innerText || '', PANEL);
const activeInfo = () => page.evaluate(() => {
  const a = document.activeElement;
  const f = a && a.closest('[data-fid]');
  return { tag: a && a.tagName, id: a && a.id, fid: f ? f.getAttribute('data-fid') : null, cls: a && a.className && String(a.className) };
});
const events = () => page.evaluate(() => window.BDCNotice.events.all());
// WCAG A/AA violations inside a container (null when axe-core is unavailable).
const axeScan = async (selector) => {
  if (!axeSrc) return null;
  if (!(await page.evaluate(() => typeof window.axe !== 'undefined'))) await page.addScriptTag({ content: axeSrc });
  return page.evaluate(async (sel) => {
    const res = await window.axe.run(document.querySelector(sel), { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] });
    return res.violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0].target.join(' ')}`);
  }, selector);
};
const axeCheck = async (name, selector) => {
  const v = await axeScan(selector);
  if (v === null) { console.log(`- ${name}: skipped (axe-core not installed)`); return; }
  check(name, v.length === 0, v);
};
// French typography: no ordinary (breakable) space before ":" or inside « ».
const badFrenchSpacing = (txt) => (txt.match(/ :|« | »/g) || []).length;
const openQuery = async (ctx) => {
  await page.evaluate((c) => window.BDCNotice.query.open(c, document.querySelector('[data-fid="footer-insights"]')), ctx);
  await panelOpen();
};

check('App.query exposes open() and state()', await page.evaluate(() => typeof window.BDCNotice.query?.open === 'function' && typeof window.BDCNotice.query?.state === 'function'));
check('insights view is registered', await page.evaluate(() => !!window.BDCNotice.router.views.insights));

/* ------------------------------------------------------------------ */
/* 1. Open with month context                                          */
/* ------------------------------------------------------------------ */
const evBefore = (await events()).length;
await openQuery({ kind: 'month', id: '2026-12', topic: 'payment', section: 'payments', fid: 'footer-insights' });
const opened = await page.evaluate((s) => {
  const p = document.querySelector(s);
  return {
    title: p.querySelector('.overlay-title').textContent,
    subtitle: p.querySelector('.qry-subtitle')?.textContent || '',
    step: (p.querySelector('.qry-step-title')?.textContent || '').replace(/\s+/g, ' ').trim(),
    progress: p.querySelectorAll('.qry-progress-seg').length,
    notice: p.querySelector('.qry-ctx-list .qry-code')?.textContent,
    item: p.querySelector('.qry-item-text')?.textContent,
    removeLabel: p.querySelector('[data-fid="qry-item-remove"]')?.getAttribute('aria-label'),
    lang: p.querySelector('.qry-ctx-strong')?.textContent,
    topic: p.querySelector('#qry-topic')?.value,
    topicLabel: p.querySelector('label[for="qry-topic"]')?.textContent,
    qLabel: p.querySelector('label[for="qry-question"]')?.textContent,
    radios: [...p.querySelectorAll('input[name="qry-contact"]')].map((r) => `${r.value}:${r.checked}`),
    forbiddenInputs: p.querySelectorAll('input[type="file"], input[type="email"], input[type="tel"], input[type="password"]').length,
    privacy: p.querySelector('.qry-privacy')?.textContent || '',
    contactHint: p.querySelector('#qry-contact-hint')?.textContent || '',
    rect: p.getBoundingClientRect().toJSON(),
    modal: p.getAttribute('aria-modal'),
    fontSize: getComputedStyle(p.querySelector('#qry-question')).fontSize,
  };
}, PANEL);
check('panel title "Ask a question" with local-demo subtitle', opened.title === 'Ask a question' && opened.subtitle === 'Local demo only. Nothing is sent to BDC.', opened);
check('step indicator "Step 1 of 3: Write your question" (3 segments)', /^Step 1 of 3:? ?Write your question$/.test(opened.step) && opened.progress === 3, opened.step);
check('notice identifier always shown', opened.notice === 'DEMO-BDC-CHANGE-2026-001', opened.notice);
check('selected item captured: "December 2026 payment" with labelled Remove', opened.item === 'December 2026 payment' && opened.removeLabel === 'Remove selected item: December 2026 payment', opened);
check('chosen language shown (English)', opened.lang === 'English', opened.lang);
check('topic preselected from ctx.topic (payment)', opened.topic === 'payment', opened.topic);
check('labelled topic and question fields', opened.topicLabel === 'Topic' && opened.qLabel === 'Your question');
check('contact radios: none/phone/email/secure, "No preference" default', opened.radios.join() === 'none:true,phone:false,email:false,secure:false', opened.radios);
check('no file upload, email, phone or password inputs', opened.forbiddenInputs === 0);
check('privacy note warns against passwords, bank details, IDs, contact info', /passwords/.test(opened.privacy) && /bank-account/.test(opened.privacy) && /government identifiers/.test(opened.privacy) && /sends nothing/.test(opened.privacy));
check('"No contact details are collected in this demo"', opened.contactHint === 'No contact details are collected in this demo.');
check('panel on the right at 420px, modal', Math.round(opened.rect.width) === 420 && Math.round(opened.rect.right) === 1280 && opened.modal === 'true', opened.rect);
check('16px text input (no iOS zoom)', opened.fontSize === '16px', opened.fontSize);
check('opening the form logs nothing', (await events()).length === evBefore);
await shot(page, 'query-en-1280-draft');

// Topic inference without ctx.topic
check('topic inferred from item when ctx.topic is absent', await page.evaluate(() => {
  const st = window.BDCNotice.query.state();
  const saved = st.draft;
  st.draft = null;
  window.BDCNotice.query.open({ kind: 'clause', id: 'maturity' });
  const v = document.querySelector('#qry-topic').value;
  st.draft = saved;
  window.BDCNotice.query.open({ kind: 'month', id: '2026-12', topic: 'payment' });
  return v === 'maturity';
}));
await page.waitForTimeout(100);

/* ------------------------------------------------------------------ */
/* 2. Remove / restore context                                         */
/* ------------------------------------------------------------------ */
await page.click('[data-fid="qry-item-remove"]');
await page.waitForTimeout(120);
let st = await page.evaluate(() => ({ item: document.querySelector('.qry-item-text')?.textContent, restore: !!document.querySelector('[data-fid="qry-item-restore"]'), draftItem: window.BDCNotice.query.state().draft.item }));
check('Remove clears the selected item (shows "None")', /^None/.test(st.item) && st.restore && st.draftItem === null, st);
check('focus moves to "Add it back" after removal', (await activeInfo()).fid === 'qry-item-restore');
check('"Add it back" accessible name contains its visible label (WCAG 2.5.3)', await page.evaluate(() => {
  const b = document.querySelector('[data-fid="qry-item-restore"]');
  return b.getAttribute('aria-label').startsWith(b.textContent.trim()) && b.getAttribute('aria-label') === 'Add it back: December 2026 payment';
}));
await page.waitForTimeout(80);
check('removal announced politely', await page.evaluate(() => document.getElementById('live-polite').textContent.includes('removed')));
await page.click('[data-fid="qry-item-restore"]');
await page.waitForTimeout(120);
check('"Add it back" restores the item', await page.evaluate(() => document.querySelector('.qry-item-text')?.textContent === 'December 2026 payment'));

/* ------------------------------------------------------------------ */
/* 3. First keystroke logs query_drafted once                          */
/* ------------------------------------------------------------------ */
await page.click('#qry-question');
await page.keyboard.type('Why');
await page.waitForTimeout(80);
let ev = await events();
let drafted = ev.filter((e) => e.type === 'query_drafted');
check('first typing logs query_drafted once with the topic id', drafted.length === 1 && drafted[0].id === 'payment', drafted);
check('"Written in English" shown once typing starts', await page.evaluate(() => document.querySelector('.qry-lang-tag')?.textContent === 'Written in English'));
check('draft.lang captured as en-CA', await page.evaluate(() => window.BDCNotice.query.state().draft.lang === 'en-CA'));
await page.keyboard.type(' again');
check('further typing does not log again', (await events()).filter((e) => e.type === 'query_drafted').length === 1);

/* ------------------------------------------------------------------ */
/* 4. Validation                                                       */
/* ------------------------------------------------------------------ */
await page.fill('#qry-question', '');
await page.selectOption('#qry-topic', '');
await page.click('[data-fid="qry-continue"]');
await page.waitForTimeout(200);
let v = await page.evaluate(() => {
  const s = document.querySelector('.qry-error-summary');
  const ta = document.querySelector('#qry-question');
  const sel = document.querySelector('#qry-topic');
  return {
    summary: !!s,
    focused: document.activeElement === s,
    title: s?.querySelector('.qry-error-title')?.textContent,
    links: [...(s?.querySelectorAll('a') || [])].map((a) => `${a.getAttribute('href')}|${a.textContent}`),
    taInvalid: ta.getAttribute('aria-invalid'),
    taDesc: ta.getAttribute('aria-describedby'),
    taErr: document.getElementById('qry-question-error')?.textContent,
    selInvalid: sel.getAttribute('aria-invalid'),
    selDesc: sel.getAttribute('aria-describedby'),
    step: document.querySelector('[data-overlay="query"]').getAttribute('data-step'),
  };
});
check('empty submit shows an error summary that receives focus', v.summary && v.focused && v.title === 'There is a problem', v);
check('summary links to topic then question', v.links.join(' ; ') === '#qry-topic|Choose a topic for your question ; #qry-question|Enter your question', v.links);
check('question: aria-invalid + aria-describedby → inline error', v.taInvalid === 'true' && v.taDesc.split(' ').includes('qry-question-error') && /Enter your question/.test(v.taErr), v);
check('topic: aria-invalid + aria-describedby → inline error', v.selInvalid === 'true' && v.selDesc === 'qry-topic-error', v);
check('stays on the draft step', v.step === 'draft');
await axeCheck('axe: no WCAG A/AA violations in the panel with errors', PANEL);
await shot(page, 'query-en-1280-errors');
await page.click('.qry-error-summary a[href="#qry-question"]');
await page.waitForTimeout(100);
check('summary link moves focus to the field (route unchanged)', (await activeInfo()).id === 'qry-question' && (await page.evaluate(() => location.hash)) === '#/overview');
await page.selectOption('#qry-topic', 'interest');
await page.waitForTimeout(80);
check('fixing the topic clears its error live', await page.evaluate(() => !document.getElementById('qry-topic-error') && document.querySelectorAll('.qry-error-summary li').length === 1 && !document.querySelector('#qry-topic').hasAttribute('aria-invalid')));

const long = 'a'.repeat(1001);
await page.fill('#qry-question', long);
await page.waitForTimeout(80);
v = await page.evaluate(() => ({
  counter: document.querySelector('#qry-question-counter').textContent,
  over: document.querySelector('#qry-question-counter').classList.contains('is-over'),
  invalid: document.querySelector('#qry-question').getAttribute('aria-invalid'),
}));
check('1,001 characters flagged live ("1 character too many", aria-invalid)', v.counter === 'You have 1 character too many' && v.over && v.invalid === 'true', v);
v = await page.evaluate(() => ({ inline: document.querySelector('#qry-question-error .qry-field-error-msg')?.textContent, link: document.querySelector('.qry-error-summary a[href="#qry-question"]')?.textContent }));
check('a shown error updates its wording when the problem changes (empty → too long)', v.inline === 'Your question must be 1,000 characters or fewer' && v.link === v.inline, v);
await page.click('[data-fid="qry-continue"]');
await page.waitForTimeout(150);
v = await page.evaluate(() => ({ step: document.querySelector('[data-overlay="query"]').getAttribute('data-step'), msg: document.getElementById('qry-question-error')?.textContent || '', focused: document.activeElement?.classList.contains('qry-error-summary') }));
check('1,001 characters blocked on Continue with a length error', v.step === 'draft' && /1,000 characters or fewer/.test(v.msg) && v.focused, v);
await page.fill('#qry-question', 'a'.repeat(1000));
check('exactly 1,000 characters accepted by the counter', await page.evaluate(() => document.querySelector('#qry-question-counter').textContent === 'You have 0 characters remaining' && !document.querySelector('#qry-question-counter').classList.contains('is-over')));

/* ------------------------------------------------------------------ */
/* 5. Valid flow → review → create                                    */
/* ------------------------------------------------------------------ */
await page.fill('#qry-question', Q1);
await page.check('#qry-contact-email');
await page.waitForTimeout(60);
check('error summary disappears once all fields are valid', await page.evaluate(() => !document.querySelector('.qry-error-summary')));
await page.click('[data-fid="qry-continue"]');
await page.waitForTimeout(200);
let rv = await page.evaluate(() => {
  const p = document.querySelector('[data-overlay="query"]');
  const rows = Object.fromEntries([...p.querySelectorAll('.qry-review-row')].map((r) => [r.querySelector('dt').textContent, r.querySelector('dd').textContent]));
  return { step: p.getAttribute('data-step'), heading: p.querySelector('.qry-step-title').textContent, rows, qLang: p.querySelector('.qry-question-text')?.getAttribute('lang'), focus: document.activeElement?.classList.contains('qry-step-title'), buttons: [...p.querySelectorAll('.qry-footer button')].map((b) => b.textContent.trim()) };
});
check('review step precedes creation (Step 2 of 3)', rv.step === 'review' && /Step 2 of 3/.test(rv.heading) && rv.focus, rv);
check('review lists notice, item, topic, language, contact and question', rv.rows.Notice === 'DEMO-BDC-CHANGE-2026-001' && rv.rows['Selected item'] === 'December 2026 payment' && rv.rows.Topic === 'Interest' && rv.rows['Preferred language'] === 'English' && rv.rows['Preferred contact method'] === 'Email' && rv.rows['Your question'] === Q1, rv.rows);
check('question rendered as text in its own language', rv.qLang === 'en-CA' && rv.rows['Language of your question'] === 'Written in English');
check('review buttons: Edit + Create demo request', rv.buttons.join('|') === 'Edit|Create demo request', rv.buttons);
await axeCheck('axe: no WCAG A/AA violations on the review step', PANEL);
await shot(page, 'query-en-1280-review');
await page.click('[data-fid="qry-edit"]');
await page.waitForTimeout(150);
check('Edit returns to the draft with text and choices kept', await page.evaluate((q) => document.querySelector('#qry-question').value === q && document.querySelector('#qry-topic').value === 'interest' && document.querySelector('#qry-contact-email').checked, Q1));
await page.click('[data-fid="qry-continue"]');
await page.waitForTimeout(150);
check('no request exists before "Create demo request"', await page.evaluate(() => window.BDCNotice.query.state().requests.length === 0));

// AC-15 style: role-based buttons work
const panel = page.locator(PANEL);
await panel.getByRole('button', { name: /create demo request/i }).click();
await page.waitForTimeout(200);
let cf = await page.evaluate(() => {
  const p = document.querySelector('[data-overlay="query"]');
  return {
    step: p.getAttribute('data-step'),
    heading: p.querySelector('.qry-step-title').textContent,
    text: p.querySelector('.qry-confirm-text')?.textContent,
    ref: p.querySelector('.qry-ref-value')?.textContent,
    notCase: p.querySelector('.qry-note')?.textContent || '',
    summary: p.querySelector('.qry-summary')?.textContent || '',
    focus: document.activeElement?.classList.contains('qry-step-title'),
    footer: [...p.querySelectorAll('.qry-footer button')].map((b) => b.textContent.trim()),
  };
});
check('confirmation shows the exact text', cf.text === CONFIRM_EN && (await panelText()).includes(CONFIRM_EN), cf.text);
check('reference prefixed DEMO- (DEMO-Q-0001)', cf.ref === 'DEMO-Q-0001', cf.ref);
check('confirmation heading is Step 3 of 3 and receives focus', /Step 3 of 3/.test(cf.heading) && cf.focus);
check('clarifies this is not a case acknowledgement', /not a case number or an acknowledgement/.test(cf.notCase));
check('plain-text summary has ref, statement, item and the question', cf.summary.includes('Demo request DEMO-Q-0001') && cf.summary.includes(CONFIRM_EN) && cf.summary.includes('Selected item: December 2026 payment') && cf.summary.includes(Q1), cf.summary.slice(0, 200));
check('"Start a new question" and "Close" offered', cf.footer.join('|') === 'Start a new question|Close', cf.footer);
check('scrollable summary is a focusable, named region', await page.evaluate(() => { const p = document.querySelector('.qry-summary'); return p.getAttribute('role') === 'region' && p.tabIndex === 0 && /DEMO-Q-0001/.test(p.getAttribute('aria-label')); }));
check('step heading keeps a visible focus style (no outline:none)', await page.evaluate(() => {
  const hd = document.querySelector('.qry-step-title');
  const rule = [...document.styleSheets].flatMap((ss) => { try { return [...ss.cssRules]; } catch (e) { return []; } }).find((r) => r.selectorText === '.qry-step-title');
  return !!hd && !!rule && rule.style.outlineStyle !== 'none' && rule.style.outline !== 'none';
}));
await axeCheck('axe: no WCAG A/AA violations on the confirmation step', PANEL);
await page.waitForTimeout(80);
check('creation announced', await page.evaluate((c) => document.getElementById('live-polite').textContent === c, CONFIRM_EN));
await shot(page, 'query-en-1280-confirm');

ev = await events();
const created = ev.filter((e) => e.type === 'demo_query_created');
check('demo_query_created logged once with the reference id', created.length === 1 && created[0].id === 'DEMO-Q-0001', created);
const evJson = JSON.stringify(ev);
check('events contain no question text', !evJson.includes('December payment') && !evJson.includes('Why') && !evJson.includes('aaaa'));

// Copy
await page.click('[data-fid="qry-copy"]');
await page.waitForTimeout(250);
const copyStatus = await page.evaluate(() => document.querySelector('.qry-status')?.textContent || '');
check('Copy gives status feedback', ['Summary copied to the clipboard.', 'Copying is not available in this browser. Select the summary text and copy it manually.'].includes(copyStatus), copyStatus);
let clip = null;
try { clip = await page.evaluate(() => navigator.clipboard.readText()); } catch (e) { clip = null; }
if (clip !== null && copyStatus.startsWith('Summary copied')) check('clipboard holds the plain-text summary', clip.includes('DEMO-Q-0001') && clip.includes(Q1), clip.slice(0, 120));

// Downloads
let [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }), page.click('[data-fid="qry-download-json"]')]);
let content = readFileSync(await dl.path(), 'utf8');
let json = null;
try { json = JSON.parse(content); } catch (e) { json = null; }
check('JSON download triggers (DEMO-Q-0001.json)', dl.suggestedFilename() === 'DEMO-Q-0001.json' && !!json, dl.suggestedFilename());
check('JSON has reference, demo flag, statement, item, topic and question', json && json.reference === 'DEMO-Q-0001' && json.demo === true && json.statement === CONFIRM_EN && json.selectedItem?.id === '2026-12' && json.topic?.id === 'interest' && json.question === Q1 && json.preferredContactMethod === 'email', json);
[dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }), page.click('[data-fid="qry-download-txt"]')]);
content = readFileSync(await dl.path(), 'utf8');
check('text download triggers (DEMO-Q-0001.txt) with the summary', dl.suggestedFilename() === 'DEMO-Q-0001.txt' && content.includes(CONFIRM_EN) && content.includes(Q1));
check('download status shown', await page.evaluate(() => /Download started: DEMO-Q-0001\.txt/.test(document.querySelector('.qry-status')?.textContent || '')));

// Focus trap inside the panel
let trapped = true;
for (let i = 0; i < 25; i += 1) {
  await page.keyboard.press('Tab');
  if (!(await page.evaluate(() => !!document.activeElement.closest('[data-overlay="query"]')))) { trapped = false; break; }
}
check('focus stays inside the panel', trapped);
check('visible focus indicator', await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2; }));

// Close returns focus
await page.click('[data-fid="qry-done-close"]');
await panelClosed();
check('Close closes the panel and returns focus to the trigger', (await activeInfo()).fid === 'footer-insights');

/* ------------------------------------------------------------------ */
/* 6. Draft persistence, new ctx, locale switch                        */
/* ------------------------------------------------------------------ */
await openQuery({ kind: 'general' });
check('after creation a fresh draft starts (empty, general)', await page.evaluate(() => document.querySelector('#qry-question').value === '' && /^None/.test(document.querySelector('.qry-item-text').textContent) && document.querySelector('#qry-topic').value === ''));
await page.fill('#qry-question', Q_DRAFT);
await page.keyboard.press('Escape');
await panelClosed();
check('Escape closes; the draft is kept in memory', await page.evaluate((q) => window.BDCNotice.query.state().draft.text === q, Q_DRAFT));
await openQuery({ kind: 'card', id: 'maturity', section: 'changes' });
v = await page.evaluate(() => ({ text: document.querySelector('#qry-question').value, item: document.querySelector('.qry-item-text').textContent, topic: document.querySelector('#qry-topic').value }));
check('reopening with a new ctx keeps the typed question', v.text === Q_DRAFT, v);
check('…and updates the selected item and untouched topic', v.item === 'Final payment date (maturity)' && v.topic === 'maturity', v);
await page.evaluate(() => window.BDCNotice.query.open({ kind: 'general', topic: 'interest' }));
await page.waitForTimeout(120);
v = await page.evaluate(() => ({ text: document.querySelector('#qry-question').value, item: document.querySelector('.qry-item-text').textContent, topic: document.querySelector('#qry-topic').value }));
check('an explicit topic on a general reopen replaces an untouched inferred topic', v.topic === 'interest' && v.text === Q_DRAFT && v.item === 'Final payment date (maturity)', v);
await page.selectOption('#qry-topic', 'maturity');
await page.evaluate(() => window.BDCNotice.query.open({ kind: 'general', topic: 'payment' }));
await page.waitForTimeout(120);
check('…but never overrides a topic the user chose', await page.evaluate(() => document.querySelector('#qry-topic').value === 'maturity'));

// Locale switch while open
await page.focus('#qry-question');
await page.evaluate(() => { const ta = document.querySelector('#qry-question'); ta.setSelectionRange(5, 5); });
await page.evaluate(() => window.BDCNotice.i18n.setLocale('fr-CA'));
await page.waitForTimeout(250);
v = await page.evaluate(() => {
  const p = document.querySelector('[data-overlay="query"]');
  const ta = p.querySelector('#qry-question');
  return {
    title: p.querySelector('.overlay-title').textContent,
    step: p.querySelector('.qry-step-title').textContent,
    text: ta.value,
    lang: ta.getAttribute('lang'),
    tag: p.querySelector('.qry-lang-tag')?.textContent,
    kept: !p.querySelector('.qry-kept-note').hidden,
    item: p.querySelector('.qry-item-text').textContent,
    topic: p.querySelector('#qry-topic').selectedOptions[0].textContent,
    langRow: p.querySelector('.qry-ctx-strong').textContent,
    focus: document.activeElement === ta,
    caret: ta.selectionStart,
    close: p.querySelector('.overlay-close').getAttribute('aria-label'),
  };
});
check('locale switch relabels the open panel in French', v.title === 'Poser une question' && /Étape 1 sur 3/.test(v.step) && v.close === 'Fermer' && v.topic === 'Échéance' && v.langRow === 'Français', v);
check('French panel uses no-break spaces before ":" and inside « »', badFrenchSpacing(await page.evaluate((s) => document.querySelector(s).textContent, PANEL)) === 0);
check('typed question preserved, never translated, lang stays en-CA', v.text === Q_DRAFT && v.lang === 'en-CA', v);
check('"Rédigé en anglais" + kept-as-written note', v.tag === 'Rédigé en anglais' && v.kept, v);
check('focus and caret preserved in the textarea', v.focus && v.caret === 5, v);
check('item relabelled in French', v.item === 'Date du dernier versement (échéance)', v.item);
check('no missing keys in French panel', (await missingKeys(page)).length === 0, await missingKeys(page));
await page.setViewportSize({ width: 320, height: 720 });
await page.waitForTimeout(200);
let of = await overflowReport(page);
check('fr-CA 320px: query panel has no horizontal overflow', !of.overflow && !of.offenders.length, of.offenders.slice(0, 3));
check('fr-CA 320px: panel is full width', await page.evaluate(() => Math.round(document.querySelector('[data-overlay="query"]').getBoundingClientRect().width) === 320));
await shot(page, 'query-fr-320-draft');
await page.evaluate(() => { document.querySelector('.qry-scroll').scrollTop = 600; });
await shot(page, 'query-fr-320-draft-2');
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(150);
await shot(page, 'query-fr-390-draft');

// Empty submit in French → French errors
await page.fill('#qry-question', '');
await page.click('[data-fid="qry-continue"]');
await page.waitForTimeout(150);
check('French error summary and messages', await page.evaluate(() => document.querySelector('.qry-error-title')?.textContent === 'Veuillez corriger ce qui suit' && /Saisissez votre question/.test(document.querySelector('.qry-error-summary').textContent)));
await shot(page, 'query-fr-390-errors');

// Question typed in English while the UI is French keeps English
await page.fill('#qry-question', Q_FR_TYPED_EN);
check('a new first input in fr-CA records the current locale', await page.evaluate(() => window.BDCNotice.query.state().draft.lang === 'fr-CA'));
await page.evaluate(() => window.BDCNotice.i18n.setLocale('en-CA'));
await page.waitForTimeout(150);
check('switching back shows "Written in French"', await page.evaluate(() => document.querySelector('.qry-lang-tag')?.textContent === 'Written in French'));
await page.evaluate(() => window.BDCNotice.i18n.setLocale('fr-CA'));
await page.waitForTimeout(150);
await page.click('[data-fid="qry-continue"]');
await page.waitForTimeout(150);
await shot(page, 'query-fr-390-review');
v = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.qry-review-row')].map((r) => [r.querySelector('dt').textContent, r.querySelector('dd').textContent])));
check('French review: standalone language capitalised, in-sentence lowercase', v['Langue préférée'] === 'Français' && v['Langue de votre question'] === 'Rédigé en français', v);
await page.click('[data-fid="qry-create"]');
await page.waitForTimeout(200);
cf = await page.evaluate(() => ({ text: document.querySelector('.qry-confirm-text')?.textContent, ref: document.querySelector('.qry-ref-value')?.textContent }));
check('French confirmation exact text', cf.text === CONFIRM_FR, cf.text);
check('references are sequential per session (DEMO-Q-0002)', cf.ref === 'DEMO-Q-0002', cf.ref);
of = await overflowReport(page);
check('fr-CA 390px confirmation: no horizontal overflow', !of.overflow && !of.offenders.length, of.offenders.slice(0, 3));
await shot(page, 'query-fr-390-confirm');
check('no banned framing in panel text (EN/FR)', !BANNED.test(await panelText()), (await panelText()).match(BANNED));
await page.click('[data-fid="qry-new"]');
await page.waitForTimeout(150);
check('"Poser une autre question" starts a fresh draft at step 1', await page.evaluate(() => document.querySelector('[data-overlay="query"]').getAttribute('data-step') === 'draft' && document.querySelector('#qry-question').value === ''));
await page.keyboard.press('Escape');
await panelClosed();

// Keyboard-reduced viewport (AC-09 style)
await page.evaluate(() => window.BDCNotice.i18n.setLocale('en-CA'));
await page.setViewportSize({ width: 390, height: 420 });
await page.waitForTimeout(150);
await openQuery({ kind: 'general' });
v = await page.evaluate(() => {
  const out = {};
  for (const [k, s] of [['textarea', '[data-overlay="query"] textarea'], ['continue', '[data-fid="qry-continue"]']]) {
    const el = document.querySelector(s);
    el.scrollIntoView({ block: 'nearest' });
    const r = el.getBoundingClientRect();
    out[k] = r.bottom <= window.innerHeight + 1 && r.top >= 0;
  }
  return out;
});
check('390×420: textarea and Continue reachable on screen', v.textarea && v.continue, v);
await shot(page, 'query-en-390x420');
await page.keyboard.press('Escape');
await panelClosed();
await page.setViewportSize({ width: 1280, height: 900 });

/* ------------------------------------------------------------------ */
/* 7. Insights                                                         */
/* ------------------------------------------------------------------ */
await page.evaluate(() => { location.hash = '#/insights'; });
await page.waitForTimeout(250);
let ins = await page.evaluate(() => {
  const v = document.querySelector('#view');
  const tile = (tp) => Number(v.querySelector(`.ins-tile[data-type="${tp}"] .ins-tile-count`)?.textContent.replace(/\D/g, ''));
  return {
    h1: [...v.querySelectorAll('h1')].map((e) => e.textContent),
    tiles: v.querySelectorAll('.ins-tile').length,
    types: window.BDCNotice.events.TYPES.length,
    created: tile('demo_query_created'),
    drafted: tile('query_drafted'),
    sections: tile('section_viewed'),
    timeline: v.querySelectorAll('.ins-event[data-seq]').length,
    first: v.querySelector('.ins-event[data-seq]')?.getAttribute('data-type'),
    showing: v.querySelector('#ins-timeline-showing')?.textContent,
    framing: v.querySelector('.ins-framing')?.textContent || '',
    requests: v.querySelector('.ins-ms')?.textContent || '',
    widget: v.querySelector('.ins-widget')?.textContent || '',
    text: v.innerText,
  };
});
const allEvents = await events();
check('arriving on the view does not flash its own section_viewed as a "new" event', await page.evaluate(() => !document.querySelector('.ins-event.is-new') && !document.querySelector('.ins-tile.is-bumped')));
check('insights h1 "Demo insights" (single h1)', ins.h1.length === 1 && ins.h1[0] === 'Demo insights', ins.h1);
check('a count tile for each of the 15 event types', ins.tiles === 15 && ins.types === 15, ins.tiles);
check('tile counts match App.events.counts()', ins.created === 2 && ins.drafted >= 1 && ins.sections === allEvents.filter((e) => e.type === 'section_viewed').length, ins);
check('timeline lists events newest first with "Showing n of m"', ins.first === allEvents[allEvents.length - 1].type && /^Showing \d+ of \d+$/.test(ins.showing), ins);
check('framing: local counts, not BDC outcomes; no admin role; video ≠ comprehension; reviewed ≠ consent', /not measured BDC outcomes/.test(ins.framing) && /administrative/.test(ins.framing) && /understood/.test(ins.framing) && /not consent/.test(ins.framing) && /Acceptance by a server/.test(ins.framing));
check('milestones show demo requests created (2) with references', /DEMO-Q-0001/.test(ins.requests) && /DEMO-Q-0002/.test(ins.requests), ins.requests.slice(0, 300));
check('widget status reports the script element (matched by fragment)', /Script element in this page\s*Yes/.test(ins.widget), ins.widget.slice(0, 200));
check('no question text on the insights page', !ins.text.includes(Q1) && !ins.text.includes(Q_DRAFT));
check('no banned framing on insights (EN)', !BANNED.test(ins.text), ins.text.match(BANNED));

// Live update
const before = await page.evaluate(() => document.querySelectorAll('.ins-event[data-seq]').length);
await page.focus('[data-fid="ins-export"]');
await page.evaluate(() => window.BDCNotice.events.log('glossary_opened', { id: 'principal' }));
await page.waitForTimeout(150);
v = await page.evaluate(() => ({
  count: document.querySelector('.ins-tile[data-type="glossary_opened"] .ins-tile-count').textContent,
  first: document.querySelector('.ins-event[data-seq]').getAttribute('data-type'),
  target: document.querySelector('.ins-event[data-seq] .ins-event-target')?.textContent,
  n: document.querySelectorAll('.ins-event[data-seq]').length,
  total: document.querySelector('.ins-total').textContent,
  focus: document.activeElement?.getAttribute('data-fid'),
}));
check('counts and timeline update live on a new event', v.count === '1' && v.first === 'glossary_opened' && v.target === 'Principal' && (v.n === before + 1 || v.n === before), v);
check('live update keeps focus in place', v.focus === 'ins-export', v.focus);

// Timeline cap
await page.evaluate(() => { for (let i = 0; i < 30; i += 1) window.BDCNotice.events.log('detail_opened', { id: `changes:${i % 2 ? 'interest' : 'principal'}` }); });
await page.waitForTimeout(150);
v = await page.evaluate(() => ({ n: document.querySelectorAll('.ins-event[data-seq]').length, total: window.BDCNotice.events.all().length, showing: document.querySelector('#ins-timeline-showing').textContent, more: !document.querySelector('[data-fid="ins-more"]').hidden }));
check('timeline display is capped with "Showing n of m" and "Show more"', v.n === 25 && v.showing === `Showing 25 of ${v.total}` && v.more, v);
await page.focus('[data-fid="ins-more"]');
await page.keyboard.press('Enter');
await page.waitForTimeout(100);
v = await page.evaluate(() => ({ n: document.querySelectorAll('.ins-event[data-seq]').length, total: window.BDCNotice.events.all().length, hidden: document.querySelector('[data-fid="ins-more"]').hidden, focus: document.activeElement?.classList.contains('ins-event'), seq: document.activeElement?.getAttribute('data-seq') }));
check('"Show more" reveals more events', v.n === Math.min(50, v.total), v);
check('when "Show more" hides itself, focus moves to the first newly shown event (not <body>)', v.hidden && v.focus && v.seq === String(v.total - 25), v);

// Hardship switch
const sw = '[data-fid="ins-hardship"]';
v = await page.evaluate((s) => { const b = document.querySelector(s); return { role: b.getAttribute('role'), checked: b.getAttribute('aria-checked'), name: document.querySelector('label[for="ins-hardship"]').textContent }; }, sw);
check('hardship switch: role=switch, off by default, labelled', v.role === 'switch' && v.checked === 'false' && v.name === 'Simulate a hardship/arrears flag (demo rule)', v);
await page.click(sw);
await page.waitForTimeout(80);
v = await page.evaluate((s) => ({ checked: document.querySelector(s).getAttribute('aria-checked'), flag: window.BDCNotice.session.slice('presenter').simulateHardship, rule: window.BDCNotice.config.rules.suppressBorrowingPromotion(), state: document.querySelector('#ins-hardship-state').textContent }), sw);
check('switch on → session flag + suppressBorrowingPromotion() true', v.checked === 'true' && v.flag === true && v.rule === true && /^On:/.test(v.state), v);
await page.focus(sw);
await page.keyboard.press('Space');
await page.waitForTimeout(80);
v = await page.evaluate((s) => ({ checked: document.querySelector(s).getAttribute('aria-checked'), flag: window.BDCNotice.session.slice('presenter').simulateHardship }), sw);
check('switch operable by keyboard (Space turns it off)', v.checked === 'false' && v.flag === false, v);
check('notice record unchanged by the switch', await page.evaluate(() => Object.isFrozen(window.BDCNotice.record) && !window.BDCNotice.record.client.hardship));

// Survey milestone (help module's slice shape: { rating }) stays separate from "Mark as reviewed"
await page.evaluate(() => { window.BDCNotice.session.slice('survey', () => ({ rating: null, comment: '', dismissed: false })).rating = 'neutral'; window.BDCNotice.router.rerender(); });
await page.waitForTimeout(150);
v = await page.evaluate(() => document.querySelector('.ins-ms')?.innerText || '');
check('milestones show the survey rating separately from "Marked as reviewed"', /Clarity survey\s*Somewhat clear/.test(v) && /Marked as reviewed\s*No/.test(v), v.slice(0, 200));

await page.evaluate(() => { window.BDCNotice.session.slice('review', () => ({ reviewed: false })).reviewed = true; window.BDCNotice.session.changed('review'); });
await page.waitForTimeout(80);
check('milestones refresh live when another slice changes (marked reviewed → Yes)', await page.evaluate(() => /Marked as reviewed\s*Yes/.test(document.querySelector('.ins-ms').innerText)));
await page.evaluate(() => { window.BDCNotice.session.slice('review').reviewed = false; window.BDCNotice.session.changed('review'); });

// Usability tasks
await page.click('[data-fid="ins-answer-nextPayment"]');
await page.waitForTimeout(80);
v = await page.evaluate(() => ({ answer: document.querySelector('.ins-answer-text')?.textContent || '', progress: document.querySelector('#ins-task-progress').textContent }));
check('expected answer uses record values (next payment $1,600, November 30, 2026)', /\$1,600/.test(v.answer) && /November 30, 2026/.test(v.answer), v.answer);
await page.check('#ins-task-nextPayment');
check('ticking a task updates progress', await page.evaluate(() => document.querySelector('#ins-task-progress').textContent === '1 of 4 tasks completed'));
check('four presenter tasks listed', await page.evaluate(() => [...document.querySelectorAll('.ins-task-title')].map((e) => e.textContent).join('|') === 'Find the next payment|Identify when principal payments resume|Explain that the principal remains owing|Identify the additional total interest'));
await page.click('[data-fid="ins-answer-interest"]');
await page.waitForTimeout(60);
check('additional-interest answer keeps the $80 inside the $4,800', await page.evaluate(() => /\$4,800 more interest/.test(document.body.innerText) && /\$80 of additional interest during the postponement is part of this \$4,800, not added to it/.test(document.body.innerText)));

// Export
[dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }), page.click('[data-fid="ins-export"]')]);
content = readFileSync(await dl.path(), 'utf8');
json = JSON.parse(content);
check('Export downloads JSON with notice id, 15 counts and events', dl.suggestedFilename() === 'demo-insights-DEMO-BDC-CHANGE-2026-001.json' && json.noticeId === 'DEMO-BDC-CHANGE-2026-001' && Object.keys(json.counts).length === 15 && json.events.length === (await events()).length, dl.suggestedFilename());
check('export holds identifiers only (no question text)', !content.includes(Q1) && !content.includes(Q_DRAFT) && !content.includes(Q_FR_TYPED_EN) && json.milestones.demoRequestsCreated === 2);
await axeCheck('axe: no WCAG A/AA violations in the insights view', '#view');
await shot(page, 'insights-en-1280', true);

// French + 320
await page.evaluate(() => window.BDCNotice.i18n.setLocale('fr-CA'));
await page.waitForTimeout(250);
v = await page.evaluate(() => ({ h1: document.querySelector('#view h1').textContent, text: document.querySelector('#view').innerText }));
check('French insights view', v.h1 === 'Aperçu de la démo' && /Nombre d’interactions/.test(v.text) && /Simuler un indicateur de difficultés financières/.test(v.text), v.h1);
check('no missing keys on insights (FR)', (await missingKeys(page)).length === 0, await missingKeys(page));
check('no banned framing on insights (FR)', !BANNED.test(v.text), v.text.match(BANNED));
check('French insights uses no-break spaces before ":" and inside « »', badFrenchSpacing(await page.evaluate(() => document.querySelector('#view').textContent)) === 0);
check('French timeline shows "Affichage : n sur m" and capitalised languages', await page.evaluate(() => /^Affichage\u00a0: \d+ sur \d+$/.test(document.querySelector('#ins-timeline-showing').textContent) && [...document.querySelectorAll('.ins-event-meta')].some((m) => /Langue (Français|Anglais)/.test(m.textContent))));
for (const w of [320, 390]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(200);
  of = await overflowReport(page);
  check(`fr-CA ${w}px insights: no horizontal overflow`, !of.overflow && !of.offenders.length, of.offenders.slice(0, 3));
}
await shot(page, 'insights-fr-390', true);
await page.setViewportSize({ width: 1280, height: 900 });
await page.evaluate(() => window.BDCNotice.i18n.setLocale('en-CA'));
await page.waitForTimeout(150);

/* ------------------------------------------------------------------ */
/* 8. Storage and reset                                                */
/* ------------------------------------------------------------------ */
const ls = await page.evaluate(() => ({ keys: Object.keys(localStorage), all: JSON.stringify(localStorage) }));
check('localStorage holds only the preference key', ls.keys.every((k) => k === 'bdc-demo-prefs'), ls.keys);
check('question text never in localStorage', !ls.all.includes('December payment') && !ls.all.includes('final payment date') && !ls.all.includes('interest rate'));

// Leave a draft, then reset through the insights Reset dialog
await openQuery({ kind: 'term', id: 'principal' });
await page.fill('#qry-question', 'Temporary draft to clear');
await page.keyboard.press('Escape');
await panelClosed();
await page.click('[data-fid="ins-reset"]');
await page.waitForSelector('[data-overlay="ins-reset"].is-open');
await page.waitForTimeout(250);
check('Reset asks for confirmation in a dialog', await page.evaluate(() => /Reset this demonstration\?/.test(document.querySelector('[data-overlay="ins-reset"]').innerText)));
await page.click('[data-fid="ins-reset-confirm"]');
await page.waitForTimeout(400);
v = await page.evaluate(() => ({ st: window.BDCNotice.query.state(), hash: location.hash, events: window.BDCNotice.events.all().length, flag: window.BDCNotice.session.slice('presenter', () => ({ simulateHardship: false })).simulateHardship }));
check('session reset clears the draft and created requests', v.st.draft === null && v.st.requests.length === 0, v.st);
check('reset clears events (fresh section view only) and returns to overview', v.hash === '#/overview' && v.events <= 2, v);
await openQuery({ kind: 'general' });
check('after reset the form is empty and numbering restarts', await page.evaluate(() => document.querySelector('#qry-question').value === ''));
await page.fill('#qry-question', 'New question after reset');
await page.selectOption('#qry-topic', 'other');
await page.click('[data-fid="qry-continue"]');
await page.waitForTimeout(120);
await page.click('[data-fid="qry-create"]');
await page.waitForTimeout(150);
check('reference numbering restarts after reset (DEMO-Q-0001)', await page.evaluate(() => document.querySelector('.qry-ref-value')?.textContent === 'DEMO-Q-0001'));
// Reset while the panel is open closes it
await page.evaluate(() => window.BDCNotice.session.reset());
await page.waitForTimeout(150);
check('session reset closes an open query panel', (await page.$(PANEL)) === null);

/* ------------------------------------------------------------------ */
check('no console errors or warnings', consoleMsgs.length === 0, consoleMsgs.slice(0, 5));
check('no unexpected network requests', requests.filter((u) => !u.startsWith('https://accessibilityserver.org/')).length === 0, requests);

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\n✓ query + insights checks passed');
process.exit(failures ? 1 : 0);
