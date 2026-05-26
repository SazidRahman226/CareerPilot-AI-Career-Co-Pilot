"""
CareerPilot — SQLAlchemy ORM Models
=====================================
Database models for the application tracker (Kanban), todos, and activity log.
All persisted in SQLite for the hackathon.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, Text
from sqlalchemy.sql import func
from app.database import Base


class Application(Base):
    """
    Represents a job application in the Kanban tracker.
    Status flows: wishlist → applied → interviewing → offer | rejected
    """
    __tablename__ = "applications"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    company = Column(String(200), nullable=False)
    role = Column(String(200), nullable=False)
    status = Column(String(50), default="wishlist")  # wishlist, applied, interviewing, offer, rejected
    url = Column(String(500), default="")
    location = Column(String(200), default="")
    salary = Column(String(100), default="")
    notes = Column(Text, default="")
    fit_score = Column(Float, default=0.0)
    applied_date = Column(String(50), default="")
    deadline = Column(String(50), default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Todo(Base):
    """
    A to-do item linked to career goals.
    Can be connected to a specific application or a general career task.
    """
    __tablename__ = "todos"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String(300), nullable=False)
    description = Column(Text, default="")
    completed = Column(Boolean, default=False)
    priority = Column(String(20), default="medium")  # low, medium, high
    due_date = Column(String(50), default="")
    category = Column(String(100), default="general")  # general, interview-prep, skill-building, networking
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Activity(Base):
    """
    Activity log entry for the dashboard feed.
    Records significant user actions and AI interactions.
    """
    __tablename__ = "activities"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    activity_type = Column(String(50), nullable=False)  # cv_upload, job_search, application, chat, todo
    description = Column(Text, nullable=False)
    metadata_json = Column(Text, default="{}")  # JSON string for extra data
    created_at = Column(DateTime(timezone=True), server_default=func.now())
