"""
CareerPilot Backend — Database Setup
======================================
SQLAlchemy async engine for SQLite. Provides session factory and Base class
for ORM models. Tables are auto-created on application startup.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.config import settings


# SQLite engine (synchronous for simplicity in hackathon)
DATABASE_URL = f"sqlite:///{settings.SQLITE_DB_PATH}"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Base class for all ORM models."""
    pass


def get_db():
    """
    Dependency that yields a database session.
    Used in FastAPI route dependencies.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all database tables. Called on app startup."""
    from app.models import db_models  # noqa: F401 — import so models are registered
    Base.metadata.create_all(bind=engine)
