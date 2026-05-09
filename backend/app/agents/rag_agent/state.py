"""
State definition for the RAG Agent.

RAGAgentState is passed between every node in the RAG graph.
"""
from typing import Annotated

from typing_extensions import TypedDict

from langgraph.graph.message import add_messages


def _last_wins(old: str, new: str) -> str:  # noqa: ARG001
    """Reducer: last writer wins — allows parallel nodes to update current_step."""
    return new


class RAGAgentState(TypedDict):
    # ------------------------------------------------------------------ #
    # Conversation                                                         #
    # ------------------------------------------------------------------ #
    messages: Annotated[list, add_messages]  # LangGraph messages reducer

    # ------------------------------------------------------------------ #
    # Query                                                               #
    # ------------------------------------------------------------------ #
    query: str
    thread_id: str
    has_pdf: bool

    # ------------------------------------------------------------------ #
    # PDF ingestion                                                       #
    # ------------------------------------------------------------------ #
    pdf_chunks: list[dict]     # {chunk_id, text, page_num, filename, char_count}
    pdf_metadata: dict         # filename, file_path, page_count, upload_time

    # ------------------------------------------------------------------ #
    # Retrieval                                                           #
    # ------------------------------------------------------------------ #
    retrieved_chunks: list[dict]   # Vector search results with similarity scores
    web_results: list[dict]        # Tavily web search results

    # ------------------------------------------------------------------ #
    # Context + Answer                                                    #
    # ------------------------------------------------------------------ #
    merged_context: str       # Combined context with source labels
    answer: str               # Final answer
    citations: list[dict]     # [{source, text, type: "pdf"|"web"}]

    # ------------------------------------------------------------------ #
    # Control                                                             #
    # ------------------------------------------------------------------ #
    # last-writer-wins so parallel nodes (vector_retriever + web_search_rag)
    # can both update current_step in the same super-step.
    current_step: Annotated[str, _last_wins]
    error: str | None
    human_action: str | None
    clarify_mode: str          # "hybrid" | "pdf_only" | "web_only"
