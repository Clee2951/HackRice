// Sanity-check the face-expression classifier against a recorded video file
// instead of the live camera, to separate "the model/pipeline is broken"
// from "a posed expression in front of a live camera reads weak" — trying to
// act angry on camera produced low confidence in earlier testing, which is a
// known posed-vs-genuine-expression limitation, not necessarily a bug. See
// docs/presage-notes.md.
//
// Usage:
//   VIDEO_PATH=/path/to/clip.mp4 npm run test-file
//
// Point VIDEO_PATH at any short (10-60s) video with a clear, strong facial
// expression — a screen recording of a movie scene, a downloaded sample
// clip, whatever you have. Same framing requirements as the live camera:
// well-lit, mostly-still, forward-facing face.

import {
  SmartSpectraSDK,
  faceMetrics,
  decodeMetrics,
  ProcessingStatus,
} from "@smartspectra/node-sdk";
import { EXPRESSION_NAMES, stressIndexFromExpression, summarizeSection } from "./stress.mjs";

const apiKey = process.env.SMARTSPECTRA_API_KEY;
const videoPath = process.env.VIDEO_PATH;

if (!apiKey) {
  console.error(
    "Missing SMARTSPECTRA_API_KEY. Copy .env.example to .env at the repo root and fill in your key.",
  );
  process.exit(1);
}
if (!videoPath) {
  console.error("Missing VIDEO_PATH. Usage: VIDEO_PATH=/path/to/clip.mp4 npm run test-file");
  process.exit(1);
}

const sdk = new SmartSpectraSDK({
  apiKey,
  requestedMetrics: [...faceMetrics],
});

const samples = [];

sdk.on("metrics", (buf, timestampUs) => {
  const metrics = decodeMetrics(buf);
  const expression = metrics.face?.expression?.at(-1);
  const blink = metrics.face?.blinking?.at(-1);
  const stressIndex = stressIndexFromExpression(expression);

  samples.push({ timestampUs, stressIndex, blinkDetected: blink?.detected ?? null });

  if (expression?.scores?.length) {
    const sorted = [...expression.scores]
      .sort((a, b) => b.confidence - a.confidence)
      .map((s) => `${EXPRESSION_NAMES[s.type] ?? s.type}=${s.confidence.toFixed(1)}%`)
      .join(" ");
    console.log(`[frame] ${sorted} -> stressIndex=${stressIndex?.toFixed(1)}`);
  }
});

sdk.on("validationStatus", (code, _timestampUs, hint) => {
  if (hint) console.warn(`[validation] ${code}: ${hint}`);
});

sdk.on("error", (code, message, retryable) => {
  console.error(`[error] ${code}: ${message}${retryable ? " (retryable)" : ""}`);
});

// Watching processingStatus for the idle/error transition (rather than
// waitUntilComplete(), which blocks synchronously and could stall our
// 'metrics' event listener) is the docs' recommended way to detect
// end-of-file for a headless useFile() run.
//
// Gotcha found by testing: processingStatus fires an initial kIdle right at
// startup, before the file has even begun decoding (kRunning hasn't
// happened yet). Treating that first kIdle as "finished" tears the pipeline
// down before it processes a single frame. Only treat kIdle/kError as done
// once we've actually observed kRunning at least once.
let sawRunning = false;
let finished = false;
sdk.on("processingStatus", async (status) => {
  if (status === ProcessingStatus.kRunning) sawRunning = true;
  if (finished || !sawRunning) return;
  if (status === ProcessingStatus.kIdle || status === ProcessingStatus.kError) {
    finished = true;
    console.log(`\nFile finished (status=${status}).`);
    await sdk.destroy();

    if (samples.length === 0) {
      console.error(
        "No metrics samples were produced — check the video shows a clear, well-lit, forward-facing face.",
      );
      process.exit(1);
    }

    const summary = summarizeSection(samples);
    console.log("\n--- File summary ---");
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  }
});

sdk.useFile(videoPath);
sdk.start();
console.log(`Processing ${videoPath} ...`);

// Safety net in case the idle/error transition never fires.
setTimeout(() => {
  if (!finished) {
    console.error("Timed out waiting for the file to finish processing.");
    process.exit(1);
  }
}, 2 * 60 * 1000);
