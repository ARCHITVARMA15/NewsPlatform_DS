"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Globe,
  Hash,
} from "lucide-react";
import type { Citation } from "@/lib/types";
import { cn } from "@/lib/utils";

interface SourceCitationsProps {
  citations: Citation[];
  defaultExpanded?: boolean;
}

type Tab = "all" | "pdf" | "web";

// ── Credibility colour helper ─────────────────────────────────────────────
function credColor(score?: number) {
  if (!score) return "text-slate-400";
  if (score >= 0.85) return "text-emerald-600";
  if (score >= 0.6)  return "text-amber-600";
  return "text-red-500";
}

// ── PDF citation card ─────────────────────────────────────────────────────
function PDFCitation({ citation, index }: { citation: Citation; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="bg-white border border-slate-200 rounded-xl overflow-hidden"
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start gap-3 p-3 hover:bg-slate-50 transition-colors text-left"
      >
        {/* Page number badge */}
        <div className="size-9 bg-blue-50 border border-blue-100 rounded-lg flex flex-col items-center justify-center flex-shrink-0">
          <Hash className="size-3 text-blue-400" />
          <span className="text-[10px] font-bold text-blue-600 leading-none">
            {citation.page_num ?? "?"}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <FileText className="size-3 text-blue-500 flex-shrink-0" />
            <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wide truncate">
              {citation.source}
            </span>
            <span className="text-[10px] text-blue-500 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">
              PDF · p.{citation.page_num ?? "?"}
            </span>
          </div>
          <p className={cn(
            "text-xs text-slate-600 leading-relaxed",
            expanded ? "" : "line-clamp-2"
          )}>
            {citation.text}
          </p>
        </div>

        <div className="flex-shrink-0 mt-0.5">
          {expanded
            ? <ChevronUp className="size-3.5 text-slate-400" />
            : <ChevronDown className="size-3.5 text-slate-400" />
          }
        </div>
      </button>
    </motion.div>
  );
}

// ── Web citation card ─────────────────────────────────────────────────────
function WebCitation({ citation, index }: { citation: Citation; index: number }) {
  const score = citation.similarity_score;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="bg-white border border-slate-200 rounded-xl p-3 flex items-start gap-3"
    >
      {/* Globe icon */}
      <div className="size-9 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
        <Globe className="size-4 text-emerald-500" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[11px] font-bold text-slate-700 truncate">
            {citation.source}
          </span>
          <span className="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">
            WEB
          </span>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed line-clamp-2 mb-1.5">
          {citation.text}
        </p>
        <div className="flex items-center justify-between gap-2">
          {citation.url && (
            <a
              href={citation.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-blue-600 hover:underline truncate flex items-center gap-1"
            >
              <ExternalLink className="size-3 flex-shrink-0" />
              {citation.url.replace(/https?:\/\//, "").split("/")[0]}
            </a>
          )}
          {score !== undefined && (
            <span className={cn("text-[10px] font-bold flex-shrink-0", credColor(score))}>
              {Math.round(score * 100)}% relevant
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Main SourceCitations component ────────────────────────────────────────
export function SourceCitations({
  citations,
  defaultExpanded = false,
}: SourceCitationsProps) {
  const [isOpen, setIsOpen] = useState(defaultExpanded);
  const [tab, setTab]       = useState<Tab>("all");

  const pdfCitations = citations.filter((c) => c.type === "pdf");
  const webCitations = citations.filter((c) => c.type === "web");

  const displayed =
    tab === "pdf" ? pdfCitations :
    tab === "web" ? webCitations :
    citations;

  const tabCount = (t: Tab) =>
    t === "all" ? citations.length :
    t === "pdf" ? pdfCitations.length :
    webCitations.length;

  if (citations.length === 0) return null;

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      {/* Toggle header */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors w-full"
      >
        {isOpen
          ? <ChevronUp className="size-3.5" />
          : <ChevronDown className="size-3.5" />
        }
        <span>
          {citations.length} Source{citations.length !== 1 ? "s" : ""}
        </span>
        {pdfCitations.length > 0 && (
          <span className="text-[10px] font-bold text-blue-500 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-full">
            {pdfCitations.length} PDF
          </span>
        )}
        {webCitations.length > 0 && (
          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-full">
            {webCitations.length} Web
          </span>
        )}
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="citations"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-3 space-y-3">
              {/* Tab bar */}
              {pdfCitations.length > 0 && webCitations.length > 0 && (
                <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
                  {(["all", "pdf", "web"] as Tab[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={cn(
                        "px-3 py-1 rounded-md text-xs font-semibold transition-all",
                        tab === t
                          ? "bg-white text-slate-800 shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      {t === "all" ? "All Sources" : t === "pdf" ? "PDF Sources" : "Web Sources"}
                      <span className="ml-1 text-[10px] text-slate-400">
                        ({tabCount(t)})
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Citation cards */}
              <div className="space-y-2">
                {displayed.map((citation, i) =>
                  citation.type === "pdf" ? (
                    <PDFCitation key={i} citation={citation} index={i} />
                  ) : (
                    <WebCitation key={i} citation={citation} index={i} />
                  )
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
