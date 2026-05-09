"use client";

import { motion } from "framer-motion";
import { Minus, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { InsightCard } from "./InsightCard";
import { BiasHeatmap } from "./BiasHeatmap";
import type { BiasAnalysisData } from "./BiasHeatmap";
import { cn } from "@/lib/utils";
import type { StreamMessage, ValidatedSource } from "@/lib/types";

interface StreamingMessageProps {
  message: StreamMessage;
  sources?: ValidatedSource[];
}

// ── Section animation ────────────────────────────────────────────────────
const fadeUp = {
  hidden:  { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

// ── Sentiment indicator ──────────────────────────────────────────────────
function SentimentBadge({
  sentiment,
  score,
}: {
  sentiment?: string;
  score?: number;
}) {
  const s = (sentiment ?? "neutral").toLowerCase();

  if (s === "positive") {
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-lg">
        <TrendingUp className="size-3.5 text-emerald-600" />
        <span className="text-xs font-bold text-emerald-700 capitalize">{sentiment}</span>
        {score !== undefined && (
          <span className="text-[10px] text-emerald-600">({score.toFixed(2)})</span>
        )}
      </div>
    );
  }

  if (s === "negative") {
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-50 border border-red-200 rounded-lg">
        <TrendingDown className="size-3.5 text-red-600" />
        <span className="text-xs font-bold text-red-600 capitalize">{sentiment}</span>
        {score !== undefined && (
          <span className="text-[10px] text-red-500">({score.toFixed(2)})</span>
        )}
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 border border-slate-200 rounded-lg">
      <Minus className="size-3.5 text-slate-500" />
      <span className="text-xs font-bold text-slate-600 capitalize">
        {sentiment ?? "Neutral"}
      </span>
      {score !== undefined && (
        <span className="text-[10px] text-slate-500">({score.toFixed(2)})</span>
      )}
    </div>
  );
}

// ── Top validated sources sidebar cards ──────────────────────────────────
function SourceEntry({
  source,
  index,
}: {
  source: ValidatedSource;
  index: number;
}) {
  const cred = source.credibility ?? 0;
  const credColor =
    cred >= 0.9 ? "text-emerald-600" : cred >= 0.7 ? "text-amber-600" : "text-slate-500";

  // Derive a short 2-letter abbreviation from the title or URL
  const shortName = (source.title ?? source.url ?? "?")
    .replace(/https?:\/\//i, "")
    .split(/[\s./]/)[0]
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-lg">
      <div className="flex items-center gap-2.5">
        <div className="size-8 bg-slate-100 rounded flex items-center justify-center font-bold text-slate-600 text-xs flex-shrink-0">
          {shortName}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-800 truncate max-w-[120px]">
            {source.title ?? source.url ?? `Source ${index + 1}`}
          </p>
          <p className="text-[10px] text-slate-400">
            {cred >= 0.9 ? "Tier 1" : cred >= 0.7 ? "Tier 2" : "Tier 3"} Source
          </p>
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className={cn("text-xs font-bold", credColor)}>
          {Math.round(cred * 100)}%
        </div>
        <div className="text-[9px] text-slate-400 uppercase font-semibold">Rel.</div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────
export function StreamingMessage({ message, sources = [] }: StreamingMessageProps) {
  const summary          = message.summary as string | undefined;
  const insights         = (message.insights as string[] | undefined) ?? [];
  const sentiment        = message.sentiment as string | undefined;
  const sentimentScore   = message.sentiment_score as number | undefined;
  const confidenceScores = (message.confidence_scores as Record<string, number> | undefined) ?? {};
  const biasAnalysis     = message.bias_analysis as BiasAnalysisData | undefined;
  const answer           = message.answer as string | undefined;

  // ── RAG / plain answer mode ───────────────────────────────────────────
  if (!summary && !insights.length && answer) {
    return (
      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
        {answer}
      </p>
    );
  }

  // ── News agent result mode ─────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-blue-600" />
        <span className="text-xs font-bold text-blue-700 uppercase tracking-widest">
          Synthesis Executive Summary
        </span>
      </div>

      {/* ── Summary text ──────────────────────────────────────────────── */}
      {summary && (
        <motion.p
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="text-sm text-slate-700 leading-relaxed"
        >
          {summary}
        </motion.p>
      )}

      {/* ── Sentiment ─────────────────────────────────────────────────── */}
      {(sentiment || sentimentScore !== undefined) && (
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.1 }}
          className="flex items-center gap-3"
        >
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            Market Sentiment:
          </span>
          <SentimentBadge sentiment={sentiment} score={sentimentScore} />
        </motion.div>
      )}

      {/* ── Insight cards grid ────────────────────────────────────────── */}
      {insights.length > 0 && (
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.18 }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          {insights.map((insight, i) => (
            <InsightCard
              key={i}
              insight={insight}
              confidenceScore={confidenceScores[insight] ?? confidenceScores[String(i)] ?? 0.5}
              sources={sources}
              index={i}
            />
          ))}
        </motion.div>
      )}

      {/* ── Bias analysis (if available from bias_detect action) ──────── */}
      {biasAnalysis && Object.keys(biasAnalysis).length > 0 && (
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.25 }}
        >
          <BiasHeatmap data={biasAnalysis} />
        </motion.div>
      )}

      {/* ── Validated sources (inline, last) ─────────────────────────── */}
      {sources.length > 0 && (
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.32 }}
          className="border-t border-slate-100 pt-4"
        >
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            Top Validated Sources
          </p>
          <div className="space-y-2">
            {sources.slice(0, 4).map((src, i) => (
              <SourceEntry key={i} source={src} index={i} />
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
