"""
CareerPilot — Chat Router
============================
AI Assistant chat endpoint with per-user message persistence.
Messages are stored in the database on every exchange.
Frontend retrieves chat history from the GET endpoint.
"""

import json
import logging
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

    # 1. Save user message to DB first
    user_msg = ChatMessage(
        user_id=current_user.id,
        conversation_id=request.conversation_id,
        role="user",
        content=request.message.strip(),
        sources_json="[]",
    )
    db.add(user_msg)
    db.commit()

    try:
        # 2. Process through AI agent (user-scoped memory key and CV context)
        result = await agent_service.chat(
            message=request.message,
            conversation_id=f"{current_user.id}:{request.conversation_id}",
            user_id=current_user.id,
        )

        response_text = result["response"]
        sources = result.get("sources", [])

        # 3. Save AI response to DB
        ai_msg = ChatMessage(
            user_id=current_user.id,
            conversation_id=request.conversation_id,
            role="assistant",
            content=response_text,
            sources_json=json.dumps(sources),
        )
        db.add(ai_msg)
        db.commit()

        # 4. Return to frontend
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
    # Clear from database
    db.query(ChatMessage).filter(
        ChatMessage.user_id == current_user.id,
        ChatMessage.conversation_id == conversation_id,
    ).delete()
    db.commit()

    # Clear from in-memory store
    memory_key = f"{current_user.id}:{conversation_id}"
    if memory_key in agent_service._memory_store:
        del agent_service._memory_store[memory_key]

    return {"success": True, "message": f"Chat history cleared for session: {conversation_id}"}
