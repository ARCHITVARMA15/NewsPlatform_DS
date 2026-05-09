"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bookmark,
  ExternalLink,
  FileSearch,
  Github,
  Globe2,
  LayoutDashboard,
  Settings,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Nav config ────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  {
    href:  "/dashboard",
    icon:  LayoutDashboard,
    label: "Dashboard",
    desc:  "Intelligence Feed",
  },
  {
    href:  "/agent",
    icon:  Zap,
    label: "AI Agent",
    desc:  "News Intelligence",
  },
  {
    href:  "/rag",
    icon:  FileSearch,
    label: "RAG Chatbot",
    desc:  "PDF + Web Research",
  },
  {
    href:  "#",
    icon:  Bookmark,
    label: "Saved",
    desc:  "Insights & Reports",
  },
] as const;

interface SidebarProps {
  collapsed?: boolean;
}

export function Sidebar({ collapsed = false }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "flex flex-col h-full bg-white border-r border-slate-200 transition-all duration-300",
        collapsed ? "w-16" : "w-[240px]"
      )}
    >
      {/* ── Brand ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-100 flex-shrink-0">
        <div className="size-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-sm shadow-blue-600/20 flex-shrink-0">
          <Globe2 className="size-4 text-white" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p
              className="text-sm font-bold text-slate-900 leading-none truncate"
              style={{ fontFamily: "var(--font-display, 'Plus Jakarta Sans', sans-serif)" }}
            >
              Datastraw
            </p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mt-0.5">
              News Intelligence
            </p>
          </div>
        )}
      </div>

      {/* ── Navigation ──────────────────────────────────────────────── */}
      {!collapsed && (
        <div className="px-3 pt-3 pb-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-2 mb-1">
            Navigation
          </p>
        </div>
      )}

      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto py-2">
        {NAV_ITEMS.map(({ href, icon: Icon, label, desc }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={label}
              href={href}
              title={collapsed ? `${label} — ${desc}` : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all group",
                isActive
                  ? "bg-blue-600/10 text-blue-700 font-semibold"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              )}
            >
              <Icon
                className={cn(
                  "flex-shrink-0 transition-colors",
                  collapsed ? "size-5" : "size-4",
                  isActive ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600"
                )}
              />
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <span className="block truncate">{label}</span>
                  {!isActive && (
                    <span className="block text-[10px] text-slate-400 truncate leading-none">
                      {desc}
                    </span>
                  )}
                </div>
              )}
              {!collapsed && isActive && (
                <span className="size-1.5 rounded-full bg-blue-500 flex-shrink-0" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* ── Bottom actions ──────────────────────────────────────────── */}
      <div className="border-t border-slate-100 flex-shrink-0 px-2 py-3 space-y-0.5">
        <a
          href="https://github.com/ARCHITVARMA15/NewsPlatform_DS"
          target="_blank"
          rel="noopener noreferrer"
          title={collapsed ? "GitHub Repository" : undefined}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-all"
        >
          <Github className="size-4 flex-shrink-0 text-slate-400" />
          {!collapsed && (
            <span className="flex-1 truncate">GitHub</span>
          )}
          {!collapsed && <ExternalLink className="size-3 text-slate-300" />}
        </a>

        <Link
          href="#"
          title={collapsed ? "Settings" : undefined}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-all"
        >
          <Settings className="size-4 flex-shrink-0 text-slate-400" />
          {!collapsed && <span className="flex-1 truncate">Settings</span>}
        </Link>
      </div>
    </aside>
  );
}
