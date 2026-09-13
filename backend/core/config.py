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
    CORS_ORIGINS: list[str] = ["http://localhost:5500", "http://127.0.0.1:5500",
                               "http://localhost:3000", "http://127.0.0.1:3000"]
    # The packaged desktop app serves its UI from a loopback port the OS
    # picks at launch, so its Origin is not knowable ahead of time and no
    # fixed allowlist can cover it. Matching any loopback origin costs
    # nothing security-wise: auth is a bearer token held in the app
    # origin's localStorage, which no other origin can read, so a local
    # page that reaches this API still has no way to obtain a token. It is
    # deliberately anchored and loopback-only -- it must not match
    # "http://127.0.0.1.evil.com".
    CORS_ORIGIN_REGEX: str = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"
    # Vultr Object Storage (S3-compatible) for uploaded document originals.
    # All four are optional: when any is blank, services/storage.py reports
    # itself unconfigured and document originals are kept in the database
    # instead. See docs/vultr-object-storage.md.
    VULTR_STORAGE_ENDPOINT: str = ""
    VULTR_ACCESS_KEY: str = ""
    VULTR_SECRET_KEY: str = ""
    VULTR_STORAGE_BUCKET: str = ""
    VULTR_STORAGE_REGION: str = ""

settings = Settings()
