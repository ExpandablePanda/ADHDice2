import assert from "node:assert/strict";
import test from "node:test";
import {
  activateMasterTabWithTaskWorkspace,
  canPersistLegacyTaskWorkspace,
  closeMasterTabWithTaskWorkspace,
  isMasterWorkspaceFeatureEnabled,
  isTasksMasterTabTransitionBlocked,
  persistMasterWorkspaceForReadyUser,
  restoreMasterWorkspaceForUser,
} from "../src/lib/master-workspace-controller.ts";
import {
  createMasterTab,
  duplicateFocusedPageIntoRightPanel,
  getMasterWorkspaceStorageKey,
} from "../src/lib/master-workspace-state.ts";
import { DEFAULT_TASK_WORKSPACE_TABS_STATE, type TaskWorkspaceTabsState } from "../src/lib/task-ui-state.ts";

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
        view: options.view ?? "table",
      },
    }],
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
