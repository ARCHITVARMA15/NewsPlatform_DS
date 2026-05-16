"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { GraphStatsBar } from "./GraphStatsBar";
import { cn } from "@/lib/utils";
import type { Article } from "@/lib/types";

// ── ForceGraph2D — dynamic import (canvas API, no SSR) ────────────────────
const ForceGraph2D = dynamic(
  () => import("react-force-graph-2d"),
  { ssr: false, loading: () => <GraphLoadingScreen /> }
);

function GraphLoadingScreen() {
  return (
    <div className="flex-1 bg-[#030712] flex items-center justify-center">
      <div className="text-center space-y-3">
        <Loader2 className="size-8 text-violet-400 animate-spin mx-auto" />
        <p className="text-slate-400 text-sm">Initialising graph engine…</p>
      </div>
    </div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────
const BASE_URL =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000")
    : "http://localhost:8000";

const NODE_COLORS: Record<string, string> = {
  PERSON:       "#F6AD55",
  COMPANY:      "#68D391",
  COUNTRY:      "#63B3ED",
  EVENT:        "#FC8181",
  TOPIC:        "#B794F4",
  ORGANIZATION: "#4FD1C5",
};

const TYPE_ORDER = ["PERSON", "COMPANY", "COUNTRY", "EVENT", "TOPIC", "ORGANIZATION"] as const;

// ── Types ─────────────────────────────────────────────────────────────────
interface GraphNode {
  id:          string;
  label:       string;
  type:        string;
  weight:      number;
  article_ids: string[];
  // Added by d3
  x?: number;
  y?: number;
}

interface GraphLink {
  source:   string | GraphNode;
  target:   string | GraphNode;
  relation: string;
  weight:   number;
  value:    number;
}

interface RawGraph {
  nodes:   GraphNode[];
  edges:   { source: string; target: string; relation: string; weight: number }[];
  stats:   { total_nodes: number; total_edges: number; articles_processed: number };
  cached_at: string | null;
}

// ── Main component ────────────────────────────────────────────────────────
export function KnowledgeGraph() {
  // ── Data state ──────────────────────────────────────────────────────────
  const [rawNodes,  setRawNodes]  = useState<GraphNode[]>([]);
  const [rawLinks,  setRawLinks]  = useState<GraphLink[]>([]);
  const [stats,     setStats]     = useState<RawGraph["stats"] | null>(null);
  const [cachedAt,  setCachedAt]  = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── UI state ────────────────────────────────────────────────────────────
  const [filterType,    setFilterType]    = useState<string | null>(null);
  const [searchQuery,   setSearchQuery]   = useState("");
  const [selectedNode,  setSelectedNode]  = useState<GraphNode | null>(null);
  const [hoveredNode,   setHoveredNode]   = useState<GraphNode | null>(null);
  const [mousePos,      setMousePos]      = useState({ x: 0, y: 0 });
  const [legendOpen,    setLegendOpen]    = useState(true);
  const [activeTab,     setActiveTab]     = useState<"articles" | "entities">("articles");

  // ── Panel data ──────────────────────────────────────────────────────────
  const [nodeArticles,      setNodeArticles]      = useState<Article[]>([]);
  const [nodeNeighbors,     setNodeNeighbors]     = useState<{ node: GraphNode; neighbors: GraphNode[]; edges: GraphLink[] } | null>(null);
  const [isLoadingArticles, setIsLoadingArticles] = useState(false);
  const [isLoadingNeighbors,setIsLoadingNeighbors]= useState(false);

  // ── Refs ────────────────────────────────────────────────────────────────
  const graphRef     = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });

  // ── Container resize tracking ────────────────────────────────────────────
  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setDims({
          w: containerRef.current.clientWidth,
          h: containerRef.current.clientHeight,
        });
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // ── Fetch graph data ──────────────────────────────────────────────────
  const fetchGraph = useCallback(async (refresh = false) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `${BASE_URL}/api/graph/full?limit=100${refresh ? "&refresh=true" : ""}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: RawGraph = await res.json();

      const nodes: GraphNode[] = (data.nodes || []).map(n => ({
        ...n,
        color: NODE_COLORS[n.type] ?? "#718096",
      }));
      const links: GraphLink[] = (data.edges || []).map(e => ({
        ...e,
        value: e.weight,
      }));

      setRawNodes(nodes);
      setRawLinks(links);
      setStats(data.stats);
      setCachedAt(data.cached_at ?? new Date().toISOString());
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : "Failed to load graph");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchGraph(); }, [fetchGraph]);

  // ── D3 force tuning after data loads ─────────────────────────────────
  useEffect(() => {
    const fg = graphRef.current;
    if (!fg || rawNodes.length === 0) return;
    fg.d3Force("charge")?.strength(-200);
    fg.d3Force("link")?.distance(80);
  }, [rawNodes]);

  // ── Filtered graph data ──────────────────────────────────────────────
  const graphData = useMemo(() => {
    let nodes = rawNodes;

    if (filterType) {
      nodes = nodes.filter(n => n.type === filterType);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      nodes = nodes.filter(n => n.label.toLowerCase().includes(q));
    }

    const nodeIds = new Set(nodes.map(n => n.id));
    const links   = rawLinks.filter(l => {
      const src = typeof l.source === "object" ? (l.source as GraphNode).id : l.source as string;
      const tgt = typeof l.target === "object" ? (l.target as GraphNode).id : l.target as string;
      return nodeIds.has(src) && nodeIds.has(tgt);
    });

    return { nodes, links };
  }, [rawNodes, rawLinks, filterType, searchQuery]);

  // ── Node click handler ────────────────────────────────────────────────
  const handleNodeClick = useCallback((node: object) => {
    const n = node as GraphNode;
    setSelectedNode(n);
    setActiveTab("articles");
    setNodeArticles([]);
    setNodeNeighbors(null);

    // Fetch articles
    setIsLoadingArticles(true);
    fetch(`${BASE_URL}/api/graph/node/${n.id}/articles`)
      .then(r => r.json())
      .then(d => setNodeArticles(d.articles ?? []))
      .catch(() => setNodeArticles([]))
      .finally(() => setIsLoadingArticles(false));

    // Fetch neighbors
    setIsLoadingNeighbors(true);
    fetch(`${BASE_URL}/api/graph/node/${n.id}/neighbors`)
      .then(r => r.json())
      .then(d => setNodeNeighbors(d))
      .catch(() => setNodeNeighbors(null))
      .finally(() => setIsLoadingNeighbors(false));
  }, []);

  // ── Node canvas renderer ──────────────────────────────────────────────
  const paintNode = useCallback((node: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const n      = node as GraphNode & { x: number; y: number };
    const color  = NODE_COLORS[n.type] ?? "#718096";
    const size   = Math.max(3, Math.sqrt((n.weight || 1) * 2) * 2);
    const isSelected = selectedNode?.id === n.id;
    const isHovered  = hoveredNode?.id  === n.id;

    // Glow for selected
    if (isSelected || isHovered) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, size + 4, 0, 2 * Math.PI);
      ctx.fillStyle = color + "33";
      ctx.fill();
    }

    // Main circle
    ctx.beginPath();
    ctx.arc(n.x, n.y, size, 0, 2 * Math.PI);
    ctx.fillStyle = isSelected ? "#fff" : color;
    ctx.fill();

    if (isSelected) {
      ctx.strokeStyle = color;
      ctx.lineWidth   = 2 / globalScale;
      ctx.stroke();
    }

    // Label when zoomed in
    if (globalScale > 1.3) {
      const fontSize = Math.max(2, 10 / globalScale);
      ctx.font        = `${fontSize}px Inter, system-ui, sans-serif`;
      ctx.fillStyle   = "rgba(255,255,255,0.75)";
      ctx.textAlign   = "center";
      ctx.textBaseline = "top";
      ctx.fillText(n.label, n.x, n.y + size + 2);
    }
  }, [selectedNode, hoveredNode]);

  // ── Mouse tracking for tooltip ────────────────────────────────────────
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  }, []);

  // ── Sentiment badge helper ────────────────────────────────────────────
  const sentimentColor = (s?: string) =>
    s === "positive" ? "bg-emerald-100 text-emerald-700"
    : s === "negative" ? "bg-red-100 text-red-700"
    : "bg-slate-100 text-slate-500";

  // =========================================================================
  // RENDER
  // =========================================================================
  return (
    <div
      ref={containerRef}
      className="flex-1 relative bg-[#030712] overflow-hidden"
      onMouseMove={handleMouseMove}
    >
      {/* ── Loading overlay ─────────────────────────────────────────── */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-[#030712] flex items-center justify-center"
          >
            <div className="text-center space-y-4">
              <div className="relative mx-auto size-16">
                <div className="absolute inset-0 rounded-full border-2 border-violet-500/30 animate-ping" />
                <div className="size-16 rounded-full bg-violet-600/20 border border-violet-500/40 flex items-center justify-center">
                  <Loader2 className="size-7 text-violet-400 animate-spin" />
                </div>
              </div>
              <div>
                <p className="text-white font-semibold">Building Knowledge Graph</p>
                <p className="text-slate-500 text-sm mt-1">Extracting entities from articles…</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Error state ──────────────────────────────────────────────── */}
      {loadError && !isLoading && (
        <div className="absolute inset-0 z-40 flex items-center justify-center">
          <div className="bg-slate-800 border border-red-500/30 rounded-2xl p-6 text-center max-w-sm">
            <p className="text-red-400 font-semibold mb-2">Failed to load graph</p>
            <p className="text-slate-400 text-sm mb-4">{loadError}</p>
            <button
              onClick={() => fetchGraph()}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* ── TOP OVERLAY BAR ───────────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-3 px-4 py-3 bg-gradient-to-b from-[#030712]/90 to-transparent pointer-events-none">
        {/* Stats pills */}
        <div className="pointer-events-auto">
          <GraphStatsBar stats={stats} cachedAt={cachedAt} />
        </div>

        {/* Search */}
        <div className="flex-1 max-w-xs pointer-events-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-slate-400" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search entities…"
              className="w-full pl-9 pr-3 py-2 bg-slate-800/80 border border-slate-700 text-white text-sm placeholder-slate-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/50 backdrop-blur-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Type filter pills */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          {TYPE_ORDER.map(type => (
            <button
              key={type}
              onClick={() => setFilterType(prev => prev === type ? null : type)}
              className={cn(
                "px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide border transition-all",
                filterType === type
                  ? "border-transparent text-gray-900 shadow-sm"
                  : "bg-slate-800/80 border-slate-700 text-slate-300 hover:border-slate-500"
              )}
              style={filterType === type ? { backgroundColor: NODE_COLORS[type] } : {}}
            >
              {type}
            </button>
          ))}
          {filterType && (
            <button
              onClick={() => setFilterType(null)}
              className="ml-1 p-1 text-slate-400 hover:text-white"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Refresh */}
        <button
          onClick={() => fetchGraph(true)}
          disabled={isLoading}
          className="pointer-events-auto flex items-center gap-1.5 px-3 py-2 bg-slate-800/80 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white text-xs font-medium rounded-xl transition-all backdrop-blur-sm disabled:opacity-50"
        >
          <RefreshCw className={cn("size-3.5", isLoading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* ── FORCE GRAPH ──────────────────────────────────────────────── */}
      {!isLoading && !loadError && (
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          width={dims.w}
          height={dims.h}
          backgroundColor="#030712"
          nodeLabel="label"
          nodeColor={(node: object) => NODE_COLORS[(node as GraphNode).type] ?? "#718096"}
          nodeVal={(node: object) => Math.max(1, (node as GraphNode).weight) * 2}
          linkWidth={(link: object) => Math.max(0.5, Math.sqrt((link as GraphLink).value ?? 1))}
          linkColor={() => "rgba(255,255,255,0.12)"}
          linkDirectionalParticles={1}
          linkDirectionalParticleWidth={1}
          linkDirectionalParticleColor={() => "rgba(255,255,255,0.3)"}
          onNodeClick={handleNodeClick}
          onNodeHover={(node: object | null) => setHoveredNode(node ? node as GraphNode : null)}
          nodeCanvasObject={paintNode}
          nodeCanvasObjectMode={() => "replace"}
          enableNodeDrag
          enableZoomInteraction
          cooldownTicks={120}
        />
      )}

      {/* ── HOVER TOOLTIP ────────────────────────────────────────────── */}
      {hoveredNode && (
        <div
          className="fixed z-50 bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 pointer-events-none shadow-xl"
          style={{ left: mousePos.x + 14, top: mousePos.y - 12 }}
        >
          <p className="text-sm font-bold text-white leading-none">{hoveredNode.label}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span
              className="size-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: NODE_COLORS[hoveredNode.type] ?? "#718096" }}
            />
            <p className="text-[11px] text-slate-400">{hoveredNode.type}</p>
            <span className="text-[11px] text-slate-600">·</span>
            <p className="text-[11px] text-slate-400">weight {hoveredNode.weight}</p>
          </div>
        </div>
      )}

      {/* ── RIGHT PANEL ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div
            key="panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 280 }}
            className="absolute right-0 top-0 h-full w-[360px] bg-slate-900 border-l border-slate-700/60 flex flex-col z-20 shadow-2xl"
          >
            {/* Panel header */}
            <div
              className="flex-shrink-0 px-5 py-4 border-b border-slate-700/60"
              style={{ borderTop: `3px solid ${NODE_COLORS[selectedNode.type] ?? "#718096"}` }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-white leading-snug truncate">
                    {selectedNode.label}
                  </h3>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span
                      className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: (NODE_COLORS[selectedNode.type] ?? "#718096") + "22",
                        color:           NODE_COLORS[selectedNode.type] ?? "#718096",
                        border:          `1px solid ${(NODE_COLORS[selectedNode.type] ?? "#718096")}44`,
                      }}
                    >
                      {selectedNode.type}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {nodeNeighbors?.edges.length ?? 0} connections
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-slate-400 hover:text-white p-1.5 hover:bg-slate-700 rounded-lg transition-colors flex-shrink-0"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 mt-3">
                {(["articles", "entities"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      "flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors capitalize",
                      activeTab === tab
                        ? "bg-slate-700 text-white"
                        : "text-slate-500 hover:text-slate-300"
                    )}
                  >
                    {tab === "articles" ? "Related Articles" : "Connected Entities"}
                  </button>
                ))}
              </div>
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-y-auto py-3 px-4 space-y-2">

              {/* ── Articles tab ─────────────────────────────────────── */}
              {activeTab === "articles" && (
                <>
                  {isLoadingArticles && (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="size-5 text-slate-500 animate-spin" />
                    </div>
                  )}
                  {!isLoadingArticles && nodeArticles.length === 0 && (
                    <p className="text-center text-slate-500 text-xs py-8">
                      No articles found for this entity.
                    </p>
                  )}
                  {!isLoadingArticles && nodeArticles.map(a => (
                    <a
                      key={a.article_id}
                      href={a.source_url ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block bg-slate-800 hover:bg-slate-700 border border-slate-700/60 rounded-xl p-3 transition-colors space-y-1.5 group"
                    >
                      <p className="text-xs font-semibold text-slate-200 leading-snug line-clamp-2 group-hover:text-white">
                        {a.title ?? "Untitled"}
                      </p>
                      <div className="flex items-center gap-2">
                        {a.source_name && (
                          <span className="text-[10px] text-slate-500 truncate">{a.source_name}</span>
                        )}
                        {a.sentiment && (
                          <span className={cn(
                            "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ml-auto flex-shrink-0",
                            sentimentColor(a.sentiment)
                          )}>
                            {a.sentiment}
                          </span>
                        )}
                      </div>
                    </a>
                  ))}
                </>
              )}

              {/* ── Connected entities tab ───────────────────────────── */}
              {activeTab === "entities" && (
                <>
                  {isLoadingNeighbors && (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="size-5 text-slate-500 animate-spin" />
                    </div>
                  )}
                  {!isLoadingNeighbors && (!nodeNeighbors || nodeNeighbors.neighbors.length === 0) && (
                    <p className="text-center text-slate-500 text-xs py-8">
                      No connected entities found.
                    </p>
                  )}
                  {!isLoadingNeighbors && nodeNeighbors?.neighbors.map(neighbor => {
                    const edge = nodeNeighbors.edges.find(e => {
                      const src = typeof e.source === "object" ? (e.source as GraphNode).id : e.source;
                      const tgt = typeof e.target === "object" ? (e.target as GraphNode).id : e.target;
                      return src === neighbor.id || tgt === neighbor.id;
                    });
                    return (
                      <button
                        key={neighbor.id}
                        onClick={() => handleNodeClick(neighbor)}
                        className="w-full flex items-center gap-3 bg-slate-800 hover:bg-slate-700 border border-slate-700/60 rounded-xl p-3 transition-colors text-left group"
                      >
                        <span
                          className="size-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: NODE_COLORS[neighbor.type] ?? "#718096" }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-200 truncate group-hover:text-white">
                            {neighbor.label}
                          </p>
                          {edge && (
                            <p className="text-[10px] text-slate-500 truncate mt-0.5">
                              {edge.relation}
                            </p>
                          )}
                        </div>
                        <span
                          className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: (NODE_COLORS[neighbor.type] ?? "#718096") + "22",
                            color:           NODE_COLORS[neighbor.type] ?? "#718096",
                          }}
                        >
                          {neighbor.type}
                        </span>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── BOTTOM-LEFT LEGEND ───────────────────────────────────────── */}
      <div className="absolute bottom-5 left-5 z-10">
        <div className="bg-slate-900/90 border border-slate-700/60 rounded-2xl overflow-hidden backdrop-blur-sm shadow-xl">
          <button
            onClick={() => setLegendOpen(o => !o)}
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white w-full transition-colors"
          >
            <span>Legend</span>
            {legendOpen
              ? <ChevronDown className="size-3 ml-auto" />
              : <ChevronUp   className="size-3 ml-auto" />
            }
          </button>
          {legendOpen && (
            <div className="px-3 pb-3 space-y-1.5 border-t border-slate-700/60 pt-2">
              {TYPE_ORDER.map(type => (
                <button
                  key={type}
                  onClick={() => setFilterType(prev => prev === type ? null : type)}
                  className={cn(
                    "flex items-center gap-2 w-full rounded-lg px-1.5 py-1 transition-colors",
                    filterType === type ? "bg-slate-700/60" : "hover:bg-slate-800/60"
                  )}
                >
                  <span
                    className="size-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: NODE_COLORS[type] }}
                  />
                  <span className="text-[11px] text-slate-300 capitalize">{type.toLowerCase()}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
