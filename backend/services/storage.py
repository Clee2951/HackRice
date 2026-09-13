"""Vultr Object Storage (S3-compatible) for uploaded document originals.

Merged from the object-storage work in the teammate repo
(gmothebmo/HackRice: `backend-GI/services/storage.py` plus the
`casino_theme/app/api/upload-url` + `lib/vultr.ts` presigned-URL routes).
Two things changed in the merge, both deliberate:

1. **Credentials stay server-side.** The teammate version generated
   presigned PUT URLs from a Next.js route handler, which meant the
   bucket keys lived in the frontend app's environment. Uploads already
   have to reach FastAPI anyway (that's where Gemini extracts the
   learning objectives), so there's no reason for a second credentialed
   path -- the browser never talks to Vultr directly for writes now, and
   only this module ever holds the keys.

2. **Nothing fails at import time.** The teammate version raised
   ValueError at module import if any of the four env vars was missing,
   which takes down the entire API for anyone who hasn't configured
   object storage -- including the test suite. Configuration is optional
   here: `configured()` reports whether it's usable, and
   `document_service` falls back to storing bytes in the DB when it
   isn't. Solo dev on SQLite needs no Vultr account.

Keys are laid out as `users/{uid}/{document_id}/{filename}`, keeping the
teammate's per-user prefix but adding document_id so re-uploading a file
with the same name can't clobber an earlier document.
"""

import logging
import re
from functools import lru_cache

from fastapi import HTTPException

from backend.core.config import settings

logger = logging.getLogger(__name__)

# Everything outside this set is replaced in object keys. S3 tolerates most
# characters, but a key is echoed back in presigned URLs and Content-
# Disposition headers, so keeping it boring avoids a class of quoting bugs.
UNSAFE_KEY_CHARS = re.compile(r"[^A-Za-z0-9._-]+")


def configured() -> bool:
    """True when all four Vultr settings are present.

    Callers use this to decide between object storage and the DB-blob
    fallback, so it must never raise -- an unconfigured deployment is a
    supported mode, not an error.
    """
    return all([
        settings.VULTR_STORAGE_ENDPOINT,
        settings.VULTR_ACCESS_KEY,
        settings.VULTR_SECRET_KEY,
        settings.VULTR_STORAGE_BUCKET,
    ])


@lru_cache
def _client():
    # Imported lazily so boto3 is only needed by deployments that actually
    # use object storage, and so a missing/broken botocore can't stop the
    # API from booting.
    import boto3

    return boto3.client(
        "s3",
        endpoint_url=settings.VULTR_STORAGE_ENDPOINT,
        aws_access_key_id=settings.VULTR_ACCESS_KEY,
        aws_secret_access_key=settings.VULTR_SECRET_KEY,
        region_name=settings.VULTR_STORAGE_REGION or "us-east-1",
    )


def object_key(uid: int, document_id: int, filename: str) -> str:
    safe = UNSAFE_KEY_CHARS.sub("_", filename).strip("_") or "document"
    return f"users/{uid}/{document_id}/{safe[:120]}"


def put_bytes(uid: int, document_id: int, filename: str, data: bytes, content_type: str) -> str:
    """Store one document's bytes and return the key it was written under.

    Takes bytes rather than a path (the teammate version took a local file
    path and the upload endpoint wrote a NamedTemporaryFile just to feed
    it) -- the request body is already in memory, capped at
    MAX_UPLOAD_BYTES, so the temp file was a detour that also left a file
    on disk if the process died mid-upload.
    """
    key = object_key(uid, document_id, filename)
    try:
        _client().put_object(
            Bucket=settings.VULTR_STORAGE_BUCKET,
            Key=key,
            Body=data,
            ContentType=content_type,
        )
    except Exception as exc:
        # The bucket being unreachable shouldn't read as "your PDF is
        # broken" -- that's the message extract_pages() failures give.
        logger.warning("Vultr object storage write failed (%s): %s", type(exc).__name__, exc)
        raise HTTPException(502, "Could not store the uploaded file. Retry, or check the object storage settings")
    return key


def presigned_get(key: str, expires_in: int = 3600) -> str:
    """A temporary download URL for a stored object."""
    try:
        return _client().generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.VULTR_STORAGE_BUCKET, "Key": key},
            ExpiresIn=expires_in,
        )
    except Exception as exc:
        logger.warning("Vultr presign failed (%s): %s", type(exc).__name__, exc)
        raise HTTPException(502, "Could not produce a download link for this document")


def delete(key: str) -> None:
    """Best-effort cleanup. Never raises: used on the upload rollback path,
    where the caller is already handling a different, more important error
    and a leaked object is the lesser problem."""
    try:
        _client().delete_object(Bucket=settings.VULTR_STORAGE_BUCKET, Key=key)
    except Exception as exc:
        logger.warning("Vultr cleanup of %s failed (%s): %s", key, type(exc).__name__, exc)
