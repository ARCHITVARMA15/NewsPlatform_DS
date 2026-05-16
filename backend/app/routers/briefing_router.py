"""
AI News Briefing router — /api/briefing/*

Pipeline:
  fetch_top_articles → generate_briefing_script (Groq)
                     → generate_voice (ElevenLabs)
                     → upload_audio_to_supabase (Storage bucket "briefings")
                     → generate_did_video (D-ID, optional)
                     → return BriefingResponse

SETUP REQUIREMENTS (one-time manual steps):
  1. Create a Supabase Storage bucket named "briefings" and set it to public:
       Supabase Dashboard → Storage → New bucket → Name: briefings → Public: ✅
  2. Create the briefings table via Supabase SQL Editor:
       CREATE TABLE IF NOT EXISTS briefings (
           id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
           thread_id   text        UNIQUE NOT NULL,
           script      text,
           audio_url   text,
           video_url   text,
           created_at  timestamptz DEFAULT now()
       );

D-ID BASIC AUTH NOTE:
  DID_API_KEY must be the Base64-encoded string of "your@email.com:your_did_api_key".
  Generate it with: python -c "import base64; print(base64.b64encode(b'email:key').decode())"
  Then set DID_API_KEY=<that base64 string> in your .env
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from uuid import uuid4

import httpx
from fastapi import APIRouter, HTTPException
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel

from app.config import settings
from app.database.supabase_client import get_articles, supabase

logger = logging.getLogger("datastraw.router.briefing")

router = APIRouter(prefix="/api/briefing", tags=["Briefing"])

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class BriefingRequest(BaseModel):
    top_n: int = 5
    voice_id: str = "Rachel"
    anchor_image_url: str | None = None


class BriefingResponse(BaseModel):
    script: str
    audio_url: str
    video_url: str | None
    thread_id: str
    created_at: str


# ---------------------------------------------------------------------------
# Helper 1 — fetch top articles from Supabase
# ---------------------------------------------------------------------------
async def fetch_top_articles(top_n: int) -> list[dict]:
    """
    Fetches the most recent articles from Supabase.
    Falls back to the description field if summary is empty.
    """
    articles = await get_articles(limit=top_n)
    result = []
    for a in articles:
        result.append({
            "title":       a.get("title", "Untitled"),
            "summary":     a.get("summary") or a.get("description", ""),
            "sentiment":   a.get("sentiment", "neutral"),
            "source_name": a.get("source_name", ""),
        })
    return result


# ---------------------------------------------------------------------------
# Helper 2 — generate briefing script with Groq
# ---------------------------------------------------------------------------
async def generate_briefing_script(articles: list[dict]) -> str:
    """
    Uses Groq LLaMA-3.3-70b to write a 30-second broadcast-style news script.
    Returns plain spoken text — no markdown, no stage directions.
    """
    llm = ChatGroq(
        model="llama-3.3-70b-versatile",
        api_key=settings.groq_api_key,
    )

    stories = "\n".join(
        f"{i+1}. {a['title']} — {a['summary']}"
        for i, a in enumerate(articles)
        if a["title"] or a["summary"]
    )

    messages = [
        SystemMessage(content=(
            "You are a professional TV news anchor. Write a natural, engaging "
            "30-second news briefing script (max 80 words) covering the provided "
            "top stories. Use broadcast language. No stage directions. No markdown. "
            "Just the spoken words."
        )),
        HumanMessage(content=f"Top stories:\n{stories}"),
    ]

    response = await llm.ainvoke(messages)
    return response.content.strip()


# ---------------------------------------------------------------------------
# Helper 3 — generate voice with ElevenLabs (sync wrapped in executor)
# ---------------------------------------------------------------------------
_VOICE_IDS: dict[str, str] = {
    "Rachel":  "21m00Tcm4TlvDq8ikWAM",
    "Adam":    "pNInz6obpgDQGcFmaJgB",
    "Bella":   "EXAVITQu4vr4xnSDxMaL",
    "Antoni":  "ErXwobaYiN019PkySvjV",
    "Elli":    "MF3mGyEYCl7XYWbV9V6O",
    "Josh":    "TxGEqnHWrfWFTfGW9XjX",
    "Sam":     "yoZ06aMxZJJ28mfd3POQ",
}


async def generate_voice(script: str, voice_id: str) -> bytes:
    """
    Calls ElevenLabs TTS (if API key set + paid plan) and falls back to
    gTTS (Google TTS, free, no key required) automatically.

    Free-tier voices: Rachel, Adam, Bella, Antoni, Elli, Josh, Sam
    Accepts both voice names (e.g. "Rachel") and raw voice IDs.
    """
    resolved_id = _VOICE_IDS.get(voice_id, voice_id)

    def _elevenlabs() -> bytes:
        from elevenlabs.client import ElevenLabs
        client = ElevenLabs(api_key=settings.elevenlabs_api_key)
        audio = client.text_to_speech.convert(
            voice_id=resolved_id,
            text=script,
            model_id="eleven_turbo_v2_5",
        )
        return b"".join(audio)

    def _gtts_fallback() -> bytes:
        import io
        from gtts import gTTS
        buf = io.BytesIO()
        gTTS(text=script, lang="en", slow=False).write_to_fp(buf)
        return buf.getvalue()

    def _sync_generate() -> bytes:
        if settings.elevenlabs_api_key:
            try:
                return _elevenlabs()
            except Exception as exc:
                logger.warning("ElevenLabs failed (%s) — falling back to gTTS", exc)
        return _gtts_fallback()

    return await asyncio.to_thread(_sync_generate)


# ---------------------------------------------------------------------------
# Helper 4 — upload audio bytes to Supabase Storage
# ---------------------------------------------------------------------------
async def upload_audio_to_supabase(audio_bytes: bytes, thread_id: str) -> str:
    """
    Uploads mp3 bytes to the 'briefings' Supabase Storage bucket.
    Returns the public URL.

    MANUAL SETUP REQUIRED:
      Create a public bucket named 'briefings' in Supabase Dashboard → Storage.
    """
    storage_path = f"audio/{thread_id}.mp3"

    def _sync_upload() -> str:
        supabase.storage.from_("briefings").upload(
            path=storage_path,
            file=audio_bytes,
            file_options={"content-type": "audio/mpeg"},
        )
        url_response = supabase.storage.from_("briefings").get_public_url(storage_path)
        return url_response

    return await asyncio.to_thread(_sync_upload)


# ---------------------------------------------------------------------------
# Helper 5 — generate D-ID talking-head video (fully optional)
# ---------------------------------------------------------------------------
_DEFAULT_ANCHOR_IMAGE = (
    "https://create-images-results.d-id.com/DefaultPresenters/Noelle_f/image.jpeg"
)


async def generate_did_video(
    audio_url: str,
    anchor_image_url: str | None = None,
) -> str | None:
    """
    Submits a D-ID /talks job and polls until done, then returns result_url.

    Returns None (never raises) if:
      - DID_API_KEY is not configured
      - D-ID API returns an error
      - Polling times out after 10 attempts

    DID_API_KEY must be Base64("your@email.com:your_did_api_key").
    Generate: python -c "import base64; print(base64.b64encode(b'email:key').decode())"
    """
    if not settings.did_api_key:
        logger.info("DID_API_KEY not set — skipping video generation")
        return None

    source_url = anchor_image_url or _DEFAULT_ANCHOR_IMAGE

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            # ── Submit job ────────────────────────────────────────────────
            create_resp = await client.post(
                "https://api.d-id.com/talks",
                headers={
                    "Authorization": f"Basic {settings.did_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "script":     {"type": "audio", "audio_url": audio_url},
                    "source_url": source_url,
                },
            )
            create_resp.raise_for_status()
            talk_id = create_resp.json().get("id")
            if not talk_id:
                logger.warning("D-ID response missing talk id")
                return None

            # ── Poll for completion (max 10 × 3 s = 30 s) ────────────────
            for attempt in range(10):
                await asyncio.sleep(3)
                poll_resp = await client.get(
                    f"https://api.d-id.com/talks/{talk_id}",
                    headers={"Authorization": f"Basic {settings.did_api_key}"},
                )
                poll_resp.raise_for_status()
                poll_data = poll_resp.json()

                status = poll_data.get("status")
                if status == "done":
                    return poll_data.get("result_url")
                if status == "error":
                    logger.warning("D-ID job %s failed: %s", talk_id, poll_data)
                    return None
                logger.debug("D-ID poll %d/10 — status=%s", attempt + 1, status)

            logger.warning("D-ID job %s timed out after 10 polls", talk_id)
            return None

    except Exception as exc:
        logger.error("D-ID video generation error: %s", exc)
        return None


# ---------------------------------------------------------------------------
# POST /generate — full briefing pipeline
# ---------------------------------------------------------------------------
@router.post(
    "/generate",
    response_model=BriefingResponse,
    summary="Generate an AI news briefing (audio + optional video)",
)
async def generate_briefing(request: BriefingRequest):
    """
    Runs the full briefing pipeline:
      1. Fetch top N articles from Supabase
      2. Generate broadcast script via Groq LLaMA-3.3-70b
      3. Convert to speech via ElevenLabs
      4. Upload mp3 to Supabase Storage bucket 'briefings'
      5. Optionally generate talking-head video via D-ID

    Expected time: 15–30 seconds total.
    Video generation adds ~20 seconds if DID_API_KEY is configured.
    """
    thread_id = str(uuid4())
    created_at = datetime.now(timezone.utc).isoformat()

    # 1 ── Fetch articles ──────────────────────────────────────────────────
    try:
        articles = await fetch_top_articles(request.top_n)
    except Exception as exc:
        logger.error("fetch_top_articles failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Failed to fetch articles: {exc}")

    if not articles:
        raise HTTPException(
            status_code=404,
            detail="No articles found in database. Run the news pipeline first.",
        )

    # 2 ── Generate script ────────────────────────────────────────────────
    try:
        script = await generate_briefing_script(articles)
    except Exception as exc:
        logger.error("generate_briefing_script failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Script generation failed: {exc}")

    # 3 ── Generate voice ─────────────────────────────────────────────────
    try:
        audio_bytes = await generate_voice(script, request.voice_id)
    except Exception as exc:
        logger.error("generate_voice failed: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Voice generation failed. Check ELEVENLABS_API_KEY and ensure the 'briefings' bucket exists.",
        )

    # 4 ── Upload audio ───────────────────────────────────────────────────
    try:
        audio_url = await upload_audio_to_supabase(audio_bytes, thread_id)
    except Exception as exc:
        logger.error("upload_audio_to_supabase failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=(
                f"Audio upload failed: {exc}. "
                "Ensure you have created a public 'briefings' bucket in Supabase Storage."
            ),
        )

    # 5 ── Generate video (optional, never crashes pipeline) ──────────────
    video_url = await generate_did_video(audio_url, request.anchor_image_url)

    # 6 ── Persist to briefings table (graceful — table may not exist yet) ─
    try:
        supabase.table("briefings").insert({
            "thread_id": thread_id,
            "script":    script,
            "audio_url": audio_url,
            "video_url": video_url,
            "created_at": created_at,
        }).execute()
    except Exception as exc:
        logger.warning("Could not save briefing to DB (table may not exist): %s", exc)

    # 7 ── Notify Slack (fire-and-forget, never blocks response) ──────────
    try:
        from app.services.slack_service import notify_daily_briefing
        await notify_daily_briefing(script, audio_url)
    except Exception as exc:
        logger.warning("Slack briefing notification failed: %s", exc)

    return BriefingResponse(
        script=script,
        audio_url=audio_url,
        video_url=video_url,
        thread_id=thread_id,
        created_at=created_at,
    )


# ---------------------------------------------------------------------------
# GET /latest — last 5 briefings
# ---------------------------------------------------------------------------
@router.get(
    "/latest",
    summary="Fetch the last 5 generated briefings",
)
async def latest_briefings():
    """
    Returns the 5 most recent briefings from the Supabase briefings table.
    Returns an empty list gracefully if the table does not exist yet.
    """
    try:
        result = (
            supabase.table("briefings")
            .select("thread_id, script, audio_url, video_url, created_at")
            .order("created_at", desc=True)
            .limit(5)
            .execute()
        )
        return result.data or []
    except Exception as exc:
        logger.warning("Could not fetch latest briefings: %s", exc)
        return []
