/* Hash router with context-preserving "Back to…" navigation.
 * Routes: #/<section>[/<item>[/<sub>]]. Route parameters carry section and
 * item identifiers only - never names, amounts or question text. */
App.router = (() => {
  const views = {};
  const changeListeners = [];
  const scrollMap = {};
  const focusMap = {};
  let current = { section: 'overview', item: null, sub: null, hash: '#/overview' };
  let pending = null;
  let viewEl = null;
  let started = false;
  let rendered = false;

  const backStack = () => App.session.slice('backStack', () => []);

  function href(section, item, sub) {
    return `#/${[section, item, sub].filter(Boolean).join('/')}`;
  }

  function parse(hash) {
    const raw = String(hash || '').replace(/^#\/?/, '');
    const parts = raw.split('/').filter(Boolean).map((p) => p.replace(/[^a-z0-9-]/gi, '').slice(0, 40));
    const section = parts[0] || 'overview';
    return { section, item: parts[1] || null, sub: parts[2] || null, hash: href(section, parts[1], parts[2]) };
  }

  const isKnown = (section) => App.SECTIONS.includes(section) || App.EXTRA_ROUTES.includes(section);

  function registerView(section, def) {
    views[section] = def;
    if (started && current.section === section) render(current, { rerender: true });
  }

  function activeFid() {
    const a = document.activeElement;
    if (!a || a === document.body) return null;
    const withFid = a.closest('[data-fid]');
    return withFid ? withFid.getAttribute('data-fid') : null;
  }

  function sectionOf(hash) { return parse(hash).section; }

  /** Navigate. target: hash string or {section,item,sub}.
   * opts.origin: { fid, ctx } - pushes a "Back to…" entry pointing at the current place.
   * opts.focus: 'heading' | 'item' | <fid> | false. opts.replace, opts.keepScroll. */
  function go(target, opts = {}) {
    const hash = typeof target === 'string' ? parse(target).hash : href(target.section, target.item, target.sub);
    scrollMap[current.hash] = window.scrollY;
    focusMap[current.hash] = activeFid();
    if (opts.origin) {
      backStack().push({
        from: current.hash,
        to: hash,
        fid: opts.origin.fid || activeFid(),
        ctx: opts.origin.ctx || null,
        scroll: window.scrollY,
      });
    }
    pending = { hash, opts };
    if (location.hash === hash) handle();
    else if (opts.replace) location.replace(hash);
    else location.hash = hash;
  }

  function back() {
    const stack = backStack();
    const top = stack.pop();
    if (!top) return go('#/overview', { focus: 'heading' });
    pending = { hash: top.from, opts: { restore: { scroll: top.scroll, fid: top.fid }, isBack: true } };
    if (location.hash === top.from) handle();
    else location.hash = top.from;
  }

  function backTop() {
    const stack = backStack();
    const top = stack[stack.length - 1];
    if (!top) return null;
    return sectionOf(top.to) === current.section ? top : null;
  }

  function handle() {
    const hash = location.hash;
    if (hash && !hash.startsWith('#/')) {
      // In-page anchors (e.g. skip link) are not routes
      pending = null;
      return;
    }
    const r = parse(hash);
    let opts = {};
    if (pending && pending.hash === r.hash) {
      opts = pending.opts;
    } else {
      // Browser Back/Forward or a typed URL: restore what we know about that place.
      const stack = backStack();
      const top = stack[stack.length - 1];
      if (top && top.from === r.hash) {
        opts.restore = { scroll: top.scroll, fid: top.fid };
        stack.pop();
      } else if (scrollMap[r.hash] !== undefined) {
        opts.restore = { scroll: scrollMap[r.hash], fid: focusMap[r.hash] };
      }
      opts.browser = true;
    }
    const wasPending = !opts.browser;
    pending = null;
    if (!wasPending && rendered && r.hash === current.hash) return; // duplicate hashchange for a place already shown
    if (!isKnown(r.section)) {
      go('#/overview', { replace: true });
      return;
    }
    // Maintain the back stack: keep the top entry while we stay in its target section.
    const stack = backStack();
    const top = stack[stack.length - 1];
    if (top && !opts.isBack) {
      if (sectionOf(top.to) === r.section) top.to = r.hash;
      else if (!opts.origin) stack.length = 0;
    }
    render(r, opts);
  }

  function render(r, opts = {}) {
    rendered = true;
    const prev = current;
    current = r;
    if (!viewEl) viewEl = document.getElementById('view');
    if (App.shell) App.shell.update(r);
    const view = views[r.section] || views.overview;
    const sectionChanged = prev.section !== r.section;
    if (sectionChanged && views[prev.section] && views[prev.section].onLeave && !opts.rerender) views[prev.section].onLeave(prev, r);
    App.util.clear(viewEl);
    App.ui.resetCounters();
    viewEl.setAttribute('data-section', r.section);
    let itemEl = null;
    if (view) {
      try {
        const res = view.render(viewEl, r, opts);
        if (res && res.itemEl) itemEl = res.itemEl;
      } catch (e) {
        console.error(`View ${r.section} failed to render`, e);
        viewEl.appendChild(h('div', { class: 'card error-card', role: 'alert' }, h('h1', { tabindex: '-1', 'data-view-heading': '' }, t('common.renderError'))));
      }
    }
    const titleKey = App.SECTIONS.includes(r.section) || r.section === 'insights' ? `nav.${r.section}` : 'nav.overview';
    document.title = `${t(titleKey)} · ${t('common.docTitle')}`;

    if (!opts.rerender) {
      App.events.log('section_viewed', { id: r.section });
      if (r.item) App.events.log('detail_opened', { id: `${r.section}:${r.item}` });
    }

    // Focus and scroll management
    requestAnimationFrame(() => {
      if (opts.restore) {
        window.scrollTo(0, opts.restore.scroll || 0);
        const el = App.util.findByFid(opts.restore.fid);
        if (el) App.util.focusEl(el, { preventScroll: true });
        else if (!opts.rerender) focusHeading();
        if (opts.rerender) window.scrollTo(0, opts.restore.scroll || 0);
        return;
      }
      if (itemEl && opts.focus !== false && (opts.focus === 'item' || !opts.browser)) {
        itemEl.scrollIntoView({ block: 'start', behavior: App.util.prefersReducedMotion() ? 'auto' : 'smooth' });
        if (opts.focus !== 'none') App.util.focusEl(itemEl, { preventScroll: true });
        return;
      }
      if (sectionChanged && !opts.keepScroll) window.scrollTo(0, 0);
      if (opts.focus === 'heading') focusHeading();
      else if (typeof opts.focus === 'string' && !['item', 'none'].includes(opts.focus)) {
        const el = App.util.findByFid(opts.focus);
        if (el) App.util.focusEl(el);
      }
    });

    changeListeners.forEach((fn) => fn(r, prev, opts));
  }

  function focusHeading() {
    const hd = viewEl && viewEl.querySelector('[data-view-heading]');
    if (hd) App.util.focusEl(hd, { preventScroll: false });
  }

  function rerender(override = {}) {
    const fid = override.fid !== undefined ? override.fid : activeFid();
    const scroll = override.scroll !== undefined ? override.scroll : window.scrollY;
    render(current, { rerender: true, restore: { scroll, fid } });
  }

  function start() {
    started = true;
    window.addEventListener('hashchange', handle);
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    const r = parse(location.hash);
    if (!location.hash.startsWith('#/') || !isKnown(r.section)) {
      location.replace('#/overview');
      render(parse('#/overview'), { initial: true, focus: false });
    } else {
      render(r, { initial: true, focus: false });
    }
  }

  return {
    href,
    parse,
    go,
    back,
    backTop,
    registerView,
    rerender,
    start,
    focusHeading,
    current: () => current,
    activeFid,
    onChange(fn) { changeListeners.push(fn); },
    views,
  };
})();
