#!/usr/bin/env node
// Overview module QA: greeting (AC-10), headline, four summary cards with
// return navigation (AC-06), honest-cost facts beside the summary (AC-05),
// CTAs, "Mark as reviewed", unchanged terms, media section, both languages,
// reduced motion, keyboard focus and 320px reflow (AC-08).
// Usage: node tests/modules/overview.mjs [path/to/index.html]
import { launch, newPage, gotoApp, overflowReport, missingKeys, DEFAULT_FILE } from '../lib/browser.mjs';

const file = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : DEFAULT_FILE;
let failed = 0;
function check(name, ok, detail) {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${!ok && detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
}
const wait = (page, ms = 200) => page.waitForTimeout(ms);
// Collapse all whitespace (incl. the no-break spaces in fr-CA amounts) for text comparisons.
const N = (str) => String(str || '').replace(/\s+/g, ' ');
const hash = (page) => page.evaluate(() => location.hash);
const activeFid = (page) => page.evaluate(() => {
  const a = document.activeElement;
  const el = a && a.closest('[data-fid]');
  return el ? el.getAttribute('data-fid') : null;
});
const backToOverview = async (page) => { await page.evaluate(() => { location.hash = '#/overview'; }); await wait(page, 250); };

// Expected values computed in the page from the issued record, so they follow the active locale.
const expected = (page) => page.evaluate(() => {
  const A = window.BDCNotice;
  const R = A.record;
  const D = R.derived;
  const m = (c) => A.fmt.money(c, { compact: true });
  const d = (iso) => A.fmt.date(iso, 'long');
  return {
    locale: A.i18n.locale,
    name: R.client.givenName,
    noticeId: R.noticeId,
    cards: A.SUMMARY_CARDS.slice(),
    next: [m(R.revisedSchedule[0].totalCents), d(R.revisedSchedule[0].date)],
    resume: [d(R.change.resumePrincipalDate), m(D.firstResumedPaymentCents)],
    relief: [m(D.nearTermPaymentReductionCents), m(D.originalNearTermPaymentsCents), m(D.revisedNearTermPaymentsCents)],
    extra: [m(D.additionalLifetimeInterestCents), m(D.originalTotalInterestCents), m(D.revisedTotalInterestCents)],
    maturity: [d(R.change.originalMaturity), d(R.change.revisedMaturity)],
    deferred: m(D.principalDeferredCents),
    rate: A.fmt.percentFromBp(R.loan.annualRateBasisPoints),
    instalment: m(R.loan.monthlyPrincipalCents),
    fee: m(R.change.feeCents),
    loanId: R.loan.id,
  };
});

const TEXT = {
  'en-CA': {
    greeting: (n) => `Hello, ${n}. Let’s walk through your financing update.`,
    title: 'Your principal payments are postponed for three months.',
    effective: 'November 1, 2026',
    owing: 'remains owing',
    reviewed: 'Marked as reviewed in this demo. This is a local note only — not acceptance, consent or proof of understanding.',
    banned: /forgiv|interest-free|interest free|holiday|saving/i,
  },
  'fr-CA': {
    greeting: (n) => `Bonjour ${n}. Faisons le point sur la modification de votre financement.`,
    title: 'Vos remboursements de capital sont reportés de trois mois.',
    effective: '1er novembre 2026',
    // R-35: « capital » is singular, so « reporté » (as on Ce qui change).
    owing: 'de capital reporté restent dus',
    reviewed: 'Marqué comme consulté dans cette démo. Il s’agit uniquement d’une note locale, et non d’une acceptation, d’un consentement ni d’une preuve de compréhension.',
    banned: /remise de dette|annulation|sans intérêt|congé|économie/i,
  },
};

async function staticChecks(page, label) {
  const e = await expected(page);
  const T = TEXT[e.locale];
  const s = await page.evaluate(() => {
    const view = document.getElementById('view');
    const txt = (sel) => { const el = view.querySelector(sel); return el ? el.textContent.replace(/\s+/g, ' ').trim() : null; };
    const cards = [...view.querySelectorAll('.ov-card')].map((c) => ({
      id: c.dataset.card,
      text: c.textContent.replace(/\s+/g, ' '),
      detail: (c.querySelector('.ov-detail-link') || {}).getAttribute?.('data-fid') || null,
      href: (c.querySelector('.ov-detail-link') || {}).getAttribute?.('href') || null,
      explain: !!c.querySelector('[data-fid^="explain-summary-"]'),
    }));
    const beside = view.querySelector('.ov-beside');
    const cardsBox = view.querySelector('.ov-cards').getBoundingClientRect();
    const besideBox = beside ? beside.getBoundingClientRect() : null;
    const hs = view.querySelector('.ov-hs');
    // Words on the first rendered line of the h1 (guards against a one-word first line)
    const h1El = view.querySelector('h1');
    const firstLineWords = (() => {
      const tn = h1El && h1El.firstChild;
      if (!tn || tn.nodeType !== 3) return 0;
      const re = /\S+/g;
      let m; let top = null; let n = 0;
      while ((m = re.exec(tn.data))) {
        const r = document.createRange();
        r.setStart(tn, m.index); r.setEnd(tn, m.index + m[0].length);
        const rt = r.getClientRects()[0];
        if (!rt) break;
        if (top === null) top = rt.top;
        if (Math.abs(rt.top - top) > 2) break;
        n += 1;
      }
      return n;
    })();
    const cta = (fid) => { const el = view.querySelector(`[data-fid="${fid}"]`); return el ? el.getBoundingClientRect() : null; };
    const ctaP = cta('overview-cta-changes');
    const ctaW = cta('overview-cta-watch');
    const ord = view.querySelector('.section-header .overline .ov-ord');
    const mount = view.querySelector('.ov-media-mount');
    return {
      firstLineWords,
      h1Lines: h1El ? Math.round(h1El.getBoundingClientRect().height / parseFloat(getComputedStyle(h1El).lineHeight)) : 0,
      ctaSameRow: !!(ctaP && ctaW && Math.abs(ctaP.top - ctaW.top) < 2),
      ordinal: ord ? { text: ord.textContent, transform: getComputedStyle(ord).textTransform } : null,
      besideTag: beside ? beside.tagName.toLowerCase() : null,
      detailNames: cards.map((c) => (view.querySelector(`[data-fid="summary-${c.id}-detail"]`) || {}).getAttribute?.('aria-label') || ''),
      explainNames: cards.map((c) => (view.querySelector(`[data-fid="explain-summary-${c.id}"]`) || {}).getAttribute?.('aria-label') || ''),
      cardLabels: [...view.querySelectorAll('.ov-card-label')].map((x) => x.textContent.trim()),
      mediaKind: mount && mount.querySelector('.media-player') ? 'player' : mount && mount.querySelector('.ov-media-fallback') ? 'placeholder' : 'none',
      hasMediaModule: !!window.BDCNotice.media,
      h1s: view.querySelectorAll('h1').length,
      h1: txt('h1'),
      greeting: txt('.ov-greeting-text'),
      overline: txt('.section-header .overline'),
      hsHidden: hs && hs.getAttribute('aria-hidden') === 'true' && hs.closest('[aria-hidden="true"]') === hs,
      cards,
      beside: beside ? beside.textContent.replace(/\s+/g, ' ') : '',
      besideVisible: !!(beside && beside.offsetParent && !beside.closest('[hidden], .disclosure-content')),
      besideHasDemoNote: !!(beside && beside.querySelector('.demo-note')),
      besideBeside: besideBox ? besideBox.top < cardsBox.bottom && besideBox.left >= cardsBox.right - 1 : false,
      besideBelow: besideBox ? besideBox.top >= cardsBox.bottom - 1 : false,
      caption: txt('.ov-illus-caption'),
      illusSvgHidden: (view.querySelector('.ov-illus-svg') || {}).getAttribute?.('aria-hidden') === 'true',
      illusShown: getComputedStyle(view.querySelector('.ov-illus')).display !== 'none',
      terms: [...new Set([...view.querySelectorAll('.term[data-term]')].map((b) => b.dataset.term))],
      same: txt('.ov-same'),
      todo: txt('.ov-todo'),
      noAccept: !!view.querySelector('.ov-no-accept'),
      media: !!view.querySelector('#ov-media #ov-media-title'),
      mediaMounted: !!(view.querySelector('.ov-media-mount') && view.querySelector('.ov-media-mount').children.length),
      viewText: view.innerText,
      width: window.innerWidth,
    };
  });
  check(`${label}: exactly one h1 with the approved headline`, s.h1s === 1 && s.h1 === N(T.title), s.h1);
  check(`${label}: headline first line holds more than one word`, s.firstLineWords >= 2, { words: s.firstLineWords, lines: s.h1Lines });
  check(`${label}: headline wraps to at most 4 lines`, s.h1Lines > 0 && s.h1Lines <= 4, s.h1Lines);
  check(`${label}: personalised greeting`, s.greeting === N(T.greeting(e.name)), s.greeting);
  check(`${label}: overline shows the formatted effective date`, !!s.overline && s.overline.includes(N(T.effective)), s.overline);
  if (e.locale === 'fr-CA') check(`${label}: French ordinal "1er" uses a superscript that is not upper-cased`, !!s.ordinal && s.ordinal.text === 'er' && s.ordinal.transform === 'none', s.ordinal);
  if (s.width >= 1100) check(`${label}: primary and secondary CTAs share a row`, s.ctaSameRow);
  check(`${label}: handshake is decorative (aria-hidden)`, s.hsHidden);
  check(`${label}: four summary cards in canonical order`, JSON.stringify(s.cards.map((c) => c.id)) === JSON.stringify(e.cards), s.cards.map((c) => c.id));
  const byId = Object.fromEntries(s.cards.map((c) => [c.id, c]));
  const has = (id, vals) => !!byId[id] && vals.every((v) => byId[id].text.includes(N(v)));
  check(`${label}: next-payment card shows ${e.next.join(' / ')}`, has('next-payment', e.next), byId['next-payment']?.text);
  check(`${label}: resume card shows ${e.resume.join(' / ')}`, has('resume', e.resume), byId.resume?.text);
  check(`${label}: relief card shows ${e.relief.join(' / ')}`, has('relief', e.relief), byId.relief?.text);
  check(`${label}: extra-interest card shows ${e.extra.join(' / ')}`, has('extra-interest', e.extra), byId['extra-interest']?.text);
  const targets = { 'next-payment': '#/payments/2026-11', resume: '#/payments/2027-02', relief: '#/payments/relief', 'extra-interest': '#/payments/cost' };
  check(`${label}: every card has "See the detail" (stable fid, correct target) and Explain chip`,
    s.cards.every((c) => c.detail === `summary-${c.id}-detail` && c.href === targets[c.id] && c.explain), s.cards.map((c) => [c.detail, c.href, c.explain]));
  const detailPrefix = e.locale === 'fr-CA' ? 'Voir le détail\u00a0: ' : 'See the detail: ';
  const explainPrefix = e.locale === 'fr-CA' ? 'Expliquer avec l’IA\u00a0: ' : 'Explain with AI: ';
  check(`${label}: "See the detail" names start with the visible label and name the card`,
    s.detailNames.every((n, i) => n === `${detailPrefix}${s.cardLabels[i]}`), s.detailNames);
  check(`${label}: Explain chips are named after their card`, s.explainNames.every((n, i) => n === `${explainPrefix}${s.cardLabels[i]}`), s.explainNames);
  check(`${label}: honest-cost facts are a labelled section, not a complementary aside`, s.besideTag === 'section', s.besideTag);
  check(`${label}: later final payment visible beside the summary (AC-05)`, s.besideVisible && e.maturity.every((v) => s.beside.includes(N(v))), s.beside);
  check(`${label}: postponed principal still owing visible (AC-05)`, s.besideVisible && s.beside.includes(N(e.deferred)) && s.beside.includes(T.owing), s.beside);
  check(`${label}: demo note near the numbers`, s.besideHasDemoNote);
  if (s.width >= 1000) check(`${label}: facts sit beside the cards at desktop width`, s.besideBeside);
  else check(`${label}: facts follow the cards directly at this width`, s.besideBelow);
  check(`${label}: "What stays the same" lists rate, instalment, fee and loan id`, [e.rate, e.instalment, e.fee, e.loanId].every((v) => s.same && s.same.includes(N(v))), s.same);
  check(`${label}: no-acceptance statement shown`, s.noAccept);
  check(`${label}: glossary triggers for principal, interest, postponement, maturity, fixedRate`, ['principal', 'interest', 'postponement', 'maturity', 'fixedRate'].every((x) => s.terms.includes(x)), s.terms);
  check(`${label}: media section present with the ${s.hasMediaModule ? 'player mounted' : 'unavailable placeholder'}`, s.media && s.mediaMounted && s.mediaKind === (s.hasMediaModule ? 'player' : 'placeholder'), s.mediaKind);
  check(`${label}: illustration caption is text; SVG hidden from AT`, !!s.caption && s.illusSvgHidden, s.caption);
  if (s.width >= 900) check(`${label}: illustration shown at desktop`, s.illusShown);
  if (s.width < 900) check(`${label}: illustration omitted below 900px`, !s.illusShown);
  check(`${label}: no forbidden framing (forgiveness / interest-free / holiday / savings)`, !T.banned.test(s.viewText), (s.viewText.match(T.banned) || [])[0]);
  const mk = await missingKeys(page);
  check(`${label}: no missing dictionary keys`, mk.length === 0, mk);
  const of = await overflowReport(page);
  check(`${label}: no horizontal overflow`, !of.overflow && of.offenders.length === 0, of.offenders.slice(0, 3));
}

const browser = await launch();
try {
  /* ---------- en-CA desktop ---------- */
  const { page, consoleMsgs, requests } = await newPage(browser, { width: 1280, height: 900 });
  await gotoApp(page, '#/overview', file);
  const hsPlay = await page.evaluate(() => {
    const hs = document.querySelector('.ov-hs');
    const hands = hs && hs.querySelector('.ov-hs-hands');
    return { cls: hs && hs.classList.contains('ov-hs--play'), anim: hands ? getComputedStyle(hands).animationName : '', dur: hands ? parseFloat(getComputedStyle(hands).animationDuration) : 0 };
  });
  check('handshake motion plays on first view (~1 s)', hsPlay.cls && hsPlay.anim !== 'none' && hsPlay.dur >= 0.6 && hsPlay.dur <= 1.4, hsPlay);
  const greetedState = await page.evaluate(() => window.BDCNotice.session.slice('overview').greeted === true);
  check('greeting motion remembered in session slice "overview"', greetedState);

  await staticChecks(page, 'en-CA 1280');

  // Summary cards: Level-2 navigation with return to the originating control
  const e = await expected(page);
  const targets = { 'next-payment': '#/payments/2026-11', resume: '#/payments/2027-02', relief: '#/payments/relief', 'extra-interest': '#/payments/cost' };
  for (const id of e.cards) {
    await page.click(`[data-fid="summary-${id}-detail"]`);
    await wait(page, 250);
    const h1 = await hash(page);
    const top = await page.evaluate(() => { const s = window.BDCNotice.session.slice('backStack', () => []); return s[s.length - 1] || null; });
    check(`"${id}" detail navigates to ${targets[id]} with a return entry`, h1 === targets[id] && top && top.fid === `summary-${id}-detail` && top.ctx && top.ctx.kind === 'summary' && top.ctx.id === id, { h1, top });
    await page.evaluate(() => window.BDCNotice.router.back());
    await wait(page, 300);
    const back = await hash(page);
    const fid = await activeFid(page);
    check(`Back from "${id}" returns to Overview and focuses the originating link`, back === '#/overview' && fid === `summary-${id}-detail`, { back, fid });
  }

  // Handshake must not replay after navigating away and back
  const replay = await page.evaluate(() => document.querySelector('.ov-hs').classList.contains('ov-hs--play'));
  check('handshake does not replay later in the session', !replay);

  // Primary CTA → What changed, heading focused
  await page.click('[data-fid="overview-cta-changes"]');
  await wait(page, 250);
  const chg = await page.evaluate(() => ({ hash: location.hash, focusHeading: document.activeElement && document.activeElement.hasAttribute('data-view-heading') }));
  check('primary CTA opens What changed and focuses its heading', chg.hash === '#/changes' && chg.focusHeading, chg);
  await backToOverview(page);

  // Secondary CTA → media section scrolled into view and focused
  await page.click('[data-fid="overview-cta-watch"]');
  await wait(page, 900);
  const media = await page.evaluate(() => {
    const a = document.activeElement;
    const r = a.getBoundingClientRect();
    return { id: a.id, inView: r.top >= -2 && r.top < window.innerHeight * 0.6, hash: location.hash };
  });
  check('secondary CTA scrolls to and focuses the media section', media.id === 'ov-media-title' && media.inView && media.hash === '#/overview', media);
  await page.evaluate(() => window.scrollTo(0, 0));

  // Ask a question (tertiary) → query panel if present, otherwise the Help question route
  const hasQuery = await page.evaluate(() => !!(window.BDCNotice.query && window.BDCNotice.query.open));
  await page.click('[data-fid="overview-cta-ask"]');
  await wait(page, 350);
  if (hasQuery) {
    const open = await page.evaluate(() => !!document.querySelector('#overlay-root .overlay'));
    check('"Ask a question" opens the local query form', open);
    await page.keyboard.press('Escape');
    await wait(page, 300);
  } else {
    check('"Ask a question" falls back to #/help/ask when the query module is absent', (await hash(page)) === '#/help/ask');
    await backToOverview(page);
  }

  // What you need to do → revised schedule with return
  await page.click('[data-fid="overview-open-schedule"]');
  await wait(page, 250);
  check('"Open the revised schedule" goes to #/documents/schedule', (await hash(page)) === '#/documents/schedule');
  await page.evaluate(() => window.BDCNotice.router.back());
  await wait(page, 300);
  check('Back from the schedule restores focus on the link', (await activeFid(page)) === 'overview-open-schedule');

  // Beside-fact notice link (Level 3)
  await page.click('[data-fid="overview-fact-maturity-notice"]');
  await wait(page, 250);
  check('maturity fact links to the formal clause #/documents/maturity', (await hash(page)) === '#/documents/maturity');
  await page.evaluate(() => window.BDCNotice.router.back());
  await wait(page, 300);

  // Mark as reviewed
  await page.click('[data-fid="overview-mark-reviewed"]');
  await wait(page, 200);
  const rv = await page.evaluate(() => {
    const A = window.BDCNotice;
    const st = document.querySelector('.ov-reviewed');
    return {
      status: st ? st.textContent.replace(/\s+/g, ' ').trim() : null,
      focused: document.activeElement === st,
      slice: A.session.slice('review').reviewed,
      events: A.events.all().filter((x) => x.type === 'marked_reviewed').map((x) => x.id),
      live: document.getElementById('live-polite').textContent,
      button: !!document.querySelector('[data-fid="overview-mark-reviewed"]'),
    };
  });
  check('"Mark as reviewed" shows the local-note status', rv.status === N(TEXT['en-CA'].reviewed) && !rv.button, rv.status);
  check('status is focused and announced via aria-live', rv.focused && rv.live === TEXT['en-CA'].reviewed, rv);
  check('records only marked_reviewed {id: noticeId} and review.reviewed = true', rv.slice === true && rv.events.length === 1 && rv.events[0] === e.noticeId, rv);

  /* ---------- switch to fr-CA (state preserved) ---------- */
  await page.click('[data-fid="lang-fr-CA"]');
  await wait(page, 300);
  const frState = await page.evaluate(() => ({
    status: (document.querySelector('.ov-reviewed') || {}).textContent?.replace(/\s+/g, ' ').trim() || null,
    play: document.querySelector('.ov-hs').classList.contains('ov-hs--play'),
    lang: document.documentElement.lang,
  }));
  check('fr-CA: reviewed status kept and translated after language switch', frState.status === N(TEXT['fr-CA'].reviewed) && frState.lang === 'fr-CA', frState);
  check('fr-CA: handshake stays static after language switch', !frState.play);
  await staticChecks(page, 'fr-CA 1280');

  // Reset clears the local review note
  await page.evaluate(() => window.BDCNotice.shell.resetDemo());
  await wait(page, 300);
  const afterReset = await page.evaluate(() => ({ btn: !!document.querySelector('[data-fid="overview-mark-reviewed"]'), status: !!document.querySelector('.ov-reviewed') }));
  check('reset demo clears "Mark as reviewed"', afterReset.btn && !afterReset.status, afterReset);

  // Keyboard: Tab reaches the primary CTA with a visible focus indicator; Enter activates
  await page.evaluate(() => { window.scrollTo(0, 0); document.activeElement && document.activeElement.blur(); });
  let reached = false;
  for (let i = 0; i < 40 && !reached; i += 1) {
    await page.keyboard.press('Tab');
    reached = (await activeFid(page)) === 'overview-cta-changes';
  }
  const focusStyle = await page.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return { visible: a.matches(':focus-visible'), outline: cs.outlineStyle, width: cs.outlineWidth }; });
  check('keyboard: Tab reaches the primary CTA with a visible focus ring', reached && focusStyle.visible && focusStyle.outline !== 'none' && parseFloat(focusStyle.width) >= 2, focusStyle);
  await page.keyboard.press('Enter');
  await wait(page, 250);
  check('keyboard: Enter on the primary CTA opens What changed', (await hash(page)) === '#/changes');
  await backToOverview(page);

  /* ---------- narrow widths, both languages ---------- */
  for (const [loc, w] of [['fr-CA', 320], ['fr-CA', 390], ['fr-CA', 768], ['fr-CA', 1024], ['en-CA', 320], ['en-CA', 768], ['en-CA', 1024]]) {
    await page.evaluate((l) => window.BDCNotice.i18n.setLocale(l), loc);
    await page.setViewportSize({ width: w, height: 900 });
    await wait(page, 250);
    await staticChecks(page, `${loc} ${w}`);
  }

  // R-33: Canadian French typography across the overview namespace.
  {
    const bad = await page.evaluate(() => {
      const out = [];
      const walk = (o, p) => {
        if (typeof o === 'string') { if (/[\s\u00a0\u202f][;?!]/.test(o) || / :/.test(o) || /« | »/.test(o) || /reportés restent/.test(o)) out.push(`${p}: ${o.slice(0, 90)}`); }
        else if (o && typeof o === 'object') Object.keys(o).forEach((key) => walk(o[key], `${p}.${key}`));
      };
      walk(window.BDCNotice.i18n._dicts['fr-CA'].overview, 'overview');
      return out;
    });
    check('fr-CA overview dictionary: no-break space before « : » and inside « », no space before ; ? !, « capital reporté »', bad.length === 0, bad);
  }
  check('no console errors', consoleMsgs.length === 0, consoleMsgs.slice(0, 5));
  check('no external network requests', requests.filter((u) => !u.startsWith('https://accessibilityserver.org/')).length === 0, requests);
  await page.context().close();

  /* ---------- reduced motion: static handshake ---------- */
  const rm = await newPage(browser, { width: 390, height: 844, reducedMotion: 'reduce' });
  await gotoApp(rm.page, '#/overview', file);
  const rmState = await rm.page.evaluate(() => {
    const hs = document.querySelector('.ov-hs');
    return { cls: hs.classList.contains('ov-hs--play'), anim: getComputedStyle(hs.querySelector('.ov-hs-hands')).animationName, present: !!hs };
  });
  check('reduced motion: handshake present but static', rmState.present && !rmState.cls && rmState.anim === 'none', rmState);
  await rm.page.context().close();
} catch (err) {
  failed += 1;
  console.log(`✗ test crashed: ${err.stack || err.message}`);
} finally {
  await browser.close();
}
console.log(failed ? `\n${failed} check(s) failed` : '\n✓ overview module checks passed');
process.exit(failed ? 1 : 0);
