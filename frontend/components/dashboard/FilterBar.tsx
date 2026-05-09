"use client";

import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { ArticleFilters } from "@/lib/types";

interface FilterBarProps {
  filters: ArticleFilters;
  onChange: (filters: ArticleFilters) => void;
  resultCount?: number;
}

const CATEGORIES = [
  { label: "All Sectors", value: "" },
  { label: "Technology",  value: "technology" },
  { label: "Politics",    value: "politics" },
  { label: "Business",    value: "business" },
  { label: "Finance",     value: "finance" },
  { label: "Science",     value: "science" },
  { label: "Health",      value: "health" },
  { label: "World",       value: "world" },
  { label: "Energy",      value: "energy" },
  { label: "Defense",     value: "defense" },
];

const SENTIMENTS = [
  { label: "All",      value: "" },
  { label: "Positive", value: "positive" },
  { label: "Negative", value: "negative" },
  { label: "Neutral",  value: "neutral" },
];

export function FilterBar({ filters, onChange, resultCount }: FilterBarProps) {
  const [localSearch, setLocalSearch] = useState(filters.search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalSearch(filters.search);
  }, [filters.search]);

  const handleSearchChange = (value: string) => {
    setLocalSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChange({ ...filters, search: value });
    }, 300);
  };

  const handleReset = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setLocalSearch("");
    onChange({ search: "", category: "", sentiment: "" });
  };

  const isDirty =
    filters.search !== "" ||
    filters.category !== "" ||
    filters.sentiment !== "";

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {/* Search input */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={localSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search signals, entities, or authors…"
            className="w-full pl-9 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all placeholder:text-slate-400"
          />
          {localSearch && (
            <button
              onClick={() => handleSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Category dropdown */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Category:
          </span>
          <div className="relative">
            <select
              value={filters.category}
              onChange={(e) =>
                onChange({ ...filters, category: e.target.value })
              }
              className="appearance-none pl-3 pr-8 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all text-slate-700 cursor-pointer min-w-[130px]"
            >
              {CATEGORIES.map(({ label, value }) => (
                <option key={label} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <svg
              className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-slate-400 pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>

        {/* Sentiment radio group */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Sentiment:
          </span>
          <div className="flex items-center gap-3">
            {SENTIMENTS.map(({ label, value }) => (
              <label
                key={label}
                className="flex items-center gap-1.5 cursor-pointer group"
              >
                <input
                  type="radio"
                  name="sentiment-filter"
                  value={value}
                  checked={filters.sentiment === value}
                  onChange={() => onChange({ ...filters, sentiment: value })}
                  className="size-3.5 accent-blue-600"
                />
                <span
                  className={cn(
                    "text-sm transition-colors",
                    filters.sentiment === value
                      ? "text-blue-600 font-semibold"
                      : "text-slate-600 group-hover:text-slate-900"
                  )}
                >
                  {label}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Reset button */}
        {isDirty && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors ml-auto"
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* Result count */}
      {resultCount !== undefined && (
        <p className="text-xs text-slate-400 leading-none">
          Showing{" "}
          <span className="font-semibold text-slate-600">{resultCount}</span>{" "}
          {resultCount === 1 ? "article" : "articles"}
          {isDirty && " matching your filters"}
        </p>
      )}
    </div>
  );
}
