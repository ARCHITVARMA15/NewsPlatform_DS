import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes safely, resolving conflicts via tailwind-merge. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format a date string to a readable label (e.g. "May 9, 2026"). */
export function formatDate(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

/** Truncate a string to maxLength, appending "…" if truncated. */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 1) + "…";
}

/** Map sentiment string to a Tailwind colour class. */
export function sentimentColor(
  sentiment: "positive" | "negative" | "neutral" | string | undefined
): string {
  switch (sentiment) {
    case "positive": return "text-emerald-400";
    case "negative": return "text-red-400";
    default:         return "text-slate-400";
  }
}

/** Map sentiment string to a Tailwind background class. */
export function sentimentBg(
  sentiment: "positive" | "negative" | "neutral" | string | undefined
): string {
  switch (sentiment) {
    case "positive": return "bg-emerald-500/15 text-emerald-300";
    case "negative": return "bg-red-500/15 text-red-300";
    default:         return "bg-slate-700/50 text-slate-300";
  }
}
