"""
SSE streaming helper utilities for the Datastraw News Intelligence Platform.

Centralises SSE event formatting used across both agent graph files.
All functions are pure (no state, no side effects).
"""
from __future__ import annotations

import json
from typing import Any


# ---------------------------------------------------------------------------
# Core formatter
# ---------------------------------------------------------------------------
def format_sse_event(event_type: str, data: dict[str, Any]) -> str:
    """
    Format a dict as a Server-Sent Event data line.

    Returns:
        SSE string in the form: "data: {json}\\n\\n"
    """
    payload = json.dumps({"event": event_type, "data": data})
    return f"data: {payload}\n\n"


# ---------------------------------------------------------------------------
# Typed event constructors
# ---------------------------------------------------------------------------
def create_step_event(
    step_name: str,
    thread_id: str,
    details: dict[str, Any] | None = None,
) -> str:
    """
    SSE event announcing that a pipeline node has started.

    Args:
        step_name:  Name of the LangGraph node (e.g. "query_planner").
        thread_id:  Active session thread ID.
        details:    Optional extra context to include (e.g. sub-query count).
    """
    data: dict[str, Any] = {"step": step_name, "thread_id": thread_id}
    if details:
        data.update(details)
    return format_sse_event("step", data)


def create_result_event(result: dict[str, Any], thread_id: str) -> str:
    """
    SSE event carrying a completed agent result (insights, answer, etc.).

    Args:
        result:    Dict of result fields to send to the client.
        thread_id: Active session thread ID.
    """
    return format_sse_event("result", {"thread_id": thread_id, **result})


def create_error_event(message: str, thread_id: str) -> str:
    """
    SSE event signalling a runtime error.

    Args:
        message:   Human-readable error description.
        thread_id: Active session thread ID.
    """
    return format_sse_event("error", {"message": message, "thread_id": thread_id})


def create_interrupt_event(thread_id: str, available_actions: list[str]) -> str:
    """
    SSE event indicating the graph has paused at a HITL interrupt point.

    Args:
        thread_id:         Active session thread ID.
        available_actions: List of valid action strings the client may send.
    """
    return format_sse_event(
        "interrupted",
        {
            "thread_id": thread_id,
            "awaiting_action": True,
            "available_actions": available_actions,
        },
    )
