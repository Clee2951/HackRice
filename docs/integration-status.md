# Integration status

What got connected, what didn't, and what's waiting on the teammate's
next branch. Written at the point the five components were first wired
into one working app.

## What runs

`backend/` is the backend. `frontend/casino_theme/` is the UI.
`frontend/` is the Electron shell around it. `presage/` is the camera
capture, started and stopped by the shell. All four are connected:

- The UI authenticates against `/api/v1/auth/*` and holds a real JWT.
- Uploads go to `POST /api/v1/documents`, which runs Gemini objective
  extraction and stores the original in Vultr Object Storage (or the DB,
  if object storage isn't configured).
- The study room renders the backend's own session state machine rather
  than a local timer.
- Recall, the assessment, the lesson, and the tutor all go through the
  backend.
- Presage posts per-round wellbeing, which extends the following break.

## Merged from the teammate repo (`gmothebmo/HackRice`)

That repo is a zip-snapshot of an older `main` plus additions, so most of
its "differences" are just this repo having moved on since. The genuinely
new work was the Vultr Object Storage layer:

| Their file | Where it landed |
|---|---|
| `casino_theme/lib/vultr.ts` | `backend/services/storage.py` |
| `casino_theme/app/api/upload-url/route.ts` | folded into `POST /api/v1/documents` |
| `casino_theme/app/api/download/route.ts` | `GET /api/v1/documents/{id}/file-url` |
| `backend-GI/services/storage.py` | `backend/services/storage.py` |

See [vultr-object-storage.md](vultr-object-storage.md) for what changed in
the merge and why (credentials moved server-side, configuration became
optional, uploads take bytes instead of a temp file path).

### ⚠️ Rotate those keys

Their `frontend/.env.example` contains a **real** Vultr access key and
secret key, not placeholders, and that repo is public. Those credentials
should be rotated in the Vultr dashboard. Nothing in this repo uses them —
`backend/.env.example` ships blanks and `backend/.env` is gitignored.

## `backend-GI/` — not wired in

A second, parallel copy of the backend from the teammate. It is **not**
mounted by `backend/main.py` and cannot run as-is: every module imports
from `backend.*` (e.g. `from backend.api import deps`), so it resolves
against the real backend's package, not its own. It also assumes a
different `User` model than the one the team agreed on — `current_user.id`
where the schema has `uid`, plus a `backboard_assistant_id` column that
does not exist.

It is kept rather than deleted because it holds work that hasn't been
merged yet:

- **`ai/backboard_client.py`** — a Backboard SDK client (per-user
  assistants, document upload, related-topic queries). An alternative to
  the Gemini path in `backend/ai/gemini_client.py`, not a complement: the
  two answer the same questions. Picking one is a team decision, not a
  mechanical merge. Note it raises at import if `BACKBOARD_API_KEY` is
  missing, which would take the whole API down — the same problem the
  object-storage module had, fixed the same way if it's adopted.
- **`api/v1/endpoints/tasks.py` + `models/task.py`** — a small to-do
  list (`id`, `title`, `completed`). Genuinely a new feature rather than a
  duplicate. It needs two things before it can be mounted: the endpoints
  have no `get_current_user` dependency, so right now any caller can read
  and delete anyone's tasks; and `Task` has no owner column, so there is
  nothing to scope them by. Both are small fixes.
- **`api/v1/endpoints/upload.py`** — superseded. It uploaded to Vultr
  *and* Backboard from a temp file; the Vultr half is merged, the
  Backboard half depends on the decision above.

## When the next branch lands

Expect it to be another snapshot rather than a mergeable history. The
approach that worked this time:

1. Clone it somewhere separate and `diff -rq` against this repo, ignoring
   `.git`, `node_modules`, `__pycache__` and lockfiles.
2. Most differences will be this repo being ahead — check `git log` for
   the file before assuming a difference is new work.
3. Pull the genuinely new files in one at a time, and re-home anything
   that holds credentials or fails at import.
4. Run `pytest tests/ -q` and `npx next build` after each piece.

## Known gaps

- **The tutor chat and recall need a Gemini key.** Everything else — auth,
  uploads of already-analyzed documents, the session loop, the timers —
  works without one.
- **Presage capture is untested end to end here.** It needs a SmartSpectra
  key and a physical camera. The process lifecycle (spawn, stdout
  relay, SIGTERM-on-stop) is wired and the backend side is covered by
  `test_frontend_round_trip`, but the camera half has only been exercised
  standalone via `presage/`'s own npm scripts.
- **No migrations.** `Base.metadata.create_all()` creates missing tables
  but never alters existing ones, so a schema change means deleting the
  local `study.db`. Fine at hackathon scale; a real deployment wants
  Alembic.
