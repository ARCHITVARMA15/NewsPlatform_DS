"""
Debate router — /api/debate/*

Exposes the Multi-Agent Debate System over SSE streaming.

Endpoints:
  POST /start           — Start a debate from a raw topic + context
  POST /from-article    — Start a debate seeded from a Supabase article
  GET  /topics/suggestions — Return 5 debate-worthy topics from recent headlines
"""
from __future__ import annotations

import logging
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage
from langchain_groq import ChatGroq
from pydantic import BaseModel, Field

from app.agents.debate_agent.graph import stream_debate
from app.config import settings
from app.database.supabase_client import get_article_by_id, get_articles

logger = logging.getLogger("datastraw.router.debate")

router = APIRouter(prefix="/api/debate", tags=["Debate"])

# Module-level LLM for the suggestions endpoint
_llm = ChatGroq(model="llama-3.3-70b-versatile", api_key=settings.groq_api_key)


# ---------------------------------------------------------------------------
# Pydantic request models
# ---------------------------------------------------------------------------
class DebateRequest(BaseModel):
    topic:           str
    article_context: str       = ""
    max_rounds:      int       = Field(default=4, ge=2, le=6)
    thread_id:       str | None = None


class ArticleDebateRequest(BaseModel):
    article_id: str
    max_rounds: int = Field(default=4, ge=2, le=6)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _stream_response(generator, thread_id: str) -> StreamingResponse:
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "X-Thread-ID":   thread_id,
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# POST /start — start a debate from raw topic + context
# ---------------------------------------------------------------------------
@router.post(
    "/start",
    summary="Start a Multi-Agent Debate on a news topic (SSE streaming)",
)
async def start_debate(request: DebateRequest):
    """
    Streams a structured debate between the Optimist Analyst and Skeptic Analyst
    over the provided topic. Both agents are powered by Groq LLaMA-3.3-70b.

    SSE event types:
      argument   — each agent's argument per round
      conclusion — final consensus / winner / key insight
      done       — stream end marker
      error      — runtime error
    """
    if not request.topic.strip():
        raise HTTPException(status_code=422, detail="topic cannot be empty")

    thread_id = request.thread_id or str(uuid4())
    logger.info("Starting debate thread=%s topic='%s'", thread_id, request.topic[:80])

    generator = stream_debate(
        topic=request.topic,
        article_context=request.article_context,
        max_rounds=request.max_rounds,
        thread_id=thread_id,
    )
    return _stream_response(generator, thread_id)


# ---------------------------------------------------------------------------
# POST /from-article — seed debate from a Supabase article
# ---------------------------------------------------------------------------
@router.post(
    "/from-article",
    summary="Start a debate seeded from a stored article (SSE streaming)",
)
async def debate_from_article(request: ArticleDebateRequest):
    """
    Fetches the article by ID from Supabase, then starts the debate using:
      - topic = article title
      - article_context = article summary + insights (joined)
    """
    article = await get_article_by_id(request.article_id)
    if not article:
        raise HTTPException(
            status_code=404,
            detail=f"Article '{request.article_id}' not found in database.",
        )

    topic   = article.get("title", "").strip()
    if not topic:
        raise HTTPException(status_code=422, detail="Article has no title to debate.")

    # Build context from summary + insights
    context_parts: list[str] = []
    if article.get("summary"):
        context_parts.append(article["summary"])
    insights = article.get("insights") or []
    if isinstance(insights, list) and insights:
        context_parts.append("Key insights: " + "; ".join(str(i) for i in insights))
    elif article.get("description"):
        context_parts.append(article["description"])

    article_context = "\n".join(context_parts)
    thread_id       = str(uuid4())

    logger.info(
        "Article debate thread=%s article_id=%s topic='%s'",
        thread_id, request.article_id, topic[:80],
    )

    generator = stream_debate(
        topic=topic,
        article_context=article_context,
        max_rounds=request.max_rounds,
        thread_id=thread_id,
    )
    return _stream_response(generator, thread_id)


# ---------------------------------------------------------------------------
# GET /topics/suggestions — LLM-generated debate topics from headlines
# ---------------------------------------------------------------------------
@router.get(
    "/topics/suggestions",
    summary="Get 5 debate-worthy topic suggestions from recent headlines",
)
async def topic_suggestions():
    """
    Fetches the 10 most recent articles from Supabase and asks Groq to
    suggest 5 debate-worthy propositions derived from those headlines.
    Returns {"suggestions": list[str]}.
    """
    try:
        articles = await get_articles(limit=10)
    except Exception as exc:
        logger.error("Failed to fetch articles for suggestions: %s", exc)
        articles = []

    if articles:
        headlines = "\n".join(
            f"- {a.get('title', '')}" for a in articles if a.get("title")
        )
        prompt = (
            f"Given these recent news headlines:\n{headlines}\n\n"
            "Generate exactly 5 debate-worthy propositions (one sentence each) "
            "that would make for engaging structured debates. "
            "Return only a JSON array of 5 strings, no markdown, no preamble."
        )
    else:
        prompt = (
            "Generate exactly 5 current, debate-worthy news propositions "
            "(one sentence each) covering geopolitics, technology, economy, and society. "
            "Return only a JSON array of 5 strings, no markdown, no preamble."
        )

    try:
        response = await _llm.ainvoke([HumanMessage(content=prompt)])
        raw = response.content.strip().strip("```json").strip("```").strip()
        suggestions: list[str] = __import__("json").loads(raw)
        if not isinstance(suggestions, list):
            raise ValueError("Expected a JSON array")
        suggestions = [str(s) for s in suggestions[:5]]
    except Exception as exc:
        logger.warning("topic_suggestions LLM parse failed: %s", exc)
        suggestions = [
            "AI regulation will stifle innovation more than it protects society",
            "Central bank digital currencies pose a greater risk than Bitcoin",
            "Remote work permanently reduces corporate productivity",
            "Climate pledges by major economies are structurally insufficient",
            "Social media platforms cause more harm than benefit to democracy",
        ]

    return {"suggestions": suggestions}
