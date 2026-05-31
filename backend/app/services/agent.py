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
from langchain.memory import ConversationBufferWindowMemory
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.tools import tool
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import SystemMessage, HumanMessage

from app.config import settings
from app.services import vector_store
from app.services import fit_score as fit_score_service
from app.services import job_search as job_search_service
import asyncio

logger = logging.getLogger(__name__)

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
        _llm = ChatGoogleGenerativeAI(
            model=settings.LLM_MODEL,
            google_api_key=settings.GOOGLE_API_KEY,
            temperature=0.7,
            timeout=60,            # 60s timeout (was 120s)
            max_retries=2,
        )
        logger.info(f"LLM singleton initialized: {settings.LLM_MODEL}")
    return _llm


# ============================
#  Conversation Memory Store
# ============================
# Maps conversation_id → memory instance
_memory_store: dict[str, ConversationBufferWindowMemory] = {}


def _get_memory(conversation_id: str) -> ConversationBufferWindowMemory:
    """Get or create conversation memory for a session."""
    if conversation_id not in _memory_store:
        _memory_store[conversation_id] = ConversationBufferWindowMemory(
            k=20,
            memory_key="chat_history",
            return_messages=True,
        )
    return _memory_store[conversation_id]


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


async def _direct_chat(message: str, conversation_id: str) -> str:
    """
    Fast direct LLM call without agent/tool overhead.
    Used for greetings, thanks, simple questions, etc.
    Typically responds in 3-8 seconds.
    """
    llm = _get_llm()
    memory = _get_memory(conversation_id)

    # Build messages with conversation history for context
    messages = [SystemMessage(content=_DIRECT_SYSTEM_PROMPT)]

    history = memory.load_memory_variables({})
    chat_history = history.get("chat_history", [])
    if chat_history:
        # Include last 6 messages for context (3 exchanges)
        messages.extend(chat_history[-6:])

    messages.append(HumanMessage(content=message))

    # Direct LLM call — no agent, no tools, no scratchpad
    response = await asyncio.to_thread(llm.invoke, messages)

    # Save to memory so agent path also sees this history
    memory.save_context({"input": message}, {"output": response.content})

    logger.info(f"⚡ Fast path response: {len(response.content)} chars")
    return response.content


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

    result = fit_score_service.compute_fit_score(cv_text, job_description)
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
    # Run the async search in a sync context
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

YOUR TOOLS:
1. **retrieve_cv_context**: Search the user's CV for relevant info. Use ONLY when you need specific CV details.
2. **compute_fit_score_tool**: Compute fit score between CV and a job. Use when asked about job fit.
3. **search_jobs_tool**: Search for job listings. Use when asked to find jobs.

RULES:
- Only call tools when the question actually requires them. Don't retrieve CV for general conversation.
- When computing fit scores, explain the breakdown (skills, experience, education) clearly.
- When presenting job results, format them as structured cards with key info.
- Be encouraging but honest about skill gaps. Suggest concrete steps to improve.
- Use Markdown formatting for readability (headers, bold, lists, tables).
- If no CV is uploaded and user asks about their profile, remind them to upload one.

TONE: Professional yet friendly, like a senior mentor who genuinely cares about the user's success."""


# ============================
#  Cached Agent Executors
# ============================
# Agents are cached per conversation_id to avoid expensive recreation.
_agent_cache: dict[str, AgentExecutor] = {}


def build_agent(conversation_id: str = "default") -> AgentExecutor:
    """
    Build or retrieve a cached LangChain agent with tools and memory.

    Args:
        conversation_id: Session identifier for conversation memory.

    Returns:
        Configured AgentExecutor ready to handle messages.
    """
    if conversation_id in _agent_cache:
        return _agent_cache[conversation_id]

    # Use singleton LLM
    llm = _get_llm()

    # Define tools
    tools = [retrieve_cv_context, compute_fit_score_tool, search_jobs_tool]

    # Build prompt with memory placeholder
    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        MessagesPlaceholder(variable_name="chat_history"),
        ("human", "{input}"),
        MessagesPlaceholder(variable_name="agent_scratchpad"),
    ])

    # Create agent
    agent = create_tool_calling_agent(llm, tools, prompt)

    # Get conversation memory
    memory = _get_memory(conversation_id)

    # Build executor with reduced iterations
    executor = AgentExecutor(
        agent=agent,
        tools=tools,
        memory=memory,
        verbose=True,
        handle_parsing_errors=True,
        max_iterations=3,          # Reduced from 5 — most queries need ≤2 iterations
        return_intermediate_steps=False,
    )

    _agent_cache[conversation_id] = executor
    logger.info(f"Agent cached for conversation: {conversation_id}")
    return executor


# ============================
#  Main Chat Entry Point
# ============================

async def chat(message: str, conversation_id: str = "default", user_id: int = 0) -> dict:
    """
    Process a user message with smart routing:
    - Simple messages → direct LLM call (fast, ~3-8 seconds)
    - Career queries → agent with tools (~10-25 seconds)

    Args:
        message: The user's message.
        conversation_id: Session identifier.
        user_id: The user's ID for CV context isolation.

    Returns:
        {response: str, conversation_id: str, sources: list}
    """
    # Set user context for tools
    set_current_user(user_id)

    try:
        if _needs_agent(message):
            # AGENT PATH: Full tool-calling agent for career queries
            logger.info(f"🤖 Agent path for: '{message[:60]}...'")
            agent = build_agent(conversation_id)
            result = await asyncio.to_thread(agent.invoke, {"input": message})
            response_text = result.get("output", "I apologize, but I couldn't generate a response. Please try again.")
        else:
            # FAST PATH: Direct LLM call for simple messages
            logger.info(f"⚡ Fast path for: '{message[:60]}...'")
            response_text = await _direct_chat(message, conversation_id)

        return {
            "response": response_text,
            "conversation_id": conversation_id,
            "sources": [],
        }

    except Exception as e:
        error_str = str(e)
        logger.error(f"Agent error: {e}", exc_info=True)

        # Provide user-friendly error messages for common cases
        if "429" in error_str or "quota" in error_str.lower():
            user_message = (
                "⚠️ You've hit Google's API daily quota limit (20 free requests/day for gemini-2.5-flash).\n\n"
                "**Options to continue:**\n"
                "1. Wait until tomorrow for quota to reset\n"
                "2. Upgrade to a paid Google AI plan for higher limits\n"
                "3. Use a different API key with remaining quota\n\n"
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
