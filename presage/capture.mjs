// Standalone proof-of-concept: open the default camera via the SmartSpectra SDK
// and print live face-analysis metrics to the console.
//
// Run with:  npm start   (from this presage/ directory)
// Reads SMARTSPECTRA_API_KEY from ../.env via `node --env-file`.
//
// Metrics requested: face only (landmarks, blink, talking, expression).
// cardio and breathing are both excluded on purpose — per Presage's own
// pulse-rate spec, cardio metrics also want "face and upper chest ...
// visible, unobstructed", not just the face. Face-only avoids any chest
// framing requirement, which is the point: the user just needs to be
// visible from the face, as in a normal webcam view during a study session.
//
// This is deliberately minimal — no stress-scoring or sleep-detection logic
// yet. Once this proves metrics come through, this logic moves into the
// Electron app (see docs/presage-notes.md) and/or gets piped to the FastAPI
// backend.

import { SmartSpectraSDK, faceMetrics, decodeMetrics } from "@smartspectra/node-sdk";
import { EXPRESSION_NAMES } from "./stress.mjs";

const apiKey = process.env.SMARTSPECTRA_API_KEY;

if (!apiKey) {
  console.error(
    "Missing SMARTSPECTRA_API_KEY. Copy .env.example to .env at the repo root " +
      "and fill in your key, then run `npm start` from this directory " +
      "(it loads ../.env automatically).",
  );
  process.exit(1);
}

const sdk = new SmartSpectraSDK({
  apiKey,
  requestedMetrics: [...faceMetrics],
});

// Latest sample helper — metrics arrive as time-series arrays; we only care
// about the most recent value for a "current reading" style readout.
function latest(samples) {
  return samples?.at(-1);
}

sdk.on("metrics", (buf) => {
  const metrics = decodeMetrics(buf);

  const parts = [];

  const blink = latest(metrics.face?.blinking);
  if (blink) {
    parts.push(`blink=${blink.detected}`);
  }
  const talking = latest(metrics.face?.talking);
  if (talking) {
    parts.push(`talking=${talking.detected}`);
  }
  const expression = latest(metrics.face?.expression);
  if (expression?.scores?.length) {
    // scores is a distribution across all expression types — take the
    // highest-confidence one as the "current" expression.
    const top = expression.scores.reduce((a, b) =>
      b.confidence > a.confidence ? b : a,
    );
    parts.push(
      `expression=${EXPRESSION_NAMES[top.type] ?? top.type} (${top.confidence.toFixed(1)}%)`,
    );
  }
  const landmarks = latest(metrics.face?.landmarks);
  if (landmarks?.value?.length) {
    parts.push(`landmarks=${landmarks.value.length}`);
  }

  if (parts.length > 0) {
    console.log(`[${new Date().toISOString()}] ${parts.join(" | ")}`);
  }
});

sdk.on("validationStatus", (code, _timestampUs, hint) => {
  if (hint) {
    console.warn(`[validation] ${code}: ${hint}`);
  }
});

sdk.on("error", (code, message, retryable) => {
  console.error(`[error] ${code}: ${message}${retryable ? " (retryable)" : ""}`);
  if (!retryable) {
    process.exitCode = 1;
  }
});

sdk.useCamera();
sdk.start();
console.log("Capturing from camera — sit in frame, well-lit, facing forward. Ctrl+C to stop.");

async function shutdown() {
  console.log("\nStopping...");
  await sdk.stopAsync();
  await sdk.destroy();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
