from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / "backend" / ".env", extra="ignore")
    API_V1_STR: str = "/api/v1"
    DATABASE_URL: str = f"sqlite:///{(ROOT / 'study.db').as_posix()}"
    SECRET_KEY: str = Field(min_length=32)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    GOOGLE_API_KEY: str = ""
    GEMINI_MODEL: str = ""
    MAX_UPLOAD_BYTES: int = 10 * 1024 * 1024
    MAX_DOCUMENT_CHARS: int = 60000
    MAX_PDF_PAGES: int = 50
    CORS_ORIGINS: list[str] = ["http://localhost:5500", "http://127.0.0.1:5500"]

settings = Settings()
