"use client";

import { Check, Globe, Loader2, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
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
  const [notionState, setNotionState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const handleSaveToNotion = async () => {
    if (notionState === "saving" || notionState === "saved") return;
    setNotionState("saving");
    try {
      const res = await api.saveArticleToNotion({
        title:       article.title       ?? "Untitled",
        source_name: article.source_name ?? "",
        summary:     article.summary     ?? "",
        url:         article.source_url ?? "",
        sentiment:   article.sentiment   ?? "neutral",
        category:    article.category    ?? "General",
      });
      setNotionState(res.success ? "saved" : "error");
      if (res.success && res.page_url) window.open(res.page_url, "_blank");
    } catch {
      setNotionState("error");
    }
    setTimeout(() => setNotionState("idle"), 3000);
  };

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
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleSaveToNotion}
            title="Save to Notion"
            className={cn(
              "flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all",
              notionState === "saved"  && "bg-emerald-50 text-emerald-600",
              notionState === "error"  && "bg-red-50 text-red-500",
              notionState === "saving" && "bg-slate-50 text-slate-400 cursor-wait",
              notionState === "idle"   && "bg-slate-100 text-slate-500 hover:bg-slate-200",
            )}
          >
            {notionState === "saving" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : notionState === "saved" ? (
              <Check className="size-3.5" />
            ) : (
              <svg className="size-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279V9.34l-1.215-.14c-.093-.514.28-.887.747-.933z"/></svg>
            )}
            {notionState === "saved" ? "Saved!" : notionState === "error" ? "Failed" : "Notion"}
          </button>
          <button
            onClick={handleAskAI}
            className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-all"
          >
            <MessageSquare className="size-3.5" />
            Ask AI
          </button>
        </div>
      </div>
    </article>
  );
}
