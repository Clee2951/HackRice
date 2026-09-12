from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from backend.core.config import settings

is_sqlite = settings.DATABASE_URL.startswith("sqlite")
engine = create_engine(settings.DATABASE_URL, connect_args={"check_same_thread": False, "timeout": 30} if is_sqlite else {})
if is_sqlite:
    @event.listens_for(engine, "connect")
    def configure_sqlite(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")
SessionLocal = sessionmaker(bind=engine, autoflush=False)
