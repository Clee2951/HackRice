import time
from sqlalchemy import Column, Integer, String, Text, JSON, LargeBinary, ForeignKey, ForeignKeyConstraint, Float
from backend.db.base_class import Base

class Document(Base):
    # Matches the agreed Vultr schema: document_id is scoped PER USER (not
    # globally unique) -- (uid, document_id) is the composite PK. See
    # document_service.next_document_id() for how document_id values are
    # assigned (MySQL/SQLite have no built-in "auto-increment scoped to
    # another column"; we compute max+1 and retry on a rare race).
    __tablename__ = "documents"
    uid = Column(Integer, ForeignKey("users.uid", ondelete="CASCADE", onupdate="CASCADE"), primary_key=True)
    document_id = Column(Integer, primary_key=True)
    document_title = Column(String(255), nullable=False)
    # Fields below aren't in the original DDL sketch but are load-bearing
    # for features already shipped (file re-download, per-objective mastery
    # tracking, optimistic locking) -- kept as straightforward additions
    # rather than dropped.
    media_type = Column(String(100), nullable=False)
    original = Column(LargeBinary, nullable=False)
    progress = Column(JSON, nullable=False, default=dict)
    revision = Column(Integer, nullable=False, default=1)
    created_at = Column(Float, default=time.time, nullable=False)
    __mapper_args__ = {"version_id_col": revision}


class DocumentObject(Base):
    # Replaces the old Document.objectives/.pages JSON blobs: one row per
    # AI-extracted learning objective, normalized per the agreed schema.
    # object_id is scoped PER (uid, document_id) -- see
    # document_service.next_object_id().
    __tablename__ = "document_objects"
    uid = Column(Integer, primary_key=True)
    document_id = Column(Integer, primary_key=True)
    object_id = Column(Integer, primary_key=True)
    object_title = Column(String(255), nullable=False)
    # The source text this objective was extracted from (the cited pages'
    # raw text) -- grounding context for recall/chat, replacing the old
    # whole-document `pages` blob. Nullable only for defensiveness; upload
    # always fills it in.
    content = Column(Text, nullable=True)
    expected_points = Column(JSON, nullable=True)
    # Deliberately JSON, not a plain INT, despite the singular column name
    # in the agreed DDL: an objective can legitimately cite multiple source
    # pages (Objective.source_pages is a list), and citation validation
    # (document_service.check_pages) needs all of them. Column NAME kept as
    # `source_page` to match the schema; VALUE is a list[int].
    source_page = Column(JSON, nullable=True)
    created_at = Column(Float, default=time.time, nullable=False)
    __table_args__ = (
        ForeignKeyConstraint(
            ["uid", "document_id"], ["documents.uid", "documents.document_id"],
            ondelete="CASCADE", onupdate="CASCADE",
        ),
    )
