"""
Broadcast Analyzer — LangGraph graph.

Flow:
  START
    → input_validator
    → [conditional route_after_validation]
        "end"          → END  (validation failed)
        "extract_audio"→ audio_extractor
    → audio_extractor → transcription → chunking → indexing → groq_analysis
    → [INTERRUPT] → human_interrupt
    → [conditional route_broadcast_action]
        "rag_answer"  → rag_answer → human_interrupt  (loop for multi-turn chat)
        "pdf_export"  → pdf_export → END
        "end"         → END
"""
from __future__ import annotations

import json
import logging
from typing import AsyncGenerator

from langchain_core.messages import HumanMessage
from langgraph.graph import END, START, StateGraph

from app.agents.broadcast_agent.nodes import (
    audio_extractor_node,
    chunking_node,
    groq_analysis_node,
    human_interrupt_node,
    indexing_node,
    input_validator_node,
    pdf_export_node,
    rag_answer_node,
    route_after_validation,
    route_broadcast_action,
    transcription_node,
)
from app.agents.broadcast_agent.state import BroadcastAgentState
from app.database.sqlite_checkpointer import get_checkpointer, get_thread_config

logger = logging.getLogger("datastraw.broadcast.graph")

# ---------------------------------------------------------------------------
# Step → human-readable labels + progress percentages
# ---------------------------------------------------------------------------
_STEP_META: dict[str, dict] = {
    "input_validator": {
        "description": "Validating input URL / file",
        "progress":    5,
    },
    "audio_extractor": {
        "description": "Downloading & extracting audio from video",
        "progress":    18,
    },
    "transcription": {
        "description": "Transcribing audio with Whisper AI (this may take 2-5 minutes…)",
        "progress":    45,
    },
    "chunking": {
        "description": "Splitting transcript into searchable segments",
        "progress":    60,
    },
    "indexing": {
        "description": "Building vector embeddings & indexing segments",
        "progress":    75,
    },
    "groq_analysis": {
        "description": "Analyzing broadcast content with Groq LLaMA",
        "progress":    90,
    },
    "human_interrupt": {
        "description": "Analysis complete — ready for questions",
        "progress":    100,
    },
    "rag_answer": {
        "description": "Searching transcript & generating answer",
        "progress":    100,
    },
    "pdf_export": {
        "description": "Generating PDF research report",
        "progress":    100,
    },
}

_OBSERVABLE_NODES = set(_STEP_META.keys())


# ---------------------------------------------------------------------------
# Graph builder (module-level, compiled per-call with live checkpointer)
# ---------------------------------------------------------------------------
_builder = StateGraph(BroadcastAgentState)

# Nodes
_builder.add_node("input_validator", input_validator_node)
_builder.add_node("audio_extractor", audio_extractor_node)
_builder.add_node("transcription",   transcription_node)
_builder.add_node("chunking",        chunking_node)
_builder.add_node("indexing",        indexing_node)
_builder.add_node("groq_analysis",   groq_analysis_node)
_builder.add_node("human_interrupt", human_interrupt_node)
_builder.add_node("rag_answer",      rag_answer_node)
_builder.add_node("pdf_export",      pdf_export_node)

# Edges
# START always goes to input_validator
_builder.add_edge(START, "input_validator")

# input_validator → conditional: valid input or abort
_builder.add_conditional_edges("input_validator", route_after_validation, {
    "extract_audio": "audio_extractor",
    "end":           END,
})
_builder.add_edge("audio_extractor", "transcription")
_builder.add_edge("transcription",   "chunking")
_builder.add_edge("chunking",        "indexing")
_builder.add_edge("indexing",        "groq_analysis")
_builder.add_edge("groq_analysis",   "human_interrupt")

# HITL routing
_builder.add_conditional_edges("human_interrupt", route_broadcast_action, {
    "rag_answer": "rag_answer",
    "pdf_export": "pdf_export",
    "end":        END,
})

# rag_answer loops back to interrupt for multi-turn chat
_builder.add_edge("rag_answer", "human_interrupt")

# pdf_export ends the session
_builder.add_edge("pdf_export", END)


# ---------------------------------------------------------------------------
# Graph factory
# ---------------------------------------------------------------------------
async def create_broadcast_graph(checkpointer):
    """Compile the broadcast graph with a live AsyncSqliteSaver checkpointer."""
    return _builder.compile(
        checkpointer=checkpointer,
        interrupt_before=["human_interrupt"],
    )


# ---------------------------------------------------------------------------
# SSE helper
# ---------------------------------------------------------------------------
def _sse(event: str, data: dict) -> str:
    return f"data: {json.dumps({'event': event, 'data': data})}\n\n"


# ---------------------------------------------------------------------------
# Main streaming generator
# ---------------------------------------------------------------------------
async def stream_broadcast_agent(
    youtube_url: str | None,
    thread_id: str,
    uploaded_file_path: str | None = None,
    human_action: str | None = None,
    query: str | None = None,
) -> AsyncGenerator[str, None]:
    """
    Async SSE generator for the Broadcast Analyzer Agent.

    First call  (no human_action): fresh pipeline from START.
    Resume call (human_action set): injects action + optional query and resumes.

    SSE events emitted:
      step             — node starts, with description + progress %
      analysis_complete — groq_analysis node ends; contains all analysis data
      interrupted      — graph paused at HITL; available_actions sent
      answer           — rag_answer node ends; answer + citations
      pdf_ready        — pdf_export node ends; pdf download available
      error            — any error in state or exception
      done             — stream finished
    """
    config = get_thread_config(thread_id)

    try:
        async with get_checkpointer() as checkpointer:
            graph = await create_broadcast_graph(checkpointer)

            # ── Determine input ──────────────────────────────────────────
            if human_action:
                update: dict = {"human_action": human_action, "error": None}
                if human_action == "ask_question" and query:
                    update["messages"] = [HumanMessage(content=query)]
                await graph.aupdate_state(config, update)
                input_data = None
                logger.info("broadcast resuming thread=%s action=%s", thread_id, human_action)
            else:
                input_data = {
                    "youtube_url":         youtube_url,
                    "uploaded_file_path":  uploaded_file_path,
                    "thread_id":           thread_id,
                    "messages":            [],
                    "transcript_chunks":   [],
                    "key_events":          [],
                    "people_mentioned":    [],
                    "topics":              [],
                    "retrieved_chunks":    [],
                    "citations":           [],
                    "processing_complete": False,
                    "faiss_indexed":       False,
                    "current_step":        None,
                    "error":               None,
                    "human_action":        None,
                    "audio_path":          None,
                    "transcript":          None,
                    "video_title":         None,
                    "video_duration":      None,
                    "channel_name":        None,
                    "broadcast_summary":   None,
                    "answer":              None,
                    "pdf_path":            None,
                    "sentiment":           None,
                    "sentiment_score":     None,
                }
                logger.info("broadcast fresh run thread=%s url=%s", thread_id, youtube_url)

            # ── Stream events ────────────────────────────────────────────
            async for event in graph.astream_events(input_data, config=config, version="v2"):
                ev_type: str = event.get("event", "")
                node_name: str = (
                    event.get("metadata", {}).get("langgraph_node", "")
                    or event.get("name", "")
                )

                # Node started — emit step event
                if ev_type == "on_chain_start" and node_name in _OBSERVABLE_NODES:
                    meta = _STEP_META.get(node_name, {})
                    yield _sse("step", {
                        "node":        node_name,
                        "description": meta.get("description", node_name),
                        "progress":    meta.get("progress", 0),
                        "thread_id":   thread_id,
                    })

                # groq_analysis finished — emit full analysis payload
                elif ev_type == "on_chain_end" and node_name == "groq_analysis":
                    out = event.get("data", {}).get("output", {})
                    yield _sse("analysis_complete", {
                        "thread_id":        thread_id,
                        "broadcast_summary": out.get("broadcast_summary", ""),
                        "key_events":       out.get("key_events", []),
                        "people_mentioned": out.get("people_mentioned", []),
                        "topics":           out.get("topics", []),
                        "sentiment":        out.get("sentiment", "neutral"),
                        "sentiment_score":  out.get("sentiment_score", 0.0),
                        "video_title":      None,    # will be from state
                        "channel_name":     None,
                        "video_duration":   None,
                    })

                # rag_answer finished — emit answer
                elif ev_type == "on_chain_end" and node_name == "rag_answer":
                    out = event.get("data", {}).get("output", {})
                    yield _sse("answer", {
                        "thread_id": thread_id,
                        "answer":    out.get("answer", ""),
                        "citations": out.get("citations", []),
                    })

                # pdf_export finished
                elif ev_type == "on_chain_end" and node_name == "pdf_export":
                    out = event.get("data", {}).get("output", {})
                    yield _sse("pdf_ready", {
                        "thread_id": thread_id,
                        "pdf_path":  out.get("pdf_path", ""),
                    })

                # Error in state
                elif ev_type == "on_chain_end":
                    out = event.get("data", {}).get("output", {})
                    if isinstance(out, dict) and out.get("error"):
                        yield _sse("error", {
                            "thread_id": thread_id,
                            "message":   out["error"],
                        })

            # ── After stream: check HITL interrupt ───────────────────────
            final_state = await graph.aget_state(config)
            if final_state and final_state.next:
                vals = final_state.values or {}

                # Enrich analysis_complete with video metadata from state
                if vals.get("processing_complete"):
                    yield _sse("analysis_complete", {
                        "thread_id":         thread_id,
                        "broadcast_summary": vals.get("broadcast_summary", ""),
                        "key_events":        vals.get("key_events", []),
                        "people_mentioned":  vals.get("people_mentioned", []),
                        "topics":            vals.get("topics", []),
                        "sentiment":         vals.get("sentiment", "neutral"),
                        "sentiment_score":   vals.get("sentiment_score", 0.0),
                        "video_title":       vals.get("video_title", ""),
                        "channel_name":      vals.get("channel_name", ""),
                        "video_duration":    vals.get("video_duration", 0),
                    })

                yield _sse("interrupted", {
                    "thread_id":         thread_id,
                    "awaiting_action":   True,
                    "available_actions": ["ask_question", "export_pdf", "end"],
                })

    except Exception as exc:
        logger.error("stream_broadcast_agent error thread=%s: %s", thread_id, exc)
        yield _sse("error", {"thread_id": thread_id, "message": str(exc)})

    finally:
        yield _sse("done", {"thread_id": thread_id})
