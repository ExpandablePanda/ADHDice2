import assert from "node:assert/strict";
import test from "node:test";
import {
  activateMasterTabWithTaskWorkspace,
  canPersistLegacyTaskWorkspace,
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
  options: { isReady?: boolean; latestWorkspace?: ReturnType<typeof restoreMasterWorkspaceForUser>["state"] } = {},
) {
  let workspace = state;
  let live = liveTaskWorkspace;
  let liveSetterCalls = 0;
  let workspaceSetterCalls = 0;
  let insideWorkspaceUpdater = false;
  const accepted = updateMasterWorkspaceTasksUiState(
    state,
    panelId,
    tabId,
    updater,
    options.isReady ?? true,
    (next) => {
      assert.equal(insideWorkspaceUpdater, false, "the live setter must not run inside the workspace updater");
      liveSetterCalls += 1;
      live = updateActiveTaskUiState(live, next);
    },
    (next) => {
      workspaceSetterCalls += 1;
      insideWorkspaceUpdater = true;
      try {
        workspace = next(options.latestWorkspace ?? workspace);
      } finally {
        insideWorkspaceUpdater = false;
      }
    },
  );
  return { accepted, live, liveSetterCalls, workspace, workspaceSetterCalls };
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

  assert.equal(routed.accepted, true);
  assert.equal(routed.liveSetterCalls, 1);
  assert.equal(routed.workspaceSetterCalls, 0);
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

  assert.equal(rightUpdate.accepted, true);
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

test("stored Tasks updates apply functionally to the latest workspace and do not race into the live mirror", () => {
  const panels = twoTasksPanels(taskWorkspace("left"), taskWorkspace("right"));
  const latestRightSnapshot = updateMasterTabTasksWorkspace(
    panels.state,
    panels.rightPanelId,
    panels.rightTabId,
    taskWorkspace("right latest", { bucket: "attention", view: "calendar" }),
  );
  const latestUpdate = routeTasksUpdate(
    panels.state,
    taskWorkspace("left"),
    panels.rightPanelId,
    panels.rightTabId,
    (current) => ({ ...current, search: `${current.search} plus update` }),
    { latestWorkspace: latestRightSnapshot },
  );
  const latestRight = latestUpdate.workspace.panels.find((panel) => panel.id === panels.rightPanelId)?.tabs[0].presentation.tasksWorkspace;

  assert.equal(latestRight?.tabs[0].taskUiState.search, "right latest plus update");
  assert.equal(latestRight?.tabs[0].taskUiState.selectedBucket, "attention");

  const nowFocused = activateMasterPanel(panels.state, panels.rightPanelId);
  const transitionRace = routeTasksUpdate(
    panels.state,
    taskWorkspace("left"),
    panels.rightPanelId,
    panels.rightTabId,
    (current) => ({ ...current, search: "must be deferred to live owner" }),
    { latestWorkspace: nowFocused },
  );
  assert.equal(transitionRace.accepted, true);
  assert.equal(transitionRace.liveSetterCalls, 0);
  assert.equal(transitionRace.workspaceSetterCalls, 1);
  assert.equal(transitionRace.workspace, nowFocused);
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

  assert.equal(invalidPanel.accepted, false);
  assert.equal(invalidTab.accepted, false);
  assert.equal(nonTasks.accepted, false);
  assert.equal(unready.accepted, false);
  for (const result of [invalidPanel, invalidTab, nonTasks, unready]) {
    assert.equal(result.liveSetterCalls, 0);
    assert.equal(result.workspaceSetterCalls, 0);
  }
  assert.equal(resolveMasterWorkspaceTasksUiState(initialized, " ", "master-tab-1", taskWorkspace("tasks").tabs[0].taskUiState), undefined);
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

test("legacy Tasks storage is untouched in Master Tabs mode and writes remain user fenced otherwise", () => {
  const storage = memoryStorage();
  const legacyKey = "adhdice-task-ui:user-a";
  const legacyValue = JSON.stringify({ activeTabId: "legacy", tabs: [{ id: "legacy" }] });
  storage.values.set(legacyKey, legacyValue);

  if (canPersistLegacyTaskWorkspace(true, "user-a", "user-a")) storage.setItem(legacyKey, "master snapshot");
  assert.equal(storage.values.get(legacyKey), legacyValue);
  assert.equal(canPersistLegacyTaskWorkspace(false, "user-a", "user-a"), true);
  assert.equal(canPersistLegacyTaskWorkspace(false, "user-b", "user-a"), false);
  assert.equal(canPersistLegacyTaskWorkspace(true, "user-a", null), false);
});

test("unsafe Task editor drafts block Tasks master-tab transitions", () => {
  assert.equal(isTasksMasterTabTransitionBlocked("Tasks", true), true);
  assert.equal(isTasksMasterTabTransitionBlocked("Tasks", false), false);
  assert.equal(isTasksMasterTabTransitionBlocked("Home", true), false);
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

test("the shell gate is explicit and remains disabled outside development", () => {
  assert.equal(isMasterWorkspaceFeatureEnabled("production", "true"), false);
  assert.equal(isMasterWorkspaceFeatureEnabled("development", undefined), false);
  assert.equal(isMasterWorkspaceFeatureEnabled("development", "false"), false);
  assert.equal(isMasterWorkspaceFeatureEnabled("development", "true"), true);
});
