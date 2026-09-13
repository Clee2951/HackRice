# Backend schema: Vultr MySQL migration

Team-facing record of the schema change on `vultr_mysql_schema` (branched
from `main` at `3cb74bc`). For how to actually provision/connect to the
Vultr instance, see [`vultr-mysql-setup.md`](vultr-mysql-setup.md) instead
— this doc is about *what* the schema is and *why* it looks the way it
does, for whoever next touches `backend/models/` or `backend/services/`.

## The agreed schema

```
users (uid)
 └── documents (uid, document_id)
      └── document_objects (uid, document_id, object_id)
```

- `users`: `uid`, `username`, `email`, `password_hash`, `auth_token`,
  `created_at`.
- `documents`: composite PK `(uid, document_id)` — `document_id` is
  scoped **per user**, not globally unique (User 1's doc 1 and User 2's
  doc 1 are different rows).
- `document_objects`: composite PK `(uid, document_id, object_id)` —
  `object_title`, `content`, `expected_points`, `source_page` per row.

## Key decisions and why

**`document_objects` replaces the old `pages`/`objectives` JSON blobs
entirely**, not just alongside them. Previously `Document` stored the
whole file's raw per-page text in one `pages` JSON column and the AI's
extracted learning objectives in a separate `objectives` JSON column. Now
each AI-extracted objective is its own `document_objects` row, carrying
its own grounding text in `content` (just the text of the pages it cites,
not the whole document). This was a deliberate, larger-than-minimal
change — see the conversation that led here for the tradeoff discussion.

**`expected_points` isn't a new field** — it already existed as
`Objective.expected_points` in `backend/schemas/study.py` (the AI's
per-objective "expected answer points" for recall assessment). The
`document_objects` column just persists what the AI pipeline was already
producing, instead of leaving it inside a JSON blob.

**`source_page` is JSON (`list[int]`), not a plain `INT`**, despite the
singular column name in the originally-sketched DDL. An objective can
legitimately cite more than one source page (`Objective.source_pages` is
a list), and citation validation (`document_service.check_cited_pages`)
needs the full set to catch the AI hallucinating a page number. The
column *name* matches the agreed schema; the column *value* is a list.

**`document_id`/`object_id` are per-parent counters, not global
auto-increment.** Neither MySQL nor SQLite has "auto-increment scoped to
another column" built in.
- `document_id`: `document_service.next_document_id(db, uid)` computes
  `max(document_id) + 1` for that user, and `create_document()` retries
  once if a concurrent upload from the same account raced it onto the
  same id (rare, acceptable at hackathon scale — a real production
  version would want a proper per-user sequence table with row locking).
- `object_id`: assigned as a simple 1..N index when a document's
  objectives are created, all in one transaction at upload time. There's
  no "add another objective to an existing document" code path, so this
  never needs a max+1 lookup the way `document_id` does.

**The `"cN"` objective-id scheme is unchanged**, only where it's stored
changed. `progress` dict keys, `SessionCreate.objective_ids`,
`AssessmentItem.concept_id` all still use strings like `"c1"`, `"c2"` —
`document_service.object_view()` reconstructs `f"c{object_id}"` from the
DB row so nothing above the storage layer (API responses, the AI prompt
contract, existing frontend expectations) had to change.

**`users.auth_token` is stored but not authoritative.** It's set on
login (`auth.py`) for schema compliance and as a debugging aid ("what
token did this user last get"), but authentication stays stateless JWT
verification (`api/deps.py get_current_user` decodes and checks the
signature/expiry only). This column is never consulted to accept or
reject a request, so there's no server-side revocation list to keep in
sync, and a stale value here can't be replayed. If real token revocation
is wanted later, that's a bigger feature: check the incoming token
against this column in `get_current_user` and invalidate it on
logout/password-change.

**Kept `media_type`, `original`, `progress`, `revision` on `documents`**
even though they weren't in the original DDL sketch — they're load-bearing
for already-shipped features (re-downloading the original file, per-
objective mastery tracking across recall attempts, optimistic-locking
against concurrent edits) that would otherwise regress.

## MySQL compatibility fixes (found along the way)

Several pre-existing columns used bare `String` with no length
(`StudySession.phase`, `RecallAttempt.submission_id`/`.text`,
`ChatMessage.role`/`.content`). SQLite doesn't care, but MySQL rejects
this outright (`VARCHAR requires a length`) — the whole schema would have
failed to create on a real Vultr instance. Fixed: short enum-like strings
got explicit lengths (`String(20)`, `String(36)` for the UUID), long
free-text fields (recall answers, chat messages/answers) became `Text`
instead of guessing a VARCHAR cap. Verified by compiling every table's
DDL against SQLAlchemy's MySQL dialect directly
(`CreateTable(table).compile(dialect=mysql.dialect())`) — catches this
class of bug without needing a live server.

**A second, more serious bug only showed up against a real MySQL
server, not the dialect-compile check above**: every `deadline`,
`remaining_seconds`, and `created_at` column used SQLAlchemy's generic
`Float`, which compiles to MySQL's 32-bit single-precision `FLOAT`
(~7 significant digits). A Unix timestamp needs ~10-11 digits, so MySQL
was silently rounding every stored timestamp to the nearest ~100-500
seconds. Concretely: create a study session with `study_seconds=600`,
and the stored `deadline` could already read as several hundred seconds
in the *past* by the time it was read back — a timer that's supposed to
be a study/break/review length ends up wrong by an amount roughly the
size of the timestamp's own rounding error, not a fixed offset. SQLite
(what the test suite uses) stores Python floats at full 64-bit precision,
so this was invisible in every automated test and only surfaced during a
live end-to-end run against the real database. Fixed by switching every
timestamp/deadline column to SQLAlchemy's `Double` type (portable across
dialects: `DOUBLE` on MySQL, still a plain float on SQLite). The four
0-100-range `WellbeingReading` metrics (`avg_stress` etc.) stayed
`Float` — `float32`'s ~7 digits of precision is plenty for a value in
that range, only large-magnitude values like timestamps are affected.
**Lesson for next time**: a DDL-compile check catches syntax/type
mismatches, not precision/rounding behavior — that class of bug needs an
actual round-trip through the real database engine to catch.

## API-visible changes

- `GET /documents/{id}/content`: `{"pages": [...]}` → `{"objects": [...]}`
  (each with `title`/`content`/`expected_points`/`source_pages`). Nothing
  in `casino_theme/` calls this endpoint yet, so no frontend fallout
  today — flag it to whoever builds the document-reading UI.
- Signup (`POST /auth/signup`) now requires a `username` field alongside
  `email`/`password`.
- Everything else (session flow, recall, chat, wellbeing reporting) is
  API-compatible — same request/response shapes, just backed by the new
  tables underneath.

## Files touched

`backend/models/user.py`, `backend/models/document.py` (new
`DocumentObject`), `backend/models/study.py`, `backend/schemas/user.py`,
`backend/crud/user.py`, `backend/services/document_service.py`,
`backend/services/study_service.py`, `backend/api/v1/endpoints/auth.py`,
`backend/api/v1/endpoints/documents.py`,
`backend/api/v1/endpoints/sessions.py`, `backend/db/session.py`
(`pool_pre_ping` for non-SQLite engines), `backend/main.py`,
`backend/requirements.txt` (added `PyMySQL`), `backend/.env.example`,
`tests/test_backend.py`.
