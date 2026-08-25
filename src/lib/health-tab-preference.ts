import { HEALTH_TABS, type HealthTab } from "@/lib/health-utils";

export const HEALTH_TAB_STORAGE_KEY = "adhdice-health-tab";
const healthTabPreferenceListeners = new Set<() => void>();

export function readHealthTabPreference(): HealthTab {
  if (typeof window === "undefined") return "Today";
  try {
    const stored = window.localStorage.getItem(HEALTH_TAB_STORAGE_KEY);
    return HEALTH_TABS.includes(stored as HealthTab) ? stored as HealthTab : "Today";
  } catch {
    return "Today";
  }
}

export function subscribeToHealthTabPreference(listener: () => void) {
  healthTabPreferenceListeners.add(listener);
  const handleStorage = () => listener();
  window.addEventListener("storage", handleStorage);
  return () => {
    healthTabPreferenceListeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function persistHealthTabPreference(tab: HealthTab) {
  try {
    window.localStorage.setItem(HEALTH_TAB_STORAGE_KEY, tab);
  } catch {
    // UI preference persistence is best effort.
  }
  healthTabPreferenceListeners.forEach((listener) => listener());
}
