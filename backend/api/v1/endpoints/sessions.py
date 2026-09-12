import time
from fastapi import APIRouter, Depends, HTTPException
from backend.api.deps import get_db, get_current_user
from backend.ai.gemini_client import get_ai
from backend.ai import prompts
from backend.models.study import StudySession, RecallAttempt, ChatMessage, WellbeingReading
from backend.schemas.study import SessionCreate, RecallInput, ChatInput, ChatAnswer, WellbeingReport
from backend.services import study_service as study
from backend.services.document_service import check_pages

router = APIRouter()

@router.post("", status_code=201)
def start_session(body: SessionCreate, db=Depends(get_db), user=Depends(get_current_user)):
    doc = study.owned_document(db, user.id, body.document_id)
    ids = body.objective_ids or [obj["id"] for obj in doc.objectives[:5]]
    if len(set(ids)) != len(ids) or not set(ids).issubset({obj["id"] for obj in doc.objectives}):
        raise HTTPException(422, "Select unique objective IDs from this document")
    session = StudySession(owner_id=user.id, document_id=doc.id, objective_ids=ids,
                           study_seconds=body.study_seconds, break_seconds=body.break_seconds,
                           deadline=time.time() + body.study_seconds)
    db.add(session)
    study.commit(db)
    return study.view(session)

@router.get("")
def list_sessions(document_id: int | None = None, db=Depends(get_db), user=Depends(get_current_user)):
    query = db.query(StudySession).filter_by(owner_id=user.id)
    if document_id is not None:
        query = query.filter_by(document_id=document_id)
    return [study.view(s) for s in query.order_by(StudySession.id.desc()).limit(100)]

@router.get("/{session_id}")
def get_session(session_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    return study.view(study.owned_session(db, user.id, session_id))

@router.post("/{session_id}/advance")
def advance_session(session_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    session = study.owned_session(db, user.id, session_id)
    study.advance(db, session)
    study.commit(db)
    return study.view(session)

@router.post("/{session_id}/wellbeing")
def report_wellbeing(session_id: int, body: WellbeingReport, db=Depends(get_db), user=Depends(get_current_user)):
    # Reported by the Presage capture client (presage/session.mjs) after a
    # study/review timer ends, keyed to whichever round is currently active.
    # Consumed by study.advance() when the round's feedback->break
    # transition happens, to extend the break on sustained stress/drowsiness.
    session = study.owned_session(db, user.id, session_id)
    if session.phase not in {"study", "review", "recall", "feedback"}:
        raise HTTPException(409, "No active round to attach a wellbeing report to")
    reading = study.record_wellbeing(db, session, body)
    return study.wellbeing_view(reading)

@router.get("/{session_id}/wellbeing")
def wellbeing_history(session_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    session = study.owned_session(db, user.id, session_id)
    rows = db.query(WellbeingReading).filter_by(session_id=session.id).order_by(WellbeingReading.round_number).all()
    return [study.wellbeing_view(r) for r in rows]

@router.post("/{session_id}/pause")
def pause_session(session_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    session = study.owned_session(db, user.id, session_id)
    if session.phase == "completed":
        raise HTTPException(409, "Session is completed")
    if not session.paused:
        session.remaining_seconds = study.remaining(session)
        session.deadline = None
        session.paused = True
        study.commit(db)
    return study.view(session)

@router.post("/{session_id}/resume")
def resume_session(session_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    session = study.owned_session(db, user.id, session_id)
    if session.phase == "completed":
        raise HTTPException(409, "Session is completed")
    if session.paused:
        session.deadline = time.time() + session.remaining_seconds if session.remaining_seconds is not None else None
        session.remaining_seconds = None
        session.paused = False
        study.commit(db)
    return study.view(session)

@router.post("/{session_id}/complete")
def complete_session(session_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    session = study.owned_session(db, user.id, session_id)
    session.phase, session.paused, session.deadline, session.remaining_seconds = "completed", False, None, None
    study.commit(db)
    return study.view(session)

@router.post("/{session_id}/recall")
def submit_recall(session_id: int, body: RecallInput, db=Depends(get_db), user=Depends(get_current_user), ai=Depends(get_ai)):
    session = study.owned_session(db, user.id, session_id)
    doc = study.owned_document(db, user.id, session.document_id)
    return study.assess_recall(db, doc, session, body, ai)

@router.get("/{session_id}/attempts")
def attempts(session_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    session = study.owned_session(db, user.id, session_id)
    if session.phase == "recall":
        raise HTTPException(409, "Recall history is hidden during recall")
    rows = db.query(RecallAttempt).filter_by(session_id=session.id).order_by(RecallAttempt.id).all()
    return [{"round_number": r.round_number, "text": r.text, "result": r.assessment, "created_at": r.created_at} for r in rows]

@router.post("/{session_id}/chat")
def chat(session_id: int, body: ChatInput, db=Depends(get_db), user=Depends(get_current_user), ai=Depends(get_ai)):
    session = study.owned_session(db, user.id, session_id)
    study.ensure_active(session)
    if session.phase not in {"study", "review"} or study.remaining(session) <= 0:
        raise HTTPException(409, "Tutoring is available only during an active study/review timer")
    doc = study.owned_document(db, user.id, session.document_id)
    recent = db.query(ChatMessage).filter_by(session_id=session.id).order_by(ChatMessage.id.desc()).limit(8).all()
    response = ai.structured(prompts.CHAT, {"source": doc.pages, "objectives": study.selected(doc, session),
        "progress": doc.progress, "lesson": session.lesson,
        "recent_chat": [{"role": m.role, "content": m.content} for m in reversed(recent)],
        "question": body.message}, ChatAnswer)
    check_pages(response.source_pages, doc.pages)
    # Refresh after the network request: a pause or timer expiry may have occurred.
    db.refresh(session)
    study.ensure_active(session)
    if session.phase not in {"study", "review"} or study.remaining(session) <= 0:
        raise HTTPException(409, "Session changed while the answer was being generated")
    db.add_all([ChatMessage(session_id=session.id, role="user", content=body.message),
                ChatMessage(session_id=session.id, role="assistant", content=response.answer)])
    study.commit(db)
    return response

@router.get("/{session_id}/chat")
def chat_history(session_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    session = study.owned_session(db, user.id, session_id)
    if session.phase == "recall":
        raise HTTPException(409, "Chat history is hidden during recall")
    rows = db.query(ChatMessage).filter_by(session_id=session.id).order_by(ChatMessage.id.desc()).limit(100).all()
    return [{"role": row.role, "content": row.content} for row in reversed(rows)]
