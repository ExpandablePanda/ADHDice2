export const PAGE_SHELL_LAYOUT_STORAGE_PREFIX = "adhdice-page-shell-layout-v1:";
export const PAGE_SHELL_VIEWS_STORAGE_PREFIX = "adhdice-page-shell-views-v1:";
export const PAGE_SHELL_VIEWS_SCHEMA_VERSION = 1;
export const PAGE_SHELL_EXPORT_SCHEMA = "adhdice-page-shell-layouts";
export const PAGE_SHELL_EXPORT_SCHEMA_VERSION = 1;

export type PageShellLayoutStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const PAGE_SHELL_SPAN_OPTIONS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export type PageShellSpan = typeof PAGE_SHELL_SPAN_OPTIONS[number];
const PAGE_SHELL_OPTIONS_LAST = PAGE_SHELL_SPAN_OPTIONS[PAGE_SHELL_SPAN_OPTIONS.length - 1];

export type PageShellSize = {
  heightPx: number | null;
  span: PageShellSpan;
};

export type PageShellPlacement = {
  columnStart: number;
  laneOrder: number;
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
  placements?: Record<string, PageShellPlacement>;
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

export const TEST_PAGE_SHELL_IDS = [
  "test-task-table",
  "test-d20",
  "test-dice-face",
  "test-dice-material",
  "test-task-table-prototype",
  "test-bucket-tray",
  "test-rule-builder",
] as const;

export const TEST_D20_PAGE_SHELL_IDS = ["test-d20-sandbox", "test-d20-controls"] as const;

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
  "test-task-table": CANONICAL_PAGE_SHELL_SIZE(12),
  "test-d20": CANONICAL_PAGE_SHELL_SIZE(12),
  "test-dice-face": CANONICAL_PAGE_SHELL_SIZE(6),
  "test-dice-material": CANONICAL_PAGE_SHELL_SIZE(6),
  "test-task-table-prototype": CANONICAL_PAGE_SHELL_SIZE(12),
  "test-bucket-tray": CANONICAL_PAGE_SHELL_SIZE(6),
  "test-rule-builder": CANONICAL_PAGE_SHELL_SIZE(6),
});

export const TEST_D20_PAGE_SHELL_CANONICAL_LAYOUT: PageShellCanonicalLayout = canonicalLayout(TEST_D20_PAGE_SHELL_IDS, {
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
registerPageShellPage("test:d20", TEST_D20_PAGE_SHELL_CANONICAL_LAYOUT);

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
export const TEST_D20_PAGE_SHELL_SIZE_DEFAULTS: PageShellSizeDefaults = TEST_D20_PAGE_SHELL_CANONICAL_LAYOUT.sizes;

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
    placements: layout.placements
      ? Object.fromEntries(Object.entries(layout.placements).map(([id, placement]) => [id, { ...placement }]))
      : undefined,
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

export type PageShellPackedPosition = {
  columnSpan: PageShellSpan;
  columnStart: number;
  rowSpan: number;
  rowStart: number;
};

export type PageShellPackedLayoutOptions = {
  chromeHeightPx?: number;
  gapPx?: number;
  naturalHeights?: Readonly<Record<string, number>>;
  placements?: Readonly<Record<string, PageShellPlacement>>;
  rowUnitPx?: number;
};

export type PageShellDropTarget = {
  columnStart: number;
  insertionIndex: number;
  laneOrder: number;
  targetId: string | null;
};

export type PageShellGridBounds = {
  left: number;
  width: number;
};

export type PageShellGridColumnGeometry = {
  left: number;
  width: number;
};

export const PAGE_SHELL_POINTER_HYSTERESIS_PX = 8;
export const PAGE_SHELL_ROW_ALIGNMENT_PX = 12;
export const PAGE_SHELL_DRAG_AUTO_SCROLL_EDGE_PX = 80;
export const PAGE_SHELL_DRAG_AUTO_SCROLL_MAX_PX = 18;
export const PAGE_SHELL_PACKING_GAP_PX = 20;
export const PAGE_SHELL_PACKING_ROW_UNIT_PX = 4;

export function getPageShellGridColumnGeometry(
  gridBounds: PageShellGridBounds,
  columnStart: number,
  columnSpan: PageShellSpan,
): PageShellGridColumnGeometry | null {
  const trackWidth = (gridBounds.width - PAGE_SHELL_PACKING_GAP_PX * 11) / 12;
  if (trackWidth <= 0) return null;
  const safeColumnStart = Math.max(1, Math.min(13 - columnSpan, Math.round(columnStart)));
  return {
    left: gridBounds.left + (safeColumnStart - 1) * (trackWidth + PAGE_SHELL_PACKING_GAP_PX),
    width: trackWidth * columnSpan + PAGE_SHELL_PACKING_GAP_PX * (columnSpan - 1),
  };
}

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

export function normalizePageShellPlacement(
  stored: unknown,
  span: PageShellSpan = PAGE_SHELL_OPTIONS_LAST,
  fallback: PageShellPlacement = { columnStart: 1, laneOrder: 0 },
): PageShellPlacement {
  const source = stored && typeof stored === "object" && !Array.isArray(stored) ? stored as Record<string, unknown> : {};
  const rawColumnStart = typeof source.columnStart === "number" && Number.isFinite(source.columnStart)
    ? Math.round(source.columnStart)
    : fallback.columnStart;
  const rawLaneOrder = typeof source.laneOrder === "number" && Number.isFinite(source.laneOrder)
    ? Math.round(source.laneOrder)
    : fallback.laneOrder;
  return {
    columnStart: Math.max(1, Math.min(13 - span, rawColumnStart)),
    laneOrder: Math.max(0, rawLaneOrder),
  };
}

function placementsFromPackedPositions(
  order: readonly string[],
  positions: Readonly<Record<string, PageShellPackedPosition>>,
) {
  const laneCounts = new Map<number, number>();
  const placements: Record<string, PageShellPlacement> = {};
  for (const id of order) {
    const position = positions[id];
    if (!position) continue;
    const laneOrder = laneCounts.get(position.columnStart) ?? 0;
    laneCounts.set(position.columnStart, laneOrder + 1);
    placements[id] = { columnStart: position.columnStart, laneOrder };
  }
  return placements;
}

/**
 * Resolves a pointer to a portable grid destination. The destination is
 * expressed as a column start and lane order, never as a DOM coordinate.
 */
export function getPageShellDropTarget(
  geometries: readonly PageShellGeometry[],
  packedPositions: Readonly<Record<string, PageShellPackedPosition>>,
  order: readonly string[],
  sourceId: string,
  pointerX: number,
  pointerY: number,
  gridBounds?: PageShellGridBounds,
  grabOffsetX = 0,
): PageShellDropTarget {
  const intendedLeft = pointerX - (Number.isFinite(grabOffsetX) ? grabOffsetX : 0);
  const positionedGeometries = geometries
    .filter((geometry) => order.includes(geometry.id) && packedPositions[geometry.id])
    .map((geometry) => ({ geometry, position: packedPositions[geometry.id] }));
  const candidates = geometries
    .filter((geometry) => geometry.id !== sourceId && order.includes(geometry.id) && packedPositions[geometry.id])
    .map((geometry) => {
      const position = packedPositions[geometry.id];
      return {
        distanceX: intendedLeft < geometry.left ? geometry.left - intendedLeft : intendedLeft > geometry.right ? intendedLeft - geometry.right : 0,
        geometry,
        position,
      };
    });
  const nearestColumnShell = candidates
    .slice()
    .sort((left, right) => left.distanceX - right.distanceX || left.geometry.top - right.geometry.top || order.indexOf(left.geometry.id) - order.indexOf(right.geometry.id))[0];
  const sourceSpan = packedPositions[sourceId]?.columnSpan ?? PAGE_SHELL_OPTIONS_LAST;
  const measuredGeometry = positionedGeometries.find(({ geometry, position }) => geometry.right > geometry.left && position.columnSpan > 0);
  const inferredColumnWidth = measuredGeometry
    ? (measuredGeometry.geometry.right - measuredGeometry.geometry.left + PAGE_SHELL_PACKING_GAP_PX * (measuredGeometry.position.columnSpan - 1)) / measuredGeometry.position.columnSpan
    : 0;
  const columnWidth = gridBounds && gridBounds.width > PAGE_SHELL_PACKING_GAP_PX * 11
    ? (gridBounds.width - PAGE_SHELL_PACKING_GAP_PX * 11) / 12 + PAGE_SHELL_PACKING_GAP_PX
    : inferredColumnWidth;
  const firstPositionedGeometry = positionedGeometries
    .slice()
    .sort((left, right) => left.position.columnStart - right.position.columnStart || left.geometry.left - right.geometry.left)[0];
  const gridLeft = gridBounds?.left ?? (firstPositionedGeometry && columnWidth > 0
    ? firstPositionedGeometry.geometry.left - (firstPositionedGeometry.position.columnStart - 1) * columnWidth
    : 0);
  const occupiedColumns = new Map<number, { left: number; right: number }>();
  for (const { geometry, position } of positionedGeometries) {
    const current = occupiedColumns.get(position.columnStart);
    occupiedColumns.set(position.columnStart, {
      left: Math.min(current?.left ?? geometry.left, geometry.left),
      right: Math.max(current?.right ?? geometry.right, geometry.right),
    });
  }
  const occupiedColumn = [...occupiedColumns.entries()]
    .find(([, bounds]) => intendedLeft >= bounds.left - PAGE_SHELL_POINTER_HYSTERESIS_PX && intendedLeft <= bounds.right + PAGE_SHELL_POINTER_HYSTERESIS_PX);
  const maxColumnStart = Math.max(1, 13 - sourceSpan);
  const pointerColumn = columnWidth > 0
    ? Math.max(1, Math.min(maxColumnStart, Math.round((intendedLeft - gridLeft) / columnWidth) + 1))
    : undefined;
  const occupiedColumnRanges = new Map<number, { end: number; start: number }>();
  for (const { position, geometry } of positionedGeometries) {
    if (geometry.id === sourceId) continue;
    const current = occupiedColumnRanges.get(position.columnStart);
    occupiedColumnRanges.set(position.columnStart, {
      end: Math.max(current?.end ?? 0, position.columnStart + position.columnSpan - 1),
      start: Math.min(current?.start ?? position.columnStart, position.columnStart),
    });
  }
  const emptyColumnStarts = Array.from({ length: maxColumnStart }, (_, index) => index + 1)
    .filter((columnStart) => ![...occupiedColumnRanges.values()].some((range) => (
      columnStart <= range.end && columnStart + sourceSpan - 1 >= range.start
    )));
  const emptyColumnStart = pointerColumn !== undefined
    ? emptyColumnStarts
      .filter((columnStart) => pointerColumn >= columnStart && pointerColumn <= columnStart + sourceSpan - 1)
      .sort((left, right) => Math.abs(left - pointerColumn) - Math.abs(right - pointerColumn) || left - right)[0]
    : undefined;
  const columnStart = occupiedColumn?.[0] ?? emptyColumnStart ?? nearestColumnShell?.position.columnStart ?? packedPositions[sourceId]?.columnStart ?? 1;
  const columnCandidates = candidates
    .filter((candidate) => candidate.position.columnStart === columnStart)
    .sort((left, right) => left.geometry.top - right.geometry.top || order.indexOf(left.geometry.id) - order.indexOf(right.geometry.id));
  const orderWithoutSource = order.filter((id) => id !== sourceId);
  if (columnCandidates.length === 0) {
    return {
      columnStart,
      insertionIndex: orderWithoutSource.length,
      laneOrder: 0,
      targetId: null,
    };
  }

  let target = columnCandidates[columnCandidates.length - 1];
  let insertAfter = true;
  for (const candidate of columnCandidates) {
    const centerY = (candidate.geometry.top + candidate.geometry.bottom) / 2;
    if (pointerY < candidate.geometry.top) {
      target = candidate;
      insertAfter = false;
      break;
    }
    if (pointerY <= candidate.geometry.bottom) {
      target = candidate;
      insertAfter = pointerY >= centerY;
      break;
    }
  }
  const targetIndex = orderWithoutSource.indexOf(target.geometry.id);
  const insertionIndex = targetIndex < 0
    ? orderWithoutSource.length
    : Math.max(0, Math.min(orderWithoutSource.length, targetIndex + (insertAfter ? 1 : 0)));
  const laneOrder = columnCandidates.findIndex((candidate) => candidate.geometry.id === target.geometry.id) + (insertAfter ? 1 : 0);
  return {
    columnStart,
    insertionIndex,
    laneOrder,
    targetId: target.geometry.id,
  };
}

/** Finds the nearest adjacent empty semantic column for horizontal keyboard movement. */
export function getPageShellEmptyHorizontalColumnStart(
  packedPositions: Readonly<Record<string, PageShellPackedPosition>>,
  sourceId: string,
  direction: "left" | "right",
) {
  const source = packedPositions[sourceId];
  if (!source) return null;
  const maxColumnStart = 13 - source.columnSpan;
  const firstColumnStart = direction === "right"
    ? source.columnStart + source.columnSpan
    : source.columnStart - source.columnSpan;
  const step = direction === "right" ? 1 : -1;
  const isInBounds = (columnStart: number) => direction === "right"
    ? columnStart <= maxColumnStart
    : columnStart >= 1;
  const otherRanges = Object.entries(packedPositions)
    .filter(([id]) => id !== sourceId)
    .map(([, position]) => ({
      end: position.columnStart + position.columnSpan - 1,
      start: position.columnStart,
    }));
  for (let columnStart = firstColumnStart; isInBounds(columnStart); columnStart += step) {
    const end = columnStart + source.columnSpan - 1;
    if (!otherRanges.some((range) => columnStart <= range.end && end >= range.start)) return columnStart;
  }
  return null;
}

/**
 * Applies a drop to the semantic order and lane model. Existing shells in the
 * destination lane are re-ranked so the persisted composition cannot replace
 * the shell that supplied the insertion target.
 */
export function placePageShellAtDrop(
  layout: PageShellLayoutPreference,
  visibleShellIds: readonly string[],
  sourceId: string,
  target: PageShellDropTarget,
) {
  const nextVisibleOrder = reorderPageShellOrderAt(
    visibleShellIds,
    sourceId,
    target.insertionIndex,
  );
  const nextOrder = mergeVisiblePageShellOrder(layout.order, nextVisibleOrder, visibleShellIds);
  const nextPlacements: Record<string, PageShellPlacement> = Object.fromEntries(
    Object.entries(layout.placements ?? {}).map(([id, placement]) => [id, { ...placement }]),
  );
  const destinationIds = visibleShellIds
    .filter((id) => id !== sourceId && nextPlacements[id]?.columnStart === target.columnStart)
    .sort((left, right) => (
      nextPlacements[left].laneOrder - nextPlacements[right].laneOrder
      || nextOrder.indexOf(left) - nextOrder.indexOf(right)
    ));
  destinationIds.splice(Math.max(0, Math.min(target.laneOrder, destinationIds.length)), 0, sourceId);
  destinationIds.forEach((id, laneOrder) => {
    nextPlacements[id] = { columnStart: target.columnStart, laneOrder };
  });
  return { order: nextOrder, placements: nextPlacements };
}

/**
 * Packs shells into the earliest available 12-column position while honoring
 * semantic column/lane placement hints. Coordinates remain runtime-only.
 */
export function packPageShellLayout(
  order: readonly string[],
  sizes: Readonly<Record<string, PageShellSize>>,
  options: PageShellPackedLayoutOptions = {},
) {
  const gapPx = options.gapPx ?? PAGE_SHELL_PACKING_GAP_PX;
  const rowUnitPx = Math.max(1, options.rowUnitPx ?? PAGE_SHELL_PACKING_ROW_UNIT_PX);
  const chromeHeightPx = Math.max(0, options.chromeHeightPx ?? 0);
  const naturalHeights = options.naturalHeights ?? {};
  const placements = options.placements ?? {};
  const occupied: boolean[][] = [];
  const positions: Record<string, PageShellPackedPosition> = {};

  const isOccupied = (row: number, column: number) => Boolean(occupied[row]?.[column]);
  const canPlace = (row: number, column: number, rowSpan: number, columnSpan: number) => {
    for (let occupiedRow = row; occupiedRow < row + rowSpan; occupiedRow += 1) {
      for (let occupiedColumn = column; occupiedColumn < column + columnSpan; occupiedColumn += 1) {
        if (isOccupied(occupiedRow, occupiedColumn)) return false;
      }
    }
    return true;
  };
  const markOccupied = (row: number, column: number, rowSpan: number, columnSpan: number) => {
    for (let occupiedRow = row; occupiedRow < row + rowSpan; occupiedRow += 1) {
      occupied[occupiedRow] ??= [];
      for (let occupiedColumn = column; occupiedColumn < column + columnSpan; occupiedColumn += 1) {
        occupied[occupiedRow][occupiedColumn] = true;
      }
    }
  };

  const explicitIds = order
    .filter((id) => placements[id])
    .sort((left, right) => (
      placements[left].columnStart - placements[right].columnStart
      || placements[left].laneOrder - placements[right].laneOrder
      || order.indexOf(left) - order.indexOf(right)
    ));
  const automaticIds = order.filter((id) => !placements[id]);

  for (const id of [...explicitIds, ...automaticIds]) {
    const size = sizes[id] ?? { heightPx: null, span: 12 as PageShellSpan };
    const heightPx = size.heightPx ?? naturalHeights[id] ?? PAGE_SHELL_MIN_HEIGHT;
    const rowSpan = Math.max(1, Math.ceil((Math.max(1, heightPx) + chromeHeightPx + gapPx) / rowUnitPx));
    const placement = placements[id];
    let row = 0;
    let column = 0;
    if (placement) {
      column = Math.max(0, Math.min(12 - size.span, placement.columnStart - 1));
      const preceding = explicitIds
        .filter((candidateId) => candidateId !== id && placements[candidateId].columnStart === placement.columnStart && placements[candidateId].laneOrder < placement.laneOrder)
        .map((candidateId) => positions[candidateId])
        .filter((position): position is PageShellPackedPosition => Boolean(position));
      row = preceding.reduce((bottom, position) => Math.max(bottom, position.rowStart - 1 + position.rowSpan), 0);
      while (!canPlace(row, column, rowSpan, size.span)) row += 1;
    } else {
      while (true) {
        let foundColumn = false;
        for (let candidateColumn = 0; candidateColumn <= 12 - size.span; candidateColumn += 1) {
          if (canPlace(row, candidateColumn, rowSpan, size.span)) {
            column = candidateColumn;
            foundColumn = true;
            break;
          }
        }
        if (foundColumn) break;
        row += 1;
      }
    }
    markOccupied(row, column, rowSpan, size.span);
    positions[id] = {
      columnSpan: size.span,
      columnStart: column + 1,
      rowSpan,
      rowStart: row + 1,
    };
  }

  return positions;
}

export type PageShellMoveDirection = "down" | "left" | "right" | "up";

/**
 * Finds the nearest rendered neighbor in a direction and returns the
 * insertion index that keeps the move in the shared semantic order model.
 */
export function getPageShellDirectionalInsertionIndex(
  geometries: readonly PageShellGeometry[],
  order: readonly string[],
  sourceId: string,
  direction: PageShellMoveDirection,
) {
  const source = geometries.find((geometry) => geometry.id === sourceId);
  if (!source) return null;
  const sourceCenterX = (source.left + source.right) / 2;
  const sourceCenterY = (source.top + source.bottom) / 2;
  const candidates = geometries
    .filter((geometry) => geometry.id !== sourceId && order.includes(geometry.id))
    .flatMap((geometry) => {
      const horizontalOverlap = Math.max(0, Math.min(source.right, geometry.right) - Math.max(source.left, geometry.left));
      const verticalOverlap = Math.max(0, Math.min(source.bottom, geometry.bottom) - Math.max(source.top, geometry.top));
      if (direction === "left" && geometry.right > source.left) return [];
      if (direction === "right" && geometry.left < source.right) return [];
      if (direction === "up" && geometry.bottom > source.top) return [];
      if (direction === "down" && geometry.top < source.bottom) return [];
      const primaryDistance = direction === "left"
        ? source.left - geometry.right
        : direction === "right"
          ? geometry.left - source.right
          : direction === "up"
            ? source.top - geometry.bottom
            : geometry.top - source.bottom;
      const secondaryDistance = direction === "left" || direction === "right"
        ? Math.abs(sourceCenterY - (geometry.top + geometry.bottom) / 2)
        : Math.abs(sourceCenterX - (geometry.left + geometry.right) / 2);
      return [{ geometry, horizontalOverlap, primaryDistance, secondaryDistance, verticalOverlap }];
    })
    .sort((left, right) => (
      Number(right.verticalOverlap > 0 || right.horizontalOverlap > 0) - Number(left.verticalOverlap > 0 || left.horizontalOverlap > 0)
      || left.primaryDistance - right.primaryDistance
      || right.verticalOverlap - left.verticalOverlap
      || right.horizontalOverlap - left.horizontalOverlap
      || left.secondaryDistance - right.secondaryDistance
      || order.indexOf(left.geometry.id) - order.indexOf(right.geometry.id)
    ));
  const target = candidates[0]?.geometry;
  if (!target) return null;
  const orderWithoutSource = order.filter((id) => id !== sourceId);
  const targetIndex = orderWithoutSource.indexOf(target.id);
  if (targetIndex < 0) return null;
  return direction === "left" || direction === "up" ? targetIndex : targetIndex + 1;
}

export function normalizePageShellSpan(value: unknown, fallback: PageShellSpan = NATURAL_PAGE_SHELL_SIZE.span): PageShellSpan {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(PAGE_SHELL_SPAN_OPTIONS[0], Math.min(PAGE_SHELL_OPTIONS_LAST, Math.round(value))) as PageShellSpan;
}

export const PAGE_SHELL_HEIGHT_SNAP = 48;
export const PAGE_SHELL_MIN_HEIGHT = 144;
export const PAGE_SHELL_MAX_HEIGHT = 1536;

export function snapPageShellHeight(value: number) {
  const snapped = Math.max(PAGE_SHELL_MIN_HEIGHT, Math.round(value / PAGE_SHELL_HEIGHT_SNAP) * PAGE_SHELL_HEIGHT_SNAP);
  return snapped;
}

export function formatPageShellDimensions(
  span: PageShellSpan,
  heightPx: number | null,
  naturalHeight: number | null | undefined,
  renderedWidth: number | null | undefined = undefined,
) {
  const formatHeight = (value: number | null | undefined) => value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : String(Math.round(value));
  const width = renderedWidth === undefined
    ? ""
    : ` · ${renderedWidth === null || !Number.isFinite(renderedWidth) ? "—" : `${Math.round(renderedWidth)}px`}`;
  return `W ${span}/12${width} · H ${formatHeight(heightPx ?? naturalHeight)}/${formatHeight(naturalHeight)}`;
}

function getSafePageShellNaturalHeight(naturalHeight: number) {
  return Number.isFinite(naturalHeight) && naturalHeight > 0 ? naturalHeight : PAGE_SHELL_MIN_HEIGHT;
}

/** Returns the smallest useful custom height without expanding a naturally short shell. */
export function getPageShellShrinkHeight(naturalHeight: number) {
  return Math.min(PAGE_SHELL_MIN_HEIGHT, getSafePageShellNaturalHeight(naturalHeight));
}

/** Snaps a manual resize within the shared custom-height safety bound. */
export function clampPageShellHeight(value: number, naturalHeight: number) {
  const safeNaturalHeight = getSafePageShellNaturalHeight(naturalHeight);
  if (safeNaturalHeight < PAGE_SHELL_MIN_HEIGHT) return safeNaturalHeight;
  const safeValue = Number.isFinite(value) ? value : safeNaturalHeight;
  return Math.min(snapPageShellHeight(safeValue), Math.max(PAGE_SHELL_MAX_HEIGHT, safeNaturalHeight));
}

function normalizePageShellHeight(value: unknown, fallback: number | null) {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback;
  const snapped = Math.round(value / PAGE_SHELL_HEIGHT_SNAP) * PAGE_SHELL_HEIGHT_SNAP;
  return Math.min(PAGE_SHELL_MAX_HEIGHT, Math.max(PAGE_SHELL_MIN_HEIGHT, snapped));
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

function isPageShellLayoutPreference(value: unknown): value is { order?: unknown; placements?: unknown; sizes?: unknown } {
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
  const storedPlacements = isPageShellLayoutPreference(stored) && stored.placements && typeof stored.placements === "object" && !Array.isArray(stored.placements)
    ? stored.placements as Record<string, unknown>
    : {};
  const placements: Record<string, PageShellPlacement> = {};
  for (const id of order) {
    if (Object.prototype.hasOwnProperty.call(storedPlacements, id)) {
      placements[id] = normalizePageShellPlacement(storedPlacements[id], sizes[id]?.span);
    }
  }
  const packedPositions = packPageShellLayout(order, sizes, { placements });
  const derivedPlacements = placementsFromPackedPositions(order, packedPositions);
  return { order, placements: derivedPlacements, sizes };
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
    layouts[pageKey] = {
      order: [...layout.order],
      placements: layout.placements
        ? Object.fromEntries(Object.entries(layout.placements).map(([id, placement]) => [id, { ...placement }]))
        : undefined,
      sizes: { ...layout.sizes },
    };
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

function isCompletePageShellPreference(value: unknown, shellIds: readonly string[]) {
  if (!isPageShellLayoutPreference(value) || !Array.isArray(value.order)) return false;
  const order = value.order as unknown[];
  return shellIds.every((id) => order.includes(id));
}

function getTestD20MigrationMarkerKey(layoutStorageKey: string) {
  return `${layoutStorageKey}:test-d20-migration-v1`;
}

/** Returns true only for the two-shell D20 preference written by 7.12.80. */
export function isLegacyTestD20LayoutPreference(value: unknown) {
  if (!isCompletePageShellPreference(value, TEST_D20_PAGE_SHELL_IDS)) return false;
  const layout = value as { order: unknown[] };
  return layout.order.length === TEST_D20_PAGE_SHELL_IDS.length
    && new Set(layout.order).size === TEST_D20_PAGE_SHELL_IDS.length;
}

function pageShellViewsAreEquivalent(left: PageShellView, right: PageShellView) {
  if (left.id === right.id) return true;
  if (left.name !== right.name || left.target !== right.target || left.presentation !== right.presentation) return false;
  return JSON.stringify(left.layout ?? null) === JSON.stringify(right.layout ?? null);
}

function isLegacyTestD20View(view: PageShellView) {
  return view.pageKey === "test" && (view.presentation === "canonical" || isLegacyTestD20LayoutPreference(view.layout));
}

/**
 * Moves the 7.12.80 D20 preference and Views out of the old `test` namespace.
 * The operation is idempotent, preserves semantic layout data, and never
 * replaces a valid `test:d20` preference or equivalent saved View.
 */
export function migrateLegacyTestD20Storage(
  storage: PageShellLayoutStorage,
  layoutStorageKey: string,
  viewsStorageKey: string | null,
) {
  const migrationMarkerKey = getTestD20MigrationMarkerKey(layoutStorageKey);
  let migrationComplete = false;
  try {
    migrationComplete = storage.getItem(migrationMarkerKey) === "complete";
  } catch {
    // Continue with the guarded migration reads below.
  }
  if (migrationComplete) {
    return { layoutMigrated: false, viewsMigrated: false };
  }
  let layoutMigrated = false;
  const layouts = readStoredPageShellLayouts(storage, layoutStorageKey);
  const legacyLayout = layouts.test;
  if (isLegacyTestD20LayoutPreference(legacyLayout)) {
    if (!isCompletePageShellPreference(layouts["test:d20"], TEST_D20_PAGE_SHELL_IDS)) {
      layouts["test:d20"] = normalizePageShellLayout(
        legacyLayout,
        TEST_D20_PAGE_SHELL_IDS,
        TEST_D20_PAGE_SHELL_CANONICAL_LAYOUT.sizes,
      );
    }
    delete layouts.test;
    layoutMigrated = true;
    try {
      storage.setItem(layoutStorageKey, JSON.stringify(layouts));
    } catch {
      // The caller still receives an in-memory-safe result when storage is unavailable.
    }
  }

  let viewsMigrated = false;
  if (viewsStorageKey) {
    const storedViews = readStoredPageShellViews(storage, viewsStorageKey);
    const legacyViews = storedViews.filter(isLegacyTestD20View);
    if (legacyViews.length > 0) {
      const migratedViews: PageShellView[] = [];
      for (const view of storedViews) {
        if (!isLegacyTestD20View(view)) {
          migratedViews.push(view);
          continue;
        }
        const migratedView = createPageShellView({
          ...view,
          ...(view.presentation === "custom"
            ? {
              layout: normalizePageShellLayout(
                view.layout,
                TEST_D20_PAGE_SHELL_IDS,
                TEST_D20_PAGE_SHELL_CANONICAL_LAYOUT.sizes,
              ),
            }
            : { layout: undefined }),
          pageKey: "test:d20",
        });
        if (!migratedViews.some((candidate) => pageShellViewsAreEquivalent(candidate, migratedView))) {
          migratedViews.push(migratedView);
        }
      }
      viewsMigrated = true;
      try {
        if (migratedViews.length === 0) storage.removeItem(viewsStorageKey);
        else storage.setItem(viewsStorageKey, JSON.stringify({ version: PAGE_SHELL_VIEWS_SCHEMA_VERSION, views: migratedViews }));
      } catch {
        // The caller still receives an in-memory-safe result when storage is unavailable.
      }
    }
  }

  try {
    storage.setItem(migrationMarkerKey, "complete");
  } catch {
    // A storage failure leaves the migration eligible for a later retry.
  }

  return { layoutMigrated, viewsMigrated };
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
