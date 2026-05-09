"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ValidatedSource } from "@/lib/types";

interface InsightCardProps {
  insight: string;
  confidenceScore?: number;
  sources?: ValidatedSource[];
  index?: number;
}

function getConfidenceMeta(score: number): {
  label: string;
  textColor: string;
  bgColor: string;
  barColor: string;
} {
  if (score >= 0.7)
    return {
      label: "High Confidence",
      textColor: "text-emerald-600",
      bgColor: "bg-emerald-50 border-emerald-200",
      barColor: "bg-emerald-500",
    };
  if (score >= 0.4)
    return {
      label: "Moderate",
      textColor: "text-amber-600",
      bgColor: "bg-amber-50 border-amber-200",
      barColor: "bg-amber-500",
    };
  return {
    label: "Low Confidence",
    textColor: "text-red-500",
    bgColor: "bg-red-50 border-red-200",
    barColor: "bg-red-400",
  };
}

export function InsightCard({
  insight,
  confidenceScore = 0.5,
  sources = [],
  index = 0,
}: InsightCardProps) {
  const [expanded, setExpanded] = useState(false);
  const meta = getConfidenceMeta(confidenceScore);
  const pct  = Math.round(confidenceScore * 100);

  return (
    <div
      className={cn(
        "bg-white border border-slate-200 rounded-xl overflow-hidden transition-shadow",
        expanded && "shadow-md"
      )}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {/* Card body */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left p-4 group"
      >
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <p className="text-sm font-semibold text-slate-800 leading-snug flex-1">
            {insight}
          </p>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span
              className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded border",
                meta.textColor,
                meta.bgColor
              )}
            >
              {meta.label}
            </span>
            {expanded ? (
              <ChevronUp className="size-3.5 text-slate-400" />
            ) : (
              <ChevronDown className="size-3.5 text-slate-400 group-hover:text-slate-600 transition-colors" />
            )}
          </div>
        </div>

        {/* Confidence bar */}
        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-700", meta.barColor)}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Footer row */}
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[10px] text-slate-400">{pct}% corroborated</span>
          {sources.length > 0 && (
            <span className="text-[10px] text-slate-400">
              {sources.length} source{sources.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </button>

      {/* Expanded sources */}
      {expanded && sources.length > 0 && (
        <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            Supporting Sources
          </p>
          {sources.slice(0, 6).map((src, i) => {
            const cred = src.credibility ?? 0;
            const credColor =
              cred >= 0.9
                ? "text-emerald-600"
                : cred >= 0.7
                ? "text-amber-600"
                : "text-slate-500";
            return (
              <div key={i} className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-600 truncate flex-1">
                  {src.title ?? src.url ?? `Source ${i + 1}`}
                </span>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {src.credibility !== undefined && (
                    <span className={cn("text-[10px] font-semibold", credColor)}>
                      {Math.round(src.credibility * 100)}%
                    </span>
                  )}
                  {src.url && (
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-slate-400 hover:text-blue-600 transition-colors"
                    >
                      <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
