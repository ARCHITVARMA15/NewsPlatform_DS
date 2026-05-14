/**
 * TypeScript interfaces matching the Datastraw backend Pydantic models.
 * Keeps frontend types in sync with backend/app/database/models.py.
 */

// ---------------------------------------------------------------------------
// Article (matches ArticleModel)
// ---------------------------------------------------------------------------
export interface Article {
  id?: string;
  article_id: string;
  title?: string;
  description?: string;
  content?: string;
  source_name?: string;
  source_url?: string;
  published_at?: string;
  category?: string;
  country?: string;
  language?: string;
  sentiment?: "positive" | "negative" | "neutral";
  sentiment_score?: number;
  summary?: string;
  insights?: string[];
  keywords?: string[];
  created_at?: string;
}

// ---------------------------------------------------------------------------
// Chat (matches ChatMessage)
// ---------------------------------------------------------------------------
export interface ChatMessage {
  role: string;
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Agent requests (match AgentRequest / RAGRequest)
// ---------------------------------------------------------------------------
export interface AgentRequest {
  query: string;
  thread_id?: string;
  mode?: string;
}

export interface RAGRequest {
  query: string;
  thread_id?: string;
  has_pdf?: boolean;
}

// ---------------------------------------------------------------------------
// Human-in-the-loop (matches HumanLoopAction)
// ---------------------------------------------------------------------------
export type AgentActionLiteral =
  | "generate_pdf"
  | "dive_deeper"
  | "bias_detect"
  | "track_story"
  | "end";

export type RAGActionLiteral =
  | "generate_report"
  | "clarify_pdf"
  | "clarify_web"
  | "continue"
  | "end";

export interface HumanLoopAction {
  thread_id: string;
  action: AgentActionLiteral | RAGActionLiteral;
  context?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Streaming (matches StreamEvent)
// ---------------------------------------------------------------------------
export interface StreamEvent {
  event_type: string;
  data: Record<string, unknown>;
  thread_id: string;
}

// UI-level stream message (richer than the raw SSE event)
export interface StreamMessage {
  type:
    | "query"
    | "step"
    | "result"
    | "answer"
    | "error"
    | "interrupted"
    | "pdf_ready"
    | "pdf_ingested"
    | "bias_result"
    | "trend_result";
  content?: string;
  step?: string;
  answer?: string;
  citations?: Citation[];
  timestamp?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------
export interface ChatSession {
  thread_id: string;
  session_name?: string;
  agent_type: "news" | "rag";
  last_query?: string;
  message_count?: number;
  created_at?: string;
  updated_at?: string;
}

// ---------------------------------------------------------------------------
// PDF (matches upload-pdf response + PDFGenerationRequest)
// ---------------------------------------------------------------------------
export interface PDFMetadata {
  thread_id: string;
  filename: string;
  chunk_count: number;
  page_count: number;
  file_size_kb: number;
}

// ---------------------------------------------------------------------------
// Citations (RAG)
// ---------------------------------------------------------------------------
export interface Citation {
  source: string;
  text: string;
  type: "pdf" | "web";
  url?: string;
  page_num?: number;
  similarity_score?: number;
}

// ---------------------------------------------------------------------------
// Dashboard stats (matches /api/dashboard/stats)
// ---------------------------------------------------------------------------
export interface DashboardStats {
  total_articles: number;
  sentiment_breakdown: {
    positive: number;
    negative: number;
    neutral: number;
  };
  top_categories: Array<{ category: string; count: number }>;
  top_sources: Array<{ source: string; count: number }>;
  articles_today: number;
}

// Trending keyword
export interface TrendingKeyword {
  keyword: string;
  count: number;
}

// ---------------------------------------------------------------------------
// Sentiment trend (matches /api/dashboard/sentiment-trend)
// ---------------------------------------------------------------------------
export interface SentimentTrend {
  date: string;        // "YYYY-MM-DD"
  positive: number;
  negative: number;
  neutral: number;
}

// ---------------------------------------------------------------------------
// Partial agent states for UI display
// ---------------------------------------------------------------------------
export interface NewsAgentState {
  query?: string;
  thread_id?: string;
  sub_queries?: string[];
  web_results?: unknown[];
  newsdata_articles?: unknown[];
  validated_sources?: ValidatedSource[];
  insights?: string[];
  summary?: string;
  current_step?: string;
  error?: string | null;
  human_action?: string | null;
  pdf_path?: string | null;
  is_interrupted?: boolean;
  next_nodes?: string[];
}

export interface RAGAgentState {
  query?: string;
  thread_id?: string;
  has_pdf?: boolean;
  answer?: string;
  citations?: Citation[];
  current_step?: string;
  error?: string | null;
  human_action?: string | null;
  clarify_mode?: "hybrid" | "pdf_only" | "web_only";
  is_interrupted?: boolean;
  next_nodes?: string[];
}

export interface ValidatedSource {
  title?: string;
  url?: string;
  credibility?: number;
}

// ---------------------------------------------------------------------------
// Dashboard filter state
// ---------------------------------------------------------------------------
export interface ArticleFilters {
  search: string;
  category: string;
  sentiment: string;
}

// ---------------------------------------------------------------------------
// Enums for action buttons
// ---------------------------------------------------------------------------
export enum AgentAction {
  GENERATE_PDF = "generate_pdf",
  DIVE_DEEPER  = "dive_deeper",
  BIAS_DETECT  = "bias_detect",
  TRACK_STORY  = "track_story",
}

export enum RAGAction {
  GENERATE_REPORT = "generate_report",
  CLARIFY_PDF     = "clarify_pdf",
  CLARIFY_WEB     = "clarify_web",
  CONTINUE        = "continue",
}

// ---------------------------------------------------------------------------
// AI News Briefing (matches BriefingResponse)
// ---------------------------------------------------------------------------
export interface BriefingResponse {
  script:     string;
  audio_url:  string;
  video_url:  string | null;
  thread_id:  string;
  created_at: string;
}
