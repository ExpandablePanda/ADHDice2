"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  activateMasterTabWithTaskWorkspace,
  canCloseMasterSplitSafely,
  closeMasterTabWithTaskWorkspace,
  closeMasterSplitSafely,
  getMasterWorkspaceTransitionBlockReason,
  isMasterWorkspaceFeatureEnabled,
  isHealthMasterTabTransitionBlocked,
  MASTER_SPLIT_UNSAVED_TASK_DRAFT_MESSAGE,
  persistMasterWorkspaceForReadyUser,
  resolveMasterWorkspaceTasksUiState,
  restoreMasterWorkspaceForUser,
  updateMasterWorkspaceTasksUiState,
  type MasterWorkspaceDraftProtection,
  type MasterWorkspaceStateUpdater,
} from "@/lib/master-workspace-controller";
import {
  closeMasterTab,
  closeMasterTabInPanel,
  createMasterTab,
  createDefaultMasterWorkspaceState,
  activateMasterPanel,
  activateMasterTabInPanel,
  duplicateFocusedPageIntoRightPanel,
  getMasterTabFoodView,
  getMasterTabJournalView,
  getMasterTabNotesView,
  getMasterTabScratchPaperView,
  masterTabTasksWorkspaceMatchesLiveState,
  resolveMasterTabTasksWorkspace,
  replaceFocusedMasterTabDestination,
  replaceMasterTabDestination,
  updateMasterTabPresentation,
  updateMasterTabJournalView,
  updateMasterTabFoodView,
  updateMasterTabNotesView,
  updateMasterTabScratchPaperView,
  updateMasterTabScrollPosition,
  updateMasterTabTasksWorkspace,
  updateMasterTabTasksWorkspaceState,
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
  hasUnsafeTasksDraftForPanel?: (panelId: string, tabId: string, includeInlineRename?: boolean) => boolean;
  hasUnsafeTasksDraftForSplit?: (workspace: MasterWorkspaceState) => boolean;
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

function createPanelId() {
  return `master-panel-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function snapshotTabScrollPosition(state: MasterWorkspaceState, panelId: string, tabId: string) {
  if (typeof window === "undefined") return state;
  const panelScroller = document.querySelector<HTMLElement>(`[data-master-workspace-scroll-container="${panelId}"]`);
  return updateMasterTabScrollPosition(state, panelId, tabId, panelScroller?.scrollTop ?? window.scrollY);
}

function alignFocusedPanelForTaskWorkspace(state: MasterWorkspaceState, preferredPanelId: string): MasterWorkspaceState {
  const taskPanels = state.panels.filter((panel) => {
    const tab = panel.tabs.find((candidate) => candidate.id === panel.activeTabId);
    return tab?.destination.page === "Tasks";
  });
  const panelToFocus = taskPanels.length === 1
    ? taskPanels[0]
    : taskPanels.length > 1
      ? taskPanels.find((panel) => panel.side === "left") ?? taskPanels[0]
      : state.panels.find((panel) => panel.id === preferredPanelId);
  return panelToFocus ? activateMasterPanel(state, panelToFocus.id) : state;
}

export function useMasterWorkspaceController({
  activePage,
  healthDraftSafetyBySection,
  hasUnsafeTasksDraft,
  hasUnsafeTasksDraftForPanel,
  hasUnsafeTasksDraftForSplit = () => hasUnsafeTasksDraft,
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
  const getPanelTabTransitionBlockReason = useCallback((currentWorkspace: MasterWorkspaceState, panelId: string, tabId: string, includeInlineRename = true) => {
    const panel = currentWorkspace.panels.find((candidate) => candidate.id === panelId);
    const tab = panel?.tabs.find((candidate) => candidate.id === tabId);
    if (!panel || !tab) return "The selected workspace is no longer available.";
    if (draftProtection && !draftProtection.canCloseView(tabId)) return "Save or cancel the unfinished form before leaving this workspace.";
    const isFocusedSource = panelId === currentWorkspace.focusedPanelId && panel.activeTabId === tabId;
    const unsafeTasksDraft = hasUnsafeTasksDraftForPanel?.(panelId, tabId, includeInlineRename) ?? (isFocusedSource && hasUnsafeTasksDraft);
    return getMasterWorkspaceTransitionBlockReason(
      tab.destination.page,
      tab.presentation.healthSection ?? initialHealthSection,
      unsafeTasksDraft,
      healthDraftSafetyBySection,
      tab.destination.page === "Notes" && hasUnsafeNotesDraft,
    );
  }, [draftProtection, hasUnsafeNotesDraft, hasUnsafeTasksDraft, hasUnsafeTasksDraftForPanel, healthDraftSafetyBySection, initialHealthSection]);
  const isTabTransitionBlocked = useCallback((targetTab: typeof activeTab) => {
    if (targetTab.id === activeTab.id) return false;
    const unsafeTasksDraft = hasUnsafeTasksDraftForPanel?.(currentPanel.id, activeTab.id) ?? hasUnsafeTasksDraft;
    if (activeMasterPage === "Tasks" && unsafeTasksDraft) return true;
    if (targetTab.destination.page !== activeMasterPage && currentTransitionBlockReason) return true;
    return activeMasterPage === "Health"
      && targetTab.destination.page === "Health"
      && isHealthSectionTransitionBlocked(targetTab.presentation.healthSection ?? "Today");
  }, [activeMasterPage, activeTab.id, currentPanel.id, currentTransitionBlockReason, hasUnsafeTasksDraft, hasUnsafeTasksDraftForPanel, isHealthSectionTransitionBlocked]);
  const pendingRouteRef = useRef<{ from: AppPage; to: AppPage } | null>(null);
  const lastLegacyRoutePageRef = useRef(activePage);
  const lastScrollRestoreRef = useRef({ tabId: activeTab.id, scrollTop: activeTab.presentation.scrollTop ?? 0 });

  useLayoutEffect(() => {
    const nextScrollTop = activeTab.presentation.scrollTop ?? 0;
    const previous = lastScrollRestoreRef.current;
    if (typeof window !== "undefined" && workspace.panels.length === 1 && (previous.tabId !== activeTab.id || previous.scrollTop !== nextScrollTop)) {
      window.scrollTo(0, nextScrollTop);
    }
    lastScrollRestoreRef.current = { tabId: activeTab.id, scrollTop: nextScrollTop };
  }, [activeTab.id, activeTab.presentation.scrollTop, workspace.panels.length]);

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
  const canSplitRight = canNavigate
    && currentPanel.side === "left"
    && !workspace.panels.some((panel) => panel.side === "right");

  const splitRight = useCallback(() => {
    if (!canNavigate) return false;
    const panelId = createPanelId();
    const tabId = createTabId();
    const liveTaskWorkspaceTabsState = getTaskWorkspaceTabsState();
    let didSplit = false;
    commitWorkspace((current) => {
      const panel = current.panels.find((candidate) => candidate.id === current.focusedPanelId);
      const tab = panel?.tabs.find((candidate) => candidate.id === panel.activeTabId);
      if (!panel || panel.side !== "left" || !tab) return current;
      if (current.panels.some((candidate) => candidate.side === "right")) return current;

      const withLiveTasksSnapshot = updateMasterTabTasksWorkspace(
        current,
        panel.id,
        tab.id,
        liveTaskWorkspaceTabsState,
      );
      const split = duplicateFocusedPageIntoRightPanel(withLiveTasksSnapshot, { panelId, tabId });
      if (split === withLiveTasksSnapshot) return current;

      didSplit = true;
      // Keep the existing TaskApp runtime focused on the left panel. The new
      // right panel remains a stored presentation snapshot.
      return activateMasterPanel(split, panel.id);
    });
    return didSplit;
  }, [canNavigate, commitWorkspace, getTaskWorkspaceTabsState]);

  const hasSplit = canNavigate && workspace.panels.some((panel) => panel.side === "right");
  const rightPanelForClose = workspace.panels.find((panel) => panel.side === "right");
  const hasUnsafeTasksDraftInSplit = hasUnsafeTasksDraftForSplit(workspace);
  const rightPanelCloseBlockReason = rightPanelForClose?.tabs
    .map((tab) => getPanelTabTransitionBlockReason(workspace, rightPanelForClose.id, tab.id, false))
    .find((reason) => reason !== null) ?? null;
  const canCloseSplit = canNavigate
    && canCloseMasterSplitSafely(workspace, hasUnsafeTasksDraftInSplit, (panelId, tabId) => getPanelTabTransitionBlockReason(workspace, panelId, tabId, false) === null)
    && rightPanelCloseBlockReason === null;
  const splitCloseBlockedReason = hasSplit
    ? hasUnsafeTasksDraftInSplit
      ? MASTER_SPLIT_UNSAVED_TASK_DRAFT_MESSAGE
      : rightPanelCloseBlockReason
    : null;

  const closeSplit = useCallback(() => {
    if (!canNavigate) return false;
    const before = workspaceRef.current;
    const focusedPanel = before.panels.find((panel) => panel.id === before.focusedPanelId);
    const focusedTab = focusedPanel?.tabs.find((tab) => tab.id === focusedPanel.activeTabId);
    const rightPanel = before.panels.find((panel) => panel.side === "right");
    if (!focusedPanel || !focusedTab || !rightPanel) return false;
    const canCloseTargetPanelTab = (panelId: string, tabId: string) => getPanelTabTransitionBlockReason(before, panelId, tabId, false) === null;
    const hasUnsafeTasksDraftInCurrentSplit = hasUnsafeTasksDraftForSplit(before);
    if (!canCloseSplit || !canCloseMasterSplitSafely(before, hasUnsafeTasksDraftInCurrentSplit, canCloseTargetPanelTab)) return false;

    const liveTaskWorkspaceTabsState = getTaskWorkspaceTabsState();
    const withLiveTasksSnapshot = focusedTab.destination.page === "Tasks"
      ? updateMasterTabTasksWorkspace(before, focusedPanel.id, focusedTab.id, liveTaskWorkspaceTabsState)
      : before;
    const next = closeMasterSplitSafely(withLiveTasksSnapshot, rightPanel.id, hasUnsafeTasksDraftForSplit(withLiveTasksSnapshot), canCloseTargetPanelTab);
    if (next === withLiveTasksSnapshot) return false;

    const leftPanel = next.panels.find((panel) => panel.side === "left") ?? next.panels[0];
    const leftTab = leftPanel.tabs.find((tab) => tab.id === leftPanel.activeTabId) ?? leftPanel.tabs[0];
    if (leftTab.destination.page !== activeMasterPage && currentTransitionBlockReason) return false;

    commitWorkspace(() => next);
    if (focusedPanel.id === rightPanel.id) {
      if (leftTab.destination.page === "Tasks" && leftTab.presentation.tasksWorkspace) {
        replaceTaskWorkspaceTabsState(leftTab.presentation.tasksWorkspace);
      }
      markPendingRoute(leftTab.destination.page);
      setActivePage(leftTab.destination.page);
    }
    return true;
  }, [activeMasterPage, canCloseSplit, canNavigate, commitWorkspace, currentTransitionBlockReason, getPanelTabTransitionBlockReason, getTaskWorkspaceTabsState, hasUnsafeTasksDraftForSplit, markPendingRoute, replaceTaskWorkspaceTabsState, setActivePage]);

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
    const updated = replaceFocusedMasterTabDestination(
      currentWorkspace === workspaceRef.current ? withScroll : snapshotFocusedTasksWorkspace(workspaceRef.current, liveTaskWorkspaceTabsState),
      { kind: "page", page },
    );
    const next = alignFocusedPanelForTaskWorkspace(updated, panel.id);
    const nextPanel = next.panels.find((candidate) => candidate.id === next.focusedPanelId);
    const nextTab = nextPanel?.tabs.find((candidate) => candidate.id === nextPanel.activeTabId);
    if (!nextPanel || !nextTab) return false;
    if (nextTab.destination.page === "Tasks" && nextTab.presentation.tasksWorkspace) {
      replaceTaskWorkspaceTabsState(nextTab.presentation.tasksWorkspace);
    }
    markPendingRoute(nextTab.destination.page);
    commitWorkspace(() => next);
    setActivePage(nextTab.destination.page);
    return true;
  }, [canNavigate, commitWorkspace, currentTransitionBlockReason, getTaskWorkspaceTabsState, markPendingRoute, replaceTaskWorkspaceTabsState, setActivePage, snapshotFocusedTasksWorkspace]);

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

  const canLeavePanelTab = useCallback((panelId: string, sourceTabId: string, targetTab?: typeof activeTab) => {
    const currentWorkspace = workspaceRef.current;
    const panel = currentWorkspace.panels.find((candidate) => candidate.id === panelId);
    const sourceTab = panel?.tabs.find((tab) => tab.id === sourceTabId);
    if (!panel || !sourceTab) return false;
    if (targetTab?.id === sourceTab.id) return true;
    if (getPanelTabTransitionBlockReason(currentWorkspace, panelId, sourceTabId)) return false;
    const healthSection = sourceTab.presentation.healthSection ?? initialHealthSection;
    if (sourceTab.destination.page === "Health" && targetTab?.destination.page === "Health") {
      const targetHealthSection = targetTab.presentation.healthSection ?? initialHealthSection;
      if (isHealthMasterTabTransitionBlocked(healthSection, targetHealthSection, Boolean(healthDraftSafetyBySection[healthSection]))) return false;
    }
    return true;
  }, [getPanelTabTransitionBlockReason, healthDraftSafetyBySection, initialHealthSection]);

  const canActivateTabInPanel = useCallback((panelId: string, tabId: string) => {
    if (!canNavigate) return false;
    const panel = workspace.panels.find((candidate) => candidate.id === panelId);
    const sourceTab = panel?.tabs.find((tab) => tab.id === panel.activeTabId);
    const targetTab = panel?.tabs.find((tab) => tab.id === tabId);
    return Boolean(panel && sourceTab && targetTab)
      && (sourceTab?.id === targetTab?.id || canLeavePanelTab(panelId, sourceTab?.id ?? "", targetTab));
  }, [canLeavePanelTab, canNavigate, workspace]);

  const activateTabInPanel = useCallback((panelId: string, tabId: string) => {
    if (!canActivateTabInPanel(panelId, tabId)) return;
    const currentWorkspace = workspaceRef.current;
    const panel = currentWorkspace.panels.find((candidate) => candidate.id === panelId);
    if (!panel || panel.activeTabId === tabId) return;
    const withScroll = snapshotTabScrollPosition(currentWorkspace, panelId, panel.activeTabId);
    const activeSourceTab = panel.tabs.find((candidate) => candidate.id === panel.activeTabId);
    const withTasksSnapshot = currentWorkspace.focusedPanelId === panelId && activeSourceTab?.destination.page === "Tasks"
      ? updateMasterTabTasksWorkspace(withScroll, panelId, activeSourceTab.id, getTaskWorkspaceTabsState())
      : withScroll;
    const activated = panelId === currentWorkspace.focusedPanelId
      ? activateMasterTabWithTaskWorkspace(withTasksSnapshot, panelId, tabId, getTaskWorkspaceTabsState()).state
      : activateMasterTabInPanel(withTasksSnapshot, panelId, tabId);
    const next = alignFocusedPanelForTaskWorkspace(activated, panelId);
    const focusedPanel = next.panels.find((candidate) => candidate.id === next.focusedPanelId);
    const focusedTab = focusedPanel?.tabs.find((candidate) => candidate.id === focusedPanel.activeTabId);
    if (!focusedPanel || !focusedTab) return;
    if (focusedTab.destination.page === "Tasks" && focusedTab.presentation.tasksWorkspace) {
      replaceTaskWorkspaceTabsState(focusedTab.presentation.tasksWorkspace);
    }
    markPendingRoute(focusedTab.destination.page);
    commitWorkspace(() => next);
    setActivePage(focusedTab.destination.page);
  }, [canActivateTabInPanel, commitWorkspace, getTaskWorkspaceTabsState, markPendingRoute, replaceTaskWorkspaceTabsState, setActivePage]);

  const canOpenNewTabInPanel = useCallback((panelId: string) => {
    if (!canNavigate) return false;
    const panel = workspace.panels.find((candidate) => candidate.id === panelId);
    const sourceTab = panel?.tabs.find((tab) => tab.id === panel.activeTabId);
    return Boolean(sourceTab && canLeavePanelTab(panelId, sourceTab.id));
  }, [canLeavePanelTab, canNavigate, workspace]);

  const openPageTabInPanel = useCallback((panelId: string, page: AppPage) => {
    if (!canOpenNewTabInPanel(panelId)) return false;
    const currentWorkspace = workspaceRef.current;
    const panel = currentWorkspace.panels.find((candidate) => candidate.id === panelId);
    const currentTab = panel?.tabs.find((candidate) => candidate.id === panel.activeTabId);
    if (!panel || !currentTab) return false;
    const withScroll = snapshotTabScrollPosition(currentWorkspace, panelId, currentTab.id);
    const id = createTabId();
    const healthSection = currentTab.destination.page === "Health"
      ? currentTab.presentation.healthSection ?? initialHealthSection
      : initialHealthSection;
    const tasksWorkspace = page === "Tasks"
      ? currentTab.destination.page === "Tasks" && currentTab.presentation.tasksWorkspace
        ? currentTab.presentation.tasksWorkspace
        : getTaskWorkspaceTabsState()
      : undefined;
    const next = createMasterTab(withScroll, panelId, {
      id,
      destination: { kind: "page", page },
      presentation: {
        ...(tasksWorkspace ? { tasksWorkspace } : {}),
        ...(page === "Health" ? { healthSection } : {}),
      },
    }, true, true);
    if (next === withScroll) return false;
    const aligned = alignFocusedPanelForTaskWorkspace(next, panelId);
    const focusedPanel = aligned.panels.find((candidate) => candidate.id === aligned.focusedPanelId);
    const focusedTab = focusedPanel?.tabs.find((candidate) => candidate.id === focusedPanel.activeTabId);
    if (focusedTab?.destination.page === "Tasks" && focusedTab.presentation.tasksWorkspace) {
      replaceTaskWorkspaceTabsState(focusedTab.presentation.tasksWorkspace);
    }
    if (focusedTab) {
      markPendingRoute(focusedTab.destination.page);
      setActivePage(focusedTab.destination.page);
    }
    commitWorkspace(() => aligned);
    return true;
  }, [canOpenNewTabInPanel, commitWorkspace, getTaskWorkspaceTabsState, initialHealthSection, markPendingRoute, replaceTaskWorkspaceTabsState, setActivePage]);

  const canCloseTabInPanel = useCallback((panelId: string, tabId: string) => {
    if (!canNavigate) return false;
    if (draftProtection && !draftProtection.canCloseView(tabId)) return false;
    const panel = workspace.panels.find((candidate) => candidate.id === panelId);
    const targetTab = panel?.tabs.find((tab) => tab.id === tabId);
    if (!panel || !targetTab) return false;
    if (panel.activeTabId !== tabId) return panel.tabs.length > 1;
    if (panel.tabs.length === 1) return canLeavePanelTab(panelId, tabId);
    const next = panel.tabs[Math.max(0, panel.tabs.findIndex((tab) => tab.id === tabId) - 1)];
    return Boolean(next && canLeavePanelTab(panelId, tabId, next));
  }, [canLeavePanelTab, canNavigate, draftProtection, workspace]);

  const closeTabInPanel = useCallback((panelId: string, tabId: string) => {
    if (!canCloseTabInPanel(panelId, tabId)) return;
    const currentWorkspace = workspaceRef.current;
    const panel = currentWorkspace.panels.find((candidate) => candidate.id === panelId);
    let withScroll = panel?.activeTabId
      ? snapshotTabScrollPosition(currentWorkspace, panelId, panel.activeTabId)
      : currentWorkspace;
    const activeTab = panel?.tabs.find((candidate) => candidate.id === panel.activeTabId);
    if (panelId === currentWorkspace.focusedPanelId && activeTab?.destination.page === "Tasks") {
      withScroll = updateMasterTabTasksWorkspace(withScroll, panelId, activeTab.id, getTaskWorkspaceTabsState());
    }
    const closed = closeMasterTabInPanel(withScroll, panelId, tabId);
    if (closed === withScroll) return;
    const next = alignFocusedPanelForTaskWorkspace(closed, panelId);
    draftProtection?.detachView(tabId);
    const focusedPanel = next.panels.find((candidate) => candidate.id === next.focusedPanelId);
    const focusedTab = focusedPanel?.tabs.find((candidate) => candidate.id === focusedPanel.activeTabId);
    if (focusedTab?.destination.page === "Tasks" && focusedTab.presentation.tasksWorkspace) {
      replaceTaskWorkspaceTabsState(focusedTab.presentation.tasksWorkspace);
    }
    if (focusedTab) {
      markPendingRoute(focusedTab.destination.page);
      setActivePage(focusedTab.destination.page);
    }
    commitWorkspace(() => next);
  }, [canCloseTabInPanel, commitWorkspace, draftProtection, getTaskWorkspaceTabsState, markPendingRoute, replaceTaskWorkspaceTabsState, setActivePage]);

  const updatePanelDestination = useCallback((panelId: string, tabId: string, destination: MasterTabDestination) => {
    if (!canNavigate) return false;
    const currentWorkspace = workspaceRef.current;
    const panel = currentWorkspace.panels.find((candidate) => candidate.id === panelId);
    const tab = panel?.tabs.find((candidate) => candidate.id === tabId);
    if (!panel || !tab) return false;
    const targetTab = { ...tab, destination };
    if (!canLeavePanelTab(panelId, tabId, targetTab)) return false;
    const targetHealthSection = destination.kind === "health-tab"
      ? destination.tab
      : destination.kind === "page-shell" ? destination.healthTab : undefined;
    const currentHealthSection = tab.presentation.healthSection ?? initialHealthSection;
    if (destination.page === "Health" && targetHealthSection
      && isHealthMasterTabTransitionBlocked(currentHealthSection, targetHealthSection, Boolean(healthDraftSafetyBySection[currentHealthSection]))) return false;
    let withScroll = snapshotTabScrollPosition(currentWorkspace, panelId, tabId);
    if (panelId === currentWorkspace.focusedPanelId && tabId === panel.activeTabId && tab.destination.page === "Tasks") {
      withScroll = updateMasterTabTasksWorkspace(withScroll, panelId, tabId, getTaskWorkspaceTabsState());
    }
    const updated = replaceMasterTabDestination(withScroll, panelId, tabId, destination);
    if (updated === withScroll) return true;
    const next = alignFocusedPanelForTaskWorkspace(updated, panelId);
    const focusedPanel = next.panels.find((candidate) => candidate.id === next.focusedPanelId);
    const focusedTab = focusedPanel?.tabs.find((candidate) => candidate.id === focusedPanel.activeTabId);
    if (focusedTab?.destination.page === "Tasks" && focusedTab.presentation.tasksWorkspace) {
      replaceTaskWorkspaceTabsState(focusedTab.presentation.tasksWorkspace);
    }
    if (focusedTab) {
      markPendingRoute(focusedTab.destination.page);
      setActivePage(focusedTab.destination.page);
    }
    commitWorkspace(() => next);
    return true;
  }, [canLeavePanelTab, canNavigate, commitWorkspace, getTaskWorkspaceTabsState, healthDraftSafetyBySection, initialHealthSection, markPendingRoute, replaceTaskWorkspaceTabsState, setActivePage]);

  const navigatePanelToPage = useCallback((panelId: string, page: AppPage) => {
    const panel = workspace.panels.find((candidate) => candidate.id === panelId);
    const tab = panel?.tabs.find((candidate) => candidate.id === panel.activeTabId);
    return Boolean(tab && updatePanelDestination(panelId, tab.id, { kind: "page", page }));
  }, [updatePanelDestination, workspace]);

  const updatePanelPresentation = useCallback((panelId: string, tabId: string, updater: MasterTabPresentationState | ((current: MasterTabPresentationState) => MasterTabPresentationState)) => {
    if (!canNavigate) return false;
    let didUpdate = false;
    commitWorkspace((current) => {
      const next = updateMasterTabPresentation(current, panelId, tabId, updater);
      didUpdate = next !== current;
      return next;
    });
    return didUpdate;
  }, [canNavigate, commitWorkspace]);

  const selectHealthSectionInPanel = useCallback((panelId: string, tabId: string, healthSection: HealthTab) => (
    updatePanelDestination(panelId, tabId, { kind: "health-tab", page: "Health", tab: healthSection })
  ), [updatePanelDestination]);

  const updateJournalViewInPanel = useCallback((panelId: string, tabId: string, journalView: MasterTabPresentationState["journalView"]) => {
    if (!canNavigate || !journalView) return false;
    commitWorkspace((current) => updateMasterTabJournalView(current, panelId, tabId, journalView));
    return true;
  }, [canNavigate, commitWorkspace]);

  const updateNotesViewInPanel = useCallback((panelId: string, tabId: string, notesView: NonNullable<MasterTabPresentationState["notesView"]>) => {
    if (!canNavigate) return false;
    commitWorkspace((current) => updateMasterTabNotesView(current, panelId, tabId, notesView));
    return true;
  }, [canNavigate, commitWorkspace]);

  const updateScratchPaperViewInPanel = useCallback((panelId: string, tabId: string, scratchPaperView: MasterScratchPaperWorkspaceView) => {
    if (!canNavigate) return false;
    commitWorkspace((current) => updateMasterTabScratchPaperView(current, panelId, tabId, scratchPaperView));
    return true;
  }, [canNavigate, commitWorkspace]);

  const updateFoodViewInPanel = useCallback((panelId: string, tabId: string, foodView: MasterFoodWorkspaceViewUpdate) => {
    if (!canNavigate) return false;
    commitWorkspace((current) => updateMasterTabFoodView(current, panelId, tabId, foodView));
    return true;
  }, [canNavigate, commitWorkspace]);

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

  const updateTasksWorkspace = useCallback((
    panelId: string,
    tabId: string,
    updater: TaskWorkspaceTabsState | ((current: TaskWorkspaceTabsState) => TaskWorkspaceTabsState),
  ) => {
    if (!canNavigate) return false;
    const before = workspaceRef.current;
    const panel = before.panels.find((candidate) => candidate.id === panelId);
    const isFocusedActiveTab = before.focusedPanelId === panelId && panel?.activeTabId === tabId;
    if (!resolveMasterTabTasksWorkspace(before, panelId, tabId)) return false;

    if (isFocusedActiveTab) {
      const liveTaskWorkspaceTabsState = getTaskWorkspaceTabsState();
      const next = typeof updater === "function" ? updater(liveTaskWorkspaceTabsState) : updater;
      if (next === liveTaskWorkspaceTabsState || JSON.stringify(next) === JSON.stringify(liveTaskWorkspaceTabsState)) return true;
      replaceTaskWorkspaceTabsState(next);
      commitWorkspace((current) => updateMasterTabTasksWorkspace(current, panelId, tabId, next));
      return true;
    }

    let changed = false;
    commitWorkspace((current) => {
      const next = updateMasterTabTasksWorkspaceState(current, panelId, tabId, updater);
      changed = next !== current;
      return next;
    });
    return changed;
  }, [canNavigate, commitWorkspace, getTaskWorkspaceTabsState, replaceTaskWorkspaceTabsState]);

  return useMemo(() => ({
    activateTab,
    activateTabInPanel,
    activeTab,
    activeJournalView,
    activeFoodView,
    activeNotesView,
    activeScratchPaperView,
    canActivateTab,
    canActivateTabInPanel,
    canCloseTab,
    canCloseTabInPanel,
    canOpenNewTab,
    canOpenNewTabInPanel,
    canNavigate,
    canSplitRight,
    canCloseSplit,
    hasSplit,
    splitCloseBlockedReason,
    closeTab,
    closeTabInPanel,
    closeSplit,
    currentPanel,
    featureEnabled: isEnabled,
    getTasksUiState,
    isEnabled: isEnabled && isReady && Boolean(userId) && restoredUserId === userId,
    openPageTab,
    openPageTabInPanel,
    splitRight,
    navigateToPage,
    navigatePanelToPage,
    selectHealthSection,
    selectHealthSectionInPanel,
    updateFocusedDestination,
    updatePanelDestination,
    updatePanelPresentation,
    updateJournalView,
    updateFoodView,
    updateNotesView,
    updateNotesViewInPanel,
    updateJournalViewInPanel,
    updateFoodViewInPanel,
    updateScratchPaperViewInPanel,
    updateScratchPaperView,
    updateTasksWorkspace,
    updateTasksUiState,
    workspace,
    transitionBlockedReason: currentTransitionBlockReason,
  }), [activateTab, activateTabInPanel, activeJournalView, activeFoodView, activeNotesView, activeScratchPaperView, activeTab, canActivateTab, canActivateTabInPanel, canCloseTab, canCloseTabInPanel, canCloseSplit, canNavigate, canOpenNewTab, canOpenNewTabInPanel, canSplitRight, closeTab, closeTabInPanel, closeSplit, currentPanel, currentTransitionBlockReason, getTasksUiState, hasSplit, isEnabled, isReady, navigatePanelToPage, navigateToPage, openPageTab, openPageTabInPanel, restoredUserId, selectHealthSection, selectHealthSectionInPanel, splitCloseBlockedReason, splitRight, updateFocusedDestination, updatePanelDestination, updatePanelPresentation, updateJournalView, updateJournalViewInPanel, updateFoodView, updateFoodViewInPanel, updateNotesView, updateNotesViewInPanel, updateScratchPaperView, updateScratchPaperViewInPanel, updateTasksWorkspace, updateTasksUiState, userId, workspace]);
}
