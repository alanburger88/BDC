/* Demo insights: a presenter view of LOCAL interaction events (PRD section 17).
 * Shows counts by event type, a live timeline, milestones, Export and Reset,
 * the hardship/arrears demo-rule switch, the accessibility-widget status and
 * the usability evaluation tasks. Interaction counts only: never presented
 * as measured BDC outcomes, comprehension, consent or service completion.
 * Reached from the footer link (#/insights); not a tab, not a secure role. */
(() => {
  const NS = 'insights';
  const T = (k, p) => t(`${NS}.${k}`, p);
  const ID_RE = /^[a-z0-9][a-z0-9:_.-]{0,63}$/i;
  const capStep = () => (App.util.isNarrow() ? 10 : 25);
  const GROUPS = [
    ['navigation', ['notice_opened', 'section_viewed', 'detail_opened', 'language_changed']],
    ['understanding', ['glossary_opened', 'explain_requested', 'video_started', 'video_chapter_viewed', 'video_completed']],
    ['actions', ['marked_reviewed', 'query_drafted', 'demo_query_created', 'survey_submitted', 'resource_opened', 'schedule_exported']],
  ];
  const TASKS = ['nextPayment', 'resume', 'owing', 'interest'];
  // The help module's three-face survey ids (its slice: { rating, comment, dismissed }).
  const RATINGS = ['unhappy', 'neutral', 'happy'];
  // Live updates that arrive this soon after a render come from the visit itself
  // (the router logs section_viewed right after rendering): no "new event" flash.
  const SETTLE_MS = 400;

  let refs = null;
  let cap = null; // timeline display cap, set on first render

  const presenter = () => {
    const p = App.session.slice('presenter', () => ({ simulateHardship: false }));
    if (!p.tasks || typeof p.tasks !== 'object') p.tasks = {};
    return p;
  };
  const num = (n) => App.fmt.number(n);
  const money = (c) => App.fmt.money(c, { compact: true });
  const has = (k) => App.i18n.has(k);

  function plural(key, n, extra = {}) {
    let cat = 'other';
    try { cat = new Intl.PluralRules(App.i18n.locale).select(n); } catch (e) { cat = n === 1 ? 'one' : 'other'; }
    return T(`${key}.${cat === 'one' ? 'one' : 'other'}`, { n: num(n), ...extra });
  }

  // Canadian French writes the first day of a month as "1er" (Intl gives "1").
  function longDate(iso) {
    // fr-CA "1er" comes from App.fmt; keep the day with its month on one line
    return App.fmt.date(iso, 'long').replace(' ', '\u00a0');
  }

  function allGroups() {
    const known = new Set(GROUPS.flatMap(([, types]) => types));
    const extra = (App.events.TYPES || []).filter((tp) => !known.has(tp));
    return extra.length ? [...GROUPS, ['other', extra]] : GROUPS;
  }

  const typeLabel = (type, form) => (has(`${NS}.types.${type}.${form}`) ? T(`types.${type}.${form}`) : type);
  const sectionLabel = (s) => (s && has(`nav.${s}`) ? t(`nav.${s}`) : null);
  const langLabel = (l) => (l && has(`${NS}.languages.${l}`) ? T(`languages.${l}`) : l || '');

  // Localised label for an identifier, when an approved one exists.
  function itemLabelSafe(kind, id) {
    const ok = {
      card: () => has(`items.card.${id}`),
      summary: () => has(`items.summary.${id}`),
      month: () => App.rec.isMonthId(id),
      clause: () => has(`clauses.${id}`),
      term: () => has(`glossary.${id}.term`),
      chapter: () => has(`chapters.${id}`),
      resource: () => has(`items.resource.${id}`),
      chart: () => has(`items.chart.${id}`),
      infographic: () => has(`items.infographic.${id}`),
      faq: () => true,
      section: () => has(`nav.${id}`),
      general: () => true,
    }[kind];
    return ok && ok() ? App.ui.itemLabel({ kind, id }) : null;
  }

  function describe(e) {
    const id = e.id || '';
    if (!id) return null;
    switch (e.type) {
      case 'section_viewed': return sectionLabel(id);
      case 'detail_opened': {
        const [section, item] = id.split(':');
        const s = sectionLabel(section);
        if (!s || !item) return s;
        let it = null;
        if (App.rec.isMonthId(item)) it = App.fmt.date(item, 'monthYear');
        else if (section === 'changes') it = itemLabelSafe('card', item);
        else if (section === 'documents') it = has(`clauses.${item}`) ? t(`clauses.${item}`) : null;
        else if (section === 'support') it = itemLabelSafe('resource', item);
        else if (section === 'help') {
          const sub = id.split(':')[2];
          if (item === 'faq' && sub) it = App.ui.itemLabel({ kind: 'faq', id: sub });
          else if (item === 'glossary' && sub && has(`glossary.${sub}.term`)) it = t(`glossary.${sub}.term`);
        }
        return it ? `${s} › ${it}` : s;
      }
      case 'glossary_opened': return has(`glossary.${id}.term`) ? t(`glossary.${id}.term`) : null;
      case 'explain_requested': {
        const [kind, item] = id.split(':');
        return itemLabelSafe(kind, item || null);
      }
      case 'video_chapter_viewed':
      case 'video_started':
      case 'video_completed': return has(`chapters.${id}`) ? t(`chapters.${id}`) : (has(`${NS}.languages.${id}`) ? langLabel(id) : null);
      case 'resource_opened': return itemLabelSafe('resource', id);
      case 'language_changed': return langLabel(id);
      case 'query_drafted': return has(`query.topic.options.${id}`) ? t(`query.topic.options.${id}`) : null;
      default: return null;
    }
  }

  function fmtTime(iso) {
    try {
      return new Intl.DateTimeFormat(App.i18n.locale, { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(iso));
    } catch (e) {
      return iso.slice(11, 19);
    }
  }

  /* ---------------- milestones ---------------- */

  // Survey rating from the help module's slice (kept separate from "Mark as reviewed").
  function surveyRating() {
    if (App.session.has('survey')) {
      const s = App.session.slice('survey');
      const v = s && s.rating;
      if (typeof v === 'string' && ID_RE.test(v)) return v;
    }
    const last = App.events.all().filter((e) => e.type === 'survey_submitted' && e.id).pop();
    return last ? last.id : null;
  }

  function milestoneData() {
    const reviewed = App.session.has('review') ? !!App.session.slice('review').reviewed : false;
    const q = App.session.has('query') ? App.session.slice('query') : null;
    const requests = q && Array.isArray(q.requests) ? q.requests : [];
    const draft = !!(q && q.draft && typeof q.draft.text === 'string' && q.draft.text.trim());
    return { reviewed, survey: surveyRating(), requests: requests.map((r) => r.ref).filter((r) => ID_RE.test(r)), draft };
  }

  function yesNo(v, ns = 'milestones') {
    return h('span', { class: ['ins-flag', v ? 'is-yes' : 'is-no'] }, App.ui.icon(v ? 'check' : 'close', { size: 14 }), T(`${ns}.${v ? 'yes' : 'no'}`));
  }

  function renderMilestones() {
    const m = milestoneData();
    // Prefer the survey's own approved option label (help module), else this namespace's copy.
    const helpKey = m.survey ? `help.survey.options.${m.survey}` : null;
    const rating = m.survey && !has(helpKey) && RATINGS.includes(m.survey) ? m.survey : null;
    const row = (label, value, note) => h('div', { class: 'ins-ms-row' },
      h('dt', null, label),
      h('dd', null, value, note ? h('span', { class: 'ins-ms-note' }, note) : null));
    let surveyValue;
    if (helpKey && has(helpKey)) surveyValue = h('span', { class: 'ins-ms-value' }, t(helpKey));
    else if (rating) surveyValue = h('span', { class: 'ins-ms-value' }, T(`milestones.ratings.${rating}`));
    else if (m.survey) surveyValue = h('code', { class: 'ins-code' }, m.survey);
    else surveyValue = h('span', { class: 'ins-ms-value is-muted' }, T('milestones.surveyNone'));
    return h('dl', { class: 'ins-ms' },
      row(T('milestones.reviewed'), yesNo(m.reviewed), T('milestones.reviewedNote')),
      row(T('milestones.survey'), surveyValue, T('milestones.surveyNote')),
      row(T('milestones.requests'),
        h('span', { class: 'ins-ms-value' }, h('span', { class: 'ins-ms-count' }, num(m.requests.length)),
          m.requests.length ? h('span', { class: 'ins-ms-refs' }, m.requests.map((r) => h('code', { class: 'ins-code' }, r))) : null),
        T('milestones.requestsNote')),
      row(T('milestones.draft'), yesNo(m.draft)));
  }

  function refreshMilestones() {
    if (!refs || !refs.milestones) return;
    const next = renderMilestones();
    refs.milestones.replaceWith(next);
    refs.milestones = next;
  }

  /* ---------------- counts ---------------- */

  // Event codes may wrap after underscores only (never mid-word).
  const breakable = (code) => code.split('_').flatMap((part, i, arr) => (i < arr.length - 1 ? [`${part}_`, h('wbr')] : [part]));

  function renderCounts() {
    const counts = App.events.counts();
    refs.tiles = new Map();
    return allGroups().map(([group, types]) => h('div', { class: 'ins-group' },
      h('h3', { class: 'ins-group-title' }, T(`counts.groups.${group}`)),
      h('ul', { class: 'ins-tiles' }, types.map((type) => {
        const n = counts[type] || 0;
        const countEl = h('span', { class: 'ins-tile-count' }, num(n));
        const li = h('li', { class: ['ins-tile', n ? null : 'is-zero'], 'data-type': type },
          h('span', { class: 'ins-tile-label' }, typeLabel(type, 'count')),
          countEl,
          h('code', { class: 'ins-tile-code' }, breakable(type)));
        refs.tiles.set(type, { li, countEl });
        return li;
      }))));
  }

  function updateCounts(changedType) {
    if (!refs || !refs.tiles) return;
    const counts = App.events.counts();
    refs.tiles.forEach(({ li, countEl }, type) => {
      const n = counts[type] || 0;
      countEl.textContent = num(n);
      li.classList.toggle('is-zero', !n);
      if (type === changedType && !App.util.prefersReducedMotion()) {
        li.classList.remove('is-bumped');
        void li.offsetWidth; // restart the highlight
        li.classList.add('is-bumped');
      }
    });
    if (refs.total) refs.total.textContent = plural('counts.total', App.events.all().length);
  }

  /* ---------------- timeline ---------------- */

  function eventRow(e, isNew) {
    const target = describe(e);
    const meta = [];
    if (e.id) meta.push(h('span', { class: 'ins-meta' }, h('span', { class: 'ins-meta-label' }, `${T('timeline.id')} `), h('code', { class: 'ins-code' }, e.id)));
    meta.push(h('span', { class: 'ins-meta' }, h('span', { class: 'ins-meta-label' }, `${T('timeline.section')} `), sectionLabel(e.section) || T('timeline.none')));
    meta.push(h('span', { class: 'ins-meta' }, h('span', { class: 'ins-meta-label' }, `${T('timeline.language')} `), langLabel(e.locale)));
    return h('li', { class: ['ins-event', isNew ? 'is-new' : null], 'data-type': e.type, 'data-seq': String(e.seq) },
      h('div', { class: 'ins-event-when' },
        h('time', { datetime: e.ts, class: 'ins-event-time' }, fmtTime(e.ts)),
        h('span', { class: 'ins-event-seq' }, T('timeline.seq', { n: num(e.seq) }))),
      h('div', { class: 'ins-event-body' },
        h('p', { class: 'ins-event-title' }, typeLabel(e.type, 'event')),
        target ? h('p', { class: 'ins-event-target' }, target) : null,
        h('p', { class: 'ins-event-meta' }, meta)));
  }

  function renderTimeline(newSeq) {
    if (!refs || !refs.list) return [];
    const all = App.events.all();
    if (cap === null) cap = capStep();
    const shown = all.slice(-cap).reverse();
    App.util.clear(refs.list);
    if (!all.length) refs.list.appendChild(h('li', { class: 'ins-event ins-event--empty' }, T('timeline.empty')));
    const rows = shown.map((e) => {
      const row = eventRow(e, newSeq !== undefined && e.seq === newSeq && !App.util.prefersReducedMotion());
      refs.list.appendChild(row);
      return row;
    });
    refs.showing.textContent = T('timeline.showing', { n: num(shown.length), total: num(all.length) });
    refs.more.hidden = all.length <= cap;
    return rows;
  }

  // "Show more": keep keyboard focus useful. The button hides itself once every
  // event is shown, so focus moves to the first newly revealed event instead.
  function showMore() {
    const before = refs.list.querySelectorAll('.ins-event[data-seq]').length;
    cap += capStep();
    const rows = renderTimeline();
    if (refs.more.hidden && rows[before]) {
      rows[before].setAttribute('tabindex', '-1');
      App.util.focusEl(rows[before]);
    }
  }

  /* ---------------- presenter controls ---------------- */

  function hardshipControl() {
    const on = !!presenter().simulateHardship;
    let block = null;
    const stateEl = h('p', { class: 'ins-switch-state', id: 'ins-hardship-state' }, T(on ? 'presenter.stateOn' : 'presenter.stateOff'));
    const btn = h('button', {
      type: 'button',
      role: 'switch',
      id: 'ins-hardship',
      class: 'ins-switch',
      fid: 'ins-hardship',
      'aria-checked': String(on),
      'aria-describedby': 'ins-hardship-desc ins-hardship-state',
      on: {
        click: () => {
          const p = presenter();
          p.simulateHardship = !p.simulateHardship;
          btn.setAttribute('aria-checked', String(p.simulateHardship));
          stateEl.textContent = T(p.simulateHardship ? 'presenter.stateOn' : 'presenter.stateOff');
          if (block) block.classList.toggle('is-on', p.simulateHardship);
          App.session.changed('presenter');
          App.announce(stateEl.textContent);
        },
      },
    }, h('span', { class: 'ins-switch-thumb', 'aria-hidden': 'true' }));
    return h('div', { class: ['ins-switch-block', on ? 'is-on' : null], ref: (el) => { block = el; } },
      h('div', { class: 'ins-switch-row' },
        btn,
        h('label', { class: 'ins-switch-label', for: 'ins-hardship' }, T('presenter.hardship'))),
      h('p', { class: 'ins-switch-desc', id: 'ins-hardship-desc' }, T('presenter.hardshipDesc')),
      stateEl,
      App.ui.routeLink({ label: T('presenter.openSupport'), target: App.router.href('support'), fid: 'ins-open-support', originCtx: null, focus: 'heading' }));
  }

  function widgetStatus() {
    // Match by fragment: the vendor URL itself appears only once, in the page shell.
    const n = document.querySelectorAll('script[src*="accessibilityserver"]').length;
    return h('div', { class: 'ins-widget' },
      h('p', null, T('widget.body')),
      h('dl', { class: 'ins-ms ins-ms--compact' },
        h('div', { class: 'ins-ms-row' }, h('dt', null, T('widget.present')), h('dd', null, yesNo(n > 0, 'widget'))),
        h('div', { class: 'ins-ms-row' }, h('dt', null, T('widget.count')), h('dd', null, h('span', { class: 'ins-ms-value' }, num(n))))),
      h('p', { class: 'ins-small' }, T('widget.note')));
  }

  /* ---------------- usability tasks ---------------- */

  function taskValues() {
    const R = App.record;
    const D = R.derived || {};
    const next = App.rec.nextPayment();
    const res = App.rec.firstResumed();
    return {
      nextPayment: { params: { amount: money(next.totalCents), date: longDate(next.date) }, target: App.router.href('overview'), place: t('nav.overview') },
      resume: { params: { date: longDate(R.change.resumePrincipalDate), amount: money(D.firstResumedPaymentCents || res.totalCents) }, target: App.router.href('payments', res.date.slice(0, 7)), place: t('nav.payments') },
      owing: { params: { deferred: money(D.principalDeferredCents), maturity: longDate(R.change.revisedMaturity) }, target: App.router.href('changes', 'debt'), place: t('nav.changes') },
      interest: { params: { total: money(D.additionalLifetimeInterestCents), first: money(D.additionalInterestFirstThreeMonthsCents) }, target: App.router.href('payments', 'cost'), place: t('nav.payments') },
    };
  }

  function renderTasks() {
    const vals = taskValues();
    const p = presenter();
    const progress = h('p', { class: 'ins-task-progress', id: 'ins-task-progress' });
    const updateProgress = () => {
      const done = TASKS.filter((k) => presenter().tasks[k]).length;
      progress.textContent = plural('tasks.progress', done, { total: num(TASKS.length) });
    };
    const list = h('ol', { class: 'ins-tasks' }, TASKS.map((key, i) => {
      const v = vals[key];
      const cbId = `ins-task-${key}`;
      const taskName = T(`tasks.items.${key}.task`);
      const item = h('li', { class: ['ins-task', p.tasks[key] ? 'is-done' : null] });
      // The same visible labels repeat for every task, so each control's
      // accessible name also names its task (WCAG 2.4.6), visible label first (2.5.3).
      const cb = h('input', {
        type: 'checkbox',
        id: cbId,
        fid: cbId,
        checked: !!p.tasks[key],
        'aria-label': T('tasks.doneLabel', { task: taskName }),
        'aria-describedby': 'ins-task-progress',
        on: {
          change: (e) => {
            const pp = presenter();
            pp.tasks[key] = e.target.checked;
            item.classList.toggle('is-done', e.target.checked);
            updateProgress();
          },
        },
      });
      const answer = App.ui.disclosure({
        summary: T('tasks.showAnswer'),
        fid: `ins-answer-${key}`,
        className: 'ins-answer',
        content: () => h('p', { class: 'ins-answer-text' }, T(`tasks.items.${key}.answer`, v.params)),
      });
      const toggle = answer.querySelector('.disclosure-toggle');
      if (toggle) toggle.setAttribute('aria-label', T('tasks.answerLabel', { task: taskName }));
      item.append(
        h('div', { class: 'ins-task-head' },
          h('span', { class: 'ins-task-num', 'aria-hidden': 'true' }, num(i + 1)),
          h('h3', { class: 'ins-task-title' }, taskName)),
        h('div', { class: 'choice ins-task-check' }, cb, h('label', { for: cbId }, T('tasks.done'))),
        answer,
        App.ui.routeLink({ label: T('tasks.goTo', { place: v.place }), target: v.target, fid: `ins-task-link-${key}`, originCtx: null, focus: 'heading' }));
      return item;
    }));
    updateProgress();
    return [h('p', { class: 'ins-section-intro' }, T('tasks.intro')), progress, list, h('p', { class: 'ins-small ins-pilot' }, T('tasks.pilot'))];
  }

  /* ---------------- actions ---------------- */

  function setStatus(text) {
    if (!refs || !refs.status) return;
    App.util.clear(refs.status).append(App.ui.icon('check', { size: 16 }), h('span', null, text));
  }

  function exportEvents() {
    const R = App.record;
    const m = milestoneData();
    const data = {
      schema: 'bdc-notice-demo-events/1',
      demo: true,
      scope: 'local-browser-tab',
      noticeId: R.noticeId,
      recordVersion: R.recordVersion,
      exportedAt: new Date().toISOString(),
      locale: App.i18n.locale,
      counts: App.events.counts(),
      milestones: {
        markedReviewed: m.reviewed,
        surveyRating: m.survey && ID_RE.test(m.survey) ? m.survey : null,
        demoRequestsCreated: m.requests.length,
        demoRequestReferences: m.requests,
      },
      presenter: { simulateHardship: !!presenter().simulateHardship },
      // Identifiers, locale and timestamps only - no free text, names or amounts.
      events: App.events.all().map((e) => {
        const out = { seq: e.seq, type: e.type, id: e.id, section: e.section, locale: e.locale, ts: e.ts };
        if (e.detail) out.detail = e.detail;
        return out;
      }),
    };
    const file = `demo-insights-${R.noticeId}.json`;
    App.util.downloadBlob(file, 'application/json', JSON.stringify(data, null, 2));
    setStatus(T('actions.exported', { file })); // role=status announces it
  }

  function confirmReset(trigger) {
    App.overlay.open({
      id: 'ins-reset',
      variant: 'dialog',
      title: t('shell.resetTitle'),
      trigger,
      render: (body, api) => {
        body.append(
          h('p', null, t('shell.resetBody')),
          h('div', { class: 'button-row' },
            App.ui.button({ label: t('shell.resetConfirm'), kind: 'primary', fid: 'ins-reset-confirm', onClick: () => { api.close('confirm'); doReset(); } }),
            App.ui.button({ label: t('common.cancel'), kind: 'secondary', fid: 'ins-reset-cancel', onClick: () => api.close('cancel') })));
      },
    });
  }

  function doReset() {
    cap = null;
    if (App.shell && typeof App.shell.resetDemo === 'function') { App.shell.resetDemo(); return; }
    App.session.reset();
    App.router.rerender();
  }

  /* ---------------- view ---------------- */

  function card(titleKey, content, cls, id) {
    return h('section', { class: ['card', 'ins-card', cls], 'aria-labelledby': id },
      h('h2', { class: 'ins-card-title', id }, T(titleKey)),
      content);
  }

  function render(el) {
    if (cap === null) cap = capStep();
    refs = { root: null };
    refs.status = h('p', { class: 'status-msg ins-status', role: 'status' });
    const actions = h('div', { class: 'ins-actions', role: 'group', 'aria-label': T('actions.label') },
      App.ui.button({ label: T('actions.export'), kind: 'secondary', iconName: 'download', fid: 'ins-export', onClick: exportEvents }),
      App.ui.button({ label: T('actions.reset'), kind: 'secondary', iconName: 'reset', fid: 'ins-reset', onClick: (e) => confirmReset(e.currentTarget) }),
      refs.status);

    const framing = h('section', { class: 'callout callout--neutral ins-framing', 'aria-labelledby': 'ins-framing-title' },
      App.ui.icon('info'),
      h('div', { class: 'ins-framing-body' },
        h('h2', { class: 'ins-framing-title', id: 'ins-framing-title' }, T('framing.heading')),
        h('ul', { class: 'ins-framing-list' }, (tv(`${NS}.framing.items`) || []).map((s) => h('li', null, s)))));

    refs.total = h('p', { class: 'ins-total' }, plural('counts.total', App.events.all().length));
    const counts = h('section', { class: 'ins-section ins-counts', 'aria-labelledby': 'ins-counts-title' },
      h('div', { class: 'ins-section-head' },
        h('h2', { id: 'ins-counts-title' }, T('counts.heading')),
        refs.total),
      renderCounts());

    refs.list = h('ol', { class: 'ins-timeline', 'aria-labelledby': 'ins-timeline-title', 'aria-describedby': 'ins-timeline-showing' });
    refs.showing = h('p', { class: 'ins-total', id: 'ins-timeline-showing' });
    refs.more = App.ui.button({
      label: T('timeline.more'),
      kind: 'secondary',
      iconName: 'chevronDown',
      fid: 'ins-more',
      className: 'ins-more',
      onClick: showMore,
    });
    const timeline = h('section', { class: 'ins-section ins-timeline-wrap', 'aria-labelledby': 'ins-timeline-title' },
      h('div', { class: 'ins-section-head' },
        h('h2', { id: 'ins-timeline-title' }, T('timeline.heading')),
        refs.showing),
      h('p', { class: 'ins-section-intro' }, T('timeline.intro')),
      refs.list,
      h('div', { class: 'ins-more-row' }, refs.more));

    refs.milestones = renderMilestones();
    const aside = h('div', { class: 'ins-aside' },
      card('milestones.heading', refs.milestones, 'ins-card--milestones', 'ins-ms-title'),
      card('presenter.heading', hardshipControl(), 'ins-card--presenter', 'ins-presenter-title'),
      card('widget.heading', widgetStatus(), 'ins-card--widget', 'ins-widget-title'));

    const tasks = h('section', { class: 'ins-section ins-tasks-wrap', 'aria-labelledby': 'ins-tasks-title' },
      h('div', { class: 'ins-section-head' }, h('h2', { id: 'ins-tasks-title' }, T('tasks.heading'))),
      renderTasks());

    const root = h('div', { class: 'ins-view' },
      App.ui.backControl(),
      App.ui.sectionHeader({ overline: T('overline'), title: T('title'), intro: T('intro'), extra: actions }),
      framing,
      h('div', { class: 'ins-layout' }, h('div', { class: 'ins-main' }, counts, timeline), aside),
      tasks);
    refs.root = root;
    refs.renderedAt = Date.now();
    el.appendChild(root);
    renderTimeline();
    return {};
  }

  App.router.registerView('insights', {
    render,
    onLeave() { refs = null; },
  });

  // Live updates while the view is on screen (no full re-render, so focus stays put).
  App.events.onChange((entry) => {
    if (!refs || !refs.root || !refs.root.isConnected) return;
    if (!entry) {
      cap = capStep();
      updateCounts();
      renderTimeline();
      refreshMilestones();
      return;
    }
    const live = Date.now() - (refs.renderedAt || 0) > SETTLE_MS;
    updateCounts(live ? entry.type : undefined);
    renderTimeline(live ? entry.seq : undefined);
    refreshMilestones();
  });

  // Milestones read other slices (review, survey, query): refresh when they change.
  App.session.onChange((name) => {
    if (!refs || !refs.root || !refs.root.isConnected) return;
    if (['review', 'survey', 'query'].includes(name)) refreshMilestones();
  });

  App.session.onReset(() => { cap = null; });
})();
