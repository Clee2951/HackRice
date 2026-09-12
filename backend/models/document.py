from sqlalchemy import Column, Integer, String, ForeignKey, JSON, LargeBinary
from backend.db.base_class import Base

class Document(Base):
    id = Column(Integer, primary_key=True)
    owner_id = Column(Integer, ForeignKey("user.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    media_type = Column(String, nullable=False)
    original = Column(LargeBinary, nullable=False)
    pages = Column(JSON, nullable=False)
    objectives = Column(JSON, nullable=False)
    progress = Column(JSON, nullable=False, default=dict)
    revision = Column(Integer, nullable=False, default=1)
    __mapper_args__ = {"version_id_col": revision}
