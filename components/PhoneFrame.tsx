"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

/**
 * Desktop: Figma-style device (~413px wide) centered on a gray canvas.
 * Mobile (below `sm`): full viewport width/height — no side gutters or faux phone bezel.
 */
export function PhoneFrame({ children }: Props) {
  return (
    <div className="flex min-h-dvh w-full max-sm:min-h-[100dvh] max-sm:flex-col max-sm:bg-[#F8F8F8] sm:items-center sm:justify-center sm:bg-[#d4d4d4] sm:p-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex w-full min-w-0 max-sm:min-h-[100dvh] max-sm:flex-1 sm:h-auto sm:max-w-[413px] sm:flex-none"
      >
        <div
          className="relative flex min-h-0 w-full min-w-0 flex-col overflow-hidden bg-[#F8F8F8] max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:rounded-none max-sm:shadow-none sm:h-[min(898px,calc(100dvh-32px))] sm:max-h-[min(898px,calc(100dvh-32px))] sm:rounded-[20.55px] sm:shadow-[0_12px_48px_rgba(0,0,0,0.12)]"
        >
          {children}
        </div>
      </motion.div>
    </div>
  );
}
