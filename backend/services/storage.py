import boto3
from botocore.exceptions import ClientError
from botocore.config import Config
from fastapi import HTTPException
from backend.core.config import settings

# Ported from backend-GI/services/storage.py (teammate's original), adapted
# to this backend's settings pattern and made lazy: the original raised at
# IMPORT TIME if Vultr env vars were missing, which would have crashed the
# whole app on startup for anyone (or any test run) without Object Storage
# configured. Here, nothing errors until the upload feature is actually used.

_client = None


def _configured():
    return all([settings.VULTR_ACCESS_KEY, settings.VULTR_SECRET_KEY,
                settings.VULTR_STORAGE_ENDPOINT, settings.VULTR_STORAGE_BUCKET])


def _s3_client():
    global _client
    if not _configured():
        raise HTTPException(503, "File storage is not configured on this server")
    if _client is None:
        _client = boto3.client(
            "s3",
            endpoint_url=settings.VULTR_STORAGE_ENDPOINT,
            aws_access_key_id=settings.VULTR_ACCESS_KEY,
            aws_secret_access_key=settings.VULTR_SECRET_KEY,
            # Vultr's S3-compatible endpoint expects path-style requests
            # (https://endpoint/bucket/key), not the virtual-hosted style
            # boto3 defaults to (https://bucket.endpoint/key).
            config=Config(s3={"addressing_style": "path"}),
        )
    return _client


def ensure_bucket_exists():
    """Creates the bucket if it doesn't already exist. Safe to call every time."""
    client = _s3_client()
    try:
        client.head_bucket(Bucket=settings.VULTR_STORAGE_BUCKET)
    except ClientError:
        client.create_bucket(Bucket=settings.VULTR_STORAGE_BUCKET)


def key_for(user_id: int, filename: str) -> str:
    # Organized per-user: users/{user_id}/{filename}.
    return f"users/{user_id}/{filename}"


def upload_url_for(user_id: int, filename: str, content_type: str | None = None, expires_in: int = 900) -> tuple[str, str]:
    """
    Returns (presigned_put_url, storage_key). The browser PUTs the file
    bytes directly to Vultr using this URL -- the file never passes through
    this backend, and the Object Storage secret key never leaves it either.
    """
    ensure_bucket_exists()
    key = key_for(user_id, filename)
    params = {"Bucket": settings.VULTR_STORAGE_BUCKET, "Key": key}
    if content_type:
        params["ContentType"] = content_type
    url = _s3_client().generate_presigned_url("put_object", Params=params, ExpiresIn=expires_in)
    return url, key


def download_url_for(key: str, expires_in: int = 3600) -> str:
    """Generates a temporary, secure download link for a stored file."""
    return _s3_client().generate_presigned_url(
        "get_object", Params={"Bucket": settings.VULTR_STORAGE_BUCKET, "Key": key}, ExpiresIn=expires_in,
    )
