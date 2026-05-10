"use client";

import { useEffect, useState } from "react";
import { Clock, Plus, Tv, Trash2 } from "lucide-react";
import { BroadcastChat } from "@/components/broadcast/BroadcastChat";
import { cn } from "@/lib/utils";

const BASE_URL =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000")
    : "http://localhost:8000";

interface BroadcastSession {
  thread_id:    string;
  session_name: string;
  last_query:   string | null;
  updated_at:   string;
}

// ── Session sidebar ────────────────────────────────────────────────────────
function SessionSidebar({
  sessions,
  onNew,
  onDelete,
  loading,
}: {
  sessions:  BroadcastSession[];
  onNew:     () => void;
  onDelete:  (id: string) => void;
  loading:   boolean;
}) {
  return (
    <aside className="w-[220px] flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2 mb-3">
          <Tv className="size-4 text-violet-400" />
          <span className="text-sm font-bold text-white">Broadcasts</span>
        </div>
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-1.5 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-lg transition-all active:scale-95"
        >
          <Plus className="size-3.5" /> New Analysis
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-2 px-2">
        {loading && (
          <p className="text-center text-slate-500 text-xs py-4">Loading…</p>
        )}
        {!loading && sessions.length === 0 && (
          <p className="text-center text-slate-600 text-xs py-6 px-2 leading-relaxed">
            No broadcast sessions yet. Paste a YouTube URL to start.
          </p>
        )}
        {sessions.map(s => (
          <div
            key={s.thread_id}
            className="group flex items-start gap-2 px-2 py-2.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Tv className="size-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-200 truncate">
                {s.session_name}
              </p>
              {s.last_query && (
                <p className="text-[10px] text-slate-500 truncate mt-0.5">{s.last_query}</p>
              )}
              <p className="text-[10px] text-slate-600 flex items-center gap-0.5 mt-0.5">
                <Clock className="size-2.5" />
                {new Date(s.updated_at).toLocaleDateString()}
              </p>
            </div>
            <button
              onClick={e => { e.stopPropagation(); onDelete(s.thread_id); }}
              className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all p-0.5 rounded"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function BroadcastPage() {
  const [sessions, setSessions] = useState<BroadcastSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [chatKey, setChatKey] = useState(0);   // force remount BroadcastChat

  useEffect(() => {
    fetch(`${BASE_URL}/api/broadcast/sessions`)
      .then(r => r.json())
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setSessionsLoading(false));
  }, []);

  const handleNew = () => setChatKey(k => k + 1);

  const handleDelete = async (threadId: string) => {
    await fetch(`${BASE_URL}/api/broadcast/sessions/${threadId}`, { method: "DELETE" });
    setSessions(prev => prev.filter(s => s.thread_id !== threadId));
  };

  return (
    <div className="flex h-screen bg-[#0a0f18] overflow-hidden">
      {/* Session sidebar */}
      <SessionSidebar
        sessions={sessions}
        onNew={handleNew}
        onDelete={handleDelete}
        loading={sessionsLoading}
      />

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex-shrink-0 h-14 border-b border-slate-800 flex items-center px-6 gap-3 bg-slate-900/50">
          <div className="size-7 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
            <Tv className="size-3.5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white leading-none">News Broadcast Analyzer</h1>
            <p className="text-[11px] text-slate-500 mt-0.5">
              YouTube URL or upload a file · Powered by Whisper AI + Groq LLaMA
            </p>
          </div>
        </div>

        {/* BroadcastChat — remounts on new session */}
        <div className="flex-1 overflow-hidden">
          <BroadcastChat key={chatKey} />
        </div>
      </main>
    </div>
  );
}
