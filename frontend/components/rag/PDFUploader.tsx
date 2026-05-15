"use client";

import { useCallback, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  HardDriveDownload,
  Link2,
  Loader2,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import type { PDFMetadata } from "@/lib/types";
import { cn } from "@/lib/utils";

interface PDFUploaderProps {
  threadId: string;
  onPDFReady: (meta: PDFMetadata) => void;
  onPDFRemoved: () => void;
  activePDF: PDFMetadata | null;
}

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

export function PDFUploader({
  threadId,
  onPDFReady,
  onPDFRemoved,
  activePDF,
}: PDFUploaderProps) {
  const [isExpanded,  setIsExpanded]  = useState(!activePDF);
  const [uploading,   setUploading]   = useState(false);
  const [progress,    setProgress]    = useState(0);
  const [error,       setError]       = useState<string | null>(null);
  const [tab,         setTab]         = useState<"file" | "drive">("file");
  const [driveUrl,    setDriveUrl]    = useState("");
  const [driveLoading, setDriveLoading] = useState(false);

  // ── Upload handler ───────────────────────────────────────────────────
  const handleUpload = useCallback(
    async (file: File) => {
      setError(null);
      setUploading(true);
      setProgress(10);

      // Simulate step-by-step progress while the real upload runs
      const tick = setInterval(() => {
        setProgress((p) => Math.min(p + 12, 85));
      }, 350);

      try {
        const meta = await api.uploadPDF(file, threadId);
        clearInterval(tick);
        setProgress(100);
        setTimeout(() => {
          setProgress(0);
          setUploading(false);
          setIsExpanded(false);
          onPDFReady(meta);
        }, 600);
      } catch (err) {
        clearInterval(tick);
        setProgress(0);
        setUploading(false);
        setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
      }
    },
    [threadId, onPDFReady]
  );

  // ── Drive URL handler ─────────────────────────────────────────────────
  const handleDriveImport = async () => {
    if (!driveUrl.trim()) return;
    setError(null);
    setDriveLoading(true);
    try {
      const meta = await api.uploadFromDrive(driveUrl.trim(), threadId);
      setDriveUrl("");
      setIsExpanded(false);
      onPDFReady(meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Drive import failed.");
    } finally {
      setDriveLoading(false);
    }
  };

  // ── Dropzone config ──────────────────────────────────────────────────
  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      if (rejected.length > 0) {
        const err = rejected[0].errors[0];
        if (err.code === "file-too-large") {
          setError("File exceeds 20 MB limit.");
        } else if (err.code === "file-invalid-type") {
          setError("Only PDF files are accepted.");
        } else {
          setError("Invalid file.");
        }
        return;
      }
      if (accepted[0]) handleUpload(accepted[0]);
    },
    [handleUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    maxSize: MAX_BYTES,
    disabled: uploading,
  });

  // ── Active PDF banner ────────────────────────────────────────────────
  if (activePDF && !isExpanded) {
    return (
      <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
        <div className="size-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <FileText className="size-4 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-blue-700">PDF Active:</span>
            <span className="text-xs text-blue-600 font-semibold truncate">
              {activePDF.filename}
            </span>
            <span className="text-[10px] text-blue-500 bg-blue-100 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap">
              {activePDF.page_count}p · {activePDF.chunk_count} chunks
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setIsExpanded(true)}
            className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-100 rounded-lg transition-colors"
            title="Replace PDF"
          >
            <UploadCloud className="size-3.5" />
          </button>
          <button
            onClick={onPDFRemoved}
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            title="Remove PDF — switch to web-only mode"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // ── Collapsed header when PDF active ────────────────────────────────
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
      {/* Header */}
      <button
        onClick={() => setIsExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <UploadCloud className="size-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">
            {activePDF ? `PDF: ${activePDF.filename}` : "Upload e-Newspaper PDF"}
          </span>
          {!activePDF && (
            <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              Optional
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="size-4 text-slate-400" />
        ) : (
          <ChevronDown className="size-4 text-slate-400" />
        )}
      </button>

      {/* Expandable body */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 space-y-3">
              {/* Tab switcher */}
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                <button
                  onClick={() => setTab("file")}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-md transition-all ${
                    tab === "file" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <UploadCloud className="size-3.5" /> Upload File
                </button>
                <button
                  onClick={() => setTab("drive")}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-md transition-all ${
                    tab === "drive" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <HardDriveDownload className="size-3.5" /> Google Drive
                </button>
              </div>

              {/* Drive URL input */}
              {tab === "drive" && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500">
                    Paste a public Google Drive share link. File must be shared as
                    <span className="font-semibold text-slate-700"> Anyone with the link</span>.
                  </p>
                  <div className="flex gap-2">
                    <div className="flex-1 flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 bg-slate-50">
                      <Link2 className="size-3.5 text-slate-400 flex-shrink-0" />
                      <input
                        type="url"
                        value={driveUrl}
                        onChange={(e) => setDriveUrl(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleDriveImport()}
                        placeholder="https://drive.google.com/file/d/…/view"
                        className="flex-1 bg-transparent text-xs text-slate-700 placeholder:text-slate-400 outline-none"
                      />
                    </div>
                    <button
                      onClick={handleDriveImport}
                      disabled={driveLoading || !driveUrl.trim()}
                      className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                    >
                      {driveLoading ? <Loader2 className="size-3.5 animate-spin" /> : <HardDriveDownload className="size-3.5" />}
                      Import
                    </button>
                  </div>
                </div>
              )}

              {/* Drop zone — only shown in file tab */}
              {tab === "file" && <div
                {...getRootProps()}
                className={cn(
                  "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
                  isDragActive
                    ? "border-blue-400 bg-blue-50"
                    : uploading
                    ? "border-slate-200 bg-slate-50 cursor-not-allowed"
                    : "border-slate-200 hover:border-blue-300 hover:bg-slate-50"
                )}
              >
                <input {...getInputProps()} />

                {uploading ? (
                  <div className="space-y-3">
                    <Loader2 className="size-8 text-blue-500 animate-spin mx-auto" />
                    <p className="text-sm font-semibold text-slate-700">
                      Processing PDF…
                    </p>
                    {/* Progress bar */}
                    <div className="w-full max-w-xs mx-auto bg-slate-200 h-1.5 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-blue-500 rounded-full"
                        initial={{ width: "0%" }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                      />
                    </div>
                    <p className="text-xs text-slate-400">
                      Chunking and embedding pages…
                    </p>
                  </div>
                ) : isDragActive ? (
                  <div className="space-y-2">
                    <UploadCloud className="size-8 text-blue-500 mx-auto" />
                    <p className="text-sm font-semibold text-blue-600">
                      Drop your PDF here
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <FileText className="size-8 text-slate-300 mx-auto" />
                    <p className="text-sm font-semibold text-slate-600">
                      Drag & drop a PDF here, or{" "}
                      <span className="text-blue-600 underline">browse</span>
                    </p>
                    <p className="text-xs text-slate-400">
                      Upload an e-newspaper PDF to chat with it · Max 20 MB
                    </p>
                  </div>
                )}
              </div>}

              {/* Error message */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
                  >
                    <X className="size-3.5 text-red-500 flex-shrink-0" />
                    <p className="text-xs text-red-600">{error}</p>
                    <button
                      onClick={() => setError(null)}
                      className="ml-auto text-red-400 hover:text-red-600"
                    >
                      <X className="size-3.5" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Success state */}
              {activePDF && (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  <CheckCircle2 className="size-4 text-emerald-500 flex-shrink-0" />
                  <p className="text-xs text-emerald-700 font-medium">
                    {activePDF.filename} — {activePDF.page_count} pages,{" "}
                    {activePDF.chunk_count} chunks indexed
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
