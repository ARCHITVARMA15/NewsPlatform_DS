"""
State definition for the Broadcast Analyzer Agent.

BroadcastAgentState flows through every node of the broadcast graph:
  validate → extract_audio → transcribe → chunk → index → analyze → HITL
  └─ chat loop: rag_answer → HITL
  └─ export: pdf_export → END
"""
from typing import Annotated

from typing_extensions import TypedDict

from langgraph.graph.message import add_messages


def _last_wins(old, new):  # noqa: ARG001
    """Reducer: last writer wins — allows parallel nodes to update current_step."""
    return new


class BroadcastAgentState(TypedDict):
    # ------------------------------------------------------------------ #
    # Conversation                                                         #
    # ------------------------------------------------------------------ #
    messages: Annotated[list, add_messages]

    # ------------------------------------------------------------------ #
    # Session identity                                                     #
    # ------------------------------------------------------------------ #
    thread_id: str

    # ------------------------------------------------------------------ #
    # Input                                                               #
    # ------------------------------------------------------------------ #
    youtube_url: str | None
    uploaded_file_path: str | None

    # ------------------------------------------------------------------ #
    # Audio / Transcript                                                  #
    # ------------------------------------------------------------------ #
    audio_path: str | None           # path to extracted/converted mp3
    transcript: str | None           # full raw transcript text
    transcript_chunks: list[dict]    # [{chunk_id, text, start_char, end_char, word_count}]

    # ------------------------------------------------------------------ #
    # Video metadata                                                       #
    # ------------------------------------------------------------------ #
    video_title: str | None
    video_duration: int | None       # seconds
    channel_name: str | None

    # ------------------------------------------------------------------ #
    # Analysis outputs                                                    #
    # ------------------------------------------------------------------ #
    broadcast_summary: str | None
    key_events: list[str]
    people_mentioned: list[str]
    topics: list[str]
    sentiment: str | None
    sentiment_score: float | None

    # ------------------------------------------------------------------ #
    # RAG / Q&A                                                           #
    # ------------------------------------------------------------------ #
    retrieved_chunks: list[dict]     # FAISS search results for current query
    answer: str | None               # RAG answer to user question
    citations: list[dict]            # [{chunk_id, text, start_char}]

    # ------------------------------------------------------------------ #
    # Artefacts                                                           #
    # ------------------------------------------------------------------ #
    pdf_path: str | None

    # ------------------------------------------------------------------ #
    # Control                                                             #
    # ------------------------------------------------------------------ #
    current_step: Annotated[str | None, _last_wins]
    error: str | None
    human_action: str | None
    processing_complete: bool        # True after transcript + analysis done
    faiss_indexed: bool              # True after chunks are embedded + indexed
