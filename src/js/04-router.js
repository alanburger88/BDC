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
  // Index of the current session-history entry within this tab, stamped into
  // history.state (bdcIdx) so in-app "Back to…" can step back with history.go(-n)
  // instead of adding entries. Unknown (null) when history.state is unavailable.
  let idx = 0;
  let idxOk = true;

  const backStack = () => App.session.slice('backStack', () => []);
  // Entries popped by browser Back, so browser Forward can show "Back to…" again
  const forwardStack = () => App.session.slice('forwardStack', () => []);

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

  /* ---------- history entry index ---------- */
  function stamp() {
    if (!idxOk) return;
    try { history.replaceState({ bdcIdx: idx }, ''); } catch (e) { idxOk = false; }
  }
  const stateIdx = () => (history.state && typeof history.state.bdcIdx === 'number' ? history.state.bdcIdx : null);
  // Traversal (Back/Forward, history.go) lands on a stamped entry; an unstamped one is a
  // new entry made outside the router (typed URL, plain in-page link): one step further.
  function syncIdx() {
    const s = stateIdx();
    if (s !== null) idx = s;
    else { idx += 1; stamp(); }
  }
  /** Overlay history entries (App.overlay) carry their own index: keep in step with them. */
  function syncHistoryIndex() {
    const s = stateIdx();
    if (s !== null) idx = s;
  }
  // Entry of the page itself: an open overlay's entry (same URL) sits one above it.
  const pageIdx = () => (history.state && history.state.bdcOverlay ? idx - 1 : idx);

  // Push (or replace) the hash. An open overlay's history entry (same URL) is reused for
  // the destination, so closing an overlay and navigating leaves one entry, not two.
  function setHash(hash, replace) {
    const reuse = !!(App.overlay && App.overlay.takeHistoryEntry && App.overlay.takeHistoryEntry());
    if (replace || reuse) location.replace(hash);
    else { location.hash = hash; idx += 1; }
    stamp();
  }

  function remember() {
    scrollMap[current.hash] = window.scrollY;
    focusMap[current.hash] = activeFid();
  }

  /** Identifier logged as detail_opened, or null when the route names no real item.
   * Help deep links keep their sub-identifier (help:faq:relief, help:glossary:interest). */
  function detailId(r, itemEl) {
    const { section, item, sub } = r;
    if (!item) return null;
    const known = {
      changes: () => App.CHANGE_CARDS.includes(item),
      payments: () => App.rec.isMonthId(item) || ['relief', 'cost', 'schedule'].includes(item),
      documents: () => App.CLAUSES.includes(item),
      support: () => App.RESOURCES.includes(item),
      help: () => (item === 'faq' ? App.i18n.has('help.faq.items') && Object.keys(App.i18n.tv('help.faq.items') || {}).includes(sub)
        : item === 'glossary' ? App.TERMS.includes(sub)
          : ['survey', 'ask'].includes(item)),
    }[section];
    // A view returning its target element also counts (e.g. #/support/help); in-view month
    // selection returns no element, so known identifiers are checked as well.
    if (!itemEl && !(known && known())) return null;
    return section === 'help' && sub && (item === 'faq' || item === 'glossary') ? `${section}:${item}:${sub}` : `${section}:${item}`;
  }

  /** Navigate. target: hash string or {section,item,sub}.
   * opts.origin: { fid, ctx } - pushes a "Back to…" entry pointing at the current place.
   * opts.focus: 'heading' | 'item' | <fid> | false. opts.replace, opts.keepScroll. */
  function go(target, opts = {}) {
    const hash = typeof target === 'string' ? parse(target).hash : href(target.section, target.item, target.sub);
    remember();
    forwardStack().length = 0;
    if (opts.origin) {
      backStack().push({
        from: current.hash,
        to: hash,
        fid: opts.origin.fid || activeFid(),
        ctx: opts.origin.ctx || null,
        scroll: window.scrollY,
        idx: idxOk ? pageIdx() : null, // history entry of the origin
      });
    }
    pending = { hash, opts };
    if (location.hash === hash) handle();
    else setHash(hash, !!opts.replace);
  }

  /** In-app "Back to…": steps browser history back to the origin entry (history.go(-n),
   * counting the push navigations made since it) so browser Back afterwards continues
   * from there; restores the origin's scroll and focus. Without a known index it
   * navigates to the origin as before. */
  function back() {
    const stack = backStack();
    const top = stack.pop();
    if (!top) return go('#/overview', { focus: 'heading' });
    remember();
    pending = { hash: top.from, opts: { restore: { scroll: top.scroll, fid: top.fid }, isBack: true } };
    if (location.hash === top.from) {
      forwardStack().length = 0;
      handle();
      return;
    }
    const steps = idxOk && typeof top.idx === 'number' && stateIdx() === idx ? top.idx - idx : 0;
    if (steps < 0) {
      // The entries stepped over stay as browser Forward: let Forward show "Back to…" again.
      forwardStack().push(top);
      history.go(steps);
      return;
    }
    forwardStack().length = 0;
    setHash(top.from, false);
  }

  function backTop() {
    const stack = backStack();
    const top = stack[stack.length - 1];
    if (!top) return null;
    return sectionOf(top.to) === current.section ? top : null;
  }

  function handle() {
    const hash = location.hash;
    syncIdx();
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
      // Browser Back/Forward or a typed URL: remember the place being left, then
      // restore what we know about the place being shown.
      if (rendered && r.hash !== current.hash) remember();
      const stack = backStack();
      const fwd = forwardStack();
      const top = stack[stack.length - 1];
      const ftop = fwd[fwd.length - 1];
      if (top && top.from === r.hash) {
        opts.restore = { scroll: top.scroll, fid: top.fid };
        fwd.push(stack.pop());
      } else {
        if (ftop && ftop.from === current.hash && sectionOf(ftop.to) === r.section) stack.push(fwd.pop());
        if (scrollMap[r.hash] !== undefined) opts.restore = { scroll: scrollMap[r.hash], fid: focusMap[r.hash] };
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
    // Never change the page beneath an open overlay (e.g. a typed URL, or Back with no
    // overlay history entry): close it without restoring focus; the new view takes focus.
    if (App.overlay && App.overlay.isOpen() && r.hash !== current.hash) App.overlay.close('route', { silent: true, keepHistory: true });
    // Maintain the back stack: keep the top entry while we stay in its target section.
    const stack = backStack();
    const top = stack[stack.length - 1];
    if (top && !opts.isBack && !opts.browser) {
      if (top.from === r.hash) stack.pop(); // returned to the origin by other means
      else if (sectionOf(top.to) === r.section) top.to = r.hash;
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
      const did = detailId(r, itemEl);
      if (did) App.events.log('detail_opened', { id: did });
    }

    // Focus and scroll management
    requestAnimationFrame(() => {
      if (opts.restore) {
        window.scrollTo(0, opts.restore.scroll || 0);
        const el = App.util.findByFid(opts.restore.fid);
        if (el) App.util.focusEl(el, { preventScroll: true });
        else if (!opts.rerender) focusHeading({ preventScroll: true }); // keep the restored scroll
        if (opts.rerender) window.scrollTo(0, opts.restore.scroll || 0);
        return;
      }
      const explicitFid = typeof opts.focus === 'string' && !['item', 'none', 'heading'].includes(opts.focus);
      if (itemEl && !explicitFid && opts.focus !== 'heading') {
        // Deep links (initial load, typed URL, Back/Forward) also land on the item
        itemEl.scrollIntoView({ block: 'start', behavior: App.util.prefersReducedMotion() || opts.initial || opts.browser ? 'auto' : 'smooth' });
        if (opts.focus !== 'none') App.util.focusEl(itemEl, { preventScroll: true });
        return;
      }
      if (sectionChanged && !opts.keepScroll) window.scrollTo(0, 0);
      if (opts.focus === 'heading' || opts.focus === 'item') focusHeading();
      else if (explicitFid) {
        const el = App.util.findByFid(opts.focus);
        if (el) App.util.focusEl(el); else focusHeading();
      }
    });

    changeListeners.forEach((fn) => fn(r, prev, opts));
  }

  function focusHeading({ preventScroll = false } = {}) {
    const hd = viewEl && viewEl.querySelector('[data-view-heading]');
    if (hd) App.util.focusEl(hd, { preventScroll });
  }

  function rerender(override = {}) {
    const fid = override.fid !== undefined ? override.fid : activeFid();
    const scroll = override.scroll !== undefined ? override.scroll : window.scrollY;
    render(current, { rerender: true, restore: { scroll, fid } });
  }

  /** opts.beforeRender(route): runs once the first route is resolved, before it renders
   * (boot logs notice_opened there so it precedes the first section_viewed). */
  function start(opts = {}) {
    started = true;
    window.addEventListener('hashchange', handle);
    // Traversals between same-URL entries (overlay history entries) fire popstate only
    window.addEventListener('popstate', syncHistoryIndex);
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    idx = stateIdx() !== null ? stateIdx() : 0;
    stamp();
    const r = parse(location.hash);
    const valid = location.hash.startsWith('#/') && isKnown(r.section);
    const first = valid ? r : parse('#/overview');
    if (typeof opts.beforeRender === 'function') opts.beforeRender(first);
    if (!valid) {
      location.replace('#/overview');
      stamp();
      render(first, { initial: true, focus: false });
    } else {
      render(r, { initial: true, focus: r.item ? 'item' : false });
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
    syncHistoryIndex,
    historyIndex: () => (idxOk ? idx : null),
    onChange(fn) { changeListeners.push(fn); },
    views,
  };
})();
