"""
CareerPilot Backend — Database Setup
======================================
SQLAlchemy engine for PostgreSQL. Provides session factory and Base class
for ORM models. Tables are auto-created on application startup.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase, Session
from app.config import settings
import os
import json
import datetime

# PostgreSQL engine
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,   # Validates connections before executing queries
    pool_recycle=300      # Re-creates connections every 5 minutes
)

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
    db = SessionLocal()

    try:
        _seed_demo_user(db)
    finally:
        db.close()


def _seed_demo_user(db: Session):
    from app.models.db_models import User, UserProfile
    from app.services.cv_processor import process_cv
    from app.services.vector_store import add_documents
    from app.services.auth_service import hash_password

    """Creates a default system user, processes and embeds their CV into ChromaDB."""
    default_email = getattr(settings, "DEFAULT_USER_EMAIL", "user@example.com")
    default_password = getattr(settings, "DEFAULT_USER_PASSWORD", "user")
    
    # 1. Look up existing default user
    existing_user = db.query(User).filter(User.email == default_email).first()

    if existing_user:
        print("ℹ️ Default user already exists. Skipping initialization.")
        return

    # 2. Instantiate User model and hash password
    hashed = hash_password(default_password) 
    new_user = User(
        name="Default Admin",
        email=default_email,
        hashed_password=hashed
    )

    # Base fallbacks matching schema defaults
    filename = "mock_resume.pdf"
    sections_list = []
    chunk_count = 0
    uploaded_at = None

    # Determine absolute path to the local asset file
    cv_path = os.path.join(os.path.dirname(__file__), "assets", filename)
    
    if os.path.exists(cv_path):
        try:
            print(f"📄 Found default CV at {cv_path}. Parsing text structure...")
            
            # 3. Call your text processor
            processed_data = process_cv(cv_path)
            chunks = processed_data.get("chunks", [])
            sections_list = processed_data.get("sections_detected", [])
            
            chunk_count = len(chunks)
            uploaded_at = datetime.datetime.utcnow()

            # 4. Flush the user row to PostgreSQL to generate an primary key id
            db.add(new_user)
            db.flush() 

            # 5. Send chunks instantly to ChromaDB using your exact add_documents layout
            if chunk_count > 0:
                print(f"🧬 Embedding and saving {chunk_count} document chunks to ChromaDB...")
                add_documents(
                    user_id=new_user.id,
                    chunks=chunks,
                    filename=filename,
                    sections=sections_list
                )
                print(" Successfully indexed default CV vectors.")
                
        except Exception as embed_error:
            print(f"⚠️ CV text processing or vector indexing failed: {embed_error}")
            print("Proceeding to configure user profile with fallback metadata.")
    else:
        print(f"⚠️ Default CV file missing at path: {cv_path}. Skipping file parsing.")

    # 6. Instantiate Profile model and assign structural metadata fields
    new_profile = UserProfile(
        cv_filename=filename if os.path.exists(cv_path) else "",
        cv_sections_json=json.dumps(sections_list),  # Encodes list to JSON array text
        cv_chunk_count=chunk_count,
        cv_uploaded_at=uploaded_at
    )
    

    # Auto-links structural keys inside memory instances
    new_user.profile = new_profile

    # 7. Atomically commit the transaction to PostgreSQL
    try:
        db.commit()
        print(f" Complete initialization sequence finished for: {default_email}")
    except Exception as e:
        db.rollback()
        print(f"❌ PostgreSQL startup transaction completely aborted: {e}")