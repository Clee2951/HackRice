# Study Loop

A lockdown study app. You upload a document, an AI reads it and pulls out
what you're supposed to learn, then it runs you through pomodoro rounds of
**study → recall → feedback → break**, with a tutor on the side and a
camera watching for stress that quietly makes your breaks longer when you
need them.

Themed as a blackjack table, because the house always wins and so should
your retention.

---

## How the pieces fit together

```
   Electron kiosk  (frontend/)
   ├─ loads ─────────────►  Next.js UI  (frontend/casino_theme/)
   │                            │
   │                            │  bearer token, cross-origin fetch
   │                            ▼
   │                        FastAPI  (backend/)  ──► Gemini
   │                            │    │
   │                            │    └──────────────► Vultr Object Storage
   │                            │                     (uploaded originals)
   │                            ▼
   │                        Vultr MySQL  (or local SQLite)
   │                            ▲
   └─ spawns ──► presage/session.mjs ──┘
                 (SmartSpectra camera capture, posts wellbeing)
```

Five components, and what each one actually owns:

| Component | Owns |
|---|---|
| `frontend/` | The Electron kiosk shell: fullscreen lockdown, exit button + PIN, emergency escape hatch, native file picker, Presage process lifecycle |
| `frontend/casino_theme/` | The whole UI: login, the blackjack table of documents, the study room, recall, feedback, tutor chat |
| `backend/` | The API and all the teaching logic: objective extraction, the session state machine, recall assessment, the tutor, break extension |
| `presage/` | Camera capture and the stress/drowsiness heuristics; posts a summary per round |
| `backend-GI/` | **Not wired in.** A teammate's parallel backend — see [docs/integration-status.md](docs/integration-status.md) |

The important design line: **the backend owns the study loop.** The UI
doesn't run its own timer or decide when a round ends — it reads the phase
and deadline from the server and renders them. That's what lets the
Electron app, a browser tab, and the camera process all agree about what
round it is.

## The loop

`backend/services/study_service.py` is the state machine:

```
study ──timer──► recall ──submit──► feedback ──► break ──timer──► review ──► recall ─┐
  ▲                                                                                  │
  └──────────────────────────────────── round + 1 ◄──────────────────────────────────┘
```

- **study** / **review** — timed reading. The tutor chat is live. The
  camera is capturing.
- **recall** — untimed, and **the document is hidden**. You write down
  what you remember. The tutor is refused here, by the backend as well as
  the UI: being able to look things up is the one thing active recall
  exists to prevent.
- **feedback** — the model compares what you demonstrated against the
  document's expected points, per objective, and writes a short lesson
  from the gap. Mastery is recorded on the document, so the next session
  pre-selects whatever you're weakest on.
- **break** — longer than configured if the last round's wellbeing report
  flagged sustained stress or drowsiness.

## Running it

You need three things running. From the repo root:

### 1. Backend

```bash
python3 -m venv .venv-local
.venv-local/bin/pip install -r backend/requirements.txt
cp backend/.env.example backend/.env      # then fill it in
.venv-local/bin/python -m uvicorn backend.main:app --reload
```

`backend/.env` needs at minimum:

```
SECRET_KEY=<python3 -c "import secrets; print(secrets.token_hex(32))">
GOOGLE_API_KEY=<from Google AI Studio>
GEMINI_MODEL=<a text model your key can use>
```

Without `GOOGLE_API_KEY`/`GEMINI_MODEL`, everything boots and auth works,
but uploads return a clear 503 — there's no objective extraction without a
model. `DATABASE_URL` defaults to a local SQLite file; point it at Vultr
MySQL with [docs/vultr-mysql-setup.md](docs/vultr-mysql-setup.md).
Object storage is optional too — [docs/vultr-object-storage.md](docs/vultr-object-storage.md).

### 2. UI

```bash
cd frontend/casino_theme
npm install
cp .env.example .env.local     # only if the backend isn't on 127.0.0.1:8000
npm run dev
```

At this point <http://localhost:3000> is a fully working app in a plain
browser — sign up, upload, study. The camera and the lockdown are the only
things that need Electron.

`npm run dev` keeps hot reload. `npm run build` writes the static export to
`out/`, which is what the Electron app serves.

### 3. Electron kiosk

```bash
cd frontend
npm install
cp .env.example .env
npm run build:ui   # export the UI the shell serves (once, or after UI changes)
npm start          # kiosk/lockdown mode
npm run dev        # ordinary window, for iterating
```

To iterate on the UI with hot reload instead of rebuilding the export each
time, run `next dev` and set `NEXT_APP_URL=http://localhost:3000` — the
shell will point at it rather than serving `out/`.

### 4. Camera capture (optional)

```bash
cd presage && npm install
echo "SMARTSPECTRA_API_KEY=<your key>" >> ../.env
```

The kiosk starts and stops this itself, per round. Nothing to run by hand.

> **Escape hatch:** `Cmd/Ctrl+Alt+Shift+X` quits the kiosk immediately,
> bypassing the PIN, independent of whether the UI loaded. Read the
> safety note in [frontend/README.md](frontend/README.md) before changing
> anything about lockdown behaviour — an earlier version hard-locked a
> real person out of their machine twice.

## Shipping it as a Windows installer

The app is self-contained: the Electron shell serves the exported UI
itself, so an installed copy needs no `next dev`. It still needs a backend
to talk to — deploy `backend/` somewhere reachable (a Vultr instance is
the obvious home, since the database and object storage already live
there) and point the installer at it.

### Build it in CI (no Windows machine needed)

`.github/workflows/build-desktop.yml` builds on a `windows-latest` runner
and uploads `StudyLoop-Setup-<version>.exe` as an artifact. It runs on any
push touching `frontend/` or `presage/`, or on demand:

> Actions → **Build Windows installer** → **Run workflow**, optionally
> setting the backend URL the installer defaults to.

Set a repo variable `BACKEND_URL` (Settings → Secrets and variables →
Actions → Variables) to your deployed API and every build picks it up.

It's built natively on Windows rather than cross-compiled: NSIS
cross-builds need Wine, and the SmartSpectra native runtime has to be the
Windows closure — a host-platform macro would silently ship the wrong one.

### Or build locally

```bash
cd frontend && npm run build:win     # needs to run on Windows
```

### Where the installed app reads its settings

Two things are per-machine rather than baked into the installer, both in
`%APPDATA%/Study Loop/config.json`:

```json
{
  "backendUrl": "https://your-vultr-host",
  "smartspectraApiKey": "..."
}
```

`backendUrl` overrides the build-time default, so one installer can be
repointed without rebuilding. `smartspectraApiKey` is deliberately *not*
baked in — shipping one key inside an installer hands the same secret to
everyone who installs it, which the SDK's own docs warn against. Without
it the app works normally and the wellbeing panel reports the camera as
unavailable.

## Tests

```bash
.venv-local/bin/python -m pytest tests/ -q
```

`test_frontend_round_trip` walks the exact call sequence the UI makes, in
order, against a stubbed model — including the wellbeing report extending
the following break and round 2 opening as `review`. It's the fastest way
to find out whether a backend change broke the frontend.

```bash
cd frontend/casino_theme && npx next build && npx eslint .
```

## Honest limitations

Worth stating plainly, including in any demo:

- **The lockdown is a deterrent, not a real lockdown.** No ordinary
  Electron app can block Cmd+Tab or Mission Control — that's deliberate OS
  security design. What it does: fullscreen kiosk, hidden Windows taskbar,
  no app menu, blocked window close. Leaving is inconvenient, not
  impossible.
- **The stress detection is a heuristic**, over facial-expression
  confidences and eye-openness ratios from the SmartSpectra SDK. It is not
  a clinical measurement. See [docs/presage-notes.md](docs/presage-notes.md)
  and [docs/stress-formula.md](docs/stress-formula.md) for exactly what
  the numbers mean.
- **The AI grades your recall.** It's grounded in your document and every
  citation is validated against real page numbers, but it is still a
  language model's judgement of a free-text answer.
