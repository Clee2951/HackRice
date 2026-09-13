from fastapi import APIRouter, Depends, HTTPException
from backend.api.deps import get_current_user
from backend.services import storage

router = APIRouter()


@router.get("/upload-url")
def get_upload_url(filename: str, content_type: str | None = None, user=Depends(get_current_user)):
    # The browser PUTs the file directly to Vultr Object Storage with this
    # URL -- the file bytes never pass through this backend, and the
    # Object Storage secret key never leaves it either.
    url, key = storage.upload_url_for(user.uid, filename, content_type)
    return {"uploadUrl": url, "key": key}


@router.get("/download-url")
def get_download_url(key: str, user=Depends(get_current_user)):
    # Cheap ownership check: keys are always "users/{uid}/...", so refuse
    # to hand back a download link for a key under someone else's prefix
    # even if they guessed/received it somehow.
    if not key.startswith(f"users/{user.uid}/"):
        raise HTTPException(404, "File not found")
    return {"url": storage.download_url_for(key)}
