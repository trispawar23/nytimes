"use client";

import { Loader2, Pause, Play } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  PUTER_TTS_MAX_CHARS,
  getPuterPlaybackSnapshot,
  prefetchPuterListen,
  replacePlaybackKeyIfMatch,
  runPuterListen,
  stopPuterPlayback,
  subscribePuterPlayback,
} from "@/lib/puter-tts";

type Props = {
  /** Stabilizes pause/resume for this article in the reader */
  playbackKey: string;
  thumbnailUrl: string | null;
  speechText: string;
  /** Shown after the interpunct, e.g. `8:00 min` */
  durationLabel: string;
};

export function ListenToArticleBar({
  playbackKey,
  thumbnailUrl,
  speechText,
  durationLabel,
}: Props) {
  const key = `reader:${playbackKey}`;
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [truncationNote, setTruncationNote] = useState<string | null>(null);

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

  const prevPlaybackKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setErrorDetail(null);
    setTruncationNote(null);
  }, [speechText, playbackKey]);

  useEffect(() => {
    const raw = speechText.trim();
    if (!raw) return;
    const id = window.setTimeout(() => {
      prefetchPuterListen({
        key,
        speechText,
      });
    }, 300);
    return () => window.clearTimeout(id);
  }, [key, speechText]);

  /** Before paint: hand feed dock session to reader so the chip stays filled when opening a playing story. */
  useLayoutEffect(() => {
    replacePlaybackKeyIfMatch(`feed:${playbackKey}`, `reader:${playbackKey}`);
  }, [playbackKey]);

  /** Stop only when switching to a different article inside the reader (not on mount / Strict Mode remounts). */
  useEffect(() => {
    const prev = prevPlaybackKeyRef.current;
    if (prev !== null && prev !== playbackKey) {
      stopPuterPlayback();
    }
    prevPlaybackKeyRef.current = playbackKey;
  }, [playbackKey]);

  const onPress = useCallback(async () => {
    const raw = speechText.trim();
    console.log("[tts/button] Listen button pressed", {
      playbackKey,
      chars: raw.length,
      phase,
    });
    if (!raw) {
      setErrorDetail("No article text to read.");
      window.setTimeout(() => setErrorDetail(null), 4000);
      return;
    }

    const truncated = raw.length > PUTER_TTS_MAX_CHARS;
    setTruncationNote(null);

    try {
      const { didStartNewPlayback } = await runPuterListen({
        key,
        speechText,
        meta: { articleId: playbackKey, imageUrl: thumbnailUrl },
      });
      if (truncated && didStartNewPlayback) {
        setTruncationNote(
          "Playing the opening of this article (listen limit applies).",
        );
        window.setTimeout(() => setTruncationNote(null), 6000);
      }
      console.log("[tts/button] Listen request handled", {
        playbackKey,
        didStartNewPlayback,
      });
    } catch (e) {
      console.error("[tts/button] Listen request failed", {
        playbackKey,
        message: e instanceof Error ? e.message : "Unknown error",
      });
      setErrorDetail(
        e instanceof Error
          ? e.message
          : "Could not start listening. This browser may not support text-to-speech.",
      );
      window.setTimeout(() => setErrorDetail(null), 5000);
    }
  }, [key, speechText, playbackKey, thumbnailUrl, phase]);

  const showPlayIcon =
    phase === "idle" || phase === "paused" || phase === "error";

  return (
    <button
      type="button"
      onClick={() => void onPress()}
      disabled={phase === "loading"}
      aria-busy={phase === "loading" ? true : undefined}
      aria-label={
        phase === "playing"
          ? "Pause article audio"
          : phase === "loading"
            ? "Generating audio"
            : phase === "paused"
              ? "Resume article audio"
              : "Listen to this article"
      }
      className="flex w-full max-w-[380.12px] flex-row items-center gap-[5.14px] rounded-md text-left transition-opacity hover:opacity-90 disabled:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/25"
    >
      <span className="flex size-[37px] shrink-0 items-center justify-center rounded-full bg-[#DDDDDD] text-black">
        {showPlayIcon ? (
          <Play className="ml-0.5 size-4 fill-current" aria-hidden />
        ) : phase === "loading" ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Pause className="size-4" strokeWidth={2} aria-hidden />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-sans text-[10.27px] font-medium leading-[18.49px] text-black">
          Listen to this article · {durationLabel}
        </span>
        {errorDetail ? (
          <span className="font-sans text-[9px] leading-snug text-amber-900">
            {errorDetail}
          </span>
        ) : truncationNote ? (
          <span className="font-sans text-[9px] leading-snug text-[#6b6b6b]">
            {truncationNote}
          </span>
        ) : (
          <span className="font-sans text-[9px] leading-snug text-[#6b6b6b]">
            AI-generated voice
          </span>
        )}
      </span>
    </button>
  );
}

export { buildArticleSpeechText } from "@/lib/puter-tts";
