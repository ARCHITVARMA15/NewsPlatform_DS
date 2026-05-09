"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  Bookmark,
  ChevronDown,
  FileSearch,
  Globe2,
  LayoutDashboard,
  Loader2,
  Menu,
  Newspaper,
  PlayCircle,
  PlusCircle,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Article, ArticleFilters, DashboardStats } from "@/lib/types";
import { ArticleCard } from "@/components/dashboard/ArticleCard";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { SentimentChart } from "@/components/dashboard/SentimentChart";
import { StatsRow } from "@/components/dashboard/StatsRow";
import { cn } from "@/lib/utils";

// ── Sidebar nav config ────────────────────────────────────────────────────
const NAV_ITEMS = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Intelligence Feed", exact: true  },
  { href: "/dashboard", icon: TrendingUp,      label: "Sentiment Analysis", exact: false },
  { href: "/news",      icon: Newspaper,       label: "News Feed",          exact: false },
  { href: "/agent",     icon: Zap,             label: "News Agent",         exact: false },
  { href: "/rag",       icon: FileSearch,      label: "RAG Agent",          exact: false },
  { href: "#",          icon: Bookmark,        label: "Saved Reports",      exact: false },
];

const ITEMS_PER_PAGE = 9;

export default function DashboardPage() {
  // ── Layout state ─────────────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Data state ───────────────────────────────────────────────────────
  const [articles, setArticles]     = useState<Article[]>([]);
  const [stats, setStats]           = useState<DashboardStats | null>(null);
  const [lastRun, setLastRun]       = useState<string | undefined>(undefined);
  const [page, setPage]             = useState(0);
  const [hasMore, setHasMore]       = useState(true);
  const [isLoading, setIsLoading]   = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // ── Filter state ─────────────────────────────────────────────────────
  const [filters, setFilters] = useState<ArticleFilters>({
    search: "",
    category: "",
    sentiment: "",
  });

  // ── Pipeline modal state ──────────────────────────────────────────────
  const [showModal, setShowModal]       = useState(false);
  const [pipelineQuery, setPipelineQuery] = useState("");
  const [isRunning, setIsRunning]       = useState(false);

  // ── Data fetchers ─────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    try {
      const data = await api.getDashboardStats();
      setStats(data);
    } catch {
      /* supplementary — silent fail */
    }
  }, []);

  const fetchArticles = useCallback(
    async (f: ArticleFilters, pageNum: number, append = false) => {
      if (!append) setIsLoading(true);
      else setIsLoadingMore(true);

      try {
        const data = await api.getArticles({
          limit:     ITEMS_PER_PAGE,
          offset:    pageNum * ITEMS_PER_PAGE,
          category:  f.category  || undefined,
          sentiment: f.sentiment || undefined,
          search:    f.search    || undefined,
        });
        if (append) setArticles((prev) => [...prev, ...data]);
        else        setArticles(data);
        setHasMore(data.length === ITEMS_PER_PAGE);
      } catch {
        if (!append) setArticles([]);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    []
  );

  // ── Initial load + 60s auto-refresh ──────────────────────────────────
  useEffect(() => {
    fetchStats();
    fetchArticles(filters, 0);

    const interval = setInterval(() => {
      fetchStats();
      fetchArticles(filters, 0);
    }, 60_000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleFiltersChange = useCallback(
    (newFilters: ArticleFilters) => {
      setFilters(newFilters);
      setPage(0);
      setHasMore(true);
      fetchArticles(newFilters, 0);
    },
    [fetchArticles]
  );

  const handleLoadMore = useCallback(() => {
    const next = page + 1;
    setPage(next);
    fetchArticles(filters, next, true);
  }, [page, filters, fetchArticles]);

  const handleRunPipeline = async () => {
    if (!pipelineQuery.trim()) {
      toast.error("Please enter a search topic.");
      return;
    }
    setIsRunning(true);
    try {
      await api.runPipeline(pipelineQuery.trim());
      setLastRun(new Date().toISOString());
      toast.success("Pipeline started! Articles will appear shortly.");
      setShowModal(false);
      setPipelineQuery("");
      setTimeout(() => {
        fetchStats();
        fetchArticles(filters, 0);
      }, 3000);
    } catch {
      toast.error("Failed to start pipeline. Is the backend running?");
    } finally {
      setIsRunning(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 font-sans">

      {/* ── Mobile overlay ───────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-30 h-full w-[220px] bg-white border-r border-slate-200 flex flex-col transition-transform duration-200 shadow-sm",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-100">
          <div className="size-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm shadow-blue-600/30 flex-shrink-0">
            <Globe2 className="size-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900 leading-none">Datastraw</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mt-0.5">
              Intelligence Tier
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ href, icon: Icon, label }, idx) => {
            const isActive = idx === 0;
            return (
              <Link
                key={label}
                href={href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  isActive
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <Icon
                  className={cn(
                    "size-4 flex-shrink-0",
                    isActive ? "text-blue-600" : "text-slate-400"
                  )}
                />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Run Pipeline CTA */}
        <div className="p-4 border-t border-slate-100">
          <button
            onClick={() => setShowModal(true)}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-bold py-2.5 rounded-lg transition-colors shadow-sm shadow-blue-600/25"
          >
            <PlusCircle className="size-4" />
            Run Pipeline
          </button>
        </div>
      </aside>

      {/* ── Main Content ─────────────────────────────────────────────── */}
      <div className="flex-1 lg:ml-[220px] flex flex-col min-h-screen">

        {/* Top bar */}
        <header className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-slate-200 px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
            >
              <Menu className="size-5" />
            </button>
            <div>
              <h1 className="text-[17px] font-bold text-slate-900 leading-tight">
                Intelligence Feed
              </h1>
              <p className="text-xs text-slate-400 hidden sm:block">
                Global news analysis · powered by LangGraph agents
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
              <div className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Auto-refreshing every 60s
            </div>
            <Link
              href="/"
              className="text-xs font-medium text-slate-400 hover:text-slate-700 transition-colors hidden md:block"
            >
              ← Home
            </Link>
          </div>
        </header>

        {/* Page body */}
        <main className="flex-1 p-6 space-y-6 max-w-[1440px] w-full mx-auto">

          {/* Stats row */}
          <StatsRow
            stats={stats}
            lastRun={lastRun}
            isLoading={isLoading && !stats}
          />

          {/* Filter bar */}
          <FilterBar
            filters={filters}
            onChange={handleFiltersChange}
            resultCount={articles.length}
          />

          {/* Sentiment chart */}
          <SentimentChart category={filters.category || undefined} />

          {/* Article grid section */}
          <section>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
              Latest Intelligence
              {articles.length > 0 && !isLoading && (
                <span className="normal-case font-normal text-slate-400 ml-2">
                  — {articles.length} articles loaded
                </span>
              )}
            </h2>

            {/* Loading skeleton */}
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-3 animate-pulse"
                  >
                    <div className="flex justify-between">
                      <div className="h-3 w-28 bg-slate-200 rounded" />
                      <div className="h-5 w-24 bg-slate-100 rounded" />
                    </div>
                    <div className="h-4 bg-slate-200 rounded" />
                    <div className="h-4 w-4/5 bg-slate-200 rounded" />
                    <div className="h-12 bg-slate-100 rounded" />
                    <div className="flex gap-2">
                      <div className="h-5 w-20 bg-slate-100 rounded" />
                      <div className="h-5 w-16 bg-slate-100 rounded" />
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-100">
                      <div className="h-4 w-16 bg-slate-100 rounded" />
                      <div className="h-7 w-20 bg-slate-100 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : articles.length === 0 ? (
              /* Empty state */
              <div className="bg-white border border-slate-200 rounded-xl p-16 text-center shadow-sm">
                <Newspaper className="size-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-600 font-semibold text-base">
                  No articles found
                </p>
                <p className="text-slate-400 text-sm mt-1.5 max-w-sm mx-auto">
                  {filters.search || filters.category || filters.sentiment
                    ? "Try adjusting or resetting your filters."
                    : "Run the news pipeline to fetch and analyze articles from global sources."}
                </p>
                {!filters.search && !filters.category && !filters.sentiment && (
                  <button
                    onClick={() => setShowModal(true)}
                    className="mt-5 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-6 py-2.5 rounded-xl transition-colors shadow-sm"
                  >
                    <PlayCircle className="size-4" />
                    Run Pipeline
                  </button>
                )}
              </div>
            ) : (
              /* Article grid */
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {articles.map((article) => (
                  <ArticleCard key={article.article_id} article={article} />
                ))}
              </div>
            )}

            {/* Load More */}
            {!isLoading && hasMore && articles.length > 0 && (
              <div className="flex justify-center mt-8">
                <button
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  className="flex items-center gap-2 bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-700 hover:text-blue-600 text-sm font-semibold px-8 py-3 rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoadingMore ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ChevronDown className="size-4" />
                  )}
                  {isLoadingMore ? "Loading…" : "Load More Articles"}
                </button>
              </div>
            )}
          </section>
        </main>
      </div>

      {/* ── Floating Run Pipeline button ─────────────────────────────── */}
      <button
        onClick={() => setShowModal(true)}
        className="fixed bottom-6 right-6 z-20 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-bold px-5 py-3 rounded-xl shadow-lg shadow-blue-600/40 hover:scale-105 active:scale-95 transition-all"
      >
        <PlayCircle className="size-4" />
        Run Pipeline
      </button>

      {/* ── Run Pipeline Modal ────────────────────────────────────────── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setShowModal(false)}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
            {/* Modal header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Run News Pipeline
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Fetch and analyze articles on any topic via LangGraph agents
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Query input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider block">
                Research Topic
              </label>
              <input
                type="text"
                value={pipelineQuery}
                onChange={(e) => setPipelineQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRunPipeline()}
                placeholder="e.g., AI regulation, climate policy, semiconductors…"
                autoFocus
                className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all placeholder:text-slate-400"
              />
              <p className="text-xs text-slate-400">
                Press Enter or click Run to start fetching articles.
              </p>
            </div>

            {/* Suggested topics */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Suggested topics
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  "AI regulation",
                  "climate policy",
                  "semiconductor shortage",
                  "central bank rates",
                  "geopolitical tensions",
                ].map((topic) => (
                  <button
                    key={topic}
                    onClick={() => setPipelineQuery(topic)}
                    className="text-xs font-medium px-3 py-1.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-600 rounded-lg transition-colors"
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRunPipeline}
                disabled={isRunning || !pipelineQuery.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm shadow-blue-600/25 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRunning ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <PlayCircle className="size-4" />
                )}
                {isRunning ? "Starting…" : "Run Pipeline"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
