"""
Collaborative Research Rooms Router — /api/rooms/*

Multiple users share a room, fire News Intelligence Agent queries,
and see each other's results in real-time via SSE polling.

────────────────────────────────────────────────────────
Run this SQL once in the Supabase SQL Editor:

    CREATE TABLE IF NOT EXISTS rooms (
        id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        room_code   text        UNIQUE NOT NULL,
        created_by  text,
        created_at  timestamptz DEFAULT now(),
        expires_at  timestamptz DEFAULT now() + interval '24 hours',
        topic       text,
        is_active   boolean     DEFAULT true
    );

    CREATE TABLE IF NOT EXISTS room_messages (
        id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        room_code    text        REFERENCES rooms(room_code),
        user_id      text,
        user_name    text,
        message_type text,       -- 'query'|'agent_response'|'step_progress'
                                 -- |'annotation'|'upvote'|'system'|'error'
        content      text,
        metadata     jsonb,
        created_at   timestamptz DEFAULT now()
    );

    -- Enable Realtime on room_messages in the Supabase dashboard.
────────────────────────────────────────────────────────
"""
from __future__ import annotations

import asyncio
import json
import logging
import random
import string
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from app.database.supabase_client import supabase

logger = logging.getLogger("datastraw.router.rooms")

router = APIRouter(prefix="/api/rooms", tags=["Rooms"])

# ── Pydantic models ────────────────────────────────────────────────────────

class CreateRoomRequest(BaseModel):
    topic:     str = ""
    user_name: str = "Anonymous"


class JoinRoomRequest(BaseModel):
    room_code: str
    user_name: str = "Anonymous"


class RoomMessageRequest(BaseModel):
    room_code:    str
    user_id:      str
    user_name:    str
    content:      str
    message_type: str


class RoomQueryRequest(BaseModel):
    room_code: str
    user_id:   str
    user_name: str
    query:     str


class AnnotationRequest(BaseModel):
    room_code:       str
    user_id:         str
    user_name:       str
    message_id:      str
    annotation_text: str


class UpvoteRequest(BaseModel):
    room_code:  str
    user_id:    str
    message_id: str


# ── Helpers ────────────────────────────────────────────────────────────────

def generate_room_code() -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


def generate_user_id() -> str:
    return f"user_{str(uuid4())[:8]}"


def _insert_message_sync(row: dict) -> dict:
    """Synchronous Supabase insert — call via asyncio.to_thread."""
    result = supabase.table("room_messages").insert(row).execute()
    return result.data[0] if result.data else {}


async def broadcast_to_room(
    room_code: str,
    event_type: str,
    data: dict,
    user_id: str = "system",
    user_name: str = "System",
) -> None:
    """
    Inserts a structured message into room_messages.
    The polling SSE stream picks this up and delivers it to all connected clients.
    """
    row = {
        "room_code":    room_code,
        "user_id":      user_id,
        "user_name":    user_name,
        "message_type": event_type,
        "content":      json.dumps(data),
        "metadata":     data,
    }
    try:
        await asyncio.to_thread(_insert_message_sync, row)
    except Exception as exc:
        logger.warning("broadcast_to_room failed [%s]: %s", room_code, exc)


def _get_room_sync(room_code: str) -> dict | None:
    result = (
        supabase.table("rooms")
        .select("*")
        .eq("room_code", room_code)
        .eq("is_active", True)
        .maybe_single()
        .execute()
    )
    return result.data if result else None


def _get_history_sync(room_code: str, limit: int = 100) -> list[dict]:
    result = (
        supabase.table("room_messages")
        .select("*")
        .eq("room_code", room_code)
        .order("created_at", desc=False)
        .limit(limit)
        .execute()
    )
    return result.data or []


def _get_new_messages_sync(room_code: str, after_iso: str) -> list[dict]:
    result = (
        supabase.table("room_messages")
        .select("*")
        .eq("room_code", room_code)
        .gt("created_at", after_iso)
        .order("created_at", desc=False)
        .execute()
    )
    return result.data or []


def _parse_sse_chunk(chunk: str) -> dict | None:
    """Extract the JSON payload from a `data: {...}\\n\\n` SSE string."""
    for line in chunk.splitlines():
        if line.startswith("data: "):
            try:
                return json.loads(line[6:])
            except json.JSONDecodeError:
                pass
    return None


# ── POST /create ───────────────────────────────────────────────────────────

@router.post("/create", summary="Create a new collaborative research room")
async def create_room(request: CreateRoomRequest):
    """
    Generates a 6-character room code and creates a room that expires in 24 hours.
    Returns room_code, user_id, user_name, and expires_at.
    """
    room_code = generate_room_code()
    user_id   = generate_user_id()

    # Ensure uniqueness (retry on collision)
    for _ in range(5):
        existing = await asyncio.to_thread(_get_room_sync, room_code)
        if not existing:
            break
        room_code = generate_room_code()

    row = {
        "room_code":  room_code,
        "created_by": user_id,
        "topic":      request.topic,
    }
    try:
        result = await asyncio.to_thread(
            lambda: supabase.table("rooms").insert(row).execute()
        )
        room_data = result.data[0] if result.data else row
    except Exception as exc:
        logger.error("create_room insert failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Could not create room: {exc}")

    # Announce room creation
    await broadcast_to_room(
        room_code, "system",
        {"message": f"Room '{room_code}' created by {request.user_name}",
         "topic": request.topic},
    )

    return {
        "room_code":  room_code,
        "user_id":    user_id,
        "user_name":  request.user_name,
        "topic":      request.topic,
        "expires_at": room_data.get("expires_at"),
        "created_at": room_data.get("created_at"),
    }


# ── POST /join ─────────────────────────────────────────────────────────────

@router.post("/join", summary="Join an existing room and fetch its message history")
async def join_room(request: JoinRoomRequest):
    """
    Validates the room code, assigns a user_id, and returns the full message history.
    """
    room = await asyncio.to_thread(_get_room_sync, request.room_code)
    if not room:
        raise HTTPException(status_code=404, detail=f"Room '{request.room_code}' not found or has expired")

    user_id = generate_user_id()
    history = await asyncio.to_thread(_get_history_sync, request.room_code)

    # Announce join
    await broadcast_to_room(
        request.room_code, "system",
        {"message": f"{request.user_name} joined the room"},
        user_id=user_id,
        user_name=request.user_name,
    )

    return {
        "room_code": request.room_code,
        "user_id":   user_id,
        "user_name": request.user_name,
        "topic":     room.get("topic", ""),
        "history":   history,
        "expires_at":room.get("expires_at"),
    }


# ── GET /{room_code}/stream ────────────────────────────────────────────────

@router.get("/{room_code}/stream", summary="SSE stream of real-time room messages")
async def stream_room(room_code: str, request: Request):
    """
    Long-lived SSE connection.  Polls room_messages every 500 ms for new rows,
    yielding them as `data:` events.  Sends a comment-ping every 15 s.
    Closes automatically after 2 hours.
    """
    room = await asyncio.to_thread(_get_room_sync, room_code)
    if not room:
        raise HTTPException(status_code=404, detail=f"Room '{room_code}' not found")

    async def event_generator():
        last_seen: str = datetime.now(timezone.utc).isoformat()
        ping_counter   = 0
        max_polls      = 2 * 60 * 60 * 2   # 2 polls/s × 7200 s = 14400 polls (2 h)
        polls          = 0

        while polls < max_polls:
            if await request.is_disconnected():
                break

            polls += 1
            ping_counter += 1

            # Fetch new messages
            new_msgs = await asyncio.to_thread(
                _get_new_messages_sync, room_code, last_seen
            )
            for msg in new_msgs:
                payload = {
                    "id":           msg.get("id"),
                    "room_code":    msg.get("room_code"),
                    "user_id":      msg.get("user_id"),
                    "user_name":    msg.get("user_name"),
                    "message_type": msg.get("message_type"),
                    "content":      msg.get("content"),
                    "metadata":     msg.get("metadata"),
                    "created_at":   msg.get("created_at"),
                }
                yield f"data: {json.dumps(payload)}\n\n"
                last_seen = msg.get("created_at", last_seen)

            # Heartbeat ping every 15 s (30 × 500 ms)
            if ping_counter >= 30:
                yield ": ping\n\n"
                ping_counter = 0

            await asyncio.sleep(0.5)

        yield f"data: {json.dumps({'message_type': 'stream_closed', 'content': 'Session ended'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── POST /{room_code}/query ────────────────────────────────────────────────

@router.post("/{room_code}/query", summary="Run News Agent query — streams to requester and broadcasts to room")
async def room_query(room_code: str, request: RoomQueryRequest):
    """
    Runs the News Intelligence Agent for the given query.
    Every agent SSE event is:
      1. Yielded to the requester as a streaming response.
      2. Broadcast into room_messages so all members' /stream connections see it.
    The final result is persisted as an 'agent_response' message.
    """
    from app.agents.news_agent.graph import stream_news_agent

    room = await asyncio.to_thread(_get_room_sync, room_code)
    if not room:
        raise HTTPException(status_code=404, detail=f"Room '{room_code}' not found")

    thread_id = str(uuid4())

    # Broadcast the user's query so all room members see it
    await broadcast_to_room(
        room_code, "query",
        {"query": request.query, "user_name": request.user_name, "thread_id": thread_id},
        user_id=request.user_id,
        user_name=request.user_name,
    )

    async def generate():
        accumulated_result: dict = {}

        try:
            async for chunk in stream_news_agent(request.query, thread_id):
                # Yield raw SSE chunk to the requester
                yield chunk

                # Parse and selectively broadcast to room
                parsed = _parse_sse_chunk(chunk)
                if not parsed:
                    continue

                ev   = parsed.get("event", "")
                data = parsed.get("data", {})

                if ev == "step":
                    await broadcast_to_room(
                        room_code, "step_progress",
                        {"step": data.get("step"), "query": request.query,
                         "user_name": request.user_name},
                        user_id=request.user_id,
                        user_name=request.user_name,
                    )

                elif ev == "result":
                    accumulated_result = data

                elif ev in ("error", "interrupted"):
                    await broadcast_to_room(
                        room_code, ev,
                        {**data, "user_name": request.user_name},
                        user_id=request.user_id,
                        user_name=request.user_name,
                    )

        finally:
            # Persist the final agent result to room history once streaming ends
            if accumulated_result:
                await broadcast_to_room(
                    room_code, "agent_response",
                    {**accumulated_result,
                     "original_query": request.query,
                     "user_name": request.user_name,
                     "thread_id": thread_id},
                    user_id=request.user_id,
                    user_name=request.user_name,
                )

    return StreamingResponse(generate(), media_type="text/event-stream")


# ── POST /{room_code}/annotate ─────────────────────────────────────────────

@router.post("/{room_code}/annotate", summary="Add an annotation to a message in the room")
async def annotate_message(room_code: str, request: AnnotationRequest):
    """Saves an annotation and broadcasts it to all room members."""
    data = {
        "annotation":  request.annotation_text,
        "message_id":  request.message_id,
        "user_name":   request.user_name,
        "annotated_at": datetime.now(timezone.utc).isoformat(),
    }
    row = {
        "room_code":    room_code,
        "user_id":      request.user_id,
        "user_name":    request.user_name,
        "message_type": "annotation",
        "content":      request.annotation_text,
        "metadata":     data,
    }
    try:
        await asyncio.to_thread(_insert_message_sync, row)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return {"status": "ok", "room_code": room_code, **data}


# ── POST /{room_code}/upvote ───────────────────────────────────────────────

@router.post("/{room_code}/upvote", summary="Upvote a message in the room")
async def upvote_message(room_code: str, request: UpvoteRequest):
    """Records an upvote and broadcasts it to all room members."""
    data = {
        "message_id": request.message_id,
        "user_id":    request.user_id,
        "upvoted_at": datetime.now(timezone.utc).isoformat(),
    }
    row = {
        "room_code":    room_code,
        "user_id":      request.user_id,
        "user_name":    "User",
        "message_type": "upvote",
        "content":      f"upvote:{request.message_id}",
        "metadata":     data,
    }
    try:
        await asyncio.to_thread(_insert_message_sync, row)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return {"status": "ok", "room_code": room_code, **data}


# ── GET /{room_code}/export-pdf ────────────────────────────────────────────

@router.get("/{room_code}/export-pdf", summary="Export room Q&A session as a PDF report")
async def export_pdf(room_code: str):
    """
    Fetches all room_messages, formats them as a research report,
    and returns a downloadable PDF using ReportGenerator.
    """
    from app.utils.pdf_generator import report_generator

    room    = await asyncio.to_thread(_get_room_sync, room_code)
    if not room:
        raise HTTPException(status_code=404, detail=f"Room '{room_code}' not found")

    history = await asyncio.to_thread(_get_history_sync, room_code, limit=500)

    # Build Q&A pairs for the report
    queries:   list[str] = []
    responses: list[str] = []
    insights:  list[str] = []
    summary    = ""

    for msg in history:
        mtype = msg.get("message_type", "")
        meta  = msg.get("metadata") or {}

        if mtype == "query":
            q = meta.get("query") or msg.get("content", "")
            if q:
                queries.append(q)

        elif mtype == "agent_response":
            if not summary and meta.get("summary"):
                summary = meta["summary"]
            for ins in meta.get("insights", []):
                if ins not in insights:
                    insights.append(ins)
            r = meta.get("summary") or msg.get("content", "")
            if r:
                responses.append(r)

    topic = room.get("topic") or "Collaborative Research Session"
    title = f"Room {room_code} — {topic}"

    report_data = {
        "title":       title,
        "query":       " | ".join(queries[:5]) if queries else topic,
        "summary":     summary or (responses[0] if responses else "No agent responses yet."),
        "insights":    insights[:10],
        "sources":     [],
        "sentiment":   "neutral",
        "sentiment_score": 0.0,
        "confidence_scores": {},
        "generated_at": datetime.now(timezone.utc).strftime("%B %d, %Y at %H:%M UTC"),
    }

    output_path = f"/tmp/room_{room_code}_report.pdf"

    try:
        path = await asyncio.to_thread(
            report_generator.generate_news_report, report_data, output_path
        )
    except Exception as exc:
        logger.error("Room PDF export failed for %s: %s", room_code, exc)
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {exc}")

    return FileResponse(
        path=path,
        media_type="application/pdf",
        filename=f"datastraw_room_{room_code}.pdf",
    )


# ── POST /{room_code}/export-notion ────────────────────────────────────────

@router.post("/{room_code}/export-notion", summary="Export room session to a Notion page")
async def export_to_notion(room_code: str):
    """
    Creates a structured Notion page in the configured database containing:
    - Room metadata (code, topic, date, participants)
    - Every Q&A pair (query + agent response + insights)
    - All annotations
    Returns the Notion page URL on success.
    """
    from app.config import settings
    import httpx

    if not settings.notion_token or not settings.notion_database_id:
        raise HTTPException(
            status_code=503,
            detail="Notion integration not configured. Add NOTION_TOKEN and NOTION_DATABASE_ID to .env",
        )

    room = await asyncio.to_thread(_get_room_sync, room_code)
    if not room:
        raise HTTPException(status_code=404, detail=f"Room '{room_code}' not found")

    history = await asyncio.to_thread(_get_history_sync, room_code, limit=500)

    topic        = room.get("topic") or "Research Session"
    created_at   = room.get("created_at", datetime.now(timezone.utc).isoformat())
    date_str     = created_at[:10] if created_at else datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # ── Collect participants ──────────────────────────────────────────────
    participants: dict[str, str] = {}  # user_id → user_name
    for msg in history:
        uid = msg.get("user_id", "")
        if uid and uid != "system":
            participants[uid] = msg.get("user_name", "Unknown")

    # ── Build page content blocks ──────────────────────────────────────────
    def rich(text: str) -> list:
        return [{"type": "text", "text": {"content": text[:2000]}}]

    def heading2(text: str) -> dict:
        return {"object": "block", "type": "heading_2",
                "heading_2": {"rich_text": rich(text)}}

    def divider() -> dict:
        return {"object": "block", "type": "divider", "divider": {}}

    def paragraph(text: str) -> dict:
        return {"object": "block", "type": "paragraph",
                "paragraph": {"rich_text": rich(text)}}

    def quote(text: str) -> dict:
        return {"object": "block", "type": "quote",
                "quote": {"rich_text": rich(text)}}

    def bullet(text: str) -> dict:
        return {"object": "block", "type": "bulleted_list_item",
                "bulleted_list_item": {"rich_text": rich(text)}}

    def callout(text: str, emoji: str = "💡", color: str = "blue_background") -> dict:
        return {
            "object": "block", "type": "callout",
            "callout": {
                "rich_text": rich(text),
                "icon": {"type": "emoji", "emoji": emoji},
                "color": color,
            },
        }

    blocks: list[dict] = []

    # Metadata callout
    participants_str = ", ".join(participants.values()) if participants else "No participants"
    blocks.append(callout(
        f"Room: {room_code}  |  Date: {date_str}  |  Participants: {participants_str}",
        emoji="🔬", color="gray_background",
    ))
    blocks.append(divider())

    # Q&A pairs
    current_query: str | None = None
    qa_count = 0

    for msg in history:
        mtype = msg.get("message_type", "")
        meta  = msg.get("metadata") or {}
        user  = msg.get("user_name", "User")

        if mtype == "query":
            qa_count += 1
            current_query = meta.get("query") or msg.get("content", "")
            blocks.append(heading2(f"Q{qa_count}: {current_query[:80]}"))
            blocks.append(quote(f"Asked by {user}: {current_query}"))

        elif mtype == "agent_response":
            summary  = meta.get("summary") or msg.get("content", "")
            insights = meta.get("insights") or []
            if summary:
                blocks.append(paragraph(summary))
            if insights:
                for ins in insights[:8]:
                    blocks.append(bullet(str(ins)))
            blocks.append(divider())

        elif mtype == "annotation":
            annotation_text = meta.get("annotation") or msg.get("content", "")
            blocks.append(callout(
                f"{user}: {annotation_text}",
                emoji="📌", color="yellow_background",
            ))

    if not qa_count:
        blocks.append(paragraph("No queries were made in this session."))

    # ── Create Notion page ────────────────────────────────────────────────
    page_title = f"Room {room_code} — {topic} ({date_str})"
    payload = {
        "parent": {"database_id": settings.notion_database_id},
        "properties": {
            "Name": {"title": [{"type": "text", "text": {"content": page_title}}]},
        },
        "children": blocks[:100],  # Notion API max 100 blocks per request
    }

    headers = {
        "Authorization": f"Bearer {settings.notion_token}",
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.post(
                "https://api.notion.com/v1/pages",
                headers=headers,
                json=payload,
            )
        if res.status_code not in (200, 201):
            body = res.json()
            msg_detail = body.get("message", res.text[:200])
            raise HTTPException(status_code=502, detail=f"Notion API error: {msg_detail}")

        page = res.json()
        page_url = page.get("url", "https://notion.so")
        page_id  = page.get("id", "")
        logger.info("Notion export success for room %s — page %s", room_code, page_id)
        return {"status": "ok", "page_url": page_url, "page_id": page_id}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Notion export failed for room %s: %s", room_code, exc)
        raise HTTPException(status_code=500, detail=f"Export failed: {exc}")


# ── DELETE /{room_code} ────────────────────────────────────────────────────

@router.delete("/{room_code}", summary="Close a room (soft delete)")
async def close_room(room_code: str):
    """Sets is_active=false on the room. History is preserved."""
    try:
        await asyncio.to_thread(
            lambda: supabase.table("rooms")
                .update({"is_active": False})
                .eq("room_code", room_code)
                .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    await broadcast_to_room(
        room_code, "system",
        {"message": "Room has been closed by the host."},
    )
    return {"status": "closed", "room_code": room_code}
