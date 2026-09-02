export const PAGE_SHELL_LAYOUT_STORAGE_PREFIX = "adhdice-page-shell-layout-v1:";

export type PageShellLayoutStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const PAGE_SHELL_SPAN_OPTIONS = [6, 7, 8, 9, 10, 11, 12] as const;
export type PageShellSpan = typeof PAGE_SHELL_SPAN_OPTIONS[number];

export type PageShellSize = {
  minHeight: number | null;
  span: PageShellSpan;
};

export type PageShellSizeDefaults = Readonly<Record<string, PageShellSize>>;

export type PageShellLayoutPreference = {
  order: string[];
  sizes: Record<string, PageShellSize>;
};

const DEFAULT_PAGE_SHELL_SIZE: PageShellSize = { minHeight: null, span: 12 };
const FITNESS_HALF_SIZE: PageShellSize = { minHeight: null, span: 6 };

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

export const HEALTH_PAGE_SHELL_SIZE_DEFAULTS: Record<HealthPageShellTab, PageShellSizeDefaults> = {
  Today: {
    "today-snapshot": DEFAULT_PAGE_SHELL_SIZE,
    "today-quick-log": DEFAULT_PAGE_SHELL_SIZE,
    "today-timeline": DEFAULT_PAGE_SHELL_SIZE,
  },
  Food: {
    "food-meal-log": FITNESS_HALF_SIZE,
    "food-daily-totals": FITNESS_HALF_SIZE,
    "food-library": DEFAULT_PAGE_SHELL_SIZE,
  },
  Water: {
    "water-log": FITNESS_HALF_SIZE,
    "water-history": FITNESS_HALF_SIZE,
  },
  Fitness: {
    "fitness-active-workout": DEFAULT_PAGE_SHELL_SIZE,
    "fitness-today": FITNESS_HALF_SIZE,
    "fitness-week": FITNESS_HALF_SIZE,
    "fitness-goals": DEFAULT_PAGE_SHELL_SIZE,
    "fitness-plans": DEFAULT_PAGE_SHELL_SIZE,
    "fitness-workout-history": DEFAULT_PAGE_SHELL_SIZE,
  },
  Journal: {
    "journal-entry-history": DEFAULT_PAGE_SHELL_SIZE,
    "journal-library": DEFAULT_PAGE_SHELL_SIZE,
    "journal-feeling-trends": DEFAULT_PAGE_SHELL_SIZE,
  },
  Weight: {
    "weight-entry": FITNESS_HALF_SIZE,
    "weight-trend": FITNESS_HALF_SIZE,
  },
  Sleep: {
    "sleep-ledger": FITNESS_HALF_SIZE,
    "sleep-entry-and-sources": FITNESS_HALF_SIZE,
  },
  Insights: {
    "insights-import": FITNESS_HALF_SIZE,
    "insights-trends": FITNESS_HALF_SIZE,
  },
  Awards: {
    "awards-content": DEFAULT_PAGE_SHELL_SIZE,
  },
  Settings: {
    "settings-content": DEFAULT_PAGE_SHELL_SIZE,
  },
};

export const STATS_PAGE_SHELL_IDS = [
  "stats-overview",
  "stats-economy",
  "stats-productivity",
  "stats-achievements",
  "stats-energy",
] as const;

export const STATS_PAGE_SHELL_SIZE_DEFAULTS: PageShellSizeDefaults = Object.fromEntries(
  STATS_PAGE_SHELL_IDS.map((id) => [id, DEFAULT_PAGE_SHELL_SIZE]),
);

export const FOCUS_PAGE_SHELL_IDS = [
  "focus-timer-workspace",
  "focus-goals",
  "focus-counter-history",
  "focus-history",
] as const;

export const FOCUS_PAGE_SHELL_SIZE_DEFAULTS: PageShellSizeDefaults = Object.fromEntries(
  FOCUS_PAGE_SHELL_IDS.map((id) => [id, DEFAULT_PAGE_SHELL_SIZE]),
);

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

export function reorderPageShellOrderAt(order: readonly string[], sourceId: string, insertionIndex: number) {
  if (!order.includes(sourceId)) return [...order];
  const withoutSource = order.filter((id) => id !== sourceId);
  const safeIndex = Math.max(0, Math.min(Math.round(insertionIndex), withoutSource.length));
  withoutSource.splice(safeIndex, 0, sourceId);
  return withoutSource;
}

export type PageShellGeometry = {
  bottom: number;
  id: string;
  left: number;
  right: number;
  top: number;
};

export const PAGE_SHELL_POINTER_HYSTERESIS_PX = 8;

/**
 * Returns an insertion boundary in the order after the dragged shell is removed.
 * The geometry is captured at pointer-down and remains stable for the drag.
 */
export function getPageShellInsertionIndex(
  geometries: readonly PageShellGeometry[],
  order: readonly string[],
  sourceId: string,
  pointerX: number,
  pointerY: number,
) {
  const orderWithoutSource = order.filter((id) => id !== sourceId);
  const rows: Array<{ bottom: number; centerY: number; items: PageShellGeometry[]; top: number }> = [];
  const sorted = geometries
    .filter((geometry) => geometry.id !== sourceId && orderWithoutSource.includes(geometry.id))
    .sort((left, right) => left.top - right.top || left.left - right.left);

  for (const geometry of sorted) {
    const row = rows.find((candidate) => geometry.top <= candidate.bottom + PAGE_SHELL_POINTER_HYSTERESIS_PX * 2 && geometry.bottom >= candidate.top - PAGE_SHELL_POINTER_HYSTERESIS_PX * 2);
    if (row) {
      row.items.push(geometry);
      row.top = Math.min(row.top, geometry.top);
      row.bottom = Math.max(row.bottom, geometry.bottom);
      row.centerY = (row.top + row.bottom) / 2;
    } else {
      rows.push({ bottom: geometry.bottom, centerY: (geometry.top + geometry.bottom) / 2, items: [geometry], top: geometry.top });
    }
  }
  rows.sort((left, right) => left.top - right.top);
  rows.forEach((row) => row.items.sort((left, right) => left.left - right.left));

  if (rows.length === 0) return 0;
  const firstItemIndex = orderWithoutSource.indexOf(rows[0].items[0].id);
  if (pointerY < rows[0].top - PAGE_SHELL_POINTER_HYSTERESIS_PX) return Math.max(0, firstItemIndex);
  const lastRow = rows[rows.length - 1];
  if (pointerY > lastRow.bottom + PAGE_SHELL_POINTER_HYSTERESIS_PX) return orderWithoutSource.length;

  const row = rows.reduce((closest, candidate) => (
    Math.abs(candidate.centerY - pointerY) < Math.abs(closest.centerY - pointerY) ? candidate : closest
  ));
  const rowStart = orderWithoutSource.indexOf(row.items[0].id);
  const nextItem = row.items.find((item) => pointerX < (item.left + item.right) / 2 - PAGE_SHELL_POINTER_HYSTERESIS_PX);
  if (nextItem) return Math.max(0, rowStart + row.items.indexOf(nextItem));
  const lastItemIndex = orderWithoutSource.indexOf(row.items[row.items.length - 1].id);
  return Math.min(orderWithoutSource.length, lastItemIndex + 1);
}

export function normalizePageShellSpan(value: unknown, fallback: PageShellSpan = DEFAULT_PAGE_SHELL_SIZE.span): PageShellSpan {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return PAGE_SHELL_SPAN_OPTIONS.reduce((closest, option) => (
    Math.abs(option - value) < Math.abs(closest - value) ? option : closest
  ), fallback);
}

const PAGE_SHELL_HEIGHT_SNAP = 48;

export function normalizePageShellSize(stored: unknown, fallback: PageShellSize = DEFAULT_PAGE_SHELL_SIZE): PageShellSize {
  const source = stored && typeof stored === "object" && !Array.isArray(stored) ? stored as Record<string, unknown> : {};
  let minHeight = fallback.minHeight;
  if (Object.prototype.hasOwnProperty.call(source, "minHeight")) {
    if (source.minHeight === null) {
      minHeight = null;
    } else if (typeof source.minHeight === "number" && Number.isFinite(source.minHeight) && source.minHeight > 0) {
      minHeight = Math.max(PAGE_SHELL_HEIGHT_SNAP, Math.round(source.minHeight / PAGE_SHELL_HEIGHT_SNAP) * PAGE_SHELL_HEIGHT_SNAP);
    }
  }
  return {
    minHeight,
    span: normalizePageShellSpan(source.span, normalizePageShellSpan(fallback.span)),
  };
}

export function getDefaultPageShellSizes(defaults: readonly string[], overrides: PageShellSizeDefaults = {}) {
  return defaults.reduce<Record<string, PageShellSize>>((sizes, id) => {
    if (typeof id === "string" && id.length > 0) {
      sizes[id] = normalizePageShellSize(overrides[id]);
    }
    return sizes;
  }, {});
}

function isPageShellLayoutPreference(value: unknown): value is { order?: unknown; sizes?: unknown } {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function normalizePageShellLayout(
  stored: unknown,
  defaults: readonly string[],
  defaultSizes: PageShellSizeDefaults = {},
): PageShellLayoutPreference {
  const storedOrder = Array.isArray(stored)
    ? stored
    : isPageShellLayoutPreference(stored)
      ? stored.order
      : undefined;
  const storedSizes = isPageShellLayoutPreference(stored) && stored.sizes && typeof stored.sizes === "object" && !Array.isArray(stored.sizes)
    ? stored.sizes as Record<string, unknown>
    : {};
  const order = normalizePageShellOrder(storedOrder, defaults);
  const sizes = getDefaultPageShellSizes(order, defaultSizes);
  for (const id of order) {
    sizes[id] = normalizePageShellSize(storedSizes[id], sizes[id]);
  }
  return { order, sizes };
}

function readStoredPageShellLayouts(storage: PageShellLayoutStorage, storageKey: string) {
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function readPageShellLayout(
  storage: PageShellLayoutStorage,
  storageKey: string,
  pageKey: string,
  defaults: readonly string[],
  defaultSizes: PageShellSizeDefaults = {},
) {
  return normalizePageShellLayout(readStoredPageShellLayouts(storage, storageKey)[pageKey], defaults, defaultSizes);
}

export function writePageShellLayout(
  storage: PageShellLayoutStorage,
  storageKey: string,
  pageKey: string,
  layout: PageShellLayoutPreference,
) {
  try {
    const layouts = readStoredPageShellLayouts(storage, storageKey);
    layouts[pageKey] = { order: [...layout.order], sizes: { ...layout.sizes } };
    storage.setItem(storageKey, JSON.stringify(layouts));
  } catch {
    // Storage can be unavailable in private browsing or a restricted WebView.
  }
}

export function removePageShellLayout(storage: PageShellLayoutStorage, storageKey: string, pageKey: string) {
  try {
    const layouts = readStoredPageShellLayouts(storage, storageKey);
    delete layouts[pageKey];
    if (Object.keys(layouts).length === 0) {
      storage.removeItem(storageKey);
    } else {
      storage.setItem(storageKey, JSON.stringify(layouts));
    }
  } catch {
    // Reset remains an in-memory operation when storage is unavailable.
  }
}
