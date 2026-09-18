"use client";

import { Check } from "lucide-react";
import type { CSSProperties } from "react";
import {
  getStyleLabBackgroundColorCssValue,
  STYLE_LAB_BACKGROUND_PALETTE,
  type StyleLabBackgroundColor,
} from "./style-lab-registry";

const SWATCH_CLASS = "h-5 w-5 shrink-0 rounded-full border border-black/10 shadow-inner dark:border-white/20";

function getSwatchStyle(value: StyleLabBackgroundColor): CSSProperties {
  if (value === "Transparent") {
    return {
      backgroundColor: "transparent",
      backgroundImage: "linear-gradient(45deg, rgba(125, 117, 152, 0.2) 25%, transparent 25%, transparent 75%, rgba(125, 117, 152, 0.2) 75%), linear-gradient(45deg, rgba(125, 117, 152, 0.2) 25%, transparent 25%, transparent 75%, rgba(125, 117, 152, 0.2) 75%)",
      backgroundPosition: "0 0, 4px 4px",
      backgroundSize: "8px 8px",
    };
  }
  return { backgroundColor: getStyleLabBackgroundColorCssValue(value) };
}

export function StyleLabColorPalette({
  onChange,
  value,
}: {
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div aria-label="Background color palette" className="grid min-w-0 flex-1 grid-cols-2 gap-1.5 sm:grid-cols-4" role="radiogroup">
      <button
        aria-checked={!value}
        className={`flex min-w-0 items-center gap-1.5 rounded-lg border px-1.5 py-1 text-left text-[10px] font-medium transition ${!value ? "border-[#6f57f6] bg-[#f1ecff] text-[#5d4bb6] ring-1 ring-[#c9bcff] dark:border-[#c9bbff] dark:bg-white/10 dark:text-[#d8ceff]" : "border-[#e6e0f4] bg-white text-[#6f6785] hover:border-[#c9bcff] dark:border-white/10 dark:bg-white/[0.06] dark:text-white/65"}`}
        onClick={() => onChange("")}
        role="radio"
        title="Default / Original"
        type="button"
      >
        <span aria-hidden="true" className={`${SWATCH_CLASS} border-dashed bg-transparent text-center text-[9px] leading-4 text-[#8d82b6]`}>
          D
        </span>
        <span className="min-w-0 truncate">Default / Original</span>
        {!value ? <Check aria-hidden="true" className="ml-auto h-3 w-3 shrink-0" /> : null}
      </button>
      {STYLE_LAB_BACKGROUND_PALETTE.map((entry) => {
        const selected = value === entry.value;
        return (
          <button
            aria-checked={selected}
            className={`flex min-w-0 items-center gap-1.5 rounded-lg border px-1.5 py-1 text-left text-[10px] font-medium transition ${selected ? "border-[#6f57f6] bg-[#f1ecff] text-[#5d4bb6] ring-1 ring-[#c9bcff] dark:border-[#c9bbff] dark:bg-white/10 dark:text-[#d8ceff]" : "border-[#e6e0f4] bg-white text-[#6f6785] hover:border-[#c9bcff] dark:border-white/10 dark:bg-white/[0.06] dark:text-white/65"}`}
            key={entry.value}
            onClick={() => onChange(entry.value)}
            role="radio"
            title={`${entry.label} (${entry.token})`}
            type="button"
          >
            <span aria-hidden="true" className={SWATCH_CLASS} style={getSwatchStyle(entry.value)} />
            <span className="min-w-0 truncate">{entry.label}</span>
            {selected ? <Check aria-hidden="true" className="ml-auto h-3 w-3 shrink-0" /> : null}
          </button>
        );
      })}
    </div>
  );
}
