import {
  getSafeLocalStorage,
  readLocalStorageValue,
  writeLocalStorageEntries,
} from "@/lib/health-local-storage";

export const FOCUS_SANDBOX_TAB_ORDER_STORAGE_KEY = "adhdice.focusSandboxTabOrder.v1";
export const DEFAULT_FOCUS_SANDBOX_TAB_ORDER = [0, 1] as const;

export function readFocusSandboxTabOrder(): number[] {
  const storage = getSafeLocalStorage();
  if (!storage) return [...DEFAULT_FOCUS_SANDBOX_TAB_ORDER];

  try {
    const stored = JSON.parse(readLocalStorageValue(storage, FOCUS_SANDBOX_TAB_ORDER_STORAGE_KEY) ?? "null");
    if (Array.isArray(stored) && stored.length === 2 && stored.includes(0) && stored.includes(1)) return stored;
  } catch {
    // Fall through to the approved default order.
  }
  return [...DEFAULT_FOCUS_SANDBOX_TAB_ORDER];
}

export function writeFocusSandboxTabOrder(order: number[]) {
  const storage = getSafeLocalStorage();
  if (!storage) return;
  writeLocalStorageEntries(storage, [[FOCUS_SANDBOX_TAB_ORDER_STORAGE_KEY, JSON.stringify(order)]]);
}
