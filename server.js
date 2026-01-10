// server.js
const http = require("http");
const express = require("express");
const cors = require("cors");
const WebSocket = require("ws");

const PORT = 8080;

const app = express();
app.use(cors());
app.use(express.json());

// Store latest message so new clients can instantly get something
let latest = { pitch: 0, ts: Date.now() };

/**
 * ESP32 can POST JSON like this: { "pitch": 12.4, "ts": 1736292000 }
 */
app.post("/pitch", (req, res) => {
  const { pitch, ts } = req.body || {};
  if (typeof pitch !== "number") {
    return res.status(400).json({ ok: false, error: "pitch must be a number" });
  }

  latest = { pitch, ts: typeof ts === "number" ? ts : Date.now() };
  broadcast(latest);

  console.log(`[HTTP] pitch=${latest.pitch.toFixed(2)} ts=${latest.ts}`);
  res.json({ ok: true });
});

let demoTimer = null;

app.post("/demo/start", (req, res) => {
  if (demoTimer) return res.json({ ok: true, alreadyRunning: true });

  let t = 0;
  demoTimer = setInterval(() => {
    // Fake slouch wave: 0..25 degrees
    const pitch = 12 + 12 * Math.sin(t);
    t += 0.15;

    latest = { pitch, ts: Date.now() };
    broadcast(latest);
    // Optional: log occasionally
    // console.log(`[DEMO] pitch=${pitch.toFixed(2)}`);
  }, 100); // 10 Hz

  res.json({ ok: true });
});

app.post("/demo/stop", (req, res) => {
  if (demoTimer) clearInterval(demoTimer);
  demoTimer = null;
  res.json({ ok: true });
});

app.get("/health", (req, res) => {
  res.json({ ok: true, latest });
});

// Create one HTTP server that Express + WebSocket share
const server = http.createServer(app);

// WebSocket server on same port
const wss = new WebSocket.Server({ server });

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

wss.on("connection", (ws) => {
  console.log("[WS] Browser/client connected");

  // Send latest immediately
  ws.send(JSON.stringify(latest));

  ws.on("message", (data) => {
    // If ESP32 connects via WS instead of HTTP, it can send JSON directly
    try {
      const parsed = JSON.parse(data.toString());
      if (typeof parsed.pitch === "number") {
        latest = { pitch: parsed.pitch, ts: parsed.ts ?? Date.now() };
        broadcast(latest);
        console.log(`[WS-IN] pitch=${latest.pitch.toFixed(2)} ts=${latest.ts}`);
      }
    } catch {
      // ignore junk
    }
  });

  ws.on("close", () => {
    console.log("[WS] Client disconnected");
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on: http://0.0.0.0:${PORT}`);
  console.log(`✅ WebSocket endpoint: ws://0.0.0.0:${PORT}`);
  console.log(`✅ POST pitch here:     http://0.0.0.0:${PORT}/pitch`);
  console.log(`➡️  IMPORTANT: from phone use ws://<YOUR_LAPTOP_IP>:${PORT}`);
});





// terminal a command
// node server.js
// terminal b command
// curl -X POST http://localhost:8080/pitch \ -H "Content-Type: application/json" \ -d '{"pitch":12.4,"ts":1736292000}'


// FOR DEMO MODE:
//curl -X POST http://localhost:8080/demo/start --- starts demo mode
//curl -X POST http://localhost:8080/demo/stop  --- stops demo mode