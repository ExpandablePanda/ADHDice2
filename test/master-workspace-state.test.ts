import assert from "node:assert/strict";
import test from "node:test";
import {
  activateMasterPanel,
  activateMasterTab,
  adjustMasterWorkspaceSplitRatio,
  closeMasterSplit,
  closeMasterTab,
  createDefaultMasterWorkspaceState,
  createMasterTab,
  duplicateFocusedPageIntoRightPanel,
  getMasterWorkspaceStorageKey,
  initializeMasterWorkspaceState,
  loadMasterWorkspaceState,
  normalizeMasterWorkspaceState,
  replaceFocusedMasterTabDestination,
  saveMasterWorkspaceState,
  type MasterWorkspaceStorage,
} from "../src/lib/master-workspace-state.ts";
import { DEFAULT_TASK_WORKSPACE_TABS_STATE, type TaskWorkspaceTabsState } from "../src/lib/task-ui-state.ts";

function memoryStorage(): MasterWorkspaceStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

function tasksState(): TaskWorkspaceTabsState {
  return {
    uiStateVersion: DEFAULT_TASK_WORKSPACE_TABS_STATE.uiStateVersion,
    activeTabId: "workspace-custom",
    tabs: [{
      ...DEFAULT_TASK_WORKSPACE_TABS_STATE.tabs[0],
      id: "workspace-custom",
      label: "Custom Tasks",
      taskUiState: {
        ...DEFAULT_TASK_WORKSPACE_TABS_STATE.tabs[0].taskUiState,
        selectedBucket: "priority_3_4",
        view: "list",
        quickFilters: ["urgent"],
      },
    }],
  };
}

test("initializes one Home panel and migrates the previous page", () => {
  const initial = createDefaultMasterWorkspaceState();
  assert.equal(initial.panels.length, 1);
  assert.equal(initial.panels[0].tabs[0].destination.kind, "page");
  assert.equal(initializeMasterWorkspaceState("Health", DEFAULT_TASK_WORKSPACE_TABS_STATE).panels[0].tabs[0].destination.page, "Health");
});

test("first-use Tasks migration preserves normalized nested tabs and settings as an independent copy", () => {
  const existing = tasksState();
  const migrated = initializeMasterWorkspaceState("Tasks", existing);
  const nested = migrated.panels[0].tabs[0].presentation.tasksWorkspace;
  assert.equal(nested?.activeTabId, "workspace-custom");
  assert.equal(nested?.tabs[0].taskUiState.selectedBucket, "priority_3_4");
  assert.equal(nested?.tabs[0].taskUiState.view, "list");
  assert.notEqual(nested, existing);
  assert.notEqual(nested?.tabs[0].taskUiState.quickFilters, existing.tabs[0].taskUiState.quickFilters);
  assert.notEqual(nested?.tabs[0].taskUiState.energyFilters, existing.tabs[0].taskUiState.energyFilters);
});

test("malformed nested Tasks filters retain saved master tabs and valid settings", () => {
  const storage = memoryStorage();
  const key = getMasterWorkspaceStorageKey("malformed-tasks");
  const defaultState = createDefaultMasterWorkspaceState();
  const malformedWorkspace = {
    ...defaultState,
    panels: [{
      ...defaultState.panels[0],
      id: "main-panel",
      tabs: [
        { id: "home-tab", destination: { kind: "page", page: "Home" }, presentation: {} },
        {
          id: "tasks-tab",
          destination: { kind: "page", page: "Tasks" },
          presentation: {
            tasksWorkspace: {
              activeTabId: "nested-tab",
              tabs: [{
                ...DEFAULT_TASK_WORKSPACE_TABS_STATE.tabs[0],
                id: "nested-tab",
                label: "Saved Tasks",
                taskUiState: {
                  ...DEFAULT_TASK_WORKSPACE_TABS_STATE.tabs[0].taskUiState,
                  selectedBucket: "priority_3_4",
                  view: "list",
                  quickFilters: { malformed: true },
                  energyFilters: undefined,
                },
              }, {
                ...DEFAULT_TASK_WORKSPACE_TABS_STATE.tabs[0],
                id: "nested-tab-2",
                label: "Second Tasks",
                taskUiState: {
                  ...DEFAULT_TASK_WORKSPACE_TABS_STATE.tabs[0].taskUiState,
                  quickFilters: undefined,
                  energyFilters: "high",
                },
              }],
              uiStateVersion: DEFAULT_TASK_WORKSPACE_TABS_STATE.uiStateVersion,
            },
          },
        },
      ],
      activeTabId: "tasks-tab",
    }],
    focusedPanelId: "main-panel",
    visiblePanelId: "main-panel",
  };
  storage.values.set(key, JSON.stringify(malformedWorkspace));

  const loaded = loadMasterWorkspaceState(storage, "malformed-tasks");
  const panel = loaded.panels[0];
  const tasksTab = panel.tabs.find((tab) => tab.id === "tasks-tab");
  const nested = tasksTab?.presentation.tasksWorkspace;

  assert.equal(panel.id, "main-panel");
  assert.equal(panel.tabs.length, 2);
  assert.equal(panel.activeTabId, "tasks-tab");
  assert.equal(tasksTab?.destination.page, "Tasks");
  assert.equal(nested?.activeTabId, "nested-tab");
  assert.equal(nested?.tabs.length, 2);
  assert.equal(nested?.tabs[0].label, "Saved Tasks");
  assert.equal(nested?.tabs[0].taskUiState.selectedBucket, "priority_3_4");
  assert.equal(nested?.tabs[0].taskUiState.view, "list");
  assert.deepEqual(nested?.tabs.map((tab) => tab.taskUiState.quickFilters), [[], []]);
  assert.deepEqual(nested?.tabs.map((tab) => tab.taskUiState.energyFilters), [[], []]);
  assert.equal(storage.values.has(key), true);
});

test("normalizes valid storage and deterministically repairs invalid IDs and destinations", () => {
  const base = createDefaultMasterWorkspaceState();
  const valid = normalizeMasterWorkspaceState({
    ...base,
    panels: [{
      ...base.panels[0],
      id: "left",
      activeTabId: "missing",
      tabs: [
        { id: "same", destination: { kind: "health-tab", page: "Health", tab: "Food" }, presentation: {} },
        { id: "same", destination: { kind: "wat", page: "Nope" }, presentation: {} },
        { id: "unknown-shell", destination: { kind: "page-shell", page: "Health", pageKey: "health:food", shellId: "missing" }, presentation: {} },
      ],
    }],
    focusedPanelId: "missing",
    splitRatio: 9,
  });
  assert.equal(valid.panels[0].id, "left");
  assert.equal(valid.panels[0].tabs[0].destination.kind, "health-tab");
  assert.deepEqual(valid.panels[0].tabs[1].destination, { kind: "page", page: "Home" });
  assert.equal(valid.panels[0].tabs[1].id, "same-2");
  assert.deepEqual(valid.panels[0].tabs[2].destination, { kind: "page", page: "Home" });
  assert.equal(valid.panels[0].activeTabId, "same");
  assert.equal(valid.focusedPanelId, "left");
  assert.equal(valid.splitRatio, 0.75);
});

test("normalization limits panels to two and guarantees a usable tab in each", () => {
  const base = createDefaultMasterWorkspaceState();
  const normalized = normalizeMasterWorkspaceState({
    ...base,
    panels: [
      { ...base.panels[0], tabs: [] },
      { ...base.panels[0], id: "right", tabs: [] },
      { ...base.panels[0], id: "extra" },
    ],
  });
  assert.equal(normalized.panels.length, 2);
  assert.equal(normalized.panels[0].tabs.length, 1);
  assert.equal(normalized.panels[1].tabs.length, 1);
  assert.equal(normalized.panels[1].side, "right");
});

test("persistence is user scoped and malformed JSON recovers safely", () => {
  const storage = memoryStorage();
  const state = initializeMasterWorkspaceState("Tasks", tasksState());
  assert.equal(saveMasterWorkspaceState(storage, "user-a", state), true);
  assert.equal(loadMasterWorkspaceState(storage, "user-a").panels[0].tabs[0].presentation.tasksWorkspace?.activeTabId, "workspace-custom");
  assert.equal(loadMasterWorkspaceState(storage, "user-b").panels[0].tabs[0].destination.page, "Home");
  const key = getMasterWorkspaceStorageKey("broken");
  storage.values.set(key, "{");
  assert.equal(loadMasterWorkspaceState(storage, "broken").panels.length, 1);
  assert.equal(storage.values.has(key), false);
});

test("unknown schema versions recover to the default workspace", () => {
  assert.deepEqual(normalizeMasterWorkspaceState({ schemaVersion: 99, panels: [] }), createDefaultMasterWorkspaceState());
});

test("transitions are immutable and activate, replace, and create tabs", () => {
  const initial = createDefaultMasterWorkspaceState();
  const created = createMasterTab(initial, "master-panel-1", {
    id: "tasks-tab",
    destination: { kind: "page", page: "Tasks" },
    presentation: { tasksWorkspace: tasksState() },
  });
  assert.notEqual(created, initial);
  assert.equal(initial.panels[0].tabs.length, 1);
  const activated = activateMasterTab(created, "master-panel-1", "master-tab-1");
  assert.equal(activated.panels[0].activeTabId, "master-tab-1");
  const replaced = replaceFocusedMasterTabDestination(activated, { kind: "health-tab", page: "Health", tab: "Journal" });
  assert.deepEqual(replaced.panels[0].tabs[0].destination, { kind: "health-tab", page: "Health", tab: "Journal" });
  assert.equal(replaced.panels[0].tabs[0].presentation.tasksWorkspace, undefined);
});

test("split duplication copies destination and settings, then closing split discards its tabs", () => {
  const initial = initializeMasterWorkspaceState("Tasks", tasksState());
  const split = duplicateFocusedPageIntoRightPanel(initial, { panelId: "right-panel", tabId: "right-tab" });
  assert.equal(split.panels.length, 2);
  assert.equal(split.panels[1].tabs[0].destination.page, "Tasks");
  assert.equal(split.panels[1].tabs[0].presentation.tasksWorkspace?.activeTabId, "workspace-custom");
  assert.notEqual(
    split.panels[0].tabs[0].presentation.tasksWorkspace?.tabs[0].taskUiState.quickFilters,
    split.panels[1].tabs[0].presentation.tasksWorkspace?.tabs[0].taskUiState.quickFilters,
  );
  const rightWithExtra = createMasterTab(split, "right-panel", {
    id: "right-extra",
    destination: { kind: "page", page: "Notes" },
    presentation: {},
  });
  const closed = closeMasterSplit(rightWithExtra);
  assert.equal(closed.panels.length, 1);
  assert.equal(closed.panels[0].id, "master-panel-1");
  assert.equal(closed.focusedPanelId, "master-panel-1");
});

test("panel focus and split ratio transitions honor panel and ratio bounds", () => {
  const initial = createDefaultMasterWorkspaceState();
  const split = duplicateFocusedPageIntoRightPanel(initial, { panelId: "right", tabId: "right-tab" });
  assert.equal(activateMasterPanel(split, "right").focusedPanelId, "right");
  assert.equal(adjustMasterWorkspaceSplitRatio(split, 0.1).splitRatio, 0.25);
  assert.equal(adjustMasterWorkspaceSplitRatio(split, 0.9).splitRatio, 0.75);
});

test("closing the last master tab leaves Home open", () => {
  const initial = createDefaultMasterWorkspaceState();
  const closed = closeMasterTab(initial, "master-panel-1", "master-tab-1");
  assert.equal(closed.panels[0].tabs.length, 1);
  assert.deepEqual(closed.panels[0].tabs[0].destination, { kind: "page", page: "Home" });
});

test("persisted state strips drafts and canonical domain records", () => {
  const storage = memoryStorage();
  const state = createDefaultMasterWorkspaceState() as unknown as Record<string, unknown>;
  const dirtyInput = {
    ...state,
    unfinishedForm: { title: "draft" },
    canonicalTasks: [{ id: "task-1" }],
  };
  assert.equal(saveMasterWorkspaceState(storage, "user", dirtyInput as never), true);
  const serialized = storage.values.get(getMasterWorkspaceStorageKey("user")) ?? "";
  assert.doesNotMatch(serialized, /unfinishedForm|canonicalTasks|task-1|draft/);
});
