"""
Broadcast Analyzer — tool functions (plain async/sync, not LangChain @tool decorated).

Functions:
  download_youtube_audio  — yt-dlp via subprocess
  transcribe_audio        — openai-whisper (sync, run via run_in_executor)
  chunk_transcript        — word-window chunking with overlap
  analyze_broadcast_with_groq — Groq LLaMA structured analysis
  index_broadcast_chunks  — embed + store in shared FAISS index (broadcast_{tid})
  search_broadcast        — vector search over indexed broadcast chunks
  generate_broadcast_pdf  — ReportLab PDF with full analysis + Q&A history
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from datetime import datetime, timezone
from uuid import uuid4

from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage

from app.config import settings
from app.utils.embeddings import add_vectors, embedding_model, search_index

logger = logging.getLogger("datastraw.broadcast.tools")

_CODE_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)

# ---------------------------------------------------------------------------
# 1. YouTube audio download
# ---------------------------------------------------------------------------
async def download_youtube_audio(url: str, output_dir: str = "/tmp") -> dict:
    """
    Downloads audio-only from a YouTube URL using yt-dlp subprocess.
    Returns {audio_path, title, duration_seconds, channel_name, video_id}.
    Raises ValueError if the URL is invalid or unavailable.
    """
    # ── Fetch metadata first (fast) ─────────────────────────────────────
    meta_proc = await asyncio.create_subprocess_exec(
        "yt-dlp", "--dump-json", "--no-playlist", url,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    meta_out, meta_err = await meta_proc.communicate()

    if meta_proc.returncode != 0:
        err_msg = meta_err.decode(errors="replace").strip()
        raise ValueError(f"Could not fetch video metadata: {err_msg[:300]}")

    try:
        meta = json.loads(meta_out.decode(errors="replace"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Malformed metadata JSON from yt-dlp: {exc}") from exc

    video_id = meta.get("id", str(uuid4())[:8])
    title = meta.get("title") or meta.get("fulltitle") or "Untitled Broadcast"
    duration = int(meta.get("duration") or 0)
    channel = meta.get("channel") or meta.get("uploader") or "Unknown Channel"

    # ── Download audio ───────────────────────────────────────────────────
    output_template = os.path.join(output_dir, f"%(id)s.%(ext)s")
    dl_proc = await asyncio.create_subprocess_exec(
        "yt-dlp",
        "-x", "--audio-format", "mp3",
        "--audio-quality", "5",
        "--no-playlist",
        "-o", output_template,
        url,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, dl_err = await dl_proc.communicate()

    if dl_proc.returncode != 0:
        err_msg = dl_err.decode(errors="replace").strip()
        raise ValueError(f"Audio download failed: {err_msg[:300]}")

    audio_path = os.path.join(output_dir, f"{video_id}.mp3")
    if not os.path.exists(audio_path):
        # yt-dlp may have used a slightly different extension; find the file
        for f in os.listdir(output_dir):
            if f.startswith(video_id):
                audio_path = os.path.join(output_dir, f)
                break

    logger.info("download_youtube_audio: saved to %s (duration=%ds)", audio_path, duration)
    return {
        "audio_path": audio_path,
        "title": title,
        "duration_seconds": duration,
        "channel_name": channel,
        "video_id": video_id,
    }


# ---------------------------------------------------------------------------
# 2. Whisper transcription (sync — must be called via run_in_executor)
# ---------------------------------------------------------------------------
def transcribe_audio(audio_path: str, model_size: str | None = None) -> dict:
    """
    Synchronous Whisper transcription.
    ALWAYS call this via: await loop.run_in_executor(None, transcribe_audio, path)
    Returns {transcript, language, duration}.
    """
    import whisper  # lazy import — heavy, only needed here

    size = model_size or settings.whisper_model
    logger.info("transcribe_audio: loading whisper model='%s'", size)
    model = whisper.load_model(size)

    logger.info("transcribe_audio: transcribing %s", audio_path)
    result = model.transcribe(audio_path, fp16=False)

    transcript = result.get("text", "").strip()
    language = result.get("language", "en")
    duration = float(result.get("duration") or 0)

    logger.info("transcribe_audio: done — %d chars, lang=%s", len(transcript), language)
    return {"transcript": transcript, "language": language, "duration": duration}


# ---------------------------------------------------------------------------
# 3. Transcript chunking
# ---------------------------------------------------------------------------
def chunk_transcript(transcript: str, chunk_size: int = 300, overlap: int = 50) -> list[dict]:
    """
    Splits a transcript into overlapping word-window chunks.
    Each chunk: {chunk_id, text, start_char, end_char, word_count}.
    """
    words = transcript.split()
    if not words:
        return []

    chunks: list[dict] = []
    char_offset = 0
    i = 0

    while i < len(words):
        window = words[i : i + chunk_size]
        chunk_text = " ".join(window)

        start_char = transcript.find(window[0], char_offset) if window else 0
        end_char = start_char + len(chunk_text)

        chunks.append({
            "chunk_id": str(uuid4())[:8],
            "text": chunk_text,
            "start_char": max(start_char, 0),
            "end_char": end_char,
            "word_count": len(window),
        })

        char_offset = start_char + len(" ".join(window[: chunk_size - overlap])) + 1
        i += chunk_size - overlap

    logger.info("chunk_transcript: %d chunks from %d words", len(chunks), len(words))
    return chunks


# ---------------------------------------------------------------------------
# 4. Groq broadcast analysis
# ---------------------------------------------------------------------------
async def analyze_broadcast_with_groq(
    transcript: str,
    title: str,
    channel: str,
) -> dict:
    """
    Uses Groq LLaMA to extract structured analysis from the broadcast transcript.
    Returns {summary, key_events, people_mentioned, topics, sentiment, sentiment_score}.
    """
    truncated = transcript[:8000]
    if len(transcript) > 8000:
        truncated += "\n\n[transcript truncated for analysis]"

    system_prompt = (
        "You are a news broadcast analyst. Analyze this news broadcast transcript "
        "and extract structured information. Return ONLY valid JSON, no markdown, no explanation."
    )

    user_prompt = (
        f"Broadcast Title: {title}\nChannel: {channel}\n\n"
        f"Transcript:\n{truncated}\n\n"
        "Return a JSON object with EXACTLY these keys:\n"
        "{\n"
        '  "summary": "2-3 sentence overview of the broadcast",\n'
        '  "key_events": ["event 1", "event 2", ...],\n'
        '  "people_mentioned": ["Name 1", "Name 2", ...],\n'
        '  "topics": ["Topic 1", "Topic 2", ...],\n'
        '  "sentiment": "positive" or "negative" or "neutral",\n'
        '  "sentiment_score": 0.0\n'
        "}"
    )

    llm = ChatGroq(model="llama-3.3-70b-versatile", api_key=settings.groq_api_key)
    try:
        response = await llm.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt),
        ])
        raw = _CODE_FENCE_RE.sub("", response.content).strip()
        result = json.loads(raw)
        logger.info("analyze_broadcast_with_groq: extracted %d key events", len(result.get("key_events", [])))
        return result
    except Exception as exc:
        logger.error("analyze_broadcast_with_groq failed: %s", exc)
        return {
            "summary": f"Analysis of '{title}' broadcast from {channel}.",
            "key_events": [],
            "people_mentioned": [],
            "topics": [],
            "sentiment": "neutral",
            "sentiment_score": 0.0,
        }


# ---------------------------------------------------------------------------
# 5. FAISS indexing
# ---------------------------------------------------------------------------
async def index_broadcast_chunks(chunks: list[dict], thread_id: str) -> str:
    """
    Embeds transcript chunks and stores them in the shared FAISS index.
    Uses key 'broadcast_{thread_id}' to avoid collision with RAG agent indices.
    """
    if not chunks:
        logger.warning("index_broadcast_chunks: no chunks to index for thread=%s", thread_id)
        return "Indexed 0 chunks"

    index_key = f"broadcast_{thread_id}"
    texts = [c["text"] for c in chunks]

    vectors = await asyncio.to_thread(embedding_model.embed, texts)
    add_vectors(index_key, vectors, chunks)

    logger.info("index_broadcast_chunks: indexed %d chunks for key=%s", len(chunks), index_key)
    return f"Indexed {len(chunks)} chunks"


# ---------------------------------------------------------------------------
# 6. FAISS search
# ---------------------------------------------------------------------------
async def search_broadcast(query: str, thread_id: str, top_k: int = 4) -> list[dict]:
    """
    Searches the broadcast FAISS index for segments relevant to the query.
    """
    index_key = f"broadcast_{thread_id}"
    query_vector = await asyncio.to_thread(embedding_model.embed_single, query)
    results = search_index(index_key, query_vector, top_k)
    logger.info("search_broadcast: %d results for thread=%s", len(results), thread_id)
    return results


# ---------------------------------------------------------------------------
# 7. PDF report generation
# ---------------------------------------------------------------------------
def generate_broadcast_pdf(data: dict, output_path: str) -> str:
    """
    Generates a ReportLab PDF report of the broadcast analysis + Q&A session.
    Returns output_path.
    """
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.platypus import (
        HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
    )

    _DARK_BLUE   = colors.HexColor("#1a365d")
    _MID_BLUE    = colors.HexColor("#2563eb")
    _SLATE       = colors.HexColor("#2d3748")
    _LIGHT_GRAY  = colors.HexColor("#f7fafc")
    _BORDER_GRAY = colors.HexColor("#e2e8f0")
    _TEXT_GRAY   = colors.HexColor("#4a5568")
    _FOOTER_GRAY = colors.HexColor("#a0aec0")
    _GREEN       = colors.HexColor("#38a169")
    _RED         = colors.HexColor("#e53e3e")
    _YELLOW      = colors.HexColor("#d69e2e")

    _SENTIMENT_COLORS = {
        "positive": _GREEN,
        "negative": _RED,
        "neutral":  _SLATE,
    }

    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("H1", parent=styles["Heading1"], fontSize=20,
                        textColor=_DARK_BLUE, spaceAfter=6, alignment=TA_CENTER)
    h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=13,
                        textColor=_MID_BLUE, spaceBefore=12, spaceAfter=4)
    body = ParagraphStyle("Body", parent=styles["Normal"], fontSize=10,
                          textColor=_SLATE, leading=15)
    meta_style = ParagraphStyle("Meta", parent=styles["Normal"], fontSize=9,
                                textColor=_TEXT_GRAY, leading=13)
    caption = ParagraphStyle("Caption", parent=styles["Normal"], fontSize=9,
                             textColor=_FOOTER_GRAY, alignment=TA_CENTER)

    def _safe(text: str) -> str:
        return (str(text)
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;"))

    # ── Build story ──────────────────────────────────────────────────────
    story = []

    # Header
    story.append(Paragraph("Datastraw News Broadcast Analyzer", h1))
    story.append(Spacer(1, 0.3 * cm))

    # Video info table
    duration_s = int(data.get("video_duration") or 0)
    duration_str = f"{duration_s // 60}:{duration_s % 60:02d}"
    analyzed_at = datetime.now(timezone.utc).strftime("%B %d, %Y at %H:%M UTC")

    info_data = [
        ["📺 Title",    _safe(data.get("video_title") or "—")],
        ["📡 Channel",  _safe(data.get("channel_name") or "—")],
        ["⏱ Duration", duration_str],
        ["📅 Analyzed", analyzed_at],
        ["🌐 Sentiment", _safe((data.get("sentiment") or "neutral").capitalize())],
    ]
    info_table = Table(
        [[Paragraph(k, meta_style), Paragraph(v, body)] for k, v in info_data],
        colWidths=[3.5 * cm, None],
    )
    info_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), _LIGHT_GRAY),
        ("FONTNAME",   (0, 0), (0, -1), "Helvetica-Bold"),
        ("GRID",       (0, 0), (-1, -1), 0.3, _BORDER_GRAY),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 0.4 * cm))
    story.append(HRFlowable(width="100%", thickness=1, color=_BORDER_GRAY))
    story.append(Spacer(1, 0.3 * cm))

    # Summary
    story.append(Paragraph("📋 Broadcast Summary", h2))
    summary = data.get("broadcast_summary") or "No summary available."
    story.append(Paragraph(_safe(summary), body))
    story.append(Spacer(1, 0.4 * cm))

    # Key events
    key_events = data.get("key_events") or []
    if key_events:
        story.append(Paragraph("📰 Key Events", h2))
        for i, ev in enumerate(key_events, 1):
            story.append(Paragraph(f"{i}. {_safe(ev)}", body))
        story.append(Spacer(1, 0.3 * cm))

    # People mentioned
    people = data.get("people_mentioned") or []
    if people:
        story.append(Paragraph("👥 People Mentioned", h2))
        story.append(Paragraph(", ".join(_safe(p) for p in people), body))
        story.append(Spacer(1, 0.3 * cm))

    # Topics
    topics = data.get("topics") or []
    if topics:
        story.append(Paragraph("🏷️ Topics", h2))
        for t in topics:
            story.append(Paragraph(f"• {_safe(t)}", body))
        story.append(Spacer(1, 0.3 * cm))

    # Q&A history
    qa_history = data.get("qa_history") or []
    if qa_history:
        story.append(HRFlowable(width="100%", thickness=1, color=_BORDER_GRAY))
        story.append(Paragraph("💬 Q&A Session", h2))
        for pair in qa_history:
            q = pair.get("q", "")
            a = pair.get("a", "")
            if q:
                story.append(Paragraph(f"<b>Q:</b> {_safe(q)}", body))
            if a:
                story.append(Paragraph(f"<b>A:</b> {_safe(a)}", body))
            story.append(Spacer(1, 0.2 * cm))

    # Footer note
    story.append(Spacer(1, 0.5 * cm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=_BORDER_GRAY))
    story.append(Paragraph("Generated by Datastraw Technologies", caption))

    # ── Build PDF ────────────────────────────────────────────────────────
    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )
    doc.build(story)
    logger.info("generate_broadcast_pdf: saved to %s", output_path)
    return output_path
