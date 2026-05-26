"""
CareerPilot Backend — Configuration
====================================
Centralized settings loaded from environment variables / .env file.
Uses Pydantic BaseSettings for type-safe config with defaults.
"""

from pydantic_settings import BaseSettings
from pathlib import Path
import os


class Settings(BaseSettings):
    """Application-wide configuration."""

    # --- LLM ---
    GOOGLE_API_KEY: str = ""
    LLM_MODEL: str = "gemini-2.5-flash"
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"

    # --- Job Search APIs (optional) ---
    SERPAPI_API_KEY: str = "cb564057a032b7e2faef6708646c2c29c78302a2"
    ADZUNA_APP_ID: str = "1f695cb1"
    ADZUNA_APP_KEY: str = "bef052271daa3e39651177d55cb664b4"

    # --- Paths ---
    BASE_DIR: str = str(Path(__file__).resolve().parent.parent)
    DATA_DIR: str = ""
    CHROMA_PERSIST_DIR: str = ""
    SQLITE_DB_PATH: str = ""
    UPLOAD_DIR: str = ""

    # --- CORS ---
    FRONTEND_URL: str = "http://localhost:3000"

    class Config:
        env_file = ".env"
        extra = "ignore"

    def model_post_init(self, __context):
        """Set derived paths after initialization."""
        if not self.DATA_DIR:
            self.DATA_DIR = os.path.join(self.BASE_DIR, "data")
        if not self.CHROMA_PERSIST_DIR:
            self.CHROMA_PERSIST_DIR = os.path.join(self.DATA_DIR, "chroma_db")
        if not self.SQLITE_DB_PATH:
            self.SQLITE_DB_PATH = os.path.join(self.DATA_DIR, "careerpilot.db")
        if not self.UPLOAD_DIR:
            self.UPLOAD_DIR = os.path.join(self.DATA_DIR, "uploads")

        # Ensure data directories exist
        os.makedirs(self.DATA_DIR, exist_ok=True)
        os.makedirs(self.CHROMA_PERSIST_DIR, exist_ok=True)
        os.makedirs(self.UPLOAD_DIR, exist_ok=True)


# Singleton instance
settings = Settings()
