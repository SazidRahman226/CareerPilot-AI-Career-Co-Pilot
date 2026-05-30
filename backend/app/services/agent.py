"""
CareerPilot — AI Agent Service
=================================
LangChain agent with Gemini 3.0 Flash, conversation memory, and tool calling.
The agent is grounded in the user's CV via RAG retrieval.

Tools available to the agent:
1. retrieve_cv_context — fetch relevant CV sections
2. compute_fit_score — programmatic fit analysis
3. search_jobs — search for jobs across multiple sources
"""

import json
import logging
from typing import Optional

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.memory import ConversationBufferWindowMemory
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.tools import tool
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

from app.config import settings
from app.services import vector_store
from app.services import fit_score as fit_score_service
from app.services import job_search as job_search_service
import asyncio

logger = logging.getLogger(__name__)

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
#  Agent Tools
# ============================

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
#  System Prompt
# ============================

SYSTEM_PROMPT = """You are CareerPilot AI — a career co-pilot that helps users navigate their job search.
You are grounded in the user's uploaded CV and must ALWAYS reference it when providing career advice.

YOUR CORE CAPABILITIES:
1. **CV Analysis**: Use the retrieve_cv_context tool to find relevant sections of the user's CV.
2. **Fit Scoring**: Use the compute_fit_score_tool to programmatically evaluate how well the user fits a job.
3. **Job Search**: Use the search_jobs_tool to find relevant job listings.
4. **Career Advice**: Provide skill gap analysis, learning roadmaps, cover letter drafts, and interview prep.

RULES:
- ALWAYS retrieve CV context before giving career advice. Never guess about the user's background.
- When computing fit scores, explain the breakdown (skills, experience, education) clearly.
- When presenting job results, format them as structured cards with key info.
- When drafting cover letters, ground them specifically in the user's experiences from their CV.
- Be encouraging but honest about skill gaps. Suggest concrete steps to improve.
- Use Markdown formatting for readability (headers, bold, lists, tables).
- If no CV is uploaded, remind the user to upload one first.

TONE: Professional yet friendly, like a senior mentor who genuinely cares about the user's success."""


def build_agent(conversation_id: str = "default") -> AgentExecutor:
    """
    Build and return a LangChain agent with tools and memory.

    Args:
        conversation_id: Session identifier for conversation memory.

    Returns:
        Configured AgentExecutor ready to handle messages.
    """
    # Initialize LLM
    llm = ChatGoogleGenerativeAI(
        model=settings.LLM_MODEL,
        google_api_key=settings.GOOGLE_API_KEY,
        temperature=0.7,
        convert_system_message_to_human=True,
    )

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

    # Build executor
    executor = AgentExecutor(
        agent=agent,
        tools=tools,
        memory=memory,
        verbose=True,
        handle_parsing_errors=True,
        max_iterations=5,
        return_intermediate_steps=False,
    )

    return executor


# Global user context for agent tools (set per request)
_current_user_id: int = 0


def set_current_user(user_id: int):
    """Set the current user context for agent tools."""
    global _current_user_id
    _current_user_id = user_id


async def chat(message: str, conversation_id: str = "default", user_id: int = 0) -> dict:
    """
    Process a user message through the AI agent.

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
        agent = build_agent(conversation_id)
        result = await asyncio.to_thread(agent.invoke, {"input": message})

        response_text = result.get("output", "I apologize, but I couldn't generate a response. Please try again.")

        # Note: CV sources are already tracked within the agent's tool usage via retrieve_cv_context
        # No need for an extra query here to avoid duplicate API calls
        
        return {
            "response": response_text,
            "conversation_id": conversation_id,
            "sources": [],  # Sources embedded in agent's response already
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
