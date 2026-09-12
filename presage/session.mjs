// Runs one Pomodoro/study section: captures face metrics for its full
// duration, then prints a stress/attention summary and a break-time
// recommendation (see stress.mjs) when the section ends.
//
// Run with:  npm run session                 (defaults to a 25-minute section)
//            SECTION_MINUTES=1 npm run session   (short section, for testing)
//
// Reads SMARTSPECTRA_API_KEY from ../.env via `node --env-file`.
//
// This is still a standalone proof of concept: the summary is only printed
// to the console. Once the shape is agreed, this becomes either an event
// posted to the FastAPI backend or a value read by the Electron main
// process — see docs/presage-notes.md for the open integration question.

import { SmartSpectraSDK, faceMetrics, decodeMetrics } from "@smartspectra/node-sdk";
import { EXPRESSION_NAMES, stressIndexFromExpression, summarizeSection } from "./stress.mjs";

// DEBUG_EXPRESSIONS=1 prints the raw per-type confidence distribution
// (throttled to ~1/sec, since metrics arrive at camera framerate) so you can
// see what the classifier actually outputs instead of only the derived
// stress index — useful for calibrating weights/thresholds against reality.
const debugExpressions = process.env.DEBUG_EXPRESSIONS === "1";
let lastDebugPrintMs = 0;

const apiKey = process.env.SMARTSPECTRA_API_KEY;
if (!apiKey) {
  console.error(
    "Missing SMARTSPECTRA_API_KEY. Copy .env.example to .env at the repo root and fill in your key.",
  );
  process.exit(1);
}

const sectionMinutes = Number(process.env.SECTION_MINUTES ?? 25);
if (!Number.isFinite(sectionMinutes) || sectionMinutes <= 0) {
  console.error("SECTION_MINUTES must be a positive number.");
  process.exit(1);
}

const sdk = new SmartSpectraSDK({
  apiKey,
  requestedMetrics: [...faceMetrics],
});

/** @type {Array<{timestampUs: number, stressIndex: number|null, blinkDetected: boolean|null}>} */
const samples = [];

sdk.on("metrics", (buf, timestampUs) => {
  const metrics = decodeMetrics(buf);
  const expression = metrics.face?.expression?.at(-1);
  const blink = metrics.face?.blinking?.at(-1);

  const stressIndex = stressIndexFromExpression(expression);
  samples.push({
    timestampUs,
    stressIndex,
    blinkDetected: blink?.detected ?? null,
  });

  if (debugExpressions && expression?.scores?.length && Date.now() - lastDebugPrintMs > 1000) {
    lastDebugPrintMs = Date.now();
    const sorted = [...expression.scores]
      .sort((a, b) => b.confidence - a.confidence)
      .map((s) => `${EXPRESSION_NAMES[s.type] ?? s.type}=${s.confidence.toFixed(1)}%`)
      .join(" ");
    console.log(`[debug] ${sorted} -> stressIndex=${stressIndex?.toFixed(1)}`);
  }
});

sdk.on("validationStatus", (code, _timestampUs, hint) => {
  if (hint) console.warn(`[validation] ${code}: ${hint}`);
});

sdk.on("error", (code, message, retryable) => {
  console.error(`[error] ${code}: ${message}${retryable ? " (retryable)" : ""}`);
  if (!retryable) process.exitCode = 1;
});

sdk.useCamera();
sdk.start();
console.log(
  `Section started: ${sectionMinutes} minute(s). Sit facing the camera, well-lit. ` +
    `Ctrl+C to end early.`,
);

let ended = false;
async function endSection(reason) {
  if (ended) return;
  ended = true;
  console.log(`\nEnding section (${reason})...`);
  await sdk.stopAsync();
  await sdk.destroy();

  const summary = summarizeSection(samples);
  console.log("\n--- Section summary ---");
  console.log(JSON.stringify(summary, null, 2));

  if (summary.recommendation.extendBreak) {
    console.log(
      `\n=> Sustained/frequent high stress detected. Recommend +${summary.recommendation.extraBreakMinutes} min break.`,
    );
  } else {
    console.log("\n=> No sustained high stress detected. Normal break.");
  }

  process.exit(process.exitCode ?? 0);
}

const timer = setTimeout(() => endSection("time elapsed"), sectionMinutes * 60 * 1000);
process.on("SIGINT", () => {
  clearTimeout(timer);
  endSection("Ctrl+C");
});
process.on("SIGTERM", () => {
  clearTimeout(timer);
  endSection("SIGTERM");
});
