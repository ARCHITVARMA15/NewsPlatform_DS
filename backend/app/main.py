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
# from app.routers.rag_router import router as rag_router
# from app.routers.dashboard_router import router as dashboard_router


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Datastraw News Intelligence Backend starting up...")
    logger.info("   LangSmith project : %s", settings.langchain_project)
    logger.info("   SQLite path       : %s", settings.sqlite_db_path)
    logger.info("   Frontend origin   : %s", settings.frontend_url)
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
# app.include_router(rag_router)
# app.include_router(dashboard_router)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
