from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from backend.core.config import ROOT, settings
from backend.db.session import engine
from backend.db.base_class import Base
from backend.models.user import User
from backend.models.document import Document, DocumentObject
from backend.models.study import StudySession, RecallAttempt, ChatMessage, WellbeingReading
from backend.api.v1.api import api_router

@asynccontextmanager
async def lifespan(app):
    # Sufficient for a new hackathon DB. Existing table changes need migrations.
    Base.metadata.create_all(bind=engine)
    yield

app = FastAPI(title="Study Loop API", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.CORS_ORIGINS,
                   allow_origin_regex=settings.CORS_ORIGIN_REGEX or None,
                   allow_credentials=False, allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type"])

@app.get("/api/health")
def health():
    return {"status": "ok"}

app.include_router(api_router, prefix=settings.API_V1_STR)
# Keep after API registration. The existing page is still the starter task UI.
app.mount("/", StaticFiles(directory=ROOT / "frontend", html=True), name="frontend")
