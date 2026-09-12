// Head tilt (roll) and a forward/backward-nod proxy from face.landmarks.
//
// This is NOT true 3D head pose (that needs solvePnP + camera intrinsics,
// out of scope here) -- these are 2D heuristics, good enough to catch the
// gross drowsiness signals called for: lateral head tilt, and forward/
// backward head drift.
//
// UNCONFIRMED ASSUMPTION (same as eye.mjs/mouth.mjs): MediaPipe FaceMesh
// topology. Validate empirically via face-signals-check.mjs before trusting
// alerts built on this.

const LEFT_EYE_OUTER = 33;
const RIGHT_EYE_OUTER = 263;
const NOSE_TIP = 1;

/**
 * Head roll in degrees: angle of the line between the outer eye corners
 * relative to horizontal. ~0 when level, growing as the head tilts to
 * either side. Absolute and posture/gaze-independent — unlike the nose-drop
 * proxy below, this doesn't need a baseline, since level eyes are level
 * eyes regardless of where the head is pointed vertically.
 */
export function headRollDegrees(points) {
  if (!points?.length) return null;
  const l = points[LEFT_EYE_OUTER];
  const r = points[RIGHT_EYE_OUTER];
  if (!l || !r) return null;
  return (Math.atan2(r.y - l.y, r.x - l.x) * 180) / Math.PI;
}

/**
 * A forward/backward nod proxy: the nose tip's vertical position relative
 * to the eye line, normalized by inter-eye distance (roughly scale-
 * invariant to distance from camera). NOT an absolute pitch angle — a
 * user's normal working posture already has some fixed pitch (e.g. looking
 * down at a screen), which isn't itself drowsiness. Meant to be tracked as
 * a *relative drift* against a rolling per-session baseline, same idea as
 * eye.mjs's adaptive eye-closure baseline.
 */
export function noseDropRatio(points) {
  if (!points?.length) return null;
  const l = points[LEFT_EYE_OUTER];
  const r = points[RIGHT_EYE_OUTER];
  const nose = points[NOSE_TIP];
  if (!l || !r || !nose) return null;
  const eyeLineY = (l.y + r.y) / 2;
  const interEyeDist = Math.hypot(r.x - l.x, r.y - l.y);
  if (interEyeDist === 0) return null;
  return (nose.y - eyeLineY) / interEyeDist;
}

/**
 * Live head-posture monitor. Tracks a rolling baseline of `noseDropRatio`
 * (this session's normal working posture, whatever pitch that happens to
 * be) and flags a *sustained* large deviation from it as head-nodding
 * (drooping forward) or the head falling back. Tracks `headRollDegrees`
 * directly (no baseline needed) for sustained lateral tilt. Same
 * continuous-run + cooldown pattern as drowsiness.mjs's PERCLOS monitor.
 *
 * @param {object} [options]
 * @param {number} [options.baselineWindowSec=60] - how far back to look for the "normal posture" baseline.
 * @param {number} [options.minSamplesForBaseline=30] - don't trust the baseline until we have enough data.
 * @param {number} [options.noseDropDeviationThreshold=0.3] - a noseDropRatio this far from baseline (in either direction) counts as abnormal posture.
 * @param {number} [options.rollDegreesThreshold=20] - |roll| at/above this counts as a lateral tilt.
 * @param {number} [options.sustainedSec=2] - deviation must persist continuously at least this long to alert (filters brief, normal head movement).
 * @param {number} [options.alertCooldownSec=30]
 * @param {(alert: {reason: string, detail: object, timestampUs: number}) => void} [options.onAlert]
 */
export function createHeadPostureMonitor(options = {}) {
  const {
    baselineWindowSec = 60,
    minSamplesForBaseline = 30,
    noseDropDeviationThreshold = 0.3,
    rollDegreesThreshold = 20,
    sustainedSec = 2,
    alertCooldownSec = 30,
    onAlert,
  } = options;

  const baselineWindow = []; // {timestampUs, noseDropRatio} — only accumulates while posture looks normal
  let abnormalStartUs = null;
  let abnormalReason = null;
  let lastAlertUs = null;

  function trimBaseline(nowUs) {
    const cutoff = nowUs - baselineWindowSec * 1e6;
    while (baselineWindow.length && baselineWindow[0].timestampUs < cutoff) baselineWindow.shift();
  }

  function baseline() {
    if (baselineWindow.length < minSamplesForBaseline) return null;
    const sum = baselineWindow.reduce((s, w) => s + w.noseDropRatio, 0);
    return sum / baselineWindow.length;
  }

  /**
   * @param {number} timestampUs
   * @param {number|null} rollDeg
   * @param {number|null} noseDrop
   * @returns the alert object if one newly fired this tick, else null.
   */
  function push(timestampUs, rollDeg, noseDrop) {
    const base = baseline();

    let reason = null;
    let detail = {};
    if (rollDeg != null && Math.abs(rollDeg) >= rollDegreesThreshold) {
      reason = "head-tilt";
      detail = { rollDeg };
    } else if (base != null && noseDrop != null && Math.abs(noseDrop - base) >= noseDropDeviationThreshold) {
      reason = noseDrop > base ? "head-nod" : "head-tilt-back";
      detail = { noseDrop, baseline: base };
    }

    if (reason) {
      if (abnormalReason !== reason) {
        abnormalStartUs = timestampUs;
        abnormalReason = reason;
      }
    } else {
      abnormalStartUs = null;
      abnormalReason = null;
      // Only feed the baseline while posture looks normal, so a genuine
      // sustained droop doesn't drag its own reference point down with it.
      if (noseDrop != null) {
        baselineWindow.push({ timestampUs, noseDropRatio: noseDrop });
        trimBaseline(timestampUs);
      }
    }

    const sustainedForSec = abnormalStartUs != null ? (timestampUs - abnormalStartUs) / 1e6 : 0;
    const cooledDown = lastAlertUs == null || (timestampUs - lastAlertUs) / 1e6 >= alertCooldownSec;

    if (reason && sustainedForSec >= sustainedSec && cooledDown) {
      lastAlertUs = timestampUs;
      const alert = { reason, detail, timestampUs };
      onAlert?.(alert);
      return alert;
    }
    return null;
  }

  return { push };
}
