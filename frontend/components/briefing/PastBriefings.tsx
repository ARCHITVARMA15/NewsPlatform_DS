"use client";

import { useEffect, useState } from "react";
import { Clock, Play, Radio } from "lucide-react";
import { api } from "@/lib/api";
import type { BriefingResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

interface PastBriefingsProps {
  onLoad:  (briefing: BriefingResponse) => void;
  onNew:   () => void;
  refresh: number;
}

export function PastBriefings({ onLoad, onNew, refresh }: PastBriefingsProps) {
  const [briefings, setBriefings] = useState<BriefingResponse[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getLatestBriefings()
      .then(setBriefings)
      .catch(() => setBriefings([]))
      .finally(() => setLoading(false));
  }, [refresh]);

  return (
    <aside className="w-[220px] flex-shrink-0 bg-white border-r border-slate-200 flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2 mb-3">
          <Radio className="size-4 text-blue-600" />
          <span className="text-sm font-bold text-slate-900">Briefings</span>
        </div>
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-1.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all active:scale-95 shadow-sm"
        >
          + New Briefing
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-2 px-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-2 mb-2">
          Recent
        </p>

        {loading && (
          <div className="space-y-2 px-1">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {!loading && briefings.length === 0 && (
          <p className="text-center text-slate-400 text-xs py-8 px-3 leading-relaxed">
            No briefings yet.{" "}
            <br />Generate your first one above.
          </p>
        )}

        {!loading && briefings.map((b) => (
          <button
            key={b.thread_id}
            onClick={() => onLoad(b)}
            className={cn(
              "w-full flex items-start gap-2.5 px-2.5 py-3 rounded-xl",
              "hover:bg-slate-50 transition-colors text-left group"
            )}
          >
            <div className="size-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-blue-100 transition-colors">
              <Play className="size-3 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-700 truncate">
                Daily Briefing
              </p>
              <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                <Clock className="size-2.5" />
                {new Date(b.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day:   "numeric",
                  hour:  "2-digit",
                  minute: "2-digit",
                })}
              </p>
              {b.video_url && (
                <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-wide text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                  Video
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}
