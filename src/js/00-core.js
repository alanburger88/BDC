/* Core namespace, DOM helpers and locale-aware formatting.
 * Everything renders through h()/svg(), which only ever creates text nodes for
 * string children - user-entered text is never parsed as HTML. */
'use strict';

const App = {
  version: '1.0.0',
  modules: {},
  assets: {},
  build: {},
};
// Exposed for presenter tooling and automated QA only; holds no secrets.
window.BDCNotice = App;

App.util = (() => {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const BOOL_ATTRS = new Set(['hidden', 'disabled', 'checked', 'selected', 'readonly', 'required', 'open', 'inert', 'multiple']);

  function append(el, child) {
    if (child === null || child === undefined || child === false || child === true) return;
    if (Array.isArray(child)) { child.forEach((c) => append(el, c)); return; }
    if (child instanceof Node) { el.appendChild(child); return; }
    el.appendChild(document.createTextNode(String(child)));
  }

  function setAttrs(el, attrs, isSvg) {
    if (!attrs) return;
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class' || key === 'className') {
        const cls = Array.isArray(value) ? value.filter(Boolean).join(' ') : value;
        if (cls) el.setAttribute('class', cls);
      } else if (key === 'text') {
        el.textContent = String(value);
      } else if (key === 'style' && typeof value === 'object') {
        for (const [p, v] of Object.entries(value)) {
          if (v === null || v === undefined) continue;
          if (p.startsWith('--')) el.style.setProperty(p, v); else el.style[p] = v;
        }
      } else if (key === 'on') {
        for (const [evt, fn] of Object.entries(value)) if (fn) el.addEventListener(evt, fn);
      } else if (key === 'dataset') {
        for (const [k, v] of Object.entries(value)) if (v !== null && v !== undefined) el.dataset[k] = v;
      } else if (key === 'fid') {
        el.setAttribute('data-fid', value);
      } else if (key === 'ref') {
        if (typeof value === 'function') value(el);
      } else if (key === 'html') {
        throw new Error('Raw HTML is not permitted');
      } else if (BOOL_ATTRS.has(key) && !isSvg) {
        if (value) { el.setAttribute(key, ''); if (key in el) { try { el[key] = true; } catch (e) { /* read-only */ } } }
      } else if (key === 'value' && !isSvg && 'value' in el) {
        el.value = value;
      } else {
        el.setAttribute(key, value === true ? '' : String(value));
      }
    }
  }

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
      children.unshift(attrs);
      attrs = null;
    }
    setAttrs(el, attrs, false);
    append(el, children);
    return el;
  }

  function svg(tag, attrs, ...children) {
    const el = document.createElementNS(SVG_NS, tag);
    if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
      children.unshift(attrs);
      attrs = null;
    }
    setAttrs(el, attrs, true);
    append(el, children);
    return el;
  }

  function clear(el) {
    while (el && el.firstChild) el.removeChild(el.firstChild);
    return el;
  }

  let uidCounter = 0;
  function uid(prefix = 'id') {
    uidCounter += 1;
    return `${prefix}-${uidCounter}`;
  }

  // Lower-case, strip accents and punctuation, collapse spaces - for search and intent matching.
  function normalize(str) {
    return String(str || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[’'`]/g, "'")
      .replace(/[^a-z0-9$%'\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function downloadBlob(filename, mime, content) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* fall through */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) {
      return false;
    }
  }

  function debounce(fn, ms = 120) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  const reducedMotionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function prefersReducedMotion() {
    return !!(reducedMotionQuery && reducedMotionQuery.matches);
  }

  // Focusable descendants in DOM order (visible ones only).
  function focusables(root) {
    const sel = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), audio[controls], video[controls], summary';
    return [...root.querySelectorAll(sel)].filter((el) => {
      if (el.closest('[inert]') && !root.closest('[inert]')) return false;
      const style = window.getComputedStyle(el);
      return style.visibility !== 'hidden' && style.display !== 'none' && (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0);
    });
  }

  function findByFid(fid, root = document) {
    if (!fid) return null;
    try {
      return root.querySelector(`[data-fid="${CSS.escape(fid)}"]`);
    } catch (e) {
      return null;
    }
  }

  function focusEl(el, opts = {}) {
    if (!el) return false;
    if (!el.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(el.tagName)) el.setAttribute('tabindex', '-1');
    try { el.focus({ preventScroll: !!opts.preventScroll }); } catch (e) { el.focus(); }
    return document.activeElement === el;
  }

  function isNarrow() {
    return window.matchMedia ? window.matchMedia('(max-width: 599.98px)').matches : window.innerWidth < 600;
  }

  // Safe storage for non-sensitive preferences only, with an in-memory fallback.
  const prefs = (() => {
    const mem = {};
    const KEY = 'bdc-demo-prefs';
    let store = null;
    try {
      const t = '__t';
      window.localStorage.setItem(t, t);
      window.localStorage.removeItem(t);
      store = window.localStorage;
    } catch (e) { store = null; }
    function readAll() {
      if (!store) return mem;
      try { return JSON.parse(store.getItem(KEY) || '{}') || {}; } catch (e) { return {}; }
    }
    return {
      get(k) { return readAll()[k]; },
      set(k, v) {
        const allowed = ['locale', 'captions', 'volume', 'muted', 'rate'];
        if (!allowed.includes(k)) throw new Error(`Preference ${k} is not on the allow-list`);
        if (!store) { mem[k] = v; return; }
        try { const all = readAll(); all[k] = v; store.setItem(KEY, JSON.stringify(all)); } catch (e) { mem[k] = v; }
      },
      persistent: !!store,
    };
  })();

  return { h, svg, clear, uid, normalize, downloadBlob, copyText, debounce, prefersReducedMotion, focusables, findByFid, focusEl, isNarrow, prefs, append };
})();

const { h, svg } = App.util;

/* Locale-aware, timezone-safe formatting. Dates are ISO calendar dates
 * (yyyy-mm-dd) formatted in UTC so they never shift by a day. */
App.fmt = (() => {
  const cache = new Map();
  const nf = (locale, opts) => {
    const key = locale + JSON.stringify(opts);
    if (!cache.has(key)) cache.set(key, new Intl.NumberFormat(locale, opts));
    return cache.get(key);
  };
  const df = (locale, opts) => {
    const key = 'd' + locale + JSON.stringify(opts);
    if (!cache.has(key)) cache.set(key, new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...opts }));
    return cache.get(key);
  };
  const loc = () => (App.i18n ? App.i18n.locale : 'en-CA');

  function money(cents, opts = {}) {
    const locale = opts.locale || loc();
    const whole = opts.whole === true || (opts.compact === true && cents % 100 === 0);
    const value = cents / 100;
    let out = nf(locale, {
      style: 'currency',
      currency: 'CAD',
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(opts.signed ? Math.abs(value) : value);
    if (opts.signed) out = (cents < 0 ? '−' : cents > 0 ? '+' : '') + out;
    return out;
  }

  // Plain decimal for CSV / machine use: 1600.00 (never localised)
  function decimal(cents) {
    const sign = cents < 0 ? '-' : '';
    const abs = Math.abs(cents);
    return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  }

  function parseISO(iso) {
    const [y, m, d] = String(iso).split('-').map(Number);
    return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  }

  const DATE_STYLES = {
    long: { year: 'numeric', month: 'long', day: 'numeric' },
    medium: { year: 'numeric', month: 'short', day: 'numeric' },
    dayMonth: { month: 'long', day: 'numeric' },
    dayMonthShort: { month: 'short', day: 'numeric' },
    monthYear: { year: 'numeric', month: 'long' },
    monthYearShort: { year: 'numeric', month: 'short' },
    month: { month: 'long' },
    monthShort: { month: 'short' },
    year: { year: 'numeric' },
  };

  function date(iso, style = 'long', locale = loc()) {
    if (!iso) return '';
    const d = parseISO(iso.length === 7 ? `${iso}-01` : iso);
    const f = df(locale, DATE_STYLES[style] || DATE_STYLES.long);
    // Canadian French writes the first day of a month as an ordinal: « 1er novembre 2026 »
    if (locale === 'fr-CA' && iso.length > 7 && d.getUTCDate() === 1 && (DATE_STYLES[style] || DATE_STYLES.long).day) {
      return f.formatToParts(d).map((p) => (p.type === 'day' ? '1er' : p.value)).join('');
    }
    return f.format(d);
  }

  function percentFromBp(bp, locale = loc()) {
    return nf(locale, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(bp / 10000);
  }

  function number(n, locale = loc()) {
    return nf(locale, {}).format(n);
  }

  function time(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  // Spoken-friendly duration for aria-valuetext, e.g. "1 minute 5 seconds"
  function timeLong(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return App.i18n.t('common.timeLong', { m, s: r });
  }

  // Local wall-clock time of an event timestamp (demo events only)
  function clock(isoTs, locale = loc()) {
    const key = `clock${locale}`;
    if (!cache.has(key)) cache.set(key, new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    return cache.get(key).format(new Date(isoTs));
  }

  return { money, decimal, date, parseISO, percentFromBp, number, time, timeLong, clock };
})();
