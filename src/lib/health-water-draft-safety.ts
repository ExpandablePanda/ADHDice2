import type { HealthWaterUnit } from "@/lib/database.types";
import { formatQuantity, millilitersToWaterAmount } from "@/lib/health-library";

export type HealthWaterDraftSafetyState = {
  hasUnfinishedEntryDraft: boolean;
  hasUnfinishedGoalDraft: boolean;
  isEditingExistingEntry: boolean;
  hasPendingSave: boolean;
};

export function isHealthWaterDraftUnsafe(state: HealthWaterDraftSafetyState): boolean {
  return state.hasUnfinishedEntryDraft
    || state.hasUnfinishedGoalDraft
    || state.isEditingExistingEntry
    || state.hasPendingSave;
}

export function isHealthWaterGoalDraftDirty(
  draftAmount: string,
  unit: HealthWaterUnit,
  savedGoalMl: number | null,
): boolean {
  if (savedGoalMl === null) return draftAmount.trim() !== "";

  const draftValue = Number.parseFloat(draftAmount);
  if (!Number.isFinite(draftValue) || draftValue <= 0) return true;

  const savedValue = Number.parseFloat(formatQuantity(millilitersToWaterAmount(savedGoalMl, unit)));
  return draftValue !== savedValue;
}
