"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bookmark,
  FileSearch,
  Globe2,
  HelpCircle,
  LayoutDashboard,
  Settings,
  Zap,
} from "lucide-react";
import { useAgentStream } from "@/lib/streaming";
import type { PDFMetadata } from "@/lib/types";
import { RAGChat } from "@/components/rag/RAGChat";
import { PDFUploader } from "@/components/rag/PDFUploader";
import { ThreadHistory } from "@/components/shared/ThreadHistory";
import { cn } from "@/lib/utils";

// ── Sidebar nav ───────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Intelligence Feed" },
  { href: "/agent",     icon: Zap,             label: "News Agent" },
  { href: "/rag",       icon: FileSearch,      label: "RAG Chatbot" },
  { href: "#",          icon: Bookmark,        label: "Saved Insights" },
];

export default function RAGPage() {
  const pathname = usePathname();

  // ── Stream hook ────────────────────────────────────────────────────
  const {
    messages,
    isStreaming,
    currentStep,
    isInterrupted,
    threadId,
    error,
    startStream,
    sendAction,
    loadHistory,
    resetSession,
  } = useAgentStream("rag");

  // ── PDF state ──────────────────────────────────────────────────────
  const [activePDF, setActivePDF] = useState<PDFMetadata | null>(null);

  // When a PDF is uploaded, update the threadId inside the hook by
  // linking the PDF's thread to our current stream session
  const handlePDFReady = (meta: PDFMetadata) => {
    setActivePDF(meta);
  };

  const handlePDFRemoved = () => {
    setActivePDF(null);
  };

  // ── Start stream, injecting has_pdf flag ───────────────────────────
  const handleSend = (query: string) => {
    const tid = activePDF?.thread_id ?? threadId;
    startStream(query, tid, !!activePDF);
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">

      {/* ── Left Sidebar ─────────────────────────────────────────────── */}
      <aside className="w-[260px] flex-shrink-0 bg-white border-r border-slate-200 flex flex-col h-full overflow-hidden">

        {/* Brand */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="size-9 bg-violet-600 rounded-xl flex items-center justify-center shadow-sm shadow-violet-600/20 flex-shrink-0">
            <Globe2 className="size-4 text-white" />
          </div>
          <div>
            <p
              className="text-sm font-bold text-slate-900 leading-none"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              NewsIntel AI
            </p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mt-0.5">
              RAG Research
            </p>
          </div>
        </div>

        {/* Thread history */}
        <div className="flex-1 flex flex-col overflow-hidden py-3">
          <p className="px-5 text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            Research Sessions
          </p>
          <ThreadHistory
            agentType="rag"
            currentThreadId={activePDF?.thread_id ?? threadId}
            onSelect={(tid) => {
              setActivePDF(null);
              loadHistory(tid);
            }}
            onNew={() => {
              setActivePDF(null);
              resetSession();
            }}
          />
        </div>

        {/* Bottom nav */}
        <div className="border-t border-slate-100 flex-shrink-0">
          <nav className="px-3 py-3 space-y-0.5">
            {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={label}
                  href={href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                    isActive
                      ? "bg-violet-600/10 text-violet-700 font-semibold"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                  )}
                >
                  <Icon className="size-4 flex-shrink-0" />
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-slate-100 px-3 py-2 space-y-0.5">
            <Link
              href="#"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
            >
              <Settings className="size-4 flex-shrink-0" />
              Settings
            </Link>
            <Link
              href="#"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
            >
              <HelpCircle className="size-4 flex-shrink-0" />
              Support
            </Link>
          </div>
        </div>
      </aside>

      {/* ── Main Area ─────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* PDF Uploader — collapsible banner above chat */}
        <div className="flex-shrink-0 px-4 pt-3 pb-0">
          <PDFUploader
            threadId={activePDF?.thread_id ?? threadId}
            onPDFReady={handlePDFReady}
            onPDFRemoved={handlePDFRemoved}
            activePDF={activePDF}
          />
        </div>

        {/* RAG Chat */}
        <div className="flex-1 overflow-hidden">
          <RAGChat
            messages={messages}
            isStreaming={isStreaming}
            currentStep={currentStep}
            isInterrupted={isInterrupted}
            threadId={activePDF?.thread_id ?? threadId}
            error={error}
            activePDF={activePDF}
            onSend={handleSend}
            onAction={sendAction}
          />
        </div>
      </main>
    </div>
  );
}
