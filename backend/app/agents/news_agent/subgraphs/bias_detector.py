"""
Bias Detector subgraph for the News Intelligence Agent.

Searches the same query across left-leaning, centrist, and right-leaning
sources separately, then uses Groq to compare tone and framing differences.
Compiled without a checkpointer — the parent graph handles persistence.
"""
from __future__ import annotations

import json
import logging
import re

from langchain_groq import ChatGroq
from langgraph.graph import END, START, StateGraph
from tavily import TavilyClient

from app.agents.news_agent.state import NewsAgentState
from app.config import settings

logger = logging.getLogger("datastraw.subgraph.bias_detector")

# Module-level LLM (shares same model as nodes.py)
_llm = ChatGroq(model="llama-3.3-70b-versatile", api_key=settings.groq_api_key)
_CODE_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)

# Source lists by political leaning
_LEFT_DOMAINS = ["guardian.com", "msnbc.com", "huffpost.com"]
_CENTER_DOMAINS = ["reuters.com", "apnews.com", "bbc.com"]
_RIGHT_DOMAINS = ["foxnews.com", "wsj.com", "nypost.com"]


def _search_with_domains(query: str, domains: list[str]) -> list[dict]:
    """Run a Tavily search restricted to specific domains."""
    try:
        client = TavilyClient(api_key=settings.tavily_api_key)
        response = client.search(
            query,
            max_results=3,
            search_depth="basic",
            include_domains=domains,
        )
        return [
            {
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "content": (r.get("content") or "")[:800],
            }
            for r in response.get("results", [])
        ]
    except Exception as exc:
        logger.warning("Bias search failed for domains %s: %s", domains, exc)
        return []


def _summarise_group(results: list[dict]) -> str:
    """Concatenate titles + snippets from a source group into one context block."""
    if not results:
        return "No coverage found from these sources."
    parts = [f"• {r['title']}: {r['content'][:300]}" for r in results]
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Subgraph Nodes
# ---------------------------------------------------------------------------

async def bias_search_node(state: NewsAgentState) -> dict:
    """
    Searches the original query separately on left-leaning, centrist,
    and right-leaning sources using Tavily's include_domains filter.
    Stores results in session_metadata for the analysis node.
    """
    query = state["query"]
    import asyncio

    left, center, right = await asyncio.gather(
        asyncio.to_thread(_search_with_domains, query, _LEFT_DOMAINS),
        asyncio.to_thread(_search_with_domains, query, _CENTER_DOMAINS),
        asyncio.to_thread(_search_with_domains, query, _RIGHT_DOMAINS),
    )

    logger.info(
        "Bias search — left: %d, center: %d, right: %d results",
        len(left), len(center), len(right),
    )

    # Store in session_metadata so the analysis node can read them
    existing_meta = dict(state.get("session_metadata") or {})
    existing_meta["bias_left_results"] = left
    existing_meta["bias_center_results"] = center
    existing_meta["bias_right_results"] = right

    return {
        "session_metadata": existing_meta,
        "current_step": "bias_search",
    }


async def bias_analysis_node(state: NewsAgentState) -> dict:
    """
    Uses Groq LLaMA to compare tone and framing across the three source groups.
    Returns a structured bias_analysis dict with angles, score, and recommendation.
    """
    meta = state.get("session_metadata") or {}
    left = meta.get("bias_left_results", [])
    center = meta.get("bias_center_results", [])
    right = meta.get("bias_right_results", [])

    left_text = _summarise_group(left)
    center_text = _summarise_group(center)
    right_text = _summarise_group(right)

    prompt = (
        f"Analyze how different media outlets cover this topic: '{state['query']}'\n\n"
        f"LEFT-LEANING SOURCES ({', '.join(_LEFT_DOMAINS)}):\n{left_text}\n\n"
        f"CENTER SOURCES ({', '.join(_CENTER_DOMAINS)}):\n{center_text}\n\n"
        f"RIGHT-LEANING SOURCES ({', '.join(_RIGHT_DOMAINS)}):\n{right_text}\n\n"
        "Return ONLY valid JSON — no markdown, no explanation:\n"
        "{\n"
        '  "left_angle": "<how left-leaning sources frame this story>",\n'
        '  "center_angle": "<how centrist sources frame this story>",\n'
        '  "right_angle": "<how right-leaning sources frame this story>",\n'
        '  "bias_score": <float -1.0 (far left) to 1.0 (far right)>,\n'
        '  "key_differences": ["<difference 1>", "<difference 2>", "<difference 3>"],\n'
        '  "recommendation": "<what a critical reader should know about this coverage>"\n'
        "}"
    )

    default_analysis = {
        "left_angle": left_text[:200] if left else "No coverage found.",
        "center_angle": center_text[:200] if center else "No coverage found.",
        "right_angle": right_text[:200] if right else "No coverage found.",
        "bias_score": 0.0,
        "key_differences": [],
        "recommendation": "Insufficient data from one or more source groups.",
    }

    try:
        response = await _llm.ainvoke(prompt)
        raw = _CODE_FENCE_RE.sub("", response.content).strip()
        bias_analysis = json.loads(raw)
        for k, v in default_analysis.items():
            bias_analysis.setdefault(k, v)
    except Exception as exc:
        logger.error("Bias analysis LLM/parse error: %s", exc)
        bias_analysis = default_analysis

    logger.info(
        "Bias analysis complete — score: %.2f", bias_analysis.get("bias_score", 0.0)
    )
    return {"bias_analysis": bias_analysis, "current_step": "bias_analysis"}


# ---------------------------------------------------------------------------
# Subgraph assembly
# ---------------------------------------------------------------------------
_builder = StateGraph(NewsAgentState)
_builder.add_node("bias_search", bias_search_node)
_builder.add_node("bias_analysis", bias_analysis_node)

_builder.add_edge(START, "bias_search")
_builder.add_edge("bias_search", "bias_analysis")
_builder.add_edge("bias_analysis", END)

# Compiled without checkpointer — parent graph owns persistence
bias_detector_graph = _builder.compile()
