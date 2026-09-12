// Mouth Aspect Ratio (MAR) from face.landmarks, for yawn detection —
// analogous to eye.mjs's EAR for eye closure: low while the mouth is
// closed/normal speech, spikes sharply during a wide yawn.
//
// UNCONFIRMED ASSUMPTION (same caveat as eye.mjs): assumes SmartSpectra's
// 478 landmarks follow MediaPipe FaceMesh's standard topology. The indices
// below are MediaPipe's commonly-used mouth-opening points, NOT yet
// empirically validated the way EAR was — verify via
// mouth-openness-check.mjs (open your mouth wide / yawn on camera and watch
// MAR spike) before trusting yawn-based drowsiness alerts built on this.

export const MOUTH_INDICES = {
  top: 13, // upper inner-lip center
  bottom: 14, // lower inner-lip center
  left: 78, // left mouth corner (inner)
  right: 308, // right mouth corner (inner)
};

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Mouth Aspect Ratio from a decoded `landmarks.value` point array, or null if unavailable. */
export function mouthAspectRatio(points) {
  if (!points?.length) return null;
  const { top, bottom, left, right } = MOUTH_INDICES;
  const t = points[top];
  const b = points[bottom];
  const l = points[left];
  const r = points[right];
  if (!t || !b || !l || !r) return null;
  const width = dist(l, r);
  if (width === 0) return null;
  return dist(t, b) / width;
}

/**
 * Live yawn frequency monitor. A single wide-mouth event, sustained for at
 * least `minOpenSec`, counts as one yawn (debounced so it counts once, not
 * once per sample while the mouth stays open). Fires a "frequent-yawning"
 * alert when the count within a trailing window reaches `yawnCountThreshold`
 * — a single yawn is normal; *frequent* yawning is the drowsiness signal.
 *
 * @param {object} [options]
 * @param {number} [options.marThreshold=0.6] - MAR at/above this = mouth wide open. Needs empirical calibration per-camera.
 * @param {number} [options.minOpenSec=0.5] - mouth must stay open at least this long to count as a yawn, not a quick word/expression.
 * @param {number} [options.windowSec=300] - trailing window (default 5 min) for counting yawn frequency.
 * @param {number} [options.yawnCountThreshold=2] - this many yawns within the window triggers the alert.
 * @param {number} [options.alertCooldownSec=60] - minimum time between repeated alerts.
 * @param {(alert: {reason: string, yawnCount: number, timestampUs: number}) => void} [options.onAlert]
 */
export function createYawnMonitor(options = {}) {
  const {
    marThreshold = 0.6,
    minOpenSec = 0.5,
    windowSec = 300,
    yawnCountThreshold = 2,
    alertCooldownSec = 60,
    onAlert,
  } = options;

  let openStartUs = null;
  let countedThisOpen = false;
  const yawnTimestampsUs = [];
  let lastAlertUs = null;

  function trim(nowUs) {
    const cutoff = nowUs - windowSec * 1e6;
    while (yawnTimestampsUs.length && yawnTimestampsUs[0] < cutoff) yawnTimestampsUs.shift();
  }

  /**
   * Feed one MAR reading in chronological order.
   * @returns the alert object if one newly fired this tick, else null.
   */
  function push(timestampUs, mar) {
    if (mar == null) return null;

    if (mar >= marThreshold) {
      if (openStartUs == null) openStartUs = timestampUs;
      const openSec = (timestampUs - openStartUs) / 1e6;
      if (!countedThisOpen && openSec >= minOpenSec) {
        countedThisOpen = true;
        yawnTimestampsUs.push(timestampUs);
      }
    } else {
      openStartUs = null;
      countedThisOpen = false;
    }

    trim(timestampUs);

    const cooledDown = lastAlertUs == null || (timestampUs - lastAlertUs) / 1e6 >= alertCooldownSec;
    if (cooledDown && yawnTimestampsUs.length >= yawnCountThreshold) {
      lastAlertUs = timestampUs;
      const alert = { reason: "frequent-yawning", yawnCount: yawnTimestampsUs.length, timestampUs };
      onAlert?.(alert);
      return alert;
    }
    return null;
  }

  return { push };
}
