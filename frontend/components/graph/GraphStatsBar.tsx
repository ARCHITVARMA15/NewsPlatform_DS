"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface Stats {
  total_nodes:        number;
  total_edges:        number;
  articles_processed: number;
}

interface GraphStatsBarProps {
  stats:     Stats | null;
  cachedAt:  string | null;
  className?: string;
}

// ── Animated counter ──────────────────────────────────────────────────────
function AnimatedCounter({ target }: { target: number }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (target === 0) return;
    const steps    = 40;
    const duration = 800; // ms
    const step     = Math.ceil(target / steps);
    const interval = setInterval(() => {
      setCount(prev => {
        const next = prev + step;
        if (next >= target) {
          clearInterval(interval);
          return target;
        }
        return next;
      });
    }, duration / steps);
    return () => clearInterval(interval);
  }, [target]);

  return <span>{count.toLocaleString()}</span>;
}

// ── Time-ago helper ───────────────────────────────────────────────────────
function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// ── Component ─────────────────────────────────────────────────────────────
export function GraphStatsBar({ stats, cachedAt, className }: GraphStatsBarProps) {
  const pills = [
    { label: "Entities",         value: stats?.total_nodes        ?? 0, color: "bg-violet-100 text-violet-700 border-violet-200" },
    { label: "Connections",      value: stats?.total_edges        ?? 0, color: "bg-blue-100 text-blue-700 border-blue-200"       },
    { label: "Articles analyzed",value: stats?.articles_processed ?? 0, color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  ];

  return (
    <div className={cn("flex items-center gap-3 flex-wrap", className)}>
      {pills.map(p => (
        <span
          key={p.label}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border",
            p.color
          )}
        >
          <AnimatedCounter target={p.value} />
          <span className="font-normal opacity-70">{p.label}</span>
        </span>
      ))}
      {cachedAt && (
        <span className="text-[10px] text-slate-400 ml-1">
          Updated {timeAgo(cachedAt)}
        </span>
      )}
    </div>
  );
}
