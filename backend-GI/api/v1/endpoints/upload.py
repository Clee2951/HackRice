import os
import tempfile

from fastapi import APIRouter, Depends, UploadFile, File
from sqlalchemy.orm import Session

from backend.api import deps
from backend.models.user import User
from backend.ai.backboard_client import (
    create_assistant_for_user,
    upload_document,
    ask_for_related_topics,
)
from backend.services.storage import upload_file_to_storage, get_file_url

router = APIRouter()


@router.post("/upload")
async def upload_document_endpoint(
    file: UploadFile = File(...),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    # Step 1: make sure this user has a Backboard assistant (create once, reuse forever)
    if not current_user.backboard_assistant_id:
        assistant_id = await create_assistant_for_user(str(current_user.id))
        current_user.backboard_assistant_id = assistant_id
        db.add(current_user)
        db.commit()
        db.refresh(current_user)

    # Step 2: save the uploaded file to a temp path on disk
    suffix = os.path.splitext(file.filename)[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        contents = await file.read()
        tmp.write(contents)
        temp_path = tmp.name

    try:
        # Step 3: upload the SAME file to both destinations
        storage_key = upload_file_to_storage(temp_path, current_user.id, file.filename)
        backboard_result = await upload_document(current_user.backboard_assistant_id, temp_path)
    finally:
        os.remove(temp_path)

    return {
        "status": "uploaded",
        "filename": file.filename,
        "storage_key": storage_key,
        "document_id": str(backboard_result.document_id),
    }


@router.get("/download-url")
def get_download_url(
    storage_key: str,
    current_user: User = Depends(deps.get_current_user),
):
    """Returns a temporary secure link to re-download a previously uploaded file."""
    url = get_file_url(storage_key)
    return {"url": url}


@router.post("/recommend")
async def recommend_topics(
    current_user: User = Depends(deps.get_current_user),
):
    if not current_user.backboard_assistant_id:
        return {"recommendations": "Upload a document first to get personalized recommendations."}

    reply = await ask_for_related_topics(
        current_user.backboard_assistant_id,
        "Based on everything I've uploaded, suggest 5 relevant topics I should explore next, "
        "and briefly explain why each is relevant.",
    )
    return {"recommendations": reply}