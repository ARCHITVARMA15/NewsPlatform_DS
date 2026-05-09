"""
RAG Agent — main LangGraph graph.

Graph flow:
  START
    → [conditional] pdf_ingestion (if has_pdf) | query_analyzer (if not)
    → query_analyzer
    → [Send fan-out based on clarify_mode]:
        hybrid   → vector_retriever ┐
                 → web_search_rag   ┤ (parallel)
        pdf_only → vector_retriever ┘
        web_only → web_search_rag
    → context_merger → answer_generator
    → [INTERRUPT] → rag_human_interrupt
    → [conditional route_rag_action]:
        "generate_report" → pdf_report_generator → END
        "clarify_pdf"     → set_pdf_only → vector_retriever → context_merger → answer_generator → rag_human_interrupt
        "clarify_web"     → set_web_only → web_search_rag  → context_merger → answer_generator → rag_human_interrupt
        "continue"        → query_analyzer  (follow-up question loop)
        "end"             → END
"""
from __future__ import annotations

import json
import logging
from typing import AsyncGenerator

from langgraph.graph import END, START, StateGraph

from app.agents.rag_agent.nodes import (
    answer_generator_node,
    context_merger_node,
    fan_out_search,
    pdf_ingestion_node,
    pdf_report_generator_node,
    query_analyzer_node,
    rag_human_interrupt_node,
    route_rag_action,
    set_pdf_only_node,
    set_web_only_node,
    should_ingest_pdf,
    vector_retriever_node,
    web_search_rag_node,
)
from app.agents.rag_agent.state import RAGAgentState
from app.database.sqlite_checkpointer import get_checkpointer, get_thread_config

logger = logging.getLogger("datastraw.rag.graph")

# ---------------------------------------------------------------------------
# Build graph structure once at module level (checkpointer attached per-call)
# ---------------------------------------------------------------------------
_builder = StateGraph(RAGAgentState)

# Nodes
_builder.add_node("pdf_ingestion", pdf_ingestion_node)
_builder.add_node("query_analyzer", query_analyzer_node)
_builder.add_node("vector_retriever", vector_retriever_node)
_builder.add_node("web_search_rag", web_search_rag_node)
_builder.add_node("context_merger", context_merger_node)
_builder.add_node("answer_generator", answer_generator_node)
_builder.add_node("rag_human_interrupt", rag_human_interrupt_node)
_builder.add_node("pdf_report_generator", pdf_report_generator_node)
_builder.add_node("set_pdf_only", set_pdf_only_node)
_builder.add_node("set_web_only", set_web_only_node)

# START → pdf_ingestion (if has_pdf) OR directly to query_analyzer
_builder.add_conditional_edges(START, should_ingest_pdf)
_builder.add_edge("pdf_ingestion", "query_analyzer")

# query_analyzer → fan-out search (Send API handles parallel + mode routing)
_builder.add_conditional_edges("query_analyzer", fan_out_search)

# Fan-in: both search nodes feed into context_merger
# LangGraph waits only for nodes triggered in the same super-step:
#   hybrid path  → waits for both vector_retriever + web_search_rag
#   clarify paths → waits for just the one that was triggered
_builder.add_edge("vector_retriever", "context_merger")
_builder.add_edge("web_search_rag", "context_merger")

# Main pipeline continuation
_builder.add_edge("context_merger", "answer_generator")
_builder.add_edge("answer_generator", "rag_human_interrupt")

# HITL conditional routing
_builder.add_conditional_edges(
    "rag_human_interrupt",
    route_rag_action,
    {
        "generate_report": "pdf_report_generator",
        "clarify_pdf": "set_pdf_only",
        "clarify_web": "set_web_only",
        "continue": "query_analyzer",
        "end": END,
    },
)

# Clarify path edges (mode setter → specific search → back to normal pipeline)
_builder.add_edge("set_pdf_only", "vector_retriever")
_builder.add_edge("set_web_only", "web_search_rag")

# Terminal edges
_builder.add_edge("pdf_report_generator", END)


# ---------------------------------------------------------------------------
# Graph factory
# ---------------------------------------------------------------------------
async def create_rag_graph(checkpointer):
    """Compile the RAG graph with a live checkpointer."""
    return _builder.compile(
        checkpointer=checkpointer,
        interrupt_before=["rag_human_interrupt"],
    )


# ---------------------------------------------------------------------------
# SSE helper
# ---------------------------------------------------------------------------
def _sse(event: str, data: dict) -> str:
    return f"data: {json.dumps({'event': event, 'data': data})}\n\n"


_NODE_NAMES = {
    "pdf_ingestion", "query_analyzer", "vector_retriever", "web_search_rag",
    "context_merger", "answer_generator", "rag_human_interrupt",
    "pdf_report_generator", "set_pdf_only", "set_web_only",
}


# ---------------------------------------------------------------------------
# Main streaming function
# ---------------------------------------------------------------------------
async def stream_rag_agent(
    query: str,
    thread_id: str,
    has_pdf: bool = False,
    human_action: str | None = None,
    context: dict | None = None,
) -> AsyncGenerator[str, None]:
    """
    Async generator that streams SSE events for the RAG Agent.

    - First call:  human_action=None  → runs full pipeline from START
    - Resume call: human_action="..." → injects action and resumes from interrupt
    - context dict can carry a new 'query' for "continue" (follow-up) resumes
    """
    config = get_thread_config(thread_id)

    try:
        async with get_checkpointer() as checkpointer:
            graph = await create_rag_graph(checkpointer)

            # ── Determine input ──────────────────────────────────────────
            if human_action:
                update: dict = {"human_action": human_action}
                if context and context.get("query"):
                    update["query"] = context["query"]
                await graph.aupdate_state(config, update)
                input_data = None
                logger.info(
                    "RAG resuming thread=%s action='%s'", thread_id, human_action
                )
            else:
                input_data = {
                    "query": query,
                    "messages": [],
                    "thread_id": thread_id,
                    "has_pdf": has_pdf,
                    "pdf_chunks": [],
                    "pdf_metadata": {},
                    "retrieved_chunks": [],
                    "web_results": [],
                    "merged_context": "",
                    "answer": "",
                    "citations": [],
                    "current_step": "starting",
                    "error": None,
                    "human_action": None,
                    "clarify_mode": "hybrid",
                }
                logger.info(
                    "RAG fresh run thread=%s query='%s' has_pdf=%s",
                    thread_id,
                    query[:80],
                    has_pdf,
                )

            # ── Stream events ────────────────────────────────────────────
            async for event in graph.astream_events(
                input_data, config=config, version="v2"
            ):
                ev_type: str = event.get("event", "")
                node_name: str = (
                    event.get("metadata", {}).get("langgraph_node", "")
                    or event.get("name", "")
                )

                # Step progress
                if ev_type == "on_chain_start" and node_name in _NODE_NAMES:
                    yield _sse("step", {"step": node_name, "thread_id": thread_id})

                # Answer ready
                elif ev_type == "on_chain_end" and node_name == "answer_generator":
                    output = event.get("data", {}).get("output", {})
                    yield _sse(
                        "answer",
                        {
                            "thread_id": thread_id,
                            "answer": output.get("answer", ""),
                            "citations": output.get("citations", []),
                        },
                    )

                # PDF report ready
                elif ev_type == "on_chain_end" and node_name == "pdf_report_generator":
                    output = event.get("data", {}).get("output", {})
                    meta = output.get("pdf_metadata", {})
                    yield _sse(
                        "pdf_ready",
                        {
                            "thread_id": thread_id,
                            "report_path": meta.get("report_path", ""),
                        },
                    )

                # PDF ingestion complete
                elif ev_type == "on_chain_end" and node_name == "pdf_ingestion":
                    output = event.get("data", {}).get("output", {})
                    meta = output.get("pdf_metadata", {})
                    yield _sse(
                        "pdf_ingested",
                        {
                            "thread_id": thread_id,
                            "chunk_count": meta.get("chunk_count", 0),
                            "page_count": meta.get("page_count", 0),
                        },
                    )

            # ── After stream: check for HITL interrupt ───────────────────
            final_state = await graph.aget_state(config)
            if final_state and final_state.next:
                logger.info(
                    "RAG interrupted thread=%s next=%s", thread_id, final_state.next
                )
                # Include citations in interrupted event for UI display
                state_vals = final_state.values or {}
                yield _sse(
                    "interrupted",
                    {
                        "thread_id": thread_id,
                        "awaiting_action": True,
                        "answer": state_vals.get("answer", ""),
                        "citations": state_vals.get("citations", []),
                        "available_actions": [
                            "generate_report",
                            "clarify_pdf",
                            "clarify_web",
                            "continue",
                            "end",
                        ],
                    },
                )

    except Exception as exc:
        logger.error("stream_rag_agent error thread=%s: %s", thread_id, exc)
        yield _sse("error", {"thread_id": thread_id, "message": str(exc)})
