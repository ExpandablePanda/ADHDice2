import {
  activateMasterTab,
  closeMasterTab,
  getMasterWorkspaceStorageKey,
  initializeMasterWorkspaceState,
  loadMasterWorkspaceState,
  normalizeMasterWorkspaceState,
  resolveMasterTabTasksUiState,
  saveMasterWorkspaceState,
  updateMasterTabTasksUiState,
  updateMasterTabTasksWorkspace,
  type MasterWorkspaceState,
  type MasterWorkspaceStorage,
} from "@/lib/master-workspace-state";
import type { AppPage, TaskUiState, TaskWorkspaceTabsState } from "@/lib/task-ui-state";
import type { HealthTab } from "@/lib/health-utils";

export type MasterWorkspaceDraftProtection = {
  canCloseView(viewId: string): boolean;
  detachView(viewId: string): void;
};

export type MasterWorkspaceTaskTransition = {
  state: MasterWorkspaceState;
  taskWorkspaceTabsState?: TaskWorkspaceTabsState;
};

export type MasterWorkspaceTaskUiStateUpdate = TaskUiState | ((current: TaskUiState) => TaskUiState);
export type MasterWorkspaceTaskUiStateSetter = (update: MasterWorkspaceTaskUiStateUpdate) => void;
export type MasterWorkspaceStateUpdater = (update: (current: MasterWorkspaceState) => MasterWorkspaceState) => void;

export function resolveMasterWorkspaceTasksUiState(
  state: MasterWorkspaceState,
  panelId: string,
  tabId: string,
  liveTaskUiState: TaskUiState,
): TaskUiState | undefined {
  const storedTaskUiState = resolveMasterTabTasksUiState(state, panelId, tabId);
  if (!storedTaskUiState) return undefined;

  const panel = state.panels.find((candidate) => candidate.id === panelId);
  return state.focusedPanelId === panelId && panel?.activeTabId === tabId
    ? liveTaskUiState
    : storedTaskUiState;
}

export function updateMasterWorkspaceTasksUiState(
  state: MasterWorkspaceState,
  panelId: string,
  tabId: string,
  updater: MasterWorkspaceTaskUiStateUpdate,
  isReady: boolean,
  setTaskUiState: MasterWorkspaceTaskUiStateSetter,
  setWorkspace: MasterWorkspaceStateUpdater,
): boolean {
  if (!isReady || !resolveMasterTabTasksUiState(state, panelId, tabId)) return false;

  const panel = state.panels.find((candidate) => candidate.id === panelId);
  const targetsFocusedActiveTab = state.focusedPanelId === panelId && panel?.activeTabId === tabId;
  if (targetsFocusedActiveTab) {
    setTaskUiState(updater);
    return true;
  }

  setWorkspace((current) => {
    const currentTasksUiState = resolveMasterTabTasksUiState(current, panelId, tabId);
    if (!currentTasksUiState) return current;

    const currentPanel = current.panels.find((candidate) => candidate.id === panelId);
    if (current.focusedPanelId === panelId && currentPanel?.activeTabId === tabId) return current;

    return updateMasterTabTasksUiState(current, panelId, tabId, updater);
  });
  return true;
}

function getActiveTaskWorkspaceTabsState(state: MasterWorkspaceState, panelId: string): TaskWorkspaceTabsState | undefined {
  const panel = state.panels.find((candidate) => candidate.id === panelId);
  const tab = panel?.tabs.find((candidate) => candidate.id === panel.activeTabId);
  return tab?.destination.page === "Tasks" ? tab.presentation.tasksWorkspace : undefined;
}

export function activateMasterTabWithTaskWorkspace(
  state: MasterWorkspaceState,
  panelId: string,
  tabId: string,
  liveTaskWorkspaceTabsState: TaskWorkspaceTabsState,
): MasterWorkspaceTaskTransition {
  const panel = state.panels.find((candidate) => candidate.id === panelId);
  const activeTab = panel?.tabs.find((candidate) => candidate.id === panel.activeTabId);
  const withCurrentSnapshot = activeTab?.destination.page === "Tasks"
    ? updateMasterTabTasksWorkspace(state, panelId, activeTab.id, liveTaskWorkspaceTabsState)
    : state;
  const next = activateMasterTab(withCurrentSnapshot, panelId, tabId);
  return {
    state: next,
    taskWorkspaceTabsState: getActiveTaskWorkspaceTabsState(next, panelId),
  };
}

export function closeMasterTabWithTaskWorkspace(
  state: MasterWorkspaceState,
  panelId: string,
  tabId: string,
  liveTaskWorkspaceTabsState: TaskWorkspaceTabsState,
): MasterWorkspaceTaskTransition {
  const panel = state.panels.find((candidate) => candidate.id === panelId);
  const activeTab = panel?.tabs.find((candidate) => candidate.id === panel.activeTabId);
  const withCurrentSnapshot = activeTab?.destination.page === "Tasks"
    ? updateMasterTabTasksWorkspace(state, panelId, activeTab.id, liveTaskWorkspaceTabsState)
    : state;
  const next = closeMasterTab(withCurrentSnapshot, panelId, tabId);
  return {
    state: next,
    taskWorkspaceTabsState: getActiveTaskWorkspaceTabsState(next, panelId),
  };
}

export function canPersistLegacyTaskWorkspace(
  isMasterWorkspaceEnabled: boolean,
  userId: string | null | undefined,
  restoredUserId: string | null,
): boolean {
  return !isMasterWorkspaceEnabled && Boolean(userId) && userId === restoredUserId;
}

export function isTasksMasterTabTransitionBlocked(activePage: AppPage, hasUnsafeTasksDraft: boolean): boolean {
  return activePage === "Tasks" && hasUnsafeTasksDraft;
}

export function getMasterWorkspaceTransitionBlockReason(
  activePage: AppPage,
  currentHealthSection: HealthTab,
  hasUnsafeTasksDraft: boolean,
  healthDraftSafetyBySection: Partial<Record<HealthTab, boolean>>,
  hasUnsafeNotesDraft: boolean,
): string | null {
  if (isTasksMasterTabTransitionBlocked(activePage, hasUnsafeTasksDraft)) {
    return "Save or close the unfinished Tasks editor before switching pages.";
  }
  if (activePage === "Health" && healthDraftSafetyBySection[currentHealthSection]) {
    return `Save or cancel the unfinished Health ${currentHealthSection} edit before switching pages.`;
  }
  if (activePage === "Notes" && hasUnsafeNotesDraft) {
    return "Save or cancel the unfinished Notes or Scratch Paper edit before switching pages.";
  }
  return null;
}

export function isHealthMasterTabTransitionBlocked(
  currentSection: HealthTab,
  targetSection: HealthTab,
  hasUnsafeHealthDraft: boolean,
): boolean {
  if (currentSection === targetSection) return false;
  return hasUnsafeHealthDraft;
}

export function isMasterWorkspaceFeatureEnabled(
  nodeEnvironment: string | undefined,
  featureFlag: string | undefined,
): boolean {
  return nodeEnvironment === "development" && featureFlag === "true";
}

export function restoreMasterWorkspaceForUser(
  storage: MasterWorkspaceStorage,
  userId: string,
  previousActivePage: AppPage,
  taskWorkspaceTabsState: TaskWorkspaceTabsState,
  initialHealthSection: HealthTab = "Today",
): { state: MasterWorkspaceState; restored: boolean } {
  if (!userId.trim()) {
    return { state: initializeMasterWorkspaceState(previousActivePage, taskWorkspaceTabsState, initialHealthSection), restored: false };
  }

  try {
    const savedValue = storage.getItem(getMasterWorkspaceStorageKey(userId));
    if (savedValue !== null) {
      try {
        return { state: normalizeMasterWorkspaceState(JSON.parse(savedValue)), restored: true };
      } catch {
        return { state: loadMasterWorkspaceState(storage, userId), restored: true };
      }
    }
  } catch {
    // Storage can be unavailable in restricted browser contexts; initialize in memory.
  }

  return { state: initializeMasterWorkspaceState(previousActivePage, taskWorkspaceTabsState, initialHealthSection), restored: false };
}

export function persistMasterWorkspaceForReadyUser(
  storage: MasterWorkspaceStorage,
  currentUserId: string | null | undefined,
  restoredUserId: string | null,
  isReady: boolean,
  state: MasterWorkspaceState,
): boolean {
  if (!isReady || !currentUserId || currentUserId !== restoredUserId) return false;
  return saveMasterWorkspaceState(storage, currentUserId, state);
}
