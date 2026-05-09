"""
LangGraph node functions for the RAG Agent.

Each node takes the full RAGAgentState and returns a partial dict
that LangGraph merges back into the shared state.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import datetime, timezone

from langchain_core.messages import AIMessage, HumanMessage
from langchain_groq import ChatGroq

from app.agents.news_agent.tools import generate_pdf_tool
from app.agents.rag_agent.state import RAGAgentState
from app.agents.rag_agent.tools import (
    chunk_pdf,
    embed_and_store_chunks,
    tavily_search_rag,
    vector_search,
)
from app.config import settings

logger = logging.getLogger("datastraw.rag.nodes")

# Module-level LLM instance
llm = ChatGroq(model="llama-3.3-70b-versatile", api_key=settings.groq_api_key)

_CODE_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


# ---------------------------------------------------------------------------
# Node 1 — PDF Ingestion
# ---------------------------------------------------------------------------
async def pdf_ingestion_node(state: RAGAgentState) -> dict:
    """
    Reads the PDF from the path stored in pdf_metadata, chunks it, and
    embeds chunks into an in-memory FAISS index keyed by thread_id.
    Skipped automatically when has_pdf=False (handled by START conditional).
    """
    pdf_meta = state.get("pdf_metadata") or {}
    file_path = pdf_meta.get("file_path")
    filename = pdf_meta.get("filename", "document.pdf")

    if not file_path:
        logger.warning("pdf_ingestion_node: no file_path in pdf_metadata")
        return {"current_step": "pdf_ingestion_skipped", "error": "No PDF file path provided"}

    # ── Fast path: router already embedded chunks into FAISS ────────────
    from app.agents.rag_agent.tools import _faiss_stores as _stores

    thread_id = state["thread_id"]
    if thread_id in _stores and _stores[thread_id].get("chunks"):
        existing = _stores[thread_id]["chunks"]
        page_count = max((c.get("page_num", 0) for c in existing), default=0)
        logger.info("pdf_ingestion_node: reusing %d pre-embedded chunks for thread=%s", len(existing), thread_id)
        return {
            "pdf_chunks": existing,
            "pdf_metadata": {**pdf_meta, "page_count": page_count, "chunk_count": len(existing)},
            "current_step": "pdf_already_ingested",
        }

    # ── Slow path: file exists but FAISS is empty (e.g. server restart) ─
    try:
        with open(file_path, "rb") as fh:
            file_bytes = fh.read()

        chunks: list[dict] = await asyncio.to_thread(
            chunk_pdf.invoke, {"file_bytes": file_bytes, "filename": filename}
        )

        await asyncio.to_thread(
            embed_and_store_chunks.invoke,
            {"chunks": chunks, "thread_id": thread_id},
        )

        page_count = max((c.get("page_num", 0) for c in chunks), default=0)

        return {
            "pdf_chunks": chunks,
            "pdf_metadata": {
                **pdf_meta,
                "page_count": page_count,
                "chunk_count": len(chunks),
            },
            "current_step": "pdf_ingested",
        }

    except Exception as exc:
        logger.error("PDF ingestion failed: %s", exc)
        return {"error": str(exc), "current_step": "pdf_ingestion_failed"}


# ---------------------------------------------------------------------------
# Node 2 — Query Analyzer
# ---------------------------------------------------------------------------
async def query_analyzer_node(state: RAGAgentState) -> dict:
    """
    Determines clarify_mode based on the query and whether a PDF is available.
    If no PDF is loaded, defaults to web_only.
    Otherwise asks the LLM to choose: hybrid | pdf_only | web_only.
    """
    if not state.get("has_pdf"):
        return {"clarify_mode": "web_only", "current_step": "query_analysis"}

    prompt = (
        "A PDF document is available. Given the following question, decide the best "
        "search strategy:\n"
        "- 'pdf_only': answer entirely from the PDF\n"
        "- 'web_only': answer from live web sources only\n"
        "- 'hybrid': combine both PDF and web\n\n"
        f"Question: {state['query']}\n\n"
        "Return ONLY one word: hybrid, pdf_only, or web_only"
    )

    mode = "hybrid"
    try:
        response = await llm.ainvoke(prompt)
        candidate = response.content.strip().lower().split()[0]
        if candidate in ("hybrid", "pdf_only", "web_only"):
            mode = candidate
    except Exception as exc:
        logger.warning("query_analyzer LLM failed (%s) — defaulting to hybrid", exc)

    logger.info("query_analyzer: mode='%s' for query='%s'", mode, state["query"][:60])
    return {"clarify_mode": mode, "current_step": "query_analysis"}


# ---------------------------------------------------------------------------
# Node 3 — Vector Retriever
# ---------------------------------------------------------------------------
async def vector_retriever_node(state: RAGAgentState) -> dict:
    """
    Searches the in-memory FAISS index for the most relevant PDF chunks.
    Returns top-5 chunks with similarity scores.
    """
    results: list[dict] = await asyncio.to_thread(
        vector_search.invoke,
        {"query": state["query"], "thread_id": state["thread_id"], "top_k": 5},
    )
    logger.info("vector_retriever: %d chunks retrieved", len(results))
    return {"retrieved_chunks": results, "current_step": "vector_retrieval"}


# ---------------------------------------------------------------------------
# Node 4 — Web Search (RAG)
# ---------------------------------------------------------------------------
async def web_search_rag_node(state: RAGAgentState) -> dict:
    """Fetches live web results for the query using Tavily."""
    results: list[dict] = await tavily_search_rag.ainvoke({"query": state["query"]})
    logger.info("web_search_rag: %d results", len(results))
    return {"web_results": results, "current_step": "web_search"}


# ---------------------------------------------------------------------------
# Node 5 — Context Merger
# ---------------------------------------------------------------------------
async def context_merger_node(state: RAGAgentState) -> dict:
    """
    Merges retrieved PDF chunks and web results into a single context string.
    Respects clarify_mode to include only the relevant source types.
    Builds the citations list for answer attribution.
    """
    mode = state.get("clarify_mode", "hybrid")
    retrieved = state.get("retrieved_chunks") or []
    web = state.get("web_results") or []

    context_parts: list[str] = []
    citations: list[dict] = []

    # PDF chunks
    if mode != "web_only":
        for chunk in retrieved:
            page = chunk.get("page_num", "?")
            text = chunk.get("text", "")
            score = chunk.get("similarity_score", 0.0)
            label = f"[PDF - Page {page}]"
            context_parts.append(f"{label}: {text}")
            citations.append(
                {
                    "source": label,
                    "text": text[:200],
                    "type": "pdf",
                    "page_num": page,
                    "similarity_score": score,
                }
            )

    # Web results
    if mode != "pdf_only":
        for r in web:
            title = r.get("title") or r.get("url", "web")
            content = r.get("content", "")
            url = r.get("url", "")
            label = f"[WEB - {title[:50]}]"
            context_parts.append(f"{label}: {content[:800]}")
            citations.append(
                {
                    "source": title,
                    "url": url,
                    "text": content[:200],
                    "type": "web",
                }
            )

    merged = "\n\n".join(context_parts)[:10000]
    logger.info(
        "context_merger: %d parts, mode=%s, total_chars=%d",
        len(context_parts),
        mode,
        len(merged),
    )
    return {
        "merged_context": merged,
        "citations": citations,
        "current_step": "context_merged",
    }


# ---------------------------------------------------------------------------
# Node 6 — Answer Generator
# ---------------------------------------------------------------------------
async def answer_generator_node(state: RAGAgentState) -> dict:
    """
    Generates a grounded answer from merged_context using Groq LLaMA.
    Instructs the LLM to cite sources as [PDF-PageX] or [WEB-SourceName].
    Appends the answer to the messages list for conversation history.
    """
    context = state.get("merged_context", "")
    query = state.get("query", "")

    # Include the last 4 messages as conversation history for follow-ups
    history_parts: list[str] = []
    for msg in (state.get("messages") or [])[-4:]:
        if hasattr(msg, "type"):
            role = "User" if msg.type == "human" else "Assistant"
            history_parts.append(f"{role}: {msg.content}")

    history_block = "\n".join(history_parts)
    history_section = f"\nConversation History:\n{history_block}\n" if history_block else ""

    prompt = (
        "Answer the question using ONLY the provided context. "
        "Cite sources as [PDF-PageX] or [WEB-SourceName]. "
        "If the context is insufficient to answer clearly, say so explicitly.\n\n"
        f"Context:\n{context}\n"
        f"{history_section}"
        f"\nQuestion: {query}\n\nAnswer:"
    )

    answer = "I could not generate an answer. Please try again."
    try:
        response = await llm.ainvoke(prompt)
        answer = response.content.strip()
    except Exception as exc:
        logger.error("answer_generator failed: %s", exc)

    logger.info("answer_generator: %d chars", len(answer))
    return {
        "answer": answer,
        "messages": [AIMessage(content=answer)],
        "current_step": "answer_generated",
    }


# ---------------------------------------------------------------------------
# Node 7 — RAG HITL interrupt (placeholder)
# ---------------------------------------------------------------------------
async def rag_human_interrupt_node(state: RAGAgentState) -> dict:
    """
    Placeholder for the HITL interrupt point.
    The actual pause is declared via interrupt_before=["rag_human_interrupt"].
    When the graph resumes, human_action tells us what the user chose.
    """
    return {}


# ---------------------------------------------------------------------------
# Node 8 — Mode setters (clarify paths)
# ---------------------------------------------------------------------------
async def set_pdf_only_node(state: RAGAgentState) -> dict:
    """Sets clarify_mode to pdf_only for the PDF-only clarify path."""
    return {"clarify_mode": "pdf_only", "human_action": None}


async def set_web_only_node(state: RAGAgentState) -> dict:
    """Sets clarify_mode to web_only for the web-only clarify path."""
    return {"clarify_mode": "web_only", "human_action": None}


# ---------------------------------------------------------------------------
# Node 9 — PDF Report Generator
# ---------------------------------------------------------------------------
async def pdf_report_generator_node(state: RAGAgentState) -> dict:
    """
    Generates a PDF research report of the full Q&A session with source citations.
    Reuses the ReportLab-based generate_pdf_tool from the news agent.
    """
    thread_id = state.get("thread_id", "unknown")
    output_path = f"/tmp/rag_report_{thread_id}.pdf"

    content = {
        "title": f"RAG Research Report",
        "query": state.get("query", ""),
        "summary": state.get("answer", ""),
        "insights": [
            c.get("source", "") for c in (state.get("citations") or [])
        ],
        "validated_sources": [
            {
                "title": c.get("source", ""),
                "url": c.get("url", ""),
                "credibility": 1.0 if c.get("type") == "web" else 0.0,
            }
            for c in (state.get("citations") or [])
        ],
        "sentiment": "neutral",
        "sentiment_score": 0.0,
        "confidence_scores": {},
        "generated_at": datetime.now(timezone.utc).strftime("%B %d, %Y at %H:%M UTC"),
    }

    try:
        path = await asyncio.to_thread(
            generate_pdf_tool.invoke,
            {"content": content, "output_path": output_path},
        )
        logger.info("RAG PDF report saved: %s", path)
        return {
            "pdf_metadata": {**(state.get("pdf_metadata") or {}), "report_path": path},
            "current_step": "report_generated",
        }
    except Exception as exc:
        logger.error("RAG PDF report generation failed: %s", exc)
        return {"error": str(exc), "current_step": "report_failed"}


# ---------------------------------------------------------------------------
# Routing functions (NOT nodes — used in add_conditional_edges)
# ---------------------------------------------------------------------------
def route_rag_action(state: RAGAgentState) -> str:
    """
    Reads state.human_action and returns the edge label for conditional routing
    after the HITL interrupt.
    """
    action = (state.get("human_action") or "end").lower()
    mapping = {
        "generate_report": "generate_report",
        "clarify_pdf": "clarify_pdf",
        "clarify_web": "clarify_web",
        "continue": "continue",
        "end": "end",
    }
    return mapping.get(action, "end")


def should_ingest_pdf(state: RAGAgentState) -> str:
    """Routes START to pdf_ingestion or directly to query_analyzer."""
    return "pdf_ingestion" if state.get("has_pdf", False) else "query_analyzer"


def fan_out_search(state: RAGAgentState):
    """
    Uses LangGraph Send API to fan out to vector_retriever and/or web_search_rag
    in parallel based on clarify_mode.
    LangGraph fan-in waits only for nodes triggered in the SAME super-step,
    so context_merger correctly fires after 1 or 2 sources depending on mode.
    """
    from langgraph.types import Send

    mode = state.get("clarify_mode", "hybrid")
    if mode == "pdf_only":
        return [Send("vector_retriever", state)]
    elif mode == "web_only":
        return [Send("web_search_rag", state)]
    else:  # hybrid
        return [Send("vector_retriever", state), Send("web_search_rag", state)]
