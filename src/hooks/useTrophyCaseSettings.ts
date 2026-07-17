"use client";

import { useCallback, useState } from "react";
import type { MilestoneAuraKind, MilestoneTier } from "@/lib/milestones";
import { normalizeTrophyQuality, type TrophyCaseQuality, type TrophyCaseRenderMode, type TrophyCaseSort } from "@/lib/trophy-case";

const STORAGE_PREFIX = "adhdice:trophy-case:prototype:v1";
const TIERS: MilestoneTier[] = ["bronze", "silver", "gold", "platinum"];
const AURAS: MilestoneAuraKind[] = ["none", "standard", "diamond"];

export type TrophyCaseSettings = {
  auraFilters: MilestoneAuraKind[];
  enabled: boolean;
  featuredMilestoneId: string | null;
  quality: TrophyCaseQuality;
  renderMode: TrophyCaseRenderMode;
  selectedSection: MilestoneTier | "overview";
  sort: TrophyCaseSort;
  tierFilters: MilestoneTier[];
};

export const DEFAULT_TROPHY_CASE_SETTINGS: TrophyCaseSettings = {
  auraFilters: [], enabled: true, featuredMilestoneId: null, quality: "auto", renderMode: "3d", selectedSection: "overview", sort: "newest", tierFilters: [],
};

export function normalizeTrophyCaseSettings(value: unknown): TrophyCaseSettings {
  if (!value || typeof value !== "object") return DEFAULT_TROPHY_CASE_SETTINGS;
  const input = value as Partial<TrophyCaseSettings>;
  return {
    auraFilters: Array.isArray(input.auraFilters) ? input.auraFilters.filter((value): value is MilestoneAuraKind => AURAS.includes(value as MilestoneAuraKind)).slice(0, 1) : [],
    enabled: true,
    featuredMilestoneId: typeof input.featuredMilestoneId === "string" ? input.featuredMilestoneId : null,
    quality: normalizeTrophyQuality(input.quality),
    renderMode: input.renderMode === "static" ? "static" : "3d",
    selectedSection: input.selectedSection === "overview" || TIERS.includes(input.selectedSection as MilestoneTier) ? input.selectedSection as TrophyCaseSettings["selectedSection"] : "overview",
    sort: input.sort === "oldest" ? "oldest" : "newest",
    tierFilters: Array.isArray(input.tierFilters) ? input.tierFilters.filter((value): value is MilestoneTier => TIERS.includes(value as MilestoneTier)).slice(0, 1) : [],
  };
}

export function useTrophyCaseSettings(userId: string | null) {
  const key = `${STORAGE_PREFIX}:${userId ?? "guest"}`;
  const [settings, setSettings] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_TROPHY_CASE_SETTINGS;
    try { return normalizeTrophyCaseSettings(JSON.parse(window.localStorage.getItem(key) ?? "null")); }
    catch { return DEFAULT_TROPHY_CASE_SETTINGS; }
  });

  const updateSettings = useCallback((update: Partial<TrophyCaseSettings> | ((current: TrophyCaseSettings) => TrophyCaseSettings)) => {
    setSettings((current) => {
      const next = typeof update === "function" ? update(current) : normalizeTrophyCaseSettings({ ...current, ...update });
      try { window.localStorage.setItem(key, JSON.stringify(next)); } catch { /* local prototype preferences are best effort */ }
      return next;
    });
  }, [key]);

  return { settings, updateSettings };
}
