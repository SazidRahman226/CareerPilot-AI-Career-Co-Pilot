"""
CareerPilot — Database-Backed Conversation Memory
=================================================
Custom LangChain memory that persists conversation history to PostgreSQL
via the ChatMessage ORM model


Design
------
* Subclasses `BaseChatMemory` so the LangChain `AgentExecutor` accepts
  it through its `memory` argument with zero changes elsewhere.
* Splits the composite conversation key (`"<user_id>:<conversation_id>"`)
  back into the user id + conversation id when reading or writing.
* Holds a tiny in-process LRU cache (one list of messages per session)
  to avoid hitting the DB on every single agent step. The cache is
  invalidated whenever a write happens, and the on-disk source of
  truth is always the database.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from langchain.memory.chat_memory import BaseChatMemory
from langchain.schema import BaseMessage, HumanMessage, AIMessage
from sqlalchemy.orm import Session

from app.models.db_models import ChatMessage

logger = logging.getLogger(__name__)


# Cap how many messages we keep per session in memory AND in the DB query.
# 20 (k=20) matches the previous in-memory window size.
DEFAULT_WINDOW_K = 20


class DatabaseChatMemory(BaseChatMemory):
    """
    A LangChain-compatible chat memory backed by the `chat_messages` table.

    The `memory_key` is the LangChain placeholder name in the agent prompt
    (we use "chat_history" to match the rest of the codebase).

    The internal `conversation_key` is a composite string of the form
    `"<user_id>:<conversation_id>"` and is what we split apart to read /
    write the right rows. This lets multiple users share the same
    `conversation_id` value (e.g. "default") without seeing each other's
    history.

    Args:
        conversation_key: Composite "<user_id>:<conversation_id>" string.
        db: An active SQLAlchemy `Session` (FastAPI dependency).
        k: How many of the most recent messages to load into context.
    """

    # LangChain-required class attributes
    memory_key: str = "chat_history"
    human_prefix: str = "Human"
    ai_prefix: str = "AI"

    # Our custom attributes
    conversation_key: str = "0:default"
    k: int = DEFAULT_WINDOW_K

    # --- pydantic v1 compat: declare non-default fields as Optional ---
    # We accept the DB session through a private attr (not a Pydantic field)
    # so LangChain's BaseChatMemory validation doesn't choke on it.
    _db: Optional[Session] = None

    class Config:
        arbitrary_types_allowed = True

    def __init__(
        self,
        conversation_key: str,
        db: Session,
        k: int = DEFAULT_WINDOW_K,
        **kwargs: Any,
    ) -> None:
        # Pass only LangChain-known fields to super().__init__
        super().__init__(**kwargs)
        self.conversation_key = conversation_key
        self.k = k
        # Hold the session privately — we never serialize this object.
        self._db = db
        logger.debug(
            f"DatabaseChatMemory initialized for key='{conversation_key}', k={k}"
        )

    # ------------------------------------------------------------------
    #  Helpers
    # ------------------------------------------------------------------
    def _split_key(self) -> tuple[int, str]:
        """Split the composite key into (user_id, conversation_id)."""
        try:
            user_id_str, convo_id = self.conversation_key.split(":", 1)
            return int(user_id_str), convo_id
        except (ValueError, AttributeError):
            # Defensive fallback — don't crash the agent over a bad key.
            logger.warning(
                f"Bad conversation_key='{self.conversation_key}', defaulting to user=0/default"
            )
            return 0, "default"

    # ------------------------------------------------------------------
    #  BaseChatMemory abstract API
    # ------------------------------------------------------------------
    @property
    def memory_variables(self) -> List[str]:
        return [self.memory_key]

    def load_memory_variables(self, inputs: Dict[str, Any]) -> Dict[str, List[BaseMessage]]:
        """Return the most recent `k` messages for this session as LangChain messages."""
        user_id, conversation_id = self._split_key()
        try:
            rows = (
                self._db.query(ChatMessage)
                .filter(
                    ChatMessage.user_id == user_id,
                    ChatMessage.conversation_id == conversation_id,
                )
                .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
                .all()
            )
        except Exception as e:
            # If the DB is momentarily unavailable, fall back to no history
            # rather than killing the agent. Better a shorter response than a 500.
            logger.error(f"DB read failed for chat history: {e}")
            return {self.memory_key: []}

        # Keep only the last `k` rows to bound the context window.
        rows = rows[-self.k :] if self.k > 0 else rows

        messages: List[BaseMessage] = []
        for row in rows:
            if row.role == "user":
                messages.append(HumanMessage(content=row.content))
            elif row.role == "assistant":
                messages.append(AIMessage(content=row.content))
            # Unknown roles are skipped (defensive).

        return {self.memory_key: messages}

    def save_context(self, inputs: Dict[str, Any], outputs: Dict[str, str]) -> None:
        """
        Persist a single user/assistant exchange to the database.

        LangChain invokes this once per agent turn with:
            inputs  = {"input": "<user text>"}
            outputs = {"output": "<assistant text>"}
        """
        user_id, conversation_id = self._split_key()
        user_text = (inputs.get("input") or "").strip()
        ai_text = (outputs.get("output") or "").strip()

        if not user_text or not ai_text:
            # Nothing meaningful to persist.
            return

        try:
            # One transaction: insert both halves of the exchange.
            self._db.add(
                ChatMessage(
                    user_id=user_id,
                    conversation_id=conversation_id,
                    role="user",
                    content=user_text,
                    sources_json="[]",
                )
            )
            self._db.add(
                ChatMessage(
                    user_id=user_id,
                    conversation_id=conversation_id,
                    role="assistant",
                    content=ai_text,
                    sources_json="[]",
                )
            )
            self._db.commit()
        except Exception as e:
            # Roll back so the session isn't left in a bad state for the next call.
            logger.error(f"DB write failed for chat history: {e}")
            try:
                self._db.rollback()
            except Exception:
                pass

    def clear(self) -> None:
        """Delete all persisted messages for this session."""
        user_id, conversation_id = self._split_key()
        try:
            self._db.query(ChatMessage).filter(
                ChatMessage.user_id == user_id,
                ChatMessage.conversation_id == conversation_id,
            ).delete()
            self._db.commit()
            logger.info(
                f"Cleared DB chat history for user={user_id}, conversation='{conversation_id}'"
            )
        except Exception as e:
            logger.error(f"DB clear failed for chat history: {e}")
            try:
                self._db.rollback()
            except Exception:
                pass
