"""
CareerPilot — Chat Router
============================
AI Assistant chat endpoint with per-user message persistence.
Messages are stored in the database on every exchange.
Frontend retrieves chat history from the GET endpoint.
"""

import json
import logging
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.db_models import User, ChatMessage
from app.models.schemas import (
    ChatRequest, ChatResponse,
    ChatMessageResponse, ChatHistoryResponse,
)
from app.services import agent as agent_service
from app.services.auth_service import get_current_user

logger = logging.getLogger(__name__)


# Backend guard against the double-submit race. The frontend's `use-chat`
# hook already debounces Send, but a slow network + impatient user can
# still slip two requests through, producing duplicate DB rows.
_DUPLICATE_WINDOW_SECONDS = 10

router = APIRouter(prefix="/api/chat", tags=["Chat"])


@router.post("", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Send a message to the AI career assistant.

    Workflow:
    1. Save the user's message to the database
    2. Process through the AI agent (RAG, tools, etc.)
    3. Save the AI response to the database
    4. Return the response to the frontend

    Args:
        request: ChatRequest with message and conversation_id

    Returns:
        ChatResponse with AI response, sources cited, and optional fit score
    """
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    stripped_message = request.message.strip()

    cutoff = datetime.now(timezone.utc) - timedelta(seconds=_DUPLICATE_WINDOW_SECONDS)
    existing = (
        db.query(ChatMessage)
        .filter(
            ChatMessage.user_id == current_user.id,
            ChatMessage.conversation_id == request.conversation_id,
            ChatMessage.role == "user",
            ChatMessage.content == stripped_message,
            ChatMessage.created_at >= cutoff,
        )
        .order_by(ChatMessage.created_at.desc())
        .first()
    )
    if existing is not None:
        logger.info(
            f"Suppressing duplicate user message in conversation "
            f"{request.conversation_id!r} (matches id={existing.id} "
            f"from the last {_DUPLICATE_WINDOW_SECONDS}s)."
        )
        raise HTTPException(
            status_code=409,
            detail="This message was just submitted. Please wait a moment before sending it again.",
        )

    user_msg = ChatMessage(
        user_id=current_user.id,
        conversation_id=request.conversation_id,
        role="user",
        content=stripped_message,
        sources_json="[]",
    )
    db.add(user_msg)
    db.commit()

    try:
        # `db` is shared so the agent's DB-backed memory can read prior
        # turns and persist the new exchange.
        result = await agent_service.chat(
            message=request.message,
            conversation_id=f"{current_user.id}:{request.conversation_id}",
            user_id=current_user.id,
            db=db,
        )

        response_text = result["response"]
        sources = result.get("sources", [])

        ai_msg = ChatMessage(
            user_id=current_user.id,
            conversation_id=request.conversation_id,
            role="assistant",
            content=response_text,
            sources_json=json.dumps(sources),
        )
        db.add(ai_msg)
        db.commit()

        return ChatResponse(
            response=response_text,
            conversation_id=request.conversation_id,
            sources=sources,
        )

    except Exception as e:
        logger.error(f"Chat endpoint error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Chat processing failed: {str(e)}")


@router.get("/history/{conversation_id}", response_model=ChatHistoryResponse)
def get_chat_history(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retrieve chat history for the authenticated user's conversation.
    Called by the frontend on page load to restore chat messages.
    """
    messages = (
        db.query(ChatMessage)
        .filter(
            ChatMessage.user_id == current_user.id,
            ChatMessage.conversation_id == conversation_id,
        )
        .order_by(ChatMessage.created_at.asc())
        .all()
    )

    return ChatHistoryResponse(
        messages=[
            ChatMessageResponse(
                id=msg.id,
                role=msg.role,
                content=msg.content,
                sources=json.loads(msg.sources_json) if msg.sources_json else [],
                timestamp=msg.created_at,
            )
            for msg in messages
        ],
        conversation_id=conversation_id,
    )


@router.delete("/history/{conversation_id}")
def clear_chat_history(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Clear conversation history for the authenticated user's session."""
    # Conversation history now lives in the database, so a single delete
    # is the source of truth — no separate in-memory dict to clean up.
    db.query(ChatMessage).filter(
        ChatMessage.user_id == current_user.id,
        ChatMessage.conversation_id == conversation_id,
    ).delete()
    db.commit()

    # Also drop any cached agent executor for this session so the next
    # message builds a fresh one (and the next call won't rehydrate from
    # a stale executor that might still have an old memory wired in).
    if conversation_id in agent_service._agent_cache:
        del agent_service._agent_cache[conversation_id]

    return {"success": True, "message": f"Chat history cleared for session: {conversation_id}"}
