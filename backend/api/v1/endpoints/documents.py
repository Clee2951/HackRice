from pathlib import Path
from fastapi import APIRouter, Depends, UploadFile, File, Response
from backend.api.deps import get_db, get_current_user
from backend.ai.gemini_client import get_ai
from backend.core.config import settings
from backend.models.document import Document
from backend.services.document_service import extract_pages, build_objectives
from backend.services.study_service import owned_document, commit

router = APIRouter()

@router.post("", status_code=201)
def upload_document(file: UploadFile = File(...), db=Depends(get_db), user=Depends(get_current_user), ai=Depends(get_ai)):
    try:
        data = file.file.read(settings.MAX_UPLOAD_BYTES + 1)
        title = Path((file.filename or "document").replace("\\", "/")).name[:200]
        pages, media = extract_pages(title, data)
        objectives = build_objectives(pages, ai)
        doc = Document(owner_id=user.id, title=title, media_type=media, original=data,
                       pages=pages, objectives=objectives, progress={})
        db.add(doc)
        commit(db)
        return {"id": doc.id, "title": doc.title, "status": "ready", "objectives": doc.objectives}
    finally:
        file.file.close()

@router.get("")
def list_documents(db=Depends(get_db), user=Depends(get_current_user)):
    rows = db.query(Document.id, Document.title).filter(Document.owner_id == user.id).order_by(Document.id.desc()).all()
    return [{"id": row.id, "title": row.title, "status": "ready"} for row in rows]

@router.get("/{document_id}")
def get_document(document_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    doc = owned_document(db, user.id, document_id)
    return {"id": doc.id, "title": doc.title, "status": "ready", "objectives": doc.objectives, "progress": doc.progress}

@router.get("/{document_id}/content")
def get_content(document_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    doc = owned_document(db, user.id, document_id)
    return {"pages": doc.pages}

@router.get("/{document_id}/file")
def get_file(document_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    doc = owned_document(db, user.id, document_id)
    return Response(content=doc.original, media_type=doc.media_type,
                    headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "no-store"})
