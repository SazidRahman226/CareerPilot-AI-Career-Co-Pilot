"""
CareerPilot — CV Upload Router
=================================
Handles CV file uploads, processing, and status checking.
Supports PDF and DOCX formats.
"""

import os
import logging
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, HTTPException
from app.config import settings
from app.services import cv_processor, vector_store
from app.models.schemas import CVUploadResponse, CVStatusResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/cv", tags=["CV"])


@router.post("/upload", response_model=CVUploadResponse)
async def upload_cv(file: UploadFile = File(...)):
    """
    Upload and process a CV (PDF or DOCX).

    Pipeline:
    1. Validate file type
    2. Save to disk
    3. Extract text (PDF/DOCX parser)
    4. Chunk into semantic sections
    5. Embed and store in ChromaDB

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
    safe_filename = f"cv_{timestamp}{file_ext}"
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
        vector_store.clear()
        vector_store.add_documents(
            chunks=result["chunks"],
            filename=file.filename or safe_filename,
            sections=result["sections_detected"],
        )
    except Exception as e:
        logger.error(f"Vector store operation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to store embeddings: {str(e)}")

    return CVUploadResponse(
        success=True,
        message=f"CV processed successfully! Found {len(result['chunks'])} content chunks across {len(result['sections_detected'])} sections.",
        filename=file.filename or safe_filename,
        chunk_count=len(result["chunks"]),
        sections_detected=result["sections_detected"],
    )


@router.get("/status", response_model=CVStatusResponse)
async def get_cv_status():
    """Check if a CV has been uploaded and get its metadata."""
    status = vector_store.get_status()
    return CVStatusResponse(
        uploaded=status.get("uploaded", False),
        filename=status.get("filename", ""),
        chunk_count=status.get("chunk_count", 0),
        sections_detected=status.get("sections_detected", []),
    )


@router.delete("/clear")
async def clear_cv():
    """Clear the uploaded CV and all associated embeddings."""
    vector_store.clear()
    return {"success": True, "message": "CV data cleared successfully."}
