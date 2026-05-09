"""
Pipeline router — /api/pipeline/*

Exposes the NewsData.io ETL pipeline and article retrieval endpoints.
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from pydantic import BaseModel

from app.database.supabase_client import get_article_by_id, get_articles
from app.pipelines.news_pipeline import NewsPipeline

logger = logging.getLogger("datastraw.router.pipeline")

router = APIRouter(prefix="/api/pipeline", tags=["Pipeline"])

# Singleton pipeline instance
_pipeline = NewsPipeline()

# ---------------------------------------------------------------------------
# In-memory pipeline status (reset on server restart)
# ---------------------------------------------------------------------------
_status: dict = {
    "is_running": False,
    "last_run_at": None,
    "last_query": None,
    "last_stats": None,
}


# ---------------------------------------------------------------------------
# Request model
# ---------------------------------------------------------------------------
class PipelineRunRequest(BaseModel):
    query: str = "latest news"
    category: str | None = None
    max_articles: int = 100


# ---------------------------------------------------------------------------
# Background task wrapper
# ---------------------------------------------------------------------------
async def _run_pipeline_bg(query: str, category: str | None, max_articles: int) -> None:
    """Background task — runs the full ETL and updates _status on completion."""
    try:
        stats = await _pipeline.run_pipeline(
            query, category=category, max_articles=max_articles
        )
        _status["last_stats"] = stats
        _status["last_run_at"] = datetime.now(timezone.utc).isoformat()
        _status["last_query"] = query
    except Exception as exc:
        logger.error("Pipeline background task failed: %s", exc)
        _status["last_stats"] = {"error": str(exc)}
    finally:
        _status["is_running"] = False


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@router.post("/run", summary="Trigger the news ETL pipeline")
async def run_pipeline(
    request: PipelineRunRequest,
    background_tasks: BackgroundTasks,
):
    """
    Starts the ETL pipeline as a background task and returns immediately.
    Poll GET /status to check progress.
    """
    if _status["is_running"]:
        return {
            "message": "Pipeline is already running — check /status",
            **_status,
        }

    _status["is_running"] = True
    _status["last_query"] = request.query

    background_tasks.add_task(
        _run_pipeline_bg,
        request.query,
        request.category,
        request.max_articles,
    )

    return {
        "message": "Pipeline started",
        "query": request.query,
        "category": request.category,
        "max_articles": request.max_articles,
    }


@router.get("/status", summary="Get last pipeline run status")
async def get_pipeline_status():
    """Returns the in-memory status of the last (or current) pipeline run."""
    return _status


@router.get("/articles", summary="List stored articles with filters")
async def list_articles(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    category: str | None = Query(None),
    sentiment: str | None = Query(None),
    search: str | None = Query(None),
):
    """
    Returns paginated articles from Supabase.
    Optional filters: category, sentiment, search (title ilike).
    """
    return await get_articles(
        limit=limit,
        offset=offset,
        category=category,
        sentiment=sentiment,
        search=search,
    )


@router.get("/articles/{article_id}", summary="Get a single article by article_id")
async def get_article(article_id: str):
    """Returns a single article by its stable article_id (sha256-derived)."""
    article = await get_article_by_id(article_id)
    if not article:
        raise HTTPException(status_code=404, detail=f"Article '{article_id}' not found")
    return article
