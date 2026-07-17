import type { EarnedTrophy, TrophyCaseFilters, TrophyCaseSort } from "@/lib/trophy-case/trophy-case-types";

export function normalizeTrophySearch(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function filterAndSortTrophies(trophies: readonly EarnedTrophy[], filters: TrophyCaseFilters, sort: TrophyCaseSort) {
  const query = normalizeTrophySearch(filters.search);
  return trophies.filter((trophy) => (
    (!query || normalizeTrophySearch(trophy.title).includes(query))
    && (filters.tiers.size === 0 || filters.tiers.has(trophy.tier))
    && (filters.auras.size === 0 || filters.auras.has(trophy.auraKind))
  )).sort((left, right) => {
    const date = left.completedAt.localeCompare(right.completedAt);
    return (sort === "oldest" ? date : -date) || left.milestoneId.localeCompare(right.milestoneId);
  });
}
