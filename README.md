<p align="center">
  <h1 align="center">🚀 CareerPilot — AI Career Co-Pilot</h1>
  <p align="center">
    <strong>An end-to-end agentic career assistant powered by RAG (Retrieval-Augmented Generation).</strong><br/>
    Every recommendation, cover letter, and fit score is grounded in YOUR uploaded CV — no hallucinations.
  </p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.11-blue?logo=python" alt="Python" />
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi" alt="FastAPI" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker" alt="Docker" />
  <img src="https://img.shields.io/badge/LangChain-0.3-green" alt="LangChain" />
  <img src="https://img.shields.io/badge/Gemini-2.5_Flash-yellow?logo=google" alt="Gemini" />
</p>

---

## 📑 Table of Contents

- [Repository Structure](#-repository-structure)
- [Features Implemented](#-features-implemented)
- [Key Technical Features](#-key-technical-features)
- [User Paths](#-user-paths)
- [Tech Stack](#-tech-stack)
- [Quick Start](#-quick-start)
- [Custom Tests](#-custom-tests)
- [System Design Document](#-system-design-document)
- [API Keys & Configuration](#-api-keys--configuration)
- [Built For](#-built-for)

---

## 📁 Repository Structure

```
CareerPilot/
├── docker-compose.yml              # Full-stack orchestration (DB + Backend + Frontend)
├── .dockerignore                    # Docker build exclusions
├── .gitignore                       # Git exclusions
├── README.md                        # This file
│
├── backend/                         # Python FastAPI Backend
│   ├── Dockerfile                   # Production container image
│   ├── requirements.txt             # Python dependencies (47 packages)
│   ├── .env.example                 # Environment variable template
│   ├── run.py                       # Uvicorn launcher entry point
│   └── app/
│       ├── __init__.py
│       ├── main.py                  # FastAPI app setup, CORS, lifespan, routers
│       ├── config.py                # Pydantic Settings (env-based configuration)
│       ├── database.py              # SQLAlchemy engine, session factory, Base class
│       │
│       ├── routers/                 # REST API endpoints
│       │   ├── auth.py              # POST /api/auth/register, /login, GET /me
│       │   ├── cv.py                # POST /api/cv/upload, GET /status, DELETE /clear
│       │   ├── chat.py              # POST /api/chat, GET /history/{id}, DELETE /history
│       │   ├── jobs.py              # POST /api/jobs/search
│       │   ├── tracker.py           # CRUD /api/tracker/applications, /todos, /stats
│       │   └── cv_builder.py        # POST /api/cv-builder/generate-pdf, /generate-docx
│       │
│       ├── services/                # Business logic layer
│       │   ├── agent.py             # LangChain agentic AI (two-tier routing, tools)
│       │   ├── auth_service.py      # JWT creation/validation, bcrypt password hashing
│       │   ├── cv_processor.py      # PDF/DOCX text extraction, section-aware chunking
│       │   ├── cv_generator.py      # ReportLab PDF + python-docx CV generation
│       │   ├── vector_store.py      # ChromaDB wrapper (embed, store, retrieve, clear)
│       │   ├── db_memory.py         # LangChain BaseChatMemory backed by PostgreSQL
│       │   ├── fit_score.py         # Programmatic fit scoring (Jaccard + weighted formula)
│       │   └── job_search.py        # Multi-source job search with deduplication
│       │
│       └── models/                  # Data models
│           ├── schemas.py           # Pydantic request/response schemas
│           └── db_models.py         # SQLAlchemy ORM (User, ChatMessage, Application, etc.)
│
└── frontend/                        # Next.js 16 Frontend
    ├── Dockerfile                   # Container image for dev server
    ├── package.json                 # Node dependencies
    ├── next.config.ts               # Next.js configuration
    ├── tsconfig.json                # TypeScript configuration
    ├── postcss.config.mjs           # PostCSS + Tailwind CSS 4
    └── src/
        ├── app/                     # Next.js App Router pages
        │   ├── layout.tsx           # Root layout with sidebar navigation
        │   ├── page.tsx             # Dashboard (stats, activity feed, AI nudges)
        │   ├── globals.css          # Complete design system (55KB, custom CSS)
        │   ├── login/page.tsx       # Auth page (register + login)
        │   ├── profile/page.tsx     # CV upload & RAG status
        │   ├── chat/page.tsx        # AI assistant chat interface
        │   ├── jobs/page.tsx        # Job search with fit scoring
        │   ├── tracker/page.tsx     # Kanban board + todos
        │   └── cv-builder/page.tsx  # AI CV builder form + PDF/DOCX export
        ├── components/
        │   └── layout/              # Sidebar, navbar components
        ├── contexts/
        │   ├── auth-context.tsx     # JWT auth state management
        │   └── cv-status-context.tsx # CV upload status context
        ├── hooks/
        │   └── use-chat.ts         # Chat state management hook
        └── lib/
            └── api.ts              # Centralized API client (490 LOC)
```

---

## 🎯 Features Implemented

### 1. 🔍 Job Hunter Agent
| Capability | Description |
|---|---|
| Natural language search | Type queries like _"Find ML internships in Dhaka"_ and get structured results |
| Dual-source live search | Serper.dev Web Search + Serper.dev Google Jobs endpoint |
| Smart deduplication | Fuzzy matching (title + company, 75% threshold) via `SequenceMatcher` prevents duplicates across sources |
| CV-based fit scoring | Every job listing is automatically scored against your CV using the programmatic fit engine |
| Graceful fallback | Falls back to a curated mock dataset (12 realistic jobs) when no API keys are configured |

### 2. 📄 Profile & Resume Intelligence (RAG Core)
| Capability | Description |
|---|---|
| Multi-format upload | Accepts PDF and DOCX via file upload |
| Section-aware chunking | Detects 11 CV section types (summary, experience, education, skills, projects, certifications, awards, publications, languages, references, contact) |
| Semantic chunking | 500-char chunks with 50-char overlap using LangChain's `RecursiveCharacterTextSplitter` |
| Local free embeddings | `all-MiniLM-L6-v2` via sentence-transformers — no API key needed for embeddings |
| Per-user vector isolation | Each user gets their own ChromaDB collection (`cv_collection_user_{id}`) |
| Cosine similarity retrieval | Top-5 most relevant chunks retrieved per query |

### 3. 🤖 Personal AI Assistant (Agentic Chat)
| Capability | Description |
|---|---|
| Two-tier response routing | **Fast path** (~3–8s): Direct LLM for greetings/simple messages. **Agent path** (~10–25s): Full LangChain agent with tools for career queries |
| Smart routing engine | Regex-based pattern matching + keyword detection to classify messages into fast vs. agent path |
| Three LangChain tools | `retrieve_cv_context` → `compute_fit_score_tool` → `search_jobs_tool`, called in the correct order |
| DB-backed conversation memory | PostgreSQL-persisted chat history (20-message sliding window) that survives restarts |
| Empty-output recovery | Detects empty agent responses and re-prompts the LLM with tool observations to synthesize an answer |
| Rate-limit resilience | Exponential backoff retry (5s→10s→20s→40s, max 4 attempts) on Google API 429 errors |
| Authoritative CV status | System prompt dynamically reflects DB-sourced CV upload status to prevent "please upload your CV" hallucinations |

### 4. ✨ AI CV Builder
| Capability | Description |
|---|---|
| Structured form input | Full CV form: personal info, summary, education, experience, skills, projects, certifications, awards, languages |
| PDF export | Professionally styled A4 PDF via ReportLab with custom typography, accent colors, and section separators |
| DOCX export | Editable Word document via python-docx with matching professional styling |
| Live preview | Form data is live-previewed before export |

### 5. 📋 Productivity & Progress Tracker
| Capability | Description |
|---|---|
| 5-column Kanban board | Wishlist → Applied → Interviewing → Offer → Rejected |
| Drag-and-drop | HTML5 native drag-and-drop with visual cues |
| To-do management | CRUD to-do items with priority (low/medium/high), due dates, and categories |
| Activity feed | Auto-logged activity (CV uploads, job searches, application changes, to-do updates) |
| Dashboard stats | Aggregated stats cards, application pipeline visualization, task progress bar, AI nudges |

### 6. 🔐 Authentication & Multi-Tenancy
| Capability | Description |
|---|---|
| JWT-based auth | Registration + login with bcrypt password hashing and HS256 JWT tokens (7-day expiry) |
| Per-user data isolation | Every DB table (applications, todos, chat messages, profiles, activities) is scoped by `user_id` FK |
| Protected routes | All API endpoints (except auth and health) require `Authorization: Bearer <token>` |

---

## 🔧 Key Technical Features

### Two-Tier Agent Architecture
The AI assistant uses a **smart routing engine** that classifies each incoming message:
- **Fast Path**: Greetings, thanks, simple questions → single LLM call, 3–8s latency
- **Agent Path**: Career-specific queries → LangChain `AgentExecutor` with tool calling, 10–25s latency

This avoids the overhead of spinning up the full agent framework for trivial messages.

### Programmatic Fit Scoring (Not LLM-Guessed)
Fit scores are computed algorithmically, not by asking the LLM:

```
fit_score = 0.5 × skill_match + 0.3 × experience_match + 0.2 × education_match
```

- **Skill match**: Jaccard-inspired similarity against a 120+ skill taxonomy (weighted 70% recall, 30% precision)
- **Experience match**: Regex-based years extraction with graduated scoring
- **Education match**: Hierarchical level comparison (HSC → Associate → Bachelor → Master → PhD)

### Database-Backed Conversation Memory
Chat history is persisted to PostgreSQL via a custom `DatabaseChatMemory` class (subclassing LangChain's `BaseChatMemory`). Benefits:
- Survives backend restarts and container redeploys
- Shared across horizontal replicas
- Auditable via SQL queries
- 20-message sliding window prevents context overflow

### Singleton LLM & Cached Agents
- The `ChatGoogleGenerativeAI` instance is created once (singleton) and reused for all requests
- `AgentExecutor` instances are cached per conversation to avoid rebuilding the LangChain graph

### Rate-Limit Resilience
Google Gemini free tier (15 RPM for flash-lite, 5 RPM for flash) is aggressively rate-limited. The system handles this with:
- Tenacity-based retry decorator: exponential backoff (5s → 10s → 20s → 40s)
- User-friendly error messages with exact retry countdown
- Model-aware quota hints

---

## 🗺️ User Paths

### Path 1: New User Onboarding
```
Register/Login → Upload CV (PDF/DOCX)
                     │
                     ├─→ CV is parsed into chunks
                     ├─→ Chunks are embedded via sentence-transformers
                     └─→ Stored in per-user ChromaDB collection
                            │
                            ▼
                     Dashboard shows "CV uploaded" status
```

### Path 2: Job Discovery & Fit Analysis
```
Jobs Page → Enter search query ("ML Engineer in Dhaka")
                │
                ├─→ Serper.dev Web Search (live web results)
                ├─→ Serper.dev Jobs API (structured listings)
                └─→ Fallback to mock data if no API keys
                        │
                        ▼
                Deduplicate across sources (fuzzy matching)
                        │
                        ▼
                Enrich each job with CV-based fit score
                        │
                        ▼
                Display ranked results with score breakdown
                        │
                        ▼
               User can "Track" a job → adds to Kanban board
```

### Path 3: AI-Powered Career Coaching
```
Chat Page → Type message
               │
               ├─→ Smart routing: is this simple or career-related?
               │
               ├─ SIMPLE ─→ Fast direct LLM call (3–8s)
               │
               └─ CAREER ─→ LangChain Agent activates
                                │
                                ├─→ Tool 1: retrieve_cv_context (RAG)
                                ├─→ Tool 2: compute_fit_score_tool
                                └─→ Tool 3: search_jobs_tool
                                        │
                                        ▼
                               Synthesized response with sources
                               Saved to PostgreSQL chat history
```

### Path 4: Application Tracking Workflow
```
Kanban Board → Add application (company, role, URL, salary)
                   │
                   ├─→ Card appears in "Wishlist" column
                   ├─→ Drag to "Applied" → "Interviewing" → "Offer"
                   ├─→ Activity logged for each status change
                   └─→ Dashboard stats updated in real-time
```

### Path 5: CV Generation
```
CV Builder → Fill structured form (personal info, experience, etc.)
                │
                ├─→ Click "Download PDF" → ReportLab generates styled A4 PDF
                └─→ Click "Download DOCX" → python-docx generates Word doc
```

---

## 🛠️ Tech Stack

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| Next.js | 16.2.6 | React framework with App Router |
| React | 19.2.4 | UI library |
| TypeScript | ^5 | Type safety |
| Tailwind CSS | ^4 | Utility-first CSS framework |
| Lucide React | ^1.17.0 | Icon library |
| Custom CSS | — | 55KB design system (`globals.css`) with glassmorphism, dark mode, animations |

### Backend
| Technology | Version | Purpose |
|---|---|---|
| FastAPI | 0.115.0 | High-performance async Python web framework |
| Uvicorn | 0.30.6 | ASGI server |
| LangChain | 0.3.25 | Agentic AI orchestration framework |
| langchain-google-genai | 2.1.4 | Google Gemini LLM integration |
| ChromaDB | 0.5.23 | Vector database for RAG retrieval |
| sentence-transformers | 3.4.1 | Local embedding model (`all-MiniLM-L6-v2`) |
| SQLAlchemy | 2.0.36 | ORM for PostgreSQL |
| psycopg2-binary | 2.9.10 | PostgreSQL driver |
| ReportLab | 4.2.5 | PDF generation for CV builder |
| python-docx | 1.1.2 | DOCX generation for CV builder |
| python-jose | 3.3.0 | JWT token handling |
| passlib + bcrypt | 1.7.4 / 4.0.1 | Password hashing |
| pypdf | 5.1.0 | PDF text extraction for CV upload |
| httpx | 0.28.1 | Async HTTP client for job APIs |
| tenacity | 9.0.0 | Retry with exponential backoff |
| pydantic-settings | 2.6.1 | Environment-based configuration |

### Infrastructure
| Technology | Version | Purpose |
|---|---|---|
| PostgreSQL | 16 (Alpine) | Primary relational database |
| Docker Compose | — | Full-stack container orchestration |
| Python | 3.11-slim | Backend runtime |
| Node.js | 20 (Alpine) | Frontend runtime |

### AI / ML
| Component | Model / Service |
|---|---|
| LLM | Google Gemini 2.5 Flash Lite (default) |
| Embeddings | `all-MiniLM-L6-v2` (local, free, 384-dim) |
| Vector DB | ChromaDB with cosine similarity |
| Agent Framework | LangChain `create_tool_calling_agent` + `AgentExecutor` |

---

## ⚡ Quick Start

### Docker (Recommended)
```bash
# 1. Clone the repository
git clone https://github.com/SazidRahman226/CareerPilot-AI-Career-Co-Pilot

# 2. Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env → add your GOOGLE_API_KEY

# 3. Launch the full stack
docker compose up --build

# 4. Open in browser
# Frontend:  http://localhost:3000
# Backend:   http://localhost:8000
# API Docs:  http://localhost:8000/docs
```

### Local Development (Without Docker)

**Backend:**
```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Mac/Linux
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
cp .env.example .env           # Fill in GOOGLE_API_KEY + DATABASE_URL
python run.py
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

> **Note:** Local development requires a running PostgreSQL instance. Update `DATABASE_URL` in `backend/.env` accordingly.

---

## 🧪 Custom Tests

### 1. Health Check
```bash
curl http://localhost:8000/health
```
**Expected:** `{"status": "ok", "service": "CareerPilot Backend", "version": "2.0.0", ...}`

### 2. User Registration & Login
```bash
# Register
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name": "Test User", "email": "test@example.com", "password": "secret123"}'

# Login (save the access_token)
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "secret123"}' | python -c "import sys, json; print(json.load(sys.stdin)['access_token'])")
```
**Expected:** JSON response with `access_token` and `user` object.

### 3. CV Upload & RAG Pipeline
```bash
# Upload a CV (requires auth token)
curl -X POST http://localhost:8000/api/cv/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@your_cv.pdf"

# Check CV status
curl http://localhost:8000/api/cv/status \
  -H "Authorization: Bearer $TOKEN"
```
**Expected:** `{"success": true, "chunk_count": N, "sections_detected": ["skills", "experience", ...]}`.

### 4. AI Chat — Fast Path vs. Agent Path
```bash
# Fast path test (simple greeting → should respond in <5s)
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"message": "Hello!"}'

# Agent path test (career query → should invoke tools)
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"message": "What are my top skills based on my CV?"}'
```
**Expected:** Fast path returns in 3–8s. Agent path returns in 10–25s with CV-grounded response.

### 5. Job Search with Fit Scoring
```bash
curl -X POST http://localhost:8000/api/jobs/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query": "ML internships in Dhaka", "limit": 5}'
```
**Expected:** JSON with `jobs[]` array, each containing `fit_score`, `fit_breakdown`, `match_reasons`.

### 6. Kanban Tracker CRUD
```bash
# Create application
curl -X POST http://localhost:8000/api/tracker/applications \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"company": "Google", "role": "SWE Intern", "status": "wishlist"}'

# Move to "applied"
curl -X PUT http://localhost:8000/api/tracker/applications/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"status": "applied"}'

# Get dashboard stats
curl http://localhost:8000/api/tracker/stats \
  -H "Authorization: Bearer $TOKEN"
```

### 7. CV Builder — PDF Generation
```bash
curl -X POST http://localhost:8000/api/cv-builder/generate-pdf \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"personal_info": {"full_name": "John Doe", "email": "john@example.com", "phone": "+880", "location": "Dhaka", "linkedin": "", "github": "", "website": ""}, "summary": "Software engineer with 3 years of experience.", "education": [], "experience": [], "skills": ["Python", "React", "Docker"], "projects": [], "certifications": [], "awards": [], "languages": ["English", "Bengali"]}' \
  --output test_cv.pdf
```
**Expected:** A professional A4 PDF file is saved.

---

## 📐 System Design Document

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                            │
│                    Next.js 16 (App Router)                          │
│    ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐  │
│    │Dashboard │ │  Chat    │ │   Jobs   │ │ Tracker  │ │CV Build│  │
│    └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └───┬────┘  │
│         │            │            │             │           │       │
│         └────────────┴────────────┴─────────────┴───────────┘       │
│                              │  HTTPS / REST                        │
└──────────────────────────────┼──────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     BACKEND (FastAPI + Uvicorn)                      │
│                                                                      │
│  ┌─────────┐   ┌────────────────────────────────────┐               │
│  │  Auth   │   │        AI Agent Service             │               │
│  │ (JWT +  │   │  ┌─────────────────────────────┐   │               │
│  │ bcrypt) │   │  │  Smart Router                │   │               │
│  └────┬────┘   │  │  (regex + keyword detect)    │   │               │
│       │        │  └──────┬───────────┬───────────┘   │               │
│       │        │         │           │               │               │
│       │        │    Fast Path    Agent Path           │               │
│       │        │   (Direct LLM)  (LangChain)         │               │
│       │        │         │      ┌────┴────┐          │               │
│       │        │         │      │  Tools  │          │               │
│       │        │         │      │ • CV RAG│          │               │
│       │        │         │      │ • Fit   │          │               │
│       │        │         │      │ • Jobs  │          │               │
│       │        │         │      └────┬────┘          │               │
│       │        └─────────┴──────────┘│               │               │
│       │                              │               │               │
│  ┌────┴──────────────────────────────┴───────────┐   │               │
│  │               Service Layer                    │   │               │
│  │  ┌──────────┐ ┌───────────┐ ┌──────────────┐ │   │               │
│  │  │ CV Proc  │ │ Fit Score │ │  Job Search  │ │   │               │
│  │  │ (parse + │ │ (Jaccard  │ │  (Serper.dev │ │   │               │
│  │  │  chunk)  │ │ + weights)│ │  + fallback) │ │   │               │
│  │  └──────────┘ └───────────┘ └──────────────┘ │   │               │
│  └───────────────────────────────────────────────┘   │               │
│                                                      │               │
│  ┌───────────────────┐    ┌──────────────────────┐   │               │
│  │    PostgreSQL      │    │      ChromaDB        │   │               │
│  │ (Users, Chat,      │    │  (Vector embeddings, │   │               │
│  │  Apps, Todos,      │    │   per-user collections│  │               │
│  │  Activities)       │    │   cosine similarity)  │  │               │
│  └───────────────────┘    └──────────────────────┘   │               │
└──────────────────────────────────────────────────────────────────────┘
```

### Data Flow Diagrams

#### CV Upload → RAG Retrieval Flow

```
User uploads PDF/DOCX
        │
        ▼
cv_processor.extract_text()         # pypdf or python-docx
        │
        ▼
cv_processor.chunk_cv_text()        # Section detection → 500-char chunks
        │
        ▼
vector_store.add_documents()        # Embed via all-MiniLM-L6-v2 → ChromaDB
        │
        ▼
UserProfile.cv_uploaded_at = now()  # PostgreSQL metadata record
        │
        ▼
[Later] User asks "What are my skills?"
        │
        ▼
agent.retrieve_cv_context("skills") # Tool call
        │
        ▼
vector_store.query(user_id, "skills", n=5)  # Cosine similarity search
        │
        ▼
Top-5 chunks returned → injected into LLM context → grounded response
```

#### Chat Message Flow

```
Frontend: POST /api/chat {message, conversation_id}
        │
        ▼
router/chat.py: authenticate user via JWT
        │
        ▼
agent.chat(message, conversation_id, user_id, db)
        │
        ├─→ _user_has_cv(db, user_id)     # Read CV status from DB
        │
        ├─→ _needs_agent(message)           # Smart routing decision
        │       │
        │       ├─ False → _direct_chat()   # Single LLM call (fast)
        │       │
        │       └─ True  → build_agent()    # LangChain AgentExecutor
        │                       │
        │                       ├─→ retrieve_cv_context()
        │                       ├─→ compute_fit_score_tool()
        │                       └─→ search_jobs_tool()
        │
        ▼
router/chat.py: persist user msg + AI response to chat_messages table
        │
        ▼
Return {response, conversation_id, sources}
```

### Scaling to 10,000 Users

#### Current Architecture Limitations
| Component | Current Design | Limitation at 10K Users |
|---|---|---|
| FastAPI Backend | Single process, `reload=True` | Can handle ~200 concurrent connections |
| PostgreSQL | Single instance | Can handle 10K users easily with proper indexing |
| ChromaDB | Local filesystem, per-user collections | 10K collections is manageable; disk I/O becomes bottleneck |
| Sentence-Transformers | In-process, synchronous | CPU-bound; 1 embedding at a time per process |
| Gemini API | Free tier (15 RPM flash-lite) | Severe bottleneck — 15 requests/min shared across ALL users |

#### Scaling Strategy

```
                    ┌─────────────────┐
                    │   CDN (Vercel)   │ ← Static assets, edge-cached
                    └────────┬────────┘
                             │
                    ┌────────┴────────┐
                    │  Load Balancer  │ ← Nginx / Cloud LB
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │ FastAPI  │  │ FastAPI  │  │ FastAPI  │ ← 3-5 replicas (2GB each)
        │ Worker 1 │  │ Worker 2 │  │ Worker 3 │
        └────┬─────┘  └────┬─────┘  └────┬─────┘
             │              │              │
             └──────────────┼──────────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │  PG Pool │  │  Vector  │  │  Redis   │ ← Session cache
        │(Pgbouncer│  │  DB      │  │  Cache   │   + rate limiting
        │ → PG 16) │  │ (Chroma  │  │          │
        │          │  │  Cloud)  │  │          │
        └──────────┘  └──────────┘  └──────────┘
```

**Key Scaling Actions:**

| Action | Impact | Effort |
|---|---|---|
| **Run Uvicorn with `--workers 4`** | 4× throughput per instance | Trivial |
| **Horizontal pod scaling** (3–5 replicas) | Linear throughput increase | Low |
| **Migrate ChromaDB → Chroma Cloud / Pinecone** | Eliminates disk I/O bottleneck, enables shared vector store | Medium |
| **Add Redis caching** | Cache fit scores, CV status, dashboard stats; reduce DB load | Medium |
| **PgBouncer connection pooling** | Handle 10K+ concurrent DB connections | Low |
| **Upgrade Gemini to paid tier** | Remove 15 RPM rate limit → 2000 RPM | Config change |
| **Switch embeddings to API-based** (e.g., `text-embedding-004`) | Eliminate PyTorch dependency, reduce memory from 2GB to 256MB per replica | Medium |
| **Async background jobs** (Celery + Redis) | Offload CV processing, job search enrichment | Medium |

### Estimated Cost per User/Month (at 10,000 Users)

#### Assumptions
- Average user: 5 chat messages/day, 2 job searches/day, 1 CV upload/month
- 30% DAU (3,000 active users/day)
- Peak concurrency: ~300 simultaneous users

| Resource | Service | Specification | Monthly Cost | Per-User Cost |
|---|---|---|---|---|
| **Compute (Backend)** | Render / GCP | 3 × Standard (2GB, 1 vCPU) | $75 | $0.0075 |
| **Frontend Hosting** | Vercel Pro | Edge-deployed Next.js | $20 | $0.002 |
| **PostgreSQL** | Render / Neon | 1GB RAM, 10GB storage | $25 | $0.0025 |
| **Vector Database** | Chroma Cloud / Pinecone | 10K collections, ~50M vectors | $70 | $0.007 |
| **Gemini API (LLM)** | Google AI | ~450K requests/month (pay-as-you-go) | $45 | $0.0045 |
| **Serper.dev (Jobs)** | Serper.dev | ~180K searches/month | $50 | $0.005 |
| **Persistent Storage** | Render Disk | 5GB for uploads | $1.25 | $0.000125 |
| **Redis Cache** | Upstash / Render | 256MB | $10 | $0.001 |
| | | | **~$296/mo** | **~$0.03/user/mo** |

> **Summary: ~$0.03 per user/month at 10,000 users** — highly cost-efficient for an AI-powered application. The largest cost drivers are compute (GPU-free inference with sentence-transformers) and the LLM API.

### Key Bottlenecks Identified

| # | Bottleneck | Severity | Root Cause | Mitigation |
|---|---|---|---|---|
| 1 | **Gemini API rate limit** | 🔴 Critical | Free tier: 15 RPM (flash-lite), 5 RPM (flash). A single agent turn can consume 3–5 API calls | Upgrade to paid tier ($0.10/1M input tokens). Already mitigated with exponential backoff retry |
| 2 | **Sentence-Transformers memory** | 🟠 High | PyTorch + `all-MiniLM-L6-v2` requires ~1.5–2GB RAM per process at peak | Switch to API-based embeddings (Google `text-embedding-004`) or use ONNX runtime |
| 3 | **ChromaDB local filesystem** | 🟠 High | Per-user collections stored on local disk. Not shared across replicas. Ephemeral on serverless platforms | Migrate to Chroma Cloud or Pinecone for shared, persistent vector storage |
| 4 | **Synchronous embedding** | 🟡 Medium | CV upload blocks the request thread during embedding (~5–15s for a multi-page CV) | Move to background job queue (Celery/Redis) for async processing |
| 5 | **Agent executor cold start** | 🟡 Medium | First agent call per conversation builds the full LangChain graph (~500ms). Cached afterward | Pre-warm agent cache on startup; already mitigated with per-conversation caching |
| 6 | **Single-process DB sessions** | 🟡 Medium | SQLAlchemy sessions are request-scoped; no connection pooling at high concurrency | Add PgBouncer or SQLAlchemy's built-in pool with `pool_size=20, max_overflow=30` |
| 7 | **Frontend API calls are sequential** | 🟢 Low | Dashboard loads stats, then activity, then renders. No parallel fetching | Use `Promise.all()` for parallel data fetching or React Suspense with streaming |

---

## 🔑 API Keys & Configuration

| Key | Required | Source | Free Tier |
|---|---|---|---|
| `GOOGLE_API_KEY` | ✅ Yes | [Google AI Studio](https://aistudio.google.com/apikey) | 15 RPM / 1000 RPD (flash-lite) |
| `SERPAPI_API_KEY` | ❌ Optional | [Serper.dev](https://serper.dev/) | 2,500 searches free |
| `DATABASE_URL` | ✅ Yes (auto in Docker) | PostgreSQL connection string | — |
| `JWT_SECRET_KEY` | ✅ Yes | Any random 32+ char string | — |

> Without job API keys, the Job Hunter uses realistic mock data for demo purposes (12 curated job listings).

---

## 🏆 Built For

**CodeSprint 2026** — by Team CareerPilot

---

<p align="center">
  <sub>Built with ❤️ using FastAPI, LangChain, Google Gemini, ChromaDB, Next.js, and PostgreSQL</sub>
</p>
