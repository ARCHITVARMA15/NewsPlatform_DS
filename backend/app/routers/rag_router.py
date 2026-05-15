"""
RAG Agent router — /api/rag/*

Handles PDF upload, RAG chat streaming, session management,
and PDF report download.
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone
from uuid import uuid4

import re

import httpx
from fastapi import APIRouter, HTTPException, Query, UploadFile
from pydantic import BaseModel
from fastapi.responses import FileResponse, StreamingResponse

from app.agents.rag_agent.graph import create_rag_graph, stream_rag_agent
from app.agents.rag_agent.tools import chunk_pdf, embed_and_store_chunks
from app.database.models import HumanLoopAction, RAGRequest
from app.database.sqlite_checkpointer import get_checkpointer, get_thread_config
from app.database.supabase_client import (
    get_chat_sessions,
    supabase,
    upsert_chat_session,
)

logger = logging.getLogger("datastraw.router.rag")

router = APIRouter(prefix="/api/rag", tags=["RAG Agent"])

_MAX_PDF_BYTES = 20 * 1024 * 1024  # 20 MB


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _stream_response(generator) -> StreamingResponse:
    return StreamingResponse(generator, media_type="text/event-stream")


# ---------------------------------------------------------------------------
# POST /upload-pdf — ingest a PDF into FAISS
# ---------------------------------------------------------------------------
@router.post("/upload-pdf", summary="Upload and embed a PDF document for RAG")
async def upload_pdf(
    file: UploadFile,
    thread_id: str | None = Query(None, description="Reuse an existing thread or omit to create new"),
):
    """
    Accepts a PDF file (max 20 MB), chunks it, embeds it into an in-memory
    FAISS index, and stores metadata in the Supabase pdf_documents table.
    Returns the thread_id to use in subsequent /chat requests.
    """
    # ── Validate file type ───────────────────────────────────────────────
    is_pdf = (
        (file.content_type or "").lower() == "application/pdf"
        or (file.filename or "").lower().endswith(".pdf")
    )
    if not is_pdf:
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    # ── Read and size-check ──────────────────────────────────────────────
    file_bytes = await file.read()
    if len(file_bytes) > _MAX_PDF_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"PDF exceeds maximum size of 20 MB (got {len(file_bytes) / 1_048_576:.1f} MB).",
        )

    actual_thread_id = thread_id or str(uuid4())
    filename = file.filename or "document.pdf"

    # ── Write to /tmp for potential re-ingestion on server restart ───────
    tmp_path = f"/tmp/pdf_upload_{actual_thread_id}.pdf"
    with open(tmp_path, "wb") as fh:
        fh.write(file_bytes)

    # ── Chunk + embed ────────────────────────────────────────────────────
    try:
        chunks: list[dict] = await asyncio.to_thread(
            chunk_pdf.invoke, {"file_bytes": file_bytes, "filename": filename}
        )
        await asyncio.to_thread(
            embed_and_store_chunks.invoke,
            {"chunks": chunks, "thread_id": actual_thread_id},
        )
    except Exception as exc:
        logger.error("PDF processing failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"PDF processing failed: {exc}")

    page_count = max((c.get("page_num", 0) for c in chunks), default=0)
    chunk_count = len(chunks)

    # ── Persist metadata to Supabase pdf_documents ──────────────────────
    try:
        supabase.table("pdf_documents").insert(
            {
                "thread_id": actual_thread_id,
                "filename": filename,
                "file_size": len(file_bytes),
                "chunk_count": chunk_count,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        ).execute()
    except Exception as exc:
        logger.warning("Supabase pdf_documents insert failed: %s", exc)

    logger.info(
        "PDF uploaded: thread=%s file='%s' chunks=%d pages=%d",
        actual_thread_id, filename, chunk_count, page_count,
    )
    return {
        "thread_id": actual_thread_id,
        "filename": filename,
        "chunk_count": chunk_count,
        "page_count": page_count,
        "file_size_kb": round(len(file_bytes) / 1024, 1),
    }


# ---------------------------------------------------------------------------
# POST /upload-drive — ingest a PDF from a public Google Drive link
# ---------------------------------------------------------------------------
class DriveUploadRequest(BaseModel):
    drive_url: str
    thread_id: str | None = None


def _extract_drive_file_id(url: str) -> str | None:
    """
    Extracts the file ID from common Google Drive URL formats:
      - https://drive.google.com/file/d/FILE_ID/view
      - https://drive.google.com/open?id=FILE_ID
      - https://drive.google.com/uc?id=FILE_ID
    """
    match = re.search(r"/file/d/([a-zA-Z0-9_-]+)", url)
    if match:
        return match.group(1)
    match = re.search(r"[?&]id=([a-zA-Z0-9_-]+)", url)
    if match:
        return match.group(1)
    return None


@router.post("/upload-drive", summary="Import a PDF from a public Google Drive link")
async def upload_from_drive(body: DriveUploadRequest):
    """
    Accepts a public Google Drive share link, downloads the PDF,
    and processes it identically to /upload-pdf.
    The file must be shared as 'Anyone with the link can view'.
    """
    file_id = _extract_drive_file_id(body.drive_url)
    if not file_id:
        raise HTTPException(
            status_code=400,
            detail="Could not extract a file ID from the provided Drive URL. "
                   "Make sure it's a valid drive.google.com share link.",
        )

    download_url = (
        f"https://drive.usercontent.google.com/download"
        f"?id={file_id}&export=download&authuser=0&confirm=t"
    )

    try:
        async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
            res = await client.get(download_url)
            if res.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail=f"Google Drive returned {res.status_code}. "
                           "Ensure the file is shared as 'Anyone with the link'.",
                )
            file_bytes = res.content
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to download from Drive: {exc}")

    if len(file_bytes) > _MAX_PDF_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"PDF exceeds 20 MB ({len(file_bytes) / 1_048_576:.1f} MB).",
        )

    # Verify it's actually a PDF
    if not file_bytes.startswith(b"%PDF"):
        raise HTTPException(
            status_code=400,
            detail="The downloaded file does not appear to be a PDF. "
                   "Make sure the Drive file is a PDF and is publicly shared.",
        )

    actual_thread_id = body.thread_id or str(uuid4())
    filename = f"drive_{file_id[:8]}.pdf"

    tmp_path = f"/tmp/pdf_upload_{actual_thread_id}.pdf"
    with open(tmp_path, "wb") as fh:
        fh.write(file_bytes)

    try:
        chunks: list[dict] = await asyncio.to_thread(
            chunk_pdf.invoke, {"file_bytes": file_bytes, "filename": filename}
        )
        await asyncio.to_thread(
            embed_and_store_chunks.invoke,
            {"chunks": chunks, "thread_id": actual_thread_id},
        )
    except Exception as exc:
        logger.error("Drive PDF processing failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"PDF processing failed: {exc}")

    page_count  = max((c.get("page_num", 0) for c in chunks), default=0)
    chunk_count = len(chunks)

    try:
        supabase.table("pdf_documents").insert({
            "thread_id":  actual_thread_id,
            "filename":   filename,
            "file_size":  len(file_bytes),
            "chunk_count": chunk_count,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as exc:
        logger.warning("Supabase pdf_documents insert failed: %s", exc)

    logger.info(
        "Drive PDF ingested: thread=%s file_id=%s chunks=%d pages=%d",
        actual_thread_id, file_id, chunk_count, page_count,
    )
    return {
        "thread_id":    actual_thread_id,
        "filename":     filename,
        "chunk_count":  chunk_count,
        "page_count":   page_count,
        "file_size_kb": round(len(file_bytes) / 1024, 1),
        "file_id":      file_id,
    }


# ---------------------------------------------------------------------------
# POST /chat — start a RAG session
# ---------------------------------------------------------------------------
@router.post("/chat", summary="Start a streaming RAG chat session")
async def chat(request: RAGRequest):
    """
    Streams SSE events for a RAG Agent session.

    SSE event types:
      step          — progress through pipeline nodes
      pdf_ingested  — PDF chunked and embedded
      answer        — grounded answer with citations
      interrupted   — awaiting user action
      pdf_ready     — research report generated
      error         — runtime error
    """
    thread_id = request.thread_id or str(uuid4())

    async def generate():
        try:
            async for chunk in stream_rag_agent(
                query=request.query,
                thread_id=thread_id,
                has_pdf=request.has_pdf,
            ):
                yield chunk
        finally:
            try:
                await upsert_chat_session(
                    thread_id,
                    {
                        "session_name": request.query[:80],
                        "agent_type": "rag",
                        "last_query": request.query,
                        "message_count": 1,
                    },
                )
            except Exception as exc:
                logger.warning("RAG session upsert failed for %s: %s", thread_id, exc)

    return _stream_response(generate())


# ---------------------------------------------------------------------------
# POST /action — resume after HITL interrupt
# ---------------------------------------------------------------------------
@router.post("/action", summary="Resume an interrupted RAG session")
async def action(body: HumanLoopAction):
    """
    Resumes the RAG graph from its interrupt point.
    For 'continue' action, pass the new question in context: {"query": "..."}.
    """
    async def generate():
        try:
            async for chunk in stream_rag_agent(
                query="",
                thread_id=body.thread_id,
                human_action=body.action,
                context=body.context,
            ):
                yield chunk
        finally:
            try:
                await upsert_chat_session(
                    body.thread_id,
                    {"last_query": f"[action: {body.action}]"},
                )
            except Exception as exc:
                logger.warning("RAG session upsert failed: %s", exc)

    return _stream_response(generate())


# ---------------------------------------------------------------------------
# GET /sessions — list RAG sessions
# ---------------------------------------------------------------------------
@router.get("/sessions", summary="List all RAG sessions")
async def sessions():
    """Returns all chat sessions where agent_type='rag', newest first."""
    return await get_chat_sessions("rag")


# ---------------------------------------------------------------------------
# GET /sessions/{thread_id}/history
# ---------------------------------------------------------------------------
@router.get("/sessions/{thread_id}/history", summary="Load RAG session history")
async def session_history(thread_id: str):
    """Returns saved messages and state from the SQLite checkpoint."""
    config = get_thread_config(thread_id)
    try:
        async with get_checkpointer() as checkpointer:
            graph = await create_rag_graph(checkpointer)
            state = await graph.aget_state(config)

        if not state or not state.values:
            raise HTTPException(404, f"No checkpoint found for thread '{thread_id}'")

        v = state.values
        return {
            "thread_id": thread_id,
            "messages": v.get("messages", []),
            "query": v.get("query", ""),
            "answer": v.get("answer", ""),
            "citations": v.get("citations", []),
            "clarify_mode": v.get("clarify_mode", ""),
            "current_step": v.get("current_step", ""),
            "is_interrupted": bool(state.next),
            "next_nodes": list(state.next) if state.next else [],
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("RAG history load failed for %s: %s", thread_id, exc)
        raise HTTPException(500, str(exc))


# ---------------------------------------------------------------------------
# DELETE /sessions/{thread_id}
# ---------------------------------------------------------------------------
@router.delete("/sessions/{thread_id}", summary="Delete a RAG session from Supabase")
async def delete_session(thread_id: str):
    """Removes the session from Supabase. SQLite checkpoint is preserved."""
    try:
        supabase.table("chat_sessions").delete().eq("thread_id", thread_id).execute()
        return {"deleted": True, "thread_id": thread_id}
    except Exception as exc:
        logger.error("Delete RAG session failed for %s: %s", thread_id, exc)
        raise HTTPException(500, str(exc))


# ---------------------------------------------------------------------------
# GET /pdf/{thread_id} — download generated RAG report
# ---------------------------------------------------------------------------
@router.get("/pdf/{thread_id}", summary="Download the generated RAG report PDF")
async def get_pdf(thread_id: str):
    """Returns the PDF research report for this thread, if generated."""
    path = f"/tmp/rag_report_{thread_id}.pdf"
    if not os.path.exists(path):
        raise HTTPException(
            404,
            f"No RAG report found for thread '{thread_id}'. "
            "Use the 'generate_report' action first.",
        )
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=f"datastraw_rag_report_{thread_id}.pdf",
    )
