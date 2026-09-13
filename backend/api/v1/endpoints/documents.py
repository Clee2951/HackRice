from pathlib import Path
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Response
from backend.api.deps import get_db, get_current_user
from backend.ai.gemini_client import get_ai
from backend.core.config import settings
from backend.models.document import Document
from backend.services import document_service, storage
from backend.services.study_service import owned_document, objects_view

router = APIRouter()

@router.post("", status_code=201)
def upload_document(file: UploadFile = File(...), db=Depends(get_db), user=Depends(get_current_user), ai=Depends(get_ai)):
    try:
        data = file.file.read(settings.MAX_UPLOAD_BYTES + 1)
        title = Path((file.filename or "document").replace("\\", "/")).name[:200]
        pages, media = document_service.extract_pages(title, data)
        objectives = document_service.build_objectives(pages, ai)
        doc = document_service.create_document(db, user.uid, title, media, data, pages, objectives)
        return {"id": doc.document_id, "title": doc.document_title, "status": "ready",
                "objectives": objects_view(db, doc)}
    finally:
        file.file.close()

@router.get("")
def list_documents(db=Depends(get_db), user=Depends(get_current_user)):
    rows = (db.query(Document.document_id, Document.document_title)
              .filter(Document.uid == user.uid).order_by(Document.document_id.desc()).all())
    return [{"id": row.document_id, "title": row.document_title, "status": "ready"} for row in rows]

@router.get("/{document_id}")
def get_document(document_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    doc = owned_document(db, user.uid, document_id)
    return {"id": doc.document_id, "title": doc.document_title, "status": "ready",
            "objectives": objects_view(db, doc), "progress": doc.progress}

@router.get("/{document_id}/content")
def get_content(document_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    # Was `{"pages": doc.pages}` -- pages no longer exist as a stored blob;
    # document_objects (title/content/expected_points/source_page per
    # extracted concept) is the reading view now.
    doc = owned_document(db, user.uid, document_id)
    return {"objects": objects_view(db, doc)}

@router.get("/{document_id}/file")
def get_file(document_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    """The original upload, for the reader pane's <iframe>.

    Serves from wherever create_document() put the bytes: a short-lived
    presigned Vultr URL when object storage is configured, otherwise the
    DB blob. The redirect keeps the bucket private -- the browser never
    holds credentials, and the signed URL expires in an hour.
    """
    doc = owned_document(db, user.uid, document_id)
    data = storage.get_bytes(doc.storage_key) if doc.storage_key else (doc.original or b"")
    return Response(content=data, media_type=doc.media_type,
                    headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "no-store"})


@router.get("/{document_id}/file-url")
def get_file_url(document_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    """A short-lived direct link to the stored original.

    Only meaningful for object-storage-backed documents; a DB-backed one
    has no URL to hand out and says so rather than inventing one. The
    reader UI uses /file (proxied, same-origin) -- this exists for
    consumers that want to pass a plain URL to something else, such as a
    native PDF viewer.
    """
    doc = owned_document(db, user.uid, document_id)
    if not doc.storage_key:
        raise HTTPException(409, "This document is stored in the database; fetch it from /file instead")
    return {"url": storage.presigned_get(doc.storage_key)}
