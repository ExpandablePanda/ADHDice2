"use client";

import dynamic from "next/dynamic";
import { ErrorBoundary } from "@/components/error-boundary";
import type { AchievementTierId } from "@/lib/achievements-mvp/types";
import { getAchievementCelebrationTierTone } from "@/lib/achievement-celebration-tier-tone";

function AchievementCelebrationTrophyFallback({ tier }: { tier: AchievementTierId | null }) {
  const tone = getAchievementCelebrationTierTone(tier);
  return (
    <span aria-label="Achievement trophy die" className="flex h-[88px] w-[88px] items-center justify-center rounded-[1.35rem] bg-[#f0ebff] shadow-inner dark:bg-[#2a2148]" role="img">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl border shadow-[inset_0_3px_7px_rgba(255,255,255,0.42)]" style={{ backgroundColor: tone.bodyColor, borderColor: tone.borderColor }}>
        <span className="h-2.5 w-2.5 rounded-full shadow-[0_1px_2px_rgba(60,43,115,0.35)]" style={{ backgroundColor: tone.pipColor }} />
      </span>
    </span>
  );
}

const AchievementCelebrationTrophyCanvas = dynamic(
  () => import("./achievement-celebration-trophy-canvas"),
  { loading: () => null, ssr: false },
);

export function AchievementCelebrationTrophy({ tier }: { tier: AchievementTierId | null }) {
  return (
    <div className="relative h-[88px] w-[88px] shrink-0 overflow-hidden rounded-[1.35rem]" data-testid="achievement-celebration-trophy">
      <AchievementCelebrationTrophyFallback tier={tier} />
      <ErrorBoundary fallback={null}>
        <div className="absolute inset-0"><AchievementCelebrationTrophyCanvas tier={tier} /></div>
      </ErrorBoundary>
    </div>
  );
}
