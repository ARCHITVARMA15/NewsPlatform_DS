/**
 * useAgentStream — React hook for streaming SSE events from both LangGraph agents.
 *
 * Uses fetch + ReadableStream (not EventSource) because the chat/action
 * endpoints are POST requests, which EventSource doesn't support.
 *
 * Handles events: step | result | answer | interrupted | pdf_ready |
 *                 pdf_ingested | error
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type { Citation, StreamMessage } from "./types";

const BASE_URL =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000")
    : "http://localhost:8000";

// ---------------------------------------------------------------------------
// Internal stream state shape
// ---------------------------------------------------------------------------
interface AgentStreamState {
  messages: StreamMessage[];
  isStreaming: boolean;
  currentStep: string | null;
  isInterrupted: boolean;
  availableActions: string[];
  threadId: string;
  error: string | null;
  answer: string | null;
  citations: Citation[];
  // News agent result fields
  summary: string | null;
  insights: string[];
  sentiment: string | null;
  sentimentScore: number | null;
  confidenceScores: Record<string, number>;
  biasAnalysis: Record<string, unknown> | null;
  trendData: unknown[];
}

const _initialState = (): AgentStreamState => ({
  messages: [],
  isStreaming: false,
  currentStep: null,
  isInterrupted: false,
  availableActions: [],
  threadId: "",   // assigned client-side in useEffect to avoid SSR hydration mismatch
  error: null,
  answer: null,
  citations: [],
  summary: null,
  insights: [],
  sentiment: null,
  sentimentScore: null,
  confidenceScores: {},
  biasAnalysis: null,
  trendData: [],
});

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useAgentStream(agentType: "agent" | "rag") {
  const [state, setState] = useState<AgentStreamState>(_initialState);
  const abortRef = useRef<AbortController | null>(null);

  // Generate a stable client-side thread ID after mount (avoids SSR/client UUID mismatch)
  useEffect(() => {
    setState((s) => (s.threadId ? s : { ...s, threadId: uuidv4() }));
  }, []);

  // ── SSE parser ────────────────────────────────────────────────────────── //
  const _consumeStream = useCallback(async (response: Response) => {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE chunks are delimited by "\n\n"
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? ""; // keep any incomplete tail

        for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed) continue;

          // Strip "data: " prefix
          const jsonStr = trimmed.startsWith("data: ")
            ? trimmed.slice(6)
            : trimmed;

          let parsed: { event: string; data: Record<string, unknown> };
          try {
            parsed = JSON.parse(jsonStr);
          } catch {
            continue; // ignore malformed lines
          }

          const { event, data } = parsed;

          setState((prev) => {
            switch (event) {
              case "step":
                return {
                  ...prev,
                  currentStep: (data.step as string) ?? prev.currentStep,
                };

              case "result":
              case "answer": {
                const newMsg: StreamMessage = {
                  type: "answer",
                  answer: (data.answer as string) ?? "",
                  citations: (data.citations as Citation[]) ?? [],
                  // News Intelligence Agent fields
                  summary: data.summary as string | undefined,
                  insights: data.insights as string[] | undefined,
                  sentiment: data.sentiment as string | undefined,
                  sentiment_score: data.sentiment_score as number | undefined,
                  confidence_scores: data.confidence_scores as Record<string, number> | undefined,
                  timestamp: new Date().toISOString(),
                };
                return {
                  ...prev,
                  messages: [...prev.messages, newMsg],
                  answer: (data.answer as string) ?? prev.answer,
                  citations: (data.citations as Citation[]) ?? prev.citations,
                  summary: (data.summary as string) ?? prev.summary,
                  insights: (data.insights as string[]) ?? prev.insights,
                  sentiment: (data.sentiment as string) ?? prev.sentiment,
                  sentimentScore: (data.sentiment_score as number) ?? prev.sentimentScore,
                  confidenceScores: (data.confidence_scores as Record<string, number>) ?? prev.confidenceScores,
                };
              }

              case "interrupted":
                return {
                  ...prev,
                  isInterrupted: true,
                  isStreaming: false,
                  availableActions:
                    (data.available_actions as string[]) ?? [],
                  answer: (data.answer as string) ?? prev.answer,
                  citations:
                    (data.citations as Citation[]) ?? prev.citations,
                  messages: [
                    ...prev.messages,
                    {
                      type: "interrupted",
                      availableActions: data.available_actions,
                      timestamp: new Date().toISOString(),
                    } as StreamMessage,
                  ],
                };

              case "pdf_ready":
                return {
                  ...prev,
                  messages: [
                    ...prev.messages,
                    {
                      type: "pdf_ready",
                      report_path: data.report_path,
                      timestamp: new Date().toISOString(),
                    } as StreamMessage,
                  ],
                };

              case "pdf_ingested":
                return {
                  ...prev,
                  currentStep: `PDF ready: ${data.chunk_count} chunks across ${data.page_count} pages`,
                  messages: [
                    ...prev.messages,
                    {
                      type: "pdf_ingested",
                      chunk_count: data.chunk_count,
                      page_count: data.page_count,
                      timestamp: new Date().toISOString(),
                    } as StreamMessage,
                  ],
                };

              case "bias_result": {
                return {
                  ...prev,
                  biasAnalysis: data.bias_analysis as Record<string, unknown>,
                  messages: [
                    ...prev.messages,
                    {
                      type: "bias_result",
                      bias_analysis: data.bias_analysis,
                      timestamp: new Date().toISOString(),
                    } as StreamMessage,
                  ],
                };
              }

              case "trend_result": {
                return {
                  ...prev,
                  trendData: (data.trend_data as unknown[]) ?? [],
                  messages: [
                    ...prev.messages,
                    {
                      type: "trend_result",
                      trend_data: data.trend_data,
                      timestamp: new Date().toISOString(),
                    } as StreamMessage,
                  ],
                };
              }

              case "error":
                return {
                  ...prev,
                  error: (data.message as string) ?? "Unknown error",
                  isStreaming: false,
                };

              default:
                return prev;
            }
          });
        }
      }
    } finally {
      setState((prev) => ({
        ...prev,
        isStreaming: prev.isInterrupted ? false : false,
        currentStep: prev.isInterrupted ? prev.currentStep : null,
      }));
    }
  }, []);

  // ── startStream ──────────────────────────────────────────────────────── //
  const startStream = useCallback(
    async (
      query: string,
      threadIdOverride?: string,
      hasPdf?: boolean
    ) => {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();

      setState((prev) => {
        const tid = threadIdOverride ?? prev.threadId;
        return {
          ...prev,
          threadId: tid,
          isStreaming: true,
          isInterrupted: false,
          error: null,
          currentStep: null,
          messages: [
            ...prev.messages,
            {
              type: "query",
              content: query,
              timestamp: new Date().toISOString(),
            } as StreamMessage,
          ],
        };
      });

      try {
        // Read current threadId from state via closure
        const tid = threadIdOverride ?? state.threadId;
        const endpoint =
          agentType === "rag" ? "/api/rag/chat" : "/api/agent/chat";
        const body =
          agentType === "rag"
            ? { query, thread_id: tid, has_pdf: hasPdf ?? false }
            : { query, thread_id: tid };

        const response = await fetch(`${BASE_URL}${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: abortRef.current.signal,
        });

        if (!response.ok)
          throw new Error(`Server error: HTTP ${response.status}`);
        if (!response.body) throw new Error("Empty response body");

        await _consumeStream(response);
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== "AbortError") {
          setState((prev) => ({
            ...prev,
            error: err instanceof Error ? err.message : "Unknown error",
            isStreaming: false,
          }));
        }
      } finally {
        setState((prev) => ({ ...prev, isStreaming: false }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agentType, _consumeStream]
  );

  // ── sendAction (resumes from HITL interrupt) ─────────────────────────── //
  const sendAction = useCallback(
    async (action: string, context?: Record<string, unknown>) => {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();

      setState((prev) => ({
        ...prev,
        isStreaming: true,
        isInterrupted: false,
        error: null,
        currentStep: null,
      }));

      try {
        const endpoint =
          agentType === "rag" ? "/api/rag/action" : "/api/agent/action";

        const response = await fetch(`${BASE_URL}${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            thread_id: state.threadId,
            action,
            context: context ?? null,
          }),
          signal: abortRef.current.signal,
        });

        if (!response.ok)
          throw new Error(`Action failed: HTTP ${response.status}`);
        if (!response.body) throw new Error("Empty response body");

        await _consumeStream(response);
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== "AbortError") {
          setState((prev) => ({
            ...prev,
            error: err instanceof Error ? err.message : "Unknown error",
            isStreaming: false,
          }));
        }
      } finally {
        setState((prev) => ({ ...prev, isStreaming: false }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agentType, state.threadId, _consumeStream]
  );

  // ── loadHistory ──────────────────────────────────────────────────────── //
  const loadHistory = useCallback(
    async (threadId: string) => {
      try {
        const endpoint =
          agentType === "rag"
            ? `/api/rag/sessions/${threadId}/history`
            : `/api/agent/sessions/${threadId}/history`;

        const res = await fetch(`${BASE_URL}${endpoint}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data: {
          messages?: unknown[];
          answer?: string;
          citations?: Citation[];
        } = await res.json();

        setState((prev) => ({
          ...prev,
          threadId,
          messages: (data.messages as StreamMessage[]) ?? [],
          answer: data.answer ?? null,
          citations: data.citations ?? [],
        }));
      } catch (err: unknown) {
        setState((prev) => ({
          ...prev,
          error:
            err instanceof Error
              ? err.message
              : "Failed to load history",
        }));
      }
    },
    [agentType]
  );

  // ── resetSession ─────────────────────────────────────────────────────── //
  const resetSession = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setState(_initialState());
  }, []);

  // ── abort ────────────────────────────────────────────────────────────── //
  const abort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      setState((prev) => ({ ...prev, isStreaming: false }));
    }
  }, []);

  // ── Exposed API ──────────────────────────────────────────────────────── //
  return {
    // State
    messages:         state.messages,
    isStreaming:      state.isStreaming,
    currentStep:      state.currentStep,
    isInterrupted:    state.isInterrupted,
    availableActions: state.availableActions,
    threadId:         state.threadId,
    error:            state.error,
    answer:           state.answer,
    citations:        state.citations,
    // News agent state
    summary:          state.summary,
    insights:         state.insights,
    sentiment:        state.sentiment,
    sentimentScore:   state.sentimentScore,
    confidenceScores: state.confidenceScores,
    biasAnalysis:     state.biasAnalysis,
    trendData:        state.trendData,
    // Methods
    startStream,
    sendAction,
    loadHistory,
    resetSession,
    abort,
  };
}
