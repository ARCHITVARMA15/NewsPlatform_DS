"""
Supabase client and CRUD helpers.

NOTE: Supabase PostgREST does not support DDL (CREATE TABLE).
      Tables must be created once via the Supabase SQL Editor.
      Run the SQL block in TABLES_DDL_SQL below if this is a fresh project.
"""
import logging

from supabase import Client, create_client

from app.config import settings

logger = logging.getLogger("datastraw.supabase")

# ---------------------------------------------------------------------------
# Client (singleton, sync — supabase-py uses httpx under the hood)
# ---------------------------------------------------------------------------
supabase: Client = create_client(settings.supabase_url, settings.supabase_service_key)

# ---------------------------------------------------------------------------
# DDL — paste this into the Supabase SQL Editor once
# ---------------------------------------------------------------------------
TABLES_DDL_SQL = """
-- ============================================================
-- Run once in Supabase SQL Editor > New Query
-- ============================================================

CREATE TABLE IF NOT EXISTS articles (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id      text        UNIQUE NOT NULL,
    title           text,
    description     text,
    content         text,
    source_name     text,
    source_url      text,
    published_at    timestamptz,
    category        text,
    country         text,
    language        text,
    sentiment       text,
    sentiment_score float,
    summary         text,
    insights        jsonb,
    keywords        jsonb,
    created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_sessions (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id     text        UNIQUE NOT NULL,
    session_name  text,
    agent_type    text,
    created_at    timestamptz DEFAULT now(),
    updated_at    timestamptz DEFAULT now(),
    message_count int         DEFAULT 0,
    last_query    text
);

CREATE TABLE IF NOT EXISTS pdf_documents (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id   text        NOT NULL,
    filename    text,
    file_size   int,
    chunk_count int,
    created_at  timestamptz DEFAULT now()
);
"""


# ---------------------------------------------------------------------------
# Table validation (called at startup)
# ---------------------------------------------------------------------------
async def init_supabase_tables() -> None:
    """
    Validates that required Supabase tables exist by running lightweight
    SELECT queries. If any table is missing, logs the DDL SQL to create it.
    Supabase PostgREST does not support DDL — tables must be created via the
    Supabase SQL Editor (see TABLES_DDL_SQL above).
    """
    tables = ["articles", "chat_sessions", "pdf_documents"]
    missing: list[str] = []

    for table in tables:
        try:
            supabase.table(table).select("id").limit(1).execute()
            logger.info("✅ Supabase table '%s' is accessible", table)
        except Exception as exc:
            logger.error("❌ Table '%s' not accessible: %s", table, exc)
            missing.append(table)

    if missing:
        logger.warning(
            "Missing Supabase tables: %s\n"
            "Run the following SQL in Supabase SQL Editor:\n%s",
            missing,
            TABLES_DDL_SQL,
        )
    else:
        logger.info("✅ All Supabase tables verified successfully.")


# ---------------------------------------------------------------------------
# CRUD — articles
# ---------------------------------------------------------------------------
async def upsert_article(article_data: dict) -> dict:
    """Insert or update an article keyed on article_id."""
    result = (
        supabase.table("articles")
        .upsert(article_data, on_conflict="article_id")
        .execute()
    )
    return result.data[0] if result.data else {}


async def get_articles(
    limit: int = 50,
    offset: int = 0,
    category: str | None = None,
    sentiment: str | None = None,
    search: str | None = None,
) -> list:
    """Fetch articles with optional filters."""
    query = (
        supabase.table("articles")
        .select("*")
        .order("published_at", desc=True)
        .limit(limit)
        .offset(offset)
    )
    if category:
        query = query.eq("category", category)
    if sentiment:
        query = query.eq("sentiment", sentiment)
    if search:
        query = query.ilike("title", f"%{search}%")

    result = query.execute()
    return result.data or []


async def get_article_by_id(article_id: str) -> dict:
    """Fetch a single article by its stable article_id."""
    try:
        result = (
            supabase.table("articles")
            .select("*")
            .eq("article_id", article_id)
            .single()
            .execute()
        )
        return result.data or {}
    except Exception:
        return {}


# ---------------------------------------------------------------------------
# CRUD — chat sessions
# ---------------------------------------------------------------------------
async def upsert_chat_session(thread_id: str, data: dict) -> dict:
    """Insert or update a chat session keyed on thread_id."""
    payload = {"thread_id": thread_id, **data}
    result = (
        supabase.table("chat_sessions")
        .upsert(payload, on_conflict="thread_id")
        .execute()
    )
    return result.data[0] if result.data else {}


async def get_chat_sessions(agent_type: str) -> list:
    """Fetch all sessions for a given agent type, newest first."""
    result = (
        supabase.table("chat_sessions")
        .select("*")
        .eq("agent_type", agent_type)
        .order("updated_at", desc=True)
        .execute()
    )
    return result.data or []
