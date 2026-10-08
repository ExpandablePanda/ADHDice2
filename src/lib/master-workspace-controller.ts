import {
  initializeMasterWorkspaceState,
  closeMasterSplit,
  getMasterWorkspaceStorageKey,
  loadMasterWorkspaceState,
  normalizeMasterWorkspaceState,
  saveMasterWorkspaceState,
  type MasterWorkspaceState,
  type MasterWorkspaceStorage,
} from "@/lib/master-workspace-state";
import type { AppPage, TaskWorkspaceTabsState } from "@/lib/task-ui-state";

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
): { state: MasterWorkspaceState; restored: boolean } {
  if (!userId.trim()) {
    return { state: initializeMasterWorkspaceState(previousActivePage, taskWorkspaceTabsState), restored: false };
  }

  try {
    const savedValue = storage.getItem(getMasterWorkspaceStorageKey(userId));
    if (savedValue !== null) {
      try {
        return { state: closeMasterSplit(normalizeMasterWorkspaceState(JSON.parse(savedValue))), restored: true };
      } catch {
        return { state: closeMasterSplit(loadMasterWorkspaceState(storage, userId)), restored: true };
      }
    }
  } catch {
    // Storage can be unavailable in restricted browser contexts; initialize in memory.
  }

  return { state: initializeMasterWorkspaceState(previousActivePage, taskWorkspaceTabsState), restored: false };
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
