"""
State definition for the News Intelligence Agent.

NewsAgentState is passed between every node in the LangGraph graph.
LangGraph merges partial dicts returned by nodes into this shared state.
"""
from __future__ import annotations

from typing import Annotated, Any

from typing_extensions import TypedDict

from langgraph.graph.message import add_messages


class NewsAgentState(TypedDict):
    # ------------------------------------------------------------------ #
    # Conversation                                                         #
    # ------------------------------------------------------------------ #
    messages: Annotated[list, add_messages]  # LangGraph messages reducer

    # ------------------------------------------------------------------ #
    # Query planning                                                       #
    # ------------------------------------------------------------------ #
    query: str               # Original user query
    sub_queries: list[str]   # Broken down by query_planner_node

    # ------------------------------------------------------------------ #
    # Search results                                                       #
    # ------------------------------------------------------------------ #
    web_results: list[dict]        # Raw Tavily search results
    newsdata_articles: list[dict]  # Articles from NewsData.io
    validated_sources: list[dict]  # After source_validator_node scoring

    # ------------------------------------------------------------------ #
    # AI-generated outputs                                                 #
    # ------------------------------------------------------------------ #
    summary: str              # Executive summary
    insights: list[str]       # Key insight strings
    sentiment: str            # "positive" | "negative" | "neutral"
    sentiment_score: float    # -1.0 → 1.0
    confidence_scores: dict   # {insight_text: float} per-insight confidence
    bias_analysis: dict       # Output of bias_detector subgraph
    trend_data: list[dict]    # Output of trend_timeline_node

    # ------------------------------------------------------------------ #
    # Artefacts                                                            #
    # ------------------------------------------------------------------ #
    pdf_path: str | None  # File path of generated PDF report

    # ------------------------------------------------------------------ #
    # Session / control                                                    #
    # ------------------------------------------------------------------ #
    thread_id: str              # LangGraph thread identifier
    current_step: str           # Broadcast to frontend for progress UI
    error: str | None           # Last error message if any
    human_action: str | None    # Action chosen by user at HITL interrupt
    session_metadata: dict      # Extra data for persistence / display
