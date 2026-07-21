import type { AchievementTierId } from "@/lib/achievements-mvp/types";
import { TROPHY_TIER_MATERIALS } from "@/lib/trophy-case/trophy-gallery";

export type AchievementCelebrationTierTone = {
  bodyColor: string;
  borderColor: string;
  pipColor: string;
};

const NEUTRAL_TIER_TONE: AchievementCelebrationTierTone = {
  bodyColor: "#9ca5b0",
  borderColor: "#77818d",
  pipColor: "#ffffff",
};

export function getAchievementCelebrationTierTone(tier: AchievementTierId | null): AchievementCelebrationTierTone {
  if (!tier) return NEUTRAL_TIER_TONE;
  if (tier === "platinum") {
    return {
      bodyColor: "#e8f5f7",
      borderColor: "#abc9d2",
      pipColor: "#201b2b",
    };
  }
  const material = TROPHY_TIER_MATERIALS[tier];
  return {
    bodyColor: material.color,
    borderColor: material.color,
    pipColor: "#201b2b",
  };
}
