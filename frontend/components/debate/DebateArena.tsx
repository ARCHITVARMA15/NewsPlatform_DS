"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Minus,
  Share2,
  Swords,
  Trophy,
  RotateCcw,
  ExternalLink,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ArgumentBubble } from "./ArgumentBubble";
import { cn } from "@/lib/utils";
import { useAppDispatch, useDebateState } from "@/store/hooks";
import {
  setTopic,
  addArgument,
  setPhase,
  setConclusion,
  setStreaming,
  setCurrentRound,
  setMaxRounds,
  setSuggestions,
  resetDebate,
} from "@/store/slices/debateSlice";
import { getAuthHeaders } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────
interface Conclusion {
  consensus_reached:  boolean;
  consensus_summary:  string | null;
  winner:             "optimist" | "skeptic" | "draw";
  key_insight:        string;
  total_rounds:       number;
}

const BASE_URL =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000")
    : "http://localhost:8000";

// ── Component ──────────────────────────────────────────────────────────────
export function DebateArena() {
  const router   = useRouter();
  const dispatch = useAppDispatch();

  // ── Redux state (persisted) ───────────────────────────────────────────
  const {
    topic:        reduxTopic,
    debateHistory,
    phase,
    conclusion,
    isStreaming,
    maxRounds,
    currentRound,
    suggestions,
  } = useDebateState();

  // ── Local state (transient UI, not persisted) ─────────────────────────
  const [topicInput,         setTopicInput]         = useState(reduxTopic || "");
  const [articleContext,     setArticleContext]     = useState("");
  const [currentSpeaker,    setCurrentSpeaker]    = useState<"optimist" | "skeptic" | null>(null);
  const [error,              setError]             = useState<string | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(suggestions.length === 0);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const abortRef  = useRef<AbortController | null>(null);

  // ── On mount: restore scroll if debate is in progress ────────────────
  useEffect(() => {
    if (phase !== "setup") {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      // Derive current speaker from last history entry
      const last = debateHistory[debateHistory.length - 1];
      if (last && phase === "debating") {
        setCurrentSpeaker(last.agent === "optimist" ? "skeptic" : "optimist");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fetch suggestions (skip if already in Redux) ──────────────────────
  useEffect(() => {
    if (suggestions.length > 0) {
      setLoadingSuggestions(false);
      return;
    }
    fetch(`${BASE_URL}/api/debate/topics/suggestions`)
      .then(r => r.json())
      .then(d => {
        dispatch(setSuggestions(d.suggestions ?? []));
        setLoadingSuggestions(false);
      })
      .catch(() => {
        dispatch(setSuggestions([]));
        setLoadingSuggestions(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-scroll ───────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [debateHistory]);

  // ── Start debate ──────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (!topicInput.trim()) return;

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    const trimmedTopic = topicInput.trim();

    // Reset history/conclusion/phase, then configure the new debate
    dispatch(resetDebate());
    dispatch(setTopic(trimmedTopic));
    dispatch(setPhase("debating"));
    dispatch(setStreaming(true));
    dispatch(setSuggestions(suggestions));

    setError(null);
    setCurrentSpeaker("optimist");

    try {
      const response = await fetch(`${BASE_URL}/api/debate/start`, {
        method:  "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          topic:           trimmedTopic,
          article_context: articleContext,
          max_rounds:      maxRounds,
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) throw new Error(`Server error: HTTP ${response.status}`);
      if (!response.body) throw new Error("Empty response body");

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = "";
      let roundCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed) continue;
          const jsonStr = trimmed.startsWith("data: ") ? trimmed.slice(6) : trimmed;
          let parsed: { event: string; data: Record<string, unknown> };
          try { parsed = JSON.parse(jsonStr); } catch { continue; }

          const { event, data } = parsed;

          if (event === "argument") {
            const agent = data.agent as "optimist" | "skeptic";
            roundCount = data.round as number;
            dispatch(addArgument({
              id:        `${agent}-${roundCount}-${Date.now()}`,
              agent,
              argument:  data.argument as string,
              round:     roundCount,
              timestamp: new Date().toISOString(),
            }));
            dispatch(setCurrentRound(Math.ceil((roundCount + 1) / 2)));
            setCurrentSpeaker(agent === "optimist" ? "skeptic" : "optimist");
          }

          if (event === "conclusion") {
            dispatch(setConclusion({
              consensus_reached: data.consensus_reached as boolean,
              consensus_summary: data.consensus_summary as string | null,
              winner:            data.winner as "optimist" | "skeptic" | "draw",
              key_insight:       data.key_insight as string,
              total_rounds:      data.total_rounds as number,
            }));
            dispatch(setPhase("concluded"));
          }

          if (event === "done") {
            dispatch(setStreaming(false));
            setCurrentSpeaker(null);
          }

          if (event === "error") {
            setError((data.message as string) ?? "Debate failed");
            dispatch(setStreaming(false));
            dispatch(setPhase("setup"));
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        setError(err.message);
        dispatch(setPhase("setup"));
      }
    } finally {
      dispatch(setStreaming(false));
    }
  }, [topicInput, articleContext, maxRounds, suggestions, dispatch]);

  // ── Reset ─────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    dispatch(resetDebate());
    setCurrentSpeaker(null);
    setError(null);
    setTopicInput("");
  }, [dispatch]);

  // ── Share ─────────────────────────────────────────────────────────────
  const handleShare = useCallback(() => {
    const lines = [
      `🥊 AI Debate Arena — "${reduxTopic}"`,
      `${"─".repeat(40)}`,
      ...debateHistory.map(e =>
        `[${e.agent.toUpperCase()} R${e.round + 1}]: ${e.argument}`
      ),
    ];
    const conc = conclusion as Conclusion | null;
    if (conc) {
      lines.push(`${"─".repeat(40)}`);
      lines.push(`🏆 Winner: ${conc.winner.toUpperCase()}`);
      if (conc.key_insight) lines.push(`💡 Key insight: ${conc.key_insight}`);
    }
    navigator.clipboard.writeText(lines.join("\n\n"));
  }, [reduxTopic, debateHistory, conclusion]);

  // Optimist and skeptic columns from history
  const optimistArgs = debateHistory.filter(e => e.agent === "optimist");
  const skepticArgs  = debateHistory.filter(e => e.agent === "skeptic");
  const conc         = conclusion as Conclusion | null;
  const totalRounds  = conc?.total_rounds ?? maxRounds;
  const displayRound = currentRound || Math.ceil(debateHistory.length / 2);

  // =========================================================================
  // RENDER
  // =========================================================================
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AnimatePresence mode="wait">

        {/* ── SETUP ─────────────────────────────────────────────────────── */}
        {phase === "setup" && (
          <motion.div
            key="setup"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="flex-1 overflow-auto flex items-center justify-center p-8"
          >
            <div className="max-w-2xl w-full space-y-7">
              {/* Heading */}
              <div className="text-center space-y-2">
                <div className="size-16 bg-violet-600/10 rounded-2xl flex items-center justify-center mx-auto border border-violet-200">
                  <Swords className="size-8 text-violet-600" />
                </div>
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">AI Debate Arena</h1>
                <p className="text-slate-500">Two AI analysts debate any news story in real time</p>
              </div>

              {/* Persona preview cards */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-1.5">
                  <p className="font-bold text-emerald-800 text-sm">🎯 Optimist Analyst</p>
                  <p className="text-xs text-emerald-700 leading-relaxed">
                    Finds opportunities, positive implications, and constructive angles. Intellectually honest — reframes concerns as growth.
                  </p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-1.5">
                  <p className="font-bold text-red-800 text-sm">🔍 Skeptic Analyst</p>
                  <p className="text-xs text-red-700 leading-relaxed">
                    Challenges assumptions, identifies risks, demands evidence. Rigorous — not cynical. Exposes second-order consequences.
                  </p>
                </div>
              </div>

              {/* Topic input */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Debate topic</label>
                <textarea
                  value={topicInput}
                  onChange={e => setTopicInput(e.target.value)}
                  placeholder="Enter a news headline or topic to debate…"
                  rows={3}
                  className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-400 transition-all"
                />
              </div>

              {/* Suggestions */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {loadingSuggestions ? "Loading suggestions…" : "Suggested topics"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {loadingSuggestions
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="h-7 w-40 bg-slate-100 rounded-full animate-pulse" />
                      ))
                    : suggestions.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => setTopicInput(s)}
                          className="text-xs px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-600 hover:border-violet-400 hover:text-violet-700 hover:bg-violet-50 transition-all"
                        >
                          {s.length > 60 ? s.slice(0, 58) + "…" : s}
                        </button>
                      ))
                  }
                </div>
              </div>

              {/* Rounds selector */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Debate rounds</label>
                <div className="flex gap-2">
                  {[2, 3, 4, 5, 6].map(n => (
                    <button
                      key={n}
                      onClick={() => dispatch(setMaxRounds(n))}
                      className={cn(
                        "size-10 rounded-xl text-sm font-bold transition-all border",
                        maxRounds === n
                          ? "bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-600/20"
                          : "bg-white text-slate-500 border-slate-200 hover:border-violet-300 hover:text-violet-600"
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
                  <AlertCircle className="size-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-600">{error}</p>
                </div>
              )}

              {/* CTA */}
              <button
                onClick={handleStart}
                disabled={!topicInput.trim()}
                className="w-full flex items-center justify-center gap-2.5 py-3.5 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-sm font-bold rounded-2xl transition-all active:scale-[0.98] shadow-lg shadow-violet-600/25"
              >
                <Swords className="size-4" />
                Start Debate
              </button>
            </div>
          </motion.div>
        )}

        {/* ── DEBATING + CONCLUDED ───────────────────────────────────────── */}
        {(phase === "debating" || phase === "concluded") && (
          <motion.div
            key="debating"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col overflow-hidden"
          >
            {/* Progress bar + round counter */}
            <div className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-3 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-semibold text-slate-700 truncate max-w-sm">"{reduxTopic}"</span>
                <span className="font-medium flex-shrink-0 ml-2">
                  Round {Math.min(displayRound, totalRounds)} of {totalRounds}
                </span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-violet-500 rounded-full"
                  animate={{ width: `${(Math.min(displayRound, totalRounds) / totalRounds) * 100}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>
            </div>

            {/* Two-column debate */}
            <div className="flex-1 overflow-auto">
              <div className="max-w-5xl mx-auto px-4 pt-4 pb-6">

                {/* Column headers */}
                <div className="grid grid-cols-2 gap-6 mb-4">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "size-2.5 rounded-full flex-shrink-0",
                      currentSpeaker === "optimist" && isStreaming
                        ? "bg-emerald-500 animate-ping"
                        : "bg-emerald-400"
                    )} />
                    <span className="text-sm font-bold text-emerald-700">Optimist Analyst</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "size-2.5 rounded-full flex-shrink-0",
                      currentSpeaker === "skeptic" && isStreaming
                        ? "bg-red-500 animate-ping"
                        : "bg-red-400"
                    )} />
                    <span className="text-sm font-bold text-red-600">Skeptic Analyst</span>
                  </div>
                </div>

                {/* Arguments grid */}
                <div className="grid grid-cols-2 gap-6">
                  {/* Optimist column */}
                  <div className="space-y-4">
                    {optimistArgs.map((entry, i) => {
                      const globalIdx = debateHistory.findIndex(
                        e => e.agent === "optimist" && e.round === entry.round
                      );
                      return (
                        <ArgumentBubble
                          key={`opt-${entry.round}`}
                          agent="optimist"
                          argument={entry.argument}
                          round={entry.round}
                          isStreaming={isStreaming && globalIdx === debateHistory.length - 1}
                        />
                      );
                    })}
                    {/* "Currently typing" placeholder */}
                    {currentSpeaker === "optimist" && isStreaming && (
                      <div className="flex items-center gap-1.5 px-3">
                        <div className="size-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="size-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="size-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    )}
                  </div>

                  {/* Skeptic column */}
                  <div className="space-y-4">
                    {skepticArgs.map((entry) => {
                      const globalIdx = debateHistory.findIndex(
                        e => e.agent === "skeptic" && e.round === entry.round
                      );
                      return (
                        <ArgumentBubble
                          key={`skp-${entry.round}`}
                          agent="skeptic"
                          argument={entry.argument}
                          round={entry.round}
                          isStreaming={isStreaming && globalIdx === debateHistory.length - 1}
                        />
                      );
                    })}
                    {currentSpeaker === "skeptic" && isStreaming && (
                      <div className="flex items-center gap-1.5 px-3">
                        <div className="size-1.5 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="size-1.5 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="size-1.5 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    )}
                  </div>
                </div>

                {/* ── VERDICT SECTION ──────────────────────────────────── */}
                <AnimatePresence>
                  {phase === "concluded" && conc && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      className="mt-8 space-y-4"
                    >
                      {/* Divider */}
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-px bg-slate-200" />
                        <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Verdict</span>
                        <div className="flex-1 h-px bg-slate-200" />
                      </div>

                      {/* Winner card */}
                      <div className={cn(
                        "rounded-2xl p-5 border-2 space-y-4",
                        conc.winner === "optimist"
                          ? "bg-emerald-50 border-emerald-300"
                          : conc.winner === "skeptic"
                          ? "bg-red-50 border-red-300"
                          : "bg-slate-50 border-slate-300"
                      )}>
                        {/* Winner badge */}
                        <div className="flex items-center gap-3">
                          {conc.winner === "draw"
                            ? <Minus className="size-5 text-slate-500" />
                            : conc.winner === "optimist"
                            ? <Trophy className="size-5 text-emerald-600" />
                            : <Trophy className="size-5 text-red-500" />
                          }
                          <span className={cn(
                            "text-lg font-bold",
                            conc.winner === "optimist" ? "text-emerald-700"
                            : conc.winner === "skeptic" ? "text-red-600"
                            : "text-slate-600"
                          )}>
                            {conc.winner === "draw"
                              ? "Draw — Both sides argued effectively"
                              : conc.winner === "optimist"
                              ? "Optimist Wins"
                              : "Skeptic Wins"
                            }
                          </span>
                          <span className="ml-auto text-xs text-slate-400 font-medium">
                            {conc.total_rounds} rounds debated
                          </span>
                        </div>

                        {/* Consensus box */}
                        {conc.consensus_reached && conc.consensus_summary && (
                          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
                            <CheckCircle2 className="size-4 text-blue-500 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-bold text-blue-700 mb-0.5">Consensus reached</p>
                              <p className="text-sm text-blue-800 leading-relaxed">{conc.consensus_summary}</p>
                            </div>
                          </div>
                        )}

                        {/* Key insight */}
                        {conc.key_insight && (
                          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                            <p className="text-xs font-bold text-amber-700 mb-0.5">💡 Key Insight</p>
                            <p className="text-sm text-amber-800 leading-relaxed">{conc.key_insight}</p>
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-3 flex-wrap">
                        <button
                          onClick={handleReset}
                          className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl transition-all shadow-sm shadow-violet-600/20"
                        >
                          <RotateCcw className="size-4" />
                          Debate Another Topic
                        </button>
                        <button
                          onClick={handleShare}
                          className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-xl transition-all"
                        >
                          <Share2 className="size-4" />
                          Share This Debate
                        </button>
                        <button
                          onClick={() => router.push("/agent")}
                          className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-xl transition-all"
                        >
                          <ExternalLink className="size-4" />
                          Analyze Article Instead
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div ref={bottomRef} />
              </div>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
