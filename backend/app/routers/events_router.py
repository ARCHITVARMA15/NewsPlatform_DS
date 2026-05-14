"""
Events Router — /api/events/*

REST + SSE endpoints for the Real-time News Event Detection system.

Endpoints:
  GET  /latest   — Returns current in-memory detected events + last run time.
  GET  /stream   — Long-lived SSE stream; emits new events as they are detected.
  POST /trigger  — Manually fires the detection pipeline (testing / admin).
"""
from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.services.event_detector import (
    detect_events,
    get_detected_events,
    get_last_run_time,
    subscribe,
    unsubscribe,
)

logger = logging.getLogger("datastraw.router.events")

router = APIRouter(prefix="/api/events", tags=["Events"])


# ---------------------------------------------------------------------------
# GET /latest — poll current events
# ---------------------------------------------------------------------------
@router.get(
    "/latest",
    summary="Return all currently detected events and last run timestamp",
)
async def get_latest_events():
    """
    Returns the in-memory list of detected events (up to 20) and the
    ISO timestamp of the last detection run.
    """
    return {
        "events":   get_detected_events(),
        "last_run": get_last_run_time(),
        "count":    len(get_detected_events()),
    }


# ---------------------------------------------------------------------------
# GET /stream — SSE long-lived connection
# ---------------------------------------------------------------------------
@router.get(
    "/stream",
    summary="SSE stream — emits new events in real time as they are detected",
)
async def stream_events(request: Request):
    """
    Each new event detected by the background scheduler is pushed to all
    connected clients as an SSE `event: new_event` message.

    A heartbeat `event: ping` is sent every 25 seconds to keep the
    connection alive through proxies and load balancers.

    SSE event types:
      new_event  — a newly detected breaking event (JSON payload)
      ping       — heartbeat, no payload
    """
    async def event_generator():
        q = subscribe()
        try:
            # Flush current events immediately on connect
            for ev in get_detected_events():
                yield f"data: {json.dumps({'event': 'new_event', 'data': ev})}\n\n"

            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(q.get(), timeout=25.0)
                    yield f"data: {json.dumps({'event': 'new_event', 'data': event})}\n\n"
                except asyncio.TimeoutError:
                    yield "data: {\"event\": \"ping\"}\n\n"
        finally:
            unsubscribe(q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":     "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# POST /trigger — manual detection run
# ---------------------------------------------------------------------------
@router.post(
    "/trigger",
    summary="Manually trigger the event detection pipeline (admin / testing)",
)
async def trigger_detection():
    """
    Runs the full detection pipeline synchronously and returns the count of
    newly detected events. Safe to call multiple times.
    """
    logger.info("/api/events/trigger — manual detection run initiated")
    events_found = await detect_events()
    return {
        "message":      "Detection triggered",
        "events_found": events_found,
        "last_run":     get_last_run_time(),
    }
