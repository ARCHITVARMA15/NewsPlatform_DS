"""
Agent router — /api/agent/*

Exposes the News Intelligence Agent over SSE streaming and session management.
"""
from __future__ import annotations

import logging
import os
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse, StreamingResponse

from app.agents.news_agent.graph import stream_news_agent
from app.database.models import AgentRequest, HumanLoopAction
from app.middleware.auth_middleware import get_current_user
from app.database.sqlite_checkpointer import get_checkpointer, get_thread_config
from app.database.supabase_client import (
    get_chat_sessions,
    upsert_chat_session,
)

logger = logging.getLogger("datastraw.router.agent")

router = APIRouter(prefix="/api/agent", tags=["Agent"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _stream_response(generator) -> StreamingResponse:
    return StreamingResponse(generator, media_type="text/event-stream")


# ---------------------------------------------------------------------------
# POST /chat — start a new agent run
# ---------------------------------------------------------------------------
@router.post("/chat", summary="Start a streaming News Intelligence Agent session")
async def chat(request: AgentRequest, current_user: dict = Depends(get_current_user)):
    """
    Streams SSE events for a full agent run.
    Generates a thread_id if not provided.

    SSE event types emitted:
      step        — progress through each pipeline node
      result      — insights + summary after insight_generator
      interrupted — graph paused awaiting user action
      pdf_ready   — PDF report generated
      error       — any runtime error
    """
    thread_id = request.thread_id or str(uuid4())

    async def generate():
        try:
            async for chunk in stream_news_agent(request.query, thread_id):
                yield chunk
        finally:
            # Upsert session record regardless of how the stream ends
            try:
                await upsert_chat_session(
                    thread_id,
                    {
                        "session_name": request.query[:80],
                        "agent_type": "news",
                        "last_query": request.query,
                        "message_count": 1,
                    },
                )
            except Exception as exc:
                logger.warning("Session upsert failed for %s: %s", thread_id, exc)

    return _stream_response(generate())


# ---------------------------------------------------------------------------
# POST /action — resume after HITL interrupt
# ---------------------------------------------------------------------------
@router.post("/action", summary="Resume an interrupted agent session with a user action")
async def action(body: HumanLoopAction, current_user: dict = Depends(get_current_user)):
    """
    Resumes the graph from the HITL interrupt point.
    Provide the thread_id from the interrupted session and the chosen action.

    Valid actions: generate_pdf | dive_deeper | bias_detect | track_story | end
    """
    async def generate():
        try:
            async for chunk in stream_news_agent(
                query="",  # not used on resume — state is loaded from checkpoint
                thread_id=body.thread_id,
                human_action=body.action,
            ):
                yield chunk
        finally:
            try:
                await upsert_chat_session(
                    body.thread_id,
                    {"last_query": f"[action: {body.action}]"},
                )
            except Exception as exc:
                logger.warning("Session upsert failed for %s: %s", body.thread_id, exc)

    return _stream_response(generate())


# ---------------------------------------------------------------------------
# GET /sessions — list all news agent sessions
# ---------------------------------------------------------------------------
@router.get("/sessions", summary="List all news agent sessions")
async def sessions():
    """Returns all chat sessions where agent_type='news', newest first."""
    return await get_chat_sessions("news")


# ---------------------------------------------------------------------------
# GET /sessions/{thread_id}/history — load message history from checkpoint
# ---------------------------------------------------------------------------
@router.get(
    "/sessions/{thread_id}/history",
    summary="Load full message history from the SQLite checkpoint",
)
async def session_history(thread_id: str):
    """
    Reads the saved LangGraph checkpoint for this thread and returns the
    messages list plus key state fields for display.
    """
    config = get_thread_config(thread_id)

    try:
        async with get_checkpointer() as checkpointer:
            from app.agents.news_agent.graph import create_news_agent_graph

            graph = await create_news_agent_graph(checkpointer)
            state = await graph.aget_state(config)

        if not state or not state.values:
            raise HTTPException(status_code=404, detail=f"No checkpoint found for thread '{thread_id}'")

        values = state.values
        return {
            "thread_id": thread_id,
            "messages": values.get("messages", []),
            "summary": values.get("summary", ""),
            "insights": values.get("insights", []),
            "sentiment": values.get("sentiment", ""),
            "current_step": values.get("current_step", ""),
            "is_interrupted": bool(state.next),
            "next_nodes": list(state.next) if state.next else [],
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("History load failed for %s: %s", thread_id, exc)
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# DELETE /sessions/{thread_id} — remove session from Supabase
# ---------------------------------------------------------------------------
@router.delete("/sessions/{thread_id}", summary="Delete a session from Supabase")
async def delete_session(thread_id: str):
    """
    Removes the chat session record from Supabase.
    The LangGraph checkpoint in SQLite is intentionally preserved
    so the conversation can still be inspected or resumed.
    """
    try:
        from app.database.supabase_client import supabase

        supabase.table("chat_sessions").delete().eq("thread_id", thread_id).execute()
        return {"deleted": True, "thread_id": thread_id}
    except Exception as exc:
        logger.error("Delete session failed for %s: %s", thread_id, exc)
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# GET /pdf/{thread_id} — download generated PDF
# ---------------------------------------------------------------------------
@router.get("/pdf/{thread_id}", summary="Download the generated PDF report")
async def get_pdf(thread_id: str):
    """Returns the PDF report generated for this thread, if available."""
    path = f"/tmp/report_{thread_id}.pdf"
    if not os.path.exists(path):
        raise HTTPException(
            status_code=404,
            detail=f"No PDF found for thread '{thread_id}'. Generate one first via the 'generate_pdf' action.",
        )
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=f"datastraw_report_{thread_id}.pdf",
    )
