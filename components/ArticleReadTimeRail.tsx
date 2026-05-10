"use client";

import {
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useRef,
} from "react";

type Props = {
  stops: readonly [number, number, number];
  value: number;
  onChange: (minutes: number) => void;
  disabled?: boolean;
};

function railLabel(kind: "short" | "medium" | "full", minutes: number): string {
  const m = minutes;
  if (kind === "short") return `Short ( ${m} min )`;
  if (kind === "medium") return `Medium ( ${m} min )`;
  return `Full ( ${m} min )`;
}

function stopIndexForValue(
  value: number,
  stops: readonly [number, number, number],
): 0 | 1 | 2 {
  const [s0, s1, s2] = stops;
  if (value === s0) return 0;
  if (value === s1) return 1;
  if (value === s2) return 2;
  const d0 = Math.abs(value - s0);
  const d1 = Math.abs(value - s1);
  const d2 = Math.abs(value - s2);
  if (d0 <= d1 && d0 <= d2) return 0;
  if (d1 <= d2) return 1;
  return 2;
}

export function ArticleReadTimeRail({
  stops,
  value,
  onChange,
  disabled,
}: Props) {
  const [s0, s1, s2] = stops;
  const kinds = ["short", "medium", "full"] as const;
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const clientXToMinutes = useCallback(
    (clientX: number): number => {
      const el = trackRef.current;
      if (!el) return value;
      const r = el.getBoundingClientRect();
      if (r.width <= 0) return value;
      const t = (clientX - r.left) / r.width;
      const idx = t < 1 / 3 ? 0 : t < 2 / 3 ? 1 : 2;
      return stops[idx];
    },
    [stops, value],
  );

  const applyClientX = useCallback(
    (clientX: number) => {
      if (disabled) return;
      const next = clientXToMinutes(clientX);
      if (next !== value) onChange(next);
    },
    [clientXToMinutes, disabled, onChange, value],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      draggingRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      applyClientX(e.clientX);
    },
    [applyClientX, disabled],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current || disabled) return;
      applyClientX(e.clientX);
    },
    [applyClientX, disabled],
  );

  const endDrag = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }, []);

  const stopIdx = stopIndexForValue(value, stops);

  const onSliderKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      const i = stopIdx;
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
        e.preventDefault();
        if (i > 0) onChange(stops[i - 1]);
      } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
        e.preventDefault();
        if (i < 2) onChange(stops[i + 1]);
      } else if (e.key === "Home") {
        e.preventDefault();
        onChange(s0);
      } else if (e.key === "End") {
        e.preventDefault();
        onChange(s2);
      }
    },
    [disabled, onChange, s0, s2, stopIdx, stops],
  );

  function stopVisual(idx: 0 | 1 | 2) {
    const m = stops[idx];
    const on = m === value;
    return (
      <div
        className="pointer-events-none flex size-[34px] items-center justify-center"
        aria-hidden
      >
        {on ? (
          <span className="box-border size-[26px] shrink-0 rounded-full border-[3px] border-black bg-white dark:border-neutral-100 dark:bg-neutral-950" />
        ) : (
          <span className="size-2 shrink-0 rounded-full bg-black dark:bg-neutral-100" />
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-[379px] flex-col items-start gap-[6px]">
      <p className="w-full font-sans text-[10px] font-medium leading-[18px] text-black dark:text-neutral-100">
        Change Read time
      </p>
      <div className="flex w-full flex-col items-center gap-[6px]">
        <div className="relative w-full max-w-[363px]">
          <div
            className="pointer-events-none grid w-full grid-cols-[34px_1fr_34px_1fr_34px] items-center"
            aria-hidden
          >
            <div className="flex justify-center">{stopVisual(0)}</div>
            <div className="h-[2px] min-h-[2px] bg-black dark:bg-neutral-200" />
            <div className="flex justify-center">{stopVisual(1)}</div>
            <div className="h-[2px] min-h-[2px] bg-black dark:bg-neutral-200" />
            <div className="flex justify-center">{stopVisual(2)}</div>
          </div>
          <div
            ref={trackRef}
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-valuemin={0}
            aria-valuemax={2}
            aria-valuenow={stopIdx}
            aria-valuetext={railLabel(kinds[stopIdx], stops[stopIdx])}
            aria-disabled={disabled ?? false}
            aria-label="Read length — drag or use arrow keys to choose Short, Medium, or Full"
            className={`absolute inset-0 touch-none outline-none focus-visible:ring-2 focus-visible:ring-black/25 focus-visible:ring-offset-2 dark:focus-visible:ring-white/30 ${
              disabled ? "cursor-not-allowed" : "cursor-pointer"
            }`}
            style={{ touchAction: "none" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={onSliderKeyDown}
          />
        </div>
        <div className="flex w-full max-w-[364px] justify-between gap-1 font-sans text-[10px] font-medium leading-[18px] tabular-nums">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(s0)}
            aria-label={railLabel("short", s0)}
            aria-pressed={value === s0}
            className={`min-w-0 shrink cursor-pointer border-none bg-transparent p-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-black/25 disabled:cursor-not-allowed disabled:opacity-40 dark:focus-visible:ring-white/30 ${value === s0 ? "text-black dark:text-neutral-100" : "text-[#A7A7A7] dark:text-neutral-400"}`}
          >
            {railLabel("short", s0)}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(s1)}
            aria-label={railLabel("medium", s1)}
            aria-pressed={value === s1}
            className={`min-w-0 shrink cursor-pointer border-none bg-transparent p-0 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-black/25 disabled:cursor-not-allowed disabled:opacity-40 dark:focus-visible:ring-white/30 ${value === s1 ? "text-black dark:text-neutral-100" : "text-[#A7A7A7] dark:text-neutral-400"}`}
          >
            {railLabel("medium", s1)}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(s2)}
            aria-label={railLabel("full", s2)}
            aria-pressed={value === s2}
            className={`min-w-0 shrink cursor-pointer border-none bg-transparent p-0 text-right focus:outline-none focus-visible:ring-2 focus-visible:ring-black/25 disabled:cursor-not-allowed disabled:opacity-40 dark:focus-visible:ring-white/30 ${value === s2 ? "text-black dark:text-neutral-100" : "text-[#A7A7A7] dark:text-neutral-400"}`}
          >
            {railLabel("full", s2)}
          </button>
        </div>
      </div>
    </div>
  );
}
