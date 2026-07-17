import type { MilestoneAuraKind, MilestoneCompletionTiming, MilestoneTier } from "@/lib/milestones";

export type TrophyCaseSort = "newest" | "oldest";
export type TrophyCaseQuality = "auto" | "high" | "balanced" | "performance";
export type TrophyCaseRenderMode = "3d" | "static";
export type TrophyCaseCameraTarget =
  | { kind: "overview" }
  | { kind: "tier"; tier: MilestoneTier }
  | { kind: "shelf"; shelfIndex: number; tier: MilestoneTier }
  | { kind: "trophy" | "inspect"; milestoneId: string };

export type EarnedTrophy = {
  auraKind: MilestoneAuraKind;
  completedAt: string;
  completionDate: string;
  completionTiming: MilestoneCompletionTiming;
  currentlyEarned: true;
  milestoneId: string;
  taskId: string | null;
  targetDate: string;
  tier: MilestoneTier;
  title: string;
};

export type TrophyPlacement = {
  cameraTarget: TrophyCaseCameraTarget;
  milestoneId: string;
  position: readonly [number, number, number];
  rotation: readonly [number, number, number];
  shelfIndex: number;
  slotIndex: number;
  tier: MilestoneTier;
};

export type TrophyCaseFilters = {
  auras: ReadonlySet<MilestoneAuraKind>;
  search: string;
  tiers: ReadonlySet<MilestoneTier>;
};
