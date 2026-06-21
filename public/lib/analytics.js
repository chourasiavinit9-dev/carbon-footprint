/**
 * EcoTrace — Analytics & Decision Engine  v1.0
 *
 * Pure business logic module — no DOM dependencies.
 * Works in both Node.js (testing) and browser environments.
 *
 * Exports:
 *  - buildSmartPriority(fp)   → ranked priority actions
 *  - buildEquivalences(total) → real-world CO₂ equivalences
 *  - buildFallbackTips(fp)    → offline tips when AI unavailable
 *  - SCENARIOS                → what-if scenario definitions
 *  - scoreSummary(fp)         → human-readable score summary
 *
 * @module analytics
 */

'use strict';

/* ── Universal lib import (Node vs Browser) ── */
const lib = (typeof module !== 'undefined' && typeof module.exports !== 'undefined')
  ? require('./emissions')          /* Node.js / testing */
  : window.EcoTraceLib;             /* Browser */

/* ══════════════════════════════════════════════
   BENCHMARKS
══════════════════════════════════════════════ */
const BENCHMARKS = Object.freeze({
  paris:  2.0,
  india:  1.9,
  global: 7.0,
  usa:    16.0,
});

/* ══════════════════════════════════════════════
   SMART PRIORITY ENGINE
   Generates a ranked list of personalised
   reduction actions based on the user's exact
   footprint data. Sorted by potential saving.
══════════════════════════════════════════════ */

/**
 * @typedef {object} PriorityAction
 * @property {string} icon
 * @property {string} category
 * @property {string} title
 * @property {string} reason   - references user's exact numbers
 * @property {number} saving   - estimated t CO₂e/year
 * @property {'easy'|'medium'|'hard'} effort
 */

/**
 * Build a prioritised list of reduction actions for a given footprint.
 * All savings are rounded to 2 decimal places.
 *
 * @param {object} fp - Footprint object { transport, energy, food, shopping, total, inputs }
 * @returns {PriorityAction[]} Actions sorted by saving descending, max 5
 */
function buildSmartPriority(fp) {
  if (!fp || typeof fp.total !== 'number') return [];

  const actions = [];
  const { inputs: i } = fp;

  /* ── Transport actions ── */
  if (fp.transport > 1.5 && i.carType !== 'electric' && i.carType !== 'none') {
    actions.push({
      icon: '🚗', category: 'Transport',
      title: `Switch from ${i.carType} car to an EV or hybrid`,
      reason: `Your ${i.carType} car contributes heavily to ${fp.transport} t of transport emissions driving ${i.carKm} km/week. An EV on India's grid emits ~75% less per km. Even a hybrid cuts it by ~40%.`,
      saving: lib.r2(fp.transport * 0.6),
      effort: 'hard',
    });
  }

  if (Number(i.flLong) > 1) {
    actions.push({
      icon: '✈️', category: 'Transport',
      title: `Reduce long-haul flights (${i.flLong} → ${Math.max(0, i.flLong - 1)}/year)`,
      reason: `Each long-haul return flight emits ~1.2 t CO₂e including radiative forcing. Cutting one trip saves more than India's entire per-capita average of 1.9 t/year.`,
      saving: 1.2,
      effort: 'medium',
    });
  }

  if (i.pubTrans === 'never' || i.pubTrans === 'occasional') {
    actions.push({
      icon: '🚌', category: 'Transport',
      title: 'Use public transport daily',
      reason: `Switching from ${i.pubTrans} to daily bus/metro commuting can save 0.4–0.8 t/year and avoid ~120 kg CO₂e per month for a typical urban commute.`,
      saving: 0.6,
      effort: 'easy',
    });
  }

  /* ── Energy actions ── */
  if (fp.energy > 1 && i.energySrc !== 'renewable') {
    actions.push({
      icon: '☀️', category: 'Energy',
      title: 'Switch to a renewable electricity tariff',
      reason: `Your ${i.energySrc} grid electricity is a major driver of ${fp.energy} t energy emissions. Switching to a green tariff or rooftop solar cuts grid emissions by up to 90%.`,
      saving: lib.r2(fp.energy * 0.55),
      effort: 'medium',
    });
  }

  if (i.solar === 'no' && fp.energy > 0.8) {
    const annualSaving = lib.r2(Math.min(
      (Number(i.kwhMonth) * 0.49 * 12 * 0.85) / 1000,
      fp.energy
    ));
    actions.push({
      icon: '🔆', category: 'Energy',
      title: 'Install rooftop solar panels',
      reason: `With ${i.kwhMonth} kWh/month usage, a 2–3 kW rooftop system (₹1.5–2L) pays back in 4–5 years and could eliminate most of your grid-electricity carbon footprint.`,
      saving: annualSaving,
      effort: 'hard',
    });
  }

  /* ── Food actions ── */
  if (['meat_heavy', 'meat_avg'].includes(i.diet)) {
    actions.push({
      icon: '🥗', category: 'Food',
      title: 'Reduce red meat to 3× per week',
      reason: `Beef emits ~27 kg CO₂e per kg vs ~0.9 kg for lentils. Your ${i.diet} diet contributes ${fp.food} t/year. Cutting beef 4 days/week saves approximately 0.5 t/year.`,
      saving: 0.5,
      effort: 'easy',
    });
  }

  if (['high', 'medium'].includes(i.foodWaste)) {
    actions.push({
      icon: '🗑️', category: 'Food',
      title: 'Cut food waste with meal planning',
      reason: `${i.foodWaste} food waste generates methane in landfill, a greenhouse gas 80× more potent than CO₂ over 20 years. Meal planning and composting can eliminate most household food waste.`,
      saving: 0.35,
      effort: 'easy',
    });
  }

  /* ── Shopping actions ── */
  if (i.secondhand === 'never') {
    actions.push({
      icon: '🔄', category: 'Shopping',
      title: 'Buy second-hand clothing and electronics',
      reason: `You currently never buy second-hand. Switching 50% of purchases to used goods cuts your ${fp.shopping} t shopping footprint by ~40% and saves thousands of rupees annually.`,
      saving: lib.r2(fp.shopping * 0.4),
      effort: 'easy',
    });
  }

  if (Number(i.electronics) > 1) {
    actions.push({
      icon: '📱', category: 'Shopping',
      title: `Repair electronics instead of replacing (${i.electronics} → 1/year)`,
      reason: `Manufacturing a new smartphone emits ~70 kg CO₂e. Repairing or delaying replacement by 1 year per device avoids significant embedded manufacturing carbon.`,
      saving: lib.r2((Number(i.electronics) - 1) * 0.07),
      effort: 'easy',
    });
  }

  /* Sort by potential saving, return top 5 */
  return actions
    .filter(a => a.saving > 0)
    .sort((a, b) => b.saving - a.saving)
    .slice(0, 5);
}

/* ══════════════════════════════════════════════
   IMPACT EQUIVALENCES
   Converts tonnes CO₂e into real-world terms.
══════════════════════════════════════════════ */

/**
 * @typedef {object} Equivalence
 * @property {string} icon
 * @property {number} value
 * @property {string} label
 * @property {string} sub
 */

/**
 * Convert a total CO₂e footprint into real-world equivalences.
 *
 * Factors used:
 *  - Trees: 22 kg CO₂/tree/year (IPCC)
 *  - Short-haul flight: 0.255 t CO₂e per return trip (DEFRA 2023)
 *  - Petrol car: 0.00021 t per km (DEFRA fleet average)
 *  - Mixed grid: 0.49 kg CO₂/kWh (IEA 2023 world average)
 *
 * @param {number} total - Annual footprint in t CO₂e
 * @returns {Equivalence[]}
 */
function buildEquivalences(total) {
  if (typeof total !== 'number' || isNaN(total) || total < 0) return [];

  return [
    {
      icon: '🌳',
      value: Math.round(total * 45.45),   /* 1 t / 0.022 t per tree */
      label: 'trees needed to offset annually',
      sub: 'Each tree absorbs ~22 kg CO₂/year (IPCC)',
    },
    {
      icon: '✈️',
      value: Math.round(total / 0.255),
      label: 'short-haul return flights equivalent',
      sub: 'e.g. Delhi ↔ Mumbai return trips (DEFRA 2023)',
    },
    {
      icon: '🚗',
      value: Math.round(total / 0.00021),
      label: 'km driven in a petrol car',
      sub: 'DEFRA 2023 fleet average emission factor',
    },
    {
      icon: '💡',
      value: Math.round((total * 1000) / 0.49),
      label: 'kWh of average-grid electricity',
      sub: 'IEA 2023 world average grid intensity',
    },
  ];
}

/* ══════════════════════════════════════════════
   WHAT-IF SCENARIO DEFINITIONS
   Each scenario has an id, label, and a delta()
   function returning t CO₂e saved if applied.
══════════════════════════════════════════════ */

/**
 * @typedef {object} Scenario
 * @property {string} id
 * @property {string} icon
 * @property {string} label
 * @property {function(object): number} delta - returns saving in t CO₂e/year
 */

/** @type {Scenario[]} */
const SCENARIOS = Object.freeze([
  {
    id: 'ev',
    icon: '🔌',
    label: 'Switch to electric car',
    delta: fp => {
      if (fp.inputs.carType === 'electric' || fp.inputs.carType === 'none') return 0;
      const saving = fp.inputs.carKm * 52 * (0.21 - 0.05) / 1000;
      return lib.r2(Math.max(0, saving));
    },
  },
  {
    id: 'vegan',
    icon: '🥗',
    label: 'Go vegan',
    delta: fp => {
      const current = lib.calcFood(fp.inputs.diet, fp.inputs.foodWaste, fp.inputs.localFood, fp.inputs.dairy);
      const after   = lib.calcFood('vegan', fp.inputs.foodWaste, fp.inputs.localFood, 'none');
      return lib.r2(Math.max(0, current - after));
    },
  },
  {
    id: 'no_flights',
    icon: '✈️',
    label: 'Cut all flights this year',
    delta: fp => lib.r2(
      Math.max(0,
        (Number(fp.inputs.flShort) * lib.EF.flight.short +
         Number(fp.inputs.flLong)  * lib.EF.flight.long) / 1000
      )
    ),
  },
  {
    id: 'renewable',
    icon: '☀️',
    label: 'Switch to renewable energy',
    delta: fp => {
      if (fp.inputs.energySrc === 'renewable') return 0;
      const current = lib.calcEnergy(fp.inputs.kwhMonth, fp.inputs.energySrc, fp.inputs.heating, fp.inputs.solar, fp.inputs.hhSize);
      const after   = lib.calcEnergy(fp.inputs.kwhMonth, 'renewable',         fp.inputs.heating, fp.inputs.solar, fp.inputs.hhSize);
      return lib.r2(Math.max(0, current - after));
    },
  },
  {
    id: 'zero_waste',
    icon: '🗑️',
    label: 'Eliminate food waste',
    delta: fp => lib.r2(Math.max(0, lib.EF.foodWaste[fp.inputs.foodWaste] || 0)),
  },
  {
    id: 'secondhand',
    icon: '🔄',
    label: 'Buy only second-hand',
    delta: fp => {
      const current = lib.calcShopping(fp.inputs.clothes, fp.inputs.electronics, fp.inputs.recycling, fp.inputs.secondhand);
      const after   = lib.calcShopping(fp.inputs.clothes, fp.inputs.electronics, fp.inputs.recycling, 'always');
      return lib.r2(Math.max(0, current - after));
    },
  },
]);

/* ══════════════════════════════════════════════
   FALLBACK TIPS
   Context-aware tips generated locally when
   the Gemini API is unavailable.
══════════════════════════════════════════════ */

/**
 * Build up to 6 fallback tips from the smart priority actions.
 * Maps PriorityAction → tip object compatible with renderTipsHtml().
 *
 * @param {object} fp
 * @returns {Array<{category,tip,impact,effort,timeframe}>}
 */
function buildFallbackTips(fp) {
  return buildSmartPriority(fp).map(a => ({
    category:  a.category,
    tip:       a.reason,
    impact:    `~${a.saving} t CO₂e/year`,
    effort:    a.effort,
    timeframe: a.effort === 'easy' ? 'immediate' : '1-3 months',
  })).slice(0, 6);
}

/* ══════════════════════════════════════════════
   SCORE SUMMARY
   Returns a human-readable summary string
   comparing the user's footprint to benchmarks.
══════════════════════════════════════════════ */

/**
 * Generate a one-sentence summary comparing total to benchmarks.
 *
 * @param {number} total - t CO₂e/year
 * @returns {{ tier: string, message: string, vsGlobal: string, vsParis: string }}
 */
function scoreSummary(total) {
  if (typeof total !== 'number' || isNaN(total)) {
    return { tier: 'unknown', message: 'Invalid input', vsGlobal: '', vsParis: '' };
  }

  const tier = lib.getBadge(total);
  const vsGlobal = total < BENCHMARKS.global
    ? `${lib.r2(BENCHMARKS.global - total)} t below global average`
    : `${lib.r2(total - BENCHMARKS.global)} t above global average`;
  const vsParis = total <= BENCHMARKS.paris
    ? 'at or below Paris 2°C target'
    : `${lib.r2(total - BENCHMARKS.paris)} t above Paris 2°C target`;

  const messages = {
    great: `Excellent — your footprint of ${total} t is ${vsGlobal} and ${vsParis}.`,
    ok:    `Good progress — your footprint of ${total} t is ${vsGlobal}.`,
    avg:   `Room to improve — your footprint of ${total} t is ${vsGlobal}.`,
    high:  `High impact — your footprint of ${total} t is ${vsGlobal}.`,
  };

  return { tier, message: messages[tier] || '', vsGlobal, vsParis };
}

/* ══════════════════════════════════════════════
   EXPORTS
══════════════════════════════════════════════ */

const EcoTraceAnalytics = {
  BENCHMARKS,
  SCENARIOS,
  buildSmartPriority,
  buildEquivalences,
  buildFallbackTips,
  scoreSummary,
};

/* Node.js (CommonJS) export for testing */
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = EcoTraceAnalytics;
}

/* Browser export */
if (typeof window !== 'undefined') {
  window.EcoTraceAnalytics = EcoTraceAnalytics;
}
