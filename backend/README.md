Project: DeltaHacks 12 — Posture Backend

Overview:

- Express + WebSocket server that accepts 3-axis accelerometer and events from two Arduino devices.
- A serial bridge script forwards JSON lines from an Arduino over serial to the server via HTTP POST.
- Incoming samples and events are appended to newline-delimited JSON log files (`ndjson`) and broadcast to WebSocket clients.

Key files:

- `server.js`: Main backend. Endpoints:
  - `POST /3-axis accelerometer` (source 1) and `POST /3-axis accelerometer` (source 2) — accept samples (must include numeric `pitch`) or events (`event` string).
  - `GET /latest1`, `GET /latest2` — return most recent sample per source.
  - `GET /history1`, `GET /history2` — return buffered history arrays.
  - WebSocket server broadcasts each incoming object to connected clients.
- `serial-bridge.js`: Serial-to-HTTP bridge. Usage:
  - `node serial-bridge.js <PORT_NAME> [BAUD] [HOST] [PORT] [PATH]`
  - Example: `node serial-bridge.js /dev/ttyUSB0 115200 localhost 8080 /imu`
  - Reads newline JSON from serial, validates, and posts to backend.
- `arduino_code.cpp`: Arduino sketch (MMA7660 accelerometer). Emits JSON lines with fields like `ax`, `ay`, `az`, `pitch`, `pitch_smooth`, `roll`, `a_mag`, `dpitch`, `ts` at ~20Hz.
- `telemetry.ndjson`, `telemetry2.ndjson`: Append-only logs where each line is a JSON object (sample or event).

Setup & run (backend):

1. Install dependencies: `npm install`
2. Start server: `npm run start` (or `npm run dev` for nodemon)
3. Optionally run serial bridge to forward Arduino data to the server.

API notes & testing:

- To post a sample manually:
  - `curl -X POST -H "Content-Type: application/json" --data '{"pitch":10}' http://localhost:8080/imu`
- To post an event:
  - `curl -X POST -H "Content-Type: application/json" --data '{"event":"button_click","ts":123456}' http://localhost:8080/imu`
- WebSocket URL: `ws://localhost:8080` — clients receive sample/event JSON objects in real time.

Arduino notes:

- Uses Grove MMA7660 (I2C). The sketch prints JSON per sample and supports a button-triggered calibration described in the Arduino README.

Telemetry format:

- Newline-delimited JSON (`ndjson`) — each line contains `kind: "sample"` or `kind: "event"` and a `source` field.

Developer tips:

- Tail logs: `tail -f telemetry.ndjson`
- Run the server locally before starting the serial bridge.
- For debugging, inspect console logs from `serial-bridge.js` and `server.js`.
