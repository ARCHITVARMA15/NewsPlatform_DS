"""
Slack notification service.

Posts formatted messages to the configured Slack incoming webhook.
Used by:
  - event_detector.py  → breaking event alerts to #news-alerts
  - briefing_router.py → daily briefing summary to #news-alerts

Never raises — all errors are logged and swallowed so the main
pipeline is never blocked by a Slack outage.
"""
from __future__ import annotations

import logging

import httpx

from app.config import settings

logger = logging.getLogger("datastraw.slack")

URGENCY_EMOJI = {
    "BREAKING": "🚨",
    "HIGH":     "⚠️",
    "MEDIUM":   "📰",
}

CATEGORY_EMOJI = {
    "POLITICS": "🏛️",
    "BUSINESS": "💼",
    "TECH":     "💻",
    "CONFLICT": "⚔️",
    "ECONOMY":  "📈",
    "HEALTH":   "🏥",
    "OTHER":    "🌐",
}


async def _post(payload: dict) -> None:
    """Internal — POST payload to Slack webhook. Never raises."""
    if not settings.slack_webhook_url:
        logger.debug("SLACK_WEBHOOK_URL not set — skipping notification")
        return
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.post(settings.slack_webhook_url, json=payload)
            if res.status_code != 200:
                logger.warning("Slack webhook returned %d: %s", res.status_code, res.text)
    except Exception as exc:
        logger.warning("Slack notification failed: %s", exc)


async def notify_breaking_event(event: dict) -> None:
    """
    Posts a breaking event alert to Slack.
    Called by event_detector.detect_events() for each new event.
    """
    urgency  = event.get("urgency", "HIGH")
    category = event.get("category", "OTHER")
    name     = event.get("event_name", "Breaking Development")
    desc     = event.get("description", "")
    entities = event.get("key_entities", [])
    count    = event.get("article_count", 0)
    preview  = event.get("articles_preview", [])

    u_emoji = URGENCY_EMOJI.get(urgency, "📰")
    c_emoji = CATEGORY_EMOJI.get(category, "🌐")

    headline = f"{u_emoji} *{urgency}: {name}*"
    entity_str = "  •  ".join(entities[:5]) if entities else "—"
    preview_str = "\n".join(
        f"> {p.get('title', '')}  _{p.get('source', '')}_"
        for p in preview[:3]
    )

    blocks = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": f"{u_emoji} {name}", "emoji": True},
        },
        {
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"*Category:*\n{c_emoji} {category}"},
                {"type": "mrkdwn", "text": f"*Urgency:*\n{urgency}"},
                {"type": "mrkdwn", "text": f"*Articles:*\n{count} clustered"},
                {"type": "mrkdwn", "text": f"*Key Entities:*\n{entity_str}"},
            ],
        },
        {"type": "section", "text": {"type": "mrkdwn", "text": desc}},
    ]

    if preview_str:
        blocks.append({
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*Top articles:*\n{preview_str}"},
        })

    blocks.append({"type": "divider"})

    await _post({"text": headline, "blocks": blocks})
    logger.info("Slack breaking event alert sent: %s", name)


async def notify_daily_briefing(script: str, audio_url: str) -> None:
    """
    Posts the daily AI briefing summary to Slack.
    Called by briefing_router.generate_briefing() after a briefing is created.
    """
    excerpt = script[:300] + ("…" if len(script) > 300 else "")

    blocks = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": "📰 Daily AI News Briefing", "emoji": True},
        },
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"_{excerpt}_"},
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"🔊 *Listen:* <{audio_url}|Open audio briefing>",
            },
        },
        {"type": "divider"},
    ]

    await _post({"text": "📰 Daily AI News Briefing is ready", "blocks": blocks})
    logger.info("Slack daily briefing notification sent")
