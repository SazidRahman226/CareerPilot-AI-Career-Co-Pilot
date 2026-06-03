"""
CareerPilot — CV Upload Router
=================================
Handles CV file uploads, processing, and status checking.
Supports PDF and DOCX formats. User-scoped.
"""

import os
import json
import logging
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.db_models import User, UserProfile
from app.services import cv_processor, vector_store
from app.services.auth_service import get_current_user
from app.models.schemas import CVUploadResponse, CVStatusResponse


def _invalidate_agent_cache_for_user(user_id: int) -> None:
    """
    Drop any cached agent executors belonging to this user so the next chat
    turn rebuilds the agent with the new CV-status flag.

    The conversation_id format used by the chat router is `f"{user_id}:{cid}"`,
    so we match by the user-id prefix.
    """
    try:
        from app.services import agent as agent_service
        prefix = f"{user_id}:"
        stale = [k for k in agent_service._agent_cache if k.startswith(prefix)]
        for k in stale:
            del agent_service._agent_cache[k]
        if stale:
            logger.info(f"Invalidated {len(stale)} cached agent(s) for user {user_id}")
    except Exception as e:
        # Cache invalidation is best-effort. Worst case the next chat turn
        # rebuilds the agent on its own when the prompt needs to change.
        logger.warning(f"Failed to invalidate agent cache for user {user_id}: {e}")

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/cv", tags=["CV"])


@router.post("/upload", response_model=CVUploadResponse)
async def upload_cv(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Upload and process a CV (PDF or DOCX) for the authenticated user.

    Pipeline:
    1. Validate file type
    2. Save to disk
    3. Extract text (PDF/DOCX parser)
    4. Chunk into semantic sections
    5. Embed and store in ChromaDB
    6. Update user profile in DB

    Returns processing results including detected sections and chunk count.
    """
    # --- Validate file type ---
    allowed_extensions = {".pdf", ".docx", ".doc"}
    file_ext = os.path.splitext(file.filename or "")[1].lower()

    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file_ext}. Please upload a PDF or DOCX file."
        )

    # --- Save uploaded file ---
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_filename = f"cv_user{current_user.id}_{timestamp}{file_ext}"
    file_path = os.path.join(settings.UPLOAD_DIR, safe_filename)

    try:
        contents = await file.read()
        with open(file_path, "wb") as f:
            f.write(contents)
        logger.info(f"Saved CV to: {file_path}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    # --- Process CV ---
    try:
        result = cv_processor.process_cv(file_path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"CV processing failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to process CV: {str(e)}")

    # --- Clear existing data and store new chunks ---
    try:
        vector_store.clear(current_user.id)
        vector_store.add_documents(
            current_user.id,
            chunks=result["chunks"],
            filename=file.filename or safe_filename,
            sections=result["sections_detected"],
        )
    except Exception as e:
        logger.error(f"Vector store operation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to store embeddings: {str(e)}")

    # --- Update user profile in DB ---
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    if not profile:
        profile = UserProfile(user_id=current_user.id)
        db.add(profile)

    profile.cv_filename = file.filename or safe_filename
    profile.cv_sections_json = json.dumps(result["sections_detected"])
    profile.cv_chunk_count = len(result["chunks"])
    profile.cv_uploaded_at = datetime.now()
    db.commit()

    _invalidate_agent_cache_for_user(current_user.id)

    return CVUploadResponse(
        success=True,
        message=f"CV processed successfully! Found {len(result['chunks'])} content chunks across {len(result['sections_detected'])} sections.",
        filename=file.filename or safe_filename,
        chunk_count=len(result["chunks"]),
        sections_detected=result["sections_detected"],
    )


@router.get("/status", response_model=CVStatusResponse)
async def get_cv_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Check if the authenticated user has a CV uploaded and get its metadata."""
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()

    if not profile or not profile.cv_filename:
        return CVStatusResponse(uploaded=False)

    sections = json.loads(profile.cv_sections_json) if profile.cv_sections_json else []

    return CVStatusResponse(
        uploaded=True,
        filename=profile.cv_filename,
        chunk_count=profile.cv_chunk_count,
        sections_detected=sections,
        upload_timestamp=profile.cv_uploaded_at.isoformat() if profile.cv_uploaded_at else "",
    )


@router.delete("/clear")
async def clear_cv(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Clear the uploaded CV and all associated embeddings for the authenticated user."""
    vector_store.clear(current_user.id)

    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    if profile:
        profile.cv_filename = ""
        profile.cv_sections_json = "[]"
        profile.cv_chunk_count = 0
        profile.cv_uploaded_at = None
        db.commit()

    _invalidate_agent_cache_for_user(current_user.id)

    return {"success": True, "message": "CV data cleared successfully."}
