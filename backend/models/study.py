import time
from sqlalchemy import Column, Integer, String, ForeignKey, JSON, Float, Boolean, UniqueConstraint
from backend.db.base_class import Base

class StudySession(Base):
    id = Column(Integer, primary_key=True)
    owner_id = Column(Integer, ForeignKey("user.id"), nullable=False, index=True)
    document_id = Column(Integer, ForeignKey("document.id"), nullable=False, index=True)
    objective_ids = Column(JSON, nullable=False)
    phase = Column(String, nullable=False, default="study")
    paused = Column(Boolean, nullable=False, default=False)
    study_seconds = Column(Integer, nullable=False)
    break_seconds = Column(Integer, nullable=False)
    deadline = Column(Float, nullable=True)
    remaining_seconds = Column(Float, nullable=True)
    round_number = Column(Integer, nullable=False, default=1)
    lesson = Column(JSON, nullable=True)
    revision = Column(Integer, nullable=False, default=1)
    __mapper_args__ = {"version_id_col": revision}

class RecallAttempt(Base):
    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey("studysession.id"), nullable=False, index=True)
    round_number = Column(Integer, nullable=False)
    submission_id = Column(String, nullable=False)
    text = Column(String, nullable=False)
    assessment = Column(JSON, nullable=False)
    created_at = Column(Float, default=time.time, nullable=False)
    __table_args__ = (UniqueConstraint("session_id", "round_number"), UniqueConstraint("session_id", "submission_id"))

class ChatMessage(Base):
    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey("studysession.id"), nullable=False, index=True)
    role = Column(String, nullable=False)
    content = Column(String, nullable=False)
