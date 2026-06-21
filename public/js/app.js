/**
 * EcoTrace — Smart UI Controller  v6.0
 *
 * Modules:
 *  1.  Config & State
 *  2.  DOM Utilities
 *  3.  Toast Notifications
 *  4.  Progress Bar
 *  5.  Step Navigation
 *  6.  Live Calculator  ← real-time slider feedback
 *  7.  Main Calculator & Results
 *  8.  Smart Priority Engine  ← context-aware decision ranking
 *  9.  What-If Simulator  ← instant scenario comparison
 * 10.  Impact Equivalences  ← trees / flights / km
 * 11.  AI Tips  ← Gemini personalised plan
 * 12.  AI Chat Widget  ← conversational assistant
 * 13.  Share & Download
 * 14.  Animations  (starfield, live CO₂ counter)
 * 15.  Init
 *
 * All API calls go to /api/* — API key never in client code.
 * All user-rendered strings pass through escHtml() to prevent XSS.
 */

'use strict';

/* ══════════════════════════════════════════════
   1. CONFIG & STATE
══════════════════════════════════════════════ */

/** Steps in order */
const STEPS = ['transport', 'energy', 'food', 'shopping'];

/** Benchmark values (t CO₂e / year) */
const BENCHMARKS = {
  paris:  2.0,
  india:  1.9,
  global: 7.0,
  usa:    16.0,
};

/** Global footprint state — null until first calculation */
let fp = null;

/** Chart.js instance */
let chartInstance = null;

/** Chat conversation history for multi-turn context */
const chatHistory = [];

/** Debounce timer for live calculator */
let liveCalcTimer = null;

/* ══════════════════════════════════════════════
   2. DOM UTILITIES
══════════════════════════════════════════════ */

/** @param {string} id @returns {HTMLElement} */
const $ = id => document.getElementById(id);

/**
 * Read a range/number input and clamp it.
 * @param {string} id
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function readNum(id, min, max) {
  return window.EcoTraceLib.clamp($(id).value, min, max);
}

/**
 * Update a range slider's display label and aria-valuenow.
 * @param {string} inputId
 * @param {string} dispId
 * @param {string} unit
 */
function syncRange(inputId, dispId, unit) {
  const val = $(inputId).value;
  $(dispId).textContent = `${val} ${unit}`;
  $(inputId).setAttribute('aria-valuenow', val);
}

/* ══════════════════════════════════════════════
   3. TOAST NOTIFICATIONS
══════════════════════════════════════════════ */

/**
 * Show a toast notification.
 * @param {string} msg
 * @param {'ok'|'err'} type
 */
function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = `toast${type === 'err' ? ' err' : ''}`;
  el.setAttribute('role', 'alert');
  el.textContent = msg;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

/* ══════════════════════════════════════════════
   4. PROGRESS BAR
══════════════════════════════════════════════ */

/** @param {number} pct — 0 to 100 */
function setProgress(pct) {
  const bar = $('prog');
  bar.style.width = `${pct}%`;
  bar.setAttribute('aria-valuenow', pct);
}

/* ══════════════════════════════════════════════
   5. STEP NAVIGATION
══════════════════════════════════════════════ */

/**
 * Navigate to a calculator step.
 * @param {string} step — key in STEPS
 */
function goStep(step) {
  const idx = STEPS.indexOf(step);
  STEPS.forEach((s, i) => {
    $(`panel-${s}`).classList.remove('active');
    const tab = $(`tab-${s}`);
    tab.classList.remove('active', 'done');
    tab.setAttribute('aria-selected', 'false');
    tab.removeAttribute('aria-current');
    if (i < idx) tab.classList.add('done');
  });

  $(`panel-${step}`).classList.add('active');
  const activeTab = $(`tab-${step}`);
  activeTab.classList.add('active');
  activeTab.setAttribute('aria-selected', 'true');
  activeTab.setAttribute('aria-current', 'step');

  setProgress(Math.round(((idx + 1) / STEPS.length) * 70));
  $('calculator').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ══════════════════════════════════════════════
   6. LIVE CALCULATOR
   Updates the nav-bar pill in real-time as the
   user adjusts any slider or select — no button
   click required. Debounced to 250 ms.
══════════════════════════════════════════════ */

/** Read all inputs and return a partial footprint without affecting global state */
function peekFootprint() {
  const lib = window.EcoTraceLib;
  try {
    const tT = lib.calcTransport(
      readNum('car_km', 0, 1000),
      $('car_type').value,
      readNum('fl_short', 0, 20),
      readNum('fl_long', 0, 10),
      $('pub_trans').value
    );
    const eT = lib.calcEnergy(
      readNum('elec_kwh', 0, 1000),
      $('energy_src').value,
      $('heating').value,
      $('solar').value,
      readNum('hh_size', 1, 8)
    );
    const fT = lib.calcFood(
      $('diet').value,
      $('waste').value,
      $('local').value,
      $('dairy').value
    );
    const sT = lib.calcShopping(
      readNum('clothes', 0, 20),
      readNum('electronics', 0, 10),
      $('recycling').value,
      $('secondhand').value
    );
    return lib.r2(tT + eT + fT + sT);
  } catch (_) {
    return null;
  }
}

/** Update the live pill in the nav bar */
function updateLivePill() {
  const total = peekFootprint();
  if (total === null) return;

  const pill = $('live-pill');
  pill.hidden = false;
  $('live-pill-val').textContent = total;

  /* Colour-code the pill based on tier */
  pill.dataset.tier = window.EcoTraceLib.getBadge(total);
}

/** Attach live-calc listeners to all inputs */
function initLiveCalc() {
  const allInputs = document.querySelectorAll(
    '#calculator input[type="range"], #calculator select'
  );
  allInputs.forEach(el => {
    el.addEventListener('input', () => {
      clearTimeout(liveCalcTimer);
      liveCalcTimer = setTimeout(updateLivePill, 250);
    });
  });

  /* Range label sync */
  const ranges = [
    ['car_km',      'car_km_v',      'km/week'],
    ['fl_short',    'fl_short_v',    'flights'],
    ['fl_long',     'fl_long_v',     'flights'],
    ['elec_kwh',    'elec_kwh_v',    'kWh'],
    ['hh_size',     'hh_size_v',     'people'],
    ['clothes',     'clothes_v',     'items'],
    ['electronics', 'electronics_v', 'devices'],
  ];
  ranges.forEach(([inputId, dispId, unit]) => {
    const el = $(inputId);
    if (!el) return;
    el.addEventListener('input', () => syncRange(inputId, dispId, unit));
  });
}

/* ══════════════════════════════════════════════
   7. MAIN CALCULATOR & RESULTS
══════════════════════════════════════════════ */

/** Collect, validate, and calculate all inputs */
function calculate() {
  const lib = window.EcoTraceLib;
  const btn = $('calc-btn');
  btn.disabled = true;
  btn.textContent = 'Calculating…';

  try {
    const inputs = {
      carKm:       readNum('car_km', 0, 1000),
      carType:     $('car_type').value,
      flShort:     readNum('fl_short', 0, 20),
      flLong:      readNum('fl_long', 0, 10),
      pubTrans:    $('pub_trans').value,
      kwhMonth:    readNum('elec_kwh', 0, 1000),
      energySrc:   $('energy_src').value,
      heating:     $('heating').value,
      solar:       $('solar').value,
      hhSize:      readNum('hh_size', 1, 8),
      diet:        $('diet').value,
      foodWaste:   $('waste').value,
      localFood:   $('local').value,
      dairy:       $('dairy').value,
      clothes:     readNum('clothes', 0, 20),
      electronics: readNum('electronics', 0, 10),
      recycling:   $('recycling').value,
      secondhand:  $('secondhand').value,
    };

    const tT = lib.calcTransport(inputs.carKm, inputs.carType, inputs.flShort, inputs.flLong, inputs.pubTrans);
    const eT = lib.calcEnergy(inputs.kwhMonth, inputs.energySrc, inputs.heating, inputs.solar, inputs.hhSize);
    const fT = lib.calcFood(inputs.diet, inputs.foodWaste, inputs.localFood, inputs.dairy);
    const sT = lib.calcShopping(inputs.clothes, inputs.electronics, inputs.recycling, inputs.secondhand);
    const total = lib.r2(tT + eT + fT + sT);

    fp = { transport: tT, energy: eT, food: fT, shopping: sT, total, inputs };

    showResults(fp);
    renderEquivalences(fp);
    renderSmartPriority(fp);
    renderWhatIfSimulator(fp);
    getAITips();

    toast('Footprint calculated!');
  } catch (err) {
    console.error('[EcoTrace] Calculation error:', err);
    toast('Calculation error. Please try again.', 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = '⚡ Calculate footprint';
  }
}

/** Render score card, category bars, comparison bars, chart */
function showResults(d) {
  const lib = window.EcoTraceLib;

  $('s-total').textContent     = d.total;
  $('s-transport').textContent = `${d.transport} t`;
  $('s-energy').textContent    = `${d.energy} t`;
  $('s-food').textContent      = `${d.food} t`;
  $('s-shopping').textContent  = `${d.shopping} t`;

  const pct = v => d.total > 0 ? Math.min(100, Math.round((v / d.total) * 100)) : 0;
  $('bar-transport').style.width = `${pct(d.transport)}%`;
  $('bar-energy').style.width    = `${pct(d.energy)}%`;
  $('bar-food').style.width      = `${pct(d.food)}%`;
  $('bar-shopping').style.width  = `${pct(d.shopping)}%`;

  /* Badge */
  const tierMap = {
    great: ['badge-great', '🌿 Below Paris target'],
    ok:    ['badge-ok',    '👍 Below global average'],
    avg:   ['badge-avg',   '⚠️ Around global average'],
    high:  ['badge-high',  '🔴 Above global average'],
  };
  const [cls, label] = tierMap[lib.getBadge(d.total)];
  $('s-badge').innerHTML =
    `<div class="score-badge ${lib.escHtml(cls)}" aria-label="Rating: ${lib.escHtml(label)}">${lib.escHtml(label)}</div>`;

  /* Comparison */
  $('comp-yours').textContent = `${d.total} t`;
  $('comp-fill-yours').style.width = `${Math.min(100, (d.total / 10) * 100)}%`;

  const msgMap = [
    [2,  'var(--moss-lt)', `You're at or below the Paris 2°C target of 2.0 t. You're among the most climate-conscious people on the planet.`],
    [4,  'var(--sky)',     `Below the global average of 7.0 t. Great progress — check the AI plan below for further gains.`],
    [7,  'var(--amber)',   `Around the global average. Targeted changes in your top-emission category can make a real difference.`],
    [99, 'var(--danger)',  `Above the global average. The personalised plan below shows your biggest reduction opportunities.`],
  ];
  const [, color, msg] = msgMap.find(([t]) => d.total <= t);
  const msgEl = $('comp-msg');
  msgEl.style.color = color;
  msgEl.textContent = msg;

  drawChart(d);

  const sec = $('results');
  sec.classList.add('on');
  setProgress(100);
  setTimeout(() => sec.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
}

/** Draw / update the doughnut chart */
function drawChart(d) {
  if (typeof Chart === 'undefined') { setTimeout(() => drawChart(d), 200); return; }
  const ctx = $('chart').getContext('2d');
  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Transport', 'Energy', 'Food', 'Shopping'],
      datasets: [{
        data: [d.transport, d.energy, d.food, d.shopping],
        backgroundColor: ['#4285F4', '#FBBC05', '#34A853', '#EA4335'],
        borderColor: '#1A2130',
        borderWidth: 3,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#A5D6A7',
            font: { family: "'IBM Plex Mono', monospace", size: 11 },
            padding: 14, boxWidth: 10, boxHeight: 10,
          },
        },
        tooltip: {
          callbacks: { label: c => ` ${c.label}: ${c.raw} t CO₂e` },
          backgroundColor: '#1A2130',
          titleColor: '#E8F5E9',
          bodyColor: '#A5D6A7',
          borderColor: '#2C3A4A',
          borderWidth: 1,
        },
      },
    },
  });
}

/* ══════════════════════════════════════════════
   8. SMART PRIORITY ENGINE
   Analyses the user's footprint and returns
   context-aware actions ranked by personal impact.
   This is purely client-side for speed.
══════════════════════════════════════════════ */

/**
 * @typedef {object} PriorityAction
 * @property {string} icon
 * @property {string} category
 * @property {string} title
 * @property {string} reason  — references user's exact numbers
 * @property {number} saving  — estimated t CO₂e/year
 * @property {'easy'|'medium'|'hard'} effort
 */

/**
 * Generate a ranked list of priority actions based on the user's footprint.
 * Logic: evaluate each category vs. benchmarks; generate specific reasoning.
 * @param {object} d — footprint object with inputs
 * @returns {PriorityAction[]}
 */
function buildSmartPriority(d) {
  const actions = [];
  const { inputs: i } = d;

  /* ── Transport ── */
  if (d.transport > 1.5 && i.carType !== 'electric' && i.carType !== 'none') {
    actions.push({
      icon: '🚗', category: 'Transport',
      title: `Switch from ${i.carType} to an EV or hybrid`,
      reason: `Your car accounts for a large share of ${d.transport} t transport emissions (${i.carKm} km/week at ${i.carType} rates). An EV on India's grid emits ~75% less per km.`,
      saving: Math.round((d.transport * 0.6) * 10) / 10,
      effort: 'hard',
    });
  }
  if (Number(i.flLong) > 1) {
    actions.push({
      icon: '✈️', category: 'Transport',
      title: `Reduce long-haul flights (${i.flLong} → ${Math.max(0, i.flLong - 1)}/year)`,
      reason: `Each long-haul return flight emits ~1.2 t CO₂e including radiative forcing. Cutting one trip saves more than an average Indian's entire annual footprint.`,
      saving: 1.2,
      effort: 'medium',
    });
  }
  if (i.pubTrans === 'never' || i.pubTrans === 'occasional') {
    actions.push({
      icon: '🚌', category: 'Transport',
      title: 'Use public transport daily',
      reason: `Switching to daily bus/metro commuting from ${i.pubTrans} use can save ~0.4–0.8 t/year and reduce urban congestion.`,
      saving: 0.6,
      effort: 'easy',
    });
  }

  /* ── Energy ── */
  if (d.energy > 1 && i.energySrc !== 'renewable') {
    actions.push({
      icon: '☀️', category: 'Energy',
      title: 'Switch to renewable electricity tariff',
      reason: `Your ${i.energySrc} grid electricity contributes significantly to ${d.energy} t energy emissions. Renewable providers in India like TATA Power Green or rooftop solar cut grid emissions by ~90%.`,
      saving: Math.round((d.energy * 0.55) * 10) / 10,
      effort: 'medium',
    });
  }
  if (i.solar === 'no' && d.energy > 0.8) {
    actions.push({
      icon: '🔆', category: 'Energy',
      title: 'Install rooftop solar panels',
      reason: `With ${i.kwhMonth} kWh/month usage, a 2–3 kW rooftop system (₹1.5–2L) pays back in 4–5 years and eliminates most of your grid-electricity footprint.`,
      saving: Math.round((i.kwhMonth * 0.49 * 12 * 0.85) / 1000 * 10) / 10,
      effort: 'hard',
    });
  }

  /* ── Food ── */
  if (['meat_heavy', 'meat_avg'].includes(i.diet)) {
    actions.push({
      icon: '🥗', category: 'Food',
      title: 'Reduce red meat to 3× per week',
      reason: `Beef emits ~27 kg CO₂e per kg vs ~2 kg for chicken and ~0.9 kg for lentils. Your ${i.diet} diet adds ${d.food} t/year. Cutting beef 4 days/week saves ~0.5 t.`,
      saving: 0.5,
      effort: 'easy',
    });
  }
  if (['high', 'medium'].includes(i.foodWaste)) {
    actions.push({
      icon: '🗑️', category: 'Food',
      title: 'Cut food waste with meal planning',
      reason: `${i.foodWaste} food waste generates methane in landfill (80× more potent than CO₂ over 20 years). Meal planning and composting can eliminate most household waste.`,
      saving: 0.35,
      effort: 'easy',
    });
  }

  /* ── Shopping ── */
  if (i.secondhand === 'never') {
    actions.push({
      icon: '🔄', category: 'Shopping',
      title: 'Buy second-hand clothing & electronics',
      reason: `You currently never buy second-hand. Switching 50% of purchases to used goods cuts your ${d.shopping} t shopping footprint by ~40% and saves thousands of rupees annually.`,
      saving: Math.round((d.shopping * 0.4) * 10) / 10,
      effort: 'easy',
    });
  }
  if (Number(i.electronics) > 1) {
    actions.push({
      icon: '📱', category: 'Shopping',
      title: `Repair electronics instead of replacing (${i.electronics} → 1/year)`,
      reason: `Manufacturing a new smartphone emits ~70 kg CO₂e. Repairing or delaying replacement by 1 year per device avoids significant embedded carbon.`,
      saving: Math.round(((i.electronics - 1) * 0.07) * 10) / 10,
      effort: 'easy',
    });
  }

  /* Sort by savings descending */
  return actions.sort((a, b) => b.saving - a.saving).slice(0, 5);
}

/** Render the smart priority panel */
function renderSmartPriority(d) {
  const actions = buildSmartPriority(d);
  const lib = window.EcoTraceLib;
  const effortColor = { easy: 'var(--moss-lt)', medium: 'var(--amber)', hard: 'var(--danger)' };

  if (actions.length === 0) {
    $('priority-body').innerHTML = `<p style="color:var(--moss-lt);font-size:.9rem">🌟 Excellent! Your footprint is already well-optimised. Keep it up!</p>`;
    return;
  }

  $('priority-body').innerHTML = actions.map((a, idx) => `
    <div class="priority-item">
      <div class="priority-rank" aria-hidden="true">#${idx + 1}</div>
      <div class="priority-content">
        <div class="priority-header">
          <span class="priority-icon" aria-hidden="true">${lib.escHtml(a.icon)}</span>
          <strong class="priority-title">${lib.escHtml(a.title)}</strong>
          <span class="priority-saving" aria-label="Estimated saving ${a.saving} tonnes CO2 per year">
            ↓ ~${a.saving} t/yr
          </span>
        </div>
        <p class="priority-reason">${lib.escHtml(a.reason)}</p>
        <div class="priority-meta">
          <span class="priority-effort" style="color:${effortColor[a.effort]}">
            ● ${lib.escHtml(a.effort)} effort
          </span>
          <span class="priority-cat">${lib.escHtml(a.category)}</span>
        </div>
      </div>
    </div>
  `).join('');
}

/* ══════════════════════════════════════════════
   9. WHAT-IF SIMULATOR
   Lets users toggle individual changes and see
   the instant quantified impact on their total.
══════════════════════════════════════════════ */

/** Scenario definitions — delta function returns t CO₂e saved */
const SCENARIOS = [
  {
    id: 'ev',
    icon: '🔌',
    label: 'Switch to electric car',
    delta: d => d.inputs.carType !== 'electric' && d.inputs.carType !== 'none'
      ? Math.round(d.inputs.carKm * 52 * (0.21 - 0.05) / 1000 * 100) / 100
      : 0,
  },
  {
    id: 'vegan',
    icon: '🥗',
    label: 'Go vegan',
    delta: d => {
      const lib = window.EcoTraceLib;
      const current = lib.calcFood(d.inputs.diet, d.inputs.foodWaste, d.inputs.localFood, d.inputs.dairy);
      const vegan   = lib.calcFood('vegan', d.inputs.foodWaste, d.inputs.localFood, 'none');
      return Math.round((current - vegan) * 100) / 100;
    },
  },
  {
    id: 'no_flights',
    icon: '✈️',
    label: 'Cut all flights this year',
    delta: d => {
      const lib = window.EcoTraceLib;
      return Math.round(
        (d.inputs.flShort * lib.EF.flight.short + d.inputs.flLong * lib.EF.flight.long) / 1000 * 100
      ) / 100;
    },
  },
  {
    id: 'renewable',
    icon: '☀️',
    label: 'Switch to renewable energy',
    delta: d => {
      const lib = window.EcoTraceLib;
      if (d.inputs.energySrc === 'renewable') return 0;
      const current  = lib.calcEnergy(d.inputs.kwhMonth, d.inputs.energySrc, d.inputs.heating, d.inputs.solar, d.inputs.hhSize);
      const renew    = lib.calcEnergy(d.inputs.kwhMonth, 'renewable', d.inputs.heating, d.inputs.solar, d.inputs.hhSize);
      return Math.round((current - renew) * 100) / 100;
    },
  },
  {
    id: 'zero_waste',
    icon: '🗑️',
    label: 'Eliminate food waste',
    delta: d => {
      const lib = window.EcoTraceLib;
      return Math.round(((lib.EF.foodWaste[d.inputs.foodWaste] || 0) - 0) * 100) / 100;
    },
  },
  {
    id: 'secondhand',
    icon: '🔄',
    label: 'Buy only second-hand',
    delta: d => {
      const lib = window.EcoTraceLib;
      const current = lib.calcShopping(d.inputs.clothes, d.inputs.electronics, d.inputs.recycling, d.inputs.secondhand);
      const after   = lib.calcShopping(d.inputs.clothes, d.inputs.electronics, d.inputs.recycling, 'always');
      return Math.round((current - after) * 100) / 100;
    },
  },
];

/** Track which scenarios are toggled */
const scenarioState = {};

/** Render what-if cards */
function renderWhatIfSimulator(d) {
  const container = $('whatif-body');
  SCENARIOS.forEach(s => { scenarioState[s.id] = false; });

  container.innerHTML = `
    <div class="whatif-grid" id="whatif-grid">
      ${SCENARIOS.map(s => {
        const saving = s.delta(d);
        const pct    = saving > 0 ? Math.round((saving / d.total) * 100) : 0;
        return `
          <button class="whatif-card" id="wif-${s.id}"
            aria-pressed="false"
            aria-label="${s.label}: saves ${saving} tonnes CO2 per year (${pct}% of your total)"
            data-saving="${saving}">
            <span class="wif-icon" aria-hidden="true">${window.EcoTraceLib.escHtml(s.icon)}</span>
            <span class="wif-label">${window.EcoTraceLib.escHtml(s.label)}</span>
            <span class="wif-saving" aria-hidden="true">
              ${saving > 0 ? `↓ ${saving} t/yr` : 'Already optimal'}
            </span>
            ${saving > 0 ? `<span class="wif-pct" aria-hidden="true">${pct}% of total</span>` : ''}
          </button>`;
      }).join('')}
    </div>
    <div class="whatif-result" id="whatif-result" aria-live="polite" hidden>
      <span class="wif-result-label">Combined saving:</span>
      <span class="wif-result-num" id="wif-combined">0</span>
      <span class="wif-result-unit">t CO₂e/year</span>
      <span class="wif-result-new" id="wif-new-total"></span>
    </div>`;

  /* Attach toggle listeners */
  SCENARIOS.forEach(s => {
    const btn = $(`wif-${s.id}`);
    if (!btn) return;
    btn.addEventListener('click', () => toggleScenario(s.id, d));
  });
}

/** Toggle a what-if scenario on/off */
function toggleScenario(id, d) {
  scenarioState[id] = !scenarioState[id];
  const btn = $(`wif-${id}`);
  btn.classList.toggle('active', scenarioState[id]);
  btn.setAttribute('aria-pressed', String(scenarioState[id]));

  /* Sum all active savings (cap at total) */
  let totalSaving = 0;
  SCENARIOS.forEach(s => {
    if (scenarioState[s.id]) totalSaving += s.delta(d);
  });
  totalSaving = Math.min(d.total, Math.round(totalSaving * 100) / 100);
  const newTotal = Math.max(0, Math.round((d.total - totalSaving) * 100) / 100);

  const resultEl = $('whatif-result');
  if (Object.values(scenarioState).some(v => v)) {
    resultEl.hidden = false;
    $('wif-combined').textContent  = totalSaving;
    $('wif-new-total').textContent = `→ new total: ${newTotal} t/yr`;
  } else {
    resultEl.hidden = true;
  }
}

/* ══════════════════════════════════════════════
   10. IMPACT EQUIVALENCES
   Converts tonnes CO₂e into real-world terms
   that are easy to understand.
══════════════════════════════════════════════ */

/** @param {number} total — t CO₂e/year */
function renderEquivalences(d) {
  const t   = d.total;
  const lib = window.EcoTraceLib;

  const items = [
    {
      icon: '🌳',
      value: Math.round(t * 45),
      label: 'trees needed to offset annually',
      sub:   'Trees absorb ~22 kg CO₂/year each',
    },
    {
      icon: '✈️',
      value: Math.round(t / 0.255),
      label: 'short-haul flights equivalent',
      sub:   'e.g. Delhi ↔ Mumbai return trips',
    },
    {
      icon: '🚗',
      value: Math.round(t / 0.00021),
      label: 'km driven in a petrol car',
      sub:   'At DEFRA 2023 fleet average emission factors',
    },
    {
      icon: '💡',
      value: Math.round(t * 1000 / 0.49),
      label: 'kWh of mixed-grid electricity',
      sub:   'Equivalent home energy consumption',
    },
  ];

  $('equiv-grid').innerHTML = items.map(item => `
    <div class="equiv-item">
      <span class="equiv-icon" aria-hidden="true">${lib.escHtml(item.icon)}</span>
      <span class="equiv-value" aria-label="${item.value} ${item.label}">${item.value.toLocaleString()}</span>
      <span class="equiv-label">${lib.escHtml(item.label)}</span>
      <span class="equiv-sub">${lib.escHtml(item.sub)}</span>
    </div>
  `).join('');
}

/* ══════════════════════════════════════════════
   11. AI TIPS
   Calls /api/tips (backend proxies Gemini).
   Falls back to a context-aware client-side
   tip set if the server is unavailable.
══════════════════════════════════════════════ */

/** Build the structured prompt to send to the AI */
function buildTipsPrompt(d) {
  const i = d.inputs;
  return `My annual carbon footprint:

TOTAL: ${d.total} t CO₂e/year

TRANSPORT: ${d.transport} t
- Car: ${i.carKm} km/week, ${i.carType}
- Flights: ${i.flShort} short-haul + ${i.flLong} long-haul/year
- Public transport: ${i.pubTrans}

ENERGY: ${d.energy} t
- Electricity: ${i.kwhMonth} kWh/month on ${i.energySrc} grid
- Heating: ${i.heating} | Solar: ${i.solar} | Household: ${i.hhSize} people

FOOD: ${d.food} t
- Diet: ${i.diet} | Waste: ${i.foodWaste} | Local food: ${i.localFood} | Dairy: ${i.dairy}

SHOPPING: ${d.shopping} t
- New clothes: ${i.clothes}/month | Electronics: ${i.electronics}/year
- Recycling: ${i.recycling} | Second-hand: ${i.secondhand}

Please generate 6 personalised, actionable tips to reduce my footprint.`;
}

/** Render an array of tip objects into HTML */
function renderTipsHtml(tips) {
  const lib = window.EcoTraceLib;
  const effortColor = { easy: 'var(--moss-lt)', medium: 'var(--amber)', hard: 'var(--danger)' };
  const timeframeIcons = { immediate: '⚡', '1-3 months': '📅', '6-12 months': '🎯' };

  return tips.slice(0, 6).map((t, i) => `
    <div class="tip-item" style="animation-delay:${i * 0.07}s">
      <div class="tip-num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</div>
      <div>
        <div class="tip-meta-row">
          <span class="tip-cat">${lib.escHtml(t.category || '')}</span>
          ${t.effort    ? `<span class="tip-effort" style="color:${effortColor[t.effort] || 'var(--txt-3)'}">● ${lib.escHtml(t.effort)}</span>` : ''}
          ${t.timeframe ? `<span class="tip-timeframe">${lib.escHtml(timeframeIcons[t.timeframe] || '')} ${lib.escHtml(t.timeframe)}</span>` : ''}
        </div>
        <div class="tip-text">${lib.escHtml(t.tip || '')}</div>
        <span class="tip-impact" aria-label="Estimated impact: ${lib.escHtml(t.impact || '')}">
          ↓ ${lib.escHtml(t.impact || '')}
        </span>
      </div>
    </div>`).join('');
}

/** Generate context-aware fallback tips (no AI needed) */
function buildFallbackTips(d) {
  return buildSmartPriority(d).map(a => ({
    category:  a.category,
    tip:       a.reason,
    impact:    `~${a.saving} t CO₂e/year`,
    effort:    a.effort,
    timeframe: a.effort === 'easy' ? 'immediate' : '1-3 months',
  }));
}

/** Fetch AI tips from backend */
async function getAITips() {
  if (!fp) { toast('Calculate your footprint first.', 'err'); return; }

  const body = $('tips-body');
  const btn  = $('regen-btn');
  btn.disabled = true;

  /* Skeleton loader */
  body.innerHTML = `
    <div role="status" aria-label="Generating personalised tips, please wait">
      ${Array.from({ length: 6 }, () => `
        <div class="skel-row">
          <div class="skel" style="height:.62rem;width:28%;margin-bottom:.35rem"></div>
          <div class="skel" style="height:.85rem;width:100%"></div>
          <div class="skel" style="height:.85rem;width:78%;margin-top:.25rem"></div>
        </div>`).join('')}
    </div>`;

  try {
    const res = await fetch('/api/tips', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ prompt: buildTipsPrompt(fp) }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const { tips } = await res.json();
    if (!Array.isArray(tips)) throw new Error('Invalid response from server');
    body.innerHTML = renderTipsHtml(tips);

  } catch (err) {
    console.error('[EcoTrace] AI tips error:', err.message);
    body.innerHTML = `
      <div class="tip-notice" role="alert">
        ⚠️ AI tips unavailable${err.message.includes('503') ? ' — API key not configured on server' : ''}.
        Showing smart fallback recommendations instead.
      </div>
      ${renderTipsHtml(buildFallbackTips(fp))}`;
  } finally {
    btn.disabled = false;
  }
}

/* ══════════════════════════════════════════════
   12. AI CHAT WIDGET
   Floating conversational assistant.
   Knows the user's footprint context.
   Uses /api/chat endpoint (multi-turn).
══════════════════════════════════════════════ */

let chatOpen = false;

/** Append a message bubble to the chat log */
function appendChatMessage(text, role) {
  const log  = $('chat-messages');
  const msg  = document.createElement('div');
  msg.className = `chat-msg chat-msg-${role}`;
  msg.setAttribute('aria-label', `${role === 'user' ? 'You' : 'EcoAI'}: ${text}`);
  msg.innerHTML = `<div class="chat-bubble">${window.EcoTraceLib.escHtml(text)}</div>`;
  log.appendChild(msg);
  log.scrollTop = log.scrollHeight;
}

/** Show a typing indicator */
function showTyping() {
  const log  = $('chat-messages');
  const el   = document.createElement('div');
  el.id = 'chat-typing';
  el.className = 'chat-msg chat-msg-assistant';
  el.setAttribute('aria-label', 'EcoAI is typing');
  el.innerHTML = `<div class="chat-bubble chat-typing"><span></span><span></span><span></span></div>`;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

/** Remove typing indicator */
function hideTyping() {
  const el = $('chat-typing');
  if (el) el.remove();
}

/** Toggle chat panel open/closed */
function toggleChat(forceOpen) {
  chatOpen = forceOpen !== undefined ? forceOpen : !chatOpen;
  const panel  = $('chat-panel');
  const toggle = $('chat-toggle');
  const badge  = $('chat-badge');

  panel.hidden = !chatOpen;
  toggle.setAttribute('aria-expanded', String(chatOpen));
  if (chatOpen) {
    badge.hidden = true;
    $('chat-input').focus();
  }
}

/** Send a chat message to the assistant */
async function sendChatMessage(text) {
  if (!text.trim()) return;

  appendChatMessage(text, 'user');
  chatHistory.push({ role: 'user', text });

  const input  = $('chat-input');
  const form   = $('chat-form');
  input.value  = '';
  input.disabled = true;
  $('chat-status').querySelector('span:last-child').textContent = 'EcoAI is typing…';
  showTyping();

  try {
    const res = await fetch('/api/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        message: text,
        context: fp,                          /* full footprint context */
        history: chatHistory.slice(-6),       /* last 6 turns */
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    hideTyping();
    const reply = data.reply || 'Sorry, I could not respond right now.';
    appendChatMessage(reply, 'assistant');
    chatHistory.push({ role: 'model', text: reply });

  } catch (err) {
    hideTyping();
    console.error('[EcoTrace] Chat error:', err.message);
    /* Graceful local fallback */
    const fallback = fp
      ? `Your total footprint is ${fp.total} t CO₂e/year. Your biggest impact area is ${
          Object.entries({ transport: fp.transport, energy: fp.energy, food: fp.food, shopping: fp.shopping })
            .sort((a, b) => b[1] - a[1])[0][0]
        }. Check the Smart Action Priority section for personalised next steps!`
      : `I'm EcoAI! Please calculate your footprint first using the steps above, and I'll give you personalised advice.`;
    appendChatMessage(fallback, 'assistant');
    chatHistory.push({ role: 'model', text: fallback });
  } finally {
    input.disabled = false;
    $('chat-status').querySelector('span:last-child').textContent = 'Ask me about your footprint';
    input.focus();
  }
}

/** Initialise the chat widget */
function initChat() {
  $('chat-toggle').addEventListener('click', () => toggleChat());
  $('chat-close').addEventListener('click',  () => toggleChat(false));

  /* Keyboard: Esc closes chat */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && chatOpen) toggleChat(false);
  });

  $('chat-form').addEventListener('submit', e => {
    e.preventDefault();
    sendChatMessage($('chat-input').value.trim());
  });

  /* Welcome message */
  setTimeout(() => {
    appendChatMessage(
      "Hi! I'm EcoAI 🌿 I can help you understand your carbon footprint and find the best ways to reduce it. Calculate your footprint above, then ask me anything!",
      'assistant'
    );
    /* Show badge after 2s if chat not open */
    setTimeout(() => {
      if (!chatOpen) { $('chat-badge').hidden = false; }
    }, 2000);
  }, 1000);
}

/* ══════════════════════════════════════════════
   13. SHARE & DOWNLOAD
══════════════════════════════════════════════ */

async function shareResult() {
  if (!fp) { toast('Calculate your footprint first.', 'err'); return; }
  const text = `🌍 My annual carbon footprint is ${fp.total} t CO₂e — calculated with EcoTrace AI. What's yours? #CarbonFootprint #ClimateAction #EcoTrace`;
  if (navigator.share) {
    try { await navigator.share({ title: 'My Carbon Footprint — EcoTrace', text }); return; }
    catch (_) { /* fallthrough to clipboard */ }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Score copied to clipboard!');
  } catch (_) {
    toast('Could not copy. Please copy manually.', 'err');
  }
}

function downloadReport() {
  if (!fp) { toast('Calculate your footprint first.', 'err'); return; }
  const i    = fp.inputs;
  const date = new Date().toLocaleDateString('en-IN', { dateStyle: 'long' });
  const lines = [
    'EcoTrace — Carbon Footprint Report',
    `Generated: ${date}`,
    '═══════════════════════════════════════',
    '',
    `TOTAL ANNUAL FOOTPRINT: ${fp.total} t CO₂e/year`,
    '',
    'BREAKDOWN:',
    `  Transport : ${fp.transport} t`,
    `  Energy    : ${fp.energy} t`,
    `  Food      : ${fp.food} t`,
    `  Shopping  : ${fp.shopping} t`,
    '',
    'BENCHMARKS:',
    `  Paris 2°C target : 2.0 t`,
    `  India average    : 1.9 t`,
    `  Global average   : 7.0 t`,
    '',
    'YOUR INPUTS:',
    `  Car: ${i.carKm} km/week (${i.carType})`,
    `  Flights: ${i.flShort} short-haul + ${i.flLong} long-haul/year`,
    `  Public transport: ${i.pubTrans}`,
    `  Electricity: ${i.kwhMonth} kWh/month (${i.energySrc})`,
    `  Heating: ${i.heating} | Solar: ${i.solar} | Household: ${i.hhSize} people`,
    `  Diet: ${i.diet} | Waste: ${i.foodWaste} | Local food: ${i.localFood} | Dairy: ${i.dairy}`,
    `  New clothes: ${i.clothes}/month | Electronics: ${i.electronics}/year`,
    `  Recycling: ${i.recycling} | Second-hand: ${i.secondhand}`,
    '',
    '═══════════════════════════════════════',
    'EcoTrace — Hack2Skill Prompts War · Google AI Challenge 2025',
    'Emission factors: IPCC AR6, DEFRA 2023, IEA 2023',
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'ecotrace-report.txt';
  a.click();
  URL.revokeObjectURL(url);
  toast('Report downloaded!');
}

/* ══════════════════════════════════════════════
   14. ANIMATIONS
══════════════════════════════════════════════ */

/** Animated starfield (decorative) */
function initStarfield() {
  const canvas = $('starfield');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, stars = [];
  const N = 80;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  function makeStar() {
    return {
      x:   Math.random() * (W || 800),
      y:   Math.random() * (H || 600),
      r:   Math.random() * 1.2 + 0.2,
      a:   Math.random(),
      spd: Math.random() * 0.003 + 0.001,
    };
  }

  resize();
  window.addEventListener('resize', resize);
  stars = Array.from({ length: N }, makeStar);

  (function frame() {
    ctx.clearRect(0, 0, W, H);
    stars.forEach(s => {
      s.a += s.spd;
      const alpha = (Math.sin(s.a) * 0.5 + 0.5) * 0.6;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(52,168,83,${alpha})`;
      ctx.fill();
    });
    requestAnimationFrame(frame);
  })();
}

/** Live CO₂ counter (decorative hero widget) */
function initLiveCounter() {
  const el = $('live-counter');
  if (!el) return;
  /* Global CO₂: ~37 Gt/yr → ~1.17 t/sec */
  const DAILY_TONNES = 37_000_000_000 / 365;
  const msPerDay = 86_400_000;
  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  (function tick() {
    const elapsed = Date.now() - start.getTime();
    const added   = DAILY_TONNES * (elapsed / msPerDay);
    el.textContent = Math.round(added).toLocaleString('en-IN');
    setTimeout(tick, 1000);
  })();
}

/* ══════════════════════════════════════════════
   15. INIT
══════════════════════════════════════════════ */

(function init() {
  /* Guard: ensure emissions lib is loaded */
  if (!window.EcoTraceLib) {
    document.body.insertAdjacentHTML('afterbegin',
      '<div role="alert" style="position:fixed;top:0;left:0;right:0;z-index:9999;background:#EA4335;color:#fff;padding:1rem 1.5rem;font-family:sans-serif;font-size:.9rem">' +
      '⚠️ Could not load calculation library. Please run: <code>npm start</code> and open <a href="http://localhost:3000" style="color:#fff">http://localhost:3000</a>' +
      '</div>');
    return;
  }

  /* Step navigation */
  STEPS.forEach(s => {
    const tab = $(`tab-${s}`);
    if (tab) tab.addEventListener('click', () => goStep(s));
  });
  $('btn-next-energy')?.addEventListener('click',    () => goStep('energy'));
  $('btn-back-transport')?.addEventListener('click', () => goStep('transport'));
  $('btn-next-food')?.addEventListener('click',      () => goStep('food'));
  $('btn-back-energy')?.addEventListener('click',    () => goStep('energy'));
  $('btn-next-shopping')?.addEventListener('click',  () => goStep('shopping'));
  $('btn-back-food')?.addEventListener('click',      () => goStep('food'));

  /* Main calculate */
  $('calc-btn')?.addEventListener('click', calculate);
  $('regen-btn')?.addEventListener('click', getAITips);

  /* Share / download */
  $('share-btn')?.addEventListener('click',    shareResult);
  $('download-btn')?.addEventListener('click', downloadReport);

  /* Live calculator + range displays */
  initLiveCalc();

  /* Chat widget */
  initChat();

  /* Animations */
  initStarfield();
  initLiveCounter();
})();
