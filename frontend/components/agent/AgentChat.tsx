"use client";

// ── Web Speech API type declarations (not in default TS lib) ───────────────
declare global {
  interface Window {
    SpeechRecognition?:       new () => WebSpeechRecognition;
    webkitSpeechRecognition?: new () => WebSpeechRecognition;
  }
}

interface WebSpeechRecognition {
  lang:              string;
  interimResults:    boolean;
  maxAlternatives:   number;
  onresult:          ((e: WebSpeechRecognitionEvent) => void) | null;
  onerror:           ((e: Event) => void) | null;
  onend:             (() => void) | null;
  start():           void;
  stop():            void;
}

interface WebSpeechRecognitionEvent {
  results: Array<Array<{ transcript: string }>>;
}

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Download,
  Loader2,
  Mic,
  MicOff,
  RefreshCw,
  Send,
  Sparkles,
  Zap,
} from "lucide-react";
import toast from "react-hot-toast";
import { StreamingMessage } from "./StreamingMessage";
import { HumanInLoopButtons } from "./HumanInLoopButtons";
import { BiasHeatmap } from "./BiasHeatmap";
import type { BiasAnalysisData } from "./BiasHeatmap";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { StreamMessage, ValidatedSource } from "@/lib/types";

// ── Pipeline steps ─────────────────────────────────────────────────────────
const STEPS = [
  { key: "query_planner",    label: "Query Planning" },
  { key: "web_search",       label: "Web Search" },
  { key: "source_validator", label: "Validation" },
  { key: "insight_generator",label: "Generating Insights" },
];

function getStepIndex(step: string | null): number {
  if (!step) return -1;
  return STEPS.findIndex((s) => step.includes(s.key));
}

// ── Progress Stepper ──────────────────────────────────────────────────────
function ProgressStepper({ currentStep }: { currentStep: string | null }) {
  const activeIdx = getStepIndex(currentStep);

  return (
    <div className="flex items-center justify-between bg-white/90 backdrop-blur-sm border border-slate-200 rounded-xl px-6 py-3 shadow-sm">
      {STEPS.map((step, i) => {
        const done    = i < activeIdx;
        const active  = i === activeIdx;
        const pending = i > activeIdx;

        return (
          <div key={step.key} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              {/* Circle */}
              <div
                className={cn(
                  "size-8 rounded-full flex items-center justify-center font-bold text-sm transition-all",
                  done   && "bg-blue-600 text-white",
                  active && "bg-blue-600 text-white ring-4 ring-blue-100",
                  pending && "bg-slate-100 text-slate-400"
                )}
              >
                {done ? (
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : active ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  i + 1
                )}
              </div>
              {/* Label */}
              <span
                className={cn(
                  "text-[10px] font-semibold mt-1.5 whitespace-nowrap",
                  (done || active) ? "text-blue-600" : "text-slate-400"
                )}
              >
                {step.label}
              </span>
            </div>
            {/* Connector line */}
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-0.5 mx-2 rounded-full transition-all duration-500",
                  i < activeIdx ? "bg-blue-600" : "bg-slate-200"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Loading skeleton ─────────────────────────────────────────────────────
function MessageSkeleton() {
  return (
    <div className="bg-white border border-slate-200 border-l-4 border-l-blue-500 p-6 rounded-2xl space-y-3 shadow-sm animate-pulse">
      <div className="flex items-center gap-2">
        <div className="size-4 bg-blue-100 rounded" />
        <div className="h-3 w-40 bg-slate-100 rounded" />
      </div>
      <div className="space-y-2">
        <div className="h-3 bg-slate-100 rounded w-full" />
        <div className="h-3 bg-slate-100 rounded w-5/6" />
        <div className="h-3 bg-slate-100 rounded w-4/6" />
      </div>
      <div className="grid grid-cols-2 gap-3 pt-1">
        <div className="h-20 bg-slate-50 rounded-xl border border-slate-100" />
        <div className="h-20 bg-slate-50 rounded-xl border border-slate-100" />
      </div>
    </div>
  );
}

// ── Right info panel ─────────────────────────────────────────────────────
function RightPanel({
  threadId,
  isStreaming,
  currentStep,
  messages,
}: {
  threadId: string;
  isStreaming: boolean;
  currentStep: string | null;
  messages: StreamMessage[];
}) {
  // Extract validated sources from the latest answer message
  const latestAnswer = [...messages].reverse().find((m) => m.type === "answer");
  const sources = (latestAnswer?.sources as ValidatedSource[] | undefined) ?? [];

  // Extract key terms from insights
  const insights = (latestAnswer?.insights as string[] | undefined) ?? [];
  const keyTerms: string[] = insights
    .flatMap((ins) =>
      ins
        .split(/\s+/)
        .filter((w) => w.length > 5 && /^[A-Z]/.test(w))
        .slice(0, 2)
    )
    .slice(0, 8);

  return (
    <aside className="w-72 flex-shrink-0 flex flex-col gap-4 overflow-y-auto px-1 pb-4">
      {/* Key Entities */}
      {keyTerms.length > 0 && (
        <motion.section
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm"
        >
          <h3 className="text-xs font-bold text-slate-700 mb-3">Key Entities</h3>
          <div className="flex flex-wrap gap-1.5">
            {keyTerms.map((term, i) => (
              <span
                key={i}
                className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-[11px] font-semibold border border-slate-200"
              >
                {term}
              </span>
            ))}
          </div>
        </motion.section>
      )}

      {/* Validated Sources */}
      {sources.length > 0 && (
        <motion.section
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-2"
        >
          <h3 className="text-xs font-bold text-slate-700 px-1">Top Validated Sources</h3>
          {sources.slice(0, 4).map((src, i) => {
            const cred = src.credibility ?? 0;
            const credColor =
              cred >= 0.9 ? "text-emerald-600" : cred >= 0.7 ? "text-amber-600" : "text-slate-500";
            const shortName = (src.title ?? src.url ?? "?")
              .replace(/https?:\/\//i, "")
              .split(/[\s./]/)[0]
              .slice(0, 2)
              .toUpperCase();

            return (
              <div
                key={i}
                className="bg-white border border-slate-200 rounded-lg p-2.5 flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5">
                  <div className="size-8 bg-slate-100 rounded flex items-center justify-center text-[10px] font-bold text-slate-600 flex-shrink-0">
                    {shortName}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-700 truncate max-w-[110px]">
                      {src.title ?? src.url ?? `Source ${i + 1}`}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {cred >= 0.9 ? "Tier 1 • Global" : "Regional Focus"}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={cn("text-xs font-bold", credColor)}>
                    {Math.round(cred * 100)}%
                  </p>
                  <p className="text-[9px] text-slate-400 uppercase font-semibold">Rel.</p>
                </div>
              </div>
            );
          })}
        </motion.section>
      )}

      {/* Source Monitor widget */}
      <section className="bg-slate-900 text-slate-100 rounded-xl p-4 shadow-xl mt-auto">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-blue-300">
            Source Monitor
          </span>
          <RefreshCw
            className={cn(
              "size-3.5 text-slate-400",
              isStreaming && "animate-spin"
            )}
          />
        </div>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-[11px] text-slate-400">Status:</span>
            <span className="text-[11px] font-semibold text-slate-200">
              {isStreaming ? currentStep ?? "Initialising…" : "Standby"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[11px] text-slate-400">Thread ID:</span>
            <span className="text-[11px] font-mono text-slate-300 truncate max-w-[100px]">
              {threadId ? `${threadId.slice(0, 8)}…` : "——"}
            </span>
          </div>
          <div className="h-px bg-slate-700 my-1" />
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "size-2 rounded-full flex-shrink-0",
                isStreaming ? "bg-amber-400 animate-pulse" : "bg-emerald-400"
              )}
            />
            <span className="text-[10px] font-bold uppercase tracking-wide">
              {isStreaming ? "PROCESSING" : "SYSTEM STABLE"}
            </span>
          </div>
        </div>
      </section>
    </aside>
  );
}

// ── Welcome screen ────────────────────────────────────────────────────────
function WelcomeScreen({ onQuery }: { onQuery: (q: string) => void }) {
  const SUGGESTIONS = [
    "Analyze the current AI chip export restrictions to East Asia",
    "What is the latest sentiment around US Federal Reserve policy?",
    "Summarize global energy market trends for Q2 2026",
    "How is the media covering central bank digital currencies?",
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 text-center">
      <div className="size-14 bg-blue-50 border border-blue-100 rounded-2xl flex items-center justify-center mb-5">
        <Sparkles className="size-7 text-blue-600" />
      </div>
      <h2 className="text-xl font-bold text-slate-800 mb-2" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        News Intelligence Agent
      </h2>
      <p className="text-sm text-slate-500 leading-relaxed max-w-xs mb-8">
        Ask a question about any current event. The agent will search, validate, and synthesize insights from top sources.
      </p>
      <div className="w-full max-w-sm space-y-2">
        {SUGGESTIONS.map((q, i) => (
          <button
            key={i}
            onClick={() => onQuery(q)}
            className="w-full text-left text-xs text-slate-600 px-4 py-3 bg-white hover:bg-slate-50 border border-slate-200 hover:border-blue-200 rounded-xl transition-all group"
          >
            <span className="text-blue-500 mr-1.5 group-hover:mr-2 transition-all">→</span>
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── AgentChat Props ────────────────────────────────────────────────────────
interface AgentChatProps {
  messages: StreamMessage[];
  isStreaming: boolean;
  currentStep: string | null;
  isInterrupted: boolean;
  threadId: string;
  error: string | null;
  onSend: (query: string) => void;
  onAction: (action: string) => void;
}

// ── Main AgentChat Component ──────────────────────────────────────────────
export function AgentChat({
  messages,
  isStreaming,
  currentStep,
  isInterrupted,
  threadId,
  error,
  onSend,
  onAction,
}: AgentChatProps) {
  const [input, setInput]           = useState("");
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef               = useRef<HTMLDivElement>(null);
  const inputRef                     = useRef<HTMLInputElement>(null);
  const recognitionRef               = useRef<WebSpeechRecognition | null>(null);

  const hasMessages = messages.length > 0;

  // ── Auto-scroll ──────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  // ── Send handler ──────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const q = input.trim();
    if (!q || isStreaming) return;
    setInput("");
    onSend(q);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [input, isStreaming, onSend]);

  // ── Download PDF ──────────────────────────────────────────────────────
  const handleDownloadPDF = async (tid: string) => {
    try {
      await api.downloadPDFToFile("agent", tid);
      toast.success("PDF downloaded!");
    } catch {
      toast.error("PDF not ready yet.");
    }
  };

  // ── Voice input (Web Speech API) ─────────────────────────────────────
  const toggleMic = useCallback(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;

    if (!SR) {
      toast.error("Voice input is not supported in this browser.");
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SR();
    recognition.lang            = "en-US";
    recognition.interimResults  = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (e: WebSpeechRecognitionEvent) => {
      const transcript = e.results[0][0].transcript;
      setInput(transcript);
      setIsListening(false);
    };
    recognition.onerror = () => {
      setIsListening(false);
      toast.error("Voice recognition failed. Try again.");
    };
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening]);

  // ── Render message row ────────────────────────────────────────────────
  const renderMessage = (msg: StreamMessage, i: number) => {
    switch (msg.type) {
      case "query":
        return (
          <div key={i} className="flex justify-end">
            <motion.div
              initial={{ opacity: 0, x: 20, scale: 0.97 }}
              animate={{ opacity: 1, x: 0,  scale: 1 }}
              className="bg-blue-600 text-white px-5 py-3 rounded-2xl rounded-tr-sm max-w-[70%] shadow-sm shadow-blue-600/20"
            >
              <p className="text-sm leading-relaxed">{msg.content as string}</p>
            </motion.div>
          </div>
        );

      case "answer":
        return (
          <div key={i}>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/90 backdrop-blur-sm border border-slate-200 border-l-4 border-l-blue-500 p-6 rounded-2xl shadow-sm"
            >
              <StreamingMessage message={msg} />
            </motion.div>
          </div>
        );

      case "bias_result": {
        const biasData = msg.bias_analysis as BiasAnalysisData | undefined;
        if (!biasData) return null;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-slate-200 border-l-4 border-l-amber-400 p-6 rounded-2xl shadow-sm"
          >
            <BiasHeatmap data={biasData} />
          </motion.div>
        );
      }

      case "trend_result": {
        const trendData = msg.trend_data as Array<Record<string, unknown>> | undefined;
        if (!trendData?.length) return null;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-slate-200 border-l-4 border-l-emerald-500 p-6 rounded-2xl shadow-sm"
          >
            <h4 className="text-sm font-bold text-slate-800 mb-3">
              Story Timeline — Last 30 Days
            </h4>
            <div className="space-y-2">
              {trendData.slice(0, 8).map((item, ti) => (
                <div
                  key={ti}
                  className="flex items-start gap-3 text-xs text-slate-600"
                >
                  <span className="text-slate-400 font-mono flex-shrink-0">
                    {String(item.published_at ?? item.date ?? "").slice(0, 10)}
                  </span>
                  <span className="flex-1">
                    {String(item.title ?? item.description ?? "Article")}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        );
      }

      case "pdf_ready":
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4"
          >
            <div className="size-9 bg-emerald-100 rounded-lg flex items-center justify-center">
              <Download className="size-4 text-emerald-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-emerald-700">Report ready</p>
              <p className="text-xs text-emerald-600">Your intelligence report has been generated.</p>
            </div>
            <button
              onClick={() => handleDownloadPDF(threadId)}
              className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors active:scale-95"
            >
              Download
            </button>
          </motion.div>
        );

      case "interrupted": {
        // Only render buttons for the LAST interrupted message in the array.
        // Earlier ones are historical checkpoints — clicking them would re-send
        // a stale action and produce duplicate result cards.
        const lastInterruptedIdx = messages.map((m) => m.type).lastIndexOf("interrupted");
        if (i !== lastInterruptedIdx) return null;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <HumanInLoopButtons onAction={onAction} isLoading={isStreaming} />
          </motion.div>
        );
      }

      case "error":
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4"
          >
            <AlertCircle className="size-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-600">
              {(msg.content as string) ?? "An error occurred. Please try again."}
            </p>
          </motion.div>
        );

      default:
        return null;
    }
  };

  // ── Main render ──────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="size-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Zap className="size-4 text-white" />
          </div>
          <div>
            <h1
              className="text-lg font-bold text-slate-900 leading-none"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              News Intelligence Agent
            </h1>
            {hasMessages && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider">
                  Live Intelligence Stream
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Thread ref badge */}
          {hasMessages && (
            <span className="text-[11px] font-mono text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
              #{threadId ? threadId.slice(0, 8) : "……"}
            </span>
          )}
          {/* Generate Report shortcut */}
          <button
            onClick={() => onAction("generate_pdf")}
            disabled={!isInterrupted}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-full hover:bg-blue-700 transition-all active:scale-95 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="size-3.5" />
            Generate Report
          </button>
        </div>
      </header>

      {/* ── Content area ─────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── Chat column ─────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
            {/* Progress stepper (shown when streaming) */}
            <AnimatePresence>
              {isStreaming && (
                <motion.div
                  key="stepper"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <ProgressStepper currentStep={currentStep} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Welcome screen */}
            {!hasMessages && !isStreaming && (
              <WelcomeScreen onQuery={(q) => { setInput(q); setTimeout(() => inputRef.current?.focus(), 50); }} />
            )}

            {/* Messages */}
            <AnimatePresence initial={false}>
              {messages.map((msg, i) => renderMessage(msg, i))}
            </AnimatePresence>

            {/* Streaming skeleton */}
            <AnimatePresence>
              {isStreaming && messages.length > 0 && messages[messages.length - 1]?.type === "query" && (
                <motion.div
                  key="skeleton"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <MessageSkeleton />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Global error banner */}
            {error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3"
              >
                <AlertCircle className="size-4 text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-600">{error}</p>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── Input bar ─────────────────────────────────────────── */}
          <div className="flex-shrink-0 bg-white border-t border-slate-200 px-4 py-3">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-3 py-1.5 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
              {/* Mic button */}
              <button
                onClick={toggleMic}
                title={isListening ? "Stop recording" : "Voice input"}
                className={cn(
                  "size-8 flex items-center justify-center rounded-xl transition-all flex-shrink-0",
                  isListening
                    ? "bg-red-100 text-red-600 animate-pulse"
                    : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                )}
              >
                {isListening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
              </button>

              {/* Text input */}
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={
                  isStreaming
                    ? "Agent is working…"
                    : isInterrupted
                    ? "Choose an action above or ask a follow-up…"
                    : "Ask anything about current global events…"
                }
                disabled={isStreaming}
                className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none disabled:opacity-60"
              />

              {/* Send button */}
              <button
                onClick={handleSend}
                disabled={!input.trim() || isStreaming}
                className={cn(
                  "size-8 flex items-center justify-center rounded-xl transition-all flex-shrink-0",
                  input.trim() && !isStreaming
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-600/25 hover:bg-blue-700 active:scale-95"
                    : "bg-slate-100 text-slate-300 cursor-not-allowed"
                )}
              >
                {isStreaming ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
              </button>
            </div>
            <p className="text-center text-[10px] text-slate-400 mt-1.5">
              Press{" "}
              <kbd className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-500">
                Enter
              </kbd>{" "}
              to send · Click mic for voice input
            </p>
          </div>
        </div>

        {/* ── Right info panel ──────────────────────────────────────── */}
        <div className="flex-shrink-0 w-72 border-l border-slate-200 bg-white/80 px-4 py-5 hidden xl:flex flex-col gap-4 overflow-y-auto">
          <RightPanel
            threadId={threadId}
            isStreaming={isStreaming}
            currentStep={currentStep}
            messages={messages}
          />
        </div>
      </div>
    </div>
  );
}
