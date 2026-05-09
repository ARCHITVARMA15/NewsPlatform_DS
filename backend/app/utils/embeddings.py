"""
Embedding model singleton and FAISS index manager for the Datastraw platform.

EmbeddingModel — lazy-loaded sentence-transformers wrapper (all-MiniLM-L6-v2).
FAISSIndex + module-level manager — in-memory vector store keyed by thread_id.

NOTE: In production this would be persisted to disk or Supabase pgvector.
      The rag_agent/tools.py module maintains its own separate _faiss_stores
      dict; this utility is a cleaner standalone alternative for future use.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

import faiss
import numpy as np
from sentence_transformers import SentenceTransformer

logger = logging.getLogger("datastraw.utils.embeddings")

_EMBEDDING_DIM = 384          # all-MiniLM-L6-v2 output dimension
_MODEL_NAME = "all-MiniLM-L6-v2"


# ---------------------------------------------------------------------------
# Embedding model singleton
# ---------------------------------------------------------------------------
class EmbeddingModel:
    """
    Lazy-loaded wrapper around sentence-transformers all-MiniLM-L6-v2.

    The underlying model is only instantiated on the first call to
    embed() or embed_single(), avoiding slow import-time startup.
    """

    def __init__(self) -> None:
        self._model: SentenceTransformer | None = None

    def _get(self) -> SentenceTransformer:
        if self._model is None:
            logger.info("Loading sentence-transformer model '%s'...", _MODEL_NAME)
            self._model = SentenceTransformer(_MODEL_NAME)
            logger.info("Embedding model loaded (%d-dim).", _EMBEDDING_DIM)
        return self._model

    def embed(self, texts: list[str]) -> np.ndarray:
        """
        Embed a list of texts.

        Returns:
            Float32 numpy array of shape (len(texts), 384),
            L2-normalised for cosine similarity via inner product.
        """
        return (
            self._get()
            .encode(texts, normalize_embeddings=True, show_progress_bar=False)
            .astype(np.float32)
        )

    def embed_single(self, text: str) -> np.ndarray:
        """
        Embed a single text string.

        Returns:
            Float32 numpy array of shape (384,).
        """
        return self.embed([text])[0]


# Module-level singleton — import and use directly
embedding_model = EmbeddingModel()


# ---------------------------------------------------------------------------
# FAISS index manager
# ---------------------------------------------------------------------------
@dataclass
class FAISSIndex:
    """Container pairing a FAISS IndexFlatIP with its source chunks."""

    index: faiss.IndexFlatIP
    chunks: list[dict] = field(default_factory=list)


# Global store:  thread_id → FAISSIndex
faiss_indices: dict[str, FAISSIndex] = {}


def create_or_get_index(thread_id: str, dim: int = _EMBEDDING_DIM) -> faiss.IndexFlatIP:
    """
    Return the existing FAISS index for thread_id, or create a new one.

    Args:
        thread_id: Session identifier used as the index key.
        dim:       Vector dimension (default 384 for all-MiniLM-L6-v2).

    Returns:
        faiss.IndexFlatIP (cosine similarity via inner product on L2-normed vectors).
    """
    if thread_id not in faiss_indices:
        idx = faiss.IndexFlatIP(dim)
        faiss_indices[thread_id] = FAISSIndex(index=idx)
        logger.info("Created FAISS index for thread=%s dim=%d", thread_id, dim)
    return faiss_indices[thread_id].index


def add_vectors(
    thread_id: str,
    vectors: np.ndarray,
    chunks: list[dict],
) -> None:
    """
    Add pre-computed embeddings and their source chunks to a thread's index.

    Args:
        thread_id: Session identifier.
        vectors:   Float32 numpy array of shape (N, dim), L2-normalised.
        chunks:    Parallel list of source chunk dicts (same length as vectors).
    """
    if vectors.ndim != 2:
        raise ValueError(f"Expected 2-D vectors array, got shape {vectors.shape}")
    if len(vectors) != len(chunks):
        raise ValueError(
            f"vectors ({len(vectors)}) and chunks ({len(chunks)}) must have same length"
        )

    dim = vectors.shape[1]
    create_or_get_index(thread_id, dim)
    store = faiss_indices[thread_id]
    store.index.add(vectors.astype(np.float32))
    store.chunks.extend(chunks)
    logger.info(
        "add_vectors: +%d vectors for thread=%s (total=%d)",
        len(chunks),
        thread_id,
        len(store.chunks),
    )


def search_index(
    thread_id: str,
    query_vector: np.ndarray,
    top_k: int = 5,
) -> list[dict]:
    """
    Search the FAISS index for the most similar chunks.

    Args:
        thread_id:    Session identifier.
        query_vector: Float32 numpy array of shape (dim,) or (1, dim), L2-normalised.
        top_k:        Maximum number of results to return.

    Returns:
        List of chunk dicts (copies) each extended with a ``similarity_score`` float.
        Returns [] if no index exists for the thread.
    """
    store = faiss_indices.get(thread_id)
    if not store or not store.chunks:
        logger.warning("search_index: no index for thread=%s", thread_id)
        return []

    query = query_vector.reshape(1, -1).astype(np.float32)
    k = min(top_k, len(store.chunks))
    scores, indices = store.index.search(query, k)

    results: list[dict] = []
    for score, idx in zip(scores[0], indices[0]):
        if idx >= 0:
            chunk = store.chunks[int(idx)]
            results.append({**chunk, "similarity_score": float(score)})

    logger.debug(
        "search_index: %d results for thread=%s top_k=%d",
        len(results),
        thread_id,
        top_k,
    )
    return results
