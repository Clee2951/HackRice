# Build and understand your Study Loop backend

This is an implemented extension of juchengshen/hackrice15-starter-code. Start here rather than the original backend README. The frontend remains the starter task-manager page; this package builds the backend only. Use `/docs` to exercise it while your teammate builds the interface.

## 1. What you are building

Your Python server does five jobs:

1. Authenticate the student.
2. Store uploaded source material and extract a stable set of learning objectives.
3. Send source material and questions to Gemini.
4. Compare a recall answer against the selected objectives, then generate a targeted lesson.
5. Save progress and session state so the student can return later.

The browser displays the material, handles fullscreen, and draws the timer. Your backend owns the phase and timing data. This is voluntary focus mode, not enforced device lockdown.

For the first version, support text-based PDFs and UTF-8 `.txt`/`.md` files. Export slides to a text-based PDF. Audio/video lectures need a transcript first. This implementation does not perform OCR or understand images or diagrams. Inspect extracted text before trusting mathematical material.

## 2. Open the project and install Python packages

Use Python 3.12 if possible; the implementation was tested on Python 3.12. Open the extracted `hackrice-study-backend` folder in VS Code. The terminal must be in the directory containing `backend`, `frontend`, and this guide.

Windows PowerShell:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt
```

macOS/Linux:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-dev.txt
```

You do not need to activate the environment when using its Python executable explicitly. In VS Code, select that environment through **Python: Select Interpreter**. `requirements-dev.txt` includes the runtime dependencies plus testing tools. `requirements.txt` alone is enough to run the server.

If merging into your team's existing clone, make a branch first and review the changed files against `CHANGES.md`. Do not overwrite a teammate's changes blindly. The downloaded package has no Git history; your existing team repository does.

## 3. Configure secrets

Copy `backend/.env.example` to `backend/.env` in VS Code, or use:

Windows:

```powershell
Copy-Item backend/.env.example backend/.env
.\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_hex(32))"
```

macOS/Linux:

```bash
cp backend/.env.example backend/.env
.venv/bin/python -c "import secrets; print(secrets.token_hex(32))"
```

Paste the generated string as `SECRET_KEY`. Create an API key in Google AI Studio and select a text-generation model that is available to that key and supports structured output. Set its exact model ID as `GEMINI_MODEL`:

```dotenv
SECRET_KEY=your-generated-random-string
GOOGLE_API_KEY=your-real-google-api-key
GEMINI_MODEL=your-available-model-id
```

The placeholder values above are instructions, not working credentials. Never put these keys into frontend JavaScript or commit `.env`. The project ignores `.env` and database files. Without a Google key/model, health/authentication work; AI routes return a clear 503 error.

`core/config.py` loads `.env` using the file's absolute location, fixing the original starter's working-directory mismatch. The default SQLite file is `study.db` in the project root, separate from the starter's `hackrice.db`. The new password hashing uses Argon2; old bcrypt accounts are not migrated.

## 4. Run and inspect the backend

Windows:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload
```

macOS/Linux:

```bash
.venv/bin/python -m uvicorn backend.main:app --reload
```

Open:

- http://127.0.0.1:8000/api/health — should return `{"status":"ok"}`.
- http://127.0.0.1:8000/docs — interactive API documentation and request tester.

`backend.main:app` means “import `backend/main.py` and run the variable named `app`.” `--reload` restarts the server when you edit Python. Keep this terminal running. The `/` page is still the old task UI and is not the study app.

## 5. Test the entire app from /docs

### A. Create an account

Expand `POST /api/v1/auth/signup`, click **Try it out**, enter:

```json
{"email":"connor@example.com","password":"a-long-demo-password"}
```

Click **Execute**. The response should contain your user ID and email, with no password hash. Signup uses the starter's HTTP 200 response.

Click **Authorize** near the top of `/docs`. Put your email in `username` and your password in `password`; leave client ID/secret blank. FastAPI obtains a login token and sends it on later calls. If testing login manually, `/auth/login/access-token` expects form fields, not JSON. The token expires after eight hours by default; log in again after expiry.

### B. Upload a small document

Use `POST /api/v1/documents` and upload `examples/ohms-law.txt`. A successful response is HTTP 201 with a document ID and objectives such as `c1`, `c2`.

The upload does all processing before responding: byte validation, text extraction, objective generation, then a database commit. It may take time. If the AI fails, no incomplete document is saved; retry the upload. Uploads are not deduplicated, so retrying a successful upload creates another document.

Call `GET /api/v1/documents` to check the list. Call `GET /api/v1/documents/{document_id}/content` to inspect extracted text. Call `GET /api/v1/documents/{document_id}` to inspect objectives and initially empty progress.

Limits: 10 MB, 50 PDF pages, and 60,000 extracted characters. Split long material into sections. PDFs with nearly empty text pages are rejected; this can include intentionally blank or title-only pages, which you may remove before upload.

### C. Start a session

Use `POST /api/v1/sessions`:

```json
{
  "document_id": 1,
  "objective_ids": ["c1"],
  "study_seconds": 15,
  "break_seconds": 5
}
```

Replace IDs with actual returned values. Pick 1–5 objectives. Omit `objective_ids` to use the first five. Normal settings are 1500 study seconds and 300 break seconds; shorter values support a demo.

Save the returned session ID. `deadline` is a Unix timestamp in seconds; `server_time` helps compensate for browser clock differences.

### D. Ask a study question

During the active study timer, call `POST /api/v1/sessions/{session_id}/chat`:

```json
{"message":"Explain resistance with an example from my notes."}
```

This returns an answer and source pages. Because a 15-second timer may finish before an AI request completes, use a longer session to test chat. A reply that finishes after study time expires is rejected with 409; the student should enter recall.

### E. Enter recall

After the timer expires, call `POST /api/v1/sessions/{session_id}/advance`. The phase becomes `recall`. Advancing before the deadline returns 409.

There is no background timer worker: the frontend calls `advance` at zero or after reopening an expired session. The backend checks the deadline before allowing the transition.

The frontend must now hide the original document, lesson, objectives' answer points, and prior chat. Disable tutoring. Chat endpoints also enforce the recall restriction. Source endpoints remain accessible to the document owner: this is a study aid, not secure exam software.

### F. Submit recall

Generate a UUID locally (`python -c "import uuid; print(uuid.uuid4())"`) or in browser JavaScript (`crypto.randomUUID()`). Use `POST /api/v1/sessions/{session_id}/recall`:

```json
{
  "submission_id": "c15cb47b-a7b3-4764-9d78-0711bcd0fb1d",
  "text": "Voltage equals current times resistance. I think doubling resistance doubles current at fixed voltage."
}
```

Use a new UUID for each new answer. Reuse the same UUID and text when retrying a failed network request. An already saved submission returns the saved result without another assessment or progress increment. Reusing an ID with different text returns 409.

The response has `assessment` and `lesson`. Each assessment item has a concept ID, status, quoted evidence, missing points, misconceptions, and a follow-up question. The lesson contains Markdown, check questions, and source pages.

Statuses: `correct`, `partial`, `incorrect`, `not_demonstrated`. Missing mention is not proof of a misconception. `not_demonstrated` preserves the previous demonstrated status separately. These are model judgments for study support, not validated measures of mastery.

If either assessment or lesson generation fails, the session stays in recall and progress stays unchanged. Keep the answer in the frontend so the student can retry. An empty/whitespace-only answer returns 422; a student can explicitly say “I don't remember.”

### G. Take a break, then review

After successful recall, the phase is `feedback`:

1. Display assessment feedback.
2. Call `advance` to start the break.
3. Wait for the break deadline, then call `advance` again.
4. The phase becomes `review`, the round increments, and the personalized lesson replaces the document.
5. At the end of the review timer, call `advance` for another recall.
6. Submit a new answer with a new submission ID.

The first MVP repeats the selected objectives. Start a new session to select another group of objectives. It does not automatically schedule spaced repetition or choose all future topics.

### H. Pause, resume, and return later

Call `/pause` to save remaining time, then exit fullscreen in the browser. Call `/resume` after a user gesture re-enters fullscreen. Pause/resume also works for untimed recall/feedback phases.

`GET /sessions?document_id=1` lists recent sessions for that document. Reopen an unfinished session with `GET /sessions/{id}`; do not call `POST /sessions` if you want the same session back. `GET /documents/{id}` restores concept progress. `/attempts` restores assessment history, and `GET /sessions/{id}/chat` restores recent chat.

A running timer keeps counting while the browser is closed unless a pause request reached the server. Browser-unload events are unreliable; keep an explicit Pause button. Pause does not save unsubmitted recall text: save that draft locally, or add a draft endpoint later.

Call `/complete` to end the session permanently. Progress remains saved and can be used in a new session. Stop/restart the Python server to verify SQLite persistence.

## 6. Read the code in this order

| File | What to understand |
| --- | --- |
| `backend/main.py` | App creation, table creation, CORS, routes, static frontend mounting |
| `backend/api/v1/api.py` | Registers the auth, documents, and sessions route groups |
| `backend/api/v1/endpoints/documents.py` | Receives uploaded files and exposes saved content |
| `backend/services/document_service.py` | Extracts text and builds stable objectives |
| `backend/ai/gemini_client.py` | Makes an AI request and validates structured output |
| `backend/ai/prompts.py` | The four distinct AI instructions |
| `backend/api/v1/endpoints/sessions.py` | Receives start/chat/recall/timing requests |
| `backend/services/study_service.py` | Coordinates assessment, lessons, phase transitions, and progress |
| `backend/schemas/study.py` | Defines valid request data and AI response shapes |
| `backend/models/document.py` | Database representation of a document, objectives, and progress |
| `backend/models/study.py` | Database representation of sessions, attempts, and chat messages |
| `backend/api/deps.py` | Opens a database session and identifies the logged-in user |
| `backend/db/session.py` | Creates the database connection |
| `backend/core/config.py` | Loads keys, model ID, file limits, and database URL |
| `backend/core/security.py` | Password hashing and signed login tokens |
| `backend/api/v1/endpoints/auth.py` | Signup and login routes retained from the starter |
| `backend/crud/user.py` | User creation, lookup, and password checking |
| `tests/test_backend.py` | Exercises the entire API with a deterministic fake AI |

`models` describe persistent storage. `schemas` validate messages. `services` implement behavior. `api` receives requests and delegates. `ai` handles provider communication and instructions.

For hackathon simplicity, objectives/progress are JSON columns on the document rather than separate tables. Original file bytes are also stored in SQLite, so copying the database preserves uploaded documents. Large-scale file storage would move to object storage later. Study queries live in endpoints/services; separate document/study CRUD modules are deliberately omitted because they would mostly wrap one-line queries.

The original task files, `ai/base.py`, `ai/factory.py`, alternate AI clients, and generic `/llm` example remain as unregistered reference code. They are not used by the study API. Do not wire them back in by accident; alternate providers would require their dependencies and settings. `__init__.py` makes a folder importable as a Python package and may export symbols.

## 7. Trace one recall request

The browser sends JSON to `POST /sessions/7/recall`. FastAPI validates it against `RecallInput`. `get_current_user` checks the bearer token. `owned_session` and `owned_document` ensure the requested resources belong to that user. `assess_recall` checks the submission ID and phase, then loads the selected objectives.

The first `ai.structured(...)` call uses the ASSESS prompt and Assessment schema. Python verifies that all and only the selected concept IDs appear and that quoted evidence actually occurs in the student's answer. The second call uses the LESSON prompt and Lesson schema. Python verifies cited page numbers exist.

Only after both calls succeed does Python save the attempt, replace the document's progress JSON, save the lesson, and switch to feedback in one database transaction. Optimistic revision columns reject stale concurrent changes with 409. Reload and retry; if the attempt was already committed, its submission ID prevents duplication. This does not prevent duplicate provider costs from simultaneous requests before either has committed.

AI validation catches formatting and some evidence errors. It does not prove factual correctness. Prompts instruct the model to treat uploaded material as data, but prompt instructions alone are not an absolute defense against malicious content.

## 8. Connect the frontend

Use one fetch helper, keeping the token in memory for the simplest demo:

```javascript
const API = "/api/v1"; // same server; otherwise use http://127.0.0.1:8000/api/v1
let token = "";

async function request(path, { method = "GET", body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const form = body instanceof FormData || body instanceof URLSearchParams;
  if (body !== undefined && !form) headers["Content-Type"] = "application/json";
  const response = await fetch(API + path, {
    method,
    headers,
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data.detail ?? data));
  return data;
}

async function login(email, password) {
  const data = await request("/auth/login/access-token", {
    method: "POST",
    body: new URLSearchParams({ username: email, password }),
  });
  token = data.access_token;
}

async function upload(file) {
  const data = new FormData();
  data.append("file", file);
  return request("/documents", { method: "POST", body: data });
}
```

Do not manually set `Content-Type` for `FormData`; the browser adds the multipart boundary. For a PDF viewer, fetch `/documents/{id}/file` with the Authorization header, convert the response to a Blob, and display a Blob URL. A direct iframe URL will not automatically attach your bearer token.

Calculate display time from `deadline` and estimated server time, not by counting interval callbacks. Refetch state on browser focus. Disable duplicate action buttons while requests are pending. Persist a submission ID together with its recall draft until the server confirms success.

For study: display the selected objectives' source pages. For recall: remove source, saved chat, answer points, and lesson from the visible UI. For feedback: display assessment. For break: display the break timer. For review: display `session.lesson.markdown`. Sanitize model-generated Markdown/HTML or render as plain text; never insert raw output with `innerHTML`.

If the frontend runs on another port, put its exact origin in `CORS_ORIGINS` as a JSON list in `.env` and restart the backend. If it is served from the existing `frontend/` directory, relative `/api/v1` requests work without separate hosting.

## 9. Test and debug

Windows:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

macOS/Linux:

```bash
.venv/bin/python -m pytest -q
```

Tests override the AI dependency and use an isolated in-memory database. No real credentials or paid requests are required. They test application behavior, not the intelligence or accuracy of Gemini. See `VALIDATION.md` for the actual verification performed.

| Symptom | What to check |
| --- | --- |
| Settings error about SECRET_KEY | Create `backend/.env`; supply a random string of at least 32 characters |
| Module not found | Use the environment's Python; run from the project root |
| 401 | Log in again and ensure the bearer header is present |
| 404 for another user's document | Expected ownership protection |
| 409 | Check phase, paused state, timer, or a concurrent change; reload session |
| 413 | Reduce file bytes/pages/text length |
| 415 | Export to PDF or UTF-8 text |
| 422 | Inspect request fields or source extraction; see error detail |
| 502 | AI/provider failure or invalid AI output; preserve input and retry |
| 503 | Missing Google key or model ID |
| Browser CORS error | Frontend origin must exactly match configured origin |
| Old task page appears | Expected until frontend is replaced; use `/docs` for backend testing |

Try live answers that are fully correct, partly correct, explicitly wrong, and “I don't remember.” Inspect the actual source, rubric, evidence, and lesson. Do not assess output quality only from the fake AI test suite.

## 10. Handoff and next work

You own Python services, prompts, schemas, persistence, and API behavior. Your teammate owns document rendering, fullscreen events, timer display, recall form, chat panel, and rendering phase-specific screens. Agree on endpoint field names before building both sides independently.

Before a public deployment, add per-user quotas/rate limits, stronger upload handling, database migrations, backups, HTTPS, and a deployment-specific configuration. This first version performs bounded document processing synchronously and stores files in SQLite. It has no background job queue, streaming AI, transcription, OCR, document deletion, or automated spaced-repetition scheduler. Do not run multiple workers against a shared SQLite deployment without planning for its concurrency limits. No service has been deployed by this guide.

The most useful next improvement is a better assessment rubric on your actual course material. Add larger infrastructure only when your working demo needs it.

Official references:

- https://ai.google.dev/gemini-api/docs/libraries
- https://ai.google.dev/gemini-api/docs/generate-content/structured-output
- https://fastapi.tiangolo.com/tutorial/request-files/
- https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API
