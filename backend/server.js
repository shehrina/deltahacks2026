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

// Optional: warn if the Gemini key is missing (doesn't break anything)
if (!process.env.GEMINI_API_KEY) {
  console.warn(
    "[WARN] GEMINI_API_KEY is not set. If you're using Gemini, add GEMINI_API_KEY=... to Gemini-Integration-Key.env"
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

app.get("/", (req, res) => {
  res.send(
    `OK\nPOST /imu (source 1) -> ${path.basename(TELEMETRY1_PATH)}\nPOST /imu2 (source 2) -> ${path.basename(
      TELEMETRY2_PATH
    )}\nWS: ws://localhost:${PORT}\n`
  );
});

server.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
  console.log(`WebSocket on ws://localhost:${PORT}`);
  console.log(`Logging #1 to ${TELEMETRY1_PATH}`);
  console.log(`Logging #2 to ${TELEMETRY2_PATH}`);
});
