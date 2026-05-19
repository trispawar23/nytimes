"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ChevronRight, Loader2, Mic, Square, X } from "lucide-react";
import { useEffect, useMemo } from "react";
import {
  articleReadRailStops,
  nearestArticleReadRailStop,
} from "@/lib/reading-stats";
import type { Article, FeedMode, SummaryResponse } from "@/lib/types";
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
  /** Article's full estimated read time; rail's Full stop snaps to this. */
  articleFullMinutes?: number;
  question: string;
  onQuestionChange: (q: string) => void;
  voiceActive: boolean;
  onVoiceActiveChange: (active: boolean) => void;
  onVoiceTranscript: (text: string) => void;
  recommendations: Article[];
  recommendationsTitle: string | null;
  onOpenRecommendation: (article: Article) => void;
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
  articleFullMinutes,
  question,
  onQuestionChange,
  voiceActive,
  onVoiceActiveChange,
  onVoiceTranscript,
  recommendations,
  recommendationsTitle,
  onOpenRecommendation,
}: Props) {
  const busy = status === "loading";
  const readRailStops = useMemo(
    () => articleReadRailStops(articleFullMinutes),
    [articleFullMinutes],
  );
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
          className="pointer-events-none absolute inset-x-0 top-[214px] z-[105] px-[14px]"
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="sr-only">
            <ArticleReadTimeRail
              stops={readRailStops}
              value={railValue}
              onChange={onReadingTimeChange}
              disabled={busy}
            />
            <textarea
              value={question}
              onChange={(e) => onQuestionChange(e.target.value)}
              disabled={busy}
              aria-label="Voice command transcript"
            />
            <button type="button" onClick={onClose}>
              Close assistant
            </button>
          </div>

          <div className="pointer-events-auto max-h-[410px] overflow-hidden rounded-[8px] bg-white px-[18px] py-[18px] shadow-[0_6px_28px_rgba(0,0,0,0.16)] ring-1 ring-black/5 font-sans">
            <div className="mb-3 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => onVoiceActiveChange(!voiceActive)}
                disabled={busy}
                className={`flex size-10 shrink-0 items-center justify-center rounded-full text-white shadow-[0_4px_14px_rgba(0,0,0,0.22)] disabled:opacity-45 ${
                  voiceActive ? "bg-black" : "bg-black"
                }`}
                aria-label={voiceActive ? "Stop recording" : "Ask follow-up"}
              >
                {voiceActive ? (
                  <Square className="size-4 fill-current" aria-hidden />
                ) : (
                  <Mic className="size-5" aria-hidden />
                )}
              </button>
              <p className="min-w-0 flex-1 truncate font-sans text-[12px] font-medium text-black/55">
                {voiceActive
                  ? "Listening..."
                  : busy
                    ? "Working on it..."
                    : data || recommendations.length > 0
                      ? "Ask a follow-up"
                      : "Voice assistant"}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-black/5 text-black hover:bg-black/10"
                aria-label="Close assistant"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            <VoiceInteraction
              active={voiceActive}
              busy={busy}
              onActiveChange={onVoiceActiveChange}
              onTranscript={onVoiceTranscript}
              hidden
            />

            {question.trim() ? (
              <div className="mb-4 flex justify-end">
                <div className="max-w-[82%] rounded-[6px] bg-black px-4 py-3 font-['Helvetica_Neue',Helvetica,Arial,sans-serif] text-[15px] font-semibold leading-snug text-white">
                  {question.trim()}
                </div>
              </div>
            ) : null}

            {voiceActive ? (
              <div className="flex min-h-[180px] items-center gap-4">
                <span className="relative flex size-10 shrink-0 items-center justify-center">
                  <span className="absolute size-10 animate-ping rounded-full bg-black/10" />
                  <span className="size-5 rounded-full bg-black" />
                </span>
                <p className="font-sans text-[17px] font-semibold text-black">
                  Listening...
                </p>
              </div>
            ) : null}

            {status === "idle" && !voiceActive && recommendations.length === 0 ? (
              <div className="flex min-h-[180px] items-center justify-center text-center">
                <p className="font-sans text-[17px] font-semibold text-black">
                  Ask me for a briefing
                </p>
              </div>
            ) : null}

            {status === "loading" && !voiceActive ? (
              <div className="flex min-h-[220px] items-center gap-4">
                <Loader2 className="size-10 animate-spin text-black/30" />
                <p className="font-sans text-[17px] font-semibold text-black">
                  Generating your briefing...
                </p>
              </div>
            ) : null}

            {status === "error" && !voiceActive ? (
              <div className="flex min-h-[180px] gap-3 rounded-[6px] border border-red-200 bg-red-50/80 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
                <p className="font-sans text-[13px] text-red-900">
                  {errorMessage ?? "Something went wrong."}
                </p>
              </div>
            ) : null}

            {status === "insufficient_source" && !voiceActive ? (
              <div className="flex min-h-[180px] gap-3 rounded-[6px] border border-amber-200 bg-amber-50/80 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-900" />
                <p className="font-sans text-[13px] text-amber-950">
                  {errorMessage ??
                    "The article text available here is too short for a reliable AI brief. Open the full story for complete context."}
                </p>
              </div>
            ) : null}

            {(status === "success" || status === "low_confidence") &&
            data &&
            !voiceActive ? (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-h-[318px] overflow-y-auto pr-1"
              >
                <p className="mb-4 font-sans text-[20px] font-semibold leading-snug text-black">
                  {data.headline}
                </p>
                <div className="mb-4 h-px w-full bg-black/25" />
                <ul className="list-disc space-y-3 pl-6 font-serif text-[18px] leading-[1.23] text-black">
                  {data.key_points.map((k) => (
                    <li key={k}>{k}</li>
                  ))}
                </ul>
                <p className="mt-4 font-serif text-[16px] leading-snug text-black">
                  {data.summary}
                </p>
              </motion.div>
            ) : null}

            {recommendations.length > 0 && !voiceActive && status !== "loading" ? (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-h-[318px] overflow-y-auto pr-1"
              >
                <p className="mb-4 font-sans text-[20px] font-semibold leading-snug text-black">
                  {recommendationsTitle ?? "Related articles"}
                </p>
                <div className="mb-2 h-px w-full bg-black/25" />
                <div className="divide-y divide-black/25">
                  {recommendations.map((article) => (
                    <button
                      key={article.id}
                      type="button"
                      onClick={() => onOpenRecommendation(article)}
                      className="flex w-full items-center gap-3 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-black/25"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-serif text-[18px] font-semibold leading-[1.12] text-black">
                          {article.title}
                        </span>
                        <span className="mt-1 block font-sans text-[13px] text-black/55">
                          {article.source || "Recommended"}
                        </span>
                      </span>
                      <ChevronRight className="size-6 shrink-0 text-black" aria-hidden />
                    </button>
                  ))}
                </div>
              </motion.div>
            ) : null}

            {recommendations.length === 0 && !voiceActive && status === "idle" && question.trim() ? (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-h-[318px] overflow-y-auto pr-1"
              >
                <p className="mb-4 font-sans text-[20px] font-semibold leading-snug text-black">
                  No article recommendations found
                </p>
                <p className="font-sans text-[14px] leading-snug text-black/70">
                  Try another follow-up command or open a different story to get suggestions.
                </p>
              </motion.div>
            ) : null}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
