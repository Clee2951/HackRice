# Stress scoring: formula and logic

How [presage/stress.mjs](../presage/stress.mjs) turns SmartSpectra's raw face
metrics into a per-section stress reading and a break-time recommendation,
and why it's built this way. Companion to [presage-notes.md](presage-notes.md)
(integration decisions/gotchas) — this doc is just the scoring method itself.

## The core problem: there's no "stress" category

SmartSpectra's `face` metrics classify expressions into 8 Ekman-style basic
emotions — anger, contempt, disgust, fear, happiness, sadness, surprise,
neutral — plus blink/talking detection and 478 landmark points. **None of
that is "stress."** Stress is a state (negative valence + elevated arousal),
not a basic emotion, so it has to be derived rather than read off directly.

## Step 1 — one sample → a 0-100 stress index

Each `Expression` sample carries a confidence distribution across all 8
types (roughly summing to 100%). We map each type to a weight by how much it
represents negative-valence/high-arousal state, then take a weighted sum:

| Expression | Weight | Reasoning |
|---|---|---|
| fear | **1.0** | negative valence, high arousal — clearest stress marker |
| angry | **0.8** | negative valence, high arousal |
| disgust | **0.6** | negative valence, moderate arousal |
| sad | **0.5** | negative valence, but low arousal — reads as low-energy distress |
| contempt | **0.4** | negative valence, low-moderate arousal |
| surprise | 0 | ambiguous valence alone |
| neutral | 0 | baseline |
| happy | **-1.0** | positive valence — evidence *against* stress |

```js
// presage/stress.mjs
score = Σ (weight[expression_type] × confidence[expression_type])
score = clamp(score, 0, 100)
```

Confidence values are 0-100 and the weights are in `[-1, 1]`, so a single
dominant negative expression can drive the score close to 100 (e.g. fear at
90% confidence ≈ 90), while a happy-dominant sample clamps to 0 regardless of
how negative the other, smaller confidences look.

**This is a heuristic proxy, not a validated clinical stress measurement.**
Facial-expression-only inference is inherently noisier than a physiological
signal like HRV (which this project doesn't use — see presage-notes.md for
why cardio/HRV was dropped). State this plainly in the report/demo; don't
oversell it as "measuring stress."

## Step 2 — never trust a single frame

One sample is noise — a blink, a weird angle, or a brief expression twitch
can spike or zero the index momentarily. Real signal only shows up over a
**window of samples across a whole Pomodoro section**, which is why scoring
happens in two stages: per-sample index (above), then a section-level
summary (below) that looks at sustained patterns, not instants.

## Step 3 — section summary

`summarizeSection(samples)` takes every sample collected during one section
and computes:

- **`avgStress`** — mean stress index across the section. A single rough
  number for "how stressed overall," but flattens spikes.
- **`pctHighStress`** — % of samples at/above `highStressThreshold` (default
  **55**). Captures *how often* it was bad, regardless of *how long*
  continuously.
- **`longestHighStressRunSec`** — the longest unbroken stretch (by wall-clock
  time, not sample count, since samples can arrive unevenly) spent at/above
  threshold. Captures *sustained* stress specifically, which matters more
  for "should we extend the break" than a few isolated spikes do.
- **`blinkRatePerMin`** — counted from blink-detection rising edges over the
  section's duration. A secondary, independent signal: elevated blink rate
  correlates with stress/fatigue and isn't just noise in the same way a
  single expression frame can be, so it's tracked alongside the expression
  score rather than folded into it.

## Step 4 — the break-time decision

```js
shouldExtendBreak =
  longestHighStressRunSec >= sustainedHighStressSec   // default 5 min
  OR
  pctHighStress >= highStressSharePct                 // default 40%
```

Either condition alone is enough to trigger `{ extendBreak: true,
extraBreakMinutes }` (default extra: **5 minutes**). Two independent paths on
purpose:
- A **long continuous stretch** (5+ min pinned above threshold) catches
  sustained distress even if it's a minority of the section.
- A **high overall share** (40%+ of samples) catches frequent but broken-up
  spikes that never individually last 5 minutes.

## Current defaults are placeholders, not validated numbers

`highStressThreshold=55`, `sustainedHighStressSec=300`,
`highStressSharePct=40`, `extraBreakMinutes=5` were picked as reasonable
starting guesses, not derived from real data. They're all tunable via
`summarizeSection(samples, options)`. Calibration against genuine
(non-acted) concentration-task sessions — see the open TODO in
presage-notes.md — is what should actually set these before relying on them
for real break decisions.

## Known validation to date

- Posed expressions (e.g. deliberately acting "angry" on a live camera)
  produce weak, ambiguous confidence — a posed-vs-genuine-expression gap,
  not a bug in this formula or the classifier. See presage-notes.md.
- Verified against real (non-acted) footage via `presage/test-file.mjs`:
  strong, confident classifier output, and the formula + thresholds above
  correctly triggered `extendBreak: true` off a genuine sustained
  negative-expression stretch (41% high-stress share in that clip).
- Not yet validated against a genuine concentration/frustration task from an
  actual live session — that's the next calibration step.
