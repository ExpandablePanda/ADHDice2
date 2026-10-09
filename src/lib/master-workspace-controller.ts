import {
  activateMasterTab,
  closeMasterTab,
  getMasterWorkspaceStorageKey,
  initializeMasterWorkspaceState,
  loadMasterWorkspaceState,
  normalizeMasterWorkspaceState,
  saveMasterWorkspaceState,
  updateMasterTabTasksWorkspace,
  type MasterWorkspaceState,
  type MasterWorkspaceStorage,
} from "@/lib/master-workspace-state";
import type { AppPage, TaskWorkspaceTabsState } from "@/lib/task-ui-state";
import type { HealthTab } from "@/lib/health-utils";

export type MasterWorkspaceDraftProtection = {
  canCloseView(viewId: string): boolean;
  detachView(viewId: string): void;
};

export type MasterWorkspaceTaskTransition = {
  state: MasterWorkspaceState;
  taskWorkspaceTabsState?: TaskWorkspaceTabsState;
};

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
