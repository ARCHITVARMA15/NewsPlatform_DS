"""
Pipeline router — /api/pipeline/*

Exposes the NewsData.io ETL pipeline and article retrieval endpoints.
"""
import asyncio
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


class AnalyzeUrlRequest(BaseModel):
    url:          str
    include_bias: bool = False


@router.post("/analyze-url", summary="Fetch and AI-analyze any article URL on the fly")
async def analyze_url(request: AnalyzeUrlRequest):
    """
    Fetches and extracts an article from the provided URL using trafilatura,
    then runs Groq LLaMA-3.3-70B analysis.

    Returns summary, sentiment, insights, key_entities, category,
    and optionally a bias score.
    """
    from fastapi import HTTPException
    import json as _json
    import re as _re
    from datetime import datetime, timezone

    # ── 1. Validate URL ───────────────────────────────────────────────────
    if not request.url.startswith(("http://", "https://")):
        raise HTTPException(status_code=422, detail="URL must start with http:// or https://")

    # ── 2. Fetch + extract with trafilatura ───────────────────────────────
    try:
        import trafilatura
        downloaded = await asyncio.to_thread(trafilatura.fetch_url, request.url)
        text = await asyncio.to_thread(
            trafilatura.extract,
            downloaded,
            include_comments=False,
            include_tables=False,
        )
    except Exception as exc:
        logger.error("trafilatura fetch failed for %s: %s", request.url, exc)
        raise HTTPException(status_code=422, detail=f"Could not fetch article: {exc}")

    if not text or len(text.strip()) < 100:
        raise HTTPException(
            status_code=422,
            detail="Could not extract article content from that URL. "
                   "The page may require JavaScript or block scraping.",
        )

    # ── 3. Extract title ──────────────────────────────────────────────────
    title = text.strip().split("\n")[0][:200]

    # ── 4. Groq AI analysis ───────────────────────────────────────────────
    bias_instructions = (
        '\n  "bias_score": <float -1.0 (far left) to 1.0 (far right) or 0 for neutral>,'
        '\n  "bias_label": "<Far Left|Left|Center-Left|Center|Center-Right|Right|Far Right>",'
        if request.include_bias else
        '\n  "bias_score": null,'
        '\n  "bias_label": null,'
    )

    prompt = (
        "Analyze the following news article and return ONLY valid JSON "
        "(no markdown, no explanation):\n\n"
        "{\n"
        '  "summary": "<2 sentence summary>",\n'
        '  "sentiment": "<positive|negative|neutral>",\n'
        '  "sentiment_score": <float -1.0 to 1.0>,\n'
        '  "insights": ["<insight 1>", "<insight 2>", "<insight 3>"],\n'
        '  "key_entities": ["<entity1>", "<entity2>", "<entity3>"],\n'
        f'  "category": "<category>",'
        f"{bias_instructions}\n"
        "}\n\n"
        f"Title: {title}\n"
        f"Content:\n{text[:3000]}"
    )

    _default = {
        "summary": "Analysis unavailable.",
        "sentiment": "neutral",
        "sentiment_score": 0.0,
        "insights": [],
        "key_entities": [],
        "category": "OTHER",
        "bias_score": None,
        "bias_label": None,
    }

    try:
        response = await _pipeline.llm.ainvoke(prompt)
        raw = _re.sub(r"^```(?:json)?\s*|\s*```$", "", response.content.strip(), flags=_re.MULTILINE).strip()
        analysis = _json.loads(raw)
        for k, v in _default.items():
            analysis.setdefault(k, v)
    except Exception as exc:
        logger.warning("Groq analysis failed for URL %s: %s", request.url, exc)
        analysis = _default

    return {
        **analysis,
        "url":         request.url,
        "title":       title,
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/articles/{article_id}", summary="Get a single article by article_id")
async def get_article(article_id: str):
    """Returns a single article by its stable article_id (sha256-derived)."""
    article = await get_article_by_id(article_id)
    if not article:
        raise HTTPException(status_code=404, detail=f"Article '{article_id}' not found")
    return article
