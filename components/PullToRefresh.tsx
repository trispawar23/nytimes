"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
} from "react";

/**
 * Threshold the user must pull past to trigger a refresh. iOS Safari's native
 * affordance kicks in around 80–100px — we mirror that so the gesture feels
 * familiar inside the PWA standalone shell where the native pull is disabled.
 */
const TRIGGER_DISTANCE_PX = 70;
const MAX_PULL_PX = 110;
const RESISTANCE = 0.55;
/**
 * Below this delta we don't claim the gesture yet so horizontal pans on
 * cards / carousels still work, and slow finger drift doesn't engage pull.
 */
const DIRECTION_LOCK_PX = 8;

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
 * Lightweight pull-to-refresh for the feed scroll container. Uses native touch
 * events with `passive: false` + preventDefault so iOS Safari and the PWA
 * standalone shell both engage the gesture. Idle: zero transform / will-change
 * cost on the inner content so vertical/horizontal scroll feels native.
 */
export const PullToRefresh = forwardRef<PullToRefreshHandle, Props>(
  function PullToRefresh(
    { onRefresh, className, style, scrollDataAttr, children },
    ref,
  ) {
    const scrollerRef = useRef<HTMLDivElement | null>(null);

    /** Latest values seen by the (once-attached) touch handlers. */
    const onRefreshRef = useRef(onRefresh);
    onRefreshRef.current = onRefresh;

    const refreshingRef = useRef(false);
    const pullPxRef = useRef(0);
    const startYRef = useRef<number | null>(null);
    const startXRef = useRef<number | null>(null);
    const lockedRef = useRef<"v" | "h" | null>(null);

    const [pullPx, setPullPxState] = useState(0);
    const [refreshing, setRefreshingState] = useState(false);

    const setPullPx = useCallback((v: number) => {
      pullPxRef.current = v;
      setPullPxState(v);
    }, []);
    const setRefreshing = useCallback((v: boolean) => {
      refreshingRef.current = v;
      setRefreshingState(v);
    }, []);

    useImperativeHandle(ref, () => ({
      reset: () => {
        setRefreshing(false);
        setPullPx(0);
      },
    }));

    useEffect(() => {
      const el = scrollerRef.current;
      if (!el) return;

      const reset = () => {
        startYRef.current = null;
        startXRef.current = null;
        lockedRef.current = null;
      };

      const onTouchStart = (e: TouchEvent) => {
        if (refreshingRef.current) return;
        if (el.scrollTop > 0) return;
        const t = e.touches[0];
        if (!t) return;
        startYRef.current = t.clientY;
        startXRef.current = t.clientX;
        lockedRef.current = null;
      };

      const onTouchMove = (e: TouchEvent) => {
        if (refreshingRef.current) return;
        if (startYRef.current == null) return;
        const t = e.touches[0];
        if (!t) return;

        // Bailing out cleanly when the user has scrolled away mid-gesture.
        if (el.scrollTop > 0) {
          reset();
          if (pullPxRef.current !== 0) setPullPx(0);
          return;
        }

        const dy = t.clientY - startYRef.current;
        const dx = t.clientX - (startXRef.current ?? t.clientX);

        // First-move direction lock — let horizontal pans / upward pans through.
        if (lockedRef.current === null) {
          const absDy = Math.abs(dy);
          const absDx = Math.abs(dx);
          if (absDx > DIRECTION_LOCK_PX && absDx >= absDy) {
            lockedRef.current = "h";
            return;
          }
          if (dy > DIRECTION_LOCK_PX) {
            lockedRef.current = "v";
          } else if (dy < -DIRECTION_LOCK_PX) {
            lockedRef.current = "h";
            return;
          } else {
            return;
          }
        }

        if (lockedRef.current === "h") return;

        if (dy <= 0) {
          if (pullPxRef.current !== 0) setPullPx(0);
          return;
        }

        // Claim the gesture to prevent the browser's native pull-to-refresh
        // (mobile Safari) and rubber-band overscroll. Must be passive: false.
        if (e.cancelable) e.preventDefault();
        const eased = Math.min(MAX_PULL_PX, dy * RESISTANCE);
        if (eased !== pullPxRef.current) setPullPx(eased);
      };

      const onTouchEnd = () => {
        if (refreshingRef.current) return;
        const reached =
          lockedRef.current === "v" &&
          pullPxRef.current >= TRIGGER_DISTANCE_PX;
        reset();

        if (reached) {
          setRefreshing(true);
          setPullPx(TRIGGER_DISTANCE_PX);
          void (async () => {
            try {
              await onRefreshRef.current();
            } finally {
              setRefreshing(false);
              setPullPx(0);
            }
          })();
        } else if (pullPxRef.current !== 0) {
          setPullPx(0);
        }
      };

      const onTouchCancel = () => {
        reset();
        if (pullPxRef.current !== 0 && !refreshingRef.current) {
          setPullPx(0);
        }
      };

      el.addEventListener("touchstart", onTouchStart, { passive: true });
      el.addEventListener("touchmove", onTouchMove, { passive: false });
      el.addEventListener("touchend", onTouchEnd, { passive: true });
      el.addEventListener("touchcancel", onTouchCancel, { passive: true });

      return () => {
        el.removeEventListener("touchstart", onTouchStart);
        el.removeEventListener("touchmove", onTouchMove);
        el.removeEventListener("touchend", onTouchEnd);
        el.removeEventListener("touchcancel", onTouchCancel);
      };
    }, [setPullPx, setRefreshing]);

    /** Safety net: never leave the spinner stuck if the parent forgets to await. */
    useEffect(() => {
      if (!refreshing) return;
      const t = window.setTimeout(() => {
        setRefreshing(false);
        setPullPx(0);
      }, 8000);
      return () => window.clearTimeout(t);
    }, [refreshing, setPullPx, setRefreshing]);

    const indicatorActive = refreshing || pullPx > 0;
    const indicatorOpacity = refreshing
      ? 1
      : Math.min(1, pullPx / TRIGGER_DISTANCE_PX);
    const indicatorScale = refreshing
      ? 1
      : 0.6 + Math.min(0.4, pullPx / (TRIGGER_DISTANCE_PX * 2));
    const usingTransform = pullPx > 0 || refreshing;

    return (
      <div
        ref={scrollerRef}
        className={className}
        /**
         * Intentionally leave `touch-action` at the default (`auto`).
         * Setting `pan-y` here would intersect with inner horizontal strips'
         * `touch-pan-x` and disable scrolling on both axes (W3C touch-action
         * spec). The pull gesture is claimed via `preventDefault()` in
         * the touchmove handler below.
         */
        style={style}
        {...(scrollDataAttr ? { [scrollDataAttr]: "" } : {})}
      >
        {indicatorActive ? (
          <div
            aria-hidden
            className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex justify-center"
            style={{
              transform: `translateY(${Math.max(0, pullPx - 24)}px)`,
              transition: refreshing
                ? "transform 180ms ease-out"
                : "none",
            }}
          >
            <span
              className="mt-1 inline-flex size-7 items-center justify-center rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.12)]"
              style={{
                opacity: indicatorOpacity,
                transform: `scale(${indicatorScale})`,
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

        {/* Idle: no transform / will-change → zero compositing cost on the
            feed. Only wrap in a transform layer while actively pulling. */}
        {usingTransform ? (
          <div
            style={{
              transform: `translateY(${pullPx}px)`,
              transition: refreshing
                ? "transform 200ms ease-out"
                : "none",
              willChange: "transform",
            }}
          >
            {children}
          </div>
        ) : (
          children
        )}
      </div>
    );
  },
);
