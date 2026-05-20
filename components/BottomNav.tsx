"use client";

import type { CSSProperties, ReactNode } from "react";
import { NAV_ASSETS } from "@/lib/nav-assets";

type Tab = "home" | "listen" | "play" | "you";

type Props = {
  active: Tab;
  /** When set, tabs become buttons (e.g. Home closes article reader). */
  onTabPress?: (tab: Tab) => void;
};

const INACTIVE = "#AFAFAF";
const ACTIVE = "#000000";

function tabLabelStyle(active: boolean): CSSProperties {
  return {
    color: active ? ACTIVE : INACTIVE,
    fontSize: 10.27,
    fontFamily: "var(--font-poppins), Poppins, sans-serif",
    fontWeight: 400,
    lineHeight: "10.27px",
    wordWrap: "break-word",
  };
}

function iconFilter(active: boolean): CSSProperties | undefined {
  return active ? { filter: "brightness(0)" } : undefined;
}

function NavImg({
  src,
  width,
  height,
  active,
  offset,
}: {
  src: string;
  width: number;
  height: number;
  active: boolean;
  offset?: { left: number; top: number };
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={width}
      height={height}
      style={{
        width,
        height,
        left: offset?.left ?? 0,
        top: offset?.top ?? 0,
        position: "absolute",
        ...iconFilter(active),
      }}
    />
  );
}

function YouProfileIcon({ active }: { active: boolean }) {
  const fill = active ? ACTIVE : INACTIVE;
  return (
    <svg
      width="21.57"
      height="21.57"
      viewBox="0 0 22 22"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        position: "absolute",
        left: 3.6,
        top: 3.6,
      }}
      aria-hidden
    >
      <circle cx="11" cy="7.4" r="4.1" fill={fill} />
      <path
        d="M4.2 19.8C5.6 15.9 8 14 11 14C14 14 16.4 15.9 17.8 19.8V21.6H4.2V19.8Z"
        fill={fill}
      />
    </svg>
  );
}

export function BottomNav({ active, onTabPress }: Props) {
  const tabs: {
    id: Tab;
    label: string;
    columnStyle: CSSProperties;
    icon: ReactNode;
  }[] = [
    {
      id: "home",
      label: "Home",
      columnStyle: {
        width: 30.82,
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 4.11,
        display: "inline-flex",
      },
      icon: (
        <div
          data-property-1="Variant3"
          style={{ width: 26.71, height: 26.71, position: "relative" }}
        >
          <NavImg
            src={NAV_ASSETS.home}
            width={26.71}
            height={26.71}
            active={active === "home"}
          />
        </div>
      ),
    },
    {
      id: "listen",
      label: "Listen",
      columnStyle: {
        width: 30.82,
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 2.05,
        display: "inline-flex",
      },
      icon: (
        <div
          data-property-1="Variant2"
          style={{
            width: 28.77,
            height: 28.77,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <NavImg
            src={NAV_ASSETS.listen}
            width={23.97}
            height={22.77}
            active={active === "listen"}
            offset={{ left: 2.4, top: 2.4 }}
          />
        </div>
      ),
    },
    {
      id: "play",
      label: "Play",
      columnStyle: {
        width: 30.82,
        paddingTop: 3.08,
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 7.19,
        display: "inline-flex",
      },
      icon: (
        <div
          data-property-1="Default"
          style={{ width: 20.55, height: 20.55, position: "relative" }}
        >
          <NavImg
            src={NAV_ASSETS.play}
            width={20.55}
            height={20.55}
            active={active === "play"}
          />
        </div>
      ),
    },
    {
      id: "you",
      label: "You",
      columnStyle: {
        width: 30.82,
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 2.05,
        display: "inline-flex",
      },
      icon: (
        <div
          data-property-1="Default"
          style={{
            width: 28.77,
            height: 28.77,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <YouProfileIcon active={active === "you"} />
        </div>
      ),
    },
  ];

  return (
    <nav
      aria-label="Primary"
      className="mt-auto w-full shrink-0 border-t border-[#B7B7B7] bg-white font-poppins"
      style={{
        display: "flex",
        width: "100%",
        minHeight: 94.517,
        padding: "7.192px 34.93px",
        paddingBottom: "calc(7.192px + env(safe-area-inset-bottom, 0px))",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 10.274,
        borderTopWidth: 1.03,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          justifyContent: "flex-start",
          alignItems: "center",
          gap: 71.92,
          display: "inline-flex",
        }}
      >
        {tabs.map(({ id, label, columnStyle, icon }) => {
          const on = active === id;
          const body = (
            <>
              {icon}
              <div style={tabLabelStyle(on)}>{label}</div>
            </>
          );

          if (onTabPress) {
            return (
              <button
                key={id}
                type="button"
                onClick={() => onTabPress(id)}
                style={{
                  ...columnStyle,
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  cursor: "pointer",
                }}
                className="focus:outline-none focus-visible:ring-2 focus-visible:ring-black/25 focus-visible:ring-offset-2"
              >
                {body}
              </button>
            );
          }

          return (
            <div key={id} style={columnStyle}>
              {body}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
