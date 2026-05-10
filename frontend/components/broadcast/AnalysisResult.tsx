"use client";

import {
  Clock,
  Download,
  MessageSquare,
  Newspaper,
  Smile,
  Tag,
  TrendingDown,
  TrendingUp,
  User,
  X,
} from "lucide-react";
import { cn, sentimentBg } from "@/lib/utils";

export interface AnalysisData {
  broadcast_summary: string;
  key_events:        string[];
  people_mentioned:  string[];
  topics:            string[];
  sentiment:         string;
  sentiment_score:   number;
  video_title:       string;
  channel_name:      string;
  video_duration:    number;
}

interface AnalysisResultProps {
  data:          AnalysisData;
  isInterrupted: boolean;
  onAskQuestion: () => void;
  onExportPDF:   () => void;
  onDone:        () => void;
}

function formatDuration(seconds: number): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function SentimentBadge({ sentiment, score }: { sentiment: string; score: number }) {
  const Icon =
    sentiment === "positive" ? TrendingUp :
    sentiment === "negative" ? TrendingDown : Smile;

  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold",
      sentimentBg(sentiment)
    )}>
      <Icon className="size-3" />
      {sentiment.charAt(0).toUpperCase() + sentiment.slice(1)}
      {" "}({score >= 0 ? "+" : ""}{score.toFixed(2)})
    </span>
  );
}

export function AnalysisResult({
  data,
  isInterrupted,
  onAskQuestion,
  onExportPDF,
  onDone,
}: AnalysisResultProps) {
  return (
    <div className="w-full space-y-4">
      {/* ── Video info bar ───────────────────────────────────────────── */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-white font-bold text-base leading-tight truncate">
            {data.video_title || "Untitled Broadcast"}
          </h2>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {data.channel_name && (
              <span className="text-slate-400 text-xs">{data.channel_name}</span>
            )}
            {data.video_duration > 0 && (
              <span className="flex items-center gap-1 text-slate-400 text-xs">
                <Clock className="size-3" />
                {formatDuration(data.video_duration)}
              </span>
            )}
          </div>
        </div>
        <SentimentBadge sentiment={data.sentiment} score={data.sentiment_score} />
      </div>

      {/* ── Summary ─────────────────────────────────────────────────── */}
      {data.broadcast_summary && (
        <div className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
            <Newspaper className="size-3.5" /> Broadcast Summary
          </h3>
          <p className="text-slate-200 text-sm leading-relaxed">{data.broadcast_summary}</p>
        </div>
      )}

      {/* ── Two-column grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Key events */}
        {data.key_events?.length > 0 && (
          <div className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <Newspaper className="size-3.5" /> Key Events
            </h3>
            <ol className="space-y-2">
              {data.key_events.map((ev, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-200 leading-snug">
                  <span className="text-violet-400 font-bold flex-shrink-0 text-xs mt-0.5">
                    {String(i + 1).padStart(2, "0")}.
                  </span>
                  <span>{ev}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* People + Topics */}
        <div className="space-y-4">
          {data.people_mentioned?.length > 0 && (
            <div className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                <User className="size-3.5" /> People Mentioned
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {data.people_mentioned.map((name, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 bg-blue-500/15 border border-blue-500/20 text-blue-300 rounded-full text-xs font-medium"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {data.topics?.length > 0 && (
            <div className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                <Tag className="size-3.5" /> Topics
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {data.topics.map((t, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 bg-slate-700/60 text-slate-300 rounded-full text-xs font-medium"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Action buttons ───────────────────────────────────────────── */}
      {isInterrupted && (
        <div className="flex flex-wrap gap-3 pt-2">
          <button
            onClick={onAskQuestion}
            className="flex-1 min-w-[140px] flex items-center justify-center gap-2 py-3 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl transition-all active:scale-[0.98] shadow-md shadow-violet-600/20 text-sm"
          >
            <MessageSquare className="size-4" />
            Ask a Question
          </button>
          <button
            onClick={onExportPDF}
            className="flex items-center justify-center gap-2 px-5 py-3 border border-slate-600 hover:border-violet-500/50 hover:bg-violet-500/5 text-slate-300 hover:text-white font-semibold rounded-xl transition-all text-sm"
          >
            <Download className="size-4" />
            Export PDF
          </button>
          <button
            onClick={onDone}
            className="flex items-center justify-center gap-2 px-5 py-3 text-slate-400 hover:text-white font-semibold rounded-xl hover:bg-slate-700/40 transition-all text-sm"
          >
            <X className="size-4" />
            Done
          </button>
        </div>
      )}
    </div>
  );
}
