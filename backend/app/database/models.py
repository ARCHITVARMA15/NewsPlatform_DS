"""
Pydantic v2 request / response models shared across the application.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Article
# ---------------------------------------------------------------------------
class ArticleModel(BaseModel):
    id: str | None = None
    article_id: str
    title: str | None = None
    description: str | None = None
    content: str | None = None
    source_name: str | None = None
    source_url: str | None = None
    published_at: str | None = None
    category: str | None = None
    country: str | None = None
    language: str | None = None
    sentiment: str | None = None
    sentiment_score: float | None = None
    summary: str | None = None
    insights: list[str] | None = None
    keywords: list[str] | None = None
    created_at: str | None = None


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------
class ChatMessage(BaseModel):
    role: str
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    metadata: dict | None = None


# ---------------------------------------------------------------------------
# Agent requests
# ---------------------------------------------------------------------------
class AgentRequest(BaseModel):
    query: str
    thread_id: str | None = None
    mode: str = "normal"


class RAGRequest(BaseModel):
    query: str
    thread_id: str | None = None
    has_pdf: bool = False


# ---------------------------------------------------------------------------
# Human-in-the-loop
# ---------------------------------------------------------------------------
class HumanLoopAction(BaseModel):
    thread_id: str
    action: Literal[
        "generate_pdf",
        "dive_deeper",
        "bias_detect",
        "track_story",
        "clarify_pdf",
        "clarify_web",
        "generate_report",
        "continue",
        "end",
    ]
    context: dict | None = None


# ---------------------------------------------------------------------------
# Streaming
# ---------------------------------------------------------------------------
class StreamEvent(BaseModel):
    event_type: str
    data: dict | Any
    thread_id: str


# ---------------------------------------------------------------------------
# PDF generation
# ---------------------------------------------------------------------------
class PDFGenerationRequest(BaseModel):
    thread_id: str
    title: str
    include_sources: bool = True
