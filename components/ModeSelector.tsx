"use client";

import { Coffee, Compass, Zap } from "lucide-react";
import type { FeedMode } from "@/lib/types";

const MODES: {
  id: FeedMode;
  label: string;
}[] = [
  { id: "discover", label: "Discover" },
  { id: "relax", label: "Relax" },
  { id: "catchup", label: "Catchup" },
];

type Props = {
  value: FeedMode;
  onChange: (mode: FeedMode) => void;
  /**
   * When `value` is discover, blue “expanded” styling only applies if true.
   * False = classic feed while still in Discover (API) mode.
   */
  discoverHighlighted?: boolean;
};

function ModeIcon({ id, active }: { id: FeedMode; active: boolean }) {
  const o = active ? "opacity-100" : "opacity-90";
  if (id === "discover") {
    return (
      <Compass
        className={`mb-[-5px] h-[24.66px] w-[24.66px] shrink-0 text-[#6593E5] ${o}`}
        strokeWidth={1.65}
        aria-hidden
      />
    );
  }
  if (id === "relax") {
    return (
      <Coffee
        className={`mb-[-5px] h-[24.66px] w-[24.66px] shrink-0 text-[#BB70C3] ${o}`}
        strokeWidth={1.5}
        aria-hidden
      />
    );
  }
  return (
    <Zap
      className={`mb-[-5px] h-[24.66px] w-[24.66px] shrink-0 text-[#F9CC0B] ${o}`}
      strokeWidth={1.6}
      aria-hidden
    />
  );
}

export function ModeSelector({
  value,
  onChange,
  discoverHighlighted = true,
}: Props) {
  return (
    <div
      className="flex w-full min-w-0 gap-[10.27px] rounded-[6.16px]"
      role="tablist"
      aria-label="Feed mode"
    >
      {MODES.map((m) => {
        const isThisMode = value === m.id;
        const discoverBlue =
          m.id === "discover" &&
          value === "discover" &&
          discoverHighlighted;
        const inactiveOutline =
          "border border-solid border-[#E1E1E1] bg-white hover:bg-[#fafafa]";
        const activeDiscover =
          "border border-solid border-[#b8d4fc] bg-[#CFE2FF] hover:bg-[#c5dbfc]";
        const activeCatchup =
          "border border-solid border-[#f0e4a8] bg-[#FFF5B7] hover:bg-[#fff59a]";
        const activeRelax =
          "border border-solid border-[#e5c2ec] bg-[#FAD1FF] hover:bg-[#f5c6fc]";

        const iconActive =
          isThisMode && (m.id !== "discover" || discoverHighlighted);

        return (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={isThisMode}
            onClick={() => onChange(m.id)}
            className={`flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center rounded-[6.16px] px-[10.27px] pb-[6px] pt-[5.14px] transition ${
              discoverBlue
                ? activeDiscover
                : isThisMode && m.id === "catchup"
                  ? activeCatchup
                  : isThisMode && m.id === "relax"
                    ? activeRelax
                    : inactiveOutline
            }`}
            style={{ borderWidth: "1.027px" }}
          >
            <ModeIcon id={m.id} active={iconActive} />
            <span className="px-[5.14px] font-['Helvetica_Neue',Helvetica,Arial,sans-serif] text-[18.49px] font-medium leading-[37.95px] text-black">
              {m.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
