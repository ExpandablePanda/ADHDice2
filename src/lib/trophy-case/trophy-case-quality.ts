import type { TrophyCaseQuality } from "@/lib/trophy-case/trophy-case-types";

export type TrophyQualityProfile = { dpr: number; shadows: boolean; shadowMapSize: number; visibleLimit: number };
export const TROPHY_QUALITY_PROFILES: Record<Exclude<TrophyCaseQuality, "auto">, TrophyQualityProfile> = {
  high: { dpr: 2.5, shadows: true, shadowMapSize: 2048, visibleLimit: 24 },
  balanced: { dpr: 2, shadows: true, shadowMapSize: 1024, visibleLimit: 24 },
  performance: { dpr: 1.25, shadows: false, shadowMapSize: 0, visibleLimit: 12 },
};

export function normalizeTrophyQuality(value: unknown): TrophyCaseQuality {
  return value === "high" || value === "balanced" || value === "performance" ? value : "auto";
}

export function chooseAutoTrophyQuality(signals: { deviceMemory?: number; devicePixelRatio?: number; hardwareConcurrency?: number; viewportWidth?: number }) {
  if (signals.deviceMemory === undefined && signals.hardwareConcurrency === undefined && signals.viewportWidth === undefined) return "balanced" as const;
  if ((signals.viewportWidth ?? 1024) < 700 || (signals.deviceMemory ?? 8) <= 4 || (signals.hardwareConcurrency ?? 8) <= 4) return "performance" as const;
  if ((signals.deviceMemory ?? 8) >= 8 && (signals.hardwareConcurrency ?? 8) >= 8 && (signals.devicePixelRatio ?? 1) <= 2) return "high" as const;
  return "balanced" as const;
}

export function resolveTrophyQualityProfile(quality: TrophyCaseQuality, signals: Parameters<typeof chooseAutoTrophyQuality>[0]) {
  return TROPHY_QUALITY_PROFILES[quality === "auto" ? chooseAutoTrophyQuality(signals) : quality];
}

export function getReducedMotionPolicy(osReducedMotion: boolean, lowStimulation: boolean) {
  const reduced = osReducedMotion || lowStimulation;
  return { animateCamera: !reduced, autoRotate: !reduced, decorativeEffects: !reduced, reduced };
}

export const TROPHY_ROTATION_RADIANS_PER_SECOND = 0.22;
export const TROPHY_ROTATION_MAX_FRAME_DELTA_SECONDS = 0.05;

export function isTrophyRotationActive(autoRotate: boolean, visibilityState: DocumentVisibilityState) {
  return autoRotate && visibilityState === "visible";
}

export function getTrophyRotationDelta(rawDelta: number, active: boolean) {
  if (!active || !Number.isFinite(rawDelta) || rawDelta <= 0) return 0;
  return Math.min(rawDelta, TROPHY_ROTATION_MAX_FRAME_DELTA_SECONDS) * TROPHY_ROTATION_RADIANS_PER_SECOND;
}
