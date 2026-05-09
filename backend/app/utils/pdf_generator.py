"""
PDF report generator utility for the Datastraw News Intelligence Platform.

Provides ReportGenerator with two methods:
  - generate_news_report: full intelligence report with insights, sentiment, bias
  - generate_rag_report: Q&A research report with citations

Uses ReportLab Platypus for layout + a custom NumberedCanvas for page footers.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

logger = logging.getLogger("datastraw.utils.pdf_generator")

# ---------------------------------------------------------------------------
# Colour palette
# ---------------------------------------------------------------------------
_DARK_BLUE = colors.HexColor("#1a365d")
_MID_BLUE = colors.HexColor("#2b6cb0")
_SLATE = colors.HexColor("#2d3748")
_LIGHT_GRAY = colors.HexColor("#f7fafc")
_BORDER_GRAY = colors.HexColor("#e2e8f0")
_TEXT_GRAY = colors.HexColor("#4a5568")
_GREEN = colors.HexColor("#38a169")
_RED = colors.HexColor("#e53e3e")
_YELLOW = colors.HexColor("#d69e2e")
_FOOTER_GRAY = colors.HexColor("#a0aec0")

_SENTIMENT_COLORS = {
    "positive": "#38a169",
    "negative": "#e53e3e",
    "neutral": "#718096",
}


# ---------------------------------------------------------------------------
# Custom canvas — adds page number footer to every page
# ---------------------------------------------------------------------------
class _NumberedCanvas(rl_canvas.Canvas):
    """Deferred-rendering canvas that adds page N of M footer."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states: list[dict] = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self._draw_footer(total)
            rl_canvas.Canvas.showPage(self)
        rl_canvas.Canvas.save(self)

    def _draw_footer(self, total_pages: int):
        self.setFont("Helvetica", 8)
        self.setFillColor(_FOOTER_GRAY)
        footer_text = (
            f"Page {self._pageNumber} of {total_pages}  |  "
            "Confidential — Datastraw Technologies"
        )
        self.drawCentredString(A4[0] / 2, 1.2 * cm, footer_text)


# ---------------------------------------------------------------------------
# Style factory
# ---------------------------------------------------------------------------
def _make_styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "logo": ParagraphStyle(
            "Logo",
            parent=base["Normal"],
            fontSize=20,
            fontName="Helvetica-Bold",
            textColor=_DARK_BLUE,
            alignment=TA_CENTER,
            spaceAfter=2,
        ),
        "tagline": ParagraphStyle(
            "Tagline",
            parent=base["Normal"],
            fontSize=9,
            textColor=_TEXT_GRAY,
            alignment=TA_CENTER,
            spaceAfter=12,
        ),
        "section": ParagraphStyle(
            "Section",
            parent=base["Normal"],
            fontSize=12,
            fontName="Helvetica-Bold",
            textColor=_DARK_BLUE,
            spaceBefore=14,
            spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["Normal"],
            fontSize=10,
            textColor=_SLATE,
            spaceAfter=4,
            leading=15,
            alignment=TA_LEFT,
        ),
        "bullet": ParagraphStyle(
            "Bullet",
            parent=base["Normal"],
            fontSize=10,
            textColor=_SLATE,
            spaceAfter=3,
            leftIndent=14,
            leading=14,
        ),
        "caption": ParagraphStyle(
            "Caption",
            parent=base["Normal"],
            fontSize=8,
            textColor=_TEXT_GRAY,
            spaceAfter=2,
        ),
        "answer": ParagraphStyle(
            "Answer",
            parent=base["Normal"],
            fontSize=10,
            textColor=_SLATE,
            leading=16,
            spaceAfter=6,
        ),
    }


# ---------------------------------------------------------------------------
# Shared layout helpers
# ---------------------------------------------------------------------------
def _header(styles: dict) -> list:
    """Datastraw branded header with HR divider."""
    elements = [
        Spacer(1, 0.3 * cm),
        Paragraph("Datastraw News Intelligence Platform", styles["logo"]),
        Paragraph("Powered by Groq LLaMA · LangGraph · FAISS", styles["tagline"]),
        HRFlowable(width="100%", thickness=2, color=_DARK_BLUE),
        Spacer(1, 0.4 * cm),
    ]
    return elements


def _gray_box(text: str, style: ParagraphStyle) -> Table:
    """Text in a light-gray rounded-corner-ish box."""
    data = [[Paragraph(text, style)]]
    t = Table(data, colWidths=["100%"])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), _LIGHT_GRAY),
                ("BOX", (0, 0), (-1, -1), 0.5, _BORDER_GRAY),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
            ]
        )
    )
    return t


def _conf_bar(confidence: float, width: int = 12) -> str:
    """Unicode block-character confidence bar with colour markup."""
    filled = max(0, min(width, int(confidence * width)))
    col = "#38a169" if confidence >= 0.7 else "#d69e2e" if confidence >= 0.4 else "#e53e3e"
    bar = f"<font color='{col}'>{'█' * filled}</font>{'░' * (width - filled)}"
    pct = int(confidence * 100)
    return f"{bar} <font color='{col}'>{pct}%</font>"


# ---------------------------------------------------------------------------
# ReportGenerator
# ---------------------------------------------------------------------------
class ReportGenerator:
    """Generates professional A4 PDF intelligence reports."""

    # ------------------------------------------------------------------ #
    # Public API                                                          #
    # ------------------------------------------------------------------ #
    def generate_news_report(self, data: dict, output_path: str) -> str:
        """
        Generate a News Intelligence Report PDF.

        Expected data keys:
          title, query, summary, insights (list[str]),
          sources (list[dict] with url/title/credibility),
          sentiment, sentiment_score (float),
          confidence_scores (dict[insight -> float]),
          bias_analysis (dict, optional),
          trend_data (list[dict], optional),
          generated_at (str, optional)
        """
        styles = _make_styles()
        doc = self._make_doc(output_path)
        elements: list[Any] = []

        generated_at = data.get("generated_at") or datetime.now(timezone.utc).strftime(
            "%B %d, %Y at %H:%M UTC"
        )

        # Header
        elements += _header(styles)

        # Title
        title = data.get("title") or data.get("query", "News Intelligence Report")
        elements.append(Paragraph(title, styles["section"]))
        elements.append(
            Paragraph(f"<font color='#718096'>Generated: {generated_at}</font>", styles["caption"])
        )
        elements.append(Spacer(1, 0.3 * cm))

        # Executive Summary
        if data.get("summary"):
            elements.append(Paragraph("Executive Summary", styles["section"]))
            elements.append(_gray_box(data["summary"], styles["body"]))
            elements.append(Spacer(1, 0.2 * cm))

        # Key Insights
        insights: list[str] = data.get("insights") or []
        confidence_scores: dict = data.get("confidence_scores") or {}
        if insights:
            elements.append(HRFlowable(width="100%", thickness=0.5, color=_BORDER_GRAY))
            elements.append(Paragraph("Key Insights", styles["section"]))
            for i, insight in enumerate(insights, 1):
                conf = confidence_scores.get(insight, confidence_scores.get(str(i - 1), 0.0))
                bar = _conf_bar(conf)
                elements.append(
                    Paragraph(f"{i}. {insight}", styles["bullet"])
                )
                elements.append(
                    Paragraph(f"&nbsp;&nbsp;&nbsp;Confidence: {bar}", styles["caption"])
                )

        # Sentiment Analysis
        sentiment = data.get("sentiment", "")
        sentiment_score = float(data.get("sentiment_score") or 0.0)
        if sentiment:
            elements.append(HRFlowable(width="100%", thickness=0.5, color=_BORDER_GRAY))
            elements.append(Paragraph("Sentiment Analysis", styles["section"]))
            s_color = _SENTIMENT_COLORS.get(sentiment.lower(), "#718096")
            score_bar = _conf_bar(abs(sentiment_score))
            direction = "positive bias" if sentiment_score > 0 else "negative bias" if sentiment_score < 0 else "neutral"
            elements.append(
                Paragraph(
                    f"Overall: <font color='{s_color}'><b>{sentiment.capitalize()}</b></font>  "
                    f"Score: {sentiment_score:+.2f} ({direction})  {score_bar}",
                    styles["body"],
                )
            )

        # Bias Analysis (optional)
        bias: dict = data.get("bias_analysis") or {}
        if bias:
            elements.append(HRFlowable(width="100%", thickness=0.5, color=_BORDER_GRAY))
            elements.append(Paragraph("Media Bias Analysis", styles["section"]))
            bias_score = float(bias.get("bias_score", 0.0))
            elements.append(
                Paragraph(
                    f"Bias Score: {bias_score:+.2f} "
                    f"(-1 = far left, 0 = center, +1 = far right)",
                    styles["caption"],
                )
            )
            for label, key in [("◀ Left", "left_angle"), ("⚖ Center", "center_angle"), ("▶ Right", "right_angle")]:
                if bias.get(key):
                    elements.append(Paragraph(f"{label}: {bias[key]}", styles["bullet"]))
            if bias.get("recommendation"):
                elements.append(Spacer(1, 0.1 * cm))
                elements.append(_gray_box(f"💡 {bias['recommendation']}", styles["caption"]))
            diffs: list[str] = bias.get("key_differences") or []
            if diffs:
                elements.append(Paragraph("Key Framing Differences:", styles["body"]))
                for d in diffs:
                    elements.append(Paragraph(f"• {d}", styles["bullet"]))

        # Sources
        sources: list[dict] = data.get("sources") or data.get("validated_sources") or []
        if sources:
            elements.append(HRFlowable(width="100%", thickness=0.5, color=_BORDER_GRAY))
            elements.append(Paragraph("Sources", styles["section"]))
            for src in sources[:15]:
                src_title = src.get("title") or src.get("url", "")
                url = src.get("url", "")
                cred = src.get("credibility", 0.0)
                cred_color = "#38a169" if cred >= 0.85 else "#d69e2e" if cred >= 0.65 else "#e53e3e"
                line = (
                    f'• <a href="{url}" color="#3182ce">{str(src_title)[:80]}</a>'
                    f' — Credibility: <font color="{cred_color}">{int(cred * 100)}%</font>'
                )
                elements.append(Paragraph(line, styles["bullet"]))

        doc.build(elements, canvasmaker=_NumberedCanvas)
        logger.info("News report saved: %s", output_path)
        return output_path

    def generate_rag_report(self, data: dict, output_path: str) -> str:
        """
        Generate a RAG Q&A Research Report PDF.

        Expected data keys:
          query, answer, citations (list[dict] with source/text/type/url/page_num),
          pdf_sources (list[dict], optional — derived from citations if absent),
          web_sources (list[dict], optional — derived from citations if absent),
          generated_at (str, optional)
        """
        styles = _make_styles()
        doc = self._make_doc(output_path)
        elements: list[Any] = []

        generated_at = data.get("generated_at") or datetime.now(timezone.utc).strftime(
            "%B %d, %Y at %H:%M UTC"
        )

        # Header
        elements += _header(styles)

        # Title
        elements.append(Paragraph("RAG Research Report", styles["section"]))
        elements.append(
            Paragraph(f"<font color='#718096'>Generated: {generated_at}</font>", styles["caption"])
        )
        elements.append(Spacer(1, 0.3 * cm))

        # Q&A Section
        elements.append(HRFlowable(width="100%", thickness=0.5, color=_BORDER_GRAY))
        elements.append(Paragraph("Question", styles["section"]))
        if data.get("query"):
            elements.append(
                _gray_box(data["query"], styles["body"])
            )

        elements.append(Paragraph("Answer", styles["section"]))
        if data.get("answer"):
            elements.append(Paragraph(data["answer"], styles["answer"]))

        # Citations
        citations: list[dict] = data.get("citations") or []
        if citations:
            elements.append(HRFlowable(width="100%", thickness=0.5, color=_BORDER_GRAY))
            elements.append(Paragraph("Citations", styles["section"]))
            for i, cite in enumerate(citations, 1):
                src_type = cite.get("type", "web").upper()
                source = cite.get("source", "")
                page = cite.get("page_num")
                url = cite.get("url", "")
                page_label = f" — Page {page}" if page else ""
                url_part = f' <a href="{url}" color="#3182ce">[link]</a>' if url else ""
                elements.append(
                    Paragraph(
                        f"{i}. [{src_type}] {source}{page_label}{url_part}",
                        styles["bullet"],
                    )
                )

        # PDF Sources breakdown
        pdf_sources = data.get("pdf_sources") or [
            c for c in citations if c.get("type") == "pdf"
        ]
        if pdf_sources:
            elements.append(HRFlowable(width="100%", thickness=0.5, color=_BORDER_GRAY))
            elements.append(Paragraph("PDF Document Sources", styles["section"]))
            for src in pdf_sources:
                page = src.get("page_num", "?")
                text = src.get("text", "")
                elements.append(
                    Paragraph(f"• Page {page}: {text[:200]}…", styles["bullet"])
                )

        # Web Sources breakdown
        web_sources = data.get("web_sources") or [
            c for c in citations if c.get("type") == "web"
        ]
        if web_sources:
            elements.append(HRFlowable(width="100%", thickness=0.5, color=_BORDER_GRAY))
            elements.append(Paragraph("Web Sources", styles["section"]))
            for src in web_sources:
                url = src.get("url", "")
                title = src.get("source") or src.get("title", url)
                line = f'• <a href="{url}" color="#3182ce">{str(title)[:80]}</a>'
                elements.append(Paragraph(line, styles["bullet"]))

        doc.build(elements, canvasmaker=_NumberedCanvas)
        logger.info("RAG report saved: %s", output_path)
        return output_path

    # ------------------------------------------------------------------ #
    # Internal                                                            #
    # ------------------------------------------------------------------ #
    @staticmethod
    def _make_doc(output_path: str) -> SimpleDocTemplate:
        return SimpleDocTemplate(
            output_path,
            pagesize=A4,
            rightMargin=2 * cm,
            leftMargin=2 * cm,
            topMargin=2 * cm,
            bottomMargin=2.5 * cm,  # extra space for footer
        )


# Module-level singleton
report_generator = ReportGenerator()
