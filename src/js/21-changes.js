/* What changed (view "changes", namespace "changes", class prefix chg-).
 * Level 1: before/after cards for each changed term, what the change means
 * for the principal still owing, the 12,000 vs 11,920 reconciliation and the
 * unchanged terms. Level 2/3: a detail view per card (#/changes/<cardId>)
 * with the breakdown, plain-language definitions, the related explanation and
 * contextual actions (Explain with AI, Ask about this, notice clause, month).
 * Every value is read from App.record and formatted with App.fmt; nothing
 * here computes a new financial fact. */
(() => {
  const NS = 'changes';
  const k = (key, params) => t(`${NS}.${key}`, params);

  // Per-card wiring: query topic hint, formal clause and the month to open in Payments.
  // month: index into the revised schedule ('last' = final revised payment).
  const META = {
    principal: { topic: 'payment', clause: 'postponement', month: 0 },
    interest: { topic: 'interest', clause: 'interest', month: 1 },
    'next-payment': { topic: 'payment', clause: 'postponement', month: 0 },
    maturity: { topic: 'maturity', clause: 'maturity', month: 'last' },
    fees: { topic: 'understanding', clause: 'unchanged', month: 0 },
    rate: { topic: 'understanding', clause: 'unchanged', month: 1 },
    debt: { topic: 'understanding', clause: 'cost', month: 3 },
  };

  /* ---------- formatting helpers (display only) ---------- */
  const money = (cents) => App.fmt.money(cents);
  const whole = (cents) => App.fmt.money(cents, { compact: true });
  const signed = (cents, compact = false) => App.fmt.money(cents, { signed: true, compact });
  // A non-breaking space keeps day and month together ("28 février", "February 28");
  // the year may still wrap onto the next line in narrow cells.
  const date = (iso, style = 'long') => App.fmt.date(iso, style).replace(' ', '\u00a0');
  const monthId = (iso) => String(iso).slice(0, 7);
  const cap = (s) => (s ? s.charAt(0).toLocaleUpperCase(App.i18n.locale) + s.slice(1) : s);
  const period = (n) => t(`common.months.${n === 1 ? 'one' : 'other'}`, { n: App.fmt.number(n) }).replace(/ /g, '\u00a0');
  function list(items) {
    try {
      return new Intl.ListFormat(App.i18n.locale, { style: 'long', type: 'conjunction' }).format(items);
    } catch (e) {
      return items.join(', ');
    }
  }

  /* ---------- record access ---------- */
  function facts() {
    const R = App.record;
    return { R, o: R.originalSchedule, r: R.revisedSchedule, d: R.derived, n: R.change.months, loan: R.loan, change: R.change };
  }

  // Formatted values shared by cards, blocks and details (re-read on every render so locale switches apply).
  function params(f) {
    const { o, r, d, n, loan, change } = f;
    const post = r.slice(0, n);
    return {
      months: list(post.map((x) => date(x.date, 'month'))),
      from: date(post[0].date, 'month'),
      to: date(post[n - 1].date, 'month'),
      fromY: date(post[0].date, 'monthYear'),
      toY: date(post[n - 1].date, 'monthYear'),
      period: period(n),
      n: App.fmt.number(n),
      monthly: whole(loan.monthlyPrincipalCents),
      interest: money(d.postponementMonthlyInterestCents),
      resume: date(change.resumePrincipalDate),
      first: money(d.firstResumedPaymentCents),
      deferred: whole(d.principalDeferredCents),
      relief: whole(d.nearTermPaymentReductionCents),
      extra: whole(d.additionalLifetimeInterestCents),
      extra3: whole(d.additionalInterestFirstThreeMonthsCents),
      origInt: whole(d.originalTotalInterestCents),
      revInt: whole(d.revisedTotalInterestCents),
      origTotal: whole(d.originalTotalPaymentsCents),
      revTotal: whole(d.revisedTotalPaymentsCents),
      origMaturity: date(change.originalMaturity),
      revMaturity: date(change.revisedMaturity),
      origCount: App.fmt.number(d.originalPaymentCount),
      revCount: App.fmt.number(d.revisedPaymentCount),
      rate: App.fmt.percentFromBp(loan.annualRateBasisPoints),
      fee: money(change.feeCents),
      opening: whole(r[0].openingPrincipalCents),
      principal: whole(loan.principalAtScheduleStartCents),
      origNear: money(d.originalNearTermPaymentsCents),
      revNear: money(d.revisedNearTermPaymentsCents),
      next: money(r[0].totalCents),
      nextDate: date(r[0].date),
      nextOriginal: money(o[0].totalCents),
    };
  }

  function monthFor(id, f) {
    const m = META[id].month;
    const row = m === 'last' ? f.r[f.r.length - 1] : f.r[m];
    return monthId(row.date);
  }

  const ctxFor = (id) => ({ kind: 'card', id, topic: META[id].topic });

  /* ---------- small building blocks ---------- */
  function cell(kind, label, ...children) {
    return h('div', { class: ['compare-cell', `compare-cell--${kind}`] }, h('span', { class: 'compare-label' }, label), children);
  }
  const value = (text, extraClass) => h('span', { class: ['chg-value', extraClass] }, text);
  const sub = (text) => h('span', { class: 'chg-sub' }, text);

  // Every before/after pair is a named group (caption id, or the card title by default).
  function compare(before, after, opts = {}) {
    return h('div', { class: ['compare', 'chg-compare', opts.same ? 'chg-compare--same' : null, opts.stack ? 'chg-compare--stack' : null], role: 'group', 'aria-labelledby': opts.labelledby || null }, before, after);
  }
  const titleIdFor = (id) => `chg-card-title-${id}`;

  function caption(text, id) {
    return h('p', { class: 'chg-caption', id }, text);
  }

  function owingBadge() {
    return h('span', { class: 'badge chg-badge-owing' }, App.ui.icon('info', { size: 14 }), k('badges.notReduced'));
  }

  function link(label, target, originCtx, fid) {
    return App.ui.routeLink({ label, target, originCtx, fid, focus: 'item' });
  }
  const costLink = (ctx, fid) => link(k('cards.interest.costLink'), App.router.href('payments', 'cost'), ctx, fid);
  const scheduleLink = (ctx, fid) => link(k('cards.maturity.scheduleLink'), App.router.href('payments', 'schedule'), ctx, fid);
  const reliefLink = (ctx, fid) => link(k('recon.reliefLink'), App.router.href('payments', 'relief'), ctx, fid);
  function monthLink(mid, ctx, fid) {
    return link(k('actions.seeMonth', { month: date(mid, 'monthYear') }), App.router.href('payments', mid), ctx, fid);
  }

  function detailLink(id) {
    const href = App.router.href(NS, id);
    const fid = `chg-detail-${id}`;
    return App.ui.button({
      label: t('common.seeTheDetail'),
      kind: 'secondary',
      iconAfter: 'arrowRight',
      fid,
      href,
      className: 'chg-detail-btn',
      ariaLabel: k('actions.seeDetailAria', { item: k(`cards.${id}.kicker`) }),
      onClick: (e) => {
        e.preventDefault();
        App.ui.goWithReturn(href, null, fid, 'item');
      },
    });
  }

  /* ---------- Level 1: change cards ---------- */
  const CARDS = {
    principal(p) {
      return {
        badges: [App.ui.badge('changed'), App.ui.badge('temporary')],
        title: k('cards.principal.title', { period: p.period }),
        body: compare(
          cell('before', t('common.before'), value(k('cards.principal.before', { amount: p.monthly })), sub(k('cards.principal.beforeSub'))),
          cell('after', t('common.after'), value(k('cards.principal.after', { zero: whole(0), months: p.months }), 'chg-value--text'), sub(k('cards.principal.afterSub', { amount: p.monthly, date: p.resume }))),
          { labelledby: titleIdFor('principal'), stack: true }),
        explain: k('cards.principal.explain'),
      };
    },
    interest(p, f) {
      const months = (sched) => h('dl', { class: 'chg-mini' }, sched.slice(0, f.n).map((x) => [
        h('dt', null, cap(date(x.date, 'monthShort'))),
        h('dd', null, money(x.interestCents)),
      ]));
      return {
        badges: [App.ui.badge('changed')],
        title: k('cards.interest.title'),
        body: [
          caption(k('cards.interest.monthly', { from: p.from, to: p.to }), 'chg-cap-interest-monthly'),
          compare(
            cell('before', t('common.before'), months(f.o)),
            cell('after', t('common.after'), months(f.r), sub(k('cards.interest.afterNote'))),
            { labelledby: 'chg-cap-interest-monthly' }),
          caption(k('cards.interest.total'), 'chg-cap-interest-total'),
          compare(
            cell('before', t('common.before'), value(p.origInt), sub(k('schedule.original'))),
            cell('after', t('common.after'), value(p.revInt), sub(k('schedule.revised'))),
            { labelledby: 'chg-cap-interest-total' }),
          h('p', { class: 'chg-diff' }, h('span', { class: 'chg-diff-label' }, t('common.difference')), h('strong', { class: 'chg-diff-value' }, signed(f.d.additionalLifetimeInterestCents, true))),
        ],
        explain: k('cards.interest.explain', { interest: p.interest, extra: p.extra }),
        links: costLink(ctxFor('interest'), 'chg-cost-interest'),
      };
    },
    'next-payment': function nextPayment(p, f) {
      const o0 = f.o[0];
      const r0 = App.rec.nextPayment();
      return {
        badges: [App.ui.badge('changed')],
        title: k('cards.next-payment.title', { amount: money(r0.totalCents), date: date(r0.date) }),
        body: compare(
          cell('before', t('common.before'), value(money(o0.totalCents)), sub(k('cards.next-payment.on', { date: date(o0.date) }))),
          cell('after', t('common.after'), value(money(r0.totalCents)), sub(k('cards.next-payment.on', { date: date(r0.date) }))),
          { labelledby: titleIdFor('next-payment') }),
        explain: k('cards.next-payment.explain', { date: p.resume, amount: p.first }),
      };
    },
    maturity(p, f) {
      return {
        badges: [App.ui.badge('later')],
        title: k('cards.maturity.title', { period: p.period }),
        body: compare(
          cell('before', t('common.before'), value(p.origMaturity), sub(k('cards.maturity.payments', { count: p.origCount }))),
          cell('after', t('common.after'), value(p.revMaturity), sub(k('cards.maturity.payments', { count: p.revCount })),
            h('span', { class: 'chg-shift' }, k('cards.maturity.shift', { period: p.period }))),
          { labelledby: titleIdFor('maturity') }),
        extra: h('div', { class: 'chg-card-tracks', role: 'group', 'aria-labelledby': 'chg-cap-maturity-tracks' },
          caption(k('detail.timeline.title'), 'chg-cap-maturity-tracks'), tracks(p, f, { compact: true })),
        explain: k('cards.maturity.explain', { count: p.revCount, original: p.origCount }),
        links: scheduleLink(ctxFor('maturity'), 'chg-schedule-maturity'),
      };
    },
    fees(p) {
      return {
        badges: [App.ui.badge('unchanged', k('badges.noFee'))],
        title: k('cards.fees.title'),
        body: compare(
          cell('before', t('common.before'), value(k('cards.fees.before'), 'chg-value--text'), sub(k('cards.fees.beforeSub'))),
          cell('after', t('common.after'), value(p.fee), sub(k('cards.fees.sub'))),
          { same: true, stack: true, labelledby: titleIdFor('fees') }),
        explain: k('cards.fees.explain'),
      };
    },
    rate(p) {
      const v = k('cards.rate.value', { rate: p.rate });
      return {
        badges: [App.ui.badge('unchanged')],
        title: k('cards.rate.title', { rate: p.rate }),
        body: compare(cell('before', t('common.before'), value(v)), cell('after', t('common.after'), value(v)), { same: true, labelledby: titleIdFor('rate') }),
        explain: k('cards.rate.explain'),
      };
    },
    debt(p, f) {
      const i = f.n; // first resumed payment: same date in both schedules
      return {
        className: 'chg-card--owing',
        badges: [owingBadge()],
        title: k('cards.debt.title'),
        body: [
          caption(k('cards.debt.caption', { date: date(f.r[i].date) }), 'chg-cap-debt'),
          compare(
            cell('before', t('common.before'), value(whole(f.o[i].openingPrincipalCents)), sub(k('schedule.original'))),
            cell('after', t('common.after'), value(whole(f.r[i].openingPrincipalCents)), sub(k('schedule.revised'))),
            { labelledby: 'chg-cap-debt' }),
          debtSteps(p),
        ],
        explain: k('cards.debt.explain', { deferred: p.deferred, date: p.revMaturity }),
      };
    },
  };

  function debtSteps(p) {
    const steps = tv(`${NS}.cards.debt.steps`) || [];
    const prm = { from: p.fromY, to: p.toY, opening: p.opening, resume: p.resume, monthly: p.monthly, date: p.revMaturity, period: p.period, deferred: p.deferred };
    return [
      caption(k('cards.debt.stepsTitle'), 'chg-cap-debt-steps'),
      h('ol', { class: 'chg-flow', 'aria-labelledby': 'chg-cap-debt-steps' }, steps.map((_, i) => h('li', { class: 'chg-flow-step' },
        h('span', { class: 'chg-flow-when' }, cap(k(`cards.debt.steps.${i}.when`, prm))),
        h('span', { class: 'chg-flow-text' }, k(`cards.debt.steps.${i}.text`, prm))))),
    ];
  }

  function changeCard(id, p, f) {
    const def = CARDS[id](p, f);
    const ctx = ctxFor(id);
    const titleId = titleIdFor(id);
    return h('article', { class: ['card', 'chg-card', `chg-card--${id}`, def.className], dataset: { card: id }, 'aria-labelledby': titleId },
      h('div', { class: 'chg-card-head' },
        h('p', { class: 'card-kicker' }, k(`cards.${id}.kicker`)),
        h('div', { class: 'chg-badges' }, def.badges)),
      h('h3', { class: 'card-title chg-card-title', id: titleId }, def.title),
      def.body,
      def.extra || null,
      h('p', { class: 'chg-explain' }, def.explain),
      h('div', { class: 'chg-card-foot' },
        h('div', { class: 'chg-actions' }, detailLink(id), App.ui.explainButton(ctx), App.ui.askButton(ctx)),
        h('div', { class: 'chg-links' }, App.ui.noticeLink(META[id].clause, ctx), def.links || null)));
  }

  /* ---------- Level 1: explanation blocks ---------- */
  function glance(p) {
    const item = (iconName, key, prm) => h('li', { class: 'chg-glance-item' },
      h('span', { class: 'chg-glance-icon' }, App.ui.icon(iconName, { size: 22 })),
      h('span', { class: 'chg-glance-body' },
        h('span', { class: 'chg-glance-label' }, k(`glance.${key}.label`)),
        h('span', { class: 'chg-glance-text' }, k(`glance.${key}.text`, prm))));
    return h('section', { class: 'chg-glance on-dark', 'aria-labelledby': 'chg-glance-title' },
      h('h2', { class: 'chg-glance-title', id: 'chg-glance-title' }, k('glance.title')),
      h('ul', { class: 'chg-glance-list' },
        item('calendar', 'temporary', { months: p.months, interest: p.interest }),
        item('trend', 'tradeoff', { extra: p.extra, date: p.revMaturity }),
        item('cash', 'owing', { deferred: p.deferred })));
  }

  function eqRow(op, srOp, label, subText, amount, result) {
    return h('li', { class: ['chg-eq-row', result ? 'chg-eq-row--result' : null] },
      h('span', { class: 'chg-eq-op', 'aria-hidden': 'true' }, op),
      h('span', { class: 'chg-eq-text' },
        srOp ? App.ui.srOnly(`${srOp} `) : null,
        h('span', { class: 'chg-eq-label' }, label),
        h('span', { class: 'chg-eq-sub' }, subText)),
      h('span', { class: 'chg-eq-amount' }, amount));
  }

  /** "Why 11,920 and not 12,000?" - fixture-derived reconciliation (12,000 − 80 = 11,920). */
  function reconciliation(p, f, opts = {}) {
    const sfx = opts.suffix || '';
    const titleId = `chg-recon-title${sfx}`;
    const capId = `chg-recon-cap${sfx}`;
    const range = { from: p.from, to: p.to };
    return h('section', { class: ['card', 'chg-recon'], 'aria-labelledby': titleId },
      h('div', { class: 'chg-card-head' }, h('p', { class: 'card-kicker' }, k('recon.kicker'))),
      h('h3', { class: 'card-title chg-card-title', id: titleId }, k('recon.title', { relief: p.relief, deferred: p.deferred })),
      h('p', { class: 'chg-recon-intro' }, k('recon.intro', { ...range, relief: p.relief, deferred: p.deferred })),
      h('ol', { class: 'chg-eq' },
        eqRow('', null, k('recon.deferred'), k('recon.deferredSub'), p.deferred),
        eqRow('−', k('recon.minus'), k('recon.extra'), k('recon.extraSub'), p.extra3),
        eqRow('=', k('recon.equals'), k('recon.relief', range), k('recon.reliefSub'), p.relief, true)),
      caption(k('recon.payments', range), capId),
      compare(
        cell('before', t('common.before'), value(p.origNear), sub(k('schedule.original'))),
        cell('after', t('common.after'), value(p.revNear), sub(k('schedule.revised'))),
        { labelledby: capId }),
      h('div', { class: 'callout callout--neutral chg-recon-note' }, App.ui.icon('info'), h('p', null, k('recon.note', { extra3: p.extra3, extra: p.extra }))),
      h('p', { class: 'chg-fine' }, k('recon.sameAmount', { ...range, revised: p.revNear, extra: p.extra })),
      h('div', { class: 'chg-card-foot' },
        h('div', { class: 'chg-actions' }, App.ui.explainButton({ kind: 'summary', id: 'relief', period: '3' }, { fid: `chg-explain-relief${sfx}` })),
        h('div', { class: 'chg-links' }, reliefLink(opts.originCtx || null, `chg-relief-recon${sfx}`))));
  }

  function unchangedTerms(p, f) {
    const items = [
      ['rate', { rate: p.rate }],
      ['basis'],
      ['instalment', { amount: p.monthly }],
      ['interestPaid'],
      ['currency', { code: f.loan.currency }],
      ['loanId', { id: f.loan.id }],
    ];
    const row = (label, val) => h('li', { class: 'chg-term' },
      h('span', { class: 'chg-term-icon' }, App.ui.icon('check', { size: 18 })),
      h('span', { class: 'chg-term-body' }, h('span', { class: 'chg-term-label' }, label), h('span', { class: 'chg-term-value' }, val)));
    return h('section', { class: ['card', 'chg-unchanged'], 'aria-labelledby': 'chg-unchanged-title' },
      h('div', { class: 'chg-unchanged-head' },
        h('div', { class: 'chg-unchanged-heading' },
          h('h3', { class: 'card-title chg-card-title', id: 'chg-unchanged-title' }, k('unchanged.title')),
          h('p', { class: 'chg-muted-intro' }, k('unchanged.intro'))),
        App.ui.badge('unchanged')),
      h('ul', { class: 'chg-terms' },
        items.map(([key, prm]) => row(k(`unchanged.${key}.label`), k(`unchanged.${key}.value`, prm))),
        row(k('unchanged.acceptance.label'), k(f.change.acceptanceRequired ? 'unchanged.acceptance.required' : 'unchanged.acceptance.value'))),
      h('div', { class: 'chg-links' }, App.ui.noticeLink('unchanged', null, { fid: 'chg-unchanged-notice' })));
  }

  function nextStep(f) {
    return h('section', { class: 'chg-next', 'aria-labelledby': 'chg-next-title' },
      h('div', { class: 'chg-next-body' },
        h('h2', { class: 'chg-next-title', id: 'chg-next-title' }, k('next.title')),
        h('p', null, App.ui.rich(k(f.change.acceptanceRequired ? 'next.textRequired' : 'next.text')))),
      h('div', { class: 'chg-links chg-links--stack' },
        link(k('next.schedule'), App.router.href('payments', 'schedule'), null, 'chg-next-schedule'),
        App.ui.noticeLink('action', null, { label: k('next.notice'), fid: 'chg-next-notice' })));
  }

  function group(key, prm, ...content) {
    const id = `chg-group-${key}`;
    return h('section', { class: ['chg-group', `chg-group--${key}`], 'aria-labelledby': id },
      h('div', { class: 'chg-group-head' },
        h('h2', { class: 'chg-group-title', id }, k(`groups.${key}.title`)),
        h('p', null, k(`groups.${key}.intro`, prm))),
      content);
  }

  // A "Back to…" entry pointing at this list (left over after a tab click from a
  // detail) would be a no-op on the list itself, so it is not shown.
  function listBackControl() {
    const top = App.router.backTop();
    if (top && App.router.parse(top.from).hash === App.router.href(NS)) return null;
    return App.ui.backControl();
  }

  function renderList(el) {
    const f = facts();
    const p = params(f);
    const card = (id) => changeCard(id, p, f);
    el.appendChild(h('div', { class: 'chg-view' },
      listBackControl(),
      App.ui.sectionHeader({ overline: k('overline'), title: k('title'), intro: App.ui.rich(k('intro', { months: p.months })) }),
      App.ui.demoNote({ className: 'chg-demo-note' }),
      glance(p),
      group('changed', null, h('div', { class: 'chg-grid' }, card('principal'), card('next-payment'), card('interest'), card('maturity'))),
      group('owing', { period: p.period }, h('div', { class: 'chg-grid chg-grid--owing' }, card('debt'), reconciliation(p, f))),
      group('same', null, h('div', { class: 'chg-grid' }, card('fees'), card('rate')), unchangedTerms(p, f)),
      nextStep(f)));
  }

  /* ---------- Level 2: detail building blocks ---------- */

  /** Stacked, labelled month card comparing the original and revised payment. */
  function monthCard(mid, f, opts = {}) {
    const c = App.rec.month(mid);
    if (!c) return null;
    const ri = c.revised ? f.r.findIndex((x) => x.date === c.revised.date) : -1;
    const badges = [];
    if (ri >= 0 && ri < f.n) badges.push(App.ui.badge('temporary', k('detail.month.postponed')));
    else if (ri === f.n) badges.push(App.ui.badge('changed', k('detail.month.resumes')));
    if (c.original && c.original.date === f.change.originalMaturity) badges.push(h('span', { class: 'badge chg-badge-neutral' }, k('detail.month.finalOriginal')));
    if (ri === f.r.length - 1) badges.push(App.ui.badge('later', k('detail.month.finalRevised')));
    else if (!c.original && ri >= 0) badges.push(App.ui.badge('later', k('detail.month.added')));

    const rows = [['principal', 'principalCents'], ['interest', 'interestCents'], ['total', 'totalCents']];
    const valCell = (row, field, cls, label, em) => h('span', { class: ['chg-mcell', 'chg-mcell-v', cls, em ? 'is-em' : null] },
      h('span', { class: 'chg-mtag' }, label),
      row ? money(row[field]) : h('span', { class: 'chg-none' }, k('detail.month.none')));
    const titleId = `chg-month-${opts.cardId}-${mid}`;
    return h('article', { class: ['chg-month', ri >= 0 && ri < f.n ? 'chg-month--postponed' : null], dataset: { month: mid }, 'aria-labelledby': titleId },
      h('div', { class: 'chg-month-head' },
        h('div', { class: 'chg-month-heading' },
          h('h3', { class: 'chg-month-title', id: titleId }, cap(date(mid, 'monthYear'))),
          h('p', { class: 'chg-month-date' }, k('detail.month.paymentOn', { date: date(c.date) }))),
        badges.length ? h('div', { class: 'chg-badges' }, badges) : null),
      h('div', { class: 'chg-mgrid' },
        h('span', { class: 'chg-mh', 'aria-hidden': 'true' }),
        h('span', { class: 'chg-mh chg-mcell-v', 'aria-hidden': 'true' }, t('common.original')),
        h('span', { class: 'chg-mh chg-mcell-v', 'aria-hidden': 'true' }, t('common.revised')),
        rows.map(([key, field]) => {
          const em = opts.emphasis === key;
          return [
            h('span', { class: ['chg-mcell', 'chg-mcell-label', em ? 'is-em' : null] }, t(`common.${key}`)),
            valCell(c.original, field, 'chg-mcell-orig', t('common.original'), em),
            valCell(c.revised, field, 'chg-mcell-rev', t('common.revised'), em),
          ];
        })),
      h('dl', { class: 'chg-month-foot' },
        c.original ? h('div', { class: 'chg-month-stat' }, h('dt', null, k('detail.month.totalChange')), h('dd', null, signed(c.differenceCents))) : null,
        opts.showInterestChange ? h('div', { class: 'chg-month-stat' }, h('dt', null, k('detail.month.interestChange')), h('dd', null, signed(c.interestDifferenceCents))) : null),
      !c.original ? h('p', { class: 'chg-fine' }, k('detail.month.noneNote')) : null,
      h('div', { class: 'chg-month-link' }, monthLink(mid, ctxFor(opts.cardId), `chg-mlink-${opts.cardId}-${mid}`)));
  }

  function monthGrid(ids, f, opts) {
    return h('div', { class: ['chg-months', ids.length === 1 ? 'chg-months--single' : null] }, ids.map((mid) => monthCard(mid, f, opts)));
  }

  function interestTotals(p, f) {
    const tile = (label, val, cls) => h('div', { class: ['chg-total', cls] }, h('dt', null, label), h('dd', null, val));
    return h('section', { class: 'chg-subblock', 'aria-labelledby': 'chg-int-totals' },
      h('h3', { class: 'chg-subtitle', id: 'chg-int-totals' }, k('detail.interestTotals.title')),
      h('dl', { class: 'chg-totals' },
        tile(k('schedule.original'), p.origInt, 'chg-total--orig'),
        tile(k('schedule.revised'), p.revInt, 'chg-total--rev'),
        tile(k('detail.interestTotals.additional'), signed(f.d.additionalLifetimeInterestCents, true), 'chg-total--diff')),
      h('p', null, k('detail.interestTotals.sum', { from: p.from, to: p.to, extra3: p.extra3 })),
      h('p', { class: 'chg-fine' }, k('detail.interestTotals.within', { extra3: p.extra3, extra: p.extra })));
  }

  function upcoming(p, f) {
    const rows = f.r.slice(0, f.n + 1);
    return h('section', { class: 'chg-subblock', 'aria-labelledby': 'chg-upcoming' },
      h('h3', { class: 'chg-subtitle', id: 'chg-upcoming' }, k('detail.upcoming.title')),
      h('ol', { class: 'chg-steps' }, rows.map((row, i) => h('li', { class: ['chg-step', i === 0 ? 'is-next' : null, row.principalCents > 0 ? 'is-resume' : null] },
        h('span', { class: 'chg-step-dot', 'aria-hidden': 'true' }),
        h('span', { class: 'chg-step-body' },
          h('span', { class: 'chg-step-date' }, date(row.date)),
          h('span', { class: 'chg-step-kind' }, k(row.principalCents > 0 ? 'detail.upcoming.principalAndInterest' : 'detail.upcoming.interestOnly')),
          h('span', { class: 'chg-step-orig' }, k('detail.upcoming.originalWas', { amount: money(f.o[i].totalCents) }))),
        h('span', { class: 'chg-step-amount' }, money(row.totalCents))))));
  }

  /** Two proportional tracks: original vs revised schedule length (display proportion only). */
  function tracks(p, f, opts = {}) {
    const total = f.d.revisedPaymentCount;
    const pct = (count) => `${((count / total) * 100).toFixed(2)}%`;
    const added = f.d.revisedPaymentCount - f.d.originalPaymentCount;
    const start = date(f.r[0].date, 'monthYearShort');
    return [
      h('div', { class: ['chg-track', opts.compact ? 'chg-track--compact' : null] },
        h('p', { class: 'chg-track-label' }, k('detail.timeline.original', { count: p.origCount, from: start, to: date(f.change.originalMaturity, 'monthYearShort') })),
        h('div', { class: 'chg-track-rail', 'aria-hidden': 'true' }, h('span', { class: 'chg-track-fill chg-track-fill--orig', style: { width: pct(f.d.originalPaymentCount) } }))),
      h('div', { class: ['chg-track', opts.compact ? 'chg-track--compact' : null] },
        h('p', { class: 'chg-track-label' }, k('detail.timeline.revised', { count: p.revCount, from: start, to: date(f.change.revisedMaturity, 'monthYearShort') })),
        h('div', { class: 'chg-track-rail', 'aria-hidden': 'true' },
          h('span', { class: 'chg-track-fill chg-track-fill--rev', style: { width: '100%' } }),
          h('span', { class: 'chg-track-added', style: { width: pct(added) } })),
        opts.compact ? null : h('p', { class: 'chg-track-note' }, h('span', { class: 'chg-shift' }, k('detail.timeline.added', { period: p.period })))),
    ];
  }

  function timeline(p, f) {
    return h('section', { class: 'chg-subblock chg-timeline', 'aria-labelledby': 'chg-timeline' },
      h('h3', { class: 'chg-subtitle', id: 'chg-timeline' }, k('detail.timeline.title')),
      tracks(p, f));
  }

  function feesBreakdown(p, f) {
    const row = (label, val) => [h('dt', null, label), h('dd', null, val)];
    return h('dl', { class: 'kv chg-kv' },
      row(k('detail.fees.fee'), p.fee),
      row(k('detail.fees.extra'), signed(f.d.additionalLifetimeInterestCents, true)),
      row(k('detail.fees.totalOriginal'), p.origTotal),
      row(k('detail.fees.totalRevised'), p.revTotal));
  }

  function rateBreakdown(p, f) {
    const i = 1; // second payment: first month where the two schedules' interest differ
    const ex = (row, kind, label) => cell(kind, label,
      h('span', { class: 'chg-calc' }, k('detail.rate.example', { opening: whole(row.openingPrincipalCents), rate: p.rate, interest: money(row.interestCents) })));
    const monthName = cap(date(f.r[i].date, 'monthYear'));
    return [
      h('p', { class: 'chg-formula' }, k('detail.rate.formula', { rate: p.rate })),
      caption(monthName, 'chg-cap-rate'),
      compare(ex(f.o[i], 'before', k('schedule.original')), ex(f.r[i], 'after', k('schedule.revised')), { labelledby: 'chg-cap-rate' }),
      h('p', null, k('detail.rate.why', { month: date(f.r[i].date, 'month'), revised: money(f.r[i].interestCents), original: money(f.o[i].interestCents), prev: date(f.r[i - 1].date, 'month') })),
      h('p', { class: 'chg-fine' }, k('detail.rate.rounding')),
    ];
  }

  function balanceCards(p, f) {
    const { o, r, n, loan } = f;
    const scale = loan.principalAtScheduleStartCents;
    const lastO = o[o.length - 1];
    const lastR = r[r.length - 1];
    const sameMonth = App.rec.month(monthId(lastO.date));
    const revAtOrigEnd = sameMonth && sameMonth.revised ? sameMonth.revised.closingPrincipalCents : null;
    const points = [
      { key: 'start', date: r[0].date, orig: o[0].openingPrincipalCents, rev: r[0].openingPrincipalCents, note: k('detail.balance.startNote') },
      { key: 'resume', date: r[n].date, orig: o[n].openingPrincipalCents, rev: r[n].openingPrincipalCents, note: k('detail.balance.resumeNote', { amount: p.deferred }), em: true },
      { key: 'originalEnd', date: lastO.date, orig: lastO.closingPrincipalCents, rev: revAtOrigEnd, note: k('detail.balance.originalEndNote', { amount: whole(revAtOrigEnd || 0) }) },
      { key: 'revisedEnd', date: lastR.date, orig: null, origText: k('detail.balance.repaidOn', { date: date(lastO.date) }), rev: lastR.closingPrincipalCents, note: k('detail.balance.revisedEndNote') },
    ];
    const bar = (label, cents, kind, altText) => h('div', { class: ['chg-bal-row', cents === null ? 'chg-bal-row--text' : null] },
      h('span', { class: 'chg-bal-label' }, label),
      h('span', { class: ['chg-bal-amount', cents === null ? 'chg-bal-amount--text' : null] }, cents === null ? altText : whole(cents)),
      cents === null ? null : h('span', { class: 'chg-bar', 'aria-hidden': 'true' },
        h('span', { class: ['chg-bar-fill', `chg-bar-fill--${kind}`], style: { width: `${Math.max(0, Math.min(100, (cents / scale) * 100)).toFixed(2)}%` } })));
    return [
      h('div', { class: 'chg-balances' }, points.map((pt) => h('article', { class: ['chg-bal', pt.em ? 'chg-bal--em' : null], dataset: { point: pt.key }, 'aria-labelledby': `chg-bal-${pt.key}` },
        h('h3', { class: 'chg-bal-title', id: `chg-bal-${pt.key}` }, k(`detail.balance.${pt.key}`, { date: date(pt.date) })),
        bar(k('schedule.original'), pt.orig, 'orig', pt.origText),
        bar(k('schedule.revised'), pt.rev, 'rev'),
        h('p', { class: 'chg-bal-note' }, pt.note)))),
      h('p', { class: 'chg-fine' }, k('detail.balance.scale', { amount: p.principal })),
    ];
  }

  function relatedBody(id, prm) {
    const body = tv(`${NS}.detail.related.${id}.body`) || [];
    return body.map((_, i) => k(`detail.related.${id}.body.${i}`, prm));
  }

  /* Per-card detail definitions: title/intro params, breakdown, related explanation and extra links. */
  const DETAILS = {
    principal(p, f, ctx) {
      const ids = f.r.slice(0, f.n + 1).map((x) => monthId(x.date));
      return {
        badges: [App.ui.badge('changed'), App.ui.badge('temporary')],
        title: { period: p.period },
        intro: { from: p.fromY, to: p.toY, amount: p.monthly, date: p.resume },
        breakdownIntro: k('detail.monthsIntro'),
        breakdown: monthGrid(ids, f, { cardId: 'principal', emphasis: 'principal' }),
        related: relatedBody('principal', { count: p.n, monthly: p.monthly, deferred: p.deferred, from: p.from, to: p.to, relief: p.relief, interest: p.interest }),
        relatedExtra: reconciliation(p, f, { suffix: '-detail', originCtx: ctx }),
      };
    },
    interest(p, f, ctx) {
      const ids = f.r.slice(0, f.n + 1).map((x) => monthId(x.date));
      return {
        badges: [App.ui.badge('changed')],
        title: {},
        intro: { interest: p.interest, original: p.origInt, revised: p.revInt },
        breakdownIntro: k('detail.monthsIntro'),
        breakdown: [monthGrid(ids, f, { cardId: 'interest', emphasis: 'interest', showInterestChange: true }), interestTotals(p, f)],
        related: relatedBody('interest', { monthly: p.monthly, opening: p.opening, resume: p.resume, interest: p.interest, from: p.from, to: p.to, extra3: p.extra3, extra: p.extra }),
        links: costLink(ctx, 'chg-cost-detail'),
      };
    },
    'next-payment': function nextPaymentDetail(p, f, ctx) {
      return {
        badges: [App.ui.badge('changed')],
        title: { amount: p.next, date: p.nextDate },
        intro: { original: p.nextOriginal },
        breakdown: [monthGrid([monthId(f.r[0].date)], f, { cardId: 'next-payment', emphasis: 'total' }), upcoming(p, f)],
        related: relatedBody('next-payment', { d2: date(f.r[1].date), d3: date(f.r[2].date), interest: p.interest, resume: p.resume, first: p.first }),
        links: reliefLink(ctx, 'chg-relief-detail'),
      };
    },
    maturity(p, f, ctx) {
      const ids = App.rec.months.slice(f.o.length - 1).map((c) => c.id);
      return {
        badges: [App.ui.badge('later')],
        title: { date: p.revMaturity },
        intro: { original: p.origMaturity, period: p.period, count: p.revCount, originalCount: p.origCount },
        breakdown: [timeline(p, f), monthGrid(ids, f, { cardId: 'maturity', emphasis: 'total' })],
        related: relatedBody('maturity', { monthly: p.monthly, resume: p.resume, firstDate: date(f.r[0].date), period: p.period, n: p.n, date: p.revMaturity }),
        links: scheduleLink(ctx, 'chg-schedule-detail'),
      };
    },
    fees(p, f, ctx) {
      return {
        badges: [App.ui.badge('unchanged', k('badges.noFee'))],
        title: {},
        intro: { fee: p.fee },
        breakdown: feesBreakdown(p, f),
        related: relatedBody('fees', { extra: p.extra, originalTotal: p.origTotal, revisedTotal: p.revTotal }),
        links: costLink(ctx, 'chg-cost-detail'),
      };
    },
    rate(p, f) {
      return {
        badges: [App.ui.badge('unchanged')],
        title: { rate: p.rate },
        intro: {},
        breakdown: rateBreakdown(p, f),
        related: relatedBody('rate', { rate: p.rate }),
      };
    },
    debt(p, f, ctx) {
      const i = f.n;
      return {
        badges: [owingBadge()],
        title: {},
        intro: { deferred: p.deferred },
        breakdown: balanceCards(p, f),
        relatedList: true,
        related: relatedBody('debt', {
          opening: p.opening, monthly: p.monthly, lastPostponed: date(f.r[i - 1].date), deferred: p.deferred,
          revisedOwing: whole(f.r[i].openingPrincipalCents), originalOwing: whole(f.o[i].openingPrincipalCents),
          resume: p.resume, date: p.revMaturity, period: p.period, extra: p.extra, principal: p.principal,
        }),
        relatedExtra: reconciliation(p, f, { suffix: '-detail', originCtx: ctx }),
      };
    },
  };

  function backNav(id) {
    const ctrl = App.ui.backControl();
    if (ctrl) {
      const top = App.router.backTop();
      const from = top ? App.router.parse(top.from) : null;
      if (!from || from.section !== NS || from.item) {
        ctrl.appendChild(App.ui.button({
          label: k('actions.allChanges'),
          kind: 'link',
          iconAfter: 'arrowRight',
          fid: 'chg-all-changes',
          href: App.router.href(NS),
          onClick: (e) => { e.preventDefault(); App.router.go(App.router.href(NS), { focus: 'heading' }); },
        }));
      }
      return ctrl;
    }
    return h('nav', { class: 'back-nav', 'aria-label': t('common.breadcrumb') },
      App.ui.button({
        label: t('common.backTo', { place: t(`nav.${NS}`) }),
        kind: 'secondary',
        iconName: 'arrowLeft',
        fid: 'chg-back-list',
        className: 'btn-back',
        href: App.router.href(NS),
        onClick: (e) => { e.preventDefault(); App.router.go(App.router.href(NS), { focus: `chg-detail-${id}` }); },
      }));
  }

  function otherNav(current) {
    return h('nav', { class: 'chg-other', 'aria-labelledby': 'chg-other-title' },
      h('h2', { class: 'chg-other-title', id: 'chg-other-title' }, k('actions.otherTitle')),
      h('ul', { class: 'chg-other-list' }, App.CHANGE_CARDS.filter((c) => c !== current).map((c) => h('li', null, App.ui.button({
        label: k(`cards.${c}.kicker`),
        kind: 'chip',
        iconAfter: 'arrowRight',
        fid: `chg-other-${c}`,
        href: App.router.href(NS, c),
        onClick: (e) => { e.preventDefault(); App.router.go(App.router.href(NS, c), { focus: 'item' }); },
      })))));
  }

  function renderDetail(el, id) {
    const f = facts();
    const p = params(f);
    const ctx = ctxFor(id);
    const D = DETAILS[id](p, f, ctx);
    const header = App.ui.sectionHeader({
      overline: k(`cards.${id}.kicker`),
      title: k(`detail.titles.${id}`, D.title),
      intro: k(`detail.intros.${id}`, D.intro),
      extra: h('div', { class: 'chg-badges chg-detail-badges' }, D.badges),
    });
    const heading = header.querySelector('h1');
    heading.id = 'chg-detail-title';
    heading.classList.add('chg-detail-heading');

    const mid = monthFor(id, f);
    const relatedTitle = k(`detail.related.${id}.title`);
    const related = h('section', { class: 'chg-detail-section chg-related', 'aria-labelledby': 'chg-related-title' },
      h('h2', { class: 'chg-section-title', id: 'chg-related-title' }, relatedTitle),
      D.relatedList
        ? h('ol', { class: 'chg-points' }, D.related.map((txt) => h('li', null, txt)))
        : D.related.map((txt) => h('p', null, txt)),
      D.relatedExtra || null);

    el.appendChild(h('div', { class: ['chg-view', 'chg-detail', `chg-detail--${id}`], dataset: { detail: id } },
      h('div', { class: 'chg-detail-top' }, backNav(id), header),
      App.ui.demoNote({ className: 'chg-demo-note' }),
      h('div', { class: 'chg-detail-layout' },
        h('div', { class: 'chg-detail-main' },
          h('section', { class: 'chg-detail-section chg-breakdown', 'aria-labelledby': 'chg-breakdown-title' },
            h('h2', { class: 'chg-section-title', id: 'chg-breakdown-title' }, k(`detail.breakdown.${id}`)),
            D.breakdownIntro ? h('p', { class: 'chg-muted-intro' }, D.breakdownIntro) : null,
            D.breakdown),
          related),
        h('div', { class: 'chg-detail-aside' },
          h('section', { class: ['card', 'chg-aside-card', 'chg-definition'], 'aria-labelledby': 'chg-definition-title' },
            h('h2', { class: 'chg-aside-title', id: 'chg-definition-title' }, k('detail.definitionTitle')),
            h('p', null, App.ui.rich(k(`detail.definitions.${id}`)))),
          h('section', { class: ['card', 'chg-aside-card', 'chg-actions-card'], 'aria-labelledby': 'chg-actions-title' },
            h('h2', { class: 'chg-aside-title', id: 'chg-actions-title' }, k('detail.actionsTitle')),
            h('p', { class: 'chg-muted-intro' }, k('detail.actionsIntro')),
            h('div', { class: 'chg-actions' }, App.ui.explainButton(ctx), App.ui.askButton(ctx)),
            h('div', { class: 'chg-links chg-links--stack' },
              App.ui.noticeLink(META[id].clause, ctx),
              monthLink(mid, ctx, `chg-month-${id}`),
              D.links || null)))),
      otherNav(id)));
    return { itemEl: heading };
  }

  App.router.registerView(NS, {
    render(el, route) {
      const id = route.item && App.CHANGE_CARDS.includes(route.item) ? route.item : null;
      if (id) return renderDetail(el, id);
      renderList(el);
      return {};
    },
  });
})();
