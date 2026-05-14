"use client";

import { useState } from "react";
import { Globe2, Users } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { RoomLobby, type RoomSessionData } from "@/components/rooms/RoomLobby";
import { RoomSession } from "@/components/rooms/RoomSession";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Intelligence Feed" },
  { href: "/agent",     label: "News Agent"        },
  { href: "/rag",       label: "RAG Research"      },
  { href: "/rooms",     label: "Research Rooms"    },
];

export default function RoomsPage() {
  const [session, setSession] = useState<RoomSessionData | null>(null);

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">

      {/* Sidebar */}
      <aside className="w-[220px] flex-shrink-0 bg-white border-r border-slate-200 flex flex-col h-full overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="size-9 bg-violet-600 rounded-xl flex items-center justify-center shadow-sm shadow-violet-600/20 flex-shrink-0">
            <Globe2 className="size-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900 leading-none">Datastraw</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mt-0.5">
              Research Rooms
            </p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV_ITEMS.map(({ href, label }) => {
            const isActive = href === "/rooms";
            return (
              <Link
                key={label}
                href={href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  isActive
                    ? "bg-violet-50 text-violet-700 font-semibold"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800",
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 text-center">
            <Users className="size-5 text-violet-500 mx-auto mb-1.5" />
            <p className="text-[11px] font-semibold text-violet-700">Collaborate live</p>
            <p className="text-[10px] text-violet-400 mt-0.5 leading-snug">
              Share a room code and research together
            </p>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {session ? (
          <RoomSession
            session={session}
            onLeave={() => setSession(null)}
          />
        ) : (
          <RoomLobby onJoined={setSession} />
        )}
      </main>
    </div>
  );
}
