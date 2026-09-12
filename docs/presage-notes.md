# Presage / SmartSpectra integration notes

Project-specific notes for the Presage sponsor-challenge piece. Kept separate from
`.agents/skills/using-smartspectra/SKILL.md` (that file tracks the upstream repo via
`npx skills add` and gets overwritten on update — don't edit it directly).

## What we're building

Real-time focus/stress/emotion tracking during Pomodoro study sessions, feeding:
- A post-session report (focus/stress/emotion timeline).
- Dynamic break-time extension when sustained high stress is detected.
- A wake-up alert if the user appears to fall asleep.

## SDK choice: standalone Node/Electron

No browser-native SmartSpectra binding exists, so this runs as its own process rather
than inside the plain web frontend:
- `npm install @smartspectra/node-sdk` — plain Node 20+ (24 LTS recommended) for a
  quick proof of concept.
- Electron 28+ for the real app — same runtime can both capture vitals *and* enforce
  the lockdown/distraction-block, using Presage's
  [electron-quickstart sample](https://github.com/Presage-Security/SmartSpectra/tree/main/nodejs/samples/electron-quickstart)
  as a starting point. Three entry points: `@smartspectra/node-sdk/main` (camera),
  `/preload` (bridge), `/renderer` (UI/MediaStream).

## Requested metrics: face-only

Decided against `cardio`/`breathing` — **both** need more than just the face in
frame, not only breathing as initially assumed:
- `breathing` needs chest/abdomen visible (expected).
- `cardio` (pulse/HRV) *also* wants "face and upper chest ... visible,
  unobstructed" per Presage's own pulse-rate spec — confirmed empirically too:
  requesting `cardio` alone (no `breathing`) still triggered the
  `CHEST_NOT_VISIBLE` validation warning in testing.

So [presage/capture.mjs](../presage/capture.mjs) requests **`faceMetrics` only**:
landmarks (478 points), blink/talking detection, and expression classification
(angry/contempt/disgust/fear/happy/neutral/sad/surprise, each with a confidence
score). No chest framing required — just a normal webcam view of the face, which
fits a study-session setup. `eda` (skin conductance) is unused for now; could be
added later but likely has its own contact/framing requirements to check first.

## API key

- Get one at https://physiology.presagetech.com/auth/register
- Store as `SMARTSPECTRA_API_KEY` in a local `.env` (copy `.env.example` — gitignored, never commit it).
- Key obtained ✅ (2026-09-12) — held locally per-developer via `.env`, not shared in chat/repo.

## Stress scoring + section summary

[presage/stress.mjs](../presage/stress.mjs) — pure, SDK-free scoring logic (no
`@smartspectra/node-sdk` import, so it's unit-testable and reusable by the
backend later):
- `stressIndexFromExpression()` — turns one `Expression` sample's 8-way
  confidence distribution into a single 0-100 "stress index," via a
  weighted valence/arousal mapping (fear/anger weighted highest, happiness
  counts against it). **Heuristic proxy, not a validated clinical measure —
  say so plainly in the report/demo, don't oversell it.**
- `summarizeSection()` — takes all samples from one Pomodoro section and
  returns `avgStress`, `pctHighStress`, `longestHighStressRunSec`,
  `blinkRatePerMin`, and a `recommendation: { extendBreak, extraBreakMinutes }`.
  Triggers on either a sustained high-stress run (5+ continuous minutes,
  default) or a high overall share of high-stress samples (40%+, default) —
  both thresholds are tunable via `options`.

[presage/session.mjs](../presage/session.mjs) — runs one section end-to-end:
`SECTION_MINUTES=25 npm run session` (defaults to 25; override for quick
testing, e.g. `SECTION_MINUTES=1`). Prints the JSON summary + recommendation
when the section ends (timer or Ctrl+C).

Verified working end-to-end on 2026-09-12 against a live camera session
(175 samples over a short test run). Not yet verified with a real face
in frame for a full section — numbers from an empty-camera test are noise,
not signal (e.g. blink rate spiked from lack of a stable face, not real blinking).

**Classifier validated against real footage (2026-09-12):** live-camera testing
with a posed "angry face" produced weak, ambiguous confidence — turned out to
be a posed-vs-genuine-expression limitation (hard to convincingly act anger),
not a pipeline bug. Confirmed via [presage/test-file.mjs](../presage/test-file.mjs)
(`VIDEO_PATH=... npm run test-file`, feeds a recorded video through the same
pipeline via `useFile()` instead of the live camera): a real reaction-video
clip produced strong, confident readings (`happy=75%`, `disgust=76%`) and the
scoring/threshold correctly triggered `extendBreak: true` off a sustained
disgust-dominant stretch (41% high-stress share, 278 samples). A heavily
compressed 720p re-encode of the *same* clip, by contrast, produced only 29
samples with no usable expression data at all — the face model couldn't lock
on reliably. Not a resolution requirement per se (live webcam testing well
below 4K worked fine) — specifically that compression pass degraded quality
too much. Takeaway: keep webcam feeds reasonably clear, don't over-compress.

**Bug found and fixed in test-file.mjs:** `processingStatus` fires an initial
`kIdle` immediately at startup, before the file even begins decoding. Treating
that first `kIdle` as "finished" tore the pipeline down before processing any
frames. Fixed by only treating `kIdle`/`kError` as done after `kRunning` has
been observed at least once.

**Gotcha observed:** got transient `401 Authentication required` errors from
the SDK's device-pairing call with a key that had worked moments before, then
it resolved after rotating to a fresh key. Cause unconfirmed (rate limit? key
propagation delay? something else on Presage's end?) — worth a retry/backoff
around session start for the real app rather than assuming a validated key
always succeeds.

## Integration point with the rest of the app

TODO — decide once back/front/api teammates weigh in: does this Electron process talk
to the existing FastAPI backend (POST readings / websocket), or does it stay local and
only the end-of-session report gets sent to the backend?

## Open questions / TODO

- [ ] Decide backend integration point (see above).
- [ ] Define stress/drowsiness thresholds from face-only signals (expression
      distribution over time, blink rate/duration for drowsiness, landmark
      position for head-nod/sleep detection). No HRV available now that cardio
      is dropped — stress reads purely from expression + blink + landmarks.
- [ ] Report format handed to the LLM factory for the end-of-session summary.
- [ ] Run `presage/capture.mjs` interactively (real Ctrl+C, not a background
      kill) to confirm clean shutdown — a `kInvalidState` error appeared once
      during an automated background-kill test ~6s in; likely a test artifact
      (killed mid-settling, before a face was ever detected) but unconfirmed
      under normal interactive use.
</content>
