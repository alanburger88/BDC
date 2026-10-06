/* IssuedRecord: the frozen, build-validated synthetic notice. Nothing in the
 * experience may mutate it. Object.freeze is a demo safeguard only - it is
 * not cryptographic integrity or legal immutability. */
App.readEmbeddedJSON = (id) => {
  const el = document.getElementById(id);
  if (!el) return null;
  try {
    return JSON.parse(el.textContent);
  } catch (e) {
    console.error(`Embedded data ${id} could not be parsed`, e);
    return null;
  }
};

App.deepFreeze = function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    Object.values(o).forEach(deepFreeze);
  }
  return o;
};

App.record = App.deepFreeze(App.readEmbeddedJSON('data-record') || {});
App.build = App.deepFreeze(App.readEmbeddedJSON('data-build') || {});
App.assets = App.deepFreeze(App.readEmbeddedJSON('data-assets') || {});

App.rec = (() => {
  const R = App.record;
  const comparison = R.comparison || [];
  const byId = new Map(comparison.map((c) => [c.id, c]));

  return {
    // All comparison months (63): { index, id:'2026-11', date, original|null, revised|null, differenceCents, interestDifferenceCents }
    months: comparison,
    month(id) { return byId.get(id) || null; },
    isMonthId(id) { return byId.has(id); },
    // Months for a filter: '3' | '6' | 'all'
    range(range) {
      if (range === '3') return comparison.slice(0, 3);
      if (range === '6') return comparison.slice(0, 6);
      return comparison;
    },
    years: R.comparisonYears || [],
    monthsInYear(year) { return comparison.filter((c) => c.date.startsWith(String(year))); },
    // Fictional client display name helpers (names are never put in routes or events)
    clientName() { return `${R.client.givenName} ${R.client.familyName}`; },
    // Months of the postponement period (first `change.months` rows of the revised schedule)
    postponementMonths() { return R.revisedSchedule.slice(0, R.change.months); },
    nextPayment() { return R.revisedSchedule[0]; },
    firstResumed() { return R.revisedSchedule[R.change.months]; },
  };
})();

/* Canonical identifiers shared across modules. Titles live in the core
 * content dictionary so every module (and Clair) can label them. */
App.SECTIONS = Object.freeze(['overview', 'changes', 'payments', 'documents', 'support', 'help']);
App.EXTRA_ROUTES = Object.freeze(['insights']);

// Formal notice clauses: route #/documents/<id>, element id "clause-<id>"
App.CLAUSES = Object.freeze(['purpose', 'amendment', 'postponement', 'interest', 'resumption', 'maturity', 'cost', 'unchanged', 'action', 'schedule', 'assumptions', 'contact']);

// What-changed card ids: route #/changes/<id>
App.CHANGE_CARDS = Object.freeze(['principal', 'interest', 'next-payment', 'maturity', 'fees', 'rate', 'debt']);

// Overview summary cards
App.SUMMARY_CARDS = Object.freeze(['next-payment', 'resume', 'relief', 'extra-interest']);

// Glossary term ids
App.TERMS = Object.freeze(['principal', 'interest', 'postponement', 'instalment', 'maturity', 'outstanding', 'fixedRate', 'cashFlow', 'amortisation', 'capitalisedInterest']);

// Video chapters (match narration cue manifests)
App.CHAPTERS = Object.freeze(['welcome', 'relief', 'difference', 'tradeoff', 'resume', 'next-step']);

// Support resources
App.RESOURCES = Object.freeze(['financial-management', 'working-capital', 'learning']);

/* Responsible demo rule (configurable, not a claimed BDC policy): when a
 * hardship or arrears flag is present, suppress additional-borrowing
 * promotion and prioritise help. The fixture has no such flag. */
App.config = {
  rules: {
    suppressBorrowingPromotion() {
      const c = App.record.client || {};
      const sim = App.session && App.session.slice('presenter', () => ({ simulateHardship: false })).simulateHardship;
      return !!(c.hardship || c.arrears || sim);
    },
  },
  queryMaxLength: 1000,
};
