import type { FocusReallocationMode, PendingFocusDailySurplus } from "./types";

export const FOCUS_REALLOCATION_MODE_STORAGE_KEY = "adhdice_focus_reallocation_mode";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function normalizeFocusReallocationMode(value: unknown): FocusReallocationMode {
  return value === "automatic" ? "automatic" : "manual";
}

export function getFocusReallocationModeStorageKey(userId: string) {
  return `${FOCUS_REALLOCATION_MODE_STORAGE_KEY}:${userId}`;
}

function browserStorage(): StorageLike | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function readFocusReallocationMode(userId: string | null, storage: StorageLike | null = browserStorage()): FocusReallocationMode {
  if (!userId || !storage) return "manual";
  return normalizeFocusReallocationMode(storage.getItem(getFocusReallocationModeStorageKey(userId)));
}

export function writeFocusReallocationMode(userId: string | null, mode: unknown, storage: StorageLike | null = browserStorage()) {
  if (!userId || !storage) return;
  storage.setItem(getFocusReallocationModeStorageKey(userId), normalizeFocusReallocationMode(mode));
}

export function shouldPresentDailySurplusModal(
  mode: FocusReallocationMode,
  pending: PendingFocusDailySurplus | null,
  manualOpen: boolean,
) {
  return pending !== null && (mode === "automatic" || manualOpen);
}

export function shouldShowManualDailySurplusAction(mode: FocusReallocationMode, pending: PendingFocusDailySurplus | null) {
  return mode === "manual" && pending !== null;
}
