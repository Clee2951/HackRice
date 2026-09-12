// Eye-openness (Eye Aspect Ratio / EAR) computation from face.landmarks.
//
// Empirically confirmed (2026-09-12, via eye-openness-check.mjs against a
// live open/closed-eye test) that this works: a clear open-eye baseline
// (~0.25-0.42) separated from closed/blink dips (~0.03-0.09), using
// MediaPipe FaceMesh's standard 6-point eye-contour indices. SmartSpectra
// doesn't document its landmark topology, but 478 points is exactly
// MediaPipe's convention (468 base + 10 iris), and the confirmed EAR
// response validates that these indices are the right ones.
//
// EAR (Soukupová & Čech): for eye contour points
// [corner, upperLid1, upperLid2, corner, lowerLid2, lowerLid1]:
//   EAR = (dist(upperLid1, lowerLid1) + dist(upperLid2, lowerLid2))
//         / (2 * dist(corner1, corner2))
// Roughly constant while open, drops sharply toward 0 as the eye closes.

export const RIGHT_EYE_INDICES = [33, 160, 158, 133, 153, 144]; // subject's right eye (image left)
export const LEFT_EYE_INDICES = [362, 385, 387, 263, 373, 380]; // subject's left eye (image right)

// Threshold separating "closed" from "open", picked from the confirmed test
// data (open baseline ~0.25-0.42, closed/blink dips ~0.03-0.09) with margin
// on both sides. A placeholder default, not per-person calibrated.
export const EAR_CLOSED_THRESHOLD = 0.15;

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function earFor(points, indices) {
  const [p1, p2, p3, p4, p5, p6] = indices.map((i) => points[i]);
  if (!p1 || !p2 || !p3 || !p4 || !p5 || !p6) return null;
  return (dist(p2, p6) + dist(p3, p5)) / (2 * dist(p1, p4));
}

/**
 * Average EAR across both eyes from a decoded `landmarks.value` point array
 * (`[{x, y}, ...]`, 478 entries expected), or null if unavailable/incomplete.
 */
export function averageEar(points) {
  if (!points?.length) return null;
  const right = earFor(points, RIGHT_EYE_INDICES);
  const left = earFor(points, LEFT_EYE_INDICES);
  if (right == null || left == null) return null;
  return { left, right, avg: (left + right) / 2 };
}

/**
 * Adaptive closed-eye detector. A fixed EAR threshold breaks under downward
 * gaze — looking down at a screen/keyboard below the camera narrows the
 * visible eye geometrically even when genuinely open, which showed up as a
 * false ~60% "closed" reading in real testing (see docs/presage-notes.md).
 *
 * Instead of a fixed cutoff, this tracks a rolling high-percentile baseline
 * of recent EAR values (approximating "resting open, whatever the current
 * head/gaze angle is" — a fair assumption since eyes are open most of the
 * time during a study session) and flags closure as a large *relative* drop
 * from that baseline. Self-calibrating per person/session/camera-angle, no
 * separate calibration step needed.
 */
export function createAdaptiveEyeClosureDetector(options = {}) {
  const {
    baselineWindowSec = 30, // how far back to look when computing the "open" baseline
    baselinePercentile = 0.9, // high percentile approximates resting-open EAR, robust to blink/closure dips pulling an average down
    closedRatio = 0.5, // EAR dropping below this fraction of the baseline counts as closed
    minSamplesForBaseline = 30, // don't trust the baseline until we have enough data
  } = options;

  const window = []; // {timestampUs, ear}

  function trim(nowUs) {
    const cutoff = nowUs - baselineWindowSec * 1e6;
    while (window.length && window[0].timestampUs < cutoff) window.shift();
  }

  function baseline() {
    if (window.length < minSamplesForBaseline) return null;
    const sorted = [...window].map((w) => w.ear).sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * baselinePercentile));
    return sorted[idx];
  }

  /**
   * Feed one EAR reading in chronological order.
   * @returns {{closed: boolean|null, baseline: number|null}} `closed` is
   *   null until enough samples have accumulated to trust a baseline.
   */
  function push(timestampUs, ear) {
    window.push({ timestampUs, ear });
    trim(timestampUs);
    const b = baseline();
    if (b == null) return { closed: null, baseline: null };
    return { closed: ear < b * closedRatio, baseline: b };
  }

  return { push };
}
