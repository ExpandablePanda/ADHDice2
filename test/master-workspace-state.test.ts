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
  getMasterTabJournalView,
  initializeMasterWorkspaceState,
  masterTabTasksWorkspaceMatchesLiveState,
  loadMasterWorkspaceState,
  normalizeMasterWorkspaceState,
  replaceFocusedMasterTabDestination,
  saveMasterWorkspaceState,
  selectJournalHistoryEntryForEdit,
  updateMasterTabTasksWorkspace,
  updateMasterTabJournalView,
  updateMasterTabScrollPosition,
  type MasterWorkspaceStorage,
} from "../src/lib/master-workspace-state.ts";
import { createEditingSessionStore } from "../src/lib/editing-session-store.ts";
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
  assert.equal(initializeMasterWorkspaceState("Health", DEFAULT_TASK_WORKSPACE_TABS_STATE, "Food").panels[0].tabs[0].presentation.healthSection, "Food");
});

test("Health master tabs own independent section snapshots and focused selection updates its destination", () => {
  const initialized = initializeMasterWorkspaceState("Health", DEFAULT_TASK_WORKSPACE_TABS_STATE, "Food");
  const panelId = initialized.panels[0].id;
  const withSecond = createMasterTab(initialized, panelId, {
    id: "health-tab-b",
    destination: { kind: "health-tab", page: "Health", tab: "Journal" },
    presentation: { healthSection: "Journal" },
  }, false);

  const activeSecond = activateMasterTab(withSecond, panelId, "health-tab-b");
  const selectedSecond = replaceFocusedMasterTabDestination(activeSecond, { kind: "health-tab", page: "Health", tab: "Journal" });
  const activeFirst = activateMasterTab(selectedSecond, panelId, "master-tab-1");

  assert.equal(selectedSecond.panels[0].tabs.find((tab) => tab.id === "master-tab-1")?.presentation.healthSection, "Food");
  assert.equal(selectedSecond.panels[0].tabs.find((tab) => tab.id === "health-tab-b")?.presentation.healthSection, "Journal");
  assert.equal(activeFirst.panels[0].tabs.find((tab) => tab.id === "master-tab-1")?.presentation.healthSection, "Food");
  const focusedJournal = replaceFocusedMasterTabDestination(activeFirst, { kind: "health-tab", page: "Health", tab: "Journal" });
  assert.equal(focusedJournal.panels[0].tabs[0].presentation.healthSection, "Journal");
  assert.deepEqual(focusedJournal.panels[0].tabs[0].destination, { kind: "health-tab", page: "Health", tab: "Journal" });
  assert.equal(focusedJournal.panels[0].tabs[1].presentation.healthSection, "Journal");
});

test("Journal selection, presentation mode, and new draft identity are independent per Master Tab", () => {
  const initial = initializeMasterWorkspaceState("Health", DEFAULT_TASK_WORKSPACE_TABS_STATE, "Journal");
  const panelId = initial.panels[0].id;
  const second = createMasterTab(initial, panelId, {
    id: "journal-tab-b",
    destination: { kind: "health-tab", page: "Health", tab: "Journal" },
    presentation: { healthSection: "Journal" },
  }, false);
  const firstTab = second.panels[0].tabs[0];
  const secondTab = second.panels[0].tabs[1];
  const firstView = getMasterTabJournalView(firstTab);
  const secondView = getMasterTabJournalView(secondTab);
  assert.notEqual(firstView.newDraftId, secondView.newDraftId);

  const selectedFirst = updateMasterTabJournalView(second, panelId, firstTab.id, {
    ...firstView,
    selectedEntryId: "entry-1",
    workspaceMode: "history",
  });
  const firstAfter = selectedFirst.panels[0].tabs[0];
  const secondAfter = selectedFirst.panels[0].tabs[1];
  assert.equal(getMasterTabJournalView(firstAfter).selectedEntryId, "entry-1");
  assert.equal(getMasterTabJournalView(firstAfter).workspaceMode, "history");
  assert.equal(getMasterTabJournalView(secondAfter).selectedEntryId, null);
  assert.equal(getMasterTabJournalView(secondAfter).workspaceMode, "entry");
  assert.equal("draft" in firstAfter.presentation, false);
});

test("History Edit applies one Journal view transition and resolves the existing canonical draft", () => {
  const initial = initializeMasterWorkspaceState("Health", DEFAULT_TASK_WORKSPACE_TABS_STATE, "Journal");
  const panelId = initial.panels[0].id;
  const second = createMasterTab(initial, panelId, {
    id: "journal-tab-edit-peer",
    destination: { kind: "health-tab", page: "Health", tab: "Journal" },
    presentation: { healthSection: "Journal" },
  }, false);
  const firstTab = second.panels[0].tabs[0];
  const historyView = { ...getMasterTabJournalView(firstTab), selectedEntryId: null, workspaceMode: "history" as const };
  const updates: Array<NonNullable<Parameters<typeof updateMasterTabJournalView>[3]>> = [];
  const clickEdit = () => selectJournalHistoryEntryForEdit(historyView, "entry-1", (nextView) => {
    if (nextView) updates.push(nextView);
  });

  clickEdit();

  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0], { ...historyView, selectedEntryId: "entry-1", workspaceMode: "entry" });
  const editedWorkspace = updateMasterTabJournalView(second, panelId, firstTab.id, updates[0]);
  const selectedView = getMasterTabJournalView(editedWorkspace.panels[0].tabs[0]);
  assert.equal(selectedView.selectedEntryId, "entry-1");
  assert.equal(selectedView.workspaceMode, "entry");
  assert.equal(getMasterTabJournalView(editedWorkspace.panels[0].tabs[1]).selectedEntryId, null);
  assert.equal(getMasterTabJournalView(editedWorkspace.panels[0].tabs[1]).workspaceMode, "entry");

  const sessionStore = createEditingSessionStore<{ value: string }>("user-1", (left, right) => left.value === right.value);
  const sessionDraftId = `journal-entry:${selectedView.selectedEntryId}`;
  const canonicalRecordId = `health-check-in:${selectedView.selectedEntryId}`;
  sessionStore.ensureSession(sessionDraftId, canonicalRecordId, { value: "saved baseline" });
  sessionStore.updateDraft(sessionDraftId, (current) => ({ ...current, value: "shared unsaved edit" }));
  const resolvedSession = sessionStore.ensureSession(sessionDraftId, canonicalRecordId, { value: "saved baseline" });
  assert.equal(resolvedSession.canonicalRecordId, "health-check-in:entry-1");
  assert.equal(resolvedSession.draft.value, "shared unsaved edit");

  for (const workspaceMode of ["split-history-left", "split-history-right"] as const) {
    const splitView = { ...historyView, workspaceMode };
    let splitUpdate: NonNullable<Parameters<typeof updateMasterTabJournalView>[3]> | null = null;
    selectJournalHistoryEntryForEdit(splitView, "entry-2", (nextView) => { splitUpdate = nextView; });
    assert.equal(splitUpdate?.selectedEntryId, "entry-2");
    assert.equal(splitUpdate?.workspaceMode, workspaceMode);
    assert.equal(splitUpdate?.newDraftId, splitView.newDraftId);
  }
});

test("Master Tabs retain independent scroll positions", () => {
  const initial = initializeMasterWorkspaceState("Health", DEFAULT_TASK_WORKSPACE_TABS_STATE, "Journal");
  const panelId = initial.panels[0].id;
  const withSecond = createMasterTab(initial, panelId, {
    id: "scroll-tab-b",
    destination: { kind: "page", page: "Home" },
    presentation: {},
  }, false);
  const withFirstScroll = updateMasterTabScrollPosition(withSecond, panelId, "master-tab-1", 420);
  assert.equal(withFirstScroll.panels[0].tabs[0].presentation.scrollTop, 420);
  assert.equal(withFirstScroll.panels[0].tabs[1].presentation.scrollTop, undefined);
  assert.equal(updateMasterTabScrollPosition(withFirstScroll, panelId, "scroll-tab-b", -1), withFirstScroll);
});

test("deep destination normalization derives Health sections from NavigatorSearchAction", () => {
  const base = createDefaultMasterWorkspaceState();
  const normalized = normalizeMasterWorkspaceState({
    ...base,
    panels: [{
      ...base.panels[0],
      tabs: [
        { id: "health-journal", destination: { kind: "health-tab", page: "Health", tab: "Journal" }, presentation: { healthSection: "Food" } },
        { id: "food-shell", destination: { kind: "page-shell", page: "Health", pageKey: "health:food", shellId: "food-library", healthTab: "Food" }, presentation: { healthSection: "Journal" } },
        { id: "tasks-surface", destination: { kind: "tasks-surface", page: "Tasks", surface: "brainstorm" }, presentation: {} },
        { id: "tasks-view", destination: { kind: "tasks-view", page: "Tasks", surface: "tasks", view: "calendar" }, presentation: {} },
        { id: "settings-section", destination: { kind: "settings-section", page: "Settings", section: "day-reset" }, presentation: {} },
      ],
      activeTabId: "health-journal",
    }],
  });

  assert.equal(normalized.panels[0].tabs[0].presentation.healthSection, "Journal");
  assert.equal(normalized.panels[0].tabs[1].presentation.healthSection, "Food");
  assert.equal(normalized.panels[0].tabs[2].destination.kind, "tasks-surface");
  assert.equal(normalized.panels[0].tabs[3].destination.kind, "tasks-view");
  assert.equal(normalized.panels[0].tabs[4].destination.kind, "settings-section");
});

test("deep cross-page navigation keeps the existing Tasks tab snapshot isolated", () => {
  const customTasks = tasksState();
  const initial = initializeMasterWorkspaceState("Tasks", customTasks);
  const taskView = replaceFocusedMasterTabDestination(initial, {
    kind: "tasks-view",
    page: "Tasks",
    surface: "tasks",
    view: "calendar",
  });
  const health = replaceFocusedMasterTabDestination(taskView, { kind: "health-tab", page: "Health", tab: "Food" });
  const returnedToTasks = replaceFocusedMasterTabDestination(health, {
    kind: "tasks-surface",
    page: "Tasks",
    surface: "brainstorm",
  });

  assert.deepEqual(health.panels[0].tabs[0].presentation.tasksWorkspace, customTasks);
  assert.equal(health.panels[0].tabs[0].presentation.healthSection, "Food");
  assert.deepEqual(returnedToTasks.panels[0].tabs[0].presentation.tasksWorkspace, customTasks);
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

test("each Tasks master tab gets its own normalized workspace snapshot", () => {
  const initial = initializeMasterWorkspaceState("Tasks", tasksState());
  const panelId = initial.panels[0].id;
  const firstSnapshot = initial.panels[0].tabs[0].presentation.tasksWorkspace;
  const withSecond = createMasterTab(initial, panelId, {
    id: "tasks-tab-2",
    destination: { kind: "page", page: "Tasks" },
    presentation: { tasksWorkspace: firstSnapshot },
  }, false);
  const initialSecondSnapshot = withSecond.panels[0].tabs.find((tab) => tab.id === "tasks-tab-2")?.presentation.tasksWorkspace;
  assert.deepEqual(initialSecondSnapshot, firstSnapshot);
  assert.notEqual(initialSecondSnapshot, firstSnapshot);
  assert.notEqual(initialSecondSnapshot?.tabs[0].taskUiState.quickFilters, firstSnapshot?.tabs[0].taskUiState.quickFilters);
  const changedFirstState = {
    ...tasksState(),
    tabs: tasksState().tabs.map((tab) => ({
      ...tab,
      taskUiState: { ...tab.taskUiState, search: "first master tab", quickFilters: ["today" as const] },
    })),
  };
  const updated = updateMasterTabTasksWorkspace(withSecond, panelId, "master-tab-1", changedFirstState);
  const first = updated.panels[0].tabs.find((tab) => tab.id === "master-tab-1")?.presentation.tasksWorkspace;
  const second = updated.panels[0].tabs.find((tab) => tab.id === "tasks-tab-2")?.presentation.tasksWorkspace;

  assert.equal(first?.tabs[0].taskUiState.search, "first master tab");
  assert.equal(second?.tabs[0].taskUiState.search, "");
  assert.equal(second?.tabs[0].taskUiState.view, "list");
  assert.notEqual(first?.tabs[0].taskUiState.quickFilters, second?.tabs[0].taskUiState.quickFilters);
  assert.equal(updateMasterTabTasksWorkspace(updated, panelId, "master-tab-1", changedFirstState), updated);
  assert.equal(masterTabTasksWorkspaceMatchesLiveState(updated, panelId, "master-tab-1", changedFirstState), true);
  assert.equal(masterTabTasksWorkspaceMatchesLiveState(updated, panelId, "master-tab-1", tasksState()), false);
});

test("Tasks destinations without saved snapshots normalize to a default nested workspace", () => {
  const created = createMasterTab(createDefaultMasterWorkspaceState(), "master-panel-1", {
    id: "tasks-without-snapshot",
    destination: { kind: "page", page: "Tasks" },
    presentation: {},
  });
  const snapshot = created.panels[0].tabs.find((tab) => tab.id === "tasks-without-snapshot")?.presentation.tasksWorkspace;
  assert.equal(snapshot?.activeTabId, DEFAULT_TASK_WORKSPACE_TABS_STATE.activeTabId);
  assert.deepEqual(snapshot?.tabs.map((tab) => tab.id), [DEFAULT_TASK_WORKSPACE_TABS_STATE.tabs[0].id]);
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

test("Health section snapshots survive both saved workspace panels", () => {
  const storage = memoryStorage();
  const initial = initializeMasterWorkspaceState("Health", DEFAULT_TASK_WORKSPACE_TABS_STATE, "Food");
  const split = duplicateFocusedPageIntoRightPanel(initial, { panelId: "health-right", tabId: "health-right-tab" });
  const rightJournal = replaceFocusedMasterTabDestination(split, { kind: "health-tab", page: "Health", tab: "Journal" });

  assert.equal(saveMasterWorkspaceState(storage, "health-split-user", rightJournal), true);
  const restored = loadMasterWorkspaceState(storage, "health-split-user");
  assert.equal(restored.panels.length, 2);
  assert.equal(restored.panels[0].tabs[0].presentation.healthSection, "Food");
  assert.equal(restored.panels[1].tabs[0].presentation.healthSection, "Journal");
  assert.equal(restored.focusedPanelId, "health-right");
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
