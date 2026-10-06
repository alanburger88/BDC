/* Payments & impact (view "payments", namespace "payments", class prefix pay-).
 * Level 1: a plain-language summary plus two SEPARATE infographics - the
 * cash-flow effect (12,000 - 80 = 11,920) and the total additional interest.
 * Level 2: a paired payment chart (Nov-Apr), a month comparison list for the
 * selected range and a selected-month detail panel; a principal-balance chart
 * across the remaining term. Level 3: Explain with AI, Ask about this, the
 * formal notice clause and locally generated CSV downloads.
 * Routes: #/payments, #/payments/<yyyy-mm>, #/payments/relief|cost|schedule.
 * Every value is read from App.record / App.rec and formatted with App.fmt;
 * the only arithmetic is display aggregation of the record's own rows. */
(() => {
  const NS = 'payments';
  const k = (key, params) => t(`${NS}.${key}`, params);
  const charts = () => App.payments.charts;
  const RANGES = ['3', '6', 'all'];
  const SPECIAL = ['relief', 'cost', 'schedule'];
  const CSV_KINDS = ['selection-3', 'selection-6', 'selection-all', 'revised-full', 'original-full'];
  const FIELDS = { opening: 'openingPrincipalCents', principal: 'principalCents', interest: 'interestCents', total: 'totalCents', closing: 'closingPrincipalCents' };

  const state = () => App.session.slice(NS, () => ({ range: '6', page: 0, openYears: {}, dataView: {} }));

  /* ---------- formatting helpers (display only) ---------- */
  const money = (cents) => App.fmt.money(cents);
  const whole = (cents) => App.fmt.money(cents, { compact: true });
  const signed = (cents) => App.fmt.money(cents, { signed: true });
  // fr-CA typography writes the first day of a month as "1er" (Intl gives "1 novembre").
  const date = (iso, style = 'long') => {
    const out = App.fmt.date(iso, style);
    return App.i18n.locale === 'fr-CA' && /^(long|medium)$/.test(style) ? out.replace(/^1 /, '1er ') : out;
  };
  const cap = (s) => (s ? s.charAt(0).toLocaleUpperCase(App.i18n.locale) + s.slice(1) : s);
  const monthName = (id) => cap(date(id, 'monthYear'));
  // "December 2026" / fr: "de décembre 2026", "d’avril 2027" (elision before a vowel)
  const ofMonth = (id) => {
    const m = date(id, 'monthYear');
    return k(/^[aeiouyàâäéèêëîïôöûùüœ]/i.test(m) ? 'ofMonthVowel' : 'ofMonth', { month: m });
  };
  const plural = (key, n) => k(`${key}.${n === 1 ? 'one' : 'other'}`, { n: App.fmt.number(n) });
  const period = (n) => t(`common.months.${n === 1 ? 'one' : 'other'}`, { n: App.fmt.number(n) });
  const reduced = () => App.util.prefersReducedMotion();
  function list(items) {
    try {
      return new Intl.ListFormat(App.i18n.locale, { style: 'long', type: 'conjunction' }).format(items);
    } catch (e) {
      return items.join(', ');
    }
  }
  const sumRows = (months, sched, field = 'totalCents') => months.reduce((a, m) => a + (m[sched] ? m[sched][field] : 0), 0);
  const niceCeil = (v, step) => Math.ceil(v / step) * step;

  /* ---------- record access ---------- */
  function facts() {
    const R = App.record;
    return { R, o: R.originalSchedule, r: R.revisedSchedule, d: R.derived, n: R.change.months };
  }

  function params(f) {
    const { R, o, r, d, n } = f;
    const post = r.slice(0, n);
    return {
      months: list(post.map((x) => date(x.date, 'month'))),
      from: date(post[0].date, 'monthYear'),
      to: date(post[n - 1].date, 'monthYear'),
      lastPostponed: date(post[n - 1].date, 'monthYear'),
      interest: money(d.postponementMonthlyInterestCents),
      relief: whole(d.nearTermPaymentReductionCents),
      deferred: whole(d.principalDeferredCents),
      extra3: whole(d.additionalInterestFirstThreeMonthsCents),
      extra: whole(d.additionalLifetimeInterestCents),
      resume: date(R.change.resumePrincipalDate),
      origMaturity: date(R.change.originalMaturity),
      revMaturity: date(R.change.revisedMaturity),
      period: period(n),
      monthly: whole(R.loan.monthlyPrincipalCents),
      start: whole(R.loan.principalAtScheduleStartCents),
      origNear: money(d.originalNearTermPaymentsCents),
      revNear: money(d.revisedNearTermPaymentsCents),
      first: money(d.firstResumedPaymentCents),
      o,
      r,
    };
  }

  /* ---------- module-level view state ---------- */
  let handles = [];
  let internalSelect = null;
  let cur = null; // references used for partial updates of the current render

  function destroyCharts() {
    handles.forEach((hd) => hd && hd.destroy && hd.destroy());
    handles = [];
  }

  /* ---------- shared building blocks ---------- */
  function diffEl(cents, extraClass) {
    const kind = cents < 0 ? 'lower' : cents > 0 ? 'higher' : 'same';
    return h('span', { class: ['pay-diff', `pay-diff--${kind}`, extraClass] },
      kind === 'same'
        ? k('diff.same')
        : [h('span', { class: 'pay-diff-amt money' }, signed(cents)), ' ', h('span', { class: 'pay-diff-word' }, k(`diff.${kind}Word`))]);
  }

  function isPostponed(m) { return !!(m.revised && m.revised.principalCents === 0); }

  function monthTags(m, f) {
    const tags = [];
    if (isPostponed(m)) tags.push(['temporary', 'postponed']);
    else if (m.index === f.n && m.revised && m.revised.principalCents > 0) tags.push(['changed', 'resumes']);
    if (m.original && m.original.date === f.R.change.originalMaturity) tags.push(['unchanged', 'finalOriginal']);
    if (m.revised && m.revised.date === f.R.change.revisedMaturity) tags.push(['later', 'finalRevised']);
    else if (!m.original && m.revised) tags.push(['later', 'added']);
    return tags.map(([b, key]) => (b === 'unchanged'
      ? h('span', { class: 'badge badge--unchanged pay-badge-plain' }, k(`list.tags.${key}`))
      : App.ui.badge(b, k(`list.tags.${key}`))));
  }

  function sectionHead(id, title, intro, extra) {
    return h('div', { class: 'pay-section-head' },
      h('div', { class: 'pay-section-heading' },
        h('h2', { class: 'pay-section-title', id, fid: id }, title),
        intro ? h('p', { class: 'pay-section-intro' }, intro) : null),
      extra || null);
  }

  /** Accessible "Show the numbers" toggle; state is remembered for the session. */
  function dataToggle(key, content) {
    const st = state();
    const open = !!st.dataView[key];
    const id = `pay-data-${key}`;
    const region = h('div', { class: 'pay-data', id, hidden: !open }, content);
    const label = h('span', { class: 'btn-label' }, k(open ? 'data.hide' : 'data.show'));
    const btn = h('button', {
      type: 'button',
      class: 'btn btn-secondary pay-data-toggle',
      fid: `pay-data-toggle-${key}`,
      'aria-expanded': String(open),
      'aria-controls': id,
      on: {
        click: () => {
          const now = btn.getAttribute('aria-expanded') !== 'true';
          st.dataView[key] = now;
          btn.setAttribute('aria-expanded', String(now));
          region.hidden = !now;
          label.textContent = k(now ? 'data.hide' : 'data.show');
        },
      },
    }, App.ui.icon('eye'), label);
    return h('div', { class: 'pay-data-wrap' }, btn, region);
  }

  function hatchBar(series, pct, extra) {
    return h('span', { class: ['pay-hbar', `pay-hbar--${series}`, extra], style: { width: `${Math.max(0, Math.min(100, pct)).toFixed(2)}%` } });
  }

  /* ---------- infographic: cash-flow effect (relief) ---------- */
  function reliefCard(f, p) {
    const d = f.d;
    const fromM = date(f.r[0].date, 'month');
    const toM = date(f.r[f.n - 1].date, 'month');
    const item = (cls, sym, srOp, label, sub, value) => h('li', { class: ['pay-eq-row', cls] },
      h('span', { class: 'pay-eq-op', 'aria-hidden': 'true' }, sym),
      h('span', { class: 'pay-eq-text' },
        srOp ? App.ui.srOnly(`${srOp} `) : null,
        h('span', { class: 'pay-eq-label' }, label),
        h('span', { class: 'pay-eq-sub' }, sub)),
      h('span', { class: 'pay-eq-value money' }, value));
    const max = niceCeil(d.originalNearTermPaymentsCents, 500000);
    const bar = (series, labelText, cents) => h('div', { class: 'pay-hrow' },
      h('div', { class: 'pay-hrow-head' }, h('span', { class: 'pay-hrow-label' }, labelText), h('span', { class: 'pay-hrow-value money' }, money(cents))),
      h('div', { class: 'pay-htrack', 'aria-hidden': 'true' }, hatchBar(series, (cents / max) * 100)));
    const ctx = { kind: 'infographic', id: 'relief', period: '3' };
    return h('section', { class: ['card', 'pay-info', 'pay-info--relief'], id: 'pay-relief', fid: 'pay-relief', 'aria-labelledby': 'pay-relief-title' },
      h('p', { class: 'card-kicker' }, App.ui.icon('cash', { size: 18 }), h('span', null, t('items.infographic.relief'))),
      h('h3', { class: 'pay-info-title', id: 'pay-relief-title' }, k('relief.title', { relief: p.relief, from: p.from, to: p.to })),
      h('ol', { class: 'pay-eq', 'aria-label': k('relief.equation', { relief: p.relief }) },
        item('pay-eq-row--a', '', null, k('relief.deferred'), k('relief.deferredSub'), p.deferred),
        item('pay-eq-row--b', '−', k('relief.minus'), k('relief.extra'), k('relief.extraSub'), p.extra3),
        item('pay-eq-row--c', '=', k('relief.equals'), k('relief.result'), k('relief.resultSub', { from: fromM, to: toM }), p.relief)),
      h('div', { class: 'pay-hbars', role: 'group', 'aria-labelledby': 'pay-relief-bars' },
        h('p', { class: 'pay-hbars-title', id: 'pay-relief-bars' }, k('relief.paymentsTitle', { from: fromM, to: toM })),
        bar('o', k('list.totalsOriginal'), d.originalNearTermPaymentsCents),
        bar('r', k('list.totalsRevised'), d.revisedNearTermPaymentsCents),
        h('p', { class: 'pay-scale' }, k('relief.scale', { zero: whole(0), max: whole(max) }))),
      h('p', { class: 'pay-info-note' }, App.ui.rich(k('relief.note', { deferred: p.deferred }))),
      h('div', { class: 'pay-info-foot' },
        h('div', { class: 'action-row' }, App.ui.explainButton(ctx), App.ui.askButton({ ...ctx, topic: 'payment' })),
        App.ui.noticeLink('postponement', ctx)));
  }

  /* ---------- infographic: total cost (separate scale) ---------- */
  function costCard(f, p) {
    const d = f.d;
    const R = f.R;
    const max = niceCeil(d.revisedTotalInterestCents, 1000000);
    const cell = (kind, label, value) => h('div', { class: ['compare-cell', `compare-cell--${kind}`] }, h('span', { class: 'compare-label' }, label), h('span', { class: 'compare-value' }, value));
    const compareRow = (title, before, after, id) => h('div', { class: 'pay-cost-row' },
      h('p', { class: 'pay-cost-row-title', id }, title),
      h('div', { class: 'compare', role: 'group', 'aria-labelledby': id }, cell('before', t('common.original'), before), cell('after', t('common.revised'), after)));
    const ctx = { kind: 'infographic', id: 'cost', period: 'all' };
    return h('section', { class: ['card', 'pay-info', 'pay-info--cost'], id: 'pay-cost', fid: 'pay-cost', 'aria-labelledby': 'pay-cost-title' },
      h('p', { class: 'card-kicker' }, App.ui.icon('trend', { size: 18 }), h('span', null, t('items.infographic.cost'))),
      h('h3', { class: 'pay-info-title', id: 'pay-cost-title' }, k('cost.title', { extra: p.extra })),
      h('div', { class: 'pay-hbars', role: 'group', 'aria-labelledby': 'pay-cost-bars' },
        h('p', { class: 'pay-hbars-title', id: 'pay-cost-bars' }, k('cost.interestTitle')),
        h('div', { class: 'pay-hrow' },
          h('div', { class: 'pay-hrow-head' }, h('span', { class: 'pay-hrow-label' }, k('list.totalsOriginal')), h('span', { class: 'pay-hrow-value money' }, whole(d.originalTotalInterestCents))),
          h('div', { class: 'pay-htrack', 'aria-hidden': 'true' }, hatchBar('o', (d.originalTotalInterestCents / max) * 100))),
        h('div', { class: 'pay-hrow' },
          h('div', { class: 'pay-hrow-head' }, h('span', { class: 'pay-hrow-label' }, k('list.totalsRevised')), h('span', { class: 'pay-hrow-value money' }, whole(d.revisedTotalInterestCents))),
          h('div', { class: 'pay-htrack', 'aria-hidden': 'true' },
            hatchBar('r', (d.originalTotalInterestCents / max) * 100),
            hatchBar('x', (d.additionalLifetimeInterestCents / max) * 100))),
        h('p', { class: 'pay-cost-extra' },
          h('span', { class: 'pay-cost-extra-key', 'aria-hidden': 'true' }),
          h('span', null, k('cost.additional')), ' ',
          h('strong', { class: 'money' }, App.fmt.money(d.additionalLifetimeInterestCents, { compact: true, signed: true }))),
        h('p', { class: 'pay-scale' }, k('cost.scale', { zero: whole(0), max: whole(max) }))),
      compareRow(k('cost.payments'), whole(d.originalTotalPaymentsCents), whole(d.revisedTotalPaymentsCents), 'pay-cost-payments'),
      compareRow(k('cost.final'), date(R.change.originalMaturity), date(R.change.revisedMaturity), 'pay-cost-final'),
      h('div', { class: 'callout callout--neutral pay-info-callout' }, App.ui.icon('info'), h('p', null, k('cost.note', { extra3: p.extra3, extra: p.extra }))),
      h('div', { class: 'pay-info-foot' },
        h('div', { class: 'action-row' }, App.ui.explainButton(ctx), App.ui.askButton({ ...ctx, topic: 'interest' })),
        App.ui.noticeLink('cost', ctx)));
  }

  /* ---------- paired payment chart card ---------- */
  function paymentTable(months, p) {
    const comps = ['principal', 'interest', 'total'];
    const cells = (row) => comps.map((c) => h('td', { class: 'num' }, row ? money(row[FIELDS[c]]) : k('list.noPayment')));
    return h('div', { class: 'table-wrap pay-dv-table' }, h('table', { class: 'data-table pay-table' },
      h('caption', null, k('chart.tableCaption', { from: date(months[0].id, 'monthYear'), to: date(months[months.length - 1].id, 'monthYear') })),
      h('colgroup', null, h('col')), h('colgroup', { span: 3 }), h('colgroup', { span: 3 }), h('colgroup', null, h('col')),
      h('thead', null,
        h('tr', null, h('td'), h('th', { scope: 'colgroup', colspan: 3 }, k('list.totalsOriginal')), h('th', { scope: 'colgroup', colspan: 3 }, k('list.totalsRevised')), h('td')),
        h('tr', null, h('th', { scope: 'col' }, k('chart.month')),
          comps.map((c) => h('th', { scope: 'col', class: 'num' }, t(`common.${c}`))),
          comps.map((c) => h('th', { scope: 'col', class: 'num' }, t(`common.${c}`))),
          h('th', { scope: 'col', class: 'num' }, t('common.difference')))),
      h('tbody', null, months.map((m) => h('tr', null,
        h('th', { scope: 'row' }, monthName(m.id)),
        cells(m.original), cells(m.revised),
        h('td', { class: 'num' }, diffEl(m.differenceCents)))))));
  }

  function paymentCards(months) {
    const comps = ['principal', 'interest', 'total'];
    const col = (labelText, row, cls) => h('div', { class: ['pay-dv-col', cls] },
      h('p', { class: 'pay-dv-col-title' }, labelText),
      h('dl', { class: 'pay-dv-dl' }, comps.map((c) => h('div', { class: ['pay-dv-pair', c === 'total' ? 'is-total' : null] },
        h('dt', null, t(`common.${c}`)), h('dd', { class: 'money' }, row ? money(row[FIELDS[c]]) : k('list.noPayment'))))));
    return h('ul', { class: 'pay-dv-cards', 'aria-label': k('chart.tableCaption', { from: date(months[0].id, 'monthYear'), to: date(months[months.length - 1].id, 'monthYear') }) },
      months.map((m) => h('li', { class: 'pay-dv-card' },
        h('p', { class: 'pay-dv-month' }, monthName(m.id)),
        h('div', { class: 'pay-dv-cols' }, col(t('common.original'), m.original, 'pay-dv-col--o'), col(t('common.revised'), m.revised, 'pay-dv-col--r')),
        h('p', { class: 'pay-dv-diff' }, h('span', { class: 'pay-dv-diff-label' }, t('common.difference')), diffEl(m.differenceCents)))));
  }

  function readout(selectedId) {
    const body = h('div', { class: 'pay-readout-body' });
    const action = App.ui.button({ label: k('chart.seeBreakdown'), kind: 'link', iconAfter: 'arrowRight', fid: 'pay-readout-detail', className: 'pay-readout-btn', onClick: () => focusDetail() });
    const el = h('div', { class: 'pay-readout' }, body, selectedId ? action : null);
    let shown = undefined;
    function show(id) {
      const target = id || selectedId || null;
      const preview = !!id && id !== selectedId;
      const key = `${target}|${preview}`;
      if (key === shown) return;
      shown = key;
      App.util.clear(body);
      el.classList.toggle('is-preview', preview);
      const m = target ? App.rec.month(target) : null;
      if (!m) {
        body.append(h('p', { class: 'pay-readout-hint' }, App.ui.icon('info', { size: 16 }), h('span', null, k('chart.readoutHint'))));
        return;
      }
      const val = (row) => (row ? money(row.totalCents) : k('list.noPayment'));
      App.util.append(body, [
        h('p', { class: 'pay-readout-month' }, monthName(m.id)),
        h('dl', { class: 'pay-readout-vals' },
          h('div', { class: 'pay-readout-pair' }, h('dt', null, k('list.original')), h('dd', { class: 'money' }, val(m.original))),
          h('div', { class: 'pay-readout-pair' }, h('dt', null, k('list.revised')), h('dd', { class: 'money' }, val(m.revised))),
          h('div', { class: 'pay-readout-pair' }, h('dt', null, k('list.difference')), h('dd', null, diffEl(m.differenceCents)))),
        preview ? h('p', { class: 'pay-readout-hint pay-readout-hint--preview' }, k('chart.readoutPreview')) : null]);
    }
    show(null);
    return { el, show, contains: (node) => el.contains(node) };
  }

  function paymentChartCard(f, p, selectedId, mounts) {
    const months = App.rec.months.slice(0, 6);
    const host = h('div', { class: 'pay-chart-host' });
    const ro = readout(selectedId);
    const first = months[0];
    const n = f.n;
    const resumed = App.rec.months[n];
    const summary = [
      k('chart.summary1', { from: p.from, to: p.to, revised: money(f.r[0].totalCents), origHigh: money(f.o[0].totalCents), origLow: money(f.o[n - 1].totalCents) }),
      k('chart.summary2', { resume: p.resume, first: money(resumed.revised.totalCents), diff: money(resumed.differenceCents), orig: money(resumed.original.totalCents) }),
    ];
    mounts.push(() => {
      handles.push(charts().payments(host, {
        months,
        selectedId,
        onSelect: (id, fid) => select(id, fid),
        onPreview: (id, e) => {
          if (!id && e && e.relatedTarget && ro.contains(e.relatedTarget)) return;
          ro.show(id);
        },
      }));
    });
    return h('section', { class: ['card', 'pay-card', 'pay-chart-card'], 'aria-labelledby': 'pay-chart-title' },
      sectionHead('pay-chart-title', k('chart.title', { from: date(first.id, 'monthYear'), to: date(months[months.length - 1].id, 'monthYear') }), k('chart.intro'),
        App.ui.explainButton({ kind: 'chart', id: 'payments', period: '6' })),
      h('div', { class: 'pay-chart-top' }, h('p', { class: 'pay-unit' }, k('chart.unit')), charts().paymentLegend()),
      host,
      ro.el,
      h('div', { class: 'pay-text-summary' },
        h('h3', { class: 'pay-summary-title' }, k('chart.summaryTitle')),
        summary.map((s) => h('p', null, App.ui.rich(s)))),
      dataToggle('payments', [paymentTable(months, p), paymentCards(months)]));
  }

  /* ---------- principal balance chart card ---------- */
  function balancePoints(f) {
    const R = f.R;
    const start = R.loan.principalAtScheduleStartCents;
    const pts = [{ key: 'start', label: k('balance.start', { date: date(R.effectiveDate) }), o: start, r: start }];
    App.rec.months.forEach((m) => {
      const isOrigEnd = !!(m.original && m.original.date === R.change.originalMaturity);
      const isRevEnd = !!(m.revised && m.revised.date === R.change.revisedMaturity);
      if (!m.id.endsWith('-12') && !isOrigEnd && !isRevEnd) return;
      const label = isOrigEnd ? k('balance.originalEnd', { date: date(m.date) }) : isRevEnd ? k('balance.revisedEnd', { date: date(m.date) }) : date(m.date);
      pts.push({ key: m.id, label, o: m.original ? m.original.closingPrincipalCents : null, r: m.revised ? m.revised.closingPrincipalCents : null });
    });
    return pts;
  }

  function balanceData(f) {
    const pts = balancePoints(f);
    const v = (cents) => (cents === null ? k('balance.repaidShort') : whole(cents));
    const table = h('div', { class: 'table-wrap pay-dv-table' }, h('table', { class: 'data-table pay-table' },
      h('caption', null, k('balance.tableCaption')),
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, k('balance.date')), h('th', { scope: 'col', class: 'num' }, k('balance.legend.original')), h('th', { scope: 'col', class: 'num' }, k('balance.legend.revised')))),
      h('tbody', null, pts.map((pt) => h('tr', null, h('th', { scope: 'row' }, pt.label), h('td', { class: 'num' }, v(pt.o)), h('td', { class: 'num' }, v(pt.r)))))));
    const cards = h('ul', { class: 'pay-dv-cards pay-dv-cards--balance', 'aria-label': k('balance.tableCaption') },
      pts.map((pt) => h('li', { class: 'pay-dv-card' },
        h('p', { class: 'pay-dv-month' }, pt.label),
        h('dl', { class: 'pay-dv-dl pay-dv-dl--two' },
          h('div', { class: 'pay-dv-pair' }, h('dt', null, k('balance.legend.original')), h('dd', { class: 'money' }, v(pt.o))),
          h('div', { class: 'pay-dv-pair' }, h('dt', null, k('balance.legend.revised')), h('dd', { class: 'money' }, v(pt.r)))))));
    return [table, cards];
  }

  function balanceCard(f, p, mounts) {
    const host = h('div', { class: 'pay-chart-host pay-chart-host--balance' });
    mounts.push(() => handles.push(charts().balance(host)));
    const ctx = { kind: 'chart', id: 'balance', period: 'all' };
    return h('section', { class: ['card', 'pay-card', 'pay-balance-card'], 'aria-labelledby': 'pay-balance-title' },
      sectionHead('pay-balance-title', k('balance.title'), App.ui.rich(k('balance.intro', { monthly: p.monthly })), App.ui.explainButton(ctx)),
      h('div', { class: 'pay-chart-top' }, h('p', { class: 'pay-unit' }, k('balance.unit')), charts().balanceLegend()),
      host,
      h('div', { class: 'pay-text-summary' },
        h('h3', { class: 'pay-summary-title' }, k('chart.summaryTitle')),
        h('p', null, k('balance.summary', { start: p.start, lastPostponed: p.lastPostponed, monthly: p.monthly, period: p.period, origMaturity: p.origMaturity, revMaturity: p.revMaturity }))),
      h('div', { class: 'pay-card-foot' },
        dataToggle('balance', balanceData(f)),
        App.ui.noticeLink('maturity', ctx)));
  }

  /* ---------- month comparison list ---------- */
  function monthCard(m, f, selectedId) {
    const fid = `pay-month-${m.id}`;
    const sel = m.id === selectedId;
    const tags = monthTags(m, f);
    const val = (row) => (row
      ? h('span', { class: 'pay-mv-amt money' }, money(row.totalCents))
      : h('span', { class: 'pay-mv-amt pay-mv-none' }, k('list.noPayment')));
    return h('li', { class: ['pay-mitem', sel ? 'is-selected' : null] },
      h('button', {
        type: 'button',
        class: ['pay-mcard', sel ? 'is-selected' : null],
        fid,
        'aria-current': sel ? 'true' : null,
        dataset: { month: m.id },
        on: { click: () => select(m.id, fid) },
      },
      h('span', { class: 'pay-mcard-head' },
        h('span', { class: 'pay-mcard-title' },
          h('span', { class: 'pay-mcard-month' }, monthName(m.id)),
          h('span', { class: 'pay-mcard-date' }, k('list.paymentOn', { date: date(m.date) }))),
        tags.length || sel ? h('span', { class: 'pay-mcard-tags' },
          sel ? h('span', { class: 'pay-mcard-selected' }, App.ui.icon('check', { size: 14 }), k('list.selected')) : null,
          tags) : null),
      h('span', { class: 'pay-mcard-vals' },
        h('span', { class: 'pay-mv pay-mv--o' }, h('span', { class: 'pay-mv-label' }, k('list.original')), val(m.original)),
        h('span', { class: 'pay-mv pay-mv--r' }, h('span', { class: 'pay-mv-label' }, k('list.revised')), val(m.revised)),
        h('span', { class: 'pay-mv pay-mv--d' }, h('span', { class: 'pay-mv-label' }, k('list.difference')), diffEl(m.differenceCents)))),
      sel ? App.ui.button({ label: k('list.seeBreakdown'), kind: 'link', iconAfter: 'arrowRight', fid: `pay-month-detail-${m.id}`, className: 'pay-mitem-detail', onClick: () => focusDetail() }) : null);
  }

  function isYearOpen(st, y) {
    return Object.prototype.hasOwnProperty.call(st.openYears, y) ? !!st.openYears[y] : y === App.rec.years[0];
  }

  function yearGroup(y, f, st, selectedId) {
    const months = App.rec.monthsInYear(y);
    const open = isYearOpen(st, y);
    const panelId = `pay-year-panel-${y}`;
    const hasO = months.some((m) => m.original);
    const panel = h('ul', { class: 'pay-mlist pay-mlist--year', id: panelId, hidden: !open }, months.map((m) => monthCard(m, f, selectedId)));
    const btn = h('button', {
      type: 'button',
      class: 'pay-year-btn',
      fid: `pay-year-${y}`,
      'aria-expanded': String(open),
      'aria-controls': panelId,
      on: {
        click: () => {
          const now = btn.getAttribute('aria-expanded') !== 'true';
          st.openYears[y] = now;
          btn.setAttribute('aria-expanded', String(now));
          panel.hidden = !now;
          alignDetail();
        },
      },
    },
    h('span', { class: 'pay-year-main' },
      h('span', { class: 'pay-year-name' }, y),
      h('span', { class: 'pay-year-count' }, plural('list.yearMonths', months.length))),
    h('span', { class: 'pay-year-totals' },
      h('span', { class: 'pay-year-total' }, hasO ? k('list.yearOriginal', { amount: money(sumRows(months, 'original')) }) : k('list.yearOriginalNone')),
      ' ',
      h('span', { class: 'pay-year-total' }, k('list.yearRevised', { amount: money(sumRows(months, 'revised')) }))),
    App.ui.icon('chevronDown', { class: 'pay-year-chevron' }));
    return h('li', { class: 'pay-year' }, h('h3', { class: 'pay-year-h' }, btn), panel);
  }

  function totalsBlock(range, months) {
    const sO = sumRows(months, 'original');
    const sR = sumRows(months, 'revised');
    const nO = months.filter((m) => m.original).length;
    const nR = months.filter((m) => m.revised).length;
    const tile = (cls, label, value, sub) => h('div', { class: ['pay-total', cls] }, h('dt', null, label), h('dd', null, value, sub ? h('span', { class: 'pay-total-sub' }, sub) : null));
    return h('div', { class: 'pay-totals-wrap' },
      h('p', { class: 'pay-totals-title', id: 'pay-totals-title' }, k('list.totalsTitle', { range: k(`range.${range}`) })),
      h('dl', { class: 'pay-totals', 'aria-labelledby': 'pay-totals-title' },
        tile('pay-total--o', k('list.totalsOriginal'), h('span', { class: 'money' }, money(sO)), plural('list.payments', nO)),
        tile('pay-total--r', k('list.totalsRevised'), h('span', { class: 'money' }, money(sR)), plural('list.payments', nR)),
        tile('pay-total--d', k('list.totalsDiff'), diffEl(sR - sO))));
  }

  function listArea(f, st, selectedId) {
    const range = st.range;
    const months = App.rec.range(range);
    const out = [totalsBlock(range, months)];
    if (selectedId && !months.some((m) => m.id === selectedId)) {
      out.push(h('p', { class: 'callout callout--neutral pay-outside' }, App.ui.icon('info'), h('span', null, k('list.outside', { month: monthName(selectedId) }))));
    }
    if (range === 'all') {
      out.push(h('p', { class: 'pay-years-hint' }, k('list.yearsHint')));
      out.push(h('ul', { class: 'pay-years' }, App.rec.years.map((y) => yearGroup(y, f, st, selectedId))));
    } else {
      out.push(h('ul', { class: 'pay-mlist' }, months.map((m) => monthCard(m, f, selectedId))));
    }
    return out;
  }

  function filterControl(st) {
    return h('fieldset', { class: 'pay-filter' },
      h('legend', { class: 'pay-filter-legend' }, k('range.legend')),
      h('div', { class: 'segmented pay-segmented' }, RANGES.map((r) => [
        h('input', {
          type: 'radio',
          name: 'pay-range',
          id: `pay-range-${r}`,
          value: r,
          fid: `pay-range-${r}`,
          checked: st.range === r,
          on: { change: (e) => { if (e.target.checked) setRange(r); } },
        }),
        h('label', { for: `pay-range-${r}` }, k(`range.${r}`)),
      ])));
  }

  function setRange(r) {
    const st = state();
    if (!RANGES.includes(r) || !cur) return;
    st.range = r;
    App.util.clear(cur.listHost);
    App.util.append(cur.listHost, listArea(cur.f, st, cur.selectedId));
    if (cur.selHint) cur.selHint.textContent = k('downloads.selectionHint', { range: k(`range.${r}`) });
    if (cur.detailEl && cur.detailEl.isConnected && cur.selectedId) {
      const next = detailPanel(App.rec.month(cur.selectedId), cur.f, cur.p, st);
      cur.detailEl.replaceWith(next);
      cur.detailEl = next;
    }
    const n = App.rec.range(r).length;
    App.announce(k('list.showing', { range: k(`range.${r}`), count: plural('list.payments', n) }));
    alignDetail();
  }

  /* ---------- selected month detail ---------- */
  function whyParas(m, f, p) {
    const out = [];
    const R = f.R;
    if (isPostponed(m)) {
      out.push(k('detail.why.postponed', { interest: money(m.revised.interestCents), opening: whole(m.revised.openingPrincipalCents) }));
      if (m.interestDifferenceCents > 0) out.push(k('detail.why.postponedHigher', { diff: money(m.interestDifferenceCents) }));
    } else if (m.original && m.revised) {
      if (m.index === f.n) out.push(k('detail.why.resumes', { principal: whole(m.revised.principalCents) }));
      if (m.interestDifferenceCents > 0) {
        out.push(k('detail.why.higherInterest', { diff: money(m.interestDifferenceCents), revOpening: whole(m.revised.openingPrincipalCents), origOpening: whole(m.original.openingPrincipalCents) }));
      }
      if (m.original.date === R.change.originalMaturity) out.push(k('detail.why.finalOriginal', { revMaturity: p.revMaturity }));
    } else if (m.revised && !m.original) {
      out.push(k('detail.why.added', { origMaturity: p.origMaturity, period: p.period }));
    }
    if (m.revised && m.revised.date === R.change.revisedMaturity) out.push(k('detail.why.finalRevised'));
    return out;
  }

  function detailPanel(m, f, p, st) {
    if (!m) {
      return h('section', { class: ['card', 'pay-detail', 'pay-detail--empty'], fid: 'pay-detail', 'aria-labelledby': 'pay-detail-title' },
        h('span', { class: 'pay-detail-empty-icon', 'aria-hidden': 'true' }, App.ui.icon('calendar', { size: 22 })),
        h('div', null,
          h('h3', { class: 'pay-detail-title', id: 'pay-detail-title' }, k('detail.emptyTitle')),
          h('p', { class: 'pay-detail-empty-text' }, k('detail.emptyText'))));
    }
    const id = m.id;
    const rows = ['openingBalance', 'principal', 'interest', 'total', 'closingBalance'];
    const field = { openingBalance: 'openingPrincipalCents', principal: 'principalCents', interest: 'interestCents', total: 'totalCents', closingBalance: 'closingPrincipalCents' };
    const dval = (row, key, series) => h('span', { class: ['pay-dval', `pay-dval--${series}`] },
      h('span', { class: 'pay-dval-k' }, t(series === 'o' ? 'common.original' : 'common.revised')),
      row
        ? h('span', { class: 'pay-dval-v money' }, money(row[field[key]]))
        : h('span', { class: 'pay-dval-v pay-dval-none' }, h('span', { 'aria-hidden': 'true' }, '—'), App.ui.srOnly(k('list.noPayment'))));
    const ctx = { kind: 'month', id, period: st.range };
    return h('section', { class: ['card', 'pay-detail'], fid: 'pay-detail', id: 'pay-detail', 'aria-labelledby': 'pay-detail-title', dataset: { month: id } },
      h('div', { class: 'pay-detail-head' },
        h('div', { class: 'pay-detail-heading' },
          h('p', { class: 'card-kicker' }, k('detail.kicker')),
          h('h3', { class: 'pay-detail-title', id: 'pay-detail-title' }, cap(k('detail.title', { month: ofMonth(id) }))),
          h('p', { class: 'pay-detail-date' }, k('detail.date', { date: date(m.date) }))),
        App.ui.button({ label: t('common.close'), kind: 'chip', iconName: 'close', fid: 'pay-detail-close', ariaLabel: k('detail.close'), className: 'pay-detail-close', onClick: () => deselect() })),
      (() => { const tags = monthTags(m, f); return tags.length ? h('div', { class: 'pay-detail-tags' }, tags) : null; })(),
      h('div', { class: 'pay-dgrid', role: 'group', 'aria-label': k('detail.compareLabel', { month: ofMonth(id) }) },
        h('div', { class: 'pay-drow pay-drow--head', 'aria-hidden': 'true' },
          h('span', { class: 'pay-dlabel' }),
          h('span', { class: 'pay-dh pay-dh--o' }, h('span', { class: 'pay-key pay-key--o' }), t('common.original')),
          h('span', { class: 'pay-dh pay-dh--r' }, h('span', { class: 'pay-key pay-key--r' }), t('common.revised'))),
        rows.map((key) => h('div', { class: ['pay-drow', key === 'total' ? 'pay-drow--total' : null] },
          h('span', { class: 'pay-dlabel' }, t(`common.${key}`)),
          dval(m.original, key, 'o'),
          dval(m.revised, key, 'r')))),
      !m.original ? h('p', { class: 'pay-detail-nopay' }, t('common.noPayment')) : null,
      h('p', { class: 'pay-detail-diff' }, h('span', { class: 'pay-detail-diff-label' }, k('detail.diff')), diffEl(m.differenceCents)),
      h('div', { class: 'pay-detail-why' },
        h('h4', { class: 'pay-detail-why-title' }, k('detail.whyTitle')),
        whyParas(m, f, p).map((s) => h('p', null, App.ui.rich(s)))),
      h('div', { class: 'pay-detail-foot' },
        h('div', { class: 'action-row' },
          App.ui.explainButton(ctx, { fid: `explain-month-${id}` }),
          App.ui.askButton({ kind: 'month', id, topic: 'payment' })),
        App.ui.noticeLink('schedule', { kind: 'month', id })));
  }

  /* ---------- selection and alignment ---------- */
  function select(id, fid) {
    internalSelect = id;
    App.router.go(App.router.href(NS, id), { keepScroll: true, focus: fid });
    App.announce(k('detail.announce', { month: ofMonth(id) }));
  }

  function deselect() {
    const id = cur && cur.selectedId;
    const card = id ? App.util.findByFid(`pay-month-${id}`) : null;
    const fid = card && !card.closest('[hidden]') ? `pay-month-${id}` : 'pay-list-title';
    internalSelect = null;
    App.router.go(App.router.href(NS), { keepScroll: true, focus: fid });
  }

  function focusDetail() {
    const el = cur && cur.detailEl;
    if (!el || !el.isConnected) return;
    el.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' });
    App.util.focusEl(el, { preventScroll: true });
  }

  /** At the split layout, line the detail panel up with the selected card (no sticky positioning). */
  function alignDetail() {
    if (!cur || !cur.detailEl || !cur.detailEl.isConnected) return;
    const panel = cur.detailEl;
    panel.style.marginTop = '';
    const wide = window.matchMedia ? window.matchMedia('(min-width: 900px)').matches : window.innerWidth >= 900;
    if (!wide || !cur.selectedId) return;
    const card = cur.listCol.querySelector(`[data-fid="pay-month-${cur.selectedId}"]`);
    if (!card || card.closest('[hidden]')) return;
    const offset = card.getBoundingClientRect().top - cur.listCol.getBoundingClientRect().top;
    const room = cur.listCol.offsetHeight - panel.offsetHeight;
    const mt = Math.max(0, Math.min(offset, room));
    if (mt > 8) panel.style.marginTop = `${Math.round(mt)}px`;
  }
  window.addEventListener('resize', App.util.debounce(alignDetail, 100));

  function ensureVisible(st, id) {
    const m = App.rec.month(id);
    if (!m) return;
    if (!App.rec.range(st.range).some((x) => x.id === id)) st.range = m.index < 6 ? '6' : 'all';
    if (st.range === 'all') st.openYears[id.slice(0, 4)] = true;
  }

  /* ---------- CSV export (generated locally) ---------- */
  function csvCell(v) {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function csv(kind) {
    if (!CSV_KINDS.includes(kind)) throw new Error(`Unknown CSV kind ${kind}`);
    const R = App.record;
    const dec = App.fmt.decimal;
    const rows = [];
    const pre = (key, value) => rows.push([k(`csv.${key}`), value]);
    const COLS = ['opening', 'principal', 'interest', 'total', 'closing'];
    const selection = kind.startsWith('selection-');
    const range = selection ? kind.slice('selection-'.length) : null;
    let content;
    let filename;
    if (selection) {
      content = k('csv.contentSelection', { range: k(`range.${range}`) });
      filename = `${R.noticeId}_selection-${range === 'all' ? 'full-term' : `first-${range}-months`}.csv`;
    } else if (kind === 'revised-full') {
      content = k('csv.contentRevised');
      filename = `${R.noticeId}_revised-schedule.csv`;
    } else {
      content = k('csv.contentOriginal');
      filename = `${R.noticeId}_original-schedule.csv`;
    }
    pre('noticeId', R.noticeId);
    pre('recordVersion', R.recordVersion);
    pre('loanId', R.loan.id);
    pre('status', k('csv.statusValue'));
    pre('currency', R.loan.currency);
    pre('content', content);
    pre('generated', k('csv.generatedValue'));
    rows.push([]);
    if (selection) {
      const months = App.rec.range(range);
      rows.push([
        k('csv.date'),
        ...COLS.map((c) => k('csv.original', { column: k(`csv.${c}`) })),
        ...COLS.map((c) => k('csv.revised', { column: k(`csv.${c}`) })),
        k('csv.difference'),
      ]);
      months.forEach((m) => rows.push([
        m.date,
        ...COLS.map((c) => (m.original ? dec(m.original[FIELDS[c]]) : '')),
        ...COLS.map((c) => (m.revised ? dec(m.revised[FIELDS[c]]) : '')),
        dec(m.differenceCents),
      ]));
      const tot = (sched, fld) => dec(sumRows(months, sched, fld));
      rows.push([
        k('csv.totals'),
        '', tot('original', 'principalCents'), tot('original', 'interestCents'), tot('original', 'totalCents'), '',
        '', tot('revised', 'principalCents'), tot('revised', 'interestCents'), tot('revised', 'totalCents'), '',
        dec(sumRows(months, 'revised') - sumRows(months, 'original')),
      ]);
    } else {
      const sched = kind === 'revised-full' ? R.revisedSchedule : R.originalSchedule;
      rows.push([k('csv.date'), k('csv.number'), ...COLS.map((c) => k(`csv.${c}`))]);
      sched.forEach((row, i) => rows.push([row.date, i + 1, ...COLS.map((c) => dec(row[FIELDS[c]]))]));
      const sum = (fld) => dec(sched.reduce((a, row) => a + row[fld], 0));
      rows.push([k('csv.totals'), '', '', sum('principalCents'), sum('interestCents'), sum('totalCents'), '']);
    }
    const text = `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
    return { filename, mime: 'text/csv;charset=utf-8', content: text };
  }

  function download(kind) {
    const file = csv(kind);
    App.util.downloadBlob(file.filename, file.mime, file.content);
    App.events.log('schedule_exported', { id: kind });
    App.announce(k('downloads.started', { file: file.filename }));
    return file;
  }

  function downloadsCard(st) {
    const selHint = h('p', { class: 'pay-dl-hint' }, k('downloads.selectionHint', { range: k(`range.${st.range}`) }));
    const btn = (label, fid, fn) => App.ui.button({ label, kind: 'secondary', iconName: 'download', fid, className: 'pay-dl-btn', onClick: fn });
    const card = h('section', { class: ['card', 'pay-card', 'pay-downloads'], 'aria-labelledby': 'pay-downloads-title' },
      sectionHead('pay-downloads-title', k('downloads.title'), k('downloads.intro')),
      h('div', { class: 'pay-dl-grid' },
        h('div', { class: 'pay-dl-item' },
          btn(k('downloads.selection'), 'pay-dl-selection', () => download(`selection-${state().range}`)),
          selHint),
        h('div', { class: 'pay-dl-item' }, btn(k('downloads.revised'), 'pay-dl-revised', () => download('revised-full'))),
        h('div', { class: 'pay-dl-item' }, btn(k('downloads.original'), 'pay-dl-original', () => download('original-full')))));
    return { card, selHint };
  }

  /* ---------- view ---------- */
  function render(el, route, opts = {}) {
    destroyCharts();
    const st = state();
    const item = route.item;
    const monthId = item && App.rec.isMonthId(item) ? item : null;
    const special = item && SPECIAL.includes(item) ? item : null;
    // Special targets and out-of-range months adjust the filter on arrival only; a
    // locale re-render or a Back/restore keeps the filter exactly as the reader left it.
    if (!opts.rerender && !opts.restore) {
      if (special === 'relief') st.range = '3';
      if (special === 'schedule') st.range = 'all';
      if (monthId) ensureVisible(st, monthId);
    }
    if (!RANGES.includes(st.range)) st.range = '6';
    const internal = internalSelect !== null && internalSelect === item;
    internalSelect = null;

    const f = facts();
    const p = params(f);
    const selected = monthId ? App.rec.month(monthId) : null;
    const mounts = [];

    const listHost = h('div', { class: 'pay-list-area' });
    App.util.append(listHost, listArea(f, st, monthId));
    const listCol = h('div', { class: 'pay-list-col' }, listHost);
    const detailEl = detailPanel(selected, f, p, st);
    const relief = reliefCard(f, p);
    const cost = costCard(f, p);
    const dl = downloadsCard(st);
    const monthsSection = h('section', { class: 'pay-section pay-months', id: 'pay-months', fid: 'pay-months', 'aria-labelledby': 'pay-list-title' },
      sectionHead('pay-list-title', k('list.title'), k('list.intro')),
      filterControl(st),
      h('div', { class: 'pay-split' }, listCol, h('div', { class: 'pay-detail-col' }, detailEl)));

    const root = h('div', { class: 'pay-view' },
      App.ui.backControl(),
      App.ui.sectionHeader({ overline: k('overline'), title: k('title'), intro: k('intro') }),
      App.ui.demoNote({ className: 'pay-demo-note' }),
      h('div', { class: 'pay-summary' },
        h('span', { class: 'pay-summary-icon', 'aria-hidden': 'true' }, App.ui.icon('calendar', { size: 22 })),
        h('p', null, App.ui.rich(k('summary', { months: p.months, interest: p.interest, relief: p.relief, resume: p.resume, revMaturity: p.revMaturity, extra: p.extra })))),
      h('section', { class: 'pay-section pay-effect', 'aria-labelledby': 'pay-effect-title' },
        sectionHead('pay-effect-title', k('effect.title'), k('effect.intro')),
        h('div', { class: 'pay-infos' }, relief, cost)),
      paymentChartCard(f, p, monthId, mounts),
      monthsSection,
      balanceCard(f, p, mounts),
      dl.card);

    cur = { f, p, st, selectedId: monthId, listHost, listCol, detailEl, selHint: dl.selHint };
    el.appendChild(root);
    mounts.forEach((fn) => fn());
    requestAnimationFrame(alignDetail);

    if (monthId) return internal ? {} : { itemEl: detailEl };
    if (special === 'relief') return { itemEl: relief };
    if (special === 'cost') return { itemEl: cost };
    if (special === 'schedule') return { itemEl: monthsSection };
    return {};
  }

  App.router.registerView(NS, {
    render,
    onLeave() { destroyCharts(); cur = null; internalSelect = null; },
  });
  App.session.onReset(() => { internalSelect = null; });

  App.payments = App.payments || {};
  Object.assign(App.payments, { csv, download, CSV_KINDS, state });
})();
