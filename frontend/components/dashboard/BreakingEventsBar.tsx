"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Radio, Wifi, WifiOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────
interface ArticlePreview {
  title:  string;
  source: string;
}

interface BreakingEvent {
  id:               string;
  event_name:       string;
  description:      string;
  category:         string;
  urgency:          "BREAKING" | "HIGH" | "MEDIUM";
  key_entities:     string[];
  article_count:    number;
  article_ids:      string[];
  articles_preview: ArticlePreview[];
  detected_at:      string;
}

// ── Helpers ────────────────────────────────────────────────────────────────
const BASE_URL =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000")
    : "http://localhost:8000";

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function playChime() {
  try {
    const ctx  = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type            = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
  } catch { /* AudioContext unavailable — skip */ }
}

// ── Urgency config ─────────────────────────────────────────────────────────
const URGENCY_CONFIG = {
  BREAKING: {
    bar:   "bg-red-600",
    badge: "bg-red-600 text-white animate-pulse",
    text:  "text-red-700",
    border:"border-red-200",
    card:  "bg-red-50 border-red-200",
  },
  HIGH: {
    bar:   "bg-orange-500",
    badge: "bg-orange-500 text-white",
    text:  "text-orange-700",
    border:"border-orange-200",
    card:  "bg-orange-50 border-orange-200",
  },
  MEDIUM: {
    bar:   "bg-yellow-400",
    badge: "bg-yellow-400 text-yellow-900",
    text:  "text-yellow-700",
    border:"border-yellow-200",
    card:  "bg-yellow-50 border-yellow-200",
  },
} as const;

// ── Component ──────────────────────────────────────────────────────────────
export function BreakingEventsBar() {
  const [events,        setEvents]        = useState<BreakingEvent[]>([]);
  const [isExpanded,    setIsExpanded]    = useState(false);
  const [isConnected,   setIsConnected]   = useState(false);
  const [newEventCount, setNewEventCount] = useState(0);

  const abortRef = useRef<AbortController | null>(null);

  // ── Initial fetch ────────────────────────────────────────────────────────
  const fetchLatest = useCallback(async () => {
    try {
      const res  = await fetch(`${BASE_URL}/api/events/latest`);
      const data = await res.json();
      const evts: BreakingEvent[] = (data.events ?? []).sort(
        (a: BreakingEvent, b: BreakingEvent) =>
          new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime()
      );
      setEvents(evts);
    } catch { /* silent — SSE will deliver events anyway */ }
  }, []);

  // ── SSE stream ────────────────────────────────────────────────────────────
  const openStream = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    try {
      const response = await fetch(`${BASE_URL}/api/events/stream`, {
        signal: abortRef.current.signal,
      });

      if (!response.ok || !response.body) return;
      setIsConnected(true);

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed) continue;
          const jsonStr = trimmed.startsWith("data: ") ? trimmed.slice(6) : trimmed;
          let parsed: { event: string; data: BreakingEvent };
          try { parsed = JSON.parse(jsonStr); } catch { continue; }

          if (parsed.event === "new_event" && parsed.data?.id) {
            setEvents(prev => {
              // Avoid duplicates from the initial flush
              if (prev.some(e => e.id === parsed.data.id)) return prev;
              playChime();
              return [parsed.data, ...prev];
            });
            setNewEventCount(n => n + 1);
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        setIsConnected(false);
        // Reconnect after 10s on unexpected disconnect
        setTimeout(openStream, 10_000);
      }
    } finally {
      setIsConnected(false);
    }
  }, []);

  useEffect(() => {
    fetchLatest();
    openStream();
    return () => { abortRef.current?.abort(); };
  }, [fetchLatest, openStream]);

  // ── Reset unread count on expand ─────────────────────────────────────────
  const handleExpand = useCallback(() => {
    setIsExpanded(v => !v);
    setNewEventCount(0);
  }, []);

  // ── Hidden when no events ─────────────────────────────────────────────────
  if (events.length === 0) return null;

  const newest = events[0];
  const urgencyCfg = URGENCY_CONFIG[newest.urgency] ?? URGENCY_CONFIG.HIGH;

  // =========================================================================
  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm mb-2">

      {/* ── COLLAPSED BAR ──────────────────────────────────────────────── */}
      <button
        onClick={handleExpand}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left",
          isExpanded ? "bg-slate-900" : "bg-slate-900 hover:bg-slate-800"
        )}
      >
        {/* Left: live indicator */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping" />
            <span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-red-400">Live</span>
        </div>

        {/* Divider */}
        <span className="text-slate-600 text-xs">|</span>

        {/* Count badge */}
        <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0">
          {events.length} Breaking Event{events.length !== 1 ? "s" : ""} Detected
        </span>

        {/* Newest event name */}
        <span className="text-white text-xs font-semibold truncate flex-1">
          {newest.event_name}
        </span>

        {/* Unread badge */}
        {newEventCount > 0 && !isExpanded && (
          <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0">
            +{newEventCount} new
          </span>
        )}

        {/* Connection indicator */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {isConnected
            ? <Wifi    className="size-3 text-emerald-400" />
            : <WifiOff className="size-3 text-slate-500"   />
          }
        </div>

        {/* Expand chevron */}
        <span className="text-slate-400 flex-shrink-0">
          {isExpanded
            ? <ChevronUp   className="size-4" />
            : <ChevronDown className="size-4" />
          }
        </span>
      </button>

      {/* ── EXPANDED CARDS ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden bg-white"
          >
            <div className="p-4 space-y-3 max-h-[520px] overflow-y-auto">
              {events.map(event => {
                const cfg = URGENCY_CONFIG[event.urgency] ?? URGENCY_CONFIG.HIGH;
                return (
                  <div
                    key={event.id}
                    className={cn(
                      "rounded-xl border p-4 space-y-3",
                      cfg.card
                    )}
                  >
                    {/* Top row */}
                    <div className="flex items-start gap-3">
                      {/* Urgency badge */}
                      <span className={cn(
                        "flex-shrink-0 text-[10px] font-bold uppercase px-2.5 py-1 rounded-full tracking-wide",
                        cfg.badge
                      )}>
                        {event.urgency === "BREAKING" && (
                          <AlertTriangle className="inline size-2.5 mr-1 -mt-0.5" />
                        )}
                        {event.urgency}
                      </span>

                      {/* Name + description */}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-slate-900 leading-snug">
                          {event.event_name}
                        </p>
                        <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                          {event.description}
                        </p>
                      </div>

                      {/* Right: article count + time */}
                      <div className="flex-shrink-0 text-right space-y-1">
                        <p className="text-xs font-semibold text-slate-700">
                          {event.article_count} articles
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {timeAgo(event.detected_at)}
                        </p>
                      </div>
                    </div>

                    {/* Category + entities */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 tracking-wide">
                        {event.category}
                      </span>
                      {event.key_entities.slice(0, 4).map(entity => (
                        <span
                          key={entity}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-500"
                        >
                          {entity}
                        </span>
                      ))}
                    </div>

                    {/* Article previews */}
                    {event.articles_preview.length > 0 && (
                      <div className="space-y-1.5 pt-1 border-t border-black/5">
                        {event.articles_preview.map((a, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <span className="text-[9px] text-slate-400 font-bold mt-0.5 flex-shrink-0">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <p className="text-[11px] text-slate-600 leading-snug line-clamp-1">
                              {a.title}
                              {a.source && (
                                <span className="text-slate-400 ml-1">· {a.source}</span>
                              )}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Collapse button */}
            <button
              onClick={handleExpand}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-slate-50 border-t border-slate-200 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <ChevronUp className="size-3.5" />
              Collapse
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
