# 🚀 Datastraw AI News Intelligence Platform — Complete Implementation Plan
> **Stack:** Next.js (Frontend) · LangGraph (Backend) · Groq LLaMA-3.3-70B · SQLite (Checkpointer) · LangSmith (Observability) · NewsData.io · Tavily (Web Search) · Supabase (DB)

---

## 🧠 ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────────┐
│                     NEXT.JS FRONTEND                            │
│  ┌──────────────────┐    ┌──────────────────────────────────┐   │
│  │  Agent Chatbot   │    │      RAG Chatbot                 │   │
│  │  (Tab 1)         │    │  (Tab 2 — PDF Upload + Web)      │   │
│  └──────────────────┘    └──────────────────────────────────┘   │
│         │ Streaming SSE                  │ Streaming SSE        │
└─────────┼──────────────────────────────-┼─────────────────────-┘
          │                               │
┌─────────▼───────────────────────────────▼─────────────────────-┐
│                  FASTAPI BACKEND (Python)                        │
│  ┌────────────────────────┐  ┌──────────────────────────────┐   │
│  │  LangGraph Agent       │  │  LangGraph RAG Agent         │   │
│  │  (News Intelligence)   │  │  (PDF + Web Hybrid)          │   │
│  │                        │  │                              │   │
│  │  Nodes:                │  │  Nodes:                      │   │
│  │  - query_planner       │  │  - pdf_ingestion             │   │
│  │  - web_search          │  │  - vector_retriever          │   │
│  │  - source_validator    │  │  - web_search                │   │
│  │  - insight_generator   │  │  - context_merger            │   │
│  │  - human_in_loop       │  │  - answer_generator          │   │
│  │  - pdf_generator       │  │  - human_in_loop             │   │
│  │  - dive_deeper         │  │                              │   │
│  │  - bias_detector       │  │                              │   │
│  └────────────────────────┘  └──────────────────────────────┘   │
│                                                                  │
│  SQLite Checkpointer (Thread Persistence + Resume)               │
│  LangSmith Tracing (Full Observability)                         │
│  Supabase (Article Storage + Vector Embeddings)                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 💡 USPs & COMPETITIVE DIFFERENTIATORS (READ THIS CAREFULLY)

Here are your killer USPs beyond what you described. These will make your project stand out:

### USP 1: 🔍 Media Bias Detector (UNIQUE)
Instead of "Compare Different Platforms" — replace it with a **Media Bias & Credibility Score** button. When clicked, the agent compares coverage of the same story across left-leaning, right-leaning, and centrist sources and shows a **bias heatmap** — showing what angle each outlet takes. This is far more impressive than just comparing sources.

### USP 2: 📈 News Trend Timeline (UNIQUE)
A "**Track This Story**" button that calls the NewsData.io API to fetch historical articles on the same topic and renders a **timeline visualization** showing how the narrative evolved over time. Very impressive for a news platform.

### USP 3: 🎯 Confidence Score per Insight
Every AI-generated insight card shows a **confidence percentage** (computed by how many sources corroborate that insight). This shows critical thinking about AI reliability.

### USP 4: 🗣️ Voice Query Input
Add a mic button using the Web Speech API — users can speak their query. Zero extra backend cost, huge wow factor.

### USP 5: 📊 Live Sentiment Dashboard Tab
A separate dashboard tab showing **real-time sentiment trends** from the stored articles in Supabase — a chart per category (politics, tech, sports, etc.) showing positive/negative/neutral over time.

### USP 6: 🔔 Smart Alert System
Users can set a "keyword alert" — the backend polls NewsData.io every 30 min, and if a new article matches, it sends an in-app notification (via Supabase Realtime). Very D2C relevant for Datastraw's use case.

### USP 7: 🤖 "Explain Like I'm 5" Mode
A toggle on any article that re-summarizes it in simple language using a separate Groq call. Shows contextual AI usage.

### USP 8: 🧵 Thread-Aware Conversations
Because you're using SQLite checkpointer, conversations remember context across sessions. Prominently show this — "Resuming your session from [date]" banner.

---

## 📁 PROJECT STRUCTURE

```
datastraw-news-intel/
├── backend/
│   ├── app/
│   │   ├── main.py                    # FastAPI entry point
│   │   ├── config.py                  # All env vars & settings
│   │   ├── database/
│   │   │   ├── supabase_client.py     # Supabase connection
│   │   │   ├── sqlite_checkpointer.py # LangGraph SQLite checkpointer
│   │   │   └── models.py              # Pydantic & DB models
│   │   ├── pipelines/
│   │   │   ├── news_pipeline.py       # NewsData.io ETL pipeline
│   │   │   └── pdf_ingestion.py       # PDF chunking & embedding
│   │   ├── agents/
│   │   │   ├── news_agent/
│   │   │   │   ├── graph.py           # LangGraph graph definition
│   │   │   │   ├── nodes.py           # All node functions
│   │   │   │   ├── state.py           # AgentState TypedDict
│   │   │   │   ├── tools.py           # Tavily, NewsData tools
│   │   │   │   └── subgraphs/
│   │   │   │       ├── dive_deeper.py # Dive Deeper subgraph
│   │   │   │       └── bias_detector.py # Bias analysis subgraph
│   │   │   └── rag_agent/
│   │   │       ├── graph.py           # RAG LangGraph graph
│   │   │       ├── nodes.py           # RAG node functions
│   │   │       ├── state.py           # RAGState TypedDict
│   │   │       └── tools.py           # Vector search, web search tools
│   │   ├── routers/
│   │   │   ├── agent_router.py        # /api/agent/* endpoints
│   │   │   ├── rag_router.py          # /api/rag/* endpoints
│   │   │   ├── pipeline_router.py     # /api/pipeline/* endpoints
│   │   │   └── dashboard_router.py    # /api/dashboard/* endpoints
│   │   └── utils/
│   │       ├── pdf_generator.py       # ReportLab PDF generation
│   │       ├── embeddings.py          # Embedding utilities
│   │       └── streaming.py           # SSE streaming helpers
│   ├── requirements.txt
│   ├── .env.example
│   └── README.md
│
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                   # Landing / redirect
│   │   ├── dashboard/
│   │   │   └── page.tsx               # Main news dashboard
│   │   ├── agent/
│   │   │   └── page.tsx               # Agent Chatbot
│   │   └── rag/
│   │       └── page.tsx               # RAG Chatbot
│   ├── components/
│   │   ├── agent/
│   │   │   ├── AgentChat.tsx
│   │   │   ├── InsightCard.tsx
│   │   │   ├── HumanInLoopButtons.tsx
│   │   │   ├── BiasHeatmap.tsx
│   │   │   └── StreamingMessage.tsx
│   │   ├── rag/
│   │   │   ├── RAGChat.tsx
│   │   │   ├── PDFUploader.tsx
│   │   │   └── SourceCitations.tsx
│   │   ├── dashboard/
│   │   │   ├── ArticleCard.tsx
│   │   │   ├── SentimentChart.tsx
│   │   │   ├── TrendTimeline.tsx
│   │   │   └── FilterBar.tsx
│   │   └── shared/
│   │       ├── Sidebar.tsx
│   │       ├── ThreadHistory.tsx
│   │       └── VoiceInput.tsx
│   ├── lib/
│   │   ├── api.ts                     # API client
│   │   └── streaming.ts               # SSE client hook
│   └── package.json
```

---

## 🔄 AGENT 1: NEWS INTELLIGENCE AGENT — GRAPH FLOW

```
START
  │
  ▼
[query_planner]  ← Breaks query into sub-queries for parallel search
  │
  ▼
[web_search_node]  ← Calls Tavily API (5+ sources in parallel)
  │
  ▼
[source_validator]  ← Scores source credibility, deduplicates
  │
  ▼
[newsdata_fetcher]  ← Fetches related articles from NewsData.io
  │
  ▼
[insight_generator]  ← Groq LLaMA generates: summary, insights, sentiment
  │
  ▼
[HUMAN_IN_LOOP INTERRUPT] ← Streams result to user, waits for button click
  │
  ├── "Generate PDF" → [pdf_generator_node] → END
  ├── "Dive Deeper"  → [dive_deeper SUBGRAPH] → back to HUMAN_IN_LOOP
  ├── "Bias Detect"  → [bias_detector SUBGRAPH] → back to HUMAN_IN_LOOP
  └── "Track Story"  → [trend_timeline_node] → back to HUMAN_IN_LOOP
```

## 🔄 AGENT 2: RAG AGENT — GRAPH FLOW

```
START
  │
  ├── [pdf uploaded?] 
  │     YES → [pdf_ingestion_node] → chunk → embed → store in Supabase vector
  │     NO  → skip
  │
  ▼
[query_analyzer]  ← Decides: needs web? needs vector? needs both?
  │
  ├── [vector_retriever]  ← Similarity search in Supabase pgvector
  ├── [web_search_node]   ← Tavily parallel search
  │
  ▼
[context_merger]  ← Merges PDF context + web context with source labels
  │
  ▼
[answer_generator]  ← Groq generates answer with citations
  │
  ▼
[HUMAN_IN_LOOP INTERRUPT] ← Streams result, waits
  │
  ├── "Generate Report PDF" → [pdf_generator_node]
  ├── "Clarify from PDF only" → re-routes to vector_retriever only
  └── Continue conversation → loop back
```

---

## 🔧 ENVIRONMENT VARIABLES

```env
# LLM
GROQ_API_KEY=

# Search
TAVILY_API_KEY=

# News
NEWSDATA_API_KEY=

# Database
SUPABASE_URL=
SUPABASE_SERVICE_KEY=

# Observability
LANGSMITH_API_KEY=
LANGSMITH_PROJECT=datastraw-news-intel
LANGCHAIN_TRACING_V2=true

# App
SQLITE_DB_PATH=./checkpoints.db
FRONTEND_URL=http://localhost:3000
```

---

# 📋 WINDSURF PROMPTS — BACKEND FIRST

> **Instructions for using these prompts:**
> - Give ONE prompt at a time to Windsurf
> - After each prompt, run the code, test it, read and understand it
> - Only then move to the next prompt
> - Start in the `/backend` directory

---

## PROMPT 1 — Project Scaffold + Config + Models

```
Create the base scaffold for a FastAPI backend for an AI-Powered News Intelligence Platform.

Create exactly these files:
1. backend/requirements.txt
2. backend/.env.example  
3. backend/app/config.py
4. backend/app/main.py

--- requirements.txt should include ---
fastapi
uvicorn[standard]
langgraph
langchain
langchain-groq
langchain-community
langsmith
tavily-python
newsdata
supabase
python-dotenv
pydantic
aiohttp
reportlab
pypdf
sentence-transformers
faiss-cpu
aiosqlite
langgraph-checkpoint-sqlite
sse-starlette
python-multipart
httpx

--- .env.example should include ---
GROQ_API_KEY=your_groq_key
TAVILY_API_KEY=your_tavily_key
NEWSDATA_API_KEY=your_newsdata_key
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_key
LANGSMITH_API_KEY=your_langsmith_key
LANGSMITH_PROJECT=datastraw-news-intel
LANGCHAIN_TRACING_V2=true
SQLITE_DB_PATH=./checkpoints.db
FRONTEND_URL=http://localhost:3000

--- config.py should ---
Use pydantic BaseSettings to load all env vars with validation.
Create a single `settings` instance at the bottom.
Set up LangSmith tracing by setting os.environ variables from settings.

--- main.py should ---
Create a FastAPI app with:
- CORS middleware allowing the frontend URL from settings
- A /health GET endpoint returning {"status": "ok", "timestamp": datetime}
- Include placeholder router imports (commented out for now, we'll add them later)
- Lifespan context manager for startup/shutdown logging
- Uvicorn runner at the bottom with host="0.0.0.0" port=8000
```

---

## PROMPT 2 — Database Layer (Supabase + SQLite Checkpointer)

```
Create the database layer for the News Intelligence Platform.

Create exactly these files:
1. backend/app/database/supabase_client.py
2. backend/app/database/sqlite_checkpointer.py
3. backend/app/database/models.py

--- supabase_client.py should ---
- Initialize Supabase client using settings from config.py
- Create an async function `init_supabase_tables()` that creates these tables if they don't exist 
  using Supabase's REST API:
  
  Table: articles
  Columns: id (uuid, primary key), article_id (text, unique), title (text), description (text),
  content (text), source_name (text), source_url (text), published_at (timestamp), 
  category (text), country (text), language (text), sentiment (text), 
  sentiment_score (float), summary (text), insights (jsonb), keywords (jsonb),
  created_at (timestamp default now())

  Table: chat_sessions  
  Columns: id (uuid primary key), thread_id (text unique), session_name (text),
  agent_type (text), created_at (timestamp), updated_at (timestamp), 
  message_count (int default 0), last_query (text)

  Table: pdf_documents
  Columns: id (uuid primary key), thread_id (text), filename (text), 
  file_size (int), chunk_count (int), created_at (timestamp)

- Create async CRUD functions:
  upsert_article(article_data: dict) -> dict
  get_articles(limit=50, offset=0, category=None, sentiment=None, search=None) -> list
  get_article_by_id(article_id: str) -> dict
  upsert_chat_session(thread_id: str, data: dict) -> dict
  get_chat_sessions(agent_type: str) -> list

--- sqlite_checkpointer.py should ---
- Import AsyncSqliteSaver from langgraph.checkpoint.sqlite.aio
- Create an async context manager function `get_checkpointer()` that yields an AsyncSqliteSaver
  using the SQLITE_DB_PATH from settings
- Create a helper `get_thread_config(thread_id: str)` that returns the LangGraph config dict:
  {"configurable": {"thread_id": thread_id}}

--- models.py should ---
Create Pydantic v2 models:

ArticleModel: all article fields with Optional types where appropriate
ChatMessage: role (str), content (str), timestamp (datetime), metadata (dict | None)
AgentRequest: query (str), thread_id (str | None = None), mode (str = "normal")
RAGRequest: query (str), thread_id (str | None = None), has_pdf (bool = False)
HumanLoopAction: thread_id (str), action (Literal["generate_pdf", "dive_deeper", "bias_detect", "track_story", "clarify_pdf", "generate_report"]), context (dict | None)
StreamEvent: event_type (str), data (dict | Any), thread_id (str)
PDFGenerationRequest: thread_id (str), title (str), include_sources (bool = True)
```

---

## PROMPT 3 — News Data Pipeline (NewsData.io ETL)

```
Create the news data ETL pipeline.

Create exactly these files:
1. backend/app/pipelines/news_pipeline.py
2. backend/app/routers/pipeline_router.py

--- news_pipeline.py should ---

Create a class `NewsPipeline` with these methods:

1. `async fetch_articles(query: str, page_size: int = 10, max_pages: int = 5, category: str = None) -> list[dict]`
   - Calls NewsData.io API at https://newsdata.io/api/1/news
   - Params: apikey, q (query), size (page_size), page (nextPage token for pagination)
   - Handles pagination using the nextPage token from response
   - Implements exponential backoff retry (3 attempts) on rate limit errors
   - Logs each page fetch with article count

2. `def clean_article(raw: dict) -> dict | None`
   - Returns None if title or content is missing/None
   - Strips HTML tags from content using regex
   - Truncates content to 5000 chars
   - Normalizes published_at to ISO format
   - Generates a stable article_id = sha256(title + source_id)[:16]
   - Returns cleaned dict matching ArticleModel fields

3. `def deduplicate(articles: list[dict]) -> list[dict]`
   - Deduplicates by article_id
   - Also removes near-duplicates where title similarity > 85% (use simple word overlap ratio)

4. `async def analyze_with_groq(article: dict) -> dict`
   - Uses ChatGroq(model="llama-3.3-70b-versatile") 
   - Single prompt that returns JSON with: summary (str), sentiment (positive/negative/neutral),
     sentiment_score (float -1 to 1), insights (list of 3-5 strings), keywords (list of strings)
   - Parse the JSON response safely with try/except
   - Return article dict merged with AI analysis

5. `async def run_pipeline(query: str, category: str = None, max_articles: int = 100) -> dict`
   - Orchestrates: fetch → clean → deduplicate → AI analyze (batch of 10 concurrent) → upsert to Supabase
   - Returns {"processed": int, "stored": int, "failed": int, "duration_seconds": float}

--- pipeline_router.py should ---
Create FastAPI router with prefix="/api/pipeline":

POST /run - triggers run_pipeline(), returns job stats (use BackgroundTasks for async)
GET /status - returns last pipeline run stats from a simple in-memory dict
GET /articles - proxies to supabase_client.get_articles() with query params: 
  limit, offset, category, sentiment, search
GET /articles/{article_id} - returns single article

Import and use the NewsPipeline class and supabase_client functions.
```

---

## PROMPT 4 — Agent 1: News Intelligence Agent State + Tools

```
Create the state definition and tools for the News Intelligence Agent.

Create exactly these files:
1. backend/app/agents/news_agent/state.py
2. backend/app/agents/news_agent/tools.py

--- state.py should ---
Define a TypedDict `NewsAgentState` with these fields:

messages: Annotated[list, add_messages]   # LangGraph messages reducer
query: str                                 # Original user query
sub_queries: list[str]                     # Query planner output
web_results: list[dict]                    # Raw Tavily results
newsdata_articles: list[dict]              # NewsData.io articles  
validated_sources: list[dict]              # After credibility scoring
summary: str                               # Final AI summary
insights: list[str]                        # Key insights list
sentiment: str                             # Overall sentiment
sentiment_score: float
bias_analysis: dict                        # Bias detector output
trend_data: list[dict]                     # Track story timeline
pdf_path: str | None                       # Generated PDF file path
thread_id: str
current_step: str                          # For UI progress tracking
error: str | None
human_action: str | None                   # What user clicked
confidence_scores: dict                    # Per-insight confidence
session_metadata: dict                     # For persistence

Import these from typing, typing_extensions, and langgraph.graph.message

--- tools.py should ---
Create LangChain tools using @tool decorator:

1. `tavily_search(query: str, max_results: int = 5) -> list[dict]`
   - Uses TavilyClient from tavily-python
   - Calls client.search(query, max_results=max_results, search_depth="advanced", 
     include_raw_content=True)
   - Returns list of {title, url, content, score, published_date}

2. `fetch_newsdata(query: str, category: str = None, limit: int = 20) -> list[dict]`
   - Calls NewsData.io API directly with aiohttp (run in executor for sync compat)
   - Returns cleaned article list

3. `score_source_credibility(url: str) -> dict`
   - Maintains a hardcoded dict of known credible domains with scores (0-1):
     reuters.com: 0.97, bbc.com: 0.95, apnews.com: 0.96, theguardian.com: 0.88,
     nytimes.com: 0.90, bloomberg.com: 0.89, techcrunch.com: 0.82, etc.
   - Checks if URL contains any known domain
   - Returns {"url": url, "credibility": score, "tier": "tier1/2/3/unknown"}

4. `generate_pdf_tool(content: dict, output_path: str) -> str`
   - Uses ReportLab to create a professional PDF
   - PDF has: header with logo text "Datastraw News Intelligence", title, date
   - Sections: Executive Summary, Key Insights (numbered), Sources (hyperlinked), 
     Sentiment Analysis, Full Article Details
   - Returns the output_path on success

5. `calculate_insight_confidence(insight: str, sources: list[dict]) -> float`
   - Counts how many sources contain keywords from the insight
   - Returns ratio as confidence score 0.0-1.0

All tools should have clear docstrings as they'll be bound to the LLM.
```

---

## PROMPT 5 — Agent 1: News Intelligence Agent Nodes + Subgraphs

```
Create the LangGraph nodes and subgraphs for the News Intelligence Agent.

Create exactly these files:
1. backend/app/agents/news_agent/nodes.py
2. backend/app/agents/news_agent/subgraphs/dive_deeper.py
3. backend/app/agents/news_agent/subgraphs/bias_detector.py

--- nodes.py should ---

Import NewsAgentState from state.py and tools from tools.py.
Use `llm = ChatGroq(model="llama-3.3-70b-versatile")` at module level.

Create these async node functions (each takes state: NewsAgentState, returns partial state dict):

1. `query_planner_node(state)`:
   - Uses LLM to break the query into 3-5 specific sub-queries for parallel search
   - Prompt: "You are a news research planner. Break this query into 3-5 specific sub-queries 
     that will help find comprehensive information from different angles. 
     Return ONLY a JSON array of strings."
   - Parses JSON response, updates sub_queries and current_step

2. `web_search_node(state)`:  
   - Runs tavily_search for each sub_query concurrently using asyncio.gather
   - Flattens results, deduplicates by URL
   - Updates web_results and current_step

3. `newsdata_fetch_node(state)`:
   - Calls fetch_newsdata tool with original query
   - Updates newsdata_articles

4. `source_validator_node(state)`:
   - Scores all web_results URLs using score_source_credibility
   - Filters out sources with credibility < 0.5
   - Sorts by credibility score descending
   - Ensures at least 5 sources remain (relaxes threshold if needed)
   - Updates validated_sources

5. `insight_generator_node(state)`:
   - Builds context from validated_sources + newsdata_articles
   - Calls LLM with detailed prompt to generate:
     summary, insights (list), sentiment, sentiment_score, keywords
   - Calculates confidence score for each insight using calculate_insight_confidence
   - Updates summary, insights, sentiment, sentiment_score, confidence_scores

6. `pdf_generator_node(state)`:
   - Calls generate_pdf_tool with all state data
   - Saves to /tmp/report_{thread_id}.pdf
   - Updates pdf_path

7. `trend_timeline_node(state)`:
   - Searches NewsData.io with date ranges (last 30 days)
   - Groups articles by week
   - Updates trend_data

8. `human_interrupt_node(state)`:  
   - This is the HITL interrupt point
   - Returns state as-is (the interrupt happens at graph level via interrupt_before)

9. `route_human_action(state)`:
   - Reads state.human_action
   - Returns string: "pdf" | "dive_deeper" | "bias_detect" | "track_story" | "end"

--- dive_deeper.py subgraph should ---
Create a StateGraph with NewsAgentState that:
- Node 1: searches 5 MORE sources using different Tavily queries (add "analysis", "expert opinion", 
  "latest update" to original query)
- Node 2: runs insight_generator again with expanded sources
- Returns updated state with additional_sources and updated insights

Compile and export as `dive_deeper_graph`

--- bias_detector.py subgraph should ---
Create a StateGraph with NewsAgentState that:
- Node 1: searches same query with site-specific filters for known left/center/right sources
  Left sources: ["guardian.com", "msnbc.com", "huffpost.com"]
  Center sources: ["reuters.com", "apnews.com", "bbc.com"]  
  Right sources: ["foxnews.com", "wsj.com", "nypost.com"]
- Node 2: LLM analyzes tone differences between source groups
  Returns JSON: {left_angle, center_angle, right_angle, bias_score (-1 to 1), 
  key_differences: list, recommendation: str}
- Updates bias_analysis in state

Compile and export as `bias_detector_graph`
```

---

## PROMPT 6 — Agent 1: News Intelligence Graph Assembly

```
Create the main LangGraph graph for the News Intelligence Agent and its FastAPI router.

Create exactly these files:
1. backend/app/agents/news_agent/graph.py
2. backend/app/routers/agent_router.py

--- graph.py should ---

Import all nodes from nodes.py, subgraphs from subgraphs/, tools from tools.py.
Import StateGraph, START, END, interrupt from langgraph.
Import AsyncSqliteSaver and get_checkpointer from database/sqlite_checkpointer.py

Build the graph:

1. Create StateGraph(NewsAgentState)
2. Add nodes: query_planner, web_search, newsdata_fetch, source_validator, 
   insight_generator, human_interrupt, pdf_generator, trend_timeline,
   dive_deeper (the subgraph), bias_detect (the subgraph)
3. Add edges:
   START → query_planner → web_search → newsdata_fetch → source_validator → insight_generator → human_interrupt
   
   human_interrupt → conditional edge using route_human_action:
     "pdf" → pdf_generator → END
     "dive_deeper" → dive_deeper → human_interrupt  (loop back)
     "bias_detect" → bias_detect → human_interrupt  (loop back)
     "track_story" → trend_timeline → human_interrupt (loop back)
     "end" → END

4. Set interrupt_before=["human_interrupt"] for HITL
5. Create async function `create_news_agent_graph()` that:
   - Gets checkpointer from get_checkpointer()
   - Compiles graph with checkpointer
   - Returns compiled graph

6. Create async function `stream_news_agent(query, thread_id, human_action=None)`:
   - Gets or creates graph
   - If human_action provided: calls graph.update_state() with human_action, then stream
   - Else: starts fresh stream from START
   - Uses graph.astream_events() with version="v2"
   - Yields formatted SSE events: 
     {"event": "step", "data": {"step": current_step, "thread_id": thread_id}}
     {"event": "result", "data": {summary, insights, sentiment, confidence_scores, sources}}
     {"event": "interrupted", "data": {"thread_id": thread_id, "awaiting_action": true}}
     {"event": "pdf_ready", "data": {"pdf_path": path}}
     {"event": "error", "data": {"message": error}}

--- agent_router.py should ---
Create FastAPI router with prefix="/api/agent":

1. POST /chat - accepts AgentRequest body
   - Generates thread_id if not provided (uuid4)
   - Returns StreamingResponse with media_type="text/event-stream"
   - Calls stream_news_agent() as the generator
   - After completion, upserts chat session to Supabase

2. POST /action - accepts HumanLoopAction body  
   - Resumes the interrupted graph with the human action
   - Returns StreamingResponse continuing from interrupt point

3. GET /sessions - returns all chat sessions from Supabase where agent_type="news"

4. GET /sessions/{thread_id}/history - returns message history by loading 
   checkpoint state from SQLite using graph.get_state(config)

5. DELETE /sessions/{thread_id} - deletes session from Supabase 
   (checkpoint stays in SQLite)

6. GET /pdf/{thread_id} - returns FileResponse for generated PDF
```

---

## PROMPT 7 — Agent 2: RAG Agent (PDF + Web Hybrid)

```
Create the complete RAG Agent with PDF upload, vector search, and web search hybrid.

Create exactly these files:
1. backend/app/agents/rag_agent/state.py
2. backend/app/agents/rag_agent/tools.py
3. backend/app/agents/rag_agent/nodes.py
4. backend/app/agents/rag_agent/graph.py

--- state.py ---
Define RAGAgentState TypedDict:
messages: Annotated[list, add_messages]
query: str
thread_id: str
has_pdf: bool
pdf_chunks: list[dict]          # {chunk_id, text, page_num, filename}
retrieved_chunks: list[dict]    # Vector search results with similarity scores
web_results: list[dict]         # Tavily web search results
merged_context: str             # Combined context with source labels
answer: str                     # Final answer
citations: list[dict]           # [{source, text, type: "pdf"|"web"}]
pdf_metadata: dict              # filename, page_count, upload_time
current_step: str
error: str | None
human_action: str | None
clarify_mode: str               # "hybrid" | "pdf_only" | "web_only"

--- tools.py ---
1. `chunk_pdf(file_bytes: bytes, filename: str, chunk_size: int = 500) -> list[dict]`
   - Uses pypdf PdfReader to extract text page by page
   - Splits each page into chunks of ~chunk_size words with 50-word overlap
   - Returns list of {chunk_id, text, page_num, filename, char_count}

2. `embed_and_store_chunks(chunks: list[dict], thread_id: str) -> str`
   - Uses sentence-transformers (all-MiniLM-L6-v2) to embed each chunk
   - Stores in an in-memory FAISS index keyed by thread_id (use a module-level dict)
   - Also stores the raw chunks for retrieval
   - Returns "stored N chunks"

3. `vector_search(query: str, thread_id: str, top_k: int = 5) -> list[dict]`
   - Embeds the query
   - Searches FAISS index for thread_id
   - Returns top_k chunks with similarity scores

4. `tavily_search_rag(query: str) -> list[dict]`
   - Same as news agent's tavily_search but returns {title, url, content, published_date}
   - max_results=5

--- nodes.py ---
1. `pdf_ingestion_node(state)`: if has_pdf, calls chunk_pdf and embed_and_store_chunks, updates pdf_chunks
2. `query_analyzer_node(state)`: LLM decides clarify_mode based on query + whether PDF exists
3. `vector_retriever_node(state)`: calls vector_search, updates retrieved_chunks
4. `web_search_rag_node(state)`: calls tavily_search_rag, updates web_results
5. `context_merger_node(state)`: 
   - Formats retrieved_chunks as "[PDF - Page X]: chunk_text"
   - Formats web_results as "[WEB - source_name]: content"  
   - Merges based on clarify_mode
   - Updates merged_context and citations
6. `answer_generator_node(state)`:
   - Passes merged_context + conversation history to LLM
   - Prompt includes: "Answer the question using ONLY the provided context. 
     Cite sources as [PDF-PageX] or [WEB-SourceName]. 
     If context insufficient, say so clearly."
   - Updates answer and citations
7. `rag_human_interrupt_node(state)`: HITL interrupt point
8. `route_rag_action(state)`: returns "generate_report" | "clarify_pdf" | "clarify_web" | "continue" | "end"
9. `pdf_report_generator_node(state)`: generates PDF report of Q&A session with sources

--- graph.py ---
Build StateGraph(RAGAgentState):

Edges: 
START → pdf_ingestion (conditional: skip if has_pdf=False) → query_analyzer
→ parallel: [vector_retriever, web_search_rag] (use Send API for parallel)
→ context_merger → answer_generator → rag_human_interrupt

rag_human_interrupt → conditional:
  "generate_report" → pdf_report_generator → END
  "clarify_pdf" → set clarify_mode="pdf_only" → vector_retriever → context_merger → answer_generator → rag_human_interrupt
  "clarify_web" → set clarify_mode="web_only" → web_search_rag → context_merger → answer_generator → rag_human_interrupt
  "continue" → query_analyzer (for follow-up questions)
  "end" → END

interrupt_before=["rag_human_interrupt"]

Create `stream_rag_agent(query, thread_id, has_pdf, human_action)` same pattern as news agent.
```

---

## PROMPT 8 — RAG Router + PDF Upload + Pipeline Router Registration

```
Create the RAG API router and wire up all routers to main.py.

Create exactly these files:
1. backend/app/routers/rag_router.py
2. backend/app/routers/dashboard_router.py
Update: backend/app/main.py

--- rag_router.py ---
FastAPI router prefix="/api/rag":

1. POST /upload-pdf
   - Accepts UploadFile 
   - Validates it's a PDF (content_type check), max 20MB
   - Reads bytes, calls chunk_pdf and embed_and_store_chunks from rag tools
   - Stores PDF metadata in Supabase pdf_documents table
   - Returns {thread_id, chunk_count, filename, page_count}

2. POST /chat
   - Accepts RAGRequest (query, thread_id, has_pdf)
   - Returns StreamingResponse calling stream_rag_agent()

3. POST /action
   - Accepts HumanLoopAction
   - Resumes interrupted RAG graph

4. GET /sessions
   - Returns chat sessions where agent_type="rag"

5. GET /sessions/{thread_id}/history
   - Returns full message history from checkpoint

6. DELETE /sessions/{thread_id}
   - Deletes session

7. GET /pdf/{thread_id}
   - Returns FileResponse for generated report PDF

--- dashboard_router.py ---
FastAPI router prefix="/api/dashboard":

1. GET /stats
   Returns aggregated stats from Supabase:
   {total_articles, sentiment_breakdown: {positive, negative, neutral}, 
    top_categories: list, top_sources: list, articles_today: int}
   (Run SQL queries via Supabase client)

2. GET /sentiment-trend
   Query params: days (default 7), category
   Returns daily sentiment counts for charting: [{date, positive, negative, neutral}]

3. GET /trending-keywords
   Returns top 20 keywords extracted from recent articles

4. GET /articles
   Pagination + filters (proxy to supabase_client.get_articles)

--- Update main.py ---
- Import all 4 routers
- Include them: app.include_router(pipeline_router), agent_router, rag_router, dashboard_router
- In lifespan startup: call init_supabase_tables()
- Add a GET /api/threads/{thread_id}/state endpoint that reads from either graph's checkpoint
```

---

## PROMPT 9 — Utility: PDF Generator + Streaming Helpers

```
Create the utility modules.

Create exactly these files:
1. backend/app/utils/pdf_generator.py
2. backend/app/utils/streaming.py
3. backend/app/utils/embeddings.py

--- pdf_generator.py ---
Create class `ReportGenerator` using ReportLab:

Method `generate_news_report(data: dict, output_path: str) -> str`:
- data contains: title, query, summary, insights, sources, sentiment, bias_analysis (optional), 
  trend_data (optional), generated_at
- Creates professional A4 PDF with:
  - Header: "Datastraw News Intelligence Platform" in dark blue, line separator
  - Title section: report title + generated timestamp
  - Executive Summary section: summary text in gray box
  - Key Insights section: numbered list with confidence bars (draw rectangles)
  - Sentiment section: colored indicator (green/red/gray)
  - Bias Analysis section: if present, show left/center/right angles
  - Sources section: bulleted list with credibility scores
  - Footer: page numbers + "Confidential - Datastraw Technologies"
- Returns output_path

Method `generate_rag_report(data: dict, output_path: str) -> str`:
- data contains: query, answer, citations, pdf_sources (from uploaded PDF), web_sources
- Creates PDF with Q&A format, citations section, source breakdown
- Same professional styling

--- streaming.py ---
Create helper functions:

1. `format_sse_event(event_type: str, data: dict) -> str`
   Returns SSE-formatted string: "data: {json}\n\n"

2. `create_step_event(step_name: str, thread_id: str, details: dict = {}) -> str`
   Returns SSE event with type "step"

3. `create_result_event(result: dict, thread_id: str) -> str`
   Returns SSE event with type "result"

4. `create_error_event(message: str, thread_id: str) -> str`
   Returns SSE event with type "error"

5. `create_interrupt_event(thread_id: str, available_actions: list) -> str`
   Returns SSE event with type "interrupted" and available actions list

--- embeddings.py ---
Create a singleton `EmbeddingModel` class:
- Loads sentence-transformers "all-MiniLM-L6-v2" on first use (lazy loading)
- Method `embed(texts: list[str]) -> np.ndarray`: returns embeddings
- Method `embed_single(text: str) -> np.ndarray`
- Module-level `embedding_model = EmbeddingModel()`

Also create FAISS index manager:
- Module-level dict `faiss_indices: dict[str, FAISSIndex]`
- `create_or_get_index(thread_id: str) -> faiss.IndexFlatIP`
- `add_vectors(thread_id: str, vectors: np.ndarray, chunks: list[dict])`
- `search_index(thread_id: str, query_vector: np.ndarray, top_k: int) -> list[dict]`
```

---

## PROMPT 10 — Next.js Frontend Scaffold + API Client

```
Now we start the frontend. Initialize a Next.js 14 app with TypeScript and Tailwind CSS 
in the /frontend directory.

Create exactly these files:
1. frontend/package.json (show me the dependencies to install)
2. frontend/lib/api.ts
3. frontend/lib/streaming.ts
4. frontend/lib/types.ts

--- package.json dependencies needed ---
next@14, react, react-dom, typescript, tailwindcss, @types/react, @types/node,
lucide-react, recharts, @radix-ui/react-tabs, @radix-ui/react-dialog,
@radix-ui/react-select, react-dropzone, react-hot-toast, clsx, tailwind-merge,
uuid, date-fns, framer-motion

--- types.ts ---
Export TypeScript interfaces matching the backend Pydantic models:
- Article, ChatMessage, AgentRequest, RAGRequest, HumanLoopAction, StreamEvent
- ChatSession, PDFMetadata, DashboardStats, SentimentTrend
- NewsAgentState (partial, for UI state), RAGAgentState (partial)
- AgentAction enum: GENERATE_PDF | DIVE_DEEPER | BIAS_DETECT | TRACK_STORY
- RAGAction enum: GENERATE_REPORT | CLARIFY_PDF | CLARIFY_WEB | CONTINUE

--- api.ts ---
Create an API client class `APIClient`:
- BASE_URL from environment variable NEXT_PUBLIC_API_URL (default http://localhost:8000)
- Methods:
  runPipeline(query: string, category?: string): Promise<any>
  getArticles(params: {limit, offset, category, sentiment, search}): Promise<Article[]>
  getDashboardStats(): Promise<DashboardStats>
  getSentimentTrend(days: number): Promise<SentimentTrend[]>
  getTrendingKeywords(): Promise<string[]>
  uploadPDF(file: File, threadId?: string): Promise<{thread_id, chunk_count, filename}>
  getAgentSessions(): Promise<ChatSession[]>
  getRAGSessions(): Promise<ChatSession[]>
  getSessionHistory(agentType: "agent"|"rag", threadId: string): Promise<ChatMessage[]>
  deleteSession(agentType: "agent"|"rag", threadId: string): Promise<void>
  downloadPDF(agentType: "agent"|"rag", threadId: string): Promise<Blob>
  sendHumanAction(agentType: "agent"|"rag", action: HumanLoopAction): Promise<void>

Export singleton: `export const api = new APIClient()`

--- streaming.ts ---
Create a custom hook `useAgentStream`:
- Parameters: agentType ("agent"|"rag")
- State: messages, isStreaming, currentStep, isInterrupted, availableActions, threadId, error
- Method `startStream(query: string, threadId?: string, hasPdf?: boolean)`:
  - Creates EventSource or uses fetch with ReadableStream for SSE
  - Parses events: "step", "result", "interrupted", "pdf_ready", "error"
  - Updates state accordingly
- Method `sendAction(action: string)`:
  - Calls /api/{agentType}/action endpoint
  - Resumes the SSE stream
- Method `loadHistory(threadId: string)`: loads past messages
- Method `resetSession()`: clears all state, new threadId
- Returns all state + methods
```

---

## PROMPT 11 — Dashboard Page

```
Create the main News Dashboard page.

Create exactly these files:
1. frontend/app/dashboard/page.tsx
2. frontend/components/dashboard/ArticleCard.tsx
3. frontend/components/dashboard/SentimentChart.tsx
4. frontend/components/dashboard/FilterBar.tsx
5. frontend/components/dashboard/StatsRow.tsx

--- page.tsx ---
Server-side or client-side page with:
- Top stats row: total articles, today's articles, avg sentiment, pipeline status
- Filter bar: search input, category dropdown, sentiment filter, date range
- Article grid (responsive: 1 col mobile, 2 col tablet, 3 col desktop)
- Load More / infinite scroll pagination
- "Run Pipeline" button that triggers pipeline with a query input modal
- Real-time refresh every 60 seconds using setInterval

--- ArticleCard.tsx ---
Card component showing:
- Source name + credibility badge (color coded: green/yellow/red)
- Title (truncated to 2 lines)
- AI Summary (2 sentences, in italic)
- Sentiment badge: emoji + label (😊 Positive / 😐 Neutral / 😟 Negative)
- Confidence-colored insight pills (top 3 insights, click to expand)
- Published date (relative: "2 hours ago")
- "Ask AI About This" button that opens agent chatbot pre-filled with article title
- Smooth hover animation

--- SentimentChart.tsx ---
Use recharts AreaChart:
- X axis: dates, Y axis: article count
- 3 areas: positive (green), neutral (gray), negative (red) - stacked
- Responsive container
- Custom tooltip showing exact counts
- Time range selector: 7d / 14d / 30d buttons

--- FilterBar.tsx ---
Search input with debounce (300ms), category multi-select, sentiment radio,
"Reset Filters" button, result count display

--- StatsRow.tsx ---
4 stat cards with icons (lucide-react):
- Total Articles (Newspaper icon)
- Positive Sentiment % (TrendingUp icon)  
- Sources Tracked (Globe icon)
- Last Pipeline Run (Clock icon)
Each with a subtle trend indicator (↑ ↓ →)
```

---

## PROMPT 12 — Agent Chatbot Page

```
Create the News Intelligence Agent chatbot UI.

Create exactly these files:
1. frontend/app/agent/page.tsx
2. frontend/components/agent/AgentChat.tsx
3. frontend/components/agent/InsightCard.tsx
4. frontend/components/agent/HumanInLoopButtons.tsx
5. frontend/components/agent/StreamingMessage.tsx
6. frontend/components/agent/BiasHeatmap.tsx
7. frontend/components/shared/ThreadHistory.tsx

--- page.tsx ---
Two-column layout:
- Left sidebar (300px): ThreadHistory component + "New Chat" button
- Main area: AgentChat component

--- AgentChat.tsx ---
Full chat interface using useAgentStream hook:
- Messages list: user messages (right aligned, blue), agent messages (left, white card)
- Input area: text input + mic button (Web Speech API) + send button
- Progress indicator: animated steps (Query Planning → Web Search → Validation → Generating Insights)
- When interrupted: render HumanInLoopButtons
- Loading skeleton for streaming response
- Auto-scroll to bottom

--- StreamingMessage.tsx ---
Renders the agent result with:
- Animated text reveal (character by character using framer-motion)
- Summary section in a highlighted box
- Insights list with confidence score bars (HTML range-like colored bars)
- Sentiment indicator with color + score
- Sources section with credibility badges
- Animated entrance for each section

--- HumanInLoopButtons.tsx ---
Four action buttons rendered when isInterrupted=true:
1. 📄 "Generate PDF" (blue) - calls sendAction("generate_pdf")
2. 🔍 "Dive Deeper" (purple) - calls sendAction("dive_deeper")  
3. ⚖️ "Detect Bias" (orange) - calls sendAction("bias_detect")
4. 📈 "Track Story" (green) - calls sendAction("track_story")
5. ✅ "Done" (gray) - calls sendAction("end")

Each button shows a tooltip describing what it does.
Buttons animate in with stagger effect using framer-motion.

--- InsightCard.tsx ---
Expandable card for each insight:
- Confidence bar (colored: green >70%, yellow 40-70%, red <40%)
- Insight text
- Source count badge
- Click to expand: shows which sources support this insight

--- BiasHeatmap.tsx ---
Rendered when bias analysis is available:
- 3-column layout: Left / Center / Right
- Each column shows source angle in a colored card (blue/gray/red)
- Bias score meter (horizontal bar from -1 to +1)
- Key differences list
- Recommendation text in italic

--- ThreadHistory.tsx ---
Scrollable list of past sessions:
- Session name (first query truncated) + date
- Message count badge
- Click to load: calls loadHistory(threadId) and restores conversation
- "Resume" label if session was interrupted
- Delete button (trash icon) with confirmation
- "New Chat" clears state and generates new threadId
```

---

## PROMPT 13 — RAG Chatbot Page

```
Create the RAG Chatbot UI with PDF upload.

Create exactly these files:
1. frontend/app/rag/page.tsx
2. frontend/components/rag/RAGChat.tsx
3. frontend/components/rag/PDFUploader.tsx
4. frontend/components/rag/SourceCitations.tsx
5. frontend/components/shared/VoiceInput.tsx

--- page.tsx ---
Same two-column layout as agent page.
Above the chat: PDFUploader component (collapsible panel).
Show "PDF Active: filename.pdf" badge when PDF is loaded.

--- PDFUploader.tsx ---
Drag-and-drop zone using react-dropzone:
- Accepts PDF only, max 20MB
- Shows upload progress
- On success: shows filename, page count, chunk count
- "Remove PDF" button (switches back to web-only mode)
- If no PDF: shows helper text "Upload an e-newspaper PDF to chat with it"
- Calls api.uploadPDF() on drop

--- RAGChat.tsx ---
Same as AgentChat but:
- Uses useAgentStream("rag") 
- Passes has_pdf flag to startStream
- Message bubbles show source type indicator: 
  [PDF] or [WEB] badge on each piece of evidence
- When interrupted, shows RAG-specific buttons:
  📄 "Generate Report" | 📰 "PDF Only" | 🌐 "Web Only" | ✅ "Done"
- Mode indicator in header: "Hybrid Mode" / "PDF Only" / "Web Only"

--- SourceCitations.tsx ---
Expandable citations section below each agent answer:
- Tab bar: "All Sources" | "PDF Sources" | "Web Sources"
- PDF sources: show page number, text excerpt
- Web sources: show source URL, title, credibility score
- Click PDF source: highlights which page (show page number prominently)

--- VoiceInput.tsx ---
Mic button component:
- Uses window.SpeechRecognition or window.webkitSpeechRecognition
- Animated pulse ring when recording
- Transcribed text fills the chat input
- Error handling for browsers that don't support it
- Tooltip: "Click to speak your query"
```

---

## PROMPT 14 — App Layout, Sidebar Navigation + Final Wiring

```
Create the app layout, navigation, and final configuration.

Create exactly these files:
1. frontend/app/layout.tsx
2. frontend/app/page.tsx
3. frontend/components/shared/Sidebar.tsx
4. frontend/app/globals.css
5. frontend/.env.example
6. frontend/next.config.js

--- layout.tsx ---
Root layout with:
- Toaster from react-hot-toast
- Sidebar component (fixed left, 240px wide)
- Main content area with left margin for sidebar
- Dark mode support via CSS variables
- Metadata: title "Datastraw News Intelligence | AI Platform", description

--- Sidebar.tsx ---
Fixed left sidebar with:
- Datastraw logo + "News Intelligence" text at top
- Navigation items with icons (lucide-react):
  📊 Dashboard (/dashboard)
  🤖 AI Agent (/agent)
  📚 RAG Chatbot (/rag)
- Bottom section:
  🔗 GitHub link
  ⚙️ Settings (theme toggle)
- Active route highlighting
- Responsive: collapses to icon-only on tablet

--- page.tsx ---
Landing page that redirects to /dashboard.
Show a brief loading splash with the Datastraw logo.

--- globals.css ---
Tailwind base + custom CSS variables for:
- Brand colors: --primary (deep blue #1a365d), --accent (#3182ce), 
  --success (#38a169), --warning (#d69e2e), --danger (#e53e3e)
- Scrollbar styling
- SSE streaming cursor animation (blinking cursor after streaming text)
- Smooth transitions

--- next.config.js ---
- NEXT_PUBLIC_API_URL env exposure
- Rewrites: /api/* → backend URL (for production proxy)

--- .env.example ---
NEXT_PUBLIC_API_URL=http://localhost:8000

Also update backend/app/main.py CORS to accept both localhost:3000 and localhost:3001.
```

---

## PROMPT 15 — README + Final Polish

```
Create the final documentation and polish files.

Create exactly these files:
1. README.md (root level)
2. backend/README.md
3. frontend/README.md

--- Root README.md ---
# Datastraw News Intelligence Platform

## 🚀 Overview
Brief description of the two AI systems (Agent + RAG) with architecture diagram in ASCII.

## ✨ Features
- List all USPs with emojis
- Agent features
- RAG features
- Dashboard features

## 🛠️ Tech Stack
Table: Component | Technology | Purpose

## ⚡ Quick Start (under 5 minutes)
### Prerequisites
- Python 3.11+, Node.js 18+, API Keys needed

### Backend Setup
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# (fill in your API keys)
python -m app.main
```

### Frontend Setup
```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

## 🔑 API Keys Required
Table: Service | Where to Get | Cost

## 📐 Architecture
Detailed explanation of LangGraph graphs, nodes, HITL flow.

## 🌐 API Documentation
Key endpoints with request/response examples.

## 🎬 Demo
Link to screenshots folder.

--- Also create ---
A bash script `start.sh` that:
1. Starts the backend with uvicorn in background
2. Starts the frontend with npm run dev
3. Prints the URLs

And a `stop.sh` that kills both processes.
```

---

# 🎯 BETTER ALTERNATIVES FOR YOUR TWO BUTTONS

Here's my improved suggestion replacing your original button ideas:

| Your Original Idea | My Better Suggestion | Why It's Better |
|---|---|---|
| "Dive Deeper" | **🔍 Dive Deeper** (keep, but add: searches academic + govt sources specifically) | More targeted = more valuable |
| "Compare Different Platforms" | **⚖️ Detect Media Bias** | Actively shows bias heatmap across political leanings — far more unique and impressive. Nobody else will do this. |
| *(not planned)* | **📈 Track This Story** | Shows how the narrative evolved over 30 days — demonstrates ETL + time-series thinking |
| *(not planned)* | **🎯 Fact Check Mode** | Cross-references claims across 3+ credible sources — extremely impressive for a news platform |

---

# 📅 3-DAY EXECUTION TIMELINE

## Day 1 (Backend)
- Morning: Prompts 1-3 (Scaffold, DB, Pipeline)
- Afternoon: Prompts 4-6 (News Agent complete)
- Evening: Test with Postman, verify streaming works

## Day 2 (Backend + Frontend Start)
- Morning: Prompts 7-9 (RAG Agent + Utils)
- Afternoon: Prompts 10-11 (Frontend scaffold + Dashboard)
- Evening: Test E2E pipeline → dashboard data flow

## Day 3 (Frontend + Polish)
- Morning: Prompts 12-13 (Agent + RAG chatbot UIs)
- Afternoon: Prompt 14-15 (Layout + README)
- Evening: Deploy to Railway (backend) + Vercel (frontend), record demo video

---

# 🚀 DEPLOYMENT GUIDE (BONUS POINTS)

## Backend → Railway
```bash
# Install Railway CLI
npm install -g @railway/cli
railway login
railway init
railway up
# Set env vars in Railway dashboard
```

## Frontend → Vercel
```bash
npm install -g vercel
vercel --prod
# Set NEXT_PUBLIC_API_URL to Railway URL
```

---

# 🏆 COVER LETTER POINTS TO MENTION

When writing your submission email, mention these specific choices:

1. **Why LangGraph**: "I chose LangGraph over simple chains because it enables true agentic behavior with cycles, conditional routing, and native HITL interrupts — matching real-world agentic architectures."

2. **Why SQLite Checkpointer**: "SQLite gives zero-dependency persistence for thread state, enabling resume-from-interrupt — a production pattern for long-running agents."

3. **Why Groq + LLaMA-3.3-70B**: "Groq's inference speed (500+ tokens/sec) makes streaming feel instant, and LLaMA-3.3-70B gives GPT-4 level quality at zero cost."

4. **Why the Bias Detector**: "In the D2C/e-commerce space Datastraw operates in, understanding how media frames stories about brands/categories is directly actionable intelligence."

5. **What you'd do with more time**: "Add n8n webhook integration for automated pipeline triggers, Looker Studio dashboard embedding, and WhatsApp notification via Twilio."

---

*Good luck! This project architecture is significantly more advanced than what most candidates will submit. The combination of LangGraph HITL + Media Bias Detection + RAG hybrid + streaming is genuinely impressive.*
