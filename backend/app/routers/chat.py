"""
CareerPilot — Chat Router
============================
AI Assistant chat endpoint with streaming support.
Processes messages through the LangChain agent with RAG context.
"""

import logging
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from app.models.schemas import ChatRequest, ChatResponse
from app.services import agent as agent_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["Chat"])


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Send a message to the AI career assistant.

    The agent will:
    1. Retrieve relevant CV context via RAG
    2. Use tools (fit score, job search) as needed
    3. Generate a grounded response with memory of past conversation

    Args:
        request: ChatRequest with message and conversation_id

    Returns:
        ChatResponse with AI response, sources cited, and optional fit score
    """
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    try:
        result = await agent_service.chat(
            message=request.message,
            conversation_id=request.conversation_id,
        )

        return ChatResponse(
            response=result["response"],
            conversation_id=result["conversation_id"],
            sources=result.get("sources", []),
        )

    except Exception as e:
        logger.error(f"Chat endpoint error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Chat processing failed: {str(e)}")


@router.delete("/history/{conversation_id}")
async def clear_chat_history(conversation_id: str):
    """Clear conversation history for a specific session."""
    if conversation_id in agent_service._memory_store:
        del agent_service._memory_store[conversation_id]
    return {"success": True, "message": f"Chat history cleared for session: {conversation_id}"}
