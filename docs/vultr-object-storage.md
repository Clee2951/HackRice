# Vultr Object Storage for uploaded documents

Merged from the teammate repo (`gmothebmo/HackRice`), which had this as a
pair of Next.js route handlers (`app/api/upload-url`, `app/api/download`)
plus `lib/vultr.ts`, and separately as `backend-GI/services/storage.py`.
It now lives in one place: `backend/services/storage.py`.

## What changed in the merge, and why

**Credentials moved out of the frontend.** The original approach had the
browser ask a Next.js route for a presigned PUT URL and then upload
straight to Vultr. That works, but it means the bucket keys live in the
Next.js app's environment, and it gives uploads a second path that skips
FastAPI. Uploads already have to reach FastAPI regardless — that's where
Gemini extracts the learning objectives that the whole study loop is
built on — so the browser now sends the file once, to
`POST /api/v1/documents`, and the backend is the only thing holding keys.

Downloads are proxied, not redirected. `GET /api/v1/documents/{id}/file`
reads the object and returns the bytes, so the reader's request stays
same-origin against FastAPI and carries its `Authorization` header
normally. A 307 to a presigned URL looks tidier but breaks in the
browser: the header is stripped on a cross-origin redirect, and the
request then fails CORS unless the bucket is explicitly configured for
the app's origin — a sharp edge that only appears once object storage is
switched on. `GET /api/v1/documents/{id}/file-url` still hands out a
one-hour presigned link for non-browser consumers (a native PDF viewer,
say); it 409s for a document that lives in the database instead.

**Configuration became optional.** The teammate version raised at module
import if any env var was missing, which took down the whole API — and
the test suite — for anyone without a Vultr account. Now
`storage.configured()` reports whether all four settings are present, and
`document_service.create_document()` falls back to storing the bytes in
the `documents.original` column when they aren't. Local SQLite
development needs no Vultr setup at all.

**Uploads take bytes, not a temp file path.** The old upload endpoint
wrote the request body to a `NamedTemporaryFile` purely to hand a path to
`boto3.upload_file()`. The body is already in memory and capped at
`MAX_UPLOAD_BYTES`, so that was a detour that also leaked a file on disk
if the process died mid-request.

## Storage layout

```
users/{uid}/{document_id}/{filename}
```

The teammate version keyed on `users/{user_id}/{filename}`, which meant
uploading two files with the same name silently overwrote the first.
Adding `document_id` (already unique per user) fixes that. Filenames are
sanitized to `[A-Za-z0-9._-]` and truncated to 120 characters.

## Setup

1. Vultr dashboard → **Products → Object Storage → Add Object Storage**.
2. On the subscription's **S3 Credentials** section, copy the hostname,
   access key, and secret key.
3. On the **Buckets** tab, create a bucket. Note that a bucket name with
   spaces in it will not work as an S3 bucket name — use something like
   `hackrice-documents`.
4. Fill these into `backend/.env` (gitignored — never `.env.example`):

```
VULTR_STORAGE_ENDPOINT=https://atl2.vultrobjects.com
VULTR_ACCESS_KEY=...
VULTR_SECRET_KEY=...
VULTR_STORAGE_BUCKET=hackrice-documents
```

5. Restart the backend. New uploads go to the bucket; documents uploaded
   before the switch keep working from their DB blob, since the `/file`
   endpoint checks `storage_key` first and falls back.

## Schema note

`documents` gained a nullable `storage_key` column, and `original` became
nullable — exactly one of the two is set per row. If you have an existing
`study.db` from before this change, delete it and let
`Base.metadata.create_all()` recreate the schema on next startup;
`create_all` adds new tables but not new columns to existing ones.
