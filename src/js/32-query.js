/* Query: a local, clearly labelled demo request, separate from Clair
 * (PRD section 10, AC-15, AC-23).
 * Flow: Draft → Validate → Review → Create demo request → Confirmation.
 * - The question text lives only in App.session (memory, this tab). It never
 *   goes to the event log, persistent storage or the network.
 * - The question keeps the language it was written in and is never translated.
 * - Opening the form logs nothing; the first keystroke logs `query_drafted`
 *   (topic id only) and creation logs `demo_query_created` (reference only).
 * - No contact details, attachments or sending of any kind. */
(() => {
  const NS = 'query';
  const T = (k, p) => t(`${NS}.${k}`, p);
  const TOPICS = ['payment', 'interest', 'maturity', 'understanding', 'other'];
  const CONTACTS = ['none', 'phone', 'email', 'secure'];
  const KINDS = ['card', 'summary', 'month', 'clause', 'term', 'chapter', 'resource', 'chart', 'infographic', 'faq', 'section', 'general'];
  const ID_RE = /^[a-z0-9][a-z0-9:_.-]{0,63}$/i;
  const GENERAL = Object.freeze({ kind: 'general', id: null });
  const STEPS = { draft: 1, review: 2, confirm: 3 };
  const TOTAL_STEPS = 3;

  const maxLen = () => (App.config && App.config.queryMaxLength) || 1000;
  const num = (n) => App.fmt.number(n);

  // Memory-only experience state. Session reset replaces the whole slice.
  function state() {
    const st = App.session.slice('query', () => ({ draft: null, requests: [] }));
    if (!Array.isArray(st.requests)) st.requests = [];
    if (!('draft' in st)) st.draft = null;
    if (!st.step) st.step = 'draft';
    return st;
  }

  let refs = null; // live DOM references while the panel is open

  /* ------------------------------------------------------------------ */
  /* Context helpers                                                     */
  /* ------------------------------------------------------------------ */

  // Topic hints inferred from the selected item when the caller gives none.
  const TOPIC_BY = {
    card: { principal: 'payment', interest: 'interest', 'next-payment': 'payment', maturity: 'maturity', fees: 'other', rate: 'interest', debt: 'understanding' },
    summary: { 'next-payment': 'payment', resume: 'payment', relief: 'payment', 'extra-interest': 'interest' },
    clause: { purpose: 'understanding', amendment: 'understanding', postponement: 'payment', interest: 'interest', resumption: 'payment', maturity: 'maturity', cost: 'interest', unchanged: 'understanding', action: 'understanding', schedule: 'payment', assumptions: 'understanding', contact: 'other' },
    term: { principal: 'understanding', interest: 'interest', postponement: 'understanding', instalment: 'payment', maturity: 'maturity', outstanding: 'understanding', fixedRate: 'interest', cashFlow: 'payment', amortisation: 'understanding', capitalisedInterest: 'interest' },
    chapter: { welcome: 'understanding', relief: 'payment', difference: 'payment', tradeoff: 'interest', resume: 'payment', 'next-step': 'understanding' },
    chart: { payments: 'payment', balance: 'understanding' },
    infographic: { relief: 'payment', cost: 'interest' },
    section: { payments: 'payment', changes: 'understanding', documents: 'understanding', overview: 'understanding' },
  };

  function inferTopic(ctx) {
    if (!ctx || ctx.kind === 'general') return '';
    if (ctx.kind === 'month') return 'payment';
    if (ctx.kind === 'resource') return 'other';
    if (ctx.kind === 'faq') return 'understanding';
    const map = TOPIC_BY[ctx.kind];
    return (map && map[ctx.id]) || '';
  }

  // Only items with an approved label can be captured (never show a missing key).
  function hasLabel(kind, id) {
    const has = (k) => App.i18n.has(k);
    switch (kind) {
      case 'card': return has(`items.card.${id}`);
      case 'summary': return has(`items.summary.${id}`);
      case 'month': return !!(App.rec && App.rec.isMonthId(id));
      case 'clause': return has(`clauses.${id}`);
      case 'term': return has(`glossary.${id}.term`);
      case 'chapter': return has(`chapters.${id}`);
      case 'resource': return has(`items.resource.${id}`);
      case 'chart': return has(`items.chart.${id}`);
      case 'infographic': return has(`items.infographic.${id}`);
      case 'faq': return true;
      case 'section': return has(`nav.${id}`);
      default: return false;
    }
  }

  function normCtx(input) {
    const c = input && typeof input === 'object' ? input : {};
    let kind = KINDS.includes(c.kind) ? c.kind : 'general';
    let id = c.id !== undefined && c.id !== null && ID_RE.test(String(c.id)) ? String(c.id) : null;
    if (kind !== 'general' && !hasLabel(kind, id)) { kind = 'general'; id = null; }
    return {
      kind,
      id: kind === 'general' ? null : id,
      section: typeof c.section === 'string' ? c.section : null,
      period: ['3', '6', 'all'].includes(c.period) ? c.period : null,
      fid: typeof c.fid === 'string' ? c.fid : null,
      topic: TOPICS.includes(c.topic) ? c.topic : null,
    };
  }

  const itemOf = (ctx) => (ctx && ctx.kind !== 'general' ? { kind: ctx.kind, id: ctx.id, period: ctx.period || null } : null);
  const sameItem = (a, b) => !!a && !!b && a.kind === b.kind && a.id === b.id;
  const itemText = (item) => (item ? App.ui.itemLabel(item) : null);
  // In-sentence language name ("Written in English" / "Rédigé en anglais")...
  const langName = (l) => (App.i18n.has(`${NS}.languages.${l}`) ? T(`languages.${l}`) : l);
  // ...and the standalone value shown after a label ("Preferred language: Français").
  const langValue = (l) => (App.i18n.has(`${NS}.languageValues.${l}`) ? T(`languageValues.${l}`) : langName(l));
  const topicLabel = (tp) => (TOPICS.includes(tp) ? T(`topic.options.${tp}`) : '');
  const contactLabel = (c) => T(`contact.options.${CONTACTS.includes(c) ? c : 'none'}`);

  function plural(key, n) {
    let cat = 'other';
    try { cat = new Intl.PluralRules(App.i18n.locale).select(n); } catch (e) { cat = n === 1 ? 'one' : 'other'; }
    return T(`${key}.${cat === 'one' ? 'one' : 'other'}`, { n: num(n) });
  }

  function newDraft(ctx) {
    return {
      item: itemOf(ctx),
      removedItem: null,
      topic: (ctx && (ctx.topic || inferTopic(ctx))) || '',
      topicTouched: false,
      text: '',
      lang: null,
      contact: 'none',
      logged: false,
      showErrors: false,
    };
  }

  // Reopening with a new item updates the selected item but keeps the typed question.
  function applyCtx(d, ctx) {
    if (ctx.kind !== 'general') {
      const current = d.item || d.removedItem;
      if (!sameItem(current, ctx)) {
        d.item = itemOf(ctx);
        d.removedItem = null;
        if (!d.topicTouched) {
          const tp = ctx.topic || inferTopic(ctx);
          if (tp) d.topic = tp;
        }
      }
    } else if (ctx.topic && !d.topicTouched) {
      // An explicit topic (e.g. Clair's "Ask a person") wins over an inferred one the user never changed.
      d.topic = ctx.topic;
    }
    d.showErrors = false;
  }

  function validate(d) {
    const errs = [];
    if (!TOPICS.includes(d.topic)) errs.push({ field: 'topic', target: 'qry-topic', msg: T('errors.topic') });
    const text = d.text || '';
    if (!text.trim()) errs.push({ field: 'question', target: 'qry-question', msg: T('errors.questionEmpty') });
    else if (text.length > maxLen()) errs.push({ field: 'question', target: 'qry-question', msg: T('errors.questionTooLong', { max: num(maxLen()) }) });
    return errs;
  }

  /* ------------------------------------------------------------------ */
  /* Shared pieces                                                       */
  /* ------------------------------------------------------------------ */

  function stepHeader(key) {
    const n = STEPS[key];
    return h('div', { class: 'qry-steps' },
      h('div', { class: 'qry-progress', 'aria-hidden': 'true' },
        [1, 2, 3].map((i) => h('span', { class: ['qry-progress-seg', i < n ? 'is-done' : null, i === n ? 'is-current' : null] }))),
      h('h3', { class: 'qry-step-title', tabindex: '-1', fid: `qry-step-${key}`, 'data-qry-heading': '' },
        h('span', { class: 'qry-step-count' }, T('stepCount', { n: num(n), total: num(TOTAL_STEPS) })),
        h('span', { class: 'sr-only' }, T('stepSep')),
        h('span', { class: 'qry-step-name' }, T(`steps.${key}`))));
  }

  function focusHeading() {
    if (!refs) return;
    const hd = refs.scroll.querySelector('[data-qry-heading]');
    refs.scroll.scrollTop = 0;
    if (refs.body) refs.body.scrollTop = 0;
    if (hd) App.util.focusEl(hd, { preventScroll: true });
  }

  function refreshChrome() {
    if (!refs) return;
    refs.api.setTitle(T('title'));
    if (refs.subtitleText) refs.subtitleText.textContent = T('subtitle');
    const closeBtn = refs.api.el.querySelector('.overlay-close');
    if (closeBtn) {
      closeBtn.setAttribute('aria-label', t('common.close'));
      const txt = closeBtn.querySelector('.overlay-close-text');
      if (txt) txt.textContent = t('common.close');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Step 1: draft                                                       */
  /* ------------------------------------------------------------------ */

  function contextBlock(d) {
    const item = d.item;
    let itemValue;
    if (item) {
      const label = itemText(item);
      itemValue = h('span', { class: 'qry-item' },
        h('span', { class: 'qry-item-text' }, label),
        App.ui.button({
          label: T('context.remove'),
          kind: 'plain',
          iconName: 'close',
          fid: 'qry-item-remove',
          className: 'qry-item-btn',
          ariaLabel: T('context.removeLabel', { item: label }),
          onClick: removeItem,
        }));
    } else {
      const removed = d.removedItem;
      itemValue = h('span', { class: 'qry-item qry-item--none' },
        h('span', { class: 'qry-item-text' }, T('context.none')),
        removed ? App.ui.button({
          label: T('context.restore'),
          kind: 'plain',
          iconName: 'replay',
          fid: 'qry-item-restore',
          className: 'qry-item-btn',
          ariaLabel: T('context.restoreLabel', { item: itemText(removed) }),
          onClick: restoreItem,
        }) : null);
    }
    const row = (label, value, extra) => h('div', { class: 'qry-ctx-row' }, h('dt', null, label), h('dd', null, value, extra || null));
    const block = h('section', { class: 'qry-context', 'aria-labelledby': 'qry-ctx-heading' },
      h('h4', { id: 'qry-ctx-heading', class: 'qry-context-title' }, T('context.heading')),
      h('p', { class: 'qry-context-hint' }, T('context.hint')),
      h('dl', { class: 'qry-ctx-list' },
        row(T('context.notice'), h('span', { class: 'qry-code' }, App.record.noticeId), h('span', { class: 'qry-tag' }, App.ui.icon('check', { size: 14 }), T('context.always'))),
        row(T('context.item'), itemValue),
        row(T('context.language'), h('span', { class: 'qry-ctx-strong' }, langValue(App.i18n.locale)), h('span', { class: 'qry-ctx-hint' }, T('context.languageHint')))));
    return block;
  }

  function rerenderContext(focusFid) {
    if (!refs || !refs.ctxBlock) return;
    const next = contextBlock(state().draft);
    refs.ctxBlock.replaceWith(next);
    refs.ctxBlock = next;
    if (focusFid) {
      const el = App.util.findByFid(focusFid, refs.api.el);
      if (el) App.util.focusEl(el, { preventScroll: true });
    }
  }

  function removeItem() {
    const d = state().draft;
    if (!d || !d.item) return;
    d.removedItem = d.item;
    d.item = null;
    rerenderContext('qry-item-restore');
    App.announce(T('context.removed'));
  }

  function restoreItem() {
    const d = state().draft;
    if (!d || !d.removedItem) return;
    d.item = d.removedItem;
    d.removedItem = null;
    rerenderContext('qry-item-remove');
    App.announce(T('context.restored'));
  }

  function fieldError(id, err) {
    if (!err) return null;
    return h('p', { class: 'field-error qry-field-error', id },
      App.ui.icon('info', { size: 16 }),
      h('span', null, h('span', { class: 'sr-only' }, `${T('errors.prefix')} `), h('span', { class: 'qry-field-error-msg' }, err.msg)));
  }

  function topicField(d, errs) {
    const err = errs.find((e) => e.field === 'topic');
    const select = h('select', {
      id: 'qry-topic',
      class: 'select qry-select',
      fid: 'qry-topic',
      required: true,
      'aria-invalid': err ? 'true' : null,
      'aria-describedby': err ? 'qry-topic-error' : null,
      on: { change: onTopicChange },
    },
    h('option', { value: '', selected: !TOPICS.includes(d.topic) }, T('topic.placeholder')),
    TOPICS.map((tp) => h('option', { value: tp, selected: d.topic === tp }, T(`topic.options.${tp}`))));
    refs.topic = select;
    return h('div', { class: ['field', 'qry-field', err ? 'has-error' : null], 'data-field': 'topic' },
      h('label', { class: 'field-label', for: 'qry-topic' }, T('topic.label')),
      fieldError('qry-topic-error', err),
      select);
  }

  function counterText(len) {
    const max = maxLen();
    if (!len) return T('counter.empty', { max: num(max) });
    if (len > max) return plural('counter.over', len - max);
    return plural('counter.remaining', max - len);
  }

  function langTag(d) {
    if (!d.lang) return null;
    return h('span', { class: 'qry-lang-tag', lang: App.i18n.locale }, App.ui.icon('transcript', { size: 14 }), T('question.writtenIn', { language: langName(d.lang) }));
  }

  function questionField(d, errs) {
    const err = errs.find((e) => e.field === 'question');
    const len = (d.text || '').length;
    const over = len > maxLen();
    const describedBy = [err ? 'qry-question-error' : null, 'qry-question-hint', 'qry-question-counter'].filter(Boolean).join(' ');
    const ta = h('textarea', {
      id: 'qry-question',
      class: 'textarea qry-textarea',
      fid: 'qry-question',
      rows: '6',
      required: true,
      spellcheck: 'true',
      autocomplete: 'off',
      lang: d.lang || null,
      'aria-invalid': err || over ? 'true' : null,
      'aria-describedby': describedBy,
      value: d.text || '',
      on: { input: onQuestionInput },
    });
    refs.textarea = ta;
    refs.langSlot = h('span', { class: 'qry-lang-slot' }, langTag(d));
    refs.counter = h('p', { class: ['qry-counter', over ? 'is-over' : null], id: 'qry-question-counter' }, counterText(len));
    refs.keptNote = h('p', { class: 'qry-kept-note', hidden: !(d.lang && d.lang !== App.i18n.locale) }, T('question.keptAsWritten'));
    return h('div', { class: ['field', 'qry-field', err ? 'has-error' : null], 'data-field': 'question' },
      h('div', { class: 'qry-label-row' },
        h('label', { class: 'field-label', for: 'qry-question' }, T('question.label')),
        refs.langSlot),
      h('p', { class: 'field-hint', id: 'qry-question-hint' }, T('question.hint', { max: num(maxLen()) })),
      fieldError('qry-question-error', err),
      ta,
      refs.counter,
      refs.keptNote);
  }

  function contactField(d) {
    const name = 'qry-contact';
    return h('fieldset', { class: 'qry-fieldset', 'aria-describedby': 'qry-contact-hint' },
      h('legend', null, T('contact.legend')),
      h('p', { class: 'field-hint', id: 'qry-contact-hint' }, T('contact.hint')),
      h('div', { class: 'qry-choices' },
        CONTACTS.map((c) => {
          const id = `qry-contact-${c}`;
          return h('div', { class: 'choice qry-choice' },
            h('input', { type: 'radio', id, name, value: c, fid: id, checked: d.contact === c, on: { change: onContactChange } }),
            h('label', { for: id }, T(`contact.options.${c}`)));
        })));
  }

  function privacyNote() {
    return h('div', { class: 'callout callout--neutral qry-privacy' },
      App.ui.icon('lock'),
      h('div', null, h('p', { class: 'qry-privacy-title' }, T('privacy.title')), h('p', null, T('privacy.body'))));
  }

  function errorSummary(errs) {
    const list = h('ul', { class: 'qry-error-list' },
      errs.map((e) => h('li', { dataset: { field: e.field } },
        h('a', {
          href: `#${e.target}`,
          fid: `qry-err-${e.field}`,
          on: {
            click: (ev) => {
              ev.preventDefault();
              const el = document.getElementById(e.target);
              if (el) { el.scrollIntoView({ block: 'center' }); App.util.focusEl(el, { preventScroll: true }); }
            },
          },
        }, e.msg))));
    const box = h('div', { class: 'qry-error-summary', tabindex: '-1', 'aria-labelledby': 'qry-error-title', fid: 'qry-error-summary', role: 'group' },
      h('h4', { id: 'qry-error-title', class: 'qry-error-title' }, App.ui.icon('info', { size: 18 }), h('span', null, T('errors.title'))),
      list);
    refs.summary = box;
    return box;
  }

  // After a failed submit, keep a shown error current: clear it as soon as the
  // field becomes valid, and update its wording if the problem changes
  // (e.g. from "Enter your question" to "must be 1,000 characters or fewer").
  function syncFieldError(field) {
    if (!refs || !refs.summary) return;
    const d = state().draft;
    if (!d || !d.showErrors) return;
    const wrap = refs.scroll.querySelector(`.qry-field[data-field="${field}"]`);
    const err = validate(d).find((e) => e.field === field);
    if (err) {
      const msgEl = wrap && wrap.querySelector('.qry-field-error-msg');
      if (msgEl && msgEl.textContent !== err.msg) msgEl.textContent = err.msg;
      const link = refs.summary.querySelector(`li[data-field="${field}"] a`);
      if (link && link.textContent !== err.msg) link.textContent = err.msg;
      return;
    }
    if (wrap) {
      wrap.classList.remove('has-error');
      const errEl = wrap.querySelector('.qry-field-error');
      if (errEl) errEl.remove();
      const control = field === 'topic' ? refs.topic : refs.textarea;
      if (control) {
        if (!(field === 'question' && (d.text || '').length > maxLen())) control.removeAttribute('aria-invalid');
        const db = (control.getAttribute('aria-describedby') || '').split(' ').filter((x) => x && x !== `qry-${field}-error`).join(' ');
        if (db) control.setAttribute('aria-describedby', db); else control.removeAttribute('aria-describedby');
      }
    }
    const li = refs.summary.querySelector(`li[data-field="${field}"]`);
    if (li) li.remove();
    if (!refs.summary.querySelector('li')) {
      refs.summary.remove();
      refs.summary = null;
      d.showErrors = false;
    }
  }

  const announceCounter = App.util.debounce(() => {
    if (!refs || !refs.textarea) return;
    const len = refs.textarea.value.length;
    if (len >= maxLen() - 100) App.announce(counterText(len));
  }, 900);

  function onQuestionInput(e) {
    const d = state().draft;
    if (!d) return;
    const v = e.target.value;
    d.text = v;
    if (v && !d.lang) d.lang = App.i18n.locale;
    if (!v) d.lang = null;
    if (d.lang) e.target.setAttribute('lang', d.lang); else e.target.removeAttribute('lang');
    if (v.trim() && !d.logged) {
      d.logged = true;
      // Identifier only: the topic id (if chosen). Never the question text.
      App.events.log('query_drafted', { id: TOPICS.includes(d.topic) ? d.topic : undefined });
      App.session.changed('query');
    }
    const len = v.length;
    const over = len > maxLen();
    refs.counter.textContent = counterText(len);
    refs.counter.classList.toggle('is-over', over);
    if (over) e.target.setAttribute('aria-invalid', 'true');
    else if (!e.target.closest('.has-error')) e.target.removeAttribute('aria-invalid');
    App.util.clear(refs.langSlot).append(langTag(d) || '');
    refs.keptNote.hidden = !(d.lang && d.lang !== App.i18n.locale);
    announceCounter();
    syncFieldError('question');
  }

  function onTopicChange(e) {
    const d = state().draft;
    if (!d) return;
    d.topic = TOPICS.includes(e.target.value) ? e.target.value : '';
    d.topicTouched = true;
    if (d.topic) e.target.removeAttribute('aria-invalid');
    syncFieldError('topic');
  }

  function onContactChange(e) {
    const d = state().draft;
    if (!d) return;
    if (CONTACTS.includes(e.target.value)) d.contact = e.target.value;
  }

  function focusSummary() {
    if (!refs || !refs.summary) return;
    refs.scroll.scrollTop = 0;
    if (refs.body) refs.body.scrollTop = 0;
    App.util.focusEl(refs.summary, { preventScroll: true });
  }

  function onContinue(e) {
    if (e) e.preventDefault();
    const st = state();
    const d = st.draft;
    if (!d) return;
    const errs = validate(d);
    if (errs.length) {
      d.showErrors = true;
      renderStep();
      focusSummary();
      App.announce(plural('announce.errors', errs.length), true);
      return;
    }
    d.showErrors = false;
    st.step = 'review';
    renderStep();
    focusHeading();
  }

  function renderDraft(st) {
    const d = st.draft;
    const errs = d.showErrors ? validate(d) : [];
    if (!errs.length) d.showErrors = false;
    refs.summary = null;
    refs.ctxBlock = contextBlock(d);
    const form = h('form', { id: 'qry-form', class: 'qry-form', novalidate: true, on: { submit: onContinue } },
      stepHeader('draft'),
      h('p', { class: 'qry-intro' }, T('intro')),
      errs.length ? errorSummary(errs) : null,
      refs.ctxBlock,
      topicField(d, errs),
      questionField(d, errs),
      contactField(d),
      privacyNote(),
      h('p', { class: 'qry-footnote' }, App.ui.icon('clock', { size: 16 }), h('span', null, T('draftKept'))));
    refs.scroll.append(form);
    refs.footer.append(
      h('div', { class: 'qry-actions' },
        App.ui.button({ label: T('continue'), kind: 'primary', iconAfter: 'arrowRight', fid: 'qry-continue', className: 'qry-primary', attrs: { type: 'submit', form: 'qry-form' } })));
  }

  /* ------------------------------------------------------------------ */
  /* Step 2: review                                                      */
  /* ------------------------------------------------------------------ */

  function reviewRow(label, value, cls) {
    return h('div', { class: ['qry-review-row', cls] }, h('dt', null, label), h('dd', null, value));
  }

  function renderReview(st) {
    const d = st.draft;
    const qLang = d.lang || App.i18n.locale;
    refs.scroll.append(
      stepHeader('review'),
      h('p', { class: 'qry-intro' }, T('review.intro')),
      h('dl', { class: 'qry-review' },
        reviewRow(T('review.notice'), h('span', { class: 'qry-code' }, App.record.noticeId)),
        reviewRow(T('review.item'), d.item ? itemText(d.item) : T('review.none')),
        reviewRow(T('review.topic'), topicLabel(d.topic)),
        reviewRow(T('review.language'), langValue(App.i18n.locale)),
        reviewRow(T('review.questionLanguage'), T('question.writtenIn', { language: langName(qLang) })),
        reviewRow(T('review.contact'), contactLabel(d.contact)),
        reviewRow(T('review.question'), h('div', { class: 'qry-question-text', lang: qLang }, (d.text || '').trim()), 'qry-review-row--question')),
      h('div', { class: 'callout callout--neutral qry-note' }, App.ui.icon('info'), h('p', null, T('review.note'))));
    refs.footer.append(h('div', { class: 'qry-actions' },
      App.ui.button({ label: T('review.edit'), kind: 'secondary', iconName: 'arrowLeft', fid: 'qry-edit', onClick: onEdit }),
      App.ui.button({ label: T('review.create'), kind: 'primary', iconName: 'check', fid: 'qry-create', className: 'qry-primary', onClick: onCreate })));
  }

  function onEdit() {
    const st = state();
    st.step = 'draft';
    renderStep();
    focusHeading();
  }

  function onCreate() {
    const st = state();
    const d = st.draft;
    if (!d) return;
    const errs = validate(d);
    if (errs.length) {
      st.step = 'draft';
      d.showErrors = true;
      renderStep();
      focusSummary();
      return;
    }
    st.seq = (st.seq || 0) + 1;
    const ref = `DEMO-Q-${String(st.seq).padStart(4, '0')}`;
    const req = {
      ref,
      createdAt: new Date().toISOString(),
      noticeId: App.record.noticeId,
      recordVersion: App.record.recordVersion,
      item: d.item ? { ...d.item } : null,
      topic: d.topic,
      language: App.i18n.locale,
      questionLanguage: d.lang || App.i18n.locale,
      contact: d.contact,
      text: (d.text || '').trim(),
    };
    st.requests.push(req);
    st.lastRef = ref;
    st.draft = null;
    st.step = 'confirm';
    // Identifiers only: the DEMO- reference and the topic id.
    App.events.log('demo_query_created', { id: ref, detail: req.topic });
    App.session.changed('query');
    renderStep();
    focusHeading();
    App.announce(T('confirm.text'));
  }

  /* ------------------------------------------------------------------ */
  /* Step 3: confirmation                                                */
  /* ------------------------------------------------------------------ */

  function fmtDateTime(iso) {
    try {
      return new Intl.DateTimeFormat(App.i18n.locale, { dateStyle: 'long', timeStyle: 'short' }).format(new Date(iso));
    } catch (e) {
      return App.fmt.date(iso.slice(0, 10), 'long');
    }
  }

  // Plain-text summary: labels in the display language, question as written.
  function summaryParts(req) {
    const L = (labelKey, value) => T('summary.line', { label: T(labelKey), value });
    const head = [
      T('summary.title', { ref: req.ref }),
      T('confirm.text'),
      '',
      L('review.notice', req.noticeId),
      L('review.item', req.item ? itemText(req.item) : T('review.none')),
      L('review.topic', topicLabel(req.topic)),
      L('review.language', langValue(req.language)),
      L('review.questionLanguage', langValue(req.questionLanguage)),
      L('review.contact', contactLabel(req.contact)),
      L('summary.created', fmtDateTime(req.createdAt)),
      '',
      T('summary.questionHeading'),
    ].join('\n');
    const tail = ['', '—', T('summary.disclaimer')].join('\n');
    return { head: `${head}\n`, question: req.text, tail: `\n${tail}` };
  }
  const summaryText = (req) => { const p = summaryParts(req); return `${p.head}${p.question}${p.tail}`; };

  function requestJSON(req) {
    return JSON.stringify({
      schema: 'bdc-notice-demo-request/1',
      demo: true,
      statement: T('confirm.text'),
      reference: req.ref,
      createdAt: req.createdAt,
      noticeId: req.noticeId,
      recordVersion: req.recordVersion,
      selectedItem: req.item ? { kind: req.item.kind, id: req.item.id, label: itemText(req.item) } : null,
      topic: { id: req.topic, label: topicLabel(req.topic) },
      preferredLanguage: req.language,
      questionLanguage: req.questionLanguage,
      preferredContactMethod: req.contact && req.contact !== 'none' ? req.contact : null,
      question: req.text,
      note: T('summary.disclaimer'),
    }, null, 2);
  }

  function setStatus(text, ok = true) {
    if (!refs || !refs.status) return;
    App.util.clear(refs.status).append(App.ui.icon(ok ? 'check' : 'info', { size: 16 }), h('span', null, text));
    refs.status.classList.toggle('is-warning', !ok);
  }

  function renderConfirm(st) {
    const req = st.requests.find((r) => r.ref === st.lastRef);
    if (!req) { st.step = 'draft'; renderStep(); return; }
    const parts = summaryParts(req);
    refs.status = h('p', { class: 'status-msg qry-status', role: 'status' });
    const download = (ext) => {
      const file = `${req.ref}.${ext}`;
      if (ext === 'json') App.util.downloadBlob(file, 'application/json', requestJSON(req));
      else App.util.downloadBlob(file, 'text/plain;charset=utf-8', summaryText(req));
      setStatus(T('confirm.downloaded', { file }));
    };
    refs.scroll.append(
      stepHeader('confirm'),
      h('div', { class: 'qry-done' },
        h('span', { class: 'qry-done-icon', 'aria-hidden': 'true' }, App.ui.icon('check', { size: 26, stroke: 2.4 })),
        h('div', { class: 'qry-done-text' },
          h('h4', { class: 'qry-done-title' }, T('confirm.heading')),
          h('p', { class: 'qry-confirm-text' }, T('confirm.text')))),
      h('div', { class: 'qry-ref' },
        h('span', { class: 'qry-ref-label' }, T('confirm.refLabel')),
        h('span', { class: 'qry-ref-value', 'data-ref': req.ref }, req.ref)),
      h('div', { class: 'callout callout--neutral qry-note' }, App.ui.icon('info'), h('p', null, T('confirm.notCase'))),
      h('div', { class: 'qry-summary-wrap' },
        h('h4', { id: 'qry-summary-title' }, T('confirm.summaryHeading')),
        // Scrollable, so focusable; a named region (aria-label is not allowed on a role-less <pre>).
        h('pre', { class: 'qry-summary', tabindex: '0', role: 'region', 'aria-label': T('confirm.summaryLabel', { ref: req.ref }), fid: 'qry-summary' },
          parts.head, h('span', { lang: req.questionLanguage }, parts.question), parts.tail),
        h('div', { class: 'button-row qry-summary-actions' },
          App.ui.button({
            label: T('confirm.copy'),
            kind: 'secondary',
            iconName: 'copy',
            fid: 'qry-copy',
            onClick: async () => {
              const ok = await App.util.copyText(summaryText(req));
              setStatus(ok ? T('confirm.copied') : T('confirm.copyFailed'), ok);
            },
          }))),
      h('div', { class: 'qry-downloads' },
        h('h4', { id: 'qry-downloads-title' }, T('confirm.downloadsHeading')),
        h('div', { class: 'button-row' },
          App.ui.button({ label: T('confirm.downloadJson'), kind: 'chip', iconName: 'download', fid: 'qry-download-json', onClick: () => download('json') }),
          App.ui.button({ label: T('confirm.downloadTxt'), kind: 'chip', iconName: 'download', fid: 'qry-download-txt', onClick: () => download('txt') }))),
      refs.status);
    refs.footer.append(h('div', { class: 'qry-actions' },
      App.ui.button({ label: T('confirm.newQuestion'), kind: 'secondary', iconName: 'chat', fid: 'qry-new', onClick: onNewQuestion }),
      App.ui.button({ label: T('confirm.close'), kind: 'secondary', fid: 'qry-done-close', onClick: () => { if (refs) refs.api.close('done'); } })));
  }

  function onNewQuestion() {
    const st = state();
    st.draft = newDraft(st.lastCtx || GENERAL);
    st.step = 'draft';
    renderStep();
    focusHeading();
  }

  /* ------------------------------------------------------------------ */
  /* Rendering and lifecycle                                             */
  /* ------------------------------------------------------------------ */

  function renderStep() {
    if (!refs) return;
    const st = state();
    App.util.clear(refs.scroll);
    App.util.clear(refs.footer);
    refs.textarea = null;
    refs.topic = null;
    refs.status = null;
    refs.ctxBlock = null;
    refreshChrome();
    if (st.step === 'review' && !st.draft) st.step = 'draft';
    if (st.step === 'confirm' && !st.lastRef) st.step = 'draft';
    if (st.step === 'draft' && !st.draft) st.draft = newDraft(st.lastCtx || GENERAL);
    refs.api.el.setAttribute('data-step', st.step);
    if (st.step === 'review') renderReview(st);
    else if (st.step === 'confirm') renderConfirm(st);
    else renderDraft(st);
  }

  function build(body, api, subtitleText) {
    refs = { api, body, subtitleText };
    body.classList.add('qry-body');
    refs.scroll = h('div', { class: 'qry-scroll' });
    refs.footer = h('div', { class: 'qry-footer' });
    body.append(refs.scroll, refs.footer);
    renderStep();
  }

  /** Open the local query form. ctx: { kind, id, section, period, fid, topic }; trigger: element to return focus to. */
  function open(ctxIn, trigger) {
    const st = state();
    const ctx = normCtx(ctxIn || GENERAL);
    let trig = trigger || null;
    // A trigger inside a glossary popover disappears when the panel opens: return to its term instead.
    if (trig && trig.closest && trig.closest('.popover') && App.popover && App.popover.current()) trig = App.popover.current().trigger;
    st.lastCtx = ctx;
    if (!st.draft) st.draft = newDraft(ctx); else applyCtx(st.draft, ctx);
    st.step = 'draft';
    if (refs && App.overlay.isOpen('query')) {
      renderStep();
      focusHeading();
      return;
    }
    const subtitleText = h('span', null, T('subtitle'));
    App.overlay.open({
      id: 'query',
      variant: 'panel',
      className: 'qry-overlay',
      title: T('title'),
      titleExtra: h('p', { class: 'qry-subtitle' }, App.ui.icon('lock', { size: 14 }), subtitleText),
      trigger: trig,
      render: (body, api) => build(body, api, subtitleText),
      onClose: () => {
        refs = null;
        App.session.changed('query'); // e.g. the insights "draft in progress" milestone
      },
    });
  }

  function close() {
    if (App.overlay.isOpen('query')) App.overlay.close('api');
  }

  // Locale switch while open: relabel everything; typed text and its language stay as written.
  App.i18n.onChange(() => {
    if (!refs || !App.overlay.isOpen('query')) return;
    const active = document.activeElement;
    const fidEl = active && active.closest ? active.closest('[data-fid]') : null;
    const fid = fidEl && refs.api.el.contains(fidEl) ? fidEl.getAttribute('data-fid') : null;
    const sel = active && active.id === 'qry-question' ? [active.selectionStart, active.selectionEnd] : null;
    const scrollTop = refs.scroll.scrollTop;
    const bodyTop = refs.body.scrollTop;
    renderStep();
    refs.scroll.scrollTop = scrollTop;
    refs.body.scrollTop = bodyTop;
    if (fid) {
      const el = App.util.findByFid(fid, refs.api.el);
      if (el) {
        App.util.focusEl(el, { preventScroll: true });
        if (sel && el.setSelectionRange) { try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* ignore */ } }
      }
    }
  });

  App.session.onReset(() => {
    if (App.overlay.isOpen('query')) App.overlay.close('reset', { silent: true });
    refs = null;
  });

  App.query = {
    open,
    close,
    state,
    isOpen: () => App.overlay.isOpen('query'),
  };
})();
