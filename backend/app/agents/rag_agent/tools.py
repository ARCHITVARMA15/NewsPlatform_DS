"""
LangChain tools for the RAG Agent.

NOTE: In production, the in-memory FAISS store would be replaced with
Supabase pgvector for persistence across server restarts.
All tools are synchronous — nodes run them via asyncio.to_thread().
"""
from __future__ import annotations

import logging
from io import BytesIO
from typing import Optional

import faiss
import numpy as np
from langchain_core.tools import tool
from pypdf import PdfReader
from sentence_transformers import SentenceTransformer
from tavily import TavilyClient

from app.config import settings

logger = logging.getLogger("datastraw.rag.tools")

# ---------------------------------------------------------------------------
# Lazy-loaded embedding model (all-MiniLM-L6-v2, 384-dim)
# Loaded once on first use to avoid slow startup.
# ---------------------------------------------------------------------------
_embedding_model: SentenceTransformer | None = None


def _get_model() -> SentenceTransformer:
    global _embedding_model
    if _embedding_model is None:
        logger.info("Loading sentence-transformer model all-MiniLM-L6-v2...")
        _embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
        logger.info("Embedding model loaded.")
    return _embedding_model


# ---------------------------------------------------------------------------
# In-memory FAISS store keyed by thread_id
# {thread_id: {"index": faiss.Index, "chunks": list[dict]}}
# In production this would be persisted to disk or Supabase Storage.
# ---------------------------------------------------------------------------
_faiss_stores: dict[str, dict] = {}


# ---------------------------------------------------------------------------
# Tool 1 — PDF chunker
# ---------------------------------------------------------------------------
@tool
def chunk_pdf(file_bytes: bytes, filename: str, chunk_size: int = 500) -> list[dict]:
    """
    Extract text from a PDF and split it into overlapping word chunks.
    Each chunk contains chunk_id, text, page_num, filename, and char_count.
    Uses a 50-word overlap between consecutive chunks to preserve context.
    """
    reader = PdfReader(BytesIO(file_bytes))
    chunks: list[dict] = []
    chunk_counter = 0
    overlap = 50

    for page_num, page in enumerate(reader.pages, start=1):
        raw_text = page.extract_text() or ""
        words = raw_text.split()

        if not words:
            continue

        step = max(1, chunk_size - overlap)
        for start in range(0, len(words), step):
            chunk_words = words[start : start + chunk_size]
            if not chunk_words:
                break
            chunk_text = " ".join(chunk_words)
            chunks.append(
                {
                    "chunk_id": f"{filename}_p{page_num}_c{chunk_counter}",
                    "text": chunk_text,
                    "page_num": page_num,
                    "filename": filename,
                    "char_count": len(chunk_text),
                }
            )
            chunk_counter += 1

    logger.info("chunk_pdf: %d chunks from '%s' (%d pages)", len(chunks), filename, len(reader.pages))
    return chunks


# ---------------------------------------------------------------------------
# Tool 2 — Embed and store chunks in FAISS
# ---------------------------------------------------------------------------
@tool
def embed_and_store_chunks(chunks: list[dict], thread_id: str) -> str:
    """
    Embed PDF chunks using sentence-transformers (all-MiniLM-L6-v2) and store
    them in an in-memory FAISS index keyed by thread_id.
    Uses cosine similarity (IndexFlatIP with L2-normalised vectors).
    Returns a status string with the count of stored chunks.
    """
    if not chunks:
        return "stored 0 chunks"

    model = _get_model()
    texts = [c["text"] for c in chunks]

    embeddings = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
    embeddings = embeddings.astype(np.float32)

    dim = embeddings.shape[1]  # 384 for all-MiniLM-L6-v2
    index = faiss.IndexFlatIP(dim)  # Inner product on normalised = cosine similarity
    index.add(embeddings)

    _faiss_stores[thread_id] = {"index": index, "chunks": chunks}
    logger.info("embed_and_store_chunks: stored %d chunks for thread=%s", len(chunks), thread_id)
    return f"stored {len(chunks)} chunks"


# ---------------------------------------------------------------------------
# Tool 3 — Vector search
# ---------------------------------------------------------------------------
@tool
def vector_search(query: str, thread_id: str, top_k: int = 5) -> list[dict]:
    """
    Search the FAISS index for a given thread_id using semantic similarity.
    Returns top_k chunks with their similarity scores (0–1, higher = more similar).
    Returns empty list if no index exists for the thread (PDF not yet ingested).
    """
    store = _faiss_stores.get(thread_id)
    if not store:
        logger.warning("vector_search: no FAISS index for thread=%s", thread_id)
        return []

    model = _get_model()
    query_embedding = model.encode(
        [query], normalize_embeddings=True, show_progress_bar=False
    ).astype(np.float32)

    n_chunks = len(store["chunks"])
    k = min(top_k, n_chunks)

    scores, indices = store["index"].search(query_embedding, k)

    results: list[dict] = []
    for score, idx in zip(scores[0], indices[0]):
        if idx >= 0:  # FAISS returns -1 for empty slots
            chunk = store["chunks"][int(idx)]
            results.append({**chunk, "similarity_score": float(score)})

    logger.info(
        "vector_search: %d results for query='%s' thread=%s",
        len(results),
        query[:60],
        thread_id,
    )
    return results


# ---------------------------------------------------------------------------
# Tool 4 — Tavily web search (RAG variant)
# ---------------------------------------------------------------------------
@tool
def tavily_search_rag(query: str, max_results: int = 5) -> list[dict]:
    """
    Search the web using Tavily for a given query. Returns sources with title,
    URL, content snippet, and published date. Use this to supplement PDF content
    with current web information when answering research questions.
    """
    try:
        client = TavilyClient(api_key=settings.tavily_api_key)
        response = client.search(
            query,
            max_results=max_results,
            search_depth="advanced",
            include_raw_content=True,
        )
        results = [
            {
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "content": (r.get("raw_content") or r.get("content") or "")[:2000],
                "published_date": r.get("published_date", ""),
            }
            for r in response.get("results", [])
        ]
        logger.info("tavily_search_rag '%s': %d results", query[:60], len(results))
        return results
    except Exception as exc:
        logger.error("tavily_search_rag failed: %s", exc)
        return []
