"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

/**
 * Threshold the user must pull past to trigger a refresh. iOS Safari's native
 * affordance kicks in around 80–100px — we mirror that so the gesture feels
 * familiar inside the PWA standalone shell where the native pull is disabled.
 */
const TRIGGER_DISTANCE_PX = 80;
const MAX_PULL_PX = 120;
const RESISTANCE = 0.55;

export type PullToRefreshHandle = {
  /** Force the spinner to hide (e.g. when an external refresh completes). */
  reset: () => void;
};

type Props = {
  /** Async refresh handler. The spinner stays visible until it resolves. */
  onRefresh: () => Promise<void> | void;
  className?: string;
  /** Inline style for the scroll container (e.g. background colour). */
  style?: CSSProperties;
  /** Lets parents read scroll position for the auto-hide header. */
  scrollDataAttr?: string;
  children: React.ReactNode;
};

/**
 * Lightweight pull-to-refresh for the feed scroll container. Active only when
 * the user starts the gesture at scrollTop === 0 to avoid stealing vertical
 * pans inside long feeds.
 */
export const PullToRefresh = forwardRef<PullToRefreshHandle, Props>(
  function PullToRefresh(
    { onRefresh, className, style, scrollDataAttr, children },
    ref,
  ) {
    const scrollerRef = useRef<HTMLDivElement | null>(null);
    const startYRef = useRef<number | null>(null);
    const activePointerRef = useRef<number | null>(null);
    const [pullPx, setPullPx] = useState(0);
    const [refreshing, setRefreshing] = useState(false);

    useImperativeHandle(ref, () => ({
      reset: () => {
        setRefreshing(false);
        setPullPx(0);
      },
    }));

    const finish = useCallback(() => {
      activePointerRef.current = null;
      startYRef.current = null;
    }, []);

    const handlePointerDown = useCallback(
      (e: ReactPointerEvent<HTMLDivElement>) => {
        if (refreshing) return;
        if (e.pointerType !== "touch") return;
        const el = scrollerRef.current;
        if (!el || el.scrollTop > 0) return;
        activePointerRef.current = e.pointerId;
        startYRef.current = e.clientY;
      },
      [refreshing],
    );

    const handlePointerMove = useCallback(
      (e: ReactPointerEvent<HTMLDivElement>) => {
        if (refreshing) return;
        if (activePointerRef.current !== e.pointerId) return;
        if (startYRef.current == null) return;
        const el = scrollerRef.current;
        if (!el) return;
        if (el.scrollTop > 0) {
          setPullPx(0);
          startYRef.current = e.clientY;
          return;
        }
        const dy = e.clientY - startYRef.current;
        if (dy <= 0) {
          setPullPx(0);
          return;
        }
        const eased = Math.min(MAX_PULL_PX, dy * RESISTANCE);
        setPullPx(eased);
      },
      [refreshing],
    );

    const handlePointerUp = useCallback(
      (e: ReactPointerEvent<HTMLDivElement>) => {
        if (activePointerRef.current !== e.pointerId) return;
        const reached = pullPx >= TRIGGER_DISTANCE_PX;
        finish();
        if (reached) {
          setRefreshing(true);
          setPullPx(TRIGGER_DISTANCE_PX);
          void (async () => {
            try {
              await onRefresh();
            } finally {
              setRefreshing(false);
              setPullPx(0);
            }
          })();
        } else {
          setPullPx(0);
        }
      },
      [finish, onRefresh, pullPx],
    );

    const handlePointerCancel = useCallback(
      (e: ReactPointerEvent<HTMLDivElement>) => {
        if (activePointerRef.current !== e.pointerId) return;
        finish();
        setPullPx(0);
      },
      [finish],
    );

    useEffect(() => {
      if (!refreshing) return;
      // Safety net: never leave the spinner stuck if the parent forgets to await.
      const t = window.setTimeout(() => {
        setRefreshing(false);
        setPullPx(0);
      }, 8000);
      return () => window.clearTimeout(t);
    }, [refreshing]);

    const indicatorActive = refreshing || pullPx > 0;
    const indicatorOpacity = refreshing
      ? 1
      : Math.min(1, pullPx / TRIGGER_DISTANCE_PX);
    const indicatorScale = refreshing
      ? 1
      : 0.6 + Math.min(0.4, pullPx / (TRIGGER_DISTANCE_PX * 2));

    return (
      <div
        ref={scrollerRef}
        className={className}
        style={style}
        {...(scrollDataAttr ? { [scrollDataAttr]: "" } : {})}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {indicatorActive ? (
          <div
            aria-hidden
            className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex justify-center"
            style={{
              transform: `translateY(${Math.max(0, pullPx - 24)}px)`,
              transition: refreshing
                ? "transform 200ms ease-out"
                : "none",
            }}
          >
            <span
              className="mt-1 inline-flex size-7 items-center justify-center rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.12)]"
              style={{
                opacity: indicatorOpacity,
                transform: `scale(${indicatorScale})`,
                transition: refreshing
                  ? "opacity 150ms ease-out, transform 150ms ease-out"
                  : "none",
              }}
            >
              <span
                className={`block size-3 rounded-full border-2 border-black/70 border-t-transparent ${
                  refreshing ? "animate-spin" : ""
                }`}
              />
            </span>
          </div>
        ) : null}

        <div
          style={{
            transform: `translateY(${pullPx}px)`,
            transition:
              activePointerRef.current === null
                ? "transform 220ms ease-out"
                : "none",
          }}
        >
          {children}
        </div>
      </div>
    );
  },
);
