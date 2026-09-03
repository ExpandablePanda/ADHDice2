export const PAGE_SHELL_LAYOUT_STORAGE_PREFIX = "adhdice-page-shell-layout-v1:";

export type PageShellLayoutStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const PAGE_SHELL_SPAN_OPTIONS = [6, 7, 8, 9, 10, 11, 12] as const;
export type PageShellSpan = typeof PAGE_SHELL_SPAN_OPTIONS[number];

export type PageShellSize = {
  heightPx: number | null;
  span: PageShellSpan;
};

export type PageShellSizeDefaults = Readonly<Record<string, PageShellSize>>;

export type PageShellLayoutPreference = {
  order: string[];
  sizes: Record<string, PageShellSize>;
};

export type PageShellLegacyIdReplacements = Readonly<Record<string, readonly string[]>>;

const PAGE_SHELL_LEGACY_ID_REPLACEMENTS: Readonly<Record<string, PageShellLegacyIdReplacements>> = {
  focus: {
    "focus-history": ["focus-activity-summary", "focus-activity-trend"],
  },
};

const DEFAULT_PAGE_SHELL_SIZE: PageShellSize = { heightPx: null, span: 12 };
const FITNESS_HALF_SIZE: PageShellSize = { heightPx: null, span: 6 };

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
  "focus-activity-summary",
  "focus-activity-trend",
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

export function normalizePageShellOrder(
  stored: unknown,
  defaults: readonly string[],
  legacyIdReplacements: PageShellLegacyIdReplacements = {},
) {
  const defaultIds = [...new Set(defaults.filter((id): id is string => typeof id === "string" && id.length > 0))];
  if (!Array.isArray(stored)) {
    return defaultIds;
  }
  const validIds = new Set(defaultIds);
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const storedId of stored) {
    if (typeof storedId !== "string") continue;
    const replacementIds = legacyIdReplacements[storedId] ?? [storedId];
    for (const id of replacementIds) {
      if (!validIds.has(id) || seen.has(id)) continue;
      seen.add(id);
      normalized.push(id);
    }
  }
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

/**
 * Replaces only the currently visible semantic slots in a full page order.
 * Hidden shells keep their saved positions so they can reappear predictably.
 */
export function mergeVisiblePageShellOrder(
  fullOrder: readonly string[],
  visibleOrder: readonly string[],
  visibleShellIds: readonly string[],
) {
  const visibleIds = new Set(visibleShellIds);
  const nextVisibleOrder: string[] = [];
  const seenVisibleIds = new Set<string>();
  for (const id of [...visibleOrder, ...fullOrder, ...visibleShellIds]) {
    if (visibleIds.has(id) && !seenVisibleIds.has(id)) {
      seenVisibleIds.add(id);
      nextVisibleOrder.push(id);
    }
  }

  const merged: string[] = [];
  let nextVisibleIndex = 0;
  for (const id of fullOrder) {
    if (visibleIds.has(id)) {
      merged.push(nextVisibleOrder[nextVisibleIndex] ?? id);
      nextVisibleIndex += 1;
    } else {
      merged.push(id);
    }
  }
  return [...merged, ...nextVisibleOrder.slice(nextVisibleIndex)];
}

export function projectVisiblePageShellOrder(fullOrder: readonly string[], visibleShellIds: readonly string[]) {
  const visibleIds = new Set(visibleShellIds);
  const seen = new Set<string>();
  return fullOrder.filter((id) => {
    if (!visibleIds.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export type PageShellGeometry = {
  bottom: number;
  id: string;
  left: number;
  right: number;
  top: number;
};

export const PAGE_SHELL_POINTER_HYSTERESIS_PX = 8;
export const PAGE_SHELL_ROW_ALIGNMENT_PX = 12;
export const PAGE_SHELL_DRAG_AUTO_SCROLL_EDGE_PX = 80;
export const PAGE_SHELL_DRAG_AUTO_SCROLL_MAX_PX = 18;

export function getPageShellDragAutoScrollDelta(
  pointerY: number,
  viewportHeight: number,
  scrollTop: number,
  scrollHeight: number,
) {
  const maxScrollTop = Math.max(0, scrollHeight - viewportHeight);
  if (maxScrollTop <= 0) return 0;
  if (pointerY < PAGE_SHELL_DRAG_AUTO_SCROLL_EDGE_PX && scrollTop > 0) {
    const strength = Math.min(1, Math.max(0, (PAGE_SHELL_DRAG_AUTO_SCROLL_EDGE_PX - pointerY) / PAGE_SHELL_DRAG_AUTO_SCROLL_EDGE_PX));
    return -Math.min(scrollTop, Math.max(1, Math.round(strength * PAGE_SHELL_DRAG_AUTO_SCROLL_MAX_PX)));
  }
  const distanceFromBottom = viewportHeight - pointerY;
  if (distanceFromBottom < PAGE_SHELL_DRAG_AUTO_SCROLL_EDGE_PX && scrollTop < maxScrollTop) {
    const strength = Math.min(1, Math.max(0, (PAGE_SHELL_DRAG_AUTO_SCROLL_EDGE_PX - distanceFromBottom) / PAGE_SHELL_DRAG_AUTO_SCROLL_EDGE_PX));
    return Math.min(maxScrollTop - scrollTop, Math.max(1, Math.round(strength * PAGE_SHELL_DRAG_AUTO_SCROLL_MAX_PX)));
  }
  return 0;
}

function verticalOverlap(left: PageShellGeometry, right: PageShellGeometry) {
  return Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
}

function geometriesSharePageShellRow(left: PageShellGeometry, right: PageShellGeometry) {
  const minimumHeight = Math.min(left.bottom - left.top, right.bottom - right.top);
  return Math.abs(left.top - right.top) <= PAGE_SHELL_ROW_ALIGNMENT_PX
    || (minimumHeight > 0 && verticalOverlap(left, right) / minimumHeight >= 0.5);
}

type PageShellInsertionBoundary = {
  axis: "x" | "y";
  value: number;
};

function getPageShellInsertionBoundary(
  geometriesById: ReadonlyMap<string, PageShellGeometry>,
  orderWithoutSource: readonly string[],
  insertionIndex: number,
): PageShellInsertionBoundary | null {
  const before = insertionIndex > 0 ? geometriesById.get(orderWithoutSource[insertionIndex - 1]) : undefined;
  const after = insertionIndex < orderWithoutSource.length ? geometriesById.get(orderWithoutSource[insertionIndex]) : undefined;
  if (!before && !after) return null;
  if (!before) return after ? { axis: "y", value: after.top } : null;
  if (!after) return { axis: "y", value: (before.top + before.bottom) / 2 };
  if (geometriesSharePageShellRow(before, after)) {
    return { axis: "x", value: (before.right + after.left) / 2 };
  }
  return {
    axis: "y",
    value: ((before.top + before.bottom) / 2 + (after.top + after.bottom) / 2) / 2,
  };
}

function stabilizePageShellInsertionIndex(
  candidate: number,
  previous: number | undefined,
  geometriesById: ReadonlyMap<string, PageShellGeometry>,
  orderWithoutSource: readonly string[],
  pointerX: number,
  pointerY: number,
) {
  if (previous === undefined || orderWithoutSource.length === 0) return candidate;
  let stable = Math.max(0, Math.min(previous, orderWithoutSource.length));
  const safeCandidate = Math.max(0, Math.min(candidate, orderWithoutSource.length));
  while (stable < safeCandidate) {
    const boundary = getPageShellInsertionBoundary(geometriesById, orderWithoutSource, stable + 1);
    if (!boundary) break;
    const pointer = boundary.axis === "x" ? pointerX : pointerY;
    if (pointer <= boundary.value + PAGE_SHELL_POINTER_HYSTERESIS_PX) break;
    stable += 1;
  }
  while (stable > safeCandidate) {
    const boundary = getPageShellInsertionBoundary(geometriesById, orderWithoutSource, stable);
    if (!boundary) break;
    const pointer = boundary.axis === "x" ? pointerX : pointerY;
    if (pointer >= boundary.value - PAGE_SHELL_POINTER_HYSTERESIS_PX) break;
    stable -= 1;
  }
  return stable;
}

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
  previousInsertionIndex?: number,
) {
  const orderWithoutSource = order.filter((id) => id !== sourceId);
  const rows: Array<{ bottom: number; centerY: number; items: PageShellGeometry[]; top: number }> = [];
  const sorted = geometries
    .filter((geometry) => geometry.id !== sourceId && orderWithoutSource.includes(geometry.id))
    .sort((left, right) => left.top - right.top || left.left - right.left);

  for (const geometry of sorted) {
    const row = rows.find((candidate) => candidate.items.some((item) => geometriesSharePageShellRow(item, geometry)));
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
  const geometriesById = new Map(sorted.map((geometry) => [geometry.id, geometry]));
  const sourceGeometry = geometries.find((geometry) => geometry.id === sourceId);
  const sourceSharesRowWithAnotherShell = Boolean(sourceGeometry && geometries.some((geometry) => (
    geometry.id !== sourceId && geometriesSharePageShellRow(sourceGeometry, geometry)
  )));
  if (rows.every((row) => row.items.length === 1) && !sourceSharesRowWithAnotherShell) {
    let candidate = 0;
    for (const row of rows) {
      const rowIndex = orderWithoutSource.indexOf(row.items[0].id);
      if (pointerY >= row.centerY) candidate = Math.max(candidate, rowIndex + 1);
    }
    return stabilizePageShellInsertionIndex(candidate, previousInsertionIndex, geometriesById, orderWithoutSource, pointerX, pointerY);
  }
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

export const PAGE_SHELL_HEIGHT_SNAP = 48;
export const PAGE_SHELL_MIN_HEIGHT = 144;

export function snapPageShellHeight(value: number) {
  const snapped = Math.max(PAGE_SHELL_MIN_HEIGHT, Math.round(value / PAGE_SHELL_HEIGHT_SNAP) * PAGE_SHELL_HEIGHT_SNAP);
  return snapped;
}

function normalizePageShellHeight(value: unknown, fallback: number | null) {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback;
  const snapped = Math.round(value / PAGE_SHELL_HEIGHT_SNAP) * PAGE_SHELL_HEIGHT_SNAP;
  return Math.max(PAGE_SHELL_MIN_HEIGHT, snapped);
}

export function normalizePageShellSize(stored: unknown, fallback: PageShellSize = DEFAULT_PAGE_SHELL_SIZE): PageShellSize {
  const source = stored && typeof stored === "object" && !Array.isArray(stored) ? stored as Record<string, unknown> : {};
  const storedHeight = Object.prototype.hasOwnProperty.call(source, "heightPx")
    ? source.heightPx
    : source.minHeight;
  return {
    heightPx: normalizePageShellHeight(storedHeight, fallback.heightPx),
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
  legacyIdReplacements: PageShellLegacyIdReplacements = {},
): PageShellLayoutPreference {
  const storedOrder = Array.isArray(stored)
    ? stored
    : isPageShellLayoutPreference(stored)
      ? stored.order
      : undefined;
  const storedSizes = isPageShellLayoutPreference(stored) && stored.sizes && typeof stored.sizes === "object" && !Array.isArray(stored.sizes)
    ? stored.sizes as Record<string, unknown>
    : {};
  const order = normalizePageShellOrder(storedOrder, defaults, legacyIdReplacements);
  const sizes = getDefaultPageShellSizes(order, defaultSizes);
  for (const id of order) {
    const legacyId = Object.entries(legacyIdReplacements).find(([, replacementIds]) => replacementIds.includes(id))?.[0];
    sizes[id] = normalizePageShellSize(storedSizes[id] ?? (legacyId ? storedSizes[legacyId] : undefined), sizes[id]);
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
  return normalizePageShellLayout(
    readStoredPageShellLayouts(storage, storageKey)[pageKey],
    defaults,
    defaultSizes,
    PAGE_SHELL_LEGACY_ID_REPLACEMENTS[pageKey],
  );
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
