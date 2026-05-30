"""
CareerPilot — CV Builder Router
===================================
Endpoints to generate downloadable PDF and DOCX CVs
from structured form input.
"""

import logging
from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app.models.db_models import User
from app.models.schemas import CVBuilderRequest
from app.services import cv_generator
from app.services.auth_service import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/cv-builder", tags=["CV Builder"])


@router.post("/generate-pdf")
async def generate_pdf(
    data: CVBuilderRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Generate a professionally styled PDF CV from the form data.
    Returns the PDF as a downloadable file.
    """
    pdf_bytes = cv_generator.generate_pdf(data)
    filename = f"{data.personal_info.full_name or 'CV'}_Resume.pdf".replace(" ", "_")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.post("/generate-docx")
async def generate_docx(
    data: CVBuilderRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Generate a professionally styled DOCX CV from the form data.
    Returns the DOCX as a downloadable file.
    """
    docx_bytes = cv_generator.generate_docx(data)
    filename = f"{data.personal_info.full_name or 'CV'}_Resume.docx".replace(" ", "_")

    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )
