"""
NewsData.io ETL pipeline.

Fetches → cleans → deduplicates → AI-analyses → upserts to Supabase.
Uses raw httpx calls to https://newsdata.io/api/1/news (no SDK dependency).
"""
import asyncio
import hashlib
import json
import logging
import re
import time
from datetime import datetime, timezone

import httpx
from langchain_groq import ChatGroq

from app.config import settings
from app.database.supabase_client import upsert_article

logger = logging.getLogger("datastraw.pipeline")

# Pre-compiled HTML tag stripper
_HTML_TAG_RE = re.compile(r"<[^>]+>")
# Markdown code-fence stripper (```json ... ```)
_CODE_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


class NewsPipeline:
    """End-to-end news ETL pipeline powered by NewsData.io + Groq."""

    def __init__(self) -> None:
        self.llm = ChatGroq(
            model="llama-3.3-70b-versatile",
            api_key=settings.groq_api_key,
            temperature=0,
        )

    # ------------------------------------------------------------------
    # 1. Fetch
    # ------------------------------------------------------------------
    async def fetch_articles(
        self,
        query: str,
        page_size: int = 10,
        max_pages: int = 5,
        category: str | None = None,
    ) -> list[dict]:
        """
        Fetch articles from NewsData.io with pagination and exponential
        backoff retry on rate-limit (429) responses.
        """
        articles: list[dict] = []
        next_page_token: str | None = None

        async with httpx.AsyncClient(timeout=30.0) as client:
            for page_num in range(1, max_pages + 1):
                params: dict = {
                    "apikey": settings.newsdata_api_key,
                    "q": query,
                    "size": page_size,
                    "language": "en",
                }
                if category:
                    params["category"] = category
                if next_page_token:
                    params["page"] = next_page_token

                fetched = await self._fetch_page_with_retry(client, params, page_num)
                if fetched is None:
                    break  # unrecoverable error — stop pagination

                page_articles = fetched.get("results", [])
                articles.extend(page_articles)
                logger.info(
                    "Page %d: fetched %d articles (running total: %d)",
                    page_num,
                    len(page_articles),
                    len(articles),
                )

                next_page_token = fetched.get("nextPage")
                if not next_page_token:
                    break  # no more pages

        return articles

    async def _fetch_page_with_retry(
        self,
        client: httpx.AsyncClient,
        params: dict,
        page_num: int,
        max_attempts: int = 3,
    ) -> dict | None:
        """Single page fetch with exponential backoff on 429 / transient errors."""
        for attempt in range(max_attempts):
            try:
                response = await client.get(
                    "https://newsdata.io/api/1/news", params=params
                )

                if response.status_code == 429:
                    wait = 2**attempt
                    logger.warning(
                        "Rate limited on page %d — waiting %ds (attempt %d/%d)",
                        page_num,
                        wait,
                        attempt + 1,
                        max_attempts,
                    )
                    await asyncio.sleep(wait)
                    continue

                response.raise_for_status()
                data: dict = response.json()

                if data.get("status") != "success":
                    logger.error("NewsData API error on page %d: %s", page_num, data)
                    return None

                return data

            except httpx.HTTPStatusError as exc:
                wait = 2**attempt
                logger.warning(
                    "HTTP error on page %d (attempt %d/%d): %s — retrying in %ds",
                    page_num,
                    attempt + 1,
                    max_attempts,
                    exc,
                    wait,
                )
                if attempt < max_attempts - 1:
                    await asyncio.sleep(wait)
            except Exception as exc:
                logger.error("Unexpected error fetching page %d: %s", page_num, exc)
                return None

        logger.error("Page %d failed after %d attempts — skipping.", page_num, max_attempts)
        return None

    # ------------------------------------------------------------------
    # 2. Clean
    # ------------------------------------------------------------------
    def clean_article(self, raw: dict) -> dict | None:
        """
        Normalise a raw NewsData.io article dict.
        Returns None if title or content is missing.
        """
        title: str | None = raw.get("title")
        # NewsData.io sometimes puts content in 'content', sometimes only 'description'
        content: str | None = raw.get("content") or raw.get("description")

        if not title or not content:
            return None

        # Strip HTML tags and truncate
        content = _HTML_TAG_RE.sub("", content).strip()[:5000]

        # Normalise published_at (NewsData.io format: "2024-01-15 10:30:00")
        pub_date: str = raw.get("pubDate", "") or ""
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

        # Stable article_id: sha256(title + source_id)[:16]
        source_id: str = raw.get("source_id") or ""
        article_id: str = hashlib.sha256(
            f"{title}{source_id}".encode("utf-8")
        ).hexdigest()[:16]

        # NewsData.io returns category and country as lists — take first element
        raw_category = raw.get("category") or []
        category_str = (
            raw_category[0] if isinstance(raw_category, list) and raw_category
            else str(raw_category)
        )

        raw_country = raw.get("country") or []
        country_str = (
            raw_country[0] if isinstance(raw_country, list) and raw_country
            else str(raw_country)
        )

        description = raw.get("description") or ""

        return {
            "article_id": article_id,
            "title": title,
            "description": description[:500] if description else None,
            "content": content,
            "source_name": source_id,
            "source_url": raw.get("link"),
            "published_at": published_at,
            "category": category_str or None,
            "country": country_str or None,
            "language": raw.get("language"),
        }

    # ------------------------------------------------------------------
    # 3. Deduplicate
    # ------------------------------------------------------------------
    @staticmethod
    def _word_overlap_ratio(a: str, b: str) -> float:
        """Jaccard similarity on word sets (lowercase)."""
        words_a = set(a.lower().split())
        words_b = set(b.lower().split())
        if not words_a or not words_b:
            return 0.0
        return len(words_a & words_b) / len(words_a | words_b)

    def deduplicate(self, articles: list[dict]) -> list[dict]:
        """
        Remove exact duplicates (by article_id) and near-duplicates
        where title word-overlap ratio exceeds 85%.
        """
        seen_ids: set[str] = set()
        seen_titles: list[str] = []
        unique: list[dict] = []

        for article in articles:
            article_id = article.get("article_id", "")
            title = article.get("title", "")

            if article_id in seen_ids:
                continue

            if any(
                self._word_overlap_ratio(title, t) > 0.85 for t in seen_titles
            ):
                continue

            seen_ids.add(article_id)
            seen_titles.append(title)
            unique.append(article)

        logger.info(
            "Deduplication: %d → %d articles removed %d duplicates",
            len(articles),
            len(unique),
            len(articles) - len(unique),
        )
        return unique

    # ------------------------------------------------------------------
    # 4. AI Analysis
    # ------------------------------------------------------------------
    async def analyze_with_groq(self, article: dict) -> dict:
        """
        Uses Groq LLaMA-3.3-70B to generate summary, sentiment,
        sentiment_score, insights, and keywords for a single article.
        Returns the original article dict merged with the AI analysis.
        """
        prompt = (
            "Analyze the following news article and return ONLY a valid JSON object "
            "with these exact fields — no markdown, no code fences, no explanation:\n\n"
            "{\n"
            '  "summary": "<2-3 sentence summary>",\n'
            '  "sentiment": "<positive|negative|neutral>",\n'
            '  "sentiment_score": <float -1.0 to 1.0>,\n'
            '  "insights": ["<insight 1>", "<insight 2>", "<insight 3>"],\n'
            '  "keywords": ["<kw1>", "<kw2>", "<kw3>", "<kw4>", "<kw5>"]\n'
            "}\n\n"
            f"Title: {article.get('title', '')}\n"
            f"Content: {article.get('content', '')[:2000]}"
        )

        _default_analysis = {
            "summary": "",
            "sentiment": "neutral",
            "sentiment_score": 0.0,
            "insights": [],
            "keywords": [],
        }

        try:
            response = await self.llm.ainvoke(prompt)
            raw_text: str = response.content.strip()

            # Strip markdown code fences if the model includes them
            raw_text = _CODE_FENCE_RE.sub("", raw_text).strip()

            analysis: dict = json.loads(raw_text)
            # Validate required keys exist
            for key in ("summary", "sentiment", "sentiment_score", "insights", "keywords"):
                if key not in analysis:
                    analysis[key] = _default_analysis[key]

            return {**article, **analysis}

        except json.JSONDecodeError:
            logger.warning(
                "JSON parse failed for '%s' — using defaults",
                article.get("title", "")[:60],
            )
        except Exception as exc:
            logger.error("Groq analysis error: %s", exc)

        return {**article, **_default_analysis}

    # ------------------------------------------------------------------
    # 5. Orchestrator
    # ------------------------------------------------------------------
    async def run_pipeline(
        self,
        query: str,
        category: str | None = None,
        max_articles: int = 100,
    ) -> dict:
        """
        Full ETL: fetch → clean → deduplicate → AI analyse → upsert to Supabase.
        Returns {"processed", "stored", "failed", "duration_seconds"}.
        """
        start = time.monotonic()
        stored = 0
        failed = 0

        logger.info("🚀 Pipeline starting | query='%s' | max=%d", query, max_articles)

        # Step 1 — Fetch
        raw = await self.fetch_articles(query, category=category)

        # Step 2 — Clean
        cleaned = [c for raw_a in raw if (c := self.clean_article(raw_a)) is not None]

        # Step 3 — Deduplicate
        cleaned = self.deduplicate(cleaned)[:max_articles]
        processed = len(cleaned)
        logger.info("Pipeline: %d articles ready for AI analysis", processed)

        # Step 4 — AI analyse in batches of 10 (concurrent)
        BATCH = 10
        analyzed: list[dict] = []
        for i in range(0, len(cleaned), BATCH):
            batch = cleaned[i : i + BATCH]
            results = await asyncio.gather(
                *[self.analyze_with_groq(a) for a in batch],
                return_exceptions=True,
            )
            for r in results:
                if isinstance(r, Exception):
                    logger.error("Batch analysis exception: %s", r)
                    failed += 1
                else:
                    analyzed.append(r)

        # Step 5 — Upsert to Supabase
        for article in analyzed:
            try:
                await upsert_article(article)
                stored += 1
            except Exception as exc:
                logger.error("Upsert failed for '%s': %s", article.get("article_id"), exc)
                failed += 1

        duration = round(time.monotonic() - start, 2)
        stats = {
            "processed": processed,
            "stored": stored,
            "failed": failed,
            "duration_seconds": duration,
        }
        logger.info("✅ Pipeline complete: %s", stats)
        return stats
