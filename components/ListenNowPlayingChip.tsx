"use client";

import { Loader2, Pause, Play } from "lucide-react";
import {
  type DragEvent,
  type TransitionEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { Article } from "@/lib/types";
import {
  dragEventCarriesArticle,
  getArticleIdFromDrag,
  NYTIMES_ARTICLE_CARD_ATTR,
} from "@/lib/article-dnd";
import {
  buildArticleSpeechText,
  getPuterPlaybackSnapshot,
  runPuterListen,
  subscribePuterPlayback,
  togglePuterPlaybackPause,
} from "@/lib/puter-tts";
import { articleDisplayBody } from "@/lib/reading-stats";
import { SafeArticleImage } from "./SafeArticleImage";

const NAV_BOTTOM_RESERVED_PX = 94.5;

const DRAG_GUIDE_AUTO_FADE_MS = 5000;
const DRAG_GUIDE_FADE_DURATION_MS = 320;

/** #6BA1DD at ~87% opacity — readable but shows content behind slightly */
const DRAG_GUIDE_BLUE = "rgba(107, 161, 221, 0.87)";

/** Finger must move this far before we treat the gesture as a drag (vs tap). */
const TOUCH_DRAG_THRESHOLD_PX = 22;
/** Extra hit slop around the dock column for releasing a finger. */
const TOUCH_DROP_SLOP_PX = 16;

type Props = {
  articles: Article[];
  onOpenArticle: (article: Article) => void;
};

const emptySnap = {
  key: null,
  phase: "idle" as const,
  meta: null,
  paused: false,
};

export function ListenNowPlayingChip({ articles, onOpenArticle }: Props) {
  const snap = useSyncExternalStore(
    subscribePuterPlayback,
    getPuterPlaybackSnapshot,
    () => emptySnap,
  );

  const [dragHighlight, setDragHighlight] = useState(false);
  /** Shown on every full page load; no localStorage — dismiss/fade/drop only hides until next reload. */
  const [showDragGuide, setShowDragGuide] = useState(true);
  const [dragGuideFading, setDragGuideFading] = useState(false);
  const dragGuideAutoFadeTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const dismissDragGuide = useCallback(() => {
    if (dragGuideAutoFadeTimerRef.current !== null) {
      clearTimeout(dragGuideAutoFadeTimerRef.current);
      dragGuideAutoFadeTimerRef.current = null;
    }
    setDragGuideFading(false);
    setShowDragGuide(false);
  }, []);

  useEffect(() => {
    if (!showDragGuide) return;
    dragGuideAutoFadeTimerRef.current = setTimeout(() => {
      dragGuideAutoFadeTimerRef.current = null;
      setDragGuideFading(true);
    }, DRAG_GUIDE_AUTO_FADE_MS);
    return () => {
      if (dragGuideAutoFadeTimerRef.current !== null) {
        clearTimeout(dragGuideAutoFadeTimerRef.current);
        dragGuideAutoFadeTimerRef.current = null;
      }
    };
  }, [showDragGuide]);

  const onDragGuideFadeComplete = useCallback(
    (e: TransitionEvent<HTMLDivElement>) => {
      if (e.propertyName !== "opacity") return;
      if (e.target !== e.currentTarget) return;
      if (!dragGuideFading) return;
      dismissDragGuide();
    },
    [dragGuideFading, dismissDragGuide],
  );

  const activeVisible =
    !!snap.meta &&
    (snap.phase === "loading" ||
      snap.phase === "playing" ||
      snap.paused);

  const onDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!dragEventCarriesArticle(e)) return;
    e.preventDefault();
    const rel = e.relatedTarget as Node | null;
    if (rel && e.currentTarget.contains(rel)) return;
    setDragHighlight(true);
  }, []);

  const onDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!dragEventCarriesArticle(e)) return;
    const rel = e.relatedTarget as Node | null;
    if (rel && e.currentTarget.contains(rel)) return;
    setDragHighlight(false);
  }, []);

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!dragEventCarriesArticle(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const dockColumnRef = useRef<HTMLDivElement>(null);
  const touchDragRef = useRef<{
    articleId: string | null;
    startX: number;
    startY: number;
    dragging: boolean;
  }>({
    articleId: null,
    startX: 0,
    startY: 0,
    dragging: false,
  });
  const suppressCardClickUntilRef = useRef(0);

  const commitListenFromArticle = useCallback(
    (article: Article) => {
      const speechText = buildArticleSpeechText(
        article.title,
        articleDisplayBody(article),
      );
      void runPuterListen({
        key: `feed:${article.id}`,
        speechText,
        meta: { articleId: article.id, imageUrl: article.imageUrl },
      }).catch(() => {});
      dismissDragGuide();
    },
    [dismissDragGuide],
  );

  const playRandomArticleFromFeed = useCallback(() => {
    if (articles.length === 0) return;
    const article = articles[Math.floor(Math.random() * articles.length)];
    if (!article) return;
    commitListenFromArticle(article);
  }, [articles, commitListenFromArticle]);

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragHighlight(false);
      const id = getArticleIdFromDrag(e.dataTransfer);
      if (!id) return;
      const article = articles.find((x) => x.id === id);
      if (!article) return;
      commitListenFromArticle(article);
    },
    [articles, commitListenFromArticle],
  );

  useEffect(() => {
    const ptInDockSlop = (clientX: number, clientY: number): boolean => {
      const el = dockColumnRef.current;
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const p = TOUCH_DROP_SLOP_PX;
      return (
        clientX >= r.left - p &&
        clientX <= r.right + p &&
        clientY >= r.top - p &&
        clientY <= r.bottom + p
      );
    };

    const cardSel = `[${NYTIMES_ARTICLE_CARD_ATTR}]`;

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      const target = e.target as Element | null;
      if (!target || !dockColumnRef.current) return;
      if (dockColumnRef.current.contains(target)) return;
      const card = target.closest(cardSel);
      if (!card) return;
      const id = card.getAttribute(NYTIMES_ARTICLE_CARD_ATTR)?.trim();
      if (!id) return;
      touchDragRef.current = {
        articleId: id,
        startX: e.clientX,
        startY: e.clientY,
        dragging: false,
      };
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      const s = touchDragRef.current;
      if (!s.articleId) return;
      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;
      if (Math.hypot(dx, dy) >= TOUCH_DRAG_THRESHOLD_PX) {
        s.dragging = true;
      }
      if (s.dragging) {
        setDragHighlight(ptInDockSlop(e.clientX, e.clientY));
      }
    };

    const resetTouchState = () => {
      touchDragRef.current = {
        articleId: null,
        startX: 0,
        startY: 0,
        dragging: false,
      };
      setDragHighlight(false);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      const s = touchDragRef.current;
      const id = s.articleId;
      const wasDragging = s.dragging;
      resetTouchState();
      if (!id || !wasDragging) return;
      if (!ptInDockSlop(e.clientX, e.clientY)) return;
      const article = articles.find((a) => a.id === id);
      if (!article) return;
      suppressCardClickUntilRef.current = Date.now() + 500;
      commitListenFromArticle(article);
    };

    const onPointerCancel = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      resetTouchState();
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onPointerCancel, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerCancel, true);
    };
  }, [articles, commitListenFromArticle]);

  useEffect(() => {
    const onClickCapture = (ev: MouseEvent) => {
      if (Date.now() >= suppressCardClickUntilRef.current) return;
      const el = ev.target as Element | null;
      if (!el?.closest(`[${NYTIMES_ARTICLE_CARD_ATTR}]`)) return;
      ev.preventDefault();
      ev.stopPropagation();
    };
    document.addEventListener("click", onClickCapture, true);
    return () => document.removeEventListener("click", onClickCapture, true);
  }, []);

  const article =
    snap.meta && activeVisible
      ? articles.find((a) => a.id === snap.meta!.articleId)
      : undefined;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-[100] isolate flex justify-end px-5"
      style={{
        bottom: `calc(${NAV_BOTTOM_RESERVED_PX}px + max(8px, env(safe-area-inset-bottom, 0px)))`,
      }}
      aria-live="polite"
    >
      <div
        ref={dockColumnRef}
        className="pointer-events-auto flex flex-col items-end gap-2"
      >
        {showDragGuide ? (
          <div
            className={
              dragGuideFading
                ? `opacity-0 transition-opacity ease-out`
                : "opacity-100"
            }
            style={{
              width: "max-content",
              maxWidth: "min(calc(100vw - 48px), 340px)",
              position: "relative",
              paddingBottom: 8,
              transitionDuration: dragGuideFading
                ? `${DRAG_GUIDE_FADE_DURATION_MS}ms`
                : undefined,
            }}
            onTransitionEnd={onDragGuideFadeComplete}
          >
            <button
              type="button"
              onClick={() => dismissDragGuide()}
              style={{
                position: "relative",
                paddingLeft: 12,
                paddingRight: 12,
                paddingTop: 6,
                paddingBottom: 6,
                background: DRAG_GUIDE_BLUE,
                borderRadius: 5,
                justifyContent: "center",
                alignItems: "center",
                display: "inline-flex",
                border: "none",
                cursor: "pointer",
                textAlign: "center",
                maxWidth: "100%",
                overflow: "hidden",
              }}
              aria-label="Dismiss: drag and drop article cards onto the player to listen"
            >
              <span
                style={{
                  color: "white",
                  fontSize: 12,
                  fontFamily:
                    "'Helvetica Neue', Helvetica, Arial, sans-serif",
                  fontWeight: 500,
                  lineHeight: 1.25,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                Drag and drop article cards
              </span>
            </button>
            {/* Tail points at the listen dock (below). */}
            <span
              aria-hidden
              style={{
                position: "absolute",
                top: "100%",
                right: 14,
                marginTop: -1,
                width: 0,
                height: 0,
                borderLeft: "5px solid transparent",
                borderRight: "5px solid transparent",
                borderTop: `7px solid ${DRAG_GUIDE_BLUE}`,
              }}
            />
          </div>
        ) : null}
        <div
          className={`transition-[transform,box-shadow] duration-150 ${
            dragHighlight
              ? activeVisible
                ? "scale-[1.02] ring-2 ring-white/70 ring-offset-2 ring-offset-transparent"
                : "scale-[1.02] shadow-lg"
              : ""
          }`}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          {activeVisible && snap.meta ? (
          <div className="inline-flex items-center justify-center gap-[25px] rounded-[28px] bg-black py-2.5 pl-5 pr-5 shadow-[0_6px_24px_rgba(0,0,0,0.28)]">
            <button
              type="button"
              onClick={() => {
                const id = snap.meta!.articleId;
                const a = articles.find((x) => x.id === id);
                if (a) onOpenArticle(a);
              }}
              className="shrink-0 overflow-hidden rounded-[2px] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/45"
              aria-label={
                article?.title
                  ? `Open article: ${article.title}`
                  : "Open article"
              }
            >
              <SafeArticleImage
                remoteUrl={snap.meta.imageUrl}
                alt=""
                className="size-8 bg-neutral-700"
                imgClassName="h-full w-full object-cover"
              />
            </button>
            <button
              type="button"
              onClick={() => {
                if (snap.phase === "loading") return;
                togglePuterPlaybackPause();
              }}
              disabled={snap.phase === "loading"}
              className="flex size-[19px] shrink-0 items-center justify-center text-white disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
              aria-label={
                snap.phase === "loading"
                  ? "Loading audio"
                  : snap.phase === "playing"
                    ? "Pause"
                    : "Resume"
              }
            >
              {snap.phase === "loading" ? (
                <Loader2 className="size-[18px] animate-spin" aria-hidden />
              ) : snap.phase === "playing" ? (
                <Pause
                  className="size-[18px] text-white"
                  strokeWidth={2.5}
                  aria-hidden
                />
              ) : (
                <Play
                  className="ml-0.5 size-[18px] fill-white text-white"
                  aria-hidden
                />
              )}
            </button>
          </div>
          ) : (
            <button
              type="button"
              onClick={playRandomArticleFromFeed}
              disabled={articles.length === 0}
              style={{
                paddingLeft: 20,
                paddingRight: 20,
                paddingTop: 10,
                paddingBottom: 10,
                background: "#121212",
                borderRadius: 28,
                justifyContent: "center",
                alignItems: "center",
                gap: 25,
                display: "inline-flex",
                border: "none",
                cursor: articles.length === 0 ? "not-allowed" : "pointer",
              }}
              className="shadow-[0_6px_24px_rgba(0,0,0,0.28)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/35 disabled:opacity-45"
              aria-label={
                articles.length === 0
                  ? "No articles loaded yet"
                  : "Play a random article from your feed, or drop an article card here to listen"
              }
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  background: "#D9D9D9",
                  borderRadius: 2,
                }}
                aria-hidden
              />
              <Play
                className="ml-0.5 size-[18px] shrink-0 fill-white text-white"
                strokeWidth={2.5}
                aria-hidden
              />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
