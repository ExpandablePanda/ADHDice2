"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  activateMasterTabWithTaskWorkspace,
  closeMasterTabWithTaskWorkspace,
  getMasterWorkspaceTransitionBlockReason,
  isMasterWorkspaceFeatureEnabled,
  isHealthMasterTabTransitionBlocked,
  persistMasterWorkspaceForReadyUser,
  restoreMasterWorkspaceForUser,
} from "@/lib/master-workspace-controller";
import {
  closeMasterTab,
  createMasterTab,
  createDefaultMasterWorkspaceState,
  masterTabTasksWorkspaceMatchesLiveState,
  replaceFocusedMasterTabDestination,
  updateMasterTabTasksWorkspace,
  type MasterTabDestination,
  type MasterWorkspaceState,
} from "@/lib/master-workspace-state";
import type { AppPage, TaskWorkspaceTabsState } from "@/lib/task-ui-state";
import type { HealthTab } from "@/lib/health-utils";

type UseMasterWorkspaceControllerOptions = {
  activePage: AppPage;
  healthDraftSafetyBySection: Partial<Record<HealthTab, boolean>>;
  hasUnsafeTasksDraft: boolean;
  hasUnsafeNotesDraft: boolean;
  initialHealthSection: HealthTab;
  isReady: boolean;
  replaceTaskWorkspaceTabsState: (state: TaskWorkspaceTabsState) => void;
  setActivePage: (page: AppPage) => void;
  taskWorkspaceTabsState: TaskWorkspaceTabsState;
  userId: string | null | undefined;
};

function createTabId() {
  return `master-tab-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

export function useMasterWorkspaceController({
  activePage,
  healthDraftSafetyBySection,
  hasUnsafeTasksDraft,
  hasUnsafeNotesDraft,
  initialHealthSection,
  isReady,
  replaceTaskWorkspaceTabsState,
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
  const activeMasterPage = activeTab.destination.page;
  const canNavigate = isEnabled && isReady && Boolean(userId) && restoredUserId === userId;
  const currentHealthSection = activeMasterPage === "Health"
    ? activeTab.presentation.healthSection ?? initialHealthSection
    : initialHealthSection;
  const isHealthSectionTransitionBlocked = useCallback((targetSection: HealthTab) => (
    activeMasterPage === "Health"
    && isHealthMasterTabTransitionBlocked(
      currentHealthSection,
      targetSection,
      Boolean(healthDraftSafetyBySection[currentHealthSection]),
    )
  ), [activeMasterPage, currentHealthSection, healthDraftSafetyBySection]);
  const currentTransitionBlockReason = getMasterWorkspaceTransitionBlockReason(
    activeMasterPage,
    currentHealthSection,
    hasUnsafeTasksDraft,
    healthDraftSafetyBySection,
    hasUnsafeNotesDraft,
  );
  const isTabTransitionBlocked = useCallback((targetTab: typeof activeTab) => {
    if (targetTab.id === activeTab.id) return false;
    if (activeMasterPage === "Tasks" && hasUnsafeTasksDraft) return true;
    if (targetTab.destination.page !== activeMasterPage && currentTransitionBlockReason) return true;
    return activeMasterPage === "Health"
      && targetTab.destination.page === "Health"
      && isHealthSectionTransitionBlocked(targetTab.presentation.healthSection ?? "Today");
  }, [activeMasterPage, activeTab.id, currentTransitionBlockReason, hasUnsafeTasksDraft, isHealthSectionTransitionBlocked]);
  const pendingRouteRef = useRef<{ from: AppPage; to: AppPage } | null>(null);
  const lastLegacyRoutePageRef = useRef(activePage);

  useLayoutEffect(() => {
    if (!isEnabled || !isReady || !userId || restoredUserId === userId || typeof window === "undefined") return;
    const restored = restoreMasterWorkspaceForUser(
      window.localStorage,
      userId,
      activePage,
      taskWorkspaceTabsState,
      initialHealthSection,
    );
    // This synchronous localStorage restore runs only after auth and legacy UI readiness.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorkspace(restored.state);
    setRestoredUserId(userId);
    const panel = restored.state.panels.find((candidate) => candidate.id === restored.state.focusedPanelId) ?? restored.state.panels[0];
    const tab = panel.tabs.find((candidate) => candidate.id === panel.activeTabId) ?? panel.tabs[0];
    if (tab.destination.page === "Tasks" && tab.presentation.tasksWorkspace) {
      replaceTaskWorkspaceTabsState(tab.presentation.tasksWorkspace);
    }
    setActivePage(tab.destination.page);
  }, [activePage, initialHealthSection, isEnabled, isReady, replaceTaskWorkspaceTabsState, restoredUserId, setActivePage, taskWorkspaceTabsState, userId]);

  useEffect(() => {
    if (!isEnabled || !isReady || !userId || restoredUserId !== userId || typeof window === "undefined") return;
    if (
      activeTab.destination.page === "Tasks"
      && !masterTabTasksWorkspaceMatchesLiveState(workspace, currentPanel.id, activeTab.id, taskWorkspaceTabsState)
    ) return;
    persistMasterWorkspaceForReadyUser(window.localStorage, userId, restoredUserId, isReady, workspace);
  }, [activeTab.destination.page, activeTab.id, currentPanel.id, isEnabled, isReady, restoredUserId, taskWorkspaceTabsState, userId, workspace]);

  useLayoutEffect(() => {
    if (!isEnabled || !isReady || !userId || restoredUserId !== userId || activeTab.destination.page !== "Tasks") return;
    // Save the live Tasks UI snapshot before the controller's passive persistence effect runs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorkspace((current) => {
      const panel = current.panels.find((candidate) => candidate.id === currentPanel.id);
      if (panel?.activeTabId !== activeTab.id) return current;
      return updateMasterTabTasksWorkspace(current, currentPanel.id, activeTab.id, taskWorkspaceTabsState);
    });
  }, [activeTab.destination.page, activeTab.id, currentPanel.id, isEnabled, isReady, restoredUserId, taskWorkspaceTabsState, userId]);

  useLayoutEffect(() => {
    if (!isEnabled || !isReady || !userId || restoredUserId !== userId) return;
    if (activeTab.destination.page === activePage) {
      lastLegacyRoutePageRef.current = activePage;
      if (pendingRouteRef.current?.to === activePage) pendingRouteRef.current = null;
      return;
    }
    const pendingRoute = pendingRouteRef.current;
    if (pendingRoute && activeTab.destination.page === pendingRoute.to && activePage === pendingRoute.from) return;
    if (activePage === lastLegacyRoutePageRef.current) return;
    // Mirror existing legacy route changes into the active experimental tab.
    lastLegacyRoutePageRef.current = activePage;
    pendingRouteRef.current = null;
    // Keep the focused tab destination synchronized with legacy route changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorkspace((current) => replaceFocusedMasterTabDestination(current, { kind: "page", page: activePage }));
  }, [activePage, activeTab.destination.page, isEnabled, isReady, restoredUserId, userId]);

  const markPendingRoute = useCallback((page: AppPage) => {
    if (page !== activePage) pendingRouteRef.current = { from: activePage, to: page };
  }, [activePage]);

  const activateTab = useCallback((tabId: string) => {
    if (!canNavigate) return;
    const targetTab = currentPanel.tabs.find((tab) => tab.id === tabId);
    if (!targetTab || isTabTransitionBlocked(targetTab)) return;
    if (targetTab.id === activeTab.id) return;
    const transition = activateMasterTabWithTaskWorkspace(workspace, currentPanel.id, tabId, taskWorkspaceTabsState);
    if (transition.state === workspace) return;
    markPendingRoute(targetTab.destination.page);
    setWorkspace(transition.state);
    if (transition.taskWorkspaceTabsState) replaceTaskWorkspaceTabsState(transition.taskWorkspaceTabsState);
    setActivePage(targetTab.destination.page);
  }, [activeTab.id, canNavigate, currentPanel.id, currentPanel.tabs, isTabTransitionBlocked, markPendingRoute, replaceTaskWorkspaceTabsState, setActivePage, taskWorkspaceTabsState, workspace]);

  const openPageTab = useCallback((page: AppPage) => {
    if (!canNavigate || currentTransitionBlockReason) return false;
    const id = createTabId();
    const healthSection = activeMasterPage === "Health"
      ? activeTab.presentation.healthSection ?? initialHealthSection
      : initialHealthSection;
    const next = createMasterTab(workspace, currentPanel.id, {
      id,
      destination: { kind: "page", page },
      presentation: page === "Tasks"
        ? { tasksWorkspace: taskWorkspaceTabsState }
        : page === "Health" ? { healthSection } : {},
    }, true);
    if (next === workspace) return false;
    markPendingRoute(page);
    setWorkspace(next);
    setActivePage(page);
    return true;
  }, [activeMasterPage, activeTab.presentation.healthSection, canNavigate, currentPanel.id, currentTransitionBlockReason, initialHealthSection, markPendingRoute, setActivePage, taskWorkspaceTabsState, workspace]);

  const canOpenNewTab = canNavigate && !currentTransitionBlockReason;

  const navigateToPage = useCallback((page: AppPage) => {
    if (!canNavigate) {
      setActivePage(page);
      return true;
    }
    if (page === activeMasterPage) {
      setActivePage(page);
      return true;
    }
    if (currentTransitionBlockReason) return false;
    markPendingRoute(page);
    setWorkspace((current) => replaceFocusedMasterTabDestination(current, { kind: "page", page }));
    setActivePage(page);
    return true;
  }, [activeMasterPage, canNavigate, currentTransitionBlockReason, markPendingRoute, setActivePage]);

  const canCloseTab = useCallback((tabId: string) => {
    if (!canNavigate) return false;
    const currentTab = currentPanel.tabs.find((tab) => tab.id === tabId);
    if (!currentTab) return false;
    if (tabId !== activeTab.id) return currentPanel.tabs.length > 1;
    if (activeMasterPage === "Tasks" && hasUnsafeTasksDraft) return false;
    const next = closeMasterTab(workspace, currentPanel.id, tabId);
    if (next === workspace) return false;
    const nextPanel = next.panels.find((panel) => panel.id === currentPanel.id) ?? next.panels[0];
    const nextTab = nextPanel.tabs.find((tab) => tab.id === nextPanel.activeTabId) ?? nextPanel.tabs[0];
    return !isTabTransitionBlocked(nextTab);
  }, [activeMasterPage, activeTab.id, canNavigate, currentPanel.id, currentPanel.tabs, hasUnsafeTasksDraft, isTabTransitionBlocked, workspace]);

  const closeTab = useCallback((tabId: string) => {
    if (!canCloseTab(tabId)) return;
    const transition = closeMasterTabWithTaskWorkspace(workspace, currentPanel.id, tabId, taskWorkspaceTabsState);
    if (transition.state === workspace) return;
    const nextPanel = transition.state.panels.find((panel) => panel.id === currentPanel.id) ?? transition.state.panels[0];
    const nextTab = nextPanel.tabs.find((tab) => tab.id === nextPanel.activeTabId) ?? nextPanel.tabs[0];
    markPendingRoute(nextTab.destination.page);
    setWorkspace(transition.state);
    if (tabId === activeTab.id && transition.taskWorkspaceTabsState) {
      replaceTaskWorkspaceTabsState(transition.taskWorkspaceTabsState);
    }
    setActivePage(nextTab.destination.page);
  }, [activeTab.id, canCloseTab, currentPanel.id, markPendingRoute, replaceTaskWorkspaceTabsState, setActivePage, taskWorkspaceTabsState, workspace]);

  const canActivateTab = useCallback((tabId: string) => {
    const targetTab = currentPanel.tabs.find((tab) => tab.id === tabId);
    return canNavigate && Boolean(targetTab) && (!targetTab || !isTabTransitionBlocked(targetTab));
  }, [canNavigate, currentPanel.tabs, isTabTransitionBlocked]);

  const updateFocusedDestination = useCallback((destination: MasterTabDestination) => {
    if (!canNavigate) return true;
    if (activeMasterPage === "Tasks" && hasUnsafeTasksDraft) return false;
    if (destination.page !== activeMasterPage && currentTransitionBlockReason) return false;
    const targetHealthSection = destination.kind === "health-tab"
      ? destination.tab
      : destination.kind === "page-shell" ? destination.healthTab : undefined;
    if (
      destination.page === "Health"
      && targetHealthSection
      && isHealthSectionTransitionBlocked(targetHealthSection)
    ) return false;
    markPendingRoute(destination.page);
    setWorkspace((current) => replaceFocusedMasterTabDestination(current, destination));
    return true;
  }, [activeMasterPage, canNavigate, currentTransitionBlockReason, hasUnsafeTasksDraft, isHealthSectionTransitionBlocked, markPendingRoute]);

  const selectHealthSection = useCallback((healthSection: HealthTab) => {
    if (!canNavigate || activeMasterPage !== "Health") return false;
    return updateFocusedDestination({ kind: "health-tab", page: "Health", tab: healthSection });
  }, [activeMasterPage, canNavigate, updateFocusedDestination]);

  return useMemo(() => ({
    activateTab,
    activeTab,
    canActivateTab,
    canCloseTab,
    canOpenNewTab,
    canNavigate,
    closeTab,
    currentPanel,
    featureEnabled: isEnabled,
    isEnabled: isEnabled && isReady && Boolean(userId) && restoredUserId === userId,
    openPageTab,
    navigateToPage,
    selectHealthSection,
    updateFocusedDestination,
    workspace,
    transitionBlockedReason: currentTransitionBlockReason,
  }), [activateTab, activeTab, canActivateTab, canCloseTab, canNavigate, canOpenNewTab, closeTab, currentPanel, currentTransitionBlockReason, isEnabled, isReady, navigateToPage, openPageTab, restoredUserId, selectHealthSection, updateFocusedDestination, userId, workspace]);
}
