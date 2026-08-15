import type { AgentPlanColumnId } from "@/components/ui/agent-plan";
import type { TaskEnergy, TaskRepeatFrequency } from "@/lib/database.types";
import type { TaskDisplayStatus } from "@/lib/task-display-status";
import type { TaskPriorityLevelOption } from "@/lib/task-priority";
import { DEFAULT_HUD_UI_STATE, normalizeHudUiState } from "@/lib/task-hud-layout";
import { normalizeListSortBySurface, type ListSortBySurface } from "@/lib/task-list-sort";

export type TaskViewMode = "table" | "list" | "cards" | "matrix" | "grid";
export type TasksSurface = "tasks" | "paths" | "report" | "on_time" | "brainstorm" | "completed_milestones";
export type TaskQuickFilter = "active" | "done" | "urgent" | "today" | "focused";
export type TaskTableTextFilterColumnId = "title" | "lists" | "tags" | "link" | "notes";
export type TaskTableColumnFilters = {
  priority: TaskPriorityLevelOption[];
  repeat: TaskRepeatFrequency[];
  text: Partial<Record<TaskTableTextFilterColumnId, string>>;
};
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
  includeStepsByView: Record<TaskViewMode, boolean>;
  matchAny: boolean;
  listSortBySurface: ListSortBySurface;
  quickFilters: TaskQuickFilter[];
  search: string;
  selectedBucket: string;
  statusFilters: TaskDisplayStatus[];
  tableColumnFilters: TaskTableColumnFilters;
  tasksSurface: TasksSurface;
  uiStateVersion: number;
  view: TaskViewMode;
  energyFilters: TaskEnergy[];
  visibleColumnsByView: Record<TaskViewMode, AgentPlanColumnId[]>;
};

export type TaskWorkspaceTab = {
  kind?: "report" | "tasks";
  id: string;
  isRailHidden: boolean;
  label: string;
  taskUiState: TaskUiState;
};

export type TaskWorkspaceTabsState = {
  activeTabId: string;
  tabs: TaskWorkspaceTab[];
  uiStateVersion: number;
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

export const TASK_UI_SCHEMA_VERSION = 10;
export const DEFAULT_TASK_WORKSPACE_TAB_ID = "workspace-1";
export const VALID_TASK_VIEWS: TaskViewMode[] = ["table", "list", "cards", "matrix", "grid"];
export const VALID_LIST_COLUMN_IDS: AgentPlanColumnId[] = [
  "bucket",
  "date_added",
  "date_completed",
  "last_done",
  "last_handled",
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
const DEFAULT_NON_TABLE_VISIBLE_COLUMNS = DEFAULT_TASK_TABLE_VISIBLE_COLUMNS.filter((columnId) => columnId !== "date_completed" && columnId !== "last_done" && columnId !== "last_handled" && columnId !== "streak");
export const DEFAULT_VISIBLE_COLUMNS_BY_VIEW: Record<TaskViewMode, AgentPlanColumnId[]> = {
  table: [...DEFAULT_TASK_TABLE_VISIBLE_COLUMNS],
  list: [...DEFAULT_NON_TABLE_VISIBLE_COLUMNS],
  cards: [...DEFAULT_NON_TABLE_VISIBLE_COLUMNS],
  matrix: [...DEFAULT_NON_TABLE_VISIBLE_COLUMNS],
  grid: [...DEFAULT_NON_TABLE_VISIBLE_COLUMNS],
};
export const DEFAULT_TASK_UI_STATE: TaskUiState = {
  duplicateTitleMode: false,
  includeStepsByView: { table: false, list: false, cards: false, matrix: false, grid: false },
  matchAny: true,
  listSortBySurface: {},
  quickFilters: [],
  search: "",
  selectedBucket: "today",
  statusFilters: [],
  tableColumnFilters: { priority: [], repeat: [], text: {} },
  tasksSurface: "tasks",
  uiStateVersion: TASK_UI_SCHEMA_VERSION,
  view: "table",
  energyFilters: [],
  visibleColumnsByView: DEFAULT_VISIBLE_COLUMNS_BY_VIEW,
};

function normalizeLegacySelectedBucket(value: string) {
  if (value === "important") {
    return "priority_3_4";
  }
  if (value === "urgent") {
    return "priority_5";
  }
  return value;
}

export const DEFAULT_TASK_WORKSPACE_TABS_STATE: TaskWorkspaceTabsState = {
  activeTabId: DEFAULT_TASK_WORKSPACE_TAB_ID,
  tabs: [
    {
      id: DEFAULT_TASK_WORKSPACE_TAB_ID,
      isRailHidden: false,
      kind: "tasks",
      label: "Tab 1",
      taskUiState: DEFAULT_TASK_UI_STATE,
    },
  ],
  uiStateVersion: TASK_UI_SCHEMA_VERSION,
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
    ? normalizeLegacySelectedBucket(state.selectedBucket)
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
    const withLastDone = view === "table" && !withDateCompleted.includes("last_done") ? [...withDateCompleted, "last_done" as const] : withDateCompleted;
    const withLastHandled = view === "table" && !withLastDone.includes("last_handled")
      ? (() => {
        const next = [...withLastDone] as AgentPlanColumnId[];
        const lastDoneIndex = next.indexOf("last_done");
        next.splice(lastDoneIndex + 1, 0, "last_handled");
        return next;
      })()
      : withLastDone;
    const withDateAdded: AgentPlanColumnId[] = withLastHandled.includes("date_added") ? withLastHandled : [...withLastHandled, "date_added"];
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
    includeStepsByView: VALID_TASK_VIEWS.reduce<Record<TaskViewMode, boolean>>((result, view) => {
      result[view] = state.includeStepsByView?.[view] === true;
      return result;
    }, { table: false, list: false, cards: false, matrix: false, grid: false }),
    listSortBySurface: normalizeListSortBySurface(state.listSortBySurface),
    selectedBucket: nextBucket,
    statusFilters: Array.isArray(state.statusFilters)
      ? state.statusFilters.filter((status) => status !== "trashed")
      : [],
    tableColumnFilters: {
      priority: Array.isArray(state.tableColumnFilters?.priority) ? state.tableColumnFilters.priority : [],
      repeat: Array.isArray(state.tableColumnFilters?.repeat) ? state.tableColumnFilters.repeat : [],
      text: state.tableColumnFilters?.text && typeof state.tableColumnFilters.text === "object"
        ? state.tableColumnFilters.text
        : {},
    },
    tasksSurface: state.tasksSurface === "paths" || state.tasksSurface === "report" || state.tasksSurface === "on_time" || state.tasksSurface === "brainstorm" || state.tasksSurface === "completed_milestones"
      ? state.tasksSurface
      : "tasks",
    view: nextView,
    uiStateVersion: TASK_UI_SCHEMA_VERSION,
    visibleColumnsByView: nextVisibleColumnsByView,
  };
}

export function isReportTaskWorkspaceTab(tab: Pick<TaskWorkspaceTab, "taskUiState">) {
  return tab.taskUiState.tasksSurface === "report";
}

function isLegacyReportTaskWorkspaceTab(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<TaskWorkspaceTab>;
  return candidate.kind === "report" || candidate.id === "workspace-report";
}

function normalizeTaskWorkspaceTab(value: unknown, index: number): TaskWorkspaceTab | null {
  if (!value || typeof value !== "object" || isLegacyReportTaskWorkspaceTab(value)) {
    return null;
  }

  const candidate = value as Partial<TaskWorkspaceTab> & { taskUiState?: Partial<TaskUiState> };
  const id = typeof candidate.id === "string" && candidate.id.trim().length > 0
    ? candidate.id.trim()
    : `workspace-${index + 1}`;
  const label = typeof candidate.label === "string" && candidate.label.trim().length > 0
    ? candidate.label.trim()
    : `Tab ${index + 1}`;

  return {
    id,
    isRailHidden: candidate.isRailHidden === true,
    kind: "tasks",
    label,
    taskUiState: migrateLegacyTaskUiState(candidate.taskUiState ?? {}),
  };
}

export function normalizeTaskWorkspaceTabsState(value: unknown): TaskWorkspaceTabsState {
  if (!value || typeof value !== "object") {
    return DEFAULT_TASK_WORKSPACE_TABS_STATE;
  }

  const candidate = value as Partial<TaskWorkspaceTabsState> & Partial<TaskUiState> & { tabs?: unknown[] };
  if (!Array.isArray(candidate.tabs)) {
    const migratedTaskUiState = migrateLegacyTaskUiState(candidate as Partial<TaskUiState>);
    return {
      activeTabId: DEFAULT_TASK_WORKSPACE_TAB_ID,
      tabs: [
        {
          id: DEFAULT_TASK_WORKSPACE_TAB_ID,
          isRailHidden: false,
          kind: "tasks",
          label: "Tab 1",
          taskUiState: migratedTaskUiState,
        },
      ],
      uiStateVersion: TASK_UI_SCHEMA_VERSION,
    };
  }

  const legacyReportTabWasActive = typeof candidate.activeTabId === "string"
    && candidate.tabs.some((tab) => {
      if (!isLegacyReportTaskWorkspaceTab(tab) || !tab || typeof tab !== "object") {
        return false;
      }
      return (tab as Partial<TaskWorkspaceTab>).id === candidate.activeTabId;
    });

  const tabs = candidate.tabs
    .map((tab, index) => normalizeTaskWorkspaceTab(tab, index))
    .filter((tab): tab is TaskWorkspaceTab => Boolean(tab));

  if (tabs.length === 0) {
    return {
      activeTabId: DEFAULT_TASK_WORKSPACE_TAB_ID,
      tabs: [
        {
          ...DEFAULT_TASK_WORKSPACE_TABS_STATE.tabs[0],
          taskUiState: legacyReportTabWasActive
            ? { ...DEFAULT_TASK_UI_STATE, tasksSurface: "report" }
            : DEFAULT_TASK_WORKSPACE_TABS_STATE.tabs[0].taskUiState,
        },
      ],
      uiStateVersion: TASK_UI_SCHEMA_VERSION,
    };
  }

  if (legacyReportTabWasActive) {
    tabs[0] = {
      ...tabs[0],
      taskUiState: {
        ...tabs[0].taskUiState,
        tasksSurface: "report",
      },
    };
  }

  const activeTabId = typeof candidate.activeTabId === "string" && tabs.some((tab) => tab.id === candidate.activeTabId)
    ? candidate.activeTabId
    : tabs[0].id;

  return {
    activeTabId,
    tabs,
    uiStateVersion: TASK_UI_SCHEMA_VERSION,
  };
}

export function reorderTaskWorkspaceTabs(
  state: TaskWorkspaceTabsState,
  tabId: string,
  direction: -1 | 1,
): TaskWorkspaceTabsState {
  const currentIndex = state.tabs.findIndex((tab) => tab.id === tabId);
  const nextIndex = currentIndex + direction;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= state.tabs.length) {
    return state;
  }

  const tabs = [...state.tabs];
  const [tab] = tabs.splice(currentIndex, 1);
  if (!tab) {
    return state;
  }
  tabs.splice(nextIndex, 0, tab);

  return {
    ...state,
    tabs,
  };
}

export function reorderTaskWorkspaceTabToIndex(
  state: TaskWorkspaceTabsState,
  tabId: string,
  targetIndex: number,
): TaskWorkspaceTabsState {
  const currentIndex = state.tabs.findIndex((tab) => tab.id === tabId);
  if (currentIndex < 0) {
    return state;
  }
  const safeTargetIndex = Math.max(0, Math.min(state.tabs.length - 1, targetIndex));
  if (currentIndex === safeTargetIndex) {
    return state;
  }

  const tabs = [...state.tabs];
  const [tab] = tabs.splice(currentIndex, 1);
  if (!tab) {
    return state;
  }
  tabs.splice(safeTargetIndex, 0, tab);

  return {
    ...state,
    tabs,
  };
}
