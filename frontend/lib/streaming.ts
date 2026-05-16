/**
 * useAgentStream — React hook for streaming SSE events from both LangGraph agents.
 *
 * State is stored in Redux (via agentSlice / ragSlice) so conversations survive
 * page navigation. Uses fetch + ReadableStream (not EventSource) because the
 * chat/action endpoints are POST requests which EventSource doesn't support.
 *
 * Handles events: step | result | answer | interrupted | pdf_ready |
 *                 pdf_ingested | bias_result | trend_result | error
 */
"use client";

import { useCallback, useEffect, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import type { Citation, StreamMessage } from "./types";
import { useAppDispatch, useAgentState, useRAGState } from "@/store/hooks";
import {
  addMessage as agentAddMessage,
  setMessages as agentSetMessages,
  setThreadId as agentSetThreadId,
  setStreaming as agentSetStreaming,
  setCurrentStep as agentSetCurrentStep,
  setInterrupted as agentSetInterrupted,
  setError as agentSetError,
  resetConversation as agentReset,
  loadSession as agentLoadSession,
} from "@/store/slices/agentSlice";
import {
  addMessage as ragAddMessage,
  setMessages as ragSetMessages,
  setThreadId as ragSetThreadId,
  setStreaming as ragSetStreaming,
  setCurrentStep as ragSetCurrentStep,
  setInterrupted as ragSetInterrupted,
  setError as ragSetError,
  resetConversation as ragReset,
  loadSession as ragLoadSession,
} from "@/store/slices/ragSlice";
import { getAuthHeaders } from "./api";

const BASE_URL =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000")
    : "http://localhost:8000";

// ---------------------------------------------------------------------------
// Stable module-level action maps — never recreated between renders
// ---------------------------------------------------------------------------
const AGENT_ACTS = {
  addMessage:     agentAddMessage,
  setMessages:    agentSetMessages,
  setThreadId:    agentSetThreadId,
  setStreaming:   agentSetStreaming,
  setCurrentStep: agentSetCurrentStep,
  setInterrupted: agentSetInterrupted,
  setError:       agentSetError,
  reset:          agentReset,
  loadSession:    agentLoadSession,
} as const;

const RAG_ACTS = {
  addMessage:     ragAddMessage,
  setMessages:    ragSetMessages,
  setThreadId:    ragSetThreadId,
  setStreaming:   ragSetStreaming,
  setCurrentStep: ragSetCurrentStep,
  setInterrupted: ragSetInterrupted,
  setError:       ragSetError,
  reset:          ragReset,
  loadSession:    ragLoadSession,
} as const;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useAgentStream(agentType: "agent" | "rag") {
  const dispatch     = useAppDispatch();
  const agentRedux   = useAgentState();
  const ragRedux     = useRAGState();
  const state        = agentType === "agent" ? agentRedux : ragRedux;

  // Stable ref to the correct action set — agentType never changes per hook instance
  const actsRef = useRef(agentType === "agent" ? AGENT_ACTS : RAG_ACTS);

  // Refs for stale-closure-safe access inside callbacks
  const threadIdRef  = useRef<string | null>(state.threadId);
  const messagesRef  = useRef<StreamMessage[]>(state.messages as StreamMessage[]);
  threadIdRef.current = state.threadId;
  messagesRef.current = state.messages as StreamMessage[];

  const abortRef = useRef<AbortController | null>(null);

  // Generate a stable client-side thread ID on mount if Redux has none
  // (avoids SSR/client UUID mismatch)
  useEffect(() => {
    if (!threadIdRef.current) {
      dispatch(actsRef.current.setThreadId(uuidv4()));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── SSE consumer ────────────────────────────────────────────────────── //
  const _consumeStream = useCallback(async (response: Response) => {
    const acts    = actsRef.current;
    const reader  = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer    = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed) continue;

          const jsonStr = trimmed.startsWith("data: ")
            ? trimmed.slice(6)
            : trimmed;

          let parsed: { event: string; data: Record<string, unknown> };
          try { parsed = JSON.parse(jsonStr); } catch { continue; }

          const { event, data } = parsed;

          switch (event) {
            case "step":
              dispatch(acts.setCurrentStep((data.step as string) ?? null));
              break;

            case "result":
            case "answer":
              dispatch(acts.addMessage({
                type:              "answer",
                answer:            (data.answer as string) ?? "",
                citations:         (data.citations as Citation[]) ?? [],
                summary:           data.summary as string | undefined,
                insights:          data.insights as string[] | undefined,
                sentiment:         data.sentiment as string | undefined,
                sentiment_score:   data.sentiment_score as number | undefined,
                confidence_scores: data.confidence_scores as Record<string, number> | undefined,
                timestamp:         new Date().toISOString(),
              }));
              break;

            case "interrupted":
              dispatch(acts.setInterrupted({
                isInterrupted:    true,
                availableActions: (data.available_actions as string[]) ?? [],
              }));
              dispatch(acts.setStreaming(false));
              dispatch(acts.addMessage({
                type:             "interrupted",
                availableActions: data.available_actions,
                timestamp:        new Date().toISOString(),
              }));
              break;

            case "pdf_ready":
              dispatch(acts.addMessage({
                type:        "pdf_ready",
                report_path: data.report_path,
                timestamp:   new Date().toISOString(),
              }));
              break;

            case "pdf_ingested":
              dispatch(acts.setCurrentStep(
                `PDF ready: ${data.chunk_count} chunks across ${data.page_count} pages`
              ));
              dispatch(acts.addMessage({
                type:        "pdf_ingested",
                chunk_count: data.chunk_count,
                page_count:  data.page_count,
                timestamp:   new Date().toISOString(),
              }));
              break;

            case "bias_result":
              dispatch(acts.addMessage({
                type:          "bias_result",
                bias_analysis: data.bias_analysis,
                timestamp:     new Date().toISOString(),
              }));
              break;

            case "trend_result":
              dispatch(acts.addMessage({
                type:       "trend_result",
                trend_data: data.trend_data,
                timestamp:  new Date().toISOString(),
              }));
              break;

            case "error":
              dispatch(acts.setError((data.message as string) ?? "Unknown error"));
              dispatch(acts.setStreaming(false));
              break;
          }
        }
      }
    } finally {
      dispatch(acts.setStreaming(false));
      dispatch(acts.setCurrentStep(null));
    }
  }, [dispatch]);

  // ── startStream ─────────────────────────────────────────────────────── //
  const startStream = useCallback(
    async (query: string, threadIdOverride?: string, hasPdf?: boolean) => {
      const acts = actsRef.current;
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();

      const tid = threadIdOverride ?? threadIdRef.current ?? uuidv4();

      dispatch(acts.setThreadId(tid));
      dispatch(acts.setStreaming(true));
      dispatch(acts.setInterrupted({ isInterrupted: false, availableActions: [] }));
      dispatch(acts.setError(null));
      dispatch(acts.setCurrentStep(null));
      dispatch(acts.addMessage({
        type:      "query",
        content:   query,
        timestamp: new Date().toISOString(),
      }));

      try {
        const endpoint = agentType === "rag" ? "/api/rag/chat" : "/api/agent/chat";
        const body     = agentType === "rag"
          ? { query, thread_id: tid, has_pdf: hasPdf ?? false }
          : { query, thread_id: tid };

        const response = await fetch(`${BASE_URL}${endpoint}`, {
          method:  "POST",
          headers: getAuthHeaders(),
          body:    JSON.stringify(body),
          signal:  abortRef.current.signal,
        });

        if (!response.ok)   throw new Error(`Server error: HTTP ${response.status}`);
        if (!response.body) throw new Error("Empty response body");

        await _consumeStream(response);
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== "AbortError") {
          dispatch(acts.setError(err instanceof Error ? err.message : "Unknown error"));
          dispatch(acts.setStreaming(false));
        }
      } finally {
        dispatch(acts.setStreaming(false));
      }
    },
    [agentType, _consumeStream, dispatch]
  );

  // ── sendAction (resumes from HITL interrupt) ─────────────────────────── //
  const sendAction = useCallback(
    async (action: string, context?: Record<string, unknown>) => {
      const acts = actsRef.current;
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();

      const currentThreadId = threadIdRef.current ?? "";

      dispatch(acts.setStreaming(true));
      dispatch(acts.setInterrupted({ isInterrupted: false, availableActions: [] }));
      dispatch(acts.setError(null));
      dispatch(acts.setCurrentStep(null));
      // Remove stale interrupted messages — they'll be re-added fresh when
      // the graph pauses again. Without this, each action appends a new
      // interrupted message producing duplicate button rows.
      dispatch(acts.setMessages(
        messagesRef.current.filter((m) => m.type !== "interrupted")
      ));

      try {
        const endpoint = agentType === "rag" ? "/api/rag/action" : "/api/agent/action";

        const response = await fetch(`${BASE_URL}${endpoint}`, {
          method:  "POST",
          headers: getAuthHeaders(),
          body:    JSON.stringify({ thread_id: currentThreadId, action, context: context ?? null }),
          signal:  abortRef.current.signal,
        });

        if (!response.ok)   throw new Error(`Action failed: HTTP ${response.status}`);
        if (!response.body) throw new Error("Empty response body");

        await _consumeStream(response);
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== "AbortError") {
          dispatch(acts.setError(err instanceof Error ? err.message : "Unknown error"));
          dispatch(acts.setStreaming(false));
        }
      } finally {
        dispatch(acts.setStreaming(false));
      }
    },
    [agentType, _consumeStream, dispatch]
  );

  // ── loadHistory ─────────────────────────────────────────────────────── //
  const loadHistory = useCallback(
    async (threadId: string) => {
      const acts = actsRef.current;
      try {
        const endpoint = agentType === "rag"
          ? `/api/rag/sessions/${threadId}/history`
          : `/api/agent/sessions/${threadId}/history`;

        const res = await fetch(`${BASE_URL}${endpoint}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data: { messages?: unknown[] } = await res.json();

        dispatch(acts.loadSession({
          threadId,
          messages: (data.messages as StreamMessage[]) ?? [],
        }));
      } catch (err: unknown) {
        dispatch(actsRef.current.setError(
          err instanceof Error ? err.message : "Failed to load history"
        ));
      }
    },
    [agentType, dispatch]
  );

  // ── resetSession ────────────────────────────────────────────────────── //
  const resetSession = useCallback(() => {
    const acts = actsRef.current;
    if (abortRef.current) abortRef.current.abort();
    dispatch(acts.reset());
    dispatch(acts.setThreadId(uuidv4()));
  }, [dispatch]);

  // ── abort ───────────────────────────────────────────────────────────── //
  const abort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      dispatch(actsRef.current.setStreaming(false));
    }
  }, [dispatch]);

  // ── Exposed API (identical shape to before — pages require no changes) ─ //
  return {
    messages:         state.messages as StreamMessage[],
    isStreaming:      state.isStreaming,
    currentStep:      state.currentStep,
    isInterrupted:    state.isInterrupted,
    availableActions: state.availableActions,
    threadId:         state.threadId ?? "",
    error:            state.error,
    // Backward-compat fields (derived from messages; pages don't read these)
    answer:           null as string | null,
    citations:        [] as Citation[],
    summary:          null as string | null,
    insights:         [] as string[],
    sentiment:        null as string | null,
    sentimentScore:   null as number | null,
    confidenceScores: {} as Record<string, number>,
    biasAnalysis:     null as Record<string, unknown> | null,
    trendData:        [] as unknown[],
    // Methods
    startStream,
    sendAction,
    loadHistory,
    resetSession,
    abort,
  };
}
