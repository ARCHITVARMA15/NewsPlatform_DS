"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Loader2, MessageSquare, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { ChatSession } from "@/lib/types";
import { cn, truncate } from "@/lib/utils";

interface ThreadHistoryProps {
  agentType: "agent" | "rag";
  currentThreadId: string;
  onSelect: (threadId: string) => void;
  onNew: () => void;
}

export function ThreadHistory({
  agentType,
  currentThreadId,
  onSelect,
  onNew,
}: ThreadHistoryProps) {
  const [sessions, setSessions]         = useState<ChatSession[]>([]);
  const [loading, setLoading]           = useState(true);
  const [deletingId, setDeletingId]     = useState<string | null>(null);
  const [confirmId, setConfirmId]       = useState<string | null>(null);

  // ── Load sessions ──────────────────────────────────────────────────────
  const loadSessions = async () => {
    try {
      const data =
        agentType === "agent"
          ? await api.getAgentSessions()
          : await api.getRAGSessions();
      setSessions(data);
    } catch {
      /* silent fail */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentType]);

  // Refresh when a new session starts (currentThreadId changes)
  useEffect(() => {
    if (!loading) loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentThreadId]);

  // ── Delete session ──────────────────────────────────────────────────────
  const handleDelete = async (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmId !== threadId) {
      setConfirmId(threadId);
      setTimeout(() => setConfirmId(null), 3000);
      return;
    }
    setDeletingId(threadId);
    try {
      await api.deleteSession(agentType, threadId);
      setSessions((prev) => prev.filter((s) => s.thread_id !== threadId));
      if (threadId === currentThreadId) onNew();
    } catch {
      /* silent */
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* New Investigation Button */}
      <div className="px-3 mb-3">
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-4 rounded-xl font-semibold text-sm transition-all active:scale-95 shadow-sm shadow-blue-600/25"
        >
          <span className="text-base leading-none">+</span>
          New Investigation
        </button>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5 pb-2">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="size-4 animate-spin text-slate-400" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center gap-2">
            <MessageSquare className="size-8 text-slate-200" />
            <p className="text-xs text-slate-400 leading-relaxed">
              No past investigations yet.
              <br />
              Start one above!
            </p>
          </div>
        ) : (
          sessions.map((session) => {
            const isActive = session.thread_id === currentThreadId;
            const label =
              session.last_query ??
              session.session_name ??
              "Untitled Investigation";

            return (
              <button
                key={session.thread_id}
                onClick={() => onSelect(session.thread_id)}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-lg transition-all group relative",
                  isActive
                    ? "bg-blue-50 border border-blue-200"
                    : "hover:bg-slate-50 border border-transparent hover:border-slate-200"
                )}
              >
                <div className="flex items-start gap-2">
                  {/* Active indicator */}
                  <div
                    className={cn(
                      "mt-1 size-1.5 rounded-full flex-shrink-0",
                      isActive ? "bg-blue-500" : "bg-slate-300"
                    )}
                  />

                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "text-xs font-semibold truncate leading-snug",
                        isActive ? "text-blue-700" : "text-slate-700"
                      )}
                    >
                      {truncate(label, 38)}
                    </p>

                    <div className="flex items-center gap-2 mt-0.5">
                      {session.created_at && (
                        <span className="text-[10px] text-slate-400">
                          {formatDistanceToNow(new Date(session.created_at), {
                            addSuffix: true,
                          })}
                        </span>
                      )}
                      {(session.message_count ?? 0) > 0 && (
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-medium">
                          {session.message_count}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Delete control */}
                  <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {confirmId === session.thread_id ? (
                      <button
                        onClick={(e) => handleDelete(session.thread_id, e)}
                        className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded"
                      >
                        Delete?
                      </button>
                    ) : (
                      <button
                        onClick={(e) => handleDelete(session.thread_id, e)}
                        disabled={deletingId === session.thread_id}
                        className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors"
                      >
                        {deletingId === session.thread_id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Trash2 className="size-3" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
