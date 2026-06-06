"""
CareerPilot Backend — Configuration
====================================
Loads all settings from .env file. No hardcoded values.
"""

from pydantic_settings import BaseSettings
from pathlib import Path
import os


class Settings(BaseSettings):
    """Application-wide configuration loaded from .env file."""

    # --- LLM ---
    GOOGLE_API_KEY: str = ""
    LLM_MODEL: str = ""
    EMBEDDING_MODEL: str = ""

    # --- Job Search APIs ---
    SERPAPI_API_KEY: str = ""

    # --- Database ---
    DATABASE_URL: str = ""

    # --- Authentication ---
    JWT_SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRY_HOURS: int = 168

    # --- CORS ---
    FRONTEND_URL: str = "http://localhost:3000"

    # --- Paths ---
    BASE_DIR: str = ""
    DATA_DIR: str = ""
    CHROMA_PERSIST_DIR: str = ""
    UPLOAD_DIR: str = ""

    # --- Default User ---
    DEFAULT_USER_EMAIL: str = ""
    DEFAULT_USER_PASSWORD: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"

    def model_post_init(self, __context):
        """Set derived paths after initialization from .env."""
        if not self.BASE_DIR:
            self.BASE_DIR = str(Path(__file__).resolve().parent.parent)
        if not self.DATA_DIR:
            self.DATA_DIR = os.path.join(self.BASE_DIR, "data")
        if not self.CHROMA_PERSIST_DIR:
            self.CHROMA_PERSIST_DIR = os.path.join(self.DATA_DIR, "chroma_db")
        if not self.UPLOAD_DIR:
            self.UPLOAD_DIR = os.path.join(self.DATA_DIR, "uploads")

        # Ensure data directories exist
        os.makedirs(self.DATA_DIR, exist_ok=True)
        os.makedirs(self.CHROMA_PERSIST_DIR, exist_ok=True)
        os.makedirs(self.UPLOAD_DIR, exist_ok=True)

        # Validate required config
        self._validate()

    def _validate(self):
        """Validate that required config values are present."""
        required = [
            ("GOOGLE_API_KEY", self.GOOGLE_API_KEY),
            ("LLM_MODEL", self.LLM_MODEL),
            ("EMBEDDING_MODEL", self.EMBEDDING_MODEL),
            ("DATABASE_URL", self.DATABASE_URL),
            ("JWT_SECRET_KEY", self.JWT_SECRET_KEY),
        ]
        missing = [name for name, value in required if not value]
        if missing:
            raise ValueError(
                f"Missing required environment variables: {', '.join(missing)}. "
                "Copy .env.example to .env and fill in the values."
            )


# Singleton instance
settings = Settings()
