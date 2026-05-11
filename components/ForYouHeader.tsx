"use client";

import {
  ArrowUpRight,
  BatteryFull,
  Bookmark,
  ChevronDown,
  Mic,
  Settings,
  Wifi,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ModeSelector } from "./ModeSelector";
import type { FeedMode } from "@/lib/types";

type Props = {
  mode: FeedMode;
  onModeChange: (m: FeedMode) => void;
  /** Discover blue pill + expanded layout; false = classic feed in Discover mode. */
  discoverHighlighted?: boolean;
  greetingName?: string;
  onVoicePress: () => void;
  voiceDisabled?: boolean;
};

/** iOS-style cellular signal (right side of status bar). */
function StatusSignalBars() {
  const heightsPx = [3.5, 5.5, 8, 10.5];
  return (
    <span
      className="flex h-[13px] shrink-0 items-end gap-[2.5px] pb-px"
      aria-hidden
    >
      {heightsPx.map((h, i) => (
        <span
          key={i}
          className="w-[2.5px] shrink-0 rounded-[0.5px] bg-black"
          style={{ height: `${h}px` }}
        />
      ))}
    </span>
  );
}

/** Lock-screen style `9:41` (12-hour clock, no AM/PM suffix). */
function formatIosStatusTime(d: Date): string {
  let h = d.getHours() % 12;
  if (h === 0) h = 12;
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

function useStatusClock() {
  const [label, setLabel] = useState(() => formatIosStatusTime(new Date()));
  useEffect(() => {
    const tick = () => setLabel(formatIosStatusTime(new Date()));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);
  return label;
}

/**
 * Status row uses normal document flow + justify-between (not a fixed 242px gap)
 * so it stays visible at any width. Safe-area padding for notched devices.
 */
/** Px the feed must scroll before we hide the mode/filter row — avoids jitter at top. */
const COMPACT_SCROLL_THRESHOLD_PX = 24;
/** Pointer/scroll delta required to flip compact state — avoids twitchy hides. */
const COMPACT_DIRECTION_DELTA_PX = 6;

export function ForYouHeader({
  mode,
  onModeChange,
  discoverHighlighted = true,
  greetingName = "there",
  onVoicePress,
  voiceDisabled,
}: Props) {
  const statusTime = useStatusClock();
  const [compact, setCompact] = useState(false);
  const lastScrollTopRef = useRef(0);

  /** Auto-hide mode selector + filters row when reader scrolls down; reveal on scroll up. */
  useEffect(() => {
    const el = document.querySelector<HTMLElement>("[data-feed-scroll]");
    if (!el) return;

    lastScrollTopRef.current = el.scrollTop;

    /**
     * Distance from the bottom inside which we ignore scroll-direction
     * changes. iOS Safari's rubber-band overshoot at the very end of the
     * scroll fires a small negative dy as the content springs back, which
     * was popping the mode selector open right at the bottom of the feed.
     */
    const BOTTOM_DEAD_ZONE_PX = 24;

    const handle = () => {
      const y = el.scrollTop;
      const maxScroll = el.scrollHeight - el.clientHeight;
      const last = lastScrollTopRef.current;
      const dy = y - last;
      lastScrollTopRef.current = y;

      if (y <= COMPACT_SCROLL_THRESHOLD_PX) {
        setCompact(false);
        return;
      }

      // Ignore bounce/rubber-band events near the end of the scroll.
      if (maxScroll > 0 && y >= maxScroll - BOTTOM_DEAD_ZONE_PX) return;

      if (dy > COMPACT_DIRECTION_DELTA_PX) {
        setCompact(true);
      } else if (dy < -COMPACT_DIRECTION_DELTA_PX) {
        setCompact(false);
      }
    };

    el.addEventListener("scroll", handle, { passive: true });
    return () => el.removeEventListener("scroll", handle);
  }, [mode, discoverHighlighted]);

  return (
    <header className="relative z-10 w-full shrink-0 rounded-t-[20.55px] bg-white text-black">
      <div
        className="relative z-30 flex w-full min-w-0 items-center justify-between px-[19.52px] pb-2 text-black"
        data-app-status-bar
        style={{
          paddingTop: "max(10px, calc(env(safe-area-inset-top, 0px) + 8px))",
        }}
      >
        <div className="flex min-w-0 shrink-0 items-center gap-[4px]">
          <span className="whitespace-nowrap text-center font-['SF_Pro_Text',system-ui,sans-serif] text-[16.67px] font-semibold leading-none tabular-nums text-black">
            {statusTime}
          </span>
          <ArrowUpRight
            className="h-[12px] w-[12px] shrink-0 stroke-black text-black"
            strokeWidth={2.75}
            aria-hidden
          />
        </div>
        <div
          className="flex shrink-0 items-center gap-[6px] text-black"
          aria-hidden
        >
          <StatusSignalBars />
          <Wifi className="h-[14px] w-[14px] shrink-0" strokeWidth={2} />
          <BatteryFull
            className="h-[12px] w-[22px] shrink-0 fill-black stroke-black"
            strokeWidth={1.25}
          />
        </div>
      </div>

      <div className="relative z-20 flex min-w-0 flex-col gap-[10.27px] px-[16.44px] pb-[6px] pt-[6px]">
        {/* Sticky row — always visible */}
        <div className="flex w-full items-center gap-[10.27px]">
          <p className="min-w-0 flex-1 font-['Helvetica_Neue',Helvetica,Arial,sans-serif] text-[clamp(19px,5.25vw,22px)] font-light leading-[1.25] text-black">
            Hi {greetingName},
          </p>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              className="flex h-[28.77px] w-[24.66px] items-center justify-center text-black hover:opacity-70"
              aria-label="Bookmarks"
            >
              <Bookmark className="h-5 w-5" strokeWidth={1.8} />
            </button>
            <button
              type="button"
              className="flex h-[28.77px] w-[28.77px] items-center justify-center text-black hover:opacity-70"
              aria-label="Settings"
            >
              <Settings className="h-6 w-6" strokeWidth={1.7} />
            </button>
          </div>
        </div>

        {/*
          Collapsible row group: grid-rows trick animates auto-height.
          grid-rows-[1fr] → grid-rows-[0fr] smoothly collapses without measuring.
        */}
        <div
          aria-hidden={compact ? true : undefined}
          className={`grid transition-[grid-template-rows,opacity,margin] duration-200 ease-out ${
            compact
              ? "pointer-events-none -mb-[10.27px] grid-rows-[0fr] opacity-0"
              : "grid-rows-[1fr] opacity-100"
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="flex flex-col gap-[10.27px] pb-2">
              <ModeSelector
                value={mode}
                onChange={onModeChange}
                discoverHighlighted={discoverHighlighted}
              />

              <div className="flex w-full min-w-0 items-center justify-between gap-2 px-[10.27px]">
                <div className="flex min-w-0 flex-wrap items-center gap-[10.27px]">
                  <button
                    type="button"
                    className="flex items-center gap-[10.27px] rounded-[12.33px] bg-white px-[10.27px] py-[5.14px] font-['Helvetica_Neue',Helvetica,Arial,sans-serif] text-[14.38px] font-medium leading-[21.57px] text-black outline outline-1 -outline-offset-1 outline-[#E1E1E1] hover:bg-[#fafafa]"
                    style={{ outlineWidth: "1.027px" }}
                  >
                    Filters
                    <span className="relative inline-flex h-[24.66px] w-[24.66px] items-center justify-center p-[6px]">
                      <span className="absolute left-1/2 top-1/2 h-[1.8px] w-[12.63px] -translate-x-1/2 -translate-y-1/2 bg-black" />
                      <span className="absolute left-1/2 top-1/2 h-[12.63px] w-[1.8px] -translate-x-1/2 -translate-y-1/2 bg-black" />
                    </span>
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-[10.27px] rounded-[12.33px] bg-white px-[10.27px] py-[5.14px] font-['Helvetica_Neue',Helvetica,Arial,sans-serif] text-[14.38px] font-medium leading-[21.57px] text-black outline outline-1 -outline-offset-1 outline-[#E1E1E1] hover:bg-[#fafafa]"
                    style={{ outlineWidth: "1.027px" }}
                  >
                    Sort by
                    <ChevronDown className="h-4 w-4" strokeWidth={2} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={onVoicePress}
                  disabled={voiceDisabled}
                  className="flex size-[41.09px] shrink-0 items-center justify-center rounded-[20.55px] bg-black px-[9px] py-[8.22px] text-white drop-shadow-[2.055px_2.055px_3.6px_rgba(0,0,0,0.21)] disabled:opacity-35"
                  aria-label="Voice interaction"
                >
                  <Mic
                    className="size-[22px] shrink-0 stroke-white text-white"
                    strokeWidth={2}
                    aria-hidden
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
