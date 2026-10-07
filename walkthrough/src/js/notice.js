/* Live notice controller.
 *
 * Hosts the Financing Change Notice (served from the same site at notice/) in an
 * iframe and drives it for the guided stops: route changes, language, Clair, and a
 * temporary highlight on the element a stop talks about. Everything goes through the
 * notice's own public API (window.BDCNotice) or its real controls (data-fid), so the
 * notice behaves exactly as it does for a recipient.
 *
 * When the notice can't be scripted (embedding blocked, a file:// copy, a timeout),
 * the state becomes "blocked" or "failed" and the walkthrough shows a preview image
 * with an "Open live statement" action instead. */
window.WT_NOTICE = (() => {
  'use strict';

  const SRC = 'notice/index.html';
  const LOAD_TIMEOUT = 20000;
  const READY_TIMEOUT = 10000;
  const reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let frame = null;
  let state = 'idle'; // idle | loading | ready | blocked | failed | forced
  let loadTimer = null;
  let pendingSpec = null;
  let spot = null;
  let seq = 0; // the latest apply() wins when stops change quickly
  const listeners = [];

  function onState(fn) { listeners.push(fn); }
  function setState(next, info) {
    state = next;
    listeners.forEach((fn) => fn(next, info));
    if (next === 'ready' && pendingSpec) {
      const spec = pendingSpec;
      pendingSpec = null;
      apply(spec);
    }
  }

  /** Create the iframe inside the device screen (once) and start loading the notice. */
  function mount(screen) {
    if (frame) {
      if (frame.parentNode !== screen) screen.appendChild(frame);
      return frame;
    }
    frame = document.createElement('iframe');
    frame.className = 'notice-frame';
    frame.title = 'Live Financing Change Notice';
    frame.setAttribute('allow', 'fullscreen; clipboard-write');
    frame.addEventListener('load', onLoad);
    frame.src = `${SRC}#/overview`;
    screen.appendChild(frame);
    setState('loading');
    loadTimer = setTimeout(() => { if (state === 'loading') setState('failed', 'timeout'); }, LOAD_TIMEOUT);
    return frame;
  }

  function retry() {
    if (!frame) return;
    clearTimeout(loadTimer);
    setState('loading');
    loadTimer = setTimeout(() => { if (state === 'loading') setState('failed', 'timeout'); }, LOAD_TIMEOUT);
    frame.src = `${SRC}?r=${Date.now()}#/overview`;
  }

  /** Same-origin access to the notice, or null (cross-origin, blocked or not loaded). */
  function access() {
    if (!frame) return null;
    try {
      const w = frame.contentWindow;
      const d = frame.contentDocument;
      if (!w || !d || !d.documentElement || w.location.href === 'about:blank') return null;
      return { w, d, A: w.BDCNotice || null };
    } catch (e) {
      return null;
    }
  }

  let keyHandler = null;
  /** Presentation clickers send Page Down / Page Up, which would only scroll the notice
   * while it has focus. Offer them (and Escape, when the notice has nothing of its own to
   * close) to the walkthrough; the handler returns true when it used the key. */
  function onKey(fn) { keyHandler = fn; }
  function forwardKeys(w) {
    w.addEventListener('keydown', (e) => {
      if (!keyHandler || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key !== 'PageDown' && e.key !== 'PageUp' && e.key !== 'Escape') return;
      const t = e.target;
      if (e.key !== 'Escape' && t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'Escape') {
        const a = access();
        try { if (a && a.A && (a.A.overlay.isOpen() || a.A.popover.isOpen())) return; } catch (err) { return; }
      }
      if (keyHandler(e.key)) e.preventDefault();
    }, true);
  }

  function onLoad() {
    if (!access()) {
      clearTimeout(loadTimer);
      if (state !== 'forced') setState('blocked');
      return;
    }
    forwardKeys(access().w);
    const t0 = Date.now();
    (function check() {
      const a = access();
      if (a && a.A && a.d.documentElement.classList.contains('app-ready')) {
        clearTimeout(loadTimer);
        setState('ready');
        return;
      }
      if (Date.now() - t0 > READY_TIMEOUT) {
        clearTimeout(loadTimer);
        setState('failed', 'not-ready');
        return;
      }
      setTimeout(check, 80);
    })();
  }

  /** Show the frame even though it can't be scripted (the visitor chose "Show it here"). */
  function force() {
    setState('forced');
    if (pendingSpec && pendingSpec.route && frame) {
      try { frame.contentWindow.location.replace(`${SRC}${pendingSpec.route}`); } catch (e) { /* ignore */ }
    }
    pendingSpec = null;
  }

  /* ------------------------------------------------------------------ */
  /* Driving the notice                                                  */
  /* ------------------------------------------------------------------ */

  const byFid = (d, fid) => d.querySelector(`[data-fid="${fid}"]`);
  const visible = (el) => !!el && el.getClientRects().length > 0;

  function waitFor(test, timeout = 2500) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      (function poll() {
        const v = test();
        if (v || Date.now() - t0 > timeout) { resolve(v || null); return; }
        setTimeout(poll, 50);
      })();
    });
  }

  /* Close an open panel (Clair, the question form) or definition. The notice gives an
   * open panel its own history entry and steps back over it after closing; wait for
   * that to finish, or the step back would undo the next navigation. */
  async function closeTransient(a) {
    const { A, w } = a;
    try { if (A.popover && A.popover.isOpen()) A.popover.close({ restoreFocus: false }); } catch (e) { /* ignore */ }
    let closed = false;
    try { if (A.overlay && A.overlay.isOpen()) { A.overlay.close('api', { silent: true }); closed = true; } } catch (e) { /* ignore */ }
    if (closed) await waitFor(() => !(w.history.state && w.history.state.bdcOverlay), 1500);
  }

  function setLang(a, loc) {
    if (a.A.i18n.locale === loc) return;
    const btn = byFid(a.d, `lang-${loc}`);
    if (btn) btn.click();
    else a.A.i18n.setLocale(loc);
  }

  // Two animation frames in the notice, or a short wait where a hidden frame runs none
  function frames(w) {
    return new Promise((resolve) => {
      const t = setTimeout(resolve, 200);
      w.requestAnimationFrame(() => w.requestAnimationFrame(() => { clearTimeout(t); resolve(); }));
    });
  }

  /* A language change re-renders the notice and, one frame later, puts back the scroll
   * position it had when the language changed. Scroll first when the scene starts at the
   * top, and let that frame pass before anything else scrolls or is highlighted. */
  async function changeLang(a, loc, top) {
    if (a.A.i18n.locale === loc) return;
    if (top) a.w.scrollTo(0, 0);
    setLang(a, loc);
    await frames(a.w);
  }

  /* Run one of the notice's own functions from the notice's event loop. The router uses
   * location.replace('#/…'), and a relative URL is resolved against the document whose
   * script started the call: called directly from this page it would resolve against
   * the walkthrough's address and load the walkthrough inside the frame. */
  function inNotice(a, fn, ...args) { a.w.setTimeout(fn, 0, ...args); }

  function routeTo(a, route) {
    const target = a.A.router.parse(route).hash;
    if (a.A.router.current().hash === target) return Promise.resolve(true);
    inNotice(a, a.A.router.go, target, { replace: true, focus: 'none' });
    return waitFor(() => a.A.router.current().hash === target);
  }

  function clearSpot() {
    if (!spot) return;
    clearTimeout(spot.timer);
    try { if (spot.anim) spot.anim.cancel(); } catch (e) { /* ignore */ }
    const { el, prev } = spot;
    el.style.outline = prev.outline;
    el.style.outlineOffset = prev.outlineOffset;
    spot = null;
  }

  /** Scroll an element of the notice into view and pulse a brand-green ring around it. */
  function highlight(a, el) {
    clearSpot();
    const { w, d } = a;
    const r = el.getBoundingClientRect();
    const vh = w.innerHeight;
    const header = d.querySelector('.site-header, header');
    const headerH = header && w.getComputedStyle(header).position !== 'static' ? header.getBoundingClientRect().height : 0;
    const tall = r.height > (vh - headerH) * 0.7;
    const top = w.scrollY + r.top - (tall ? headerH + 16 : Math.max(headerH + 16, (vh - r.height) / 2));
    w.scrollTo({ top: Math.max(0, top), behavior: reducedMotion() ? 'auto' : 'smooth' });
    spot = { el, prev: { outline: el.style.outline, outlineOffset: el.style.outlineOffset }, anim: null, timer: null };
    el.style.outline = '3px solid #4EAF60';
    el.style.outlineOffset = '4px';
    if (!reducedMotion() && el.animate) {
      spot.anim = el.animate(
        [{ boxShadow: '0 0 0 0 rgba(78, 175, 96, 0.55)' }, { boxShadow: '0 0 0 18px rgba(78, 175, 96, 0)' }],
        { duration: 1200, iterations: 3, easing: 'ease-out' },
      );
    }
    spot.timer = setTimeout(clearSpot, 5000);
  }

  /**
   * Apply a stop's scene to the notice. spec: { route, lang, toggleLang, click,
   * spotlight (data-fid), spotlightSelector, clair (question) }.
   * Resolves to { ok, target } where target names what was highlighted or opened.
   */
  async function apply(spec) {
    if (!spec) return { ok: true };
    const mine = ++seq;
    const stale = () => mine !== seq;
    const a = access();
    if (state !== 'ready' || !a || !a.A) {
      if (state === 'loading' || state === 'idle') pendingSpec = spec;
      else if (state === 'forced' && spec.route && frame) {
        try { frame.contentWindow.location.replace(`${SRC}${spec.route}`); } catch (e) { /* ignore */ }
      }
      return { ok: false };
    }
    clearSpot();
    await closeTransient(a);
    if (stale()) return { ok: false, stale: true };
    if (spec.lang) await changeLang(a, spec.lang, spec.top);
    if (spec.toggleLang) await changeLang(a, a.A.i18n.locale === 'fr-CA' ? 'en-CA' : 'fr-CA', spec.top);
    if (stale()) return { ok: false, stale: true };
    if (spec.route) await routeTo(a, spec.route);
    if (stale()) return { ok: false, stale: true };
    if (spec.top) a.w.scrollTo(0, 0);

    let target = null;
    if (spec.click) {
      const el = await waitFor(() => { const e = byFid(a.d, spec.click); return visible(e) ? e : null; });
      if (stale()) return { ok: false, stale: true };
      if (el) {
        highlight(a, el);
        // Let the scroll settle so a popover opens beside its term, not above the fold
        await new Promise((r) => setTimeout(r, reducedMotion() ? 0 : 350));
        if (stale()) return { ok: false, stale: true };
        el.click();
        target = el;
      }
    }
    if (spec.spotlight || spec.spotlightSelector) {
      const find = () => {
        const e = spec.spotlight ? byFid(a.d, spec.spotlight) : a.d.querySelector(spec.spotlightSelector);
        return visible(e) ? e : null;
      };
      const el = await waitFor(find);
      if (stale()) return { ok: false, stale: true };
      if (el) { highlight(a, el); target = target || el; }
    }
    if (spec.clair) {
      inNotice(a, a.A.clair.ask, spec.clair);
      target = target || true;
    }
    return { ok: !!target || !(spec.click || spec.spotlight || spec.spotlightSelector || spec.clair), target };
  }

  /** Clear the visitor's activity, return to the overview in English, close any panel. */
  async function reset() {
    pendingSpec = null;
    seq += 1;
    const a = access();
    if (!a || !a.A) return;
    clearSpot();
    await closeTransient(a);
    await changeLang(a, 'en-CA', true);
    await routeTo(a, '#/overview');
    a.w.scrollTo(0, 0);
    try {
      a.A.session.reset();
      // As the notice does when a visitor clears their activity: opened, then the overview viewed
      a.A.events.log('notice_opened', { id: a.A.record.noticeId, section: 'overview' });
      inNotice(a, a.A.router.go, '#/overview', { replace: true, focus: 'none' });
    } catch (e) { /* ignore */ }
  }

  /** Before the walkthrough adds a history entry: close any panel open in the notice and
   * let its step back over the panel's history entry finish first. Otherwise that step
   * back would land on the walkthrough's new entry and undo it. */
  async function settle() {
    const a = access();
    if (!a || !a.A) return;
    await closeTransient(a);
    if (a.w.history.state && a.w.history.state.bdcOverlay) await waitFor(() => !(a.w.history.state && a.w.history.state.bdcOverlay), 1500);
  }

  function locale() { const a = access(); return a && a.A ? a.A.i18n.locale : null; }

  /** Stop an apply() that is still running (the visitor left the live part). */
  function cancel() { seq += 1; }

  /** The notice's in-app "Back to …" steps back with history.go(-n), counting only its own
   * history entries. Once the walkthrough adds an entry that count is wrong, so forget the
   * notice's back path (and hide its Back control) whenever the walkthrough adds one. */
  function forgetBack() {
    const a = access();
    if (!a || !a.A || state !== 'ready') return;
    try {
      const back = a.A.session.slice('backStack', () => []);
      const fwd = a.A.session.slice('forwardStack', () => []);
      if (!back.length && !fwd.length) return;
      back.length = 0;
      fwd.length = 0;
      inNotice(a, a.A.router.rerender, { fid: null });
    } catch (e) { /* ignore */ }
  }

  function route() { const a = access(); try { return a && a.A ? a.A.router.current().hash : null; } catch (e) { return null; } }

  /** Is a panel (Clair, the question form) open in the notice? */
  function panelOpen() { const a = access(); try { return !!(a && a.A && a.A.overlay.isOpen()); } catch (e) { return false; } }

  /** URL for "Open live statement": the notice at the section currently shown. */
  function href() {
    const a = access();
    const hash = a && a.A ? a.A.router.current().hash : '#/overview';
    return `${SRC}${hash}`;
  }

  return {
    mount,
    retry,
    force,
    apply,
    settle,
    onKey,
    cancel,
    forgetBack,
    route,
    reset,
    locale,
    panelOpen,
    href,
    onState,
    state: () => state,
    frame: () => frame,
    isReady: () => state === 'ready',
  };
})();
