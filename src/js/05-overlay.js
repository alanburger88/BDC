/* Single overlay manager. Only one overlay (assistant, inquiry panel or
 * dialog) is open at a time, so focus traps are never nested. Glossary
 * popovers are non-modal and handled separately by App.popover. */
App.overlay = (() => {
  let currentOv = null; // { id, el, opts, returnTarget }
  let root = null;

  function appRoot() { return document.getElementById('app'); }

  function setBackgroundInert(on) {
    const app = appRoot();
    if (!app) return;
    if (on) {
      app.setAttribute('inert', '');
      app.setAttribute('aria-hidden', 'true');
      document.documentElement.classList.add('overlay-open');
    } else {
      app.removeAttribute('inert');
      app.removeAttribute('aria-hidden');
      document.documentElement.classList.remove('overlay-open');
    }
  }

  function returnTargetFrom(trigger) {
    if (!trigger) return { el: document.activeElement !== document.body ? document.activeElement : null, fid: null };
    if (typeof trigger === 'string') return { el: App.util.findByFid(trigger), fid: trigger };
    const withFid = trigger.closest && trigger.closest('[data-fid]');
    return { el: trigger, fid: withFid ? withFid.getAttribute('data-fid') : null };
  }

  function onKeydown(e) {
    if (!currentOv) return;
    if (e.key === 'Escape') {
      // Let an open popover inside the overlay close first
      if (App.popover && App.popover.isOpen()) return;
      e.preventDefault();
      close('escape');
      return;
    }
    if (e.key === 'Tab') {
      const items = App.util.focusables(currentOv.el);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !currentOv.el.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !currentOv.el.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  // Keep the panel inside the visual viewport when an on-screen keyboard opens
  function syncViewport() {
    const vv = window.visualViewport;
    const height = vv ? vv.height : window.innerHeight;
    document.documentElement.style.setProperty('--vvh', `${Math.round(height)}px`);
    if (vv) document.documentElement.style.setProperty('--vv-top', `${Math.round(vv.offsetTop)}px`);
  }

  /**
   * open({ id, variant: 'panel'|'dialog', title, titleExtra, render(body, api), trigger, onClose, initialFocus, className })
   * render receives the body element and { close, el, setTitle }.
   */
  function open(opts) {
    if (!root) root = document.getElementById('overlay-root');
    let inheritedReturn = null;
    if (currentOv) {
      // Switching overlays: if the new trigger lives inside the old overlay,
      // return focus to whatever opened the old one.
      const inside = opts.trigger && typeof opts.trigger !== 'string' && currentOv.el.contains(opts.trigger);
      if (inside || !opts.trigger) inheritedReturn = currentOv.returnTarget;
      close('switch', { silent: true });
    }
    if (App.popover) App.popover.close({ restoreFocus: false });

    const titleId = App.util.uid('ov-title');
    const variant = opts.variant || 'dialog';
    const reduced = App.util.prefersReducedMotion();
    const backdrop = h('div', { class: 'overlay-backdrop', on: { click: () => close('backdrop') } });
    const closeBtn = h('button', { type: 'button', class: 'btn btn-icon overlay-close', fid: `ov-close-${opts.id}`, 'aria-label': t('common.close'), on: { click: () => close('button') } }, App.ui.icon('close'), h('span', { class: 'overlay-close-text' }, t('common.close')));
    const titleEl = h('h2', { id: titleId, class: 'overlay-title' }, opts.title || '');
    const body = h('div', { class: 'overlay-body' });
    const el = h('div', {
      class: ['overlay', `overlay--${variant}`, opts.className, reduced ? 'no-motion' : null],
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': titleId,
      'data-overlay': opts.id,
    },
    h('div', { class: 'overlay-header' }, h('div', { class: 'overlay-heading' }, titleEl, opts.titleExtra || null), closeBtn),
    body);

    root.appendChild(backdrop);
    root.appendChild(el);
    syncViewport();
    setBackgroundInert(true);
    currentOv = { id: opts.id, el, backdrop, opts, returnTarget: inheritedReturn || returnTargetFrom(opts.trigger) };
    const api = {
      close: (reason) => close(reason || 'api'),
      el,
      body,
      setTitle: (txt) => { titleEl.textContent = txt; },
    };
    if (opts.render) opts.render(body, api);
    requestAnimationFrame(() => {
      el.classList.add('is-open');
      backdrop.classList.add('is-open');
      let target = null;
      if (opts.initialFocus) target = typeof opts.initialFocus === 'string' ? el.querySelector(opts.initialFocus) : opts.initialFocus;
      if (!target) target = titleEl;
      App.util.focusEl(target, { preventScroll: true });
    });
    return api;
  }

  function close(reason = 'api', { silent = false } = {}) {
    if (!currentOv) return;
    const ov = currentOv;
    currentOv = null;
    if (App.popover) App.popover.close({ restoreFocus: false });
    ov.el.remove();
    ov.backdrop.remove();
    setBackgroundInert(false);
    if (ov.opts.onClose) ov.opts.onClose(reason);
    if (silent) return;
    requestAnimationFrame(() => {
      const rt = ov.returnTarget || {};
      let target = rt.el && rt.el.isConnected ? rt.el : App.util.findByFid(rt.fid);
      if (target) App.util.focusEl(target, { preventScroll: false });
      else App.router.focusHeading();
    });
  }

  document.addEventListener('keydown', onKeydown);
  App.i18n.onChange(() => {
    if (!currentOv) return;
    const btn = currentOv.el.querySelector('.overlay-close');
    if (!btn) return;
    btn.setAttribute('aria-label', t('common.close'));
    const txt = btn.querySelector('.overlay-close-text');
    if (txt) txt.textContent = t('common.close');
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncViewport);
    window.visualViewport.addEventListener('scroll', syncViewport);
  }
  window.addEventListener('resize', syncViewport);

  return {
    open,
    close,
    isOpen: (id) => !!currentOv && (!id || currentOv.id === id),
    current: () => (currentOv ? currentOv.id : null),
    element: () => (currentOv ? currentOv.el : null),
  };
})();

/* Non-modal popover used for glossary definitions. Opens on hover/focus
 * (transient) or click/tap (pinned). Escape closes and returns focus to the
 * term. The popover is inserted directly after its trigger so keyboard
 * order flows from the term into the popover's controls. */
App.popover = (() => {
  let cur = null; // { trigger, el, pinned }
  let hideTimer = null;

  function position() {
    if (!cur) return;
    const { trigger, el } = cur;
    if (App.util.isNarrow()) {
      el.classList.add('popover--sheet');
      el.style.left = '';
      el.style.top = '';
      return;
    }
    el.classList.remove('popover--sheet');
    const r = trigger.getBoundingClientRect();
    const pw = el.offsetWidth;
    const ph = el.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    let left = Math.min(Math.max(12, r.left), vw - pw - 12);
    let top = r.bottom + 8;
    if (top + ph > vh - 12 && r.top - ph - 8 > 12) top = r.top - ph - 8;
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
  }

  function open(trigger, { render, pinned = false, label }) {
    clearTimeout(hideTimer);
    if (cur && cur.trigger === trigger) {
      if (pinned) { cur.pinned = true; cur.el.classList.add('is-pinned'); }
      return cur;
    }
    close({ restoreFocus: false });
    const id = App.util.uid('pop');
    const el = h('span', { class: 'popover', id, role: 'dialog', 'aria-modal': 'false', 'aria-label': label || '' });
    render(el, { close: () => close({ restoreFocus: true }) });
    trigger.insertAdjacentElement('afterend', el);
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('aria-controls', id);
    cur = { trigger, el, pinned };
    if (pinned) el.classList.add('is-pinned');
    el.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    el.addEventListener('mouseleave', () => scheduleHide());
    el.addEventListener('focusout', onFocusOut);
    position();
    requestAnimationFrame(position);
    return cur;
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    if (!cur || cur.pinned) return;
    hideTimer = setTimeout(() => close({ restoreFocus: false }), 220);
  }

  function onFocusOut(e) {
    if (!cur) return;
    const next = e.relatedTarget;
    if (next && (cur.el.contains(next) || cur.trigger === next)) return;
    if (!cur.pinned) close({ restoreFocus: false });
  }

  function close({ restoreFocus = false } = {}) {
    clearTimeout(hideTimer);
    if (!cur) return;
    const { trigger, el } = cur;
    cur = null;
    el.remove();
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-controls');
    if (restoreFocus && trigger.isConnected) {
      // Returning focus must not re-open the definition via the focus handler
      trigger.dataset.suppressFocusOpen = '1';
      trigger.focus();
      setTimeout(() => { delete trigger.dataset.suppressFocusOpen; }, 0);
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && cur) {
      e.preventDefault();
      e.stopPropagation();
      close({ restoreFocus: true });
    }
  }, true);
  document.addEventListener('pointerdown', (e) => {
    if (!cur) return;
    if (cur.el.contains(e.target) || cur.trigger.contains(e.target)) return;
    close({ restoreFocus: false });
  });
  window.addEventListener('resize', App.util.debounce(position, 60));
  window.addEventListener('scroll', () => { if (cur && !App.util.isNarrow()) position(); }, { passive: true });

  return {
    open,
    close,
    scheduleHide,
    isOpen: () => !!cur,
    current: () => cur,
    onFocusOut,
  };
})();
