import time
from sqlalchemy import Column, Integer, String, Text, ForeignKey, ForeignKeyConstraint, JSON, Float, Boolean, UniqueConstraint
from backend.db.base_class import Base

class StudySession(Base):
    id = Column(Integer, primary_key=True)
    owner_id = Column(Integer, ForeignKey("users.uid"), nullable=False, index=True)
    document_id = Column(Integer, nullable=False, index=True)
    objective_ids = Column(JSON, nullable=False)
    # "study"/"review"/"recall"/"feedback"/"break"/"completed".
    phase = Column(String(20), nullable=False, default="study")
    paused = Column(Boolean, nullable=False, default=False)
    study_seconds = Column(Integer, nullable=False)
    break_seconds = Column(Integer, nullable=False)
    deadline = Column(Float, nullable=True)
    remaining_seconds = Column(Float, nullable=True)
    round_number = Column(Integer, nullable=False, default=1)
    lesson = Column(JSON, nullable=True)
    revision = Column(Integer, nullable=False, default=1)
    # documents' PK is (uid, document_id), not a global id -- owner_id
    # doubles as that uid here, which also means the DB now enforces what
    # study_service.owned_document() already checked in application code:
    # a session can only point at a document owned by the same user.
    __table_args__ = (
        ForeignKeyConstraint(["owner_id", "document_id"], ["documents.uid", "documents.document_id"]),
    )
    __mapper_args__ = {"version_id_col": revision}

class RecallAttempt(Base):
    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey("studysession.id"), nullable=False, index=True)
    round_number = Column(Integer, nullable=False)
    submission_id = Column(String(36), nullable=False)  # UUID, see RecallInput
    text = Column(Text, nullable=False)  # up to RecallInput's 12,000 chars
    assessment = Column(JSON, nullable=False)
    created_at = Column(Float, default=time.time, nullable=False)
    __table_args__ = (UniqueConstraint("session_id", "round_number"), UniqueConstraint("session_id", "submission_id"))

class ChatMessage(Base):
    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey("studysession.id"), nullable=False, index=True)
    role = Column(String(20), nullable=False)  # "user" / "assistant"
    content = Column(Text, nullable=False)  # up to ChatAnswer's 12,000 chars

class WellbeingReading(Base):
    # A per-round stress/drowsiness summary reported by the Presage capture
    # client (see presage/session.mjs) after a study/review timer ends.
    # Deliberately a new table rather than new columns on StudySession -- see
    # the "Existing table changes need migrations" note in main.py; this
    # keeps the addition safe against the already-committed study.db.
    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey("studysession.id"), nullable=False, index=True)
    round_number = Column(Integer, nullable=False)
    avg_stress = Column(Float, nullable=True)
    pct_high_stress = Column(Float, nullable=True)
    longest_high_stress_run_sec = Column(Float, nullable=False, default=0)
    blink_rate_per_min = Column(Float, nullable=True)
    drowsiness_alert_count = Column(Integer, nullable=False, default=0)
    extend_break = Column(Boolean, nullable=False, default=False)
    extra_break_minutes = Column(Integer, nullable=False, default=0)
    created_at = Column(Float, default=time.time, nullable=False)
    __table_args__ = (UniqueConstraint("session_id", "round_number"),)
