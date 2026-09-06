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
  /** Compatibility field: the user's preferred snapped 12-column grid start. */
  columnStart: number;
  /** Legacy compatibility only; order now controls vertical packing. */
  laneOrder?: number;
  /** Odd-width exact-center presentation mode; even widths use normal grid centering. */
  mode?: "centered";
  /** Optional snapped vertical detent from the shell's normal packed row. */
  rowOffsetSteps?: number;
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
  placements?: Readonly<Record<string, PageShellPlacement>>;
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

type PageShellLayoutReadinessListener = () => void;

const PAGE_SHELL_LAYOUT_READINESS = new Map<string, boolean>();
const PAGE_SHELL_LAYOUT_READINESS_LISTENERS = new Set<PageShellLayoutReadinessListener>();

export function subscribeToPageShellLayoutReadiness(listener: PageShellLayoutReadinessListener) {
  PAGE_SHELL_LAYOUT_READINESS_LISTENERS.add(listener);
  return () => PAGE_SHELL_LAYOUT_READINESS_LISTENERS.delete(listener);
}

export function isPageShellLayoutReady(pageKey: string) {
  return PAGE_SHELL_LAYOUT_READINESS.get(pageKey) === true;
}

export function setPageShellLayoutReady(pageKey: string, ready: boolean) {
  if (!pageKey.trim() || PAGE_SHELL_LAYOUT_READINESS.get(pageKey) === ready) return;
  if (ready) PAGE_SHELL_LAYOUT_READINESS.set(pageKey, true);
  else PAGE_SHELL_LAYOUT_READINESS.delete(pageKey);
  PAGE_SHELL_LAYOUT_READINESS_LISTENERS.forEach((listener) => listener());
}

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
    placements: {
      "food-meal-log": { columnStart: 1, laneOrder: 0 },
      "food-daily-totals": { columnStart: 8, laneOrder: 0 },
      "food-favorites-recent": { columnStart: 8, laneOrder: 1 },
    },
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
    placements: {
      "water-log": { columnStart: 1, laneOrder: 0 },
      "water-pending": { columnStart: 6, laneOrder: 0 },
      "water-today": { columnStart: 6, laneOrder: 1 },
      "water-history": { columnStart: 6, laneOrder: 2 },
    },
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
    placements: {
      "fitness-today": { columnStart: 1, laneOrder: 0 },
      "fitness-week": { columnStart: 8, laneOrder: 0 },
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
    placements: {
      "weight-entry": { columnStart: 1, laneOrder: 0 },
      "weight-trend": { columnStart: 7, laneOrder: 0 },
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
    placements: {
      "sleep-ledger": { columnStart: 1, laneOrder: 0 },
      "sleep-log": { columnStart: 7, laneOrder: 0 },
      "sleep-focus-ledger": { columnStart: 7, laneOrder: 1 },
      "sleep-sources": { columnStart: 7, laneOrder: 2 },
    },
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
    placements: {
      "insights-import": { columnStart: 1, laneOrder: 0 },
      "insights-trends": { columnStart: 7, laneOrder: 0 },
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
  placements: {
    "test-d20-sandbox": { columnStart: 1, laneOrder: 0 },
    "test-d20-controls": { columnStart: 8, laneOrder: 0 },
  },
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
 * Replaces only the currently visible shells in a full page order.
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

export type PageShellDropRelationship = "before" | "after" | "left" | "right" | "replace";

export type PageShellDirectionalMoveDirection = "up" | "down" | "left" | "right";

export type PageShellDragAxisIntent = "horizontal" | "vertical";

export type PageShellDropTarget = {
  columnStart: number;
  insertionIndex: number;
  laneOrder: number;
  mode?: "centered";
  relationship?: PageShellDropRelationship;
  rowOffsetSteps?: number;
  /** Transient toolbar intent for a standalone structural row move. */
  structuralRow?: "above" | "below";
  targetId: string | null;
};

export type PageShellMoveFailureReason =
  | "ROW_WIDTH_EXCEEDED"
  | "COLLISION"
  | "INVALID_CENTER_PLACEMENT"
  | "INVALID_VERTICAL_PLACEMENT"
  | "INVALID_TARGET";

export type PageShellMovePlan =
  | {
      valid: true;
      layout: PageShellLayoutPreference;
    }
  | {
      valid: false;
      reason: PageShellMoveFailureReason;
      maxWidth?: number;
      targetRowWidth?: number;
      message: string;
    };

export type PageShellMovePlanningInput = {
  chromeHeightPx?: number;
  layout: PageShellLayoutPreference;
  naturalHeights?: Readonly<Record<string, number>>;
  visibleShellIds: readonly string[];
  sourceId: string;
  target: PageShellDropTarget;
  packedPositions: Readonly<Record<string, PageShellPackedPosition>>;
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
export const PAGE_SHELL_DRAG_AXIS_LOCK_PX = 12;
export const PAGE_SHELL_CENTER_SNAP_ZONE_PX = 48;
export const PAGE_SHELL_CENTER_SNAP_HYSTERESIS_PX = 16;
export const PAGE_SHELL_ROW_ALIGNMENT_PX = 12;
export const PAGE_SHELL_VERTICAL_PLACEMENT_SNAP_PX = 12;
export const PAGE_SHELL_MAX_VERTICAL_OFFSET_STEPS = 128;
export const PAGE_SHELL_DROP_ZONE_HYSTERESIS_PX = 12;
export const PAGE_SHELL_DROP_TARGET_PROXIMITY_PX = 32;
export const PAGE_SHELL_DROP_ZONE_EDGE_RATIO = 0.24;
export const PAGE_SHELL_VERTICAL_ALIGNMENT_MAGNET_PX = 8;
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

/** Maps a dragged shell's intended left edge directly to a legal grid start. */
export function getPageShellGridStartFromPointer(
  gridBounds: PageShellGridBounds,
  pointerX: number,
  columnSpan: PageShellSpan,
  grabOffsetX = 0,
) {
  const trackWidth = (gridBounds.width - PAGE_SHELL_PACKING_GAP_PX * 11) / 12;
  if (trackWidth <= 0) return 1;
  const trackStep = trackWidth + PAGE_SHELL_PACKING_GAP_PX;
  const intendedLeft = pointerX - (Number.isFinite(grabOffsetX) ? grabOffsetX : 0);
  return Math.max(1, Math.min(13 - columnSpan, Math.round((intendedLeft - gridBounds.left) / trackStep) + 1));
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

/**
 * Classifies deliberate drag intent once movement clears the small pointer
 * jitter threshold. Equal diagonal movement remains neutral so the next
 * sample can establish the dominant axis; callers should treat neutral as
 * horizontal for placement purposes.
 */
export function resolvePageShellDragAxisIntent(
  startX: number,
  startY: number,
  pointerX: number,
  pointerY: number,
  threshold = PAGE_SHELL_DRAG_AXIS_LOCK_PX,
): PageShellDragAxisIntent | null {
  const deltaX = Math.abs(pointerX - startX);
  const deltaY = Math.abs(pointerY - startY);
  const safeThreshold = Number.isFinite(threshold) ? Math.max(0, threshold) : PAGE_SHELL_DRAG_AXIS_LOCK_PX;
  if (Math.max(deltaX, deltaY) < safeThreshold || deltaX === deltaY) return null;
  return deltaX > deltaY ? "horizontal" : "vertical";
}

export function normalizePageShellRowOffsetSteps(value: unknown, fallback = 0) {
  const candidate = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const raw = typeof candidate === "number" && Number.isFinite(candidate) ? candidate : 0;
  return Math.max(0, Math.min(PAGE_SHELL_MAX_VERTICAL_OFFSET_STEPS, Math.round(raw)));
}

export function getPageShellPlacementRowOffsetSteps(placement: PageShellPlacement | undefined) {
  if (!placement || placement.mode === "centered") return 0;
  return normalizePageShellRowOffsetSteps(placement.rowOffsetSteps);
}

/** Maps a document-space intended top onto the durable 12px vertical detents. */
export function getPageShellVerticalOffsetSteps(
  intendedTop: number,
  normalTop: number,
  sourceHeight: number,
  rowBottom = normalTop + Math.max(0, sourceHeight),
) {
  const safeIntendedTop = Number.isFinite(intendedTop) ? intendedTop : normalTop;
  const safeNormalTop = Number.isFinite(normalTop) ? normalTop : 0;
  const safeSourceHeight = Number.isFinite(sourceHeight) ? Math.max(0, sourceHeight) : 0;
  const safeRowBottom = Number.isFinite(rowBottom) ? Math.max(safeNormalTop, rowBottom) : safeNormalTop + safeSourceHeight;
  const regularSteps = Math.round((safeIntendedTop - safeNormalTop) / PAGE_SHELL_VERTICAL_PLACEMENT_SNAP_PX);
  const magneticSteps = [
    0,
    Math.round(((safeRowBottom - safeNormalTop - safeSourceHeight) / 2) / PAGE_SHELL_VERTICAL_PLACEMENT_SNAP_PX),
    Math.round((safeRowBottom - safeNormalTop - safeSourceHeight) / PAGE_SHELL_VERTICAL_PLACEMENT_SNAP_PX),
  ].map((steps) => normalizePageShellRowOffsetSteps(steps));
  const magneticStep = magneticSteps.find((steps) => (
    Math.abs(safeIntendedTop - (safeNormalTop + steps * PAGE_SHELL_VERTICAL_PLACEMENT_SNAP_PX)) <= PAGE_SHELL_VERTICAL_ALIGNMENT_MAGNET_PX
  ));
  return magneticStep === undefined ? normalizePageShellRowOffsetSteps(regularSteps) : magneticStep;
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
  const isCentered = source.mode === "centered";
  const isOddCentered = isCentered && span % 2 === 1;
  const rawColumnStart = typeof source.columnStart === "number" && Number.isFinite(source.columnStart)
    ? Math.round(source.columnStart)
    : fallback.columnStart;
  const rawLaneOrder = typeof source.laneOrder === "number" && Number.isFinite(source.laneOrder)
    ? Math.round(source.laneOrder)
    : fallback.laneOrder ?? 0;
  const rowOffsetSteps = normalizePageShellRowOffsetSteps(
    Object.prototype.hasOwnProperty.call(source, "rowOffsetSteps") ? source.rowOffsetSteps : fallback.rowOffsetSteps,
  );
  return {
    columnStart: isCentered && span % 2 === 0
      ? getPageShellCenteredColumnStart(span)
      : Math.max(1, Math.min(13 - span, rawColumnStart)),
    laneOrder: Math.max(0, rawLaneOrder),
    ...(isOddCentered ? { mode: "centered" as const } : {}),
    ...(rowOffsetSteps > 0 && !isCentered ? { rowOffsetSteps } : {}),
  };
}

export function isPageShellCenteredPlacement(placement: PageShellPlacement | undefined) {
  return placement?.mode === "centered";
}

/** Exact integer center start; odd-width special Center adds a half-track offset at render time. */
function getPageShellCenteredColumnStart(span: PageShellSpan) {
  return Math.floor((12 - span) / 2) + 1;
}

function directDropFitsInsertionRow(
  geometries: readonly PageShellGeometry[],
  sourceId: string,
  targetId: string | null,
  pointerY: number,
  candidate: PageShellGridColumnGeometry | null,
) {
  if (!targetId || !candidate) return false;
  const targetGeometry = geometries.find((geometry) => geometry.id === targetId);
  if (!targetGeometry
    || pointerY < targetGeometry.top - PAGE_SHELL_POINTER_HYSTERESIS_PX
    || pointerY > targetGeometry.bottom + PAGE_SHELL_POINTER_HYSTERESIS_PX) {
    return false;
  }
  const candidateRight = candidate.left + candidate.width;
  return geometries
    .filter((geometry) => geometry.id !== sourceId && geometriesSharePageShellRow(targetGeometry, geometry))
    .every((geometry) => candidateRight <= geometry.left || candidate.left >= geometry.right);
}

function placementsFromPackedPositions(
  order: readonly string[],
  sizes: Readonly<Record<string, PageShellSize>>,
  positions: Readonly<Record<string, PageShellPackedPosition>>,
  placementHints: Readonly<Record<string, PageShellPlacement>> = {},
) {
  const placements: Record<string, PageShellPlacement> = {};
  for (const id of order) {
    const position = positions[id];
    if (!position) continue;
    const placementHint = placementHints[id];
    if (placementHint) {
      placements[id] = normalizePageShellPlacement(placementHint, sizes[id]?.span);
      continue;
    }
    placements[id] = { columnStart: position.columnStart, laneOrder: 0 };
  }
  return placements;
}

function getPageShellDropZoneBands(geometry: PageShellGeometry) {
  return {
    horizontal: Math.max(28, Math.min(96, (geometry.right - geometry.left) * PAGE_SHELL_DROP_ZONE_EDGE_RATIO)),
    vertical: Math.max(28, Math.min(72, (geometry.bottom - geometry.top) * PAGE_SHELL_DROP_ZONE_EDGE_RATIO)),
  };
}

export function resolvePageShellDropRelationship(
  geometry: PageShellGeometry,
  pointerX: number,
  pointerY: number,
  previousRelationship?: PageShellDropRelationship,
) {
  const bands = getPageShellDropZoneBands(geometry);
  const inLeftBand = pointerX <= geometry.left + bands.horizontal;
  const inRightBand = pointerX >= geometry.right - bands.horizontal;
  let relationship: PageShellDropRelationship;
  if (pointerY <= geometry.top + bands.vertical && !inLeftBand && !inRightBand) relationship = "before";
  else if (pointerY >= geometry.bottom - bands.vertical && !inLeftBand && !inRightBand) relationship = "after";
  else if (inLeftBand) relationship = "left";
  else if (inRightBand) relationship = "right";
  else relationship = "replace";

  if (!previousRelationship || previousRelationship === relationship) return relationship;
  const hysteresis = PAGE_SHELL_DROP_ZONE_HYSTERESIS_PX;
  const inStableZone = (() => {
    switch (previousRelationship) {
      case "before": return pointerY <= geometry.top + bands.vertical + hysteresis;
      case "after": return pointerY >= geometry.bottom - bands.vertical - hysteresis;
      case "left":
        return pointerY >= geometry.top + bands.vertical - hysteresis
          && pointerY <= geometry.bottom - bands.vertical + hysteresis
          && pointerX <= geometry.left + bands.horizontal + hysteresis;
      case "right":
        return pointerY >= geometry.top + bands.vertical - hysteresis
          && pointerY <= geometry.bottom - bands.vertical + hysteresis
          && pointerX >= geometry.right - bands.horizontal - hysteresis;
      case "replace":
        return pointerY >= geometry.top + bands.vertical - hysteresis
          && pointerY <= geometry.bottom - bands.vertical + hysteresis
          && pointerX >= geometry.left + bands.horizontal - hysteresis
          && pointerX <= geometry.right - bands.horizontal + hysteresis;
    }
  })();
  return inStableZone ? previousRelationship : relationship;
}

function pageShellPointerDistanceToGeometry(geometry: PageShellGeometry, pointerX: number, pointerY: number) {
  const horizontalDistance = Math.max(geometry.left - pointerX, 0, pointerX - geometry.right);
  const verticalDistance = Math.max(geometry.top - pointerY, 0, pointerY - geometry.bottom);
  return Math.hypot(horizontalDistance, verticalDistance);
}

function findPageShellDropGeometry(
  geometries: readonly PageShellGeometry[],
  order: readonly string[],
  sourceId: string,
  pointerX: number,
  pointerY: number,
  previousTargetId?: string | null,
) {
  const eligible = geometries.filter((geometry) => geometry.id !== sourceId && order.includes(geometry.id));
  const directHit = eligible
    .filter((geometry) => (
      pointerX >= geometry.left
      && pointerX <= geometry.right
      && pointerY >= geometry.top
      && pointerY <= geometry.bottom
    ))
    .sort((left, right) => order.indexOf(left.id) - order.indexOf(right.id))[0];
  if (directHit) return directHit;

  const previous = previousTargetId
    ? eligible.find((geometry) => geometry.id === previousTargetId)
    : undefined;
  if (previous) {
    const proximity = PAGE_SHELL_DROP_TARGET_PROXIMITY_PX + PAGE_SHELL_DROP_ZONE_HYSTERESIS_PX;
    if (pointerX >= previous.left - proximity
      && pointerX <= previous.right + proximity
      && pointerY >= previous.top - proximity
      && pointerY <= previous.bottom + proximity) {
      return previous;
    }
  }
  return eligible
    .filter((geometry) => pageShellPointerDistanceToGeometry(geometry, pointerX, pointerY) <= PAGE_SHELL_DROP_TARGET_PROXIMITY_PX)
    .sort((left, right) => (
      pageShellPointerDistanceToGeometry(left, pointerX, pointerY) - pageShellPointerDistanceToGeometry(right, pointerX, pointerY)
      || order.indexOf(left.id) - order.indexOf(right.id)
    ))[0];
}

function getPageShellTargetInsertionIndex(
  orderWithoutSource: readonly string[],
  targetId: string,
  relationship: PageShellDropRelationship,
) {
  const targetIndex = orderWithoutSource.indexOf(targetId);
  if (targetIndex < 0) return undefined;
  return relationship === "after" || relationship === "right" ? targetIndex + 1 : targetIndex;
}

function getPageShellTargetColumnStart(
  relationship: PageShellDropRelationship,
  targetId: string | null,
  sourceSpan: PageShellSpan,
  directColumnStart: number,
  packedPositions: Readonly<Record<string, PageShellPackedPosition>>,
) {
  if (!targetId || (relationship !== "left" && relationship !== "right" && relationship !== "replace")) return directColumnStart;
  const targetPosition = packedPositions[targetId];
  if (!targetPosition) return directColumnStart;
  if (relationship === "replace") return Math.max(1, Math.min(13 - sourceSpan, targetPosition.columnStart));
  if (relationship === "left") {
    const adjacentStart = targetPosition.columnStart - sourceSpan;
    return adjacentStart >= 1 ? adjacentStart : directColumnStart;
  }
  const adjacentStart = targetPosition.columnStart + targetPosition.columnSpan;
  return adjacentStart <= 13 - sourceSpan ? adjacentStart : directColumnStart;
}

function getPageShellSameRowVerticalBounds(
  geometries: readonly PageShellGeometry[],
  sourceId: string,
  targetId: string | null,
) {
  if (!targetId) return null;
  const target = geometries.find((geometry) => geometry.id === targetId);
  if (!target) return null;
  const rowGeometries = geometries.filter((geometry) => geometry.id !== sourceId && geometriesSharePageShellRow(target, geometry));
  if (rowGeometries.length === 0) return null;
  return {
    bottom: Math.max(...rowGeometries.map((geometry) => geometry.bottom)),
    top: Math.min(...rowGeometries.map((geometry) => geometry.top)),
  };
}

/**
 * Resolves a pointer to a direct snap-grid destination. The pointer-down
 * geometry remains the reference frame; only the relationship and detent
 * preview change while dragging.
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
  placements: Readonly<Record<string, PageShellPlacement>> = {},
  previousInsertionIndex?: number,
  grabOffsetY = 0,
  previousTarget?: PageShellDropTarget,
  axisIntent: PageShellDragAxisIntent = "horizontal",
): PageShellDropTarget {
  const intendedLeft = pointerX - (Number.isFinite(grabOffsetX) ? grabOffsetX : 0);
  const sourceSpan = packedPositions[sourceId]?.columnSpan ?? PAGE_SHELL_OPTIONS_LAST;
  const orderWithoutSource = order.filter((id) => id !== sourceId);
  const insertionIndex = getPageShellInsertionIndex(
    geometries,
    order,
    sourceId,
    pointerX,
    pointerY,
    previousInsertionIndex,
  );
  const fallbackTargetId = orderWithoutSource[insertionIndex] ?? orderWithoutSource[insertionIndex - 1] ?? null;
  const directionalGeometry = findPageShellDropGeometry(
    geometries,
    order,
    sourceId,
    pointerX,
    pointerY,
    previousTarget?.targetId,
  );
  const directionalTargetId = directionalGeometry?.id ?? null;
  const fallbackGeometry = fallbackTargetId ? geometries.find((geometry) => geometry.id === fallbackTargetId) : undefined;
  const targetId = directionalTargetId ?? fallbackTargetId;
  const resolvedDirectionalRelationship = directionalGeometry
    ? resolvePageShellDropRelationship(
      directionalGeometry,
      pointerX,
      pointerY,
      previousTarget?.targetId === directionalTargetId ? previousTarget.relationship : undefined,
    )
    : fallbackGeometry && pointerY < fallbackGeometry.top
      ? "before"
      : fallbackGeometry && pointerY > fallbackGeometry.bottom
        ? "after"
        : "before";
  const relationship = resolvedDirectionalRelationship;
  const targetInsertionIndex = directionalTargetId
    ? getPageShellTargetInsertionIndex(orderWithoutSource, directionalTargetId, relationship)
    : undefined;
  const resolvedInsertionIndex = targetInsertionIndex ?? insertionIndex;
  const centerStart = getPageShellCenteredColumnStart(sourceSpan);
  const centeredGeometry = gridBounds ? getPageShellGridColumnGeometry(gridBounds, centerStart, sourceSpan) : null;
  const trackWidth = gridBounds
    ? (gridBounds.width - PAGE_SHELL_PACKING_GAP_PX * 11) / 12
    : 0;
  const sourceGeometry = geometries.find((geometry) => geometry.id === sourceId);
  const sourceWidth = sourceGeometry && sourceGeometry.right > sourceGeometry.left
    ? sourceGeometry.right - sourceGeometry.left
    : centeredGeometry?.width ?? 0;
  const workspaceCenter = gridBounds ? gridBounds.left + gridBounds.width / 2 : 0;
  const intendedCenter = intendedLeft + sourceWidth / 2;
  const centerSnapZone = Math.max(PAGE_SHELL_CENTER_SNAP_ZONE_PX, trackWidth);
  const sourceIsCentered = isPageShellCenteredPlacement(placements[sourceId]);
  const directColumnStart = gridBounds
    ? getPageShellGridStartFromPointer(gridBounds, pointerX, sourceSpan, grabOffsetX)
    : placements[sourceId]?.columnStart ?? packedPositions[sourceId]?.columnStart ?? 1;
  const directGeometry = gridBounds ? getPageShellGridColumnGeometry(gridBounds, directColumnStart, sourceSpan) : null;
  const directDropJoinsInsertionRow = directDropFitsInsertionRow(
    geometries,
    sourceId,
    targetId,
    pointerY,
    directGeometry,
  );
  const requiresHalfTrackCenter = sourceSpan % 2 === 1;
  const shouldCenter = !directionalGeometry
    && requiresHalfTrackCenter
    && !directDropJoinsInsertionRow
    && sourceSpan < PAGE_SHELL_OPTIONS_LAST
    && centeredGeometry !== null
    && Math.abs(intendedCenter - workspaceCenter) <= centerSnapZone + (sourceIsCentered ? PAGE_SHELL_CENTER_SNAP_HYSTERESIS_PX : 0);
  if (shouldCenter) {
    return {
      columnStart: centerStart,
      insertionIndex: resolvedInsertionIndex,
      laneOrder: 0,
      mode: "centered",
      relationship,
      rowOffsetSteps: 0,
      targetId,
    };
  }

  const sameRowBounds = (relationship === "left" || relationship === "right" || relationship === "replace")
    ? getPageShellSameRowVerticalBounds(geometries, sourceId, directionalTargetId)
    : null;
  const rowOffsetSteps = sameRowBounds && sourceGeometry && (relationship === "left" || relationship === "right")
    ? axisIntent === "vertical"
      ? getPageShellVerticalOffsetSteps(
        pointerY - (Number.isFinite(grabOffsetY) ? grabOffsetY : 0),
        sameRowBounds.top,
        Math.max(0, sourceGeometry.bottom - sourceGeometry.top),
        sameRowBounds.bottom,
      )
      : getPageShellPlacementRowOffsetSteps(placements[sourceId])
    : 0;
  return {
    columnStart: getPageShellTargetColumnStart(
      relationship,
      directionalTargetId,
      sourceSpan,
      directColumnStart,
      packedPositions,
    ),
    insertionIndex: resolvedInsertionIndex,
    laneOrder: 0,
    relationship,
    rowOffsetSteps,
    targetId,
  };
}

/**
 * Applies a drop to order plus the shell's preferred snapped grid start.
 * `laneOrder` is intentionally untouched on unrelated legacy placements.
 */
export function placePageShellAtDrop(
  layout: PageShellLayoutPreference,
  visibleShellIds: readonly string[],
  sourceId: string,
  target: PageShellDropTarget,
) {
  const currentVisibleOrder = projectVisiblePageShellOrder(layout.order, visibleShellIds);
  let nextVisibleOrder: string[];
  if (target.relationship === "replace" && target.targetId && currentVisibleOrder.includes(target.targetId)) {
    nextVisibleOrder = [...currentVisibleOrder];
    const sourceIndex = nextVisibleOrder.indexOf(sourceId);
    const targetIndex = nextVisibleOrder.indexOf(target.targetId);
    if (sourceIndex >= 0 && targetIndex >= 0) {
      nextVisibleOrder[sourceIndex] = target.targetId;
      nextVisibleOrder[targetIndex] = sourceId;
    }
  } else {
    nextVisibleOrder = reorderPageShellOrderAt(
      currentVisibleOrder,
      sourceId,
      target.insertionIndex,
    );
  }
  const mergedOrder = mergeVisiblePageShellOrder(layout.order, nextVisibleOrder, visibleShellIds);
  const nextPlacements = Object.fromEntries(Object.entries(layout.placements ?? {}).map(([id, placement]) => [id, { ...placement }])) as Record<string, PageShellPlacement>;
  const existingPlacement = normalizePageShellPlacement(nextPlacements[sourceId] ?? { columnStart: 1, laneOrder: 0 }, layout.sizes[sourceId]?.span);
  const sourceSpan = layout.sizes[sourceId]?.span;
  const targetIsCentered = target.mode === "centered" && sourceSpan !== undefined && sourceSpan % 2 === 1;
  const nextPlacement = {
    ...existingPlacement,
    columnStart: target.columnStart,
    laneOrder: 0,
    ...(targetIsCentered ? { mode: "centered" as const } : {}),
    rowOffsetSteps: targetIsCentered ? 0 : target.rowOffsetSteps ?? 0,
  };
  if (!targetIsCentered) delete nextPlacement.mode;
  nextPlacements[sourceId] = sourceSpan === undefined
    ? nextPlacement
    : normalizePageShellPlacement(nextPlacement, sourceSpan);
  if (target.relationship === "replace" && target.targetId && sourceSpan !== undefined) {
    const targetSpan = layout.sizes[target.targetId]?.span;
    const existingTargetPlacement = nextPlacements[target.targetId];
    if (targetSpan !== undefined && existingTargetPlacement) {
      const swappedTargetPlacement = {
        ...normalizePageShellPlacement(existingTargetPlacement, targetSpan),
        columnStart: existingPlacement.columnStart,
        laneOrder: existingPlacement.laneOrder ?? 0,
        rowOffsetSteps: existingPlacement.rowOffsetSteps ?? 0,
      };
      if (existingPlacement.mode === "centered") swappedTargetPlacement.mode = "centered";
      else delete swappedTargetPlacement.mode;
      nextPlacements[target.targetId] = normalizePageShellPlacement(swappedTargetPlacement, targetSpan);
    }
  }
  return { order: mergedOrder, placements: nextPlacements };
}

function clonePageShellPlacements(placements: Readonly<Record<string, PageShellPlacement>> | undefined) {
  return Object.fromEntries(Object.entries(placements ?? {}).map(([id, placement]) => [id, { ...placement }])) as Record<string, PageShellPlacement>;
}

function getPageShellSpanForMove(layout: PageShellLayoutPreference, id: string) {
  return layout.sizes[id]?.span ?? PAGE_SHELL_OPTIONS_LAST;
}

function getPageShellRowWidth(
  ids: readonly string[],
  layout: PageShellLayoutPreference,
) {
  return ids.reduce((total, id) => total + getPageShellSpanForMove(layout, id), 0);
}

function getPageShellRowIds(
  ids: readonly string[],
  positions: Readonly<Record<string, PageShellPackedPosition>>,
  rowStart: number,
  excludedId?: string,
) {
  return ids
    .filter((id) => id !== excludedId && positions[id]?.rowStart === rowStart)
    .sort((left, right) => (
      (positions[left]?.columnStart ?? Number.MAX_SAFE_INTEGER) - (positions[right]?.columnStart ?? Number.MAX_SAFE_INTEGER)
      || ids.indexOf(left) - ids.indexOf(right)
    ));
}

function getPageShellStructuralRowKey(
  id: string,
  layout: Pick<PageShellLayoutPreference, "placements">,
  positions: Readonly<Record<string, PageShellPackedPosition>>,
) {
  const position = positions[id];
  if (!position) return undefined;
  const placement = layout.placements?.[id];
  const offsetRows = isPageShellCenteredPlacement(placement)
    ? 0
    : Math.round(getPageShellPlacementRowOffsetSteps(placement) * PAGE_SHELL_VERTICAL_PLACEMENT_SNAP_PX / PAGE_SHELL_PACKING_ROW_UNIT_PX);
  return position.rowStart - offsetRows;
}

function getPageShellStructuralRows(
  visibleShellIds: readonly string[],
  layout: Pick<PageShellLayoutPreference, "placements">,
  positions: Readonly<Record<string, PageShellPackedPosition>>,
) {
  const rows = new Map<number, string[]>();
  visibleShellIds.forEach((id) => {
    const key = getPageShellStructuralRowKey(id, layout, positions);
    if (key === undefined) return;
    rows.set(key, [...(rows.get(key) ?? []), id]);
  });
  const visibleOrder = new Map(visibleShellIds.map((id, index) => [id, index]));
  return Array.from(rows, ([key, ids]) => ({
    ids: ids.sort((left, right) => (
      (positions[left]?.columnStart ?? Number.MAX_SAFE_INTEGER) - (positions[right]?.columnStart ?? Number.MAX_SAFE_INTEGER)
      || (visibleOrder.get(left) ?? Number.MAX_SAFE_INTEGER) - (visibleOrder.get(right) ?? Number.MAX_SAFE_INTEGER)
    )),
    key,
  })).sort((left, right) => left.key - right.key);
}

function getPageShellDirectionalTargetInsertionIndex(
  visibleShellIds: readonly string[],
  sourceId: string,
  targetId: string,
  relationship: "before" | "after" | "left" | "right",
) {
  const orderWithoutSource = visibleShellIds.filter((id) => id !== sourceId);
  const targetIndex = orderWithoutSource.indexOf(targetId);
  if (targetIndex < 0) return undefined;
  return relationship === "after" || relationship === "right" ? targetIndex + 1 : targetIndex;
}

/**
 * Resolves one precise toolbar movement from the packed 12-column layout.
 * Structural row keys remove persisted vertical detents so offset shells stay
 * in the row they belong to even when their rendered row starts differ.
 */
export function getPageShellDirectionalMoveTarget({
  direction,
  layout,
  packedPositions,
  sourceId,
  visibleShellIds,
}: {
  direction: PageShellDirectionalMoveDirection;
  layout: Pick<PageShellLayoutPreference, "placements">;
  packedPositions: Readonly<Record<string, PageShellPackedPosition>>;
  sourceId: string;
  visibleShellIds: readonly string[];
}): PageShellDropTarget | null {
  const sourcePosition = packedPositions[sourceId];
  if (!sourcePosition || !visibleShellIds.includes(sourceId)) return null;
  const rows = getPageShellStructuralRows(visibleShellIds, layout, packedPositions);
  const sourceRowIndex = rows.findIndex((row) => row.ids.includes(sourceId));
  if (sourceRowIndex < 0) return null;
  const sourceRow = rows[sourceRowIndex];
  const sourceCenter = sourcePosition.columnStart + sourcePosition.columnSpan / 2;
  const visibleOrder = new Map(visibleShellIds.map((id, index) => [id, index]));
  let targetId: string | undefined;
  let relationship: PageShellDropRelationship;

  if (direction === "left" || direction === "right") {
    const candidates = sourceRow.ids.filter((id) => id !== sourceId && packedPositions[id]);
    const horizontalCandidates = direction === "left"
      ? candidates.filter((id) => (packedPositions[id]?.columnStart ?? Number.MAX_SAFE_INTEGER) + (packedPositions[id]?.columnSpan ?? 0) <= sourcePosition.columnStart)
        .sort((left, right) => (
          (packedPositions[right]?.columnStart ?? 0) + (packedPositions[right]?.columnSpan ?? 0)
          - ((packedPositions[left]?.columnStart ?? 0) + (packedPositions[left]?.columnSpan ?? 0))
          || (visibleOrder.get(left) ?? Number.MAX_SAFE_INTEGER) - (visibleOrder.get(right) ?? Number.MAX_SAFE_INTEGER)
        ))
      : candidates.filter((id) => sourcePosition.columnStart + sourcePosition.columnSpan <= (packedPositions[id]?.columnStart ?? Number.MAX_SAFE_INTEGER))
        .sort((left, right) => (
          (packedPositions[left]?.columnStart ?? Number.MAX_SAFE_INTEGER) - (packedPositions[right]?.columnStart ?? Number.MAX_SAFE_INTEGER)
          || (visibleOrder.get(left) ?? Number.MAX_SAFE_INTEGER) - (visibleOrder.get(right) ?? Number.MAX_SAFE_INTEGER)
        ));
    targetId = horizontalCandidates[0];
    relationship = direction;
  } else {
    const targetRow = rows[direction === "up" ? sourceRowIndex - 1 : sourceRowIndex + 1];
    if (!targetRow) return null;
    targetId = [...targetRow.ids]
      .sort((left, right) => (
        Math.abs((packedPositions[left]?.columnStart ?? 0) + (packedPositions[left]?.columnSpan ?? 0) / 2 - sourceCenter)
        - Math.abs((packedPositions[right]?.columnStart ?? 0) + (packedPositions[right]?.columnSpan ?? 0) / 2 - sourceCenter)
        || (visibleOrder.get(left) ?? Number.MAX_SAFE_INTEGER) - (visibleOrder.get(right) ?? Number.MAX_SAFE_INTEGER)
      ))[0];
    relationship = direction === "up" ? "before" : "after";
  }

  if (!targetId) return null;
  const targetPosition = packedPositions[targetId];
  const insertionIndex = getPageShellDirectionalTargetInsertionIndex(visibleShellIds, sourceId, targetId, relationship);
  if (!targetPosition || insertionIndex === undefined) return null;
  const sourcePlacement = layout.placements?.[sourceId];
  const isVerticalMove = direction === "up" || direction === "down";
  const sourceIsOddCentered = sourcePosition.columnSpan % 2 === 1 && isPageShellCenteredPlacement(sourcePlacement);
  return {
    columnStart: sourceIsOddCentered ? getPageShellCenteredColumnStart(sourcePosition.columnSpan) : targetPosition.columnStart,
    insertionIndex,
    laneOrder: 0,
    ...(sourceIsOddCentered ? { mode: "centered" as const } : {}),
    relationship,
    rowOffsetSteps: isVerticalMove ? 0 : getPageShellPlacementRowOffsetSteps(sourcePlacement),
    ...(isVerticalMove ? { structuralRow: direction === "up" ? "above" as const : "below" as const } : {}),
    targetId,
  };
}

function getPageShellMaxWidthMessage(maxWidth: number) {
  return `Planned move doesn't fit. This shell must be ${Math.max(0, maxWidth)}/12 wide to move here.`;
}

function getPageShellMoveFailure(
  reason: PageShellMoveFailureReason,
  options: { maxWidth?: number; targetRowWidth?: number } = {},
): PageShellMovePlan {
  const { maxWidth, targetRowWidth } = options;
  if (maxWidth !== undefined) {
    return {
      valid: false,
      reason,
      maxWidth,
      ...(targetRowWidth === undefined ? {} : { targetRowWidth }),
      message: getPageShellMaxWidthMessage(maxWidth),
    };
  }
  const message = reason === "INVALID_CENTER_PLACEMENT"
    ? "Planned Center placement isn't available here."
    : reason === "INVALID_VERTICAL_PLACEMENT"
      ? "Planned vertical position is blocked."
      : reason === "COLLISION"
        ? "Planned move collides with another shell."
        : "Planned move is not available here.";
  return {
    valid: false,
    reason,
    ...(targetRowWidth === undefined ? {} : { targetRowWidth }),
    message,
  };
}

function getPageShellMovePlacementRowOffset(placement: PageShellPlacement | undefined) {
  return getPageShellPlacementRowOffsetSteps(placement) * PAGE_SHELL_VERTICAL_PLACEMENT_SNAP_PX / PAGE_SHELL_PACKING_ROW_UNIT_PX;
}

function setPageShellPlannedRowStarts(
  plannedPositions: Record<string, PageShellPackedPosition>,
  rowIds: readonly string[],
  rowStart: number,
  layout: PageShellLayoutPreference,
) {
  let columnStart = Math.max(1, Math.min(13 - getPageShellSpanForMove(layout, rowIds[0] ?? ""), Math.min(...rowIds.map((id) => plannedPositions[id]?.columnStart ?? 1))));
  const totalWidth = getPageShellRowWidth(rowIds, layout);
  if (totalWidth <= 12) {
    columnStart = Math.max(1, Math.min(columnStart, 13 - totalWidth));
  }
  for (const id of rowIds) {
    const current = plannedPositions[id];
    if (!current) continue;
    const span = getPageShellSpanForMove(layout, id);
    plannedPositions[id] = { ...current, columnStart, rowStart };
    columnStart += span;
  }
}

function packPageShellMoveCandidate(
  candidate: PageShellLayoutPreference,
  visibleShellIds: readonly string[],
  naturalHeights: Readonly<Record<string, number>> | undefined,
  chromeHeightPx: number | undefined,
) {
  return packPageShellLayout(projectVisiblePageShellOrder(candidate.order, visibleShellIds), candidate.sizes, {
    chromeHeightPx,
    naturalHeights,
    placements: candidate.placements,
  });
}

function validatePageShellRepackedRows(
  candidate: PageShellLayoutPreference,
  candidatePositions: Readonly<Record<string, PageShellPackedPosition>>,
  affectedRows: readonly (readonly string[])[],
) {
  for (const rowIds of affectedRows) {
    const positions = rowIds.map((id) => candidatePositions[id]);
    if (positions.some((position) => !position)) return getPageShellMoveFailure("INVALID_TARGET");
    const rowBaseline = Math.min(...rowIds.map((id) => {
      const placement = candidate.placements?.[id];
      const offsetRows = isPageShellCenteredPlacement(placement) ? 0 : getPageShellMovePlacementRowOffset(placement);
      return (candidatePositions[id]?.rowStart ?? Number.MAX_SAFE_INTEGER) - offsetRows;
    }));
    for (const id of rowIds) {
      const position = candidatePositions[id];
      if (!position) return getPageShellMoveFailure("INVALID_TARGET");
      const placement = candidate.placements?.[id];
      const expectedColumnStart = placement?.columnStart;
      const offsetRows = isPageShellCenteredPlacement(placement) ? 0 : getPageShellMovePlacementRowOffset(placement);
      if (expectedColumnStart !== undefined && position.columnStart !== expectedColumnStart) {
        return getPageShellMoveFailure("COLLISION");
      }
      if (position.rowStart !== rowBaseline + offsetRows) {
        return getPageShellMoveFailure(offsetRows > 0 || expectedColumnStart !== undefined ? "COLLISION" : "INVALID_VERTICAL_PLACEMENT");
      }
    }
  }
  return null;
}

/**
 * Plans and validates one explicit shell move. The general packer is not used
 * as a fallback here: a direct move either fits the requested structure or
 * returns no candidate layout.
 */
export function planPageShellMove({
  chromeHeightPx,
  layout,
  naturalHeights,
  visibleShellIds,
  sourceId,
  target,
  packedPositions,
}: PageShellMovePlanningInput): PageShellMovePlan {
  const visibleOrder = projectVisiblePageShellOrder(layout.order, visibleShellIds);
  const sourcePosition = packedPositions[sourceId];
  const sourceSpan = getPageShellSpanForMove(layout, sourceId);
  const targetId = target.targetId;
  const targetPosition = targetId ? packedPositions[targetId] : undefined;
  if (!visibleOrder.includes(sourceId) || (targetId !== null && !visibleOrder.includes(targetId)) || sourceId === targetId || !sourcePosition) {
    return getPageShellMoveFailure("INVALID_TARGET");
  }

  const placed = placePageShellAtDrop(layout, visibleShellIds, sourceId, target);
  const candidate = clonePageShellLayout(layout);
  candidate.order = [...placed.order];
  candidate.placements = clonePageShellPlacements(placed.placements);
  const plannedPositions = Object.fromEntries(Object.entries(packedPositions).map(([id, position]) => [id, { ...position }])) as Record<string, PageShellPackedPosition>;
  const relationship = target.relationship ?? "before";

  if (target.mode === "centered" && sourceSpan % 2 === 1) {
    const centeredStart = getPageShellCenteredColumnStart(sourceSpan);
    if (target.columnStart !== centeredStart) {
      return getPageShellMoveFailure("INVALID_CENTER_PLACEMENT");
    }
    const candidatePositions = packPageShellMoveCandidate(candidate, visibleShellIds, naturalHeights, chromeHeightPx);
    const sourceCandidatePosition = candidatePositions[sourceId];
    if (!sourceCandidatePosition || sourceCandidatePosition.columnStart !== centeredStart) {
      return getPageShellMoveFailure("INVALID_CENTER_PLACEMENT");
    }
    return { valid: true, layout: candidate };
  }

  if (!targetPosition) {
    const candidatePositions = packPageShellMoveCandidate(candidate, visibleShellIds, naturalHeights, chromeHeightPx);
    if (candidatePositions[sourceId]?.columnStart !== target.columnStart) {
      return getPageShellMoveFailure("COLLISION");
    }
    return { valid: true, layout: candidate };
  }
  if (!targetId) return getPageShellMoveFailure("INVALID_TARGET");

  // A full-width shell cannot join an occupied row, but an explicit vertical
  // move still has a valid structural destination. Keep it as its own row and
  // let the normal packer reflow the affected and downstream rows.
  const isStandaloneStructuralRowMove = target.structuralRow === (relationship === "before" ? "above" : relationship === "after" ? "below" : undefined);
  if (sourceSpan === PAGE_SHELL_OPTIONS_LAST && isStandaloneStructuralRowMove) {
    const candidatePositions = packPageShellMoveCandidate(candidate, visibleShellIds, naturalHeights, chromeHeightPx);
    const sourceCandidatePosition = candidatePositions[sourceId];
    const targetCandidatePosition = candidatePositions[targetId];
    const isOnRequestedSide = sourceCandidatePosition && targetCandidatePosition && (
      relationship === "before"
        ? sourceCandidatePosition.rowStart < targetCandidatePosition.rowStart
        : sourceCandidatePosition.rowStart > targetCandidatePosition.rowStart
    );
    if (!sourceCandidatePosition || !targetCandidatePosition || sourceCandidatePosition.columnStart !== 1 || !isOnRequestedSide) {
      return getPageShellMoveFailure("INVALID_VERTICAL_PLACEMENT");
    }
    return { valid: true, layout: candidate };
  }

  const targetRowIds = getPageShellRowIds(visibleShellIds, packedPositions, targetPosition.rowStart, sourceId);
  const sourceRowIds = getPageShellRowIds(visibleShellIds, packedPositions, sourcePosition.rowStart, sourceId);
  const sourceWasInTargetRow = sourcePosition.rowStart === targetPosition.rowStart;
  const targetRowWithoutTarget = targetRowIds.filter((id) => id !== targetId);

  if (relationship === "replace") {
    const destinationRowWidth = getPageShellRowWidth(targetRowWithoutTarget, layout) + sourceSpan;
    if (destinationRowWidth > 12) {
      return getPageShellMoveFailure("ROW_WIDTH_EXCEEDED", {
        maxWidth: 12 - getPageShellRowWidth(targetRowWithoutTarget, layout),
        targetRowWidth: destinationRowWidth,
      });
    }
    if (!sourceWasInTargetRow) {
      const sourceRowWithoutSource = sourceRowIds;
      const sourceRowWidth = getPageShellRowWidth(sourceRowWithoutSource, layout) + getPageShellSpanForMove(layout, targetId);
      if (sourceRowWidth > 12) {
        return getPageShellMoveFailure("ROW_WIDTH_EXCEEDED", {
          targetRowWidth: sourceRowWidth,
        });
      }
    }
    const candidatePositions = packPageShellMoveCandidate(candidate, visibleShellIds, naturalHeights, chromeHeightPx);
    const destinationRowIds = [...targetRowIds.filter((id) => id !== targetId), sourceId];
    const sourceDestinationRowIds = [...sourceRowIds.filter((id) => id !== sourceId), targetId];
    const affectedRows = sourceWasInTargetRow
      ? [Array.from(new Set([...destinationRowIds, ...sourceDestinationRowIds]))]
      : [destinationRowIds, sourceDestinationRowIds];
    const failure = validatePageShellRepackedRows(candidate, candidatePositions, affectedRows);
    return failure ?? { valid: true, layout: candidate };
  }

  const nextRowIds = [...targetRowIds];
  const existingSourceIndex = nextRowIds.indexOf(sourceId);
  if (existingSourceIndex >= 0) nextRowIds.splice(existingSourceIndex, 1);
  const targetIndex = nextRowIds.indexOf(targetId);
  if (targetIndex < 0) return getPageShellMoveFailure("INVALID_TARGET");
  const insertionIndex = relationship === "after" || relationship === "right" ? targetIndex + 1 : targetIndex;
  nextRowIds.splice(insertionIndex, 0, sourceId);
  const targetRowWidth = getPageShellRowWidth(nextRowIds, layout);
  if (targetRowWidth > 12) {
    return getPageShellMoveFailure("ROW_WIDTH_EXCEEDED", {
      maxWidth: 12 - getPageShellRowWidth(nextRowIds.filter((id) => id !== sourceId), layout),
      targetRowWidth,
    });
  }

  setPageShellPlannedRowStarts(plannedPositions, nextRowIds, targetPosition.rowStart, candidate);
  const plannedSourcePlacement = candidate.placements?.[sourceId] ?? { columnStart: target.columnStart, laneOrder: 0 };
  const nextPlacements = clonePageShellPlacements(candidate.placements);
  for (const id of nextRowIds) {
    const position = plannedPositions[id];
    if (!position) continue;
    nextPlacements[id] = {
      ...(nextPlacements[id] ?? { columnStart: position.columnStart, laneOrder: 0 }),
      columnStart: position.columnStart,
    };
  }
  candidate.placements = nextPlacements;
  plannedPositions[sourceId] = {
    ...plannedPositions[sourceId],
    columnStart: plannedSourcePlacement.columnStart,
    rowStart: targetPosition.rowStart + getPageShellMovePlacementRowOffset(plannedSourcePlacement),
  };
  const candidatePositions = packPageShellMoveCandidate(candidate, visibleShellIds, naturalHeights, chromeHeightPx);
  const failure = validatePageShellRepackedRows(candidate, candidatePositions, [nextRowIds]);
  return failure ?? { valid: true, layout: candidate };
}

/**
 * Packs shells into the earliest available 12-column position. Order is the
 * vertical packing authority; columnStart is only each shell's preferred
 * horizontal grid start. Coordinates remain runtime-only.
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

  function getRowSpan(id: string) {
    const size = sizes[id] ?? { heightPx: null, span: 12 as PageShellSpan };
    const heightPx = size.heightPx ?? naturalHeights[id] ?? PAGE_SHELL_MIN_HEIGHT;
    return Math.max(1, Math.ceil((Math.max(1, heightPx) + chromeHeightPx + gapPx) / rowUnitPx));
  }

  function findNearestLegalRow(
    baseRow: number,
    requestedRow: number,
    rowSpan: number,
    column: number,
    columnSpan: number,
  ) {
    const safeRequestedRow = Math.max(baseRow, requestedRow);
    if (canPlace(safeRequestedRow, column, rowSpan, columnSpan)) return safeRequestedRow;
    for (let distance = 1; distance <= PAGE_SHELL_MAX_VERTICAL_OFFSET_STEPS * 4; distance += 1) {
      const upwardRow = safeRequestedRow - distance;
      if (upwardRow >= baseRow && canPlace(upwardRow, column, rowSpan, columnSpan)) return upwardRow;
      const downwardRow = safeRequestedRow + distance;
      if (canPlace(downwardRow, column, rowSpan, columnSpan)) return downwardRow;
    }
    let fallbackRow = safeRequestedRow;
    while (!canPlace(fallbackRow, column, rowSpan, columnSpan)) fallbackRow += 1;
    return fallbackRow;
  }

  function getPreferredColumn(id: string) {
    const size = sizes[id] ?? { heightPx: null, span: 12 as PageShellSpan };
    const placement = placements[id]
      ? normalizePageShellPlacement(placements[id], size.span)
      : undefined;
    if (!placement || isPageShellCenteredPlacement(placement)) return null;
    return {
      column: Math.max(0, Math.min(12 - size.span, Math.round(placement.columnStart) - 1)),
      span: size.span,
    };
  }

  function canSharePreferredRow(groupIds: readonly string[], id: string) {
    const candidate = getPreferredColumn(id);
    if (!candidate) return false;
    const candidateTotal = groupIds.reduce<number>((total, groupId) => total + (sizes[groupId]?.span ?? PAGE_SHELL_OPTIONS_LAST), candidate.span);
    if (candidateTotal > 12) return false;
    return groupIds.every((groupId) => {
      const existing = getPreferredColumn(groupId);
      return Boolean(existing && (
        existing.column + existing.span <= candidate.column
        || candidate.column + candidate.span <= existing.column
      ));
    });
  }

  function packRegion(regionIds: readonly string[], regionStartRow: number) {
    let regionBottom = regionStartRow;

    const packShell = (id: string, requestedRegionStartRow: number) => {
      const size = sizes[id] ?? { heightPx: null, span: 12 as PageShellSpan };
      const rowSpan = getRowSpan(id);
      const placement = placements[id]
        ? normalizePageShellPlacement(placements[id], size.span)
        : undefined;
      const preferredColumn = placement && !isPageShellCenteredPlacement(placement)
        ? Math.max(0, Math.min(12 - size.span, Math.round(placement.columnStart) - 1))
        : null;
      let baseRow = requestedRegionStartRow;
      let column = 0;
      if (preferredColumn !== null) {
        column = preferredColumn;
        while (!canPlace(baseRow, column, rowSpan, size.span)) baseRow += 1;
      } else {
        while (true) {
          let foundColumn = false;
          for (let candidateColumn = 0; candidateColumn <= 12 - size.span; candidateColumn += 1) {
            if (canPlace(baseRow, candidateColumn, rowSpan, size.span)) {
              column = candidateColumn;
              foundColumn = true;
              break;
            }
          }
          if (foundColumn) break;
          baseRow += 1;
        }
      }
      const offsetRows = placement && !isPageShellCenteredPlacement(placement)
        ? Math.round(getPageShellPlacementRowOffsetSteps(placement) * PAGE_SHELL_VERTICAL_PLACEMENT_SNAP_PX / rowUnitPx)
        : 0;
      const row = findNearestLegalRow(baseRow, baseRow + offsetRows, rowSpan, column, size.span);
      markOccupied(row, column, rowSpan, size.span);
      positions[id] = {
        columnSpan: size.span,
        columnStart: column + 1,
        rowSpan,
        rowStart: row + 1,
      };
      return row + rowSpan;
    };

    const packPreferredRow = (groupIds: readonly string[], requestedRegionStartRow: number) => {
      let row = requestedRegionStartRow;
      while (!groupIds.every((id) => {
        const size = sizes[id] ?? { heightPx: null, span: 12 as PageShellSpan };
        const preferred = getPreferredColumn(id);
        const placement = placements[id] ? normalizePageShellPlacement(placements[id], size.span) : undefined;
        const offsetRows = placement && !isPageShellCenteredPlacement(placement)
          ? Math.round(getPageShellPlacementRowOffsetSteps(placement) * PAGE_SHELL_VERTICAL_PLACEMENT_SNAP_PX / rowUnitPx)
          : 0;
        return preferred !== null && canPlace(row + offsetRows, preferred.column, getRowSpan(id), size.span);
      })) row += 1;
      let groupBottom = row;
      for (const id of groupIds) {
        const size = sizes[id] ?? { heightPx: null, span: 12 as PageShellSpan };
        const preferred = getPreferredColumn(id);
        const placement = placements[id] ? normalizePageShellPlacement(placements[id], size.span) : undefined;
        if (!preferred) continue;
        const offsetRows = placement && !isPageShellCenteredPlacement(placement)
          ? Math.round(getPageShellPlacementRowOffsetSteps(placement) * PAGE_SHELL_VERTICAL_PLACEMENT_SNAP_PX / rowUnitPx)
          : 0;
        const placedRow = row + offsetRows;
        markOccupied(placedRow, preferred.column, getRowSpan(id), size.span);
        positions[id] = {
          columnSpan: size.span,
          columnStart: preferred.column + 1,
          rowSpan: getRowSpan(id),
          rowStart: placedRow + 1,
        };
        groupBottom = Math.max(groupBottom, placedRow + getRowSpan(id));
      }
      return groupBottom;
    };

    const groups: string[][] = [];
    for (const id of regionIds) {
      const currentGroup = groups[groups.length - 1];
      if (currentGroup && canSharePreferredRow(currentGroup, id)) currentGroup.push(id);
      else groups.push([id]);
    }
    for (const group of groups) {
      const groupBottom = group.length > 1
        ? packPreferredRow(group, regionBottom)
        : packShell(group[0], regionBottom);
      regionBottom = Math.max(regionBottom, groupBottom);
    }
    return regionBottom;
  }

  let regionIds: string[] = [];
  let nextRegionRow = 0;
  const flushRegion = () => {
    if (regionIds.length === 0) return;
    nextRegionRow = packRegion(regionIds, nextRegionRow);
    regionIds = [];
  };

  for (const id of order) {
    const size = sizes[id] ?? { heightPx: null, span: 12 as PageShellSpan };
    const placement = placements[id]
      ? normalizePageShellPlacement(placements[id], size.span)
      : undefined;
    const isCentered = isPageShellCenteredPlacement(placement);
    if (size.span !== PAGE_SHELL_OPTIONS_LAST && !isCentered) {
      regionIds.push(id);
      continue;
    }

    flushRegion();
    const rowSpan = getRowSpan(id);
    const columnStart = isCentered ? getPageShellCenteredColumnStart(size.span) : 1;
    const columnSpan = isCentered ? size.span : PAGE_SHELL_OPTIONS_LAST;
    markOccupied(nextRegionRow, columnStart - 1, rowSpan, columnSpan);
    positions[id] = {
      columnSpan,
      columnStart,
      rowSpan,
      rowStart: nextRegionRow + 1,
    };
    nextRegionRow += rowSpan;
  }
  flushRegion();

  return positions;
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
  return `W ${span}/12${width} · H ${formatHeight(heightPx ?? naturalHeight)}px · Natural ${formatHeight(naturalHeight)}px`;
}

function getSafePageShellNaturalHeight(naturalHeight: number) {
  return Number.isFinite(naturalHeight) && naturalHeight > 0 ? naturalHeight : PAGE_SHELL_MIN_HEIGHT;
}

/** Returns the smallest useful custom height without expanding a naturally short shell. */
export function getPageShellShrinkHeight(naturalHeight: number) {
  return Math.min(PAGE_SHELL_MIN_HEIGHT, getSafePageShellNaturalHeight(naturalHeight));
}

/** Snaps a manual resize within the shared custom-height safety bound. */
export function clampPageShellHeight(value: number, naturalHeight: number): number | null {
  const safeNaturalHeight = getSafePageShellNaturalHeight(naturalHeight);
  const safeValue = Number.isFinite(value) ? value : safeNaturalHeight;
  if (safeNaturalHeight < PAGE_SHELL_MIN_HEIGHT && safeValue <= safeNaturalHeight) return null;
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
  defaultPlacements: Readonly<Record<string, PageShellPlacement>> = {},
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
  const placementDefaults = stored === null || stored === undefined ? defaultPlacements : {};
  const placementSource = Object.keys(storedPlacements).length > 0 ? storedPlacements : placementDefaults;
  const placements: Record<string, PageShellPlacement> = {};
  for (const id of order) {
    if (Object.prototype.hasOwnProperty.call(placementSource, id)) {
      placements[id] = normalizePageShellPlacement(placementSource[id], sizes[id]?.span);
    }
  }
  const packedPositions = packPageShellLayout(order, sizes, { placements });
  const derivedPlacements = placementsFromPackedPositions(order, sizes, packedPositions, placements);
  // The persisted order is now the vertical authority. Placement hints never
  // reorder it; they only provide each shell's preferred horizontal start.
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
  defaultPlacements?: Readonly<Record<string, PageShellPlacement>>,
) {
  const storedLayouts = readStoredPageShellLayouts(storage, storageKey);
  return normalizePageShellLayout(
    storedLayouts[pageKey],
    defaults,
    defaultSizes,
    PAGE_SHELL_LEGACY_ID_REPLACEMENTS[pageKey],
    defaultPlacements ?? PAGE_SHELL_PAGE_REGISTRY.get(pageKey)?.canonicalLayout.placements ?? {},
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
 * The operation is idempotent, preserves legacy placement data, and never
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
