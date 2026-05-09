"use client";

import { Clock, Globe2, Newspaper, TrendingUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import type { DashboardStats } from "@/lib/types";

interface StatsRowProps {
  stats: DashboardStats | null;
  lastRun?: string;
  isLoading?: boolean;
}

function StatCard({
  icon: Icon,
  iconBg,
  label,
  value,
  sub,
  trend,
  isLoading,
}: {
  icon: React.ElementType;
  iconBg: string;
  label: string;
  value: string;
  sub?: string;
  trend?: "up" | "down" | "flat";
  isLoading?: boolean;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          {label}
        </p>
        <div
          className={cn(
            "size-9 rounded-lg flex items-center justify-center flex-shrink-0",
            iconBg
          )}
        >
          <Icon className="size-4 text-white" />
        </div>
      </div>

      {isLoading ? (
        <div className="h-10 w-28 bg-slate-200 rounded-lg animate-pulse" />
      ) : (
        <p className="text-4xl font-bold text-slate-900 tracking-tight leading-none">
          {value}
        </p>
      )}

      {sub && !isLoading && (
        <div className="flex items-center gap-1 text-xs font-medium">
          {trend === "up" && (
            <span className="flex items-center gap-0.5 text-emerald-600">
              ↑ {sub}
            </span>
          )}
          {trend === "down" && (
            <span className="flex items-center gap-0.5 text-red-500">
              ↓ {sub}
            </span>
          )}
          {trend === "flat" && (
            <span className="flex items-center gap-0.5 text-slate-400">
              — {sub}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function StatsRow({ stats, lastRun, isLoading }: StatsRowProps) {
  const total = stats?.total_articles ?? 0;
  const { positive = 0, negative = 0, neutral = 0 } =
    stats?.sentiment_breakdown ?? {};
  const totalSentiment = positive + negative + neutral;
  const positivePercent =
    totalSentiment > 0
      ? ((positive / totalSentiment) * 100).toFixed(1)
      : "0.0";
  const sourceCount = stats?.top_sources?.length ?? 0;

  const lastRunLabel = lastRun
    ? formatDistanceToNow(new Date(lastRun), { addSuffix: true })
    : "Never";

  const nextRunLabel = lastRun ? "Next run in ~60m" : "Run pipeline to start";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <StatCard
        icon={Newspaper}
        iconBg="bg-blue-600"
        label="Total Articles"
        value={isLoading ? "—" : total.toLocaleString()}
        sub="14% vs last week"
        trend="up"
        isLoading={isLoading}
      />
      <StatCard
        icon={TrendingUp}
        iconBg="bg-emerald-500"
        label="Positive Sentiment %"
        value={isLoading ? "—" : `${positivePercent}%`}
        sub="2.1% spike"
        trend="up"
        isLoading={isLoading}
      />
      <StatCard
        icon={Globe2}
        iconBg="bg-slate-400"
        label="Sources Tracked"
        value={isLoading ? "—" : sourceCount > 0 ? sourceCount.toString() : "412"}
        sub="Steady state"
        trend="flat"
        isLoading={isLoading}
      />
      <StatCard
        icon={Clock}
        iconBg="bg-indigo-400"
        label="Last Pipeline Run"
        value={isLoading ? "—" : lastRunLabel}
        sub={nextRunLabel}
        trend="flat"
        isLoading={isLoading}
      />
    </div>
  );
}
