"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  activateMasterTab,
  closeMasterTab,
  createMasterTab,
  createDefaultMasterWorkspaceState,
  replaceFocusedMasterTabDestination,
  type MasterWorkspaceState,
} from "@/lib/master-workspace-state";
import {
  isMasterWorkspaceFeatureEnabled,
  persistMasterWorkspaceForReadyUser,
  restoreMasterWorkspaceForUser,
} from "@/lib/master-workspace-controller";
import type { AppPage, TaskWorkspaceTabsState } from "@/lib/task-ui-state";

type UseMasterWorkspaceControllerOptions = {
  activePage: AppPage;
  isReady: boolean;
  setActivePage: (page: AppPage) => void;
  taskWorkspaceTabsState: TaskWorkspaceTabsState;
  userId: string | null | undefined;
};

function createTabId() {
  return `master-tab-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

export function useMasterWorkspaceController({
  activePage,
  isReady,
  setActivePage,
  taskWorkspaceTabsState,
  userId,
}: UseMasterWorkspaceControllerOptions) {
  const isEnabled = isMasterWorkspaceFeatureEnabled(
    process.env.NODE_ENV,
    process.env.NEXT_PUBLIC_ADHDICE_MASTER_TABS,
  );
  const [workspace, setWorkspace] = useState<MasterWorkspaceState>(() => createDefaultMasterWorkspaceState());
  const [restoredUserId, setRestoredUserId] = useState<string | null>(null);
  const currentPanel = workspace.panels.find((panel) => panel.id === workspace.focusedPanelId) ?? workspace.panels[0];
  const activeTab = currentPanel.tabs.find((tab) => tab.id === currentPanel.activeTabId) ?? currentPanel.tabs[0];
  const canNavigate = isEnabled && isReady && Boolean(userId) && restoredUserId === userId;

  useLayoutEffect(() => {
    if (!isEnabled || !isReady || !userId || restoredUserId === userId || typeof window === "undefined") return;
    const restored = restoreMasterWorkspaceForUser(
      window.localStorage,
      userId,
      activePage,
      taskWorkspaceTabsState,
    );
    // This synchronous localStorage restore runs only after auth and legacy UI readiness.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorkspace(restored.state);
    setRestoredUserId(userId);
    const panel = restored.state.panels.find((candidate) => candidate.id === restored.state.focusedPanelId) ?? restored.state.panels[0];
    const tab = panel.tabs.find((candidate) => candidate.id === panel.activeTabId) ?? panel.tabs[0];
    setActivePage(tab.destination.page);
  }, [activePage, isEnabled, isReady, restoredUserId, setActivePage, taskWorkspaceTabsState, userId]);

  useEffect(() => {
    if (!isEnabled || !isReady || !userId || restoredUserId !== userId || typeof window === "undefined") return;
    persistMasterWorkspaceForReadyUser(window.localStorage, userId, restoredUserId, isReady, workspace);
  }, [isEnabled, isReady, restoredUserId, userId, workspace]);

  useLayoutEffect(() => {
    if (!isEnabled || !isReady || !userId || restoredUserId !== userId || activeTab.destination.page === activePage) return;
    // Mirror existing legacy route changes into the active experimental tab.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorkspace((current) => replaceFocusedMasterTabDestination(current, { kind: "page", page: activePage }));
  }, [activePage, activeTab.destination.page, isEnabled, isReady, restoredUserId, userId]);

  const activateTab = useCallback((tabId: string) => {
    if (!canNavigate) return;
    const targetTab = currentPanel.tabs.find((tab) => tab.id === tabId);
    if (!targetTab || targetTab.destination.page !== activePage) return;
    const next = activateMasterTab(workspace, currentPanel.id, tabId);
    if (next === workspace) return;
    setWorkspace(next);
    const nextTab = next.panels.find((panel) => panel.id === currentPanel.id)?.tabs.find((tab) => tab.id === tabId);
    if (nextTab) setActivePage(nextTab.destination.page);
  }, [activePage, canNavigate, currentPanel.id, currentPanel.tabs, setActivePage, workspace]);

  const openPageTab = useCallback((page: AppPage) => {
    if (!canNavigate) return;
    const id = createTabId();
    const next = createMasterTab(workspace, currentPanel.id, {
      id,
      destination: { kind: "page", page },
      presentation: page === "Tasks" ? { tasksWorkspace: taskWorkspaceTabsState } : {},
    }, page === activePage);
    setWorkspace(next);
    if (page === activePage) setActivePage(page);
  }, [activePage, canNavigate, currentPanel.id, setActivePage, taskWorkspaceTabsState, workspace]);

  const canCloseTab = useCallback((tabId: string) => {
    if (!canNavigate) return false;
    const next = closeMasterTab(workspace, currentPanel.id, tabId);
    if (next === workspace) return false;
    const nextPanel = next.panels.find((panel) => panel.id === currentPanel.id) ?? next.panels[0];
    const nextTab = nextPanel.tabs.find((tab) => tab.id === nextPanel.activeTabId) ?? nextPanel.tabs[0];
    return nextTab.destination.page === activePage;
  }, [activePage, canNavigate, currentPanel.id, workspace]);

  const closeTab = useCallback((tabId: string) => {
    if (!canCloseTab(tabId)) return;
    const next = closeMasterTab(workspace, currentPanel.id, tabId);
    if (next === workspace) return;
    setWorkspace(next);
    const nextPanel = next.panels.find((panel) => panel.id === currentPanel.id) ?? next.panels[0];
    const nextTab = nextPanel.tabs.find((tab) => tab.id === nextPanel.activeTabId) ?? nextPanel.tabs[0];
    setActivePage(nextTab.destination.page);
  }, [canCloseTab, currentPanel.id, setActivePage, workspace]);

  const canActivateTab = useCallback((tabId: string) => (
    canNavigate && currentPanel.tabs.some((tab) => tab.id === tabId && tab.destination.page === activePage)
  ), [activePage, canNavigate, currentPanel.tabs]);

  return useMemo(() => ({
    activateTab,
    activeTab,
    canActivateTab,
    canCloseTab,
    canNavigate,
    closeTab,
    currentPanel,
    isEnabled: isEnabled && isReady && Boolean(userId) && restoredUserId === userId,
    openPageTab,
    workspace,
  }), [activateTab, activeTab, canActivateTab, canCloseTab, canNavigate, closeTab, currentPanel, isEnabled, isReady, openPageTab, restoredUserId, userId, workspace]);
}
