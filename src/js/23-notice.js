/* Your notice (view "documents", namespace "notice", class prefix ntc-).
 * Level 3 "verify": the formal synthetic notice as a readable letter with
 * twelve numbered clauses (App.CLAUSES), the record metadata, local exports
 * (CSV schedules and the JSON record, generated in this browser) and a
 * dedicated print layout (App.print.prepare). Every clause that has a
 * plain-language counterpart links to it with a return path, and every value
 * is read from App.record and formatted with App.fmt - nothing here computes
 * a new financial fact. */
(() => {
  const NS = 'notice';
  const k = (key, params) => t(`${NS}.${key}`, params);
  const loc = () => App.i18n.locale;
  const state = () => App.session.slice('notice', () => ({ years: null, toc: null }));

  // The first resumed payment's month (e.g. "2027-02"), read from the issued record.
  const resumedMonth = () => {
    const r = App.rec.firstResumed();
    return r ? r.date.slice(0, 7) : null;
  };
  // Clause wiring: query topic hint and the plain-language place that explains it.
  // Resumption points at the first resumed payment in Payments & impact, where
  // both schedules are broken down for that month.
  const LINKED = {
    postponement: { topic: 'payment', plain: ['changes', 'principal'] },
    interest: { topic: 'interest', plain: ['changes', 'interest'] },
    resumption: { topic: 'payment', plain: () => (resumedMonth() ? ['payments', resumedMonth()] : ['changes', 'principal']) },
    maturity: { topic: 'maturity', plain: ['changes', 'maturity'] },
    cost: { topic: 'interest', plain: ['payments', 'cost'], relief: ['payments', 'relief'] },
    unchanged: { topic: 'understanding', plain: ['changes', 'rate'] },
    action: { topic: 'understanding', plain: ['overview'] },
    schedule: { topic: 'payment', plain: ['payments', 'schedule'] },
    contact: { topic: 'other', help: true },
  };
  // Short clauses never split across printed pages
  const PRINT_KEEP = ['purpose', 'postponement', 'interest', 'resumption', 'maturity', 'unchanged', 'action', 'contact'];

  /* ---------- formatting (display only) ---------- */
  const money = (cents) => App.fmt.money(cents);
  const dec = (cents) => App.fmt.decimal(cents);
  const num = (n) => App.fmt.number(n);
  // Long dates keep day and month together; Canadian French writes the first of the month as "1er".
  function date(iso, style = 'long') {
    let s = App.fmt.date(iso, style);
    if (loc() === 'fr-CA' && (style === 'long' || style === 'dayMonth')) s = s.replace(/^1(\s)/, '1er$1');
    return style === 'long' || style === 'dayMonth' ? s.replace(' ', '\u00a0') : s;
  }
  function list(items) {
    try {
      return new Intl.ListFormat(loc(), { style: 'long', type: 'conjunction' }).format(items);
    } catch (e) {
      return items.join(', ');
    }
  }
  function plural(key, n) {
    let cat = 'other';
    try { cat = new Intl.PluralRules(loc()).select(n) === 'one' ? 'one' : 'other'; } catch (e) { cat = n === 1 ? 'one' : 'other'; }
    return t(`${key}.${cat}`, { n: num(n) });
  }
  function splitTitle(id) {
    const full = t(`clauses.${id}`);
    const m = full.match(/^(\d+)\.\s*(.+)$/);
    return m ? { n: m[1], name: m[2], full } : { n: '', name: full, full };
  }

  // The fixture status is an English identifier phrase; show the approved localized wording.
  function statusPhrase() {
    const raw = String(App.record.status || '');
    return /^fictional demonstration/i.test(raw) ? k('status.fictional') : raw;
  }

  /* ---------- values from the issued record (re-read each render for locale) ---------- */
  function params() {
    const R = App.record;
    const d = R.derived;
    const r = R.revisedSchedule;
    const n = R.change.months;
    const post = r.slice(0, n);
    return {
      loan: R.loan.id,
      company: R.client.company,
      effective: date(R.effectiveDate),
      months: list(post.map((x) => date(x.date, 'monthYear'))),
      from: date(post[0].date, 'monthYear'),
      to: date(post[n - 1].date, 'monthYear'),
      zero: money(post[0].principalCents),
      deferred: money(d.principalDeferredCents),
      opening: money(r[0].openingPrincipalCents),
      rate: App.fmt.percentFromBp(R.loan.annualRateBasisPoints),
      interest: money(d.postponementMonthlyInterestCents),
      resume: date(R.change.resumePrincipalDate),
      monthly: money(R.loan.monthlyPrincipalCents),
      first: money(d.firstResumedPaymentCents),
      firstInterest: money(d.firstResumedInterestCents),
      original: date(R.change.originalMaturity),
      revised: date(R.change.revisedMaturity),
      revCount: num(d.revisedPaymentCount),
      origCount: num(d.originalPaymentCount),
      count: num(r.length),
      firstDate: date(r[0].date),
      lastDate: date(r[r.length - 1].date),
      origInt: money(d.originalTotalInterestCents),
      revInt: money(d.revisedTotalInterestCents),
      extra: money(d.additionalLifetimeInterestCents),
      origTotal: money(d.originalTotalPaymentsCents),
      revTotal: money(d.revisedTotalPaymentsCents),
      origNear: money(d.originalNearTermPaymentsCents),
      revNear: money(d.revisedNearTermPaymentsCents),
      relief: money(d.nearTermPaymentReductionCents),
      extra3: money(d.additionalInterestFirstThreeMonthsCents),
      fee: money(R.change.feeCents),
      next: money(r[0].totalCents),
      nextDate: date(r[0].date),
      period: plural('common.months', n),
      start: date(R.effectiveDate),
    };
  }

  /* ---------- small builders ---------- */
  // Record identifiers (DEMO-4821, DEMO-BDC-CHANGE-2026-001) never break at their hyphens.
  function keepIds(str) {
    const ids = [App.record.noticeId, App.record.loan && App.record.loan.id].filter(Boolean).sort((a, b) => b.length - a.length);
    if (!ids.length) return [str];
    const re = new RegExp(`(${ids.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
    return String(str).split(re).filter((s) => s !== '').map((s) => (ids.includes(s) ? h('span', { class: 'ntc-nobr' }, s) : s));
  }
  // Glossary triggers are buttons (atomic inline boxes). Keep punctuation that
  // touches them - "(" before, ")" "," "." after - on the same line, so a long
  // French line never strands an opening parenthesis.
  function glue(nodes) {
    const out = [];
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i];
      if (!(n instanceof Element) || !n.classList.contains('term')) { out.push(n); continue; }
      let before = '';
      let after = '';
      const prev = out[out.length - 1];
      if (typeof prev === 'string') {
        const m = prev.match(/(\S+)$/);
        if (m) { before = m[1]; out[out.length - 1] = prev.slice(0, -before.length); }
      }
      const next = nodes[i + 1];
      if (typeof next === 'string') {
        const m = next.match(/^([^\s\wÀ-ɏ]+)/);
        if (m) { after = m[1]; nodes[i + 1] = next.slice(after.length); }
      }
      out.push(before || after ? h('span', { class: 'ntc-glue' }, before, n, after) : n);
    }
    return out.filter((x) => x !== '');
  }
  const richText = (str) => glue(App.ui.rich(str).flatMap((n) => (typeof n === 'string' ? keepIds(n) : [n])));
  // Screen: [[term|text]] markers become glossary triggers. Print: plain text.
  const txt = (key, p, mode) => (mode === 'print' ? App.ui.plain(k(key, p)) : richText(k(key, p)));
  const para = (key, p, mode, cls) => h('p', { class: cls || null }, txt(key, p, mode));
  const bullets = (keys, p, mode) => h('ul', { class: 'ntc-list' }, keys.map((key) => h('li', null, txt(key, p, mode))));
  const pair = (label, value, cls) => h('div', { class: ['ntc-pair', cls] }, h('dt', null, label), h('dd', null, value));
  const col = (key) => k(`schedule.cols.${key}`);
  const isPostponed = (i) => i < App.record.change.months;

  function logoEl(cls, print) {
    if (!App.assets.logo) return h('span', { class: ['brand-placeholder', cls] }, t('shell.logoPlaceholder'));
    // Supplied logo, embedded unaltered; CSS sizes it by height only so it is never stretched.
    return h('img', { class: cls, src: App.assets.logo, alt: 'BDC', width: 1280, height: 680, decoding: print ? 'sync' : 'async' });
  }

  /* ---------- clause bodies ---------- */
  function amendmentTerms(p, mode) {
    const R = App.record;
    const rows = [
      [k('text.amendment.type'), k('text.amendment.typeValue', { period: p.period })],
      [k('text.amendment.status'), k('meta.amendmentStatusValue')],
      [k('text.amendment.effective'), p.effective],
      [k('text.amendment.fee'), p.fee],
      [k('text.amendment.acceptance'), R.change.acceptanceRequired ? k('meta.yes') : k('meta.no')],
    ];
    if (mode === 'print') {
      return h('table', { class: 'ntc-p-table ntc-p-kv' }, h('caption', null, k('text.amendment.summaryLabel')),
        h('tbody', null, rows.map(([a, b]) => h('tr', null, h('th', { scope: 'row' }, a), h('td', null, b)))));
    }
    return h('div', { class: 'ntc-terms', role: 'group', 'aria-label': k('text.amendment.summaryLabel') },
      h('dl', { class: 'ntc-terms-list' }, rows.map(([a, b]) => pair(a, b, 'ntc-term'))));
  }

  const BODY = {
    purpose: (p, m) => [para('text.purpose.p1', p, m), para('text.purpose.p2', p, m)],
    amendment: (p, m) => [
      para(App.record.client.seasonalInventoryBuild ? 'text.amendment.p1Seasonal' : 'text.amendment.p1', p, m),
      para('text.amendment.p2', p, m),
      amendmentTerms(p, m),
    ],
    postponement: (p, m) => [para('text.postponement.p1', p, m), para('text.postponement.p2', p, m)],
    interest: (p, m) => [para('text.interest.p1', p, m), para('text.interest.p2', p, m), para('text.interest.p3', p, m)],
    resumption: (p, m) => [para('text.resumption.p1', p, m), para('text.resumption.p2', p, m)],
    maturity: (p, m) => [para('text.maturity.p1', p, m), para('text.maturity.p2', p, m)],
    cost: (p, m) => [
      para('text.cost.p1', p, m),
      bullets(['text.cost.totalInterest', 'text.cost.totalPayments', 'text.cost.nearTerm', 'text.cost.partOf'], p, m),
      // The near-term revised total and the lifetime interest increase are the same
      // figure in this fixture; say plainly that they measure different things.
      App.record.derived.revisedNearTermPaymentsCents === App.record.derived.additionalLifetimeInterestCents ? para('text.cost.sameAmount', p, m) : null,
      para('text.cost.p2', p, m, 'ntc-emph'),
    ],
    unchanged: (p, m) => [
      para('text.unchanged.p1', p, m),
      bullets(['text.unchanged.rate', 'text.unchanged.instalment', 'text.unchanged.fee', 'text.unchanged.other'], p, m),
    ],
    action: (p, m) => [para('text.action.p1', p, m), para('text.action.p2', p, m, 'ntc-emph'), para('text.action.p3', p, m)],
    schedule: (p, m) => scheduleBody(p, m),
    assumptions: (p, m) => [para('text.assumptions.p1', p, m), assumptionList(p, m)],
    contact: (p, m) => [para('text.contact.p1', p, m), para('text.contact.p2', p, m)],
  };

  /* ---------- clause 11: assumptions, 1:1 with record.assumptions ---------- */
  function assumptionList(p) {
    const recorded = App.record.assumptions || [];
    const approved = tv(`${NS}.assumptions.items`);
    if (Array.isArray(approved) && approved.length === recorded.length) {
      return h('ol', { class: 'ntc-list ntc-assumptions', dataset: { source: 'approved' } },
        approved.map((s, i) => h('li', { dataset: { index: String(i) } }, k(`assumptions.items.${i}`, { rate: p.rate, start: p.start }))));
    }
    // Approved wording does not match the record: show the record's own text rather than guess.
    console.warn('[notice] approved assumptions do not match record.assumptions; showing record text');
    return h('div', { class: 'ntc-assumptions-fallback' },
      h('ol', { class: 'ntc-list ntc-assumptions', lang: 'en', dataset: { source: 'record' } }, recorded.map((s) => h('li', null, s))),
      h('p', { class: 'ntc-small' }, k('assumptions.fallbackNote')));
  }

  /* ---------- clause 10: schedules ---------- */
  function amountCells(row) {
    return ['principalCents', 'interestCents', 'totalCents'].map((f) => h('td', { class: 'num' }, money(row[f])));
  }

  function first4Table(mode) {
    const months = App.rec.months.slice(0, 4);
    const sub = ['principal', 'interest', 'total', 'principal', 'interest', 'total'];
    return h('table', { class: mode === 'print' ? 'ntc-p-table ntc-p-first4' : 'data-table ntc-table ntc-first4-table' },
      h('caption', { class: 'sr-only' }, k('schedule.first4Caption')),
      h('thead', null,
        h('tr', null,
          h('th', { scope: 'col', rowspan: 2, class: 'ntc-th-date' }, col('date')),
          h('th', { scope: 'colgroup', colspan: 3, class: 'ntc-group ntc-group--orig' }, t('common.original')),
          h('th', { scope: 'colgroup', colspan: 3, class: 'ntc-group ntc-group--rev' }, t('common.revised'))),
        h('tr', null, sub.map((s, i) => h('th', { scope: 'col', class: ['num', i === 3 ? 'ntc-col-split' : null] }, col(s))))),
      h('tbody', null, months.map((m) => h('tr', null,
        h('th', { scope: 'row', class: 'ntc-date' }, date(m.date, 'medium')),
        amountCells(m.original),
        amountCells(m.revised).map((c, i) => { if (i === 0) c.classList.add('ntc-col-split'); return c; })))));
  }

  function first4Cards() {
    const months = App.rec.months.slice(0, 4);
    const rows = [['principal', 'principalCents'], ['interest', 'interestCents'], ['totalShort', 'totalCents']];
    return h('ul', { class: 'ntc-f4-cards', role: 'list' }, months.map((m) => h('li', { class: 'ntc-f4-card' },
      h('table', { class: 'ntc-mini' },
        h('caption', null, date(m.date)),
        h('colgroup', null, h('col', { class: 'ntc-mini-label' }), h('col'), h('col')),
        h('thead', null, h('tr', null,
          h('td', null),
          h('th', { scope: 'col', class: 'num' }, t('common.original')),
          h('th', { scope: 'col', class: 'num' }, t('common.revised')))),
        h('tbody', null, rows.map(([key, f]) => h('tr', { class: key === 'totalShort' ? 'is-total' : null },
          h('th', { scope: 'row' }, col(key)),
          h('td', { class: 'num' }, money(m.original[f])),
          h('td', { class: 'num ntc-rev' }, money(m.revised[f])))))))));
  }

  function postponedTag() {
    return h('span', { class: 'ntc-tag' }, k('schedule.postponed'));
  }

  function scheduleHead(withNo) {
    return h('thead', null, h('tr', null,
      withNo ? h('th', { scope: 'col', class: 'num ntc-col-no' }, col('no')) : null,
      h('th', { scope: 'col' }, col('date')),
      h('th', { scope: 'col', class: 'num ntc-col-opening' }, col('opening')),
      h('th', { scope: 'col', class: 'num' }, col('principal')),
      h('th', { scope: 'col', class: 'num' }, col('interest')),
      h('th', { scope: 'col', class: 'num' }, col('total')),
      h('th', { scope: 'col', class: 'num' }, col('closing'))));
  }

  function scheduleRow({ r, i }, mode) {
    const postponed = isPostponed(i);
    return h('tr', { class: postponed ? 'is-postponed' : null, dataset: { row: String(i + 1) } },
      h('td', { class: 'num ntc-col-no' }, num(i + 1)),
      h('th', { scope: 'row', class: 'ntc-date' }, h('span', { class: 'ntc-date-text' }, date(r.date, 'medium')), postponed && mode !== 'print' ? postponedTag() : null,
        postponed && mode === 'print' ? h('span', { class: 'ntc-p-tag' }, ` · ${k('schedule.postponed')}`) : null),
      h('td', { class: 'num ntc-col-opening' }, money(r.openingPrincipalCents)),
      h('td', { class: 'num' }, money(r.principalCents)),
      h('td', { class: 'num' }, money(r.interestCents)),
      h('td', { class: 'num ntc-strong' }, money(r.totalCents)),
      h('td', { class: 'num' }, money(r.closingPrincipalCents)));
  }

  function yearRows(year) {
    return App.record.revisedSchedule.map((r, i) => ({ r, i })).filter(({ r }) => r.date.startsWith(year));
  }
  const scheduleYears = () => [...new Set(App.record.revisedSchedule.map((r) => r.date.slice(0, 4)))];

  function yearTable(year, rows) {
    return h('table', { class: 'data-table ntc-table ntc-sched-table' },
      h('caption', { class: 'sr-only' }, k('schedule.yearCaption', { year: App.fmt.date(`${year}-01-01`, 'year') })),
      scheduleHead(true),
      h('tbody', null, rows.map((x) => scheduleRow(x, 'screen'))));
  }

  function yearCards(rows) {
    return h('ol', { class: 'ntc-rows', role: 'list' }, rows.map(({ r, i }) => {
      const postponed = isPostponed(i);
      return h('li', { class: ['ntc-row', postponed ? 'is-postponed' : null], dataset: { row: String(i + 1) } },
        h('p', { class: 'ntc-row-head' },
          h('span', { class: 'ntc-row-date' }, date(r.date)),
          h('span', { class: 'ntc-row-no' }, k('schedule.paymentN', { n: num(i + 1) })),
          postponed ? postponedTag() : null),
        h('dl', { class: 'ntc-row-dl' },
          pair(col('principal'), money(r.principalCents)),
          pair(col('interest'), money(r.interestCents)),
          pair(col('total'), money(r.totalCents), 'is-total'),
          pair(col('closing'), money(r.closingPrincipalCents))));
    }));
  }

  // Wide data table and narrow stacked rows; a container query shows the one that fits.
  const dual = (wide, narrow, cls) => h('div', { class: ['ntc-dual', cls] }, h('div', { class: 'ntc-wide' }, wide), h('div', { class: 'ntc-narrow' }, narrow));

  function yearBlocks() {
    const st = state();
    const years = scheduleYears();
    if (!st.years) st.years = { [years[0]]: true };
    const allOpen = () => years.every((y) => st.years[y]);
    let toggleAll = null;
    // The label itself says what the button will do, so no aria-pressed (it would double-signal).
    const sync = () => {
      if (!toggleAll) return;
      const lbl = toggleAll.querySelector('.btn-label');
      if (lbl) lbl.textContent = allOpen() ? k('schedule.collapseAll') : k('schedule.expandAll');
      toggleAll.dataset.all = allOpen() ? 'open' : 'closed';
    };
    const discs = years.map((y) => {
      const rows = yearRows(y);
      const first = rows[0].r.date;
      const last = rows[rows.length - 1].r.date;
      const range = rows.length === 1 ? date(first, 'month') : k('schedule.yearRange', { from: date(first, 'month'), to: date(last, 'month') });
      return App.ui.disclosure({
        summary: [
          h('span', { class: 'ntc-year' }, App.fmt.date(`${y}-01-01`, 'year')),
          h('span', { class: 'ntc-year-meta' }, `${plural(`${NS}.schedule.yearCount`, rows.length)} · ${range}`),
        ],
        content: () => dual(yearTable(y, rows), yearCards(rows)),
        open: !!st.years[y],
        fid: `ntc-year-${y}`,
        className: 'ntc-year-disc',
        onToggle: (open) => { st.years[y] = open; sync(); },
      });
    });
    const block = h('div', { class: 'ntc-years' }, discs);
    toggleAll = App.ui.button({
      label: allOpen() ? k('schedule.collapseAll') : k('schedule.expandAll'),
      kind: 'chip',
      iconName: 'chevronDown',
      fid: 'ntc-years-toggle',
      className: 'ntc-years-toggle',
      attrs: { 'data-all': allOpen() ? 'open' : 'closed' },
      onClick: () => {
        const open = !allOpen();
        block.querySelectorAll(':scope > .disclosure > .disclosure-toggle').forEach((btn) => {
          if ((btn.getAttribute('aria-expanded') === 'true') !== open) btn.click();
        });
        sync();
      },
    });
    return [h('div', { class: 'ntc-sub-row' }, h('h4', { class: 'ntc-sub' }, k('schedule.byYearTitle')), toggleAll), block];
  }

  function fullScheduleTable() {
    const years = scheduleYears();
    return h('table', { class: 'ntc-p-table ntc-p-sched' },
      scheduleHead(true),
      years.map((y) => h('tbody', null,
        h('tr', { class: 'ntc-p-yearrow' }, h('th', { scope: 'colgroup', colspan: 7 }, App.fmt.date(`${y}-01-01`, 'year'))),
        yearRows(y).map((x) => scheduleRow(x, 'print')))));
  }

  function totalsRows() {
    const R = App.record;
    const d = R.derived;
    return [
      ['payments', num(d.originalPaymentCount), num(d.revisedPaymentCount)],
      ['final', date(R.change.originalMaturity), date(R.change.revisedMaturity)],
      ['principal', money(R.loan.principalAtScheduleStartCents), money(R.loan.principalAtScheduleStartCents)],
      ['interest', money(d.originalTotalInterestCents), money(d.revisedTotalInterestCents)],
      ['total', money(d.originalTotalPaymentsCents), money(d.revisedTotalPaymentsCents)],
    ];
  }

  function totalsTable(mode) {
    return h('table', { class: mode === 'print' ? 'ntc-p-table ntc-p-totals' : 'data-table ntc-table ntc-totals-table' },
      h('caption', { class: 'sr-only' }, k('schedule.totalsTitle')),
      h('thead', null, h('tr', null,
        h('th', { scope: 'col' }, k('schedule.totals.item')),
        h('th', { scope: 'col', class: 'num' }, t('common.original')),
        h('th', { scope: 'col', class: 'num' }, t('common.revised')))),
      h('tbody', null, totalsRows().map(([key, a, b]) => h('tr', { dataset: { total: key } },
        h('th', { scope: 'row' }, k(`schedule.totals.${key}`)),
        h('td', { class: 'num' }, a),
        h('td', { class: 'num ntc-strong' }, b)))));
  }

  function totalsList() {
    return h('dl', { class: 'ntc-tot-list' }, totalsRows().map(([key, a, b]) => h('div', { class: 'ntc-tot-row', dataset: { total: key } },
      h('dt', null, k(`schedule.totals.${key}`)),
      h('dd', null,
        h('span', { class: 'ntc-tot-val' }, h('span', { class: 'ntc-tot-k' }, t('common.original')), ' ', h('span', { class: 'ntc-tot-v' }, a)),
        ' ',
        h('span', { class: 'ntc-tot-val ntc-tot-val--rev' }, h('span', { class: 'ntc-tot-k' }, t('common.revised')), ' ', h('span', { class: 'ntc-tot-v' }, b))))));
  }

  function scheduleBody(p, mode) {
    const out = [para('text.schedule.p1', p, mode)];
    if (mode === 'print') {
      out.push(h('p', { class: 'ntc-p-small' }, t('common.illustrativeNote'), ' ', t('common.amountsInCAD')));
      out.push(h('h4', null, k('schedule.first4Title')), first4Table('print'));
      out.push(h('h4', null, k('print.scheduleTitle', { count: p.count })), fullScheduleTable());
      out.push(h('h4', null, k('schedule.totalsTitle')), totalsTable('print'));
      return out;
    }
    out.push(App.ui.demoNote({ className: 'ntc-demo-note' }));
    out.push(h('h4', { class: 'ntc-sub' }, k('schedule.first4Title')));
    out.push(dual(first4Table('screen'), first4Cards(), 'ntc-first4'));
    out.push(...yearBlocks());
    out.push(h('h4', { class: 'ntc-sub' }, k('schedule.totalsTitle')));
    out.push(dual(totalsTable('screen'), totalsList(), 'ntc-totals'));
    out.push(h('div', { class: 'ntc-inline-dl' }, App.ui.button({
      label: k('schedule.downloadInline'),
      kind: 'secondary',
      iconName: 'download',
      fid: 'ntc-dl-inline',
      onClick: () => doExport('revised'),
    })));
    return out;
  }

  /* ---------- clause tools: explain, ask, plain-language place ---------- */
  function plainLink(id, target, labelKey, ariaKey, fid) {
    const route = App.router.parse(target);
    return App.ui.routeLink({
      label: k(labelKey),
      target,
      originCtx: { kind: 'clause', id },
      fid,
      ariaLabel: k(ariaKey, { topic: splitTitle(id).name }),
      focus: route.item ? 'item' : 'heading',
    });
  }

  const plainParts = (L) => (typeof L.plain === 'function' ? L.plain() : L.plain);

  function tools(id) {
    const L = LINKED[id];
    if (!L) return null;
    const ctx = { kind: 'clause', id, topic: L.topic };
    const links = [];
    if (L.plain) links.push(plainLink(id, App.router.href(...plainParts(L)), 'links.plain', 'links.plainAria', `ntc-plain-${id}`));
    if (L.relief) links.push(plainLink(id, App.router.href(...L.relief), 'links.relief', 'links.reliefAria', `ntc-relief-${id}`));
    if (L.help) {
      links.push(App.ui.routeLink({ label: k('links.help'), target: App.router.href('help'), originCtx: ctx, fid: `ntc-help-${id}`, focus: 'heading' }));
    }
    return h('div', { class: 'ntc-tools', role: 'group', 'aria-label': k('links.toolsLabel', { topic: splitTitle(id).name }) },
      h('div', { class: 'ntc-tools-ai' }, App.ui.explainButton(ctx), App.ui.askButton(ctx)),
      h('div', { class: 'ntc-tools-links' }, links));
  }

  function clauseSection(id, p, mode) {
    const T = splitTitle(id);
    const title = T.n ? [h('span', { class: 'ntc-num' }, `${T.n}.`), ' ', h('span', { class: 'ntc-clause-name' }, T.name)] : T.full;
    if (mode === 'print') {
      return h('section', { class: ['ntc-p-clause', PRINT_KEEP.includes(id) ? 'print-clause' : null], dataset: { clause: id } },
        h('h3', null, title),
        BODY[id](p, 'print'));
    }
    const titleId = `clause-${id}-title`;
    return h('section', {
      id: `clause-${id}`,
      class: ['ntc-clause', `ntc-clause--${id}`],
      tabindex: '-1',
      'aria-labelledby': titleId,
      dataset: { clause: id },
    },
    h('h3', { id: titleId, class: 'ntc-clause-title' }, title),
    h('div', { class: 'ntc-clause-body' }, BODY[id](p, 'screen')),
    tools(id));
  }

  /* ---------- the letter ---------- */
  function letter(p) {
    const R = App.record;
    return h('article', { class: 'ntc-doc', 'aria-label': k('letter.aria') },
      h('header', { class: 'ntc-lh' },
        logoEl('ntc-logo'),
        h('div', { class: 'ntc-lh-text' },
          h('p', { class: 'ntc-lh-title' }, k('letter.lhTitle')),
          h('p', { class: 'ntc-lh-sub' }, k('letter.lhSub')))),
      h('dl', { class: 'ntc-letter-meta' },
        pair(k('letter.date'), date(R.issueDate)),
        pair(k('letter.notice'), R.noticeId, 'ntc-id'),
        pair(k('letter.loan'), R.loan.id, 'ntc-id')),
      h('div', { class: 'ntc-addressee' },
        h('span', { class: 'ntc-addr-label' }, k('letter.to')),
        h('span', { class: 'ntc-addr-name' }, App.rec.clientName()),
        h('span', { class: 'ntc-addr-company' }, R.client.company)),
      h('h2', { class: 'ntc-re', id: 'ntc-re' }, keepIds(k('letter.re', { loan: R.loan.id }))),
      h('div', { class: 'ntc-clauses' }, App.CLAUSES.map((id) => clauseSection(id, p, 'screen'))),
      h('footer', { class: 'ntc-doc-foot' },
        h('p', { class: 'ntc-doc-foot-title' }, k('letter.closingTitle')),
        h('p', null, k('letter.closing'))));
  }

  /* ---------- rail: metadata, actions, contents ---------- */
  function metaRows() {
    const R = App.record;
    // [key, value, value class, wide] - wide rows span both columns of the compact phone grid.
    return [
      ['noticeId', R.noticeId, 'ntc-id', true],
      ['recordVersion', R.recordVersion],
      ['issueDate', date(R.issueDate)],
      ['effectiveDate', date(R.effectiveDate)],
      ['loanId', R.loan.id, 'ntc-id'],
      ['client', App.rec.clientName()],
      ['company', R.client.company],
      ['amendmentStatus', k('meta.amendmentStatusValue'), null, true],
      ['acceptance', R.change.acceptanceRequired ? k('meta.yes') : k('meta.no')],
      ['fee', money(R.change.feeCents)],
      ['processing', k('meta.processingValue'), null, true],
    ];
  }

  function metaCard() {
    return h('section', { class: ['card', 'ntc-card', 'ntc-meta'], 'aria-labelledby': 'ntc-meta-title' },
      h('h2', { class: 'ntc-card-title', id: 'ntc-meta-title' }, k('meta.title')),
      h('dl', { class: 'ntc-meta-list' }, metaRows().map(([key, value, cls, wide]) => h('div', { class: ['ntc-meta-row', wide ? 'is-wide' : null], dataset: { meta: key } },
        h('dt', null, k(`meta.${key}`)),
        h('dd', { class: cls || null }, value)))));
  }

  let statusEl = null;
  function dlButton(kind, label, sub, fid) {
    return h('li', null, h('button', { type: 'button', class: 'ntc-dl', fid, dataset: { export: kind }, on: { click: () => doExport(kind) } },
      h('span', { class: 'ntc-dl-icon', 'aria-hidden': 'true' }, App.ui.icon('download', { size: 18 })),
      h('span', { class: 'ntc-dl-text' }, h('span', { class: 'ntc-dl-label' }, label), ' ', h('span', { class: 'ntc-dl-sub' }, sub))));
  }

  function actionsCard() {
    const R = App.record;
    statusEl = h('p', { class: 'ntc-dl-status' });
    return h('section', { class: ['card', 'ntc-card', 'ntc-actions'], 'aria-labelledby': 'ntc-actions-title' },
      h('h2', { class: 'ntc-card-title', id: 'ntc-actions-title' }, k('actions.title')),
      h('p', { class: 'ntc-card-intro' }, k('actions.intro')),
      App.ui.button({ label: k('actions.print'), kind: 'primary', iconName: 'print', fid: 'ntc-print', className: 'ntc-print-btn', onClick: () => printNotice() }),
      h('ul', { class: 'ntc-dl-list' },
        dlButton('revised', k('actions.revisedCsv'), k('actions.paymentsSub', { count: num(R.revisedSchedule.length) }), 'ntc-dl-revised'),
        dlButton('original', k('actions.originalCsv'), k('actions.paymentsSub', { count: num(R.originalSchedule.length) }), 'ntc-dl-original'),
        dlButton('json', k('actions.recordJson'), k('actions.recordJsonSub'), 'ntc-dl-json')),
      statusEl,
      h('p', { class: 'ntc-pdf-note' }, App.ui.icon('info', { size: 16 }), h('span', null, k('actions.pdfNote'))));
  }

  // Matches the CSS breakpoint where the rail sits beside the notice.
  const isWide = () => (window.matchMedia ? window.matchMedia('(min-width: 960px)').matches : window.innerWidth >= 960);

  function tocCard(current) {
    const st = state();
    const open = st.toc === null ? isWide() : st.toc;
    const listId = 'ntc-toc-list';
    const listEl = h('ol', { class: 'ntc-toc-list', id: listId, hidden: !open }, App.CLAUSES.map((id) => {
      const T = splitTitle(id);
      const href = App.router.href('documents', id);
      const active = id === current;
      return h('li', null, h('a', {
        href,
        class: ['ntc-toc-link', active ? 'is-current' : null],
        fid: `ntc-toc-${id}`,
        'aria-current': active ? 'location' : null,
        on: { click: (e) => { e.preventDefault(); App.router.go(href, { focus: 'item' }); } },
      }, h('span', { class: 'ntc-toc-num' }, T.n ? `${T.n}.` : ''), ' ', h('span', { class: 'ntc-toc-name' }, T.name)));
    }));
    const btn = h('button', {
      type: 'button',
      class: 'ntc-toc-toggle',
      fid: 'ntc-toc-toggle',
      'aria-expanded': String(open),
      'aria-controls': listId,
      on: {
        click: () => {
          const now = btn.getAttribute('aria-expanded') !== 'true';
          btn.setAttribute('aria-expanded', String(now));
          listEl.hidden = !now;
          st.toc = now;
        },
      },
    }, h('span', null, k('toc.title')), App.ui.icon('chevronDown', { class: 'ntc-toc-chevron' }));
    return h('nav', { class: ['card', 'ntc-card', 'ntc-toc'], 'aria-labelledby': 'ntc-toc-title' },
      h('h2', { class: 'ntc-card-title ntc-toc-title', id: 'ntc-toc-title' }, btn),
      listEl);
  }

  function statusLine() {
    return h('p', { class: 'ntc-status' },
      App.ui.icon('info', { size: 16 }),
      h('span', { class: 'ntc-status-text' },
        h('span', { class: 'ntc-status-label' }, k('status.label')), ' ',
        h('span', { class: 'ntc-status-value' }, statusPhrase())));
  }

  /* ---------- exports (generated locally) ---------- */
  function csvCell(v) {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",;\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function scheduleCsv(revised) {
    const R = App.record;
    const d = R.derived;
    const rows = revised ? R.revisedSchedule : R.originalSchedule;
    const headers = tv(`${NS}.csv.headers`);
    const lines = [
      [k('csv.noticeId'), R.noticeId],
      [k('csv.recordVersion'), R.recordVersion],
      [k('csv.status'), statusPhrase()],
      [k('csv.loanId'), R.loan.id],
      [k('csv.company'), R.client.company],
      [k('csv.schedule'), k(revised ? 'csv.revised' : 'csv.original')],
      [k('csv.issueDate'), R.issueDate],
      [k('csv.effectiveDate'), R.effectiveDate],
      [k('csv.currency'), R.loan.currency],
      [k('csv.payments'), rows.length],
      [k('csv.source'), k('csv.sourceValue')],
      [k('csv.note')],
      [],
      Array.isArray(headers) ? headers : [],
      ...rows.map((r, i) => [r.date, i + 1, dec(r.openingPrincipalCents), dec(r.principalCents), dec(r.interestCents), dec(r.totalCents), dec(r.closingPrincipalCents)]),
      [k('csv.totals'), '', '',
        dec(R.loan.principalAtScheduleStartCents),
        dec(revised ? d.revisedTotalInterestCents : d.originalTotalInterestCents),
        dec(revised ? d.revisedTotalPaymentsCents : d.originalTotalPaymentsCents),
        ''],
    ];
    return `﻿${lines.map((l) => l.map(csvCell).join(',')).join('\r\n')}\r\n`;
  }

  function recordJson() {
    const R = App.record;
    const keys = ['schemaVersion', 'status', 'noticeId', 'recordVersion', 'issueDate', 'effectiveDate', 'locale', 'client', 'loan', 'change', 'assumptions', 'derived', 'originalSchedule', 'revisedSchedule'];
    const record = {};
    keys.forEach((key) => { if (R[key] !== undefined) record[key] = R[key]; });
    return JSON.stringify({ note: k('json.note'), statusText: statusPhrase(), exportLocale: loc(), generatedLocally: true, record }, null, 2);
  }

  function exportSpec(kind) {
    const R = App.record;
    if (kind === 'json') return { name: `${R.noticeId}_record.json`, mime: 'application/json', content: recordJson(), id: 'record-json' };
    const revised = kind === 'revised';
    return {
      name: `${R.noticeId}_${revised ? 'revised' : 'original'}-schedule_${loc()}.csv`,
      mime: 'text/csv;charset=utf-8',
      content: scheduleCsv(revised),
      id: revised ? 'revised-full' : 'original-full',
    };
  }

  function doExport(kind) {
    const spec = exportSpec(kind);
    App.util.downloadBlob(spec.name, spec.mime, spec.content);
    App.events.log('schedule_exported', { id: spec.id });
    const msg = k('actions.downloaded', { file: spec.name });
    if (statusEl && statusEl.isConnected) statusEl.textContent = msg;
    App.announce(msg);
  }

  /* ---------- print layout ---------- */
  function metaTable() {
    return h('table', { class: 'ntc-p-table ntc-p-kv' },
      h('tbody', null,
        h('tr', null, h('th', { scope: 'row' }, k('status.label')), h('td', null, statusPhrase())),
        metaRows().map(([key, value]) => h('tr', null, h('th', { scope: 'row' }, k(`meta.${key}`)), h('td', null, value)))));
  }

  /** Clear root and render the clean black-on-white notice for the current locale. */
  function prepare(root, opts = {}) {
    if (!root) return null;
    const l = loc();
    if (!opts.force && root.getAttribute('data-ntc-locale') === l && root.firstChild) return root;
    App.util.clear(root);
    root.setAttribute('data-ntc-locale', l);
    root.setAttribute('lang', l);
    const R = App.record;
    const p = params();
    root.appendChild(h('article', { class: 'ntc-print' },
      h('header', { class: 'ntc-p-head' },
        logoEl('ntc-p-logo', true),
        h('div', { class: 'ntc-p-headtext' },
          h('h1', { class: 'ntc-p-title' }, k('print.title')),
          h('p', { class: 'ntc-p-subtitle' }, k('print.subtitle')))),
      h('p', { class: 'ntc-p-banner' }, t('shell.banner')),
      h('section', { class: 'ntc-p-meta print-clause' }, h('h2', null, k('meta.title')), metaTable()),
      h('section', { class: 'ntc-p-letter' },
        h('div', { class: 'ntc-p-address' },
          h('p', null, h('strong', null, k('print.dateLabel')), ' ', date(R.issueDate)),
          h('p', null, h('strong', null, k('print.toLabel')), ' ', `${App.rec.clientName()}, ${R.client.company}`)),
        h('h2', { class: 'ntc-p-re' }, k('letter.re', { loan: R.loan.id })),
        App.CLAUSES.map((id) => clauseSection(id, p, 'print'))),
      h('section', { class: 'ntc-p-end print-clause' },
        h('p', null, k('letter.closing')),
        h('p', { class: 'ntc-p-note' }, k('actions.pdfNote'))),
      h('footer', { class: 'ntc-p-foot' }, k('print.footer', { notice: R.noticeId, version: R.recordVersion, language: k('print.language') }))));
    return root;
  }

  function printNotice() {
    const root = document.getElementById('print-root');
    prepare(root);
    App.announce(k('actions.printOpening'));
    const open = () => { try { window.print(); } catch (e) { /* printing unavailable */ } };
    const img = root && root.querySelector('img');
    if (img && !img.complete && img.decode) {
      let done = false;
      const fire = () => { if (!done) { done = true; open(); } };
      img.decode().then(fire, fire);
      setTimeout(fire, 400);
    } else {
      open();
    }
  }

  /* ---------- target clause: highlight and scroll ---------- */
  function flash(el) {
    el.classList.add('ntc-clause--flash');
    if (App.util.prefersReducedMotion()) el.classList.add('ntc-clause--static');
    setTimeout(() => el.classList.remove('ntc-clause--flash', 'ntc-clause--static'), 2600);
  }

  // After the router's own frame (which may scroll to top for typed URLs / first load).
  const afterRouter = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));

  function render(el, route, opts = {}) {
    const current = route.item && App.CLAUSES.includes(route.item) ? route.item : null;
    const p = params();
    const doc = letter(p);
    el.appendChild(h('div', { class: 'ntc-view', dataset: { clause: current || null } },
      App.ui.backControl(),
      App.ui.sectionHeader({ overline: k('overline'), title: k('title'), intro: k('intro'), extra: statusLine() }),
      h('div', { class: 'ntc-layout' },
        // Actions first so "Print / Save as PDF" is visible on arrival; the record details follow.
        h('div', { class: 'ntc-rail' }, actionsCard(), metaCard(), tocCard(current)),
        doc)));
    const settled = opts.rerender || opts.restore;
    if (current) {
      const itemEl = doc.querySelector(`#clause-${current}`);
      if (!settled) flash(itemEl);
      // The router only scrolls to items for in-app navigation; first loads and typed URLs land here.
      if (!settled && (opts.initial || opts.browser)) {
        afterRouter(() => {
          if (!itemEl.isConnected) return;
          itemEl.scrollIntoView({ block: 'start' });
          App.util.focusEl(itemEl, { preventScroll: true });
        });
      }
      return { itemEl };
    }
    if (route.item && !settled) {
      // Unknown clause: show the notice from the top.
      afterRouter(() => {
        window.scrollTo(0, 0);
        if (!opts.initial) App.router.focusHeading();
      });
    }
    return {};
  }

  App.router.registerView('documents', { render });

  App.print = Object.assign(App.print || {}, { prepare });
  App.notice = {
    clauses: App.CLAUSES,
    href: (id) => App.router.href('documents', id),
    plainTarget: (id) => (LINKED[id] && LINKED[id].plain ? App.router.href(...plainParts(LINKED[id])) : null),
  };
})();
