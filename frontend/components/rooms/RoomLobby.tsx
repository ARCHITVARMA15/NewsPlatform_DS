"use client";

import { useState } from "react";
import { Check, Copy, Hash, Loader2, Plus, Users } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────
export interface RoomSessionData {
  room_code:  string;
  user_id:    string;
  user_name:  string;
  topic:      string;
  history:    RoomMessage[];
  expires_at: string;
}

export interface RoomMessage {
  id:           string;
  room_code:    string;
  user_id:      string;
  user_name:    string;
  message_type: string;
  content:      string;
  metadata:     Record<string, unknown>;
  created_at:   string;
}

interface RoomLobbyProps {
  onJoined: (data: RoomSessionData) => void;
}

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Helpers ────────────────────────────────────────────────────────────────
function InputField({
  label, value, onChange, placeholder, maxLength, className,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; maxLength?: number; className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 block">
        {label}
      </label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/10 transition-all"
      />
    </div>
  );
}

// ── Create Room card ───────────────────────────────────────────────────────
function CreateRoomCard({ onJoined }: { onJoined: (d: RoomSessionData) => void }) {
  const [topic,      setTopic]      = useState("");
  const [userName,   setUserName]   = useState("");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");
  const [roomCode,   setRoomCode]   = useState<string | null>(null);
  const [copied,     setCopied]     = useState(false);
  const [sessionData,setSessionData]= useState<RoomSessionData | null>(null);

  const handleCreate = async () => {
    setError(""); setLoading(true);
    try {
      const res  = await fetch(`${BASE_URL}/api/rooms/create`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ topic, user_name: userName || "Anonymous" }),
      });
      if (!res.ok) throw new Error((await res.json()).detail ?? "Failed to create room");
      const data: RoomSessionData = await res.json();
      setRoomCode(data.room_code);
      setSessionData({ ...data, history: [] });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!roomCode) return;
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEnter = () => {
    if (sessionData) onJoined(sessionData);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-5 flex-1">
      <div className="flex items-center gap-3">
        <div className="size-9 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
          <Plus className="size-4 text-violet-600" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900">Create a Research Room</h2>
          <p className="text-xs text-slate-400 mt-0.5">Start a new collaborative session</p>
        </div>
      </div>

      <div className="space-y-4">
        <InputField label="Research Topic (optional)" value={topic} onChange={setTopic} placeholder="e.g. AI regulation, crypto markets…" />
        <InputField label="Your Name" value={userName} onChange={setUserName} placeholder="Anonymous" maxLength={32} />
      </div>

      {error && (
        <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
      )}

      {/* Room code display */}
      {roomCode && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-center space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-violet-500">Room Code</p>
          <div className="flex items-center justify-center gap-3">
            <span className="font-mono text-3xl font-bold tracking-widest text-violet-700">{roomCode}</span>
            <button
              onClick={handleCopy}
              className="p-2 rounded-lg bg-white border border-violet-200 hover:border-violet-400 text-violet-500 transition-colors"
            >
              {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
            </button>
          </div>
          <p className="text-[11px] text-violet-400">Share this code with your team</p>
          <button
            onClick={handleEnter}
            className="mt-1 w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm shadow-violet-600/20"
          >
            Enter Room →
          </button>
        </div>
      )}

      {!roomCode && (
        <button
          onClick={handleCreate}
          disabled={loading}
          className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-bold rounded-xl transition-colors shadow-sm shadow-violet-600/20 flex items-center justify-center gap-2"
        >
          {loading
            ? <><Loader2 className="size-4 animate-spin" /> Creating…</>
            : <><Plus className="size-4" /> Create Room</>
          }
        </button>
      )}
    </div>
  );
}

// ── Join Room card ─────────────────────────────────────────────────────────
function JoinRoomCard({ onJoined }: { onJoined: (d: RoomSessionData) => void }) {
  const [code,     setCode]     = useState("");
  const [userName, setUserName] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  const handleJoin = async () => {
    if (code.length < 6) { setError("Enter a 6-character room code"); return; }
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/rooms/join`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ room_code: code.toUpperCase(), user_name: userName || "Anonymous" }),
      });
      if (!res.ok) throw new Error((await res.json()).detail ?? "Failed to join room");
      const data: RoomSessionData = await res.json();
      onJoined(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-5 flex-1">
      <div className="flex items-center gap-3">
        <div className="size-9 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
          <Hash className="size-4 text-blue-600" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900">Join a Room</h2>
          <p className="text-xs text-slate-400 mt-0.5">Enter a code shared by your colleague</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 block">
            Room Code
          </label>
          <input
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase().slice(0, 6))}
            onKeyDown={e => e.key === "Enter" && handleJoin()}
            placeholder="ABC123"
            maxLength={6}
            className="w-full px-3.5 py-2.5 text-center text-2xl font-mono font-bold tracking-widest bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10 transition-all uppercase"
          />
        </div>
        <InputField label="Your Name" value={userName} onChange={setUserName} placeholder="Anonymous" maxLength={32} />
      </div>

      {error && (
        <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        onClick={handleJoin}
        disabled={loading || code.length < 6}
        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors shadow-sm shadow-blue-600/20 flex items-center justify-center gap-2"
      >
        {loading
          ? <><Loader2 className="size-4 animate-spin" /> Joining…</>
          : <><Users className="size-4" /> Join Room</>
        }
      </button>
    </div>
  );
}

// ── Lobby ──────────────────────────────────────────────────────────────────
export function RoomLobby({ onJoined }: RoomLobbyProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50">
      {/* Hero */}
      <div className="text-center mb-10">
        <div className="size-14 rounded-2xl bg-violet-600/10 border border-violet-200 flex items-center justify-center mx-auto mb-4">
          <Users className="size-6 text-violet-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Research Rooms</h1>
        <p className="text-sm text-slate-500 mt-1.5 max-w-md">
          Collaborate in real-time with your team. Ask the AI, share insights, annotate responses.
        </p>
      </div>

      {/* Cards */}
      <div className="flex gap-5 w-full max-w-2xl">
        <CreateRoomCard onJoined={onJoined} />
        <JoinRoomCard   onJoined={onJoined} />
      </div>

      {/* Features hint */}
      <div className="flex items-center gap-6 mt-8 text-[11px] text-slate-400">
        {["Real-time collaboration", "Shared AI queries", "Annotations & upvotes", "PDF export"].map(f => (
          <span key={f} className="flex items-center gap-1.5">
            <span className="size-1 rounded-full bg-violet-400" />
            {f}
          </span>
        ))}
      </div>
    </div>
  );
}
