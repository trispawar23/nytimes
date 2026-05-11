"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

/**
 * Mobile: full viewport width up to 430px (iPhone 15 Pro Max), pinned to 100dvh.
 * Body never scrolls — inner panes own scrolling — so Safari's collapsing URL bar
 * doesn't change layout height. Safe-area handled by the header padding-top and
 * BottomNav padding-bottom.
 *
 * Desktop: same 430px card, centered on a gray canvas, capped height with shadow.
 */
export function PhoneFrame({ children }: Props) {
  return (
    <div className="flex min-h-[100dvh] w-full justify-center bg-[#F8F8F8] max-sm:px-0 sm:items-center sm:bg-[#d4d4d4] sm:p-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex w-full min-w-0 max-w-[430px] max-sm:h-[100dvh] max-sm:flex-1 sm:h-auto sm:flex-none"
      >
        <div className="relative flex min-h-0 w-full min-w-0 flex-col overflow-hidden bg-[#F8F8F8] max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:rounded-none max-sm:shadow-none sm:h-[min(898px,calc(100dvh-32px))] sm:max-h-[min(898px,calc(100dvh-32px))] sm:rounded-[20.55px] sm:shadow-[0_12px_48px_rgba(0,0,0,0.12)]">
          {children}
        </div>
      </motion.div>
    </div>
  );
}
