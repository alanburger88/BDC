/* Clair: a document-scoped demo assistant.
 * Local, deterministic and bilingual: typed questions are matched to approved
 * intents with weighted keyword patterns (English and French, accent-free,
 * with light typo tolerance). Every answer is built from approved dictionary
 * copy plus values selected from App.record and formatted with App.fmt - no
 * fresh financial arithmetic, no network, no storage, no live model.
 * The panel never opens, speaks or submits by itself. */
(() => {
  const MAX_LEN = 300;
  const MAX_MESSAGES = 80;
  const THRESHOLD = 2;
  const T = (k, p) => t(`clair.${k}`, p);
  const TL = (k, p, l) => t(`clair.${k}`, p, l);
  const GENERAL = Object.freeze({ kind: 'general', id: null });
  const KINDS = ['card', 'summary', 'month', 'clause', 'term', 'chapter', 'resource', 'chart', 'infographic', 'faq', 'section', 'general'];

  const state = () => App.session.slice('clair', () => ({ messages: [], seq: 0, openedCtx: null, activeCtx: null, triggerFid: null, draft: '' }));
  let refs = null; // live DOM references while the panel is open

  /* ------------------------------------------------------------------ */
  /* Values: selected from the issued record, formatted for the locale   */
  /* ------------------------------------------------------------------ */

  function listOf(items) {
    try {
      if (typeof Intl !== 'undefined' && Intl.ListFormat) return new Intl.ListFormat(App.i18n.locale, { style: 'long', type: 'conjunction' }).format(items);
    } catch (e) { /* fall through */ }
    if (items.length < 2) return items.join('');
    return `${items.slice(0, -1).join(', ')} ${T('and')} ${items[items.length - 1]}`;
  }

  // Canadian French writes the first day of a month as "1er" (core formatting gives "1")
  function longDate(iso) {
    const s = App.fmt.date(iso, 'long');
    return App.i18n.locale === 'fr-CA' ? s.replace(/^1 /, '1er ') : s;
  }

  function vals() {
    const R = App.record;
    const d = R.derived || {};
    const ch = R.change || {};
    const ln = R.loan || {};
    const o = R.originalSchedule || [];
    const r = R.revisedSchedule || [];
    const mc = (c) => App.fmt.money(c, { compact: true });
    const mf = (c) => App.fmt.money(c);
    const dl = longDate;
    const post = App.rec.postponementMonths();
    const lastIdx = Math.max(0, post.length - 1);
    const last = post[lastIdx] || r[0];
    const res = App.rec.firstResumed();
    const resCmp = App.rec.month(res.date.slice(0, 7));
    const second = App.rec.months[1];
    const sixth = App.rec.months[5];
    return {
      months: listOf(post.map((p) => App.fmt.date(p.date, 'monthYear'))),
      from: App.fmt.date(post[0].date, 'month'),
      to: App.fmt.date(last.date, 'month'),
      postEnd: App.fmt.date(last.date, 'monthYear'),
      firstMonth: App.fmt.date(r[0].date, 'monthYear'),
      secondMonth: App.fmt.date(second.date, 'monthYear'),
      sixth: App.fmt.date(sixth.date, 'month'),
      resumeMonth: App.fmt.date(res.date, 'monthYear'),
      postInterest: mc(d.postponementMonthlyInterestCents),
      monthlyPrincipal: mc(ln.monthlyPrincipalCents),
      monthlyPrincipalFull: mf(ln.monthlyPrincipalCents),
      principalStart: mc(ln.principalAtScheduleStartCents),
      principalStartFull: mf(ln.principalAtScheduleStartCents),
      rate: App.fmt.percentFromBp(ln.annualRateBasisPoints),
      deferred: mc(d.principalDeferredCents),
      reduction: mc(d.nearTermPaymentReductionCents),
      reductionFull: mf(d.nearTermPaymentReductionCents),
      extra3: mc(d.additionalInterestFirstThreeMonthsCents),
      extraLife: mc(d.additionalLifetimeInterestCents),
      origNear: mc(d.originalNearTermPaymentsCents),
      origNearFull: mf(d.originalNearTermPaymentsCents),
      revNear: mc(d.revisedNearTermPaymentsCents),
      revNearFull: mf(d.revisedNearTermPaymentsCents),
      origIntFull: mf(d.originalTotalInterestCents),
      revIntFull: mf(d.revisedTotalInterestCents),
      origTotalFull: mf(d.originalTotalPaymentsCents),
      revTotalFull: mf(d.revisedTotalPaymentsCents),
      origMat: dl(ch.originalMaturity),
      revMat: dl(ch.revisedMaturity),
      resumeDate: dl(ch.resumePrincipalDate),
      firstResumed: mc(d.firstResumedPaymentCents),
      firstResumedInterest: mc(d.firstResumedInterestCents),
      origResFull: mf(resCmp.original.totalCents),
      revResFull: mf(resCmp.revised.totalCents),
      effective: dl(R.effectiveDate),
      issue: dl(R.issueDate),
      nextDate: dl(r[0].date),
      revNext: mc(r[0].totalCents),
      revNextFull: mf(r[0].totalCents),
      revNextP: mf(r[0].principalCents),
      revNextI: mf(r[0].interestCents),
      origNextFull: mf(o[0].totalCents),
      origNextP: mf(o[0].principalCents),
      origNextI: mf(o[0].interestCents),
      origPostClose: mc(o[lastIdx].closingPrincipalCents),
      origPostCloseFull: mf(o[lastIdx].closingPrincipalCents),
      revPostClose: mc(r[lastIdx].closingPrincipalCents),
      revPostCloseFull: mf(r[lastIdx].closingPrincipalCents),
      origSecondIFull: mf(second.original.interestCents),
      revSecondIFull: mf(second.revised.interestCents),
      feeFull: mf(ch.feeCents),
      origCount: App.fmt.number(d.originalPaymentCount || o.length),
      revCount: App.fmt.number(d.revisedPaymentCount || r.length),
      loanId: ln.id,
      noticeId: R.noticeId,
      notice: t('nav.documents'),
      payments: t('nav.payments'),
      help: t('nav.help'),
      supportSection: t('nav.support'),
      print: t('common.print'),
      askItem: t('common.askAboutThis'),
      askGeneral: t('common.askAQuestion'),
    };
  }

  /* ------------------------------------------------------------------ */
  /* Answer catalogue                                                    */
  /* ------------------------------------------------------------------ */

  const C = (id) => ['clause', id];
  const P = (...parts) => ['place', ...parts];

  // fact: facts.<key>; src: where the supporting formal text lives; topic: query-form hint
  const ANSWERS = {
    whatChanged: { fact: 'counts', src: C('amendment'), topic: 'understanding' },
    purpose: { fact: 'issued', src: C('purpose'), topic: 'understanding' },
    effectiveDate: { fact: 'firstDue', src: C('amendment'), topic: 'understanding' },
    nextPayment: { fact: 'nextPayment', src: C('interest'), topic: 'payment' },
    postponementPeriod: { fact: 'nearTerm', src: C('postponement'), topic: 'payment' },
    principalMeaning: { fact: 'principalOwing', src: C('postponement'), topic: 'understanding' },
    continuingInterest: { fact: 'interestMonth', src: C('interest'), topic: 'interest' },
    whyRelief: { fact: 'nearTermDiff', src: C('cost'), topic: 'payment' },
    relief: { fact: 'firstMonthPayment', src: C('cost'), topic: 'payment' },
    totalCost: { fact: 'totals', src: C('cost'), topic: 'interest' },
    maturity: { fact: 'counts', src: C('maturity'), topic: 'maturity' },
    resume: { fact: 'resume', src: C('resumption'), topic: 'payment' },
    rate: { fact: 'rate', src: C('unchanged'), topic: 'interest' },
    fees: { fact: 'fees', src: C('unchanged'), topic: 'other' },
    unchanged: { fact: 'unchanged', src: C('unchanged'), topic: 'understanding' },
    acceptance: { fact: 'firstDue', src: C('action'), topic: 'understanding' },
    printExport: { fact: 'exports', src: C('schedule'), topic: 'other', ask: false },
    queryPrep: { fact: 'ids', src: P('help', 'ask'), topic: 'other' },
    support: { fact: 'nearTerm', src: P('support'), topic: 'other' },
    debtReduced: { fact: 'principalOwing', src: C('postponement'), topic: 'understanding' },
    capitalisedInterest: { fact: 'capitalised', src: C('interest'), topic: 'interest' },
    balanceAfter: { fact: 'startPrincipal', src: C('schedule'), topic: 'payment' },
    accountant: { fact: 'exports', src: C('contact'), topic: 'other' },
    aboutClair: { ask: false },
    aboutDemo: { ask: false },
    greeting: { ask: false },
    thanks: { ask: false },
    scheduleClause: { fact: 'scheduleTotals', src: C('schedule'), topic: 'understanding' },
    assumptions: { fact: 'assumptions', src: C('assumptions'), topic: 'understanding' },
    chartPayments: { fact: 'firstMonthPayment', src: C('postponement'), topic: 'payment' },
    chartBalance: { fact: 'principalOwing', src: C('schedule'), topic: 'understanding' },
    limitChange: { src: C('contact'), topic: 'payment' },
    limitApprove: { src: C('contact'), topic: 'other' },
    limitEligibility: { src: P('support'), topic: 'other' },
    limitPay: { fact: 'nextPayment', src: C('action'), topic: 'payment' },
    month: { topic: 'payment' },
    term: { topic: 'understanding' },
    resource: { topic: 'other' },
    unrelated: { ask: false, sugg: true },
    fallback: { sugg: true },
  };

  const CARD_MAP = { principal: 'postponementPeriod', interest: 'continuingInterest', 'next-payment': 'nextPayment', maturity: 'maturity', fees: 'fees', rate: 'rate', debt: 'debtReduced' };
  const SUMMARY_MAP = { 'next-payment': 'nextPayment', resume: 'resume', relief: 'whyRelief', 'extra-interest': 'totalCost' };
  const CLAUSE_MAP = { purpose: 'purpose', amendment: 'whatChanged', postponement: 'postponementPeriod', interest: 'continuingInterest', resumption: 'resume', maturity: 'maturity', cost: 'totalCost', unchanged: 'unchanged', action: 'acceptance', schedule: 'scheduleClause', assumptions: 'assumptions', contact: 'queryPrep' };
  const CHAPTER_MAP = { welcome: 'whatChanged', relief: 'postponementPeriod', difference: 'whyRelief', tradeoff: 'totalCost', resume: 'resume', 'next-step': 'acceptance' };
  // Help FAQ ids (help module): explicit mapping, with detection as a fallback for unknown ids
  const FAQ_MAP = { 'why-notice': 'purpose', accept: 'acceptance', 'debt-reduced': 'debtReduced', rate: 'rate', capitalised: 'capitalisedInterest', 'next-payment': 'nextPayment', 'still-interest': 'continuingInterest', relief: 'whyRelief', restart: 'resume', 'final-payment': 'maturity', fee: 'fees', ask: 'queryPrep', accountant: 'accountant', 'print-export': 'printExport' };
  const SECTION_MAP = { overview: 'whatChanged', changes: 'whatChanged', payments: 'relief', documents: 'purpose', support: 'support', help: 'queryPrep', insights: 'aboutDemo' };
  const TERM_FACT = { principal: 'principalOwing', interest: 'interestTotals', postponement: 'nearTerm', instalment: 'counts', maturity: 'counts', outstanding: 'principalOwing', fixedRate: 'rate', cashFlow: 'nearTerm', amortisation: 'counts', capitalisedInterest: 'capitalised' };
  const TERM_TOPIC = { interest: 'interest', fixedRate: 'interest', capitalisedInterest: 'interest', maturity: 'maturity', instalment: 'payment', cashFlow: 'payment' };
  const RESOURCE_TEXT = { 'financial-management': 'resourceFinancialManagement', 'working-capital': 'resourceWorkingCapital', learning: 'resourceLearning' };
  const FALLBACK_SUGGESTIONS = ['whatChanged', 'nextPayment', 'whyRelief', 'totalCost'];

  // Contextual suggested questions (3-5 shown), then topped up from the pool
  const CTX_SUGG = {
    general: ['whyRelief', 'nextPayment', 'totalCost', 'acceptance'],
    'summary:relief': ['debtReduced', 'totalCost', 'resume', 'continuingInterest'],
    'infographic:relief': ['debtReduced', 'totalCost', 'resume', 'continuingInterest'],
    'chapter:difference': ['debtReduced', 'totalCost', 'resume', 'continuingInterest'],
    'summary:next-payment': ['continuingInterest', 'resume', 'whyRelief', 'acceptance'],
    'card:next-payment': ['continuingInterest', 'resume', 'whyRelief', 'acceptance'],
    'summary:resume': ['nextPayment', 'maturity', 'totalCost', 'debtReduced'],
    'summary:extra-interest': ['whyRelief', 'maturity', 'rate', 'fees'],
    'infographic:cost': ['whyRelief', 'maturity', 'rate', 'fees'],
    'card:interest': ['totalCost', 'whyRelief', 'rate', 'capitalisedInterest'],
    'card:principal': ['debtReduced', 'resume', 'whyRelief', 'continuingInterest'],
    'card:maturity': ['totalCost', 'resume', 'balanceAfter', 'acceptance'],
    'card:fees': ['totalCost', 'unchanged', 'acceptance', 'whatChanged'],
    'card:rate': ['totalCost', 'unchanged', 'continuingInterest', 'whatChanged'],
    'card:debt': ['capitalisedInterest', 'balanceAfter', 'totalCost', 'resume'],
    faq: ['whatChanged', 'whyRelief', 'totalCost', 'queryPrep'],
    section: ['whyRelief', 'nextPayment', 'totalCost', 'acceptance'],
    infographic: ['debtReduced', 'totalCost', 'resume', 'continuingInterest'],
    chapter: ['whyRelief', 'totalCost', 'resume', 'acceptance'],
    month: ['whyRelief', 'resume', 'totalCost', 'nextPayment'],
    clause: ['whatChanged', 'acceptance', 'printExport', 'queryPrep'],
    term: ['whatChanged', 'continuingInterest', 'whyRelief', 'debtReduced'],
    resource: ['support', 'queryPrep', 'whatChanged', 'acceptance'],
    chart: ['nextPayment', 'whyRelief', 'resume', 'balanceAfter'],
  };
  const POOL = ['whatChanged', 'nextPayment', 'whyRelief', 'totalCost', 'acceptance', 'resume', 'maturity', 'debtReduced', 'continuingInterest', 'rate', 'fees', 'unchanged', 'printExport', 'queryPrep', 'aboutClair'];

  function source(spec) {
    if (!spec) return null;
    if (spec[0] === 'clause') {
      const title = t(`clauses.${spec[1]}`);
      return { kind: 'clause', id: spec[1], target: `#/documents/${spec[1]}`, label: title, text: T('seeInNotice', { title }) };
    }
    const [, section, a, b] = spec;
    const target = `#/${[section, a, b].filter(Boolean).join('/')}`;
    let item = null;
    if (section === 'help' && a === 'ask') item = t('common.askAQuestion');
    else if (section === 'help' && a === 'glossary') item = t(`glossary.${b}.term`);
    else if (section === 'support' && a) item = t(`items.resource.${a}`);
    const sectionLabel = t(`nav.${section}`);
    return { kind: 'place', target, label: item || sectionLabel, text: item ? T('seeIn', { section: sectionLabel, item }) : T('seeInSection', { section: sectionLabel }) };
  }

  function compose(id, v, over = {}) {
    const def = ANSWERS[id] || ANSWERS.fallback;
    const factKey = over.fact !== undefined ? over.fact : def.fact;
    return {
      intent: over.intent || id,
      text: over.text || T(`answers.${over.textKey || id}`, v),
      fact: over.factText !== undefined ? over.factText : (factKey ? T(`facts.${factKey}`, v) : null),
      source: source(over.src !== undefined ? over.src : def.src),
      askPerson: over.ask !== undefined ? over.ask : def.ask !== false,
      topic: over.topic || def.topic || 'other',
      suggestions: def.sugg ? FALLBACK_SUGGESTIONS.slice() : null,
      monthId: over.monthId || null,
      context: over.context || null,
      lang: App.i18n.locale,
    };
  }

  const suppressed = () => !!(App.config && App.config.rules && App.config.rules.suppressBorrowingPromotion());

  const seasonal = () => !!(App.record.client && App.record.client.seasonalInventoryBuild);

  function intentAnswer(id, v) {
    if (id === 'purpose' && seasonal()) return compose(id, v, { textKey: 'purposeSeasonal' });
    if (id === 'support' && suppressed()) return compose(id, v, { textKey: 'supportSuppressed' });
    if (id === 'limitEligibility' && suppressed()) return compose(id, v, { textKey: 'limitEligibilitySuppressed', src: C('contact') });
    return compose(ANSWERS[id] ? id : 'fallback', v);
  }

  function monthAnswer(monthId, v, label) {
    const m = App.rec.month(monthId);
    const mf = (c) => App.fmt.money(c);
    const monthLabel = label || App.fmt.date(monthId, 'monthYear');
    if (!m || !m.revised) {
      return compose('month', v, { intent: 'month', text: T('month.outside', { ...v, month: monthLabel }), factText: T('month.factOutside', v), src: C('schedule'), topic: 'payment', monthId });
    }
    const o = m.original;
    const r = m.revised;
    const p = {
      ...v,
      month: monthLabel,
      rPrincipal: mf(r.principalCents),
      rInterest: mf(r.interestCents),
      rTotal: mf(r.totalCents),
      rOpen: mf(r.openingPrincipalCents),
    };
    if (o) Object.assign(p, { oPrincipal: mf(o.principalCents), oInterest: mf(o.interestCents), oTotal: mf(o.totalCents), oOpen: mf(o.openingPrincipalCents) });
    let textKey;
    let src;
    if (!o) { textKey = r.date === App.record.change.revisedMaturity ? 'final' : 'extension'; src = C('maturity'); } else if (r.principalCents === 0) { textKey = m.interestDifferenceCents === 0 ? 'postSame' : 'post'; src = C('postponement'); } else if (r.date === App.record.change.resumePrincipalDate) { textKey = 'resume'; src = C('resumption'); } else { textKey = 'resumed'; src = C('schedule'); }
    return compose('month', v, { intent: 'month', text: T(`month.${textKey}`, p), factText: T(o ? 'month.fact' : 'month.factExtension', p), src, topic: 'payment', monthId });
  }

  function termAnswer(id, v) {
    if (!App.TERMS.includes(id)) return null;
    const key = id === 'cashFlow' && seasonal() ? 'cashFlowSeasonal' : id;
    const text = `${t(`glossary.${id}.definition`)} ${T(`terms.${key}`, v)}`;
    return compose('term', v, { intent: 'term', text, fact: TERM_FACT[id] || null, src: P('help', 'glossary', id), topic: TERM_TOPIC[id] || 'understanding' });
  }

  function resourceAnswer(id, v) {
    const key = RESOURCE_TEXT[id];
    if (!key) return null;
    let textKey = key;
    if (id === 'working-capital' && suppressed()) textKey = 'resourceWorkingCapitalSuppressed';
    else if (id === 'financial-management' && seasonal()) textKey = 'resourceFinancialManagementSeasonal';
    return compose('resource', v, { intent: 'resource', text: T(`answers.${textKey}`, v), fact: 'nearTerm', src: P('support', id), topic: 'other' });
  }

  function contextAnswer(ctx, v) {
    if (!ctx || ctx.kind === 'general') return null;
    const id = ctx.id;
    const key = `${ctx.kind}:${id}`;
    let a = null;
    switch (ctx.kind) {
      case 'card': a = CARD_MAP[id] ? intentAnswer(CARD_MAP[id], v) : null; break;
      case 'summary': a = SUMMARY_MAP[id] ? intentAnswer(SUMMARY_MAP[id], v) : null; break;
      case 'month': a = App.rec.isMonthId(id) ? monthAnswer(id, v) : null; break;
      case 'clause':
        if (CLAUSE_MAP[id]) { a = intentAnswer(CLAUSE_MAP[id], v); a.source = source(C(id)); }
        break;
      case 'term': a = termAnswer(id, v); break;
      case 'chapter': a = CHAPTER_MAP[id] ? intentAnswer(CHAPTER_MAP[id], v) : null; break;
      case 'resource': a = resourceAnswer(id, v); break;
      case 'chart': a = intentAnswer(id === 'balance' ? 'chartBalance' : 'chartPayments', v); break;
      case 'infographic': a = intentAnswer(id === 'cost' ? 'totalCost' : 'whyRelief', v); break;
      case 'section': a = intentAnswer(SECTION_MAP[id] || 'whatChanged', v); break;
      case 'faq': {
        if (FAQ_MAP[id]) { a = intentAnswer(FAQ_MAP[id], v); break; }
        const det = detect(String(id).replace(/[-_]+/g, ' '), GENERAL);
        a = !['fallback', 'context', 'unrelated'].includes(det.intent) ? fromDetection(det, v, GENERAL) : intentAnswer('whatChanged', v);
        break;
      }
      default: a = null;
    }
    if (!a) a = intentAnswer('whatChanged', v);
    a.context = key;
    return a;
  }

  function fromDetection(det, v, ctx) {
    if (det.intent === 'month') return monthAnswer(det.monthId, v, det.monthLabel);
    if (det.intent === 'term') return termAnswer(det.termId, v);
    if (det.intent === 'context') return contextAnswer(ctx, v) || intentAnswer('fallback', v);
    return intentAnswer(det.intent, v);
  }

  /* ------------------------------------------------------------------ */
  /* Intent engine                                                       */
  /* ------------------------------------------------------------------ */
  /* Patterns run on accent-free, lower-case text (apostrophes and hyphens
   * become spaces; "12 000" becomes "12000"). Syntax: "word" (plurals and
   * light typos tolerated), "pre*" (prefix), "two words" (consecutive),
   * "a+b c" (all parts anywhere), or a RegExp on the whole string. */
  const INTENTS = {
    limitPay: [['pay now', 5], ['pay+now', 4], ['make a payment', 5], ['make+payment', 4], ['pay+online', 4], ['pay+today', 4], ['pay+early', 3.5], ['prepay*', 4], ['pay+here', 3.5], ['pay+bill', 3.5], ['process+payment', 4], ['payment method', 3], ['credit card', 3], ['lump sum', 4], ['extra payment', 3.5], ['pay+off+now', 2],
      ['payer maintenant', 5], ['payer+maintenant', 4], ['faire un paiement', 5], ['faire+paiement', 4], ['faire+versement', 4], ['effectuer+paiement', 4], ['effectuer+versement', 4], ['payer+en ligne', 4], ['payer+aujourd', 4], ['payer+ici', 3.5], ['rembourser+maintenant', 4], ['paiement anticipe', 4], ['remboursement anticipe', 4], ['versement supplementaire', 3.5], ['somme forfaitaire', 4], ['carte de credit', 3], ['virement', 3]],
    limitChange: [['change my payment', 5], ['change+my+payment', 4], ['change+my+loan', 4], ['change+my+term', 4], ['change+terms', 3.5], ['modify+payment', 4], ['modify', 1.5], ['adjust+payment', 4], ['lower+my+payment', 4], ['reduce+my+payment', 4], ['increase+my+payment', 4], ['skip+payment', 4], ['can+you+change', 4], ['can+i+change', 4], ['want+to+change', 4], ['cancel+postpon*', 4], ['undo', 3], ['switch+variable', 4], ['change my rate', 4], ['can+change+rate', 3], ['renegotiat*', 4], ['restructur*', 3],
      ['modifier+versement', 4], ['changer+versement', 4], ['modifier+pret', 4], ['modifier+modalit*', 4], ['changer+modalit*', 4], ['reduire+versement', 4], ['diminuer+mon+versement', 4], ['augmenter+versement', 4], ['sauter+versement', 4], ['puis je modifier', 4], ['puis je changer', 4], ['pouvez vous modifier', 4], ['pouvez vous changer', 4], ['annuler+report', 4], ['renegoci*', 4], ['changer+taux', 3]],
    limitApprove: [['another postponement', 5], ['another+postpon*', 4], ['more+postpon*', 3], ['extend*+postpon*', 4.5], ['postpon*+longer', 4], ['more months', 3], ['extra months', 3], ['extend*', 2.5], ['extension', 2.5], ['approve', 2.5], ['approve+request', 4], ['grant', 2], ['second+postpon*', 4], ['again+postpon*', 3], ['defer+again', 3], ['additional+postpon*', 4],
      ['autre report', 5], ['autre+report', 4], ['nouveau report', 5], ['nouveau+report', 4], ['prolong*', 3.5], ['plus+longtemps', 2.5], ['approuver', 3], ['accorder', 2.5], ['deuxieme+report', 4], ['reporter+encore', 3.5], ['encore+report*', 3], ['mois supplementaire', 3], ['mois de plus', 3]],
    limitEligibility: [['eligib*', 4], ['qualify', 4], ['qualif*', 3.5], ['more funding', 5], ['more+funding', 4], ['more+financing', 4], ['more+money', 3.5], ['borrow*', 3], ['new loan', 4.5], ['another loan', 4.5], ['additional+loan', 4], ['line of credit', 4], ['credit line', 4], ['credit+increase', 4], ['increase+loan', 4], ['top up', 3], ['pre approv*', 4], ['preapprov*', 4], ['get+loan', 3.5], ['apply+for', 2.5], ['apply+loan', 4], ['working capital loan', 3],
      ['admissib*', 4], ['plus de financement', 5], ['financement+supplementaire', 4], ['financement+additionnel', 4], ['emprunt*', 3], ['nouveau pret', 4.5], ['autre pret', 4.5], ['marge de credit', 4], ['ligne de credit', 4], ['preapprob*', 4], ['pre approb*', 4], ['obtenir+pret', 3.5], ['demander+pret', 3.5], ['plus+argent', 3]],
    unrelated: [['weather', 4], ['forecast', 3], ['temperature', 3], ['rain*', 3], ['snow*', 3], ['hockey', 4], ['football', 4], ['soccer', 4], ['basketball', 4], ['baseball', 4], ['sport*', 4], ['game', 2], ['stock market', 4], ['stock price', 4], ['share price', 4], ['invest*', 3], ['crypto*', 4], ['bitcoin', 4], ['rbc', 4], ['td', 3], ['desjardins', 4], ['bmo', 4], ['scotia*', 4], ['cibc', 4], ['national bank', 4], ['other bank', 4], ['mortgage', 3.5], ['tax', 3], ['taxes', 3], ['rrsp', 4], ['tfsa', 4], ['retirement', 3.5], ['recipe', 4], ['joke', 4], ['movie', 4], ['music', 3], [/\bnews\b/, 3], ['nhl', 4], ['nba', 4], ['stanley cup', 4], ['credit score', 4], ['politic*', 4], ['election', 4], ['capital of', 4], ['president', 3], ['prime minister', 4], ['horoscope', 4], ['lottery', 4], ['restaurant', 3], ['travel', 3], ['vacation', 3],
      ['meteo', 4], ['quel temps', 4], ['temps+fera', 4], ['pluie', 3], ['neige', 3], ['match de', 3], ['bourse', 4], ['placement*', 3], ['banque nationale', 4], ['autre+banque', 4], ['hypothe*', 3.5], ['impot*', 3.5], ['reer', 4], ['celi', 4], ['retraite', 3.5], ['recette de', 3], ['blague', 4], ['film', 3], ['musique', 3], ['actualit*', 3], ['cote de credit', 4], ['pointage de credit', 4], ['politique', 4], ['capitale', 4], ['premier ministre', 4], ['loterie', 4], ['voyage', 3], ['vacances', 3]],
    whyRelief: [['12000', 3], ['11920', 3], ['80', 2.5], ['why+not', 1], ['why+only', 1.5], ['why+less', 1.5], ['why+relief', 2], ['not+12000', 2], ['instead+12000', 2], ['relief', 1.5], ['why', 0.5], ['difference+12000', 1], ['where+80', 2], ['80+come', 2], ['come from', 1], ['80+extra', 1.5], ['80+more', 1.5], ['80+dollars', 1],
      ['pourquoi+pas', 1], ['pourquoi+seulement', 1.5], ['pourquoi+allegement', 2], ['pourquoi+ecart', 2], ['pas+12000', 2], ['ecart', 1.5], ['allegement', 1.5], ['pourquoi', 0.5], ['d ou+80', 2], ['d ou vient', 1]],
    totalCost: [['how much more', 4], ['total+cost', 3.5], ['extra+cost', 3.5], ['additional+cost', 3.5], ['cost+more', 3], ['more+expensive', 3], ['extra+interest', 3], ['additional+interest', 3], ['more+interest', 2.5], ['total+interest', 3], ['cost', 2], ['4800', 3], ['48800', 3], ['53600', 3], ['288800', 3], ['293600', 3], ['trade off', 3], ['tradeoff', 3], ['downside', 3], ['catch', 2], ['lifetime', 2], ['overall', 1.5], ['in total', 2], ['total', 1], ['pay+more', 2],
      ['combien de plus', 4], ['cout*', 2], ['cout total', 4], ['cout*+supplementaire*', 4], ['interet*+supplementaire*', 3.5], ['interet*+additionnel*', 3.5], ['plus+interet*', 2], ['total+interet*', 3], ['combien+coute', 3], ['contrepartie', 3], ['au total', 2], ['plus cher', 3], ['payer+plus', 2]],
    relief: [['how much less', 4], ['how much lower', 4], ['how much+save*', 4], ['save*', 2], ['saving*', 2], ['lower+payment', 2.5], ['reduc*+payment', 2], ['cash+relief', 2], ['breathing room', 3], ['16720', 3], ['pay less', 3],
      ['combien de moins', 4], ['combien+economis*', 4], ['economi*', 2], ['epargn*', 2], ['versements reduits', 3], ['reduction+versement', 2.5], ['payer moins', 3], ['diminu*+versement', 2.5], ['repit', 3]],
    nextPayment: [['next payment', 4], ['next+pay*', 3], ['upcoming+pay*', 3], ['next instalment', 4], ['next installment', 4], ['first payment', 3], ['when+next', 2], ['next+due', 2], ['what do i pay', 2], ['how much is my payment', 3], ['next', 1], ['nxt', 2],
      ['prochain versement', 4], ['prochain paiement', 4], ['prochain*+versement', 3], ['prochain*+paiement', 3], ['prochaine+echeance', 3], ['premier versement', 3], ['quand+prochain*', 2], ['combien+payer', 2], ['combien+dois+payer', 2.5], ['prochain*', 1]],
    resume: [[/\bresume\b(?! (de|du|des|l|la|le|les|ce|cet|cette|moi|nous|avis)\b)/, 3], ['resumption', 3], ['restart*', 3], ['start again', 4], ['start*+again', 3], ['begin+again', 3], ['back to normal', 3], ['principal+again', 2], ['postpon*+end*', 4], ['after+postpon*', 2.5], ['5600', 3], ['when+resume', 1],
      ['reprise', 3], ['repren*', 3], ['recommenc*', 3], ['fin+report', 4], ['report+termin*', 4.5], ['report+fini*', 4.5], ['apres+report', 2.5], ['retour+normal', 3]],
    maturity: [['maturity', 3.5], ['final payment', 4], ['last payment', 4], ['final+pay*', 3], ['last+pay*', 3], ['when+end', 2], ['loan+end*', 3], ['paid off', 3], ['pay off', 2], ['fully repaid', 3], ['when+finish*', 3], ['finish*', 1.5], ['end date', 3], ['loan+extend*', 3.5], ['term+extend*', 3.5], ['2032', 2], ['2031', 2], ['end', 1],
      ['echeance', 3.5], ['dernier versement', 4], ['dernier paiement', 4], ['dernier+versement', 3], ['quand+termin*', 3], ['pret+termin*', 3], ['fin du pret', 4], ['fin+pret', 3], ['entierement+rembours*', 3], ['date de fin', 3], ['quand+fini*', 3], ['termine', 1], ['fin', 1]],
    debtReduced: [['forgiv*', 4], ['still owe', 4], ['still+owe*', 3.5], ['do i owe', 3], ['debt+reduc*', 4], ['debt', 2], ['owe', 1.5], ['cancel*', 2.5], ['written off', 4], ['write off', 4], ['wipe*', 2.5], ['disappear*', 2.5], ['principal+gone', 3], ['12000+gone', 3], ['gone', 1.5], ['still+repay*', 3.5], ['have to repay', 3], ['free money', 3], ['reduc*+principal', 2.5], ['less+debt', 3], ['owing', 1.5],
      ['remise de dette', 4], ['dette', 2], ['dette+redui*', 4], ['dois+toujours', 3.5], ['dois+encore', 3.5], ['encore+du', 2.5], ['annul*', 2.5], ['efface*', 2.5], ['capital+disparai*', 3], ['redui*+capital', 2.5], ['toujours+du', 2.5], ['moins+dette', 3], ['toujours+rembours*', 3.5], ['encore+rembours*', 3]],
    capitalisedInterest: [['capitaliz*', 4], ['capitalis*', 4], ['added+balance', 3.5], ['added+principal', 3], ['add*+to+balance', 3], ['compound*', 3.5], ['interest on interest', 4], ['roll*+into', 3],
      ['ajout*+solde', 3.5], ['ajout*+capital', 3], ['interets composes', 4], ['compos*+interet*', 3], ['interet*+sur+interet*', 4]],
    balanceAfter: [['balance', 2.5], ['balance+after', 4], ['owe+after', 4], ['remaining+principal', 3], ['principal+after', 2], ['outstanding', 2.5], ['how much+owe*', 5], ['left+to+pay', 3], ['left+owing', 3], ['current+balance', 3.5], ['principal+left', 3], ['balance+postpon*', 3],
      ['solde', 3], ['solde+apres', 4], ['capital restant', 3.5], ['restant+du', 3], ['combien+dois', 2.5], ['dois+apres', 2], ['reste a payer', 3.5], ['reste a rembourser', 3.5], ['restera+rembourser', 3.5], ['solde+report', 3]],
    continuingInterest: [['still+pay+interest', 4], ['still+interest', 3], ['interest+during', 3], ['pay+interest', 2], ['interest+postpon*', 2.5], ['interest+continu*', 3], ['do i pay interest', 4], ['interest only', 3], ['1600', 2.5], ['interest', 1], ['holiday', 3], ['interest free', 4], ['free', 1.5],
      ['encore+interet*', 3], ['toujours+interet*', 3], ['interet*+pendant', 3], ['payer+interet*', 2], ['paie+interet*', 2], ['interet*+report', 2.5], ['interets seulement', 3], ['interet*+continu*', 3], ['interet*', 1], ['conge', 3], ['sans interet*', 4], ['gratuit*', 1.5]],
    postponementPeriod: [['how long', 3], ['which months', 4], ['what months', 4], ['postponement period', 4], ['period', 1.5], ['postpon*', 2], ['defer*', 2], ['how+many+months', 4], ['duration', 3], ['length+postpon*', 3], ['pause*', 2],
      ['combien de temps', 3], ['quels mois', 4], ['quel+mois', 2], ['duree', 3], ['periode', 1.5], ['report', 2], ['reporte*', 2], ['combien+mois', 4], ['periode de report', 4], ['vises+report', 2]],
    effectiveDate: [['effective', 3], ['take effect', 4], ['takes effect', 4], ['when+start*', 2.5], ['when+begin*', 2.5], ['effective date', 4], ['start date', 3], ['begin*', 2],
      ['en vigueur', 4], ['prend effet', 4], ['a compter de quand', 4], ['a partir de quand', 4], ['partir+quand', 3], ['quand+commence*', 3], ['debut', 2], ['date d effet', 4], ['commence', 1]],
    rate: [['rate', 3], ['interest rate', 4], ['rate+change*', 1], ['percent*', 2], ['fixed', 2], ['variable', 2], ['apr', 2],
      ['taux', 3], ['taux d interet', 4], ['pourcentage', 2], ['fixe', 2]],
    fees: [['fee', 4], ['charge', 2], ['cost anything', 3.5], ['admin*', 2], ['penalt*', 3], ['cost+change', 2], ['pay+for+change', 3], ['service charge', 4],
      ['frais', 4], ['penalit*', 3], ['coute+quelque chose', 3.5], ['coute+rien', 3], ['cout+modification', 3], ['coute+modification', 3], ['payer+modification', 2]],
    unchanged: [['stay the same', 4], ['stays the same', 4], ['unchanged', 4], ['does not change', 4], ['doesn t change', 4], ['don t change', 4], ['what stays', 4], ['remain*+same', 3], ['still the same', 3], ['same', 1.5], ['what remains', 2.5],
      ['reste pareil', 4], ['restent pareils', 4], ['ne change pas', 4], ['inchange*', 4], ['reste le meme', 4], ['restent les memes', 4], ['demeure', 2], ['qu est ce qui reste', 3], ['meme', 1]],
    acceptance: [['accept*', 3], ['sign', 2.5], ['signature', 2.5], ['agree*', 2.5], ['consent', 3], ['do i need to do', 4], ['what do i need to do', 4], ['need to do anything', 4], ['action required', 4], ['required', 1.5], ['next step*', 3], ['what should i do', 3.5], ['have to do', 3], ['respond', 2], ['reply', 2], ['confirm*', 2],
      ['accepter', 3], ['signer', 2.5], ['consentement', 3], ['que dois je faire', 4], ['dois je faire', 3], ['je dois faire', 3.5], ['faire+quelque chose', 3], ['quoi faire', 3], ['prochaine etape', 3], ['confirmer', 2], ['repondre', 2], ['obligatoire', 2], ['requis*', 2]],
    printExport: [['print*', 4], ['pdf', 4], ['download*', 3.5], ['export*', 4], ['csv', 4], ['excel', 3], ['spreadsheet', 3], ['save+copy', 3], ['save', 1.5], ['copy', 1.5],
      ['imprim*', 4], ['telecharg*', 3.5], ['enregistr*', 2.5], ['copie', 2], ['tableur', 3]],
    queryPrep: [['ask a person', 5], ['ask+question', 3], ['talk+someone', 4], ['speak+someone', 4], ['talk+person', 4], ['speak+person', 4], ['talk+human', 4], ['human', 2], ['real person', 3], ['advisor', 3], ['adviser', 3], ['representative', 3], ['account manager', 4], ['contact', 3], ['call+bdc', 3], ['phone', 2], ['email', 2], ['get in touch', 4], ['how+ask', 2.5], ['send+question', 3], ['agent', 2],
      ['poser une question', 4], ['poser+question', 3], ['parler+quelqu', 4], ['parler+personne', 4], ['demander+personne', 4], ['personne ressource', 4], ['conseiller*', 3], ['representant*', 3], ['joindre', 3], ['contacter', 3], ['communiquer', 3], ['appeler', 3], ['courriel', 2], ['telephone', 2], ['humain', 2]],
    accountant: [['accountant', 4], ['bookkeeper', 4], ['cpa', 3], ['share+notice', 3], ['share', 1.5], ['controller', 2], ['cfo', 3], ['authoriz*+user', 3], ['authoris*+user', 3], ['access', 1.5],
      ['comptable', 4], ['partager', 2.5], ['acces', 1.5], ['utilisateur autorise', 3]],
    support: [['support', 2.5], ['help+cash flow', 3], ['resource*', 3], ['consult*', 3], ['financial management', 4], ['advice+cash', 3], ['learn*', 2], ['training', 2], ['help+business', 2], ['what help', 3], ['other help', 3], ['service*', 1.5], ['working capital', 2.5],
      ['soutien', 3], ['ressource*', 3], ['consultation', 3], ['gestion financiere', 4], ['aide+tresorerie', 3], ['conseils', 2.5], ['apprentissage', 2], ['formation', 2], ['fonds de roulement', 2.5], ['aide', 1.5]],
    principalMeaning: [['what is principal', 4], ['what is the principal', 4], ['principal+mean*', 3], ['define+principal', 4], ['definition+principal', 4], ['meaning+principal', 4], ['principal', 1],
      ['qu est ce que le capital', 4], ['capital+signifi*', 3], ['definition+capital', 4], ['definir+capital', 4], ['c est quoi le capital', 4], ['veut dire+capital', 3], ['capital', 1]],
    purpose: [['why+receiv*', 3], ['why+notice', 3], ['why+letter', 3], ['why+issued', 3], ['purpose', 3], ['reason+notice', 3], ['why+postpon*', 2.5], ['why+get+this', 2],
      ['pourquoi+avis', 3], ['pourquoi+recu', 3], ['pourquoi+report', 2.5], ['objet+avis', 3], ['raison+avis', 3], ['but+avis', 2]],
    whatChanged: [['what+change*', 3], ['what s new', 3], ['summar*', 3], ['overview', 2], ['tl dr', 3], ['tldr', 3], ['in short', 2], ['key points', 3], ['main change*', 3], ['explain+notice', 3], ['what+notice+mean*', 2], ['what+happen*', 2], ['approved', 2], ['status', 2], ['what+different', 2], ['difference+original+revised', 3], ['why+payment+change*', 3], ['changes', 1],
      ['qu est ce qui change', 4], ['ce qui change', 4], ['quoi+change*', 3], ['qu est ce qui a change', 4], ['changement*', 2], ['en bref', 3], ['en resume', 4], ['resumer', 3], ['resume de', 4], ['resume+avis', 4], ['resume moi', 4], ['sommaire', 3], ['apercu', 2], ['explique*+avis', 3], ['signifie+avis', 3], ['quoi de neuf', 3], ['pourquoi+versement+change*', 3], ['approuvee', 2], ['approuve', 1]],
    aboutClair: [['who are you', 4], ['what are you', 4], ['are you+ai', 4], ['is this+ai', 4], ['live ai', 4], ['artificial intelligence', 4], ['chatgpt', 4], ['gpt', 3], ['bot', 3], ['robot', 3], ['chatbot', 4], ['what is clair', 4], ['who is clair', 4], ['are you+real', 4], ['is this live', 3], ['language model', 4], ['llm', 4], ['acorn', 3], ['automated', 2], ['am i talking', 4], ['are you+human', 4], ['are you+person', 4],
      ['qui es tu', 4], ['qui etes vous', 4], ['ia', 3], ['intelligence artificielle', 4], ['qui est clair', 4], ['c est quoi clair', 4], ['es tu+reel*', 4], ['vraie personne', 4], ['es tu+personne', 4], ['etes vous+personne', 4], ['es tu+robot', 4], ['etes vous+robot', 4], ['en direct', 2], ['parle+robot', 2], ['es tu+humain', 4], ['etes vous+humain', 4]],
    thanks: [['thank*', 3], ['thx', 3], ['merci', 3], ['appreciate', 2], ['great', 1], ['perfect', 1], ['parfait', 1], ['super', 1]],
    greeting: [[/^(hi|hello|hey|hiya|bonjour|salut|allo|bonsoir|good (morning|afternoon|evening))\b/, 2.5]],
  };
  // Subtractive patterns: "why did you change my payment" is a question, not a request
  const NEGATIVE = { limitChange: [['why', 50], ['pourquoi', 50]] };
  const PRIORITY = ['limitPay', 'limitChange', 'limitApprove', 'limitEligibility', 'unrelated', 'whyRelief', 'totalCost', 'term', 'month', 'relief', 'nextPayment', 'resume', 'maturity', 'balanceAfter', 'debtReduced', 'capitalisedInterest', 'continuingInterest', 'postponementPeriod', 'effectiveDate', 'rate', 'fees', 'unchanged', 'acceptance', 'printExport', 'queryPrep', 'accountant', 'support', 'principalMeaning', 'purpose', 'whatChanged', 'aboutClair', 'thanks', 'greeting'];

  /* A question that is only a glossary term ("interest?", "c'est quoi la trésorerie?")
   * gets the approved definition and how it applies here. */
  const TERM_WORDS = {
    principal: ['principal', 'capital'],
    interest: ['interest', 'interet', 'interets'],
    postponement: ['postponement', 'principal postponement', 'deferral', 'report', 'report de capital', 'report des remboursements de capital'],
    instalment: ['instalment', 'installment', 'versement'],
    maturity: ['maturity', 'maturity date', 'echeance', 'date d echeance'],
    outstanding: ['outstanding', 'outstanding principal', 'capital restant', 'capital restant du', 'capital restant a rembourser'],
    fixedRate: ['fixed rate', 'taux fixe'],
    cashFlow: ['cash flow', 'cashflow', 'tresorerie', 'flux de tresorerie'],
    amortisation: ['amortisation', 'amortization', 'amortissement'],
    capitalisedInterest: ['capitalised interest', 'capitalized interest', 'interet capitalise', 'interets capitalises', 'capitalisation', 'capitalization'],
  };
  const TERM_INDEX = new Map();
  Object.entries(TERM_WORDS).forEach(([id, list]) => list.forEach((w) => { TERM_INDEX.set(w, id); TERM_INDEX.set(`${w}s`, id); }));
  const TERM_FILLER = new Set(['what', 'whats', 'is', 's', 'are', 'does', 'do', 'you', 'mean', 'means', 'meaning', 'by', 'of', 'definition', 'define', 'explain', 'the', 'a', 'an', 'so', 'and', 'ok', 'okay', 'please', 'term', 'word',
    'qu', 'est', 'ce', 'que', 'c', 'quoi', 'signifie', 'veut', 'dire', 'ca', 'de', 'du', 'des', 'la', 'le', 'les', 'l', 'un', 'une', 'd', 'definir', 'expliquer', 'explique', 'expliquez', 'moi', 'alors', 'et', 'donc', 'svp', 'stp', 'terme', 'mot']);
  // Intents that already explain a term in full
  const TERM_INTENT = { principal: 'principalMeaning', capitalisedInterest: 'capitalisedInterest' };

  function termOnly(tokens) {
    let a = 0;
    let b = tokens.length;
    while (a < b && TERM_FILLER.has(tokens[a])) a += 1;
    while (b > a && TERM_FILLER.has(tokens[b - 1])) b -= 1;
    if (b - a < 1 || b - a > 6) return null;
    return TERM_INDEX.get(tokens.slice(a, b).join(' ')) || null;
  }

  const MONTHS = [
    [1, ['january', 'jan', 'janvier', 'janv']],
    [2, ['february', 'feb', 'fevrier', 'fevr', 'fev']],
    [3, ['march', 'mars']],
    [4, ['april', 'avril', 'avr']],
    [5, ['mai']],
    [6, ['june', 'jun', 'juin']],
    [7, ['july', 'jul', 'juillet', 'juil']],
    [8, ['august', 'aug', 'aout']],
    [9, ['september', 'sept', 'septembre']],
    [10, ['october', 'oct', 'octobre']],
    [11, ['november', 'nov', 'novembre']],
    [12, ['december', 'dec', 'decembre']],
  ];
  const MONTH_INDEX = new Map();
  MONTHS.forEach(([n, names]) => names.forEach((w) => MONTH_INDEX.set(w, n)));
  const PAY_WORDS = new Set(['payment', 'payments', 'pay', 'paying', 'versement', 'versements', 'paiement', 'paiements', 'payer', 'interest', 'interet', 'interets', 'principal', 'capital', 'owe', 'due', 'combien', 'much', 'total']);
  const DEICTIC = /\b(this|that|it|these|those|here|explain|more|detail|details|why|ceci|cela|ca|celui|celle|explique|expliquer|expliquez|pourquoi|davantage|plus de details)\b/;
  // Frequent words that must never be "typo-corrected" into a keyword
  const COMMON = ['about', 'after', 'again', 'before', 'being', 'could', 'would', 'should', 'their', 'there', 'these', 'those', 'where', 'which', 'while', 'other', 'under', 'month', 'months', 'money', 'today', 'later', 'still', 'first', 'order', 'great', 'means', 'notice', 'payer', 'avoir', 'faire', 'notre', 'votre', 'vous', 'cette', 'quand', 'quels', 'quelle', 'comment', 'pourrais', 'pouvez', 'charged', 'changed', 'change', 'changes', 'chance', 'please', 'merci', 'answer', 'question', 'questions', 'paid', 'interested', 'dollars', 'repay', 'repaid', 'repayment', 'repaying'];

  let LEXICON = null;
  let COMPILED = null;

  function compile(p) {
    if (p instanceof RegExp) return { re: p };
    return { parts: p.split('+').map((part) => part.trim().split(' ').filter(Boolean)) };
  }

  function ensureCompiled() {
    if (COMPILED) return;
    LEXICON = new Set(COMMON);
    MONTH_INDEX.forEach((v, k) => LEXICON.add(k));
    const all = { ...INTENTS };
    Object.values(all).concat(Object.values(NEGATIVE)).forEach((list) => list.forEach(([p]) => {
      if (typeof p !== 'string') return;
      p.split(/[+\s]/).filter(Boolean).forEach((w) => { if (!w.endsWith('*')) LEXICON.add(w); });
    }));
    COMPILED = Object.keys(INTENTS).map((id) => [id, INTENTS[id].map(([p, w]) => [compile(p), w]), (NEGATIVE[id] || []).map(([p, w]) => [compile(p), w])]);
  }

  // Optimal string alignment distance (adjacent transpositions count as one edit)
  function osa(a, b) {
    const d = [];
    for (let i = 0; i <= a.length; i += 1) { d[i] = [i]; }
    for (let j = 0; j <= b.length; j += 1) d[0][j] = j;
    for (let i = 1; i <= a.length; i += 1) {
      for (let j = 1; j <= b.length; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
    return d[a.length][b.length];
  }

  function fuzzy(tok, kw) {
    if (/\d/.test(tok) || /\d/.test(kw) || kw.length < 5 || tok.length < 4 || tok[0] !== kw[0] || LEXICON.has(tok)) return false;
    const max = kw.length >= 8 ? 2 : 1;
    return Math.abs(tok.length - kw.length) <= max && osa(tok, kw) <= max;
  }

  function tokMatch(tok, kw) {
    if (!tok) return false;
    if (kw.endsWith('*')) return tok.startsWith(kw.slice(0, -1));
    if (tok === kw || tok === `${kw}s` || `${tok}s` === kw || tok === `${kw}x`) return true;
    return fuzzy(tok, kw);
  }

  function matchPhrase(tokens, words) {
    for (let i = 0; i + words.length <= tokens.length; i += 1) {
      let ok = true;
      for (let j = 0; j < words.length; j += 1) { if (!tokMatch(tokens[i + j], words[j])) { ok = false; break; } }
      if (ok) return true;
    }
    return false;
  }

  function matches(c, s, tokens) {
    if (c.re) return c.re.test(s);
    return c.parts.every((words) => matchPhrase(tokens, words));
  }

  function prep(str) {
    let s = App.util.normalize(str).replace(/['\-]/g, ' ').replace(/[$%]/g, ' ').replace(/\s+/g, ' ').trim();
    let prev;
    do { prev = s; s = s.replace(/(\d)\s(\d{3})(?!\d)/g, '$1$2'); } while (s !== prev);
    s = s.replace(/\b(\d+)\s?k\b/g, (m, n) => `${n}000`);
    return s;
  }

  const pad2 = (n) => String(n).padStart(2, '0');

  function detectMonth(tokens, ctx) {
    const found = [];
    tokens.forEach((tok, i) => {
      let m = MONTH_INDEX.get(tok) || null;
      // "may" (English modal) and "sept" (French "seven") count as months only with a year or a preposition
      if ((m && tok === 'sept') || (!m && tok === 'may')) {
        const prevTok = tokens[i - 1] || '';
        const nextTok = tokens[i + 1] || '';
        m = /^20\d\d$/.test(nextTok) || ['in', 'for', 'of', 'during', 'en', 'de', 'd', 'pour', 'mois', 'au'].includes(prevTok) ? (tok === 'may' ? 5 : 9) : null;
      }
      if (!m && tok.length >= 5 && !LEXICON.has(tok)) {
        for (const [n, names] of MONTHS) {
          if (names.some((w) => w.length >= 5 && fuzzy(tok, w))) { m = n; break; }
        }
      }
      if (m) found.push({ m, i });
    });
    const s = tokens.join(' ');
    if (!found.length) {
      if (ctx && ctx.kind === 'month' && /\b(this month|that month|ce mois|ce mois ci|meme mois)\b/.test(s)) return { id: ctx.id, score: 4 };
      return null;
    }
    const distinct = new Set(found.map((f) => f.m));
    const first = found[0];
    const yearTok = tokens.find((x) => /^20\d\d$/.test(x));
    let id = null;
    if (yearTok) id = `${yearTok}-${pad2(first.m)}`;
    else {
      const row = App.rec.months.find((r) => Number(r.id.slice(5, 7)) === first.m);
      id = row ? row.id : null;
    }
    const payWord = tokens.some((x) => PAY_WORDS.has(x));
    return { id, multi: distinct.size > 1, score: distinct.size > 1 ? 1.5 : 3.5 + (payWord ? 0.5 : 0) };
  }

  /** Classify a question. Returns { intent, score, monthId?, scores }. */
  function detect(raw, ctx) {
    ensureCompiled();
    const s = prep(raw);
    const tokens = s ? s.split(' ') : [];
    if (!tokens.length) return { intent: 'fallback', score: 0, scores: {} };
    const scores = {};
    for (const [id, pats, neg] of COMPILED) {
      let sc = 0;
      for (const [c, w] of pats) if (matches(c, s, tokens)) sc += w;
      if (sc > 0) for (const [c, w] of neg) if (matches(c, s, tokens)) sc -= w;
      if (sc > 0) scores[id] = sc;
    }
    const mo = detectMonth(tokens, ctx);
    if (mo && mo.id) scores.month = mo.score;
    const termId = termOnly(tokens);
    if (termId && TERM_INTENT[termId]) scores[TERM_INTENT[termId]] = Math.max(scores[TERM_INTENT[termId]] || 0, 5);
    else if (termId) scores.term = 5;
    // A question spanning several months is about the period, not one month
    if (mo && mo.multi) scores.relief = (scores.relief || 0) + 2;
    let best = null;
    for (const id of PRIORITY) if (scores[id] !== undefined && (best === null || scores[id] > scores[best])) best = id;
    if (best && scores[best] >= THRESHOLD) {
      const out = { intent: best, score: scores[best], scores };
      if (best === 'month') {
        out.monthId = mo.id;
        out.monthLabel = App.fmt.date(mo.id, 'monthYear');
      }
      if (best === 'term') out.termId = termId;
      return out;
    }
    if (ctx && ctx.kind !== 'general' && DEICTIC.test(s)) return { intent: 'context', score: 0, scores };
    return { intent: 'fallback', score: best ? scores[best] : 0, scores };
  }

  /* ------------------------------------------------------------------ */
  /* Public, pure answer function                                        */
  /* ------------------------------------------------------------------ */

  const VALID_IDS = {
    card: () => App.CHANGE_CARDS,
    summary: () => App.SUMMARY_CARDS,
    clause: () => App.CLAUSES,
    term: () => App.TERMS,
    chapter: () => App.CHAPTERS,
    resource: () => App.RESOURCES,
    chart: () => ['payments', 'balance'],
    infographic: () => ['relief', 'cost'],
    section: () => [...App.SECTIONS, ...App.EXTRA_ROUTES],
  };

  function validId(kind, id) {
    if (!id) return false;
    if (kind === 'month') return App.rec.isMonthId(id);
    if (VALID_IDS[kind]) return VALID_IDS[kind]().includes(id);
    return kind === 'faq';
  }

  function normCtx(ctx) {
    const c = ctx && typeof ctx === 'object' ? ctx : {};
    let kind = KINDS.includes(c.kind) ? c.kind : 'general';
    const id = c.id !== undefined && c.id !== null ? String(c.id).replace(/[^a-z0-9_-]/gi, '').slice(0, 40) : '';
    if (kind !== 'general' && !validId(kind, id)) kind = 'general';
    const out = { kind, id: kind === 'general' ? null : id };
    if (c.section) out.section = String(c.section).replace(/[^a-z0-9-]/gi, '').slice(0, 20);
    if (c.period) out.period = String(c.period).replace(/[^a-z0-9]/gi, '').slice(0, 6);
    if (c.fid) out.fid = String(c.fid).slice(0, 80);
    if (c.topic) out.topic = String(c.topic).replace(/[^a-z]/gi, '').slice(0, 20);
    return out;
  }

  function clean(text) {
    return String(text === undefined || text === null ? '' : text)
      .replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_LEN);
  }

  /**
   * answer(input, ctx) - pure: builds an answer object without touching the
   * conversation. input: question text, { intent, monthId }, or empty for the
   * contextual explanation of ctx.
   * Returns { intent, text, fact, source:{label,target,text}, askPerson, topic, suggestions, lang }.
   */
  function answer(input, ctx) {
    const c = normCtx(ctx);
    const v = vals();
    if (input && typeof input === 'object') {
      if (input.intent === 'month' && input.monthId) return monthAnswer(String(input.monthId), v);
      if (input.intent) return intentAnswer(input.intent, v);
    }
    const q = clean(input);
    if (!q) return contextAnswer(c, v) || intentAnswer('greeting', v);
    return fromDetection(detect(q, c), v, c);
  }

  /* ------------------------------------------------------------------ */
  /* Conversation state                                                  */
  /* ------------------------------------------------------------------ */

  function pushMsg(msg) {
    const st = state();
    st.seq += 1;
    const m = { id: `m${st.seq}`, lang: App.i18n.locale, ...msg };
    st.messages.push(m);
    if (st.messages.length > MAX_MESSAGES) st.messages.splice(0, st.messages.length - MAX_MESSAGES);
    return m;
  }

  function suggestionLabel(id) {
    return T(`suggestions.${id}`, vals());
  }

  // Store resolved text so earlier messages keep their original language
  function storeAnswer(a, ctx, ctxKey) {
    return pushMsg({
      role: 'clair',
      intent: a.intent,
      text: a.text,
      fact: a.fact,
      factLabel: T('supportingFact'),
      source: a.source ? { target: a.source.target, label: a.source.label, text: a.source.text } : null,
      askPerson: !!a.askPerson,
      askLabel: T('askPerson'),
      topic: a.topic,
      suggestions: a.suggestions ? a.suggestions.map((id) => ({ id, label: suggestionLabel(id) })) : null,
      ctx: ctx && ctx.kind !== 'general' ? { kind: ctx.kind, id: ctx.id } : null,
      ctxKey: ctxKey || null,
    });
  }

  // "Explain: <item>" - short titles for clauses, terms and chapters (the chip keeps the full label),
  // the question itself for FAQs, and quotes around any other label that already contains a colon.
  function explainText(ctx) {
    const faqIntent = ctx.kind === 'faq' ? FAQ_MAP[ctx.id] : null;
    let item;
    if (faqIntent && App.i18n.has(`clair.suggestions.${faqIntent}`)) item = suggestionLabel(faqIntent);
    else if (ctx.kind === 'clause') item = t(`clauses.${ctx.id}`);
    else if (ctx.kind === 'term') item = t(`glossary.${ctx.id}.term`);
    else if (ctx.kind === 'chapter') item = t(`chapters.${ctx.id}`);
    else item = App.ui.itemLabel(ctx);
    return T(/:\s/.test(item) && !['clause', 'term', 'chapter', 'faq'].includes(ctx.kind) ? 'explainQuoted' : 'explainPrefix', { item });
  }

  function addContextExchange(ctx) {
    const st = state();
    const key = `${ctx.kind}:${ctx.id}`;
    const msgs = st.messages;
    const last = msgs[msgs.length - 1];
    if (last && last.role === 'clair' && last.ctxKey === key && last.lang === App.i18n.locale && msgs.length > 1) {
      return { user: msgs[msgs.length - 2], clair: last, answer: null };
    }
    const user = pushMsg({ role: 'user', text: explainText(ctx), ctxKey: key });
    const a = answer(null, ctx);
    const clair = storeAnswer(a, ctx, key);
    return { user, clair, answer: a };
  }

  function currentSuggestions() {
    const st = state();
    const ctx = st.activeCtx || GENERAL;
    const base = CTX_SUGG[`${ctx.kind}:${ctx.id}`] || CTX_SUGG[ctx.kind] || CTX_SUGG.general;
    const asked = new Set(st.messages.filter((m) => m.role === 'clair').map((m) => m.intent));
    const out = [];
    for (const id of [...base, ...POOL]) {
      if (out.length >= 4) break;
      if (!asked.has(id) && !out.includes(id)) out.push(id);
    }
    for (const id of base) { if (out.length >= 3) break; if (!out.includes(id)) out.push(id); }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Rendering                                                           */
  /* ------------------------------------------------------------------ */

  // Sentence ends are punctuation followed by a space or the end ("8.00%" and "$1,573.33" are not)
  function sentences(text) {
    const out = [];
    const re = /[.!?]+(?=\s|$)/g;
    let start = 0;
    let m;
    while ((m = re.exec(text))) {
      const end = m.index + m[0].length;
      out.push(text.slice(start, end).trim());
      start = end;
    }
    if (text.slice(start).trim()) out.push(text.slice(start).trim());
    return out;
  }

  function shortForm(text) {
    const parts = sentences(String(text));
    let out = '';
    for (const p of parts) {
      const next = `${out} ${p.trim()}`.trim();
      if (out && next.length > 200) break;
      out = next;
    }
    return out.length > 240 ? `${out.slice(0, 237)}…` : out;
  }

  function announceAnswer(a) {
    if (a) App.announce(T('announce', { text: shortForm(a.text) }));
  }

  // Keep a trailing icon on the same line as the label's last word
  function withTrailingIcon(text, iconEl) {
    const i = text.lastIndexOf(' ');
    const head = i > 0 ? text.slice(0, i + 1) : '';
    return [head, h('span', { class: 'clair-nowrap' }, i > 0 ? text.slice(i + 1) : text, '\u00a0', iconEl)];
  }

  function langTag(m) {
    if (m.lang === App.i18n.locale) return null;
    return h('span', { class: 'clair-lang', lang: App.i18n.locale }, T('inLanguage', { language: App.i18n.languageName(m.lang) }));
  }

  function renderMsg(m) {
    if (m.role === 'user') {
      return h('div', { class: 'clair-msg clair-msg--user', lang: m.lang, 'data-msg': m.id },
        h('span', { class: 'sr-only' }, TL('youSaid', null, m.lang), ' '),
        h('p', { class: 'clair-msg-text' }, m.text),
        langTag(m));
    }
    const actions = [];
    if (m.source) {
      // Text link with a trailing red arrow that stays on the last line of the label
      actions.push(h('a', {
        class: 'btn btn-link clair-source',
        href: m.source.target,
        fid: `clair-src-${m.id}`,
        on: { click: (e) => { e.preventDefault(); followSource(m.source); } },
      }, h('span', { class: 'btn-label' }, withTrailingIcon(m.source.text, App.ui.icon('arrowRight', { class: 'icon-after', size: 18 })))));
    }
    if (m.askPerson) {
      actions.push(App.ui.button({
        label: m.askLabel,
        kind: 'chip',
        iconName: 'person',
        fid: `clair-ask-${m.id}`,
        className: 'clair-ask',
        onClick: (e) => askPerson(m, e.currentTarget),
      }));
    }
    return h('div', { class: 'clair-msg clair-msg--clair', lang: m.lang, 'data-msg': m.id, 'data-intent': m.intent },
      h('span', { class: 'sr-only' }, TL('clairSaid', null, m.lang), ' '),
      h('p', { class: 'clair-msg-text' }, m.text),
      m.fact ? h('div', { class: 'clair-fact' },
        h('span', { class: 'clair-fact-label' }, m.factLabel),
        h('span', { class: 'clair-fact-text' }, m.fact)) : null,
      m.suggestions ? h('ul', { class: 'clair-chips clair-chips--inline' }, m.suggestions.map((s) => h('li', null,
        App.ui.button({ label: s.label, kind: 'chip', fid: `clair-isugg-${m.id}-${s.id}`, className: 'clair-chip-btn', onClick: () => askSuggestion(s.id, null) })))) : null,
      actions.length ? h('div', { class: ['clair-actions', m.suggestions ? 'clair-actions--split' : null] }, actions) : null,
      langTag(m));
  }

  function greetingBubble() {
    return h('div', { class: 'clair-msg clair-msg--clair clair-msg--greeting', lang: App.i18n.locale, 'data-intent': 'intro' },
      h('p', { class: 'clair-msg-text' }, T('greeting')));
  }

  function renderContext() {
    if (!refs) return;
    const st = state();
    const ctx = st.activeCtx || GENERAL;
    const label = App.ui.itemLabel(ctx);
    const labelId = 'clair-context-label';
    refs.chip = h('span', { class: ['chip', 'clair-chip', ctx.kind === 'general' ? 'clair-chip--general' : null], tabindex: '-1' },
      h('span', { class: 'chip-text' }, label),
      ctx.kind !== 'general' ? h('button', {
        type: 'button',
        class: 'btn btn-icon clair-chip-remove',
        fid: 'clair-ctx-remove',
        'aria-label': T('contextRemove', { item: label }),
        on: { click: removeContext },
      }, App.ui.icon('close', { size: 16 })) : null);
    App.util.clear(refs.ctxRow).append(h('span', { class: 'clair-context-label', id: labelId }, T('contextLabel')), refs.chip);
  }

  function renderLog() {
    if (!refs) return;
    const msgs = state().messages;
    App.util.clear(refs.log);
    if (!msgs.length) refs.log.appendChild(greetingBubble());
    msgs.forEach((m) => refs.log.appendChild(renderMsg(m)));
  }

  function appendMsgs(list) {
    if (!refs) return;
    const greet = refs.log.querySelector('.clair-msg--greeting');
    if (greet) greet.remove();
    list.forEach((m) => { if (m && !refs.log.querySelector(`[data-msg="${m.id}"]`)) refs.log.appendChild(renderMsg(m)); });
  }

  function renderSuggestions() {
    if (!refs) return;
    const msgs = state().messages;
    const last = msgs[msgs.length - 1];
    const ids = currentSuggestions();
    const titleId = 'clair-suggest-title';
    App.util.clear(refs.suggest).append(
      h('h3', { class: 'clair-suggest-title', id: titleId }, T('suggestedTitle')),
      h('ul', { class: 'clair-chips' }, ids.map((id, i) => h('li', null, App.ui.button({
        label: suggestionLabel(id),
        kind: 'chip',
        fid: `clair-sugg-${i}`,
        className: 'clair-chip-btn',
        attrs: { 'data-suggestion': id },
        onClick: () => askSuggestion(id, i),
      })))));
    refs.suggest.setAttribute('aria-labelledby', titleId);
    refs.suggest.hidden = !!(last && last.role === 'clair' && last.suggestions);
  }

  // "Clair — Your financing guide": the name and descriptor are styled on two
  // lines; the full title (with its dash) stays in the heading's text.
  function renderTitle() {
    const el = refs.api.el.querySelector('.overlay-title');
    if (!el) return;
    const full = T('title');
    const at = full.indexOf(' — ');
    App.util.clear(el);
    if (at > 0) {
      el.append(
        h('span', { class: 'clair-title-name' }, full.slice(0, at)),
        h('span', { class: 'sr-only' }, ' — '),
        h('span', { class: 'clair-title-desc' }, full.slice(at + 3)));
    } else {
      el.append(full);
    }
  }

  function statusSegments(el) {
    const parts = T('status').split(' • ');
    // The last phrase ("No live AI connection.") never breaks across lines
    App.util.clear(el).append(...parts.map((part, i) => (i < parts.length - 1 ? `${part} • ` : h('span', { class: 'clair-status-key' }, part))));
    return el;
  }

  function renderChrome() {
    if (!refs) return;
    renderTitle();
    statusSegments(refs.statusText);
    const closeBtn = refs.api.el.querySelector('.overlay-close');
    if (closeBtn) {
      closeBtn.setAttribute('aria-label', t('common.close'));
      const txt = closeBtn.querySelector('.overlay-close-text');
      if (txt) txt.textContent = t('common.close');
    }
    refs.log.setAttribute('aria-label', T('logLabel'));
    refs.label.textContent = T('inputLabel');
    refs.input.setAttribute('placeholder', T('placeholder'));
    refs.hint.textContent = T('hint');
    const sendLabel = refs.send.querySelector('.btn-label');
    if (sendLabel) sendLabel.textContent = T('send');
    if (!refs.error.hidden) refs.error.textContent = T('emptyError');
    updateCounter();
  }

  function renderAll() {
    renderChrome();
    renderContext();
    renderLog();
    renderSuggestions();
  }

  function scrollToMsg(id, mode = 'start', smooth = true) {
    if (!refs) return;
    requestAnimationFrame(() => {
      if (!refs) return;
      const sc = refs.scroll;
      const el = id ? refs.log.querySelector(`[data-msg="${id}"]`) : null;
      let top;
      if (el && mode === 'start') top = Math.max(0, el.offsetTop - 12);
      else top = sc.scrollHeight;
      try { sc.scrollTo({ top, behavior: smooth && !App.util.prefersReducedMotion() ? 'smooth' : 'auto' }); } catch (e) { sc.scrollTop = top; }
    });
  }

  function updateCounter() {
    if (!refs) return;
    const n = refs.input.value.length;
    const show = n >= MAX_LEN - 60;
    refs.counter.hidden = !show;
    refs.counter.textContent = show ? T('counter', { n: App.fmt.number(n), max: App.fmt.number(MAX_LEN) }) : '';
  }

  function setError(on) {
    if (!refs) return;
    refs.error.hidden = !on;
    refs.error.textContent = on ? T('emptyError') : '';
    if (on) refs.input.setAttribute('aria-invalid', 'true'); else refs.input.removeAttribute('aria-invalid');
  }

  function onSubmit(e) {
    e.preventDefault();
    const q = clean(refs.input.value);
    if (!q) {
      setError(true);
      App.util.focusEl(refs.input);
      App.announce(T('emptyError'), true);
      return;
    }
    setError(false);
    refs.input.value = '';
    state().draft = '';
    updateCounter();
    ask(q);
    App.util.focusEl(refs.input, { preventScroll: true });
  }

  function askSuggestion(id, index) {
    ask(suggestionLabel(id), { intent: id });
    if (!refs) return;
    requestAnimationFrame(() => {
      if (!refs) return;
      const chips = refs.suggest.hidden ? [] : [...refs.suggest.querySelectorAll('button')];
      const target = (index !== null && chips[Math.min(index, chips.length - 1)]) || chips[0] || refs.input;
      App.util.focusEl(target, { preventScroll: true });
    });
  }

  function removeContext() {
    const st = state();
    st.activeCtx = { ...GENERAL };
    renderContext();
    renderSuggestions();
    if (refs && refs.chip) App.util.focusEl(refs.chip, { preventScroll: true });
    App.announce(T('contextRemoved'));
  }

  function originInfo() {
    const st = state();
    const opened = st.openedCtx || GENERAL;
    return {
      ctx: opened.kind !== 'general' ? { kind: opened.kind, id: opened.id } : null,
      fid: opened.fid || st.triggerFid || null,
    };
  }

  /** Source link: close the panel, open the supporting place, keep a way back. */
  function followSource(src) {
    if (!src || !src.target) return;
    const origin = originInfo();
    App.overlay.close('source', { silent: true });
    goAndFocus(src.target, origin);
  }

  function goAndFocus(target, origin) {
    const hasItem = !!App.router.parse(target).item;
    App.router.go(target, { origin: { fid: origin.fid, ctx: origin.ctx }, focus: hasItem ? 'item' : 'heading' });
    // Safety net: if the target view did not take focus (no focusable item), use its heading.
    setTimeout(() => {
      const a = document.activeElement;
      if (!a || a === document.body || a === document.documentElement) App.router.focusHeading();
    }, 120);
  }

  /** "Ask a person": prepare a local demo question with the item and topic. */
  function askPerson(m, btn) {
    const st = state();
    const base = m.ctx || (st.activeCtx && st.activeCtx.kind !== 'general' ? st.activeCtx : null) || st.openedCtx || GENERAL;
    const ctx = { ...base, section: base.section || App.router.current().section, topic: m.topic || 'other', fid: (st.openedCtx && st.openedCtx.fid) || st.triggerFid || null };
    if (App.query && typeof App.query.open === 'function') {
      App.query.open(ctx, btn);
      return;
    }
    const origin = originInfo();
    App.overlay.close('ask', { silent: true });
    goAndFocus('#/help/ask', origin);
  }

  function build(body, api, statusEl) {
    refs = { api, body, status: statusEl, statusText: statusEl.querySelector('.clair-status-text') };
    const heading = api.el.querySelector('.overlay-heading');
    if (heading) heading.insertBefore(h('span', { class: 'clair-avatar', 'aria-hidden': 'true' }, App.ui.icon('sparkle', { size: 22 })), heading.firstChild);
    // The demo status runs full width under the title row and describes the dialog
    const header = api.el.querySelector('.overlay-header');
    if (header) header.appendChild(statusEl);
    api.el.setAttribute('aria-describedby', 'clair-status');
    refs.ctxRow = h('div', { class: 'clair-context' });
    // role="log" for structure; announcements go through App.announce in short form
    refs.log = h('div', { class: 'clair-log', role: 'log', 'aria-live': 'off', 'aria-label': T('logLabel') });
    refs.suggest = h('section', { class: 'clair-suggest' });
    refs.scroll = h('div', { class: 'clair-scroll' }, refs.ctxRow, refs.log, refs.suggest);

    const inputId = 'clair-input';
    const hintId = 'clair-hint';
    const errorId = 'clair-error';
    refs.label = h('label', { class: 'sr-only', for: inputId }, T('inputLabel'));
    refs.input = h('input', {
      type: 'text',
      id: inputId,
      class: 'input clair-input',
      maxlength: String(MAX_LEN),
      autocomplete: 'off',
      spellcheck: 'true',
      enterkeyhint: 'send',
      placeholder: T('placeholder'),
      'aria-describedby': `${hintId} ${errorId}`,
      fid: 'clair-input',
      value: state().draft || '',
      on: { input: () => { state().draft = refs.input.value; updateCounter(); if (!refs.error.hidden && refs.input.value.trim()) setError(false); } },
    });
    refs.send = App.ui.button({ label: T('send'), kind: 'primary', iconAfter: 'arrowRight', fid: 'clair-send', className: 'clair-send', attrs: { type: 'submit' } });
    refs.error = h('p', { class: 'field-error clair-error', id: errorId, hidden: true });
    refs.hint = h('p', { class: 'clair-hint', id: hintId }, T('hint'));
    refs.counter = h('p', { class: 'clair-counter', hidden: true });
    refs.form = h('form', { class: 'clair-form', novalidate: true, on: { submit: onSubmit } },
      refs.label,
      h('div', { class: 'clair-input-row' }, refs.input, refs.send),
      refs.error,
      h('div', { class: 'clair-form-meta' }, refs.hint, refs.counter));
    body.classList.add('clair-body');
    body.append(refs.scroll, refs.form);
    renderAll();
  }

  /* ------------------------------------------------------------------ */
  /* Public API                                                          */
  /* ------------------------------------------------------------------ */

  /** Open Clair. ctx: { kind, id, section, period, fid }; trigger: element to return focus to. */
  function open(ctxIn, trigger) {
    const ctx = normCtx(ctxIn || GENERAL);
    const st = state();
    let trig = trigger || null;
    // A trigger inside a glossary popover disappears when the panel opens: return to its term instead.
    if (trig && trig.closest && trig.closest('.popover') && App.popover && App.popover.current()) trig = App.popover.current().trigger;
    const fidHost = trig && trig.closest ? trig.closest('[data-fid]') : null;
    st.triggerFid = ctx.fid || (fidHost ? fidHost.getAttribute('data-fid') : null);
    st.openedCtx = ctx;
    st.activeCtx = ctx;

    let added = null;
    if (ctx.kind !== 'general') {
      App.events.log('explain_requested', { id: `${ctx.kind}:${ctx.id}` });
      added = addContextExchange(ctx);
    }

    if (refs && App.overlay.isOpen('clair')) {
      renderAll();
    } else {
      const statusEl = h('p', { class: 'clair-status', id: 'clair-status' }, App.ui.icon('info', { size: 16 }), statusSegments(h('span', { class: 'clair-status-text' })));
      App.overlay.open({
        id: 'clair',
        variant: 'panel',
        className: 'clair-overlay',
        title: T('title'),
        titleExtra: statusEl,
        trigger: trig,
        render: (body, api) => build(body, api, statusEl),
        onClose: () => { refs = null; },
      });
    }
    if (added) {
      scrollToMsg(added.user.id, 'start', false);
      announceAnswer(added.answer || { text: added.clair.text });
    } else if (st.messages.length) {
      scrollToMsg(null, 'end', false);
    }
  }

  /** Ask a question (adds it to the conversation, opening the panel if needed). */
  function ask(text, opts = {}) {
    const q = clean(text);
    if (!q) return null;
    if (!(refs && App.overlay.isOpen('clair'))) open({ kind: 'general', section: App.router.current().section }, opts.trigger || null);
    const st = state();
    const ctx = st.activeCtx || GENERAL;
    const user = pushMsg({ role: 'user', text: q });
    const a = opts.intent ? answer({ intent: opts.intent }, ctx) : answer(q, ctx);
    const clair = storeAnswer(a, ctx);
    appendMsgs([user, clair]);
    renderSuggestions();
    scrollToMsg(user.id, 'start');
    announceAnswer(a);
    return a;
  }

  function close() {
    if (App.overlay.isOpen('clair')) App.overlay.close('api');
  }

  App.i18n.onChange(() => {
    if (!refs || !App.overlay.isOpen('clair')) return;
    const active = document.activeElement;
    const fidEl = active && active.closest ? active.closest('[data-fid]') : null;
    const fid = fidEl && refs.api.el.contains(fidEl) ? fidEl.getAttribute('data-fid') : null;
    const scrollTop = refs.scroll.scrollTop;
    renderAll();
    refs.scroll.scrollTop = scrollTop;
    if (fid) {
      const el = App.util.findByFid(fid, refs.api.el);
      if (el) App.util.focusEl(el, { preventScroll: true });
    }
  });

  App.session.onReset(() => {
    if (App.overlay.isOpen('clair')) App.overlay.close('reset', { silent: true });
    refs = null;
  });

  App.clair = { open, ask, answer, close, detect, _prep: prep, isOpen: () => App.overlay.isOpen('clair') };
})();
