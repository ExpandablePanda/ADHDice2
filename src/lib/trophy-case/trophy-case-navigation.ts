import type { TrophyCaseCameraTarget } from "@/lib/trophy-case/trophy-case-types";
import type { MilestoneTier } from "@/lib/milestones";

export function overviewCameraTarget(): TrophyCaseCameraTarget { return { kind: "overview" }; }
export function tierCameraTarget(tier: MilestoneTier): TrophyCaseCameraTarget { return { kind: "tier", tier }; }
export function shelfCameraTarget(tier: MilestoneTier, shelfIndex: number): TrophyCaseCameraTarget { return { kind: "shelf", tier, shelfIndex }; }
export function trophyCameraTarget(milestoneId: string): TrophyCaseCameraTarget { return { kind: "trophy", milestoneId }; }
export function inspectCameraTarget(milestoneId: string): TrophyCaseCameraTarget { return { kind: "inspect", milestoneId }; }

export function serializeCameraTarget(target: TrophyCaseCameraTarget) {
  if (target.kind === "overview") return "overview";
  if (target.kind === "tier") return `tier:${target.tier}`;
  if (target.kind === "shelf") return `shelf:${target.tier}:${target.shelfIndex}`;
  return `${target.kind}:${target.milestoneId}`;
}
