import assert from "node:assert/strict";
import test from "node:test";
import {
  activateMasterTabWithTaskWorkspace,
  canCloseMasterSplitSafely,
  canPersistLegacyTaskWorkspace,
  closeMasterSplitSafely,
  closeMasterTabWithTaskWorkspace,
  getMasterWorkspaceTransitionBlockReason,
  isMasterWorkspaceFeatureEnabled,
  isHealthMasterTabTransitionBlocked,
  isTasksMasterTabTransitionBlocked,
  persistMasterWorkspaceForReadyUser,
  resolveMasterWorkspaceTasksUiState,
  restoreMasterWorkspaceForUser,
  updateMasterWorkspaceTasksUiState,
} from "../src/lib/master-workspace-controller.ts";
import {
  activateMasterPanel,
  createMasterTab,
  duplicateFocusedPageIntoRightPanel,
  getMasterWorkspaceStorageKey,
  updateMasterTabTasksWorkspace,
} from "../src/lib/master-workspace-state.ts";
import { DEFAULT_TASK_WORKSPACE_TABS_STATE, updateActiveTaskUiState, type TaskUiState, type TaskWorkspaceTabsState } from "../src/lib/task-ui-state.ts";
import {
  getTaskPanelDraftSourceKey,
  hasTaskPanelDraftForOwner,
  hasTaskPanelDraftOutsideOwner,
  updateTaskPanelDraftOwnerKeys,
} from "../src/lib/task-panel-draft-safety.ts";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

function taskWorkspace(search: string, options: {
  bucket?: string;
  quickFilters?: Array<"active" | "done" | "urgent" | "today" | "focused">;
  sort?: { field: "title" | "priority"; direction: "asc" | "desc" };
  view?: "table" | "list" | "cards" | "matrix" | "calendar";
} = {}): TaskWorkspaceTabsState {
  const firstTab = DEFAULT_TASK_WORKSPACE_TABS_STATE.tabs[0];
  return {
    activeTabId: "nested-one",
    uiStateVersion: DEFAULT_TASK_WORKSPACE_TABS_STATE.uiStateVersion,
    tabs: [{
      ...firstTab,
      id: "nested-one",
      taskUiState: {
        ...firstTab.taskUiState,
        search,
        selectedBucket: options.bucket ?? "today",
        quickFilters: options.quickFilters ?? [],
        listSortBySurface: options.sort
          ? { "tasks:all": options.sort }
          : firstTab.taskUiState.listSortBySurface,
        view: options.view ?? "table",
      },
    }],
  };
}

function routeTasksUpdate(
  state: ReturnType<typeof restoreMasterWorkspaceForUser>["state"],
  liveTaskWorkspace: TaskWorkspaceTabsState,
  panelId: string,
  tabId: string,
  updater: TaskUiState | ((current: TaskUiState) => TaskUiState),
  options: { isReady?: boolean } = {},
) {
  let workspace = state;
  let live = liveTaskWorkspace;
  let liveSetterCalls = 0;
  let workspaceSetterCalls = 0;
  let insideWorkspaceUpdater = false;
  const result = updateMasterWorkspaceTasksUiState(
    state,
    panelId,
    tabId,
    updater,
    options.isReady ?? true,
    (expectedTaskTabId, next) => {
      assert.equal(insideWorkspaceUpdater, false, "the live setter must not run inside the workspace updater");
      liveSetterCalls += 1;
      if (live.activeTabId !== expectedTaskTabId || !live.tabs.some((tab) => tab.id === expectedTaskTabId)) return undefined;
      live = updateActiveTaskUiState(live, next);
      return live;
    },
    (next) => {
      workspaceSetterCalls += 1;
      insideWorkspaceUpdater = true;
      try {
        workspace = next(workspace);
      } finally {
        insideWorkspaceUpdater = false;
      }
      return workspace;
    },
  );
  return { result, live, liveSetterCalls, workspace, workspaceSetterCalls };
}

function twoTasksPanels(leftTasks: TaskWorkspaceTabsState, rightTasks: TaskWorkspaceTabsState) {
  const initialized = restoreMasterWorkspaceForUser(memoryStorage(), "panel-target-user", "Tasks", leftTasks).state;
  const leftPanelId = initialized.panels[0].id;
  const leftTabId = initialized.panels[0].activeTabId;
  const withRightPanel = duplicateFocusedPageIntoRightPanel(initialized, {
    panelId: "right-panel",
    tabId: "right-tasks",
  });
  const withRightSnapshot = updateMasterTabTasksWorkspace(withRightPanel, "right-panel", "right-tasks", rightTasks);
  return {
    leftPanelId,
    leftTabId,
    rightPanelId: "right-panel",
    rightTabId: "right-tasks",
    state: activateMasterPanel(withRightSnapshot, leftPanelId),
  };
}

function twoTasksTabs(leftTasks: TaskWorkspaceTabsState, rightTasks: TaskWorkspaceTabsState) {
  const initialized = restoreMasterWorkspaceForUser(memoryStorage(), "tab-target-user", "Tasks", leftTasks).state;
  const panelId = initialized.focusedPanelId;
  return {
    panelId,
    leftTabId: initialized.panels[0].activeTabId,
    rightTabId: "right-tasks",
    state: createMasterTab(initialized, panelId, {
      id: "right-tasks",
      destination: { kind: "page", page: "Tasks" },
      presentation: { tasksWorkspace: rightTasks },
    }, false),
  };
}

test("first hydration preserves the legacy page and Tasks workspace without writing early", () => {
  const storage = memoryStorage();
  const tasksState = {
    ...DEFAULT_TASK_WORKSPACE_TABS_STATE,
    activeTabId: "legacy-tab",
    tabs: [{ ...DEFAULT_TASK_WORKSPACE_TABS_STATE.tabs[0], id: "legacy-tab", label: "Legacy Tasks" }],
  };
  const restored = restoreMasterWorkspaceForUser(storage, "user-a", "Tasks", tasksState);

  assert.equal(restored.restored, false);
  assert.equal(restored.state.panels[0].tabs[0].destination.page, "Tasks");
  assert.equal(restored.state.panels[0].tabs[0].presentation.tasksWorkspace?.activeTabId, "legacy-tab");
  assert.equal(storage.values.has(getMasterWorkspaceStorageKey("user-a")), false);
});

test("focused active Tasks presentation reads and writes stay on the live task UI owner", () => {
  const live = taskWorkspace("live before", {
    bucket: "today",
    quickFilters: ["today"],
    sort: { field: "title", direction: "asc" },
    view: "table",
  });
  const initialized = restoreMasterWorkspaceForUser(memoryStorage(), "live-route-user", "Tasks", live).state;
  const panelId = initialized.focusedPanelId;
  const tabId = initialized.panels[0].activeTabId;
  const liveUiState = live.tabs[0].taskUiState;

  assert.equal(resolveMasterWorkspaceTasksUiState(initialized, panelId, tabId, liveUiState), liveUiState);
  const routed = routeTasksUpdate(initialized, live, panelId, tabId, (current) => ({
    ...current,
    search: "live after",
    selectedBucket: "attention",
    view: "matrix",
  }));

  assert.deepEqual(routed.result, { status: "queued", route: "live", panelId, tabId });
  assert.equal(routed.liveSetterCalls, 1);
  assert.equal(routed.workspaceSetterCalls, 1);
  assert.equal(routed.live.tabs[0].taskUiState.search, "live after");
  assert.equal(routed.live.tabs[0].taskUiState.selectedBucket, "attention");
  assert.equal(routed.live.tabs[0].taskUiState.view, "matrix");
  assert.equal(initialized.panels[0].tabs[0].presentation.tasksWorkspace?.tabs[0].taskUiState.search, "live before");

  const mirrored = updateMasterTabTasksWorkspace(routed.workspace, panelId, tabId, routed.live);
  assert.equal(mirrored.panels[0].tabs[0].presentation.tasksWorkspace?.tabs[0].taskUiState.search, "live after");
  assert.equal(updateMasterTabTasksWorkspace(mirrored, panelId, tabId, routed.live), mirrored);
});

test("right Tasks presentation updates remain independent while the left panel stays focused", () => {
  const left = taskWorkspace("left search", {
    bucket: "today",
    quickFilters: ["today"],
    sort: { field: "title", direction: "asc" },
    view: "table",
  });
  const right = taskWorkspace("right search", {
    bucket: "attention",
    quickFilters: ["urgent"],
    sort: { field: "priority", direction: "desc" },
    view: "calendar",
  });
  const panels = twoTasksPanels(left, right);
  const leftUiState = left.tabs[0].taskUiState;

  assert.equal(resolveMasterWorkspaceTasksUiState(panels.state, panels.leftPanelId, panels.leftTabId, leftUiState), leftUiState);
  assert.deepEqual(resolveMasterWorkspaceTasksUiState(panels.state, panels.rightPanelId, panels.rightTabId, leftUiState), right.tabs[0].taskUiState);

  const rightUpdate = routeTasksUpdate(panels.state, left, panels.rightPanelId, panels.rightTabId, (current) => ({
    ...current,
    search: "right changed",
    selectedBucket: "all",
    quickFilters: ["active"],
    listSortBySurface: { ...current.listSortBySurface, "tasks:all": { field: "title", direction: "desc" } },
    view: "cards",
  }));

  assert.deepEqual(rightUpdate.result, { status: "queued", route: "snapshot", panelId: panels.rightPanelId, tabId: panels.rightTabId });
  assert.equal(rightUpdate.liveSetterCalls, 0);
  assert.equal(rightUpdate.workspaceSetterCalls, 1);
  assert.equal(rightUpdate.workspace.focusedPanelId, panels.leftPanelId);
  assert.deepEqual(rightUpdate.workspace.panels[0].tabs[0].presentation.tasksWorkspace, left);
  const updatedRight = rightUpdate.workspace.panels.find((panel) => panel.id === panels.rightPanelId)?.tabs[0].presentation.tasksWorkspace;
  assert.equal(updatedRight?.tabs[0].taskUiState.search, "right changed");
  assert.equal(updatedRight?.tabs[0].taskUiState.selectedBucket, "all");
  assert.deepEqual(updatedRight?.tabs[0].taskUiState.quickFilters, ["active"]);
  assert.deepEqual(updatedRight?.tabs[0].taskUiState.listSortBySurface["tasks:all"], { field: "title", direction: "desc" });
  assert.equal(updatedRight?.tabs[0].taskUiState.view, "cards");

  const leftUpdate = routeTasksUpdate(rightUpdate.workspace, left, panels.leftPanelId, panels.leftTabId, (current) => ({
    ...current,
    search: "left changed live",
    view: "matrix",
  }));
  const afterLeftMirror = updateMasterTabTasksWorkspace(leftUpdate.workspace, panels.leftPanelId, panels.leftTabId, leftUpdate.live);
  const persisted = memoryStorage();
  assert.equal(persistMasterWorkspaceForReadyUser(persisted, "two-panels-user", "two-panels-user", true, afterLeftMirror), true);
  const restored = restoreMasterWorkspaceForUser(persisted, "two-panels-user", "Home", DEFAULT_TASK_WORKSPACE_TABS_STATE).state;

  const restoredLeft = restored.panels.find((panel) => panel.id === panels.leftPanelId)?.tabs[0].presentation.tasksWorkspace;
  const restoredRight = restored.panels.find((panel) => panel.id === panels.rightPanelId)?.tabs[0].presentation.tasksWorkspace;
  assert.equal(restored.focusedPanelId, panels.leftPanelId);
  assert.equal(restoredLeft?.tabs[0].taskUiState.search, "left changed live");
  assert.equal(restoredLeft?.tabs[0].taskUiState.view, "matrix");
  assert.equal(restoredRight?.tabs[0].taskUiState.search, "right changed");
  assert.equal(restoredRight?.tabs[0].taskUiState.view, "cards");
  assert.deepEqual(restoredRight?.tabs[0].taskUiState.listSortBySurface["tasks:all"], { field: "title", direction: "desc" });
});

test("inactive Tasks tabs update their own stored snapshot without changing the live Tasks state", () => {
  const live = taskWorkspace("active tab", { bucket: "today", view: "table" });
  const initialized = restoreMasterWorkspaceForUser(memoryStorage(), "inactive-task-user", "Tasks", live).state;
  const panelId = initialized.focusedPanelId;
  const withInactiveTaskTab = createMasterTab(initialized, panelId, {
    id: "inactive-tasks-tab",
    destination: { kind: "page", page: "Tasks" },
    presentation: { tasksWorkspace: taskWorkspace("inactive tab", { bucket: "attention", view: "calendar" }) },
  }, false);

  const routed = routeTasksUpdate(withInactiveTaskTab, live, panelId, "inactive-tasks-tab", (current) => ({
    ...current,
    search: "inactive changed",
    view: "list",
  }));

  assert.equal(routed.liveSetterCalls, 0);
  assert.equal(routed.workspaceSetterCalls, 1);
  assert.equal(routed.live, live);
  assert.equal(routed.workspace.panels[0].activeTabId, initialized.panels[0].activeTabId);
  assert.equal(routed.workspace.panels[0].tabs[0].presentation.tasksWorkspace?.tabs[0].taskUiState.search, "active tab");
  assert.equal(routed.workspace.panels[0].tabs[1].presentation.tasksWorkspace?.tabs[0].taskUiState.search, "inactive changed");
  assert.equal(routed.workspace.panels[0].tabs[1].presentation.tasksWorkspace?.tabs[0].taskUiState.view, "list");
});

test("right-panel search updates only the inactive split snapshot while the left live Tasks owner stays unchanged", () => {
  const leftTasks = taskWorkspace("left search");
  const panels = twoTasksPanels(leftTasks, taskWorkspace(""));
  const routed = routeTasksUpdate(
    panels.state,
    leftTasks,
    panels.rightPanelId,
    panels.rightTabId,
    (current) => ({ ...current, search: "right search" }),
  );

  assert.deepEqual(routed.result, {
    status: "queued",
    route: "snapshot",
    panelId: panels.rightPanelId,
    tabId: panels.rightTabId,
  });
  assert.equal(routed.liveSetterCalls, 0);
  assert.equal(routed.live.tabs[0].taskUiState.search, "left search");
  assert.equal(
    resolveMasterWorkspaceTasksUiState(routed.workspace, panels.rightPanelId, panels.rightTabId, routed.live.tabs[0].taskUiState)?.search,
    "right search",
  );
});

test("Tasks routing reads the latest workspace snapshot and active Tasks owner", () => {
  const panels = twoTasksPanels(taskWorkspace("left"), taskWorkspace("right"));
  const latestRightSnapshot = updateMasterTabTasksWorkspace(
    panels.state,
    panels.rightPanelId,
    panels.rightTabId,
    taskWorkspace("right latest", { bucket: "attention", view: "calendar" }),
  );
  const latestUpdate = routeTasksUpdate(
    latestRightSnapshot,
    taskWorkspace("left"),
    panels.rightPanelId,
    panels.rightTabId,
    (current) => ({ ...current, search: `${current.search} plus update` }),
  );
  const latestRight = latestUpdate.workspace.panels.find((panel) => panel.id === panels.rightPanelId)?.tabs[0].presentation.tasksWorkspace;

  assert.equal(latestRight?.tabs[0].taskUiState.search, "right latest plus update");
  assert.equal(latestRight?.tabs[0].taskUiState.selectedBucket, "attention");

  const nowFocused = activateMasterPanel(latestRightSnapshot, panels.rightPanelId);
  const transitionRace = routeTasksUpdate(
    nowFocused,
    taskWorkspace("right latest", { bucket: "attention", view: "calendar" }),
    panels.rightPanelId,
    panels.rightTabId,
    (current) => ({ ...current, search: `${current.search} + update` }),
  );
  assert.deepEqual(transitionRace.result, { status: "queued", route: "live", panelId: panels.rightPanelId, tabId: panels.rightTabId });
  assert.equal(transitionRace.liveSetterCalls, 1);
  assert.equal(transitionRace.workspaceSetterCalls, 1);
  assert.equal(transitionRace.workspace.focusedPanelId, panels.rightPanelId);
  assert.equal(transitionRace.live.tabs[0].taskUiState.search, "right latest + update");
  assert.equal(transitionRace.workspace.panels.find((panel) => panel.id === panels.rightPanelId)?.tabs[0].presentation.tasksWorkspace?.tabs[0].taskUiState.search, "right latest + update");
});

test("inactive Tasks update followed by focus change restores the updated target into the live owner", () => {
  const panels = twoTasksTabs(taskWorkspace("left"), taskWorkspace("right"));
  const routed = routeTasksUpdate(
    panels.state,
    taskWorkspace("left"),
    panels.panelId,
    panels.rightTabId,
    (current) => ({ ...current, search: `${current.search} changed` }),
  );
  const transition = activateMasterTabWithTaskWorkspace(
    routed.workspace,
    panels.panelId,
    panels.rightTabId,
    routed.live,
  );

  assert.deepEqual(routed.result, { status: "queued", route: "snapshot", panelId: panels.panelId, tabId: panels.rightTabId });
  assert.equal(transition.state.focusedPanelId, panels.panelId);
  assert.equal(transition.state.panels.find((panel) => panel.id === panels.panelId)?.activeTabId, panels.rightTabId);
  assert.equal(transition.taskWorkspaceTabsState?.tabs[0].taskUiState.search, "right changed");
  assert.equal(transition.state.panels.find((panel) => panel.id === panels.panelId)?.tabs[1].presentation.tasksWorkspace?.tabs[0].taskUiState.search, "right changed");
});

test("focused Tasks update followed by navigation is preserved once in the outgoing tab", () => {
  const panels = twoTasksTabs(taskWorkspace("left"), taskWorkspace("right"));
  const routed = routeTasksUpdate(
    panels.state,
    taskWorkspace("left"),
    panels.panelId,
    panels.leftTabId,
    (current) => ({ ...current, search: `${current.search} changed` }),
  );
  const transition = activateMasterTabWithTaskWorkspace(
    routed.workspace,
    panels.panelId,
    panels.rightTabId,
    routed.live,
  );
  const storedLeft = transition.state.panels.find((panel) => panel.id === panels.panelId)?.tabs[0].presentation.tasksWorkspace;

  assert.deepEqual(routed.result, { status: "queued", route: "live", panelId: panels.panelId, tabId: panels.leftTabId });
  assert.equal(routed.live.tabs[0].taskUiState.search, "left changed");
  assert.equal(storedLeft?.tabs[0].taskUiState.search, "left changed");
  assert.equal(transition.taskWorkspaceTabsState?.tabs[0].taskUiState.search, "right");
});

test("a stale Tasks update callback after focus changes writes only to its original tab snapshot", () => {
  const panels = twoTasksTabs(taskWorkspace("left"), taskWorkspace("right"));
  const workspaceRef = { current: panels.state };
  const liveRef = { current: taskWorkspace("left") };
  const staleCallback = (updater: TaskUiState | ((current: TaskUiState) => TaskUiState)) => routeTasksUpdate(
    workspaceRef.current,
    liveRef.current,
    panels.panelId,
    panels.leftTabId,
    updater,
  );
  const focusedRight = activateMasterTabWithTaskWorkspace(
    workspaceRef.current,
    panels.panelId,
    panels.rightTabId,
    liveRef.current,
  );
  workspaceRef.current = focusedRight.state;
  liveRef.current = focusedRight.taskWorkspaceTabsState ?? liveRef.current;
  const staleCallbackResult = staleCallback((current) => ({ ...current, search: `${current.search} from stale callback` }));
  const storedLeft = staleCallbackResult.workspace.panels.find((panel) => panel.id === panels.panelId)?.tabs[0].presentation.tasksWorkspace;
  const activeRight = staleCallbackResult.workspace.panels.find((panel) => panel.id === panels.panelId)?.tabs[1].presentation.tasksWorkspace;

  assert.deepEqual(staleCallbackResult.result, { status: "queued", route: "snapshot", panelId: panels.panelId, tabId: panels.leftTabId });
  assert.equal(staleCallbackResult.liveSetterCalls, 0);
  assert.equal(staleCallbackResult.live.tabs[0].taskUiState.search, "right");
  assert.equal(storedLeft?.tabs[0].taskUiState.search, "left from stale callback");
  assert.equal(activeRight?.tabs[0].taskUiState.search, "right");
});

test("rapid functional Tasks updates remain ordered across an inactive-to-focused transition", () => {
  const panels = twoTasksTabs(taskWorkspace("left"), taskWorkspace("right"));
  const first = routeTasksUpdate(
    panels.state,
    taskWorkspace("left"),
    panels.panelId,
    panels.rightTabId,
    (current) => ({ ...current, search: `${current.search} +first` }),
  );
  const second = routeTasksUpdate(
    first.workspace,
    first.live,
    panels.panelId,
    panels.rightTabId,
    (current) => ({ ...current, search: `${current.search} +second` }),
  );
  const transition = activateMasterTabWithTaskWorkspace(
    second.workspace,
    panels.panelId,
    panels.rightTabId,
    second.live,
  );

  assert.equal(first.result.status, "queued");
  assert.equal(second.result.status, "queued");
  assert.equal(transition.taskWorkspaceTabsState?.tabs[0].taskUiState.search, "right +first +second");
  assert.equal(transition.state.panels.find((panel) => panel.id === panels.panelId)?.tabs[1].presentation.tasksWorkspace?.tabs[0].taskUiState.search, "right +first +second");
  assert.equal(second.live.tabs[0].taskUiState.search, "left");
});

test("invalid IDs, non-Tasks targets, and unready workspaces reject Tasks presentation writes", () => {
  const initialized = restoreMasterWorkspaceForUser(memoryStorage(), "invalid-target-user", "Tasks", taskWorkspace("tasks")).state;
  const panelId = initialized.focusedPanelId;
  const withNotes = createMasterTab(initialized, panelId, {
    id: "notes-target",
    destination: { kind: "page", page: "Notes" },
    presentation: {},
  }, false);
  const invalidPanel = routeTasksUpdate(initialized, taskWorkspace("tasks"), "missing-panel", "master-tab-1", (current) => ({ ...current, search: "bad" }));
  const invalidTab = routeTasksUpdate(initialized, taskWorkspace("tasks"), panelId, "missing-tab", (current) => ({ ...current, search: "bad" }));
  const nonTasks = routeTasksUpdate(withNotes, taskWorkspace("tasks"), panelId, "notes-target", (current) => ({ ...current, search: "bad" }));
  const unready = routeTasksUpdate(initialized, taskWorkspace("tasks"), panelId, "master-tab-1", (current) => ({ ...current, search: "bad" }), { isReady: false });

  for (const [result, reason] of [[invalidPanel, "invalid-target"], [invalidTab, "invalid-target"], [nonTasks, "invalid-target"], [unready, "not-ready"]] as const) {
    assert.deepEqual(result.result, { status: "rejected", reason });
  }
  for (const result of [invalidPanel, invalidTab, nonTasks, unready]) {
    assert.equal(result.liveSetterCalls, 0);
    assert.equal(result.workspaceSetterCalls, 0);
  }
  assert.equal(resolveMasterWorkspaceTasksUiState(initialized, " ", "master-tab-1", taskWorkspace("tasks").tabs[0].taskUiState), undefined);
});

test("focused Tasks update rejects a live nested tab that no longer belongs to the target snapshot", () => {
  const current = restoreMasterWorkspaceForUser(memoryStorage(), "mismatched-live-user", "Tasks", taskWorkspace("target snapshot")).state;
  const panelId = current.focusedPanelId;
  const live = {
    ...taskWorkspace("different live owner"),
    activeTabId: "different-nested-tab",
    tabs: [{ ...taskWorkspace("different live owner").tabs[0], id: "different-nested-tab" }],
  };
  const routed = routeTasksUpdate(current, live, panelId, current.panels[0].activeTabId, (state) => ({
    ...state,
    search: "must not hit a different nested tab",
  }));

  assert.deepEqual(routed.result, { status: "rejected", reason: "live-state-unavailable" });
  assert.equal(routed.liveSetterCalls, 1);
  assert.equal(routed.workspaceSetterCalls, 0);
  assert.equal(routed.live.tabs[0].taskUiState.search, "different live owner");
});

test("legacy Tasks tabs without snapshots default safely, normalize updates, and preserve other presentation fields", () => {
  const base = restoreMasterWorkspaceForUser(memoryStorage(), "legacy-task-target-user", "Tasks", taskWorkspace("left legacy")).state;
  const initialized = duplicateFocusedPageIntoRightPanel(base, { panelId: "right-panel", tabId: "right-tasks" });
  const withLegacyRightTab = {
    ...initialized,
    focusedPanelId: base.focusedPanelId,
    visiblePanelId: base.focusedPanelId,
    panels: initialized.panels.map((panel) => panel.id === "right-panel"
      ? { ...panel, tabs: panel.tabs.map((tab) => ({ ...tab, presentation: { scrollTop: 42 } })) }
      : panel),
  };
  const leftLive = taskWorkspace("left legacy");
  const defaultRead = resolveMasterWorkspaceTasksUiState(
    withLegacyRightTab,
    "right-panel",
    "right-tasks",
    leftLive.tabs[0].taskUiState,
  );
  assert.equal(defaultRead?.search, DEFAULT_TASK_WORKSPACE_TABS_STATE.tabs[0].taskUiState.search);

  const routed = routeTasksUpdate(withLegacyRightTab, leftLive, "right-panel", "right-tasks", (current) => ({
    ...current,
    search: "legacy materialized",
    view: "invalid" as unknown as TaskUiState["view"],
  }));
  const updatedTab = routed.workspace.panels.find((panel) => panel.id === "right-panel")?.tabs[0];
  assert.equal(updatedTab?.presentation.scrollTop, 42);
  assert.equal(updatedTab?.presentation.tasksWorkspace?.tabs[0].taskUiState.search, "legacy materialized");
  assert.equal(updatedTab?.presentation.tasksWorkspace?.tabs[0].taskUiState.view, "table");
});

test("no-op Tasks updates preserve state identity and focused snapshot mirroring stays idempotent", () => {
  const leftLive = taskWorkspace("left");
  const panels = twoTasksPanels(leftLive, taskWorkspace("right"));
  const storedNoOp = routeTasksUpdate(panels.state, leftLive, panels.rightPanelId, panels.rightTabId, (current) => current);
  assert.equal(storedNoOp.workspace, panels.state);
  assert.equal(storedNoOp.liveSetterCalls, 0);
  assert.equal(storedNoOp.workspaceSetterCalls, 1);

  const activeNoOp = routeTasksUpdate(panels.state, leftLive, panels.leftPanelId, panels.leftTabId, (current) => current);
  assert.equal(activeNoOp.live, leftLive);
  assert.equal(activeNoOp.workspace, panels.state);
  const mirrored = updateMasterTabTasksWorkspace(activeNoOp.workspace, panels.leftPanelId, panels.leftTabId, activeNoOp.live);
  assert.equal(mirrored, panels.state);
});

test("Tasks master tab activation saves the current snapshot and restores each tab independently", () => {
  const storage = memoryStorage();
  const firstTasksState = taskWorkspace("first", { bucket: "priority_3_4", view: "list" });
  const restored = restoreMasterWorkspaceForUser(storage, "tasks-user", "Tasks", firstTasksState);
  const panelId = restored.state.panels[0].id;
  const withSecondTab = createMasterTab(restored.state, panelId, {
    id: "tasks-master-b",
    destination: { kind: "page", page: "Tasks" },
    presentation: { tasksWorkspace: taskWorkspace("second", { bucket: "attention", view: "calendar" }) },
  }, false);
  const changedFirstState = taskWorkspace("first search changed", { bucket: "priority_5", quickFilters: ["urgent"], view: "matrix" });

  const toSecond = activateMasterTabWithTaskWorkspace(withSecondTab, panelId, "tasks-master-b", changedFirstState);
  assert.equal(toSecond.state.panels[0].activeTabId, "tasks-master-b");
  assert.equal(toSecond.state.panels[0].tabs[0].presentation.tasksWorkspace?.tabs[0].taskUiState.search, "first search changed");
  assert.deepEqual(toSecond.state.panels[0].tabs[0].presentation.tasksWorkspace?.tabs[0].taskUiState.quickFilters, ["urgent"]);
  assert.equal(toSecond.taskWorkspaceTabsState?.tabs[0].taskUiState.search, "second");
  assert.equal(toSecond.taskWorkspaceTabsState?.tabs[0].taskUiState.selectedBucket, "attention");
  assert.equal(toSecond.taskWorkspaceTabsState?.tabs[0].taskUiState.view, "calendar");

  const changedSecondState = taskWorkspace("second changed", { bucket: "all", view: "cards" });
  const backToFirst = activateMasterTabWithTaskWorkspace(toSecond.state, panelId, "master-tab-1", changedSecondState);
  assert.equal(backToFirst.taskWorkspaceTabsState?.tabs[0].taskUiState.search, "first search changed");
  assert.equal(backToFirst.taskWorkspaceTabsState?.tabs[0].taskUiState.selectedBucket, "priority_5");
  assert.equal(backToFirst.taskWorkspaceTabsState?.tabs[0].taskUiState.view, "matrix");
  assert.deepEqual(backToFirst.taskWorkspaceTabsState?.tabs[0].taskUiState.quickFilters, ["urgent"]);
  assert.equal(backToFirst.state.panels[0].tabs[1].presentation.tasksWorkspace?.tabs[0].taskUiState.search, "second changed");
});

test("Tasks to Health to Notes to Tasks restores the focused page and nested Tasks state", () => {
  const initial = restoreMasterWorkspaceForUser(memoryStorage(), "cross-page-user", "Tasks", taskWorkspace("tasks before", { view: "calendar" })).state;
  const panelId = initial.panels[0].id;
  const withHealth = createMasterTab(initial, panelId, {
    id: "health-cross-page",
    destination: { kind: "health-tab", page: "Health", tab: "Fitness" },
    presentation: { healthSection: "Fitness" },
  }, false);
  const withNotes = createMasterTab(withHealth, panelId, {
    id: "notes-cross-page",
    destination: { kind: "page", page: "Notes" },
    presentation: {},
  }, false);

  const toHealth = activateMasterTabWithTaskWorkspace(withNotes, panelId, "health-cross-page", taskWorkspace("tasks saved", { view: "matrix" }));
  assert.equal(toHealth.state.panels[0].activeTabId, "health-cross-page");
  const toNotes = activateMasterTabWithTaskWorkspace(toHealth.state, panelId, "notes-cross-page", DEFAULT_TASK_WORKSPACE_TABS_STATE);
  assert.equal(toNotes.state.panels[0].activeTabId, "notes-cross-page");
  const backToTasks = activateMasterTabWithTaskWorkspace(toNotes.state, panelId, "master-tab-1", DEFAULT_TASK_WORKSPACE_TABS_STATE);

  assert.equal(backToTasks.state.panels[0].tabs.find((tab) => tab.id === "master-tab-1")?.destination.page, "Tasks");
  assert.equal(backToTasks.taskWorkspaceTabsState?.tabs[0].taskUiState.search, "tasks saved");
  assert.equal(backToTasks.taskWorkspaceTabsState?.tabs[0].taskUiState.view, "matrix");
  assert.equal(backToTasks.state.panels[0].tabs.find((tab) => tab.id === "health-cross-page")?.presentation.healthSection, "Fitness");
});

test("new cross-page tab creation can activate the destination immediately", () => {
  const initial = restoreMasterWorkspaceForUser(memoryStorage(), "new-page-user", "Home", DEFAULT_TASK_WORKSPACE_TABS_STATE).state;
  const opened = createMasterTab(initial, initial.panels[0].id, {
    id: "new-health-page",
    destination: { kind: "page", page: "Health" },
    presentation: { healthSection: "Water" },
  }, true);

  assert.equal(opened.panels[0].activeTabId, "new-health-page");
  assert.equal(opened.panels[0].tabs.find((tab) => tab.id === "new-health-page")?.destination.page, "Health");
});

test("closing an active Tasks master tab restores the remaining active tab", () => {
  const first = taskWorkspace("remaining", { bucket: "today", view: "table" });
  const initialized = restoreMasterWorkspaceForUser(memoryStorage(), "close-user", "Tasks", first).state;
  const panelId = initialized.panels[0].id;
  const withSecond = createMasterTab(initialized, panelId, {
    id: "tasks-master-b",
    destination: { kind: "page", page: "Tasks" },
    presentation: { tasksWorkspace: taskWorkspace("closing", { bucket: "attention", view: "list" }) },
  });
  const transition = closeMasterTabWithTaskWorkspace(withSecond, panelId, "tasks-master-b", taskWorkspace("latest closing", { view: "calendar" }));

  assert.equal(transition.state.panels[0].activeTabId, "master-tab-1");
  assert.equal(transition.state.panels[0].tabs.length, 1);
  assert.equal(transition.taskWorkspaceTabsState?.tabs[0].taskUiState.search, "remaining");
});

test("closing a background cross-page tab leaves the active route and presentation intact", () => {
  const initialized = restoreMasterWorkspaceForUser(memoryStorage(), "background-close-user", "Tasks", taskWorkspace("active Tasks")).state;
  const panelId = initialized.panels[0].id;
  const withBackground = createMasterTab(initialized, panelId, {
    id: "background-notes",
    destination: { kind: "page", page: "Notes" },
    presentation: {},
  }, false);
  const transition = closeMasterTabWithTaskWorkspace(withBackground, panelId, "background-notes", taskWorkspace("active Tasks latest"));

  assert.equal(transition.state.panels[0].activeTabId, "master-tab-1");
  assert.equal(transition.state.panels[0].tabs.length, 1);
  assert.equal(transition.state.panels[0].tabs[0].destination.page, "Tasks");
  assert.equal(transition.taskWorkspaceTabsState?.tabs[0].taskUiState.search, "active Tasks latest");
});

test("refresh preserves nested Tasks snapshots for both master tabs", () => {
  const storage = memoryStorage();
  const initialized = restoreMasterWorkspaceForUser(storage, "refresh-user", "Tasks", taskWorkspace("first", { view: "list" })).state;
  const panelId = initialized.panels[0].id;
  const withSecond = createMasterTab(initialized, panelId, {
    id: "tasks-master-b",
    destination: { kind: "page", page: "Tasks" },
    presentation: { tasksWorkspace: taskWorkspace("second", { bucket: "attention", view: "calendar" }) },
  }, false);
  const updated = activateMasterTabWithTaskWorkspace(withSecond, panelId, "tasks-master-b", taskWorkspace("saved first", { view: "matrix" })).state;
  assert.equal(persistMasterWorkspaceForReadyUser(storage, "refresh-user", "refresh-user", true, updated), true);

  const afterRefresh = restoreMasterWorkspaceForUser(storage, "refresh-user", "Home", DEFAULT_TASK_WORKSPACE_TABS_STATE).state;
  assert.equal(afterRefresh.panels[0].tabs[0].presentation.tasksWorkspace?.tabs[0].taskUiState.search, "saved first");
  assert.equal(afterRefresh.panels[0].tabs[1].presentation.tasksWorkspace?.tabs[0].taskUiState.search, "second");
  assert.equal(afterRefresh.panels[0].tabs[1].presentation.tasksWorkspace?.tabs[0].taskUiState.selectedBucket, "attention");
});

test("legacy Tasks storage remains the production fallback when the feature flag is absent", () => {
  const storage = memoryStorage();
  const legacyKey = "adhdice-task-ui:user-a";
  const legacyValue = JSON.stringify({ activeTabId: "legacy", tabs: [{ id: "legacy" }] });
  storage.values.set(legacyKey, legacyValue);
  const productionWorkspaceEnabled = isMasterWorkspaceFeatureEnabled("production", "true");
  const productionWorkspaceDisabled = isMasterWorkspaceFeatureEnabled("production", undefined);

  if (canPersistLegacyTaskWorkspace(productionWorkspaceEnabled, "user-a", "user-a")) storage.setItem(legacyKey, "master snapshot");
  assert.equal(storage.values.get(legacyKey), legacyValue);
  assert.equal(canPersistLegacyTaskWorkspace(productionWorkspaceDisabled, "user-a", "user-a"), true);
  assert.equal(canPersistLegacyTaskWorkspace(productionWorkspaceDisabled, "user-b", "user-a"), false);
  assert.equal(canPersistLegacyTaskWorkspace(productionWorkspaceEnabled, "user-a", null), false);
});

test("unsafe Task editor drafts block Tasks master-tab transitions", () => {
  assert.equal(isTasksMasterTabTransitionBlocked("Tasks", true), true);
  assert.equal(isTasksMasterTabTransitionBlocked("Tasks", false), false);
  assert.equal(isTasksMasterTabTransitionBlocked("Home", true), false);
});

test("Close Split protects drafts in the removed panel and retains the left panel unchanged", () => {
  const initial = restoreMasterWorkspaceForUser(
    memoryStorage(),
    "split-close-user",
    "Tasks",
    DEFAULT_TASK_WORKSPACE_TABS_STATE,
  ).state;
  const split = activateMasterPanel(
    duplicateFocusedPageIntoRightPanel(initial, { panelId: "right-panel", tabId: "right-tab" }),
    initial.focusedPanelId,
  );
  const leftBefore = split.panels.find((panel) => panel.side === "left");
  assert.ok(leftBefore);
  assert.equal(split.focusedPanelId, leftBefore.id);

  for (const unsafeCase of ["right-panel-edit", "shared-editor-open-from-right"] as const) {
    assert.equal(canCloseMasterSplitSafely(split, true), false, unsafeCase);
    const rejected = closeMasterSplitSafely(split, "right-panel", true);
    assert.strictEqual(rejected, split, unsafeCase);
  }

  // Edits in Window 1 remain mounted after closing Window 2.
  assert.equal(canCloseMasterSplitSafely(split, false), true, "left-panel-edit");
  assert.equal(closeMasterSplitSafely(split, "right-panel", false).panels.length, 1, "left-panel-edit");
  assert.deepEqual(closeMasterSplitSafely(split, "right-panel", false).panels[0], leftBefore);
  const blockRightNotesDraft = (_panelId: string, tabId: string) => tabId !== "right-tab";
  assert.equal(canCloseMasterSplitSafely(split, false, blockRightNotesDraft), false, "right-panel-form-draft");
  assert.strictEqual(closeMasterSplitSafely(split, "right-panel", false, blockRightNotesDraft), split, "right-panel-form-draft");

  for (const resolution of ["saved", "canceled"] as const) {
    const closed = closeMasterSplitSafely(split, "right-panel", false);
    assert.equal(closed.panels.length, 1, resolution);
    assert.deepEqual(closed.panels[0], leftBefore, resolution);
  }

  assert.equal(closeMasterSplitSafely(initial, "right-panel", false), initial);
});

test("panel draft sources update independently and keep Close Split blocked until both panels are clean", () => {
  const initial = restoreMasterWorkspaceForUser(
    memoryStorage(),
    "split-panel-draft-sources-user",
    "Tasks",
    DEFAULT_TASK_WORKSPACE_TABS_STATE,
  ).state;
  const split = activateMasterPanel(
    duplicateFocusedPageIntoRightPanel(initial, { panelId: "right-panel", tabId: "right-tab" }),
    initial.focusedPanelId,
  );
  const leftOwnerKey = "left-panel:left-tab:left-workspace-tab";
  const rightOwnerKey = "right-panel:right-tab:right-workspace-tab";
  const leftTableDraft = getTaskPanelDraftSourceKey(leftOwnerKey, "table");
  const rightListDraft = getTaskPanelDraftSourceKey(rightOwnerKey, "list");
  let draftOwnerKeys: string[] = [];

  draftOwnerKeys = updateTaskPanelDraftOwnerKeys(draftOwnerKeys, leftTableDraft, true);
  draftOwnerKeys = updateTaskPanelDraftOwnerKeys(draftOwnerKeys, rightListDraft, true);
  assert.strictEqual(updateTaskPanelDraftOwnerKeys(draftOwnerKeys, rightListDraft, true), draftOwnerKeys);
  assert.equal(hasTaskPanelDraftForOwner(draftOwnerKeys, leftOwnerKey), true);
  assert.equal(hasTaskPanelDraftForOwner(draftOwnerKeys, rightOwnerKey), true);
  assert.equal(hasTaskPanelDraftOutsideOwner(draftOwnerKeys, leftOwnerKey), true);
  assert.equal(canCloseMasterSplitSafely(split, draftOwnerKeys.length > 0), false);
  assert.strictEqual(closeMasterSplitSafely(split, "right-panel", draftOwnerKeys.length > 0), split);

  draftOwnerKeys = updateTaskPanelDraftOwnerKeys(draftOwnerKeys, rightListDraft, false);
  assert.equal(hasTaskPanelDraftForOwner(draftOwnerKeys, rightOwnerKey), false);
  assert.equal(hasTaskPanelDraftForOwner(draftOwnerKeys, leftOwnerKey), true);
  assert.equal(canCloseMasterSplitSafely(split, draftOwnerKeys.length > 0), false);

  const cleanOwners = updateTaskPanelDraftOwnerKeys(draftOwnerKeys, leftTableDraft, false);
  assert.strictEqual(updateTaskPanelDraftOwnerKeys(cleanOwners, leftTableDraft, false), cleanOwners);
  assert.equal(canCloseMasterSplitSafely(split, cleanOwners.length > 0), true);
  assert.equal(closeMasterSplitSafely(split, "right-panel", cleanOwners.length > 0).panels.length, 1);
});

test("cross-page navigation allows clean or discarded drafts and reports dirty owners", () => {
  assert.equal(getMasterWorkspaceTransitionBlockReason("Tasks", "Today", false, {}, false), null);
  assert.equal(getMasterWorkspaceTransitionBlockReason("Health", "Fitness", false, {}, false), null);
  assert.equal(getMasterWorkspaceTransitionBlockReason("Health", "Journal", false, { Journal: false }, false), null);
  assert.equal(getMasterWorkspaceTransitionBlockReason("Notes", "Today", false, {}, false), null);
  assert.match(getMasterWorkspaceTransitionBlockReason("Notes", "Today", false, {}, true) ?? "", /Notes or Scratch Paper/);
  // Explicit discard releases the source guard, allowing the same navigation.
  assert.equal(getMasterWorkspaceTransitionBlockReason("Notes", "Today", false, {}, false), null);
  assert.match(getMasterWorkspaceTransitionBlockReason("Health", "Journal", false, { Journal: true }, false) ?? "", /unfinished Health Journal edit/);
  assert.match(getMasterWorkspaceTransitionBlockReason("Tasks", "Today", true, {}, false) ?? "", /Tasks editor/);
  assert.match(getMasterWorkspaceTransitionBlockReason("Health", "Water", false, { Water: true }, false) ?? "", /Health Water edit/);
  assert.equal(getMasterWorkspaceTransitionBlockReason("Home", "Today", true, {}, true), null);
});

test("Health A to Health B to Health A restores independent sections and survives refresh", () => {
  const storage = memoryStorage();
  const initialized = restoreMasterWorkspaceForUser(
    storage,
    "health-user",
    "Health",
    DEFAULT_TASK_WORKSPACE_TABS_STATE,
    "Food",
  ).state;
  const panelId = initialized.panels[0].id;
  const withHealthB = createMasterTab(initialized, panelId, {
    id: "health-master-b",
    destination: { kind: "health-tab", page: "Health", tab: "Journal" },
    presentation: { healthSection: "Journal" },
  }, false);

  const toHealthB = activateMasterTabWithTaskWorkspace(withHealthB, panelId, "health-master-b", DEFAULT_TASK_WORKSPACE_TABS_STATE);
  assert.equal(toHealthB.state.panels[0].tabs[1].presentation.healthSection, "Journal");
  const backToHealthA = activateMasterTabWithTaskWorkspace(toHealthB.state, panelId, "master-tab-1", DEFAULT_TASK_WORKSPACE_TABS_STATE);
  assert.equal(backToHealthA.state.panels[0].tabs[0].presentation.healthSection, "Food");
  assert.equal(backToHealthA.state.panels[0].tabs[1].presentation.healthSection, "Journal");

  assert.equal(persistMasterWorkspaceForReadyUser(storage, "health-user", "health-user", true, toHealthB.state), true);
  const refreshed = restoreMasterWorkspaceForUser(storage, "health-user", "Home", DEFAULT_TASK_WORKSPACE_TABS_STATE, "Today");
  assert.equal(refreshed.state.panels[0].activeTabId, "health-master-b");
  assert.equal(refreshed.state.panels[0].tabs[0].presentation.healthSection, "Food");
  assert.equal(refreshed.state.panels[0].tabs[1].presentation.healthSection, "Journal");
  const otherUser = restoreMasterWorkspaceForUser(storage, "other-health-user", "Health", DEFAULT_TASK_WORKSPACE_TABS_STATE, "Today");
  assert.equal(otherUser.restored, false);
  assert.equal(otherUser.state.panels[0].tabs[0].presentation.healthSection, "Today");
});

test("Health master transitions allow safe sections and block reported unsafe drafts", () => {
  assert.equal(isHealthMasterTabTransitionBlocked("Food", "Journal", false), false);
  assert.equal(isHealthMasterTabTransitionBlocked("Journal", "Food", false), false);
  assert.equal(isHealthMasterTabTransitionBlocked("Food", "Journal", true), true);
  assert.equal(isHealthMasterTabTransitionBlocked("Journal", "Food", true), true);
  assert.equal(isHealthMasterTabTransitionBlocked("Water", "Food", false), false);
  assert.equal(isHealthMasterTabTransitionBlocked("Water", "Journal", false), false);
  assert.equal(isHealthMasterTabTransitionBlocked("Water", "Journal", true), true);
  assert.equal(isHealthMasterTabTransitionBlocked("Fitness", "Water", false), false);
  assert.equal(isHealthMasterTabTransitionBlocked("Fitness", "Journal", false), false);
  assert.equal(isHealthMasterTabTransitionBlocked("Fitness", "Food", false), false);
  assert.equal(isHealthMasterTabTransitionBlocked("Fitness", "Today", false), false);
  assert.equal(isHealthMasterTabTransitionBlocked("Fitness", "Water", true), true);
  assert.equal(isHealthMasterTabTransitionBlocked("Fitness", "Journal", true), true);
  assert.equal(isHealthMasterTabTransitionBlocked("Journal", "Journal", true), false);
  assert.equal(isTasksMasterTabTransitionBlocked("Tasks", true), true);
});

test("ready-user persistence is fenced by readiness and restored user, then survives refresh", () => {
  const storage = memoryStorage();
  const state = restoreMasterWorkspaceForUser(storage, "user-a", "Health", DEFAULT_TASK_WORKSPACE_TABS_STATE).state;

  assert.equal(persistMasterWorkspaceForReadyUser(storage, "user-a", null, true, state), false);
  assert.equal(persistMasterWorkspaceForReadyUser(storage, "user-a", "user-a", false, state), false);
  assert.equal(storage.values.has(getMasterWorkspaceStorageKey("user-a")), false);
  assert.equal(persistMasterWorkspaceForReadyUser(storage, "user-a", "user-a", true, state), true);

  const afterRefresh = restoreMasterWorkspaceForUser(storage, "user-a", "Home", DEFAULT_TASK_WORKSPACE_TABS_STATE);
  assert.equal(afterRefresh.restored, true);
  assert.equal(afterRefresh.state.panels[0].tabs[0].destination.page, "Health");
});

test("restoring and persisting preserves both panels, all tabs, and focused-panel identity", () => {
  const storage = memoryStorage();
  const initial = restoreMasterWorkspaceForUser(storage, "user-split", "Home", DEFAULT_TASK_WORKSPACE_TABS_STATE).state;
  const withRightPanel = duplicateFocusedPageIntoRightPanel(initial, { panelId: "right-panel", tabId: "right-home" });
  const completeWorkspace = createMasterTab(withRightPanel, "right-panel", {
    id: "right-notes",
    destination: { kind: "page", page: "Notes" },
    presentation: {},
  });

  assert.equal(persistMasterWorkspaceForReadyUser(storage, "user-split", "user-split", true, completeWorkspace), true);
  const restored = restoreMasterWorkspaceForUser(storage, "user-split", "Home", DEFAULT_TASK_WORKSPACE_TABS_STATE);
  assert.equal(restored.restored, true);
  assert.deepEqual(restored.state.panels.map((panel) => ({ id: panel.id, side: panel.side, tabIds: panel.tabs.map((tab) => tab.id) })), [
    { id: "master-panel-1", side: "left", tabIds: ["master-tab-1"] },
    { id: "right-panel", side: "right", tabIds: ["right-home", "right-notes"] },
  ]);
  assert.equal(restored.state.focusedPanelId, "right-panel");

  assert.equal(persistMasterWorkspaceForReadyUser(storage, "user-split", "user-split", true, restored.state), true);
  const afterSecondRefresh = restoreMasterWorkspaceForUser(storage, "user-split", "Home", DEFAULT_TASK_WORKSPACE_TABS_STATE);
  assert.deepEqual(afterSecondRefresh.state.panels.map((panel) => panel.tabs.map((tab) => tab.id)), [["master-tab-1"], ["right-home", "right-notes"]]);
  assert.equal(afterSecondRefresh.state.focusedPanelId, "right-panel");
});

test("malformed saved controller state recovers to a default workspace", () => {
  const storage = memoryStorage();
  const key = getMasterWorkspaceStorageKey("broken-user");
  storage.values.set(key, "{");

  const restored = restoreMasterWorkspaceForUser(storage, "broken-user", "Notes", DEFAULT_TASK_WORKSPACE_TABS_STATE);

  assert.equal(restored.restored, true);
  assert.equal(restored.state.panels.length, 1);
  assert.equal(restored.state.panels[0].tabs[0].destination.page, "Home");
  assert.equal(storage.values.has(key), false);
});

test("account switching restores isolated state and blocks writes for the previous user", () => {
  const storage = memoryStorage();
  const userAState = restoreMasterWorkspaceForUser(storage, "user-a", "Notes", DEFAULT_TASK_WORKSPACE_TABS_STATE).state;
  assert.equal(persistMasterWorkspaceForReadyUser(storage, "user-a", "user-a", true, userAState), true);

  const userBState = restoreMasterWorkspaceForUser(storage, "user-b", "Focus", DEFAULT_TASK_WORKSPACE_TABS_STATE);
  assert.equal(userBState.restored, false);
  assert.equal(userBState.state.panels[0].tabs[0].destination.page, "Focus");
  assert.equal(persistMasterWorkspaceForReadyUser(storage, "user-b", "user-a", true, userBState.state), false);
  assert.equal(storage.values.has(getMasterWorkspaceStorageKey("user-b")), false);
  assert.equal(restoreMasterWorkspaceForUser(storage, "user-a", "Home", DEFAULT_TASK_WORKSPACE_TABS_STATE).state.panels[0].tabs[0].destination.page, "Notes");
});

test("the shell gate enables only explicit development and production builds", () => {
  assert.equal(isMasterWorkspaceFeatureEnabled("production", "true"), true);
  assert.equal(isMasterWorkspaceFeatureEnabled("production", undefined), false);
  assert.equal(isMasterWorkspaceFeatureEnabled("production", "false"), false);
  assert.equal(isMasterWorkspaceFeatureEnabled("development", "true"), true);
  assert.equal(isMasterWorkspaceFeatureEnabled("development", undefined), false);
  assert.equal(isMasterWorkspaceFeatureEnabled("development", "false"), false);
  assert.equal(isMasterWorkspaceFeatureEnabled("test", "true"), false);
});
