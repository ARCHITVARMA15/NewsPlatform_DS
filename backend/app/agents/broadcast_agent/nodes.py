"""
LangGraph node functions for the Broadcast Analyzer Agent.

Nodes are deliberately granular so each one maps to a visible frontend step:
  input_validator → audio_extractor → transcription →
  chunking → indexing → groq_analysis →
  human_interrupt (HITL) → rag_answer / pdf_export
"""
from __future__ import annotations

import asyncio
import logging

from langchain_core.messages import AIMessage, HumanMessage
from langchain_groq import ChatGroq

from app.agents.broadcast_agent.state import BroadcastAgentState
from app.agents.broadcast_agent.tools import (
    analyze_broadcast_with_groq,
    chunk_transcript,
    download_youtube_audio,
    generate_broadcast_pdf,
    index_broadcast_chunks,
    search_broadcast,
    transcribe_audio,
)
from app.config import settings

logger = logging.getLogger("datastraw.broadcast.nodes")

llm = ChatGroq(model="llama-3.3-70b-versatile", api_key=settings.groq_api_key)


# ---------------------------------------------------------------------------
# Node 1 — Input Validator
# ---------------------------------------------------------------------------
async def input_validator_node(state: BroadcastAgentState) -> dict:
    """Validates that a YouTube URL or uploaded file is present."""
    url = state.get("youtube_url")
    uploaded = state.get("uploaded_file_path")

    if not url and not uploaded:
        return {
            "current_step": "Validating input",
            "error": "Please provide a valid YouTube URL or upload a video file.",
        }

    if url and "youtube.com" not in url and "youtu.be" not in url:
        return {
            "current_step": "Validating input",
            "error": "Please provide a valid YouTube URL (must contain youtube.com or youtu.be).",
        }

    logger.info("input_validator: OK — url=%s uploaded=%s", bool(url), bool(uploaded))
    return {"current_step": "Input validated"}


# ---------------------------------------------------------------------------
# Node 2 — Audio Extractor
# ---------------------------------------------------------------------------
async def audio_extractor_node(state: BroadcastAgentState) -> dict:
    """Downloads YouTube audio or converts an uploaded file to mp3."""
    try:
        if state.get("youtube_url"):
            result = await download_youtube_audio(state["youtube_url"])
            return {
                "audio_path":     result["audio_path"],
                "video_title":    result["title"],
                "video_duration": result["duration_seconds"],
                "channel_name":   result["channel_name"],
                "current_step":   "Audio extracted",
            }

        # Uploaded file path
        uploaded = state["uploaded_file_path"]
        import os
        filename = os.path.basename(uploaded)

        if uploaded.lower().endswith(".mp3"):
            audio_path = uploaded
        else:
            # Convert to mp3 with pydub
            from pydub import AudioSegment  # lazy import
            audio_path = uploaded.rsplit(".", 1)[0] + "_converted.mp3"
            seg = await asyncio.to_thread(AudioSegment.from_file, uploaded)
            await asyncio.to_thread(seg.export, audio_path, format="mp3")

        return {
            "audio_path":     audio_path,
            "video_title":    filename,
            "video_duration": 0,
            "channel_name":   "Uploaded File",
            "current_step":   "Audio extracted",
        }

    except Exception as exc:
        logger.error("audio_extractor_node error: %s", exc)
        return {"error": str(exc), "current_step": "Audio extraction failed"}


# ---------------------------------------------------------------------------
# Node 3 — Transcription
# ---------------------------------------------------------------------------
async def transcription_node(state: BroadcastAgentState) -> dict:
    """Runs Whisper transcription in an executor thread (sync-heavy operation)."""
    audio_path = state.get("audio_path")
    if not audio_path:
        return {"error": "No audio file available for transcription", "current_step": "Transcription failed"}

    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, transcribe_audio, audio_path)
        logger.info("transcription_node: %d chars", len(result["transcript"]))
        return {
            "transcript":   result["transcript"],
            "current_step": "Transcription complete",
        }
    except Exception as exc:
        logger.error("transcription_node error: %s", exc)
        return {"error": str(exc), "current_step": "Transcription failed"}


# ---------------------------------------------------------------------------
# Node 4 — Chunking
# ---------------------------------------------------------------------------
async def chunking_node(state: BroadcastAgentState) -> dict:
    """Splits the transcript into overlapping word-window chunks."""
    transcript = state.get("transcript") or ""
    if not transcript:
        return {"transcript_chunks": [], "current_step": "No transcript to chunk"}

    chunks = await asyncio.to_thread(chunk_transcript, transcript)
    logger.info("chunking_node: %d chunks", len(chunks))
    return {
        "transcript_chunks": chunks,
        "current_step":      f"Chunked into {len(chunks)} segments",
    }


# ---------------------------------------------------------------------------
# Node 5 — FAISS Indexing
# ---------------------------------------------------------------------------
async def indexing_node(state: BroadcastAgentState) -> dict:
    """Embeds transcript chunks and stores them in the FAISS index."""
    chunks = state.get("transcript_chunks") or []
    thread_id = state["thread_id"]

    if not chunks:
        return {"faiss_indexed": False, "current_step": "No chunks to index"}

    try:
        msg = await index_broadcast_chunks(chunks, thread_id)
        return {"faiss_indexed": True, "current_step": msg}
    except Exception as exc:
        logger.error("indexing_node error: %s", exc)
        return {"faiss_indexed": False, "error": str(exc), "current_step": "Indexing failed"}


# ---------------------------------------------------------------------------
# Node 6 — Groq Analysis
# ---------------------------------------------------------------------------
async def groq_analysis_node(state: BroadcastAgentState) -> dict:
    """Uses Groq LLaMA to extract structured insights from the broadcast."""
    transcript = state.get("transcript") or ""
    title = state.get("video_title") or "Untitled"
    channel = state.get("channel_name") or "Unknown"

    try:
        analysis = await analyze_broadcast_with_groq(transcript, title, channel)
        logger.info("groq_analysis_node: done — sentiment=%s", analysis.get("sentiment"))
        return {
            "broadcast_summary": analysis.get("summary", ""),
            "key_events":        analysis.get("key_events", []),
            "people_mentioned":  analysis.get("people_mentioned", []),
            "topics":            analysis.get("topics", []),
            "sentiment":         analysis.get("sentiment", "neutral"),
            "sentiment_score":   float(analysis.get("sentiment_score", 0.0)),
            "processing_complete": True,
            "current_step":      "Analysis complete",
        }
    except Exception as exc:
        logger.error("groq_analysis_node error: %s", exc)
        return {
            "error": str(exc),
            "processing_complete": False,
            "current_step": "Analysis failed",
        }


# ---------------------------------------------------------------------------
# Node 7 — HITL interrupt placeholder
# ---------------------------------------------------------------------------
async def human_interrupt_node(state: BroadcastAgentState) -> dict:
    """
    HITL pause point. The actual interrupt is declared via interrupt_before.
    When resumed, human_action directs the routing function.
    """
    return {}


# ---------------------------------------------------------------------------
# Node 8 — RAG Answer
# ---------------------------------------------------------------------------
async def rag_answer_node(state: BroadcastAgentState) -> dict:
    """Answers the user's question using transcript segments retrieved via FAISS."""
    # Extract the latest user query from messages
    query = ""
    for msg in reversed(state.get("messages") or []):
        if hasattr(msg, "type") and msg.type == "human":
            query = msg.content
            break

    if not query:
        return {"answer": "No question found. Please ask something.", "citations": []}

    thread_id = state["thread_id"]
    retrieved = await search_broadcast(query, thread_id)

    # Build context with segment labels
    context_parts: list[str] = []
    citations: list[dict] = []
    for i, chunk in enumerate(retrieved, 1):
        label = f"[Segment {i}]"
        context_parts.append(f"{label}: {chunk['text']}")
        citations.append({
            "chunk_id": chunk.get("chunk_id", ""),
            "text":     chunk["text"][:200],
            "start_char": chunk.get("start_char", 0),
            "similarity_score": chunk.get("similarity_score", 0.0),
            "label": label,
        })

    context = "\n\n".join(context_parts)

    # Build conversation history
    history_parts: list[str] = []
    for msg in (state.get("messages") or [])[-6:]:
        if hasattr(msg, "type"):
            role = "User" if msg.type == "human" else "Assistant"
            history_parts.append(f"{role}: {msg.content}")
    history_block = "\n".join(history_parts)

    system_prompt = (
        "You are analyzing a news broadcast transcript. Answer questions using ONLY "
        "the provided transcript segments. Cite segments as [Segment X]. "
        "If the answer is not in the transcript, say so clearly."
    )
    user_prompt = (
        f"Transcript segments:\n{context}\n\n"
        f"Conversation history:\n{history_block}\n\n"
        f"Question: {query}\n\nAnswer:"
    )

    answer = "Could not generate an answer. Please try again."
    try:
        from langchain_core.messages import SystemMessage, HumanMessage as LCHuman
        response = await llm.ainvoke([
            SystemMessage(content=system_prompt),
            LCHuman(content=user_prompt),
        ])
        answer = response.content.strip()
    except Exception as exc:
        logger.error("rag_answer_node: LLM failed: %s", exc)

    return {
        "answer":           answer,
        "citations":        citations,
        "retrieved_chunks": retrieved,
        "messages":         [AIMessage(content=answer)],
        "current_step":     "Answer generated",
    }


# ---------------------------------------------------------------------------
# Node 9 — PDF Export
# ---------------------------------------------------------------------------
async def pdf_export_node(state: BroadcastAgentState) -> dict:
    """Generates a PDF report of the full broadcast analysis + Q&A history."""
    thread_id = state.get("thread_id", "unknown")
    output_path = f"/tmp/broadcast_{thread_id}.pdf"

    # Build Q&A history from messages
    qa_history: list[dict] = []
    msgs = state.get("messages") or []
    q_temp = None
    for msg in msgs:
        if not hasattr(msg, "type"):
            continue
        if msg.type == "human":
            q_temp = msg.content
        elif msg.type == "ai" and q_temp:
            qa_history.append({"q": q_temp, "a": msg.content})
            q_temp = None

    data = {
        "video_title":       state.get("video_title") or "Untitled",
        "channel_name":      state.get("channel_name") or "Unknown",
        "video_duration":    state.get("video_duration") or 0,
        "broadcast_summary": state.get("broadcast_summary") or "",
        "key_events":        state.get("key_events") or [],
        "people_mentioned":  state.get("people_mentioned") or [],
        "topics":            state.get("topics") or [],
        "sentiment":         state.get("sentiment") or "neutral",
        "sentiment_score":   state.get("sentiment_score") or 0.0,
        "qa_history":        qa_history,
    }

    try:
        path = await asyncio.to_thread(generate_broadcast_pdf, data, output_path)

        # Cleanup audio file after PDF is generated
        import os
        audio = state.get("audio_path")
        if audio and os.path.exists(audio):
            try:
                os.remove(audio)
                logger.info("pdf_export_node: cleaned up audio file %s", audio)
            except Exception:
                pass

        return {"pdf_path": path, "current_step": "PDF report generated"}
    except Exception as exc:
        logger.error("pdf_export_node error: %s", exc)
        return {"error": str(exc), "current_step": "PDF generation failed"}


# ---------------------------------------------------------------------------
# Routing functions
# ---------------------------------------------------------------------------
def route_after_validation(state: BroadcastAgentState) -> str:
    """Routes to extract_audio or end based on validation result."""
    if state.get("error"):
        return "end"
    return "extract_audio"


def route_broadcast_action(state: BroadcastAgentState) -> str:
    """Routes after HITL interrupt based on human_action."""
    action = (state.get("human_action") or "").lower()
    if action == "export_pdf":
        return "pdf_export"
    if action == "ask_question":
        return "rag_answer"
    return "end"
