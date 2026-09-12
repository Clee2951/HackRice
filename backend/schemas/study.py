from typing import Literal
from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict

class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

class Objective(StrictModel):
    title: str = Field(min_length=1, max_length=200)
    expected_points: list[str] = Field(min_length=1, max_length=8)
    source_pages: list[int] = Field(min_length=1)

class ObjectiveSet(StrictModel):
    objectives: list[Objective] = Field(min_length=1, max_length=12)

class AssessmentItem(StrictModel):
    concept_id: str
    status: Literal["correct", "partial", "incorrect", "not_demonstrated"]
    evidence: str
    missing_points: list[str]
    misconceptions: list[str]
    follow_up_question: str

class Assessment(StrictModel):
    items: list[AssessmentItem] = Field(min_length=1, max_length=12)
    summary: str

class Lesson(StrictModel):
    markdown: str = Field(min_length=1, max_length=16000)
    check_questions: list[str] = Field(min_length=1, max_length=6)
    source_pages: list[int] = Field(min_length=1)

class ChatAnswer(StrictModel):
    answer: str = Field(min_length=1, max_length=12000)
    source_pages: list[int]

class SessionCreate(StrictModel):
    document_id: int
    objective_ids: list[str] | None = Field(default=None, min_length=1, max_length=5)
    study_seconds: int = Field(default=1500, ge=5, le=7200)
    break_seconds: int = Field(default=300, ge=5, le=1800)

class RecallInput(StrictModel):
    submission_id: UUID
    text: str = Field(min_length=1, max_length=12000)

class ChatInput(StrictModel):
    message: str = Field(min_length=1, max_length=4000)
