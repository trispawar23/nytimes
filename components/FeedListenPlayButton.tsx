"use client";

import { Loader2, Pause, Play } from "lucide-react";
import { useSyncExternalStore } from "react";
import type { Article } from "@/lib/types";
import { articleDisplayBody } from "@/lib/reading-stats";
import {
  buildArticleSpeechText,
  getPuterPlaybackSnapshot,
  runPuterListen,
  subscribePuterPlayback,
} from "@/lib/puter-tts";

type Props = {
  article: Article;
  className?: string;
  /** Daily strip: light gray circle. Opinions: black circle. AFY row: black square (24px). */
  tone?: "muted" | "dark" | "afy";
};

export function FeedListenPlayButton({
  article,
  className = "",
  tone = "muted",
}: Props) {
  const key = `feed:${article.id}`;
  const snap = useSyncExternalStore(
    subscribePuterPlayback,
    getPuterPlaybackSnapshot,
    () => ({
      key: null,
      phase: "idle" as const,
      meta: null,
      paused: false,
    }),
  );
  const mine = snap.key === key;
  const phase = mine ? snap.phase : "idle";

  const shell =
    tone === "afy"
      ? "flex size-6 shrink-0 items-center justify-center rounded-none bg-black text-white"
      : tone === "dark"
        ? "flex size-[39px] shrink-0 items-center justify-center rounded-full bg-black text-white"
        : "flex size-[26.71px] shrink-0 items-center justify-center rounded-full bg-[#DDDDDD] text-black";

  const speechText = buildArticleSpeechText(
    article.title,
    articleDisplayBody(article),
  );

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void runPuterListen({
          key,
          speechText,
          meta: { articleId: article.id, imageUrl: article.imageUrl },
        }).catch(() => {
          /* error surfaced via global phase */
        });
      }}
      disabled={phase === "loading"}
      aria-label={
        phase === "playing"
          ? "Pause audio"
          : phase === "loading"
            ? "Loading audio"
            : phase === "paused"
              ? "Resume audio"
              : "Listen to article without opening"
      }
      className={`${shell} focus:outline-none focus-visible:ring-2 focus-visible:ring-black/25 disabled:opacity-70 ${className}`}
    >
      {phase === "idle" || phase === "paused" || phase === "error" ? (
        <Play
          className={
            tone === "dark" || tone === "afy"
              ? "ml-0.5 size-[13px] fill-white text-white"
              : "ml-0.5 h-3 w-3 fill-current"
          }
          aria-hidden
        />
      ) : phase === "loading" ? (
        <Loader2
          className={
            tone === "dark" || tone === "afy"
              ? "size-[13px] animate-spin text-white"
              : "h-3 w-3 animate-spin"
          }
          aria-hidden
        />
      ) : (
        <Pause
          className={
            tone === "dark" || tone === "afy"
              ? "size-[13px] text-white"
              : "h-3 w-3"
          }
          strokeWidth={2}
          aria-hidden
        />
      )}
    </button>
  );
}
