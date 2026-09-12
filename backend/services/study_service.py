import math
import time
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm.exc import StaleDataError
from backend.models.document import Document
from backend.models.study import StudySession, RecallAttempt
from backend.schemas.study import Assessment, Lesson
from backend.services.document_service import check_pages
from backend.ai import prompts


def commit(db):
    try:
        db.commit()
    except (StaleDataError, IntegrityError, OperationalError):
        db.rollback()
        raise HTTPException(409, "State changed or database is busy. Reload the session and retry")


def owned_document(db, user_id, document_id):
    obj = db.query(Document).filter_by(id=document_id, owner_id=user_id).first()
    if not obj:
        raise HTTPException(404, "Document not found")
    return obj


def owned_session(db, user_id, session_id):
    obj = db.query(StudySession).filter_by(id=session_id, owner_id=user_id).first()
    if not obj:
        raise HTTPException(404, "Session not found")
    return obj


def selected(doc, session):
    return [obj for obj in doc.objectives if obj["id"] in session.objective_ids]


def remaining(session):
    if session.paused:
        return session.remaining_seconds
    if session.deadline is None:
        return None
    return max(0, session.deadline - time.time())


def view(session):
    seconds = remaining(session)
    return {"id": session.id, "document_id": session.document_id,
            "objective_ids": session.objective_ids, "phase": session.phase,
            "paused": session.paused, "round_number": session.round_number,
            "deadline": session.deadline, "server_time": time.time(),
            "remaining_seconds": math.ceil(seconds) if seconds is not None else None,
            "lesson": session.lesson if session.phase in {"feedback", "break", "review"} else None}


def ensure_active(session):
    if session.paused or session.phase == "completed":
        raise HTTPException(409, "Resume the session or start a new one")


def advance(session):
    ensure_active(session)
    if session.phase in {"study", "review", "break"} and remaining(session) > 0:
        raise HTTPException(409, "This timer has not finished")
    if session.phase in {"study", "review"}:
        session.phase, session.deadline = "recall", None
    elif session.phase == "feedback":
        session.phase, session.deadline = "break", time.time() + session.break_seconds
    elif session.phase == "break":
        session.phase, session.deadline = "review", time.time() + session.study_seconds
        session.round_number += 1
    else:
        raise HTTPException(409, "Submit recall before advancing")


def assess_recall(db, doc, session, request, ai):
    submission_id = str(request.submission_id)
    previous = db.query(RecallAttempt).filter_by(session_id=session.id, submission_id=submission_id).first()
    if previous:
        if previous.text != request.text:
            raise HTTPException(409, "This submission ID was already used with different text")
        return previous.assessment
    ensure_active(session)
    if session.phase != "recall":
        raise HTTPException(409, "Session must be in recall phase")
    objectives = selected(doc, session)
    payload = {"source": doc.pages, "objectives": objectives, "student_answer": request.text}
    assessment = ai.structured(prompts.ASSESS, payload, Assessment)
    ids = [item.concept_id for item in assessment.items]
    if len(ids) != len(set(ids)) or set(ids) != set(session.objective_ids):
        raise HTTPException(502, "AI assessment did not match the selected objectives; retry")
    for item in assessment.items:
        if item.evidence and item.evidence not in request.text:
            raise HTTPException(502, "AI evidence did not match your answer; retry")
        if item.status != "not_demonstrated" and not item.evidence:
            raise HTTPException(502, "AI assessment lacked supporting evidence; retry")
    lesson = ai.structured(prompts.LESSON, {**payload, "assessment": assessment.model_dump()}, Lesson)
    check_pages(lesson.source_pages, doc.pages)
    result = {"assessment": assessment.model_dump(), "lesson": lesson.model_dump()}
    db.add(RecallAttempt(session_id=session.id, round_number=session.round_number,
                         submission_id=submission_id, text=request.text, assessment=result))
    # Replace the JSON value so SQLAlchemy detects it. Never update knowledge on lesson display.
    progress = dict(doc.progress)
    for item in assessment.items:
        prior = progress.get(item.concept_id, {})
        progress[item.concept_id] = {**item.model_dump(), "assessed_at": time.time(),
            "attempt_count": prior.get("attempt_count", 0) + 1,
            "last_demonstrated_status": item.status if item.status != "not_demonstrated" else prior.get("last_demonstrated_status")}
    doc.progress = progress
    session.lesson = lesson.model_dump()
    session.phase = "feedback"
    session.deadline = None
    commit(db)
    return result
