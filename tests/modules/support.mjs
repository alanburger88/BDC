#!/usr/bin/env node
// "Support for you" module QA (PRD section 14, AC-20): exactly three
// restrained resource cards in order, rationale drawn only from the explicit
// fixture field (seasonalInventoryBuild), no rate / amount / eligibility
// claims, the exact loan statement, deliberate external links (new tab,
// noopener noreferrer, visible icon, screen-reader text, resource_opened
// event), local inquiry with the resource context and topic prefilled,
// session dismissal (keyboard, focus, language switch, re-render, reset),
// the hardship rule (help-first card, no borrowing promotion), survey
// independence, #/support/<id> item routing with Back, responsive columns and
// 320/390 px reflow in en-CA and fr-CA. Depends only on core + support.
// Usage: node tests/modules/support.mjs [path/to/index.html]
import { launch, newPage, gotoApp, overflowReport, missingKeys, DEFAULT_FILE } from '../lib/browser.mjs';

const file = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : DEFAULT_FILE;
let failed = 0;
function check(name, ok, detail) {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${!ok && detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 500)}` : ''}`);
}
const wait = (page, ms = 220) => page.waitForTimeout(ms);
const N = (str) => String(str || '').replace(/\s+/g, ' ').trim();
const go = async (page, h) => { await page.evaluate((x) => { location.hash = x; }, h); await wait(page); };
const setLocale = async (page, l) => { await page.evaluate((x) => window.BDCNotice.i18n.setLocale(x), l); await wait(page); };
const rerender = async (page) => { await page.evaluate(() => window.BDCNotice.router.rerender()); await wait(page); };
const activeFid = (page) => page.evaluate(() => {
  const a = document.activeElement;
  const el = a && a.closest('[data-fid]');
  return el ? el.getAttribute('data-fid') : null;
});
const cardIds = (page) => page.evaluate(() => [...document.querySelectorAll('#view article[data-card]')].map((a) => a.dataset.card));
const viewText = (page) => page.evaluate(() => document.querySelector('#view')?.innerText || '');
const setHardship = async (page, on) => {
  await page.evaluate((v) => {
    const A = window.BDCNotice;
    A.session.slice('presenter', () => ({ simulateHardship: false })).simulateHardship = v;
    A.router.rerender();
  }, on);
  await wait(page);
};

const RES = ['financial-management', 'working-capital', 'learning'];
const TEXT = {
  'en-CA': {
    title: 'Support for you',
    titles: ['Financial management consulting', 'Working Capital Loan', 'BDC cash-flow learning resources'],
    statement: 'Explore whether this fits your business. Subject to assessment and approval.',
    inquiry: { 'financial-management': 'Discuss cash-flow planning', 'working-capital': 'Explore financing options' },
    learningAction: 'Explore resources',
    urls: {
      'financial-management': 'https://www.bdc.ca/en/consulting/financial-management',
      'working-capital': 'https://www.bdc.ca/en/financing/working-capital-loan',
      learning: 'https://www.bdc.ca/en/articles-tools/money-finance/manage-finances/seasonal-business-cash-flow',
    },
    external: 'opens an external BDC website',
    seasonal: 'seasonal inventory build',
    never: /survey answers.*name.*language.*browsing/i,
    notPart: /not part of your notice or amendment/i,
    noImply: /does not imply eligibility, pre-approval/i,
    hide: 'Hide this suggestion',
    showHidden: (n) => `Show hidden suggestions (${n})`,
    help: 'Talk to us about your situation',
    rule: /flag is set for this demonstration.*responsible demo rule.*not a BDC policy/i,
    footer: /does not share any data with BDC/i,
    notLending: /not a lending product/i,
    banned: /forgiv|interest-free|interest free|holiday|saving|pre-approved for|you qualify|you are eligible|instant approval|guaranteed approval/i,
  },
  'fr-CA': {
    title: 'Du soutien pour vous',
    titles: ['Consultation en gestion financière', 'Prêt de fonds de roulement', 'Ressources d’apprentissage de BDC sur la trésorerie'],
    statement: 'Voyez si cette solution convient à votre entreprise. Sous réserve d’évaluation et d’approbation.',
    inquiry: { 'financial-management': 'Discuter de votre planification de trésorerie', 'working-capital': 'Explorer les options de financement' },
    learningAction: 'Explorer les ressources',
    urls: {
      'financial-management': 'https://www.bdc.ca/fr/consultation/gestion-financiere',
      'working-capital': 'https://www.bdc.ca/fr/financement/pret-fonds-roulement',
      learning: 'https://www.bdc.ca/fr/articles-outils/argent-finance/gerer-finances/entreprise-saisonniere-flux-tresorerie',
    },
    external: 'ouvre un site Web externe de BDC',
    seasonal: 'constitution de stocks saisonnière',
    never: /sondage.*nom.*langue.*navigation/i,
    notPart: /ne font partie ni de votre avis ni de la modification/i,
    noImply: /n’implique aucune admissibilité, aucune préapprobation/i,
    hide: 'Masquer cette suggestion',
    showHidden: (n) => `Afficher les suggestions masquées (${n})`,
    help: 'Parlez-nous de votre situation',
    rule: /indicateur .*activé pour cette démonstration.*règle de démonstration responsable.*non d’une politique de BDC/i,
    footer: /ne transmet aucune donnée à BDC/i,
    notLending: /non un produit de prêt/i,
    banned: /remise de dette|sans intérêt|congé|économi|préapprouvé|vous êtes admissible|approbation instantanée|approbation garantie/i,
  },
};

const browser = await launch();
const { page, context, consoleMsgs, requests } = await newPage(browser, { width: 1280, height: 900 });
await gotoApp(page, '#/support', file);

// Never let a test click actually leave the page: cancel the default action of
// external links after the module's own click handler has run.
await page.evaluate(() => {
  document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('a[target="_blank"]')) e.preventDefault(); });
});

/* ---------- 1. Content and structure in both languages ---------- */
for (const locale of ['en-CA', 'fr-CA']) {
  await setLocale(page, locale);
  await go(page, '#/support');
  const T = TEXT[locale];
  const info = await page.evaluate(() => {
    const view = document.querySelector('#view');
    return {
      h1: [...view.querySelectorAll('h1')].map((e) => e.textContent),
      lead: view.querySelector('.section-header .lead')?.textContent || '',
      basis: view.querySelector('.sup-basis')?.dataset.basis || null,
      basisText: view.querySelector('.sup-basis')?.innerText || '',
      footer: view.querySelector('.sup-footer')?.innerText || '',
      list: (() => { const l = view.querySelector('ul.sup-grid'); return l ? { role: l.getAttribute('role'), label: l.getAttribute('aria-label') } : null; })(),
      cards: [...view.querySelectorAll('article[data-card]')].map((c) => ({
        id: c.dataset.card,
        title: c.querySelector('h2')?.textContent || '',
        labelledBy: c.getAttribute('aria-labelledby') === c.querySelector('h2')?.id,
        icon: !!c.querySelector('.sup-icon svg[aria-hidden], .sup-icon[aria-hidden="true"] svg'),
        text: c.innerText,
        why: c.querySelector('.sup-why')?.innerText || '',
        whyBasis: c.querySelector('.sup-why')?.dataset.basis || null,
        statement: c.querySelector('.sup-statement')?.textContent || '',
        inquiry: [...c.querySelectorAll('button[data-action="inquiry"]')].map((b) => ({ label: b.querySelector('.btn-label')?.textContent, secondary: b.classList.contains('btn-secondary') })),
        links: [...c.querySelectorAll('a[data-action="external"]')].map((a) => ({
          href: a.getAttribute('href'),
          target: a.getAttribute('target'),
          rel: a.getAttribute('rel') || '',
          label: a.querySelector('.btn-label')?.textContent,
          aria: a.getAttribute('aria-label') || '',
          icon: !!a.querySelector('svg.icon-after'),
          isLink: a.classList.contains('btn-link'),
        })),
        hide: c.querySelector('button[data-action="hide"] .btn-label')?.textContent || '',
      })),
    };
  });
  check(`${locale}: exactly one h1 "${T.title}"`, info.h1.length === 1 && N(info.h1[0]) === T.title, info.h1);
  check(`${locale}: intro says optional, not part of the notice/amendment, no eligibility implied`, T.notPart.test(N(info.lead)) && T.noImply.test(N(info.lead)), info.lead);
  check(`${locale}: exactly three cards in App.RESOURCES order`, JSON.stringify(info.cards.map((c) => c.id)) === JSON.stringify(RES), info.cards.map((c) => c.id));
  check(`${locale}: card titles use the approved product names`, info.cards.every((c, i) => N(c.title) === T.titles[i]), info.cards.map((c) => c.title));
  check(`${locale}: cards are a labelled list of articles named by their headings`, info.list && info.list.role === 'list' && !!info.list.label && info.cards.every((c) => c.labelledBy));
  check(`${locale}: each card has a decorative inline-SVG illustration`, info.cards.every((c) => c.icon));
  check(`${locale}: basis strip names the explicit fixture field only`, info.basis === 'seasonalInventoryBuild' && N(info.basisText).includes(T.seasonal) && T.never.test(N(info.basisText)), info.basisText);
  const fm = info.cards[0];
  const wc = info.cards[1];
  const lr = info.cards[2];
  check(`${locale}: financial-management rationale cites the stated seasonal inventory build`, fm && N(fm.why).includes(T.seasonal) && fm.whyBasis === 'seasonalInventoryBuild', fm && fm.why);
  check(`${locale}: every card has a "why this may be relevant" callout`, info.cards.every((c) => N(c.why).length > 20));
  check(`${locale}: loan card states the exact assessment/approval sentence`, wc && N(wc.statement) === T.statement, wc && wc.statement);
  const amounts = /\$|\d+(?:[.,]\d+)?\s?%|\bmaximum\b|\bmax\b|\brate\b|\btaux\b/i;
  check(`${locale}: loan card shows no rate, amount or maximum`, wc && !amounts.test(wc.text), wc && (wc.text.match(amounts) || [])[0]);
  check(`${locale}: learning card is educational, not a lending product`, lr && T.notLending.test(N(lr.text)));
  check(`${locale}: service and financing cards offer a secondary local-inquiry button with the approved label`,
    [fm, wc].every((c) => c.inquiry.length === 1 && c.inquiry[0].secondary && N(c.inquiry[0].label) === T.inquiry[c.id]), [fm.inquiry, wc.inquiry]);
  check(`${locale}: learning card has no inquiry button and "${T.learningAction}" as its external action`, lr.inquiry.length === 0 && lr.links.length === 1 && N(lr.links[0].label) === T.learningAction, lr);
  for (const c of info.cards) {
    const l = c.links[0];
    check(`${locale}: ${c.id} external link → ${T.urls[c.id].replace('https://www.bdc.ca', '')}`, c.links.length === 1 && l.href === T.urls[c.id], c.links);
    check(`${locale}: ${c.id} link opens a new tab with rel=noopener noreferrer`, l && l.target === '_blank' && /\bnoopener\b/.test(l.rel) && /\bnoreferrer\b/.test(l.rel), l);
    check(`${locale}: ${c.id} link is a text link with a visible external icon and SR text`, l && l.isLink && l.icon && l.aria.includes(T.external) && l.aria.includes(c.title.trim()), l);
    check(`${locale}: ${c.id} card has "${T.hide}"`, N(c.hide) === T.hide, c.hide);
  }
  check(`${locale}: footer says links open BDC's public site and no data is shared`, T.footer.test(N(info.footer)), info.footer);
  const txt = await viewText(page);
  check(`${locale}: no forgiveness / savings / eligibility / instant-approval wording`, !T.banned.test(txt), (txt.match(T.banned) || [])[0]);
  check(`${locale}: no hard-coded dollar amounts anywhere in the view`, !/\$/.test(txt));
  const mk = await missingKeys(page);
  check(`${locale}: no missing dictionary keys`, mk.length === 0, mk);
  if (locale === 'fr-CA') {
    const sp = await page.evaluate(() => {
      const txt = document.querySelector('#view .sup-view').innerText;
      return (txt.match(/.{0,12}(?: [:;!?»]|« ).{0,6}/g) || []).slice(0, 4);
    });
    check('fr-CA: non-breaking spaces before : ; ! ? » and after «', sp.length === 0, sp);
  }
}

/* ---------- 2. Actions (en-CA) ---------- */
await setLocale(page, 'en-CA');
await go(page, '#/support');
const originalQuery = await page.evaluate(() => { window.__origQuery = window.BDCNotice.query; return !!window.BDCNotice.query; });
await page.evaluate(() => {
  window.__q = [];
  window.BDCNotice.query = { open: (ctx, trigger) => { window.__q.push({ ctx, trigger: trigger && trigger.getAttribute('data-fid') }); } };
});
await page.click('button[data-fid="sup-ask-financial-management"]');
await page.click('button[data-fid="sup-ask-working-capital"]');
let q = await page.evaluate(() => window.__q);
check('"Discuss cash-flow planning" opens a local inquiry with the resource context and topic prefilled',
  q[0] && q[0].ctx.kind === 'resource' && q[0].ctx.id === 'financial-management' && q[0].ctx.topic === 'other' && q[0].ctx.section === 'support' && q[0].trigger === 'sup-ask-financial-management', q[0]);
check('"Explore financing options" opens a local inquiry for the working-capital resource',
  q[1] && q[1].ctx.kind === 'resource' && q[1].ctx.id === 'working-capital' && q[1].ctx.topic === 'other', q[1]);

const pagesBefore = context.pages().length;
for (const id of RES) await page.click(`a[data-fid="sup-ext-${id}"]`);
await wait(page);
const ev = await page.evaluate(() => window.BDCNotice.events.all().filter((e) => e.type === 'resource_opened').map((e) => e.id));
check('external link clicks log resource_opened with identifiers only', JSON.stringify(ev) === JSON.stringify(RES), ev);
check('no tab or request is opened without a deliberate click (test cancels navigation)', context.pages().length === pagesBefore && !requests.some((u) => u.includes('bdc.ca')), requests);
const aux = await page.evaluate(() => {
  const before = window.BDCNotice.events.all().filter((e) => e.type === 'resource_opened').length;
  const a = document.querySelector('a[data-fid="sup-ext-learning"]');
  a.dispatchEvent(new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true }));
  a.dispatchEvent(new MouseEvent('auxclick', { button: 2, bubbles: true, cancelable: true }));
  const list = window.BDCNotice.events.all().filter((e) => e.type === 'resource_opened');
  return { added: list.length - before, last: list[list.length - 1].id };
});
check('a middle-click (auxclick button 1) on an external link also logs resource_opened; right-click does not', aux.added === 1 && aux.last === 'learning', aux);
const eventsBeforeRender = await page.evaluate(() => window.BDCNotice.events.all().filter((e) => e.type === 'resource_opened').length);
await rerender(page);
await go(page, '#/support/learning');
const eventsAfterRender = await page.evaluate(() => window.BDCNotice.events.all().filter((e) => e.type === 'resource_opened').length);
check('rendering or routing never logs resource_opened by itself', eventsAfterRender === eventsBeforeRender, { eventsBeforeRender, eventsAfterRender });
await go(page, '#/support');

// Keyboard focus on links is visible
await page.focus('button[data-fid="sup-ask-financial-management"]');
await page.keyboard.press('Tab');
const focusInfo = await page.evaluate(() => {
  const a = document.activeElement;
  const s = getComputedStyle(a);
  return { fid: a.getAttribute('data-fid'), outline: s.outlineStyle, width: s.outlineWidth };
});
check('Tab moves from the inquiry button to the external link with a visible focus ring', focusInfo.fid === 'sup-ext-financial-management' && focusInfo.outline !== 'none' && parseFloat(focusInfo.width) >= 2, focusInfo);

// Full build only: the real query panel opens with the resource context and returns focus.
if (originalQuery) {
  await page.evaluate(() => { window.BDCNotice.query = window.__origQuery; });
  await page.click('button[data-fid="sup-ask-working-capital"]');
  await wait(page, 450);
  const panel = await page.evaluate(() => {
    const d = document.querySelector('.overlay[role="dialog"]');
    return d ? { open: true, text: d.innerText } : { open: false };
  });
  check('full build: real query panel opens showing the Working Capital Loan context', panel.open && panel.text.includes('Working Capital Loan'), panel);
  await page.keyboard.press('Escape');
  await wait(page, 450);
  check('full build: closing the query panel returns focus to the inquiry button', (await activeFid(page)) === 'sup-ask-working-capital', await activeFid(page));
  await page.evaluate(() => { window.BDCNotice.query = { open: (ctx, trigger) => { window.__q.push({ ctx, trigger: trigger && trigger.getAttribute('data-fid') }); } }; });
} else {
  console.log('· isolated build: real query panel check skipped (App.query not included)');
}

/* ---------- 3. Session dismissal ---------- */
await page.focus('button[data-fid="sup-hide-financial-management"]');
await page.keyboard.press('Enter');
await wait(page, 300);
check('Enter on "Hide this suggestion" hides the card', JSON.stringify(await cardIds(page)) === JSON.stringify(['working-capital', 'learning']), await cardIds(page));
check('focus moves to the next card heading after hiding', (await activeFid(page)) === 'sup-title-working-capital', await activeFid(page));
let chip = await page.evaluate(() => document.querySelector('[data-fid="sup-show-hidden"]')?.textContent || '');
check('"Show hidden suggestions (1)" control appears', N(chip) === TEXT['en-CA'].showHidden(1), chip);
check('dismissal is stored in the support session slice', await page.evaluate(() => window.BDCNotice.session.slice('support').dismissed['financial-management'] === true));
const live = await page.evaluate(() => new Promise((r) => setTimeout(() => r(document.getElementById('live-polite').textContent), 120)));
check('hiding is announced politely', /hidden/i.test(live), live);

await setLocale(page, 'fr-CA');
chip = await page.evaluate(() => document.querySelector('[data-fid="sup-show-hidden"]')?.textContent || '');
check('dismissal survives a language switch (fr-CA)', JSON.stringify(await cardIds(page)) === JSON.stringify(['working-capital', 'learning']) && N(chip) === TEXT['fr-CA'].showHidden(1), { ids: await cardIds(page), chip });
await rerender(page);
await go(page, '#/changes');
await go(page, '#/support');
check('dismissal survives re-render and leaving/returning to the section', JSON.stringify(await cardIds(page)) === JSON.stringify(['working-capital', 'learning']), await cardIds(page));
await setLocale(page, 'en-CA');

await page.click('[data-fid="sup-show-hidden"]');
await wait(page, 300);
check('"Show hidden suggestions" restores the card in order', JSON.stringify(await cardIds(page)) === JSON.stringify(RES), await cardIds(page));
check('focus lands on the restored card heading', (await activeFid(page)) === 'sup-title-financial-management', await activeFid(page));
check('restore control disappears when nothing is hidden', !(await page.$('[data-fid="sup-show-hidden"]')));

for (const id of RES) { await page.click(`button[data-fid="sup-hide-${id}"]`); await wait(page, 250); }
const allHidden = await page.evaluate(() => ({ cards: document.querySelectorAll('#view article[data-card]').length, empty: !!document.querySelector('#view .sup-empty'), chip: document.querySelector('[data-fid="sup-show-hidden"]')?.textContent || '', h1: document.querySelectorAll('#view h1').length }));
check('hiding all three shows a calm empty state with "(3)" restore control', allHidden.cards === 0 && allHidden.empty && N(allHidden.chip) === TEXT['en-CA'].showHidden(3) && allHidden.h1 === 1, allHidden);
check('focus moves to the restore control after hiding the last card', (await activeFid(page)) === 'sup-show-hidden', await activeFid(page));

// Deliberate navigation to a hidden card shows it again and focuses it
await page.evaluate(() => window.BDCNotice.router.go('#/support/learning', { focus: 'item' }));
await wait(page, 400);
let target = await page.evaluate(() => ({ ids: [...document.querySelectorAll('#view article[data-card]')].map((a) => a.dataset.card), active: document.activeElement?.id, target: document.querySelector('#view .sup-card.is-target')?.dataset.card }));
check('navigating to #/support/learning re-shows that hidden card, focused and highlighted', target.ids.includes('learning') && target.active === 'sup-card-learning' && target.target === 'learning', target);

// Reset restores everything
await page.evaluate(() => window.BDCNotice.session.reset());
await wait(page);
await go(page, '#/support');
check('demo reset restores all hidden suggestions', JSON.stringify(await cardIds(page)) === JSON.stringify(RES), await cardIds(page));

/* ---------- 3b. Focus stays on screen after hiding (phone width) ---------- */
await page.setViewportSize({ width: 390, height: 700 });
await go(page, '#/support');
const onScreen = () => page.evaluate(() => {
  const a = document.activeElement;
  const r = a.getBoundingClientRect();
  return { fid: a.getAttribute('data-fid'), top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight };
});
const visible = (f) => f.top >= 0 && f.bottom <= f.vh;
for (const [id, expected] of [['financial-management', 'sup-title-working-capital'], ['learning', 'sup-title-working-capital'], ['working-capital', 'sup-show-hidden']]) {
  await page.locator(`[data-fid="sup-hide-${id}"]`).scrollIntoViewIfNeeded();
  await page.focus(`[data-fid="sup-hide-${id}"]`);
  await page.keyboard.press('Enter');
  await wait(page, 900);
  const f = await onScreen();
  check(`390px: after hiding ${id}, focus (${expected}) is moved AND visible in the viewport`, f.fid === expected && visible(f), f);
}
await page.focus('[data-fid="sup-show-hidden"]');
await page.keyboard.press('Enter');
await wait(page, 900);
const fr = await onScreen();
check('390px: after restoring, focus is on the first restored card heading and visible', fr.fid === 'sup-title-financial-management' && visible(fr), fr);
await page.setViewportSize({ width: 1280, height: 900 });
await go(page, '#/support');

/* ---------- 4. Survey independence ---------- */
const snapshot = async () => page.evaluate(() => [...document.querySelectorAll('#view article[data-card]')].map((a) => `${a.dataset.card}|${a.innerText}`).join('\n'));
const baseSnap = await snapshot();
await page.evaluate(() => {
  const s = window.BDCNotice.session.slice('survey', () => ({}));
  Object.assign(s, { rating: 'unhappy', face: 'unhappy', value: 'not-clear', response: 'unhappy', submitted: true });
  window.BDCNotice.session.changed('survey');
  window.BDCNotice.router.rerender();
});
await wait(page);
check('an unhappy survey response changes nothing in Support', (await snapshot()) === baseSnap);

/* ---------- 5. Hardship rule ---------- */
for (const locale of ['en-CA', 'fr-CA']) {
  await setLocale(page, locale);
  await go(page, '#/support');
  await setHardship(page, true);
  const T = TEXT[locale];
  const hs = await page.evaluate(() => {
    const view = document.querySelector('#view');
    const help = view.querySelector('article[data-card="help"]');
    return {
      ids: [...view.querySelectorAll('article[data-card]')].map((a) => a.dataset.card),
      rule: view.querySelector('[data-rule="suppress-borrowing"]')?.innerText || '',
      helpTitle: help?.querySelector('h2')?.textContent || '',
      helpLink: help?.querySelector('a[data-fid="sup-help-link"]')?.getAttribute('href') || null,
      helpAsk: !!help?.querySelector('button[data-fid="sup-ask-help"]'),
      helpHide: !!help?.querySelector('[data-action="hide"]'),
      text: view.innerText,
    };
  });
  check(`${locale}: hardship rule removes the Working Capital Loan card and shows help first (3 cards)`, JSON.stringify(hs.ids) === JSON.stringify(['help', 'financial-management', 'learning']), hs.ids);
  check(`${locale}: help-first card "${T.help}" points to Ask a question and Help & questions`, N(hs.helpTitle) === T.help && hs.helpAsk && hs.helpLink === '#/help' && !hs.helpHide, hs);
  check(`${locale}: note explains a responsible demo rule, not a BDC policy`, T.rule.test(N(hs.rule)), hs.rule);
  check(`${locale}: hardship copy frames a demo flag, never an asserted situation or BDC process`, !/situation applies|s’applique|conversation with a person comes before|passe avant tout nouvel emprunt/i.test(hs.text));
  check(`${locale}: no borrowing promotion text under the rule`, !hs.text.includes(T.titles[1]) && !hs.text.includes(T.inquiry['working-capital']) && !hs.text.includes(T.statement), (hs.text.match(new RegExp(`${T.titles[1]}|${T.inquiry['working-capital']}`)) || [])[0]);
  const mk = await missingKeys(page);
  check(`${locale}: no missing keys under the rule`, mk.length === 0, mk);
}
await setLocale(page, 'en-CA');
await page.evaluate(() => { window.__q = []; });
await page.click('button[data-fid="sup-ask-help"]');
q = await page.evaluate(() => window.__q);
check('help card "Ask a question" opens a general local inquiry', q[0] && q[0].ctx.kind === 'general' && q[0].ctx.topic === 'other', q[0]);
await page.evaluate(() => window.BDCNotice.router.go('#/support/working-capital', { focus: 'item' }));
await wait(page, 400);
check('#/support/working-capital under the rule focuses the help-first card instead', (await page.evaluate(() => document.activeElement?.id)) === 'sup-card-help');
await setHardship(page, false);
check('turning the rule off restores the three standard cards', JSON.stringify(await cardIds(page)) === JSON.stringify(RES), await cardIds(page));
await page.evaluate((had) => { if (had) window.BDCNotice.query = window.__origQuery; else delete window.BDCNotice.query; }, originalQuery);

/* ---------- 6. Item routes and Back ---------- */
await go(page, '#/changes');
await page.evaluate(() => window.BDCNotice.ui.goWithReturn('#/support/working-capital', null, 'origin-x', 'item'));
await wait(page, 450);
const routed = await page.evaluate(() => ({
  active: document.activeElement?.id,
  back: document.querySelector('#view .back-nav')?.innerText || '',
  backFirst: document.querySelector('#view .sup-view')?.firstElementChild?.classList.contains('back-nav'),
  h1: document.querySelectorAll('#view h1').length,
}));
check('#/support/working-capital scrolls to and focuses that card', routed.active === 'sup-card-working-capital', routed);
check('Back control appears at the top when Support was reached from elsewhere', routed.backFirst && /What changed/.test(routed.back) && routed.h1 === 1, routed);
await page.click('[data-fid="back-control"]');
await wait(page, 350);
check('Back returns to the originating section', (await page.evaluate(() => location.hash)) === '#/changes');
await go(page, '#/support/unknown-card');
check('unknown item falls back to the list without errors', JSON.stringify(await cardIds(page)) === JSON.stringify(RES));

/* ---------- 7. Layout and reflow ---------- */
await go(page, '#/support');
const cols = async () => page.evaluate(() => [...document.querySelectorAll('#view article[data-card]')].map((a) => { const r = a.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), h: Math.round(r.height) }; }));
let c = await cols();
check('1280px: three cards side by side, top-aligned', new Set(c.map((x) => x.t)).size === 1 && new Set(c.map((x) => x.l)).size === 3, c);
// S-10: the cards do not share the same parts (the learning card has no inquiry
// button), so each keeps its natural height and its actions follow its content:
// no blank band above "Explore resources" or any other action, and no blank
// band at the foot of a card.
for (const locale of ['en-CA', 'fr-CA']) {
  await setLocale(page, locale);
  for (const w of [1024, 1280, 1440]) {
    await page.setViewportSize({ width: w, height: 900 });
    await wait(page, 120);
    const lay = await page.evaluate(() => [...document.querySelectorAll('#view article[data-card]')].map((a) => {
      const why = a.querySelector('.sup-why');
      const prev = why.previousElementSibling;
      const actions = a.querySelector('.sup-actions');
      const firstAction = actions.firstElementChild.getBoundingClientRect();
      const lastFoot = a.querySelector('.sup-card-foot').lastElementChild.getBoundingClientRect();
      const ar = a.getBoundingClientRect();
      return {
        id: a.dataset.card,
        top: Math.round(ar.top),
        gap: Math.round(why.getBoundingClientRect().top - prev.getBoundingClientRect().bottom),
        whyToAction: Math.round(firstAction.top - why.getBoundingClientRect().bottom),
        footToEdge: Math.round(ar.bottom - lastFoot.bottom),
      };
    }));
    check(`${locale} ${w}px: each rationale follows its content directly (no empty band mid-card)`, lay.every((x) => x.gap >= 0 && x.gap <= 24), lay);
    check(`${locale} ${w}px: actions follow the rationale directly in every card (no blank band above a lone link)`, lay.every((x) => x.whyToAction >= 0 && x.whyToAction <= 32), lay);
    check(`${locale} ${w}px: cards are top-aligned and end right after their hide control`, new Set(lay.map((x) => x.top)).size === 1 && lay.every((x) => x.footToEdge <= 32), lay);
  }
}
await page.setViewportSize({ width: 1280, height: 900 });
// S-07: the inquiry pills ("Discuter de votre planification de trésorerie", the
// longest) never wrap to three lines, from 320 to 1440 px, in either language.
for (const locale of ['en-CA', 'fr-CA']) {
  await setLocale(page, locale);
  const bad = []; const seen = new Set();
  for (let w = 320; w <= 1440; w += 20) {
    await page.setViewportSize({ width: w, height: 900 });
    await wait(page, 40);
    const res = await page.evaluate(() => [...document.querySelectorAll('#view .sup-ask')].filter((b) => b.getClientRects().length).map((b) => {
      const l = b.querySelector('.btn-label');
      const tops = [];
      const tw = document.createTreeWalker(l, NodeFilter.SHOW_TEXT);
      while (tw.nextNode()) { const rg = document.createRange(); rg.selectNodeContents(tw.currentNode); for (const x of rg.getClientRects()) if (x.width > 1) tops.push(x.top); }
      tops.sort((x, y) => x - y);
      let n = 0; let last = -1e9;
      for (const t of tops) if (t - last > 4) { n += 1; last = t; }
      const br = b.getBoundingClientRect(); const lr = l.getBoundingClientRect();
      return { n, inside: lr.right <= br.right + 0.5, text: l.textContent };
    }));
    for (const r of res) { seen.add(r.n); if (r.n > 2 || !r.inside) bad.push(`${w}px ${r.n} lines: ${r.text}`); }
  }
  check(`${locale} 320–1440 px: inquiry pills take at most two lines (seen ${[...seen].sort().join('/')})`, bad.length === 0, bad.slice(0, 8));
}
await page.setViewportSize({ width: 1280, height: 900 });
await setLocale(page, 'en-CA');
await page.setViewportSize({ width: 390, height: 844 });
await wait(page);
c = await cols();
check('390px: one column', new Set(c.map((x) => x.l)).size === 1 && c[0].t < c[1].t && c[1].t < c[2].t, c);
for (const locale of ['en-CA', 'fr-CA']) {
  await setLocale(page, locale);
  for (const w of [320, 390]) {
    await page.setViewportSize({ width: w, height: 800 });
    for (const state of ['default', 'hidden', 'hardship']) {
      await go(page, '#/support');
      if (state === 'hidden') { await page.evaluate(() => { window.BDCNotice.session.slice('support').dismissed = { 'working-capital': true }; window.BDCNotice.router.rerender(); }); await wait(page); }
      if (state === 'hardship') await setHardship(page, true);
      const of = await overflowReport(page);
      check(`${locale} ${w}px (${state}): no horizontal overflow`, !of.overflow && of.offenders.length === 0, of);
      if (state === 'hidden') await page.evaluate(() => { window.BDCNotice.session.slice('support').dismissed = {}; });
      if (state === 'hardship') await setHardship(page, false);
    }
  }
}

/* ---------- 8. Hygiene ---------- */
const badEvents = await page.evaluate(() => window.BDCNotice.events.all().filter((e) => e.id && !/^[a-z0-9][a-z0-9:_.-]{0,63}$/i.test(e.id)));
check('event log holds identifiers only', badEvents.length === 0, badEvents);
check('no console errors or warnings', consoleMsgs.length === 0, consoleMsgs);
const ext = requests.filter((u) => !u.startsWith('https://accessibilityserver.org/'));
check('no unexpected network requests', ext.length === 0, ext);

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\n✓ support module checks passed');
process.exit(failed ? 1 : 0);
