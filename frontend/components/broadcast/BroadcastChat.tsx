"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { v4 as uuidv4 } from "uuid";
import { InputPanel } from "./InputPanel";
import { ProcessingProgress } from "./ProcessingProgress";
import { AnalysisResult, type AnalysisData } from "./AnalysisResult";
import { ChatArea } from "./ChatArea";

// ── Types ──────────────────────────────────────────────────────────────────
type Phase = "input" | "processing" | "ready" | "chatting";

interface ChatMessage {
  id:         string;
  role:       "user" | "assistant";
  content:    string;
  citations?: Array<{
    chunk_id: string;
    label:    string;
    text:     string;
    similarity_score?: number;
  }>;
  isStreaming?: boolean;
}

const BASE_URL =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000")
    : "http://localhost:8000";

// ── SSE parser ─────────────────────────────────────────────────────────────
async function* parseSSE(response: Response) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        if (part.startsWith("data: ")) {
          try {
            yield JSON.parse(part.slice(6));
          } catch { /* malformed chunk */ }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Component ─────────────────────────────────────────────────────────────
export function BroadcastChat() {
  const [phase, setPhase]               = useState<Phase>("input");
  const [threadId, setThreadId]         = useState("");
  const [isStreaming, setIsStreaming]   = useState(false);
  const [isInterrupted, setIsInterrupted] = useState(false);

  // Processing state
  const [activeNode, setActiveNode]         = useState<string | null>(null);
  const [progress, setProgress]             = useState(0);
  const [stepDescription, setStepDescription] = useState("Initializing…");
  const [completedNodes, setCompletedNodes] = useState<Set<string>>(new Set());
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [videoTitleProcessing, setVideoTitleProcessing] = useState("");

  // Analysis results
  const [analysisData, setAnalysisData]   = useState<AnalysisData | null>(null);
  const analysisDataRef = useRef<AnalysisData | null>(null);

  // Chat
  const [chatMessages, setChatMessages]   = useState<ChatMessage[]>([]);
  const [showChatArea, setShowChatArea]   = useState(false);
  const [hasPDF, setHasPDF]               = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  // Belt-and-suspenders: if interrupted fires before ref check resolves (rare race),
  // this effect catches it on the next render tick.
  useEffect(() => {
    if (isInterrupted && analysisData && phase === "processing") {
      setPhase("ready");
    }
  }, [isInterrupted, analysisData, phase]);

  // ── SSE event handler ──────────────────────────────────────────────────
  const handleSSEEvent = useCallback((msg: { event: string; data: Record<string, unknown> }) => {
    const { event, data } = msg;

    switch (event) {
      case "step": {
        const node = data.node as string;
        const desc = data.description as string;
        const prog = data.progress as number;
        setActiveNode(node);
        setStepDescription(desc);
        setProgress(prog);
        setCompletedNodes(prev => {
          const next = new Set(prev);
          // Mark previous nodes as complete
          const nodeOrder = [
            "input_validator","audio_extractor","transcription",
            "chunking","indexing","groq_analysis","human_interrupt",
          ];
          const idx = nodeOrder.indexOf(node);
          for (let i = 0; i < idx; i++) next.add(nodeOrder[i]);
          return next;
        });
        break;
      }

      case "analysis_complete": {
        const d = data as unknown as AnalysisData;
        analysisDataRef.current = d;
        setAnalysisData(d);
        if (d.video_title) setVideoTitleProcessing(d.video_title);
        setCompletedNodes(prev => {
          const next = new Set(prev);
          ["input_validator","audio_extractor","transcription","chunking","indexing","groq_analysis"]
            .forEach(n => next.add(n));
          return next;
        });
        setProgress(100);
        setStepDescription("Analysis complete!");
        break;
      }

      case "interrupted": {
        setIsInterrupted(true);
        setIsStreaming(false);
        // Use ref — avoids stale closure when interrupted fires right after analysis_complete
        if (analysisDataRef.current) setPhase("ready");
        break;
      }

      case "answer": {
        const answer    = data.answer    as string;
        const citations = (data.citations as ChatMessage["citations"]) || [];

        setChatMessages(prev => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (lastIdx >= 0 && updated[lastIdx].isStreaming) {
            updated[lastIdx] = {
              ...updated[lastIdx],
              content:    answer,
              citations,
              isStreaming: false,
            };
          } else {
            updated.push({
              id:         uuidv4(),
              role:       "assistant",
              content:    answer,
              citations,
              isStreaming: false,
            });
          }
          return updated;
        });
        setIsStreaming(false);
        break;
      }

      case "pdf_ready": {
        setHasPDF(true);
        toast.success("PDF report ready! Click Export PDF to download.", { duration: 5000 });
        break;
      }

      case "error": {
        const msg = data.message as string;
        setProcessingError(msg);
        setIsStreaming(false);
        toast.error(msg);
        break;
      }

      case "done": {
        setIsStreaming(false);
        break;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Start streaming from a response ───────────────────────────────────
  const consumeStream = useCallback(async (response: Response) => {
    for await (const msg of parseSSE(response)) {
      handleSSEEvent(msg as { event: string; data: Record<string, unknown> });
    }
  }, [handleSSEEvent]);

  // ── Analyze YouTube URL ────────────────────────────────────────────────
  const handleAnalyzeURL = useCallback(async (url: string, tid: string) => {
    setThreadId(tid);
    setPhase("processing");
    setIsStreaming(true);
    setProcessingError(null);
    setCompletedNodes(new Set());
    setProgress(0);
    setStepDescription("Starting…");

    abortRef.current = new AbortController();
    try {
      const res = await fetch(`${BASE_URL}/api/broadcast/analyze`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ youtube_url: url, thread_id: tid }),
        signal:  abortRef.current.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Analysis failed");
      }
      await consumeStream(res);
    } catch (err: unknown) {
      if ((err as Error).name !== "AbortError") {
        const msg = (err as Error).message || "Unknown error";
        setProcessingError(msg);
        toast.error(msg);
        setIsStreaming(false);
      }
    }
  }, [consumeStream]);

  // ── Upload file ────────────────────────────────────────────────────────
  const handleUploadFile = useCallback(async (file: File, tid: string) => {
    setThreadId(tid);
    setPhase("processing");
    setIsStreaming(true);
    setProcessingError(null);
    setCompletedNodes(new Set());
    setProgress(0);
    setStepDescription("Uploading file…");
    setVideoTitleProcessing(file.name);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("thread_id", tid);

    abortRef.current = new AbortController();
    try {
      const res = await fetch(`${BASE_URL}/api/broadcast/upload`, {
        method: "POST",
        body:   formData,
        signal: abortRef.current.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Upload failed");
      }
      await consumeStream(res);
    } catch (err: unknown) {
      if ((err as Error).name !== "AbortError") {
        const msg = (err as Error).message || "Unknown error";
        setProcessingError(msg);
        toast.error(msg);
        setIsStreaming(false);
      }
    }
  }, [consumeStream]);

  // ── Send chat action ───────────────────────────────────────────────────
  const sendAction = useCallback(async (
    action: "ask_question" | "export_pdf" | "end",
    query?: string,
  ) => {
    if (action === "ask_question" && query) {
      setShowChatArea(true);
      setPhase("chatting");
      // Optimistically add user message
      setChatMessages(prev => [
        ...prev,
        { id: uuidv4(), role: "user", content: query },
        { id: uuidv4(), role: "assistant", content: "", isStreaming: true },
      ]);
    }

    setIsStreaming(true);
    setIsInterrupted(false);

    try {
      const res = await fetch(`${BASE_URL}/api/broadcast/action`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ thread_id: threadId, action, query }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Action failed");
      }
      await consumeStream(res);
    } catch (err: unknown) {
      const msg = (err as Error).message || "Unknown error";
      toast.error(msg);
      setIsStreaming(false);
    }
  }, [threadId, consumeStream]);

  // ── Handlers for AnalysisResult buttons ───────────────────────────────
  const handleAskQuestion = () => {
    setShowChatArea(true);
    setPhase("chatting");
  };

  const handleExportPDF = () => sendAction("export_pdf");

  const handleDone = () => sendAction("end");

  const handleSendChat = (query: string) => sendAction("ask_question", query);

  const handleDownloadPDF = () => {
    window.open(`${BASE_URL}/api/broadcast/pdf/${threadId}`, "_blank");
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {phase === "input" && (
        <div className="flex-1 flex items-center justify-center p-8">
          <InputPanel
            onAnalyzeURL={handleAnalyzeURL}
            onUploadFile={handleUploadFile}
            isLoading={isStreaming}
          />
        </div>
      )}

      {phase === "processing" && (
        <div className="flex-1 flex items-center justify-center p-8">
          <ProcessingProgress
            activeNode={activeNode}
            progress={progress}
            description={stepDescription}
            completedNodes={completedNodes}
            videoTitle={videoTitleProcessing}
            error={processingError}
          />
        </div>
      )}

      {(phase === "ready" || phase === "chatting") && analysisData && (
        <div className="flex flex-col h-full overflow-hidden">
          {!showChatArea ? (
            /* ── Analysis view ───────────────────────────────────────── */
            <div className="flex-1 overflow-y-auto p-6">
              <AnalysisResult
                data={analysisData}
                isInterrupted={isInterrupted}
                onAskQuestion={handleAskQuestion}
                onExportPDF={handleExportPDF}
                onDone={handleDone}
              />
            </div>
          ) : (
            /* ── Chat + analysis split ───────────────────────────────── */
            <div className="flex flex-col h-full overflow-hidden">
              {/* Compact analysis bar at top */}
              <div className="flex-shrink-0 px-4 py-3 border-b border-slate-700/50 bg-slate-800/30">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">
                      {analysisData.video_title || "Broadcast"}
                    </p>
                    <p className="text-xs text-slate-400 truncate">
                      {analysisData.channel_name}
                      {analysisData.video_duration > 0 &&
                        ` · ${Math.floor(analysisData.video_duration / 60)}m`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      analysisData.sentiment === "positive"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : analysisData.sentiment === "negative"
                          ? "bg-red-500/20 text-red-400"
                          : "bg-slate-700 text-slate-400"
                    }`}>
                      {analysisData.sentiment}
                    </span>
                    <button
                      onClick={() => setShowChatArea(false)}
                      className="text-xs text-slate-400 hover:text-white underline transition-colors"
                    >
                      View Analysis
                    </button>
                    {hasPDF && (
                      <button
                        onClick={handleDownloadPDF}
                        className="text-xs text-violet-400 hover:text-violet-300 underline transition-colors"
                      >
                        Download PDF
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Chat area */}
              <div className="flex-1 overflow-hidden">
                <ChatArea
                  messages={chatMessages}
                  isStreaming={isStreaming}
                  onSend={handleSendChat}
                  onExportPDF={handleExportPDF}
                  hasPDF={hasPDF || true}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
