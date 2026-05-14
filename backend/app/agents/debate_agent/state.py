"""
State definition for the Multi-Agent Debate System.

DebateAgentState flows through every node of the debate graph:
  initializer → optimist ⟷ skeptic (N rounds)
               └─ consensus_detector → END

Two LLM personas argue opposing viewpoints on a news topic until
max_rounds is reached, then a third LLM call synthesises the outcome.
"""
from __future__ import annotations

from typing import Annotated

from langgraph.graph.message import add_messages
from typing_extensions import TypedDict


class DebateAgentState(TypedDict):
    # ------------------------------------------------------------------ #
    # Conversation                                                         #
    # ------------------------------------------------------------------ #
    messages: Annotated[list, add_messages]

    # ------------------------------------------------------------------ #
    # Session identity                                                     #
    # ------------------------------------------------------------------ #
    thread_id: str

    # ------------------------------------------------------------------ #
    # Debate input                                                         #
    # ------------------------------------------------------------------ #
    topic: str               # The news headline / story being debated
    article_context: str     # Full article text or summary as context

    # ------------------------------------------------------------------ #
    # Debate history                                                       #
    # ------------------------------------------------------------------ #
    debate_history: list[dict]   # [{agent, argument, round}]
    current_round: int           # 0-indexed; incremented after each skeptic turn
    max_rounds: int              # Default 4 — configurable per request

    # ------------------------------------------------------------------ #
    # Persona control                                                      #
    # ------------------------------------------------------------------ #
    optimist_persona: str    # System prompt injected into optimist_node
    skeptic_persona: str     # System prompt injected into skeptic_node
    current_speaker: str     # "optimist" | "skeptic"

    # ------------------------------------------------------------------ #
    # Outcome                                                              #
    # ------------------------------------------------------------------ #
    consensus_reached: bool
    consensus_summary: str | None   # 2-sentence synthesis (if consensus)
    winner: str | None              # "optimist" | "skeptic" | "draw"

    # ------------------------------------------------------------------ #
    # Control                                                              #
    # ------------------------------------------------------------------ #
    current_step: str
    error: str | None
