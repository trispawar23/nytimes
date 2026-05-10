"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, BookOpen, Loader2, ShieldCheck, X } from "lucide-react";
import { useEffect, useMemo } from "react";
import {
  articleReadRailStops,
  nearestArticleReadRailStop,
} from "@/lib/reading-stats";
import type { FeedMode, SummaryResponse } from "@/lib/types";
import { ArticleReadTimeRail } from "./ArticleReadTimeRail";
import { VoiceInteraction } from "./VoiceInteraction";

export type PanelStatus =
  | "idle"
  | "loading"
  | "error"
  | "success"
  | "low_confidence"
  | "insufficient_source";

type Props = {
  open: boolean;
  onClose: () => void;
  mode: FeedMode;
  status: PanelStatus;
  errorMessage?: string;
  data?: SummaryResponse | null;
  readingTimeMinutes: number;
  onReadingTimeChange: (n: number) => void;
  question: string;
  onQuestionChange: (q: string) => void;
  onAsk: () => void;
  voiceActive: boolean;
  onVoiceToggle: () => void;
  onCatchMeUp: () => void;
};

export function CatchMeUpPanel({
  open,
  onClose,
  mode,
  status,
  errorMessage,
  data,
  readingTimeMinutes,
  onReadingTimeChange,
  question,
  onQuestionChange,
  onAsk,
  voiceActive,
  onVoiceToggle,
  onCatchMeUp,
}: Props) {
  const busy = status === "loading";
  const readRailStops = useMemo(() => articleReadRailStops(), []);
  const railValue = nearestArticleReadRailStop(readingTimeMinutes, [
    ...readRailStops,
  ]);

  useEffect(() => {
    if (!open) return;
    const v = nearestArticleReadRailStop(readingTimeMinutes, [...readRailStops]);
    if (v !== readingTimeMinutes) {
      onReadingTimeChange(v);
    }
  }, [open, readingTimeMinutes, readRailStops, onReadingTimeChange]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="absolute inset-0 z-[110] flex flex-col bg-white/96 backdrop-blur-md"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex items-start justify-between gap-2 border-b border-rule px-4 py-3">
            <div>
              <p className="font-serif text-[18px] leading-snug text-ink">
                Catch me up
              </p>
              <p className="mt-1 font-sans text-[11px] text-ink-muted">
                Assistive briefing · not a replacement for reporting
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-rule bg-white p-2 text-ink hover:bg-paper"
              aria-label="Close panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
            <div className="rounded-2xl border border-rule bg-white/80 p-3">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <p className="font-sans text-[11px] leading-relaxed text-ink-muted">
                  Summaries follow{" "}
                  <span className="font-semibold text-ink">lib/editorial-rules.md</span>{" "}
                  on the server. The model only works from the excerpt available in
                  this prototype.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-rule bg-white/70 px-3 py-3">
              <div className="mb-2">
                <p className="font-serif text-[12px] font-semibold text-ink">
                  Reading time
                </p>
                <p className="font-sans text-[11px] text-ink-muted">
                  Shapes density, not facts.
                </p>
              </div>
              <ArticleReadTimeRail
                stops={readRailStops}
                value={railValue}
                onChange={onReadingTimeChange}
                disabled={busy}
              />
            </div>

            <VoiceInteraction
              active={voiceActive}
              busy={busy}
              onToggle={onVoiceToggle}
            />

            <div className="rounded-2xl border border-rule bg-white/80 p-3">
              <label className="font-serif text-[12px] font-semibold text-ink">
                Ask a question
              </label>
              <textarea
                value={question}
                onChange={(e) => onQuestionChange(e.target.value)}
                disabled={busy}
                rows={3}
                placeholder="e.g., What changed since yesterday?"
                className="mt-2 w-full resize-none rounded-xl border border-rule bg-paper px-3 py-2 font-sans text-[13px] text-ink outline-none ring-accent/30 focus:ring-2 disabled:opacity-50"
              />
              <button
                type="button"
                disabled={busy}
                onClick={onAsk}
                className="mt-2 w-full rounded-full bg-ink py-2 font-serif text-[13px] text-paper disabled:opacity-40"
              >
                Update briefing
              </button>
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={onCatchMeUp}
              className="w-full rounded-full border border-ink/15 bg-paper py-2 font-serif text-[13px] text-ink disabled:opacity-40"
            >
              Regenerate from article
            </button>

            <div className="rounded-2xl border border-rule bg-white/90 p-3">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-ink-muted" />
                <p className="font-serif text-[12px] font-semibold text-ink">
                  Briefing
                </p>
                <span className="ml-auto rounded-full bg-paper px-2 py-0.5 font-sans text-[10px] uppercase tracking-wide text-ink-muted">
                  {mode}
                </span>
              </div>

              {status === "idle" ? (
                <p className="mt-3 font-sans text-[12px] text-ink-muted">
                  Select a story, then tap{" "}
                  <span className="font-semibold text-ink">Regenerate from article</span>{" "}
                  or <span className="font-semibold text-ink">Update briefing</span> to run
                  the model. The header mic only opens this panel.
                </p>
              ) : null}

              {status === "loading" ? (
                <div className="mt-4 flex items-center gap-2 font-sans text-[12px] text-ink-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating a constrained brief…
                </div>
              ) : null}

              {status === "error" ? (
                <div className="mt-3 flex gap-2 rounded-xl border border-red-200 bg-red-50/80 p-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
                  <p className="font-sans text-[12px] text-red-900">
                    {errorMessage ?? "Something went wrong."}
                  </p>
                </div>
              ) : null}

              {status === "insufficient_source" ? (
                <div className="mt-3 flex gap-2 rounded-xl border border-amber-200 bg-amber-50/80 p-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-900" />
                  <p className="font-sans text-[12px] text-amber-950">
                    {errorMessage ??
                      "The article text available here is too short for a reliable AI brief. Open the full story for complete context."}
                  </p>
                </div>
              ) : null}

              {(status === "success" || status === "low_confidence") && data ? (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 space-y-3"
                >
                  {status === "low_confidence" ? (
                    <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50/70 p-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-900" />
                      <p className="font-sans text-[11px] text-amber-950">
                        Low confidence ({Math.round(data.confidence * 100)}%). Treat
                        this as directional, not definitive.
                      </p>
                    </div>
                  ) : null}

                  <p className="font-serif text-[17px] leading-snug text-ink">
                    {data.headline}
                  </p>
                  <p className="font-sans text-[13px] leading-relaxed text-ink">
                    {data.summary}
                  </p>
                  <div>
                    <p className="font-serif text-[12px] font-semibold text-ink">
                      Key points
                    </p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 font-sans text-[12px] text-ink-muted">
                      {data.key_points.map((k) => (
                        <li key={k}>{k}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-serif text-[12px] font-semibold text-ink">
                      Why it matters
                    </p>
                    <p className="mt-1 font-sans text-[12px] leading-relaxed text-ink-muted">
                      {data.why_it_matters}
                    </p>
                  </div>
                  <div className="rounded-xl border border-rule bg-paper px-3 py-2">
                    <p className="font-serif text-[12px] font-semibold text-ink">
                      Voice script
                    </p>
                    <p className="mt-1 font-serif text-[13px] leading-relaxed text-ink">
                      {data.voice_script}
                    </p>
                  </div>
                  <div className="rounded-xl border border-rule bg-paper px-3 py-2">
                    <p className="font-serif text-[12px] font-semibold text-ink">
                      Limitations
                    </p>
                    <p className="mt-1 font-sans text-[11px] leading-relaxed text-ink-muted">
                      {data.limitations}
                    </p>
                  </div>
                  <p className="font-sans text-[10px] text-ink-faint">
                    Model confidence: {Math.round(data.confidence * 100)}% · Mode:{" "}
                    {mode} · Target read: {readingTimeMinutes} min
                  </p>
                </motion.div>
              ) : null}
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
