/* Overview: a human welcome, then the facts (PRD section 7, AC-05, AC-10).
 * Order: navy hero (greeting, headline, intro, CTAs, workshop illustration)
 * → four summary cards with the honest-cost facts beside them
 * → what you need to do + what stays the same → personalised explanation.
 * Every figure comes from App.record / App.rec and is formatted with App.fmt. */
(() => {
  const NS = 'overview';
  const k = (key) => `${NS}.${key}`;
  const R = App.record;
  const D = R.derived || {};

  const greetState = () => App.session.slice('overview', () => ({ greeted: false }));
  const reviewState = () => App.session.slice('review', () => ({ reviewed: false }));

  const money = (cents) => App.fmt.money(cents, { compact: true });
  // Canadian French writes the first day of a month as "1er" (Intl gives "1").
  function date(iso, style = 'long') {
    const s = App.fmt.date(iso, style);
    // fr-CA "1er" comes from App.fmt; keep the day with its month on one line
    return /^(long|medium|dayMonth|dayMonthShort)$/.test(style) ? s.replace(' ', '\u00a0') : s;
  }
  const monthName = (iso) => App.fmt.date(iso, 'month');

  /** Render a translated string, wrapping each occurrence of the given values
   * (already formatted amounts/dates) in an element made by `wrap`. */
  function emphasise(str, values, wrap = (v) => h('strong', { class: 'ov-em' }, v)) {
    let parts = [str];
    values.filter(Boolean).forEach((v) => {
      parts = parts.flatMap((p) => {
        if (typeof p !== 'string' || !p.includes(v)) return [p];
        const out = [];
        p.split(v).forEach((seg, i, arr) => {
          if (seg) out.push(seg);
          if (i < arr.length - 1) out.push(wrap(v));
        });
        return out;
      });
    });
    return parts;
  }

  const keepTogether = (v) => h('span', { class: 'nowrap' }, v);

  // A formatted date as a node kept on one line. The French ordinal "1er" gets a
  // superscript suffix so the upper-cased overline does not render it as "1ER".
  function dateNode(formatted) {
    const m = /^1er(\s[\s\S]*)$/.exec(formatted);
    return h('span', { class: 'nowrap' }, m ? ['1', h('sup', { class: 'ov-ord' }, 'er'), m[1]] : formatted);
  }

  const cardLabel = (id) => t(k(`cards.${id}.label`));

  /* ---------- Decorative graphics (inline SVG, hidden from assistive technology) ---------- */

  // Simple line-art handshake drawn for this notice (not a BDC mark).
  function handshake(play) {
    const p = (d) => svg('path', { d });
    return svg('svg', {
      class: ['ov-hs', play ? 'ov-hs--play' : null],
      viewBox: '0 0 64 64',
      width: 56,
      height: 56,
      'aria-hidden': 'true',
      focusable: 'false',
    },
    svg('circle', { class: 'ov-hs-halo', cx: 32, cy: 32, r: 31 }),
    svg('g', { transform: 'translate(4.5 4.5) scale(0.86)' },
      svg('g', { class: 'ov-hs-hands', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
        p('M5 22.5h6.5v17H5'),
        p('M59 22.5h-6.5v17H59'),
        p('M11.5 25.5l7.2-3.6c2.4-1.2 5.2-1.3 7.7-.3l4.6 1.9'),
        p('M52.5 25.5l-6.8-3.1c-2.3-1-4.9-1-7.1.1l-9.8 5c-1.9 1-2.5 3.4-1.3 5.1 1.1 1.6 3.3 2 4.9.9l4.6-3'),
        p('M37.1 30.5l9.2 8.3h6.2'),
        p('M11.5 36.5h3.7l6.9 6.2'),
        p('M22.1 42.7a2.6 2.6 0 0 0 3.7-3.7l-1.4-1.3'),
        p('M25.8 39l2.3 2.1a2.6 2.6 0 0 0 3.7-3.7l-2.6-2.4'),
        p('M31.8 37.4l1.6 1.5a2.6 2.6 0 0 0 3.7-3.7l-2.9-2.7'),
        p('M37.1 35.2l.9.8a2.6 2.6 0 0 0 3.6-3.7l-4.5-4'))));
  }

  // Labelled illustration of a manufacturing workshop (no people portrayed).
  function workshopIllustration() {
    const uid = App.util.uid('ov-ws');
    const id = (n) => `${uid}-${n}`;
    const g = (attrs, ...kids) => svg('g', attrs, ...kids);
    const rect = (x, y, w, hh, fill, extra = {}) => svg('rect', { x, y, width: w, height: hh, fill, ...extra });
    const line = (d, stroke, width, extra = {}) => svg('path', { d, stroke, 'stroke-width': width, 'stroke-linecap': 'round', fill: 'none', ...extra });
    const grad = (tag, name, attrs, stops) => svg(tag, { id: id(name), ...attrs }, stops.map(([o, c, op]) => svg('stop', { offset: o, 'stop-color': c, 'stop-opacity': op === undefined ? 1 : op })));
    // Cardboard carton with tape and a small white label
    const box = (x, y, w, hh, fill) => g(null,
      rect(x, y, w, hh, fill, { rx: 2 }),
      rect(x + w / 2 - 3, y, 6, hh, '#ecd5ab', { opacity: 0.55 }),
      rect(x + 5, y + hh - 11, Math.min(16, w - 10), 6, '#f4f5f7', { rx: 1, opacity: 0.9 }));
    const C1 = '#c79a64';
    const C2 = '#b9874f';
    const C3 = '#d6ad78';
    const shelfY = [128, 186, 244];
    const shelfBoxes = [
      [[26, 26, 30, C1], [54, 32, 30, C2], [90, 22, 24, C3], [114, 18, 20, C1]],
      [[26, 30, 34, C3], [58, 26, 26, C1], [86, 46, 36, C2]],
      [[26, 38, 40, C2], [66, 28, 28, C3], [96, 36, 32, C1]],
    ];
    const shelfItems = [];
    shelfBoxes.forEach((row, i) => row.forEach(([x, w, hh, c]) => shelfItems.push(box(x, shelfY[i] - hh, w, hh, c))));
    const pegDots = [];
    for (let i = 0; i < 8; i += 1) for (let j = 0; j < 3; j += 1) pegDots.push(svg('circle', { cx: 268 + i * 20, cy: 146 + j * 25, r: 1.6, fill: '#4c6d8a' }));

    return svg('svg', { class: 'ov-illus-svg', viewBox: '0 0 520 326', 'aria-hidden': 'true', focusable: 'false' },
      svg('defs', null,
        grad('linearGradient', 'wall', { x1: 0, y1: 0, x2: 0, y2: 1 }, [[0, '#2d4964'], [1, '#213a51']]),
        grad('linearGradient', 'floor', { x1: 0, y1: 0, x2: 0, y2: 1 }, [[0, '#1c3245'], [1, '#132534']]),
        grad('linearGradient', 'cone', { x1: 0, y1: 0, x2: 0, y2: 1 }, [[0, '#ffd98f', 0.45], [1, '#ffd98f', 0.04]]),
        grad('radialGradient', 'glow', { cx: 0.5, cy: 0.5, r: 0.5 }, [[0, '#ffe3a3', 0.9], [1, '#ffe3a3', 0]]),
        grad('radialGradient', 'wash', { cx: 0.5, cy: 0.5, r: 0.5 }, [[0, '#ffcf7a', 0.22], [1, '#ffcf7a', 0]]),
        grad('linearGradient', 'window', { x1: 0, y1: 0, x2: 1, y2: 1 }, [[0, '#5d84a6'], [1, '#3f6385']])),
      // Room
      rect(0, 0, 520, 296, `url(#${id('wall')})`),
      svg('ellipse', { cx: 336, cy: 190, rx: 150, ry: 106, fill: `url(#${id('wash')})` }),
      rect(0, 296, 520, 30, `url(#${id('floor')})`),
      rect(0, 294, 520, 3, '#35536f'),
      // Window
      g(null,
        rect(168, 24, 112, 80, '#1a2f42', { rx: 4 }),
        rect(173, 29, 102, 70, `url(#${id('window')})`, { rx: 2 }),
        line('M224 29v70M173 64h102', '#1a2f42', 4, { 'stroke-linecap': 'butt' }),
        line('M182 56l16-18M190 60l12-14M236 94l22-26', '#9cc0dd', 3, { opacity: 0.45 })),
      // Warm light from the pendant lamp over the workbench
      svg('polygon', { points: '318,78 354,78 440,296 234,296', fill: `url(#${id('cone')})` }),
      // Shelving with inventory
      g(null,
        rect(18, 70, 6, 226, '#8a9bab'), rect(136, 70, 6, 226, '#8a9bab'),
        rect(18, 70, 124, 5, '#a3b2bf'),
        shelfY.map((y) => rect(18, y, 124, 5, '#a3b2bf')),
        shelfItems,
        svg('circle', { cx: 42, cy: 58, r: 12, fill: '#6f8ba3' }), svg('circle', { cx: 42, cy: 58, r: 4, fill: '#2d4964' }),
        svg('circle', { cx: 70, cy: 60, r: 10, fill: '#8aa3b8' }), svg('circle', { cx: 70, cy: 60, r: 3.5, fill: '#2d4964' }),
        rect(88, 50, 44, 20, C3, { rx: 2 })),
      // Pegboard with hand tools
      g(null,
        rect(254, 132, 164, 78, '#34536e', { rx: 4 }),
        pegDots,
        line('M274 148v44', '#c9d0d7', 6),
        svg('path', { d: 'M267 146a7 7 0 0 0 14 0l-4-4h-6z', fill: '#c9d0d7' }),
        line('M304 152v42', '#b07a43', 6),
        rect(292, 142, 24, 11, '#c9d0d7', { rx: 2 }),
        svg('path', { d: 'M330 148h40l-6 24h-34z', fill: '#c9d0d7' }), rect(370, 146, 14, 12, '#b07a43', { rx: 3 }),
        line('M398 144l-6 46M404 144l6 46', '#c9d0d7', 5)),
      // Pendant lamps
      line('M336 0v58', '#0f1f2c', 2),
      svg('circle', { cx: 336, cy: 80, r: 34, fill: `url(#${id('glow')})` }),
      svg('path', { d: 'M318 78l6-18h24l6 18z', fill: '#e9eef2' }),
      svg('circle', { cx: 336, cy: 79, r: 5, fill: '#fff4d6' }),
      line('M80 0v22', '#0f1f2c', 2),
      svg('circle', { cx: 80, cy: 36, r: 20, fill: `url(#${id('glow')})`, opacity: 0.7 }),
      svg('path', { d: 'M68 34l4-12h16l4 12z', fill: '#e9eef2' }),
      // Floor shadows
      svg('ellipse', { cx: 336, cy: 300, rx: 108, ry: 7, fill: '#0e1c28', opacity: 0.55 }),
      svg('ellipse', { cx: 478, cy: 300, rx: 38, ry: 5, fill: '#0e1c28', opacity: 0.55 }),
      svg('ellipse', { cx: 192, cy: 300, rx: 46, ry: 5, fill: '#0e1c28', opacity: 0.55 }),
      // Workbench
      g(null,
        rect(236, 226, 200, 13, '#b98245', { rx: 2 }),
        rect(236, 239, 200, 6, '#8e5f30'),
        rect(248, 245, 10, 52, '#6b4a2a'), rect(414, 245, 10, 52, '#6b4a2a'),
        rect(248, 272, 176, 6, '#7d5631'),
        box(264, 250, 34, 22, C1), box(304, 254, 28, 18, C3),
        rect(248, 212, 30, 14, '#8a9bab', { rx: 2 }), rect(254, 204, 18, 8, '#a3b2bf', { rx: 1 }),
        line('M242 219h42', '#c9d0d7', 3),
        g({ transform: 'rotate(-8 334 216)' }, rect(314, 206, 44, 18, '#0f1f2c', { rx: 3 }), rect(317, 209, 38, 12, '#2b59ff', { rx: 1.5, opacity: 0.9 })),
        svg('circle', { cx: 378, cy: 220, r: 6, fill: 'none', stroke: '#c9d0d7', 'stroke-width': 3 }),
        rect(392, 214, 34, 12, '#d9dee3', { rx: 6 })),
      // Drill press
      g(null,
        rect(446, 288, 66, 10, '#5c7890', { rx: 2 }),
        rect(472, 138, 9, 152, '#8a9bab'),
        rect(455, 224, 44, 6, '#a3b2bf', { rx: 2 }),
        rect(452, 132, 50, 38, '#6f8ba3', { rx: 7 }),
        rect(460, 120, 34, 14, '#5c7890', { rx: 5 }),
        rect(474, 170, 5, 22, '#c9d0d7'),
        svg('path', { d: 'M471 192h11l-5.5 9z', fill: '#c9d0d7' }),
        line('M504 152l11-9M504 152l12 6M504 152l1 13', '#c9d0d7', 2.5),
        svg('circle', { cx: 504, cy: 152, r: 3.5, fill: '#c9d0d7' }),
        svg('circle', { cx: 462, cy: 151, r: 3, fill: '#7fa0ff' })),
      // Pallet with stacked cartons (the seasonal inventory build)
      g(null,
        rect(148, 286, 90, 6, '#9c6b3a'),
        rect(152, 292, 10, 5, '#7d5631'), rect(188, 292, 10, 5, '#7d5631'), rect(224, 292, 10, 5, '#7d5631'),
        box(150, 248, 44, 38, C1), box(196, 252, 40, 34, C3),
        box(160, 218, 42, 30, C2), box(204, 228, 28, 24, C1)));
  }

  /* ---------- Navigation helpers ---------- */

  function scrollToMedia() {
    const heading = document.getElementById('ov-media-title');
    const section = document.getElementById('ov-media');
    if (!heading || !section) return;
    section.scrollIntoView({ block: 'start', behavior: App.util.prefersReducedMotion() ? 'auto' : 'smooth' });
    App.util.focusEl(heading, { preventScroll: true });
  }

  function askQuestion(trigger) {
    if (App.query && typeof App.query.open === 'function') {
      App.query.open({ kind: 'general', section: 'overview', fid: 'overview-cta-ask' }, trigger);
      return;
    }
    // Query module not in this build: fall back to the Help section's question route.
    App.ui.goWithReturn(App.router.href('help', 'ask'), null, 'overview-cta-ask', 'item');
  }

  /* ---------- Sections ---------- */

  function hero() {
    const play = !greetState().greeted && !App.util.prefersReducedMotion();
    greetState().greeted = true; // the greeting motion plays once per session

    const ctas = h('div', { class: 'ov-cta-row' },
      App.ui.button({
        label: t(k('cta.changes')),
        kind: 'primary',
        iconAfter: 'arrowRight',
        fid: 'overview-cta-changes',
        className: 'ov-cta-primary',
        href: App.router.href('changes'),
        onClick: (e) => { e.preventDefault(); App.router.go(App.router.href('changes'), { focus: 'heading' }); },
      }),
      App.ui.button({
        label: t(k('cta.watch')),
        kind: 'ghost-light',
        iconName: 'play',
        fid: 'overview-cta-watch',
        className: 'ov-cta-watch',
        onClick: () => scrollToMedia(),
      }),
      App.ui.button({
        label: t(k('cta.ask')),
        kind: 'link',
        iconName: 'chat',
        fid: 'overview-cta-ask',
        className: 'ov-cta-ask',
        onClick: (e) => askQuestion(e.currentTarget),
      }));

    return h('div', { class: 'hero on-dark ov-hero' },
      h('div', { class: 'ov-hero-main' },
        h('p', { class: 'ov-greeting' },
          h('span', { class: 'ov-hs-wrap' }, handshake(play)),
          h('span', { class: 'ov-greeting-text' }, t(k('greeting'), { name: R.client.givenName }))),
        App.ui.sectionHeader({
          overline: (() => {
            const effective = date(R.effectiveDate);
            // One inline wrapper: the overline is a flex row (accent rule + text).
            return h('span', { class: 'ov-overline-text' }, emphasise(t(k('overline'), { date: effective }), [effective], dateNode));
          })(),
          title: t(k('title')),
          intro: App.ui.rich(t(k('intro'), { company: R.client.company })),
        }),
        ctas),
      h('figure', { class: 'ov-illus' },
        h('div', { class: 'ov-illus-frame' }, workshopIllustration()),
        h('figcaption', { class: 'ov-illus-caption' }, t(k('illustration.caption')))));
  }

  const CARD_ICONS = { 'next-payment': 'calendar', resume: 'clock', relief: 'cash', 'extra-interest': 'trend' };

  function cardModel(id) {
    const next = App.rec.nextPayment();
    const resumed = App.rec.firstResumed();
    const post = App.rec.postponementMonths();
    switch (id) {
      case 'next-payment':
        return {
          target: App.router.href('payments', next.date.slice(0, 7)),
          figure: money(next.totalCents),
          sub: t(k('cards.next-payment.sub'), { date: date(next.date) }),
          subValue: date(next.date),
          note: next.principalCents === 0 ? t(k('cards.next-payment.note')) : null,
        };
      case 'resume':
        return {
          target: App.router.href('payments', R.change.resumePrincipalDate.slice(0, 7)),
          figure: date(R.change.resumePrincipalDate),
          figureClass: 'ov-figure--date',
          note: t(k('cards.resume.note'), { total: money(D.firstResumedPaymentCents), principal: money(resumed.principalCents), interest: money(D.firstResumedInterestCents) }),
          noteValues: [money(D.firstResumedPaymentCents)],
        };
      case 'relief': {
        const amount = money(D.nearTermPaymentReductionCents);
        return {
          target: App.router.href('payments', 'relief'),
          figureText: t(k('cards.relief.figure'), { amount }),
          figure: amount,
          sub: t(k('cards.relief.sub'), { from: monthName(post[0].date), to: monthName(post[post.length - 1].date) }),
          badge: 'temporary',
          rows: [
            [t(k('cards.relief.original')), money(D.originalNearTermPaymentsCents), 'original'],
            [t(k('cards.relief.revised')), money(D.revisedNearTermPaymentsCents), 'revised'],
          ],
        };
      }
      case 'extra-interest':
        return {
          target: App.router.href('payments', 'cost'),
          figure: money(D.additionalLifetimeInterestCents),
          sub: t(k('cards.extra-interest.sub')),
          rows: [
            [t(k('cards.extra-interest.original')), money(D.originalTotalInterestCents), 'original'],
            [t(k('cards.extra-interest.revised')), money(D.revisedTotalInterestCents), 'revised'],
          ],
        };
      default:
        return null;
    }
  }

  function summaryCard(id) {
    const m = cardModel(id);
    if (!m) return null;
    const ctx = { kind: 'summary', id };
    const detailFid = `summary-${id}-detail`;
    const titleId = `ov-card-${id}-title`;
    const figureNodes = m.figureText
      ? emphasise(m.figureText, [m.figure], (v) => h('span', { class: 'ov-figure-num' }, v))
      : [h('span', { class: 'ov-figure-num' }, m.figure)];
    return h('article', { class: ['card', 'ov-card', `ov-card--${id}`], 'aria-labelledby': titleId, dataset: { card: id } },
      h('div', { class: 'ov-card-head' },
        h('span', { class: 'ov-card-icon', 'aria-hidden': 'true' }, App.ui.icon(CARD_ICONS[id], { size: 20 })),
        h('h3', { class: 'ov-card-label', id: titleId }, cardLabel(id)),
        m.badge ? App.ui.badge(m.badge) : null),
      h('p', { class: ['ov-figure', m.figureClass] }, figureNodes),
      m.sub ? h('p', { class: 'ov-card-sub' }, m.subValue ? emphasise(m.sub, [m.subValue]) : m.sub) : null,
      m.note ? h('p', { class: 'ov-card-note' }, m.noteValues ? emphasise(m.note, m.noteValues) : m.note) : null,
      m.rows ? h('dl', { class: 'ov-mini' }, m.rows.map(([label, value, kind]) => h('div', { class: ['ov-mini-row', `ov-mini-row--${kind}`] },
        h('dt', null, h('span', { class: 'ov-mini-swatch', 'aria-hidden': 'true' }), label),
        h('dd', { class: 'money' }, value)))) : null,
      h('div', { class: 'ov-card-actions' },
        App.ui.button({
          label: t(k('summary.seeDetail')),
          kind: 'link',
          iconAfter: 'arrowRight',
          fid: detailFid,
          className: 'ov-detail-link',
          // Named from this card's own label (the shared item label hard-codes a date).
          ariaLabel: t(k('summary.seeDetailAria'), { item: cardLabel(id) }),
          href: m.target,
          onClick: (e) => { e.preventDefault(); App.ui.goWithReturn(m.target, ctx, detailFid, 'item'); },
        }),
        App.ui.explainButton(ctx, { fid: `explain-summary-${id}`, ariaLabel: t(k('summary.explainAria'), { item: cardLabel(id) }) })));
  }

  function besideFacts() {
    const from = date(R.change.originalMaturity);
    const to = date(R.change.revisedMaturity);
    const deferred = money(D.principalDeferredCents);
    // Each fact links to its formal clause (Level 3) with a return path.
    const fact = (iconName, id, title, body, { badge, clause, ctx }) => h('div', { class: 'ov-fact', dataset: { fact: id } },
      h('span', { class: 'ov-fact-icon', 'aria-hidden': 'true' }, App.ui.icon(iconName, { size: 20 })),
      h('div', { class: 'ov-fact-body' },
        h('p', { class: 'ov-fact-title' }, App.ui.rich(title), badge || null),
        h('p', { class: 'ov-fact-text' }, body),
        App.ui.noticeLink(clause, ctx, { fid: `overview-fact-${id}-notice` })));
    // Essential cost disclosure (AC-05), so a labelled section rather than an aside.
    return h('section', { class: ['card', 'ov-beside'], 'aria-labelledby': 'ov-beside-title' },
      h('h3', { class: 'ov-beside-title', id: 'ov-beside-title' }, t(k('beside.title'))),
      fact('calendar', 'maturity', t(k('beside.maturityTitle')), emphasise(t(k('beside.maturityText'), { from, to }), [from, to]),
        { badge: App.ui.badge('later'), clause: 'maturity', ctx: { kind: 'card', id: 'maturity' } }),
      fact('info', 'owing', t(k('beside.owingTitle')), emphasise(t(k('beside.owingText'), { amount: deferred }), [deferred]),
        { clause: 'postponement', ctx: { kind: 'card', id: 'debt' } }),
      App.ui.demoNote({ className: 'ov-demo-note' }));
  }

  function summary() {
    return h('section', { class: 'ov-summary', 'aria-labelledby': 'ov-summary-title' },
      h('div', { class: 'ov-block-head' },
        h('h2', { id: 'ov-summary-title', class: 'ov-h2' }, t(k('summary.title'))),
        h('p', { class: 'ov-block-intro' }, t(k('summary.intro')))),
      h('div', { class: 'ov-summary-layout' },
        h('div', { class: 'ov-cards' }, App.SUMMARY_CARDS.map((id) => summaryCard(id))),
        besideFacts()));
  }

  function reviewArea() {
    const wrap = h('div', { class: 'ov-review' });
    const fill = () => {
      App.util.clear(wrap);
      if (reviewState().reviewed) {
        wrap.appendChild(h('p', { class: 'ov-reviewed', tabindex: '-1', fid: 'overview-reviewed-status' },
          App.ui.icon('check', { size: 20 }),
          h('span', null, h('strong', null, t(k('todo.reviewedTitle'))), ' ', t(k('todo.reviewedNote')))));
        return;
      }
      wrap.append(
        App.ui.button({
          label: t(k('todo.markReviewed')),
          kind: 'secondary',
          iconName: 'check',
          fid: 'overview-mark-reviewed',
          className: 'ov-mark-btn',
          attrs: { 'aria-describedby': 'ov-mark-hint' },
          onClick: () => {
            App.events.log('marked_reviewed', { id: R.noticeId });
            reviewState().reviewed = true;
            App.session.changed('review');
            fill();
            const status = wrap.querySelector('.ov-reviewed');
            if (status) App.util.focusEl(status, { preventScroll: true });
            App.announce(`${t(k('todo.reviewedTitle'))} ${t(k('todo.reviewedNote'))}`);
          },
        }),
        h('p', { class: 'ov-mark-hint', id: 'ov-mark-hint' }, t(k('todo.markHint'))));
    };
    fill();
    return wrap;
  }

  function todoCard() {
    const next = App.rec.nextPayment();
    const resumed = App.rec.firstResumed();
    const post = App.rec.postponementMonths();
    const scheduleTarget = App.router.href('documents', 'schedule');
    // Number + title share a row; the body sits under the title (indented on wider
    // screens, full width on phones so French text is not squeezed).
    const step = (n, title, ...body) => h('li', { class: 'ov-step' },
      h('div', { class: 'ov-step-head' },
        h('span', { class: 'ov-step-num', 'aria-hidden': 'true' }, String(n)),
        h('p', { class: 'ov-step-title' }, title)),
      h('div', { class: 'ov-step-body' }, body));
    return h('section', { class: ['card', 'ov-todo'], 'aria-labelledby': 'ov-todo-title' },
      h('h2', { id: 'ov-todo-title', class: 'ov-h2 ov-card-h2' }, t(k('todo.title'))),
      // role="list" keeps list semantics in Safari despite list-style: none
      h('ol', { class: 'ov-steps', role: 'list' },
        step(1, t(k('todo.step1Title')),
          h('p', { class: 'ov-step-text' }, emphasise(t(k('todo.step1Text'), { date: date(next.date) }), [date(next.date)], keepTogether)),
          App.ui.routeLink({
            label: t(k('todo.step1Link')),
            target: scheduleTarget,
            fid: 'overview-open-schedule',
            focus: 'item',
          })),
        step(2, App.ui.rich(t(k('todo.step2Title'))),
          h('p', { class: 'ov-step-text' }, emphasise(t(k('todo.step2Text'), {
            interest: money(D.postponementMonthlyInterestCents),
            from: monthName(post[0].date),
            to: monthName(post[post.length - 1].date),
            resumed: money(resumed.totalCents),
            resumeDate: date(resumed.date),
          }), [date(resumed.date)], keepTogether)))),
      R.change.acceptanceRequired === false
        ? h('p', { class: 'callout callout--neutral ov-no-accept' }, App.ui.icon('info', { size: 20 }), h('span', null, t(k('todo.noAcceptance'))))
        : null,
      reviewArea());
  }

  function sameCard() {
    const rows = [
      ['rate', t(k('same.rateLabel')), t(k('same.rateValue'), { rate: App.fmt.percentFromBp(R.loan.annualRateBasisPoints) })],
      ['instalment', t(k('same.instalmentLabel')), t(k('same.instalmentValue'), { amount: money(R.loan.monthlyPrincipalCents) })],
      ['fee', t(k('same.feeLabel')), t(k('same.feeValue'), { fee: money(R.change.feeCents || 0) })],
      ['loan', t(k('same.loanLabel')), R.loan.id],
    ];
    return h('section', { class: ['card', 'ov-same'], 'aria-labelledby': 'ov-same-title' },
      h('h2', { id: 'ov-same-title', class: 'ov-h2 ov-card-h2' }, t(k('same.title'))),
      h('p', { class: 'ov-same-intro' }, t(k('same.intro'))),
      h('ul', { class: 'ov-same-list', role: 'list' }, rows.map(([id, label, value]) => h('li', { class: 'ov-same-item', dataset: { same: id } },
        h('span', { class: 'ov-same-label' }, App.ui.rich(label)),
        h('span', { class: 'ov-same-value' }, App.ui.rich(value)),
        h('span', { class: 'ov-same-badge' }, App.ui.badge('unchanged'))))));
  }

  function mediaSection() {
    const mount = h('div', { class: 'ov-media-mount' });
    let mounted = false;
    if (App.media && typeof App.media.mount === 'function') {
      try {
        // The section heading is an h2, so the player's own headings start at h3.
        App.media.mount(mount, { headingLevel: 3 });
        mounted = true;
      } catch (e) {
        console.error('Explanation player failed to mount', e);
        App.util.clear(mount);
      }
    }
    if (!mounted) {
      mount.appendChild(h('div', { class: 'card card--muted ov-media-fallback' },
        h('span', { class: 'ov-media-fallback-icon', 'aria-hidden': 'true' }, App.ui.icon('play', { size: 22 })),
        h('div', null,
          h('p', { class: 'ov-media-fallback-title' }, t(k('media.unavailableTitle'))),
          h('p', { class: 'ov-media-fallback-text' }, t(k('media.unavailableText'), { section: t('nav.changes') })))));
    }
    return h('section', { class: 'ov-media', id: 'ov-media', fid: 'overview-media', 'aria-labelledby': 'ov-media-title' },
      h('div', { class: 'ov-block-head' },
        h('h2', { id: 'ov-media-title', class: 'ov-h2', tabindex: '-1', fid: 'overview-media-heading' }, t(k('media.title'))),
        h('p', { class: 'ov-block-intro' }, t(k('media.text'))),
        h('p', { class: 'ov-media-meta' }, App.ui.icon('captions', { size: 18 }), h('span', null, t(k('media.meta'))))),
      mount);
  }

  App.router.registerView('overview', {
    render(el) {
      el.appendChild(h('div', { class: 'ov' },
        hero(),
        summary(),
        h('div', { class: 'ov-columns' }, todoCard(), sameCard()),
        mediaSection()));
      return {};
    },
  });

  App.modules.overview = { scrollToMedia };
})();
