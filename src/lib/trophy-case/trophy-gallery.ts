import type { MilestoneAuraKind, MilestoneTier } from "@/lib/milestones";
import type { EarnedTrophy } from "@/lib/trophy-case/trophy-case-types";

export const TROPHY_GALLERY_TIERS: readonly MilestoneTier[] = ["bronze", "silver", "gold", "platinum"];
export const TROPHY_GALLERY_AURAS: readonly MilestoneAuraKind[] = ["standard", "diamond", "none"];
export const TROPHY_TIER_MATERIALS = {
  bronze: { color: "#a8663f", roughness: 0.42 },
  silver: { color: "#c4c9cf", roughness: 0.36 },
  gold: { color: "#f2c94c", roughness: 0.28 },
  platinum: { color: "#d7e5e8", roughness: 0.24 },
} as const;

export type TrophyGalleryCounts = {
  auras: Record<MilestoneAuraKind, number>;
  tiers: Record<MilestoneTier, number>;
  total: number;
};

export function countEarnedTrophies(trophies: readonly EarnedTrophy[]): TrophyGalleryCounts {
  const counts: TrophyGalleryCounts = {
    auras: { diamond: 0, none: 0, standard: 0 },
    tiers: { bronze: 0, gold: 0, platinum: 0, silver: 0 },
    total: trophies.length,
  };
  for (const trophy of trophies) {
    counts.tiers[trophy.tier] += 1;
    counts.auras[trophy.auraKind] += 1;
  }
  return counts;
}

export function toggleSingleTrophyFilter<T extends string>(current: readonly T[], value: T): T[] {
  return current.length === 1 && current[0] === value ? [] : [value];
}

export function getTrophyTierImageAlt(tier: MilestoneTier) {
  return `${tier[0].toUpperCase()}${tier.slice(1)} trophy die`;
}

export function createTierThumbnailCache<T>(renderTier: (tier: MilestoneTier) => Promise<T>) {
  let cache: Promise<Record<MilestoneTier, T>> | null = null;
  return () => {
    if (!cache) {
      cache = Promise.all(TROPHY_GALLERY_TIERS.map(async (tier) => [tier, await renderTier(tier)] as const))
        .then((entries) => Object.fromEntries(entries) as Record<MilestoneTier, T>)
        .catch((error) => {
          cache = null;
          throw error;
        });
    }
    return cache;
  };
}
