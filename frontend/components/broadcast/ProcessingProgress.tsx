"use client";

import { CheckCircle2, Circle, Cpu, Database, FileAudio, Layers, Loader2, Radio, ScissorsIcon, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ProgressStep {
  node:        string;
  label:       string;
  description: string;
  icon:        React.ReactNode;
}

const STEPS: ProgressStep[] = [
  {
    node:        "input_validator",
    label:       "Validating Input",
    description: "Checking URL and parameters",
    icon:        <CheckCircle2 className="size-4" />,
  },
  {
    node:        "audio_extractor",
    label:       "Extracting Audio",
    description: "Downloading audio from YouTube",
    icon:        <FileAudio className="size-4" />,
  },
  {
    node:        "transcription",
    label:       "Transcribing with Whisper AI",
    description: "Converting speech to text — this may take 2–5 minutes",
    icon:        <Radio className="size-4" />,
  },
  {
    node:        "chunking",
    label:       "Chunking Transcript",
    description: "Splitting into searchable segments",
    icon:        <ScissorsIcon className="size-4" />,
  },
  {
    node:        "indexing",
    label:       "Building Vector Index",
    description: "Embedding segments for semantic search",
    icon:        <Database className="size-4" />,
  },
  {
    node:        "groq_analysis",
    label:       "Analyzing with Groq LLaMA",
    description: "Extracting events, people, topics & sentiment",
    icon:        <Sparkles className="size-4" />,
  },
];

interface ProcessingProgressProps {
  activeNode:   string | null;
  progress:     number;        // 0-100
  description:  string;
  completedNodes: Set<string>;
  videoTitle?:  string;
  error?:       string | null;
}

export function ProcessingProgress({
  activeNode,
  progress,
  description,
  completedNodes,
  videoTitle,
  error,
}: ProcessingProgressProps) {

  const getStatus = (node: string) => {
    if (error && activeNode === node) return "error";
    if (completedNodes.has(node)) return "complete";
    if (activeNode === node)       return "active";
    return "pending";
  };

  return (
    <div className="w-full max-w-xl mx-auto">
      {/* Top header */}
      <div className="text-center mb-8">
        <div className="relative inline-flex items-center justify-center mb-4">
          <div className="size-16 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
            <Cpu className="size-7 text-violet-400" />
          </div>
          {!error && (
            <div className="absolute -right-1 -bottom-1 size-5 bg-amber-500 rounded-full flex items-center justify-center">
              <Loader2 className="size-3 text-white animate-spin" />
            </div>
          )}
        </div>
        <h2 className="text-lg font-bold text-white mb-1">
          {error ? "Processing Error" : "Analyzing Broadcast"}
        </h2>
        {videoTitle && (
          <p className="text-slate-400 text-xs truncate max-w-xs mx-auto">
            {videoTitle}
          </p>
        )}
      </div>

      {/* Global progress bar */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs text-slate-400 font-medium">Overall Progress</span>
          <span className="text-xs text-violet-400 font-bold">{progress}%</span>
        </div>
        <div className="h-2 bg-slate-700/60 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700 ease-out",
              error ? "bg-red-500" : "bg-gradient-to-r from-violet-600 to-violet-400"
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Active step description */}
      <div className={cn(
        "mb-6 px-4 py-3 rounded-xl border text-sm",
        error
          ? "bg-red-500/10 border-red-500/30 text-red-300"
          : "bg-violet-500/10 border-violet-500/20 text-violet-200"
      )}>
        <div className="flex items-start gap-2">
          {error
            ? <span className="text-red-400 mt-0.5 text-base">⚠</span>
            : <Loader2 className="size-4 text-violet-400 animate-spin mt-0.5 flex-shrink-0" />
          }
          <span>{error || description}</span>
        </div>
      </div>

      {/* Step timeline */}
      <div className="space-y-1">
        {STEPS.map((step, idx) => {
          const status = getStatus(step.node);
          const isLast = idx === STEPS.length - 1;

          return (
            <div key={step.node} className="flex gap-3">
              {/* Line + dot column */}
              <div className="flex flex-col items-center">
                <div className={cn(
                  "size-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-300",
                  status === "complete" && "bg-emerald-500/20 border-emerald-500 text-emerald-400",
                  status === "active"   && "bg-violet-500/20 border-violet-500 text-violet-300 shadow-sm shadow-violet-500/40",
                  status === "error"    && "bg-red-500/20 border-red-500 text-red-400",
                  status === "pending"  && "bg-slate-800 border-slate-600 text-slate-500",
                )}>
                  {status === "complete" ? (
                    <CheckCircle2 className="size-4" />
                  ) : status === "active" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    step.icon
                  )}
                </div>
                {!isLast && (
                  <div className={cn(
                    "w-0.5 h-6 mt-1 transition-all duration-500",
                    completedNodes.has(step.node) ? "bg-emerald-500/50" : "bg-slate-700"
                  )} />
                )}
              </div>

              {/* Text column */}
              <div className={cn(
                "pb-4 flex-1 min-w-0",
                !isLast && "border-b border-slate-800/40"
              )}>
                <p className={cn(
                  "text-sm font-semibold leading-tight transition-colors",
                  status === "complete" && "text-emerald-400",
                  status === "active"   && "text-white",
                  status === "error"    && "text-red-400",
                  status === "pending"  && "text-slate-500",
                )}>
                  {step.label}
                </p>
                <p className={cn(
                  "text-xs leading-relaxed mt-0.5 transition-colors",
                  status === "active"  ? "text-slate-300" : "text-slate-500"
                )}>
                  {step.description}
                </p>
                {status === "active" && step.node === "transcription" && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    {[0.2, 0.4, 0.6, 0.4, 0.2].map((d, i) => (
                      <div
                        key={i}
                        className="w-0.5 h-3 bg-violet-400 rounded-full origin-center animate-bounce"
                        style={{ animationDelay: `${d}s`, animationDuration: "1.2s" }}
                      />
                    ))}
                    <span className="text-[10px] text-violet-400 ml-1">Transcribing…</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-slate-600 mt-4">
        Do not close this window. Processing is running on the server.
      </p>
    </div>
  );
}
