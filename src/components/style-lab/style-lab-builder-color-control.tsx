"use client";

import { useState, type CSSProperties } from "react";
import { normalizeStyleLabCustomColor } from "./style-lab-registry";

type BuilderColorKind = "background" | "divider" | "text";

const TEXT_COLORS = [
  { label: "Primary", value: "Primary", hex: "#302752" },
  { label: "Secondary", value: "Secondary", hex: "#5f5876" },
  { label: "Muted", value: "Muted", hex: "#7d7598" },
  { label: "Accent", value: "Accent", hex: "#6f57f6" },
  { label: "Success", value: "Success", hex: "#3f8b5a" },
  { label: "Warning", value: "Warning", hex: "#c8701b" },
  { label: "Danger", value: "Danger", hex: "#d54d63" },
] as const;

const BACKGROUND_COLORS = [
  { label: "Surface", value: "Surface", hex: "#ffffff" },
  { label: "Subtle", value: "Subtle", hex: "#f7f4ff" },
  { label: "Accent", value: "Accent", hex: "#f1ecff" },
  { label: "Success", value: "Success", hex: "#eef9f0" },
  { label: "Warning", value: "Warning", hex: "#fff2e6" },
  { label: "Danger", value: "Danger", hex: "#fff0f3" },
  { label: "Transparent", value: "Transparent", hex: "#ffffff" },
] as const;

function swatchStyle(hex: string, transparent = false): CSSProperties {
  return transparent
    ? {
        backgroundColor: "transparent",
        backgroundImage: "linear-gradient(45deg, rgba(125, 117, 152, 0.2) 25%, transparent 25%, transparent 75%, rgba(125, 117, 152, 0.2) 75%), linear-gradient(45deg, rgba(125, 117, 152, 0.2) 25%, transparent 25%, transparent 75%, rgba(125, 117, 152, 0.2) 75%)",
        backgroundPosition: "0 0, 4px 4px",
        backgroundSize: "8px 8px",
      }
    : { backgroundColor: hex };
}

export function StyleLabBuilderColorControl({
  kind,
  label,
  onChange,
  value,
}: {
  kind: BuilderColorKind;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const semanticOptions = kind === "text" || kind === "divider" ? TEXT_COLORS : BACKGROUND_COLORS;
  const selectedSemantic = semanticOptions.find((option) => option.value === value);
  const customColor = normalizeStyleLabCustomColor(value);
  const pickerColor = customColor ?? selectedSemantic?.hex ?? "#6f57f6";
  const [hexDraft, setHexDraft] = useState(pickerColor);

  function commitHex(nextValue: string) {
    setHexDraft(nextValue);
    const normalized = normalizeStyleLabCustomColor(nextValue);
    if (normalized) onChange(normalized);
  }

  function reset() {
    onChange(kind === "background" ? "Surface" : kind === "divider" ? "Muted" : "Primary");
  }

  return (
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <label className="flex h-8 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-[#e6e0f4] bg-white dark:border-white/10 dark:bg-white/[0.06]" title={`Choose ${label.toLowerCase()}`}>
          <span className="sr-only">Choose {label.toLowerCase()}</span>
          <input aria-label={`Choose ${label.toLowerCase()}`} className="h-6 w-7 cursor-pointer rounded border-0 bg-transparent p-0" onChange={(event) => commitHex(event.target.value)} type="color" value={pickerColor} />
        </label>
        <span aria-hidden="true" className="h-6 w-6 shrink-0 rounded-full border border-black/10 shadow-inner dark:border-white/20" style={swatchStyle(pickerColor, value === "Transparent")} />
        <input
          aria-label={`${label} HEX`}
          className="h-8 min-w-[7rem] flex-1 rounded-lg border border-[#e6e0f4] bg-white px-2 font-mono text-[11px] text-[#3f3856] outline-none focus:border-[#c9bcff] dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
          maxLength={7}
          onBlur={() => setHexDraft(pickerColor)}
          onChange={(event) => commitHex(event.target.value)}
          placeholder="#6f57f6"
          type="text"
          value={hexDraft}
        />
        <button className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-semibold text-[#6f57f6] hover:bg-[#f1ecff] dark:text-[#cabfff] dark:hover:bg-white/10" onClick={reset} type="button">Reset</button>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {semanticOptions.map((option) => {
          const selected = option.value === value;
          return (
            <button
              aria-label={`${label}: ${option.label}`}
              aria-pressed={selected}
              className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-1 text-[10px] font-medium transition ${selected ? "border-[#6f57f6] bg-[#f1ecff] text-[#5d4bb6] ring-1 ring-[#c9bcff] dark:border-[#c9bbff] dark:bg-white/10 dark:text-[#d8ceff]" : "border-[#e6e0f4] bg-white text-[#6f6785] hover:border-[#c9bcff] dark:border-white/10 dark:bg-white/[0.06] dark:text-white/65"}`}
              key={option.value}
              onClick={() => onChange(option.value)}
              type="button"
            >
              <span aria-hidden="true" className="h-3 w-3 rounded-full border border-black/10 dark:border-white/20" style={swatchStyle(option.hex, option.value === "Transparent")} />
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
