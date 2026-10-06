/* Support for you (view "support", namespace "support", class prefix sup-).
 * Restrained, optional BDC resources - not an offer embedded in the notice.
 * Three cards in App.RESOURCES order; each has an in-app summary, a "why this
 * may be relevant" rationale drawn ONLY from the explicit fixture field
 * record.client.seasonalInventoryBuild (never survey mood, name, language or
 * browsing), a deliberate external link and, for the service and financing
 * cards, a local demo inquiry with the topic prefilled.
 *
 * - Cards can be hidden for the session (App.session slice "support").
 * - Responsible demo rule: when App.config.rules.suppressBorrowingPromotion()
 *   is true the Working Capital Loan card is replaced by a help-first card.
 * - Survey state is deliberately never read here: an unhappy clarity
 *   response must not change what this section shows.
 * - #/support/<resourceId> scrolls to and focuses that card. */
(() => {
  const NS = 'support';
  const k = (key, params) => t(`${NS}.${key}`, params);

  const META = {
    'financial-management': { category: 'advice', icon: 'advice', inquiry: true },
    'working-capital': { category: 'financing', icon: 'inventory', inquiry: true, borrowing: true },
    learning: { category: 'learning', icon: 'learning', inquiry: false },
  };
  const HELP_ID = 'help';

  /* ---------- state and rules ---------- */
  function state() {
    const s = App.session.slice(NS, () => ({ dismissed: {} }));
    if (!s.dismissed || typeof s.dismissed !== 'object') s.dismissed = {};
    return s;
  }
  const isDismissed = (id) => !!state().dismissed[id];
  // Explicit fixture field only - the single input to the rationale.
  const seasonal = () => !!(App.record.client && App.record.client.seasonalInventoryBuild === true);
  function suppressed() {
    try {
      return !!(App.config && App.config.rules && App.config.rules.suppressBorrowingPromotion());
    } catch (e) {
      return false;
    }
  }
  // Cards that apply in the current situation, in display order (help first under the rule).
  function eligibleIds() {
    if (suppressed()) return [HELP_ID, ...App.RESOURCES.filter((id) => !(META[id] && META[id].borrowing))];
    return App.RESOURCES.slice();
  }
  const visibleIds = () => eligibleIds().filter((id) => id === HELP_ID || !isDismissed(id));
  const hiddenIds = () => eligibleIds().filter((id) => id !== HELP_ID && isDismissed(id));

  /* ---------- formatting (display only) ---------- */
  // Keep day and month together ("28 février", "February 28").
  const date = (iso) => App.fmt.date(iso, 'long').replace(' ', ' ');
  const params = () => ({ resume: date(App.record.change.resumePrincipalDate) });

  /* ---------- generic inline illustrations (not BDC marks) ---------- */
  const S = (tag, attrs) => svg(tag, attrs);
  const ICONS = {
    // Consulting: a planning sheet with a rising cash-flow line
    advice: () => [
      S('rect', { x: 8, y: 8, width: 32, height: 32, rx: 5, class: 'sup-i-fill' }),
      S('path', { d: 'M14 16h9', class: 'sup-i-line sup-i-soft' }),
      S('path', { d: 'M14 32l6-6 5 3 9-10', class: 'sup-i-line' }),
      S('path', { d: 'M29 19h5v5', class: 'sup-i-line' }),
      S('circle', { cx: 20, cy: 26, r: 1.6, class: 'sup-i-dot' }),
      S('circle', { cx: 25, cy: 29, r: 1.6, class: 'sup-i-dot' }),
    ],
    // Working capital: stacked inventory boxes and an operating-cycle arrow
    inventory: () => [
      S('rect', { x: 7, y: 25, width: 14, height: 14, rx: 2, class: 'sup-i-fill' }),
      S('rect', { x: 21, y: 25, width: 14, height: 14, rx: 2, class: 'sup-i-fill' }),
      S('rect', { x: 14, y: 11, width: 14, height: 14, rx: 2, class: 'sup-i-fill' }),
      S('path', { d: 'M14 25v4.5M28 25v4.5M21 11v4.5', class: 'sup-i-line sup-i-soft' }),
      S('path', { d: 'M33 9.5a9 9 0 0 1 8 9', class: 'sup-i-line sup-i-accent' }),
      S('path', { d: 'M37.5 17.8l3.5 1.2 1.6-3.4', class: 'sup-i-line sup-i-accent' }),
    ],
    // Learning: an open book
    learning: () => [
      S('path', { d: 'M24 14c-4.5-3-10-3.8-16-3v25c6-.8 11.5 0 16 3 4.5-3 10-3.8 16-3V11c-6-.8-11.5 0-16 3z', class: 'sup-i-fill' }),
      S('path', { d: 'M24 14v25', class: 'sup-i-line' }),
      S('path', { d: 'M12 18c3-.3 6 .2 8 1.2M12 23c3-.3 6 .2 8 1.2M28 19.2c2-1 5-1.5 8-1.2', class: 'sup-i-line sup-i-soft' }),
      S('path', { d: 'M28 24.2c2-1 5-1.5 8-1.2', class: 'sup-i-line sup-i-accent' }),
    ],
    // Help: a conversation bubble
    help: () => [
      S('path', { d: 'M9 10h24a4 4 0 0 1 4 4v13a4 4 0 0 1-4 4H19l-7 6v-6H9a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4z', class: 'sup-i-fill' }),
      S('path', { d: 'M13 18h16M13 23.5h10', class: 'sup-i-line' }),
      S('path', { d: 'M37 18h2a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4h-1v5l-6-5h-6', class: 'sup-i-line sup-i-accent' }),
    ],
  };
  function illustration(name) {
    return h('span', { class: 'sup-icon', 'aria-hidden': 'true' },
      svg('svg', { viewBox: '0 0 48 48', width: 48, height: 48, focusable: 'false', class: 'sup-icon-svg' }, ICONS[name]()));
  }

  /* ---------- actions ---------- */
  // Local demo inquiry (query module) with the selected context; guarded for isolated builds.
  function openInquiry(ctx, fid, trigger) {
    const full = { section: NS, period: null, ...ctx, fid };
    if (App.query && typeof App.query.open === 'function') App.query.open(full, trigger);
    else if (App.router.views.help) App.ui.goWithReturn(App.router.href('help', 'ask'), full, fid, 'item');
  }

  // After a re-render that moves focus (hide / restore), make sure the newly
  // focused element is actually on screen: the router restores the old scroll
  // position and focuses with preventScroll, which can leave focus above the
  // viewport once a card has been removed (most visible at phone widths).
  function revealFocus(fid) {
    requestAnimationFrame(() => {
      const el = App.util.findByFid(fid);
      if (!el) return;
      if (document.activeElement !== el) App.util.focusEl(el, { preventScroll: true });
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      if (r.top >= 0 && r.bottom <= vh) return;
      const card = el.closest('.sup-card');
      const behavior = App.util.prefersReducedMotion() ? 'auto' : 'smooth';
      if (card) card.scrollIntoView({ block: 'start', behavior });
      else el.scrollIntoView({ block: 'center', behavior });
    });
  }

  function inquiryButton(id) {
    const fid = `sup-ask-${id}`;
    const label = k(`cards.${id}.action`);
    return App.ui.button({
      label,
      kind: 'secondary',
      iconName: 'chat',
      fid,
      className: 'sup-ask',
      ariaLabel: k('inquiryAria', { action: label, title: k(`cards.${id}.title`) }),
      attrs: { 'data-action': 'inquiry' },
      onClick: (e) => openInquiry({ kind: 'resource', id, topic: 'other' }, fid, e.currentTarget),
    });
  }

  // Deliberate external link: new tab, noopener noreferrer, visible external icon.
  function externalLink(id, label) {
    const a = App.ui.button({
      label,
      kind: 'link',
      iconAfter: 'external',
      fid: `sup-ext-${id}`,
      className: 'sup-ext',
      href: k(`cards.${id}.url`),
      external: true,
      ariaLabel: k('externalAria', { action: label, title: k(`cards.${id}.title`) }),
      attrs: { hreflang: App.i18n.locale.slice(0, 2), 'data-action': 'external' },
      onClick: () => App.events.log('resource_opened', { id }),
    });
    // A middle-click also opens the page deliberately but fires auxclick, not click.
    a.addEventListener('auxclick', (e) => { if (e.button === 1) App.events.log('resource_opened', { id }); });
    return a;
  }

  function hideButton(id) {
    return App.ui.button({
      label: k('hide'),
      kind: 'plain',
      iconName: 'close',
      fid: `sup-hide-${id}`,
      className: 'sup-hide',
      ariaLabel: k('hideAria', { title: k(`cards.${id}.title`) }),
      attrs: { 'data-action': 'hide' },
      onClick: () => hide(id),
    });
  }

  function hide(id) {
    const before = visibleIds();
    state().dismissed[id] = true;
    App.session.changed(NS);
    const rest = before.filter((x) => x !== id);
    const i = before.indexOf(id);
    const next = rest[i] || rest[i - 1];
    const fid = next ? `sup-title-${next}` : 'sup-show-hidden';
    App.router.rerender({ fid });
    revealFocus(fid);
    App.announce(k('hiddenAnnounce'));
  }

  function showHidden() {
    const first = hiddenIds()[0];
    state().dismissed = {};
    App.session.changed(NS);
    const fid = `sup-title-${first || visibleIds()[0]}`;
    App.router.rerender({ fid });
    revealFocus(fid);
    App.announce(k('restoredAnnounce'));
  }

  /* ---------- building blocks ---------- */
  function why(id) {
    const variant = seasonal() ? 'seasonal' : 'general';
    return h('div', { class: 'sup-why', 'data-basis': variant === 'seasonal' ? 'seasonalInventoryBuild' : 'general' },
      h('h3', { class: 'sup-why-title' }, k('whyTitle')),
      h('p', { class: 'sup-why-text' }, k(`cards.${id}.why.${variant}`, params())));
  }

  function cardShell(id, { category, icon, targeted }, ...body) {
    const titleId = `sup-title-${id}`;
    return h('li', { class: 'sup-item' },
      h('article', {
        class: ['card', 'sup-card', `sup-card--${id}`, targeted ? 'is-target' : null],
        id: `sup-card-${id}`,
        'data-card': id,
        'aria-labelledby': titleId,
      },
      illustration(icon),
      h('div', { class: 'sup-body' },
        h('p', { class: 'sup-kicker' }, k(`categories.${category}`)),
        h('h2', { class: 'sup-card-title', id: titleId, fid: titleId }, k(`cards.${id}.title`)),
        body)));
  }

  function resourceCard(id, targeted) {
    const m = META[id];
    const actions = m.inquiry
      ? [inquiryButton(id), externalLink(id, k('learnMore'))]
      : [externalLink(id, k(`cards.${id}.action`))];
    return cardShell(id, { category: m.category, icon: m.icon, targeted },
      h('p', { class: 'sup-summary' }, k(`cards.${id}.summary`)),
      id === 'working-capital'
        ? h('p', { class: 'sup-statement' }, App.ui.icon('info', { size: 18 }), h('span', null, k(`cards.${id}.statement`)))
        : null,
      id === 'learning'
        ? h('p', { class: 'sup-tag' }, App.ui.icon('check', { size: 16 }), h('span', null, k(`cards.${id}.tag`)))
        : null,
      why(id),
      h('div', { class: 'sup-bottom' },
        h('div', { class: 'sup-actions' }, actions),
        h('div', { class: 'sup-card-foot' }, hideButton(id))));
  }

  function helpCard(targeted) {
    const fid = 'sup-ask-help';
    return cardShell(HELP_ID, { category: 'help', icon: 'help', targeted },
      h('p', { class: 'sup-summary' }, k('cards.help.summary')),
      h('div', { class: 'sup-why', 'data-basis': 'rule' },
        h('h3', { class: 'sup-why-title' }, k('cards.help.whyTitle')),
        h('p', { class: 'sup-why-text' }, k('cards.help.why'))),
      h('div', { class: 'sup-bottom' },
        h('div', { class: 'sup-actions' },
          App.ui.button({
            label: k('cards.help.ask'),
            kind: 'secondary',
            iconName: 'chat',
            fid,
            className: 'sup-ask',
            ariaLabel: k('cards.help.askAria'),
            attrs: { 'data-action': 'inquiry' },
            onClick: (e) => openInquiry({ kind: 'general', topic: 'other' }, fid, e.currentTarget),
          }),
          App.ui.routeLink({
            label: k('cards.help.helpLink'),
            target: App.router.href('help'),
            originCtx: null,
            fid: 'sup-help-link',
            focus: 'heading',
          })),
        h('div', { class: 'sup-card-foot' },
          h('p', { class: 'sup-help-note' }, App.ui.icon('info', { size: 16 }), h('span', null, k('cards.help.note'))))));
  }

  function basisStrip() {
    const isSeasonal = seasonal();
    return h('div', { class: 'sup-basis', 'data-basis': isSeasonal ? 'seasonalInventoryBuild' : 'none' },
      h('span', { class: 'sup-basis-icon', 'aria-hidden': 'true' }, App.ui.icon('doc', { size: 18 })),
      h('div', { class: 'sup-basis-body' },
        isSeasonal
          ? h('p', { class: 'sup-basis-fact' }, h('span', { class: 'sup-basis-label' }, k('basis.label')), ' ', h('strong', null, k('basis.seasonal')))
          : h('p', { class: 'sup-basis-fact' }, k('basis.general')),
        h('p', { class: 'sup-basis-never' }, k('basis.never'))));
  }

  function ruleNote() {
    return h('div', { class: 'callout callout--neutral sup-rule', 'data-rule': 'suppress-borrowing' },
      App.ui.icon('info'),
      h('div', { class: 'sup-rule-body' },
        h('p', { class: 'sup-rule-title' }, k('rule.title')),
        h('p', null, k('rule.text'))));
  }

  function hiddenBar(n) {
    if (!n) return null;
    return h('div', { class: 'sup-hiddenbar' },
      App.ui.button({
        label: k('showHidden', { n: App.fmt.number(n) }),
        kind: 'chip',
        iconName: 'eye',
        fid: 'sup-show-hidden',
        className: 'sup-show-hidden',
        onClick: showHidden,
      }));
  }

  function allHiddenNote() {
    return h('div', { class: 'card card--muted sup-empty' },
      h('h2', { class: 'sup-empty-title' }, k('allHidden.title')),
      h('p', null, k('allHidden.text')));
  }

  function footerNote() {
    return h('div', { class: 'sup-footer' },
      App.ui.icon('external', { size: 16 }),
      h('div', { class: 'sup-footer-body' },
        h('p', null, k('footer.links'), ' ', k('footer.data')),
        h('p', null, k('footer.source'))));
  }

  /* ---------- view ---------- */
  function render(el, route, opts = {}) {
    let target = route.item || null;
    // Under the rule, a link to the loan card lands on the help-first card in its place.
    if (target === 'working-capital' && suppressed()) target = HELP_ID;
    const isResource = target && App.RESOURCES.includes(target);
    // Deliberately navigating to a hidden card shows it again.
    if (isResource && isDismissed(target) && !opts.rerender && !opts.browser && !opts.restore) delete state().dismissed[target];
    if (target !== HELP_ID && !isResource) target = null;

    const ids = visibleIds();
    const cards = {};
    const list = h('ul', { class: 'sup-grid', role: 'list', 'aria-label': k('listLabel'), dataset: { count: String(ids.length) } },
      ids.map((id) => {
        const li = id === HELP_ID ? helpCard(id === target) : resourceCard(id, id === target);
        cards[id] = li.firstChild;
        return li;
      }));

    el.appendChild(h('div', { class: 'sup-view' },
      App.ui.backControl(),
      App.ui.sectionHeader({ overline: k('overline'), title: k('title'), intro: k('intro') }),
      basisStrip(),
      suppressed() ? ruleNote() : null,
      hiddenBar(hiddenIds().length),
      ids.length ? list : allHiddenNote(),
      footerNote()));

    return { itemEl: target && cards[target] ? cards[target] : null };
  }

  App.router.registerView(NS, { render });

  // The presenter's hardship toggle changes which cards apply: refresh if this view is showing.
  App.session.onChange((name) => {
    if (name === 'presenter' && App.router.current().section === NS) App.router.rerender();
  });
})();
