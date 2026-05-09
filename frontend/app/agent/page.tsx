"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bookmark,
  FileSearch,
  Globe2,
  LayoutDashboard,
  Settings,
  HelpCircle,
  Zap,
} from "lucide-react";
import { useAgentStream } from "@/lib/streaming";
import { AgentChat } from "@/components/agent/AgentChat";
import { ThreadHistory } from "@/components/shared/ThreadHistory";
import { cn } from "@/lib/utils";

// ── Nav items ─────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Intelligence Feed" },
  { href: "/agent",     icon: Zap,             label: "Active Threads" },
  { href: "/rag",       icon: FileSearch,      label: "RAG Chatbot" },
  { href: "#",          icon: Bookmark,        label: "Saved Insights" },
];

export default function AgentPage() {
  const pathname = usePathname();

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
  } = useAgentStream("agent");

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">

      {/* ── Left Sidebar ──────────────────────────────────────────────── */}
      <aside className="w-[260px] flex-shrink-0 bg-white border-r border-slate-200 flex flex-col h-full overflow-hidden">

        {/* Brand */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="size-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-sm shadow-blue-600/20 flex-shrink-0">
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
              Enterprise Tier
            </p>
          </div>
        </div>

        {/* Thread history */}
        <div className="flex-1 flex flex-col overflow-hidden py-3">
          <p className="px-5 text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            Investigations
          </p>
          <ThreadHistory
            agentType="agent"
            currentThreadId={threadId}
            onSelect={(tid) => loadHistory(tid)}
            onNew={() => resetSession()}
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
                      ? "bg-blue-600/10 text-blue-700 font-semibold"
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

      {/* ── Main Chat Area ─────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <AgentChat
          messages={messages}
          isStreaming={isStreaming}
          currentStep={currentStep}
          isInterrupted={isInterrupted}
          threadId={threadId}
          error={error}
          onSend={(query) => startStream(query, threadId)}
          onAction={sendAction}
        />
      </main>
    </div>
  );
}
