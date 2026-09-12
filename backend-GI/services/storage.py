#storage
import os
import boto3
from pathlib import Path
from dotenv import load_dotenv
from botocore.exceptions import ClientError

# Explicitly load backend/.env regardless of where this runs from
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

VULTR_STORAGE_ENDPOINT = os.environ.get("VULTR_STORAGE_ENDPOINT")
VULTR_ACCESS_KEY = os.environ.get("VULTR_ACCESS_KEY")
VULTR_SECRET_KEY = os.environ.get("VULTR_SECRET_KEY")
VULTR_STORAGE_BUCKET = os.environ.get("VULTR_STORAGE_BUCKET")

if not all([VULTR_STORAGE_ENDPOINT, VULTR_ACCESS_KEY, VULTR_SECRET_KEY, VULTR_STORAGE_BUCKET]):
    raise ValueError(
        "Missing Vultr Object Storage settings. Check backend/.env has "
        "VULTR_STORAGE_ENDPOINT, VULTR_ACCESS_KEY, VULTR_SECRET_KEY, VULTR_STORAGE_BUCKET"
    )

s3_client = boto3.client(
    "s3",
    endpoint_url=VULTR_STORAGE_ENDPOINT,
    aws_access_key_id=VULTR_ACCESS_KEY,
    aws_secret_access_key=VULTR_SECRET_KEY,
)


def ensure_bucket_exists():
    """Creates the bucket if it doesn't already exist. Safe to call every time."""
    try:
        s3_client.head_bucket(Bucket=VULTR_STORAGE_BUCKET)
    except ClientError:
        s3_client.create_bucket(Bucket=VULTR_STORAGE_BUCKET)


def upload_file_to_storage(local_file_path: str, user_id: int, filename: str) -> str:
    """
    Uploads a file to Vultr Object Storage, organized per-user:
    users/{user_id}/{filename}
    Returns the storage key (path) it was saved under.
    """
    ensure_bucket_exists()
    key = f"users/{user_id}/{filename}"
    s3_client.upload_file(local_file_path, VULTR_STORAGE_BUCKET, key)
    return key


def get_file_url(key: str, expires_in: int = 3600) -> str:
    """
    Generates a temporary, secure download link for a stored file.
    Expires after `expires_in` seconds (default 1 hour).
    """
    url = s3_client.generate_presigned_url(
        "get_object",
        Params={"Bucket": VULTR_STORAGE_BUCKET, "Key": key},
        ExpiresIn=expires_in,
    )
    return url