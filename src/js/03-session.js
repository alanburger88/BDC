/* ExperienceState (App.session) and DemoEvents (App.events).
 * Both live in memory for this browser session only. Query text and survey
 * comments are never written to persistent storage or to the event log. */
App.session = (() => {
  let data = {};
  const resetListeners = [];
  const changeListeners = [];

  return {
    // Get (or lazily create) a named slice of experience state.
    slice(name, init) {
      if (!(name in data)) data[name] = init ? init() : {};
      return data[name];
    },
    has(name) { return name in data; },
    // Notify listeners that state changed (modules decide what to re-render)
    changed(name) { changeListeners.forEach((fn) => fn(name)); },
    onChange(fn) { changeListeners.push(fn); },
    onReset(fn) { resetListeners.push(fn); },
    reset() {
      data = {};
      resetListeners.forEach((fn) => fn());
    },
    _debug() { return data; },
  };
})();

App.events = (() => {
  // PRD section 17 event types (+ a local "marked_reviewed" demo milestone)
  const TYPES = [
    'notice_opened', 'section_viewed', 'detail_opened', 'glossary_opened', 'explain_requested',
    'video_started', 'video_chapter_viewed', 'video_completed', 'query_drafted', 'demo_query_created',
    'survey_submitted', 'resource_opened', 'schedule_exported', 'language_changed', 'marked_reviewed',
  ];
  // once: at most once per session; oncePerId: once per (type,id); consecutive: skip exact repeats in a row
  const DEDUPE = {
    notice_opened: 'once',
    marked_reviewed: 'once',
    video_started: 'oncePerId',
    video_completed: 'oncePerId',
    video_chapter_viewed: 'oncePerId',
    section_viewed: 'consecutive',
    detail_opened: 'consecutive',
  };
  let log = [];
  let seen = new Set();
  let last = {};
  const listeners = [];
  const ID_RE = /^[a-z0-9][a-z0-9:_.-]{0,63}$/i;

  function record(type, data = {}) {
    if (!TYPES.includes(type)) { console.warn(`[events] unknown type ${type}`); return null; }
    // Identifiers only: never free text, names or amounts.
    const id = data.id !== undefined && data.id !== null ? String(data.id) : '';
    if (id && !ID_RE.test(id)) { console.warn(`[events] rejected non-identifier id for ${type}`); return null; }
    const mode = DEDUPE[type];
    const key = `${type}|${id}`;
    if (mode === 'once' && seen.has(type)) return null;
    if (mode === 'oncePerId' && seen.has(key)) return null;
    if (mode === 'consecutive' && last[type] === key) return null;
    seen.add(type);
    seen.add(key);
    last[type] = key;
    const entry = {
      seq: log.length + 1,
      type,
      id: id || null,
      section: (App.router && App.router.current().section) || null,
      locale: App.i18n.locale,
      ts: new Date().toISOString(),
    };
    if (data.detail && ID_RE.test(String(data.detail))) entry.detail = String(data.detail);
    log.push(entry);
    listeners.forEach((fn) => fn(entry));
    return entry;
  }

  return {
    TYPES,
    log: record,
    all() { return log.slice(); },
    counts() {
      const c = {};
      TYPES.forEach((tp) => { c[tp] = 0; });
      log.forEach((e) => { c[e.type] += 1; });
      return c;
    },
    onChange(fn) { listeners.push(fn); },
    reset() { log = []; seen = new Set(); last = {}; listeners.forEach((fn) => fn(null)); },
  };
})();

App.session.onReset(() => App.events.reset());

App.announce = (text, assertive = false) => {
  const el = document.getElementById(assertive ? 'live-assertive' : 'live-polite');
  if (!el) return;
  el.textContent = '';
  // Re-set after a tick so repeated messages are announced
  setTimeout(() => { el.textContent = text; }, 40);
};
