"""
CareerPilot — Jobs Router
============================
Job search endpoint that queries multiple sources and returns enriched results.
"""

import logging
from fastapi import APIRouter
from app.models.schemas import JobSearchRequest, JobSearchResponse, JobCard
from app.services import job_search

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/jobs", tags=["Jobs"])


@router.post("/search", response_model=JobSearchResponse)
async def search_jobs(request: JobSearchRequest):
    """
    Search for jobs using natural language.

    Queries two sources:
    1. SerpAPI Google Web Search (live web scraping)
    2. SerpAPI Google Jobs (structured listings)

    Falls back to mock data if no API keys are configured.
    Results are deduplicated and enriched with fit scores from the user's CV.
    """
    result = await job_search.search_jobs(
        query=request.query,
        location=request.location,
        limit=request.limit,
    )

    # Convert to response schema
    job_cards = []
    for job in result["jobs"]:
        job_cards.append(JobCard(
            id=job.get("id", ""),
            title=job.get("title", ""),
            company=job.get("company", ""),
            location=job.get("location", ""),
            salary_range=job.get("salary_range", ""),
            job_type=job.get("job_type", ""),
            deadline=job.get("deadline", ""),
            description=job.get("description", ""),
            requirements=job.get("requirements", []),
            url=job.get("url", ""),
            source=job.get("source", ""),
            fit_score=job.get("fit_score", 0),
            fit_breakdown=job.get("fit_breakdown", {}),
            match_reasons=job.get("match_reasons", []),
        ))

    return JobSearchResponse(
        jobs=job_cards,
        total_found=result["total_found"],
        query=result["query"],
        sources_used=result["sources_used"],
    )
