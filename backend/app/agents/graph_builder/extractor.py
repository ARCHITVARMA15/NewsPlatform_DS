"""
Knowledge Graph Extractor.

Responsibilities:
  1. extract_entities_and_relations(article) — LLM extracts nodes + edges from one article.
  2. build_full_graph(limit)               — Fetches N articles, processes in parallel batches
                                             of 10, merges into a unified graph.
  3. get_node_articles(node_id)            — Returns articles associated with a graph node.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_groq import ChatGroq

from app.config import settings
from app.database.supabase_client import get_article_by_id, get_articles

logger = logging.getLogger("datastraw.graph.extractor")

# ---------------------------------------------------------------------------
# LLM instance
# ---------------------------------------------------------------------------
llm = ChatGroq(model="llama-3.3-70b-versatile", api_key=settings.groq_api_key)

# Pre-compiled code-fence stripper
_CODE_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)

_SYSTEM_PROMPT = """\
You are a knowledge graph builder. Extract named entities and their relationships \
from news articles.
Return ONLY valid JSON in this exact format:
{
  "nodes": [
    {"id": "unique_slug", "label": "Display Name",
     "type": "PERSON|COMPANY|COUNTRY|EVENT|TOPIC|ORGANIZATION"}
  ],
  "edges": [
    {"source": "node_id_1", "target": "node_id_2",
     "relation": "verb or relationship description",
     "weight": 1}
  ]
}
Rules:
- Max 8 nodes per article
- Max 10 edges per article
- id must be lowercase_underscore_slug of the label
- Only include entities clearly mentioned in the text
- Merge obvious duplicates (USA = United States = us)
- weight = 1 always for now\
"""


def _strip_fences(text: str) -> str:
    return _CODE_FENCE_RE.sub("", text).strip()


# ---------------------------------------------------------------------------
# Single-article extraction
# ---------------------------------------------------------------------------
async def extract_entities_and_relations(article: dict) -> dict:
    """
    Calls Groq to extract named entities and relationships from one article.

    Returns:
        {
            "nodes": [{"id", "label", "type", "article_ids"}],
            "edges": [{"source", "target", "relation", "weight"}]
        }
    On any failure returns {"nodes": [], "edges": []}.
    """
    title   = article.get("title",   "") or ""
    summary = article.get("summary", "") or ""
    content = (article.get("content", "") or "")[:2000]

    if not title.strip():
        return {"nodes": [], "edges": []}

    user_message = f"Title: {title}\n{summary}\n{content}".strip()

    try:
        response = await llm.ainvoke([
            SystemMessage(content=_SYSTEM_PROMPT),
            HumanMessage(content=user_message),
        ])
        raw    = _strip_fences(response.content.strip())
        result = json.loads(raw)
    except (json.JSONDecodeError, Exception) as exc:
        logger.warning(
            "extract_entities_and_relations failed for '%s': %s",
            title[:60], exc,
        )
        return {"nodes": [], "edges": []}

    article_id = article.get("article_id", "")

    # Attach article_ids to each node
    nodes: list[dict] = []
    for node in result.get("nodes", []):
        if not isinstance(node, dict):
            continue
        node.setdefault("article_ids", [])
        if article_id and article_id not in node["article_ids"]:
            node["article_ids"].append(article_id)
        nodes.append(node)

    edges: list[dict] = [e for e in result.get("edges", []) if isinstance(e, dict)]

    logger.debug(
        "Extracted %d nodes / %d edges from '%s'",
        len(nodes), len(edges), title[:60],
    )
    return {"nodes": nodes, "edges": edges}


# ---------------------------------------------------------------------------
# Full-graph builder
# ---------------------------------------------------------------------------
async def build_full_graph(limit: int = 100) -> dict:
    """
    Fetches up to `limit` recent articles, extracts entities from each in
    parallel batches of 10, then merges everything into one unified graph.

    Node merging: same id → same entity (article_ids list grows, weight increments).
    Edge merging: same (source, target, relation) key → weight increments.

    Returns:
        {
            "nodes": list[dict],
            "edges": list[dict],
            "stats": {"total_nodes", "total_edges", "articles_processed"}
        }
    """
    articles = await get_articles(limit=limit)
    logger.info("build_full_graph: processing %d articles", len(articles))

    all_nodes: dict[str, dict] = {}
    all_edges: list[dict]      = []

    # Process in batches of 10 concurrently to respect Groq rate limits
    batch_size = 10
    batches    = [articles[i : i + batch_size] for i in range(0, len(articles), batch_size)]

    for batch_idx, batch in enumerate(batches):
        logger.debug("Processing batch %d/%d", batch_idx + 1, len(batches))
        results = await asyncio.gather(
            *[extract_entities_and_relations(a) for a in batch],
            return_exceptions=True,
        )

        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.warning("Batch %d item %d failed: %s", batch_idx, i, result)
                continue

            article_id = batch[i].get("article_id", "")

            # ── Merge nodes ──────────────────────────────────────────
            for node in result.get("nodes", []):
                nid = node.get("id")
                if not nid:
                    continue
                if nid in all_nodes:
                    existing = all_nodes[nid]
                    existing["article_ids"] = list(set(
                        existing.get("article_ids", []) + [article_id]
                    ))
                    existing["weight"] = existing.get("weight", 1) + 1
                else:
                    node.setdefault("article_ids", [article_id] if article_id else [])
                    node.setdefault("weight", 1)
                    all_nodes[nid] = node

            # ── Merge edges ──────────────────────────────────────────
            for edge in result.get("edges", []):
                src      = edge.get("source", "")
                tgt      = edge.get("target", "")
                relation = edge.get("relation", "")
                key      = f"{src}__{tgt}__{relation}"

                existing_edge = next(
                    (
                        e for e in all_edges
                        if f"{e['source']}__{e['target']}__{e['relation']}" == key
                    ),
                    None,
                )
                if existing_edge:
                    existing_edge["weight"] = existing_edge.get("weight", 1) + 1
                else:
                    edge.setdefault("weight", 1)
                    all_edges.append(edge)

    logger.info(
        "build_full_graph done: %d nodes / %d edges from %d articles",
        len(all_nodes), len(all_edges), len(articles),
    )
    return {
        "nodes": list(all_nodes.values()),
        "edges": all_edges,
        "stats": {
            "total_nodes":        len(all_nodes),
            "total_edges":        len(all_edges),
            "articles_processed": len(articles),
        },
    }


# ---------------------------------------------------------------------------
# Node → articles lookup
# ---------------------------------------------------------------------------
async def get_node_articles(node_id: str) -> list[dict]:
    """
    Returns up to 10 articles whose titles contain the human-readable
    form of `node_id` (underscores replaced with spaces).
    """
    search_term = node_id.replace("_", " ")
    return await get_articles(search=search_term, limit=10)
