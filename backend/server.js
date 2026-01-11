// server.js
const path = require("path");

// Load environment variables from your custom env file
require("dotenv").config({
  path: path.join(__dirname, "Gemini-Integration-Key.env"),
});

const http = require("http");
const express = require("express");
const cors = require("cors");
const WebSocket = require("ws");
const fs = require("fs");

// Gemini helpers
const { buildTelemetrySummary, runGemini } = require("./gemini");

const PORT = Number(process.env.PORT || 8080);

const app = express();
app.use(cors());
app.use(express.json({ limit: "256kb" }));

const TELEMETRY1_PATH =
  process.env.TELEMETRY1_PATH || path.join(__dirname, "telemetry.ndjson");
const TELEMETRY2_PATH =
  process.env.TELEMETRY2_PATH || path.join(__dirname, "telemetry2.ndjson");

const MAX_BUFFER = Number(process.env.MAX_BUFFER || 2000);
let history1 = [];
let history2 = [];

let latest1 = { pitch: 0, ts: Date.now(), source: 1 };
let latest2 = { pitch: 0, ts: Date.now(), source: 2 };

// ---- Gemini config knobs (safe defaults) ----
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
const ANALYSIS_DEFAULT_WINDOW = Number(process.env.ANALYSIS_WINDOW || 300); // samples
const ANALYSIS_MAX_WINDOW = Number(process.env.ANALYSIS_MAX_WINDOW || 1000);
const SLOUCH_DEG = Number(process.env.SLOUCH_DEG || 15);

// warn if the Gemini key is missing (doesn't break telemetry server)
if (!process.env.GEMINI_API_KEY) {
  console.warn(
    "[WARN] GEMINI_API_KEY is not set. Add GEMINI_API_KEY=... to backend/Gemini-Integration-Key.env if using Gemini."
  );
}

function toNum(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)))
    return Number(v);
  return undefined;
}

function appendNdjson(filePath, obj) {
  fs.appendFile(filePath, JSON.stringify(obj) + "\n", () => {});
}

function normalizeSample(body) {
  const pitch = toNum(body?.pitch);
  if (pitch === undefined) return { ok: false, error: "pitch must be a number" };

  const ts = toNum(body?.ts) ?? Date.now();

  const sample = {
    kind: "sample",
    ax: toNum(body?.ax),
    ay: toNum(body?.ay),
    az: toNum(body?.az),
    pitch,
    pitch_smooth: toNum(body?.pitch_smooth),
    roll: toNum(body?.roll),
    a_mag: toNum(body?.a_mag),
    dpitch: toNum(body?.dpitch),
    baseline_pitch: toNum(body?.baseline_pitch),
    button: toNum(body?.button),
    button_click: toNum(body?.button_click),
    ts,
  };

  return { ok: true, msg: sample };
}

function normalizeEvent(body) {
  const event = typeof body?.event === "string" ? body.event : undefined;
  if (!event) return { ok: false, error: "event must be a string" };

  const ts = toNum(body?.ts) ?? Date.now();
  const msg = { ...body, kind: "event", ts };

  return { ok: true, msg };
}

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  }
}

wss.on("connection", (ws) => {
  ws.send(JSON.stringify(latest1));
  ws.send(JSON.stringify(latest2));
});

function handleIncoming(reqBody, source, telemetryPath, historyArr, setLatest) {
  if (typeof reqBody?.event === "string") {
    const norm = normalizeEvent(reqBody);
    if (!norm.ok) return { ok: false, status: 400, payload: norm };

    const msg = { ...norm.msg, source };
    appendNdjson(telemetryPath, msg);
    broadcast(msg);

    historyArr.push(msg);
    if (historyArr.length > MAX_BUFFER) historyArr.shift();

    return { ok: true, status: 200, payload: { ok: true } };
  }

  const norm = normalizeSample(reqBody);
  if (!norm.ok) return { ok: false, status: 400, payload: norm };

  const msg = { ...norm.msg, source };
  setLatest(msg);

  appendNdjson(telemetryPath, msg);
  broadcast(msg);

  historyArr.push(msg);
  if (historyArr.length > MAX_BUFFER) historyArr.shift();

  return { ok: true, status: 200, payload: { ok: true } };
}

// Arduino #1
app.post("/imu", (req, res) => {
  const out = handleIncoming(req.body, 1, TELEMETRY1_PATH, history1, (m) => (latest1 = m));
  res.status(out.status).json(out.payload);
});

// Arduino #2
app.post("/imu2", (req, res) => {
  const out = handleIncoming(req.body, 2, TELEMETRY2_PATH, history2, (m) => (latest2 = m));
  res.status(out.status).json(out.payload);
});

app.get("/latest1", (req, res) => res.json(latest1));
app.get("/latest2", (req, res) => res.json(latest2));
app.get("/history1", (req, res) => res.json(history1));
app.get("/history2", (req, res) => res.json(history2));

/**
 * Gemini Health Check
 * Confirms your backend can "see" GEMINI_API_KEY and what model it will use.
 */
app.get("/gemini/health", (req, res) => {
  res.json({
    ok: true,
    hasKey: Boolean(process.env.GEMINI_API_KEY),
    model: GEMINI_MODEL,
  });
});

// Gemini-powered posture analysis endpoint
app.post("/gemini/analyze", async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(400).json({
        ok: false,
        error: "GEMINI_API_KEY missing. Add it to backend/Gemini-Integration-Key.env",
      });
    }

    const windowReq = toNum(req.body?.window) ?? ANALYSIS_DEFAULT_WINDOW;
    const window = Math.max(20, Math.min(ANALYSIS_MAX_WINDOW, Math.floor(windowReq)));

    const source = req.body?.source ?? "both";

    const pickWindow = (arr) => arr.slice(Math.max(0, arr.length - window));

    const s1 = pickWindow(history1).filter((x) => x.kind === "sample");
    const s2 = pickWindow(history2).filter((x) => x.kind === "sample");

    let combinedSamples = [];
    if (source === 1 || source === "1") combinedSamples = s1;
    else if (source === 2 || source === "2") combinedSamples = s2;
    else combinedSamples = [...s1, ...s2].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));

    // basic fallback stats for Gemini analysis
    const pitches = combinedSamples
      .map((s) => s.pitch)
      .filter((p) => typeof p === "number" && Number.isFinite(p));

    const n = pitches.length;
    const min = n ? Math.min(...pitches) : null;
    const max = n ? Math.max(...pitches) : null;
    const avg = n ? pitches.reduce((a, b) => a + b, 0) / n : null;
    const slouchCount = n ? pitches.filter((p) => p >= SLOUCH_DEG).length : 0;
    const slouchPct = n ? (slouchCount / n) * 100 : 0;

    const telemetryText = buildTelemetrySummary(combinedSamples);

    const systemPrompt = [
      "You are an assistant analyzing posture telemetry from a wearable IMU.",
      "You must return STRICT JSON only (no markdown, no extra commentary).",
      "Your job: summarize posture quality and provide actionable insights.",
      "",
      "JSON schema:",
      "{",
      '  "overall": "good|okay|bad",',
      '  "key_findings": ["..."],',
      '  "metrics": {',
      '    "samples": number,',
      '    "pitch_min_deg": number|null,',
      '    "pitch_avg_deg": number|null,',
      '    "pitch_max_deg": number|null,',
      `    "slouch_threshold_deg": ${SLOUCH_DEG},`,
      '    "slouch_percent": number',
      "  },",
      '  "recommendations": ["..."],',
      '  "confidence": "low|medium|high"',
      "}",
      "",
      "Rules:",
      "- Keep it concise (max 5 findings, max 5 recommendations).",
      "- If samples are few or noisy, lower confidence.",
      "- Do not mention medical diagnosis. This is educational feedback only.",
    ].join("\n");

    const userPrompt = [
      `Analyze the posture telemetry below and produce JSON using the schema.`,
      "",
      "Telemetry summary:",
      telemetryText,
    ].join("\n");

    const raw = await runGemini({ systemPrompt, userPrompt });

    // Parse Gemini output as JSON (strict). If parsing fails, return fallback + raw text.
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      parsed = null;
    }

    const fallback = {
      overall:
        slouchPct >= 60 ? "bad" : slouchPct >= 25 ? "okay" : "good",
      key_findings: [
        n ? `Slouching (>=${SLOUCH_DEG}°) for ~${slouchPct.toFixed(1)}% of samples.` : "No valid samples yet.",
      ],
      metrics: {
        samples: n,
        pitch_min_deg: min === null ? null : Number(min.toFixed(2)),
        pitch_avg_deg: avg === null ? null : Number(avg.toFixed(2)),
        pitch_max_deg: max === null ? null : Number(max.toFixed(2)),
        slouch_threshold_deg: SLOUCH_DEG,
        slouch_percent: Number(slouchPct.toFixed(1)),
      },
      recommendations: [
        "Try a 20–30s posture reset: shoulders back, chin neutral, sit tall.",
        "If you’re slouching often, raise your screen to eye level or use lumbar support.",
      ],
      confidence: n >= 120 ? "high" : n >= 40 ? "medium" : "low",
    };

    return res.json({
      ok: true,
      window,
      source,
      gemini_used: true,
      result: parsed ?? fallback,
      // Include raw ONLY if parsing failed (useful for debugging)
      raw_if_unparsed: parsed ? undefined : raw,
    });
  } catch (err) {
    console.error("[/gemini/analyze] Error:", err);
    res.status(500).json({
      ok: false,
      error: err?.message || "Unknown error",
    });
  }
});

app.get("/", (req, res) => {
  res.send(
    `OK\n` +
      `POST /imu (source 1) -> ${path.basename(TELEMETRY1_PATH)}\n` +
      `POST /imu2 (source 2) -> ${path.basename(TELEMETRY2_PATH)}\n` +
      `GET  /gemini/health\n` +
      `POST /gemini/analyze\n` +
      `WS: ws://localhost:${PORT}\n`
  );
});

server.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
  console.log(`WebSocket on ws://localhost:${PORT}`);
  console.log(`Logging #1 to ${TELEMETRY1_PATH}`);
  console.log(`Logging #2 to ${TELEMETRY2_PATH}`);
  console.log(`Gemini model: ${GEMINI_MODEL}`);
});
