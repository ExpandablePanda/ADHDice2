import type { EarnedTrophy, TrophyPlacement } from "@/lib/trophy-case/trophy-case-types";
import type { MilestoneTier } from "@/lib/milestones";

export const TROPHIES_PER_SHELF = 6;
export const TROPHY_TIER_ORDER: readonly MilestoneTier[] = ["bronze", "silver", "gold", "platinum"];

export function buildCanonicalTrophyPlacements(trophies: readonly EarnedTrophy[]) {
  const placements = new Map<string, TrophyPlacement>();
  for (const [tierIndex, tier] of TROPHY_TIER_ORDER.entries()) {
    const tierTrophies = trophies.filter((trophy) => trophy.tier === tier).sort((a, b) => a.completionDate.localeCompare(b.completionDate) || a.milestoneId.localeCompare(b.milestoneId));
    tierTrophies.forEach((trophy, index) => {
      const shelfIndex = Math.floor(index / TROPHIES_PER_SHELF);
      const slotIndex = index % TROPHIES_PER_SHELF;
      placements.set(trophy.milestoneId, {
        cameraTarget: { kind: "trophy", milestoneId: trophy.milestoneId },
        milestoneId: trophy.milestoneId,
        position: [tierIndex * 5.5 - 8.25 + (slotIndex - 2.5) * 0.62, 1.2 + shelfIndex * 1.45, -3.5],
        rotation: [0, ((index * 37) % 12 - 6) * Math.PI / 180, 0],
        shelfIndex,
        slotIndex,
        tier,
      });
    });
  }
  return placements;
}

export function getVisibleTrophyPlacements(canonical: ReadonlyMap<string, TrophyPlacement>, visibleTrophies: readonly EarnedTrophy[]) {
  return visibleTrophies.flatMap((trophy) => {
    const placement = canonical.get(trophy.milestoneId);
    return placement ? [{ placement, trophy }] : [];
  });
}
