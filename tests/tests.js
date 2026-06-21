/**
 * EcoTrace — Comprehensive Test Suite  v2.0
 *
 * Coverage:
 *   1.  Transport emissions            (11 tests)
 *   2.  Home energy emissions          (7 tests)
 *   3.  Food & diet emissions          (7 tests)
 *   4.  Shopping & lifestyle emissions (6 tests)
 *   5.  Total footprint composition    (6 tests)
 *   6.  Edge cases & robustness        (12 tests)
 *   7.  Security — escHtml XSS        (13 tests)
 *   8.  getBadge tier logic            (12 tests)
 *   9.  Emission factor integrity      (15 tests)
 *  10.  Manual spot-checks             (5 tests)
 *  11.  EF object immutability         (2 tests)
 *  12.  Analytics — buildSmartPriority (10 tests)
 *  13.  Analytics — buildEquivalences  (8 tests)
 *  14.  Analytics — SCENARIOS          (10 tests)
 *  15.  Analytics — scoreSummary       (8 tests)
 *  16.  Analytics — buildFallbackTips  (5 tests)
 *  17.  Analytics — integration        (5 tests)
 *
 * Run: node tests/tests.js
 */

'use strict';

const lib = require('../public/lib/emissions');
const analytics = require('../public/lib/analytics');

const {
  r2, clamp, escHtml,
  calcTransport, calcEnergy, calcFood, calcShopping, getBadge, EF,
} = lib;

const {
  buildSmartPriority, buildEquivalences, SCENARIOS,
  buildFallbackTips, scoreSummary, BENCHMARKS,
} = analytics;

/* ── Test runner ── */
let passed = 0;
let failed = 0;

function assert(description, condition, got, expected) {
  if (condition) {
    console.log(`  ✅  ${description}`);
    passed++;
  } else {
    console.error(`  ❌  ${description}`);
    if (got !== undefined) console.error(`      got: ${JSON.stringify(got)}, expected: ${JSON.stringify(expected)}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 44 - title.length))}`);
}

/* Helper: build a typical footprint object */
function makeFp(overrides = {}) {
  const inputs = Object.assign({
    carKm: 150, carType: 'petrol',
    flShort: 2, flLong: 1, pubTrans: 'regular',
    kwhMonth: 250, energySrc: 'mixed', heating: 'electric', solar: 'no', hhSize: 3,
    diet: 'meat_avg', foodWaste: 'medium', localFood: 'sometimes', dairy: 'medium',
    clothes: 3, electronics: 2, recycling: 'often', secondhand: 'sometimes',
  }, overrides.inputs || {});

  const tT = calcTransport(inputs.carKm, inputs.carType, inputs.flShort, inputs.flLong, inputs.pubTrans);
  const eT = calcEnergy(inputs.kwhMonth, inputs.energySrc, inputs.heating, inputs.solar, inputs.hhSize);
  const fT = calcFood(inputs.diet, inputs.foodWaste, inputs.localFood, inputs.dairy);
  const sT = calcShopping(inputs.clothes, inputs.electronics, inputs.recycling, inputs.secondhand);
  const total = r2(tT + eT + fT + sT);

  return Object.assign({ transport: tT, energy: eT, food: fT, shopping: sT, total, inputs }, overrides);
}

/* ══════════════════════════════════════════════
   1. Transport emissions
══════════════════════════════════════════════ */
section('1  Transport emissions');

const t1 = calcTransport(150, 'petrol', 0, 0, 'never');
assert('Petrol 150 km/wk × 52 × 0.21 / 1000', t1 === 1.64, t1, 1.64);

const t2 = calcTransport(150, 'electric', 0, 0, 'never');
assert('Electric 150 km/wk (much less than petrol)', t2 < t1, t2, `< ${t1}`);

const t3 = calcTransport(0, 'none', 0, 0, 'never');
assert('No car, no flights → 0 transport emissions', t3 === 0, t3, 0);

const t4 = calcTransport(0, 'none', 2, 0, 'never');
assert('2 short-haul flights = 0.51 t', t4 === 0.51, t4, 0.51);

const t5 = calcTransport(0, 'none', 0, 1, 'never');
assert('1 long-haul flight = 1.2 t', t5 === 1.2, t5, 1.2);

const t6 = calcTransport(0, 'none', 0, 3, 'never');
assert('3 long-haul flights = 3.6 t', t6 === 3.6, t6, 3.6);

const t7 = calcTransport(150, 'petrol', 0, 0, 'daily');
const t8 = calcTransport(150, 'petrol', 0, 0, 'never');
assert('Daily public transport < never (petrol 150 km/wk)', t7 < t8);

assert('Petrol > Hybrid for same distance',
  calcTransport(150, 'petrol', 0, 0, 'never') > calcTransport(150, 'hybrid', 0, 0, 'never'));

assert('Hybrid > Electric for same distance',
  calcTransport(150, 'hybrid', 0, 0, 'never') > calcTransport(150, 'electric', 0, 0, 'never'));

const t9 = calcTransport(200, 'diesel', 2, 1, 'never');
assert('Diesel 200 km/wk + 2 short + 1 long, never pub-trans', t9 === 4.31, t9, 4.31);

assert('Result always ≥ 0 (pubTrans credit bounded)',
  calcTransport(0, 'none', 0, 0, 'daily') >= 0);

/* ══════════════════════════════════════════════
   2. Home energy emissions
══════════════════════════════════════════════ */
section('2  Home energy emissions');

const e1 = calcEnergy(250, 'mixed', 'gas', 'no', 1);
assert('Mixed grid 250 kWh/mo + gas heat / 1 person', e1 === 3.97, e1, 3.97);

assert('Full solar reduces vs no solar',
  calcEnergy(250, 'mixed', 'electric', 'full', 1) < calcEnergy(250, 'mixed', 'electric', 'no', 1));

assert('Renewable + heatpump << Coal + oil heating',
  calcEnergy(250, 'renewable', 'heatpump', 'no', 1) < calcEnergy(250, 'coal', 'oil', 'no', 1));

assert('4-person household < solo (same usage)',
  calcEnergy(250, 'mixed', 'electric', 'no', 4) < calcEnergy(250, 'mixed', 'electric', 'no', 1));

const e2 = calcEnergy(0, 'mixed', 'gas', 'no', 1);
assert('Zero electricity + gas heat / 1 person', e2 === 2.5, e2, 2.5);

assert('Household size 0 treated as 1 (no divide-by-zero)',
  isFinite(calcEnergy(250, 'mixed', 'electric', 'no', 0)));

assert('Result always ≥ 0', calcEnergy(0, 'renewable', 'heatpump', 'full', 8) >= 0);

/* ══════════════════════════════════════════════
   3. Food & diet emissions
══════════════════════════════════════════════ */
section('3  Food & diet emissions');

const f1 = calcFood('meat_heavy', 'high', 'never', 'high');
assert('Meat-heavy + high waste + never local + high dairy', f1 === 5.1, f1, 5.1);

const f2 = calcFood('vegan', 'none', 'always', 'none');
assert('Vegan + zero waste + always local + no dairy', f2 === 0.7, f2, 0.7);

assert('Diet ladder: vegan < vegetarian < low_meat < meat_avg < meat_heavy',
  calcFood('vegan','none','always','none') < calcFood('vegetarian','none','always','none') &&
  calcFood('vegetarian','none','always','none') < calcFood('low_meat','none','always','none') &&
  calcFood('low_meat','none','always','none') < calcFood('meat_avg','none','always','none') &&
  calcFood('meat_avg','none','always','none') < calcFood('meat_heavy','none','always','none'));

assert('Always local < never local (same diet)',
  calcFood('meat_avg','medium','always','medium') < calcFood('meat_avg','medium','never','medium'));

assert('No dairy < high dairy (same diet)',
  calcFood('meat_avg','medium','sometimes','none') < calcFood('meat_avg','medium','sometimes','high'));

assert('Zero waste < high waste (same diet)',
  calcFood('meat_avg','none','sometimes','medium') < calcFood('meat_avg','high','sometimes','medium'));

assert('Result always ≥ 0', calcFood('vegan','none','always','none') >= 0);

/* ══════════════════════════════════════════════
   4. Shopping & lifestyle emissions
══════════════════════════════════════════════ */
section('4  Shopping & lifestyle emissions');

const s1 = calcShopping(3, 2, 'often', 'sometimes');
assert('3 clothes/mo + 2 electronics + often + sometimes', s1 === 0.52, s1, 0.52);

assert('Always secondhand < never secondhand',
  calcShopping(3, 2, 'often', 'always') < calcShopping(3, 2, 'often', 'never'));

assert('Always recycle < never recycle',
  calcShopping(3, 2, 'always', 'sometimes') < calcShopping(3, 2, 'never', 'sometimes'));

assert('More clothes → more emissions',
  calcShopping(10, 2, 'often', 'sometimes') > calcShopping(2, 2, 'often', 'sometimes'));

assert('More electronics → more emissions',
  calcShopping(3, 5, 'often', 'sometimes') > calcShopping(3, 1, 'often', 'sometimes'));

assert('Result always ≥ 0', calcShopping(0, 0, 'always', 'always') >= 0);

/* ══════════════════════════════════════════════
   5. Total footprint composition
══════════════════════════════════════════════ */
section('5  Total footprint composition');

const fp = makeFp();
assert('Typical user total > 0', fp.total > 0);
assert('Typical user total in range 0–30', fp.total <= 30);

const manual = r2(fp.transport + fp.energy + fp.food + fp.shopping);
assert('Total = exact sum of categories', fp.total === manual, fp.total, manual);

const best = r2(
  calcTransport(0,'none',0,0,'daily') +
  calcEnergy(0,'renewable','heatpump','full',8) +
  calcFood('vegan','none','always','none') +
  calcShopping(0,0,'always','always')
);
assert('Best-case lifestyle < 2 t (Paris target)', best < 2, best, '< 2');

const worst = r2(
  calcTransport(1000,'petrol',20,10,'never') +
  calcEnergy(1000,'coal','oil','no',1) +
  calcFood('meat_heavy','high','never','high') +
  calcShopping(20,10,'never','never')
);
assert('Worst-case lifestyle > 10 t', worst > 10, worst, '> 10');
assert('High-impact total is finite', isFinite(worst));

/* ══════════════════════════════════════════════
   6. Edge cases & robustness
══════════════════════════════════════════════ */
section('6  Edge cases & robustness');

assert('All-zero inputs → non-negative total',
  r2(calcTransport(0,'none',0,0,'never') + calcEnergy(0,'renewable','heatpump','full',1) +
     calcFood('vegan','none','always','none') + calcShopping(0,0,'always','always')) >= 0);

assert('Max inputs → finite total',
  isFinite(r2(calcTransport(1000,'petrol',20,10,'never') + calcEnergy(1000,'coal','oil','no',1) +
     calcFood('meat_heavy','high','never','high') + calcShopping(20,10,'never','never'))));

assert('clamp(150, 0, 100) = 100', clamp(150, 0, 100) === 100, clamp(150,0,100), 100);
assert('clamp(-5,  0, 100) = 0',   clamp(-5,  0, 100) === 0,   clamp(-5,0,100), 0);
assert('clamp(50,  0, 100) = 50',  clamp(50,  0, 100) === 50,  clamp(50,0,100), 50);
assert('clamp("x", 0, 100) = 0',   clamp('x', 0, 100) === 0,   clamp('x',0,100), 0);
assert('clamp(NaN, 5, 10) = 5',    clamp(NaN, 5, 10) === 5,    clamp(NaN,5,10), 5);
assert('clamp(Inf, 0, 100) = 100', clamp(Infinity, 0, 100) === 100);
assert('clamp(0.5, 0, 1) = 0.5',   clamp(0.5, 0, 1) === 0.5,  clamp(0.5,0,1), 0.5);
assert('r2 corrects 0.1+0.2 float drift', r2(0.1 + 0.2) === 0.3, r2(0.1+0.2), 0.3);
assert('r2 integer stays integer',         r2(5) === 5, r2(5), 5);
assert('r2 rounds correctly', r2(1.015) === 1.02 || r2(1.015) === 1.01, true, true);

/* ══════════════════════════════════════════════
   7. Security — escHtml XSS prevention
══════════════════════════════════════════════ */
section('7  Security — escHtml XSS prevention');

assert('< → &lt;',  escHtml('<') === '&lt;');
assert('> → &gt;',  escHtml('>') === '&gt;');
assert('& → &amp;', escHtml('&') === '&amp;');
assert('" → &quot;', escHtml('"') === '&quot;');
assert("' → &#039;", escHtml("'") === '&#039;');
assert('XSS img tag neutralised',    !escHtml('<img src=x onerror=alert(1)>').includes('<img'));
assert('Script injection neutralised', !escHtml('<script>alert(1)</script>').includes('<script'));
assert('null → ""',      escHtml(null) === '');
assert('undefined → ""', escHtml(undefined) === '');
assert('number → ""',    escHtml(42) === '');
assert('array → ""',     escHtml([]) === '');
assert('Normal text unchanged', escHtml('Hello World') === 'Hello World');
assert('Empty string unchanged', escHtml('') === '');

/* ══════════════════════════════════════════════
   8. getBadge tier logic
══════════════════════════════════════════════ */
section('8  getBadge tier logic');

assert('0 t   → great', getBadge(0) === 'great');
assert('1.5 t → great', getBadge(1.5) === 'great');
assert('2.0 t → great', getBadge(2.0) === 'great');
assert('2.1 t → ok',    getBadge(2.1) === 'ok');
assert('3.0 t → ok',    getBadge(3.0) === 'ok');
assert('4.0 t → ok',    getBadge(4.0) === 'ok');
assert('4.1 t → avg',   getBadge(4.1) === 'avg');
assert('5.5 t → avg',   getBadge(5.5) === 'avg');
assert('7.0 t → avg',   getBadge(7.0) === 'avg');
assert('7.1 t → high',  getBadge(7.1) === 'high');
assert('16 t  → high',  getBadge(16) === 'high');
assert('100 t → high',  getBadge(100) === 'high');

/* ══════════════════════════════════════════════
   9. Emission factor integrity
══════════════════════════════════════════════ */
section('9  Emission factor integrity');

assert('All car EFs ≥ 0', Object.values(EF.car).every(v => v >= 0));
assert('Petrol > Electric',  EF.car.petrol > EF.car.electric);
assert('Diesel > Hybrid',    EF.car.diesel > EF.car.hybrid);
assert('Hybrid > Electric',  EF.car.hybrid > EF.car.electric);
assert('Long flight > Short flight', EF.flight.long > EF.flight.short);
assert('Coal > Gas grid',    EF.energySrc.coal > EF.energySrc.gas);
assert('Gas > Renewable',    EF.energySrc.gas > EF.energySrc.renewable);
assert('Oil heating > Heat pump', EF.heating.oil > EF.heating.heatpump);
assert('Full solar has negative offset', EF.solar.full < 0);
assert('All diet values > 0', Object.values(EF.diet).every(v => v > 0));
assert('Meat-heavy > Vegan', EF.diet.meat_heavy > EF.diet.vegan);
assert('Always recycle < never', EF.recycling.always < EF.recycling.never);
assert('Always secondhand < never', EF.secondhand.always < EF.secondhand.never);
assert('Clothes EF > 0',     EF.clothesPerItem > 0);
assert('Electronics EF > 0', EF.electronicsPerDevice > 0);

/* ══════════════════════════════════════════════
   10. Manual spot-checks
══════════════════════════════════════════════ */
section('10  Manual spot-checks');

const sc1 = calcTransport(100, 'petrol', 0, 0, 'never');
assert('100 km/wk petrol, no flights', sc1 === 1.09, sc1, 1.09);

const sc2 = calcEnergy(300, 'coal', 'oil', 'no', 2);
assert('300 kWh coal + oil / 2 people', sc2 === 3.08, sc2, 3.08);

const sc3 = calcFood('vegetarian', 'low', 'often', 'low');
assert('Vegetarian + low waste + often local + low dairy', sc3 === 1.25, sc3, 1.25);

const sc4 = calcShopping(5, 0, 'always', 'always');
assert('5 clothes + 0 electronics + always recycle/secondhand → 0', sc4 === 0, sc4, 0);

const sc5 = calcShopping(0, 5, 'never', 'never');
assert('0 clothes + 5 electronics + never recycle, never secondhand', sc5 === 2, sc5, 2);

/* ══════════════════════════════════════════════
   11. EF object immutability
══════════════════════════════════════════════ */
section('11  EF object immutability (Object.freeze)');

const origPetrol = EF.car.petrol;
try { EF.car.petrol = 9999; } catch (_) {}
assert('EF.car is frozen — petrol EF cannot be mutated', EF.car.petrol === origPetrol);

try { EF.newProp = 'hack'; } catch (_) {}
assert('EF root is frozen — new properties cannot be added', EF.newProp === undefined);

/* ══════════════════════════════════════════════
   12. Analytics — buildSmartPriority
══════════════════════════════════════════════ */
section('12  Analytics — buildSmartPriority');

const fp_high = makeFp({ inputs: { carKm: 500, carType: 'petrol', flShort: 5, flLong: 4, pubTrans: 'never', kwhMonth: 600, energySrc: 'coal', heating: 'oil', solar: 'no', hhSize: 1, diet: 'meat_heavy', foodWaste: 'high', localFood: 'never', dairy: 'high', clothes: 15, electronics: 8, recycling: 'never', secondhand: 'never' }});
const priority_high = buildSmartPriority(fp_high);

assert('Returns array for high-impact footprint', Array.isArray(priority_high));
assert('Returns ≤ 5 actions', priority_high.length <= 5);
assert('Each action has required fields', priority_high.every(a =>
  a.icon && a.category && a.title && a.reason && typeof a.saving === 'number' && a.effort));
assert('Actions sorted by saving descending',
  priority_high.every((a, i) => i === 0 || priority_high[i-1].saving >= a.saving));
assert('All savings ≥ 0', priority_high.every(a => a.saving >= 0));
assert('All savings are finite', priority_high.every(a => isFinite(a.saving)));

const fp_low = makeFp({ inputs: { carKm: 0, carType: 'electric', flShort: 0, flLong: 0, pubTrans: 'daily', kwhMonth: 100, energySrc: 'renewable', heating: 'heatpump', solar: 'full', hhSize: 4, diet: 'vegan', foodWaste: 'none', localFood: 'always', dairy: 'none', clothes: 1, electronics: 0, recycling: 'always', secondhand: 'always' }});
const priority_low = buildSmartPriority(fp_low);
assert('Returns array for low-impact footprint', Array.isArray(priority_low));
assert('Low-impact footprint has fewer or zero actions', priority_low.length < priority_high.length);

const fp_null = buildSmartPriority(null);
assert('Returns empty array for null input', Array.isArray(fp_null) && fp_null.length === 0);

const fp_missing = buildSmartPriority({ total: 'bad' });
assert('Returns empty array for invalid total', Array.isArray(fp_missing) && fp_missing.length === 0);

/* ══════════════════════════════════════════════
   13. Analytics — buildEquivalences
══════════════════════════════════════════════ */
section('13  Analytics — buildEquivalences');

const equiv5 = buildEquivalences(5);
assert('Returns array of 4 items for 5 t', equiv5.length === 4, equiv5.length, 4);
assert('Each item has icon, value, label, sub', equiv5.every(e => e.icon && typeof e.value === 'number' && e.label && e.sub));
assert('Tree count for 5 t is ~227', equiv5[0].value === 227, equiv5[0].value, 227);
assert('Flight count for 5 t is ~20', equiv5[1].value === Math.round(5/0.255), equiv5[1].value, Math.round(5/0.255));
assert('All values ≥ 0', equiv5.every(e => e.value >= 0));
assert('Zero total returns 4 items with 0 values', buildEquivalences(0).every(e => e.value === 0));

const equivNeg = buildEquivalences(-1);
assert('Negative input returns empty array', equivNeg.length === 0, equivNeg.length, 0);

const equivNaN = buildEquivalences(NaN);
assert('NaN input returns empty array', equivNaN.length === 0);

/* ══════════════════════════════════════════════
   14. Analytics — SCENARIOS
══════════════════════════════════════════════ */
section('14  Analytics — SCENARIOS');

assert('SCENARIOS is an array of 6', Array.isArray(SCENARIOS) && SCENARIOS.length === 6, SCENARIOS.length, 6);
assert('Each scenario has id, icon, label, delta', SCENARIOS.every(s => s.id && s.icon && s.label && typeof s.delta === 'function'));

/* EV scenario */
const fp_petrol = makeFp({ inputs: { carKm: 200, carType: 'petrol', flShort: 0, flLong: 0, pubTrans: 'regular', kwhMonth: 250, energySrc: 'mixed', heating: 'electric', solar: 'no', hhSize: 2, diet: 'meat_avg', foodWaste: 'medium', localFood: 'sometimes', dairy: 'medium', clothes: 3, electronics: 1, recycling: 'often', secondhand: 'sometimes' }});
const evScenario = SCENARIOS.find(s => s.id === 'ev');
const evSaving = evScenario.delta(fp_petrol);
assert('EV scenario saving > 0 for petrol driver', evSaving > 0, evSaving, '> 0');
assert('EV scenario saving is finite', isFinite(evSaving));

const fp_ev = makeFp({ inputs: { carKm: 200, carType: 'electric', flShort: 0, flLong: 0, pubTrans: 'regular', kwhMonth: 250, energySrc: 'mixed', heating: 'electric', solar: 'no', hhSize: 2, diet: 'meat_avg', foodWaste: 'medium', localFood: 'sometimes', dairy: 'medium', clothes: 3, electronics: 1, recycling: 'often', secondhand: 'sometimes' }});
assert('EV scenario saving = 0 if already electric', evScenario.delta(fp_ev) === 0);

/* Vegan scenario */
const veganScenario = SCENARIOS.find(s => s.id === 'vegan');
const fp_meat = makeFp();
assert('Vegan saving > 0 for meat eater', veganScenario.delta(fp_meat) > 0);

const fp_vegan = makeFp({ inputs: { carKm: 150, carType: 'petrol', flShort: 2, flLong: 1, pubTrans: 'regular', kwhMonth: 250, energySrc: 'mixed', heating: 'electric', solar: 'no', hhSize: 3, diet: 'vegan', foodWaste: 'none', localFood: 'always', dairy: 'none', clothes: 3, electronics: 2, recycling: 'often', secondhand: 'sometimes' }});
assert('Vegan saving = 0 if already vegan + no dairy', veganScenario.delta(fp_vegan) === 0);

/* All savings ≥ 0 for each scenario */
assert('All scenario deltas ≥ 0', SCENARIOS.every(s => s.delta(fp_meat) >= 0));

/* Renewable scenario */
const renewableScenario = SCENARIOS.find(s => s.id === 'renewable');
assert('Renewable saving > 0 for coal grid', renewableScenario.delta(fp_high) > 0);

/* ══════════════════════════════════════════════
   15. Analytics — scoreSummary
══════════════════════════════════════════════ */
section('15  Analytics — scoreSummary');

const sum_great = scoreSummary(1.5);
assert('scoreSummary 1.5 t → tier great', sum_great.tier === 'great', sum_great.tier, 'great');
assert('scoreSummary 1.5 t → message is non-empty', sum_great.message.length > 0);

const sum_high = scoreSummary(10);
assert('scoreSummary 10 t → tier high', sum_high.tier === 'high', sum_high.tier, 'high');
assert('vsGlobal reflects above-average', sum_high.vsGlobal.includes('above'));

const sum_paris = scoreSummary(2.0);
assert('scoreSummary 2.0 t → at or below paris', sum_paris.vsParis.includes('at or below'));

const sum_above_paris = scoreSummary(5.0);
assert('scoreSummary 5.0 t → above paris', sum_above_paris.vsParis.includes('above Paris'));

assert('scoreSummary null → unknown tier', scoreSummary(null).tier === 'unknown');
assert('scoreSummary NaN → unknown tier', scoreSummary(NaN).tier === 'unknown');
assert('scoreSummary string → unknown tier', scoreSummary('bad').tier === 'unknown');
assert('scoreSummary 0 t → great tier', scoreSummary(0).tier === 'great');

/* ══════════════════════════════════════════════
   16. Analytics — buildFallbackTips
══════════════════════════════════════════════ */
section('16  Analytics — buildFallbackTips');

const tips_high = buildFallbackTips(fp_high);
assert('Returns array', Array.isArray(tips_high));
assert('Returns ≤ 6 tips', tips_high.length <= 6, tips_high.length, '≤ 6');
assert('Each tip has category, tip, impact, effort, timeframe',
  tips_high.every(t => t.category && t.tip && t.impact && t.effort && t.timeframe));
assert('Effort is always easy|medium|hard',
  tips_high.every(t => ['easy','medium','hard'].includes(t.effort)));
assert('Timeframe is always one of 3 valid values',
  tips_high.every(t => ['immediate','1-3 months','6-12 months'].includes(t.timeframe)));

/* ══════════════════════════════════════════════
   17. Analytics — integration
══════════════════════════════════════════════ */
section('17  Analytics — integration');

assert('BENCHMARKS object has all keys',
  typeof BENCHMARKS.paris === 'number' && typeof BENCHMARKS.india === 'number' &&
  typeof BENCHMARKS.global === 'number' && typeof BENCHMARKS.usa === 'number');

const totalSaving = SCENARIOS.reduce((sum, s) => sum + s.delta(fp_high), 0);
assert('Sum of all scenario savings is finite and ≥ 0', isFinite(totalSaving) && totalSaving >= 0);

assert('buildEquivalences uses correct tree factor',
  buildEquivalences(1)[0].value === Math.round(1 * 45.45));

/* Priority for typical user references transport as biggest category */
const typical_priority = buildSmartPriority(fp);
assert('Typical user has at least 1 action to take', typical_priority.length >= 1);

assert('buildFallbackTips maps priority correctly — first tip matches first priority',
  buildFallbackTips(fp)[0]?.category === typical_priority[0]?.category);

/* ══════════════════════════════════════════════
   RESULTS
══════════════════════════════════════════════ */
const total = passed + failed;
console.log('\n' + '═'.repeat(46));
console.log(`  RESULTS: ${passed} passed · ${failed} failed`);
console.log('═'.repeat(46) + '\n');

if (failed === 0) {
  console.log(`  All ${total} tests passed ✅\n`);
  process.exit(0);
} else {
  console.error(`  ${failed} test(s) FAILED ❌\n`);
  process.exit(1);
}
