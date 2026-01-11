// serial-bridge.js
// Reads newline-delimited JSON from Arduino over USB Serial (COM port)
// and POSTs each JSON object to your Node backend.
//
// Usage (PowerShell):
//   & "C:\Program Files\nodejs\node.exe" serial-bridge.js COM8 115200 localhost 8080 /imu2
//
// Notes:
// - Close Arduino Serial Monitor/Plotter first, or COM port will be "busy".
// - Your Arduino should print ONE JSON object per line.

const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");
const http = require("http");

// Args
const PORT_NAME = process.argv[2]; // e.g. COM5 / COM8
const BAUD = Number(process.argv[3] || 115200);
const POST_HOST = process.argv[4] || "localhost";
const POST_PORT = Number(process.argv[5] || 8080);
const POST_PATH = process.argv[6] || "/imu";

if (!PORT_NAME) {
    console.log("Usage: node serial-bridge.js <COM_PORT> [BAUD] [HOST] [PORT] [PATH]");
    console.log("Example: node serial-bridge.js COM5 115200 localhost 8080 /imu");
    process.exit(1);
}

function postJSON(obj) {
    const body = JSON.stringify(obj);

    const req = http.request(
        {
            hostname: POST_HOST,
            port: POST_PORT,
            path: POST_PATH,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body),
            },
            timeout: 2000,
        },
        (res) => {
            res.resume();
            if (res.statusCode && res.statusCode >= 400) {
                console.error(`[HTTP ${res.statusCode}] ${POST_PATH}`);
            }
        }
    );

    req.on("timeout", () => req.destroy(new Error("request timeout")));
    req.on("error", (e) => console.error("[POST error]", e.message));

    req.write(body);
    req.end();
}

console.log(`[Bridge] Serial=${PORT_NAME} @ ${BAUD} -> http://${POST_HOST}:${POST_PORT}${POST_PATH}`);

const port = new SerialPort({ path: PORT_NAME, baudRate: BAUD });
const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));

port.on("open", () => console.log(`[Serial] Opened ${PORT_NAME}`));
port.on("error", (e) => console.error("[Serial error]", e.message));

let sent = 0;
setInterval(() => {
    if (sent > 0) console.log(`[Bridge] sent ${sent} msgs (last 1s)`);
    sent = 0;
}, 1000);

parser.on("data", (line) => {
    const s = line.trim();

    // Ignore non-JSON noise
    if (!s.startsWith("{") || !s.endsWith("}")) return;

    try {
        const obj = JSON.parse(s);

        // Accept either:
        //  - normal samples (pitch number)
        //  - calibration/event messages (event string)
        const isSample = typeof obj.pitch === "number";
        const isEvent = typeof obj.event === "string";

        if (!isSample && !isEvent) return;

        postJSON(obj);
        sent++;
    } catch (e) {
        console.error("[JSON parse error]", e.message, "line=", s);
    }
});
