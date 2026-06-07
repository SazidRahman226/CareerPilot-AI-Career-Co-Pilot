"""
CareerPilot — Tracker Router
================================
CRUD endpoints for the Kanban application tracker, to-do items,
activity feed, and dashboard statistics. All persisted in PostgreSQL.
All endpoints are user-scoped via JWT authentication.
"""

import json
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models.db_models import User, Application, Todo, Activity
from app.models.schemas import (
    ApplicationCreate, ApplicationUpdate, ApplicationResponse,
    TodoCreate, TodoUpdate, TodoResponse,
    ActivityResponse, DashboardStats,
)
from app.services.auth_service import get_current_user
from app.services.cache import cache_delete_exact, cache_get, cache_set

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/tracker", tags=["Tracker"])


# ============================
#  Helper: Log Activity
# ============================

def _log_activity(db: Session, user_id: int, activity_type: str, description: str, metadata: dict = {}):
    """Record an activity in the feed for a specific user."""
    activity = Activity(
        user_id=user_id,
        activity_type=activity_type,
        description=description,
        metadata_json=json.dumps(metadata),
    )
    db.add(activity)
    db.commit()

    # Invalidate dashboard stats cache (activity feed changed)
    cache_delete_exact(f"dash_stats:{user_id}")


# ============================
#  Application Endpoints
# ============================

@router.get("/applications", response_model=list[ApplicationResponse])
def list_applications(
    status: str = "",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all applications for the authenticated user, optionally filtered by status."""
    query = db.query(Application).filter(Application.user_id == current_user.id)
    if status:
        query = query.filter(Application.status == status)
    return query.order_by(Application.updated_at.desc()).all()


@router.post("/applications", response_model=ApplicationResponse)
def create_application(
    app_data: ApplicationCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a new application to the tracker for the authenticated user."""
    application = Application(user_id=current_user.id, **app_data.model_dump())
    db.add(application)
    db.commit()
    db.refresh(application)

    _log_activity(db, current_user.id, "application", f"Added {app_data.role} at {app_data.company}", {
        "application_id": application.id,
        "status": application.status,
    })

    return application


@router.put("/applications/{app_id}", response_model=ApplicationResponse)
def update_application(
    app_id: int,
    update_data: ApplicationUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update an application (e.g., change status via Kanban drag)."""
    application = db.query(Application).filter(
        Application.id == app_id,
        Application.user_id == current_user.id,
    ).first()
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")

    update_dict = update_data.model_dump(exclude_unset=True)
    old_status = application.status

    for field, value in update_dict.items():
        setattr(application, field, value)

    db.commit()
    db.refresh(application)

    # Log status changes
    if "status" in update_dict and update_dict["status"] != old_status:
        _log_activity(db, current_user.id, "application", f"Moved {application.role} at {application.company}: {old_status} → {application.status}", {
            "application_id": application.id,
            "old_status": old_status,
            "new_status": application.status,
        })

    return application


@router.delete("/applications/{app_id}")
def delete_application(
    app_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove an application from the tracker."""
    application = db.query(Application).filter(
        Application.id == app_id,
        Application.user_id == current_user.id,
    ).first()
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")

    _log_activity(db, current_user.id, "application", f"Removed {application.role} at {application.company}")

    db.delete(application)
    db.commit()
    return {"success": True, "message": "Application deleted"}


# ============================
#  Todo Endpoints
# ============================

@router.get("/todos", response_model=list[TodoResponse])
def list_todos(
    completed: bool = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all to-do items for the authenticated user, optionally filtered by completion status."""
    query = db.query(Todo).filter(Todo.user_id == current_user.id)
    if completed is not None:
        query = query.filter(Todo.completed == completed)
    return query.order_by(Todo.created_at.desc()).all()


@router.post("/todos", response_model=TodoResponse)
def create_todo(
    todo_data: TodoCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new to-do item for the authenticated user."""
    todo = Todo(user_id=current_user.id, **todo_data.model_dump())
    db.add(todo)
    db.commit()
    db.refresh(todo)

    _log_activity(db, current_user.id, "todo", f"Created task: {todo_data.title}")

    return todo


@router.put("/todos/{todo_id}", response_model=TodoResponse)
def update_todo(
    todo_id: int,
    update_data: TodoUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a to-do item (e.g., mark as complete)."""
    todo = db.query(Todo).filter(
        Todo.id == todo_id,
        Todo.user_id == current_user.id,
    ).first()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")

    update_dict = update_data.model_dump(exclude_unset=True)
    for field, value in update_dict.items():
        setattr(todo, field, value)

    db.commit()
    db.refresh(todo)

    if "completed" in update_dict:
        status = "completed" if todo.completed else "reopened"
        _log_activity(db, current_user.id, "todo", f"Task {status}: {todo.title}")

    return todo


@router.delete("/todos/{todo_id}")
def delete_todo(
    todo_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a to-do item."""
    todo = db.query(Todo).filter(
        Todo.id == todo_id,
        Todo.user_id == current_user.id,
    ).first()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")

    db.delete(todo)
    db.commit()
    return {"success": True, "message": "Todo deleted"}


# ============================
#  Dashboard Stats & Activity
# ============================

@router.get("/stats", response_model=DashboardStats)
def get_dashboard_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get aggregated stats for the authenticated user's dashboard."""

    cache_key = f"dash_stats:{current_user.id}"
    cached = cache_get(cache_key)
    if cached is not None:
        return DashboardStats(**cached)

    # Application counts by status (user-scoped)
    base_query = db.query(Application).filter(Application.user_id == current_user.id)
    total = base_query.count()
    applied = base_query.filter(Application.status == "applied").count()
    interviewing = base_query.filter(Application.status == "interviewing").count()
    offers = base_query.filter(Application.status == "offer").count()
    rejected = base_query.filter(Application.status == "rejected").count()

    # Average fit score (user-scoped)
    avg_score = db.query(func.avg(Application.fit_score)).filter(
        Application.user_id == current_user.id,
        Application.fit_score > 0,
    ).scalar() or 0

    # Todo stats (user-scoped)
    todos_total = db.query(Todo).filter(Todo.user_id == current_user.id).count()
    todos_done = db.query(Todo).filter(
        Todo.user_id == current_user.id,
        Todo.completed == True,
    ).count()

    # Recent activity (user-scoped)
    recent = db.query(Activity).filter(
        Activity.user_id == current_user.id,
    ).order_by(Activity.created_at.desc()).limit(10).all()

    recent_activities = [
        ActivityResponse(
            id=a.id,
            activity_type=a.activity_type,
            description=a.description,
            metadata_json=a.metadata_json,
            created_at=a.created_at,
        )
        for a in recent
    ]

    result = DashboardStats(
        total_applications=total,
        applied_count=applied,
        interviewing_count=interviewing,
        offers_count=offers,
        rejected_count=rejected,
        avg_fit_score=round(avg_score, 1),
        todos_completed=todos_done,
        todos_total=todos_total,
        recent_activities=recent_activities,
    )
    cache_set(cache_key, result.model_dump(mode="json"))
    return result


@router.get("/activities", response_model=list[ActivityResponse])
def list_activities(
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get recent activity feed items for the authenticated user."""
    activities = db.query(Activity).filter(
        Activity.user_id == current_user.id,
    ).order_by(Activity.created_at.desc()).limit(limit).all()
    return activities
