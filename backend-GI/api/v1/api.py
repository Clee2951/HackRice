from fastapi import APIRouter

from backend.api.v1.endpoints import auth, tasks, upload

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
api_router.include_router(upload.router, prefix="/documents", tags=["documents"])