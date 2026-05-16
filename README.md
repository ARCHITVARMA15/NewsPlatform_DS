# Datastraw — News Intelligence Platform

A full-stack AI-powered news intelligence platform built on **LangGraph**, **Groq LLaMA 3.3**, and **Whisper AI** — featuring real-time event detection, collaborative research rooms, a Chrome extension, and integrations with Notion, Slack, and Google Drive.

![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat&logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js_14-000000?style=flat&logo=next.js&logoColor=white)
![LangGraph](https://img.shields.io/badge/LangGraph-1C3A5E?style=flat)
![Groq](https://img.shields.io/badge/Groq_LLaMA_3.3-F55036?style=flat)
![Whisper](https://img.shields.io/badge/Whisper_AI-412991?style=flat)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat&logo=supabase&logoColor=white)
![Chrome Extension](https://img.shields.io/badge/Chrome_Extension-4285F4?style=flat&logo=googlechrome&logoColor=white)

---

## Features

### 🤖 News Intelligence Agent
Real-time web search with a LangGraph agent. HITL interrupts for **Detect Media Bias**, **Dive Deeper**, **Track Story Timeline**, and **Generate PDF Report**. Streams every reasoning step via SSE.

### 📄 RAG Chatbot
Upload newspaper PDFs or import directly from **Google Drive** (public share links). Supports **Hybrid mode** (PDF + live web search), source citations with page numbers, and HITL clarification flow.

### 📺 News Broadcast Analyzer
Paste a YouTube URL or upload video/audio. **Whisper AI transcribes locally**, Groq LLaMA extracts events, sentiment and entities. Chat with the transcript and export a PDF report.

### 📊 Intelligence Dashboard
Auto-runs a news pipeline hourly (APScheduler). Surfaces trending articles, sentiment breakdown, keyword clouds, and category distribution.

### 🚨 Real-time Breaking Event Detection
DBSCAN clustering on article embeddings detects breaking news clusters every hour. Events are broadcast to all connected clients via SSE. Fires **Slack alerts** instantly to `#news-alerts`.

### 📰 AI News Briefing
Generates a broadcast-style script from top articles via Groq LLaMA, converts it to voice with **ElevenLabs**, and optionally generates a **D-ID talking-head video**. Posts the briefing summary to **Slack** automatically.

### 🧠 Knowledge Graph
Interactive D3 force-directed graph of entities, sources, and topics extracted from the news pipeline. Visualizes relationships between people, organisations, and events.

### ⚔️ Debate Arena
Two AI agents argue opposite sides of a news story. Streams the debate in real time with structured arguments, rebuttals, and a final verdict.

### 👥 Collaborative Research Rooms
Create or join a 6-character research room. Multiple users share a live session — run News Agent queries together, see each other's results in real time via SSE, upvote insights, add annotations, and export the full session as a **PDF** or directly to a **Notion page**.

### 🔌 Chrome Extension
Install into Chrome as an unpacked extension. On any news article, click the ⚡ icon to get an instant AI analysis sidebar — summary, sentiment score, political bias meter, key insights, and key entities — without leaving the page.

### 🔗 Integrations
| Integration | What it does |
|---|---|
| **Slack** | Breaking event alerts + daily briefing posted to `#news-alerts` channel |
| **Notion** | Export Research Room sessions as structured Notion pages with Q&A, insights, and annotations |
| **Google Drive** | Import public Drive PDFs directly into the RAG chatbot — no manual download needed |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, Framer Motion |
| State Management | Redux Toolkit + Redux Persist (conversations survive navigation) |
| Auth | Supabase Auth (email/password + Google OAuth) |
| Backend | FastAPI, Python 3.11+ |
| LLM | Groq (LLaMA 3.3 70B Versatile) |
| Agent Framework | LangGraph with SQLite checkpointer |
| Embeddings | sentence-transformers (all-MiniLM-L6-v2) |
| Vector Store | FAISS (in-memory, per-session) |
| Event Detection | scikit-learn DBSCAN on article embeddings |
| Transcription | OpenAI Whisper (runs locally, no API cost) |
| Voice Synthesis | ElevenLabs TTS |
| Video Generation | D-ID talking-head (optional) |
| Web Search | Tavily Search API |
| News Data | NewsData.io API |
| Database | Supabase (PostgreSQL + Realtime) |
| Scheduler | APScheduler (hourly pipeline + event detection) |
| Notifications | Slack Incoming Webhooks |
| Knowledge Export | Notion REST API |
| File Import | Google Drive (public share links via httpx) |
| Observability | LangSmith |
| Streaming | Server-Sent Events (SSE) |
| Chrome Extension | Manifest V3, content scripts, background service worker |

---

## Prerequisites

- **Python 3.11+**
- **Node.js 18+**
- **ffmpeg** (required for Whisper audio processing)

```bash
# macOS
brew install ffmpeg

# Ubuntu / Debian
sudo apt install ffmpeg

# Windows
winget install ffmpeg
```

---

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
```

### 2. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# → Fill in your API keys
```

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
# → Fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
# NEXT_PUBLIC_API_URL defaults to http://localhost:8000
```

### 4. Start

```bash
# Terminal 1 — Backend
cd backend && source venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend && npm run dev
```

Visit **http://localhost:3000** ✅

### 5. Chrome Extension (optional)

1. Open `chrome://extensions/` → enable **Developer mode**
2. Click **Load unpacked** → select the `chrome-extension/` folder
3. Pin the ⚡ Datastraw icon in your toolbar
4. Navigate to any news article and click **Analyze This Article**

---

## API Keys

| Key | Service | Where to get it | File | Required? |
|---|---|---|---|---|
| `GROQ_API_KEY` | LLM | [console.groq.com](https://console.groq.com) | backend `.env` | ✅ Yes |
| `TAVILY_API_KEY` | Web search | [app.tavily.com](https://app.tavily.com) | backend `.env` | ✅ Yes |
| `NEWSDATA_API_KEY` | News articles | [newsdata.io](https://newsdata.io) | backend `.env` | ✅ Yes |
| `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` | Database | [supabase.com](https://supabase.com) | backend `.env` | ✅ Yes |
| `SUPABASE_JWT_SECRET` | Auth token verification | Supabase Dashboard → Settings → JWT Keys → Legacy JWT Secret | backend `.env` | ✅ Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | Auth (frontend) | Same Supabase project URL | frontend `.env.local` | ✅ Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Auth (frontend) | Supabase Dashboard → API → anon public key | frontend `.env.local` | ✅ Yes |
| `LANGCHAIN_API_KEY` | Tracing | [smith.langchain.com](https://smith.langchain.com) | backend `.env` | Optional |
| `ELEVENLABS_API_KEY` | Voice synthesis | [elevenlabs.io](https://elevenlabs.io) | backend `.env` | Optional |
| `DID_API_KEY` | Talking-head video | [d-id.com](https://www.d-id.com) | backend `.env` | Optional |
| `SLACK_WEBHOOK_URL` | Slack alerts | [api.slack.com/apps](https://api.slack.com/apps) → Incoming Webhooks | backend `.env` | Optional |
| `NOTION_TOKEN` + `NOTION_DATABASE_ID` | Notion export | [notion.so/my-integrations](https://www.notion.so/my-integrations) | backend `.env` | Optional |

> Set `LANGCHAIN_TRACING_V2=false` to disable LangSmith tracing.  
> `DID_API_KEY` must be Base64-encoded as `"email:api_key"` — see `backend/.env.example` for instructions.  
> `SUPABASE_JWT_SECRET` is the **Legacy JWT Secret (HS256)** — find it under Dashboard → Settings → JWT Keys → "Legacy JWT Secret" tab.

---

## Supabase Setup

Run this SQL once in the **Supabase SQL Editor**:

```sql
-- Core tables
CREATE TABLE IF NOT EXISTS articles ( ... );         -- populated by news pipeline
CREATE TABLE IF NOT EXISTS chat_sessions ( ... );    -- agent + RAG sessions
CREATE TABLE IF NOT EXISTS pdf_documents ( ... );    -- RAG PDF metadata
CREATE TABLE IF NOT EXISTS breaking_events ( ... );  -- detected event clusters
CREATE TABLE IF NOT EXISTS briefings ( ... );        -- generated AI briefings

-- Collaborative Research Rooms
CREATE TABLE IF NOT EXISTS rooms (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code   text        UNIQUE NOT NULL,
  created_by  text,
  created_at  timestamptz DEFAULT now(),
  expires_at  timestamptz DEFAULT now() + interval '24 hours',
  topic       text,
  is_active   boolean     DEFAULT true
);

CREATE TABLE IF NOT EXISTS room_messages (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code    text        REFERENCES rooms(room_code),
  user_id      text,
  user_name    text,
  message_type text,
  content      text,
  metadata     jsonb,
  created_at   timestamptz DEFAULT now()
);
```

Full DDL for all tables is embedded as comments in each router file.

---

## Project Structure

```
datastraw/
├── backend/
│   ├── app/
│   │   ├── agents/
│   │   │   ├── news_agent/          # News Intelligence Agent (LangGraph)
│   │   │   ├── rag_agent/           # RAG Chatbot Agent (LangGraph)
│   │   │   └── broadcast_agent/     # Broadcast Analyzer (Whisper + LangGraph)
│   │   ├── routers/
│   │   │   ├── pipeline_router.py   # /api/pipeline — news ingestion pipeline
│   │   │   ├── agent_router.py      # /api/agent — News Intelligence Agent (auth-gated)
│   │   │   ├── rag_router.py        # /api/rag — RAG chatbot + Drive import (auth-gated)
│   │   │   ├── broadcast_router.py  # /api/broadcast — YouTube/video analysis
│   │   │   ├── dashboard_router.py  # /api/dashboard — stats and feeds
│   │   │   ├── briefing_router.py   # /api/briefing — AI news briefing
│   │   │   ├── debate_router.py     # /api/debate — AI debate arena (auth-gated)
│   │   │   ├── graph_router.py      # /api/graph — knowledge graph
│   │   │   ├── events_router.py     # /api/events — breaking event SSE stream
│   │   │   └── rooms_router.py      # /api/rooms — collaborative research rooms
│   │   ├── middleware/
│   │   │   └── auth_middleware.py   # Supabase JWT verification (get_current_user)
│   │   ├── services/
│   │   │   ├── event_detector.py    # DBSCAN clustering + Slack alerts
│   │   │   └── slack_service.py     # Slack webhook notification helpers
│   │   ├── pipelines/
│   │   │   └── news_pipeline.py     # Hourly article fetch + embed pipeline
│   │   ├── database/
│   │   │   ├── supabase_client.py   # Supabase client + CRUD helpers
│   │   │   └── sqlite_checkpointer.py  # LangGraph SQLite persistence
│   │   ├── utils/
│   │   │   ├── embeddings.py        # FAISS + sentence-transformers
│   │   │   └── pdf_generator.py     # ReportLab PDF report generator
│   │   ├── config.py                # Pydantic settings (reads .env)
│   │   └── main.py                  # FastAPI app + APScheduler lifespan
│   ├── .env.example
│   └── requirements.txt
│
├── frontend/
│   ├── app/
│   │   ├── layout.tsx               # Root layout (Redux + Auth providers)
│   │   ├── page.tsx                 # Root redirect (→ /login or /dashboard)
│   │   ├── login/page.tsx           # Email/password + Google OAuth login
│   │   ├── auth/callback/route.ts   # Supabase OAuth callback handler
│   │   ├── dashboard/page.tsx       # Intelligence feed
│   │   ├── agent/page.tsx           # News Intelligence Agent
│   │   ├── rag/page.tsx             # RAG Chatbot + Drive import
│   │   ├── broadcast/page.tsx       # Broadcast Analyzer
│   │   ├── briefing/page.tsx        # AI News Briefing
│   │   ├── debate/page.tsx          # Debate Arena
│   │   ├── graph/page.tsx           # Knowledge Graph
│   │   └── rooms/page.tsx           # Collaborative Research Rooms
│   ├── components/
│   │   ├── auth/
│   │   │   ├── AuthProvider.tsx     # Supabase session sync → Redux
│   │   │   └── UserAvatar.tsx       # User menu + sign-out in sidebar
│   │   ├── agent/                   # AgentChat, BiasHeatmap, etc.
│   │   ├── rag/                     # RAGChat, PDFUploader (w/ Drive tab)
│   │   ├── broadcast/               # BroadcastChat, ProcessingProgress
│   │   ├── briefing/                # BriefingPlayer, BriefingCard
│   │   ├── debate/                  # DebateArena, ArgumentBubble
│   │   ├── dashboard/               # ArticleCard, StatsGrid, etc.
│   │   ├── graph/                   # KnowledgeGraph (D3 force-directed)
│   │   ├── rooms/                   # RoomLobby, RoomSession
│   │   └── shared/                  # Sidebar, ThreadHistory
│   ├── store/
│   │   ├── index.ts                 # Redux store + redux-persist config
│   │   ├── hooks.ts                 # useAppDispatch, useAgentState, etc.
│   │   ├── Provider.tsx             # <ReduxProvider> + <PersistGate>
│   │   └── slices/
│   │       ├── authSlice.ts         # User identity + access token
│   │       ├── agentSlice.ts        # Agent conversation (messages, threadId)
│   │       ├── ragSlice.ts          # RAG conversation + PDF metadata
│   │       ├── debateSlice.ts       # Debate topic, history, phase, conclusion
│   │       └── uiSlice.ts           # Sidebar collapse and UI preferences
│   ├── lib/
│   │   ├── streaming.ts             # useAgentStream — SSE hook backed by Redux
│   │   ├── api.ts                   # API client (auth headers, Drive, Notion)
│   │   ├── supabase/
│   │   │   ├── client.ts            # Browser-side Supabase client
│   │   │   └── server.ts            # Server-side Supabase client (SSR cookies)
│   │   ├── types.ts                 # TypeScript interfaces
│   │   └── utils.ts                 # cn() and shared helpers
│   ├── middleware.ts                # Next.js route protection (auth guard)
│   ├── .env.example                 # Frontend env template
│   └── package.json
│
└── chrome-extension/
    ├── manifest.json                # Manifest V3
    ├── background.js                # Service worker (fetch proxy)
    ├── content.js                   # Injected sidebar + analysis UI
    ├── popup.html / popup.js        # Toolbar popup
    ├── sidebar.css                  # Sidebar styles
    └── icons/                       # 16px, 48px, 128px icons
```

---

## API Endpoints

### News Pipeline — `/api/pipeline`
| Method | Endpoint | Description |
|---|---|---|
| POST | `/run` | Run the news ingestion pipeline |
| GET | `/status` | Pipeline run status |
| POST | `/analyze-url` | Analyze a single article URL (used by Chrome extension) |

### News Agent — `/api/agent`
| Method | Endpoint | Description |
|---|---|---|
| POST | `/chat` | Stream agent response (SSE) |
| POST | `/action` | Resume from HITL interrupt |
| GET | `/sessions` | List sessions |
| DELETE | `/sessions/{id}` | Delete session |
| GET | `/pdf/{id}` | Download PDF report |

### RAG Chatbot — `/api/rag`
| Method | Endpoint | Description |
|---|---|---|
| POST | `/upload-pdf` | Upload PDF for ingestion |
| POST | `/upload-drive` | Import PDF from public Google Drive link |
| POST | `/chat` | Stream RAG response (SSE) |
| POST | `/action` | Resume from HITL interrupt |
| GET | `/sessions` | List sessions |

### Briefing — `/api/briefing`
| Method | Endpoint | Description |
|---|---|---|
| POST | `/generate` | Generate AI briefing (voice + optional video) |
| GET | `/latest` | Fetch last 5 briefings |

### Breaking Events — `/api/events`
| Method | Endpoint | Description |
|---|---|---|
| GET | `/stream` | SSE stream of detected breaking events |
| GET | `/latest` | Latest detected events |
| POST | `/detect` | Trigger manual detection run |

### Research Rooms — `/api/rooms`
| Method | Endpoint | Description |
|---|---|---|
| POST | `/create` | Create a new research room |
| POST | `/join` | Join an existing room |
| GET | `/{code}/stream` | SSE stream of room messages |
| POST | `/{code}/query` | Run News Agent query (streams + broadcasts to room) |
| POST | `/{code}/annotate` | Add annotation to a message |
| POST | `/{code}/upvote` | Upvote a message |
| GET | `/{code}/export-pdf` | Export session as PDF |
| POST | `/{code}/export-notion` | Export session to a Notion page |
| DELETE | `/{code}` | Close room |

---

## How It Works

### LangGraph HITL (Human-in-the-Loop)
Each agent uses a `NodeInterrupt` checkpoint. After generating an initial answer the graph **pauses** and emits an `interrupted` SSE event listing available actions. The frontend calls `/action` to resume from the saved SQLite checkpoint.

### Real-time Event Detection
Every hour, APScheduler fetches recent articles, embeds them with sentence-transformers, and runs **DBSCAN clustering**. Clusters with ≥4 articles are named by Groq LLaMA and persisted to Supabase. Each detected event is broadcast to SSE subscribers **and** posted to Slack.

### Collaborative Rooms
Rooms use Supabase as a message store + SSE polling (500ms interval) for real-time delivery without a WebSocket server. Each agent query streams to the requester and simultaneously inserts step/result messages into `room_messages` so all connected participants see the same results.

### Chrome Extension Architecture
Content scripts on HTTPS pages cannot directly call `http://localhost:8000` due to mixed-content blocking. The extension routes all backend calls through the **background service worker** (which runs in an extension context and can call HTTP freely), bypassing the restriction transparently.

### Slack + Notion Integrations
Both integrations are **fire-and-forget** — they never block or crash the main pipeline. Slack uses an Incoming Webhook URL (no bot token needed). Notion uses the official REST API with an Internal Integration token scoped to a single database.

---

## License

MIT
