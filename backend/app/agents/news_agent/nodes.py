"""
LangGraph node functions for the News Intelligence Agent.

Each node takes the full NewsAgentState and returns a partial dict
that LangGraph merges back into the shared state.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone

import httpx
from langchain_groq import ChatGroq

from app.agents.news_agent.state import NewsAgentState
from app.agents.news_agent.tools import (
    calculate_insight_confidence,
    fetch_newsdata,
    generate_pdf_tool,
    score_source_credibility,
    tavily_search,
)
from app.config import settings

logger = logging.getLogger("datastraw.agent.nodes")

# Module-level LLM instance (shared across all node calls)
llm = ChatGroq(model="llama-3.3-70b-versatile", api_key=settings.groq_api_key)

# Pre-compiled code-fence stripper
_CODE_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


def _strip_fences(text: str) -> str:
    return _CODE_FENCE_RE.sub("", text).strip()


# ---------------------------------------------------------------------------
# Node 1 — Query Planner
# ---------------------------------------------------------------------------
async def query_planner_node(state: NewsAgentState) -> dict:
    """
    Breaks the user query into 3-5 specific sub-queries for parallel search.
    Each sub-query targets a different angle of the story.
    """
    query = state["query"]
    prompt = (
        "You are a news research planner. Break this query into 3-5 specific "
        "sub-queries that will help find comprehensive information from different "
        "angles. Return ONLY a JSON array of strings.\n\n"
        f"Query: {query}"
    )

    sub_queries = [query]  # fallback
    try:
        response = await llm.ainvoke(prompt)
        raw = _strip_fences(response.content)
        parsed = json.loads(raw)
        if isinstance(parsed, list) and parsed:
            sub_queries = [str(q) for q in parsed[:5]]
            logger.info("Query planner produced %d sub-queries", len(sub_queries))
    except Exception as exc:
        logger.warning("Query planner JSON parse failed (%s) — using original query", exc)

    return {"sub_queries": sub_queries, "current_step": "query_planning"}


# ---------------------------------------------------------------------------
# Node 2 — Web Search
# ---------------------------------------------------------------------------
async def web_search_node(state: NewsAgentState) -> dict:
    """
    Runs Tavily search concurrently for every sub-query.
    Flattens and deduplicates results by URL.
    """
    sub_queries = state.get("sub_queries") or [state["query"]]

    results_nested = await asyncio.gather(
        *[
            tavily_search.ainvoke({"query": q, "max_results": 5})
            for q in sub_queries
        ],
        return_exceptions=True,
    )

    seen_urls: set[str] = set()
    flat: list[dict] = []
    for batch in results_nested:
        if isinstance(batch, Exception):
            logger.error("Tavily sub-query failed: %s", batch)
            continue
        for item in batch:
            url = item.get("url", "")
            if url and url not in seen_urls:
                seen_urls.add(url)
                flat.append(item)

    logger.info("Web search: %d unique results across %d queries", len(flat), len(sub_queries))
    return {"web_results": flat, "current_step": "web_search"}


# ---------------------------------------------------------------------------
# Node 3 — NewsData Fetch
# ---------------------------------------------------------------------------
async def newsdata_fetch_node(state: NewsAgentState) -> dict:
    """Fetches related articles from NewsData.io for the original query."""
    query = state["query"]
    articles = await asyncio.to_thread(
        fetch_newsdata.invoke, {"query": query, "limit": 20}
    )
    logger.info("NewsData fetch: %d articles", len(articles))
    return {"newsdata_articles": articles, "current_step": "newsdata_fetch"}


# ---------------------------------------------------------------------------
# Node 4 — Source Validator
# ---------------------------------------------------------------------------
async def source_validator_node(state: NewsAgentState) -> dict:
    """
    Scores every web result's URL for credibility.
    Filters to credibility ≥ 0.5, sorted descending.
    Falls back to top-5 if fewer than 5 sources survive the threshold.
    """
    web_results = state.get("web_results") or []

    scored: list[dict] = []
    for source in web_results:
        url = source.get("url", "")
        cred_result = score_source_credibility.invoke({"url": url})
        scored.append({**source, **cred_result})

    # Filter threshold
    filtered = [s for s in scored if s.get("credibility", 0) >= 0.5]

    # Ensure at least 5 sources (relax threshold if needed)
    if len(filtered) < 5:
        logger.warning(
            "Only %d sources above 0.5 threshold — relaxing to top-5", len(filtered)
        )
        filtered = sorted(scored, key=lambda x: x.get("credibility", 0), reverse=True)[:5]

    validated = sorted(filtered, key=lambda x: x.get("credibility", 0), reverse=True)
    logger.info("Source validator: %d → %d validated sources", len(web_results), len(validated))
    return {"validated_sources": validated, "current_step": "source_validation"}


# ---------------------------------------------------------------------------
# Node 5 — Insight Generator
# ---------------------------------------------------------------------------
async def insight_generator_node(state: NewsAgentState) -> dict:
    """
    Calls Groq LLaMA to generate a structured intelligence report from
    validated sources + newsdata articles.
    Calculates per-insight confidence scores from source corroboration.
    """
    validated = state.get("validated_sources") or []
    newsdata = state.get("newsdata_articles") or []

    # Build context block (cap at 8000 chars to stay within token limits)
    context_parts: list[str] = []
    for s in validated[:8]:
        context_parts.append(
            f"[SOURCE: {s.get('url', '')}]\n{s.get('content', '')[:600]}"
        )
    for a in newsdata[:5]:
        context_parts.append(
            f"[NEWSDATA: {a.get('source_name', '')}]\n{a.get('content', '')[:400]}"
        )
    context = "\n\n".join(context_parts)[:8000]

    prompt = (
        "You are an expert news analyst. Based on the provided sources, "
        "generate a comprehensive intelligence report.\n\n"
        f"Sources:\n{context}\n\n"
        "Return ONLY a valid JSON object with these exact fields:\n"
        "{\n"
        '  "summary": "<3-5 sentence executive summary>",\n'
        '  "insights": ["<insight 1>", "<insight 2>", "<insight 3>", "<insight 4>", "<insight 5>"],\n'
        '  "sentiment": "<positive|negative|neutral>",\n'
        '  "sentiment_score": <float -1.0 to 1.0>,\n'
        '  "keywords": ["<kw1>", "<kw2>", "<kw3>", "<kw4>", "<kw5>"]\n'
        "}"
    )

    defaults = {
        "summary": "",
        "insights": [],
        "sentiment": "neutral",
        "sentiment_score": 0.0,
        "keywords": [],
    }

    try:
        response = await llm.ainvoke(prompt)
        raw = _strip_fences(response.content)
        analysis = json.loads(raw)
        for k, v in defaults.items():
            analysis.setdefault(k, v)
    except Exception as exc:
        logger.error("Insight generator failed: %s", exc)
        analysis = defaults

    # Calculate per-insight confidence scores
    all_sources = validated + newsdata
    confidence_scores: dict[str, float] = {}
    for insight in analysis.get("insights", []):
        score = await asyncio.to_thread(
            calculate_insight_confidence.invoke,
            {"insight": insight, "sources": all_sources},
        )
        confidence_scores[insight] = score

    logger.info(
        "Insight generator: %d insights, sentiment=%s",
        len(analysis.get("insights", [])),
        analysis.get("sentiment"),
    )
    return {
        "summary": analysis.get("summary", ""),
        "insights": analysis.get("insights", []),
        "sentiment": analysis.get("sentiment", "neutral"),
        "sentiment_score": analysis.get("sentiment_score", 0.0),
        "confidence_scores": confidence_scores,
        "current_step": "insight_generation",
    }


# ---------------------------------------------------------------------------
# Node 6 — PDF Generator
# ---------------------------------------------------------------------------
async def pdf_generator_node(state: NewsAgentState) -> dict:
    """Generates a professional PDF intelligence report and saves to /tmp."""
    thread_id = state.get("thread_id", "unknown")
    output_path = f"/tmp/report_{thread_id}.pdf"

    content = {
        "title": f"News Intelligence Report: {state.get('query', '')}",
        "query": state.get("query", ""),
        "summary": state.get("summary", ""),
        "insights": state.get("insights", []),
        "validated_sources": state.get("validated_sources", []),
        "sentiment": state.get("sentiment", "neutral"),
        "sentiment_score": state.get("sentiment_score", 0.0),
        "confidence_scores": state.get("confidence_scores", {}),
        "bias_analysis": state.get("bias_analysis", {}),
        "trend_data": state.get("trend_data", []),
        "generated_at": datetime.now(timezone.utc).strftime("%B %d, %Y at %H:%M UTC"),
    }

    path = await asyncio.to_thread(
        generate_pdf_tool.invoke, {"content": content, "output_path": output_path}
    )
    logger.info("PDF saved: %s", path)
    return {"pdf_path": path, "current_step": "pdf_generated"}


# ---------------------------------------------------------------------------
# Node 7 — Trend Timeline
# ---------------------------------------------------------------------------
async def trend_timeline_node(state: NewsAgentState) -> dict:
    """
    Fetches the last 30 days of articles for the original query
    and groups them by ISO week to show narrative evolution over time.
    """
    query = state["query"]
    from_date = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")

    params = {
        "apikey": settings.newsdata_api_key,
        "q": query,
        "language": "en",
        "from_date": from_date,
        "size": 50,
    }

    articles: list[dict] = []
    try:
        with httpx.Client(timeout=20.0) as client:
            resp = client.get("https://newsdata.io/api/1/news", params=params)
            resp.raise_for_status()
            data = resp.json()
            articles = data.get("results", [])
    except Exception as exc:
        logger.error("Trend timeline fetch failed: %s", exc)

    # Group by ISO week
    week_buckets: dict[str, list[dict]] = defaultdict(list)
    for art in articles:
        pub_date = art.get("pubDate", "")
        try:
            dt = datetime.strptime(pub_date, "%Y-%m-%d %H:%M:%S")
            week_key = dt.strftime("%Y-W%V")  # e.g. "2024-W03"
        except (ValueError, TypeError):
            week_key = "unknown"
        week_buckets[week_key].append(
            {
                "title": art.get("title", ""),
                "source": art.get("source_id", ""),
                "published_at": pub_date,
            }
        )

    trend_data = [
        {"week": week, "article_count": len(arts), "articles": arts[:3]}
        for week, arts in sorted(week_buckets.items())
        if week != "unknown"
    ]
    logger.info("Trend timeline: %d weeks of data", len(trend_data))
    return {"trend_data": trend_data, "current_step": "trend_analysis"}


# ---------------------------------------------------------------------------
# Node 8 — Human Interrupt (HITL placeholder)
# ---------------------------------------------------------------------------
async def human_interrupt_node(state: NewsAgentState) -> dict:
    """
    Placeholder node for the HITL interrupt point.
    The actual interrupt is declared at graph level via interrupt_before=["human_interrupt"].
    When the graph resumes, human_action in state tells us what the user clicked.
    """
    return {}


# ---------------------------------------------------------------------------
# Routing function (used in add_conditional_edges — NOT a node)
# ---------------------------------------------------------------------------
def route_human_action(state: NewsAgentState) -> str:
    """
    Reads state.human_action and returns the edge label for conditional routing.
    Called by LangGraph after the HITL interrupt is resumed.
    """
    action = (state.get("human_action") or "end").lower()
    mapping = {
        "generate_pdf": "pdf",
        "dive_deeper": "dive_deeper",
        "bias_detect": "bias_detect",
        "track_story": "track_story",
        "end": "end",
    }
    return mapping.get(action, "end")
