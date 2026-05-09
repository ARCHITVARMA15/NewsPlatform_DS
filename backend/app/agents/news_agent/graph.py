"""
News Intelligence Agent — main LangGraph graph.

Graph flow:
  START
    → query_planner → web_search → newsdata_fetch
    → source_validator → insight_generator
    → [INTERRUPT] → human_interrupt
    → conditional:
        "pdf"         → pdf_generator   → END
        "dive_deeper" → dive_deeper      → human_interrupt (loop)
        "bias_detect" → bias_detect      → human_interrupt (loop)
        "track_story" → trend_timeline   → human_interrupt (loop)
        "end"         → END
"""
from __future__ import annotations

import json
import logging
from typing import AsyncGenerator

from langgraph.graph import END, START, StateGraph

from app.agents.news_agent.nodes import (
    human_interrupt_node,
    insight_generator_node,
    newsdata_fetch_node,
    pdf_generator_node,
    query_planner_node,
    route_human_action,
    source_validator_node,
    trend_timeline_node,
    web_search_node,
)
from app.agents.news_agent.state import NewsAgentState
from app.agents.news_agent.subgraphs.bias_detector import bias_detector_graph
from app.agents.news_agent.subgraphs.dive_deeper import dive_deeper_graph
from app.database.sqlite_checkpointer import get_checkpointer, get_thread_config

logger = logging.getLogger("datastraw.agent.graph")

# ---------------------------------------------------------------------------
# Build graph structure once (no checkpointer yet — attached at compile time)
# ---------------------------------------------------------------------------
_builder = StateGraph(NewsAgentState)

# Nodes
_builder.add_node("query_planner", query_planner_node)
_builder.add_node("web_search", web_search_node)
_builder.add_node("newsdata_fetch", newsdata_fetch_node)
_builder.add_node("source_validator", source_validator_node)
_builder.add_node("insight_generator", insight_generator_node)
_builder.add_node("human_interrupt", human_interrupt_node)
_builder.add_node("pdf_generator", pdf_generator_node)
_builder.add_node("trend_timeline", trend_timeline_node)
_builder.add_node("dive_deeper", dive_deeper_graph)   # compiled subgraph as node
_builder.add_node("bias_detect", bias_detector_graph)  # compiled subgraph as node

# Linear pipeline edges
_builder.add_edge(START, "query_planner")
_builder.add_edge("query_planner", "web_search")
_builder.add_edge("web_search", "newsdata_fetch")
_builder.add_edge("newsdata_fetch", "source_validator")
_builder.add_edge("source_validator", "insight_generator")
_builder.add_edge("insight_generator", "human_interrupt")

# HITL conditional edges
_builder.add_conditional_edges(
    "human_interrupt",
    route_human_action,
    {
        "pdf": "pdf_generator",
        "dive_deeper": "dive_deeper",
        "bias_detect": "bias_detect",
        "track_story": "trend_timeline",
        "end": END,
    },
)

# Loopback edges (subgraphs return to HITL)
_builder.add_edge("dive_deeper", "human_interrupt")
_builder.add_edge("bias_detect", "human_interrupt")
_builder.add_edge("trend_timeline", "human_interrupt")
_builder.add_edge("pdf_generator", END)


# ---------------------------------------------------------------------------
# Graph factory
# ---------------------------------------------------------------------------
async def create_news_agent_graph(checkpointer):
    """
    Compile the news agent graph with a live checkpointer.
    Called inside a `async with get_checkpointer()` context so the
    SQLite connection stays open for the full lifetime of the graph.
    """
    return _builder.compile(
        checkpointer=checkpointer,
        interrupt_before=["human_interrupt"],
    )


# ---------------------------------------------------------------------------
# SSE helper
# ---------------------------------------------------------------------------
def _sse(event: str, data: dict) -> str:
    """Format a dict as a Server-Sent Event data line."""
    return f"data: {json.dumps({'event': event, 'data': data})}\n\n"


# ---------------------------------------------------------------------------
# Node names for step-event filtering
# ---------------------------------------------------------------------------
_NODE_NAMES = {
    "query_planner", "web_search", "newsdata_fetch",
    "source_validator", "insight_generator", "human_interrupt",
    "pdf_generator", "trend_timeline",
    "dive_deeper", "dive_search", "dive_insights",
    "bias_detect", "bias_search", "bias_analysis",
}


# ---------------------------------------------------------------------------
# Main streaming function
# ---------------------------------------------------------------------------
async def stream_news_agent(
    query: str,
    thread_id: str,
    human_action: str | None = None,
) -> AsyncGenerator[str, None]:
    """
    Async generator that streams SSE events for the News Intelligence Agent.

    - First call:  human_action=None  → runs full pipeline from START
    - Resume call: human_action="..." → injects action and resumes from interrupt
    """
    config = get_thread_config(thread_id)

    try:
        async with get_checkpointer() as checkpointer:
            graph = await create_news_agent_graph(checkpointer)

            # ── Determine input ──────────────────────────────────────────
            if human_action:
                # Resume from HITL interrupt — inject the chosen action
                await graph.aupdate_state(config, {"human_action": human_action})
                input_data = None  # None = resume from saved checkpoint
                logger.info(
                    "Resuming thread=%s with action='%s'", thread_id, human_action
                )
            else:
                # Fresh run
                input_data = {
                    "query": query,
                    "messages": [],
                    "sub_queries": [],
                    "web_results": [],
                    "newsdata_articles": [],
                    "validated_sources": [],
                    "summary": "",
                    "insights": [],
                    "sentiment": "",
                    "sentiment_score": 0.0,
                    "confidence_scores": {},
                    "bias_analysis": {},
                    "trend_data": [],
                    "pdf_path": None,
                    "thread_id": thread_id,
                    "current_step": "starting",
                    "error": None,
                    "human_action": None,
                    "session_metadata": {},
                }
                logger.info("Starting fresh run thread=%s query='%s'", thread_id, query[:80])

            # ── Stream events ────────────────────────────────────────────
            async for event in graph.astream_events(
                input_data, config=config, version="v2"
            ):
                ev_type: str = event.get("event", "")
                # Prefer metadata["langgraph_node"] for reliable node identification
                node_name: str = (
                    event.get("metadata", {}).get("langgraph_node", "")
                    or event.get("name", "")
                )

                # ── Step progress events ──────────────────────────────
                if ev_type == "on_chain_start" and node_name in _NODE_NAMES:
                    yield _sse("step", {"step": node_name, "thread_id": thread_id})

                # ── Insight result event ──────────────────────────────
                elif ev_type == "on_chain_end" and node_name == "insight_generator":
                    output: dict = event.get("data", {}).get("output", {})
                    yield _sse(
                        "result",
                        {
                            "thread_id": thread_id,
                            "summary": output.get("summary", ""),
                            "insights": output.get("insights", []),
                            "sentiment": output.get("sentiment", "neutral"),
                            "sentiment_score": output.get("sentiment_score", 0.0),
                            "confidence_scores": output.get("confidence_scores", {}),
                        },
                    )

                # ── PDF ready event ───────────────────────────────────
                elif ev_type == "on_chain_end" and node_name == "pdf_generator":
                    output = event.get("data", {}).get("output", {})
                    yield _sse(
                        "pdf_ready",
                        {
                            "thread_id": thread_id,
                            "pdf_path": output.get("pdf_path", ""),
                        },
                    )

                # ── Bias analysis complete ────────────────────────────
                elif ev_type == "on_chain_end" and node_name in ("bias_analysis", "bias_detect"):
                    output = event.get("data", {}).get("output", {})
                    bias = output.get("bias_analysis", {})
                    if bias:
                        yield _sse("bias_result", {"thread_id": thread_id, "bias_analysis": bias})

                # ── Trend timeline complete ───────────────────────────
                elif ev_type == "on_chain_end" and node_name == "trend_timeline":
                    output = event.get("data", {}).get("output", {})
                    yield _sse(
                        "trend_result",
                        {
                            "thread_id": thread_id,
                            "trend_data": output.get("trend_data", []),
                        },
                    )

            # ── After stream ends: check for interrupt ────────────────
            final_state = await graph.aget_state(config)
            if final_state and final_state.next:
                # Graph is paused at human_interrupt
                logger.info("Graph interrupted — thread=%s next=%s", thread_id, final_state.next)
                yield _sse(
                    "interrupted",
                    {
                        "thread_id": thread_id,
                        "awaiting_action": True,
                        "available_actions": [
                            "generate_pdf",
                            "dive_deeper",
                            "bias_detect",
                            "track_story",
                            "end",
                        ],
                    },
                )

    except Exception as exc:
        logger.error("stream_news_agent error thread=%s: %s", thread_id, exc)
        yield _sse("error", {"thread_id": thread_id, "message": str(exc)})
