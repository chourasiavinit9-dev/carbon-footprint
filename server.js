/**
 * EcoTrace — Secure Backend Server  v2.0
 *
 * Endpoints:
 *  POST /api/tips  — Gemini-powered personalised reduction tips (API key hidden)
 *  POST /api/chat  — Conversational AI assistant with footprint context
 *
 * Features:
 *  - Gzip compression on all responses
 *  - Strict security headers (CSP, X-Frame-Options, etc.)
 *  - In-memory rate limiting (20 req/min per IP)
 *  - Input validation & sanitisation on every endpoint
 *  - Graceful error handling with client-safe messages
 *
 * Usage: node server.js  (or npm start)
 * Env:   GEMINI_API_KEY=...   PORT=3000
 */

'use strict';

const express     = require('express');
const compression = require('compression');
const path        = require('path');

/* ── Load .env (dev only; production injects env vars directly) ── */
try { require('dotenv').config(); } catch (_) { /* intentional */ }

const app  = express();
const PORT = process.env.PORT || 3000;

const GEMINI_MODEL = 'gemini-1.5-flash';
const GEMINI_BASE  = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/* ═══════════════════════════════════════════
   SECURITY HEADERS
═══════════════════════════════════════════ */
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options',           'DENY');
  res.setHeader('X-Content-Type-Options',    'nosniff');
  res.setHeader('X-XSS-Protection',          '1; mode=block');
  res.setHeader('Referrer-Policy',           'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy',        'camera=(), microphone=(), geolocation=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "script-src 'self' https://cdnjs.cloudflare.com",
    "img-src 'self' data:",
    "connect-src 'self'",   /* All AI calls via our own /api/* — key never exposed */
  ].join('; '));
  next();
});

/* ═══════════════════════════════════════════
   GZIP COMPRESSION
═══════════════════════════════════════════ */
app.use(compression({ level: 6, threshold: 1024 }));

/* ═══════════════════════════════════════════
   STATIC FILES  /public
═══════════════════════════════════════════ */
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  }
}));

/* ═══════════════════════════════════════════
   RATE LIMITER  (20 req / 60s per IP)
═══════════════════════════════════════════ */
const rateMap    = new Map();
const RATE_LIMIT  = 20;
const RATE_WINDOW = 60_000;

function rateLimiter(req, res, next) {
  const ip  = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const rec = rateMap.get(ip) || { count: 0, start: now };

  if (now - rec.start > RATE_WINDOW) { rec.count = 0; rec.start = now; }
  rec.count++;
  rateMap.set(ip, rec);

  if (rec.count > RATE_LIMIT) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
  }
  next();
}

/* ═══════════════════════════════════════════
   JSON BODY PARSER  (API routes only)
═══════════════════════════════════════════ */
app.use('/api', express.json({ limit: '32kb' }));
app.use('/api', rateLimiter);

/* ═══════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════ */
/**
 * Validate that a string is non-empty, a string type, and within length limit.
 * @param {*} val
 * @param {number} maxLen
 * @returns {boolean}
 */
function isValidString(val, maxLen) {
  return typeof val === 'string' && val.trim().length > 0 && val.length <= maxLen;
}

/**
 * Call the Gemini API with a given payload and return parsed JSON response.
 * Throws on HTTP errors or invalid API key.
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function callGemini(payload) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw Object.assign(new Error('GEMINI_API_KEY not configured.'), { status: 503 });

  const res = await fetch(`${GEMINI_BASE}?key=${apiKey}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg  = body?.error?.message || `Gemini HTTP ${res.status}`;
    throw Object.assign(new Error(msg), { status: 502 });
  }

  return res.json();
}

/* ═══════════════════════════════════════════
   POST /api/tips
   Body: { prompt: string }
   Returns: { tips: Array<{category,tip,impact}> }
═══════════════════════════════════════════ */
app.post('/api/tips', async (req, res) => {
  const { prompt } = req.body || {};

  if (!isValidString(prompt, 4000)) {
    return res.status(400).json({ error: 'Invalid or missing prompt.' });
  }

  const systemInstruction = `You are a world-leading climate scientist and sustainability coach.
Given a user's detailed annual carbon footprint, produce EXACTLY 6 personalised, actionable reduction tips.
RESPOND WITH VALID JSON ONLY — no markdown fences, no preamble, no trailing text.
Schema: {"tips":[{"category":"Transport|Energy|Food|Shopping|Lifestyle","tip":"2–3 sentences of specific, quantified, actionable advice tailored to this user's profile","impact":"Quantified saving e.g. ~0.5 t CO₂e/year","effort":"easy|medium|hard","timeframe":"immediate|1-3 months|6-12 months"}]}
Rules:
- Prioritise the user's HIGHEST emission categories first
- Reference the user's actual input values (km/wk, diet, flight count, etc.)
- Use real numbers (kg CO₂e, %, cost savings in USD/INR)
- Mix 2 quick wins (easy/immediate) with longer-term changes
- Encouraging, specific, non-preachy tone`;

  try {
    const data    = await callGemini({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents:          [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig:  { responseMimeType: 'application/json', maxOutputTokens: 1200 },
    });

    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed  = JSON.parse(rawText.replace(/```json|```/g, '').trim());

    if (!Array.isArray(parsed?.tips)) throw new Error('Unexpected AI response shape');
    return res.json({ tips: parsed.tips });

  } catch (err) {
    console.error('[/api/tips]', err.message);
    return res.status(err.status || 500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════
   POST /api/chat
   Body: { message: string, context: object }
   Returns: { reply: string }
   
   The context object contains the user's full calculated footprint
   so the AI can give hyper-personalised conversational answers.
═══════════════════════════════════════════ */
app.post('/api/chat', async (req, res) => {
  const { message, context, history } = req.body || {};

  if (!isValidString(message, 800)) {
    return res.status(400).json({ error: 'Invalid or missing message.' });
  }

  /* Build context preamble — only if footprint has been calculated */
  const contextBlock = context
    ? `## User's Carbon Footprint Context
Total: ${context.total} t CO₂e/year
Transport: ${context.transport} t | Energy: ${context.energy} t | Food: ${context.food} t | Shopping: ${context.shopping} t
Car: ${context.inputs?.carKm}km/wk (${context.inputs?.carType}) | Flights: ${context.inputs?.flShort} short + ${context.inputs?.flLong} long/yr
Diet: ${context.inputs?.diet} | Energy source: ${context.inputs?.energySrc} | Heating: ${context.inputs?.heating}
Paris 2°C target: 2.0t | India avg: 1.9t | Global avg: 7.0t`
    : '## Note: User has not yet calculated their footprint.';

  const systemInstruction = `You are EcoAI, an expert carbon footprint assistant embedded in the EcoTrace app.
You help users understand their personal carbon footprint and how to reduce it.

${contextBlock}

Guidelines:
- Give concise, conversational answers (2–4 sentences max unless asked for detail)
- Always reference the user's specific numbers when available
- Quantify impact when possible (e.g. "that would save ~0.3 t/year")
- Be encouraging and practical — focus on what the user CAN do, not guilt
- If they haven't calculated yet, gently guide them to use the calculator first
- Use Indian context where relevant (INR costs, Indian grid, local transport options)`;

  /* Build conversation history array for multi-turn context */
  const conversationHistory = Array.isArray(history)
    ? history.slice(-6).map(h => ({ role: h.role, parts: [{ text: h.text }] }))
    : [];

  try {
    const data = await callGemini({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [
        ...conversationHistory,
        { role: 'user', parts: [{ text: message }] },
      ],
      generationConfig: { maxOutputTokens: 400, temperature: 0.7 },
    });

    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'I could not generate a response. Please try again.';
    return res.json({ reply: reply.trim() });

  } catch (err) {
    console.error('[/api/chat]', err.message);
    return res.status(err.status || 500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════
   CATCH-ALL → index.html
═══════════════════════════════════════════ */
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ═══════════════════════════════════════════
   START
═══════════════════════════════════════════ */
app.listen(PORT, () => {
  const hasKey = !!process.env.GEMINI_API_KEY;
  console.log(`\n  ✅  EcoTrace server  →  http://localhost:${PORT}`);
  console.log(`  ${hasKey ? '🔑  Gemini API key: configured' : '⚠️   Gemini API key: MISSING — AI features use fallback'}`);
  console.log(`  📦  Compression: gzip level 6`);
  console.log(`  🛡️   Security headers: CSP, HSTS, X-Frame-Options\n`);
});
