"use client";

import { GitFork } from "lucide-react";
import { KnowledgeGraph } from "@/components/graph/KnowledgeGraph";

export default function GraphPage() {
  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden text-slate-900">
      <main className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar — matches site-wide page style */}
        <div className="flex-shrink-0 h-14 border-b border-slate-200 flex items-center px-6 gap-3 bg-white shadow-sm">
          <div className="size-7 rounded-lg bg-violet-600/10 border border-violet-200 flex items-center justify-center">
            <GitFork className="size-3.5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 leading-none">Knowledge Graph</h1>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Entity-relationship map · Powered by Groq LLaMA-3.3-70b
            </p>
          </div>
        </div>

        {/* Full-viewport dark canvas */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <KnowledgeGraph />
        </div>
      </main>
    </div>
  );
}
