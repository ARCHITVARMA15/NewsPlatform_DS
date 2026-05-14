"use client";

import {
  useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import {
  Check, ChevronRight, Copy, Download, FileText, Loader2,
  LogOut, MessageSquare, Send, StickyNote, ThumbsUp, Users, X, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RoomMessage, RoomSessionData } from "./RoomLobby";

// ── Config ─────────────────────────────────────────────────────────────────
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const AVATAR_COLORS = [
  "bg-violet-500", "bg-blue-500",   "bg-emerald-500", "bg-orange-500",
  "bg-pink-500",   "bg-indigo-500", "bg-teal-500",    "bg-red-500",
];

function avatarColor(name: string): string {
  const h = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// ── Types ──────────────────────────────────────────────────────────────────
interface StreamingState {
  step:    string;
  summary: string;
  insights: string[];
}

interface RoomSessionProps {
  session:  RoomSessionData;
  onLeave:  () => void;
}

// ── Avatar ─────────────────────────────────────────────────────────────────
function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "size-7 text-[11px]" : "size-9 text-sm";
  return (
    <div className={cn("rounded-full flex items-center justify-center font-bold text-white flex-shrink-0", sz, avatarColor(name))}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// ── Step Progress pill ─────────────────────────────────────────────────────
function StepPill({ step }: { step: string }) {
  return (
    <div className="flex justify-center my-1">
      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
        <Zap className="size-2.5 text-violet-400" />
        {step.replace(/_/g, " ")}
      </span>
    </div>
  );
}

// ── Message renderers ──────────────────────────────────────────────────────
function QueryBubble({ msg, isOwn }: { msg: RoomMessage; isOwn: boolean }) {
  const meta = msg.metadata as Record<string, unknown>;
  const text  = (meta?.query as string) || msg.content;
  return (
    <div className={cn("flex gap-2.5 items-end", isOwn ? "flex-row-reverse" : "flex-row")}>
      <Avatar name={msg.user_name} />
      <div className={cn("max-w-[72%] space-y-1", isOwn ? "items-end" : "items-start")}>
        <p className={cn("text-[10px] font-semibold text-slate-400", isOwn ? "text-right" : "text-left")}>
          {isOwn ? "You" : msg.user_name}
        </p>
        <div className={cn(
          "px-4 py-2.5 rounded-2xl text-sm leading-relaxed",
          isOwn
            ? "bg-violet-600 text-white rounded-br-sm"
            : "bg-blue-600 text-white rounded-bl-sm",
        )}>
          {text}
        </div>
        <p className={cn("text-[9px] text-slate-400", isOwn ? "text-right" : "text-left")}>
          {timeAgo(msg.created_at)}
        </p>
      </div>
    </div>
  );
}

function AgentResponseCard({
  msg, upvoteCount, hasUpvoted, onUpvote,
}: {
  msg: RoomMessage; upvoteCount: number; hasUpvoted: boolean;
  onUpvote: (id: string) => void;
}) {
  const meta     = msg.metadata as Record<string, unknown>;
  const summary  = (meta?.summary  as string)   || msg.content || "";
  const insights = (meta?.insights as string[]) || [];

  return (
    <div className="flex gap-2.5 items-start">
      <div className="size-7 rounded-full bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Zap className="size-3.5 text-white" />
      </div>
      <div className="flex-1 max-w-[85%] bg-white border border-slate-200 rounded-2xl rounded-tl-sm p-4 shadow-sm space-y-3">
        <p className="text-[10px] font-bold text-violet-600 uppercase tracking-widest">AI Analysis</p>
        {summary && (
          <p className="text-sm text-slate-700 leading-relaxed">{summary}</p>
        )}
        {insights.length > 0 && (
          <ul className="space-y-1.5">
            {insights.map((ins, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                <ChevronRight className="size-3 text-violet-400 flex-shrink-0 mt-0.5" />
                {ins}
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
          <span className="text-[9px] text-slate-400">{timeAgo(msg.created_at)}</span>
          <button
            onClick={() => onUpvote(msg.id)}
            className={cn(
              "flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors",
              hasUpvoted
                ? "bg-violet-100 text-violet-600"
                : "text-slate-400 hover:bg-slate-100 hover:text-slate-600",
            )}
          >
            <ThumbsUp className="size-3" />
            {upvoteCount > 0 && upvoteCount}
          </button>
        </div>
      </div>
    </div>
  );
}

function AnnotationBubble({ msg }: { msg: RoomMessage }) {
  const text = (msg.metadata as Record<string, string>)?.annotation || msg.content;
  return (
    <div className="flex gap-2 items-start pl-6">
      <StickyNote className="size-3 text-amber-500 flex-shrink-0 mt-1" />
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 max-w-[80%]">
        <p className="text-[10px] font-semibold text-amber-700">{msg.user_name}</p>
        <p className="text-xs text-amber-900 mt-0.5">{text}</p>
        <p className="text-[9px] text-amber-400 mt-1">{timeAgo(msg.created_at)}</p>
      </div>
    </div>
  );
}

function SystemMessage({ msg }: { msg: RoomMessage }) {
  const text = (msg.metadata as Record<string, string>)?.message || msg.content;
  return (
    <div className="flex justify-center">
      <span className="text-[10px] text-slate-400 bg-slate-100 px-3 py-1 rounded-full">{text}</span>
    </div>
  );
}

function StreamingCard({ state }: { state: StreamingState }) {
  return (
    <div className="flex gap-2.5 items-start">
      <div className="size-7 rounded-full bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5 animate-pulse">
        <Zap className="size-3.5 text-white" />
      </div>
      <div className="flex-1 max-w-[85%] bg-white border border-violet-200 rounded-2xl rounded-tl-sm p-4 shadow-sm space-y-2">
        <div className="flex items-center gap-2">
          <Loader2 className="size-3.5 text-violet-500 animate-spin" />
          <span className="text-[11px] font-semibold text-violet-500">
            {state.step ? state.step.replace(/_/g, " ") : "Analyzing…"}
          </span>
        </div>
        {state.summary && <p className="text-sm text-slate-600 leading-relaxed">{state.summary}</p>}
        {state.insights.length > 0 && (
          <ul className="space-y-1">
            {state.insights.map((ins, i) => (
              <li key={i} className="text-xs text-slate-500 flex items-start gap-1.5">
                <ChevronRight className="size-3 text-violet-300 flex-shrink-0 mt-0.5" />
                {ins}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export function RoomSession({ session, onLeave }: RoomSessionProps) {
  const { room_code, user_id, user_name, topic } = session;

  const [messages,      setMessages]      = useState<RoomMessage[]>(session.history ?? []);
  const [streaming,     setStreaming]      = useState<StreamingState | null>(null);
  const [isQuerying,    setIsQuerying]     = useState(false);
  const [queryInput,    setQueryInput]     = useState("");
  const [upvotes,       setUpvotes]        = useState<Record<string, number>>({});
  const [myUpvotes,     setMyUpvotes]      = useState<Set<string>>(new Set());
  const [annotText,     setAnnotText]      = useState("");
  const [showAnnot,     setShowAnnot]      = useState(false);
  const [copiedCode,    setCopiedCode]     = useState(false);
  const [exportLoading,  setExportLoading]  = useState(false);
  const [notionLoading,   setNotionLoading]  = useState(false);
  const [notionUrl,       setNotionUrl]       = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef       = useRef<AbortController | null>(null);

  // ── Auto-scroll ───────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  // ── Handle incoming SSE message ───────────────────────────────────────
  const handleIncoming = useCallback((raw: Record<string, unknown>) => {
    const type = raw.message_type as string;

    if (type === "upvote") {
      const targetId = (raw.metadata as Record<string, string>)?.message_id;
      if (targetId) setUpvotes(prev => ({ ...prev, [targetId]: (prev[targetId] ?? 0) + 1 }));
      return;
    }

    if (!raw.id) return;

    setMessages(prev => {
      if (prev.some(m => m.id === raw.id)) return prev;
      return [...prev, raw as unknown as RoomMessage];
    });
  }, []);

  // ── SSE stream ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const connect = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`${BASE_URL}/api/rooms/${room_code}/stream`);
        if (!res.ok || !res.body) return;
        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let   buffer  = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done || cancelled) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data: ")) continue;
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed && parsed.id) handleIncoming(parsed);
            } catch { /* ignore malformed */ }
          }
        }
      } catch {
        if (!cancelled) setTimeout(connect, 3000);
      }
    };
    connect();
    return () => { cancelled = true; };
  }, [room_code, handleIncoming]);

  // ── Query — stream to self + broadcast to room ────────────────────────
  const sendQuery = useCallback(async () => {
    const q = queryInput.trim();
    if (!q || isQuerying) return;
    setQueryInput("");
    setIsQuerying(true);
    setStreaming({ step: "starting", summary: "", insights: [] });

    abortRef.current = new AbortController();
    try {
      const res = await fetch(`${BASE_URL}/api/rooms/${room_code}/query`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        signal:  abortRef.current.signal,
        body:    JSON.stringify({ room_code, user_id, user_name, query: q }),
      });
      if (!res.ok || !res.body) throw new Error("Stream failed");

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = "";
      let   latest: StreamingState = { step: "starting", summary: "", insights: [] };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            const ev   = parsed?.event as string;
            const data = parsed?.data  as Record<string, unknown>;
            if (!data) continue;
            if (ev === "step") {
              latest = { ...latest, step: (data.step as string) ?? latest.step };
              setStreaming({ ...latest });
            } else if (ev === "result") {
              latest = {
                step:     "complete",
                summary:  (data.summary  as string)   ?? "",
                insights: (data.insights as string[]) ?? [],
              };
              setStreaming({ ...latest });
            }
          } catch { /* ignore */ }
        }
      }
    } catch (e: unknown) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setStreaming(null);
      }
    } finally {
      setIsQuerying(false);
      setStreaming(null);
    }
  }, [queryInput, isQuerying, room_code, user_id, user_name]);

  // ── Upvote ────────────────────────────────────────────────────────────
  const handleUpvote = useCallback(async (messageId: string) => {
    if (myUpvotes.has(messageId)) return;
    setMyUpvotes(prev => new Set(Array.from(prev).concat(messageId)));
    setUpvotes(prev => ({ ...prev, [messageId]: (prev[messageId] ?? 0) + 1 }));
    try {
      await fetch(`${BASE_URL}/api/rooms/${room_code}/upvote`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ room_code, user_id, message_id: messageId }),
      });
    } catch { /* silently fail — local state already updated */ }
  }, [myUpvotes, room_code, user_id]);

  // ── Annotation ────────────────────────────────────────────────────────
  const handleAnnotate = useCallback(async () => {
    const text = annotText.trim();
    if (!text) return;
    setAnnotText(""); setShowAnnot(false);
    try {
      await fetch(`${BASE_URL}/api/rooms/${room_code}/annotate`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_code, user_id, user_name,
          message_id:      "room",
          annotation_text: text,
        }),
      });
    } catch { /* ignore */ }
  }, [annotText, room_code, user_id, user_name]);

  // ── PDF export ────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExportLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/rooms/${room_code}/export-pdf`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `room_${room_code}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
    finally { setExportLoading(false); }
  };

  // ── Notion export ────────────────────────────────────────────────────────
  const handleNotionExport = async () => {
    setNotionLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/rooms/${room_code}/export-notion`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Export failed" }));
        throw new Error(err.detail);
      }
      const data = await res.json();
      setNotionUrl(data.page_url);
      window.open(data.page_url, "_blank");
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Notion export failed");
    } finally {
      setNotionLoading(false);
    }
  };

  // ── Copy room code ────────────────────────────────────────────────────
  const copyCode = () => {
    navigator.clipboard.writeText(room_code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // ── Derived ───────────────────────────────────────────────────────────
  const participants = useMemo(() => {
    const map = new Map<string, { user_id: string; user_name: string; last_seen: string }>();
    map.set(user_id, { user_id, user_name, last_seen: new Date().toISOString() });
    for (const m of messages) {
      if (m.user_id && m.user_id !== "system") {
        map.set(m.user_id, { user_id: m.user_id, user_name: m.user_name, last_seen: m.created_at });
      }
    }
    return Array.from(map.values());
  }, [messages, user_id, user_name]);

  const annotations = useMemo(
    () => messages.filter(m => m.message_type === "annotation"),
    [messages],
  );

  const visibleMessages = useMemo(
    () => messages.filter(m => m.message_type !== "upvote"),
    [messages],
  );

  // =========================================================================
  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-50">

      {/* ── TOP BAR ───────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-5 py-3 flex items-center gap-4">
        {/* Room code */}
        <button onClick={copyCode} className="flex items-center gap-2 hover:bg-slate-50 rounded-lg px-2 py-1 transition-colors group">
          <span className="font-mono text-lg font-bold text-slate-900 tracking-widest">{room_code}</span>
          {copiedCode
            ? <Check className="size-3.5 text-emerald-500" />
            : <Copy className="size-3.5 text-slate-400 group-hover:text-slate-600" />
          }
        </button>

        {topic && (
          <>
            <span className="text-slate-300">|</span>
            <span className="text-sm text-slate-500 truncate max-w-[200px]">{topic}</span>
          </>
        )}

        {/* Participant count */}
        <div className="flex items-center gap-1.5 ml-1">
          <div className="flex -space-x-1.5">
            {participants.slice(0, 4).map(p => (
              <div key={p.user_id} className={cn("size-6 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-bold text-white", avatarColor(p.user_name))}>
                {p.user_name.charAt(0).toUpperCase()}
              </div>
            ))}
          </div>
          <span className="text-xs text-slate-500">{participants.length} online</span>
        </div>

        <div className="flex-1" />

        {/* Actions */}
        <button
          onClick={handleExport}
          disabled={exportLoading}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
        >
          {exportLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          Export PDF
        </button>
        <button
          onClick={handleNotionExport}
          disabled={notionLoading}
          className="flex items-center gap-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
        >
          {notionLoading
            ? <Loader2 className="size-3.5 animate-spin" />
            : <span className="text-[11px] font-black">N</span>
          }
          {notionUrl ? "Opened in Notion" : "Export to Notion"}
        </button>
        <button
          onClick={onLeave}
          className="flex items-center gap-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors"
        >
          <LogOut className="size-3.5" />
          Leave Room
        </button>
      </header>

      {/* ── THREE-COLUMN BODY ──────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* LEFT — Participants ────────────────────────────────────────── */}
        <aside className="w-[200px] flex-shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
              <Users className="size-3" /> Participants
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {participants.map(p => (
              <div key={p.user_id} className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-50">
                <Avatar name={p.user_name} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-700 truncate">
                    {p.user_id === user_id ? "You" : p.user_name}
                  </p>
                  <p className="text-[9px] text-slate-400">{timeAgo(p.last_seen)}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* CENTER — Messages ──────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {visibleMessages.length === 0 && !streaming && (
              <div className="flex flex-col items-center justify-center h-full text-center py-20">
                <MessageSquare className="size-10 text-slate-300 mb-3" />
                <p className="text-slate-500 font-semibold text-sm">Room is empty</p>
                <p className="text-slate-400 text-xs mt-1">Ask the first question below to get started</p>
              </div>
            )}

            {visibleMessages.map(msg => {
              const isOwn = msg.user_id === user_id;
              switch (msg.message_type) {
                case "query":
                  return <QueryBubble key={msg.id} msg={msg} isOwn={isOwn} />;
                case "agent_response":
                  return (
                    <AgentResponseCard
                      key={msg.id}
                      msg={msg}
                      upvoteCount={upvotes[msg.id] ?? 0}
                      hasUpvoted={myUpvotes.has(msg.id)}
                      onUpvote={handleUpvote}
                    />
                  );
                case "annotation":
                  return <AnnotationBubble key={msg.id} msg={msg} />;
                case "step_progress":
                  return <StepPill key={msg.id} step={(msg.metadata as Record<string, string>)?.step ?? "running"} />;
                case "system":
                  return <SystemMessage key={msg.id} msg={msg} />;
                case "error":
                  return (
                    <div key={msg.id} className="flex justify-center">
                      <span className="text-xs text-red-500 bg-red-50 border border-red-100 px-3 py-1 rounded-lg">{msg.content}</span>
                    </div>
                  );
                default:
                  return null;
              }
            })}

            {/* Streaming placeholder */}
            {streaming && <StreamingCard state={streaming} />}

            <div ref={messagesEndRef} />
          </div>

          {/* Input bar */}
          <div className="flex-shrink-0 border-t border-slate-200 bg-white px-4 py-3">
            <div className="flex items-end gap-2.5">
              <Avatar name={user_name} />
              <div className="flex-1 relative">
                <textarea
                  value={queryInput}
                  onChange={e => setQueryInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendQuery(); }
                  }}
                  placeholder="Ask the AI anything… (Enter to send, Shift+Enter for new line)"
                  rows={1}
                  disabled={isQuerying}
                  className="w-full resize-none px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/10 transition-all disabled:opacity-50 max-h-28 overflow-y-auto"
                  style={{ minHeight: "42px" }}
                />
              </div>
              <button
                onClick={sendQuery}
                disabled={isQuerying || !queryInput.trim()}
                className="flex-shrink-0 size-10 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl flex items-center justify-center transition-colors shadow-sm shadow-violet-600/20"
              >
                {isQuerying ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT — Annotations panel ──────────────────────────────────── */}
        <aside className="w-[280px] flex-shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
              <FileText className="size-3" /> Room Notes
            </p>
            <button
              onClick={() => setShowAnnot(v => !v)}
              className="flex items-center gap-1 text-[10px] font-semibold text-violet-600 hover:text-violet-700 transition-colors"
            >
              {showAnnot ? <X className="size-3" /> : <StickyNote className="size-3" />}
              {showAnnot ? "Cancel" : "Add Note"}
            </button>
          </div>

          {/* Add note input */}
          {showAnnot && (
            <div className="px-3 py-3 border-b border-slate-100 space-y-2">
              <textarea
                value={annotText}
                onChange={e => setAnnotText(e.target.value)}
                placeholder="Write a note for the room…"
                rows={3}
                className="w-full resize-none text-xs px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-slate-800 placeholder-amber-300 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/10 transition-all"
              />
              <button
                onClick={handleAnnotate}
                disabled={!annotText.trim()}
                className="w-full py-2 text-xs font-bold bg-amber-400 hover:bg-amber-500 disabled:opacity-50 text-white rounded-xl transition-colors"
              >
                Post Note
              </button>
            </div>
          )}

          {/* Notes list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {annotations.length === 0 ? (
              <div className="text-center py-10">
                <StickyNote className="size-8 text-slate-200 mx-auto mb-2" />
                <p className="text-xs text-slate-400">No notes yet</p>
                <p className="text-[10px] text-slate-300 mt-0.5">Add a note to share with the room</p>
              </div>
            ) : (
              annotations.map(a => (
                <div key={a.id} className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold text-amber-700">
                      {a.user_id === user_id ? "You" : a.user_name}
                    </p>
                    <p className="text-[9px] text-amber-400">{timeAgo(a.created_at)}</p>
                  </div>
                  <p className="text-xs text-amber-900 leading-relaxed">
                    {(a.metadata as Record<string, string>)?.annotation || a.content}
                  </p>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
