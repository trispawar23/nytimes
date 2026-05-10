"use client";

import { Mic, Square } from "lucide-react";
import { motion } from "framer-motion";

type Props = {
  active: boolean;
  busy: boolean;
  onToggle: () => void;
};

export function VoiceInteraction({ active, busy, onToggle }: Props) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-rule bg-white/80 px-3 py-2">
      <div>
        <p className="font-serif text-[12px] font-semibold text-ink">
          Voice mode
        </p>
        <p className="font-sans text-[11px] text-ink-muted">
          Generates a speakable script from the same article text.
        </p>
      </div>
      <motion.button
        type="button"
        whileTap={{ scale: 0.96 }}
        disabled={busy}
        onClick={onToggle}
        className={`relative flex h-12 w-12 items-center justify-center rounded-full border text-paper shadow-sm transition ${
          active
            ? "border-ink bg-ink"
            : "border-rule bg-ink text-paper hover:bg-ink/90"
        } disabled:opacity-40`}
        aria-pressed={active}
        aria-label={active ? "Stop voice mode" : "Start voice mode"}
      >
        {active ? (
          <Square className="h-4 w-4 fill-current" />
        ) : (
          <Mic className="h-5 w-5" />
        )}
        {active ? (
          <span className="absolute -bottom-1 h-2 w-2 rounded-full bg-accent" />
        ) : null}
      </motion.button>
    </div>
  );
}
