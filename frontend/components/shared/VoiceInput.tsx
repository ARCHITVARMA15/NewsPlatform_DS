"use client";

// ── Web Speech API (local types, no global augmentation to avoid conflicts) ──
interface VSpeechRecognition {
  lang:            string;
  interimResults:  boolean;
  maxAlternatives: number;
  continuous:      boolean;
  onresult:        ((e: VSpeechRecognitionEvent) => void) | null;
  onerror:         ((e: Event) => void) | null;
  onend:           (() => void) | null;
  start():         void;
  stop():          void;
}

interface VSpeechRecognitionEvent {
  resultIndex: number;
  results: Array<Array<{ transcript: string; isFinal?: boolean }>>;
}

type SpeechCtor = new () => VSpeechRecognition;

import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff } from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
}

export function VoiceInput({ onTranscript, disabled = false, className }: VoiceInputProps) {
  const [isListening, setIsListening]     = useState(false);
  const [interim, setInterim]             = useState("");
  const recognitionRef                    = useRef<VSpeechRecognition | null>(null);

  const isSupported = useCallback(() => {
    if (typeof window === "undefined") return false;
    const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
    return !!(w.SpeechRecognition ?? w.webkitSpeechRecognition);
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
    setInterim("");
  }, []);

  const startListening = useCallback(() => {
    const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) {
      toast.error("Voice input is not supported in this browser.");
      return;
    }

    const recognition = new SR();
    recognition.lang            = "en-US";
    recognition.interimResults  = true;
    recognition.maxAlternatives = 1;
    recognition.continuous      = false;

    recognition.onresult = (e: VSpeechRecognitionEvent) => {
      let interimTranscript = "";
      let finalTranscript   = "";

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const t      = result[0].transcript;
        if (result[0].isFinal) {
          finalTranscript += t;
        } else {
          interimTranscript += t;
        }
      }

      setInterim(interimTranscript);

      if (finalTranscript) {
        onTranscript(finalTranscript.trim());
        setInterim("");
        setIsListening(false);
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
      setInterim("");
      toast.error("Voice recognition failed. Please try again.");
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterim("");
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [onTranscript]);

  const toggle = useCallback(() => {
    if (!isSupported()) {
      toast.error("Voice input is not supported in this browser.");
      return;
    }
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, isSupported, startListening, stopListening]);

  return (
    <div className={cn("relative flex items-center", className)}>
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        title={
          !isSupported()
            ? "Voice input not supported"
            : isListening
            ? "Stop recording"
            : "Click to speak your query"
        }
        className={cn(
          "relative size-8 flex items-center justify-center rounded-xl transition-all",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
          disabled && "opacity-50 cursor-not-allowed",
          isListening
            ? "bg-red-100 text-red-600"
            : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
        )}
      >
        {/* Pulse rings when recording */}
        <AnimatePresence>
          {isListening && (
            <>
              <motion.span
                key="ring1"
                initial={{ scale: 1, opacity: 0.6 }}
                animate={{ scale: 2.2, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
                className="absolute inset-0 rounded-xl bg-red-400/30"
              />
              <motion.span
                key="ring2"
                initial={{ scale: 1, opacity: 0.4 }}
                animate={{ scale: 1.7, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut", delay: 0.3 }}
                className="absolute inset-0 rounded-xl bg-red-400/20"
              />
            </>
          )}
        </AnimatePresence>

        {isListening ? (
          <MicOff className="size-4 relative z-10" />
        ) : (
          <Mic className="size-4 relative z-10" />
        )}
      </button>

      {/* Interim transcript tooltip */}
      <AnimatePresence>
        {isListening && interim && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-800 text-white text-xs rounded-lg shadow-lg whitespace-nowrap max-w-xs truncate pointer-events-none z-50"
          >
            {interim}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
