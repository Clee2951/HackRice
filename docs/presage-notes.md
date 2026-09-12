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

## Drowsiness / wake-up detection

[presage/drowsiness.mjs](../presage/drowsiness.mjs) — live, incremental
(NOT a batch end-of-section summary like stress.mjs, since "wake the user
up" only works as a real-time trigger). Uses **PERCLOS** (percentage of
eyelid closure over time) — the standard heuristic in driver-drowsiness
systems — off the same `face.blinking` signal already used for blink rate:
- **microsleep**: a single continuous closure at/above `microsleepThresholdSec`
  (default 1.0s — well past a normal ~100-400ms blink) fires immediately.
- **sustained-drowsiness**: eyes closed at/above `perclosThreshold` (default
  40%) of a trailing `perclosWindowSec` window (default 60s), even without
  one dramatically long closure.

Wired into [presage/session.mjs](../presage/session.mjs): fires live during
the section (terminal bell + banner — a placeholder for a real OS
notification/sound in the eventual Electron app), and alert count rolls into
the end-of-section summary as `drowsinessAlertCount`.

**Update (2026-09-12): `blinking.detected` didn't work, replaced with EAR.**
The original assumption — that `blinking.detected` stays `true` for a whole
closure — tested false: deliberately closing eyes for 3+ seconds during a
live session produced 0 drowsiness alerts. Root-caused by dumping the raw
signal (`DEBUG_BLINK`, since removed) — the flag doesn't behave as a
sustained "eyes closed" state reliably enough to build PERCLOS on.

Replaced with **Eye Aspect Ratio (EAR)** computed from `face.landmarks` (see
[presage/eye.mjs](../presage/eye.mjs)) — a standard technique using 6
eye-contour points per eye. This required assuming SmartSpectra's 478
landmarks follow MediaPipe FaceMesh's standard topology (undocumented by
Presage, but 478 = 468 base + 10 iris points is exactly MediaPipe's
convention). **Confirmed empirically** via
[presage/eye-openness-check.mjs](../presage/eye-openness-check.mjs)
(`npm run eye-check`): a live open/closed-eye test showed a clean, clear
separation — open-eye baseline ~0.25-0.42, closed/blink dips ~0.03-0.09.
`drowsiness.mjs` now takes a generic `eyesClosed` boolean (thresholded from
EAR at `EAR_CLOSED_THRESHOLD = 0.15`) instead of the SDK's blink flag
directly — it doesn't know or care where the signal comes from.

**Update (2026-09-12, same day): fixed EAR threshold broke on real usage —
two bugs found via live testing, both fixed.**

1. **Alert spam**: `drowsinessAlertCount: 495` in a 50-second real test — the
   `alerted` flag reset on any single momentary "eyes open" sample, so signal
   flicker near the threshold caused near-continuous re-firing. Fixed with a
   time-based cooldown (`alertCooldownSec`, default 20s) instead: a
   still-drowsy state now re-alerts periodically rather than spamming every
   tick. Verified: a synthetic 30s open/closed flicker test now produces 2
   alerts instead of hundreds; genuine microsleep detection unaffected.

2. **Fixed EAR threshold breaks under downward gaze**: the same real test
   showed `~60% closed over window` sustained for most of a session where
   the user only closed their eyes briefly. Root cause, confirmed by asking
   the user directly: they were looking down at their screen/keyboard most
   of the time (as any real study session would involve) — looking down
   narrows the visible eye geometrically even when genuinely open, so a
   **fixed** EAR cutoff (`0.15`) systematically misreads normal downward
   gaze as closed. This is a real constraint for the actual product, not a
   one-off test artifact — users will always be looking at their screen, not
   the camera.

   Fixed with `createAdaptiveEyeClosureDetector()` in
   [presage/eye.mjs](../presage/eye.mjs): tracks a rolling high-percentile
   ("resting open") EAR baseline per session instead of a fixed number, and
   flags closure as a large *relative* drop from that baseline. Self-
   calibrating — no separate setup step, works whatever the head/gaze angle
   settles into. Verified via a synthetic test simulating a low, stable
   "looking down" baseline (~0.12, below the old fixed threshold): 0 false
   positives while "looking down," 100% catch rate on a simulated genuine
   2s closure, 0 false positives after reopening at the same low baseline.

**Re-validated live (2026-09-12) after both fixes**: 1-minute real session,
looking at the screen normally and deliberately closing eyes a few times —
`drowsinessAlertCount: 3` (vs. 495 before the cooldown fix), with a genuine
sane closure duration reported (`microsleep, eyes closed 1.2s, 74% window`)
instead of the old `0.0s` artifact. No spam, no obvious false positives from
normal screen-gazing.

Still placeholder/unvalidated: `closedRatio` (0.5), `baselinePercentile`
(0.9), `alertCooldownSec` (20s), and the PERCLOS window/share thresholds are
reasonable-guess defaults, not tuned against a range of real users/lighting/
camera setups.

### Planned: mouth/head signals (paused mid-build, not wired in yet)

Requested addition: expand drowsiness detection beyond eye closure with two
more classic signals:
- **Yawning** — frequent, wide mouth openings.
- **Head/posture** — forward or lateral head nodding, and sustained
  tilt/head falling backward as a sign of losing postural control.

Draft, untested, NOT imported by session.mjs yet:
- [presage/mouth.mjs](../presage/mouth.mjs) — Mouth Aspect Ratio (MAR),
  same technique as eye.mjs's EAR. `createYawnMonitor()` counts sustained
  wide-mouth events and fires a "frequent-yawning" alert once the count
  within a trailing window (default 5 min) crosses a threshold — a single
  yawn is normal, *frequent* yawning is the signal.
- [presage/head-pose.mjs](../presage/head-pose.mjs) — NOT true 3D head pose
  (no solvePnP/camera intrinsics here), just 2D heuristics: `headRollDegrees()`
  (absolute lateral tilt angle, no baseline needed) and `noseDropRatio()`
  (a forward/backward-nod proxy, meant to be read as a *relative* drift from
  a rolling per-session baseline — like eye.mjs's adaptive approach, since a
  user's normal screen-reading posture already has some fixed pitch that
  isn't itself drowsiness). `createHeadPostureMonitor()` fires "head-tilt",
  "head-nod", or "head-tilt-back" on a sustained (not momentary) deviation.

**Same unconfirmed-topology caveat as eye.mjs**: the landmark indices used
(mouth corners/lips, eye-outer-corners, nose tip) assume MediaPipe FaceMesh
topology, same as EAR — but unlike EAR, these specific indices have **not**
been empirically validated yet (no live open-mouth/head-tilt test run).

Next steps when resumed:
1. Unit-test `mouth.mjs`/`head-pose.mjs` logic with synthetic data (started,
   interrupted before completion).
2. Build a live diagnostic (`face-signals-check.mjs`, same pattern as
   `eye-openness-check.mjs`) to empirically confirm MAR spikes on a real
   yawn and roll/noseDropRatio respond correctly to real head tilts/nods.
3. Wire into session.mjs's alert flow alongside the existing PERCLOS monitor.
4. Recalibrate thresholds (`marThreshold`, `rollDegreesThreshold`,
   `noseDropDeviationThreshold`, etc.) against real data, same as every
   other threshold in this project so far.

## Backend integration: wired and validated end-to-end (2026-09-12)

`presage/session.mjs` now POSTs its end-of-section summary to the real
backend instead of only printing it — see
[presage/backend-client.mjs](../presage/backend-client.mjs).

- Config via env vars (`STUDY_SESSION_ID`, `AUTH_TOKEN`, `BACKEND_URL`,
  defaulting to `http://127.0.0.1:8000`) — this script doesn't own session
  creation/auth, those come from whatever manages the real study session (a
  human via Swagger UI today; the Electron app eventually).
- If `STUDY_SESSION_ID`/`AUTH_TOKEN` aren't set, posting is skipped and the
  summary just stays local — fully backward compatible with plain
  standalone testing (verified).
- Backend side: `backend/models/study.py`'s new `WellbeingReading` table
  (additive only, doesn't touch `StudySession`'s existing columns — safe
  against the already-committed `study.db`), `POST/GET
  /sessions/{id}/wellbeing`, and `study_service.advance()` now adds
  `extra_break_minutes` on top of `break_seconds` when a round's stored
  report has `extend_break: true`, at the `feedback -> break` transition.

**Validated real end-to-end, camera included**: ran `session.mjs` against a
live camera and a real running backend instance — the computed summary
posted successfully and landed correctly against the right `round_number`
via `GET /sessions/{id}/wellbeing`. Separately (via pytest +
manually-driven live HTTP, see below) confirmed `advance()` actually
extends the break by the reported amount. Also caught and fixed a real bug
along the way: the `POST /wellbeing` endpoint was returning `{}` (returned
a raw SQLAlchemy object FastAPI couldn't serialize) instead of the saved
data — fixed with a `study.wellbeing_view()` helper, and the pytest
assertion was strengthened to check response body content, not just status
code, so this class of bug can't silently pass again.

Two new tests in `tests/test_backend.py`
(`test_wellbeing_extends_break`, `test_wellbeing_without_extend_flag_does_not_extend_break`)
pass, alongside all 12 pre-existing tests (one pre-existing, unrelated
failure: a `google-genai` library version drift issue in
`test_gemini_adapter_validation`, confirmed unrelated to this work).

## One command starts both the session and the camera (2026-09-12)

The Electron kiosk app (`frontend/`) doesn't have any study-session
UI/logic yet at all (no `/api/v1/sessions` calls anywhere in
`renderer.js`) — decided not to block on that being built first.

`session.mjs` now creates the backend study session itself
(`createStudySession()` in [backend-client.mjs](../presage/backend-client.mjs))
when `AUTH_TOKEN` + `DOCUMENT_ID` are set but `STUDY_SESSION_ID` isn't:

```bash
AUTH_TOKEN=<token> DOCUMENT_ID=<id> SECTION_MINUTES=25 npm run session
```

`study_seconds` is kept in sync with `SECTION_MINUTES` (so the backend's
timer and the capture's own duration actually match) and `break_seconds`
comes from a `BREAK_SECONDS` env var (default 300). Passing an existing
`STUDY_SESSION_ID` directly still works too (attaches to a session created
elsewhere, e.g. by hand via Swagger UI) — fully backward compatible.

**Validated live**: ran with only `AUTH_TOKEN`/`DOCUMENT_ID` set (no
pre-existing session) — correctly created a new session, ran the camera,
and posted the summary, all confirmed via `GET /sessions/{id}` and
`GET /sessions/{id}/wellbeing`.

This isn't wasted work ahead of the Electron UI — once that exists, it can
just launch this same script (or call the same `createStudySession`/
`postWellbeing` logic) instead of a human running it by hand.

## Open questions / TODO

- [ ] **Add mouth/head signals to drowsiness detection** (not started/paused
      mid-build — see below).
- [ ] Wire this into the actual Electron app once its study-session UI
      exists — launch `session.mjs` (or equivalent) automatically instead of
      requiring `AUTH_TOKEN`/`DOCUMENT_ID` to be set by hand.
- [ ] Validate drowsiness detection against a real closed-eyes test (see above).
- [ ] Tune drowsiness thresholds (currently placeholder defaults, same
      caveat as the stress thresholds) once validated.
- [ ] Report format handed to the LLM factory for the end-of-session summary.
- [ ] Run `presage/capture.mjs` interactively (real Ctrl+C, not a background
      kill) to confirm clean shutdown — a `kInvalidState` error appeared once
      during an automated background-kill test ~6s in; likely a test artifact
      (killed mid-settling, before a face was ever detected) but unconfirmed
      under normal interactive use.
</content>
