"""
Dashboard router — /api/dashboard/*

Provides aggregated analytics and article data for the frontend dashboard.
All aggregations run via PostgREST + Python-side grouping (no raw SQL needed).
"""
from __future__ import annotations

import logging
from collections import Counter, defaultdict
from datetime import date, timedelta

from fastapi import APIRouter, Query

from app.database.supabase_client import get_articles, supabase

logger = logging.getLogger("datastraw.router.dashboard")

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


# ---------------------------------------------------------------------------
# GET /stats — aggregated platform statistics
# ---------------------------------------------------------------------------
@router.get("/stats", summary="Aggregated platform statistics")
async def get_stats():
    """
    Returns:
      - total_articles: total count in DB
      - sentiment_breakdown: {positive, negative, neutral} counts
      - top_categories: top 10 article categories with counts
      - top_sources: top 10 sources with counts
      - articles_today: articles added today
    """
    # ── Total articles ───────────────────────────────────────────────────
    try:
        total_result = (
            supabase.table("articles").select("id", count="exact").limit(1).execute()
        )
        total_articles = total_result.count or 0
    except Exception:
        total_articles = 0

    # ── Sentiment breakdown (3 targeted count queries) ───────────────────
    sentiment_breakdown: dict[str, int] = {}
    for s in ("positive", "negative", "neutral"):
        try:
            r = (
                supabase.table("articles")
                .select("id", count="exact")
                .eq("sentiment", s)
                .limit(1)
                .execute()
            )
            sentiment_breakdown[s] = r.count or 0
        except Exception:
            sentiment_breakdown[s] = 0

    # ── Top categories (fetch category column, aggregate in Python) ───────
    top_categories: list[dict] = []
    try:
        cat_result = (
            supabase.table("articles").select("category").limit(1000).execute()
        )
        cat_counter = Counter(
            r["category"] for r in cat_result.data if r.get("category")
        )
        top_categories = [
            {"category": k, "count": v} for k, v in cat_counter.most_common(10)
        ]
    except Exception as exc:
        logger.warning("top_categories query failed: %s", exc)

    # ── Top sources ───────────────────────────────────────────────────────
    top_sources: list[dict] = []
    try:
        src_result = (
            supabase.table("articles").select("source_name").limit(1000).execute()
        )
        src_counter = Counter(
            r["source_name"] for r in src_result.data if r.get("source_name")
        )
        top_sources = [
            {"source": k, "count": v} for k, v in src_counter.most_common(10)
        ]
    except Exception as exc:
        logger.warning("top_sources query failed: %s", exc)

    # ── Articles added today ──────────────────────────────────────────────
    articles_today = 0
    try:
        today_str = date.today().isoformat()
        today_result = (
            supabase.table("articles")
            .select("id", count="exact")
            .gte("created_at", today_str)
            .limit(1)
            .execute()
        )
        articles_today = today_result.count or 0
    except Exception as exc:
        logger.warning("articles_today query failed: %s", exc)

    return {
        "total_articles": total_articles,
        "sentiment_breakdown": sentiment_breakdown,
        "top_categories": top_categories,
        "top_sources": top_sources,
        "articles_today": articles_today,
    }


# ---------------------------------------------------------------------------
# GET /sentiment-trend — daily sentiment counts for charting
# ---------------------------------------------------------------------------
@router.get("/sentiment-trend", summary="Daily sentiment counts over N days")
async def sentiment_trend(
    days: int = Query(7, ge=1, le=90, description="Number of days to look back"),
    category: str | None = Query(None),
):
    """
    Returns a list of daily sentiment counts for the given period.
    Format: [{date: "YYYY-MM-DD", positive: N, negative: N, neutral: N}]
    """
    from_date = (date.today() - timedelta(days=days)).isoformat()

    try:
        query = (
            supabase.table("articles")
            .select("published_at,sentiment")
            .gte("published_at", from_date)
            .limit(2000)
        )
        if category:
            query = query.eq("category", category)

        result = query.execute()
    except Exception as exc:
        logger.error("sentiment_trend query failed: %s", exc)
        return []

    daily: dict[str, dict] = defaultdict(
        lambda: {"positive": 0, "negative": 0, "neutral": 0}
    )
    for row in result.data or []:
        pub_at = row.get("published_at") or ""
        sentiment = (row.get("sentiment") or "neutral").lower()
        if pub_at and sentiment in ("positive", "negative", "neutral"):
            day_key = str(pub_at)[:10]  # "YYYY-MM-DD"
            daily[day_key][sentiment] += 1

    trend = [
        {"date": d, **counts}
        for d, counts in sorted(daily.items())
    ]
    return trend


# ---------------------------------------------------------------------------
# GET /trending-keywords — top 20 keywords across recent articles
# ---------------------------------------------------------------------------
@router.get("/trending-keywords", summary="Top 20 trending keywords from recent articles")
async def trending_keywords():
    """
    Fetches the `keywords` jsonb field from the 200 most recent articles,
    flattens and counts keyword frequency, returns top 20.
    """
    try:
        result = (
            supabase.table("articles")
            .select("keywords")
            .order("created_at", desc=True)
            .limit(200)
            .execute()
        )
    except Exception as exc:
        logger.error("trending_keywords query failed: %s", exc)
        return []

    kw_counter: Counter = Counter()
    for row in result.data or []:
        kws = row.get("keywords") or []
        if isinstance(kws, list):
            # Normalise: lowercase, strip whitespace, skip empties
            kw_counter.update(
                kw.lower().strip() for kw in kws if isinstance(kw, str) and kw.strip()
            )

    return [
        {"keyword": k, "count": v}
        for k, v in kw_counter.most_common(20)
    ]


# ---------------------------------------------------------------------------
# GET /articles — paginated article list with filters
# ---------------------------------------------------------------------------
@router.get("/articles", summary="Paginated articles with optional filters")
async def list_articles(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    category: str | None = Query(None),
    sentiment: str | None = Query(None),
    search: str | None = Query(None),
):
    """
    Returns articles from Supabase with optional filters:
    category, sentiment (positive/negative/neutral), and title search.
    """
    return await get_articles(
        limit=limit,
        offset=offset,
        category=category,
        sentiment=sentiment,
        search=search,
    )
