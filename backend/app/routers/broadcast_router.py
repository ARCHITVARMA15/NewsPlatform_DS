"""
Broadcast Analyzer router — /api/broadcast/*

Endpoints:
  POST /analyze            — stream analysis of a YouTube URL
  POST /upload             — stream analysis of an uploaded video/audio file
  POST /action             — resume after HITL (ask_question | export_pdf | end)
  GET  /sessions           — list broadcast sessions
  GET  /sessions/{tid}/history — load session state
  DELETE /sessions/{tid}   — delete a session
  GET  /pdf/{tid}          — download generated PDF report
"""
from __future__ import annotations

import logging
import os
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from app.agents.broadcast_agent.graph import create_broadcast_graph, stream_broadcast_agent
from app.database.sqlite_checkpointer import get_checkpointer, get_thread_config
from app.database.supabase_client import get_chat_sessions, supabase, upsert_chat_session

logger = logging.getLogger("datastraw.router.broadcast")

router = APIRouter(prefix="/api/broadcast", tags=["Broadcast Analyzer"])

_MAX_FILE_BYTES = 100 * 1024 * 1024  # 100 MB
_ALLOWED_EXTENSIONS = {".mp4", ".mp3", ".wav", ".m4a", ".webm"}


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class BroadcastRequest(BaseModel):
    youtube_url: str | None = None
    thread_id:   str | None = None


class BroadcastActionRequest(BaseModel):
    thread_id: str
    action:    Literal["ask_question", "export_pdf", "end"]
    query:     str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _stream(generator) -> StreamingResponse:
    return StreamingResponse(generator, media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


async def _record_session(thread_id: str, last_query: str | None = None) -> None:
    try:
        await upsert_chat_session(thread_id, {
            "session_name": f"Broadcast {thread_id[:8]}",
            "agent_type":   "broadcast",
            "last_query":   last_query or "",
        })
    except Exception as exc:
        logger.warning("Failed to upsert broadcast session %s: %s", thread_id, exc)


# ---------------------------------------------------------------------------
# POST /analyze — YouTube URL
# ---------------------------------------------------------------------------
@router.post("/analyze", summary="Analyze a YouTube news broadcast via URL")
async def analyze_broadcast(req: BroadcastRequest):
    if not req.youtube_url:
        raise HTTPException(status_code=400, detail="youtube_url is required.")

    if "youtube.com" not in req.youtube_url and "youtu.be" not in req.youtube_url:
        raise HTTPException(status_code=400, detail="Invalid YouTube URL.")

    thread_id = req.thread_id or str(uuid4())
    await _record_session(thread_id, req.youtube_url)

    return StreamingResponse(
        stream_broadcast_agent(youtube_url=req.youtube_url, thread_id=thread_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Thread-ID": thread_id,
        },
    )


# ---------------------------------------------------------------------------
# POST /upload — video/audio file
# ---------------------------------------------------------------------------
@router.post("/upload", summary="Analyze an uploaded video or audio file")
async def upload_broadcast(
    file: UploadFile,
    thread_id: str | None = Form(None),
):
    filename = file.filename or "upload"
    ext = os.path.splitext(filename)[-1].lower()

    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Accepted: {', '.join(_ALLOWED_EXTENSIONS)}",
        )

    file_bytes = await file.read()
    if len(file_bytes) > _MAX_FILE_BYTES:
        size_mb = len(file_bytes) / 1_048_576
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({size_mb:.1f} MB). Maximum is 100 MB.",
        )

    actual_tid = thread_id or str(uuid4())
    saved_path = f"/tmp/broadcast_upload_{actual_tid}{ext}"

    with open(saved_path, "wb") as fh:
        fh.write(file_bytes)

    await _record_session(actual_tid, filename)

    return StreamingResponse(
        stream_broadcast_agent(
            youtube_url=None,
            thread_id=actual_tid,
            uploaded_file_path=saved_path,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Thread-ID": actual_tid,
        },
    )


# ---------------------------------------------------------------------------
# POST /action — HITL resume
# ---------------------------------------------------------------------------
@router.post("/action", summary="Resume broadcast session with a user action")
async def broadcast_action(req: BroadcastActionRequest):
    if req.action == "ask_question" and not req.query:
        raise HTTPException(status_code=400, detail="query is required when action=ask_question")

    await _record_session(req.thread_id, req.query)

    return StreamingResponse(
        stream_broadcast_agent(
            youtube_url=None,
            thread_id=req.thread_id,
            human_action=req.action,
            query=req.query,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# GET /sessions
# ---------------------------------------------------------------------------
@router.get("/sessions", summary="List all broadcast sessions")
async def list_sessions():
    return await get_chat_sessions("broadcast")


# ---------------------------------------------------------------------------
# GET /sessions/{thread_id}/history
# ---------------------------------------------------------------------------
@router.get("/sessions/{thread_id}/history", summary="Load broadcast session state")
async def session_history(thread_id: str):
    config = get_thread_config(thread_id)
    try:
        async with get_checkpointer() as checkpointer:
            graph = await create_broadcast_graph(checkpointer)
            state = await graph.aget_state(config)

        if not state or not state.values:
            raise HTTPException(404, f"No checkpoint for thread '{thread_id}'")

        v = state.values
        return {
            "thread_id":         thread_id,
            "messages":          v.get("messages", []),
            "video_title":       v.get("video_title"),
            "channel_name":      v.get("channel_name"),
            "video_duration":    v.get("video_duration"),
            "broadcast_summary": v.get("broadcast_summary"),
            "key_events":        v.get("key_events", []),
            "people_mentioned":  v.get("people_mentioned", []),
            "topics":            v.get("topics", []),
            "sentiment":         v.get("sentiment"),
            "processing_complete": v.get("processing_complete", False),
            "faiss_indexed":     v.get("faiss_indexed", False),
            "is_interrupted":    bool(state.next),
            "current_step":      v.get("current_step"),
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Broadcast history load failed for %s: %s", thread_id, exc)
        raise HTTPException(500, str(exc))


# ---------------------------------------------------------------------------
# DELETE /sessions/{thread_id}
# ---------------------------------------------------------------------------
@router.delete("/sessions/{thread_id}", summary="Delete a broadcast session")
async def delete_session(thread_id: str):
    try:
        supabase.table("chat_sessions").delete().eq("thread_id", thread_id).execute()
        return {"deleted": True, "thread_id": thread_id}
    except Exception as exc:
        logger.error("Delete broadcast session failed for %s: %s", thread_id, exc)
        raise HTTPException(500, str(exc))


# ---------------------------------------------------------------------------
# GET /pdf/{thread_id}
# ---------------------------------------------------------------------------
@router.get("/pdf/{thread_id}", summary="Download the broadcast PDF report")
async def download_pdf(thread_id: str):
    path = f"/tmp/broadcast_{thread_id}.pdf"
    if not os.path.exists(path):
        raise HTTPException(404, "PDF report not found. Generate it first via the export_pdf action.")
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=f"broadcast_report_{thread_id[:8]}.pdf",
    )
