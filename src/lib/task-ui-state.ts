import type { AgentPlanColumnId } from "@/components/ui/agent-plan";
import type { TaskEnergy, TaskStatus } from "@/lib/database.types";
import type { HudUiState } from "@/lib/task-hud-layout";
import { DEFAULT_HUD_UI_STATE, normalizeHudUiState } from "@/lib/task-hud-layout";

export type TaskViewMode = "table" | "list" | "cards" | "matrix" | "grid";
export type TasksSurface = "tasks" | "paths";
export type TaskQuickFilter = "active" | "done" | "urgent" | "today" | "focused";
export type AppPage =
  | "Home"
  | "Tasks"
  | "Focus"
  | "Roll"
  | "Achievements"
  | "Health"
  | "Games"
  | "Stats"
  | "Notes"
  | "Settings"
  | "Test";
export type PersistedTaskEditorUiState = {
  isOpen: boolean;
  mode: "create" | "edit";
  taskId: string | null;
};
export type TaskUiState = {
  duplicateTitleMode: boolean;
  matchAny: boolean;
  quickFilters: TaskQuickFilter[];
  search: string;
  selectedBucket: string;
  statusFilters: TaskStatus[];
  tasksSurface: TasksSurface;
  uiStateVersion: number;
  view: TaskViewMode;
  energyFilters: TaskEnergy[];
  visibleColumnsByView: Record<TaskViewMode, AgentPlanColumnId[]>;
};

export const TASK_UI_STORAGE_KEY = "adhdice-task-ui";
export const ACTIVE_PAGE_STORAGE_KEY = "adhdice-active-page";
export const TASK_ROUTING_STORAGE_KEY = "adhdice-task-routing";
export const TASK_FOCUS_STORAGE_KEY = "adhdice-task-focus";
export const DAILY_PLANNING_COLLAPSED_STORAGE_KEY = "adhdice-daily-planning-collapsed";
export const TASK_FILTERS_OPEN_STORAGE_KEY = "adhdice-task-filters-open";
export const TASK_EDITOR_UI_STORAGE_KEY = "adhdice-task-editor-ui";
export const TASK_GRID_STORAGE_KEY = "adhdice-task-grid-layout";
export const HUD_UI_STORAGE_KEY = "adhdice-hud-ui";

export const TASK_UI_SCHEMA_VERSION = 6;
export const VALID_TASK_VIEWS: TaskViewMode[] = ["table", "list", "cards", "matrix", "grid"];
export const VALID_LIST_COLUMN_IDS: AgentPlanColumnId[] = [
  "bucket",
  "date_added",
  "date_completed",
  "due",
  "estimated_time",
  "actual_time",
  "streak",
  "tags",
  "link",
  "notes",
  "priority",
  "energy",
  "repeat",
  "signal",
];

export const DEFAULT_TASK_TABLE_VISIBLE_COLUMNS: AgentPlanColumnId[] = [...VALID_LIST_COLUMN_IDS];
const DEFAULT_NON_TABLE_VISIBLE_COLUMNS = DEFAULT_TASK_TABLE_VISIBLE_COLUMNS.filter((columnId) => columnId !== "date_completed" && columnId !== "streak");
export const DEFAULT_VISIBLE_COLUMNS_BY_VIEW: Record<TaskViewMode, AgentPlanColumnId[]> = {
  table: [...DEFAULT_TASK_TABLE_VISIBLE_COLUMNS],
  list: [...DEFAULT_NON_TABLE_VISIBLE_COLUMNS],
  cards: [...DEFAULT_NON_TABLE_VISIBLE_COLUMNS],
  matrix: [...DEFAULT_NON_TABLE_VISIBLE_COLUMNS],
  grid: [...DEFAULT_NON_TABLE_VISIBLE_COLUMNS],
};
export const DEFAULT_TASK_UI_STATE: TaskUiState = {
  duplicateTitleMode: false,
  matchAny: true,
  quickFilters: [],
  search: "",
  selectedBucket: "today",
  statusFilters: [],
  tasksSurface: "tasks",
  uiStateVersion: TASK_UI_SCHEMA_VERSION,
  view: "table",
  energyFilters: [],
  visibleColumnsByView: DEFAULT_VISIBLE_COLUMNS_BY_VIEW,
};

export { DEFAULT_HUD_UI_STATE, normalizeHudUiState };
export type { HudPage, HudUiState, HudWidgetLayoutItem, HudWidgetSize, HudWidgetType } from "@/lib/task-hud-layout";

export function parseStoredJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  const rawValue = window.localStorage.getItem(key);
  if (!rawValue) {
    return fallback;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    window.localStorage.removeItem(key);
    return fallback;
  }
}

export function getUserScopedStorageKey(baseKey: string, userId: string) {
  return `${baseKey}:${userId}`;
}

export function isAppPage(value: unknown): value is AppPage {
  return value === "Home"
    || value === "Tasks"
    || value === "Focus"
    || value === "Roll"
    || value === "Achievements"
    || value === "Health"
    || value === "Games"
    || value === "Stats"
    || value === "Notes"
    || value === "Settings"
    || value === "Test";
}

function isTaskEditorMode(value: unknown): value is PersistedTaskEditorUiState["mode"] {
  return value === "create" || value === "edit";
}

export function normalizePersistedTaskEditorUiState(value: unknown): PersistedTaskEditorUiState {
  if (!value || typeof value !== "object") {
    return { isOpen: false, mode: "create", taskId: null };
  }

  const candidate = value as Partial<PersistedTaskEditorUiState>;
  return {
    isOpen: candidate.isOpen === true,
    mode: isTaskEditorMode(candidate.mode) ? candidate.mode : "create",
    taskId: typeof candidate.taskId === "string" ? candidate.taskId : null,
  };
}

export function migrateLegacyTaskUiState(state: Partial<TaskUiState>): TaskUiState {
  const nextView = VALID_TASK_VIEWS.includes(state.view as TaskViewMode)
    ? state.view as TaskViewMode
    : DEFAULT_TASK_UI_STATE.view;
  const nextBucket = typeof state.selectedBucket === "string" && state.selectedBucket.length > 0
    ? state.selectedBucket
    : DEFAULT_TASK_UI_STATE.selectedBucket;
  const nextVisibleColumnsByView = VALID_TASK_VIEWS.reduce<Record<TaskViewMode, AgentPlanColumnId[]>>((accumulator, view) => {
    const candidate = view === "table"
      ? state.visibleColumnsByView?.table ?? state.visibleColumnsByView?.list
      : state.visibleColumnsByView?.[view];
    const normalized = Array.isArray(candidate)
      ? candidate.filter((columnId): columnId is AgentPlanColumnId => VALID_LIST_COLUMN_IDS.includes(columnId as AgentPlanColumnId))
      : [];
    const deduped = normalized.length > 0 ? Array.from(new Set(normalized)) : [...DEFAULT_VISIBLE_COLUMNS_BY_VIEW[view]];
    const withDateCompleted = view === "table" && !deduped.includes("date_completed") ? [...deduped, "date_completed" as const] : deduped;
    const withDateAdded: AgentPlanColumnId[] = withDateCompleted.includes("date_added") ? withDateCompleted : [...withDateCompleted, "date_added"];
    const withEstimated: AgentPlanColumnId[] = withDateAdded.includes("estimated_time") ? withDateAdded : [...withDateAdded, "estimated_time"];
    const withActual: AgentPlanColumnId[] = withEstimated.includes("actual_time") ? withEstimated : [...withEstimated, "actual_time"];
    const withTags: AgentPlanColumnId[] = withActual.includes("tags") ? withActual : [...withActual, "tags"];
    const withLink: AgentPlanColumnId[] = withTags.includes("link") ? withTags : [...withTags, "link"];
    accumulator[view] = withLink.includes("notes") ? withLink : [...withLink, "notes"];
    return accumulator;
  }, {
    table: [...DEFAULT_VISIBLE_COLUMNS_BY_VIEW.table],
    list: [...DEFAULT_VISIBLE_COLUMNS_BY_VIEW.list],
    cards: [...DEFAULT_VISIBLE_COLUMNS_BY_VIEW.cards],
    matrix: [...DEFAULT_VISIBLE_COLUMNS_BY_VIEW.matrix],
    grid: [...DEFAULT_VISIBLE_COLUMNS_BY_VIEW.grid],
  });

  return {
    ...DEFAULT_TASK_UI_STATE,
    ...state,
    duplicateTitleMode: state.duplicateTitleMode === true,
    selectedBucket: nextBucket,
    statusFilters: Array.isArray(state.statusFilters) ? state.statusFilters : [],
    tasksSurface: state.tasksSurface === "paths" ? "paths" : "tasks",
    view: nextView,
    uiStateVersion: TASK_UI_SCHEMA_VERSION,
    visibleColumnsByView: nextVisibleColumnsByView,
  };
}
