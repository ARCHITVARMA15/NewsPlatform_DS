"""
Notion integration router — /api/notion/*

Endpoints:
  GET  /api/notion/status           — whether Notion is configured
  POST /api/notion/save-article     — save a news article to Notion DB
  POST /api/notion/save-briefing    — save a briefing script + audio to Notion DB
"""
from __future__ import annotations

import logging
from pydantic import BaseModel

from fastapi import APIRouter

from app.config import settings
from app.services.notion_service import save_article_to_notion, save_briefing_to_notion

logger = logging.getLogger("datastraw.router.notion")

router = APIRouter(prefix="/api/notion", tags=["Notion"])


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------
class SaveArticleRequest(BaseModel):
    title:       str
    source_name: str  = ""
    summary:     str  = ""
    url:         str  = ""
    sentiment:   str  = "neutral"
    category:    str  = "General"


class SaveBriefingRequest(BaseModel):
    script:    str
    audio_url: str = ""


# ---------------------------------------------------------------------------
# GET /status
# ---------------------------------------------------------------------------
@router.get("/status", summary="Check whether Notion integration is configured")
async def notion_status():
    configured = bool(settings.notion_token and settings.notion_database_id)
    return {"configured": configured}


# ---------------------------------------------------------------------------
# POST /save-article
# ---------------------------------------------------------------------------
@router.post("/save-article", summary="Save a news article to Notion database")
async def save_article(req: SaveArticleRequest):
    page_url = await save_article_to_notion({
        "title":       req.title,
        "source_name": req.source_name,
        "summary":     req.summary,
        "url":         req.url,
        "sentiment":   req.sentiment,
        "category":    req.category,
    })
    if page_url is None and not bool(settings.notion_token and settings.notion_database_id):
        return {"success": False, "error": "Notion not configured. Set NOTION_TOKEN and NOTION_DATABASE_ID in .env"}
    if page_url is None:
        return {"success": False, "error": "Failed to save to Notion. Check backend logs."}
    return {"success": True, "page_url": page_url}


# ---------------------------------------------------------------------------
# POST /save-briefing
# ---------------------------------------------------------------------------
@router.post("/save-briefing", summary="Save an AI briefing to Notion database")
async def save_briefing(req: SaveBriefingRequest):
    page_url = await save_briefing_to_notion(req.script, req.audio_url)
    if page_url is None and not bool(settings.notion_token and settings.notion_database_id):
        return {"success": False, "error": "Notion not configured. Set NOTION_TOKEN and NOTION_DATABASE_ID in .env"}
    if page_url is None:
        return {"success": False, "error": "Failed to save to Notion. Check backend logs."}
    return {"success": True, "page_url": page_url}
