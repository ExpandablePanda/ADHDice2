"use client";

import { DEFAULT_D6_VISUAL_STYLE, D6CalibrationCanvas, D6_FACE_ROTATION_PRESETS } from "@/components/dice-3d";
import type { AchievementTierId } from "@/lib/achievements-mvp/types";
import { getAchievementCelebrationTierTone } from "@/lib/achievement-celebration-tier-tone";

export const ACHIEVEMENT_CELEBRATION_FACE_VALUE = 1;

export default function AchievementCelebrationTrophyCanvas({ tier }: { tier: AchievementTierId | null }) {
  const tone = getAchievementCelebrationTierTone(tier);
  return (
    <D6CalibrationCanvas
      height={88}
      rotation={D6_FACE_ROTATION_PRESETS[ACHIEVEMENT_CELEBRATION_FACE_VALUE]}
      scale={1.16}
      style={{ ...DEFAULT_D6_VISUAL_STYLE, bodyColor: tone.bodyColor, bodyEmissive: tone.bodyColor, pipColor: tone.pipColor, pipEmissive: tone.pipColor }}
      dark={false}
    />
  );
}
