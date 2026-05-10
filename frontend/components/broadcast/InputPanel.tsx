"use client";

import { useCallback, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { AlertCircle, Film, Link2, Tv, Upload, Youtube } from "lucide-react";
import { cn } from "@/lib/utils";

interface InputPanelProps {
  onAnalyzeURL:  (url: string, threadId: string) => void;
  onUploadFile:  (file: File, threadId: string) => void;
  isLoading?:    boolean;
}

export function InputPanel({ onAnalyzeURL, onUploadFile, isLoading = false }: InputPanelProps) {
  const [tab, setTab]     = useState<"url" | "upload">("url");
  const [url, setUrl]     = useState("");
  const [urlError, setUrlError] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const threadIdRef = useRef(`bcast_${Date.now()}`);

  // ── URL submit ─────────────────────────────────────────────────────────
  const handleSubmitURL = () => {
    setUrlError("");
    const trimmed = url.trim();
    if (!trimmed) { setUrlError("Please enter a YouTube URL."); return; }
    if (!trimmed.includes("youtube.com") && !trimmed.includes("youtu.be")) {
      setUrlError("URL must be from youtube.com or youtu.be");
      return;
    }
    onAnalyzeURL(trimmed, threadIdRef.current);
  };

  // ── File drop ──────────────────────────────────────────────────────────
  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) setSelectedFile(accepted[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "video/mp4":  [".mp4"],
      "audio/mpeg": [".mp3"],
      "audio/wav":  [".wav"],
      "audio/x-m4a":[".m4a"],
      "video/webm": [".webm"],
    },
    maxFiles: 1,
    maxSize: 100 * 1024 * 1024,
  });

  const handleSubmitFile = () => {
    if (!selectedFile) return;
    onUploadFile(selectedFile, threadIdRef.current);
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-violet-600/20 border border-violet-500/30 mb-4">
          <Tv className="size-8 text-violet-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">News Broadcast Analyzer</h1>
        <p className="text-slate-400 text-sm max-w-md mx-auto">
          Paste a YouTube news channel URL or upload a video file. We&apos;ll transcribe,
          analyze, and let you chat with the broadcast content.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex bg-slate-800/60 rounded-xl p-1 mb-6 border border-slate-700/50">
        <button
          onClick={() => setTab("url")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all",
            tab === "url"
              ? "bg-violet-600 text-white shadow-sm shadow-violet-600/30"
              : "text-slate-400 hover:text-slate-200"
          )}
        >
          <Youtube className="size-4" />
          YouTube URL
        </button>
        <button
          onClick={() => setTab("upload")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all",
            tab === "upload"
              ? "bg-violet-600 text-white shadow-sm shadow-violet-600/30"
              : "text-slate-400 hover:text-slate-200"
          )}
        >
          <Upload className="size-4" />
          Upload File
        </button>
      </div>

      {/* ── YouTube URL tab ────────────────────────────────────────────── */}
      {tab === "url" && (
        <div className="space-y-4">
          <div className="relative">
            <Link2 className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
            <input
              type="url"
              value={url}
              onChange={e => { setUrl(e.target.value); setUrlError(""); }}
              onKeyDown={e => e.key === "Enter" && handleSubmitURL()}
              placeholder="https://www.youtube.com/watch?v=..."
              disabled={isLoading}
              className="w-full pl-10 pr-4 py-3.5 bg-slate-800/80 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-violet-500/70 focus:ring-1 focus:ring-violet-500/30 disabled:opacity-50 transition-all"
            />
          </div>

          {urlError && (
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="size-4 flex-shrink-0" />
              {urlError}
            </div>
          )}

          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-amber-500 inline-block" />
            Processing takes 2–5 minutes depending on video length
          </p>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Examples</p>
            {[
              "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
              "https://youtu.be/your-news-video-id",
            ].map(ex => (
              <button
                key={ex}
                onClick={() => setUrl(ex)}
                className="w-full text-left text-xs text-slate-500 hover:text-violet-400 truncate transition-colors"
              >
                → {ex}
              </button>
            ))}
          </div>

          <button
            onClick={handleSubmitURL}
            disabled={isLoading || !url.trim()}
            className="w-full py-3.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-violet-600/20"
          >
            <Film className="size-4" />
            {isLoading ? "Starting analysis…" : "Analyze Broadcast"}
          </button>
        </div>
      )}

      {/* ── Upload file tab ─────────────────────────────────────────────── */}
      {tab === "upload" && (
        <div className="space-y-4">
          <div
            {...getRootProps()}
            className={cn(
              "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
              isDragActive
                ? "border-violet-500 bg-violet-500/10"
                : "border-slate-600/50 hover:border-violet-500/50 hover:bg-slate-800/40",
              selectedFile && "border-violet-500/60 bg-violet-500/5"
            )}
          >
            <input {...getInputProps()} />
            {selectedFile ? (
              <div className="space-y-2">
                <div className="size-12 mx-auto bg-violet-600/20 rounded-xl flex items-center justify-center">
                  <Film className="size-6 text-violet-400" />
                </div>
                <p className="text-white font-semibold text-sm">{selectedFile.name}</p>
                <p className="text-slate-400 text-xs">
                  {(selectedFile.size / 1_048_576).toFixed(1)} MB
                </p>
                <p className="text-violet-400 text-xs">Click or drag to replace</p>
              </div>
            ) : (
              <div className="space-y-3">
                <Upload className="size-10 mx-auto text-slate-500" />
                <div>
                  <p className="text-white font-semibold text-sm">
                    {isDragActive ? "Drop your file here" : "Drag & drop or click to upload"}
                  </p>
                  <p className="text-slate-500 text-xs mt-1">MP4, MP3, WAV, M4A, WEBM · Max 100 MB</p>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleSubmitFile}
            disabled={isLoading || !selectedFile}
            className="w-full py-3.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-violet-600/20"
          >
            <Upload className="size-4" />
            {isLoading ? "Uploading…" : "Analyze File"}
          </button>
        </div>
      )}
    </div>
  );
}
