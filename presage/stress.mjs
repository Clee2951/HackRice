// Pure, SDK-independent scoring logic: turns SmartSpectra face-metrics
// samples into a per-section stress/attention summary and a break-time
// recommendation. Kept free of any @smartspectra/node-sdk import so it can
// be unit-tested and reused directly by the backend/report generator later.
//
// IMPORTANT: this is a heuristic proxy, not a validated clinical stress
// measurement. SmartSpectra classifies 8 basic (Ekman-style) expressions —
// there is no "stress" category. Stress corresponds to negative valence +
// elevated arousal, so we approximate it as a weighted combination of the
// expressions that fit that profile. State this plainly in any report/demo
// — don't oversell it as "measuring stress" outright.

// ExpressionType enum order from the SDK's generated types:
// UNSPECIFIED=0, ANGRY=1, CONTEMPT=2, DISGUST=3, FEAR=4, HAPPY=5, NEUTRAL=6,
// SAD=7, SURPRISE=8
export const EXPRESSION_NAMES = [
  "unspecified",
  "angry",
  "contempt",
  "disgust",
  "fear",
  "happy",
  "neutral",
  "sad",
  "surprise",
];

// Weight per expression name, roughly by valence/arousal contribution to
// stress. Fear/anger are the clearest markers; happiness counts *against* a
// stress reading; neutral/surprise/unspecified/contempt are left low/neutral.
export const EXPRESSION_STRESS_WEIGHT = {
  unspecified: 0,
  angry: 0.8,
  contempt: 0.4,
  disgust: 0.6,
  fear: 1.0,
  happy: -1.0,
  neutral: 0,
  sad: 0.5,
  surprise: 0,
};

// One decoded `Expression` sample (`{ scores: [{ type, confidence }] }`,
// confidence 0-100, scores summing to ~100 across types) -> a single 0-100
// "stress index" for that instant. Clamped to [0, 100].
export function stressIndexFromExpression(expression) {
  if (!expression?.scores?.length) return null;
  let score = 0;
  for (const { type, confidence } of expression.scores) {
    const name = EXPRESSION_NAMES[type] ?? "unspecified";
    const weight = EXPRESSION_STRESS_WEIGHT[name] ?? 0;
    score += weight * confidence;
  }
  return Math.max(0, Math.min(100, score));
}

/**
 * Summarize one Pomodoro/study section from a list of samples and decide
 * whether to extend the following break.
 *
 * @param {Array<{timestampUs: number, stressIndex: number|null, blinkDetected: boolean|null}>} samples
 *   One entry per received metrics tick, in chronological order.
 * @param {object} [options]
 * @param {number} [options.highStressThreshold=55] - stressIndex at/above this counts as "high stress" for a sample.
 * @param {number} [options.sustainedHighStressSec=300] - a continuous high-stress run at least this long (5 min default) triggers a break extension on its own.
 * @param {number} [options.highStressSharePct=40] - or, overall share of high-stress samples at/above this % also triggers it.
 * @param {number} [options.extraBreakMinutes=5] - break minutes to add when triggered.
 */
export function summarizeSection(samples, options = {}) {
  const {
    highStressThreshold = 55,
    sustainedHighStressSec = 5 * 60,
    highStressSharePct = 40,
    extraBreakMinutes = 5,
  } = options;

  const scored = samples.filter((s) => s.stressIndex != null);
  const avgStress = scored.length
    ? scored.reduce((sum, s) => sum + s.stressIndex, 0) / scored.length
    : null;

  const pctHighStress = scored.length
    ? (scored.filter((s) => s.stressIndex >= highStressThreshold).length / scored.length) * 100
    : null;

  // Longest continuous run of high-stress samples, by wall-clock duration
  // (not sample count — samples may arrive at an uneven rate).
  let longestHighStressRunSec = 0;
  let runStartUs = null;
  for (const s of scored) {
    if (s.stressIndex >= highStressThreshold) {
      if (runStartUs == null) runStartUs = s.timestampUs;
      longestHighStressRunSec = Math.max(
        longestHighStressRunSec,
        (s.timestampUs - runStartUs) / 1e6,
      );
    } else {
      runStartUs = null;
    }
  }

  // Blink rate: count rising edges (false -> true) over the session.
  let blinkCount = 0;
  let prevBlink = false;
  for (const s of samples) {
    if (s.blinkDetected && !prevBlink) blinkCount++;
    prevBlink = !!s.blinkDetected;
  }
  const durationMin =
    samples.length >= 2 ? (samples.at(-1).timestampUs - samples[0].timestampUs) / 1e6 / 60 : null;
  const blinkRatePerMin = durationMin ? blinkCount / durationMin : null;

  const shouldExtendBreak =
    longestHighStressRunSec >= sustainedHighStressSec || (pctHighStress ?? 0) >= highStressSharePct;

  return {
    sampleCount: samples.length,
    durationMin,
    avgStress,
    pctHighStress,
    longestHighStressRunSec,
    blinkRatePerMin,
    recommendation: shouldExtendBreak
      ? { extendBreak: true, extraBreakMinutes }
      : { extendBreak: false, extraBreakMinutes: 0 },
  };
}
