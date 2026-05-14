/**
 * Datastraw API client.
 *
 * All methods talk to the FastAPI backend. BASE_URL is read from the
 * NEXT_PUBLIC_API_URL environment variable (default http://localhost:8000).
 * Streaming endpoints are NOT handled here — use the useAgentStream hook.
 */
import type {
  Article,
  BriefingResponse,
  ChatMessage,
  ChatSession,
  DashboardStats,
  HumanLoopAction,
  PDFMetadata,
  SentimentTrend,
  TrendingKeyword,
} from "./types";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
async function _get<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
  }
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`GET ${path} failed: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function _post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// API Client class
// ---------------------------------------------------------------------------
class APIClient {
  // ── Pipeline ────────────────────────────────────────────────────────── //
  async runPipeline(
    query: string,
    category?: string
  ): Promise<{ status: string; message: string }> {
    return _post("/api/pipeline/run", { query, category });
  }

  // ── Articles ─────────────────────────────────────────────────────────── //
  async getArticles(params: {
    limit?: number;
    offset?: number;
    category?: string;
    sentiment?: string;
    search?: string;
  } = {}): Promise<Article[]> {
    return _get<Article[]>("/api/dashboard/articles", params);
  }

  // ── Dashboard ─────────────────────────────────────────────────────────── //
  async getDashboardStats(): Promise<DashboardStats> {
    return _get<DashboardStats>("/api/dashboard/stats");
  }

  async getSentimentTrend(days = 7, category?: string): Promise<SentimentTrend[]> {
    return _get<SentimentTrend[]>("/api/dashboard/sentiment-trend", {
      days,
      category,
    });
  }

  /**
   * Returns top 20 keywords as plain strings (count info discarded).
   * Use getTrendingKeywordsFull() if you need the counts.
   */
  async getTrendingKeywords(): Promise<string[]> {
    const data = await _get<TrendingKeyword[]>(
      "/api/dashboard/trending-keywords"
    );
    return data.map((d) => d.keyword);
  }

  async getTrendingKeywordsFull(): Promise<TrendingKeyword[]> {
    return _get<TrendingKeyword[]>("/api/dashboard/trending-keywords");
  }

  // ── PDF upload ─────────────────────────────────────────────────────────── //
  async uploadPDF(file: File, threadId?: string): Promise<PDFMetadata> {
    const formData = new FormData();
    formData.append("file", file);

    const url = new URL(`${BASE_URL}/api/rag/upload-pdf`);
    if (threadId) url.searchParams.set("thread_id", threadId);

    const res = await fetch(url.toString(), {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`PDF upload failed (${res.status}): ${detail}`);
    }
    return res.json() as Promise<PDFMetadata>;
  }

  // ── Sessions ──────────────────────────────────────────────────────────── //
  async getAgentSessions(): Promise<ChatSession[]> {
    return _get<ChatSession[]>("/api/agent/sessions");
  }

  async getRAGSessions(): Promise<ChatSession[]> {
    return _get<ChatSession[]>("/api/rag/sessions");
  }

  async getSessionHistory(
    agentType: "agent" | "rag",
    threadId: string
  ): Promise<ChatMessage[]> {
    const data = await _get<{ messages?: ChatMessage[] }>(
      `/api/${agentType}/sessions/${threadId}/history`
    );
    return data.messages ?? [];
  }

  async deleteSession(
    agentType: "agent" | "rag",
    threadId: string
  ): Promise<void> {
    const res = await fetch(
      `${BASE_URL}/api/${agentType}/sessions/${threadId}`,
      { method: "DELETE" }
    );
    if (!res.ok)
      throw new Error(`Delete session failed: HTTP ${res.status}`);
  }

  // ── PDF download ──────────────────────────────────────────────────────── //
  async downloadPDF(agentType: "agent" | "rag", threadId: string): Promise<Blob> {
    const res = await fetch(
      `${BASE_URL}/api/${agentType}/pdf/${threadId}`
    );
    if (!res.ok)
      throw new Error(`PDF download failed: HTTP ${res.status}`);
    return res.blob();
  }

  /**
   * Helper: trigger a browser download of the PDF.
   * Returns the object URL (caller should revoke when done).
   */
  async downloadPDFToFile(
    agentType: "agent" | "rag",
    threadId: string,
    filename?: string
  ): Promise<void> {
    const blob = await this.downloadPDF(agentType, threadId);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename ?? `datastraw_report_${threadId}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  // ── Human action (fire-and-forget — stream is handled by hook) ─────────── //
  async sendHumanAction(
    agentType: "agent" | "rag",
    action: HumanLoopAction
  ): Promise<void> {
    // The action endpoint returns a StreamingResponse.
    // In the hook (useAgentStream) the full stream is consumed.
    // Here we just fire without reading, for non-streaming callers.
    await fetch(`${BASE_URL}/api/${agentType}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action),
    });
  }

  // ── Briefing ──────────────────────────────────────────────────────────── //
  async generateBriefing(topN: number): Promise<BriefingResponse> {
    const res = await fetch(`${BASE_URL}/api/briefing/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ top_n: topN, anchor_image_url: null }),
      signal: AbortSignal.timeout(90_000), // 90s — D-ID can be slow
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Briefing generation failed (${res.status}): ${detail}`);
    }
    return res.json() as Promise<BriefingResponse>;
  }

  async getLatestBriefings(): Promise<BriefingResponse[]> {
    try {
      return await _get<BriefingResponse[]>("/api/briefing/latest");
    } catch {
      return [];
    }
  }

  // ── Thread state inspector ────────────────────────────────────────────── //
  async getThreadState(threadId: string): Promise<{
    agent: string;
    thread_id: string;
    is_interrupted: boolean;
    next_nodes: string[];
    state: Record<string, unknown>;
  }> {
    return _get(`/api/threads/${threadId}/state`);
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------
export const api = new APIClient();
