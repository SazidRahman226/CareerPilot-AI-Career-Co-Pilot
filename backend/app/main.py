"""
CareerPilot — FastAPI Application Entry Point
================================================
Main application setup with CORS, router registration, startup events,
and health check endpoint. This is the root of the backend.
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import init_db
from app.services import vector_store

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


# ============================
#  Application Lifespan
# ============================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup and shutdown events.
    - Startup: Initialize database and vector store
    - Shutdown: Cleanup resources
    """
    # --- Startup ---
    logger.info("=" * 60)
    logger.info("🚀 CareerPilot Backend Starting...")
    logger.info("=" * 60)

    # Initialize PostgreSQL database (create tables)
    init_db()
    logger.info("✅ PostgreSQL database initialized")

    # Initialize ChromaDB vector store
    vector_store.initialize()
    logger.info("✅ ChromaDB vector store initialized")

    logger.info(f"📦 LLM Model: {settings.LLM_MODEL}")
    logger.info(f"🔍 Embedding Model: {settings.EMBEDDING_MODEL}")
    logger.info(f"🌐 Frontend URL: {settings.FRONTEND_URL}")
    logger.info(f"🗄️ Database: PostgreSQL")
    logger.info("=" * 60)
    logger.info("✅ CareerPilot is ready!")
    logger.info("=" * 60)

    yield

    # --- Shutdown ---
    logger.info("CareerPilot Backend shutting down...")


# ============================
#  FastAPI App
# ============================

app = FastAPI(
    title="CareerPilot API",
    description="Agentic Career Co-Pilot — RAG-powered career assistant with job search, fit scoring, and application tracking.",
    version="2.0.0",
    lifespan=lifespan,
)

# --- CORS Middleware ---
# Allow frontend to communicate with backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
        "http://localhost:3000",
        "http://frontend:3000",  # Docker inter-service
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Register Routers ---
from app.routers import auth, cv, chat, jobs, tracker, cv_builder  # noqa: E402

app.include_router(auth.router)
app.include_router(cv.router)
app.include_router(chat.router)
app.include_router(jobs.router)
app.include_router(tracker.router)
app.include_router(cv_builder.router)


# --- Health Check ---
@app.get("/health", tags=["System"])
async def health_check():
    """Health check endpoint for Docker and monitoring."""
    # Health check doesn't have user context, use 0 as placeholder
    cv_status = vector_store.get_status(0)
    return {
        "status": "ok",
        "service": "CareerPilot Backend",
        "version": "2.0.0",
        "cv_uploaded": cv_status.get("uploaded", False),
        "llm_model": settings.LLM_MODEL,
        "database": "postgresql",
    }


@app.get("/", tags=["System"])
async def root():
    """Root endpoint with API info."""
    return {
        "name": "CareerPilot API",
        "version": "2.0.0",
        "docs": "/docs",
        "health": "/health",
    }
