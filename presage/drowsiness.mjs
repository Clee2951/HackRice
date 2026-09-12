// Live, incremental microsleep/drowsiness detection from an eyes-closed
// signal. Deliberately NOT a batch end-of-section summary like stress.mjs —
// "wake the user up" only works as a real-time trigger fired the moment it's
// detected, not something read from a report after the section is over.
//
// Signal history: originally tried SmartSpectra's `face.blinking.detected`
// directly, assuming it stayed true for a closure's whole duration. Testing
// showed this was unreliable — a 3+ second deliberate closure often produced
// zero drowsiness alerts. Replaced with a continuous Eye Aspect Ratio (EAR)
// computed from face.landmarks (see eye.mjs), thresholded into an
// eyesClosed boolean by the caller — EAR was empirically confirmed to
// separate open (~0.25-0.42) from closed (~0.03-0.09) cleanly. This module
// itself doesn't know or care where `eyesClosed` comes from.
//
// Approach: PERCLOS (percentage of eyelid closure over time) — the standard
// heuristic in driver-drowsiness-monitoring systems. Two independent
// triggers, either one fires an alert:
//   - "microsleep": a single continuous closure longer than a normal blink.
//   - "sustained-drowsiness": eyes closed a large share of a rolling window,
//     even if no single closure was dramatically long.

/**
 * @param {object} [options]
 * @param {number} [options.microsleepThresholdSec=1.0] - a continuous closure at/above this is a microsleep, not a normal blink.
 * @param {number} [options.perclosWindowSec=60] - rolling window for the % eyes-closed calculation.
 * @param {number} [options.perclosThreshold=0.4] - 40%+ eyes-closed over the window triggers "sustained-drowsiness".
 * @param {number} [options.alertCooldownSec=20] - minimum time between alerts. A still-drowsy state
 *   re-alerts periodically at this interval rather than firing on every single tick.
 * @param {(alert: {reason: string, closureSec: number, perclos: number|null, timestampUs: number}) => void} [options.onAlert]
 *   Called once per newly-fired alert.
 */
export function createDrowsinessMonitor(options = {}) {
  const {
    microsleepThresholdSec = 1.0,
    perclosWindowSec = 60,
    perclosThreshold = 0.4,
    alertCooldownSec = 20,
    onAlert,
  } = options;

  let currentRunStartUs = null; // start of the current continuous closed-eye run; null if eyes open
  let lastAlertUs = null; // timestamp of the last fired alert, for the cooldown
  const window = []; // {timestampUs, closed} ring buffer for the trailing PERCLOS window

  function trim(nowUs) {
    const cutoff = nowUs - perclosWindowSec * 1e6;
    while (window.length && window[0].timestampUs < cutoff) window.shift();
  }

  function perclos() {
    if (window.length < 2) return null;
    let closedUs = 0;
    for (let i = 1; i < window.length; i++) {
      if (window[i - 1].closed) closedUs += window[i].timestampUs - window[i - 1].timestampUs;
    }
    const spanUs = window.at(-1).timestampUs - window[0].timestampUs;
    return spanUs > 0 ? closedUs / spanUs : null;
  }

  /**
   * Feed one sample in chronological order.
   * @param {{timestampUs: number, eyesClosed: boolean}} sample
   * @returns the alert object if one newly fired this tick, else null.
   */
  function push({ timestampUs, eyesClosed }) {
    window.push({ timestampUs, closed: !!eyesClosed });
    trim(timestampUs);

    if (eyesClosed) {
      if (currentRunStartUs == null) currentRunStartUs = timestampUs;
    } else {
      currentRunStartUs = null;
    }

    const closureSec = currentRunStartUs != null ? (timestampUs - currentRunStartUs) / 1e6 : 0;
    const p = perclos();

    const cooledDown = lastAlertUs == null || (timestampUs - lastAlertUs) / 1e6 >= alertCooldownSec;

    if (cooledDown) {
      if (closureSec >= microsleepThresholdSec) {
        lastAlertUs = timestampUs;
        const alert = { reason: "microsleep", closureSec, perclos: p, timestampUs };
        onAlert?.(alert);
        return alert;
      }
      if (p != null && p >= perclosThreshold) {
        lastAlertUs = timestampUs;
        const alert = { reason: "sustained-drowsiness", closureSec, perclos: p, timestampUs };
        onAlert?.(alert);
        return alert;
      }
    }
    return null;
  }

  return { push };
}
