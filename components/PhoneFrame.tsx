"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

const frameH = "min(898px, calc(100dvh - 32px))";

/** Matches Figma “Screens” device: ~413×898, #F8F8F8 canvas, ~20.55px corner radius */
export function PhoneFrame({ children }: Props) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#d4d4d4] p-4 sm:p-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-[413px]"
      >
        <div
          className="relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-[20.55px] bg-[#F8F8F8] shadow-[0_12px_48px_rgba(0,0,0,0.12)]"
          style={{ height: frameH, maxHeight: frameH }}
        >
          {children}
        </div>
      </motion.div>
    </div>
  );
}
