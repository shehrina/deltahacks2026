// gemini.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

function makeGeminiClient() {
  const apiKey = requireEnv("GEMINI_API_KEY");
  const modelName = process.env.GEMINI_MODEL || "gemini-1.5-flash";

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  return { model, modelName };
}

// Turn raw pitch samples into a compact “analysis-ready” text blob.
function buildTelemetrySummary(samples) {
  if (!samples.length) return "No samples available.";

  const pitches = samples
    .map((s) => s.pitch)
    .filter((p) => typeof p === "number" && Number.isFinite(p));

  if (!pitches.length) return "No numeric pitch samples available.";

  const n = pitches.length;
  const min = Math.min(...pitches);
  const max = Math.max(...pitches);
  const avg = pitches.reduce((a, b) => a + b, 0) / n;

  // “slouch-ish” heuristic — adjust threshold to your project
  const SLOUCH_DEG = 15;
  const slouchCount = pitches.filter((p) => p >= SLOUCH_DEG).length;
  const slouchPct = (slouchCount / n) * 100;

  // last sample info
  const last = samples[samples.length - 1];

  return [
    `Samples: ${n}`,
    `Pitch(deg): min=${min.toFixed(2)} avg=${avg.toFixed(2)} max=${max.toFixed(2)}`,
    `Heuristic: slouch>=${SLOUCH_DEG}deg for ${slouchPct.toFixed(1)}% of samples`,
    `Latest: pitch=${Number(last.pitch).toFixed(2)} ts=${last.ts}`,
  ].join("\n");
}

async function runGemini({ systemPrompt, userPrompt }) {
  const { model } = makeGeminiClient();

  // Gemini SDK supports a single prompt string.
  // We “simulate” system+user by clearly separating them:
  const combined = [
    "SYSTEM INSTRUCTIONS:",
    systemPrompt,
    "",
    "USER REQUEST:",
    userPrompt,
  ].join("\n");

  const result = await model.generateContent(combined);
  const text = result?.response?.text?.() ?? "";
  return text.trim();
}

module.exports = {
  buildTelemetrySummary,
  runGemini,
};
