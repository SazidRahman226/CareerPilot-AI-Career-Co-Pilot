"""
CareerPilot — Job Search Service
===================================
Dual-source job search with deduplication:
1. SerpAPI Google Web Search — scrapes live job postings from the web
2. SerpAPI Google Jobs API — structured job listings

Falls back to mock data if no API keys are configured (for demo/hackathon).
Each result is enriched with a programmatic fit score.
"""

import hashlib
import httpx
import json
import logging
import uuid
from difflib import SequenceMatcher
from app.config import settings
from app.services import fit_score as fit_score_service
from app.services import vector_store

logger = logging.getLogger(__name__)


# ============================
#  Mock Job Data (Fallback)
# ============================
# Realistic mock data for demo when API keys aren't available

MOCK_JOBS = [
    {
        "title": "Machine Learning Engineer Intern",
        "company": "DataSoft AI",
        "location": "Dhaka, Bangladesh",
        "salary_range": "BDT 30,000 - 50,000/month",
        "job_type": "internship",
        "deadline": "2026-06-30",
        "description": "Join our ML team to build production-grade models for NLP and computer vision applications. Work with PyTorch, transformers, and cloud deployment.",
        "requirements": ["python", "pytorch", "machine learning", "deep learning", "nlp", "git"],
        "url": "https://example.com/jobs/ml-intern-datasoft",
    },
    {
        "title": "Full Stack Developer",
        "company": "TechVentures BD",
        "location": "Dhaka, Bangladesh",
        "salary_range": "BDT 60,000 - 100,000/month",
        "job_type": "full-time",
        "deadline": "2026-07-15",
        "description": "Build scalable web applications using React, Next.js, and Node.js. Experience with databases and cloud services required.",
        "requirements": ["javascript", "react", "next.js", "node.js", "postgresql", "aws", "git"],
        "url": "https://example.com/jobs/fullstack-techventures",
    },
    {
        "title": "Data Scientist",
        "company": "BracBank Digital",
        "location": "Dhaka, Bangladesh",
        "salary_range": "BDT 80,000 - 120,000/month",
        "job_type": "full-time",
        "deadline": "2026-07-01",
        "description": "Analyze large datasets to drive business insights. Build predictive models and dashboards for the digital banking team.",
        "requirements": ["python", "sql", "machine learning", "pandas", "data analysis", "statistics", "tableau"],
        "url": "https://example.com/jobs/ds-bracbank",
    },
    {
        "title": "AI Research Assistant",
        "company": "BUET AI Lab",
        "location": "Dhaka, Bangladesh",
        "salary_range": "BDT 25,000 - 40,000/month",
        "job_type": "part-time",
        "deadline": "2026-06-15",
        "description": "Assist in NLP and generative AI research projects. Implement and evaluate state-of-the-art models. Publish findings.",
        "requirements": ["python", "pytorch", "nlp", "transformers", "deep learning", "research", "huggingface"],
        "url": "https://example.com/jobs/ai-research-buet",
    },
    {
        "title": "Backend Engineer",
        "company": "Pathao",
        "location": "Dhaka, Bangladesh",
        "salary_range": "BDT 70,000 - 110,000/month",
        "job_type": "full-time",
        "deadline": "2026-07-20",
        "description": "Design and maintain high-throughput microservices for ride-sharing platform. Work with Go, PostgreSQL, and Kubernetes.",
        "requirements": ["go", "postgresql", "kubernetes", "docker", "microservices", "rest api", "redis"],
        "url": "https://example.com/jobs/backend-pathao",
    },
    {
        "title": "Frontend Developer (React)",
        "company": "Chaldal",
        "location": "Dhaka, Bangladesh",
        "salary_range": "BDT 50,000 - 80,000/month",
        "job_type": "full-time",
        "deadline": "2026-06-25",
        "description": "Build and optimize the e-commerce web frontend. Focus on performance, accessibility, and user experience.",
        "requirements": ["javascript", "typescript", "react", "css", "html", "redux", "testing"],
        "url": "https://example.com/jobs/frontend-chaldal",
    },
    {
        "title": "DevOps Engineer",
        "company": "Grameenphone IT",
        "location": "Dhaka, Bangladesh",
        "salary_range": "BDT 90,000 - 140,000/month",
        "job_type": "full-time",
        "deadline": "2026-07-10",
        "description": "Manage CI/CD pipelines, cloud infrastructure, and container orchestration for telecom applications.",
        "requirements": ["aws", "docker", "kubernetes", "terraform", "jenkins", "linux", "ci/cd", "ansible"],
        "url": "https://example.com/jobs/devops-gp",
    },
    {
        "title": "ML Intern — Computer Vision",
        "company": "Samsung R&D Bangladesh",
        "location": "Dhaka, Bangladesh",
        "salary_range": "BDT 35,000 - 55,000/month",
        "job_type": "internship",
        "deadline": "2026-06-20",
        "description": "Work on mobile camera AI features. Experience with computer vision, image processing, and model optimization required.",
        "requirements": ["python", "pytorch", "computer vision", "opencv", "deep learning", "tensorflow"],
        "url": "https://example.com/jobs/cv-intern-samsung",
    },
    {
        "title": "Software Engineer — Python",
        "company": "Optimizely",
        "location": "Remote (Bangladesh)",
        "salary_range": "$2,000 - $3,500/month",
        "job_type": "full-time",
        "deadline": "2026-07-30",
        "description": "Build experimentation and personalization platform features. Strong Python and distributed systems skills required.",
        "requirements": ["python", "django", "postgresql", "redis", "docker", "microservices", "testing", "agile"],
        "url": "https://example.com/jobs/swe-optimizely",
    },
    {
        "title": "NLP Engineer",
        "company": "Bangla AI",
        "location": "Dhaka, Bangladesh",
        "salary_range": "BDT 70,000 - 100,000/month",
        "job_type": "full-time",
        "deadline": "2026-07-05",
        "description": "Build Bangla language NLP models for text classification, sentiment analysis, and machine translation.",
        "requirements": ["python", "nlp", "transformers", "pytorch", "huggingface", "bert", "data analysis"],
        "url": "https://example.com/jobs/nlp-banglaai",
    },
    {
        "title": "Product Manager — AI Products",
        "company": "ShopUp",
        "location": "Dhaka, Bangladesh",
        "salary_range": "BDT 100,000 - 150,000/month",
        "job_type": "full-time",
        "deadline": "2026-07-12",
        "description": "Lead AI-powered product development for B2B e-commerce. Requires strong technical background and stakeholder management.",
        "requirements": ["product management", "agile", "data analysis", "machine learning", "leadership", "stakeholder management"],
        "url": "https://example.com/jobs/pm-shopup",
    },
    {
        "title": "Cloud Solutions Architect",
        "company": "Brain Station 23",
        "location": "Dhaka, Bangladesh",
        "salary_range": "BDT 120,000 - 180,000/month",
        "job_type": "full-time",
        "deadline": "2026-07-25",
        "description": "Design and implement cloud-native architectures for enterprise clients. Multi-cloud expertise needed.",
        "requirements": ["aws", "azure", "gcp", "docker", "kubernetes", "terraform", "system design", "microservices"],
        "url": "https://example.com/jobs/architect-bs23",
    },
]


async def search_serpapi_web(query: str, limit: int = 10) -> list[dict]:
    """
    Search for job postings using Serper.dev Google Search API.
    Scrapes live web results for job-related queries.
    
    Serper.dev requires:
    - POST method
    - API key in X-API-KEY header
    - JSON body with query
    """
    if not settings.SERPAPI_API_KEY:
        logger.info("Serper API key not configured, skipping web search")
        return []

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                "https://google.serper.dev/search",
                headers={
                    "X-API-KEY": settings.SERPAPI_API_KEY,
                    "Content-Type": "application/json",
                },
                json={"q": f"{query} jobs", "num": limit},
            )
            response.raise_for_status()
            data = response.json()

        jobs = []
        results_list = data.get("organic", data.get("organic_results", []))
        for result in results_list[:limit]:
            jobs.append({
                "title": result.get("title", ""),
                "company": _extract_company_from_snippet(result.get("snippet", "")),
                "location": "",
                "salary_range": "",
                "job_type": "",
                "deadline": "",
                "description": result.get("snippet", ""),
                "requirements": [],
                "url": result.get("link", ""),
                "source": "serper_web",
            })

        logger.info(f"Serper.dev web search returned {len(jobs)} results")
        return jobs

    except httpx.HTTPStatusError as e:
        logger.warning(f"Serper.dev API error (HTTP {e.response.status_code}): {e.response.text[:200]}")
        return []
    except Exception as e:
        logger.warning(f"Serper.dev web search failed: {e}")
        return []

def _extract_company_from_snippet(snippet: str) -> str:
    """Try to extract a company name from a search snippet."""
    # Simple heuristic: company names often appear before " - " or " | "
    for sep in [" - ", " | ", " · "]:
        if sep in snippet:
            return snippet.split(sep)[0].strip()[:50]
    return "Unknown Company"


def _extract_requirements_from_desc(description: str) -> list[str]:
    """Extract skill-like requirements from a job description."""
    from app.services.fit_score import extract_skills
    skills = extract_skills(description)
    return sorted(skills)[:10]  # Return top 10 skills found


def _generate_job_id(title: str, company: str, source: str) -> str:
    """Generate a deterministic ID for deduplication."""
    key = f"{title.lower().strip()}|{company.lower().strip()}"
    return hashlib.md5(key.encode()).hexdigest()[:12]


def _is_duplicate(job_a: dict, job_b: dict, threshold: float = 0.75) -> bool:
    """
    Check if two jobs are duplicates using fuzzy matching.
    Compares title + company similarity.
    """
    title_sim = SequenceMatcher(None, job_a["title"].lower(), job_b["title"].lower()).ratio()
    company_sim = SequenceMatcher(None, job_a["company"].lower(), job_b["company"].lower()).ratio()
    # Weighted: title matters more
    combined = 0.6 * title_sim + 0.4 * company_sim
    return combined >= threshold


def deduplicate_jobs(all_jobs: list[dict]) -> list[dict]:
    """
    Remove duplicate jobs across all sources.
    Uses fuzzy matching on title + company name.
    Prefers structured sources (serpapi_jobs > serpapi_web).
    """
    source_priority = {"serper_jobs": 0, "serper_web": 1, "mock": 2}

    # Sort by source priority (prefer structured data)
    sorted_jobs = sorted(all_jobs, key=lambda j: source_priority.get(j.get("source", "mock"), 99))

    unique_jobs = []
    for job in sorted_jobs:
        is_dup = False
        for existing in unique_jobs:
            if _is_duplicate(job, existing):
                is_dup = True
                break
        if not is_dup:
            unique_jobs.append(job)

    return unique_jobs


def _filter_by_query(jobs: list[dict], query: str) -> list[dict]:
    """Filter mock jobs by relevance to the search query."""
    query_lower = query.lower()
    query_words = set(query_lower.split())

    scored = []
    for job in jobs:
        searchable = f"{job['title']} {job['company']} {job['location']} {job['description']} {' '.join(job.get('requirements', []))}".lower()
        # Simple relevance: count matching words
        score = sum(1 for word in query_words if word in searchable)
        if score > 0:
            scored.append((score, job))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [job for _, job in scored]


async def search_jobs(query: str, location: str = "", limit: int = 10, user_id: int = 0) -> dict:
    """
    Main job search function. Queries all three sources, deduplicates,
    enriches with fit scores, and returns structured results.

    Falls back to mock data if no API keys are configured.
    """
    all_jobs = []
    sources_used = []
    
    web_results = await search_serpapi_web(query, limit)
    if web_results:
        all_jobs.extend(web_results)
        sources_used.append("serper_web")

    # --- Fallback: Mock Data ---
    if not all_jobs:
        logger.info("No API results, falling back to mock data")
        filtered_mocks = _filter_by_query(MOCK_JOBS, query)
        if not filtered_mocks:
            filtered_mocks = MOCK_JOBS  # Show all if no relevance match
        all_jobs = [dict(j, source="mock") for j in filtered_mocks]
        sources_used.append("mock")

    # --- Deduplicate across sources ---
    unique_jobs = deduplicate_jobs(all_jobs)

    # --- Enrich with fit scores ---
    cv_text = vector_store.get_full_text(user_id) if user_id else ""
    enriched_jobs = []

    for job in unique_jobs[:limit]:
        job_desc = f"{job['title']} at {job['company']}. {job['description']}. Requirements: {', '.join(job.get('requirements', []))}"

        if cv_text:
            score_result = fit_score_service.compute_fit_score(cv_text, job_desc)
            job["fit_score"] = score_result["score"]
            job["fit_breakdown"] = score_result["breakdown"]
            job["match_reasons"] = score_result["match_reasons"]
        else:
            job["fit_score"] = 0
            job["fit_breakdown"] = {}
            job["match_reasons"] = ["Upload your CV to see fit score"]

        job["id"] = _generate_job_id(job["title"], job["company"], job.get("source", ""))
        enriched_jobs.append(job)

    # Sort by fit score (highest first)
    enriched_jobs.sort(key=lambda x: x.get("fit_score", 0), reverse=True)

    return {
        "jobs": enriched_jobs,
        "total_found": len(enriched_jobs),
        "query": query,
        "sources_used": sources_used,
    }
