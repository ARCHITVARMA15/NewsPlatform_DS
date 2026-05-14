"""
Real-time News Event Detection Service.

Background service that runs every hour via APScheduler.
Uses DBSCAN clustering on article embeddings to surface breaking events,
then broadcasts them to connected SSE clients via an asyncio pub/sub queue.

Supabase table required — run once in Supabase SQL Editor:

    CREATE TABLE IF NOT EXISTS breaking_events (
        id               text        PRIMARY KEY,
        event_name       text,
        description      text,
        category         text,
        urgency          text,
        key_entities     jsonb,
        article_count    int,
        article_ids      jsonb,
        articles_preview jsonb,
        detected_at      timestamptz DEFAULT now()
    );
    -- Enable Realtime on this table in the Supabase dashboard.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import numpy as np

from app.config import settings
from app.database.supabase_client import get_articles, supabase
from app.utils.embeddings import embedding_model
from langchain_groq import ChatGroq

logger = logging.getLogger("datastraw.event_detector")

# ---------------------------------------------------------------------------
# Module-level state (in-memory)
# ---------------------------------------------------------------------------
detected_events: list[dict] = []
last_run_time:   str | None = None

# Pub/sub: one asyncio.Queue per connected SSE client
_subscribers: list[asyncio.Queue] = []


# ---------------------------------------------------------------------------
# LLM (lazy — only instantiated when name_cluster is called)
# ---------------------------------------------------------------------------
_llm: ChatGroq | None = None

def _get_llm() -> ChatGroq:
    global _llm
    if _llm is None:
        _llm = ChatGroq(model="llama-3.3-70b-versatile", api_key=settings.groq_api_key)
    return _llm


# ---------------------------------------------------------------------------
# Pub / sub helpers
# ---------------------------------------------------------------------------
def subscribe() -> asyncio.Queue:
    """Register a new SSE client and return its personal event queue."""
    q: asyncio.Queue = asyncio.Queue()
    _subscribers.append(q)
    logger.debug("SSE subscriber added (%d total)", len(_subscribers))
    return q


def unsubscribe(q: asyncio.Queue) -> None:
    """Deregister an SSE client when the connection closes."""
    try:
        _subscribers.remove(q)
        logger.debug("SSE subscriber removed (%d remaining)", len(_subscribers))
    except ValueError:
        pass


async def _broadcast(event: dict) -> None:
    """Push a new event to every connected SSE client."""
    for q in _subscribers:
        await q.put(event)


# ---------------------------------------------------------------------------
# Step 1 — fetch and embed recent articles
# ---------------------------------------------------------------------------
async def get_recent_article_embeddings(hours: int = 2) -> tuple[list[dict], np.ndarray | None]:
    """
    Fetches articles from the last `hours` hours and embeds their
    title + summary text.

    Returns:
        (articles_list, embeddings_float32_array)
        embeddings is None when fewer than 5 articles are available.
    """
    articles = await get_articles(limit=200)

    cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=hours)
    recent: list[dict] = []
    for a in articles:
        pub = a.get("published_at")
        if not pub:
            continue
        try:
            ts = datetime.fromisoformat(pub.replace("Z", "+00:00"))
            if ts > cutoff:
                recent.append(a)
        except (ValueError, AttributeError):
            continue

    logger.info("get_recent_article_embeddings: %d articles in last %dh", len(recent), hours)

    if len(recent) < 5:
        return recent, None

    texts = [
        f"{a.get('title', '')} {a.get('summary', '')}".strip()
        for a in recent
    ]

    # embedding_model.embed() is synchronous — run off the event-loop thread
    embeddings: np.ndarray = await asyncio.to_thread(embedding_model.embed, texts)
    return recent, embeddings


# ---------------------------------------------------------------------------
# Step 2 — DBSCAN clustering
# ---------------------------------------------------------------------------
def _dbscan_sync(embeddings: np.ndarray) -> np.ndarray:
    """
    Synchronous DBSCAN clustering (runs in a thread pool).
    Embeddings are already L2-normalised (embedding_model does this),
    so cosine distance == 1 - cosine_similarity directly.
    """
    from sklearn.cluster import DBSCAN

    db = DBSCAN(eps=0.35, min_samples=4, metric="cosine").fit(embeddings)
    return db.labels_


async def run_dbscan_clustering(embeddings: np.ndarray) -> np.ndarray:
    """Async wrapper — off-loads sklearn work to thread pool."""
    return await asyncio.to_thread(_dbscan_sync, embeddings)


# ---------------------------------------------------------------------------
# Step 3 — name a cluster with Groq
# ---------------------------------------------------------------------------
async def name_cluster(articles: list[dict]) -> dict:
    """
    Calls Groq LLaMA to assign a human-readable name and metadata
    to a cluster of topically related articles.

    Returns:
        {event_name, description, category, urgency, key_entities}
    """
    titles = "\n".join(f"- {a.get('title', '')}" for a in articles[:8])

    prompt = (
        "These news articles are clustering around a breaking event.\n"
        "Analyze them and return ONLY JSON:\n"
        '{\n'
        '  "event_name": "Short 4-6 word event name",\n'
        '  "description": "One sentence describing what is happening",\n'
        '  "category": "POLITICS|BUSINESS|TECH|CONFLICT|ECONOMY|HEALTH|OTHER",\n'
        '  "urgency": "BREAKING|HIGH|MEDIUM",\n'
        '  "key_entities": ["list", "of", "main", "entities"]\n'
        "}\n\n"
        f"Articles:\n{titles}"
    )

    try:
        response = await _get_llm().ainvoke(prompt)
        text  = response.content
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            return json.loads(match.group())
    except Exception as exc:
        logger.warning("name_cluster LLM failed: %s", exc)

    return {
        "event_name":   "Breaking Development",
        "description":  "Multiple articles detected on related topic",
        "category":     "OTHER",
        "urgency":      "HIGH",
        "key_entities": [],
    }


# ---------------------------------------------------------------------------
# Step 4 — persist to Supabase
# ---------------------------------------------------------------------------
def _insert_event_sync(event: dict) -> None:
    """Synchronous Supabase insert (runs in a thread pool)."""
    supabase.table("breaking_events").insert(event).execute()


# ---------------------------------------------------------------------------
# Main detection pipeline — called by APScheduler every hour
# ---------------------------------------------------------------------------
async def detect_events() -> int:
    """
    Full detection run:
      1. Fetch + embed recent articles.
      2. DBSCAN cluster.
      3. Name novel clusters with Groq.
      4. Persist to Supabase + broadcast to SSE subscribers.

    Returns the number of newly detected events.
    """
    global detected_events, last_run_time

    logger.info("[Event Detector] Running at %s", datetime.now(tz=timezone.utc).isoformat())

    articles, embeddings = await get_recent_article_embeddings(hours=2)

    if embeddings is None or len(articles) < 5:
        logger.info("[Event Detector] Not enough recent articles (%d)", len(articles))
        last_run_time = datetime.now(tz=timezone.utc).isoformat()
        return 0

    labels = await run_dbscan_clustering(embeddings)

    # Group by cluster label (-1 = noise, skip)
    clusters: dict[int, list[dict]] = {}
    for i, label in enumerate(labels):
        if label == -1:
            continue
        clusters.setdefault(int(label), []).append(articles[i])

    logger.info("[Event Detector] DBSCAN found %d clusters", len(clusters))

    new_events: list[dict] = []

    for label, cluster_articles in clusters.items():
        if len(cluster_articles) < 4:
            continue

        cluster_ids = {a.get("article_id", "") for a in cluster_articles}

        # Dedup: if >50% overlap with an existing detected event, skip
        is_new = True
        for existing in detected_events:
            overlap = len(cluster_ids & set(existing.get("article_ids", [])))
            if cluster_ids and overlap / len(cluster_ids) > 0.5:
                is_new = False
                break

        if not is_new:
            continue

        event_info = await name_cluster(cluster_articles)

        event: dict = {
            "id":              str(uuid4()),
            "event_name":      event_info["event_name"],
            "description":     event_info["description"],
            "category":        event_info["category"],
            "urgency":         event_info["urgency"],
            "key_entities":    event_info.get("key_entities", []),
            "article_count":   len(cluster_articles),
            "article_ids":     list(cluster_ids),
            "articles_preview": [
                {"title": a.get("title", ""), "source": a.get("source_name", "")}
                for a in cluster_articles[:3]
            ],
            "detected_at": datetime.now(tz=timezone.utc).isoformat(),
        }

        new_events.append(event)
        detected_events.append(event)

    # Keep only the last 20 events in memory
    detected_events = detected_events[-20:]
    last_run_time   = datetime.now(tz=timezone.utc).isoformat()

    if new_events:
        from app.services.slack_service import notify_breaking_event
        # Persist + broadcast + Slack alert concurrently
        for event in new_events:
            try:
                await asyncio.to_thread(_insert_event_sync, event)
            except Exception as exc:
                logger.warning("[Event Detector] Supabase insert failed: %s", exc)
            await _broadcast(event)
            await notify_breaking_event(event)

        logger.info("[Event Detector] %d new events detected + broadcast", len(new_events))
    else:
        logger.info("[Event Detector] No new events this run")

    return len(new_events)


# ---------------------------------------------------------------------------
# Public getters
# ---------------------------------------------------------------------------
def get_detected_events() -> list[dict]:
    return list(detected_events)


def get_last_run_time() -> str | None:
    return last_run_time
