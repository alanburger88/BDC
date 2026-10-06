// Creation-time fixture tooling: regenerates both schedules from the issued
// inputs, reconciles them against the supplied fixture and derives the frozen
// month-by-month comparison that the SPA presents. Nothing here runs in the
// delivered notice; the SPA only reads the validated output.
import { readFileSync } from 'node:fs';

const DAYS_IN_MONTH = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const pad = (n) => String(n).padStart(2, '0');

export function monthEnd(y, m) {
  // m is 1-12; returns ISO yyyy-mm-dd for the last calendar day
  return `${y}-${pad(m)}-${pad(DAYS_IN_MONTH(y, m))}`;
}

export function monthId(iso) {
  return iso.slice(0, 7);
}

// interest = opening * rate / 12, rounded half-up to cents, integer maths only
export function monthlyInterestCents(openingCents, annualRateBasisPoints) {
  const num = BigInt(openingCents) * BigInt(annualRateBasisPoints);
  const den = 10000n * 12n;
  return Number((num * 2n + den) / (den * 2n));
}

export function buildSchedule({ startYear, startMonth, principalCents, rateBp, monthlyPrincipalCents, zeroPrincipalMonths }) {
  const rows = [];
  let opening = principalCents;
  let y = startYear;
  let m = startMonth;
  let i = 0;
  while (opening > 0) {
    const principal = i < zeroPrincipalMonths ? 0 : Math.min(monthlyPrincipalCents, opening);
    const interest = monthlyInterestCents(opening, rateBp);
    const closing = opening - principal;
    rows.push({
      date: monthEnd(y, m),
      openingPrincipalCents: opening,
      principalCents: principal,
      interestCents: interest,
      totalCents: principal + interest,
      closingPrincipalCents: closing,
    });
    opening = closing;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
    i += 1;
    if (i > 1000) throw new Error('Schedule did not terminate');
  }
  return rows;
}

const sum = (rows, key) => rows.reduce((a, r) => a + r[key], 0);

export function loadAndValidateFixture(path) {
  const fx = JSON.parse(readFileSync(path, 'utf8'));
  const errors = [];
  const check = (cond, msg) => { if (!cond) errors.push(msg); };

  const [sy, sm] = fx.effectiveDate.split('-').map(Number);
  const common = {
    startYear: sy,
    startMonth: sm,
    principalCents: fx.loan.principalAtScheduleStartCents,
    rateBp: fx.loan.annualRateBasisPoints,
    monthlyPrincipalCents: fx.loan.monthlyPrincipalCents,
  };
  const original = buildSchedule({ ...common, zeroPrincipalMonths: 0 });
  const revised = buildSchedule({ ...common, zeroPrincipalMonths: fx.change.months });

  // 1. Regenerated schedules must match the frozen fixture row for row.
  for (const [name, regen, frozen] of [['original', original, fx.originalSchedule], ['revised', revised, fx.revisedSchedule]]) {
    check(regen.length === frozen.length, `${name}: expected ${regen.length} rows, fixture has ${frozen.length}`);
    regen.forEach((r, i) => {
      const f = frozen[i];
      if (!f) return;
      for (const k of Object.keys(r)) {
        check(r[k] === f[k], `${name}[${i}].${k}: regenerated ${r[k]} != fixture ${f[k]}`);
      }
    });
  }

  // 2. Structural requirements from the PRD.
  check(fx.originalSchedule.length === 60, 'original schedule must have 60 payments');
  check(fx.revisedSchedule.length === 63, 'revised schedule must have 63 payments');
  check(fx.revisedSchedule.slice(0, 3).every((r) => r.principalCents === 0), 'first three revised rows must be zero-principal');
  check(fx.revisedSchedule.slice(3).every((r) => r.principalCents === 400000), 'remaining revised rows must be 4,000.00 principal');
  check(fx.originalSchedule.at(-1).closingPrincipalCents === 0, 'original schedule must end at zero');
  check(fx.revisedSchedule.at(-1).closingPrincipalCents === 0, 'revised schedule must end at zero');
  check(fx.originalSchedule.at(-1).date === fx.change.originalMaturity, 'original maturity mismatch');
  check(fx.revisedSchedule.at(-1).date === fx.change.revisedMaturity, 'revised maturity mismatch');
  check(fx.revisedSchedule[3].date === fx.change.resumePrincipalDate, 'resume principal date mismatch');
  for (const s of [fx.originalSchedule, fx.revisedSchedule]) {
    s.forEach((r, i) => {
      check(r.totalCents === r.principalCents + r.interestCents, `total != principal + interest at ${r.date}`);
      check(r.closingPrincipalCents === r.openingPrincipalCents - r.principalCents, `closing mismatch at ${r.date}`);
      if (i > 0) check(r.openingPrincipalCents === s[i - 1].closingPrincipalCents, `opening != prior closing at ${r.date}`);
    });
  }

  // 3. Derived values and reconciliations (Section 3 of the PRD).
  const d = fx.derived;
  const oInt = sum(fx.originalSchedule, 'interestCents');
  const rInt = sum(fx.revisedSchedule, 'interestCents');
  const oTot = sum(fx.originalSchedule, 'totalCents');
  const rTot = sum(fx.revisedSchedule, 'totalCents');
  const o3 = sum(fx.originalSchedule.slice(0, 3), 'totalCents');
  const r3 = sum(fx.revisedSchedule.slice(0, 3), 'totalCents');
  const oInt3 = sum(fx.originalSchedule.slice(0, 3), 'interestCents');
  const rInt3 = sum(fx.revisedSchedule.slice(0, 3), 'interestCents');
  const deferred = sum(fx.originalSchedule.slice(0, 3), 'principalCents') - sum(fx.revisedSchedule.slice(0, 3), 'principalCents');
  check(oInt === d.originalTotalInterestCents && oInt === 4880000, `original interest ${oInt}`);
  check(rInt === d.revisedTotalInterestCents && rInt === 5360000, `revised interest ${rInt}`);
  check(rInt - oInt === d.additionalLifetimeInterestCents && d.additionalLifetimeInterestCents === 480000, 'additional lifetime interest');
  check(oTot === d.originalTotalPaymentsCents && oTot === 28880000, `original total payments ${oTot}`);
  check(rTot === d.revisedTotalPaymentsCents && rTot === 29360000, `revised total payments ${rTot}`);
  check(o3 === 1672000, `original Nov-Jan payments ${o3}`);
  check(r3 === 480000, `revised Nov-Jan payments ${r3}`);
  check(o3 - r3 === d.nearTermPaymentReductionCents && d.nearTermPaymentReductionCents === 1192000, 'near-term reduction');
  check(rInt3 - oInt3 === d.additionalInterestFirstThreeMonthsCents && d.additionalInterestFirstThreeMonthsCents === 8000, 'extra interest in first three months');
  check(deferred === d.principalDeferredCents && deferred === 1200000, 'principal deferred');
  check(deferred - (rInt3 - oInt3) === d.nearTermPaymentReductionCents, '12,000 - 80 = 11,920 reconciliation');
  check(fx.revisedSchedule.slice(0, 3).every((r) => r.interestCents === 160000), 'postponement interest must be 1,600.00 per month');
  check(fx.revisedSchedule[3].totalCents === 560000, 'first resumed payment must be 5,600.00');
  check(fx.change.feeCents === 0, 'fee must be 0');
  check(fx.change.acceptanceRequired === false, 'acceptance must not be required');

  if (errors.length) {
    const e = new Error(`Fixture validation failed:\n - ${errors.join('\n - ')}`);
    e.errors = errors;
    throw e;
  }

  // 4. Frozen month-by-month comparison (creation-time derived, not runtime arithmetic).
  const byMonth = new Map();
  for (const r of fx.originalSchedule) byMonth.set(monthId(r.date), { id: monthId(r.date), date: r.date, original: r, revised: null });
  for (const r of fx.revisedSchedule) {
    const e = byMonth.get(monthId(r.date)) || { id: monthId(r.date), date: r.date, original: null, revised: null };
    e.revised = r;
    byMonth.set(e.id, e);
  }
  const comparison = [...byMonth.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e, index) => ({
      index,
      id: e.id,
      date: e.date,
      original: e.original,
      revised: e.revised,
      // revised minus original total payment for the month (negative = lower payment)
      differenceCents: (e.revised ? e.revised.totalCents : 0) - (e.original ? e.original.totalCents : 0),
      interestDifferenceCents: (e.revised ? e.revised.interestCents : 0) - (e.original ? e.original.interestCents : 0),
    }));

  const years = [...new Set(comparison.map((c) => c.date.slice(0, 4)))];

  return {
    ...fx,
    derived: {
      ...fx.derived,
      originalNearTermPaymentsCents: o3,
      revisedNearTermPaymentsCents: r3,
      postponementMonthlyInterestCents: fx.revisedSchedule[0].interestCents,
      firstResumedPaymentCents: fx.revisedSchedule[3].totalCents,
      firstResumedInterestCents: fx.revisedSchedule[3].interestCents,
      originalPaymentCount: fx.originalSchedule.length,
      revisedPaymentCount: fx.revisedSchedule.length,
    },
    comparison,
    comparisonYears: years,
    validation: {
      status: 'passed',
      checks: 'Regenerated 60/63-row schedules match fixture; totals, reconciliations and maturities verified at build time.',
    },
  };
}

// CLI: node tools/fixture.mjs [path]
if (import.meta.url === `file://${process.argv[1]}`) {
  const path = process.argv[2] || new URL('../src/data/fixture.json', import.meta.url).pathname;
  try {
    const rec = loadAndValidateFixture(path);
    const d = rec.derived;
    console.log('Fixture valid.');
    console.log(`  original: ${rec.originalSchedule.length} rows, interest ${d.originalTotalInterestCents / 100}, payments ${d.originalTotalPaymentsCents / 100}`);
    console.log(`  revised:  ${rec.revisedSchedule.length} rows, interest ${d.revisedTotalInterestCents / 100}, payments ${d.revisedTotalPaymentsCents / 100}`);
    console.log(`  deferred ${d.principalDeferredCents / 100}; near-term reduction ${d.nearTermPaymentReductionCents / 100}; extra 3-month interest ${d.additionalInterestFirstThreeMonthsCents / 100}`);
    console.log(`  comparison months: ${rec.comparison.length}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
