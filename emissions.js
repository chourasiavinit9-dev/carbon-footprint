/**
 * EcoTrace — Emission Factors & Calculation Engine
 * lib/emissions.js  |  v5.0
 *
 * Single source of truth — imported by index.html AND tests/tests.js.
 * CommonJS (Node) + browser (window.EcoTraceLib) dual export.
 *
 * Sources:
 *   IPCC AR6 Synthesis Report (2022)
 *   DEFRA GHG Conversion Factors 2023 (UK Gov)
 *   IEA CO₂ Emissions from Fuel Combustion 2023
 *   Poore & Nemecek, Science 360(6392), 2018
 *   ICAO Carbon Emissions Calculator Methodology
 *   WRAP Valuing Our Clothes 2017
 *   FAO Food Wastage Footprint 2013
 */

'use strict';

/* ═══════════════════════════════════════════════
   EMISSION FACTORS  (all kg CO₂e per unit)
═══════════════════════════════════════════════ */
const EF = Object.freeze({

  /** kg CO₂e / km — DEFRA 2023 fleet averages */
  car: Object.freeze({
    petrol:   0.21,
    diesel:   0.25,
    hybrid:   0.10,
    electric: 0.05,
    none:     0.00
  }),

  /** kg CO₂e / return trip — ICAO + radiative forcing ×2.0 (IPCC AR5) */
  flight: Object.freeze({
    short: 255,   // < 3 hrs each way  (~1,000 km return)
    long:  1200   // > 6 hrs each way  (~10,000 km return)
  }),

  /**
   * Annual adjustment kg CO₂e — captures car-trip substitution.
   * Positive = more emissions, Negative = saved vs driving.
   */
  pubTrans: Object.freeze({
    never:      0,
    occasional: 300,
    regular:   -400,
    daily:     -800
  }),

  /** kg CO₂e / kWh — IEA 2023 grid intensity */
  energySrc: Object.freeze({
    coal:      0.82,
    mixed:     0.49,
    gas:       0.35,
    renewable: 0.04
  }),

  /** kg CO₂e / household / year — DEFRA 2023 */
  heating: Object.freeze({
    gas:      2500,
    oil:      3200,
    electric: 1800,
    heatpump:  600,
    district:  900
  }),

  /** Annual adjustment kg CO₂e — self-generation offset */
  solar: Object.freeze({
    no:       0,
    partial: -300,
    full:    -700
  }),

  /** t CO₂e / person / year — Poore & Nemecek (2018) */
  diet: Object.freeze({
    meat_heavy:  3.3,
    meat_avg:    2.5,
    low_meat:    1.9,
    pescatarian: 1.4,
    vegetarian:  1.1,
    vegan:       0.9
  }),

  /** t CO₂e / person / year — FAO (2013) */
  foodWaste: Object.freeze({
    high:   0.70,
    medium: 0.30,
    low:    0.10,
    none:   0.00
  }),

  /** t CO₂e annual adjustment — food-miles transport effect */
  localFood: Object.freeze({
    never:     0.30,
    sometimes: 0.10,
    often:    -0.10,
    always:   -0.20
  }),

  /** t CO₂e / person / year — dairy lifecycle */
  dairy: Object.freeze({
    high:   0.80,
    medium: 0.45,
    low:    0.15,
    none:   0.00
  }),

  /** kg CO₂e / new garment — WRAP (2017) lifecycle assessment */
  clothesPerItem: 6,

  /** kg CO₂e / new device — Greenpeace/iFixit LCA average (phone+laptop blend) */
  electronicsPerDevice: 300,

  /** Annual adjustment t CO₂e — landfill diversion + avoided production */
  recycling: Object.freeze({
    never:     0.50,
    sometimes: 0.20,
    often:    -0.10,
    always:   -0.40
  }),

  /** Annual adjustment t CO₂e — avoided new-product manufacturing */
  secondhand: Object.freeze({
    never:     0.00,
    sometimes:-0.20,
    often:    -0.50,
    always:   -0.80
  })
});

/* ═══════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════ */

/** Round to 2 decimal places (avoids floating-point drift) */
function r2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Clamp val to [min, max].
 * Returns min if val is NaN or non-numeric.
 */
function clamp(val, min, max) {
  const n = parseFloat(val);
  if (isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/**
 * Escape a string for safe HTML insertion.
 * Prevents XSS in AI-generated tip content.
 * Returns '' for non-string inputs.
 */
function escHtml(s) {
  if (typeof s !== 'string') return '';
  return s
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;');
}

/* ═══════════════════════════════════════════════
   CALCULATION FUNCTIONS
═══════════════════════════════════════════════ */

/**
 * Calculate annual transport emissions.
 *
 * @param {number} carKm    - Weekly km driven by car
 * @param {string} carType  - Vehicle type key  (EF.car)
 * @param {number} flShort  - Short-haul return flights / year
 * @param {number} flLong   - Long-haul return flights / year
 * @param {string} pubTrans - Public transport frequency (EF.pubTrans)
 * @returns {number} tonnes CO₂e / year  (≥ 0)
 */
function calcTransport(carKm, carType, flShort, flLong, pubTrans) {
  const kg =
    carKm   * 52 * (EF.car[carType]       ?? 0) +
    flShort *      EF.flight.short              +
    flLong  *      EF.flight.long               +
                  (EF.pubTrans[pubTrans]   ?? 0);
  return Math.max(0, r2(kg / 1000));
}

/**
 * Calculate annual home energy emissions (per person).
 * Energy costs are divided equally across household members.
 *
 * @param {number} kwhMonth  - Monthly electricity consumption (kWh)
 * @param {string} energySrc - Grid source key        (EF.energySrc)
 * @param {string} heating   - Heating system key     (EF.heating)
 * @param {string} solar     - Solar coverage key     (EF.solar)
 * @param {number} hhSize    - Number of people in household
 * @returns {number} tonnes CO₂e / year  (≥ 0)
 */
function calcEnergy(kwhMonth, energySrc, heating, solar, hhSize) {
  const size = Math.max(1, hhSize);
  const kg =
    kwhMonth * 12 * (EF.energySrc[energySrc] ?? 0) +
                    (EF.heating[heating]      ?? 0) +
                    (EF.solar[solar]          ?? 0);
  return Math.max(0, r2((kg / size) / 1000));
}

/**
 * Calculate annual food & diet emissions.
 *
 * @param {string} diet      - Diet type key        (EF.diet)
 * @param {string} foodWaste - Food waste level key (EF.foodWaste)
 * @param {string} localFood - Local food freq key  (EF.localFood)
 * @param {string} dairy     - Dairy level key      (EF.dairy)
 * @returns {number} tonnes CO₂e / year  (≥ 0)
 */
function calcFood(diet, foodWaste, localFood, dairy) {
  return Math.max(0, r2(
    (EF.diet[diet]           ?? 0) +
    (EF.foodWaste[foodWaste] ?? 0) +
    (EF.localFood[localFood] ?? 0) +
    (EF.dairy[dairy]         ?? 0)
  ));
}

/**
 * Calculate annual shopping & lifestyle emissions.
 *
 * @param {number} clothesMonth    - New garments per month
 * @param {number} electronicsYear - New devices per year
 * @param {string} recycling       - Recycling habit key   (EF.recycling)
 * @param {string} secondhand      - Second-hand freq key  (EF.secondhand)
 * @returns {number} tonnes CO₂e / year  (≥ 0)
 */
function calcShopping(clothesMonth, electronicsYear, recycling, secondhand) {
  const kg =
    clothesMonth    * 12 * EF.clothesPerItem              +
    electronicsYear *      EF.electronicsPerDevice         +
                          (EF.recycling[recycling]   ?? 0) * 1000 +
                          (EF.secondhand[secondhand] ?? 0) * 1000;
  return Math.max(0, r2(kg / 1000));
}

/**
 * Map a total footprint (t CO₂e/year) to a badge tier.
 *
 * @param {number} total
 * @returns {'great'|'ok'|'avg'|'high'}
 */
function getBadge(total) {
  if (total <= 2) return 'great';
  if (total <= 4) return 'ok';
  if (total <= 7) return 'avg';
  return 'high';
}

/* ═══════════════════════════════════════════════
   DUAL EXPORT
   CommonJS  → require('../lib/emissions.js')  [Node / tests]
   Browser   → window.EcoTraceLib              [index.html]
═══════════════════════════════════════════════ */
const _exports = {
  EF,
  r2,
  clamp,
  escHtml,
  calcTransport,
  calcEnergy,
  calcFood,
  calcShopping,
  getBadge
};

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = _exports;
} else {
  window.EcoTraceLib = _exports;
}
