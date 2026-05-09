"""
LangChain tools for the News Intelligence Agent.

All tools use the @tool decorator so they can be bound to the LLM
or called directly from LangGraph nodes.
Tools are intentionally synchronous — nodes that need async call
them via asyncio.get_event_loop().run_in_executor() or directly
since most operations are fast I/O.
"""
from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime, timezone
from typing import Optional

import httpx
from langchain_core.tools import tool
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from tavily import TavilyClient

from app.config import settings

logger = logging.getLogger("datastraw.tools")

# ---------------------------------------------------------------------------
# Pre-compiled helpers
# ---------------------------------------------------------------------------
_HTML_TAG_RE = re.compile(r"<[^>]+>")

# ---------------------------------------------------------------------------
# Credibility database
# ---------------------------------------------------------------------------
_CREDIBILITY_DB: dict[str, float] = {
    "reuters.com": 0.97,
    "apnews.com": 0.96,
    "bbc.com": 0.95,
    "bbc.co.uk": 0.95,
    "nytimes.com": 0.90,
    "washingtonpost.com": 0.89,
    "bloomberg.com": 0.89,
    "theguardian.com": 0.88,
    "economist.com": 0.88,
    "ft.com": 0.87,
    "npr.org": 0.87,
    "pbs.org": 0.86,
    "politico.com": 0.84,
    "theatlantic.com": 0.83,
    "techcrunch.com": 0.82,
    "wired.com": 0.81,
    "arstechnica.com": 0.81,
    "nature.com": 0.95,
    "science.org": 0.94,
    "who.int": 0.96,
    "cdc.gov": 0.96,
    "gov.uk": 0.93,
    "foxnews.com": 0.65,
    "msnbc.com": 0.66,
    "huffpost.com": 0.67,
    "nypost.com": 0.64,
    "breitbart.com": 0.40,
    "wsj.com": 0.88,
    "cnbc.com": 0.84,
    "cnn.com": 0.78,
    "abcnews.go.com": 0.82,
    "nbcnews.com": 0.81,
    "cbsnews.com": 0.81,
    "theverge.com": 0.79,
    "engadget.com": 0.77,
    "venturebeat.com": 0.75,
    "forbes.com": 0.76,
    "time.com": 0.82,
    "newsweek.com": 0.74,
    "vice.com": 0.68,
    "buzzfeednews.com": 0.65,
}


def _get_tier(score: float) -> str:
    if score >= 0.90:
        return "tier1"
    if score >= 0.75:
        return "tier2"
    if score >= 0.60:
        return "tier3"
    return "unknown"


# ---------------------------------------------------------------------------
# Tool 1 — Tavily web search
# ---------------------------------------------------------------------------
@tool
def tavily_search(query: str, max_results: int = 5) -> list[dict]:
    """
    Search the web using Tavily's advanced search API.
    Returns a list of relevant sources with title, URL, content snippet,
    relevance score, and published date. Use this to gather current news
    and information from credible web sources.
    """
    try:
        client = TavilyClient(api_key=settings.tavily_api_key)
        response = client.search(
            query,
            max_results=max_results,
            search_depth="advanced",
            include_raw_content=True,
        )
        results = []
        for r in response.get("results", []):
            results.append(
                {
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "content": (r.get("raw_content") or r.get("content") or "")[:3000],
                    "score": r.get("score", 0.0),
                    "published_date": r.get("published_date", ""),
                }
            )
        logger.info("Tavily search '%s': %d results", query[:60], len(results))
        return results
    except Exception as exc:
        logger.error("Tavily search failed: %s", exc)
        return []


# ---------------------------------------------------------------------------
# Tool 2 — NewsData.io fetch
# ---------------------------------------------------------------------------
def _clean_newsdata_article(raw: dict) -> dict | None:
    """Lightweight cleaner for a single NewsData.io article dict."""
    title = raw.get("title")
    content = raw.get("content") or raw.get("description")
    if not title or not content:
        return None

    content = _HTML_TAG_RE.sub("", content).strip()[:3000]

    source_id = raw.get("source_id") or ""
    article_id = hashlib.sha256(f"{title}{source_id}".encode()).hexdigest()[:16]

    pub_date = raw.get("pubDate", "") or ""
    published_at: str | None = None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            published_at = (
                datetime.strptime(pub_date, fmt)
                .replace(tzinfo=timezone.utc)
                .isoformat()
            )
            break
        except (ValueError, TypeError):
            continue

    raw_category = raw.get("category") or []
    category = raw_category[0] if isinstance(raw_category, list) and raw_category else ""

    return {
        "article_id": article_id,
        "title": title,
        "content": content,
        "source_name": source_id,
        "source_url": raw.get("link", ""),
        "published_at": published_at,
        "category": category,
        "language": raw.get("language", ""),
    }


@tool
def fetch_newsdata(
    query: str, category: Optional[str] = None, limit: int = 20
) -> list[dict]:
    """
    Fetch recent news articles from NewsData.io for a given query.
    Optionally filter by category (e.g. 'technology', 'politics', 'business').
    Returns cleaned article dicts with title, content, source, and publication date.
    """
    params: dict = {
        "apikey": settings.newsdata_api_key,
        "q": query,
        "size": min(limit, 50),
        "language": "en",
    }
    if category:
        params["category"] = category

    try:
        with httpx.Client(timeout=20.0) as client:
            response = client.get("https://newsdata.io/api/1/news", params=params)
            response.raise_for_status()
            data = response.json()

        if data.get("status") != "success":
            logger.error("NewsData API error: %s", data)
            return []

        raw_articles = data.get("results", [])
        cleaned = [
            c
            for raw in raw_articles
            if (c := _clean_newsdata_article(raw)) is not None
        ]
        logger.info("fetch_newsdata '%s': %d articles", query[:60], len(cleaned))
        return cleaned

    except Exception as exc:
        logger.error("fetch_newsdata failed: %s", exc)
        return []


# ---------------------------------------------------------------------------
# Tool 3 — Source credibility scorer
# ---------------------------------------------------------------------------
@tool
def score_source_credibility(url: str) -> dict:
    """
    Score the credibility of a news source by its URL.
    Returns a credibility score (0-1), tier classification (tier1/tier2/tier3/unknown),
    and the matched domain. Tier1 (≥0.90) = highly credible, Tier2 (≥0.75) = credible,
    Tier3 (≥0.60) = moderate credibility, unknown = unrated source.
    """
    url_lower = url.lower()
    for domain, score in _CREDIBILITY_DB.items():
        if domain in url_lower:
            return {
                "url": url,
                "domain": domain,
                "credibility": score,
                "tier": _get_tier(score),
            }
    return {
        "url": url,
        "domain": "unknown",
        "credibility": 0.50,
        "tier": "unknown",
    }


# ---------------------------------------------------------------------------
# Tool 4 — PDF report generator
# ---------------------------------------------------------------------------
@tool
def generate_pdf_tool(content: dict, output_path: str) -> str:
    """
    Generate a professional PDF intelligence report using ReportLab.
    The content dict should include: title, query, summary, insights,
    validated_sources, sentiment, sentiment_score, confidence_scores,
    and optionally bias_analysis and trend_data.
    Returns the output_path on success.
    """
    try:
        doc = SimpleDocTemplate(
            output_path,
            pagesize=A4,
            rightMargin=2 * cm,
            leftMargin=2 * cm,
            topMargin=2 * cm,
            bottomMargin=2 * cm,
        )

        base_styles = getSampleStyleSheet()

        # Custom styles
        style_header = ParagraphStyle(
            "DSHeader",
            parent=base_styles["Normal"],
            fontSize=22,
            textColor=colors.HexColor("#1a365d"),
            spaceAfter=4,
            alignment=TA_CENTER,
            fontName="Helvetica-Bold",
        )
        style_subheader = ParagraphStyle(
            "DSSubHeader",
            parent=base_styles["Normal"],
            fontSize=10,
            textColor=colors.HexColor("#4a5568"),
            spaceAfter=12,
            alignment=TA_CENTER,
        )
        style_section = ParagraphStyle(
            "DSSection",
            parent=base_styles["Normal"],
            fontSize=13,
            textColor=colors.HexColor("#2d3748"),
            spaceBefore=16,
            spaceAfter=6,
            fontName="Helvetica-Bold",
        )
        style_body = ParagraphStyle(
            "DSBody",
            parent=base_styles["Normal"],
            fontSize=10,
            textColor=colors.HexColor("#2d3748"),
            spaceAfter=6,
            leading=14,
            alignment=TA_LEFT,
        )
        style_insight = ParagraphStyle(
            "DSInsight",
            parent=base_styles["Normal"],
            fontSize=10,
            textColor=colors.HexColor("#2d3748"),
            spaceAfter=4,
            leftIndent=12,
            leading=14,
        )
        style_footer = ParagraphStyle(
            "DSFooter",
            parent=base_styles["Normal"],
            fontSize=8,
            textColor=colors.HexColor("#a0aec0"),
            alignment=TA_CENTER,
        )

        elements = []
        generated_at = content.get("generated_at") or datetime.now(timezone.utc).strftime(
            "%B %d, %Y at %H:%M UTC"
        )

        # ── Header ──────────────────────────────────────────────────────
        elements.append(Spacer(1, 0.3 * cm))
        elements.append(Paragraph("Datastraw News Intelligence", style_header))
        elements.append(Paragraph(f"Generated: {generated_at}", style_subheader))
        elements.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#1a365d")))
        elements.append(Spacer(1, 0.4 * cm))

        # ── Report title ─────────────────────────────────────────────────
        title = content.get("title") or content.get("query", "Intelligence Report")
        elements.append(Paragraph(f"📋 {title}", style_section))
        if content.get("query") and content.get("query") != title:
            elements.append(Paragraph(f"Query: {content['query']}", style_body))
        elements.append(Spacer(1, 0.2 * cm))

        # ── Executive Summary ────────────────────────────────────────────
        if content.get("summary"):
            elements.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e2e8f0")))
            elements.append(Paragraph("Executive Summary", style_section))
            summary_data = [[Paragraph(content["summary"], style_body)]]
            summary_table = Table(summary_data, colWidths=["100%"])
            summary_table.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f7fafc")),
                        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e0")),
                        ("TOPPADDING", (0, 0), (-1, -1), 10),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                        ("LEFTPADDING", (0, 0), (-1, -1), 12),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                    ]
                )
            )
            elements.append(summary_table)

        # ── Key Insights ─────────────────────────────────────────────────
        insights: list[str] = content.get("insights", [])
        confidence: dict = content.get("confidence_scores", {})
        if insights:
            elements.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e2e8f0")))
            elements.append(Paragraph("Key Insights", style_section))
            for idx, insight in enumerate(insights, 1):
                conf = confidence.get(insight, confidence.get(str(idx - 1), 0.0))
                conf_pct = int(conf * 100)
                conf_color = (
                    "#38a169" if conf_pct >= 70
                    else "#d69e2e" if conf_pct >= 40
                    else "#e53e3e"
                )
                label = f"{idx}. {insight} <font color='{conf_color}'>[{conf_pct}% confidence]</font>"
                elements.append(Paragraph(label, style_insight))

        # ── Sentiment Analysis ────────────────────────────────────────────
        sentiment = content.get("sentiment", "")
        sentiment_score = content.get("sentiment_score", 0.0)
        if sentiment:
            elements.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e2e8f0")))
            elements.append(Paragraph("Sentiment Analysis", style_section))
            sentiment_colors = {
                "positive": "#38a169",
                "negative": "#e53e3e",
                "neutral": "#718096",
            }
            s_color = sentiment_colors.get(sentiment.lower(), "#718096")
            score_bar = "█" * int(abs(sentiment_score) * 10) + "░" * (10 - int(abs(sentiment_score) * 10))
            elements.append(
                Paragraph(
                    f"Overall Sentiment: <font color='{s_color}'><b>{sentiment.capitalize()}</b></font>  "
                    f"Score: {sentiment_score:+.2f}  {score_bar}",
                    style_body,
                )
            )

        # ── Bias Analysis (optional) ──────────────────────────────────────
        bias = content.get("bias_analysis", {})
        if bias and isinstance(bias, dict):
            elements.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e2e8f0")))
            elements.append(Paragraph("Media Bias Analysis", style_section))
            if bias.get("left_angle"):
                elements.append(Paragraph(f"◀ Left-leaning angle: {bias['left_angle']}", style_insight))
            if bias.get("center_angle"):
                elements.append(Paragraph(f"⚖ Center angle: {bias['center_angle']}", style_insight))
            if bias.get("right_angle"):
                elements.append(Paragraph(f"▶ Right-leaning angle: {bias['right_angle']}", style_insight))
            if bias.get("recommendation"):
                elements.append(Paragraph(f"Recommendation: {bias['recommendation']}", style_body))

        # ── Sources ───────────────────────────────────────────────────────
        sources: list[dict] = content.get("validated_sources", [])
        if sources:
            elements.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e2e8f0")))
            elements.append(Paragraph("Sources", style_section))
            for src in sources[:15]:
                title_text = src.get("title") or src.get("url", "")
                url = src.get("url", "")
                cred = src.get("credibility", 0.0)
                cred_pct = int(cred * 100)
                line = (
                    f'• <a href="{url}" color="#3182ce">{title_text[:80]}</a> '
                    f'— Credibility: {cred_pct}%'
                )
                elements.append(Paragraph(line, style_insight))

        # ── Footer ────────────────────────────────────────────────────────
        elements.append(Spacer(1, 1 * cm))
        elements.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e2e8f0")))
        elements.append(
            Paragraph("Confidential — Datastraw Technologies", style_footer)
        )

        doc.build(elements)
        logger.info("PDF generated: %s", output_path)
        return output_path

    except Exception as exc:
        logger.error("PDF generation failed: %s", exc)
        raise


# ---------------------------------------------------------------------------
# Tool 5 — Per-insight confidence scorer
# ---------------------------------------------------------------------------
@tool
def calculate_insight_confidence(insight: str, sources: list[dict]) -> float:
    """
    Calculate a confidence score (0.0–1.0) for an insight string by checking
    how many of the provided sources contain keywords from the insight.
    A higher score means more sources corroborate the insight.
    """
    if not sources or not insight:
        return 0.0

    # Extract meaningful keywords (words > 4 chars, lowercase)
    keywords = [w.lower() for w in re.findall(r"\b\w{4,}\b", insight)]
    if not keywords:
        return 0.0

    corroborated = 0
    for source in sources:
        source_text = (
            (source.get("content") or "") + " " + (source.get("title") or "")
        ).lower()
        if any(kw in source_text for kw in keywords):
            corroborated += 1

    score = round(corroborated / len(sources), 2)
    return score
