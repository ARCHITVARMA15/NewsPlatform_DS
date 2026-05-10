"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Loader2, Send, User2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Citation {
  chunk_id:  string;
  label:     string;
  text:      string;
  similarity_score?: number;
}

interface ChatMessage {
  id:         string;
  role:       "user" | "assistant";
  content:    string;
  citations?: Citation[];
  isStreaming?: boolean;
}

interface ChatAreaProps {
  messages:       ChatMessage[];
  isStreaming:    boolean;
  onSend:         (query: string) => void;
  onExportPDF:    () => void;
  hasPDF?:        boolean;
}

export function ChatArea({ messages, isStreaming, onSend, onExportPDF, hasPDF }: ChatAreaProps) {
  const [input, setInput]       = useState("");
  const [hoveredCitation, setHoveredCitation] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    setInput("");
    onSend(trimmed);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="size-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-sm font-semibold text-white">Chat with Broadcast</span>
        </div>
        {hasPDF && (
          <button
            onClick={onExportPDF}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white border border-slate-600/50 hover:border-violet-500/50 rounded-lg transition-all"
          >
            <Download className="size-3.5" />
            Export PDF
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
        {messages.length === 0 && (
          <div className="text-center text-slate-500 text-sm py-12">
            <p className="text-2xl mb-2">💬</p>
            <p>Ask anything about the broadcast transcript.</p>
            <p className="text-xs mt-1 text-slate-600">Answers are grounded in transcript segments.</p>
          </div>
        )}

        {messages.map(msg => (
          <div
            key={msg.id}
            className={cn(
              "flex gap-3",
              msg.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            {msg.role === "assistant" && (
              <div className="size-7 rounded-full bg-violet-600/30 border border-violet-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-violet-300 text-xs font-bold">AI</span>
              </div>
            )}

            <div className={cn(
              "max-w-[80%] space-y-2",
              msg.role === "user" && "items-end flex flex-col"
            )}>
              {/* Bubble */}
              <div className={cn(
                "px-4 py-3 rounded-2xl text-sm leading-relaxed",
                msg.role === "user"
                  ? "bg-violet-600 text-white rounded-br-sm"
                  : "bg-slate-800 border border-slate-700/50 text-slate-100 rounded-bl-sm",
                msg.isStreaming && "streaming-cursor"
              )}>
                {msg.content || (msg.isStreaming ? "" : "…")}
              </div>

              {/* Citations */}
              {msg.citations && msg.citations.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {msg.citations.map((c, i) => (
                    <div key={i} className="relative">
                      <button
                        onMouseEnter={() => setHoveredCitation(c.chunk_id)}
                        onMouseLeave={() => setHoveredCitation(null)}
                        className="px-2 py-0.5 bg-violet-500/15 border border-violet-500/20 text-violet-300 rounded text-[10px] font-mono hover:bg-violet-500/25 transition-colors"
                      >
                        {c.label}
                      </button>

                      {/* Citation tooltip */}
                      {hoveredCitation === c.chunk_id && (
                        <div className="absolute bottom-full left-0 mb-1 w-64 bg-slate-900 border border-slate-700 rounded-lg p-2.5 shadow-xl z-20 text-xs text-slate-300 leading-relaxed">
                          <p className="font-semibold text-violet-400 mb-1">{c.label}</p>
                          <p className="line-clamp-4">{c.text}</p>
                          {c.similarity_score !== undefined && (
                            <p className="text-slate-500 mt-1">
                              Relevance: {(c.similarity_score * 100).toFixed(0)}%
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {msg.role === "user" && (
              <div className="size-7 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                <User2 className="size-3.5 text-slate-300" />
              </div>
            )}
          </div>
        ))}

        {/* Streaming indicator */}
        {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex gap-3">
            <div className="size-7 rounded-full bg-violet-600/30 border border-violet-500/30 flex items-center justify-center flex-shrink-0">
              <span className="text-violet-300 text-xs font-bold">AI</span>
            </div>
            <div className="bg-slate-800 border border-slate-700/50 rounded-2xl rounded-bl-sm px-4 py-3">
              <Loader2 className="size-4 text-violet-400 animate-spin" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="flex-shrink-0 border-t border-slate-700/50 p-4">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask about this broadcast…"
            rows={2}
            disabled={isStreaming}
            className="flex-1 px-4 py-3 bg-slate-800/80 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 text-sm resize-none focus:outline-none focus:border-violet-500/70 disabled:opacity-50 transition-all"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="size-11 flex-shrink-0 flex items-center justify-center bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-all active:scale-95"
          >
            {isStreaming
              ? <Loader2 className="size-4 animate-spin" />
              : <Send className="size-4" />
            }
          </button>
        </div>
        <p className="text-xs text-slate-600 mt-1.5 text-center">
          Press Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
