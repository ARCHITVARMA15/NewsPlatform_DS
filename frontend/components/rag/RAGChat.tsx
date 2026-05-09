"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Download,
  FileText,
  Globe,
  Globe2,
  Layers,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  Zap,
} from "lucide-react";
import toast from "react-hot-toast";
import { VoiceInput } from "@/components/shared/VoiceInput";
import { SourceCitations } from "./SourceCitations";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { Citation, PDFMetadata, StreamMessage } from "@/lib/types";

// ── RAG Pipeline steps ────────────────────────────────────────────────────
const RAG_STEPS = [
  { key: "retriever",      label: "Retrieving" },
  { key: "reranker",       label: "Reranking" },
  { key: "answer_gen",     label: "Answering" },
  { key: "citation_check", label: "Citations" },
];

type ClarifyMode = "hybrid" | "pdf_only" | "web_only";

// ── Progress Stepper ─────────────────────────────────────────────────────
function RAGStepper({ currentStep }: { currentStep: string | null }) {
  const activeIdx = currentStep
    ? RAG_STEPS.findIndex((s) => (currentStep ?? "").includes(s.key))
    : -1;

  return (
    <div className="flex items-center justify-between bg-white/90 backdrop-blur-sm border border-slate-200 rounded-xl px-6 py-3 shadow-sm">
      {RAG_STEPS.map((step, i) => {
        const done    = i < activeIdx;
        const active  = i === activeIdx;
        const pending = !done && !active;
        return (
          <div key={step.key} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "size-8 rounded-full flex items-center justify-center font-bold text-sm transition-all",
                  done    && "bg-violet-600 text-white",
                  active  && "bg-violet-600 text-white ring-4 ring-violet-100",
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
              <span className={cn(
                "text-[10px] font-semibold mt-1.5 whitespace-nowrap",
                (done || active) ? "text-violet-600" : "text-slate-400"
              )}>
                {step.label}
              </span>
            </div>
            {i < RAG_STEPS.length - 1 && (
              <div className={cn(
                "flex-1 h-0.5 mx-2 rounded-full transition-all duration-500",
                i < activeIdx ? "bg-violet-600" : "bg-slate-200"
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────
function RAGSkeleton() {
  return (
    <div className="bg-white border border-slate-200 border-l-4 border-l-violet-500 p-6 rounded-2xl space-y-3 shadow-sm animate-pulse">
      <div className="flex items-center gap-2">
        <div className="size-4 bg-violet-100 rounded" />
        <div className="h-3 w-32 bg-slate-100 rounded" />
      </div>
      <div className="space-y-2">
        <div className="h-3 bg-slate-100 rounded w-full" />
        <div className="h-3 bg-slate-100 rounded w-5/6" />
        <div className="h-3 bg-slate-100 rounded w-3/4" />
      </div>
      <div className="flex gap-2 pt-1">
        <div className="h-5 w-16 bg-blue-50 rounded-full" />
        <div className="h-5 w-14 bg-emerald-50 rounded-full" />
      </div>
    </div>
  );
}

// ── Mode indicator ────────────────────────────────────────────────────────
function ModeIndicator({ mode, hasPDF }: { mode: ClarifyMode; hasPDF: boolean }) {
  const config = {
    hybrid:   { icon: Layers,   label: "Hybrid Mode",   color: "text-violet-700", bg: "bg-violet-50 border-violet-200" },
    pdf_only: { icon: FileText, label: "PDF Only",      color: "text-blue-700",   bg: "bg-blue-50 border-blue-200"     },
    web_only: { icon: Globe,    label: "Web Only",      color: "text-emerald-700",bg: "bg-emerald-50 border-emerald-200"},
  };
  const active = hasPDF ? config[mode] : config.web_only;
  const Icon   = active.icon;

  return (
    <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold", active.color, active.bg)}>
      <Icon className="size-3.5" />
      {active.label}
    </div>
  );
}

// ── RAG HITL Action Buttons ──────────────────────────────────────────────
function RAGActionButtons({
  onAction,
  isLoading,
  hasPDF,
}: {
  onAction: (action: string) => void;
  isLoading: boolean;
  hasPDF: boolean;
}) {
  const ACTIONS = [
    {
      id:        "generate_report",
      label:     "Generate Report",
      icon:      FileText,
      tooltip:   "Generate a structured PDF research report",
      baseClass: "border-violet-200 text-violet-700 hover:bg-violet-50",
    },
    ...(hasPDF ? [{
      id:        "clarify_pdf",
      label:     "PDF Only",
      icon:      BookOpen,
      tooltip:   "Answer using only the uploaded PDF document",
      baseClass: "border-blue-200 text-blue-700 hover:bg-blue-50",
    }] : []),
    {
      id:        "clarify_web",
      label:     "Web Only",
      icon:      Globe2,
      tooltip:   "Answer using only live web search results",
      baseClass: "border-emerald-200 text-emerald-700 hover:bg-emerald-50",
    },
    {
      id:        "end",
      label:     "Done",
      icon:      CheckCircle2,
      tooltip:   "End this RAG session",
      baseClass: "bg-violet-600 text-white border-violet-600 hover:bg-violet-700",
    },
  ];

  const containerVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
  };
  const itemVariants = {
    hidden:  { opacity: 0, y: 14, scale: 0.95 },
    visible: { opacity: 1, y: 0,  scale: 1, transition: { type: "spring" as const, damping: 18, stiffness: 280 } },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="flex flex-wrap gap-2 pt-4 mt-2 border-t border-slate-200 justify-center"
    >
      {ACTIONS.map((action) => (
        <motion.div key={action.id} variants={itemVariants}>
          <button
            title={action.tooltip}
            onClick={() => onAction(action.id)}
            disabled={isLoading}
            className={cn(
              "flex items-center gap-2 px-5 py-2 border rounded-full text-sm font-semibold bg-white",
              "transition-all active:scale-95 shadow-sm hover:shadow",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              action.baseClass
            )}
          >
            <action.icon className="size-3.5" />
            {action.label}
          </button>
        </motion.div>
      ))}
    </motion.div>
  );
}

// ── Welcome screen ────────────────────────────────────────────────────────
function RAGWelcome({ hasPDF, pdfName, onQuery }: {
  hasPDF: boolean;
  pdfName?: string;
  onQuery: (q: string) => void;
}) {
  const suggestions = hasPDF ? [
    `What are the key headlines in ${pdfName ?? "this document"}?`,
    "Summarise the main stories in this edition",
    "What opinions are expressed in this paper?",
    "Compare the stories in this PDF with current web news",
  ] : [
    "Summarise the latest AI policy developments",
    "What are the top global economic headlines today?",
    "Explain the current situation in the South China Sea",
    "What is the latest on central bank interest rate decisions?",
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 text-center">
      <div className="size-14 bg-violet-50 border border-violet-100 rounded-2xl flex items-center justify-center mb-5">
        {hasPDF ? (
          <FileText className="size-7 text-violet-600" />
        ) : (
          <Sparkles className="size-7 text-violet-600" />
        )}
      </div>
      <h2
        className="text-xl font-bold text-slate-800 mb-2"
        style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
      >
        {hasPDF ? "PDF + Web Intelligence" : "RAG Research Agent"}
      </h2>
      <p className="text-sm text-slate-500 leading-relaxed max-w-xs mb-8">
        {hasPDF
          ? `${pdfName ?? "Your PDF"} is ready. Ask questions and get answers grounded in both the document and live web sources.`
          : "Ask any research question. I'll search and synthesise from top web sources, with full citations."
        }
      </p>
      <div className="w-full max-w-sm space-y-2">
        {suggestions.map((q, i) => (
          <button
            key={i}
            onClick={() => onQuery(q)}
            className="w-full text-left text-xs text-slate-600 px-4 py-3 bg-white hover:bg-slate-50 border border-slate-200 hover:border-violet-200 rounded-xl transition-all group"
          >
            <span className="text-violet-500 mr-1.5 group-hover:mr-2 transition-all">→</span>
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────
interface RAGChatProps {
  messages: StreamMessage[];
  isStreaming: boolean;
  currentStep: string | null;
  isInterrupted: boolean;
  threadId: string;
  error: string | null;
  activePDF: PDFMetadata | null;
  onSend: (query: string) => void;
  onAction: (action: string) => void;
}

// ── Main RAGChat component ────────────────────────────────────────────────
export function RAGChat({
  messages,
  isStreaming,
  currentStep,
  isInterrupted,
  threadId,
  error,
  activePDF,
  onSend,
  onAction,
}: RAGChatProps) {
  const [input, setInput]     = useState("");
  const messagesEndRef        = useRef<HTMLDivElement>(null);
  const inputRef              = useRef<HTMLInputElement>(null);
  const hasMessages           = messages.length > 0;

  // Infer clarify mode from latest answer message
  const latestAnswer = [...messages].reverse().find((m) => m.type === "answer");
  const clarifyMode  = (latestAnswer?.clarify_mode as ClarifyMode | undefined) ?? "hybrid";

  // ── Auto-scroll ────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  // ── Send ────────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const q = input.trim();
    if (!q || isStreaming) return;
    setInput("");
    onSend(q);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [input, isStreaming, onSend]);

  // ── Download PDF report ─────────────────────────────────────────────
  const handleDownload = async (tid: string) => {
    try {
      await api.downloadPDFToFile("rag", tid);
      toast.success("Report downloaded!");
    } catch {
      toast.error("Report not ready yet.");
    }
  };

  // ── Render each message ─────────────────────────────────────────────
  const renderMessage = (msg: StreamMessage, i: number) => {
    switch (msg.type) {
      case "query":
        return (
          <div key={i} className="flex justify-end">
            <motion.div
              initial={{ opacity: 0, x: 20, scale: 0.97 }}
              animate={{ opacity: 1, x: 0,  scale: 1 }}
              className="bg-violet-600 text-white px-5 py-3 rounded-2xl rounded-tr-sm max-w-[70%] shadow-sm shadow-violet-600/20"
            >
              <p className="text-sm leading-relaxed">{msg.content as string}</p>
            </motion.div>
          </div>
        );

      case "answer": {
        const citations = (msg.citations as Citation[] | undefined) ?? [];
        const answer    = (msg.answer as string) ?? "";
        const sourceType: ClarifyMode = (msg.clarify_mode as ClarifyMode | undefined) ?? "hybrid";

        return (
          <div key={i}>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/90 backdrop-blur-sm border border-slate-200 border-l-4 border-l-violet-500 p-6 rounded-2xl shadow-sm"
            >
              {/* Answer header */}
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="size-4 text-violet-600" />
                <span className="text-xs font-bold text-violet-700 uppercase tracking-widest">
                  Grounded Answer
                </span>
                <div className="ml-auto">
                  <ModeIndicator mode={sourceType} hasPDF={!!activePDF} />
                </div>
              </div>

              {/* Answer text */}
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                {answer}
              </p>

              {/* Source citations */}
              <SourceCitations citations={citations} />
            </motion.div>
          </div>
        );
      }

      case "pdf_ingested":
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl p-3"
          >
            <CheckCircle2 className="size-4 text-blue-500 flex-shrink-0" />
            <p className="text-xs font-semibold text-blue-700">
              PDF ingested — {msg.chunk_count as number ?? 0} chunks embedded and ready.
            </p>
          </motion.div>
        );

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
              <p className="text-sm font-semibold text-emerald-700">Research report ready</p>
              <p className="text-xs text-emerald-600">Your grounded research report has been generated.</p>
            </div>
            <button
              onClick={() => handleDownload(threadId)}
              className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors active:scale-95"
            >
              Download
            </button>
          </motion.div>
        );

      case "interrupted":
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <RAGActionButtons
              onAction={onAction}
              isLoading={isStreaming}
              hasPDF={!!activePDF}
            />
          </motion.div>
        );

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

  // ── Main render ────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="size-8 bg-violet-600 rounded-lg flex items-center justify-center">
            <BookOpen className="size-4 text-white" />
          </div>
          <div>
            <h1
              className="text-lg font-bold text-slate-900 leading-none"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              RAG Research Agent
            </h1>
            {hasMessages && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="size-1.5 rounded-full bg-violet-500 animate-pulse" />
                <span className="text-[10px] font-semibold text-violet-600 uppercase tracking-wider">
                  Live Research Stream
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasMessages && (
            <span className="text-[11px] font-mono text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
              #{threadId ? threadId.slice(0, 8) : "……"}
            </span>
          )}
          {hasMessages && (
            <ModeIndicator mode={clarifyMode} hasPDF={!!activePDF} />
          )}
          <button
            onClick={() => onAction("generate_report")}
            disabled={!isInterrupted}
            className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white text-xs font-bold rounded-full hover:bg-violet-700 transition-all active:scale-95 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="size-3.5" />
            Generate Report
          </button>
        </div>
      </header>

      {/* ── Content area ──────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── Chat column ──────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
            {/* Progress stepper */}
            <AnimatePresence>
              {isStreaming && (
                <motion.div
                  key="stepper"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <RAGStepper currentStep={currentStep} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Welcome */}
            {!hasMessages && !isStreaming && (
              <RAGWelcome
                hasPDF={!!activePDF}
                pdfName={activePDF?.filename}
                onQuery={(q) => {
                  setInput(q);
                  setTimeout(() => inputRef.current?.focus(), 50);
                }}
              />
            )}

            {/* Messages */}
            <AnimatePresence initial={false}>
              {messages.map((msg, i) => renderMessage(msg, i))}
            </AnimatePresence>

            {/* Streaming skeleton */}
            <AnimatePresence>
              {isStreaming &&
                messages.length > 0 &&
                messages[messages.length - 1]?.type === "query" && (
                  <motion.div
                    key="skeleton"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <RAGSkeleton />
                  </motion.div>
                )}
            </AnimatePresence>

            {/* HITL buttons if interrupted and not already rendered via message */}
            {isInterrupted && messages[messages.length - 1]?.type !== "interrupted" && (
              <RAGActionButtons
                onAction={onAction}
                isLoading={isStreaming}
                hasPDF={!!activePDF}
              />
            )}

            {/* Error banner */}
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

          {/* ── Input bar ───────────────────────────────────────── */}
          <div className="flex-shrink-0 bg-white border-t border-slate-200 px-4 py-3">
            {/* PDF active indicator */}
            {activePDF && (
              <div className="flex items-center gap-1.5 mb-2">
                <FileText className="size-3 text-blue-500" />
                <span className="text-[10px] font-semibold text-blue-600">
                  {activePDF.filename}
                </span>
                <span className="text-[10px] text-slate-400">is active</span>
              </div>
            )}

            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-3 py-1.5 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100 transition-all">
              <VoiceInput
                onTranscript={(t) => {
                  setInput(t);
                  setTimeout(() => inputRef.current?.focus(), 50);
                }}
                disabled={isStreaming}
              />

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
                    ? "Agent is researching…"
                    : isInterrupted
                    ? "Choose an action above or ask a follow-up…"
                    : activePDF
                    ? `Ask about ${activePDF.filename} or the web…`
                    : "Ask any research question…"
                }
                disabled={isStreaming}
                className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none disabled:opacity-60"
              />

              <button
                onClick={handleSend}
                disabled={!input.trim() || isStreaming}
                className={cn(
                  "size-8 flex items-center justify-center rounded-xl transition-all flex-shrink-0",
                  input.trim() && !isStreaming
                    ? "bg-violet-600 text-white shadow-sm hover:bg-violet-700 active:scale-95"
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
              <kbd className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-500">Enter</kbd>{" "}
              to send · Click mic for voice input
            </p>
          </div>
        </div>

        {/* ── Right info panel ─────────────────────────────────── */}
        <div className="hidden xl:flex flex-col w-72 flex-shrink-0 border-l border-slate-200 bg-white/80 px-4 py-5 gap-4 overflow-y-auto">
          {/* PDF Status */}
          {activePDF && (
            <motion.section
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-blue-50 border border-blue-200 rounded-xl p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <FileText className="size-4 text-blue-600" />
                <span className="text-xs font-bold text-blue-700">Active Document</span>
              </div>
              <p className="text-xs font-semibold text-slate-700 truncate">{activePDF.filename}</p>
              <div className="flex gap-3 mt-2">
                <div className="text-center">
                  <p className="text-lg font-bold text-blue-600">{activePDF.page_count}</p>
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">Pages</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-blue-600">{activePDF.chunk_count}</p>
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">Chunks</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-blue-600">{activePDF.file_size_kb.toFixed(0)}</p>
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">KB</p>
                </div>
              </div>
            </motion.section>
          )}

          {/* Session monitor */}
          <section className="bg-slate-900 text-slate-100 rounded-xl p-4 shadow-xl mt-auto">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-violet-300">
                Research Monitor
              </span>
              <RefreshCw className={cn("size-3.5 text-slate-400", isStreaming && "animate-spin")} />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-[11px] text-slate-400">Mode:</span>
                <span className="text-[11px] font-semibold text-slate-200 capitalize">
                  {activePDF ? clarifyMode.replace("_", " ") : "Web Only"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[11px] text-slate-400">Thread:</span>
                <span className="text-[11px] font-mono text-slate-300 truncate max-w-[100px]">
                  {threadId ? `${threadId.slice(0, 8)}…` : "——"}
                </span>
              </div>
              <div className="h-px bg-slate-700 my-1" />
              <div className="flex items-center gap-2">
                <span className={cn(
                  "size-2 rounded-full flex-shrink-0",
                  isStreaming ? "bg-amber-400 animate-pulse" : "bg-emerald-400"
                )} />
                <span className="text-[10px] font-bold uppercase tracking-wide">
                  {isStreaming ? "RESEARCHING" : "SYSTEM STABLE"}
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
