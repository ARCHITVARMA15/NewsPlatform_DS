"""
Dive Deeper subgraph for the News Intelligence Agent.

Searches 5 additional sources using expanded Tavily queries,
then re-runs insight generation with the combined source pool.
Compiled without a checkpointer — the parent graph handles persistence.
"""
from __future__ import annotations

import asyncio
import logging

from langgraph.graph import END, START, StateGraph

from app.agents.news_agent.nodes import insight_generator_node, llm
from app.agents.news_agent.state import NewsAgentState
from app.agents.news_agent.tools import tavily_search

logger = logging.getLogger("datastraw.subgraph.dive_deeper")

# ---------------------------------------------------------------------------
# Subgraph Nodes
# ---------------------------------------------------------------------------

async def dive_search_node(state: NewsAgentState) -> dict:
    """
    Searches 5 MORE sources by appending analytical suffixes to the
    original query. Merges results with existing web_results (dedup by URL).
    """
    query = state["query"]
    expanded_queries = [
        f"{query} analysis",
        f"{query} expert opinion",
        f"{query} latest update",
    ]

    results_nested = await asyncio.gather(
        *[
            tavily_search.ainvoke({"query": q, "max_results": 5})
            for q in expanded_queries
        ],
        return_exceptions=True,
    )

    existing_urls: set[str] = {
        s.get("url", "") for s in (state.get("web_results") or [])
    }
    new_results: list[dict] = []
    for batch in results_nested:
        if isinstance(batch, Exception):
            logger.error("Dive search error: %s", batch)
            continue
        for item in batch:
            url = item.get("url", "")
            if url and url not in existing_urls:
                existing_urls.add(url)
                new_results.append(item)

    # Merge: new results added to existing web_results
    combined = list(state.get("web_results") or []) + new_results
    logger.info(
        "Dive deeper: added %d new sources (total: %d)", len(new_results), len(combined)
    )
    return {
        "web_results": combined,
        "current_step": "dive_deeper_search",
    }


async def dive_insight_node(state: NewsAgentState) -> dict:
    """
    Re-runs insight generation with the expanded source pool.
    Delegates to the main insight_generator_node for consistency.
    """
    logger.info("Dive deeper: regenerating insights with expanded sources")
    result = await insight_generator_node(state)
    return {**result, "current_step": "dive_deeper_insights"}


# ---------------------------------------------------------------------------
# Subgraph assembly
# ---------------------------------------------------------------------------
_builder = StateGraph(NewsAgentState)
_builder.add_node("dive_search", dive_search_node)
_builder.add_node("dive_insights", dive_insight_node)

_builder.add_edge(START, "dive_search")
_builder.add_edge("dive_search", "dive_insights")
_builder.add_edge("dive_insights", END)

# Compiled without checkpointer — parent graph owns persistence
dive_deeper_graph = _builder.compile()
