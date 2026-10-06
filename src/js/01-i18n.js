/* ApprovedContent: bilingual dictionaries registered per namespace.
 * Keys are "namespace.path.to.value". Values are strings with {param}
 * placeholders, or arrays/objects for structured content (FAQ, intents).
 * A missing key renders as ⟦key⟧ so QA can detect it; it never falls back
 * silently to the other language. */
App.i18n = (() => {
  const LOCALES = ['en-CA', 'fr-CA'];
  const dicts = { 'en-CA': {}, 'fr-CA': {} };
  const listeners = [];
  const missing = new Set();
  let locale = 'en-CA';

  function register(namespace, byLocale) {
    for (const l of LOCALES) {
      if (!byLocale[l]) throw new Error(`Content namespace ${namespace} is missing ${l}`);
      if (dicts[l][namespace]) throw new Error(`Content namespace ${namespace} registered twice`);
      dicts[l][namespace] = byLocale[l];
    }
  }

  function lookup(key, l = locale) {
    const parts = key.split('.');
    let cur = dicts[l];
    for (const p of parts) {
      if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
      cur = cur[p];
    }
    return cur;
  }

  function interpolate(str, params) {
    if (!params) return str;
    return str.replace(/\{(\w+)\}/g, (m, name) => (params[name] !== undefined && params[name] !== null ? String(params[name]) : m));
  }

  function t(key, params, l = locale) {
    const v = lookup(key, l);
    if (typeof v === 'string') return interpolate(v, params);
    if (typeof v === 'number') return String(v);
    if (!missing.has(`${l}:${key}`)) {
      missing.add(`${l}:${key}`);
      console.warn(`[i18n] missing ${l} key: ${key}`);
    }
    return `⟦${key}⟧`;
  }

  // Raw structured value (array/object) for the active locale
  function tv(key, l = locale) {
    const v = lookup(key, l);
    if (v === undefined && !missing.has(`${l}:${key}`)) {
      missing.add(`${l}:${key}`);
      console.warn(`[i18n] missing ${l} key: ${key}`);
    }
    return v;
  }

  function has(key, l = locale) {
    return lookup(key, l) !== undefined;
  }

  function setLocale(next, opts = {}) {
    if (!LOCALES.includes(next) || next === locale) return;
    const prev = locale;
    locale = next;
    document.documentElement.lang = next;
    try { App.util.prefs.set('locale', next); } catch (e) { /* ignore */ }
    listeners.forEach((fn) => fn(next, prev, opts));
  }

  function onChange(fn) {
    listeners.push(fn);
  }

  // Short language label for user-written text ("Written in English")
  function languageName(l) {
    return t(`common.languageNames.${l}`);
  }

  return {
    LOCALES,
    register,
    t,
    tv,
    has,
    setLocale,
    onChange,
    languageName,
    get locale() { return locale; },
    get other() { return locale === 'en-CA' ? 'fr-CA' : 'en-CA'; },
    _dicts: dicts,
    _missing: missing,
  };
})();

const t = (...args) => App.i18n.t(...args);
const tv = (...args) => App.i18n.tv(...args);
