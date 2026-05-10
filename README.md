# Datastraw — News Intelligence Platform

An AI-powered news intelligence platform with three standalone features built on **LangGraph**, **Groq LLaMA 3.3**, and **Whisper AI**.

![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat&logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js_14-000000?style=flat&logo=next.js&logoColor=white)
![LangGraph](https://img.shields.io/badge/LangGraph-1C3A5E?style=flat)
![Groq](https://img.shields.io/badge/Groq_LLaMA_3.3-F55036?style=flat)
![Whisper](https://img.shields.io/badge/Whisper_AI-412991?style=flat)

---

## Features

### 🤖 News Intelligence Agent
Real-time web search across multiple sources with a LangGraph agent. Includes Human-in-the-Loop (HITL) interrupts to **Detect Media Bias**, **Dive Deeper**, **Track Story Timeline**, or **Generate a PDF Report**.

### 📄 RAG Chatbot
Upload any newspaper or document PDF and chat with it. Supports **Hybrid mode** (PDF + live web search simultaneously), source citations with page numbers, and HITL clarification flow.

### 📺 News Broadcast Analyzer
Paste a YouTube URL or upload a video/audio file. **Whisper AI transcribes it locally**, Groq LLaMA extracts key events, people, topics and sentiment. Chat with the full transcript via RAG and export a PDF report.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, Framer Motion |
| Backend | FastAPI, Python 3.11+ |
| LLM | Groq (LLaMA 3.3 70B Versatile) |
| Agent Framework | LangGraph with SQLite checkpointer |
| Embeddings | sentence-transformers (all-MiniLM-L6-v2) |
| Vector Store | FAISS (in-memory, per-session) |
| Transcription | OpenAI Whisper (runs locally, no API cost) |
| Web Search | Tavily Search API |
| News Data | NewsData.io API |
| Database | Supabase (PostgreSQL) |
| Observability | LangSmith |
| Streaming | Server-Sent Events (SSE) |

---

## Prerequisites

- **Python 3.11+**
- **Node.js 18+**
- **ffmpeg** (required for Whisper audio processing)

**Install ffmpeg:**
```bash
# macOS
brew install ffmpeg

# Ubuntu / Debian
sudo apt install ffmpeg

# Windows
winget install ffmpeg
```

---

## Setup (Under 5 Minutes)

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
```

### 2. Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env
# → Open .env and fill in your API keys (see section below)
```

### 3. Frontend

```bash
cd frontend

# Install dependencies
npm install

# Set up environment variables
cp .env.local.example .env.local
# NEXT_PUBLIC_API_URL=http://localhost:8000 is already set — no changes needed
```

### 4. Start the app

**Terminal 1 — Backend:**
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

Visit **http://localhost:3000** ✅

---

## API Keys

All keys have a free tier — no credit card required for any of them.

| Key | Service | Get it here | Free limit |
|---|---|---|---|
| `GROQ_API_KEY` | LLM (LLaMA 3.3) | [console.groq.com](https://console.groq.com) | Generous free tier |
| `TAVILY_API_KEY` | Web search | [app.tavily.com](https://app.tavily.com) | 1,000 searches/month |
| `NEWSDATA_API_KEY` | News articles | [newsdata.io](https://newsdata.io) | 200 requests/day |
| `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` | Database | [supabase.com](https://supabase.com) | 500MB free |
| `LANGCHAIN_API_KEY` | Tracing (optional) | [smith.langchain.com](https://smith.langchain.com) | Free |

> To disable LangSmith tracing, set `LANGCHAIN_TRACING_V2=false` in your `.env`.

---

## Supabase Table Setup

After creating a Supabase project, run this SQL in the **Supabase SQL Editor**:

```sql
create table chat_sessions (
  id           uuid default gen_random_uuid() primary key,
  thread_id    text not null,
  agent_type   text not null,
  session_name text,
  last_query   text,
  updated_at   timestamptz default now()
);

create table pdf_documents (
  id           uuid default gen_random_uuid() primary key,
  thread_id    text not null,
  filename     text,
  chunk_count  int,
  page_count   int,
  created_at   timestamptz default now()
);
```

---

## Project Structure

```
datastraw/
├── backend/
│   ├── app/
│   │   ├── agents/
│   │   │   ├── news_agent/          # News Intelligence Agent
│   │   │   │   ├── state.py         # LangGraph TypedDict state
│   │   │   │   ├── tools.py         # Tavily search, NewsData tools
│   │   │   │   ├── nodes.py         # Individual graph nodes
│   │   │   │   └── graph.py         # Graph definition + SSE streaming
│   │   │   ├── rag_agent/           # RAG Chatbot Agent
│   │   │   └── broadcast_agent/     # Broadcast Analyzer Agent
│   │   │       ├── tools.py         # yt-dlp, Whisper, FAISS helpers
│   │   │       ├── nodes.py         # Processing pipeline nodes
│   │   │       └── graph.py         # Graph + SSE streaming
│   │   ├── routers/
│   │   │   ├── agent_router.py      # /api/agent endpoints
│   │   │   ├── rag_router.py        # /api/rag endpoints
│   │   │   └── broadcast_router.py  # /api/broadcast endpoints
│   │   ├── database/
│   │   │   ├── supabase_client.py   # Session storage
│   │   │   └── sqlite_checkpointer.py  # LangGraph persistence
│   │   ├── utils/
│   │   │   ├── embeddings.py        # FAISS + sentence-transformers
│   │   │   └── pdf_generator.py     # ReportLab PDF reports
│   │   ├── config.py                # Pydantic settings
│   │   └── main.py                  # FastAPI app
│   ├── .env.example
│   └── requirements.txt
│
└── frontend/
    ├── app/
    │   ├── page.tsx                 # Landing page
    │   ├── agent/page.tsx           # News Agent page
    │   ├── rag/page.tsx             # RAG Chatbot page
    │   └── broadcast/page.tsx       # Broadcast Analyzer page
    ├── components/
    │   ├── agent/                   # AgentChat, BiasHeatmap, etc.
    │   ├── rag/                     # RAGChat, PDFUploader, etc.
    │   └── broadcast/               # BroadcastChat, ProcessingProgress, etc.
    ├── lib/
    │   ├── streaming.ts             # useAgentStream SSE hook
    │   ├── api.ts                   # API client
    │   └── types.ts                 # TypeScript interfaces
    └── .env.local.example
```

---

## API Endpoints

### News Agent — `/api/agent`
| Method | Endpoint | Description |
|---|---|---|
| POST | `/chat` | Stream agent response (SSE) |
| POST | `/action` | Resume from HITL interrupt |
| GET | `/sessions` | List all sessions |
| GET | `/sessions/{thread_id}/history` | Get session messages |
| DELETE | `/sessions/{thread_id}` | Delete session |
| GET | `/pdf/{thread_id}` | Download PDF report |

### RAG Chatbot — `/api/rag`
Same structure as above, plus `POST /upload` for PDF ingestion.

### Broadcast Analyzer — `/api/broadcast`
Same structure as above, plus `POST /upload` for video/audio files and `POST /analyze` for YouTube URLs.

---

## How It Works

### LangGraph HITL (Human-in-the-Loop)
Each agent uses a `NodeInterrupt` checkpoint. After the first answer is generated, the graph **pauses and sends an `interrupted` SSE event** to the frontend with available actions. When the user clicks an action button, the frontend calls `/action` which resumes the graph from the saved checkpoint.

### Real-time Streaming
All processing steps are streamed to the frontend via **Server-Sent Events**. The Broadcast Analyzer shows each pipeline step (Downloading → Transcribing → Chunking → Embedding → Analyzing) live on screen as they execute.

### Whisper Transcription
Whisper runs **locally on your machine** — no API calls, no cost. The `base` model (~145MB, auto-downloaded on first run) transcribes a 5-minute video in approximately 60–90 seconds on CPU.

---

## License

MIT
