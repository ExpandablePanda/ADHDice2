export const PAGE_SHELL_LAYOUT_STORAGE_PREFIX = "adhdice-page-section-order:";

export type PageShellLayoutStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const HEALTH_PAGE_SHELL_IDS = {
  Today: ["today-snapshot", "today-quick-log", "today-timeline"],
  Food: ["food-meal-log", "food-daily-totals", "food-library"],
  Water: ["water-log", "water-history"],
  Fitness: ["fitness-active-workout", "fitness-today", "fitness-week", "fitness-goals", "fitness-plans", "fitness-workout-history"],
  Journal: ["journal-entry-history", "journal-library", "journal-feeling-trends"],
  Weight: ["weight-entry", "weight-trend"],
  Sleep: ["sleep-ledger", "sleep-entry-and-sources"],
  Insights: ["insights-import", "insights-trends"],
  Awards: ["awards-content"],
  Settings: ["settings-content"],
} as const;

export type HealthPageShellTab = keyof typeof HEALTH_PAGE_SHELL_IDS;

export const STATS_PAGE_SHELL_IDS = [
  "stats-overview",
  "stats-economy",
  "stats-productivity",
  "stats-achievements",
  "stats-energy",
] as const;

export const FOCUS_PAGE_SHELL_IDS = [
  "focus-timer-workspace",
  "focus-goals",
  "focus-counter-history",
  "focus-history",
] as const;

export function getHealthPageShellKey(tab: HealthPageShellTab) {
  return `health:${tab.toLowerCase()}`;
}

export function getPageShellLayoutStorageKey(userId: string) {
  return PAGE_SHELL_LAYOUT_STORAGE_PREFIX + userId;
}

export function normalizePageShellOrder(stored: unknown, defaults: readonly string[]) {
  const defaultIds = [...new Set(defaults.filter((id): id is string => typeof id === "string" && id.length > 0))];
  if (!Array.isArray(stored)) {
    return defaultIds;
  }
  const validIds = new Set(defaultIds);
  const seen = new Set<string>();
  const normalized = stored.filter((id): id is string => (
    typeof id === "string" && validIds.has(id) && !seen.has(id) && seen.add(id)
  ));
  return [...normalized, ...defaultIds.filter((id) => !seen.has(id))];
}

export function reorderPageShellOrder(order: readonly string[], sourceId: string, targetId: string) {
  if (sourceId === targetId || !order.includes(sourceId) || !order.includes(targetId)) {
    return [...order];
  }
  const withoutSource = order.filter((id) => id !== sourceId);
  const targetIndex = withoutSource.indexOf(targetId);
  withoutSource.splice(targetIndex < 0 ? withoutSource.length : targetIndex, 0, sourceId);
  return withoutSource;
}

function readStoredPageShellOrders(storage: PageShellLayoutStorage, storageKey: string) {
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.entries(parsed).reduce<Record<string, string[]>>((orders, [pageKey, order]) => {
      if (Array.isArray(order) && order.every((id) => typeof id === "string")) {
        orders[pageKey] = order;
      }
      return orders;
    }, {});
  } catch {
    return {};
  }
}

export function readPageShellOrder(
  storage: PageShellLayoutStorage,
  storageKey: string,
  pageKey: string,
  defaults: readonly string[],
) {
  return normalizePageShellOrder(readStoredPageShellOrders(storage, storageKey)[pageKey], defaults);
}

export function writePageShellOrder(
  storage: PageShellLayoutStorage,
  storageKey: string,
  pageKey: string,
  order: readonly string[],
) {
  try {
    const orders = readStoredPageShellOrders(storage, storageKey);
    orders[pageKey] = [...order];
    storage.setItem(storageKey, JSON.stringify(orders));
  } catch {
    // Storage can be unavailable in private browsing or a restricted WebView.
  }
}

export function removePageShellOrder(storage: PageShellLayoutStorage, storageKey: string, pageKey: string) {
  try {
    const orders = readStoredPageShellOrders(storage, storageKey);
    delete orders[pageKey];
    if (Object.keys(orders).length === 0) {
      storage.removeItem(storageKey);
    } else {
      storage.setItem(storageKey, JSON.stringify(orders));
    }
  } catch {
    // Reset remains an in-memory operation when storage is unavailable.
  }
}
