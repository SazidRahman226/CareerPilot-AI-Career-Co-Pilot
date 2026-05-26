"""
CareerPilot — Tracker Router
================================
CRUD endpoints for the Kanban application tracker, to-do items,
activity feed, and dashboard statistics. All persisted in SQLite.
"""

import json
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.models.db_models import Application, Todo, Activity
from app.models.schemas import (
    ApplicationCreate, ApplicationUpdate, ApplicationResponse,
    TodoCreate, TodoUpdate, TodoResponse,
    ActivityResponse, DashboardStats,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/tracker", tags=["Tracker"])


# ============================
#  Helper: Log Activity
# ============================

def _log_activity(db: Session, activity_type: str, description: str, metadata: dict = {}):
    """Record an activity in the feed."""
    activity = Activity(
        activity_type=activity_type,
        description=description,
        metadata_json=json.dumps(metadata),
    )
    db.add(activity)
    db.commit()


# ============================
#  Application Endpoints
# ============================

@router.get("/applications", response_model=list[ApplicationResponse])
def list_applications(status: str = "", db: Session = Depends(get_db)):
    """List all applications, optionally filtered by status."""
    query = db.query(Application)
    if status:
        query = query.filter(Application.status == status)
    return query.order_by(Application.updated_at.desc()).all()


@router.post("/applications", response_model=ApplicationResponse)
def create_application(app_data: ApplicationCreate, db: Session = Depends(get_db)):
    """Add a new application to the tracker."""
    application = Application(**app_data.model_dump())
    db.add(application)
    db.commit()
    db.refresh(application)

    _log_activity(db, "application", f"Added {app_data.role} at {app_data.company}", {
        "application_id": application.id,
        "status": application.status,
    })

    return application


@router.put("/applications/{app_id}", response_model=ApplicationResponse)
def update_application(app_id: int, update_data: ApplicationUpdate, db: Session = Depends(get_db)):
    """Update an application (e.g., change status via Kanban drag)."""
    application = db.query(Application).filter(Application.id == app_id).first()
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
        _log_activity(db, "application", f"Moved {application.role} at {application.company}: {old_status} → {application.status}", {
            "application_id": application.id,
            "old_status": old_status,
            "new_status": application.status,
        })

    return application


@router.delete("/applications/{app_id}")
def delete_application(app_id: int, db: Session = Depends(get_db)):
    """Remove an application from the tracker."""
    application = db.query(Application).filter(Application.id == app_id).first()
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")

    _log_activity(db, "application", f"Removed {application.role} at {application.company}")

    db.delete(application)
    db.commit()
    return {"success": True, "message": "Application deleted"}


# ============================
#  Todo Endpoints
# ============================

@router.get("/todos", response_model=list[TodoResponse])
def list_todos(completed: bool = None, db: Session = Depends(get_db)):
    """List all to-do items, optionally filtered by completion status."""
    query = db.query(Todo)
    if completed is not None:
        query = query.filter(Todo.completed == completed)
    return query.order_by(Todo.created_at.desc()).all()


@router.post("/todos", response_model=TodoResponse)
def create_todo(todo_data: TodoCreate, db: Session = Depends(get_db)):
    """Create a new to-do item."""
    todo = Todo(**todo_data.model_dump())
    db.add(todo)
    db.commit()
    db.refresh(todo)

    _log_activity(db, "todo", f"Created task: {todo_data.title}")

    return todo


@router.put("/todos/{todo_id}", response_model=TodoResponse)
def update_todo(todo_id: int, update_data: TodoUpdate, db: Session = Depends(get_db)):
    """Update a to-do item (e.g., mark as complete)."""
    todo = db.query(Todo).filter(Todo.id == todo_id).first()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")

    update_dict = update_data.model_dump(exclude_unset=True)
    for field, value in update_dict.items():
        setattr(todo, field, value)

    db.commit()
    db.refresh(todo)

    if "completed" in update_dict:
        status = "completed" if todo.completed else "reopened"
        _log_activity(db, "todo", f"Task {status}: {todo.title}")

    return todo


@router.delete("/todos/{todo_id}")
def delete_todo(todo_id: int, db: Session = Depends(get_db)):
    """Delete a to-do item."""
    todo = db.query(Todo).filter(Todo.id == todo_id).first()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")

    db.delete(todo)
    db.commit()
    return {"success": True, "message": "Todo deleted"}


# ============================
#  Dashboard Stats & Activity
# ============================

@router.get("/stats", response_model=DashboardStats)
def get_dashboard_stats(db: Session = Depends(get_db)):
    """Get aggregated stats for the dashboard."""
    # Application counts by status
    total = db.query(Application).count()
    applied = db.query(Application).filter(Application.status == "applied").count()
    interviewing = db.query(Application).filter(Application.status == "interviewing").count()
    offers = db.query(Application).filter(Application.status == "offer").count()
    rejected = db.query(Application).filter(Application.status == "rejected").count()

    # Average fit score
    avg_score = db.query(func.avg(Application.fit_score)).filter(Application.fit_score > 0).scalar() or 0

    # Todo stats
    todos_total = db.query(Todo).count()
    todos_done = db.query(Todo).filter(Todo.completed == True).count()

    # Recent activity
    recent = db.query(Activity).order_by(Activity.created_at.desc()).limit(10).all()
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

    return DashboardStats(
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


@router.get("/activities", response_model=list[ActivityResponse])
def list_activities(limit: int = 20, db: Session = Depends(get_db)):
    """Get recent activity feed items."""
    activities = db.query(Activity).order_by(Activity.created_at.desc()).limit(limit).all()
    return activities
