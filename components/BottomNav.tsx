"use client";

import type { ReactNode } from "react";
import { FIGMA_NAV_ASSETS } from "@/lib/figma-assets";

type Tab = "home" | "listen" | "play" | "you";

type Props = {
  active: Tab;
  /** When set, tabs become buttons (e.g. Home closes article reader). */
  onTabPress?: (tab: Tab) => void;
};

export function BottomNav({ active, onTabPress }: Props) {
  const Item = ({
    id,
    label,
    icon,
  }: {
    id: Tab;
    label: string;
    icon: ReactNode;
  }) => {
    const on = active === id;
    const body = (
      <>
        <div
          className={`flex h-[29px] w-[29px] items-center justify-center ${
            on ? "text-black" : "text-[#AFAFAF]"
          }`}
        >
          {icon}
        </div>
        <span
          className={`font-poppins text-[10.27px] leading-[10.27px] ${
            on ? "text-black" : "text-[#AFAFAF]"
          }`}
        >
          {label}
        </span>
      </>
    );
    if (onTabPress) {
      return (
        <button
          type="button"
          onClick={() => onTabPress(id)}
          className="flex w-[31px] flex-col items-center justify-center gap-[2px] focus:outline-none focus-visible:ring-2 focus-visible:ring-black/25 focus-visible:ring-offset-2"
        >
          {body}
        </button>
      );
    }
    return (
      <div className="flex w-[31px] flex-col items-center justify-center gap-[2px]">
        {body}
      </div>
    );
  };

  return (
    <nav
      className="mt-auto flex h-[94.5px] shrink-0 flex-col gap-[10px] border-t border-[#B7B7B7] bg-white px-[35px] pb-2 pt-[7px] font-poppins"
      style={{ borderTopWidth: "1.027px" }}
      aria-label="Primary"
    >
      <div className="flex w-full items-center justify-between gap-[8px]">
        <Item
          id="home"
          label="Home"
          icon={
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={FIGMA_NAV_ASSETS.home}
              alt=""
              className="size-[26.7px] object-cover"
            />
          }
        />
        <Item
          id="listen"
          label="Listen"
          icon={
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={FIGMA_NAV_ASSETS.listen}
              alt=""
              className="size-[28.8px] object-contain opacity-70"
            />
          }
        />
        <Item
          id="play"
          label="Play"
          icon={
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={FIGMA_NAV_ASSETS.play}
              alt=""
              className="size-[20.5px] rounded-sm object-cover"
            />
          }
        />
        <Item
          id="you"
          label="You"
          icon={
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={FIGMA_NAV_ASSETS.profile}
              alt=""
              className="size-[28.8px] object-contain"
            />
          }
        />
      </div>
    </nav>
  );
}
