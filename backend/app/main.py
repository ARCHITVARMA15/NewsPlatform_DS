import logging
import uvicorn
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("datastraw")

# ---------------------------------------------------------------------------
# Router imports (uncomment as each prompt is implemented)
# ---------------------------------------------------------------------------
from app.routers.pipeline_router import router as pipeline_router
from app.routers.agent_router import router as agent_router
from app.routers.rag_router import router as rag_router
from app.routers.dashboard_router import router as dashboard_router
from app.routers.broadcast_router import router as broadcast_router
from app.database.supabase_client import init_supabase_tables
from app.database.sqlite_checkpointer import get_checkpointer, get_thread_config


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Datastraw News Intelligence Backend starting up...")
    logger.info("   LangSmith project : %s", settings.langchain_project)
    logger.info("   SQLite path       : %s", settings.sqlite_db_path)
    logger.info("   Frontend origin   : %s", settings.frontend_url)
    await init_supabase_tables()
    yield
    logger.info("🛑 Datastraw backend shutting down.")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Datastraw News Intelligence API",
    description="AI-powered news research platform with LangGraph agents and RAG",
    version="1.0.0",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers (uncomment as each prompt is implemented)
# ---------------------------------------------------------------------------
app.include_router(pipeline_router)
app.include_router(agent_router)
app.include_router(rag_router)
app.include_router(dashboard_router)
app.include_router(broadcast_router)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


# ---------------------------------------------------------------------------
# Universal thread state inspector
# ---------------------------------------------------------------------------
@app.get("/api/threads/{thread_id}/state", tags=["Threads"])
async def get_thread_state(thread_id: str):
    """
    Reads the saved LangGraph checkpoint for a thread.
    Tries the News Intelligence Agent first, then the RAG Agent.
    Returns the state values and which agent owns the thread.
    """
    from fastapi import HTTPException
    from app.agents.news_agent.graph import create_news_agent_graph
    from app.agents.rag_agent.graph import create_rag_graph

    config = get_thread_config(thread_id)

    try:
        async with get_checkpointer() as checkpointer:
            # Try News Agent first
            news_graph = await create_news_agent_graph(checkpointer)
            news_state = await news_graph.aget_state(config)
            if news_state and news_state.values:
                return {
                    "agent": "news",
                    "thread_id": thread_id,
                    "is_interrupted": bool(news_state.next),
                    "next_nodes": list(news_state.next) if news_state.next else [],
                    "state": news_state.values,
                }

            # Try RAG Agent
            rag_graph = await create_rag_graph(checkpointer)
            rag_state = await rag_graph.aget_state(config)
            if rag_state and rag_state.values:
                return {
                    "agent": "rag",
                    "thread_id": thread_id,
                    "is_interrupted": bool(rag_state.next),
                    "next_nodes": list(rag_state.next) if rag_state.next else [],
                    "state": rag_state.values,
                }

        raise HTTPException(status_code=404, detail=f"No checkpoint found for thread '{thread_id}'")

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Thread state lookup failed for %s: %s", thread_id, exc)
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
