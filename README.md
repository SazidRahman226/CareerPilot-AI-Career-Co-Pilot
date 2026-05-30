# 🚀 CareerPilot — AI Career Co-Pilot

> An end-to-end agentic career co-pilot powered by RAG (Retrieval-Augmented Generation). Every recommendation, cover letter, and fit score is grounded in YOUR uploaded CV — no hallucinations.

## 🏗️ Architecture

- **Frontend**: Next.js 14 (App Router), Tailwind CSS, TypeScript
- **Backend**: Python FastAPI, LangChain, Google Gemini 3.0 Flash
- **Vector DB**: ChromaDB with sentence-transformers embeddings
- **Database**: PostgreSQL 16 (via SQLAlchemy)
- **Containerization**: Docker Compose

## ⚡ Quick Start (Docker)

```bash
# 1. Clone and navigate
cd CodeSprint2026

# 2. Set up environment variables
cp backend/.env.example backend/.env
# Edit backend/.env and add your GOOGLE_API_KEY

# 3. Run everything
docker compose up --build

# Frontend: http://localhost:3000
# Backend:  http://localhost:8000
# API Docs: http://localhost:8000/docs
```

## 🖥️ Local Development (Without Docker)

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Mac/Linux
pip install -r requirements.txt
cp .env.example .env           # Add your GOOGLE_API_KEY
python run.py
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## 🔑 API Keys

| Key | Required | Source |
|-----|----------|--------|
| `GOOGLE_API_KEY` | ✅ Yes | [Google AI Studio](https://aistudio.google.com/apikey) |
| `SERPAPI_API_KEY` | ❌ Optional | [SerpAPI](https://serpapi.com/) — for live web search |
| `ADZUNA_APP_ID` + `ADZUNA_APP_KEY` | ❌ Optional | [Adzuna](https://developer.adzuna.com/) — for job board data |

> Without job API keys, the Job Hunter uses realistic mock data for demo purposes.

## 🎯 The Five Pillars

### 1. 🔍 Job Hunter Agent
- Natural language search ("Find ML internships in Dhaka")
- Triple-source: SerpAPI Web + SerpAPI Jobs + Adzuna API
- Smart deduplication across sources
- Each result enriched with CV-based fit score

### 2. 📄 Profile & Resume Intelligence (RAG Core)
- Upload PDF/DOCX CV
- Intelligent semantic chunking (500 char chunks, section-tagged)
- Local embeddings via sentence-transformers (free, no API key)
- ChromaDB vector store with cosine similarity

### 3. 🤖 Personal AI Assistant
- Conversational memory (20-message window)
- CV-grounded responses via RAG retrieval
- Tool calling: job search, fit score, CV analysis
- Handles: readiness checks, skill gaps, roadmaps, cover letters

### 4. ✨ AI CV Builder
- Generate professional CVs from profile data
- Multiple template styles
- Export to PDF
- Powered by Google Gemini AI

### 5. 📋 Productivity & Progress Tracker
- 5-column Kanban board (Wishlist → Applied → Interviewing → Offer → Rejected)
- Drag-and-drop with native HTML5 API
- PostgreSQL-backed persistence
- Dashboard with stats, activity feed, AI nudges

## 📁 Project Structure

```
CodeSprint2026/
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── run.py
│   └── app/
│       ├── main.py              # FastAPI entry point
│       ├── config.py            # Settings
│       ├── database.py          # PostgreSQL/SQLAlchemy
│       ├── routers/             # API endpoints
│       │   ├── auth.py          # Authentication (JWT)
│       │   ├── cv.py            # CV upload
│       │   ├── cv_builder.py    # AI CV generation
│       │   ├── chat.py          # AI chat
│       │   ├── jobs.py          # Job search
│       │   └── tracker.py       # Kanban + Todos
│       ├── services/            # Business logic
│       │   ├── cv_processor.py  # PDF parsing + chunking
│       │   ├── cv_generator.py  # AI CV generation
│       │   ├── vector_store.py   # ChromaDB operations
│       │   ├── agent.py         # LangChain agent
│       │   ├── auth_service.py  # JWT handling
│       │   ├── fit_score.py     # Programmatic scoring
│       │   └── job_search.py    # Multi-source search
│       └── models/              # Data models
│           ├── schemas.py       # Pydantic schemas
│           └── db_models.py     # SQLAlchemy ORM
└── frontend/
    ├── Dockerfile
    └── src/
        ├── app/                 # Next.js pages
        │   ├── page.tsx         # Dashboard
        │   ├── login/page.tsx   # Authentication
        │   ├── chat/page.tsx    # AI Assistant
        │   ├── cv-builder/page.tsx # AI CV Builder
        │   ├── jobs/page.tsx    # Job Hunter
        │   ├── tracker/page.tsx # Kanban Board
        │   └── profile/page.tsx # CV Upload
        ├── components/          # React components
        ├── contexts/             # Auth & CV state contexts
        ├── hooks/                # Custom hooks
        └── lib/                 # Utilities
```

## 🧪 Testing

```bash
# Health check
curl http://localhost:8000/health

# Register
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "secret123"}'

# Login
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "secret123"}'

# Upload CV
curl -X POST http://localhost:8000/api/cv/upload -F "file=@your_cv.pdf"

# Search jobs
curl -X POST http://localhost:8000/api/jobs/search \
  -H "Content-Type: application/json" \
  -d '{"query": "ML internships in Dhaka"}'

# Chat
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What are my top skills?"}'
```

## 🏆 Built for CodeSprint 2026 by Team CareerPilot
