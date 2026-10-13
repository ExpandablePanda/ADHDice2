"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  activateMasterTabWithTaskWorkspace,
  closeMasterTabWithTaskWorkspace,
  getMasterWorkspaceTransitionBlockReason,
  isMasterWorkspaceFeatureEnabled,
  isHealthMasterTabTransitionBlocked,
  persistMasterWorkspaceForReadyUser,
  resolveMasterWorkspaceTasksUiState,
  restoreMasterWorkspaceForUser,
  updateMasterWorkspaceTasksUiState,
  type MasterWorkspaceDraftProtection,
  type MasterWorkspaceStateUpdater,
} from "@/lib/master-workspace-controller";
import {
  closeMasterTab,
  createMasterTab,
  createDefaultMasterWorkspaceState,
  getMasterTabFoodView,
  getMasterTabJournalView,
  getMasterTabNotesView,
  getMasterTabScratchPaperView,
  masterTabTasksWorkspaceMatchesLiveState,
  replaceFocusedMasterTabDestination,
  updateMasterTabJournalView,
  updateMasterTabFoodView,
  updateMasterTabNotesView,
  updateMasterTabScratchPaperView,
  updateMasterTabScrollPosition,
  updateMasterTabTasksWorkspace,
  type MasterTabPresentationState,
  type MasterTabDestination,
  type MasterScratchPaperWorkspaceView,
  type MasterFoodWorkspaceViewUpdate,
  type MasterWorkspaceState,
} from "@/lib/master-workspace-state";
import { resolveActiveTaskUiState, type AppPage, type TaskUiState, type TaskWorkspaceTabsState } from "@/lib/task-ui-state";
import type { HealthTab } from "@/lib/health-utils";
import { updateSynchronousState } from "@/lib/synchronous-state-update";

type UseMasterWorkspaceControllerOptions = {
  activePage: AppPage;
  healthDraftSafetyBySection: Partial<Record<HealthTab, boolean>>;
  hasUnsafeTasksDraft: boolean;
  hasUnsafeNotesDraft: boolean;
  initialHealthSection: HealthTab;
  isReady: boolean;
  replaceTaskWorkspaceTabsState: (state: TaskWorkspaceTabsState) => void;
  applyTaskUiStateUpdate: (
    expectedTaskTabId: string,
    updater: TaskUiState | ((current: TaskUiState) => TaskUiState),
  ) => TaskWorkspaceTabsState | undefined;
  getTaskWorkspaceTabsState: () => TaskWorkspaceTabsState;
  setActivePage: (page: AppPage) => void;
  taskWorkspaceTabsState: TaskWorkspaceTabsState;
  userId: string | null | undefined;
  draftProtection?: MasterWorkspaceDraftProtection;
};

function createTabId() {
  return `master-tab-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function snapshotTabScrollPosition(state: MasterWorkspaceState, panelId: string, tabId: string) {
  return typeof window === "undefined"
    ? state
    : updateMasterTabScrollPosition(state, panelId, tabId, window.scrollY);
}

export function useMasterWorkspaceController({
  activePage,
  healthDraftSafetyBySection,
  hasUnsafeTasksDraft,
  hasUnsafeNotesDraft,
  initialHealthSection,
  isReady,
  replaceTaskWorkspaceTabsState,
  applyTaskUiStateUpdate,
  getTaskWorkspaceTabsState,
  setActivePage,
  taskWorkspaceTabsState,
  userId,
  draftProtection,
}: UseMasterWorkspaceControllerOptions) {
  const isEnabled = isMasterWorkspaceFeatureEnabled(
    process.env.NODE_ENV,
    process.env.NEXT_PUBLIC_ADHDICE_MASTER_TABS,
  );
  const [workspace, setWorkspace] = useState<MasterWorkspaceState>(() => createDefaultMasterWorkspaceState());
  const workspaceRef = useRef(workspace);
  const commitWorkspace = useCallback<MasterWorkspaceStateUpdater>((update) => (
    updateSynchronousState(workspaceRef, update, setWorkspace)
  ), []);
  const [restoredUserId, setRestoredUserId] = useState<string | null>(null);
  const currentPanel = workspace.panels.find((panel) => panel.id === workspace.focusedPanelId) ?? workspace.panels[0];
  const activeTab = currentPanel.tabs.find((tab) => tab.id === currentPanel.activeTabId) ?? currentPanel.tabs[0];
  const activeMasterPage = activeTab.destination.page;
  const activeJournalView = getMasterTabJournalView(activeTab);
  const activeNotesView = getMasterTabNotesView(activeTab);
  const activeScratchPaperView = getMasterTabScratchPaperView(activeTab);
  const activeFoodView = getMasterTabFoodView(activeTab);
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
  const lastScrollRestoreRef = useRef({ tabId: activeTab.id, scrollTop: activeTab.presentation.scrollTop ?? 0 });

  useLayoutEffect(() => {
    const nextScrollTop = activeTab.presentation.scrollTop ?? 0;
    const previous = lastScrollRestoreRef.current;
    if (typeof window !== "undefined" && (previous.tabId !== activeTab.id || previous.scrollTop !== nextScrollTop)) {
      window.scrollTo(0, nextScrollTop);
    }
    lastScrollRestoreRef.current = { tabId: activeTab.id, scrollTop: nextScrollTop };
  }, [activeTab.id, activeTab.presentation.scrollTop]);

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
    commitWorkspace(() => restored.state);
    setRestoredUserId(userId);
    const panel = restored.state.panels.find((candidate) => candidate.id === restored.state.focusedPanelId) ?? restored.state.panels[0];
    const tab = panel.tabs.find((candidate) => candidate.id === panel.activeTabId) ?? panel.tabs[0];
    if (tab.destination.page === "Tasks" && tab.presentation.tasksWorkspace) {
      replaceTaskWorkspaceTabsState(tab.presentation.tasksWorkspace);
    }
    setActivePage(tab.destination.page);
  }, [activePage, commitWorkspace, initialHealthSection, isEnabled, isReady, replaceTaskWorkspaceTabsState, restoredUserId, setActivePage, taskWorkspaceTabsState, userId]);

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
    const liveTaskWorkspaceTabsState = getTaskWorkspaceTabsState();
    // Save the live Tasks UI snapshot before the controller's passive persistence effect runs.
    commitWorkspace((current) => {
      const panel = current.panels.find((candidate) => candidate.id === currentPanel.id);
      if (panel?.activeTabId !== activeTab.id) return current;
      return updateMasterTabTasksWorkspace(current, currentPanel.id, activeTab.id, liveTaskWorkspaceTabsState);
    });
  }, [activeTab.destination.page, activeTab.id, commitWorkspace, currentPanel.id, getTaskWorkspaceTabsState, isEnabled, isReady, restoredUserId, taskWorkspaceTabsState, userId]);

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
    commitWorkspace((current) => replaceFocusedMasterTabDestination(current, { kind: "page", page: activePage }));
  }, [activePage, activeTab.destination.page, commitWorkspace, isEnabled, isReady, restoredUserId, userId]);

  const markPendingRoute = useCallback((page: AppPage) => {
    if (page !== activePage) pendingRouteRef.current = { from: activePage, to: page };
  }, [activePage]);

  const snapshotFocusedTasksWorkspace = useCallback((state: MasterWorkspaceState, liveTaskWorkspaceTabsState: TaskWorkspaceTabsState) => {
    const panel = state.panels.find((candidate) => candidate.id === state.focusedPanelId);
    const tab = panel?.tabs.find((candidate) => candidate.id === panel.activeTabId);
    return panel && tab?.destination.page === "Tasks"
      ? updateMasterTabTasksWorkspace(state, panel.id, tab.id, liveTaskWorkspaceTabsState)
      : state;
  }, []);

  const activateTab = useCallback((tabId: string) => {
    if (!canNavigate) return;
    const currentWorkspace = workspaceRef.current;
    const panel = currentWorkspace.panels.find((candidate) => candidate.id === currentWorkspace.focusedPanelId);
    if (!panel) return;
    const targetTab = panel.tabs.find((tab) => tab.id === tabId);
    if (!targetTab || isTabTransitionBlocked(targetTab)) return;
    if (targetTab.id === panel.activeTabId) return;
    const withScroll = snapshotTabScrollPosition(currentWorkspace, panel.id, panel.activeTabId);
    const transition = activateMasterTabWithTaskWorkspace(withScroll, panel.id, tabId, getTaskWorkspaceTabsState());
    if (transition.state === withScroll) return;
    markPendingRoute(targetTab.destination.page);
    commitWorkspace(() => transition.state);
    if (transition.taskWorkspaceTabsState) replaceTaskWorkspaceTabsState(transition.taskWorkspaceTabsState);
    setActivePage(targetTab.destination.page);
  }, [canNavigate, commitWorkspace, getTaskWorkspaceTabsState, isTabTransitionBlocked, markPendingRoute, replaceTaskWorkspaceTabsState, setActivePage]);

  const openPageTab = useCallback((page: AppPage) => {
    if (!canNavigate || currentTransitionBlockReason) return false;
    const currentWorkspace = workspaceRef.current;
    const panel = currentWorkspace.panels.find((candidate) => candidate.id === currentWorkspace.focusedPanelId);
    const currentTab = panel?.tabs.find((candidate) => candidate.id === panel.activeTabId);
    if (!panel || !currentTab) return false;
    const liveTaskWorkspaceTabsState = getTaskWorkspaceTabsState();
    const id = createTabId();
    const healthSection = currentTab.destination.page === "Health"
      ? currentTab.presentation.healthSection ?? initialHealthSection
      : initialHealthSection;
    const withScroll = snapshotTabScrollPosition(snapshotFocusedTasksWorkspace(currentWorkspace, liveTaskWorkspaceTabsState), panel.id, currentTab.id);
    const next = createMasterTab(withScroll, panel.id, {
      id,
      destination: { kind: "page", page },
      presentation: page === "Tasks"
        ? { tasksWorkspace: getTaskWorkspaceTabsState() }
        : page === "Health" ? { healthSection } : {},
    }, true);
    if (next === withScroll) return false;
    markPendingRoute(page);
    commitWorkspace(() => next);
    setActivePage(page);
    return true;
  }, [canNavigate, commitWorkspace, currentTransitionBlockReason, getTaskWorkspaceTabsState, initialHealthSection, markPendingRoute, setActivePage, snapshotFocusedTasksWorkspace]);

  const canOpenNewTab = canNavigate && !currentTransitionBlockReason;

  const navigateToPage = useCallback((page: AppPage) => {
    if (!canNavigate) {
      setActivePage(page);
      return true;
    }
    const currentWorkspace = workspaceRef.current;
    const panel = currentWorkspace.panels.find((candidate) => candidate.id === currentWorkspace.focusedPanelId);
    const currentTab = panel?.tabs.find((candidate) => candidate.id === panel.activeTabId);
    if (!panel || !currentTab) return false;
    if (page === currentTab.destination.page) {
      setActivePage(page);
      return true;
    }
    if (currentTransitionBlockReason) return false;
    const liveTaskWorkspaceTabsState = getTaskWorkspaceTabsState();
    const withScroll = snapshotTabScrollPosition(snapshotFocusedTasksWorkspace(currentWorkspace, liveTaskWorkspaceTabsState), panel.id, currentTab.id);
    markPendingRoute(page);
    commitWorkspace((current) => replaceFocusedMasterTabDestination(
      current === currentWorkspace ? withScroll : snapshotFocusedTasksWorkspace(current, liveTaskWorkspaceTabsState),
      { kind: "page", page },
    ));
    setActivePage(page);
    return true;
  }, [canNavigate, commitWorkspace, currentTransitionBlockReason, getTaskWorkspaceTabsState, markPendingRoute, setActivePage, snapshotFocusedTasksWorkspace]);

  const canCloseTab = useCallback((tabId: string) => {
    if (!canNavigate) return false;
    if (draftProtection && !draftProtection.canCloseView(tabId)) return false;
    const currentTab = currentPanel.tabs.find((tab) => tab.id === tabId);
    if (!currentTab) return false;
    if (tabId !== activeTab.id) return currentPanel.tabs.length > 1;
    if (currentTransitionBlockReason) return false;
    if (activeMasterPage === "Tasks" && hasUnsafeTasksDraft) return false;
    const next = closeMasterTab(workspace, currentPanel.id, tabId);
    if (next === workspace) return false;
    const nextPanel = next.panels.find((panel) => panel.id === currentPanel.id) ?? next.panels[0];
    const nextTab = nextPanel.tabs.find((tab) => tab.id === nextPanel.activeTabId) ?? nextPanel.tabs[0];
    return !isTabTransitionBlocked(nextTab);
  }, [activeMasterPage, activeTab.id, canNavigate, currentPanel.id, currentPanel.tabs, currentTransitionBlockReason, draftProtection, hasUnsafeTasksDraft, isTabTransitionBlocked, workspace]);

  const closeTab = useCallback((tabId: string) => {
    if (!canCloseTab(tabId)) return;
    const currentWorkspace = workspaceRef.current;
    const panel = currentWorkspace.panels.find((candidate) => candidate.id === currentWorkspace.focusedPanelId);
    const currentTab = panel?.tabs.find((candidate) => candidate.id === panel.activeTabId);
    if (!panel || !currentTab) return;
    const withScroll = tabId === currentTab.id
      ? snapshotTabScrollPosition(currentWorkspace, panel.id, currentTab.id)
      : currentWorkspace;
    const transition = closeMasterTabWithTaskWorkspace(withScroll, panel.id, tabId, getTaskWorkspaceTabsState());
    if (transition.state === withScroll) return;
    const nextPanel = transition.state.panels.find((candidate) => candidate.id === panel.id) ?? transition.state.panels[0];
    const nextTab = nextPanel.tabs.find((tab) => tab.id === nextPanel.activeTabId) ?? nextPanel.tabs[0];
    draftProtection?.detachView(tabId);
    markPendingRoute(nextTab.destination.page);
    commitWorkspace(() => transition.state);
    if (tabId === currentTab.id && transition.taskWorkspaceTabsState) {
      replaceTaskWorkspaceTabsState(transition.taskWorkspaceTabsState);
    }
    setActivePage(nextTab.destination.page);
  }, [canCloseTab, commitWorkspace, draftProtection, getTaskWorkspaceTabsState, markPendingRoute, replaceTaskWorkspaceTabsState, setActivePage]);

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
    const currentWorkspace = workspaceRef.current;
    const panel = currentWorkspace.panels.find((candidate) => candidate.id === currentWorkspace.focusedPanelId);
    const currentTab = panel?.tabs.find((candidate) => candidate.id === panel.activeTabId);
    if (!panel || !currentTab) return false;
    const liveTaskWorkspaceTabsState = getTaskWorkspaceTabsState();
    const withScroll = snapshotTabScrollPosition(snapshotFocusedTasksWorkspace(currentWorkspace, liveTaskWorkspaceTabsState), panel.id, currentTab.id);
    markPendingRoute(destination.page);
    commitWorkspace((current) => replaceFocusedMasterTabDestination(
      current === currentWorkspace ? withScroll : snapshotFocusedTasksWorkspace(current, liveTaskWorkspaceTabsState),
      destination,
    ));
    return true;
  }, [activeMasterPage, activeTab.id, canNavigate, commitWorkspace, currentPanel.id, currentTransitionBlockReason, getTaskWorkspaceTabsState, hasUnsafeTasksDraft, isHealthSectionTransitionBlocked, markPendingRoute, snapshotFocusedTasksWorkspace]);

  const selectHealthSection = useCallback((healthSection: HealthTab) => {
    if (!canNavigate || activeMasterPage !== "Health") return false;
    return updateFocusedDestination({ kind: "health-tab", page: "Health", tab: healthSection });
  }, [activeMasterPage, canNavigate, updateFocusedDestination]);

  const updateJournalView = useCallback((journalView: MasterTabPresentationState["journalView"]) => {
    if (!canNavigate || !journalView) return false;
    commitWorkspace((current) => {
      const panel = current.panels.find((candidate) => candidate.id === currentPanel.id);
      if (!panel || panel.activeTabId !== activeTab.id) return current;
      return updateMasterTabJournalView(current, currentPanel.id, activeTab.id, journalView);
    });
    return true;
  }, [activeTab.id, canNavigate, commitWorkspace, currentPanel.id]);

  const updateNotesView = useCallback((notesView: NonNullable<MasterTabPresentationState["notesView"]>) => {
    if (!canNavigate) return false;
    commitWorkspace((current) => {
      const panel = current.panels.find((candidate) => candidate.id === currentPanel.id);
      if (!panel || panel.activeTabId !== activeTab.id) return current;
      return updateMasterTabNotesView(current, currentPanel.id, activeTab.id, notesView);
    });
    return true;
  }, [activeTab.id, canNavigate, commitWorkspace, currentPanel.id]);

  const updateScratchPaperView = useCallback((scratchPaperView: MasterScratchPaperWorkspaceView) => {
    if (!canNavigate) return false;
    commitWorkspace((current) => {
      const panel = current.panels.find((candidate) => candidate.id === currentPanel.id);
      if (!panel || panel.activeTabId !== activeTab.id) return current;
      return updateMasterTabScratchPaperView(current, currentPanel.id, activeTab.id, scratchPaperView);
    });
    return true;
  }, [activeTab.id, canNavigate, commitWorkspace, currentPanel.id]);

  const updateFoodView = useCallback((foodViewUpdate: MasterFoodWorkspaceViewUpdate) => {
    if (!canNavigate) return false;
    commitWorkspace((current) => {
      const panel = current.panels.find((candidate) => candidate.id === currentPanel.id);
      if (!panel?.tabs.some((tab) => tab.id === activeTab.id)) return current;
      return updateMasterTabFoodView(current, currentPanel.id, activeTab.id, foodViewUpdate);
    });
    return true;
  }, [activeTab.id, canNavigate, commitWorkspace, currentPanel.id]);

  const getTasksUiState = useCallback((panelId: string, tabId: string) => (
    resolveMasterWorkspaceTasksUiState(
      workspaceRef.current,
      panelId,
      tabId,
      resolveActiveTaskUiState(getTaskWorkspaceTabsState()),
    )
  ), [getTaskWorkspaceTabsState]);

  const updateTasksUiState = useCallback((
    panelId: string,
    tabId: string,
    updater: TaskUiState | ((current: TaskUiState) => TaskUiState),
  ) => updateMasterWorkspaceTasksUiState(
    workspaceRef.current,
    panelId,
    tabId,
    updater,
    canNavigate,
    applyTaskUiStateUpdate,
    commitWorkspace,
  ), [applyTaskUiStateUpdate, canNavigate, commitWorkspace]);

  return useMemo(() => ({
    activateTab,
    activeTab,
    activeJournalView,
    activeFoodView,
    activeNotesView,
    activeScratchPaperView,
    canActivateTab,
    canCloseTab,
    canOpenNewTab,
    canNavigate,
    closeTab,
    currentPanel,
    featureEnabled: isEnabled,
    getTasksUiState,
    isEnabled: isEnabled && isReady && Boolean(userId) && restoredUserId === userId,
    openPageTab,
    navigateToPage,
    selectHealthSection,
    updateFocusedDestination,
    updateJournalView,
    updateFoodView,
    updateNotesView,
    updateScratchPaperView,
    updateTasksUiState,
    workspace,
    transitionBlockedReason: currentTransitionBlockReason,
  }), [activateTab, activeJournalView, activeFoodView, activeNotesView, activeScratchPaperView, activeTab, canActivateTab, canCloseTab, canNavigate, canOpenNewTab, closeTab, currentPanel, currentTransitionBlockReason, getTasksUiState, isEnabled, isReady, navigateToPage, openPageTab, restoredUserId, selectHealthSection, updateFocusedDestination, updateJournalView, updateFoodView, updateNotesView, updateScratchPaperView, updateTasksUiState, userId, workspace]);
}
