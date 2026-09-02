export const PAGE_SECTION_ORDER_STORAGE_PREFIX = "adhdice-page-section-order:";

export type PageSectionOrderStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function getPageSectionOrderStorageKey(userId: string) {
  return PAGE_SECTION_ORDER_STORAGE_PREFIX + userId;
}

export function normalizePageSectionOrder(stored: unknown, defaults: readonly string[]) {
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

export function reorderPageSectionOrder(order: readonly string[], sourceId: string, targetId: string) {
  if (sourceId === targetId || !order.includes(sourceId) || !order.includes(targetId)) {
    return [...order];
  }
  const withoutSource = order.filter((id) => id !== sourceId);
  const targetIndex = withoutSource.indexOf(targetId);
  withoutSource.splice(targetIndex < 0 ? withoutSource.length : targetIndex, 0, sourceId);
  return withoutSource;
}

function readStoredPageSectionOrders(storage: PageSectionOrderStorage, storageKey: string) {
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

export function readPageSectionOrder(
  storage: PageSectionOrderStorage,
  storageKey: string,
  pageKey: string,
  defaults: readonly string[],
) {
  return normalizePageSectionOrder(readStoredPageSectionOrders(storage, storageKey)[pageKey], defaults);
}

export function writePageSectionOrder(
  storage: PageSectionOrderStorage,
  storageKey: string,
  pageKey: string,
  order: readonly string[],
) {
  try {
    const orders = readStoredPageSectionOrders(storage, storageKey);
    orders[pageKey] = [...order];
    storage.setItem(storageKey, JSON.stringify(orders));
  } catch {
    // Storage can be unavailable in private browsing or a restricted WebView.
  }
}

export function removePageSectionOrder(storage: PageSectionOrderStorage, storageKey: string, pageKey: string) {
  try {
    const orders = readStoredPageSectionOrders(storage, storageKey);
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
