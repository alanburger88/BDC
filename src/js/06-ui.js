/* Shared UI building blocks used by every section. */
App.ui = (() => {
  // Per-render counters give repeated elements stable focus ids across re-renders
  let counters = {};
  function stableId(prefix) {
    counters[prefix] = (counters[prefix] || 0) + 1;
    return `${prefix}-${counters[prefix]}`;
  }
  function resetCounters() { counters = {}; }
  const ICONS = {
    arrowRight: 'M5 12h13M13 6l6 6-6 6',
    arrowLeft: 'M19 12H6M11 6l-6 6 6 6',
    external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
    check: 'M4 12.5l5 5L20 6.5',
    close: 'M6 6l12 12M18 6L6 18',
    chat: 'M4 5h16v11H9l-5 4z',
    question: 'M9.2 9a3 3 0 1 1 4.3 2.7c-.9.4-1.5 1.2-1.5 2.2V15M12 18.5v.01',
    info: 'M12 8v.01M11 12h1v5h1',
    play: 'M8 5.5v13l11-6.5z',
    pause: 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z',
    replay: 'M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5',
    volume: 'M4 9.5h3.5L12 6v12l-4.5-3.5H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11',
    mute: 'M4 9.5h3.5L12 6v12l-4.5-3.5H4zM16 9.5l5 5M21 9.5l-5 5',
    captions: 'M3.5 6h17v12h-17zM10.5 10.5a2 2 0 1 0 0 3M16.5 10.5a2 2 0 1 0 0 3',
    transcript: 'M6 4h9l4 4v12H6zM9 11h7M9 14.5h7M9 18h4',
    fullscreen: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
    download: 'M12 4v11M7 10.5l5 5 5-5M5 19.5h14',
    print: 'M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2M7 14h10v6H7z',
    calendar: 'M4 6h16v14H4zM4 10h16M8 3.5v4M16 3.5v4',
    sparkle: 'M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
    doc: 'M6 3.5h8.5L19 8v12.5H6zM14 3.5V8h5M9 12h7M9 15.5h7',
    chevronDown: 'M6 9l6 6 6-6',
    chevronRight: 'M9 6l6 6-6 6',
    search: 'M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM15.5 15.5L20 20',
    copy: 'M9 9h10v11H9zM5 15V4h10',
    menu: 'M4 7h16M4 12h16M4 17h16',
    person: 'M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4.5 20a7.5 7.5 0 0 1 15 0',
    clock: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17zM12 7.5V12l3 2',
    cash: 'M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM6 10v4M18 10v4',
    trend: 'M4 17l5-5 4 3 7-7M15 8h5v5',
    reset: 'M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5',
    eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
    lock: 'M6.5 11h11v9h-11zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
    faceSad: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM8.5 16c1.8-2 5.2-2 7 0M9 9.5v.5M15 9.5v.5',
    faceNeutral: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM8.5 15h7M9 9.5v.5M15 9.5v.5',
    faceHappy: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM8.5 13.5c1.8 2.5 5.2 2.5 7 0M9 9.5v.5M15 9.5v.5',
  };

  function icon(name, opts = {}) {
    const d = ICONS[name] || ICONS.info;
    const s = svg('svg', { class: ['icon', opts.class], viewBox: '0 0 24 24', width: opts.size || 20, height: opts.size || 20, 'aria-hidden': 'true', focusable: 'false' },
      svg('path', { d, fill: name === 'play' ? 'currentColor' : 'none', stroke: 'currentColor', 'stroke-width': opts.stroke || 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    if (name === 'info' || name === 'question') s.insertBefore(svg('circle', { cx: 12, cy: 12, r: 9, fill: 'none', stroke: 'currentColor', 'stroke-width': opts.stroke || 1.8 }), s.firstChild);
    return s;
  }

  /** Button helper. kind: primary | secondary | ghost-light | link | chip | icon | plain */
  function button({ label, kind = 'secondary', iconName, iconAfter, fid, onClick, attrs = {}, className, ariaLabel, href, external }) {
    const cls = ['btn', `btn-${kind}`, className];
    const kids = [iconName ? icon(iconName) : null, label !== undefined && label !== null ? h('span', { class: 'btn-label' }, label) : null, iconAfter ? icon(iconAfter, { class: 'icon-after' }) : null];
    if (href) {
      const extra = external ? { target: '_blank', rel: 'noopener noreferrer' } : {};
      return h('a', { class: cls, href, fid, 'aria-label': ariaLabel, ...extra, ...attrs, on: onClick ? { click: onClick } : undefined }, kids,
        external ? h('span', { class: 'sr-only' }, ` (${t('common.opensExternal')})`) : null);
    }
    return h('button', { type: 'button', class: cls, fid, 'aria-label': ariaLabel, ...attrs, on: onClick ? { click: onClick } : undefined }, kids);
  }

  function badge(kind, text) {
    const label = text || t(`common.badges.${kind}`);
    return h('span', { class: ['badge', `badge--${kind}`] }, kind === 'changed' ? icon('sparkle', { size: 14 }) : kind === 'unchanged' ? icon('check', { size: 14 }) : null, label);
  }

  function money(cents, opts = {}) {
    return h('span', { class: ['money', opts.className] }, App.fmt.money(cents, opts));
  }

  // Label for any selectable item, used by Clair's context chip, the query form and back links.
  function itemLabel(ctx) {
    if (!ctx || !ctx.kind || ctx.kind === 'general') return t('items.general');
    const id = ctx.id;
    switch (ctx.kind) {
      case 'card': return t(`items.card.${id}`);
      case 'summary': return t(`items.summary.${id}`);
      case 'month': return t('items.month', { month: App.fmt.date(id, 'monthYear') });
      case 'clause': return t('items.clause', { title: t(`clauses.${id}`) });
      case 'term': return t('items.term', { term: t(`glossary.${id}.term`) });
      case 'chapter': return t('items.chapter', { title: t(`chapters.${id}`) });
      case 'resource': return t(`items.resource.${id}`);
      case 'chart': return t(`items.chart.${id}`);
      case 'infographic': return t(`items.infographic.${id}`);
      case 'faq': return t('items.faq');
      case 'section': return t(`nav.${id}`);
      default: return t('items.general');
    }
  }

  function contextWithFid(ctx, fid) {
    return { section: App.router.current().section, period: ctx.period || null, ...ctx, fid };
  }

  /** "Explain with AI" - opens Clair with the selected context. */
  function explainButton(ctx, opts = {}) {
    const fid = opts.fid || `explain-${ctx.kind}-${ctx.id || 'general'}`;
    return button({
      label: opts.label || t('common.explainWithAI'),
      kind: 'chip',
      iconName: 'sparkle',
      fid,
      className: 'btn-explain',
      ariaLabel: opts.ariaLabel || `${t('common.explainWithAI')}: ${itemLabel(ctx)}`,
      onClick: (e) => {
        if (App.clair) App.clair.open(contextWithFid(ctx, fid), e.currentTarget);
      },
    });
  }

  /** "Ask about this" - opens the local query form with the selected context. */
  function askButton(ctx, opts = {}) {
    const fid = opts.fid || `ask-${ctx.kind}-${ctx.id || 'general'}`;
    return button({
      label: opts.label || t('common.askAboutThis'),
      kind: 'chip',
      iconName: 'chat',
      fid,
      className: 'btn-ask',
      ariaLabel: opts.ariaLabel || `${t('common.askAboutThis')}: ${itemLabel(ctx)}`,
      onClick: (e) => {
        if (App.query) App.query.open(contextWithFid(ctx, fid), e.currentTarget);
      },
    });
  }

  /** Navigate to a place while remembering where we came from (for "Back to…"). */
  function goWithReturn(target, originCtx, fid, focus = 'item') {
    App.router.go(target, { origin: { fid, ctx: originCtx || null }, focus });
  }

  /** "View this in your notice" - jumps to the formal clause with a return path. */
  function noticeLink(clauseId, originCtx, opts = {}) {
    const fid = opts.fid || `notice-${clauseId}-from-${originCtx ? `${originCtx.kind}-${originCtx.id}` : 'x'}`;
    return button({
      label: opts.label || t('common.viewInNotice'),
      kind: 'link',
      iconAfter: 'arrowRight',
      fid,
      className: 'btn-notice-link',
      ariaLabel: `${opts.label || t('common.viewInNotice')}: ${t(`clauses.${clauseId}`)}`,
      href: App.router.href('documents', clauseId),
      onClick: (e) => {
        e.preventDefault();
        goWithReturn(App.router.href('documents', clauseId), originCtx, fid, 'item');
      },
    });
  }

  /** Generic in-app link that keeps a return path. */
  function routeLink({ label, target, originCtx, fid, kind = 'link', iconAfter = 'arrowRight', iconName, ariaLabel, focus = 'heading', withReturn = true }) {
    return button({
      label,
      kind,
      iconAfter,
      iconName,
      fid,
      ariaLabel,
      href: target,
      onClick: (e) => {
        e.preventDefault();
        if (withReturn) goWithReturn(target, originCtx, fid, focus);
        else App.router.go(target, { focus });
      },
    });
  }

  /** Back control shown when the current place was reached from elsewhere. */
  function backControl() {
    const top = App.router.backTop();
    if (!top) return null;
    const fromRoute = App.router.parse(top.from);
    let place = t(`nav.${fromRoute.section}`);
    if (top.ctx) place = `${place}: ${itemLabel(top.ctx)}`;
    else if (fromRoute.item && App.rec.isMonthId(fromRoute.item)) place = `${place}: ${itemLabel({ kind: 'month', id: fromRoute.item })}`;
    return h('nav', { class: 'back-nav', 'aria-label': t('common.breadcrumb') },
      button({
        label: t('common.backTo', { place }),
        kind: 'secondary',
        iconName: 'arrowLeft',
        fid: 'back-control',
        className: 'btn-back',
        onClick: () => App.router.back(),
      }));
  }

  /** Section heading block: overline + h1 (focus target) + optional intro. */
  function sectionHeader({ overline, title, intro, extra }) {
    return h('header', { class: 'section-header' },
      overline ? h('p', { class: 'overline' }, overline) : null,
      h('h1', { class: 'section-title', tabindex: '-1', 'data-view-heading': '' }, title),
      intro ? h('p', { class: 'lead' }, intro) : null,
      extra || null);
  }

  function demoNote(opts = {}) {
    return h('p', { class: ['demo-note', opts.className] }, icon('info', { size: 16 }), h('span', null, t('common.illustrativeNote'), ' ', t('common.amountsInCAD')));
  }

  /** Glossary term trigger: hover/focus shows, click/tap pins, Escape closes. */
  function term(id, text) {
    const label = text || t(`glossary.${id}.term`);
    let pointerType = 'mouse';
    const btn = h('button', {
      type: 'button',
      class: 'term',
      'aria-expanded': 'false',
      'data-term': id,
      fid: stableId(`term-${id}`),
      'aria-label': `${label}, ${t('common.definition')}`,
    }, label);
    const render = (el, api) => {
      el.appendChild(h('span', { class: 'popover-term' }, t(`glossary.${id}.term`)));
      el.appendChild(h('span', { class: 'popover-def' }, t(`glossary.${id}.definition`)));
      el.appendChild(h('span', { class: 'popover-actions' },
        explainButton({ kind: 'term', id }, { fid: `explain-term-${id}` }),
        button({
          label: t('common.seeInGlossary'),
          kind: 'link',
          iconAfter: 'arrowRight',
          fid: `glossary-link-${id}`,
          href: App.router.href('help', 'glossary', id),
          onClick: (e) => {
            e.preventDefault();
            const origin = App.router.current();
            api.close();
            App.router.go(App.router.href('help', 'glossary', id), { origin: { fid: btn.getAttribute('data-fid'), ctx: origin.item && App.rec.isMonthId(origin.item) ? { kind: 'month', id: origin.item } : null }, focus: 'item' });
          },
        }),
        h('button', { type: 'button', class: 'btn btn-icon popover-close', 'aria-label': t('common.closeDefinition'), on: { click: () => api.close() } }, icon('close', { size: 16 }))));
    };
    const show = (pinned) => {
      const wasOpen = App.popover.isOpen() && App.popover.current().trigger === btn;
      App.popover.open(btn, { render, pinned, label: t(`glossary.${id}.term`) });
      if (!wasOpen) App.events.log('glossary_opened', { id });
    };
    btn.addEventListener('pointerdown', (e) => { pointerType = e.pointerType || 'mouse'; });
    btn.addEventListener('mouseenter', () => { if (pointerType !== 'touch') show(false); });
    btn.addEventListener('mouseleave', () => App.popover.scheduleHide());
    btn.addEventListener('focus', () => {
      if (btn.dataset.suppressFocusOpen) return;
      if (btn.matches(':focus-visible')) show(false);
    });
    btn.addEventListener('blur', (e) => App.popover.onFocusOut(e));
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const cur = App.popover.current();
      if (cur && cur.trigger === btn && cur.pinned) App.popover.close({ restoreFocus: false });
      else show(true);
    });
    return btn;
  }

  /** Renders a dictionary string, turning [[termId|text]] markers into glossary triggers. */
  function rich(str) {
    const out = [];
    const re = /\[\[(\w+)(?:\|([^\]]+))?\]\]/g;
    let last = 0;
    let m;
    while ((m = re.exec(str))) {
      if (m.index > last) out.push(str.slice(last, m.index));
      out.push(App.TERMS.includes(m[1]) ? term(m[1], m[2]) : (m[2] || m[1]));
      last = m.index + m[0].length;
    }
    if (last < str.length) out.push(str.slice(last));
    return out;
  }

  /** Strip [[term|text]] markers to plain text (for CSV, aria-labels, Clair). */
  function plain(str) {
    return String(str).replace(/\[\[(\w+)(?:\|([^\]]+))?\]\]/g, (m, id, txt) => txt || (App.i18n.has(`glossary.${id}.term`) ? t(`glossary.${id}.term`).toLowerCase() : id));
  }

  /** Accessible disclosure (button + region). */
  function disclosure({ summary, content, open = false, fid, className, onToggle }) {
    const id = App.util.uid('disc');
    const region = h('div', { class: 'disclosure-content', id, hidden: !open });
    const btn = h('button', { type: 'button', class: 'disclosure-toggle', 'aria-expanded': String(open), 'aria-controls': id, fid },
      h('span', { class: 'disclosure-summary' }, summary), icon('chevronDown', { class: 'disclosure-chevron' }));
    let filled = false;
    const fill = () => { if (!filled) { App.util.append(region, typeof content === 'function' ? content() : content); filled = true; } };
    if (open) fill();
    btn.addEventListener('click', () => {
      const now = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(now));
      if (now) fill();
      region.hidden = !now;
      if (onToggle) onToggle(now);
    });
    return h('div', { class: ['disclosure', className] }, btn, region);
  }

  /** Visually hidden text */
  const srOnly = (text) => h('span', { class: 'sr-only' }, text);

  return { stableId, resetCounters, icon, button, badge, money, itemLabel, explainButton, askButton, noticeLink, routeLink, goWithReturn, backControl, sectionHeader, demoNote, term, rich, plain, disclosure, srOnly, ICONS };
})();
