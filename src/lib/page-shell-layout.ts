export const PAGE_SHELL_LAYOUT_STORAGE_PREFIX = "adhdice-page-shell-layout-v1:";
export const PAGE_SHELL_VIEWS_STORAGE_PREFIX = "adhdice-page-shell-views-v1:";
export const PAGE_SHELL_VIEWS_SCHEMA_VERSION = 1;
export const PAGE_SHELL_EXPORT_SCHEMA = "adhdice-page-shell-layouts";
export const PAGE_SHELL_EXPORT_SCHEMA_VERSION = 1;

export type PageShellLayoutStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const PAGE_SHELL_SPAN_OPTIONS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export type PageShellSpan = typeof PAGE_SHELL_SPAN_OPTIONS[number];

export type PageShellSize = {
  heightPx: number | null;
  span: PageShellSpan;
};

export type PageShellSizeDefaults = Readonly<Record<string, PageShellSize>>;

export type PageShellCanonicalGroup = {
  className?: string;
  shellIds: readonly string[];
};

export type PageShellCanonicalLayout = {
  gridClassName?: string;
  groups?: readonly PageShellCanonicalGroup[];
  order: readonly string[];
  shellClassNames?: Readonly<Record<string, string>>;
  sizes: PageShellSizeDefaults;
};

export type PageShellLayoutPreference = {
  order: string[];
  sizes: Record<string, PageShellSize>;
};

export type PageShellViewTarget = "web" | "iphone";

export type PageShellViewport = {
  height: number;
  width: number;
};

export type PageShellView = {
  createdAt: string;
  id: string;
  layout?: PageShellLayoutPreference;
  name: string;
  pageKey: string;
  presentation: "canonical" | "custom";
  target: PageShellViewTarget;
  viewport: PageShellViewport;
};

export type PageShellRegisteredPage = {
  canonicalLayout: PageShellCanonicalLayout;
  pageKey: string;
};

export type PageShellLayoutExport = {
  appVersion: string;
  exportedAt: string;
  pages: Array<{
    layout?: PageShellLayoutPreference;
    pageKey: string;
    presentation: "canonical" | "custom";
  }>;
  schema: typeof PAGE_SHELL_EXPORT_SCHEMA;
  schemaVersion: typeof PAGE_SHELL_EXPORT_SCHEMA_VERSION;
  views: PageShellView[];
};

export type PageShellLegacyIdReplacements = Readonly<Record<string, readonly string[]>>;

const PAGE_SHELL_LEGACY_ID_REPLACEMENTS: Readonly<Record<string, PageShellLegacyIdReplacements>> = {
  focus: {
    "focus-history": ["focus-activity-summary", "focus-activity-trend"],
  },
  "health:food": {
    "food-daily-totals": ["food-daily-totals", "food-favorites-recent"],
  },
  "health:sleep": {
    "sleep-entry-and-sources": ["sleep-log", "sleep-sources", "sleep-focus-ledger"],
  },
  "health:water": {
    "water-history": ["water-pending", "water-today", "water-history"],
  },
};

const NATURAL_PAGE_SHELL_SIZE: PageShellSize = { heightPx: null, span: 12 };
const CANONICAL_PAGE_SHELL_SIZE = (span: PageShellSpan): PageShellSize => ({ heightPx: null, span });

function canonicalLayout(
  order: readonly string[],
  sizes: PageShellSizeDefaults,
  options: Omit<PageShellCanonicalLayout, "order" | "sizes"> = {},
): PageShellCanonicalLayout {
  return { ...options, order, sizes };
}

export const HEALTH_PAGE_SHELL_IDS = {
  Today: ["today-snapshot", "today-quick-log", "today-timeline"],
  Food: ["food-meal-log", "food-daily-totals", "food-favorites-recent", "food-library"],
  Water: ["water-log", "water-pending", "water-today", "water-history"],
  Fitness: ["fitness-active-workout", "fitness-today", "fitness-week", "fitness-goals", "fitness-plans", "fitness-workout-history"],
  Journal: ["journal-entry-history", "journal-library", "journal-feeling-trends"],
  Weight: ["weight-entry", "weight-trend"],
  Sleep: ["sleep-ledger", "sleep-log", "sleep-sources", "sleep-focus-ledger"],
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
  "focus-activity-summary",
  "focus-activity-trend",
] as const;

export const HOME_PAGE_SHELL_IDS = ["home-todo"] as const;

export const SETTINGS_PAGE_SHELL_IDS = [
  "settings-appearance",
  "settings-day-reset",
  "settings-economy",
  "settings-import-export",
] as const;

export const NOTES_PAGE_SHELL_IDS = ["notes-scratch-paper", "notes-library"] as const;

export const TEST_PAGE_SHELL_IDS = ["test-d20-sandbox", "test-d20-controls"] as const;

export const HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS: Record<HealthPageShellTab, PageShellCanonicalLayout> = {
  Today: canonicalLayout(HEALTH_PAGE_SHELL_IDS.Today, {
    "today-snapshot": NATURAL_PAGE_SHELL_SIZE,
    "today-quick-log": NATURAL_PAGE_SHELL_SIZE,
    "today-timeline": NATURAL_PAGE_SHELL_SIZE,
  }),
  Food: canonicalLayout(HEALTH_PAGE_SHELL_IDS.Food, {
    "food-meal-log": CANONICAL_PAGE_SHELL_SIZE(7),
    "food-daily-totals": CANONICAL_PAGE_SHELL_SIZE(5),
    "food-favorites-recent": CANONICAL_PAGE_SHELL_SIZE(5),
    "food-library": NATURAL_PAGE_SHELL_SIZE,
  }, {
    gridClassName: "xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]",
    groups: [
      { className: "xl:col-start-1 xl:col-end-2", shellIds: ["food-meal-log"] },
      { className: "grid gap-5 xl:col-start-2 xl:col-end-3", shellIds: ["food-daily-totals", "food-favorites-recent"] },
      { className: "xl:col-span-full", shellIds: ["food-library"] },
    ],
  }),
  Water: canonicalLayout(HEALTH_PAGE_SHELL_IDS.Water, {
    "water-log": CANONICAL_PAGE_SHELL_SIZE(5),
    "water-pending": CANONICAL_PAGE_SHELL_SIZE(7),
    "water-today": CANONICAL_PAGE_SHELL_SIZE(7),
    "water-history": CANONICAL_PAGE_SHELL_SIZE(7),
  }, {
    gridClassName: "xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]",
    groups: [
      { className: "xl:col-start-1 xl:col-end-2", shellIds: ["water-log"] },
      { className: "grid gap-5 xl:col-start-2 xl:col-end-3", shellIds: ["water-pending", "water-today", "water-history"] },
    ],
  }),
  Fitness: canonicalLayout(HEALTH_PAGE_SHELL_IDS.Fitness, {
    "fitness-active-workout": NATURAL_PAGE_SHELL_SIZE,
    "fitness-today": CANONICAL_PAGE_SHELL_SIZE(7),
    "fitness-week": CANONICAL_PAGE_SHELL_SIZE(5),
    "fitness-goals": NATURAL_PAGE_SHELL_SIZE,
    "fitness-plans": NATURAL_PAGE_SHELL_SIZE,
    "fitness-workout-history": NATURAL_PAGE_SHELL_SIZE,
  }, {
    gridClassName: "xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]",
    shellClassNames: {
      "fitness-active-workout": "xl:col-span-full",
      "fitness-today": "xl:col-start-1 xl:col-end-2",
      "fitness-week": "xl:col-start-2 xl:col-end-3",
      "fitness-goals": "xl:col-span-full",
      "fitness-plans": "xl:col-span-full",
      "fitness-workout-history": "xl:col-span-full",
    },
  }),
  Journal: canonicalLayout(HEALTH_PAGE_SHELL_IDS.Journal, {
    "journal-entry-history": NATURAL_PAGE_SHELL_SIZE,
    "journal-library": NATURAL_PAGE_SHELL_SIZE,
    "journal-feeling-trends": NATURAL_PAGE_SHELL_SIZE,
  }),
  Weight: canonicalLayout(HEALTH_PAGE_SHELL_IDS.Weight, {
    "weight-entry": CANONICAL_PAGE_SHELL_SIZE(6),
    "weight-trend": CANONICAL_PAGE_SHELL_SIZE(6),
  }, {
    gridClassName: "xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]",
    shellClassNames: {
      "weight-entry": "xl:col-start-1 xl:col-end-2",
      "weight-trend": "xl:col-start-2 xl:col-end-3",
    },
  }),
  Sleep: canonicalLayout(["sleep-ledger", "sleep-log", "sleep-focus-ledger", "sleep-sources"], {
    "sleep-ledger": CANONICAL_PAGE_SHELL_SIZE(6),
    "sleep-log": CANONICAL_PAGE_SHELL_SIZE(6),
    "sleep-focus-ledger": CANONICAL_PAGE_SHELL_SIZE(6),
    "sleep-sources": CANONICAL_PAGE_SHELL_SIZE(6),
  }, {
    gridClassName: "xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]",
    groups: [
      { className: "xl:col-start-1 xl:col-end-2", shellIds: ["sleep-ledger"] },
      { className: "grid gap-5 xl:col-start-2 xl:col-end-3", shellIds: ["sleep-log", "sleep-focus-ledger", "sleep-sources"] },
    ],
  }),
  Insights: canonicalLayout(HEALTH_PAGE_SHELL_IDS.Insights, {
    "insights-import": CANONICAL_PAGE_SHELL_SIZE(6),
    "insights-trends": CANONICAL_PAGE_SHELL_SIZE(6),
  }, {
    gridClassName: "xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]",
    shellClassNames: {
      "insights-import": "xl:col-start-1 xl:col-end-2",
      "insights-trends": "xl:col-start-2 xl:col-end-3",
    },
  }),
  Awards: canonicalLayout(HEALTH_PAGE_SHELL_IDS.Awards, {
    "awards-content": NATURAL_PAGE_SHELL_SIZE,
  }),
  Settings: canonicalLayout(HEALTH_PAGE_SHELL_IDS.Settings, {
    "settings-content": NATURAL_PAGE_SHELL_SIZE,
  }),
};

export const STATS_PAGE_SHELL_CANONICAL_LAYOUT: PageShellCanonicalLayout = canonicalLayout(STATS_PAGE_SHELL_IDS, Object.fromEntries(
  STATS_PAGE_SHELL_IDS.map((id) => [id, NATURAL_PAGE_SHELL_SIZE]),
));

export const FOCUS_PAGE_SHELL_CANONICAL_LAYOUT: PageShellCanonicalLayout = canonicalLayout(FOCUS_PAGE_SHELL_IDS, Object.fromEntries(
  FOCUS_PAGE_SHELL_IDS.map((id) => [id, NATURAL_PAGE_SHELL_SIZE]),
));

export const HOME_PAGE_SHELL_CANONICAL_LAYOUT: PageShellCanonicalLayout = canonicalLayout(HOME_PAGE_SHELL_IDS, {
  "home-todo": NATURAL_PAGE_SHELL_SIZE,
});

export const SETTINGS_PAGE_SHELL_CANONICAL_LAYOUT: PageShellCanonicalLayout = canonicalLayout(SETTINGS_PAGE_SHELL_IDS, Object.fromEntries(
  SETTINGS_PAGE_SHELL_IDS.map((id) => [id, NATURAL_PAGE_SHELL_SIZE]),
));

export const NOTES_PAGE_SHELL_CANONICAL_LAYOUT: PageShellCanonicalLayout = canonicalLayout(NOTES_PAGE_SHELL_IDS, Object.fromEntries(
  NOTES_PAGE_SHELL_IDS.map((id) => [id, NATURAL_PAGE_SHELL_SIZE]),
));

export const TEST_PAGE_SHELL_CANONICAL_LAYOUT: PageShellCanonicalLayout = canonicalLayout(TEST_PAGE_SHELL_IDS, {
  "test-d20-sandbox": CANONICAL_PAGE_SHELL_SIZE(7),
  "test-d20-controls": CANONICAL_PAGE_SHELL_SIZE(5),
}, {
  gridClassName: "xl:grid-cols-[minmax(0,0.56fr)_minmax(20rem,0.44fr)]",
});

const PAGE_SHELL_PAGE_REGISTRY = new Map<string, PageShellRegisteredPage>();

export function registerPageShellPage(pageKey: string, canonicalLayout: PageShellCanonicalLayout) {
  if (!pageKey.trim()) return;
  PAGE_SHELL_PAGE_REGISTRY.set(pageKey, {
    canonicalLayout,
    pageKey,
  });
}

export function getRegisteredPageShellPages() {
  return [...PAGE_SHELL_PAGE_REGISTRY.values()];
}

for (const [tab, layout] of Object.entries(HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS) as Array<[HealthPageShellTab, PageShellCanonicalLayout]>) {
  registerPageShellPage(getHealthPageShellKey(tab), layout);
}
registerPageShellPage("stats", STATS_PAGE_SHELL_CANONICAL_LAYOUT);
registerPageShellPage("focus", FOCUS_PAGE_SHELL_CANONICAL_LAYOUT);
registerPageShellPage("home", HOME_PAGE_SHELL_CANONICAL_LAYOUT);
registerPageShellPage("settings", SETTINGS_PAGE_SHELL_CANONICAL_LAYOUT);
registerPageShellPage("notes", NOTES_PAGE_SHELL_CANONICAL_LAYOUT);
registerPageShellPage("test", TEST_PAGE_SHELL_CANONICAL_LAYOUT);

/**
 * 12-column editing fallbacks are derived from the canonical layouts. The
 * canonical layouts above remain the source of truth for the no-preference
 * presentation and Reset Layout behavior.
 */
export const HEALTH_PAGE_SHELL_SIZE_DEFAULTS: Record<HealthPageShellTab, PageShellSizeDefaults> = Object.fromEntries(
  Object.entries(HEALTH_PAGE_SHELL_CANONICAL_LAYOUTS).map(([tab, layout]) => [tab, layout.sizes]),
) as Record<HealthPageShellTab, PageShellSizeDefaults>;

export const STATS_PAGE_SHELL_SIZE_DEFAULTS: PageShellSizeDefaults = STATS_PAGE_SHELL_CANONICAL_LAYOUT.sizes;
export const FOCUS_PAGE_SHELL_SIZE_DEFAULTS: PageShellSizeDefaults = FOCUS_PAGE_SHELL_CANONICAL_LAYOUT.sizes;
export const HOME_PAGE_SHELL_SIZE_DEFAULTS: PageShellSizeDefaults = HOME_PAGE_SHELL_CANONICAL_LAYOUT.sizes;
export const SETTINGS_PAGE_SHELL_SIZE_DEFAULTS: PageShellSizeDefaults = SETTINGS_PAGE_SHELL_CANONICAL_LAYOUT.sizes;
export const NOTES_PAGE_SHELL_SIZE_DEFAULTS: PageShellSizeDefaults = NOTES_PAGE_SHELL_CANONICAL_LAYOUT.sizes;
export const TEST_PAGE_SHELL_SIZE_DEFAULTS: PageShellSizeDefaults = TEST_PAGE_SHELL_CANONICAL_LAYOUT.sizes;

export function getHealthPageShellKey(tab: HealthPageShellTab) {
  return `health:${tab.toLowerCase()}`;
}

export function getPageShellLayoutStorageKey(userId: string) {
  return PAGE_SHELL_LAYOUT_STORAGE_PREFIX + userId;
}

export function getPageShellViewsStorageKey(userId: string) {
  return PAGE_SHELL_VIEWS_STORAGE_PREFIX + userId;
}

export function clonePageShellLayout(layout: PageShellLayoutPreference): PageShellLayoutPreference {
  return {
    order: [...layout.order],
    sizes: Object.fromEntries(Object.entries(layout.sizes).map(([id, size]) => [id, { ...size }])),
  };
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

export function normalizePageShellSpan(value: unknown, fallback: PageShellSpan = NATURAL_PAGE_SHELL_SIZE.span): PageShellSpan {
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

export function formatPageShellDimensions(span: PageShellSpan, heightPx: number | null, naturalHeight: number | null | undefined) {
  const formatHeight = (value: number | null | undefined) => value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : String(Math.round(value));
  return `W ${span}/12 · H ${formatHeight(heightPx ?? naturalHeight)}/${formatHeight(naturalHeight)}`;
}

function getSafePageShellNaturalHeight(naturalHeight: number) {
  return Number.isFinite(naturalHeight) && naturalHeight > 0 ? naturalHeight : PAGE_SHELL_MIN_HEIGHT;
}

/** Returns the smallest useful custom height without expanding a naturally short shell. */
export function getPageShellShrinkHeight(naturalHeight: number) {
  return Math.min(PAGE_SHELL_MIN_HEIGHT, getSafePageShellNaturalHeight(naturalHeight));
}

/** Snaps a manual resize while keeping the measured natural content height as its hard maximum. */
export function clampPageShellHeight(value: number, naturalHeight: number) {
  const safeValue = Number.isFinite(value) ? value : getSafePageShellNaturalHeight(naturalHeight);
  return Math.min(snapPageShellHeight(safeValue), getSafePageShellNaturalHeight(naturalHeight));
}

function normalizePageShellHeight(value: unknown, fallback: number | null) {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback;
  const snapped = Math.round(value / PAGE_SHELL_HEIGHT_SNAP) * PAGE_SHELL_HEIGHT_SNAP;
  return Math.max(PAGE_SHELL_MIN_HEIGHT, snapped);
}

export function normalizePageShellSize(stored: unknown, fallback: PageShellSize = NATURAL_PAGE_SHELL_SIZE): PageShellSize {
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

export function hasPageShellLayout(storage: PageShellLayoutStorage, storageKey: string, pageKey: string) {
  return Object.prototype.hasOwnProperty.call(readStoredPageShellLayouts(storage, storageKey), pageKey);
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

function normalizePageShellViewport(value: unknown): PageShellViewport {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const normalizeDimension = (candidate: unknown) => typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0
    ? Math.round(candidate)
    : 0;
  return {
    height: normalizeDimension(source.height),
    width: normalizeDimension(source.width),
  };
}

function normalizeStoredPageShellView(value: unknown): PageShellView | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const id = typeof source.id === "string" ? source.id.trim() : "";
  const name = typeof source.name === "string" ? source.name.trim() : "";
  const pageKey = typeof source.pageKey === "string" ? source.pageKey.trim() : "";
  const target = source.target === "iphone" || source.target === "web" ? source.target : null;
  const presentation = source.presentation === "canonical" || source.presentation === "custom" ? source.presentation : null;
  const createdAt = typeof source.createdAt === "string" && source.createdAt.trim() ? source.createdAt : "";
  if (!id || !name || !pageKey || !target || !presentation || !createdAt) return null;
  const view: PageShellView = {
    createdAt,
    id,
    name: name.slice(0, 120),
    pageKey,
    presentation,
    target,
    viewport: normalizePageShellViewport(source.viewport),
  };
  if (presentation === "custom") {
    const layout = source.layout && typeof source.layout === "object" && !Array.isArray(source.layout)
      ? source.layout as Record<string, unknown>
      : null;
    if (!layout) return null;
    const order = Array.isArray(layout.order) ? layout.order.filter((id): id is string => typeof id === "string" && id.trim().length > 0) : [];
    if (order.length === 0) return null;
    view.layout = normalizePageShellLayout(layout, order);
  }
  return view;
}

function readStoredPageShellViews(storage: PageShellLayoutStorage, storageKey: string) {
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    const source = parsed as Record<string, unknown>;
    if (source.version !== PAGE_SHELL_VIEWS_SCHEMA_VERSION || !Array.isArray(source.views)) return [];
    return source.views
      .map(normalizeStoredPageShellView)
      .filter((view): view is PageShellView => Boolean(view))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  } catch {
    return [];
  }
}

export function readPageShellViews(storage: PageShellLayoutStorage, storageKey: string, pageKey?: string) {
  const views = readStoredPageShellViews(storage, storageKey);
  return pageKey ? views.filter((view) => view.pageKey === pageKey) : views;
}

export function createPageShellViewId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `view-${crypto.randomUUID()}`;
  return `view-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getCurrentPageShellViewport(): PageShellViewport {
  if (typeof window === "undefined") return { height: 0, width: 0 };
  return { height: Math.max(0, Math.round(window.innerHeight)), width: Math.max(0, Math.round(window.innerWidth)) };
}

export function getPageShellExportFilename(date = new Date()) {
  return `adhdice-layout-templates-${date.toISOString().slice(0, 10)}.json`;
}

export function createPageShellView(input: Omit<PageShellView, "id"> & { id?: string }): PageShellView {
  const view: PageShellView = {
    ...input,
    id: input.id ?? createPageShellViewId(),
    name: input.name.trim().slice(0, 120),
    viewport: normalizePageShellViewport(input.viewport),
  };
  if (view.presentation === "custom" && input.layout) view.layout = clonePageShellLayout(input.layout);
  else delete view.layout;
  return view;
}

export function writePageShellView(storage: PageShellLayoutStorage, storageKey: string, view: PageShellView) {
  try {
    const views = readStoredPageShellViews(storage, storageKey).filter((candidate) => candidate.id !== view.id);
    views.unshift(createPageShellView(view));
    storage.setItem(storageKey, JSON.stringify({ version: PAGE_SHELL_VIEWS_SCHEMA_VERSION, views }));
  } catch {
    // Saved views remain available in memory when storage is unavailable.
  }
}

export function removePageShellView(storage: PageShellLayoutStorage, storageKey: string, viewId: string) {
  try {
    const views = readStoredPageShellViews(storage, storageKey).filter((view) => view.id !== viewId);
    if (views.length === 0) storage.removeItem(storageKey);
    else storage.setItem(storageKey, JSON.stringify({ version: PAGE_SHELL_VIEWS_SCHEMA_VERSION, views }));
  } catch {
    // Deletion remains an in-memory operation when storage is unavailable.
  }
}

export function resolvePageShellViewLayout(view: PageShellView, canonicalLayout: PageShellCanonicalLayout) {
  const canonical = normalizePageShellLayout(canonicalLayout, canonicalLayout.order, canonicalLayout.sizes);
  return view.presentation === "canonical"
    ? { layout: canonical, presentation: "canonical" as const }
    : { layout: normalizePageShellLayout(view.layout, canonical.order, canonical.sizes), presentation: "custom" as const };
}

export function buildPageShellLayoutExport({
  appVersion,
  currentLayout,
  currentPageKey,
  currentPresentation,
  exportedAt = new Date().toISOString(),
  registeredPages = getRegisteredPageShellPages(),
  savedViews,
  storage,
  storageKey,
  viewsStorageKey,
}: {
  appVersion: string;
  currentLayout: PageShellLayoutPreference;
  currentPageKey: string;
  currentPresentation: "canonical" | "custom";
  exportedAt?: string;
  registeredPages?: readonly PageShellRegisteredPage[];
  savedViews?: readonly PageShellView[];
  storage?: PageShellLayoutStorage;
  storageKey?: string | null;
  viewsStorageKey?: string | null;
}): PageShellLayoutExport {
  const pages = registeredPages.map(({ canonicalLayout, pageKey }) => {
    const isCurrentPage = pageKey === currentPageKey;
    const presentation = isCurrentPage
      ? currentPresentation
      : storage && storageKey && hasPageShellLayout(storage, storageKey, pageKey)
        ? "custom"
        : "canonical";
    const layout = isCurrentPage
      ? currentLayout
      : storage && storageKey && presentation === "custom"
        ? readPageShellLayout(storage, storageKey, pageKey, canonicalLayout.order, canonicalLayout.sizes)
        : undefined;
    return presentation === "custom" ? { layout, pageKey, presentation } : { pageKey, presentation };
  });
  return {
    appVersion,
    exportedAt,
    pages,
    schema: PAGE_SHELL_EXPORT_SCHEMA,
    schemaVersion: PAGE_SHELL_EXPORT_SCHEMA_VERSION,
    views: [...(savedViews ?? (storage && viewsStorageKey ? readPageShellViews(storage, viewsStorageKey) : []))].map((view) => createPageShellView(view)),
  };
}
