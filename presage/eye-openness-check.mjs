// Diagnostic: compute Eye Aspect Ratio (EAR) from face.landmarks to see if
// we can get a continuous, reliable "how open is the eye" signal — a
// PERCLOS-style % closure — instead of relying on face.blinking, which
// tested unreliable for sustained closures (see docs/presage-notes.md).
//
// EAR is a standard technique (Soukupová & Čech): for 6 points around an
// eye's contour [corner, upperLid1, upperLid2, corner, lowerLid2, lowerLid1],
//   EAR = (dist(upperLid1, lowerLid1) + dist(upperLid2, lowerLid2))
//         / (2 * dist(corner1, corner2))
// EAR is roughly constant (~0.25-0.35) while the eye is open and drops
// sharply toward 0 as it closes.
//
// CONFIRMED (2026-09-12) against a live open/closed-eye test: clear
// separation between an open-eye baseline (~0.25-0.42) and closed/blink dips
// (~0.03-0.09), using MediaPipe FaceMesh's standard eye-contour indices --
// see eye.mjs for detail. This script remains useful for re-checking EAR
// behavior (e.g. under different lighting/camera setups) without needing to
// read raw session.mjs output.
//
// Run with:  npm run eye-check   (defaults to a 30-second live check)

import { SmartSpectraSDK, faceMetrics, decodeMetrics } from "@smartspectra/node-sdk";
import { averageEar } from "./eye.mjs";

const apiKey = process.env.SMARTSPECTRA_API_KEY;
if (!apiKey) {
  console.error(
    "Missing SMARTSPECTRA_API_KEY. Copy .env.example to .env at the repo root and fill in your key.",
  );
  process.exit(1);
}

const durationSec = Number(process.env.DURATION_SEC ?? 30);

const sdk = new SmartSpectraSDK({ apiKey, requestedMetrics: [...faceMetrics] });

let lastPrintMs = 0;
let warnedCount = false;

sdk.on("metrics", (buf) => {
  const metrics = decodeMetrics(buf);
  const landmarks = metrics.face?.landmarks?.at(-1);
  const points = landmarks?.value;
  if (!points?.length) return;

  if (!warnedCount && points.length !== 478) {
    warnedCount = true;
    console.warn(
      `[warn] Expected 478 landmarks (MediaPipe FaceMesh convention), got ${points.length}. ` +
        `The eye-index assumption below may not hold.`,
    );
  }

  if (Date.now() - lastPrintMs < 200) return; // ~5/sec, EAR changes fast during a blink
  lastPrintMs = Date.now();

  const result = averageEar(points);
  if (!result) return;

  const bar = "#".repeat(Math.round(Math.max(0, Math.min(1, result.avg / 0.35)) * 20));
  console.log(`EAR left=${result.left.toFixed(3)} right=${result.right.toFixed(3)} avg=${result.avg.toFixed(3)} ${bar}`);
});

// validationStatus intentionally not logged here — this script is just for
// eyeballing the EAR numbers, and the framing-guidance spam makes that
// output harder to copy/paste. Framing issues will just show up as missing
// or erratic EAR values instead.
sdk.on("error", (code, message, retryable) => {
  console.error(`[error] ${code}: ${message}${retryable ? " (retryable)" : ""}`);
});

sdk.useCamera();
sdk.start();
console.log(
  `Watching EAR for ${durationSec}s. Sit facing the camera. Alternate holding your eyes ` +
    `normally open and fully closed for a couple seconds at a time — the EAR number/bar ` +
    `should drop sharply toward 0 while closed if the landmark-index assumption is right.`,
);

setTimeout(async () => {
  await sdk.stopAsync();
  await sdk.destroy();
  process.exit(0);
}, durationSec * 1000);
