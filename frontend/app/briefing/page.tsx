"use client";

import { useState } from "react";
import { Radio } from "lucide-react";
import { BriefingStudio } from "@/components/briefing/BriefingStudio";
import { PastBriefings } from "@/components/briefing/PastBriefings";
import type { BriefingResponse } from "@/lib/types";

export default function BriefingPage() {
  const [preloaded,  setPreloaded]  = useState<BriefingResponse | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [studioKey,  setStudioKey]  = useState(0);

  const handleNew = () => {
    setPreloaded(null);
    setStudioKey(k => k + 1);
  };

  const handleLoad = (briefing: BriefingResponse) => {
    setPreloaded(briefing);
    setStudioKey(k => k + 1);
  };

  const handleGenerated = () => {
    setRefreshKey(k => k + 1);
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden text-slate-900">

      {/* ── Past briefings sidebar ─────────────────────────────────────── */}
      <PastBriefings
        onLoad={handleLoad}
        onNew={handleNew}
        refresh={refreshKey}
      />

      {/* ── Main area ──────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar — matches agent/broadcast page style */}
        <div className="flex-shrink-0 h-14 border-b border-slate-200 flex items-center px-6 gap-3 bg-white shadow-sm">
          <div className="size-7 rounded-lg bg-blue-600/10 border border-blue-200 flex items-center justify-center">
            <Radio className="size-3.5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 leading-none">AI News Briefing</h1>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Daily broadcast · Powered by Groq LLaMA + ElevenLabs + D-ID
            </p>
          </div>
        </div>

        {/* Studio — remounts on new / preloaded */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <BriefingStudio
            key={studioKey}
            preloaded={preloaded}
            onGenerated={handleGenerated}
          />
        </div>
      </main>
    </div>
  );
}
