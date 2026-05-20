"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef } from "react";

export type PillMenuItem<T extends string> = {
  value: T;
  label: string;
  /** Secondary line under the label (e.g. sort option details). */
  description?: string;
};

type Props<T extends string> = {
  label: string;
  /** Shown on the trigger when a non-default item is selected (optional). */
  activeLabel?: string;
  items: PillMenuItem<T>[];
  value: T;
  onChange: (value: T) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional section heading inside the menu (e.g. "Topics"). */
  menuHeading?: string;
  trailingIcon?: "plus" | "chevron";
  /** Wider panel when items include descriptions. */
  menuWide?: boolean;
  /** Cap list height and show a scrollbar (e.g. topic filters). */
  menuScrollable?: boolean;
  /** Tighter rows for compact scrollable lists. */
  menuCompact?: boolean;
};

export function HeaderPillDropdown<T extends string>({
  label,
  activeLabel,
  items,
  value,
  onChange,
  open,
  onOpenChange,
  menuHeading,
  trailingIcon = "chevron",
  menuWide = false,
  menuScrollable = false,
  menuCompact = false,
}: Props<T>) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  const triggerText = activeLabel ?? label;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => onOpenChange(!open)}
        className={`flex items-center gap-[10.27px] rounded-[12.33px] bg-white px-[10.27px] py-[5.14px] font-['Helvetica_Neue',Helvetica,Arial,sans-serif] text-[14.38px] font-medium leading-[21.57px] text-black outline outline-1 -outline-offset-1 outline-[#E1E1E1] hover:bg-[#fafafa] ${
          open ? "bg-[#fafafa]" : ""
        }`}
        style={{ outlineWidth: "1.027px" }}
      >
        {triggerText}
        {trailingIcon === "plus" ? (
          <span className="relative inline-flex h-[24.66px] w-[24.66px] items-center justify-center p-[6px]">
            <span className="absolute left-1/2 top-1/2 h-[1.8px] w-[12.63px] -translate-x-1/2 -translate-y-1/2 bg-black" />
            <span className="absolute left-1/2 top-1/2 h-[12.63px] w-[1.8px] -translate-x-1/2 -translate-y-1/2 bg-black" />
          </span>
        ) : (
          <ChevronDown
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
            strokeWidth={2}
          />
        )}
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className={`absolute left-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-[12.33px] border border-[#E1E1E1] bg-white py-1 shadow-[0_8px_24px_rgba(0,0,0,0.12)] ${
            menuWide ? "min-w-[240px] max-w-[min(280px,calc(100vw-48px))]" : "min-w-[168px]"
          }`}
        >
          {menuHeading ? (
            <p className="shrink-0 px-3 pb-1 pt-1.5 font-['Helvetica_Neue',Helvetica,Arial,sans-serif] text-[11px] font-semibold uppercase tracking-wide text-[#7F7F7F]">
              {menuHeading}
            </p>
          ) : null}
          <ul
            className={`flex flex-col ${
              menuScrollable
                ? `pill-menu-scroll max-h-[128px]${menuHeading ? " border-t border-[#f0f0f0]" : ""}`
                : ""
            }`}
          >
            {items.map((item) => {
              const selected = item.value === value;
              return (
                <li key={item.value} role="none">
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    onClick={() => {
                      onChange(item.value);
                      onOpenChange(false);
                    }}
                    className={`flex w-full items-start justify-between gap-3 px-3 text-left hover:bg-[#f5f5f5] ${
                      menuCompact ? "py-1.5" : "py-2.5"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-['Helvetica_Neue',Helvetica,Arial,sans-serif] text-[14px] font-medium leading-snug text-black">
                        {item.label}
                      </span>
                      {item.description ? (
                        <span className="mt-0.5 block font-['Helvetica_Neue',Helvetica,Arial,sans-serif] text-[11px] font-normal leading-snug text-[#7F7F7F]">
                          {item.description}
                        </span>
                      ) : null}
                    </span>
                    {selected ? (
                      <Check
                        className="mt-0.5 h-4 w-4 shrink-0"
                        strokeWidth={2.25}
                      />
                    ) : (
                      <span className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
