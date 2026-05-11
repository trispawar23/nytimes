"use client";

import { useEffect, useRef, useState } from "react";

function detectMobilePwa(): { standalone: boolean; ios: boolean; android: boolean } {
  if (typeof window === "undefined") {
    return { standalone: false, ios: false, android: false };
  }
  const mql = window.matchMedia?.("(display-mode: standalone)");
  const standaloneViaMq = !!mql && mql.matches;
  const standaloneViaIOS =
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
    true;
  const standalone = standaloneViaMq || standaloneViaIOS;

  const ua = window.navigator.userAgent.toLowerCase();
  const maxTouch =
    (window.navigator as Navigator & { maxTouchPoints?: number })
      .maxTouchPoints ?? 0;
  const ios =
    /iphone|ipad|ipod/.test(ua) || (/macintosh/.test(ua) && maxTouch > 1);
  const android = /android/.test(ua);

  return { standalone, ios, android };
}

/**
 * iOS-style swipe-from-left-edge: gesture must start within this many pixels
 * of the screen's left edge, and must travel at least 70 px horizontally
 * before being committed (50 px vertical tolerance to avoid hijacking scroll).
 */
const EDGE_START_ZONE_PX = 24;
const HORIZONTAL_COMMIT_PX = 70;
const VERTICAL_REJECT_PX = 50;

type ReaderBackHints = {
  /** True when the in-app `< Back` button should be hidden (mobile PWA). */
  hideBackButton: boolean;
};

/**
 * Wires the article reader into the platform's native back navigation:
 * - Pushes a history entry so the browser / system back button fires
 *   `popstate`, which we treat as a close signal.
 * - On iOS PWA standalone (no system back), adds a left-edge swipe gesture
 *   that triggers history.back() → popstate → close.
 *
 * The in-app `< Back` button stays visible in browsers + on desktop so
 * those users still have a clear close affordance.
 */
export function useReaderBackGesture(onClose: () => void): ReaderBackHints {
  /**
   * Lazy initializer runs once at mount on the client. Cheap synchronous
   * platform probe avoids a flicker between `< Back` and the platform back
   * gesture on mobile PWA.
   */
  const [{ hideBackButton, edgeGesture }] = useState(() => {
    const p = detectMobilePwa();
    const mobilePwa = p.standalone && (p.ios || p.android);
    return { hideBackButton: mobilePwa, edgeGesture: p.standalone && p.ios };
  });
  /** Latest onClose; the effect attaches listeners exactly once per mount. */
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (typeof window === "undefined") return;

    /**
     * Unique per-mount tag. Lets the popstate listener distinguish a real
     * back action (state.__readerOpen !== ourId) from React Strict Mode's
     * cleanup → remount sequence (state.__readerOpen === ourId because
     * the remount already pushed a fresh entry before the popstate from
     * the previous cleanup's history.back() is dispatched).
     */
    const ourId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    let pushedByUs = false;
    try {
      window.history.pushState(
        { __readerOpen: ourId },
        "",
        window.location.href,
      );
      pushedByUs = true;
    } catch {
      // History API can throw under sandboxed iframes; gracefully degrade.
    }

    const onPopState = () => {
      const cur = (window.history.state ?? null) as
        | { __readerOpen?: string }
        | null;
      if (cur?.__readerOpen === ourId) {
        // We're still inside our own pushed entry — this popstate came from
        // a Strict Mode-style cleanup→remount, not from the user/system
        // back. Ignore so the reader doesn't close instantly on open.
        return;
      }
      // Real back action: state was popped out from under us.
      pushedByUs = false;
      onCloseRef.current();
    };
    window.addEventListener("popstate", onPopState);

    /**
     * iOS PWA edge-swipe — no system back button exists, so we synthesise
     * one with an edge gesture. Listening on the document at capture phase
     * keeps it working even when the touch lands on nested scrollers.
     */
    let edgeActive = false;
    let edgeStartX = 0;
    let edgeStartY = 0;

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      if (t.clientX > EDGE_START_ZONE_PX) {
        edgeActive = false;
        return;
      }
      edgeActive = true;
      edgeStartX = t.clientX;
      edgeStartY = t.clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!edgeActive) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - edgeStartX;
      const dy = Math.abs(t.clientY - edgeStartY);
      if (dy > VERTICAL_REJECT_PX && dx < HORIZONTAL_COMMIT_PX / 2) {
        edgeActive = false;
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!edgeActive) return;
      edgeActive = false;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - edgeStartX;
      if (dx >= HORIZONTAL_COMMIT_PX) {
        // Routes through popstate → onClose. Matches iOS' real interactive
        // pop animation, plus keeps history clean.
        try {
          window.history.back();
        } catch {
          onCloseRef.current();
        }
      }
    };
    const onTouchCancel = () => {
      edgeActive = false;
    };

    if (edgeGesture) {
      document.addEventListener("touchstart", onTouchStart, { passive: true });
      document.addEventListener("touchmove", onTouchMove, { passive: true });
      document.addEventListener("touchend", onTouchEnd, { passive: true });
      document.addEventListener("touchcancel", onTouchCancel, {
        passive: true,
      });
    }

    return () => {
      window.removeEventListener("popstate", onPopState);
      if (edgeGesture) {
        document.removeEventListener("touchstart", onTouchStart);
        document.removeEventListener("touchmove", onTouchMove);
        document.removeEventListener("touchend", onTouchEnd);
        document.removeEventListener("touchcancel", onTouchCancel);
      }
      // If the reader closed for some other reason (in-app button, parent
      // unmounting, etc.) drop OUR pushed entry so back stays clean.
      // The `=== ourId` check prevents the Strict Mode double-mount from
      // popping a remount's entry mid-flight.
      const state = (window.history.state ?? null) as
        | { __readerOpen?: string }
        | null;
      if (pushedByUs && state?.__readerOpen === ourId) {
        try {
          window.history.back();
        } catch {
          /* ignore */
        }
      }
    };
    // Listeners are attached once per mount; the ref above keeps onClose fresh.
  }, []);

  return { hideBackButton };
}
