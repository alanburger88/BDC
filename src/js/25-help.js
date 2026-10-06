/* Help & questions (view "help", namespace "help", class prefix hlp-).
 * Searchable FAQ (three groups, accessible accordion, #/help/faq/<id>),
 * glossary (#/help/glossary/<id>, where inline "See in glossary" lands),
 * the local "Ask a question" card (#/help/ask) and the three-face snap
 * survey (App.survey, #/help/survey).
 * Every amount and date comes from App.record formatted with App.fmt and is
 * passed into approved copy as a parameter. Search text and survey comments
 * live in memory only and are never logged. */
(() => {
  const NS = 'help';
  const k = (key, params) => t(`${NS}.${key}`, params);

  /* ---------- FAQ structure (stable ids) ---------- */
  const GROUPS = [
    { id: 'understanding', items: ['why-notice', 'accept', 'debt-reduced', 'rate', 'capitalised'] },
    { id: 'payments', items: ['next-payment', 'still-interest', 'relief', 'restart', 'final-payment', 'fee'] },
    { id: 'help', items: ['ask', 'accountant', 'print-export'] },
  ];
  const FAQ_IDS = GROUPS.reduce((all, g) => all.concat(g.items), []);

  // Per-answer wiring: formal clause, Explain with AI, an optional in-app link and query topic.
  const FAQ_META = {
    'why-notice': { clause: 'purpose', explain: true, topic: 'understanding' },
    accept: { clause: 'action', explain: true, topic: 'understanding' },
    'debt-reduced': { clause: 'cost', explain: true, topic: 'understanding', link: 'cost' },
    rate: { clause: 'unchanged', explain: true, topic: 'interest' },
    capitalised: { clause: 'assumptions', explain: true, topic: 'interest' },
    'next-payment': { clause: 'postponement', explain: true, topic: 'payment', link: 'month' },
    'still-interest': { clause: 'interest', explain: true, topic: 'interest' },
    relief: { clause: 'cost', explain: true, topic: 'payment', link: 'relief' },
    restart: { clause: 'resumption', explain: true, topic: 'payment' },
    'final-payment': { clause: 'maturity', explain: true, topic: 'maturity', link: 'schedule' },
    fee: { clause: 'unchanged', explain: true, topic: 'other' },
    ask: { clause: 'contact', explain: false, topic: 'other', ask: true },
    accountant: { clause: 'contact', explain: true, topic: 'other' },
    'print-export': { clause: 'schedule', explain: true, topic: 'other', link: 'documents' },
  };

  // Glossary term → the formal clause that best supports it.
  const TERM_CLAUSE = {
    principal: 'postponement',
    interest: 'interest',
    postponement: 'postponement',
    instalment: 'schedule',
    maturity: 'maturity',
    outstanding: 'cost',
    fixedRate: 'unchanged',
    cashFlow: 'cost',
    amortisation: 'schedule',
    capitalisedInterest: 'interest',
  };

  /* ---------- experience state (memory only) ---------- */
  const st = () => App.session.slice('help', () => ({ query: '', open: {} }));
  let refs = null; // DOM references for the current render

  /* ---------- formatting helpers (display only) ---------- */
  // One format for every amount in an answer: whole dollars drop ".00", cents stay when present
  // (e.g. $1,600 and $4,026.67), so a sentence never mixes $4,000 with $1,600.00.
  const money = (cents) => App.fmt.money(cents, { compact: true });
  const whole = money;
  const monthId = (iso) => String(iso).slice(0, 7);
  // Day and month stay together; fr-CA uses the ordinal "1er" for the first day.
  function date(iso, style = 'long') {
    let s = App.fmt.date(iso, style);
    if (App.i18n.locale === 'fr-CA' && /^1 /.test(s)) s = s.replace(/^1 /, '1er ');
    return s.replace(' ', ' ');
  }
  const monthName = (iso) => App.fmt.date(iso, 'month');
  const period = (n) => t(`common.months.${n === 1 ? 'one' : 'other'}`, { n: App.fmt.number(n) }).replace(/ /g, ' ');
  function plural(key, n, params) {
    let cat = 'other';
    try { cat = new Intl.PluralRules(App.i18n.locale).select(n) === 'one' ? 'one' : 'other'; } catch (e) { cat = n === 1 ? 'one' : 'other'; }
    return k(`${key}.${cat}`, { n: App.fmt.number(n), ...params });
  }

  // Formatted values from the issued record (re-read on every render so locale switches apply).
  function params() {
    const R = App.record;
    const D = R.derived;
    const L = R.loan;
    const C = R.change;
    const o = R.originalSchedule;
    const r = R.revisedSchedule;
    const n = C.months;
    const first = App.rec.firstResumed();
    return {
      company: R.client.company,
      effectiveDate: date(R.effectiveDate),
      from: monthName(r[0].date),
      to: monthName(r[n - 1].date),
      fromY: date(r[0].date, 'monthYear'),
      toY: date(r[n - 1].date, 'monthYear'),
      period: period(n),
      monthly: whole(L.monthlyPrincipalCents),
      interest: money(D.postponementMonthlyInterestCents),
      rate: App.fmt.percentFromBp(L.annualRateBasisPoints),
      deferred: whole(D.principalDeferredCents),
      relief: whole(D.nearTermPaymentReductionCents),
      extra3: whole(D.additionalInterestFirstThreeMonthsCents),
      extra: whole(D.additionalLifetimeInterestCents),
      origNear: whole(D.originalNearTermPaymentsCents),
      revNear: whole(D.revisedNearTermPaymentsCents),
      resume: date(C.resumePrincipalDate),
      first: money(D.firstResumedPaymentCents),
      firstInterest: money(D.firstResumedInterestCents),
      next: money(r[0].totalCents),
      nextDate: date(r[0].date),
      nextOriginal: money(o[0].totalCents),
      origMaturity: date(C.originalMaturity),
      revMaturity: date(C.revisedMaturity),
      origCount: App.fmt.number(D.originalPaymentCount || o.length),
      revCount: App.fmt.number(D.revisedPaymentCount || r.length),
      fee: money(C.feeCents),
      principal: whole(L.principalAtScheduleStartCents),
      balanceAfter: whole(r[n - 1].closingPrincipalCents),
      finalPayment: money(r[r.length - 1].totalCents),
      firstMonth: monthId(r[0].date),
      resumeMonth: monthId(first ? first.date : C.resumePrincipalDate),
      askLabel: t('common.askAQuestion'),
      askAbout: t('common.askAboutThis'),
      noticeTab: t('nav.documents'),
      paymentsTab: t('nav.payments'),
      printLabel: t('common.print'),
    };
  }

  /* ---------- cross-module actions (guarded: isolated builds may lack them) ---------- */
  function openQuery(trigger, extra = {}) {
    if (App.query && typeof App.query.open === 'function') {
      App.query.open({ kind: 'general', section: 'help', fid: trigger && trigger.getAttribute('data-fid'), ...extra }, trigger);
      return true;
    }
    return false;
  }
  function openClair(trigger) {
    if (App.clair && typeof App.clair.open === 'function') {
      App.clair.open({ kind: 'section', id: 'help', section: 'help', fid: trigger && trigger.getAttribute('data-fid') }, trigger);
      return true;
    }
    return false;
  }
  const hasClair = () => !!(App.clair && typeof App.clair.open === 'function');

  function focusSection(id) {
    const el = document.getElementById(id);
    if (!el) return false;
    el.scrollIntoView({ block: 'start', behavior: App.util.prefersReducedMotion() ? 'auto' : 'smooth' });
    App.util.focusEl(el, { preventScroll: true });
    return true;
  }

  /* ---------- "Back to …" inside a targeted item ---------- */
  function inlineBack(p) {
    const top = App.router.backTop();
    if (!top) return null;
    const from = App.router.parse(top.from);
    let label;
    let ariaLabel;
    if (from.section === NS && from.item === 'faq' && FAQ_IDS.includes(from.sub)) {
      // Came from a term inside an answer on this page: name that question.
      label = k('backToQuestion');
      ariaLabel = `${label}: ${k(`faq.items.${from.sub}.q`, p)}`;
    } else {
      let place = t(`nav.${from.section}`);
      if (top.ctx) place = `${place}: ${App.ui.itemLabel(top.ctx)}`;
      else if (from.item && App.rec.isMonthId(from.item)) place = `${place}: ${App.ui.itemLabel({ kind: 'month', id: from.item })}`;
      label = t('common.backTo', { place });
    }
    return App.ui.button({
      label,
      ariaLabel,
      kind: 'chip',
      iconName: 'arrowLeft',
      fid: 'hlp-back-inline',
      className: 'hlp-back-inline',
      onClick: () => App.router.back(),
    });
  }

  /* ---------- search ---------- */
  function tokens(q) { return App.util.normalize(q).split(' ').filter(Boolean); }
  function matches(toks, entry) {
    return toks.every((tk) => entry.text.includes(tk) || entry.compact.includes(tk.replace(/\s+/g, '')));
  }
  function indexEntry(text) {
    const n = App.util.normalize(text);
    return { text: n, compact: n.replace(/\s+/g, '') };
  }

  function faqPlain(id, p) {
    const paras = tv(`${NS}.faq.items.${id}.a`) || [];
    return paras.map((_, i) => App.ui.plain(k(`faq.items.${id}.a.${i}`, p)).replace(/^- /, '')).join(' ');
  }

  function wouldMatchQuery(kind, id, p) {
    const toks = tokens(st().query);
    if (!toks.length) return true;
    if (kind === 'faq') return matches(toks, indexEntry(`${k(`faq.items.${id}.q`, p)} ${faqPlain(id, p)}`));
    return matches(toks, indexEntry(`${t(`glossary.${id}.term`)} ${t(`glossary.${id}.definition`)}`));
  }

  const announceCount = App.util.debounce(() => {
    if (!refs || !refs.root.isConnected) return;
    const msg = refs.lastStatus;
    if (msg) App.announce(msg);
  }, 650);

  function applySearch({ announce = false } = {}) {
    if (!refs) return;
    const q = st().query;
    const toks = tokens(q);
    const searching = toks.length > 0;
    let faqN = 0;
    let termN = 0;
    refs.faqGroups.forEach((g) => {
      let visible = 0;
      g.items.forEach((id) => {
        const it = refs.faq[id];
        const hit = !searching || matches(toks, it.index);
        const qHit = searching && matches(toks, it.qIndex);
        it.el.hidden = !hit;
        it.found.hidden = !(searching && hit && !qHit);
        if (hit) visible += 1;
      });
      g.el.hidden = visible === 0;
      faqN += visible;
    });
    App.TERMS.forEach((id) => {
      const it = refs.terms[id];
      const hit = !searching || matches(toks, it.index);
      it.el.hidden = !hit;
      if (hit) termN += 1;
    });
    const total = faqN + termN;
    const shown = q.trim();
    refs.clearBtn.hidden = !q;
    refs.faqEmpty.hidden = !(searching && faqN === 0);
    refs.termEmpty.hidden = !(searching && termN === 0);
    refs.faqMeta.hidden = !searching;
    refs.termMeta.hidden = !searching;
    refs.faqMeta.textContent = searching ? k('search.showingFaq', { n: App.fmt.number(faqN), total: App.fmt.number(FAQ_IDS.length) }) : '';
    refs.termMeta.textContent = searching ? k('search.showingTerms', { n: App.fmt.number(termN), total: App.fmt.number(App.TERMS.length) }) : '';
    refs.expandBtn.hidden = searching && faqN === 0;
    App.util.clear(refs.status);
    let statusText = '';
    if (searching && total > 0) {
      statusText = `${plural('search.count', total, { q: shown })}. ${k('search.countDetail', { faq: App.fmt.number(faqN), terms: App.fmt.number(termN) })}.`;
      refs.status.append(h('strong', null, plural('search.count', total, { q: shown })), h('span', null, ` · ${k('search.countDetail', { faq: App.fmt.number(faqN), terms: App.fmt.number(termN) })}`));
    }
    refs.status.hidden = !(searching && total > 0);
    refs.none.hidden = !(searching && total === 0);
    if (searching && total === 0) {
      refs.noneTitle.textContent = k('search.noneTitle', { q: shown });
      statusText = `${k('search.noneTitle', { q: shown })}. ${k('search.noneBody')}`;
    }
    refs.lastStatus = statusText;
    const pop = App.popover.current();
    if (pop && refs.root.contains(pop.trigger) && pop.trigger.closest('[hidden]')) App.popover.close({ restoreFocus: false });
    updateExpandAll();
    if (announce) announceCount();
  }

  function setQuery(value, { announce = true } = {}) {
    st().query = String(value || '').slice(0, 120);
    if (refs && refs.input.value !== st().query) refs.input.value = st().query;
    applySearch({ announce });
  }

  function clearSearch() {
    st().query = '';
    if (!refs) return;
    refs.input.value = '';
    applySearch();
    refs.input.focus();
    App.announce(k('search.cleared'));
  }

  function searchBlock() {
    const inputId = 'hlp-search-input';
    const hintId = 'hlp-search-hint';
    const statusId = 'hlp-search-status';
    const input = h('input', {
      id: inputId,
      class: ['input', 'hlp-search-input'],
      type: 'search',
      fid: 'hlp-search',
      autocomplete: 'off',
      spellcheck: 'false',
      enterkeyhint: 'search',
      maxlength: '120',
      placeholder: k('search.placeholder'),
      'aria-describedby': `${hintId} ${statusId}`,
      value: st().query,
      on: {
        input: (e) => setQuery(e.target.value),
        keydown: (e) => {
          if (e.key === 'Escape' && e.target.value) { e.preventDefault(); e.stopPropagation(); clearSearch(); }
        },
      },
    });
    const clearBtn = h('button', {
      type: 'button',
      class: ['btn', 'btn-icon', 'hlp-search-clear'],
      fid: 'hlp-search-clear',
      'aria-label': k('search.clear'),
      hidden: !st().query,
      on: { click: () => clearSearch() },
    }, App.ui.icon('close', { size: 18 }));
    const status = h('p', { class: 'hlp-search-status', id: statusId, hidden: true });
    const chips = (tv(`${NS}.search.suggestions`) || []).map((word, i) => h('button', {
      type: 'button',
      class: ['btn', 'btn-chip', 'hlp-suggest-chip'],
      fid: `hlp-suggest-${i}`,
      on: { click: () => { setQuery(word); input.focus(); } },
    }, word));
    const noneTitle = h('p', { class: 'hlp-none-title' });
    const noneActions = h('div', { class: ['button-row', 'button-row--tight', 'hlp-none-actions'] },
      hasClair() ? App.ui.button({ label: k('ask.clair'), kind: 'chip', iconName: 'sparkle', fid: 'hlp-none-clair', className: 'btn-explain', onClick: (e) => openClair(e.currentTarget) }) : null,
      App.ui.button({ label: k('ask.button'), kind: 'chip', iconName: 'chat', fid: 'hlp-none-ask', onClick: (e) => { if (!openQuery(e.currentTarget)) focusSection('help-ask'); } }));
    const none = h('div', { class: ['callout', 'callout--neutral', 'hlp-none'], hidden: true },
      App.ui.icon('search'),
      h('div', { class: 'hlp-none-body' }, noneTitle, h('p', null, k(hasClair() ? 'search.noneBody' : 'search.noneBodyNoClair')), noneActions));

    const block = h('div', { class: ['card', 'hlp-search'], role: 'search', 'aria-label': k('search.label') },
      h('label', { class: 'hlp-search-label', for: inputId }, k('search.label')),
      h('div', { class: 'hlp-search-field' },
        h('span', { class: 'hlp-search-icon', 'aria-hidden': 'true' }, App.ui.icon('search')),
        input,
        clearBtn),
      h('p', { class: 'hlp-search-hint', id: hintId }, k('search.hint')),
      h('div', { class: 'hlp-suggest' }, h('span', { class: 'hlp-suggest-label' }, k('search.suggestionsLabel')), chips),
      status);
    return { block, input, clearBtn, status, none, noneTitle };
  }

  /* ---------- FAQ ---------- */
  function answerNodes(id, p) {
    const paras = tv(`${NS}.faq.items.${id}.a`) || [];
    const out = [];
    let list = null;
    paras.forEach((_, i) => {
      const s = k(`faq.items.${id}.a.${i}`, p);
      if (s.startsWith('- ')) {
        if (!list) { list = h('ul', { class: 'hlp-points' }); out.push(list); }
        list.appendChild(h('li', null, App.ui.rich(s.slice(2))));
      } else {
        list = null;
        out.push(h('p', null, App.ui.rich(s)));
      }
    });
    return out;
  }

  function faqLink(id, p) {
    const meta = FAQ_META[id];
    if (!meta.link) return null;
    const originCtx = { kind: 'faq', id };
    const fid = `hlp-faq-link-${id}`;
    const targets = {
      cost: [App.router.href('payments', 'cost'), k('faq.links.cost')],
      relief: [App.router.href('payments', 'relief'), k('faq.links.relief')],
      schedule: [App.router.href('payments', 'schedule'), k('faq.links.schedule')],
      month: [App.router.href('payments', p.firstMonth), k('faq.links.month', { month: date(p.firstMonth, 'monthYear') })],
      documents: [App.router.href('documents'), k('faq.links.documents')],
    };
    const [target, label] = targets[meta.link];
    return App.ui.routeLink({ label, target, originCtx, fid, focus: meta.link === 'documents' ? 'heading' : 'item' });
  }

  function faqActions(id, p) {
    const meta = FAQ_META[id];
    const ctx = { kind: 'faq', id, topic: meta.topic };
    const actions = [];
    if (meta.ask) {
      actions.push(App.ui.button({ label: k('ask.button'), kind: 'chip', iconName: 'chat', fid: 'hlp-faq-ask-question', onClick: (e) => { if (!openQuery(e.currentTarget)) focusSection('help-ask'); } }));
      if (hasClair()) actions.push(App.ui.button({ label: k('ask.clair'), kind: 'chip', iconName: 'sparkle', className: 'btn-explain', fid: 'hlp-faq-ask-clair', onClick: (e) => openClair(e.currentTarget) }));
    }
    if (meta.explain && hasClair()) actions.push(App.ui.explainButton(ctx, { fid: `explain-faq-${id}` }));
    const links = [
      App.ui.noticeLink(meta.clause, { kind: 'faq', id }, { label: k('seeInNotice'), fid: `hlp-faq-notice-${id}` }),
      faqLink(id, p),
    ].filter(Boolean);
    return h('div', { class: 'hlp-faq-actions' },
      actions.length ? h('div', { class: 'hlp-faq-chips' }, actions) : null,
      h('div', { class: 'hlp-faq-links' }, links));
  }

  function faqItem(id, p, open) {
    const btnId = `faq-${id}-btn`;
    const panelId = `faq-${id}-panel`;
    const question = k(`faq.items.${id}.q`, p);
    const found = h('span', { class: 'hlp-found', hidden: true }, App.ui.icon('search', { size: 14 }), k('search.foundInAnswer'));
    const btn = h('button', {
      type: 'button',
      class: 'hlp-faq-btn',
      id: btnId,
      fid: `faq-btn-${id}`,
      'aria-expanded': String(open),
      'aria-controls': panelId,
      on: { click: () => setOpen(id, btn.getAttribute('aria-expanded') !== 'true') },
    },
    h('span', { class: 'hlp-faq-btn-main' }, h('span', { class: 'hlp-faq-btn-text' }, question), found),
    h('span', { class: 'hlp-faq-chevron', 'aria-hidden': 'true' }, App.ui.icon('chevronDown', { size: 18 })));
    const panel = h('div', { class: 'hlp-faq-panel', id: panelId, hidden: !open },
      h('div', { class: 'hlp-faq-answer' }, answerNodes(id, p)),
      faqActions(id, p));
    // data-fid on every focus target lets a language re-render put focus back on it.
    const el = h('div', { class: ['hlp-faq-item', open ? 'is-open' : null], id: `faq-${id}`, fid: `faq-${id}`, tabindex: '-1', 'data-faq': id },
      h('h4', { class: 'hlp-faq-q' }, btn),
      panel);
    return {
      el,
      btn,
      panel,
      found,
      index: indexEntry(`${question} ${faqPlain(id, p)}`),
      qIndex: indexEntry(question),
    };
  }

  function setOpen(id, open) {
    const s = st();
    if (open) s.open[id] = true; else delete s.open[id];
    if (!refs || !refs.faq[id]) return;
    const it = refs.faq[id];
    // A glossary popover inside a closing answer must not linger
    if (!open && App.popover.isOpen() && it.panel.contains(App.popover.current().trigger)) App.popover.close({ restoreFocus: false });
    it.btn.setAttribute('aria-expanded', String(open));
    it.panel.hidden = !open;
    it.el.classList.toggle('is-open', open);
    updateExpandAll();
  }

  function visibleFaqIds() {
    return FAQ_IDS.filter((id) => refs && !refs.faq[id].el.hidden);
  }

  function updateExpandAll() {
    if (!refs) return;
    const ids = visibleFaqIds();
    const allOpen = ids.length > 0 && ids.every((id) => st().open[id]);
    refs.expandBtn.setAttribute('aria-expanded', String(allOpen));
    refs.expandLabel.textContent = allOpen ? k('faq.collapseAll') : k('faq.expandAll');
  }

  function toggleAll() {
    const ids = visibleFaqIds();
    const allOpen = ids.length > 0 && ids.every((id) => st().open[id]);
    ids.forEach((id) => setOpen(id, !allOpen));
  }

  function faqSection(p) {
    const s = st();
    const faq = {};
    const faqGroups = [];
    const expandLabel = h('span', { class: 'btn-label' }, k('faq.expandAll'));
    const expandBtn = h('button', {
      type: 'button',
      class: ['btn', 'btn-chip', 'hlp-expand'],
      fid: 'hlp-expand-all',
      'aria-expanded': 'false',
      on: { click: () => toggleAll() },
    }, App.ui.icon('chevronDown', { size: 16 }), expandLabel);
    const meta = h('p', { class: 'hlp-section-meta', hidden: true });
    const empty = h('p', { class: ['hlp-empty', 'muted'], hidden: true }, k('faq.noMatches'));
    const groups = GROUPS.map((g) => {
      const items = g.items.map((id) => {
        faq[id] = faqItem(id, p, !!s.open[id]);
        return faq[id].el;
      });
      const titleId = `hlp-group-${g.id}`;
      const el = h('section', { class: 'hlp-faq-group', 'aria-labelledby': titleId },
        h('h3', { class: 'hlp-faq-group-title', id: titleId }, k(`faq.groups.${g.id}`)),
        h('div', { class: 'hlp-faq-list' }, items));
      faqGroups.push({ id: g.id, el, items: g.items });
      return el;
    });
    const section = h('section', { class: ['hlp-section', 'hlp-faq'], 'aria-labelledby': 'hlp-faq-title' },
      h('div', { class: 'hlp-section-head' },
        h('div', { class: 'hlp-section-headline' },
          h('h2', { class: 'hlp-section-title', id: 'hlp-faq-title', fid: 'hlp-faq-title', tabindex: '-1' }, k('faq.title')),
          expandBtn),
        h('p', { class: 'hlp-section-intro' }, k('faq.intro')),
        App.ui.demoNote({ className: 'hlp-demo-note' }),
        meta),
      empty,
      groups);
    return { section, faq, faqGroups, expandBtn, expandLabel, meta, empty };
  }

  /* ---------- glossary ---------- */
  function glossarySection(targetId, p) {
    const terms = {};
    const meta = h('p', { class: 'hlp-section-meta', hidden: true });
    const empty = h('p', { class: ['hlp-empty', 'muted'], hidden: true }, k('glossary.noMatches'));
    const list = h('ul', { class: 'hlp-gl-list' }, App.TERMS.map((id) => {
      const term = t(`glossary.${id}.term`);
      const def = t(`glossary.${id}.definition`);
      const termId = `glossary-${id}-term`;
      const el = h('li', { class: 'hlp-gl-item', id: `glossary-${id}`, fid: `glossary-${id}`, tabindex: '-1', 'data-term-entry': id, 'aria-labelledby': termId },
        h('h3', { class: 'hlp-gl-term', id: termId }, term),
        h('p', { class: 'hlp-gl-def' }, def),
        h('div', { class: 'hlp-gl-actions' },
          targetId === id ? inlineBack(p) : null,
          hasClair() ? App.ui.explainButton({ kind: 'term', id }, { fid: `hlp-gl-explain-${id}` }) : null,
          TERM_CLAUSE[id] ? App.ui.noticeLink(TERM_CLAUSE[id], { kind: 'term', id }, { label: k('seeInNotice'), fid: `hlp-gl-notice-${id}` }) : null));
      terms[id] = { el, index: indexEntry(`${term} ${def}`) };
      return el;
    }));
    const section = h('section', { class: ['hlp-section', 'hlp-glossary'], 'aria-labelledby': 'hlp-glossary-title' },
      h('div', { class: 'hlp-section-head' },
        h('h2', { class: 'hlp-section-title', id: 'hlp-glossary-title', fid: 'hlp-glossary-title', tabindex: '-1' }, t('glossary.title')),
        h('p', { class: 'hlp-section-intro' }, k('glossary.intro')),
        meta),
      empty,
      list);
    return { section, terms, meta, empty };
  }

  /* ---------- ask a question ---------- */
  function askCard() {
    const msg = h('p', { class: 'hlp-ask-msg', role: 'status', hidden: true });
    const askBtn = App.ui.button({
      label: k('ask.button'),
      kind: 'primary',
      iconName: 'chat',
      fid: 'hlp-ask-question',
      onClick: (e) => {
        if (!openQuery(e.currentTarget)) {
          msg.textContent = k('ask.unavailable');
          msg.hidden = false;
        }
      },
    });
    const clairBtn = hasClair() ? App.ui.button({ label: k('ask.clair'), kind: 'ghost-light', iconName: 'sparkle', fid: 'hlp-ask-clair', onClick: (e) => openClair(e.currentTarget) }) : null;
    return h('section', { class: ['card', 'card--navy', 'on-dark', 'hlp-ask'], id: 'help-ask', fid: 'help-ask', tabindex: '-1', 'aria-labelledby': 'hlp-ask-title' },
      h('p', { class: 'hlp-ask-overline' }, k('ask.overline')),
      h('h2', { class: 'hlp-ask-title', id: 'hlp-ask-title' }, k('ask.title')),
      h('p', { class: 'hlp-ask-body' }, k('ask.body')),
      h('div', { class: ['button-row', 'hlp-ask-actions'] }, askBtn, clairBtn),
      msg,
      h('p', { class: 'hlp-ask-local' }, App.ui.icon('lock', { size: 16 }), h('span', null, k('ask.local'))),
      clairBtn ? h('p', { class: 'hlp-ask-local' }, App.ui.icon('info', { size: 16 }), h('span', null, k('ask.clairNote'))) : null);
  }

  /* ---------- page ---------- */
  function onThisPage() {
    const links = [
      ['hlp-faq-title', k('faq.title')],
      ['hlp-glossary-title', t('glossary.title')],
      ['help-ask', k('ask.title')],
      ['help-survey', k('survey.title')],
    ];
    return h('nav', { class: 'hlp-toc', 'aria-label': k('onThisPage') },
      h('span', { class: 'hlp-toc-label', 'aria-hidden': 'true' }, k('onThisPage')),
      h('ul', { class: 'hlp-toc-list' }, links.map(([id, label]) => h('li', null, h('a', {
        href: `#${id}`,
        class: 'hlp-toc-link',
        fid: `hlp-toc-${id}`,
        on: { click: (e) => { e.preventDefault(); focusSection(id); } },
      }, label)))));
  }

  function render(el, route, opts = {}) {
    const p = params();
    const s = st();
    const sub = route.sub;
    let targetKind = null;
    if (route.item === 'faq' && FAQ_IDS.includes(sub)) targetKind = 'faq';
    else if (route.item === 'glossary' && App.TERMS.includes(sub)) targetKind = 'glossary';
    else if (route.item === 'ask') targetKind = 'ask';
    else if (route.item === 'survey') targetKind = 'survey';

    // Arriving at an item: open it, and make sure an earlier search does not hide it.
    if (!opts.rerender) {
      if (targetKind === 'faq') s.open[sub] = true;
      if ((targetKind === 'faq' || targetKind === 'glossary') && !wouldMatchQuery(targetKind, sub, p)) s.query = '';
    }

    const search = searchBlock();
    const faq = faqSection(p);
    const glossary = glossarySection(targetKind === 'glossary' ? sub : null, p);
    const ask = askCard();
    const surveyCard = h('section', { class: ['card', 'hlp-survey-card'], id: 'help-survey', fid: 'help-survey', tabindex: '-1' });
    App.survey.mount(surveyCard, { headingLevel: 2, inHelp: true });

    const root = h('div', { class: 'hlp-view' },
      App.ui.backControl(),
      App.ui.sectionHeader({
        overline: k('overline'),
        title: k('title'),
        intro: k('intro'),
        extra: h('div', { class: 'hlp-header-actions' },
          App.ui.routeLink({ label: k('backToNotice'), target: App.router.href('documents'), kind: 'secondary', iconName: 'doc', iconAfter: null, fid: 'hlp-to-notice', focus: 'heading', withReturn: false })),
      }),
      onThisPage(),
      h('div', { class: 'hlp-layout' },
        h('div', { class: 'hlp-main' }, search.block, search.none, faq.section, glossary.section),
        h('div', { class: 'hlp-side' }, ask, surveyCard)));
    el.appendChild(root);

    refs = {
      root,
      input: search.input,
      clearBtn: search.clearBtn,
      status: search.status,
      none: search.none,
      noneTitle: search.noneTitle,
      faq: faq.faq,
      faqGroups: faq.faqGroups,
      expandBtn: faq.expandBtn,
      expandLabel: faq.expandLabel,
      faqMeta: faq.meta,
      faqEmpty: faq.empty,
      terms: glossary.terms,
      termMeta: glossary.meta,
      termEmpty: glossary.empty,
      lastStatus: '',
    };
    applySearch();

    let itemEl = null;
    if (targetKind === 'faq') itemEl = faq.faq[sub].el;
    else if (targetKind === 'glossary') itemEl = glossary.terms[sub].el;
    else if (targetKind === 'ask') itemEl = ask;
    else if (targetKind === 'survey') itemEl = surveyCard;

    if (itemEl) {
      itemEl.classList.add('hlp-target');
      if (!opts.rerender && !opts.restore) {
        itemEl.classList.add('hlp-arrive');
        // Typed links, Back/Forward and initial loads are not scrolled by the router; land on
        // the item anyway (after the router's own scroll reset). Focus follows except on first
        // load, where focus stays at the start of the document.
        if (opts.initial || opts.browser) {
          requestAnimationFrame(() => requestAnimationFrame(() => {
            if (!itemEl.isConnected) return;
            itemEl.scrollIntoView({ block: 'start', behavior: 'auto' });
            if (opts.browser) App.util.focusEl(itemEl, { preventScroll: true });
          }));
        }
      }
    }
    return itemEl ? { itemEl } : {};
  }

  /* ================================================================== */
  /* Snap survey: three equally prominent faces (App.survey)            */
  /* ================================================================== */
  App.survey = (() => {
    const OPTIONS = [
      { id: 'unhappy', icon: 'faceSad' },
      { id: 'neutral', icon: 'faceNeutral' },
      { id: 'happy', icon: 'faceHappy' },
    ];
    const IDS = OPTIONS.map((o) => o.id);
    const FOLLOW_UP = ['unhappy', 'neutral'];
    const COMMENT_MAX = 500;
    const mounts = new Set();
    // Kept separate from acknowledgement ("Mark as reviewed") and never treated as consent.
    // commentLang: the locale the optional comment was first typed in (kept as written, never translated).
    const sv = () => App.session.slice('survey', () => ({ rating: null, comment: '', commentLang: null, dismissed: false }));
    const label = (id) => k(`survey.options.${id}`);

    function face(opt, m) {
      const pressed = sv().rating === opt.id;
      return h('button', {
        type: 'button',
        class: ['hlp-sv-face', `hlp-sv-face--${opt.id}`, pressed ? 'is-selected' : null],
        'aria-pressed': String(pressed),
        'data-rating': opt.id,
        fid: `${m.prefix}-${opt.id}`,
        on: { click: (e) => select(opt.id, e.currentTarget) },
      },
      h('span', { class: 'hlp-sv-face-icon', 'aria-hidden': 'true' }, App.ui.icon(opt.icon, { size: 44, stroke: 1.5 })),
      h('span', { class: 'hlp-sv-face-label' }, label(opt.id)),
      h('span', { class: 'hlp-sv-check', 'aria-hidden': 'true' }, App.ui.icon('check', { size: 14, stroke: 2.4 })));
    }

    function buildFull(m) {
      const s = sv();
      const level = m.opts.headingLevel === 3 ? 'h3' : 'h2';
      const qId = `${m.prefix}-q`;
      const introId = `${m.prefix}-intro`;
      const commentId = `${m.prefix}-comment`;
      const hintId = `${m.prefix}-comment-hint`;
      m.refs = { hintId, langId: `${m.prefix}-comment-lang` };
      const r = m.refs;
      r.faces = h('div', { class: 'hlp-sv-faces', role: 'group', 'aria-labelledby': qId, 'aria-describedby': introId }, OPTIONS.map((o) => face(o, m)));
      r.thanksText = h('span', { class: 'hlp-sv-thanks-text' });
      r.thanks = h('div', { class: 'hlp-sv-thanks', hidden: true },
        h('span', { class: 'hlp-sv-thanks-icon', 'aria-hidden': 'true' }, App.ui.icon('check', { size: 18, stroke: 2.2 })),
        h('span', { class: 'hlp-sv-thanks-body' }, h('strong', null, k('survey.thanks')), ' ', r.thanksText));
      r.comment = h('textarea', {
        id: commentId,
        class: ['textarea', 'hlp-sv-comment'],
        rows: '3',
        maxlength: String(COMMENT_MAX),
        fid: `${m.prefix}-comment`,
        'aria-describedby': hintId,
        lang: s.commentLang || null,
        value: s.comment,
        // Memory only: never logged, never written to storage.
        on: { input: (e) => onComment(e.target.value) },
      });
      r.langSlot = h('span', { class: 'hlp-sv-lang-slot' });
      const offer = [];
      if (hasClair()) offer.push(App.ui.button({ label: k('survey.offerClair'), kind: 'chip', iconName: 'sparkle', className: 'btn-explain', fid: `${m.prefix}-clair`, onClick: (e) => openClair(e.currentTarget) }));
      offer.push(App.ui.button({
        label: k('survey.offerQuestion'),
        kind: 'chip',
        iconName: 'chat',
        fid: `${m.prefix}-ask`,
        onClick: (e) => {
          if (openQuery(e.currentTarget, { topic: 'understanding', section: App.router.current().section })) return;
          if (!focusSection('help-ask')) App.router.go(App.router.href('help', 'ask'), { focus: 'item' });
        },
      }));
      offer.push(App.ui.button({
        label: k('survey.offerFaq'),
        kind: 'chip',
        iconName: 'question',
        fid: `${m.prefix}-faq`,
        onClick: () => { if (!focusSection('hlp-faq-title')) App.router.go(App.router.href('help'), { focus: 'heading' }); },
      }));
      r.follow = h('div', { class: 'hlp-sv-follow', hidden: true },
        h('div', { class: ['field', 'hlp-sv-field'] },
          h('div', { class: 'hlp-sv-label-row' },
            h('label', { class: 'field-label', for: commentId }, k('survey.commentLabel')),
            r.langSlot),
          h('p', { class: 'field-hint', id: hintId }, k('survey.commentHint')),
          r.comment),
        h('div', { class: 'hlp-sv-offer' },
          h('p', { class: 'hlp-sv-offer-title' }, k('survey.offerTitle')),
          h('div', { class: ['button-row', 'button-row--tight'] }, offer)));
      const hideBtn = h('button', {
        type: 'button',
        class: ['btn', 'btn-plain', 'hlp-sv-hide'],
        fid: `${m.prefix}-hide`,
        on: { click: () => setDismissed(true, m) },
      }, App.ui.icon('close', { size: 16 }), h('span', { class: 'btn-label' }, k('survey.hide')));
      m.container.setAttribute('aria-labelledby', qId);
      m.container.append(h('div', { class: 'hlp-sv' },
        h('div', { class: 'hlp-sv-head' },
          h('p', { class: 'hlp-sv-overline' }, k('survey.overline')),
          hideBtn),
        h(level, { class: 'hlp-sv-question', id: qId }, k('survey.question')),
        h('p', { class: 'hlp-sv-intro', id: introId }, k('survey.intro')),
        r.faces,
        r.thanks,
        r.follow,
        h('p', { class: 'hlp-sv-note' }, App.ui.icon('info', { size: 16 }), h('span', null, k('survey.note')))));
      update(m);
    }

    function buildHidden(m) {
      const level = m.opts.headingLevel === 3 ? 'h3' : 'h2';
      const qId = `${m.prefix}-q`;
      m.refs = {};
      m.container.setAttribute('aria-labelledby', qId);
      m.container.append(h('div', { class: ['hlp-sv', 'hlp-sv--hidden'] },
        h(level, { class: 'hlp-sv-hidden-title', id: qId }, k('survey.title')),
        h('p', { class: 'hlp-sv-hidden-text' }, k('survey.hiddenText')),
        h('button', {
          type: 'button',
          class: ['btn', 'btn-chip', 'hlp-sv-show'],
          fid: `${m.prefix}-show`,
          on: { click: () => setDismissed(false, m) },
        }, App.ui.icon('eye', { size: 16 }), h('span', { class: 'btn-label' }, k('survey.show')))));
    }

    function build(m) {
      App.util.clear(m.container);
      m.container.classList.add('hlp-sv-host');
      m.container.classList.toggle('is-dismissed', !!sv().dismissed);
      m.dismissed = !!sv().dismissed;
      if (m.dismissed) buildHidden(m); else buildFull(m);
    }

    // In-place update keeps focus on the pressed face.
    function update(m) {
      const s = sv();
      const r = m.refs;
      if (!r || !r.faces) return;
      r.faces.querySelectorAll('.hlp-sv-face').forEach((b) => {
        const on = b.getAttribute('data-rating') === s.rating;
        b.setAttribute('aria-pressed', String(on));
        b.classList.toggle('is-selected', on);
      });
      r.faces.classList.toggle('has-selection', !!s.rating);
      r.thanks.hidden = !s.rating;
      r.thanksText.textContent = s.rating ? k('survey.yourAnswer', { answer: label(s.rating) }) : '';
      r.follow.hidden = !FOLLOW_UP.includes(s.rating);
      if (document.activeElement !== r.comment && r.comment.value !== s.comment) r.comment.value = s.comment;
      commentLangUI(m);
    }

    // The comment keeps the language it was typed in: lang on the field, and a "Written in …"
    // tag (also read with the field) once the interface language differs from it.
    function commentLangUI(m) {
      const r = m.refs;
      if (!r || !r.comment) return;
      const lang = sv().commentLang || null;
      if (lang) r.comment.setAttribute('lang', lang); else r.comment.removeAttribute('lang');
      const differs = !!lang && lang !== App.i18n.locale;
      App.util.clear(r.langSlot);
      if (differs) {
        r.langSlot.append(h('span', { class: 'hlp-sv-lang', id: r.langId, lang: App.i18n.locale },
          App.ui.icon('transcript', { size: 14 }),
          k('survey.commentLang', { language: App.i18n.languageName(lang) })));
      }
      r.comment.setAttribute('aria-describedby', differs ? `${r.hintId} ${r.langId}` : r.hintId);
    }

    function onComment(value) {
      const s = sv();
      s.comment = String(value || '').slice(0, COMMENT_MAX);
      if (s.comment && !s.commentLang) s.commentLang = App.i18n.locale;
      if (!s.comment) s.commentLang = null;
      mounts.forEach((m) => { if (m.container.isConnected) commentLangUI(m); });
    }

    function sync(except) {
      mounts.forEach((m) => {
        if (!m.container.isConnected) { mounts.delete(m); return; }
        if (m === except) return;
        if (m.dismissed !== !!sv().dismissed) build(m); else update(m);
      });
    }

    function select(id) {
      if (!IDS.includes(id)) return;
      const s = sv();
      if (s.rating === id) return;
      const changed = !!s.rating;
      s.rating = id;
      // Identifier only: never the comment or any other free text.
      App.events.log('survey_submitted', { id });
      App.session.changed('survey');
      mounts.forEach((m) => { if (m.container.isConnected) update(m); });
      App.announce(changed ? k('survey.updated', { answer: label(id) }) : k('survey.recorded', { answer: label(id) }));
    }

    function setDismissed(on, origin) {
      sv().dismissed = !!on;
      App.session.changed('survey');
      if (origin) build(origin);
      sync(origin);
      if (origin) {
        const target = on
          ? origin.container.querySelector('.hlp-sv-show')
          : (origin.container.querySelector('.hlp-sv-face[aria-pressed="true"]') || origin.container.querySelector('.hlp-sv-face'));
        if (target) target.focus();
      }
      App.announce(on ? k('survey.hiddenAnnounce') : k('survey.shownAnnounce'));
    }

    /** mount(container, { headingLevel: 2|3 }) renders the survey into container. */
    // Focus ids must survive a view re-render (language switch), so mounts inside a view use the
    // per-render stable counter; a clash with another live mount falls back to a unique id.
    function prefixFor(opts, container) {
      if (opts.inHelp) return 'hlp-sv';
      let prefix = opts.prefix && /^[a-z][a-z0-9-]{0,40}$/i.test(opts.prefix) ? opts.prefix : App.ui.stableId('hlp-sv-m');
      const clash = document.getElementById(`${prefix}-q`);
      if (clash && !container.contains(clash)) prefix = App.util.uid(prefix);
      return prefix;
    }

    function mount(container, opts = {}) {
      const m = { container, opts, prefix: prefixFor(opts, container), refs: {}, dismissed: false };
      // A re-render replaces the help view, so drop stale mounts first.
      mounts.forEach((x) => { if (!x.container.isConnected || x.container === container) mounts.delete(x); });
      build(m);
      mounts.add(m);
      return { el: container, refresh: () => build(m) };
    }

    // Snapshot for other modules; the optional comment itself is never exposed.
    function state() {
      const s = sv();
      return { rating: s.rating, dismissed: !!s.dismissed, hasComment: !!(s.comment && s.comment.trim()) };
    }

    // Survey hosts outside the routed view re-render themselves on a language change.
    App.i18n.onChange(() => {
      const view = document.getElementById('view');
      mounts.forEach((m) => {
        if (!m.container.isConnected) { mounts.delete(m); return; }
        if (!(view && view.contains(m.container))) build(m);
      });
    });
    // Reset clears the slice; any survey still on screen returns to its unanswered state.
    App.session.onReset(() => {
      mounts.forEach((m) => {
        if (!m.container.isConnected) mounts.delete(m);
        else build(m);
      });
    });

    return { mount, state, OPTIONS: IDS };
  })();

  // Registered after App.survey exists, because the view mounts the survey on every render.
  App.router.registerView('help', {
    render,
    onLeave() {
      if (App.popover.isOpen()) App.popover.close({ restoreFocus: false });
      refs = null;
    },
  });
})();
