"""
CareerPilot — SQLAlchemy ORM Models
=====================================
Database models for users, chat messages, user profiles,
application tracker (Kanban), todos, and activity log.
All persisted in PostgreSQL with per-user scoping.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, Text, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class User(Base):
    """
    Registered user. Every other model references this via user_id FK.
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    email = Column(String(300), unique=True, nullable=False, index=True)
    hashed_password = Column(String(500), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    chat_messages = relationship("ChatMessage", back_populates="user", cascade="all, delete-orphan")
    profile = relationship("UserProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    applications = relationship("Application", back_populates="user", cascade="all, delete-orphan")
    todos = relationship("Todo", back_populates="user", cascade="all, delete-orphan")
    activities = relationship("Activity", back_populates="user", cascade="all, delete-orphan")


class ChatMessage(Base):
    """
    A single chat message (user or assistant) persisted in the database.
    Scoped to a user and conversation_id.
    """
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    conversation_id = Column(String(100), default="default", index=True)
    role = Column(String(20), nullable=False)  # "user" or "assistant"
    content = Column(Text, nullable=False)
    sources_json = Column(Text, default="[]")  # JSON array of source section names
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="chat_messages")


class UserProfile(Base):
    """
    User's CV metadata. One profile per user.
    The actual CV file is stored on disk; this tracks metadata.
    """
    __tablename__ = "user_profiles"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    cv_filename = Column(String(500), default="")
    cv_sections_json = Column(Text, default="[]")  # JSON array of detected section names
    cv_chunk_count = Column(Integer, default=0)
    cv_uploaded_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="profile")


class Application(Base):
    """
    Represents a job application in the Kanban tracker.
    Status flows: wishlist → applied → interviewing → offer | rejected
    Scoped to a user.
    """
    __tablename__ = "applications"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
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

    user = relationship("User", back_populates="applications")


class Todo(Base):
    """
    A to-do item linked to career goals.
    Can be connected to a specific application or a general career task.
    Scoped to a user.
    """
    __tablename__ = "todos"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(300), nullable=False)
    description = Column(Text, default="")
    completed = Column(Boolean, default=False)
    priority = Column(String(20), default="medium")  # low, medium, high
    due_date = Column(String(50), default="")
    category = Column(String(100), default="general")  # general, interview-prep, skill-building, networking
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="todos")


class Activity(Base):
    """
    Activity log entry for the dashboard feed.
    Records significant user actions and AI interactions.
    Scoped to a user.
    """
    __tablename__ = "activities"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    activity_type = Column(String(50), nullable=False)  # cv_upload, job_search, application, chat, todo
    description = Column(Text, nullable=False)
    metadata_json = Column(Text, default="{}")  # JSON string for extra data
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="activities")
