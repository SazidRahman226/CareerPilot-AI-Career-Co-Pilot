"""
CareerPilot — AI Agent Service (Optimized for Speed)
======================================================
Two-tier response system for fast, responsive chat:

FAST PATH (~3-8 seconds):
  Direct LLM call for simple/conversational messages.
  No agent framework, no tool overhead.

AGENT PATH (~10-25 seconds):
  Full LangChain agent with tools for career-specific queries.
  Used only when CV retrieval, fit scoring, or job search is needed.

Optimizations:
  - Singleton LLM instance (no recreation per request)
  - Cached agent executors per conversation
  - Smart routing to skip agent for simple messages
  - Reduced max_iterations (3 instead of 5)
  - System prompt doesn't force CV retrieval on every message
"""

import json
import logging
import re
from typing import Optional

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.tools import tool
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import SystemMessage, HumanMessage
from sqlalchemy.orm import Session
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log,
)
from google.api_core.exceptions import ResourceExhausted

from app.config import settings
from app.services import vector_store
from app.services import fit_score as fit_score_service
from app.services import job_search as job_search_service
from app.services.db_memory import DatabaseChatMemory
import asyncio
from app.services.cache import cache_get, cache_set, make_hash

logger = logging.getLogger(__name__)


# ============================
#  429 Rate-Limit Retry Decorator
# ============================
# The Google free tier is rate-limited (5 RPM on gemini-2.5-flash, 15 RPM on
# gemini-2.5-flash-lite). A tool-calling agent turn can fire several
# generate_content calls back-to-back, which exhausts the per-minute window.
#
# `ChatGoogleGenerativeAI` accepts a `max_retries` kwarg but its built-in
# retry uses fixed delays and doesn't back off long enough to clear a
# per-minute window. Worse, in langchain-google-genai 2.1.4 the more
# expressive `retry_initial_delay` / `retry_max_delay` / `retry_multiplier`
# kwargs are *silently* moved into `model_kwargs` and have no effect
# (the client logs a warning to that effect). So we wrap the call sites
# with a proper tenacity decorator that:
#   - retries only on ResourceExhausted (429) — not on other errors
#   - backs off exponentially (5s, 10s, 20s, 40s) up to 60s
#   - caps at 4 attempts (so worst-case wall time is ~75s, well under the
#     FastAPI request timeout of 120s)
#   - logs each retry so we can see when the rate limit is biting
_retry_on_429 = retry(
    retry=retry_if_exception_type(ResourceExhausted),
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=2, min=5, max=60),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)


# ============================
#  Retry-wrapped LLM call sites
# ============================
# Stand-alone functions (not methods) so tenacity's decorator stack can
# wrap them cleanly. The decorators are applied here at module-import
# time, so the wrapped versions are what `chat()` and `_direct_chat()`
# call. This keeps the call sites short and keeps all retry policy in
# one place.

@_retry_on_429
def llm_invoke_with_retry(llm, messages):
    """Invoke a ChatGoogleGenerativeAI instance, retrying on 429."""
    return llm.invoke(messages)


@_retry_on_429
def agent_invoke_with_retry(agent, payload):
    """Invoke an AgentExecutor, retrying on 429.

    NOTE: the agent executor is stateful (it has a memory + cached
    intermediate steps), so retrying it will replay the *whole* agent
    loop from scratch. That's a feature, not a bug, here: if a single
    generate_content call inside the loop hits a 429, the whole loop
    gets a fresh per-minute budget on the next attempt. The cost is
    wasted tool calls (CV re-retrieval etc.), but the CV read is cheap
    (~1s) and the alternative is failing the user's request.
    """
    return agent.invoke(payload)

# ============================
#  Singleton LLM Instance
# ============================
# Created once on first use, reused for all subsequent requests.
# Previously a new instance was built on every single chat message.
_llm: Optional[ChatGoogleGenerativeAI] = None


def _get_llm() -> ChatGoogleGenerativeAI:
    """Get or create a cached LLM instance (singleton)."""
    global _llm
    if _llm is None:
        # NOTE on retry strategy: langchain-google-genai 2.1.4 silently
        # moves `retry_initial_delay` / `retry_max_delay` / `retry_multiplier`
        # into `model_kwargs` (and logs a warning) — they don't actually
        # configure the client. We keep the client's `max_retries=1` as a
        # last-ditch safety net and do the real exponential backoff in the
        # `_retry_on_429` decorator applied to the call sites.
        _llm = ChatGoogleGenerativeAI(
            model=settings.LLM_MODEL,
            google_api_key=settings.GOOGLE_API_KEY,
            temperature=0.7,
            timeout=60,
            max_retries=1,
        )
        logger.info(f"LLM singleton initialized: {settings.LLM_MODEL}")
    return _llm


# ============================
#  Conversation Memory (DB-backed)
# ============================
# The previous in-memory dict has been replaced by `DatabaseChatMemory`,
# which reads from / writes to the `chat_messages` table in PostgreSQL.
# This survives backend restarts, is shared across replicas, and is
# auditable from SQL. The `_get_memory` helper still exists so the rest
# of this module's call sites don't need to change — it now requires a
# `db` session and threads it into the memory instance.
#
# We still keep a tiny per-process cache of *agent executors* (line ~330)
# because building a LangChain agent is expensive; only the conversation
# history itself is now persisted.

_MEMORY_WINDOW_K = 20


def _get_memory(conversation_id: str, db: Session) -> DatabaseChatMemory:
    """
    Build a database-backed chat memory for the given session key.

    Note: we create a fresh `DatabaseChatMemory` per call instead of
    caching it. The memory object holds a live SQLAlchemy `Session`,
    which is request-scoped in FastAPI — caching it across requests
    would cause "this Session is closed" errors and cross-request data
    leakage. Building it is cheap (it just wraps a Session).
    """
    return DatabaseChatMemory(
        conversation_key=conversation_id,
        db=db,
        k=_MEMORY_WINDOW_K,
        memory_key="chat_history",
        return_messages=True,
    )


# ============================
#  Smart Message Routing
# ============================
# Determines whether a message needs the full agent (with tools)
# or can be answered directly by a fast LLM call.

_SIMPLE_PATTERNS = [
    # Greetings
    r'^(hi|hello|hey|greetings|good\s*(morning|afternoon|evening)|assalamu?\s*alaikum|salam)[\s!.,?]*$',
    # Thanks
    r'^(thanks?|thank\s*you|thx|ty|appreciate\s*it)[\s!.,?]*$',
    # Identity questions
    r'^(who\s+are\s+you|what\s+can\s+you\s+do|how\s+are\s+you|what\'?s?\s+your\s+name)[\s!.,?]*$',
    # Farewells
    r'^(bye|goodbye|see\s+you|later|take\s+care|good\s*night)[\s!.,?]*$',
    # Acknowledgments
    r'^(ok|okay|sure|got\s+it|understood|alright|cool|nice|great|awesome|perfect)[\s!.,?]*$',
    # Yes/No
    r'^(yes|no|yeah|yep|nope|nah)[\s!.,?]*$',
]

_TOOL_KEYWORDS = [
    'cv', 'resume', 'job', 'career', 'skill', 'experience',
    'fit score', 'score', 'search jobs', 'find jobs', 'apply',
    'interview', 'cover letter', 'salary', 'company', 'position',
    'role', 'internship', 'qualification', 'requirement', 'upload',
    'analyze', 'improve', 'suggest', 'recommend', 'compare',
    'gap', 'roadmap', 'learning path', 'portfolio', 'project',
    'strength', 'weakness', 'prepare', 'ready for', 'hired',
]


def _needs_agent(message: str) -> bool:
    """
    Determine if a message needs the full agent with tools,
    or can be handled with a fast direct LLM call.

    Returns True  → agent path (tools available, slower)
    Returns False → fast path  (direct LLM, much faster)
    """
    msg_lower = message.strip().lower()

    # Short simple messages → fast path
    for pattern in _SIMPLE_PATTERNS:
        if re.match(pattern, msg_lower, re.IGNORECASE):
            return False

    # Career/tool-related keywords → agent path
    for keyword in _TOOL_KEYWORDS:
        if keyword in msg_lower:
            return True

    # Short messages without tool keywords → fast path
    if len(msg_lower.split()) < 12:
        return False

    # Default: use agent for longer, ambiguous messages
    return True


# ============================
#  Fast Path: Direct LLM Call
# ============================

_DIRECT_SYSTEM_PROMPT = """You are CareerPilot AI — a friendly career co-pilot that helps users navigate their job search.

You're having a casual conversation. Respond naturally and concisely.
- For greetings: respond warmly, briefly mention you can help with CV analysis, job search, fit scoring, and career advice.
- For simple questions: give brief, helpful answers.
- If the user seems to want career help: encourage them to ask specific questions about their CV, jobs, or skills.
- Keep responses concise — 2-4 sentences for simple messages.

TONE: Professional yet friendly, like a senior mentor who genuinely cares."""


# Used to short-circuit CV-dependent questions on the fast path (no tool access).
# The agent path is steered by the CV-status block in its system prompt.
_CV_DEPENDENT_PATTERNS = (
    r"\bmy\s+cv\b",
    r"\bmy\s+resume\b",
    r"\bmy\s+profile\b",
    r"\bmy\s+skills?\b",
    r"\bmy\s+experience\b",
    r"\bmy\s+background\b",
    r"\bmy\s+education\b",
    r"\bmy\s+projects?\b",
    r"\bbased\s+on\s+my\b",
    r"\bwhat\s+jobs?\s+fit\s+me\b",
    r"\bam\s+i\s+(a\s+)?(good\s+)?fit\b",
    r"\bready\s+for\s+(this|that|the)\s+role\b",
    r"\bevaluate\s+my\b",
    r"\banalyze\s+my\b",
    r"\bimprove\s+my\s+resume\b",
    r"\breview\s+my\s+(cv|resume|profile)\b",
)


def _is_cv_dependent(message: str) -> bool:
    """Return True if the message text clearly needs CV context to answer."""
    import re as _re
    text = message.lower()
    for pattern in _CV_DEPENDENT_PATTERNS:
        if _re.search(pattern, text):
            return True
    return False


async def _direct_chat(message: str, conversation_id: str, db: Session, has_cv: bool = False) -> str:
    """
    Fast direct LLM call without agent/tool overhead.
    Used for greetings, thanks, simple questions, etc.
    Typically responds in 3-8 seconds.

    Args:
        message: The user's message.
        conversation_id: Session identifier.
        db: Active SQLAlchemy session.
        has_cv: Authoritative CV-status flag from the DB. When the user
            asks anything that depends on CV data and they have not
            uploaded one, we short-circuit here with a friendly
            explanation instead of letting the LLM hallucinate a generic
            "please upload your CV" answer.
    """
    llm = _get_llm()
    memory = _get_memory(conversation_id, db)

    # Short-circuit: if the user is asking a CV-dependent question and they
    # haven't uploaded a CV yet, return a clear actionable message instead
    # of letting the fast-path LLM hallucinate. The fast path doesn't have
    # tool access, so it cannot call `retrieve_cv_context`.
    # Short-circuit CV-dependent questions on the fast path (no tool access).
    if not has_cv and _is_cv_dependent(message):
        return (
            "I can't answer that without your CV — it lets me ground every "
            "recommendation in your actual skills and experience. "
            "**Please upload your CV via the CV Builder page first**, then "
            "ask me again and I'll give you a personalized answer.\n\n"
            "In the meantime I'm happy to help with general career advice, "
            "interview prep, or skill-roadmap questions — just ask!"
        )

    # Same CV-status block the agent path uses, so both paths see the same context.
    direct_prompt = _DIRECT_SYSTEM_PROMPT + "\n\n" + _build_cv_status_block(has_cv)
    messages = [SystemMessage(content=direct_prompt)]

    history = memory.load_memory_variables({})
    chat_history = history.get("chat_history", [])
    if chat_history:
        messages.extend(chat_history[-6:])

    messages.append(HumanMessage(content=message))

    response = await asyncio.to_thread(llm_invoke_with_retry, llm, messages)

    # NOTE: we do NOT call memory.save_context() here.  The chat router
    # (routers/chat.py) persists both the user message and the AI response
    # to the DB after this function returns.  Calling save_context() would
    # create duplicate rows.

    logger.info(f"⚡ Fast path response: {len(response.content)} chars")
    return response.content


# ============================
#  Empty-Output Recovery
# ============================
# `create_tool_calling_agent` + Gemini 2.5 Flash Lite has a quirk: after a
# tool call is executed and the result is added to the scratchpad, the
# model's second-pass response occasionally arrives with `content=""` and
# `tool_calls=[]`. LangChain's AgentExecutor then returns that empty
# string as the final `output`, and the user sees a blank message.
#
# The agent's `intermediate_steps` list still contains the tool
# observations though, so we can recover by feeding those observations
# back to the LLM in a plain "summarize for the user" prompt. This is
# a single LLM call (no tool overhead) and reliably produces a
# non-empty answer because the LLM has full context and a clear task.

_INTERMEDIATE_SYNTH_PROMPT = """You are CareerPilot AI — a career co-pilot.

The user asked:
\"\"\"{user_message}\"\"\"

A retrieval-augmented tool gathered the following context. Use it to answer the user directly. If the context is empty, say you don't have enough information.

Context:
\"\"\"
{context}
\"\"\"

Write a clear, helpful answer in Markdown. Don't mention tools, retrieval, or the prompt — just answer the user as CareerPilot would.
"""


async def _synthesize_from_intermediate(
    message: str,
    intermediate_steps: list,
) -> Optional[str]:
    """
    Recover from an empty `output` from the LangChain agent by re-prompting
    the LLM with the tool observations we did get.

    Args:
        message: The original user message.
        intermediate_steps: The `intermediate_steps` list from the
            AgentExecutor's result. Each entry is a tuple of
            `(AgentAction, observation)` for tool-using turns.

    Returns:
        A non-empty assistant answer, or None if recovery failed.
    """
    if not intermediate_steps:
        return None

    observations: list[str] = []
    for step in intermediate_steps:
        # LangChain's intermediate_steps is a list of (AgentAction, str|dict) tuples.
        if isinstance(step, tuple) and len(step) == 2:
            action, observation = step
            tool_name = getattr(action, "tool", "tool")
            observations.append(f"[{tool_name}]\n{observation}")
        else:
            # Some LangChain versions wrap as a single object — fall back to str().
            observations.append(str(step))

    if not observations:
        return None

    context = "\n\n---\n\n".join(observations)
    prompt_text = _INTERMEDIATE_SYNTH_PROMPT.format(
        user_message=message,
        context=context,
    )

    try:
        llm = _get_llm()
        response = await asyncio.to_thread(
            llm_invoke_with_retry,
            llm,
            [HumanMessage(content=prompt_text)],
        )
        text = (response.content or "").strip()
        if text:
            logger.info(
                f"♻️  Empty-output recovery produced {len(text)} chars "
                f"from {len(observations)} observation(s)"
            )
        return text or None
    except Exception as e:
        logger.error(f"Empty-output recovery failed: {e}", exc_info=True)
        return None


# ============================
#  Agent Tools
# ============================

# Global user context for agent tools (set per request)
_current_user_id: int = 0


def set_current_user(user_id: int):
    """Set the current user context for agent tools."""
    global _current_user_id
    _current_user_id = user_id


@tool
def retrieve_cv_context(query: str) -> str:
    """
    Retrieve relevant sections from the user's uploaded CV based on the query.
    Use this tool when you need to reference the user's skills, experience,
    education, or projects to answer their question.

    Args:
        query: The topic or question to search the CV for.

    Returns:
        Relevant CV sections as text, or a message if no CV is uploaded.
    """
    user_id = _current_user_id
    if not user_id or not vector_store.is_cv_uploaded(user_id):
        return "No CV has been uploaded yet. Please ask the user to upload their CV first."

    results = vector_store.query(user_id, query, n_results=5)

    if not results:
        return "No relevant sections found in the CV for this query."

    # Format results with section labels
    formatted = []
    for r in results:
        section = r["metadata"].get("section", "general")
        formatted.append(f"[CV Section: {section.upper()}]\n{r['text']}")

    return "\n\n---\n\n".join(formatted)


@tool
def compute_fit_score_tool(job_description: str) -> str:
    """
    Compute a programmatic fit score between the user's CV and a job description.
    Use this when the user asks "Am I ready for this role?", "How well do I fit?",
    or when analyzing a specific job against their profile.

    Args:
        job_description: The full job description or key requirements to evaluate against.

    Returns:
        JSON string with score (0-100), breakdown, matched/missing skills, and reasons.
    """
    user_id = _current_user_id
    if not user_id:
        return json.dumps({"error": "No user context. Please upload a CV first."})

    cv_text = vector_store.get_full_text(user_id)

    if not cv_text:
        return json.dumps({"error": "No CV uploaded. Please upload a CV first."})

    # Check Redis cache first
    fit_cache_key = f"fit:{user_id}:{make_hash(job_description[:200])}"
    cached = cache_get(fit_cache_key)
    if cached is not None:
        return json.dumps(cached, indent=2)

    result = fit_score_service.compute_fit_score(cv_text, job_description)
    cache_set(fit_cache_key, result)
    return json.dumps(result, indent=2)


@tool
def search_jobs_tool(query: str) -> str:
    """
    Search for jobs based on a natural language query.
    Use this when the user asks to find jobs, internships, or positions.
    Example queries: "ML internships in Dhaka", "remote Python developer jobs"

    Args:
        query: Natural language job search query.

    Returns:
        JSON string with job listings, each including title, company, location,
        salary, requirements, fit score, and match reasons.
    """

    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                result = pool.submit(asyncio.run, job_search_service.search_jobs(query)).result()
        else:
            result = asyncio.run(job_search_service.search_jobs(query))
    except RuntimeError:
        result = asyncio.run(job_search_service.search_jobs(query))

    # Format for the agent (truncate to avoid token overflow)
    jobs_summary = []
    for job in result.get("jobs", [])[:5]:
        jobs_summary.append({
            "title": job["title"],
            "company": job["company"],
            "location": job["location"],
            "salary_range": job.get("salary_range", ""),
            "job_type": job.get("job_type", ""),
            "fit_score": job.get("fit_score", 0),
            "match_reasons": job.get("match_reasons", []),
            "requirements": job.get("requirements", [])[:8],
            "url": job.get("url", ""),
        })

    return json.dumps({
        "total_found": result["total_found"],
        "sources": result["sources_used"],
        "jobs": jobs_summary,
    }, indent=2)


# ============================
#  System Prompt (Agent Path)
# ============================
# Leaner than before — doesn't force CV retrieval on every message.

SYSTEM_PROMPT = """You are CareerPilot AI — a career co-pilot that helps users navigate their job search.

{cv_status_block}

YOUR TOOLS (call them in this order when relevant):
1. **retrieve_cv_context**: ALWAYS call this first when the user's question mentions their CV, profile, skills, experience, education, fit, or "based on my background". The CV is already uploaded for most users — trust that it exists in the vector store and call the tool to fetch it. Do NOT ask the user to upload their CV; just retrieve it.
2. **compute_fit_score_tool**: Call after retrieving the CV if the user asks about job fit. Pass the CV-derived skills and the job requirements.
3. **search_jobs_tool**: Call when the user asks to find jobs, get recommendations, or see openings. Use keywords extracted from the CV (skills, role titles) as the query.

RULES:
- When the question mentions "my CV", "my profile", "my skills", "what jobs fit me", "based on my background" — your first action MUST be calling `retrieve_cv_context`. Never respond with "please upload your CV" — the CV is in the vector store.
- After retrieving CV context, summarize the key skills and experience, then call `search_jobs_tool` for job-fit questions.
- When presenting job results, format them as a Markdown list with title, company, location, fit score, and a 1-line "why it fits" reason.
- Be encouraging but honest about skill gaps. Suggest concrete steps to improve.
- Use Markdown formatting for readability (headers, bold, lists, tables).
- Only tell the user to upload a CV if `retrieve_cv_context` explicitly returns an empty / "no CV" result. If that happens, say so and point them to the CV Builder page.
- **CRITICAL: Your final answer to the user MUST contain a non-empty text response.** After you have called all the tools you need, write a clear, complete, helpful answer in Markdown. Never finish with an empty message.

TONE: Professional yet friendly, like a senior mentor who genuinely cares about the user's success."""


def _build_cv_status_block(has_cv: bool) -> str:
    """
    Build the authoritative CV-status block injected into the agent system prompt.

    We pass this in as a hard fact so the LLM cannot hallucinate "please upload
    your CV" when the user has already uploaded one. The `retrieve_cv_context`
    tool is still the source of truth for content (the model needs to actually
    fetch chunks), but the *existence* of a CV is decided here from the DB
    `user_profile.cv_uploaded_at` column.
    """
    if has_cv:
        return (
            "CV STATUS (authoritative, set by the system from the database):\n"
            "- The user HAS uploaded a CV. It is in the vector store and "
            "available via `retrieve_cv_context`.\n"
            "- You MUST NOT tell the user to upload their CV. Call "
            "`retrieve_cv_context` to load it and answer their question.\n"
            "- If `retrieve_cv_context` returns no relevant chunks, that is a "
            "retrieval issue, not a missing-CV issue — try a different query "
            "or answer from general career knowledge."
        )
    return (
        "CV STATUS (authoritative, set by the system from the database):\n"
        "- The user has NOT uploaded a CV yet.\n"
        "- If they ask anything that requires CV data (their skills, fit for "
        "a role, jobs matching their profile), tell them clearly to upload "
        "their CV via the CV Builder page first, and offer to help in other "
        "ways meanwhile (general career advice, interview prep, etc.).\n"
        "- Do NOT call `retrieve_cv_context` — it will return no data."
    )


# ============================
#  Cached Agent Executors
# ============================
# Agents are cached per conversation_id to avoid expensive recreation.
# IMPORTANT: the cached executor still holds a *memory object*, and that
# memory object now owns a SQLAlchemy Session. The Session is request-
# scoped in FastAPI, so caching the executor would lock the cached
# memory to a closed Session. We therefore invalidate (drop) the cached
# executor whenever the bound Session changes. In practice the chat
# router uses a fresh `db` per request and the agent rebuilds on the
# first call of each request — this is still much cheaper than
# rebuilding the underlying LangChain agent graph from scratch.
_agent_cache: dict[str, AgentExecutor] = {}


def build_agent(
    conversation_id: str = "default",
    db: Optional[Session] = None,
    has_cv: bool = False,
) -> AgentExecutor:
    """
    Build or retrieve a cached LangChain agent with tools and memory.

    Args:
        conversation_id: Session identifier for conversation memory.
        db: Active SQLAlchemy session used by the DB-backed memory.
            Required — pass the same `db` from the FastAPI dependency.
        has_cv: Authoritative flag (read from the DB
            `user_profile.cv_uploaded_at` column) injected into the system
            prompt so the LLM cannot hallucinate a "please upload your CV"
            response when the user has already uploaded one.

    Returns:
        Configured AgentExecutor ready to handle messages.
    """
    if db is None:
        # Defensive: an agent without a DB session can't read history or
        # persist the next turn. Refuse rather than silently break.
        raise ValueError(
            "build_agent requires an active SQLAlchemy `db` session "
            "now that conversation memory is DB-backed."
        )

    if conversation_id in _agent_cache:
        cached = _agent_cache[conversation_id]
        # The cached memory was bound to a previous (now-closed) Session
        # from a different request. We can reuse the agent graph itself
        # (the LLM + tools + prompt wiring) but we MUST swap in a fresh
        # memory object bound to *this* request's Session.
        cached.memory = _get_memory(conversation_id, db)
        # The cached prompt is built with the *previous* request's has_cv.
        # If the CV status has flipped since then (user uploaded or cleared
        # their CV), rebuild the executor with a fresh prompt so the LLM
        # gets the correct CV-status block.
        prev_has_cv = getattr(cached, "_has_cv", None)
        if prev_has_cv != has_cv:
            logger.info(
                f"CV status changed for {conversation_id} "
                f"({prev_has_cv} -> {has_cv}). Rebuilding agent."
            )
            del _agent_cache[conversation_id]
        else:
            return cached

    llm = _get_llm()
    tools = [retrieve_cv_context, compute_fit_score_tool, search_jobs_tool]

    # CV-status block is filled in from the authoritative DB column so the
    # LLM cannot hallucinate a "please upload your CV" response.
    system_prompt_text = SYSTEM_PROMPT.format(
        cv_status_block=_build_cv_status_block(has_cv)
    )
    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt_text),
        MessagesPlaceholder(variable_name="chat_history"),
        ("human", "{input}"),
        MessagesPlaceholder(variable_name="agent_scratchpad"),
    ])

    agent = create_tool_calling_agent(llm, tools, prompt)

    memory = _get_memory(conversation_id, db)

    executor = AgentExecutor(
        agent=agent,
        tools=tools,
        memory=memory,
        verbose=True,
        handle_parsing_errors=True,
        max_iterations=3,          # Reduced from 5 — most queries need ≤2 iterations
        early_stopping_method="force",  # Don't auto-generate a final LLM call when stopping; our empty-output recovery handles that.
        return_intermediate_steps=True,  # Required so the empty-output recovery can read tool observations
    )

    _agent_cache[conversation_id] = executor
    executor._has_cv = has_cv  # type: ignore[attr-defined]
    logger.info(f"Agent cached for conversation: {conversation_id} (has_cv={has_cv})")
    return executor


# ============================
#  Main Chat Entry Point
# ============================


def _user_has_cv(db: Session, user_id: int) -> bool:
    """
    Read the authoritative CV-uploaded flag from the DB.

    We trust the `user_profile.cv_uploaded_at` column (set in the CV
    upload/clear routers) over `vector_store.is_cv_uploaded()`. The latter
    reads an in-process cache that can get out of sync on container restarts
    or when the chroma volume is briefly unavailable. The DB column is the
    single source of truth.
    """
    try:
        from app.models.db_models import UserProfile
        profile = (
            db.query(UserProfile)
            .filter(UserProfile.user_id == user_id)
            .first()
        )
        return bool(profile and profile.cv_uploaded_at)
    except Exception as e:
        # Fall back to the vector-store cache if the DB is briefly unreachable.
        logger.warning(f"Failed to read CV status from DB: {e}")
        try:
            return vector_store.is_cv_uploaded(user_id)
        except Exception:
            return False


async def chat(message: str, conversation_id: str = "default", user_id: int = 0, db: Optional[Session] = None) -> dict:
    """
    Process a user message with smart routing:
    - Simple messages → direct LLM call (fast, ~3-8 seconds)
    - Career queries → agent with tools (~10-25 seconds)

    Args:
        message: The user's message.
        conversation_id: Session identifier.
        user_id: The user's ID for CV context isolation.
        db: Active SQLAlchemy session for reading/writing chat history.
            Required — the FastAPI route passes its own `db` dependency.

    Returns:
        {response: str, conversation_id: str, sources: list}
    """
    set_current_user(user_id)

    if db is None:
        # Without a DB session we can't read or persist conversation
        # history. Fail loudly rather than silently producing a stateless
        # agent that loses context between turns.
        raise ValueError(
            "agent.chat() requires a SQLAlchemy `db` session — "
            "conversation memory is now DB-backed."
        )

    # Authoritative CV status from the DB. Passed into both the fast path
    # (so it can short-circuit) and the agent path (so its system prompt
    # reflects reality).
    has_cv = _user_has_cv(db, user_id)

    try:
        if _needs_agent(message):
            # Agent path. `agent_invoke_with_retry` handles 429 back-off for
            # the multi-call agent loop.
            logger.info(f"🤖 Agent path for: '{message[:60]}...' (has_cv={has_cv})")
            agent = build_agent(conversation_id, db=db, has_cv=has_cv)
            result = await asyncio.to_thread(
                agent_invoke_with_retry, agent, {"input": message}
            )
            response_text = result.get("output", "I apologize, but I couldn't generate a response. Please try again.")

            # Some Gemini versions occasionally return an empty `content`
            # from the final LLM call. Recover by re-prompting the LLM with
            # the tool observations the agent did gather.
            intermediate = result.get("intermediate_steps") or []
            if not response_text or not response_text.strip():
                logger.warning(
                    "Agent returned empty output. "
                    f"intermediate_steps={len(intermediate)}. "
                    "Falling back to direct synthesis from tool results."
                )
                synthesized = await _synthesize_from_intermediate(
                    message=message,
                    intermediate_steps=intermediate,
                )
                if synthesized:
                    response_text = synthesized
        else:
            logger.info(f"⚡ Fast path for: '{message[:60]}...' (has_cv={has_cv})")
            response_text = await _direct_chat(message, conversation_id, db, has_cv=has_cv)

        return {
            "response": response_text,
            "conversation_id": conversation_id,
            "sources": [],
        }

    except Exception as e:
        error_str = str(e)
        logger.error(f"Agent error: {e}", exc_info=True)

        # Pull the current model name from settings so the quota message
        # stays accurate if the operator switches model in the env.
        model_name = settings.LLM_MODEL
        if "gemini-2.5-flash-lite" in model_name:
            rpm, rpd = 15, 1000
        else:
            rpm, rpd = 5, 20

        if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str or "quota" in error_str.lower():
            # Surface Google's "retry in N seconds" hint when present.
            retry_hint = ""
            import re as _re
            m = _re.search(r"Please retry in\s+([0-9.]+)\s*s", error_str)
            if m:
                secs = float(m.group(1))
                if secs < 90:
                    retry_hint = f" Try again in **{int(secs) + 1} seconds**."
                else:
                    retry_hint = f" Try again in **{int(secs / 60) + 1} minutes**."

            user_message = (
                f"⚠️ Google Gemini API rate limit hit. "
                f"The free tier of `{model_name}` is limited to "
                f"**{rpm} requests/minute and {rpd} requests/day**." + retry_hint + "\n\n"
                "**Why this happens:** a single chat turn can trigger "
                "multiple LLM calls (CV retrieval + tool calls + final "
                "answer), and each one counts against the limit.\n\n"
                "**Options to continue:**\n"
                "1. Wait ~1 minute and retry\n"
                "2. Switch to `gemini-2.5-flash-lite` (higher free-tier limits)\n"
                "3. Upgrade to a paid Google AI plan for higher limits\n"
                "4. Use a different API key with remaining quota\n\n"
                "Visit https://ai.google.dev/gemini-api/docs/rate-limits for more info."
            )
        elif "api key" in error_str.lower() or "authentication" in error_str.lower():
            user_message = "⚠️ There's an issue with your Google API key. Please check your configuration."
        else:
            user_message = f"⚠️ An error occurred: {error_str}"

        return {
            "response": user_message,
            "conversation_id": conversation_id,
            "sources": [],
        }
