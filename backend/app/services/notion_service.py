"""
Notion integration service.

Saves articles and briefings to a Notion database.
Requires NOTION_TOKEN and NOTION_DATABASE_ID to be set in .env.

Database setup (one-time, in Notion):
  1. Create a new database page in Notion.
  2. Add these properties:
       Title      → Title type     (default)
       Source     → Text type
       Summary    → Text type
       URL        → URL type
       Sentiment  → Select type    (options: Positive, Negative, Neutral)
       Category   → Select type    (e.g. Tech, Politics, Business …)
       Type       → Select type    (options: Article, Briefing)
       Saved At   → Date type
  3. Share the database with your Notion integration (three-dot menu → Connect to).
  4. Copy the database ID from the URL:
       https://notion.so/YOUR_WORKSPACE/<DATABASE_ID>?v=...
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from app.config import settings

logger = logging.getLogger("datastraw.notion")


def _is_configured() -> bool:
    return bool(settings.notion_token and settings.notion_database_id)


def _notion_client():
    from notion_client import Client
    return Client(auth=settings.notion_token)


def _rich_text(content: str) -> dict:
    return {"type": "paragraph", "paragraph": {"rich_text": [{"type": "text", "text": {"content": content[:2000]}}]}}


def _heading(content: str, level: int = 3) -> dict:
    key = f"heading_{level}"
    return {key: {"rich_text": [{"type": "text", "text": {"content": content}}]}, "type": key}


def _divider() -> dict:
    return {"type": "divider", "divider": {}}


async def save_article_to_notion(article: dict) -> str | None:
    """
    Saves a news article to Notion as a page with body content blocks.
    Works with any Notion database — only needs the default 'Name' title property.
    Returns the Notion page URL on success, None if not configured or on error.
    """
    if not _is_configured():
        logger.debug("Notion not configured — skipping save_article")
        return None

    def _sync() -> str | None:
        notion  = _notion_client()
        title   = (article.get("title") or "Untitled Article")[:100]
        source  = article.get("source_name") or "Unknown"
        summary = article.get("summary") or article.get("description") or "No summary available."
        url     = article.get("url") or article.get("source_url") or ""
        sentiment = (article.get("sentiment") or "neutral").capitalize()
        category  = (article.get("category") or "General").capitalize()
        saved_at  = datetime.now(timezone.utc).strftime("%B %d, %Y %H:%M UTC")

        children = [
            _rich_text(f"📰 Source: {source}"),
            _rich_text(f"🏷️  Category: {category}  |  😐 Sentiment: {sentiment}"),
            _rich_text(f"🕐 Saved: {saved_at}"),
            _divider(),
            _heading("Summary", 3),
            _rich_text(summary),
        ]
        if url:
            children.append(_rich_text(f"🔗 URL: {url}"))

        page = notion.pages.create(
            parent={"database_id": settings.notion_database_id},
            properties={"Name": {"title": [{"text": {"content": title}}]}},
            children=children,
        )
        page_url: str = page.get("url", "")
        logger.info("Article saved to Notion: %s → %s", title, page_url)
        return page_url

    try:
        return await asyncio.to_thread(_sync)
    except Exception as exc:
        logger.error("save_article_to_notion failed: %s", exc)
        return None


async def save_briefing_to_notion(script: str, audio_url: str) -> str | None:
    """
    Saves a generated briefing script + audio link to Notion as body content.
    Works with any Notion database — only needs the default 'Name' title property.
    Returns the Notion page URL on success, None if not configured or on error.
    """
    if not _is_configured():
        logger.debug("Notion not configured — skipping save_briefing")
        return None

    def _sync() -> str | None:
        notion = _notion_client()
        today  = datetime.now(timezone.utc).strftime("%B %d, %Y")
        title  = f"AI News Briefing — {today}"

        children = [
            _rich_text(f"🎙️ Generated: {today}"),
            _divider(),
            _heading("Broadcast Script", 3),
            _rich_text(script),
        ]
        if audio_url:
            children.append(_divider())
            children.append(_rich_text(f"🔊 Audio: {audio_url}"))

        page = notion.pages.create(
            parent={"database_id": settings.notion_database_id},
            properties={"Name": {"title": [{"text": {"content": title}}]}},
            children=children,
        )
        page_url: str = page.get("url", "")
        logger.info("Briefing saved to Notion: %s → %s", title, page_url)
        return page_url

    try:
        return await asyncio.to_thread(_sync)
    except Exception as exc:
        logger.error("save_briefing_to_notion failed: %s", exc)
        return None
