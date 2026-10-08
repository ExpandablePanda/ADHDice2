import { HEALTH_TABS, type HealthTab } from "@/lib/health-utils";
import { getRegisteredPageShellPages } from "@/lib/page-shell-layout";
import type { NavigatorSearchAction } from "@/lib/navigator-search";
import {
  isAppPage,
  normalizeTaskWorkspaceTabsState,
  type AppPage,
  type TasksSurface,
  type TaskViewMode,
  type TaskWorkspaceTabsState,
} from "@/lib/task-ui-state";

export const MASTER_WORKSPACE_SCHEMA_VERSION = 1;
export const MASTER_WORKSPACE_STORAGE_KEY = "adhdice-master-workspace-v1";
export const MASTER_WORKSPACE_SPLIT_RATIO_MIN = 0.25;
export const MASTER_WORKSPACE_SPLIT_RATIO_MAX = 0.75;

export type MasterPanelSide = "left" | "right";
export type MasterTabDestination = NavigatorSearchAction;
export type MasterTabPresentationState = {
  tasksWorkspace?: TaskWorkspaceTabsState;
};

export type MasterWorkspaceTab = {
  id: string;
  destination: MasterTabDestination;
  presentation: MasterTabPresentationState;
};

export type MasterWorkspacePanel = {
  id: string;
  side: MasterPanelSide;
  tabs: MasterWorkspaceTab[];
  activeTabId: string;
};

export type MasterWorkspaceState = {
  schemaVersion: typeof MASTER_WORKSPACE_SCHEMA_VERSION;
  panels: MasterWorkspacePanel[];
  focusedPanelId: string;
  splitRatio: number;
  visiblePanelId: string;
};

export type MasterWorkspaceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const VALID_TASK_SURFACES = new Set(["tasks", "attention", "paths", "report", "on_time", "brainstorm", "completed_milestones"]);
const VALID_TASK_VIEWS = new Set(["table", "list", "cards", "matrix", "calendar"]);
const VALID_SETTINGS_SECTIONS = new Set(["appearance", "day-reset", "economy", "import-export"]);
function createRegisteredShellKeySet() {
  return new Set(getRegisteredPageShellPages().flatMap(({ canonicalLayout, pageKey }) => (
    canonicalLayout.order.map((shellId) => `${pageKey}\u0000${shellId}`)
  )));
}

function isHealthTab(value: unknown): value is HealthTab {
  return HEALTH_TABS.includes(value as HealthTab);
}

function normalizeDestination(value: unknown): MasterTabDestination {
  if (!value || typeof value !== "object") return { kind: "page", page: "Home" };
  const candidate = value as Record<string, unknown>;
  const page = candidate.page;
  switch (candidate.kind) {
    case "page":
      return isAppPage(page) ? { kind: "page", page } : { kind: "page", page: "Home" };
    case "task":
      return page === "Tasks" && typeof candidate.taskId === "string" && candidate.taskId.trim()
        ? { kind: "task", page: "Tasks", taskId: candidate.taskId.trim() }
        : { kind: "page", page: "Home" };
    case "tasks-surface":
      return page === "Tasks" && typeof candidate.surface === "string" && VALID_TASK_SURFACES.has(candidate.surface)
        ? { kind: "tasks-surface", page: "Tasks", surface: candidate.surface as TasksSurface }
        : { kind: "page", page: "Home" };
    case "tasks-view":
      return page === "Tasks" && candidate.surface === "tasks" && typeof candidate.view === "string" && VALID_TASK_VIEWS.has(candidate.view)
        ? { kind: "tasks-view", page: "Tasks", surface: "tasks", view: candidate.view as TaskViewMode }
        : { kind: "page", page: "Home" };
    case "health-tab":
      return page === "Health" && isHealthTab(candidate.tab)
        ? { kind: "health-tab", page: "Health", tab: candidate.tab }
        : { kind: "page", page: "Home" };
    case "settings-section":
      return page === "Settings" && typeof candidate.section === "string" && VALID_SETTINGS_SECTIONS.has(candidate.section)
        ? { kind: "settings-section", page: "Settings", section: candidate.section as "appearance" | "day-reset" | "economy" | "import-export" }
        : { kind: "page", page: "Home" };
    case "page-shell": {
      if (!isAppPage(page) || typeof candidate.pageKey !== "string" || typeof candidate.shellId !== "string") {
        return { kind: "page", page: "Home" };
      }
      const pageKey = candidate.pageKey;
      const shellId = candidate.shellId;
      const registeredKeys = createRegisteredShellKeySet();
      if (!registeredKeys.has(`${pageKey}\u0000${shellId}`)) return { kind: "page", page: "Home" };
      const shellPage = pageKey.startsWith("health:")
        ? "Health"
        : pageKey === "focus" ? "Focus"
          : pageKey === "home" ? "Home"
            : pageKey === "notes" ? "Notes"
              : pageKey === "settings" ? "Settings"
                : pageKey === "stats" ? "Stats"
                  : pageKey === "test" || pageKey === "test:d20" ? "Test"
                    : null;
      const healthTab = pageKey.startsWith("health:")
        ? HEALTH_TABS.find((tab) => tab.toLowerCase() === pageKey.slice("health:".length))
        : undefined;
      if (shellPage !== page || (pageKey.startsWith("health:") && !healthTab)) return { kind: "page", page: "Home" };
      return {
        kind: "page-shell",
        page,
        pageKey,
        shellId,
        ...(healthTab ? { healthTab } : {}),
        ...(typeof candidate.tasksSurface === "string" && VALID_TASK_SURFACES.has(candidate.tasksSurface)
          ? { tasksSurface: candidate.tasksSurface as TasksSurface }
          : {}),
      };
    }
    default:
      return { kind: "page", page: "Home" };
  }
}

function cloneTaskWorkspaceState(value: unknown): TaskWorkspaceTabsState {
  const normalized = normalizeTaskWorkspaceTabsState(value);
  return {
    activeTabId: normalized.activeTabId,
    uiStateVersion: normalized.uiStateVersion,
    tabs: normalized.tabs.map((tab) => ({
      ...tab,
      taskUiState: {
        ...tab.taskUiState,
        includeStepsByView: { ...tab.taskUiState.includeStepsByView },
        listSortBySurface: Object.fromEntries(
          Object.entries(tab.taskUiState.listSortBySurface).map(([surface, preference]) => [surface, { ...preference }]),
        ),
        quickFilters: [...tab.taskUiState.quickFilters],
        statusFilters: [...tab.taskUiState.statusFilters],
        tableColumnFilters: {
          priority: [...tab.taskUiState.tableColumnFilters.priority],
          repeat: [...tab.taskUiState.tableColumnFilters.repeat],
          taskType: [...(tab.taskUiState.tableColumnFilters.taskType ?? [])],
          text: { ...tab.taskUiState.tableColumnFilters.text },
        },
        energyFilters: [...tab.taskUiState.energyFilters],
        visibleColumnsByView: Object.fromEntries(
          Object.entries(tab.taskUiState.visibleColumnsByView).map(([view, columns]) => [view, [...columns]]),
        ) as TaskWorkspaceTabsState["tabs"][number]["taskUiState"]["visibleColumnsByView"],
      },
    })),
  };
}

function normalizePresentation(value: unknown, destination: MasterTabDestination): MasterTabPresentationState {
  if (!value || typeof value !== "object") return {};
  const candidate = value as Record<string, unknown>;
  return destination.page === "Tasks" && candidate.tasksWorkspace !== undefined
    ? { tasksWorkspace: cloneTaskWorkspaceState(candidate.tasksWorkspace) }
    : {};
}

function makeHomeTab(id = "master-tab-1"): MasterWorkspaceTab {
  return { id, destination: { kind: "page", page: "Home" }, presentation: {} };
}

export function createDefaultMasterWorkspaceState(): MasterWorkspaceState {
  const panel: MasterWorkspacePanel = {
    id: "master-panel-1",
    side: "left",
    tabs: [makeHomeTab()],
    activeTabId: "master-tab-1",
  };
  return {
    schemaVersion: MASTER_WORKSPACE_SCHEMA_VERSION,
    panels: [panel],
    focusedPanelId: panel.id,
    splitRatio: 0.5,
    visiblePanelId: panel.id,
  };
}

function uniqueId(candidate: unknown, fallback: string, used: Set<string>): string {
  const base = typeof candidate === "string" && candidate.trim() ? candidate.trim() : fallback;
  let id = base;
  let suffix = 2;
  while (used.has(id)) id = `${base}-${suffix++}`;
  used.add(id);
  return id;
}

export function normalizeMasterWorkspaceState(value: unknown): MasterWorkspaceState {
  if (!value || typeof value !== "object") return createDefaultMasterWorkspaceState();
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== MASTER_WORKSPACE_SCHEMA_VERSION || !Array.isArray(candidate.panels)) {
    return createDefaultMasterWorkspaceState();
  }

  const usedPanelIds = new Set<string>();
  const usedTabIds = new Set<string>();
  const panels: MasterWorkspacePanel[] = candidate.panels.slice(0, 2).map((panelValue, panelIndex) => {
    const panel = panelValue && typeof panelValue === "object" ? panelValue as Record<string, unknown> : {};
    const id = uniqueId(panel.id, `master-panel-${panelIndex + 1}`, usedPanelIds);
    const side: MasterPanelSide = panelIndex === 0 ? "left" : "right";
    const rawTabs = Array.isArray(panel.tabs) ? panel.tabs : [];
    const tabs = rawTabs.flatMap((tabValue, tabIndex): MasterWorkspaceTab[] => {
      if (!tabValue || typeof tabValue !== "object") return [];
      const tab = tabValue as Record<string, unknown>;
      const tabId = uniqueId(tab.id, `master-tab-${panelIndex + 1}-${tabIndex + 1}`, usedTabIds);
      const destination = normalizeDestination(tab.destination);
      return [{ id: tabId, destination, presentation: normalizePresentation(tab.presentation, destination) }];
    });
    const usableTabs = tabs.length > 0 ? tabs : [makeHomeTab(uniqueId(undefined, `master-tab-${panelIndex + 1}-1`, usedTabIds))];
    const activeTabId = typeof panel.activeTabId === "string" && usableTabs.some((tab) => tab.id === panel.activeTabId)
      ? panel.activeTabId
      : usableTabs[0].id;
    return { id, side, tabs: usableTabs, activeTabId };
  });

  const usablePanels = panels.length > 0 ? panels : createDefaultMasterWorkspaceState().panels;
  const panelIds = new Set(usablePanels.map((panel) => panel.id));
  const focusedPanelId = typeof candidate.focusedPanelId === "string" && panelIds.has(candidate.focusedPanelId)
    ? candidate.focusedPanelId
    : usablePanels[0].id;
  const visiblePanelId = typeof candidate.visiblePanelId === "string" && panelIds.has(candidate.visiblePanelId)
    ? candidate.visiblePanelId
    : focusedPanelId;
  const splitRatio = typeof candidate.splitRatio === "number" && Number.isFinite(candidate.splitRatio)
    ? Math.max(MASTER_WORKSPACE_SPLIT_RATIO_MIN, Math.min(MASTER_WORKSPACE_SPLIT_RATIO_MAX, candidate.splitRatio))
    : 0.5;

  return {
    schemaVersion: MASTER_WORKSPACE_SCHEMA_VERSION,
    panels: usablePanels,
    focusedPanelId,
    splitRatio,
    visiblePanelId,
  };
}

export function initializeMasterWorkspaceState(
  previousActivePage: AppPage,
  existingTaskWorkspaceTabsState: TaskWorkspaceTabsState,
): MasterWorkspaceState {
  const state = createDefaultMasterWorkspaceState();
  const firstPanel = state.panels[0];
  const tasksWorkspace = previousActivePage === "Tasks"
    ? cloneTaskWorkspaceState(existingTaskWorkspaceTabsState)
    : undefined;
  return {
    ...state,
    panels: [{
      ...firstPanel,
      tabs: [{
        ...firstPanel.tabs[0],
        destination: { kind: "page", page: previousActivePage },
        presentation: tasksWorkspace ? { tasksWorkspace } : {},
      }],
    }],
  };
}

export function activateMasterTab(state: MasterWorkspaceState, panelId: string, tabId: string): MasterWorkspaceState {
  const panel = state.panels.find((candidate) => candidate.id === panelId);
  if (!panel || !panel.tabs.some((tab) => tab.id === tabId)) return state;
  return {
    ...state,
    focusedPanelId: panelId,
    visiblePanelId: panelId,
    panels: state.panels.map((candidate) => candidate.id === panelId ? { ...candidate, activeTabId: tabId } : candidate),
  };
}

export function replaceFocusedMasterTabDestination(state: MasterWorkspaceState, destination: MasterTabDestination): MasterWorkspaceState {
  const destinationCopy = normalizeDestination(destination);
  return {
    ...state,
    panels: state.panels.map((panel) => panel.id !== state.focusedPanelId ? panel : {
      ...panel,
      tabs: panel.tabs.map((tab) => tab.id === panel.activeTabId
        ? { ...tab, destination: destinationCopy, presentation: {} }
        : tab),
    }),
  };
}

export function createMasterTab(
  state: MasterWorkspaceState,
  panelId: string,
  tab: MasterWorkspaceTab,
  activate = true,
): MasterWorkspaceState {
  const panel = state.panels.find((candidate) => candidate.id === panelId);
  if (!panel || state.panels.some((candidate) => candidate.tabs.some((existing) => existing.id === tab.id))) return state;
  const destination = normalizeDestination(tab.destination);
  const nextTab = { id: tab.id, destination, presentation: normalizePresentation(tab.presentation, destination) };
  return {
    ...state,
    focusedPanelId: activate ? panelId : state.focusedPanelId,
    visiblePanelId: activate ? panelId : state.visiblePanelId,
    panels: state.panels.map((candidate) => candidate.id === panelId ? {
      ...candidate,
      tabs: [...candidate.tabs, nextTab],
      activeTabId: activate ? tab.id : candidate.activeTabId,
    } : candidate),
  };
}

export function closeMasterTab(state: MasterWorkspaceState, panelId: string, tabId: string): MasterWorkspaceState {
  const panel = state.panels.find((candidate) => candidate.id === panelId);
  if (!panel || !panel.tabs.some((tab) => tab.id === tabId)) return state;
  if (panel.tabs.length === 1) {
    return {
      ...state,
      focusedPanelId: panelId,
      visiblePanelId: panelId,
      panels: state.panels.map((candidate) => candidate.id !== panelId ? candidate : {
        ...candidate,
        tabs: [{ ...makeHomeTab(tabId) }],
        activeTabId: tabId,
      }),
    };
  }
  const remainingTabs = panel.tabs.filter((tab) => tab.id !== tabId);
  const activeTabId = panel.activeTabId === tabId
    ? remainingTabs[Math.max(0, panel.tabs.findIndex((tab) => tab.id === tabId) - 1)].id
    : panel.activeTabId;
  return {
    ...state,
    focusedPanelId: panelId,
    visiblePanelId: panelId,
    panels: state.panels.map((candidate) => candidate.id === panelId ? { ...candidate, tabs: remainingTabs, activeTabId } : candidate),
  };
}

export function activateMasterPanel(state: MasterWorkspaceState, panelId: string): MasterWorkspaceState {
  if (!state.panels.some((panel) => panel.id === panelId)) return state;
  return { ...state, focusedPanelId: panelId, visiblePanelId: panelId };
}

export function duplicateFocusedPageIntoRightPanel(
  state: MasterWorkspaceState,
  ids: { panelId: string; tabId: string },
): MasterWorkspaceState {
  const focusedPanel = state.panels.find((panel) => panel.id === state.focusedPanelId);
  const focusedTab = focusedPanel?.tabs.find((tab) => tab.id === focusedPanel.activeTabId);
  if (!focusedPanel || !focusedTab) return state;
  const rightPanel = state.panels.find((panel) => panel.side === "right");
  if (!rightPanel && state.panels.length >= 2) return state;
  if (state.panels.some((panel) => panel.id === ids.panelId) && !rightPanel) return state;
  const duplicate: MasterWorkspaceTab = {
    id: ids.tabId,
    destination: focusedTab.destination,
    presentation: normalizePresentation(focusedTab.presentation, focusedTab.destination),
  };
  if (!rightPanel) {
    if (state.panels.some((panel) => panel.tabs.some((tab) => tab.id === ids.tabId))) return state;
    const panel: MasterWorkspacePanel = {
      id: ids.panelId,
      side: "right",
      tabs: [duplicate],
      activeTabId: ids.tabId,
    };
    return { ...state, panels: [...state.panels, panel], focusedPanelId: panel.id, visiblePanelId: panel.id };
  }
  return createMasterTab(state, rightPanel.id, duplicate, true);
}

export function closeMasterSplit(state: MasterWorkspaceState, panelId?: string): MasterWorkspaceState {
  if (state.panels.length < 2) return state;
  const panelToClose = panelId
    ? state.panels.find((panel) => panel.id === panelId && panel.side === "right")
    : state.panels.find((panel) => panel.side === "right");
  if (!panelToClose) return state;
  const panels = state.panels.filter((panel) => panel.id !== panelToClose.id);
  return {
    ...state,
    panels: panels.map((panel) => ({ ...panel, side: "left" as const })),
    focusedPanelId: panels[0].id,
    visiblePanelId: panels[0].id,
  };
}

export function adjustMasterWorkspaceSplitRatio(state: MasterWorkspaceState, splitRatio: number): MasterWorkspaceState {
  if (state.panels.length < 2 || !Number.isFinite(splitRatio)) return state;
  return {
    ...state,
    splitRatio: Math.max(MASTER_WORKSPACE_SPLIT_RATIO_MIN, Math.min(MASTER_WORKSPACE_SPLIT_RATIO_MAX, splitRatio)),
  };
}

export function getMasterWorkspaceStorageKey(userId: string): string {
  return `${MASTER_WORKSPACE_STORAGE_KEY}:${userId}`;
}

export function loadMasterWorkspaceState(storage: MasterWorkspaceStorage, userId: string): MasterWorkspaceState {
  if (!userId.trim()) return createDefaultMasterWorkspaceState();
  const key = getMasterWorkspaceStorageKey(userId);
  let rawValue: string | null;
  try {
    rawValue = storage.getItem(key);
  } catch {
    return createDefaultMasterWorkspaceState();
  }
  if (!rawValue) return createDefaultMasterWorkspaceState();
  try {
    return normalizeMasterWorkspaceState(JSON.parse(rawValue));
  } catch {
    try { storage.removeItem(key); } catch { /* Storage may be unavailable. */ }
    return createDefaultMasterWorkspaceState();
  }
}

export function saveMasterWorkspaceState(storage: MasterWorkspaceStorage, userId: string, state: MasterWorkspaceState): boolean {
  if (!userId.trim()) return false;
  try {
    storage.setItem(getMasterWorkspaceStorageKey(userId), JSON.stringify(normalizeMasterWorkspaceState(state)));
    return true;
  } catch {
    return false;
  }
}

export function loadMasterWorkspaceStateFromLocalStorage(userId: string): MasterWorkspaceState {
  if (typeof window === "undefined") return createDefaultMasterWorkspaceState();
  try {
    return loadMasterWorkspaceState(window.localStorage, userId);
  } catch {
    return createDefaultMasterWorkspaceState();
  }
}

export function saveMasterWorkspaceStateToLocalStorage(userId: string, state: MasterWorkspaceState): boolean {
  if (typeof window === "undefined") return false;
  try {
    return saveMasterWorkspaceState(window.localStorage, userId, state);
  } catch {
    return false;
  }
}
