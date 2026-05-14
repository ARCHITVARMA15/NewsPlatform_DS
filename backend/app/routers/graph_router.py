"""
Knowledge Graph Router — /api/graph/*

Provides REST endpoints for building and querying the entity-relationship
knowledge graph derived from stored news articles.

Cache strategy:
  - Full graph is cached in memory for 30 minutes.
  - Pass ?refresh=true to force a rebuild.
  - Single-article extraction is always live (never cached).
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.agents.graph_builder.extractor import (
    build_full_graph,
    extract_entities_and_relations,
    get_node_articles,
)
from app.database.supabase_client import get_article_by_id, get_articles

logger = logging.getLogger("datastraw.router.graph")

router = APIRouter(prefix="/api/graph", tags=["Knowledge Graph"])

# ---------------------------------------------------------------------------
# In-memory cache
# ---------------------------------------------------------------------------
_graph_cache: dict | None = None
_cache_time:  datetime | None = None
_CACHE_TTL = timedelta(minutes=30)


def _cache_valid() -> bool:
    if _graph_cache is None or _cache_time is None:
        return False
    return datetime.now(tz=timezone.utc) - _cache_time < _CACHE_TTL


def _set_cache(graph: dict) -> None:
    global _graph_cache, _cache_time
    _graph_cache = graph
    _cache_time  = datetime.now(tz=timezone.utc)


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------
class ExtractSingleRequest(BaseModel):
    article_id: str


# ---------------------------------------------------------------------------
# GET /full — full knowledge graph
# ---------------------------------------------------------------------------
@router.get(
    "/full",
    summary="Return the full knowledge graph (cached 30 min)",
)
async def get_full_graph(
    limit:   Annotated[int,  Query(ge=1, le=500)] = 100,
    refresh: Annotated[bool, Query()]             = False,
):
    """
    Returns the unified entity-relationship graph built from the most
    recent `limit` articles. Responses are cached for 30 minutes.
    Pass `refresh=true` to force a rebuild.

    Response shape:
        {nodes, edges, stats, cached_at, from_cache}
    """
    if _cache_valid() and not refresh:
        logger.debug("Returning cached graph (%d nodes)", len(_graph_cache["nodes"]))  # type: ignore[index]
        return {
            **_graph_cache,
            "cached_at":  _cache_time.isoformat(),  # type: ignore[union-attr]
            "from_cache": True,
        }

    logger.info("Building full graph (limit=%d, refresh=%s)", limit, refresh)
    try:
        graph = await build_full_graph(limit=limit)
    except Exception as exc:
        logger.error("build_full_graph failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Graph build failed: {exc}") from exc

    _set_cache(graph)
    return {
        **graph,
        "cached_at":  _cache_time.isoformat(),  # type: ignore[union-attr]
        "from_cache": False,
    }


# ---------------------------------------------------------------------------
# GET /node/{node_id}/articles — articles linked to a node
# ---------------------------------------------------------------------------
@router.get(
    "/node/{node_id}/articles",
    summary="Get articles associated with a specific graph node",
)
async def node_articles(node_id: str):
    """
    Returns up to 10 articles whose titles contain the human-readable
    form of `node_id`.
    """
    try:
        articles = await get_node_articles(node_id)
    except Exception as exc:
        logger.error("get_node_articles(%s) failed: %s", node_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {"node_id": node_id, "articles": articles, "count": len(articles)}


# ---------------------------------------------------------------------------
# GET /node/{node_id}/neighbors — adjacent nodes + connecting edges
# ---------------------------------------------------------------------------
@router.get(
    "/node/{node_id}/neighbors",
    summary="Get a node and all its direct neighbors in the graph",
)
async def node_neighbors(node_id: str):
    """
    Requires a valid graph cache. Returns the target node, its direct
    neighbor nodes, and the edges that connect them.

    Builds the cache on first call if it doesn't exist yet.
    """
    # Ensure graph exists
    if not _cache_valid():
        logger.info("node_neighbors: no cache — triggering build")
        try:
            graph = await build_full_graph(limit=100)
            _set_cache(graph)
        except Exception as exc:
            raise HTTPException(
                status_code=503,
                detail=f"Graph not yet available: {exc}",
            ) from exc

    graph     = _graph_cache  # type: ignore[assignment]
    all_nodes = {n["id"]: n for n in graph["nodes"]}
    all_edges = graph["edges"]

    if node_id not in all_nodes:
        raise HTTPException(
            status_code=404,
            detail=f"Node '{node_id}' not found in graph.",
        )

    # Collect edges where this node is source or target
    connected_edges = [
        e for e in all_edges
        if e.get("source") == node_id or e.get("target") == node_id
    ]

    # Collect neighbor node ids
    neighbor_ids = set()
    for e in connected_edges:
        if e.get("source") == node_id:
            neighbor_ids.add(e["target"])
        else:
            neighbor_ids.add(e["source"])

    neighbor_nodes = [all_nodes[nid] for nid in neighbor_ids if nid in all_nodes]

    return {
        "node":      all_nodes[node_id],
        "neighbors": neighbor_nodes,
        "edges":     connected_edges,
    }


# ---------------------------------------------------------------------------
# POST /extract-single — live extraction for one article
# ---------------------------------------------------------------------------
@router.post(
    "/extract-single",
    summary="Extract the knowledge graph fragment for a single article (live, not cached)",
)
async def extract_single(request: ExtractSingleRequest):
    """
    Fetches the article by ID, runs entity/relation extraction, and returns
    the resulting graph fragment. Does NOT modify the in-memory cache.
    """
    article = await get_article_by_id(request.article_id)
    if not article:
        raise HTTPException(
            status_code=404,
            detail=f"Article '{request.article_id}' not found.",
        )

    try:
        fragment = await extract_entities_and_relations(article)
    except Exception as exc:
        logger.error("extract-single failed for %s: %s", request.article_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "article_id": request.article_id,
        "title":      article.get("title", ""),
        **fragment,
    }


# ---------------------------------------------------------------------------
# GET /stats — lightweight graph statistics
# ---------------------------------------------------------------------------
@router.get(
    "/stats",
    summary="Return graph statistics (from cache if available, else quick Supabase count)",
)
async def graph_stats():
    """
    Returns a quick summary of the current graph:
      - Node count, edge count, articles processed
      - Cache age and validity
    """
    if _cache_valid() and _graph_cache:
        return {
            "stats":      _graph_cache.get("stats", {}),
            "cached_at":  _cache_time.isoformat() if _cache_time else None,
            "from_cache": True,
            "cache_expires_in_seconds": int(
                (_CACHE_TTL - (datetime.now(tz=timezone.utc) - _cache_time)).total_seconds()  # type: ignore[operator]
            ),
        }

    # No cache — return a quick article count from Supabase as a proxy
    try:
        articles = await get_articles(limit=1)
        article_count_approx = len(articles)
    except Exception:
        article_count_approx = 0

    return {
        "stats": {
            "total_nodes":        0,
            "total_edges":        0,
            "articles_processed": 0,
        },
        "cached_at":  None,
        "from_cache": False,
        "message":    "Graph not built yet. Call GET /api/graph/full to build.",
        "article_count_approx": article_count_approx,
    }
