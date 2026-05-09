"use client";

import { Globe, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Article } from "@/lib/types";

interface ArticleCardProps {
  article: Article;
}

// ── Source credibility heuristic ──────────────────────────────────────────
const HIGH_CREDIBILITY_SOURCES = [
  "reuters", "bbc", "associated press", "ap news", "financial times",
  "bloomberg", "the guardian", "new york times", "nytimes", "wall street journal",
  "wsj", "economist", "ft.com", "nature", "science", "the atlantic",
  "al jazeera", "npr", "pbs", "time", "foreign affairs",
];
const MODERATE_BIAS_SOURCES = [
  "fox news", "breitbart", "buzzfeed", "daily mail", "new york post",
  "vice", "huffpost", "the daily beast", "the sun",
];

function getCredibilityInfo(sourceName?: string | null): {
  label: string;
  className: string;
} {
  const name = (sourceName ?? "").toLowerCase();
  if (HIGH_CREDIBILITY_SOURCES.some((s) => name.includes(s)))
    return {
      label: "HIGH CREDIBILITY",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
  if (MODERATE_BIAS_SOURCES.some((s) => name.includes(s)))
    return {
      label: "MODERATE BIAS",
      className: "bg-amber-50 text-amber-700 border-amber-200",
    };
  return {
    label: "NEUTRAL REPORTING",
    className: "bg-slate-100 text-slate-600 border-slate-200",
  };
}

// ── Sentiment display map ──────────────────────────────────────────────────
const SENTIMENT_MAP = {
  positive: { emoji: "😊", label: "Positive", className: "text-emerald-600" },
  negative: { emoji: "😟", label: "Negative", className: "text-red-500" },
  neutral:  { emoji: "😐", label: "Neutral",  className: "text-slate-500" },
} as const;

// ── Insight pill colors (cycling) ─────────────────────────────────────────
const PILL_COLORS = [
  "bg-blue-50 text-blue-700 border-blue-200",
  "bg-violet-50 text-violet-700 border-violet-200",
  "bg-sky-50 text-sky-700 border-sky-200",
];

export function ArticleCard({ article }: ArticleCardProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);

  const credibility = getCredibilityInfo(article.source_name);
  const sentimentKey = (article.sentiment ?? "neutral") as keyof typeof SENTIMENT_MAP;
  const sentiment = SENTIMENT_MAP[sentimentKey] ?? SENTIMENT_MAP.neutral;

  const relativeTime = article.published_at
    ? formatDistanceToNow(new Date(article.published_at), { addSuffix: true })
    : "Unknown date";

  const insights = article.insights?.slice(0, 3) ?? [];
  const visibleInsights = expanded ? insights : insights.slice(0, 2);

  const tags = [
    article.category,
    ...(article.keywords ?? []),
  ]
    .filter(Boolean)
    .slice(0, 3) as string[];

  const handleAskAI = () => {
    const q = encodeURIComponent(article.title ?? "");
    router.push(`/agent?q=${q}`);
  };

  return (
    <article className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col gap-4 group">

      {/* Source row */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Globe className="size-3.5 text-slate-400 flex-shrink-0" />
          <span className="text-xs font-medium text-slate-600 truncate">
            {article.source_name ?? "Unknown Source"}
          </span>
        </div>
        <span
          className={cn(
            "text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded border flex-shrink-0",
            credibility.className
          )}
        >
          {credibility.label}
        </span>
      </div>

      {/* Title */}
      <h3 className="text-[15px] font-semibold text-slate-900 line-clamp-2 leading-snug group-hover:text-blue-600 transition-colors cursor-pointer">
        {article.title ?? "Untitled Article"}
      </h3>

      {/* AI Summary */}
      {article.summary && (
        <p className="text-sm text-slate-500 italic leading-relaxed line-clamp-3">
          AI Summary:{" "}
          <span className="not-italic">{article.summary}</span>
        </p>
      )}

      {/* Insight pills */}
      {insights.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {visibleInsights.map((insight, i) => (
              <span
                key={i}
                className={cn(
                  "text-[11px] font-medium px-2.5 py-1 rounded-lg border cursor-pointer hover:opacity-75 transition-opacity",
                  PILL_COLORS[i % PILL_COLORS.length]
                )}
                title={insight}
              >
                {insight.length > 55 ? `${insight.slice(0, 55)}…` : insight}
              </span>
            ))}
          </div>
          {insights.length > 2 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-[11px] text-blue-500 hover:text-blue-600 font-semibold transition-colors"
            >
              {expanded
                ? "▲ Show less"
                : `▼ +${insights.length - 2} more insight${insights.length - 2 > 1 ? "s" : ""}`}
            </button>
          )}
        </div>
      )}

      {/* Category / keyword chips */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="text-[11px] font-medium px-2.5 py-0.5 bg-slate-100 text-slate-600 rounded-md capitalize"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer: sentiment + time + Ask AI */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-auto">
        <div
          className={cn(
            "flex items-center gap-1.5 text-xs font-medium",
            sentiment.className
          )}
        >
          <span className="text-base leading-none">{sentiment.emoji}</span>
          <span>{relativeTime}</span>
        </div>
        <button
          onClick={handleAskAI}
          className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-all"
        >
          <MessageSquare className="size-3.5" />
          Ask AI
        </button>
      </div>
    </article>
  );
}
