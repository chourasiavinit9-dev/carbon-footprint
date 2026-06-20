/**
 * EcoTrace — Unit Test Suite
 * tests/tests.js  |  v5.0
 *
 * Imports ALL logic from lib/emissions.js (single source of truth).
 * No constants duplicated. Tests run against real production code.
 *
 * Run:   node tests/tests.js
 * Pass:  exits 0 with "All N tests passed ✅"
 * Fail:  exits 1, each failure printed with ❌
 */

'use strict';

const {
  EF,
  r2,
  clamp,
  escHtml,
  calcTransport,
  calcEnergy,
  calcFood,
  calcShopping,
  getBadge
} = require('../lib/emissions.js');

/* ── Tiny test runner ───────────────────────── */
let passed = 0;
let failed = 0;
const results = [];

function assert(description, condition) {
  if (condition) {
    passed++;
    results.push(`  ✅  ${description}`);
  } else {
    failed++;
    results.push(`  ❌  FAIL: ${description}`);
  }
}

function assertClose(description, actual, expected, tol = 0.01) {
  const ok = Math.abs(actual - expected) <= tol;
  if (ok) {
    passed++;
    results.push(`  ✅  ${description}  [got ${actual}, expected ${expected}]`);
  } else {
    failed++;
    results.push(`  ❌  FAIL: ${description}  [got ${actual}, expected ${expected} ±${tol}]`);
  }
}

function section(name) {
  results.push(`\n── ${name} ${'─'.repeat(Math.max(0, 42 - name.length))}`);
}

/* ══════════════════════════════════════════════
   §1  TRANSPORT
══════════════════════════════════════════════ */
section('1  Transport emissions');

assertClose(
  'Petrol 150 km/wk × 52 × 0.21 / 1000',
  calcTransport(150, 'petrol', 0, 0, 'never'),
  r2(150 * 52 * 0.21 / 1000)
);
assertClose(
  'Electric 150 km/wk (4× less than petrol)',
  calcTransport(150, 'electric', 0, 0, 'never'),
  r2(150 * 52 * 0.05 / 1000)
);
assert('No car → 0 t from car',
  calcTransport(0, 'none', 0, 0, 'never') === 0);

assertClose('2 short-haul flights = 0.51 t',
  calcTransport(0, 'none', 2, 0, 'never'), 0.51);
assertClose('1 long-haul flight = 1.2 t',
  calcTransport(0, 'none', 0, 1, 'never'), 1.2);
assertClose('3 long-haul flights = 3.6 t',
  calcTransport(0, 'none', 0, 3, 'never'), 3.6);

assert('Daily public transport < never (petrol 150 km/wk)',
  calcTransport(150, 'petrol', 0, 0, 'daily') <
  calcTransport(150, 'petrol', 0, 0, 'never'));

assert('Petrol > Hybrid for same distance',
  calcTransport(200, 'petrol', 0, 0, 'never') >
  calcTransport(200, 'hybrid', 0, 0, 'never'));

assert('Hybrid > Electric for same distance',
  calcTransport(200, 'hybrid', 0, 0, 'never') >
  calcTransport(200, 'electric', 0, 0, 'never'));

assertClose(
  'Diesel 200 km/wk + 2 short + 1 long, never pub-trans',
  calcTransport(200, 'diesel', 2, 1, 'never'),
  r2((200 * 52 * 0.25 + 2 * 255 + 1200) / 1000)
);

assert('Result always ≥ 0 (even with big pubTrans credit)',
  calcTransport(0, 'none', 0, 0, 'daily') >= 0);

/* ══════════════════════════════════════════════
   §2  ENERGY
══════════════════════════════════════════════ */
section('2  Home energy emissions');

assertClose(
  'Mixed grid 250 kWh/mo + gas heat + no solar / 1 person',
  calcEnergy(250, 'mixed', 'gas', 'no', 1),
  r2((250 * 12 * 0.49 + 2500) / 1000)
);

assert('Full solar reduces vs no solar (same else)',
  calcEnergy(250, 'mixed', 'electric', 'full', 1) <
  calcEnergy(250, 'mixed', 'electric', 'no',   1));

assert('Renewable + heat pump << Coal + oil',
  calcEnergy(250, 'renewable', 'heatpump', 'no', 1) <
  calcEnergy(250, 'coal',      'oil',      'no', 1));

assert('4-person household < solo (same usage)',
  calcEnergy(250, 'mixed', 'gas', 'no', 4) <
  calcEnergy(250, 'mixed', 'gas', 'no', 1));

assertClose('Zero electricity + gas heat / 1 person',
  calcEnergy(0, 'mixed', 'gas', 'no', 1), r2(2500 / 1000));

assert('Household size 0 treated as 1 (no divide-by-zero)',
  isFinite(calcEnergy(250, 'mixed', 'gas', 'no', 0)));

assert('Result always ≥ 0',
  calcEnergy(0, 'renewable', 'heatpump', 'full', 1) >= 0);

/* ══════════════════════════════════════════════
   §3  FOOD
══════════════════════════════════════════════ */
section('3  Food & diet emissions');

assertClose(
  'Meat-heavy + high waste + never local + high dairy',
  calcFood('meat_heavy', 'high', 'never', 'high'),
  r2(3.3 + 0.70 + 0.30 + 0.80)
);
assertClose(
  'Vegan + zero waste + always local + no dairy',
  calcFood('vegan', 'none', 'always', 'none'),
  r2(0.9 + 0 - 0.20 + 0)
);

assert('Vegan < vegetarian < low_meat < meat_avg < meat_heavy',
  calcFood('vegan','medium','sometimes','low') <
  calcFood('vegetarian','medium','sometimes','low') &&
  calcFood('vegetarian','medium','sometimes','low') <
  calcFood('low_meat','medium','sometimes','low') &&
  calcFood('low_meat','medium','sometimes','low') <
  calcFood('meat_avg','medium','sometimes','low') &&
  calcFood('meat_avg','medium','sometimes','low') <
  calcFood('meat_heavy','medium','sometimes','low')
);

assert('Always local < never local (same diet)',
  calcFood('meat_avg','medium','always','medium') <
  calcFood('meat_avg','medium','never', 'medium'));

assert('No dairy < high dairy (same diet)',
  calcFood('meat_avg','medium','sometimes','none') <
  calcFood('meat_avg','medium','sometimes','high'));

assert('Zero waste < high waste (same diet)',
  calcFood('meat_avg','none','sometimes','medium') <
  calcFood('meat_avg','high','sometimes','medium'));

assert('Result always ≥ 0',
  calcFood('vegan','none','always','none') >= 0);

/* ══════════════════════════════════════════════
   §4  SHOPPING
══════════════════════════════════════════════ */
section('4  Shopping & lifestyle emissions');

assertClose(
  '3 clothes/mo + 2 electronics + often recycle + sometimes secondhand',
  calcShopping(3, 2, 'often', 'sometimes'),
  r2((3*12*6 + 2*300 + (-0.10)*1000 + (-0.20)*1000) / 1000)
);

assert('Always secondhand < never secondhand (same else)',
  calcShopping(5, 2, 'often', 'always') <
  calcShopping(5, 2, 'often', 'never'));

assert('Always recycle < never recycle (same else)',
  calcShopping(3, 2, 'always', 'sometimes') <
  calcShopping(3, 2, 'never',  'sometimes'));

assert('More clothes → more emissions',
  calcShopping(10, 2, 'often', 'sometimes') >
  calcShopping(2,  2, 'often', 'sometimes'));

assert('More electronics → more emissions',
  calcShopping(3, 8, 'often', 'sometimes') >
  calcShopping(3, 1, 'often', 'sometimes'));

assert('Result always ≥ 0 (even with max credits)',
  calcShopping(0, 0, 'always', 'always') >= 0);

/* ══════════════════════════════════════════════
   §5  TOTAL COMPOSITION
══════════════════════════════════════════════ */
section('5  Total footprint composition');

const tT = calcTransport(150, 'petrol', 2, 1, 'regular');
const eT = calcEnergy(250, 'mixed', 'electric', 'no', 3);
const fT = calcFood('meat_avg', 'medium', 'sometimes', 'medium');
const sT = calcShopping(3, 2, 'often', 'sometimes');
const tot = r2(tT + eT + fT + sT);

assert('Typical user total > 0',           tot > 0);
assert('Typical user total in range 0–30', tot >= 0 && tot <= 30);
assertClose('Total = exact sum of categories', tot, r2(tT + eT + fT + sT));

const lowT = r2(
  calcTransport(0, 'electric', 0, 0, 'daily') +
  calcEnergy(80, 'renewable', 'heatpump', 'full', 1) +
  calcFood('vegan', 'none', 'always', 'none') +
  calcShopping(0, 0, 'always', 'always')
);
assert('Best-case lifestyle < 2 t (Paris target)', lowT < 2);

const highT = r2(
  calcTransport(500, 'diesel', 10, 5, 'never') +
  calcEnergy(800, 'coal', 'oil', 'no', 1) +
  calcFood('meat_heavy', 'high', 'never', 'high') +
  calcShopping(15, 8, 'never', 'never')
);
assert('Worst-case lifestyle > 10 t', highT > 10);
assert('High-impact total is finite',  isFinite(highT));

/* ══════════════════════════════════════════════
   §6  EDGE CASES & ROBUSTNESS
══════════════════════════════════════════════ */
section('6  Edge cases & robustness');

assert('All-zero inputs → non-negative total',
  r2(calcTransport(0,'none',0,0,'never') +
     calcEnergy(0,'mixed','electric','no',1) +
     calcFood('vegan','none','always','none') +
     calcShopping(0,0,'always','always')) >= 0);

assert('Max inputs → finite total',
  isFinite(
    calcTransport(1000,'diesel',20,10,'never') +
    calcEnergy(1000,'coal','oil','no',1) +
    calcFood('meat_heavy','high','never','high') +
    calcShopping(20,10,'never','never')
  )
);

// clamp
assert('clamp(150, 0, 100) = 100',   clamp(150, 0, 100) === 100);
assert('clamp(-5,  0, 100) = 0',     clamp(-5,  0, 100) === 0);
assert('clamp(50,  0, 100) = 50',    clamp(50,  0, 100) === 50);
assert('clamp("x", 0, 100) = 0',    clamp('x', 0, 100) === 0);
assert('clamp(NaN, 5, 10) = 5',      clamp(NaN, 5, 10) === 5);
assert('clamp(Inf, 0, 100) = 100',   clamp(Infinity, 0, 100) === 100);
assert('clamp(0.5, 0, 1) = 0.5',     clamp(0.5, 0, 1) === 0.5);

// r2
assert('r2 corrects 0.1+0.2 float drift', r2(0.1 + 0.2) === 0.3);
assert('r2 integer stays integer',         r2(5) === 5);
assert('r2 rounds at .005',                r2(1.555) === 1.56 || r2(1.555) === 1.55); // fp ok

/* ══════════════════════════════════════════════
   §7  SECURITY — HTML ESCAPING
══════════════════════════════════════════════ */
section('7  Security — escHtml XSS prevention');

assert('< → &lt;',       escHtml('<script>') === '&lt;script&gt;');
assert('> → &gt;',       escHtml('>') === '&gt;');
assert('& → &amp;',      escHtml('AT&T') === 'AT&amp;T');
assert('" → &quot;',     escHtml('"hi"') === '&quot;hi&quot;');
assert("' → &#039;",     escHtml("it's") === "it&#039;s");
assert('XSS img tag neutralised',
  escHtml('<img src=x onerror=alert(1)>') ===
  '&lt;img src=x onerror=alert(1)&gt;');
assert('Script injection neutralised',
  escHtml('"><script>alert(1)</script>') ===
  '&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
assert('null → ""',        escHtml(null)      === '');
assert('undefined → ""',   escHtml(undefined) === '');
assert('number → ""',      escHtml(42)        === '');
assert('array → ""',       escHtml([1,2,3])   === '');
assert('Normal text unchanged', escHtml('Hello world') === 'Hello world');
assert('Empty string unchanged', escHtml('') === '');

/* ══════════════════════════════════════════════
   §8  BADGE LOGIC
══════════════════════════════════════════════ */
section('8  getBadge tier logic');

assert('0 t   → great', getBadge(0)   === 'great');
assert('1.5 t → great', getBadge(1.5) === 'great');
assert('2.0 t → great', getBadge(2.0) === 'great');
assert('2.1 t → ok',    getBadge(2.1) === 'ok');
assert('3.0 t → ok',    getBadge(3.0) === 'ok');
assert('4.0 t → ok',    getBadge(4.0) === 'ok');
assert('4.1 t → avg',   getBadge(4.1) === 'avg');
assert('5.5 t → avg',   getBadge(5.5) === 'avg');
assert('7.0 t → avg',   getBadge(7.0) === 'avg');
assert('7.1 t → high',  getBadge(7.1) === 'high');
assert('16  t → high',  getBadge(16)  === 'high');
assert('100 t → high',  getBadge(100) === 'high');

/* ══════════════════════════════════════════════
   §9  EMISSION FACTOR INTEGRITY
══════════════════════════════════════════════ */
section('9  Emission factor integrity');

assert('All car EFs ≥ 0',           Object.values(EF.car).every(v => v >= 0));
assert('Petrol > Electric',          EF.car.petrol > EF.car.electric);
assert('Diesel > Hybrid',            EF.car.diesel > EF.car.hybrid);
assert('Hybrid > Electric',          EF.car.hybrid > EF.car.electric);
assert('Long flight > Short flight', EF.flight.long > EF.flight.short);
assert('Coal > Gas grid',            EF.energySrc.coal > EF.energySrc.gas);
assert('Gas > Renewable grid',       EF.energySrc.gas  > EF.energySrc.renewable);
assert('Oil heating > Heat pump',    EF.heating.oil > EF.heating.heatpump);
assert('Full solar negative offset', EF.solar.full < 0);
assert('All diet values > 0',        Object.values(EF.diet).every(v => v > 0));
assert('Meat-heavy > Vegan',         EF.diet.meat_heavy > EF.diet.vegan);
assert('Always recycle < never',     EF.recycling.always < EF.recycling.never);
assert('Always secondhand < never',  EF.secondhand.always < EF.secondhand.never);
assert('Clothes EF > 0',             EF.clothesPerItem > 0);
assert('Electronics EF > 0',         EF.electronicsPerDevice > 0);

/* ══════════════════════════════════════════════
   §10  MANUAL SPOT-CHECKS vs HAND CALCULATIONS
══════════════════════════════════════════════ */
section('10  Manual spot-checks');

// 100 km/wk petrol, no flights, never pubTrans
// = 100*52*0.21/1000 = 1.092 t
assertClose('100 km/wk petrol, no flights',
  calcTransport(100, 'petrol', 0, 0, 'never'), 1.09);

// 300 kWh/mo coal + oil heat + no solar / 2 people
// = (300*12*0.82 + 3200) / 2 / 1000 = (2952+3200)/2/1000 = 3.076
assertClose('300 kWh coal + oil / 2 people',
  calcEnergy(300, 'coal', 'oil', 'no', 2), 3.08);

// vegetarian + low waste + often local + low dairy
// = 1.1 + 0.10 - 0.10 + 0.15 = 1.25
assertClose('Vegetarian + low waste + often local + low dairy',
  calcFood('vegetarian', 'low', 'often', 'low'), 1.25);

// 5 clothes/mo + 0 electronics + always recycle + always secondhand
// = (5*12*6 + 0 - 400 - 800) / 1000 = (360 - 1200) / 1000 = -0.84 → clamped to 0
assertClose('5 clothes + 0 electronics + always recycle/secondhand → 0 (clamped)',
  calcShopping(5, 0, 'always', 'always'), 0);

// 0 clothes + 5 electronics + never recycle + never secondhand
// = (0 + 5*300 + 500 + 0) / 1000 = 2.0
assertClose('0 clothes + 5 electronics + never recycle, never secondhand',
  calcShopping(0, 5, 'never', 'never'), 2.0);

/* ══════════════════════════════════════════════
   §11  EF OBJECT IMMUTABILITY
══════════════════════════════════════════════ */
section('11  EF object immutability (Object.freeze)');

let mutated = false;
try {
  EF.car.petrol = 999;
  mutated = EF.car.petrol === 999;
} catch (_) { mutated = false; }
assert('EF.car is frozen — petrol EF cannot be mutated', !mutated || EF.car.petrol === 0.21);

try {
  EF.newProp = 'injected';
} catch (_) {}
assert('EF root is frozen — new properties cannot be added',
  EF.newProp === undefined);

/* ══════════════════════════════════════════════
   SUMMARY
══════════════════════════════════════════════ */
results.forEach(r => console.log(r));
console.log('\n' + '═'.repeat(46));
console.log(`  RESULTS: ${passed} passed · ${failed} failed`);
console.log('═'.repeat(46));

if (failed > 0) {
  console.error(`\n  ${failed} test(s) failed ❌\n`);
  process.exit(1);
} else {
  console.log(`\n  All ${passed} tests passed ✅\n`);
  process.exit(0);
}
