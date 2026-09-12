from fastapi import APIRouter
from backend.api.v1.endpoints import auth, documents, sessions

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(documents.router, prefix="/documents", tags=["documents"])
api_router.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
