"""
CareerPilot — Pydantic Schemas
================================
Request/response models for all API endpoints.
Provides validation, serialization, and documentation.
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


# =====================
#  CV / Profile Schemas
# =====================

class CVStatusResponse(BaseModel):
    """Response for CV upload status check."""
    uploaded: bool = False
    filename: str = ""
    chunk_count: int = 0
    sections_detected: list[str] = []
    upload_timestamp: str = ""


class CVUploadResponse(BaseModel):
    """Response after successful CV upload and processing."""
    success: bool
    message: str
    filename: str
    chunk_count: int
    sections_detected: list[str]


# =====================
#  Chat Schemas
# =====================

class ChatRequest(BaseModel):
    """Incoming chat message from the user."""
    message: str = Field(..., min_length=1, max_length=5000)
    conversation_id: str = Field(default="default")


class ChatResponse(BaseModel):
    """AI assistant response."""
    response: str
    conversation_id: str
    sources: list[str] = []  # CV sections referenced
    fit_score: Optional[dict] = None  # If a fit score was computed


# =====================
#  Job Search Schemas
# =====================

class JobSearchRequest(BaseModel):
    """Natural language job search query."""
    query: str = Field(..., min_length=1, max_length=500)
    location: str = ""
    limit: int = Field(default=10, ge=1, le=50)


class JobCard(BaseModel):
    """Structured job listing card."""
    id: str
    title: str
    company: str
    location: str
    salary_range: str = ""
    job_type: str = ""  # full-time, part-time, internship, contract
    deadline: str = ""
    description: str
    requirements: list[str] = []
    url: str = ""
    source: str = ""  # serpapi_web, serpapi_jobs, adzuna, mock
    fit_score: float = 0.0
    fit_breakdown: dict = {}
    match_reasons: list[str] = []


class JobSearchResponse(BaseModel):
    """Response containing job search results."""
    jobs: list[JobCard]
    total_found: int
    query: str
    sources_used: list[str] = []


# =====================
#  Tracker Schemas
# =====================

class ApplicationCreate(BaseModel):
    """Create a new application in the tracker."""
    company: str = Field(..., min_length=1)
    role: str = Field(..., min_length=1)
    status: str = Field(default="wishlist")
    url: str = ""
    location: str = ""
    salary: str = ""
    notes: str = ""
    fit_score: float = 0.0
    applied_date: str = ""
    deadline: str = ""


class ApplicationUpdate(BaseModel):
    """Update an existing application."""
    company: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None
    url: Optional[str] = None
    location: Optional[str] = None
    salary: Optional[str] = None
    notes: Optional[str] = None
    fit_score: Optional[float] = None
    applied_date: Optional[str] = None
    deadline: Optional[str] = None


class ApplicationResponse(BaseModel):
    """Application response model."""
    id: int
    company: str
    role: str
    status: str
    url: str
    location: str
    salary: str
    notes: str
    fit_score: float
    applied_date: str
    deadline: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TodoCreate(BaseModel):
    """Create a new to-do item."""
    title: str = Field(..., min_length=1)
    description: str = ""
    priority: str = "medium"
    due_date: str = ""
    category: str = "general"


class TodoUpdate(BaseModel):
    """Update a to-do item."""
    title: Optional[str] = None
    description: Optional[str] = None
    completed: Optional[bool] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None
    category: Optional[str] = None


class TodoResponse(BaseModel):
    """To-do response model."""
    id: int
    title: str
    description: str
    completed: bool
    priority: str
    due_date: str
    category: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ActivityResponse(BaseModel):
    """Activity feed item."""
    id: int
    activity_type: str
    description: str
    metadata_json: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# =====================
#  Dashboard Stats
# =====================

class DashboardStats(BaseModel):
    """Aggregated stats for the dashboard."""
    total_applications: int = 0
    applied_count: int = 0
    interviewing_count: int = 0
    offers_count: int = 0
    rejected_count: int = 0
    avg_fit_score: float = 0.0
    todos_completed: int = 0
    todos_total: int = 0
    recent_activities: list[ActivityResponse] = []
