"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  Circle,
  ClipboardCopy,
  Loader2,
  Mic,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Share2,
  Video,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import type { BriefingResponse, Article } from "@/lib/types";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────
type Phase = "idle" | "generating" | "ready";

interface GenerateStep {
  id:    number;
  label: string;
  sub:   string;
  delay: number;   // ms after generation starts when this step "completes"
}

const STEPS: GenerateStep[] = [
  { id: 1, label: "Fetching top stories",    sub: "Reading latest articles from database",      delay: 1000  },
  { id: 2, label: "Writing anchor script",   sub: "Groq LLaMA crafting your broadcast text",    delay: 4000  },
  { id: 3, label: "Generating voice",        sub: "ElevenLabs synthesizing AI anchor voice",    delay: 12000 },
  { id: 4, label: "Creating anchor video",   sub: "D-ID animating talking-head presenter",      delay: 25000 },
];

// ── Soundwave animation (inline keyframes injected once) ──────────────────
const SOUNDWAVE_STYLE = `
@keyframes soundwave {
  0%, 100% { height: 6px;  }
  50%       { height: 28px; }
}
`;

// ── Component ──────────────────────────────────────────────────────────────
interface BriefingStudioProps {
  preloaded?: BriefingResponse | null;
  onGenerated?: () => void;
}

export function BriefingStudio({ preloaded, onGenerated }: BriefingStudioProps) {
  const [phase,         setPhase]         = useState<Phase>("idle");
  const [topN,          setTopN]          = useState(5);
  const [script,        setScript]        = useState("");
  const [audioUrl,      setAudioUrl]      = useState<string | null>(null);
  const [videoUrl,      setVideoUrl]      = useState<string | null>(null);
  const [error,         setError]         = useState<string | null>(null);
  const [completedStep, setCompletedStep] = useState(0);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [copied,        setCopied]        = useState(false);
  const [articles,      setArticles]      = useState<Article[]>([]);

  const audioRef   = useRef<HTMLAudioElement | null>(null);
  const timerRefs  = useRef<ReturnType<typeof setTimeout>[]>([]);

  // ── Load preloaded briefing (from PastBriefings click) ───────────────────
  useEffect(() => {
    if (!preloaded) return;
    setScript(preloaded.script);
    setAudioUrl(preloaded.audio_url);
    setVideoUrl(preloaded.video_url);
    setPhase("ready");
    fetchArticles(5);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preloaded]);

  // ── Cleanup timers on unmount ────────────────────────────────────────────
  useEffect(() => {
    return () => { timerRefs.current.forEach(clearTimeout); };
  }, []);

  const fetchArticles = useCallback(async (n: number) => {
    try {
      const data = await api.getArticles({ limit: n });
      setArticles(data);
    } catch { /* articles are decorative — fail silently */ }
  }, []);

  // ── Generate ──────────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    timerRefs.current.forEach(clearTimeout);
    timerRefs.current = [];
    setPhase("generating");
    setCompletedStep(0);
    setError(null);

    // Kick off timed step completions
    STEPS.forEach(step => {
      const t = setTimeout(() => setCompletedStep(step.id), step.delay);
      timerRefs.current.push(t);
    });

    // Kick off actual API call in parallel
    try {
      const result = await api.generateBriefing(topN);
      timerRefs.current.forEach(clearTimeout);
      setCompletedStep(4);  // mark all done
      setScript(result.script);
      setAudioUrl(result.audio_url);
      setVideoUrl(result.video_url);
      // Brief pause so user sees the final step animation
      await new Promise(r => setTimeout(r, 600));
      setPhase("ready");
      fetchArticles(topN);
      onGenerated?.();
    } catch (err: unknown) {
      timerRefs.current.forEach(clearTimeout);
      setPhase("idle");
      setError(err instanceof Error ? err.message : "Failed to generate briefing");
    }
  }, [topN, fetchArticles, onGenerated]);

  // ── Audio toggle ─────────────────────────────────────────────────────────
  const toggleAudio = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current.play();
      setIsPlayingAudio(true);
    }
  }, [isPlayingAudio]);

  // ── Copy script ──────────────────────────────────────────────────────────
  const copyScript = useCallback(() => {
    navigator.clipboard.writeText(script);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [script]);

  // ── Share briefing ───────────────────────────────────────────────────────
  const shareBriefing = useCallback(() => {
    const msg = `📻 AI News Briefing — ${new Date().toLocaleDateString()}\n\n${script}\n\nGenerated by Datastraw`;
    navigator.clipboard.writeText(msg);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [script]);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  // ── Sentiment badge color ────────────────────────────────────────────────
  const sentimentColor = (s?: string) =>
    s === "positive" ? "bg-emerald-100 text-emerald-700"
    : s === "negative" ? "bg-red-100 text-red-700"
    : "bg-slate-100 text-slate-600";

  // =========================================================================
  // RENDER
  // =========================================================================
  return (
    <>
      {/* Inject soundwave keyframes once */}
      <style>{SOUNDWAVE_STYLE}</style>

      <div className="flex-1 flex flex-col overflow-auto h-full">
        <AnimatePresence mode="wait">

          {/* ── IDLE ──────────────────────────────────────────────────────── */}
          {phase === "idle" && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="flex-1 flex items-center justify-center p-8"
            >
              <div className="max-w-md w-full space-y-6">
                {/* Icon + heading */}
                <div className="text-center">
                  <div className="size-16 bg-blue-600/10 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-blue-200">
                    <Mic className="size-8 text-blue-600" />
                  </div>
                  <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                    Daily AI News Briefing
                  </h1>
                  <p className="text-slate-500 mt-2 text-sm">
                    Your top stories, read by an AI anchor
                  </p>
                </div>

                {/* Date + count card */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="size-9 bg-slate-100 rounded-xl flex items-center justify-center">
                      <Calendar className="size-4 text-slate-500" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-900 leading-none">{today}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Latest stories available</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-blue-600 leading-none">{topN}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">stories</p>
                  </div>
                </div>

                {/* Slider */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">Number of stories</span>
                    <span className="text-sm font-bold text-blue-600">{topN}</span>
                  </div>
                  <input
                    type="range"
                    min={3}
                    max={10}
                    value={topN}
                    onChange={e => setTopN(Number(e.target.value))}
                    className="w-full h-1.5 rounded-full bg-slate-200 appearance-none cursor-pointer accent-blue-600"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>3</span><span>10</span>
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
                    <AlertCircle className="size-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-600 leading-relaxed">{error}</p>
                  </div>
                )}

                {/* CTA */}
                <button
                  onClick={handleGenerate}
                  className="w-full flex items-center justify-center gap-2.5 py-3.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-2xl transition-all active:scale-[0.98] shadow-lg shadow-blue-600/25"
                >
                  <Mic className="size-4" />
                  Generate Briefing
                </button>
                <p className="text-center text-xs text-slate-400">
                  Takes 20–30 seconds · Powered by Groq + ElevenLabs + D-ID
                </p>
              </div>
            </motion.div>
          )}

          {/* ── GENERATING ────────────────────────────────────────────────── */}
          {phase === "generating" && (
            <motion.div
              key="generating"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="flex-1 flex items-center justify-center p-8"
            >
              <div className="max-w-sm w-full space-y-6">
                {/* Pulsing icon */}
                <div className="flex justify-center">
                  <div className="relative">
                    <div className="size-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/30">
                      <Radio className="size-7 text-white animate-pulse" />
                    </div>
                    <span className="absolute -top-1 -right-1 size-4 bg-red-500 rounded-full flex items-center justify-center">
                      <span className="size-2 bg-white rounded-full animate-ping" />
                    </span>
                  </div>
                </div>

                <div className="text-center">
                  <h2 className="text-lg font-bold text-slate-900">Generating Briefing</h2>
                  <p className="text-sm text-slate-500 mt-1">Creating your personalised news briefing…</p>
                </div>

                {/* Steps */}
                <div className="space-y-3">
                  {STEPS.map((step) => {
                    const done    = completedStep >= step.id;
                    const active  = completedStep === step.id - 1;
                    return (
                      <motion.div
                        key={step.id}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: step.id * 0.1 }}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 rounded-xl border transition-all",
                          done   ? "bg-blue-50 border-blue-200"
                          : active ? "bg-white border-slate-200 shadow-sm"
                          : "bg-white border-slate-100 opacity-50"
                        )}
                      >
                        {done ? (
                          <CheckCircle2 className="size-4 text-blue-600 flex-shrink-0" />
                        ) : active ? (
                          <Loader2 className="size-4 text-slate-400 animate-spin flex-shrink-0" />
                        ) : (
                          <Circle className="size-4 text-slate-300 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-sm font-semibold leading-none",
                            done ? "text-blue-700" : "text-slate-700"
                          )}>
                            {step.label}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5 leading-none">{step.sub}</p>
                        </div>
                        <span className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded-full",
                          done ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-400"
                        )}>
                          {step.id}/{STEPS.length}
                        </span>
                      </motion.div>
                    );
                  })}
                </div>

                <p className="text-center text-[11px] text-slate-400">
                  Do not close this window. Processing on the server.
                </p>
              </div>
            </motion.div>
          )}

          {/* ── READY ─────────────────────────────────────────────────────── */}
          {phase === "ready" && (
            <motion.div
              key="ready"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col overflow-auto"
            >
              {/* Top action bar */}
              <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-white">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-500" />
                  <span className="text-sm font-semibold text-slate-700">Briefing Ready</span>
                  <span className="text-[11px] text-slate-400">{today}</span>
                </div>
                <button
                  onClick={() => { setPhase("idle"); setError(null); }}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <RefreshCw className="size-3.5" />
                  Regenerate
                </button>
              </div>

              <div className="flex-1 overflow-auto p-6">
                <div className="max-w-4xl mx-auto space-y-6">

                  {/* ── Script + Player row ─────────────────────────────── */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                    {/* Script card */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-900">Today's Briefing Script</h3>
                        <button
                          onClick={copyScript}
                          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 transition-colors border border-slate-200"
                        >
                          {copied ? <Check className="size-3" /> : <ClipboardCopy className="size-3" />}
                          {copied ? "Copied!" : "Copy"}
                        </button>
                      </div>
                      <blockquote className="relative pl-4 border-l-2 border-blue-300">
                        <p className="text-sm text-slate-700 leading-relaxed italic">
                          {script}
                        </p>
                      </blockquote>
                    </div>

                    {/* Media player card */}
                    <div className="rounded-2xl overflow-hidden shadow-sm">
                      {videoUrl ? (
                        // ── Video player ───────────────────────────────────
                        <div className="relative bg-gray-900 rounded-2xl overflow-hidden">
                          <span className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-full">
                            <span className="size-1.5 bg-white rounded-full animate-pulse" />
                            AI ANCHOR
                          </span>
                          <video
                            src={videoUrl}
                            controls
                            autoPlay
                            muted
                            className="w-full max-h-64 rounded-2xl object-cover"
                          />
                          <div className="p-3 bg-gray-900">
                            <div className="flex items-center gap-2">
                              <Video className="size-3.5 text-gray-400" />
                              <p className="text-xs text-gray-400">AI Anchor · Powered by D-ID</p>
                            </div>
                          </div>
                        </div>
                      ) : audioUrl ? (
                        // ── Audio player ────────────────────────────────────
                        <div className="bg-gray-900 rounded-2xl p-6 flex flex-col items-center gap-5 h-full justify-center min-h-[200px]">
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1 bg-blue-600/20 text-blue-400 text-[10px] font-bold px-2.5 py-1 rounded-full border border-blue-500/30">
                              <Radio className="size-2.5" />
                              AUDIO BRIEFING
                            </span>
                          </div>

                          {/* Soundwave bars */}
                          <div className="flex items-center justify-center gap-1.5 h-10">
                            {[0.0, 0.1, 0.2, 0.15, 0.05].map((delay, i) => (
                              <div
                                key={i}
                                className="w-1.5 bg-blue-500 rounded-full"
                                style={{
                                  height: isPlayingAudio ? undefined : "6px",
                                  animation: isPlayingAudio
                                    ? `soundwave 0.8s ease-in-out infinite`
                                    : "none",
                                  animationDelay: `${delay}s`,
                                  minHeight: "6px",
                                }}
                              />
                            ))}
                          </div>

                          {/* Hidden HTML audio element */}
                          <audio
                            ref={audioRef}
                            src={audioUrl}
                            onEnded={() => setIsPlayingAudio(false)}
                          />

                          {/* Play / pause button */}
                          <button
                            onClick={toggleAudio}
                            className="size-14 bg-blue-600 hover:bg-blue-500 rounded-full flex items-center justify-center transition-all shadow-lg shadow-blue-600/40 active:scale-95"
                          >
                            {isPlayingAudio
                              ? <Pause className="size-6 text-white" />
                              : <Play className="size-6 text-white ml-0.5" />
                            }
                          </button>

                          <p className="text-[11px] text-gray-500">
                            {isPlayingAudio ? "Playing…" : "Tap to play"}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Share button */}
                  <div className="flex justify-center">
                    <button
                      onClick={shareBriefing}
                      className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-800 px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 transition-all"
                    >
                      <Share2 className="size-4" />
                      {copied ? "Copied to clipboard!" : "Share Briefing"}
                    </button>
                  </div>

                  {/* ── Article cards ───────────────────────────────────── */}
                  {articles.length > 0 && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
                        Stories that powered this briefing
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {articles.map((a) => (
                          <div
                            key={a.article_id}
                            className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm space-y-1.5"
                          >
                            <p className="text-xs font-semibold text-slate-800 line-clamp-2 leading-snug">
                              {a.title ?? "Untitled"}
                            </p>
                            <div className="flex items-center gap-2">
                              {a.source_name && (
                                <span className="text-[10px] text-slate-400 truncate">
                                  {a.source_name}
                                </span>
                              )}
                              {a.sentiment && (
                                <span className={cn(
                                  "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ml-auto",
                                  sentimentColor(a.sentiment)
                                )}>
                                  {a.sentiment}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
