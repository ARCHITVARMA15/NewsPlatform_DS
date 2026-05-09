"use client";

import { motion } from "framer-motion";
import { CheckCircle2, FileText, Scale, Search, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface HumanInLoopButtonsProps {
  onAction: (action: string) => void;
  isLoading?: boolean;
}

const ACTIONS = [
  {
    id:        "generate_pdf",
    label:     "Generate PDF",
    icon:      FileText,
    tooltip:   "Generate a professional PDF intelligence report for this session",
    baseClass: "border-blue-200 text-blue-700 hover:bg-blue-50 hover:border-blue-300 hover:shadow-blue-100",
  },
  {
    id:        "dive_deeper",
    label:     "Dive Deeper",
    icon:      Search,
    tooltip:   "Search 5 more sources from academic & government databases",
    baseClass: "border-violet-200 text-violet-700 hover:bg-violet-50 hover:border-violet-300 hover:shadow-violet-100",
  },
  {
    id:        "bias_detect",
    label:     "Detect Bias",
    icon:      Scale,
    tooltip:   "Analyze media bias across left-leaning, centrist, and right-leaning outlets",
    baseClass: "border-amber-200 text-amber-700 hover:bg-amber-50 hover:border-amber-300 hover:shadow-amber-100",
  },
  {
    id:        "track_story",
    label:     "Track Story",
    icon:      TrendingUp,
    tooltip:   "See how this story evolved over the past 30 days",
    baseClass: "border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300 hover:shadow-emerald-100",
  },
] as const;

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

const itemVariants = {
  hidden:   { opacity: 0, y: 16, scale: 0.95 },
  visible:  { opacity: 1, y: 0,  scale: 1, transition: { type: "spring", damping: 18, stiffness: 280 } },
};

export function HumanInLoopButtons({
  onAction,
  isLoading = false,
}: HumanInLoopButtonsProps) {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="flex flex-wrap items-center justify-center gap-2 pt-4 mt-2 border-t border-slate-200"
    >
      {ACTIONS.map((action) => (
        <motion.div key={action.id} variants={itemVariants}>
          <button
            title={action.tooltip}
            onClick={() => onAction(action.id)}
            disabled={isLoading}
            className={cn(
              "flex items-center gap-2 px-5 py-2 bg-white border rounded-full text-sm font-semibold",
              "transition-all active:scale-95 shadow-sm hover:shadow",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              action.baseClass
            )}
          >
            <action.icon className="size-3.5" />
            {action.label}
          </button>
        </motion.div>
      ))}

      {/* Done button */}
      <motion.div variants={itemVariants}>
        <button
          title="End this investigation session"
          onClick={() => onAction("end")}
          disabled={isLoading}
          className={cn(
            "flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-full text-sm font-bold",
            "border border-blue-600 hover:bg-blue-700 active:scale-95",
            "transition-all shadow-sm shadow-blue-600/20 hover:shadow-md hover:shadow-blue-600/25",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          <CheckCircle2 className="size-3.5" />
          Done
        </button>
      </motion.div>
    </motion.div>
  );
}
