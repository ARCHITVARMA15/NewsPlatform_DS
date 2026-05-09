"use client";

import { cn } from "@/lib/utils";

export interface BiasAnalysisData {
  left_angle?: string;
  center_angle?: string;
  right_angle?: string;
  bias_score?: number;
  key_differences?: string[];
  recommendation?: string;
}

interface BiasHeatmapProps {
  data: BiasAnalysisData;
}

export function BiasHeatmap({ data }: BiasHeatmapProps) {
  const score = data.bias_score ?? 0;
  // Convert -1..1 → 0..100 for the horizontal marker position
  const markerPct = Math.min(100, Math.max(0, ((score + 1) / 2) * 100));

  const scoreLabel =
    score < -0.3
      ? "Left-Leaning"
      : score > 0.3
      ? "Right-Leaning"
      : "Near-Neutral";

  const scoreLabelColor =
    score < -0.3
      ? "text-blue-600"
      : score > 0.3
      ? "text-red-600"
      : "text-slate-600";

  return (
    <div className="mt-4 pt-4 border-t border-slate-200 space-y-4">
      <h4 className="text-sm font-bold text-slate-800">
        Media Narrative Bias Analysis
      </h4>

      {/* 3-Column angle cards */}
      <div className="grid grid-cols-3 gap-2">
        {/* Left */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1.5">
            Left-Leaning
          </p>
          <p className="text-xs text-slate-700 leading-relaxed">
            {data.left_angle ?? "—"}
          </p>
        </div>

        {/* Center */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
            Center
          </p>
          <p className="text-xs text-slate-700 leading-relaxed">
            {data.center_angle ?? "—"}
          </p>
        </div>

        {/* Right */}
        <div className="bg-red-50 border border-red-100 rounded-xl p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-red-500 mb-1.5">
            Right-Leaning
          </p>
          <p className="text-xs text-slate-700 leading-relaxed">
            {data.right_angle ?? "—"}
          </p>
        </div>
      </div>

      {/* Bias score gradient bar */}
      <div>
        {/* Score label above bar */}
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-slate-500">Bias Score</span>
          <span className={cn("text-xs font-bold", scoreLabelColor)}>
            {score.toFixed(2)} — {scoreLabel}
          </span>
        </div>

        <div className="relative">
          {/* Gradient track */}
          <div className="h-8 rounded-xl bg-gradient-to-r from-blue-200 via-slate-100 to-red-200 overflow-hidden" />

          {/* Marker line */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-slate-800 shadow-sm"
            style={{ left: `${markerPct}%` }}
          />

          {/* Score tooltip */}
          <div
            className="absolute -top-6 -translate-x-1/2 text-[10px] font-bold text-slate-700 bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-sm"
            style={{ left: `${markerPct}%` }}
          >
            {score.toFixed(2)}
          </div>
        </div>

        <div className="flex justify-between mt-1.5">
          <span className="text-[10px] font-semibold text-blue-500">← Left</span>
          <span className="text-[10px] text-slate-400">Neutral (0)</span>
          <span className="text-[10px] font-semibold text-red-500">Right →</span>
        </div>
      </div>

      {/* Key differences */}
      {data.key_differences && data.key_differences.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            Key Narrative Differences
          </p>
          <ul className="space-y-1.5">
            {data.key_differences.map((diff, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                <span className="mt-0.5 size-1 rounded-full bg-slate-400 flex-shrink-0" />
                {diff}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommendation */}
      {data.recommendation && (
        <p className="text-xs text-slate-500 italic border-t border-slate-100 pt-3 leading-relaxed">
          {data.recommendation}
        </p>
      )}
    </div>
  );
}
