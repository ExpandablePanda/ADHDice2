export type HudWidgetType =
  | "dark_mode"
  | "calm"
  | "sync_status"
  | "xp"
  | "points"
  | "tokens"
  | "streak"
  | "notification_inbox"
  | "focus_alarm"
  | "focus_timer"
  | "zoom"
  | "new_task"
  | "refocus"
  | "quick_capture"
  | "task_counts";

export type HudWidgetSize = "1x1" | "1x2" | "2x1" | "2x2";

export type HudWidgetLayoutItem = {
  heightPx?: number;
  id: string;
  size: HudWidgetSize;
  type: HudWidgetType;
  widthPx?: number;
};

export type HudPage = {
  id: "overview" | "command";
  title: string;
  widgets: HudWidgetLayoutItem[];
};

export type HudUiState = {
  activeHudPageId: HudPage["id"];
  hudPages: HudPage[];
  isHudCollapsed: boolean;
  hudUiVersion: number;
  isHudEditMode: boolean;
  selectedHudWidgetId: string | null;
};

export const HUD_UI_SCHEMA_VERSION = 4;
export const HUD_PAGE_IDS: HudPage["id"][] = ["overview", "command"];
export const HUD_WIDGET_TYPES: HudWidgetType[] = [
  "dark_mode",
  "calm",
  "sync_status",
  "xp",
  "points",
  "tokens",
  "streak",
  "notification_inbox",
  "focus_alarm",
  "focus_timer",
  "zoom",
  "new_task",
  "refocus",
  "quick_capture",
  "task_counts",
];

export const HUD_WIDGET_LABELS: Record<HudWidgetType, string> = {
  calm: "Calm",
  dark_mode: "Dark Mode",
  focus_alarm: "Focus Alarm",
  focus_timer: "Focus Timer",
  new_task: "New Task",
  notification_inbox: "Notifications",
  points: "Points",
  quick_capture: "Quick Capture",
  refocus: "Refocus",
  sync_status: "Sync Status",
  streak: "Streak",
  task_counts: "Task Counts",
  tokens: "Tokens",
  xp: "Level + XP",
  zoom: "Zoom",
};

const DEFAULT_WIDGET_SIZES: Record<HudWidgetType, HudWidgetSize> = {
  calm: "1x1",
  dark_mode: "1x1",
  focus_alarm: "2x1",
  focus_timer: "2x2",
  new_task: "1x1",
  notification_inbox: "1x1",
  points: "1x1",
  quick_capture: "1x1",
  refocus: "1x1",
  sync_status: "1x1",
  streak: "1x1",
  task_counts: "2x1",
  tokens: "1x1",
  xp: "2x1",
  zoom: "1x1",
};

function defaultWidget(type: HudWidgetType): HudWidgetLayoutItem {
  return {
    id: `hud-${type}`,
    size: DEFAULT_WIDGET_SIZES[type],
    type,
  };
}

export const DEFAULT_HUD_UI_STATE: HudUiState = {
  activeHudPageId: "overview",
  hudPages: [
    {
      id: "overview",
      title: "Overview",
      widgets: [
        defaultWidget("dark_mode"),
        defaultWidget("calm"),
        defaultWidget("sync_status"),
        defaultWidget("xp"),
        defaultWidget("points"),
        defaultWidget("tokens"),
        defaultWidget("streak"),
        defaultWidget("notification_inbox"),
        defaultWidget("focus_alarm"),
      ],
    },
    {
      id: "command",
      title: "Command",
      widgets: [
        defaultWidget("focus_timer"),
        defaultWidget("zoom"),
        defaultWidget("new_task"),
        defaultWidget("refocus"),
        defaultWidget("quick_capture"),
        defaultWidget("task_counts"),
      ],
    },
  ],
  isHudCollapsed: false,
  hudUiVersion: HUD_UI_SCHEMA_VERSION,
  isHudEditMode: false,
  selectedHudWidgetId: null,
};

function isHudPageId(value: unknown): value is HudPage["id"] {
  return value === "overview" || value === "command";
}

function isHudWidgetType(value: unknown): value is HudWidgetType {
  return typeof value === "string" && HUD_WIDGET_TYPES.includes(value as HudWidgetType);
}

function isLegacyThemeWidget(value: unknown): value is { heightPx?: unknown; type: "theme" } {
  return Boolean(value) && typeof value === "object" && (value as { type?: unknown }).type === "theme";
}

function isHudWidgetSize(value: unknown): value is HudWidgetSize {
  return value === "1x1" || value === "1x2" || value === "2x1" || value === "2x2";
}

function normalizeHudWidget(value: unknown): HudWidgetLayoutItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<HudWidgetLayoutItem>;
  if (!isHudWidgetType(candidate.type)) {
    return null;
  }

  const widthPx = typeof candidate.widthPx === "number" && Number.isFinite(candidate.widthPx)
    ? Math.max(44, Math.min(640, Math.round(candidate.widthPx)))
    : undefined;
  const heightPx = typeof candidate.heightPx === "number" && Number.isFinite(candidate.heightPx)
    ? Math.max(36, Math.min(220, Math.round(candidate.heightPx)))
    : undefined;

  return {
    heightPx,
    id: typeof candidate.id === "string" && candidate.id.length > 0 ? candidate.id : `hud-${candidate.type}`,
    size: isHudWidgetSize(candidate.size) ? candidate.size : DEFAULT_WIDGET_SIZES[candidate.type],
    type: candidate.type,
    widthPx,
  };
}

function normalizePageWidgets(pageId: HudPage["id"], widgets: unknown, includeMissingDefaults: boolean): HudWidgetLayoutItem[] {
  const normalized = Array.isArray(widgets)
    ? widgets.flatMap((widget) => {
      if (isLegacyThemeWidget(widget)) {
        const heightPx = typeof widget.heightPx === "number" && Number.isFinite(widget.heightPx)
          ? Math.max(36, Math.min(220, Math.round(widget.heightPx)))
          : undefined;
        return [
          { ...defaultWidget("dark_mode"), heightPx, widthPx: 50 },
          { ...defaultWidget("calm"), heightPx, widthPx: 96 },
        ];
      }

      const normalizedWidget = normalizeHudWidget(widget);
      return normalizedWidget ? [normalizedWidget] : [];
    })
    : [];

  const deduped: HudWidgetLayoutItem[] = [];
  const seenTypes = new Set<HudWidgetType>();

  for (const widget of normalized) {
    if (seenTypes.has(widget.type)) {
      continue;
    }
    deduped.push(widget);
    seenTypes.add(widget.type);
  }

  const expectedTypes = DEFAULT_HUD_UI_STATE.hudPages.find((page) => page.id === pageId)?.widgets.map((widget) => widget.type) ?? [];
  if (deduped.length === 0) {
    return expectedTypes.map((type) => defaultWidget(type));
  }

  if (includeMissingDefaults) {
    for (const type of expectedTypes) {
      if (!seenTypes.has(type)) {
        deduped.push(defaultWidget(type));
        seenTypes.add(type);
      }
    }
  }

  return deduped;
}

export function normalizeHudUiState(value: unknown): HudUiState {
  if (!value || typeof value !== "object") {
    return DEFAULT_HUD_UI_STATE;
  }

  const candidate = value as Partial<HudUiState>;
  const incomingPages = Array.isArray(candidate.hudPages) ? candidate.hudPages : [];
  const includeMissingDefaults = candidate.hudUiVersion !== HUD_UI_SCHEMA_VERSION;

  const hudPages: HudPage[] = HUD_PAGE_IDS.map((pageId) => {
    const source = incomingPages.find((page) => page && typeof page === "object" && isHudPageId((page as Partial<HudPage>).id) && (page as Partial<HudPage>).id === pageId) as Partial<HudPage> | undefined;
    return {
      id: pageId,
      title: typeof source?.title === "string" && source.title.length > 0
        ? source.title
        : (DEFAULT_HUD_UI_STATE.hudPages.find((page) => page.id === pageId)?.title ?? pageId),
      widgets: normalizePageWidgets(pageId, source?.widgets, includeMissingDefaults),
    };
  });

  return {
    activeHudPageId: isHudPageId(candidate.activeHudPageId) ? candidate.activeHudPageId : DEFAULT_HUD_UI_STATE.activeHudPageId,
    hudPages,
    isHudCollapsed: candidate.isHudCollapsed === true,
    hudUiVersion: HUD_UI_SCHEMA_VERSION,
    isHudEditMode: candidate.isHudEditMode === true,
    selectedHudWidgetId: typeof candidate.selectedHudWidgetId === "string" ? candidate.selectedHudWidgetId : null,
  };
}
