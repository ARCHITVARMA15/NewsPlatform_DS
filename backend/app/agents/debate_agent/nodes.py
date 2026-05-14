"""
LangGraph node functions for the Multi-Agent Debate System.

Each node receives the full DebateAgentState and returns a partial dict
that LangGraph merges back into the shared state.

Flow:
  initializer → optimist → skeptic → [loop or consensus_detector] → END
"""
from __future__ import annotations

import json
import logging
import re

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_groq import ChatGroq

from app.agents.debate_agent.state import DebateAgentState
from app.config import settings

logger = logging.getLogger("datastraw.debate.nodes")

# ---------------------------------------------------------------------------
# Shared LLM instance
# ---------------------------------------------------------------------------
llm = ChatGroq(model="llama-3.3-70b-versatile", api_key=settings.groq_api_key)

# Pre-compiled code-fence stripper (for JSON extraction)
_CODE_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


def _strip_fences(text: str) -> str:
    return _CODE_FENCE_RE.sub("", text).strip()


# ---------------------------------------------------------------------------
# Persona constants (injected as system prompts)
# ---------------------------------------------------------------------------
OPTIMIST_PERSONA = """You are the Optimist Analyst in a structured news debate. \
Your role is to find genuine opportunities, positive implications, and constructive \
angles in news stories. You are intellectually honest — you acknowledge real concerns \
but reframe them as opportunities. You speak in first person, confidently, in 3-4 \
sentences maximum. Never start with "I agree". \
Always directly respond to your opponent's last point."""

SKEPTIC_PERSONA = """You are the Skeptic Analyst in a structured news debate. \
Your role is to challenge assumptions, identify risks, question narratives, and \
stress-test optimistic claims. You are not cynical — you are rigorous. You demand \
evidence and highlight second-order consequences. Speak in first person, 3-4 sentences \
maximum. Never start with "I disagree". \
Always directly respond to your opponent's last point."""


# ---------------------------------------------------------------------------
# Node 1 — debate_initializer_node
# ---------------------------------------------------------------------------
async def debate_initializer_node(state: DebateAgentState) -> dict:
    """
    Validates the topic and frames it as a formal debate proposition.
    Seeds the state with personas and round counters.
    """
    topic = state.get("topic", "").strip()
    if not topic:
        return {"error": "Topic cannot be empty.", "current_step": "error"}

    framing_response = await llm.ainvoke([
        HumanMessage(content=(
            f"Frame this news topic as a single debate proposition sentence "
            f"(no preamble, no quotes, just the sentence): {topic}"
        )),
    ])
    framed_topic = framing_response.content.strip()
    logger.info("Debate initialised: %s", framed_topic)

    return {
        "topic":            framed_topic,
        "current_round":    0,
        "current_speaker":  "optimist",
        "debate_history":   [],
        "consensus_reached": False,
        "consensus_summary": None,
        "winner":            None,
        "optimist_persona":  OPTIMIST_PERSONA,
        "skeptic_persona":   SKEPTIC_PERSONA,
        "current_step":      "Initializing debate",
        "error":             None,
    }


# ---------------------------------------------------------------------------
# Node 2 — optimist_node
# ---------------------------------------------------------------------------
async def optimist_node(state: DebateAgentState) -> dict:
    """
    Generates the Optimist's argument for the current round.
    Round 0: opening statement on the topic.
    Round > 0: direct rebuttal of the Skeptic's last point.
    """
    topic           = state["topic"]
    article_context = state.get("article_context", "")
    debate_history  = list(state.get("debate_history", []))
    current_round   = state.get("current_round", 0)

    if current_round == 0 or not debate_history:
        user_prompt = (
            f"Opening argument.\n"
            f"Debate topic: {topic}\n"
            f"Background context: {article_context or 'No additional context provided.'}"
        )
    else:
        # Find the most recent skeptic argument
        skeptic_args = [e for e in debate_history if e["agent"] == "skeptic"]
        last_skeptic = skeptic_args[-1]["argument"] if skeptic_args else ""
        user_prompt = (
            f"Debate topic: {topic}\n"
            f"Your opponent (Skeptic) just said:\n\"{last_skeptic}\"\n\n"
            f"Respond directly and make your strongest constructive point."
        )

    response = await llm.ainvoke([
        SystemMessage(content=state.get("optimist_persona", OPTIMIST_PERSONA)),
        HumanMessage(content=user_prompt),
    ])
    argument = response.content.strip()

    new_entry = {"agent": "optimist", "argument": argument, "round": current_round}
    updated_history = debate_history + [new_entry]

    logger.debug("Optimist round %d: %s…", current_round, argument[:60])

    return {
        "debate_history":  updated_history,
        "current_speaker": "skeptic",
        "current_step":    f"Optimist — Round {current_round + 1}",
    }


# ---------------------------------------------------------------------------
# Node 3 — skeptic_node
# ---------------------------------------------------------------------------
async def skeptic_node(state: DebateAgentState) -> dict:
    """
    Generates the Skeptic's argument for the current round.
    Always directly responds to the Optimist's last point.
    Increments current_round after speaking.
    """
    topic           = state["topic"]
    article_context = state.get("article_context", "")
    debate_history  = list(state.get("debate_history", []))
    current_round   = state.get("current_round", 0)

    # Find the most recent optimist argument
    optimist_args = [e for e in debate_history if e["agent"] == "optimist"]
    if optimist_args:
        last_optimist = optimist_args[-1]["argument"]
        user_prompt = (
            f"Debate topic: {topic}\n"
            f"Your opponent (Optimist) just said:\n\"{last_optimist}\"\n\n"
            f"Challenge this claim rigorously. Identify the risks and hidden assumptions."
        )
    else:
        # Fallback if optimist hasn't spoken yet
        user_prompt = (
            f"Opening skeptical argument.\n"
            f"Debate topic: {topic}\n"
            f"Background context: {article_context or 'No additional context provided.'}"
        )

    response = await llm.ainvoke([
        SystemMessage(content=state.get("skeptic_persona", SKEPTIC_PERSONA)),
        HumanMessage(content=user_prompt),
    ])
    argument = response.content.strip()

    new_round   = current_round + 1
    new_entry   = {"agent": "skeptic", "argument": argument, "round": current_round}
    updated_history = debate_history + [new_entry]

    logger.debug("Skeptic round %d: %s…", current_round, argument[:60])

    return {
        "debate_history":  updated_history,
        "current_speaker": "optimist",
        "current_round":   new_round,
        "current_step":    f"Skeptic — Round {current_round + 1}",
    }


# ---------------------------------------------------------------------------
# Node 4 — consensus_detector_node
# ---------------------------------------------------------------------------
async def consensus_detector_node(state: DebateAgentState) -> dict:
    """
    Analyses the full debate history and synthesises an outcome:
    - Whether consensus was reached
    - Who argued more effectively (winner)
    - A single key insight from the debate
    """
    debate_history = state.get("debate_history", [])
    topic          = state["topic"]

    formatted = "\n\n".join(
        f"[{e['agent'].upper()} — Round {e['round'] + 1}]: {e['argument']}"
        for e in debate_history
    )

    prompt = (
        f"Analyze this structured news debate on the topic: \"{topic}\"\n\n"
        f"{formatted}\n\n"
        "Return ONLY valid JSON (no markdown, no preamble) with exactly these keys:\n"
        "{\n"
        '  "consensus_reached": <true|false>,\n'
        '  "consensus_summary": "<2-sentence synthesis if consensus, null if not>",\n'
        '  "winner": "<optimist|skeptic|draw>",\n'
        '  "key_insight": "<the single most important takeaway from this debate>"\n'
        "}"
    )

    response = await llm.ainvoke([HumanMessage(content=prompt)])
    raw = _strip_fences(response.content.strip())

    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("consensus_detector: JSON parse failed, using fallback. Raw: %s", raw[:200])
        result = {
            "consensus_reached": False,
            "consensus_summary": None,
            "winner": "draw",
            "key_insight": "The debate raised important points from both perspectives.",
        }

    logger.info(
        "Debate concluded — winner=%s consensus=%s",
        result.get("winner"), result.get("consensus_reached")
    )

    return {
        "consensus_reached": bool(result.get("consensus_reached", False)),
        "consensus_summary": result.get("consensus_summary"),
        "winner":            result.get("winner", "draw"),
        "current_step":      "Debate concluded",
        # Store key_insight in consensus_summary if no consensus
        **(
            {}
            if result.get("consensus_summary")
            else {"consensus_summary": result.get("key_insight")}
        ),
    }


# ---------------------------------------------------------------------------
# Routing function (used as conditional edge from skeptic_node)
# ---------------------------------------------------------------------------
def should_continue_debate(state: DebateAgentState) -> str:
    """
    Decides whether the debate continues or moves to consensus detection.

    Called after every skeptic_node execution.
    current_round is already incremented inside skeptic_node.
    """
    current_round    = state.get("current_round", 0)
    max_rounds       = state.get("max_rounds", 4)
    consensus_reached = state.get("consensus_reached", False)
    current_speaker  = state.get("current_speaker", "optimist")

    if current_round >= max_rounds:
        logger.debug("Routing → consensus_detector (max_rounds=%d reached)", max_rounds)
        return "consensus_detector"

    if consensus_reached:
        logger.debug("Routing → consensus_detector (early consensus)")
        return "consensus_detector"

    if current_speaker == "optimist":
        logger.debug("Routing → optimist (round %d)", current_round)
        return "optimist"

    if current_speaker == "skeptic":
        logger.debug("Routing → skeptic (unexpected — current_speaker=skeptic post-skeptic-node)")
        return "skeptic"

    return "consensus_detector"
