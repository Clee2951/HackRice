// Runs one Pomodoro/study section: captures face metrics for its full
// duration, then prints a stress/attention summary and a break-time
// recommendation (see stress.mjs) when the section ends. Also watches for
// drowsiness/microsleeps LIVE during the section (see drowsiness.mjs) and
// fires a wake-up alert the moment one is detected — unlike the stress
// summary, this can't wait until section-end to be useful.
//
// Run with:  npm run session                 (defaults to a 25-minute section)
//            SECTION_MINUTES=1 npm run session   (short section, for testing)
//
// Reads SMARTSPECTRA_API_KEY from ../.env via `node --env-file`.
//
// This is still a standalone proof of concept: the summary is only printed
// to the console and the wake-up "alert" is a terminal bell + a printed
// banner. Once the shape is agreed, this becomes either an event posted to
// the FastAPI backend or a value read by the Electron main process (which
// can trigger a real OS notification/sound) — see docs/presage-notes.md.

import { SmartSpectraSDK, faceMetrics, decodeMetrics } from "@smartspectra/node-sdk";
import { EXPRESSION_NAMES, stressIndexFromExpression, summarizeSection } from "./stress.mjs";
import { createDrowsinessMonitor } from "./drowsiness.mjs";
import { averageEar, createAdaptiveEyeClosureDetector } from "./eye.mjs";

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
/** @type {Array<{reason: string, closureSec: number, perclos: number|null, timestampUs: number}>} */
const drowsinessAlerts = [];

const eyeClosureDetector = createAdaptiveEyeClosureDetector();

const drowsinessMonitor = createDrowsinessMonitor({
  onAlert: (alert) => {
    drowsinessAlerts.push(alert);
    // Terminal bell + a hard-to-miss banner — a real app would trigger an
    // OS notification/sound here instead. Best-effort wake-up cue for now.
    process.stdout.write("");
    console.log(
      `\n!!! WAKE UP — ${alert.reason} detected ` +
        `(eyes closed ${alert.closureSec.toFixed(1)}s` +
        `${alert.perclos != null ? `, ${(alert.perclos * 100).toFixed(0)}% closed over last window` : ""}) !!!\n`,
    );
  },
});

sdk.on("metrics", (buf, timestampUs) => {
  const metrics = decodeMetrics(buf);
  const expression = metrics.face?.expression?.at(-1);
  const blink = metrics.face?.blinking?.at(-1);
  const blinkDetected = blink?.detected ?? null; // still used for stress.mjs's blink-rate stat
  const landmarks = metrics.face?.landmarks?.at(-1)?.value;
  const ear = averageEar(landmarks);

  const stressIndex = stressIndexFromExpression(expression);
  samples.push({ timestampUs, stressIndex, blinkDetected });

  // Drowsiness detection uses EAR (continuous, from landmarks), not the
  // blinking.detected flag — that tested unreliable for sustained closures.
  // Closure is relative to an adaptive per-session baseline, not a fixed
  // threshold — a fixed cutoff broke under downward gaze (looking at the
  // screen narrows the eye geometrically even when open). See
  // drowsiness.mjs / eye.mjs / docs/presage-notes.md.
  if (ear != null) {
    const { closed } = eyeClosureDetector.push(timestampUs, ear.avg);
    if (closed != null) {
      drowsinessMonitor.push({ timestampUs, eyesClosed: closed });
    }
  }

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

  const summary = { ...summarizeSection(samples), drowsinessAlertCount: drowsinessAlerts.length };
  console.log("\n--- Section summary ---");
  console.log(JSON.stringify(summary, null, 2));

  if (drowsinessAlerts.length > 0) {
    console.log(`\n=> ${drowsinessAlerts.length} drowsiness alert(s) fired during this section.`);
  }

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
