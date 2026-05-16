"""
LangGraph graph definition for the Multi-Agent Debate System.

Graph structure:
  START → initializer → optimist → skeptic
                                    ↓ (conditional)
                          ┌────────────────────┐
                          │ should_continue_debate │
                          └────────────────────┘
                               ↓         ↓
                            optimist  consensus_detector → END

No checkpointer — debates are ephemeral per request.
Thread ID is passed in config solely for LangSmith tracing.
"""
from __future__ import annotations

import json
import logging

from langgraph.graph import END, START, StateGraph

from app.agents.debate_agent.nodes import (
    consensus_detector_node,
    debate_initializer_node,
    optimist_node,
    should_continue_debate,
    skeptic_node,
)
from app.agents.debate_agent.state import DebateAgentState

logger = logging.getLogger("datastraw.debate.graph")


# ---------------------------------------------------------------------------
# SSE formatter
# ---------------------------------------------------------------------------
def _sse(event: str, data: dict) -> str:
    return f"data: {json.dumps({'event': event, 'data': data})}\n\n"


# ---------------------------------------------------------------------------
# Graph construction (compiled once at module load)
# ---------------------------------------------------------------------------
_builder = StateGraph(DebateAgentState)

_builder.add_node("initializer",        debate_initializer_node)
_builder.add_node("optimist",           optimist_node)
_builder.add_node("skeptic",            skeptic_node)
_builder.add_node("consensus_detector", consensus_detector_node)

# Linear edges
_builder.add_edge(START,         "initializer")
_builder.add_edge("initializer", "optimist")
_builder.add_edge("optimist",    "skeptic")

# Conditional routing from skeptic
_builder.add_conditional_edges(
    "skeptic",
    should_continue_debate,
    {
        "optimist":           "optimist",
        "skeptic":            "skeptic",      # defensive — shouldn't normally trigger
        "consensus_detector": "consensus_detector",
    },
)

_builder.add_edge("consensus_detector", END)

# Compile without checkpointer (debates are fully stateless per request)
debate_graph = _builder.compile()


# ---------------------------------------------------------------------------
# SSE streaming generator
# ---------------------------------------------------------------------------
async def stream_debate(
    topic:           str,
    article_context: str  = "",
    max_rounds:      int  = 4,
    thread_id:       str  = "debate-default",
) -> str:
    """
    Async generator that runs the debate graph and yields SSE-formatted strings.

    SSE events emitted:
      argument    — after each optimist/skeptic node completes
      conclusion  — after consensus_detector completes
      done        — signals stream end
      error       — if an exception occurs
    """
    config = {
        "configurable": {"thread_id": thread_id},
        "recursion_limit": 50,
    }

    input_data: dict = {
        "messages":        [],
        "thread_id":       thread_id,
        "topic":           topic,
        "article_context": article_context,
        "max_rounds":      max_rounds,
        "debate_history":  [],
        "current_round":   0,
        "current_speaker": "optimist",
        "optimist_persona": "",
        "skeptic_persona":  "",
        "consensus_reached": False,
        "consensus_summary": None,
        "winner":            None,
        "current_step":     "starting",
        "error":             None,
    }

    try:
        async for event in debate_graph.astream_events(
            input_data, config=config, version="v2"
        ):
            ev_type:   str = event.get("event", "")
            node_name: str = (
                event.get("metadata", {}).get("langgraph_node", "")
                or event.get("name", "")
            )

            if ev_type != "on_chain_end":
                continue

            output = event.get("data", {}).get("output", {})
            if not isinstance(output, dict):
                continue

            # ── Optimist argument ─────────────────────────────────────
            if node_name == "optimist":
                history = output.get("debate_history", [])
                last    = next((e for e in reversed(history) if e["agent"] == "optimist"), None)
                if last:
                    yield _sse("argument", {
                        "agent":    "optimist",
                        "argument": last["argument"],
                        "round":    last["round"],
                        "persona":  "Optimist Analyst",
                    })

            # ── Skeptic argument ──────────────────────────────────────
            elif node_name == "skeptic":
                history = output.get("debate_history", [])
                last    = next((e for e in reversed(history) if e["agent"] == "skeptic"), None)
                if last:
                    yield _sse("argument", {
                        "agent":    "skeptic",
                        "argument": last["argument"],
                        "round":    last["round"],
                        "persona":  "Skeptic Analyst",
                    })

            # ── Consensus / conclusion ────────────────────────────────
            elif node_name == "consensus_detector":
                # total_rounds = current_round stored in the *graph* state, not
                # in the output dict — read from output safely
                total_rounds = output.get("current_round", max_rounds)
                yield _sse("conclusion", {
                    "consensus_reached": output.get("consensus_reached", False),
                    "consensus_summary": output.get("consensus_summary"),
                    "winner":            output.get("winner", "draw"),
                    "key_insight":       output.get("consensus_summary", ""),
                    "total_rounds":      total_rounds,
                })

        yield _sse("done", {})

    except Exception as exc:
        logger.error("stream_debate error thread=%s: %s", thread_id, exc)
        yield _sse("error", {"message": str(exc)})
