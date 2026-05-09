"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO } from "date-fns";
import { api } from "@/lib/api";
import type { SentimentTrend } from "@/lib/types";
import { cn } from "@/lib/utils";

interface SentimentChartProps {
  category?: string;
}

const TIME_RANGES = [
  { label: "7d",  days: 7  },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
] as const;

const LEGEND = [
  { key: "positive", label: "Positive", color: "#10B981", gradientId: "gradPositive" },
  { key: "neutral",  label: "Neutral",  color: "#94A3B8", gradientId: "gradNeutral"  },
  { key: "negative", label: "Negative", color: "#EF4444", gradientId: "gradNegative" },
] as const;

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs min-w-[140px]">
      <p className="font-semibold text-slate-700 mb-2">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center justify-between gap-3 py-0.5">
          <div className="flex items-center gap-1.5">
            <div
              className="size-2 rounded-full flex-shrink-0"
              style={{ background: entry.color }}
            />
            <span className="text-slate-500 capitalize">{entry.name}</span>
          </div>
          <span className="font-bold text-slate-800">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export function SentimentChart({ category }: SentimentChartProps) {
  const [timeRange, setTimeRange] = useState<7 | 14 | 30>(7);
  const [data, setData] = useState<SentimentTrend[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    api
      .getSentimentTrend(timeRange, category)
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setIsLoading(false));
  }, [timeRange, category]);

  const formatted = data.map((d) => ({
    ...d,
    date: (() => {
      try {
        return format(parseISO(d.date), "MMM d");
      } catch {
        return d.date;
      }
    })(),
  }));

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            Sentiment Velocity
          </h3>
          <p className="text-sm text-slate-500 mt-0.5">
            Aggregate sentiment across news cycles
          </p>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {TIME_RANGES.map(({ label, days }) => (
            <button
              key={label}
              onClick={() => setTimeRange(days)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-semibold transition-all",
                timeRange === days
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 mb-5">
        {LEGEND.map(({ key, label, color }) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className="size-2 rounded-full" style={{ background: color }} />
            <span className="text-xs text-slate-500">{label}</span>
          </div>
        ))}
      </div>

      {/* Chart body */}
      {isLoading ? (
        <div className="h-[260px] flex items-center justify-center">
          <div className="size-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data.length === 0 ? (
        <div className="h-[260px] flex flex-col items-center justify-center text-slate-400">
          <p className="text-sm font-medium">No sentiment data yet</p>
          <p className="text-xs mt-1 text-slate-400">
            Run the pipeline to start generating trend data
          </p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart
            data={formatted}
            margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
          >
            <defs>
              {LEGEND.map(({ color, gradientId }) => (
                <linearGradient
                  key={gradientId}
                  id={gradientId}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="5%"  stopColor={color} stopOpacity={0.22} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "#94A3B8" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#94A3B8" }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} />

            {LEGEND.map(({ key, color, gradientId }) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={color}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
