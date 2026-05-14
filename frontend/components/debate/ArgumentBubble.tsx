"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ArgumentBubbleProps {
  agent:       "optimist" | "skeptic";
  argument:    string;
  round:       number;
  isStreaming: boolean;
}

export function ArgumentBubble({
  agent,
  argument,
  round,
  isStreaming,
}: ArgumentBubbleProps) {
  const [displayed, setDisplayed] = useState(isStreaming ? "" : argument);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idxRef      = useRef(0);

  // ── Typing animation ────────────────────────────────────────────────────
  useEffect(() => {
    // Clear any running animation
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (!isStreaming) {
      setDisplayed(argument);
      return;
    }

    const words = argument.split(" ");
    idxRef.current = 0;
    setDisplayed("");

    intervalRef.current = setInterval(() => {
      idxRef.current += 1;
      setDisplayed(words.slice(0, idxRef.current).join(" "));
      if (idxRef.current >= words.length) {
        clearInterval(intervalRef.current!);
      }
    }, 30);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [argument, isStreaming]);

  const isOptimist = agent === "optimist";

  return (
    <motion.div
      initial={{ x: isOptimist ? -24 : 24, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="w-full"
    >
      {/* Agent label */}
      <p className={cn(
        "text-[10px] font-bold uppercase tracking-widest mb-1",
        isOptimist ? "text-emerald-600" : "text-red-500"
      )}>
        {isOptimist ? "Optimist Analyst" : "Skeptic Analyst"}
      </p>

      {/* Bubble */}
      <div className={cn(
        "relative rounded-2xl px-4 py-3 shadow-sm border",
        isOptimist
          ? "bg-emerald-50 border-emerald-200 border-l-4 border-l-emerald-500"
          : "bg-red-50 border-red-200 border-r-4 border-r-red-500"
      )}>
        {/* Round badge */}
        <span className={cn(
          "inline-block text-[9px] font-bold uppercase px-2 py-0.5 rounded-full mb-2",
          isOptimist
            ? "bg-emerald-100 text-emerald-700"
            : "bg-red-100 text-red-600"
        )}>
          Round {round + 1}
        </span>

        {/* Argument text */}
        <p className="text-sm text-slate-700 leading-relaxed">
          {displayed}
          {/* Blinking cursor while typing */}
          {isStreaming && (
            <span className={cn(
              "inline-block w-0.5 h-3.5 ml-0.5 align-middle animate-pulse",
              isOptimist ? "bg-emerald-500" : "bg-red-500"
            )} />
          )}
        </p>
      </div>
    </motion.div>
  );
}
