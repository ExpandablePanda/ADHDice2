"use client";

import type { AchievementFaceLevel } from "@/lib/achievements";

export function DieFaceTile({
  accent,
  face,
  glow = false,
  size,
}: {
  accent: string;
  face: AchievementFaceLevel;
  glow?: boolean;
  size: "sm" | "md";
}) {
  const dimensions = size === "md" ? "h-20 w-20 rounded-[1.6rem]" : "h-14 w-14 rounded-[1.1rem]";
  const pipSize = size === "md" ? "h-3.5 w-3.5" : "h-2.5 w-2.5";

  return (
    <div
      className={`grid grid-cols-3 grid-rows-3 place-items-center border border-white/70 bg-white ${dimensions} ${
        glow ? "shadow-[0_18px_38px_rgba(92,114,201,0.28)]" : "shadow-[0_10px_22px_rgba(86,102,150,0.1)]"
      }`}
      style={glow ? {
        boxShadow: `0 0 0 1px ${accent}44, 0 18px 38px ${accent}33`,
      } : undefined}
    >
      {PIP_LAYOUTS[face].map((isActive, index) => (
        <span
          className={`${pipSize} rounded-full transition ${isActive ? "opacity-100" : "opacity-0"}`}
          key={index}
          style={{ backgroundColor: isActive ? accent : "transparent" }}
        />
      ))}
    </div>
  );
}

const PIP_LAYOUTS: Record<AchievementFaceLevel, boolean[]> = {
  1: [
    false, false, false,
    false, true, false,
    false, false, false,
  ],
  2: [
    true, false, false,
    false, false, false,
    false, false, true,
  ],
  3: [
    true, false, false,
    false, true, false,
    false, false, true,
  ],
  4: [
    true, false, true,
    false, false, false,
    true, false, true,
  ],
  5: [
    true, false, true,
    false, true, false,
    true, false, true,
  ],
  6: [
    true, false, true,
    true, false, true,
    true, false, true,
  ],
};
