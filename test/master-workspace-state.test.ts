import assert from "node:assert/strict";
import test from "node:test";
import {
  activateMasterPanel,
  activateMasterTab,
  adjustMasterWorkspaceSplitRatio,
  activateMasterTabInPanel,
  closeMasterSplit,
  closeMasterTab,
  closeMasterTabInPanel,
  createDefaultMasterWorkspaceState,
  createMasterTab,
  duplicateFocusedPageIntoRightPanel,
  getMasterWorkspaceStorageKey,
  getMasterTabJournalView,
  getMasterTabNotesView,
  getMasterTabFoodView,
  getMasterTabScratchPaperView,
  initializeMasterWorkspaceState,
  masterTabTasksWorkspaceMatchesLiveState,
  loadMasterWorkspaceState,
  normalizeMasterWorkspaceState,
  replaceFocusedMasterTabDestination,
  replaceMasterTabDestination,
  resolveMasterTabTasksUiState,
  resolveMasterTabTasksWorkspace,
  saveMasterWorkspaceState,
  selectJournalHistoryEntryForEdit,
  setMasterWorkspacePanelTabsCollapsed,
  updateMasterTabTasksUiState,
  updateMasterTabTasksWorkspace,
  updateMasterTabTasksWorkspaceState,
  updateMasterTabJournalView,
  updateMasterTabFoodView,
  updateMasterTabNotesView,
  updateMasterTabScratchPaperView,
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

test("Backup & Recovery Settings destinations remain valid in Master Workspace state", () => {
  const initial = initializeMasterWorkspaceState("Settings", DEFAULT_TASK_WORKSPACE_TABS_STATE);
  const selected = replaceFocusedMasterTabDestination(initial, {
    kind: "settings-section",
    page: "Settings",
    section: "backup-recovery",
  });
  assert.equal(selected.panels[0].tabs[0].destination.kind, "settings-section");
  assert.deepEqual(normalizeMasterWorkspaceState(selected).panels[0].tabs[0].destination, {
    kind: "settings-section",
    page: "Settings",
    section: "backup-recovery",
  });
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

test("Notes selection and filters persist as per-tab navigation without draft contents", () => {
  const initial = initializeMasterWorkspaceState("Notes", DEFAULT_TASK_WORKSPACE_TABS_STATE);
  const panelId = initial.panels[0].id;
  const second = createMasterTab(initial, panelId, {
    id: "notes-tab-b",
    destination: { kind: "page", page: "Notes" },
    presentation: {},
  }, false);
  const firstTab = second.panels[0].tabs[0];
  const secondTab = second.panels[0].tabs[1];
  const firstView = getMasterTabNotesView(firstTab);
  const secondView = getMasterTabNotesView(secondTab);

  const selectedFirst = updateMasterTabNotesView(second, panelId, firstTab.id, {
    ...firstView,
    selection: { kind: "saved", noteId: "note-1" },
    search: "meeting",
    activeTag: "work",
  });
  const selectedFirstAfterPageSwitch = replaceFocusedMasterTabDestination(selectedFirst, { kind: "page", page: "Home" });
  const restoredFirst = replaceFocusedMasterTabDestination(selectedFirstAfterPageSwitch, { kind: "page", page: "Notes" });
  const persisted = memoryStorage();

  assert.equal(getMasterTabNotesView(restoredFirst.panels[0].tabs[0]).selection.kind, "saved");
  assert.deepEqual(getMasterTabNotesView(restoredFirst.panels[0].tabs[0]), {
    selection: { kind: "saved", noteId: "note-1" },
    search: "meeting",
    activeTag: "work",
  });
  assert.deepEqual(getMasterTabNotesView(restoredFirst.panels[0].tabs[1]), secondView);
  assert.equal(saveMasterWorkspaceState(persisted, "notes-user", restoredFirst), true);
  const serialized = persisted.values.get(getMasterWorkspaceStorageKey("notes-user")) ?? "";
  assert.match(serialized, /"noteId":"note-1"/);
  assert.doesNotMatch(serialized, /"body"|"title"|"linked_task_ids"/);
});

test("Scratch Paper selection, search, and status filter persist independently across tabs and page navigation", () => {
  const initial = initializeMasterWorkspaceState("Home", DEFAULT_TASK_WORKSPACE_TABS_STATE);
  const panelId = initial.panels[0].id;
  const second = createMasterTab(initial, panelId, {
    id: "scratch-tab-b",
    destination: { kind: "page", page: "Notes" },
    presentation: {},
  }, false);
  const firstTab = second.panels[0].tabs[0];
  const secondTab = second.panels[0].tabs[1];
  const firstView = getMasterTabScratchPaperView(firstTab);
  const secondView = getMasterTabScratchPaperView(secondTab);
  assert.notEqual(firstView.newDraftId, secondView.newDraftId);

  const firstUpdated = updateMasterTabScratchPaperView(second, panelId, firstTab.id, {
    ...firstView,
    currentNoteId: "note-1",
    search: "meeting",
    filter: "resolved",
  });
  const firstAfterPageNavigation = replaceFocusedMasterTabDestination(firstUpdated, { kind: "page", page: "Notes" });
  const activatedSecond = activateMasterTab(firstAfterPageNavigation, panelId, secondTab.id);
  const secondUpdated = updateMasterTabScratchPaperView(activatedSecond, panelId, secondTab.id, {
    ...secondView,
    currentNoteId: "note-2",
    search: "idea",
    filter: "trashed",
  });
  const secondAfterPageNavigation = replaceFocusedMasterTabDestination(secondUpdated, { kind: "page", page: "Home" });
  const restoredFirst = activateMasterTab(secondAfterPageNavigation, panelId, firstTab.id);

  assert.deepEqual(getMasterTabScratchPaperView(restoredFirst.panels[0].tabs[0]), {
    ...firstView,
    currentNoteId: "note-1",
    search: "meeting",
    filter: "resolved",
  });
  assert.deepEqual(getMasterTabScratchPaperView(restoredFirst.panels[0].tabs[1]), {
    ...secondView,
    currentNoteId: "note-2",
    search: "idea",
    filter: "trashed",
  });
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

test("explicit destination updates keep left and right panel pages independent", () => {
  const split = duplicateFocusedPageIntoRightPanel(createDefaultMasterWorkspaceState(), {
    panelId: "right-panel",
    tabId: "right-tab",
  });
  const leftPanel = split.panels[0];
  const rightPanel = split.panels[1];

  const rightTasks = replaceMasterTabDestination(split, rightPanel.id, rightPanel.activeTabId, {
    kind: "tasks-surface",
    page: "Tasks",
    surface: "brainstorm",
  });
  assert.deepEqual(rightTasks.panels[0].tabs[0].destination, { kind: "page", page: "Home" });
  assert.deepEqual(rightTasks.panels[1].tabs[0].destination, {
    kind: "tasks-surface",
    page: "Tasks",
    surface: "brainstorm",
  });

  const leftHealth = replaceMasterTabDestination(rightTasks, leftPanel.id, leftPanel.activeTabId, {
    kind: "health-tab",
    page: "Health",
    tab: "Journal",
  });
  assert.deepEqual(leftHealth.panels[0].tabs[0].destination, {
    kind: "health-tab",
    page: "Health",
    tab: "Journal",
  });
  assert.deepEqual(leftHealth.panels[1].tabs[0].destination, {
    kind: "tasks-surface",
    page: "Tasks",
    surface: "brainstorm",
  });
  assert.equal(leftHealth.focusedPanelId, split.focusedPanelId);
  assert.equal(leftHealth.visiblePanelId, split.visiblePanelId);
});

test("panel tab activation and closing preserve the neighboring panel identity", () => {
  const split = duplicateFocusedPageIntoRightPanel(createDefaultMasterWorkspaceState(), {
    panelId: "right-panel",
    tabId: "right-home",
  });
  const withRightTab = createMasterTab(split, "right-panel", {
    id: "right-notes",
    destination: { kind: "page", page: "Notes" },
    presentation: { notesView: { selection: { kind: "new", draftId: "right-note-draft" }, search: "right", activeTag: null } },
  }, false);
  const activated = activateMasterTabInPanel(withRightTab, "right-panel", "right-notes");

  assert.equal(activated.panels.find((panel) => panel.id === "right-panel")?.activeTabId, "right-notes");
  assert.equal(activated.panels.find((panel) => panel.id === "master-panel-1")?.activeTabId, "master-tab-1");
  assert.equal(activated.focusedPanelId, withRightTab.focusedPanelId);
  assert.equal(activated.panels[0].tabs[0].destination.page, "Home");
  assert.equal(activated.panels[1].tabs.find((tab) => tab.id === "right-notes")?.presentation.notesView?.search, "right");

  const closedBackgroundTab = closeMasterTabInPanel(activated, "right-panel", "right-home");
  assert.equal(closedBackgroundTab.panels.find((panel) => panel.id === "right-panel")?.activeTabId, "right-notes");
  assert.equal(closedBackgroundTab.focusedPanelId, activated.focusedPanelId);
  assert.equal(closedBackgroundTab.panels.find((panel) => panel.id === "master-panel-1")?.activeTabId, "master-tab-1");
});

test("explicit destination updates target inactive tabs without changing focus, presentation, or draft identity", () => {
  const split = duplicateFocusedPageIntoRightPanel(createDefaultMasterWorkspaceState(), {
    panelId: "right-panel",
    tabId: "right-tab",
  });
  const leftPanel = split.panels[0];
  const rightPanel = split.panels[1];
  const withInactiveTab = createMasterTab(split, leftPanel.id, {
    id: "left-inactive-tab",
    destination: { kind: "page", page: "Health" },
    presentation: {
      healthSection: "Food",
      scrollTop: 38,
      journalView: { selectedEntryId: "entry-1", newDraftId: "journal-draft-1", workspaceMode: "history" },
      notesView: { selection: { kind: "new", draftId: "notes-draft-1" }, search: "meal", activeTag: "work" },
      tasksWorkspace: tasksState(),
    },
  }, false);
  const targetBefore = withInactiveTab.panels[0].tabs.find((tab) => tab.id === "left-inactive-tab");
  assert.ok(targetBefore);
  const rightBefore = withInactiveTab.panels.find((panel) => panel.id === rightPanel.id);
  const workspace = { ...withInactiveTab, visiblePanelId: leftPanel.id };
  const beforeFoodView = getMasterTabFoodView(targetBefore);
  const beforeScratchPaperView = getMasterTabScratchPaperView(targetBefore);

  const updated = replaceMasterTabDestination(workspace, leftPanel.id, targetBefore.id, {
    kind: "health-tab",
    page: "Health",
    tab: "Journal",
  });
  const updatedLeft = updated.panels.find((panel) => panel.id === leftPanel.id);
  const updatedTarget = updatedLeft?.tabs.find((tab) => tab.id === targetBefore.id);

  assert.ok(updatedTarget);
  assert.equal(updated.focusedPanelId, workspace.focusedPanelId);
  assert.equal(updated.visiblePanelId, workspace.visiblePanelId);
  assert.equal(updated.splitRatio, workspace.splitRatio);
  assert.equal(updatedLeft?.activeTabId, leftPanel.activeTabId);
  assert.equal(updated.panels.find((panel) => panel.id === rightPanel.id)?.activeTabId, rightPanel.activeTabId);
  assert.strictEqual(updated.panels.find((panel) => panel.id === rightPanel.id), rightBefore);
  assert.strictEqual(updatedLeft?.tabs.find((tab) => tab.id === leftPanel.activeTabId), leftPanel.tabs[0]);
  assert.deepEqual(updatedTarget.destination, { kind: "health-tab", page: "Health", tab: "Journal" });
  assert.equal(updatedTarget.presentation.healthSection, "Journal");
  assert.equal(updatedTarget.presentation.scrollTop, 38);
  assert.deepEqual(updatedTarget.presentation.journalView, targetBefore.presentation.journalView);
  assert.deepEqual(updatedTarget.presentation.notesView, targetBefore.presentation.notesView);
  assert.deepEqual(updatedTarget.presentation.tasksWorkspace, targetBefore.presentation.tasksWorkspace);
  assert.deepEqual(updatedTarget.presentation.foodView, targetBefore.presentation.foodView);
  assert.deepEqual(updatedTarget.presentation.scratchPaperView, targetBefore.presentation.scratchPaperView);
  assert.equal(getMasterTabFoodView(updatedTarget).newMealDraftId, beforeFoodView.newMealDraftId);
  assert.equal(getMasterTabFoodView(updatedTarget).newPlannedMealDraftId, beforeFoodView.newPlannedMealDraftId);
  assert.equal(getMasterTabFoodView(updatedTarget).newCustomFoodDraftId, beforeFoodView.newCustomFoodDraftId);
  assert.equal(getMasterTabFoodView(updatedTarget).newRecipeDraftId, beforeFoodView.newRecipeDraftId);
  assert.equal(getMasterTabFoodView(updatedTarget).newSavedMealDraftId, beforeFoodView.newSavedMealDraftId);
  assert.equal(getMasterTabScratchPaperView(updatedTarget).newDraftId, beforeScratchPaperView.newDraftId);
});

test("explicit destination updates normalize page, Tasks, Health, and registered shell actions", () => {
  const base = createDefaultMasterWorkspaceState();
  const panelId = base.panels[0].id;
  const tabId = base.panels[0].activeTabId;
  const cases = [
    { kind: "page", page: "Notes" },
    { kind: "task", page: "Tasks", taskId: " task-1 " },
    { kind: "tasks-surface", page: "Tasks", surface: "brainstorm" },
    { kind: "tasks-view", page: "Tasks", surface: "tasks", view: "calendar" },
    { kind: "health-tab", page: "Health", tab: "Food" },
    { kind: "page-shell", page: "Health", pageKey: "health:food", shellId: "food-library", healthTab: "Food" },
  ] as const;
  const expected = [
    { kind: "page", page: "Notes" },
    { kind: "task", page: "Tasks", taskId: "task-1" },
    { kind: "tasks-surface", page: "Tasks", surface: "brainstorm" },
    { kind: "tasks-view", page: "Tasks", surface: "tasks", view: "calendar" },
    { kind: "health-tab", page: "Health", tab: "Food" },
    { kind: "page-shell", page: "Health", pageKey: "health:food", shellId: "food-library", healthTab: "Food" },
  ];

  let state = base;
  for (const [index, destination] of cases.entries()) {
    state = replaceMasterTabDestination(state, panelId, tabId, destination);
    assert.deepEqual(state.panels[0].tabs[0].destination, expected[index]);
  }
  assert.equal(state.panels[0].tabs[0].presentation.healthSection, "Food");
  assert.equal(state.panels[0].tabs[0].presentation.tasksWorkspace?.activeTabId, DEFAULT_TASK_WORKSPACE_TABS_STATE.activeTabId);
});

test("explicit destination helper preserves focused navigation parity and no-op identity", () => {
  const state = initializeMasterWorkspaceState("Tasks", tasksState());
  const panel = state.panels[0];
  const destination = { kind: "tasks-view", page: "Tasks", surface: "tasks", view: "calendar" } as const;
  const focused = replaceFocusedMasterTabDestination(state, destination);
  const targeted = replaceMasterTabDestination(state, panel.id, panel.activeTabId, destination);
  assert.deepEqual(focused, targeted);
  assert.deepEqual(focused.panels[0].tabs[0].presentation.tasksWorkspace, state.panels[0].tabs[0].presentation.tasksWorkspace);
  assert.strictEqual(replaceMasterTabDestination(state, panel.id, panel.activeTabId, state.panels[0].tabs[0].destination), state);
  assert.strictEqual(replaceMasterTabDestination(state, "missing-panel", panel.activeTabId, destination), state);
  assert.strictEqual(replaceMasterTabDestination(state, panel.id, "missing-tab", destination), state);
});

test("persistence round-trip retains independent left and right destinations", () => {
  const storage = memoryStorage();
  const split = duplicateFocusedPageIntoRightPanel(createDefaultMasterWorkspaceState(), {
    panelId: "right-panel",
    tabId: "right-tab",
  });
  const withLeftNotes = replaceMasterTabDestination(split, split.panels[0].id, split.panels[0].activeTabId, {
    kind: "page",
    page: "Notes",
  });
  const withRightJournal = replaceMasterTabDestination(withLeftNotes, split.panels[1].id, split.panels[1].activeTabId, {
    kind: "health-tab",
    page: "Health",
    tab: "Journal",
  });

  assert.equal(saveMasterWorkspaceState(storage, "independent-destinations", withRightJournal), true);
  const restored = loadMasterWorkspaceState(storage, "independent-destinations");
  assert.deepEqual(restored.panels[0].tabs[0].destination, { kind: "page", page: "Notes" });
  assert.deepEqual(restored.panels[1].tabs[0].destination, { kind: "health-tab", page: "Health", tab: "Journal" });
  assert.equal(restored.panels[1].tabs[0].presentation.healthSection, "Journal");
  assert.equal(restored.focusedPanelId, withRightJournal.focusedPanelId);
  assert.equal(restored.visiblePanelId, withRightJournal.visiblePanelId);
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

test("panel-targeted workspace updates change only the requested Tasks tab snapshot", () => {
  const initial = initializeMasterWorkspaceState("Tasks", tasksState());
  const panelId = initial.panels[0].id;
  const split = duplicateFocusedPageIntoRightPanel(initial, { panelId: "right-panel", tabId: "right-task-tab" });
  const rightPanel = split.panels.find((panel) => panel.side === "right");
  assert.ok(rightPanel);
  const currentRight = resolveMasterTabTasksWorkspace(split, rightPanel.id, "right-task-tab");
  assert.ok(currentRight);
  const nextRight = {
    ...currentRight,
    activeTabId: "workspace-right",
    tabs: [...currentRight.tabs, {
      ...currentRight.tabs[0],
      currentFolderId: "folder-right",
      id: "workspace-right",
      label: "Right Tab",
      taskTableLayoutPreferences: { columnOrder: ["title", "status"], sortState: { columnId: "title", optionId: "a-z" } },
      taskUiState: { ...currentRight.tabs[0].taskUiState, search: "right query" },
    }],
  };

  const updated = updateMasterTabTasksWorkspaceState(split, rightPanel.id, "right-task-tab", nextRight);
  assert.equal(resolveMasterTabTasksWorkspace(updated, rightPanel.id, "right-task-tab")?.activeTabId, "workspace-right");
  assert.equal(resolveMasterTabTasksWorkspace(updated, panelId, "master-tab-1")?.activeTabId, currentRight.activeTabId);
  assert.equal(resolveMasterTabTasksWorkspace(updated, rightPanel.id, "right-task-tab")?.tabs.at(-1)?.taskUiState.search, "right query");
  assert.deepEqual(resolveMasterTabTasksWorkspace(updated, rightPanel.id, "right-task-tab")?.tabs.at(-1)?.taskTableLayoutPreferences, {
    columnOrder: ["title", "status"],
    sortState: { columnId: "title", optionId: "a-z" },
  });
  assert.equal(resolveMasterTabTasksWorkspace(updated, rightPanel.id, "right-task-tab")?.tabs.at(-1)?.currentFolderId, "folder-right");
  assert.equal(updateMasterTabTasksWorkspaceState(updated, "missing-panel", "right-task-tab", nextRight), updated);
});

test("panel-targeted Tasks updates keep left and right presentations independent while left stays focused", () => {
  const initial = initializeMasterWorkspaceState("Tasks", tasksState());
  const leftPanel = initial.panels[0];
  const split = duplicateFocusedPageIntoRightPanel(initial, { panelId: "right-panel", tabId: "right-task-tab" });
  const rightPanel = split.panels.find((panel) => panel.side === "right");
  assert.ok(rightPanel);

  const withLeftSettings = updateMasterTabTasksUiState(
    split,
    leftPanel.id,
    leftPanel.activeTabId,
    (current) => ({
      ...current,
      search: "left panel",
      selectedBucket: "priority_3_4",
      quickFilters: ["today"],
      statusFilters: ["pending"],
      view: "list",
      listSortBySurface: { "tasks:home": { field: "title", direction: "asc" } },
    }),
  );
  const leftFocused = activateMasterPanel(withLeftSettings, leftPanel.id);
  const leftBefore = resolveMasterTabTasksUiState(leftFocused, leftPanel.id, leftPanel.activeTabId);
  const leftPanelBeforeTargetUpdate = leftFocused.panels.find((panel) => panel.id === leftPanel.id);
  assert.ok(leftBefore);

  const rightUpdated = updateMasterTabTasksUiState(
    leftFocused,
    rightPanel.id,
    rightPanel.activeTabId,
    (current) => ({
      ...current,
      search: "right panel",
      selectedBucket: "attention",
      quickFilters: ["urgent"],
      statusFilters: ["not_due"],
      view: "calendar",
      listSortBySurface: { "tasks:home": { field: "priority", direction: "desc" } },
    }),
  );

  assert.equal(rightUpdated.focusedPanelId, leftPanel.id);
  assert.strictEqual(rightUpdated.panels.find((panel) => panel.id === leftPanel.id), leftPanelBeforeTargetUpdate);
  assert.equal(resolveMasterTabTasksUiState(rightUpdated, leftPanel.id, leftPanel.activeTabId)?.search, "left panel");
  assert.equal(resolveMasterTabTasksUiState(rightUpdated, leftPanel.id, leftPanel.activeTabId)?.selectedBucket, "priority_3_4");
  assert.deepEqual(resolveMasterTabTasksUiState(rightUpdated, leftPanel.id, leftPanel.activeTabId)?.quickFilters, ["today"]);
  assert.deepEqual(resolveMasterTabTasksUiState(rightUpdated, leftPanel.id, leftPanel.activeTabId)?.statusFilters, ["pending"]);
  assert.equal(resolveMasterTabTasksUiState(rightUpdated, leftPanel.id, leftPanel.activeTabId)?.view, "list");
  assert.deepEqual(
    resolveMasterTabTasksUiState(rightUpdated, leftPanel.id, leftPanel.activeTabId)?.listSortBySurface["tasks:home"],
    { field: "title", direction: "asc" },
  );
  assert.equal(resolveMasterTabTasksUiState(rightUpdated, rightPanel.id, rightPanel.activeTabId)?.search, "right panel");
  assert.equal(resolveMasterTabTasksUiState(rightUpdated, rightPanel.id, rightPanel.activeTabId)?.view, "calendar");
  assert.deepEqual(
    resolveMasterTabTasksUiState(rightUpdated, rightPanel.id, rightPanel.activeTabId)?.listSortBySurface["tasks:home"],
    { field: "priority", direction: "desc" },
  );
  assert.deepEqual(leftBefore.quickFilters, ["today"]);
});

test("panel-targeted Tasks functional updates use the latest supplied state", () => {
  const initial = initializeMasterWorkspaceState("Tasks", tasksState());
  const { id: panelId, activeTabId: tabId } = initial.panels[0];
  const first = updateMasterTabTasksUiState(initial, panelId, tabId, (current) => ({
    ...current,
    search: `${current.search} latest`,
  }));
  const second = updateMasterTabTasksUiState(first, panelId, tabId, (current) => ({
    ...current,
    selectedBucket: current.search === " latest" ? "attention" : "today",
  }));

  assert.equal(resolveMasterTabTasksUiState(second, panelId, tabId)?.search, " latest");
  assert.equal(resolveMasterTabTasksUiState(second, panelId, tabId)?.selectedBucket, "attention");
});

test("panel-targeted Tasks updates can address an inactive Master tab", () => {
  const initial = initializeMasterWorkspaceState("Tasks", tasksState());
  const panelId = initial.panels[0].id;
  const inactive = createMasterTab(initial, panelId, {
    id: "inactive-tasks-tab",
    destination: { kind: "page", page: "Tasks" },
    presentation: { tasksWorkspace: tasksState() },
  }, false);
  const activeTabId = inactive.panels[0].activeTabId;
  const updated = updateMasterTabTasksUiState(inactive, panelId, "inactive-tasks-tab", (current) => ({
    ...current,
    search: "inactive target",
    view: "matrix",
  }));

  assert.equal(updated.panels[0].activeTabId, activeTabId);
  assert.equal(resolveMasterTabTasksUiState(updated, panelId, activeTabId)?.search, "");
  assert.equal(resolveMasterTabTasksUiState(updated, panelId, "inactive-tasks-tab")?.search, "inactive target");
  assert.equal(resolveMasterTabTasksUiState(updated, panelId, "inactive-tasks-tab")?.view, "matrix");
});

test("panel-targeted Tasks reads and writes reject invalid identities and non-Tasks tabs", () => {
  const initial = createDefaultMasterWorkspaceState();
  const panelId = initial.panels[0].id;
  const tabId = initial.panels[0].activeTabId;

  assert.equal(resolveMasterTabTasksWorkspace(initial, "", tabId), undefined);
  assert.equal(resolveMasterTabTasksWorkspace(initial, panelId, " missing "), undefined);
  assert.equal(resolveMasterTabTasksUiState(initial, "missing-panel", tabId), undefined);
  assert.strictEqual(updateMasterTabTasksUiState(initial, "missing-panel", tabId, (current) => current), initial);
  assert.strictEqual(updateMasterTabTasksUiState(initial, panelId, "missing-tab", (current) => current), initial);
  assert.strictEqual(updateMasterTabTasksUiState(initial, panelId, tabId, (current) => ({ ...current, search: "ignored" })), initial);
});

test("legacy Tasks tabs without snapshots resolve defaults and accept targeted updates", () => {
  const initial = initializeMasterWorkspaceState("Tasks", tasksState());
  const panelId = initial.panels[0].id;
  const tabId = initial.panels[0].activeTabId;
  const legacyState = {
    ...initial,
    panels: initial.panels.map((panel) => panel.id !== panelId ? panel : {
      ...panel,
      tabs: panel.tabs.map((tab) => tab.id !== tabId ? tab : {
        ...tab,
        presentation: { ...tab.presentation, tasksWorkspace: undefined },
      }),
    }),
  };

  assert.equal(resolveMasterTabTasksUiState(legacyState, panelId, tabId)?.view, "table");
  assert.equal(resolveMasterTabTasksUiState(legacyState, panelId, tabId)?.search, "");
  assert.strictEqual(updateMasterTabTasksUiState(legacyState, panelId, tabId, (current) => current), legacyState);

  const updated = updateMasterTabTasksUiState(legacyState, panelId, tabId, (current) => ({
    ...current,
    search: "recovered legacy Tasks tab",
  }));
  assert.equal(resolveMasterTabTasksUiState(updated, panelId, tabId)?.search, "recovered legacy Tasks tab");
  assert.ok(updated.panels[0].tabs[0].presentation.tasksWorkspace);
});

test("panel-targeted Tasks no-op updates preserve the original state reference", () => {
  const initial = initializeMasterWorkspaceState("Tasks", tasksState());
  const { id: panelId, activeTabId: tabId } = initial.panels[0];

  assert.strictEqual(updateMasterTabTasksUiState(initial, panelId, tabId, (current) => current), initial);
  assert.strictEqual(updateMasterTabTasksUiState(initial, panelId, tabId, (current) => ({ ...current })), initial);
});

test("panel-targeted Tasks updates preserve other tabs and unrelated presentation fields", () => {
  const initial = initializeMasterWorkspaceState("Tasks", tasksState());
  const panelId = initial.panels[0].id;
  const targetTabId = initial.panels[0].activeTabId;
  const withOtherTab = createMasterTab(initial, panelId, {
    id: "other-master-tab",
    destination: { kind: "page", page: "Notes" },
    presentation: { scrollTop: 22 },
  }, false);
  const withUnrelatedFields = {
    ...withOtherTab,
    panels: withOtherTab.panels.map((panel) => panel.id !== panelId ? panel : {
      ...panel,
      tabs: panel.tabs.map((tab) => tab.id !== targetTabId ? tab : {
        ...tab,
        presentation: { ...tab.presentation, scrollTop: 88, healthSection: "Food" as const },
      }),
    }),
  };
  const otherPanelTab = withUnrelatedFields.panels[0].tabs.find((tab) => tab.id === "other-master-tab");
  const updated = updateMasterTabTasksUiState(withUnrelatedFields, panelId, targetTabId, (current) => ({
    ...current,
    search: "changed target only",
  }));
  const target = updated.panels[0].tabs.find((tab) => tab.id === targetTabId);
  const preservedOtherTab = updated.panels[0].tabs.find((tab) => tab.id === "other-master-tab");

  assert.equal(target?.presentation.scrollTop, 88);
  assert.equal(target?.presentation.healthSection, "Food");
  assert.strictEqual(preservedOtherTab, otherPanelTab);
  assert.equal(preservedOtherTab?.presentation.scrollTop, 22);
});

test("panel-targeted Tasks updates retain existing normalization and single-panel behavior", () => {
  const initial = initializeMasterWorkspaceState("Tasks", tasksState());
  const { id: panelId, activeTabId: tabId } = initial.panels[0];
  const normalized = updateMasterTabTasksUiState(initial, panelId, tabId, (current) => ({
    ...current,
    selectedBucket: "urgent",
    // @ts-expect-error exercise persisted legacy values through the normalizer
    view: "unsupported-view",
    // @ts-expect-error exercise persisted legacy values through the normalizer
    statusFilters: ["upcoming", "not_due", "pending", "trashed"],
    listSortBySurface: { "tasks:home": { field: "unsupported-sort", direction: "desc" } as never },
  }));
  const uiState = resolveMasterTabTasksUiState(normalized, panelId, tabId);

  assert.equal(uiState?.selectedBucket, "priority_5");
  assert.equal(uiState?.view, "table");
  assert.deepEqual(uiState?.statusFilters, ["not_due", "pending"]);
  assert.deepEqual(uiState?.listSortBySurface["tasks:home"], { field: "manual", direction: "asc" });
  assert.equal(normalized.panels.length, 1);
  assert.equal(normalized.focusedPanelId, panelId);
  assert.equal(resolveMasterTabTasksUiState(normalized, panelId, tabId)?.search, "");
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
  const actual = normalizeMasterWorkspaceState({ schemaVersion: 99, panels: [] });
  const expected = createDefaultMasterWorkspaceState();
  const withoutScratchDraftIds = (state: ReturnType<typeof createDefaultMasterWorkspaceState>) => ({
    ...state,
    panels: state.panels.map((panel) => ({
      ...panel,
      tabs: panel.tabs.map((tab) => ({
        ...tab,
        presentation: {
          ...tab.presentation,
          foodView: {
            ...getMasterTabFoodView(tab),
            newMealDraftId: "stable-food-draft-id",
            newPlannedMealDraftId: "stable-planned-draft-id",
            newCustomFoodDraftId: "stable-custom-food-draft-id",
            newRecipeDraftId: "stable-recipe-draft-id",
            newSavedMealDraftId: "stable-saved-meal-draft-id",
          },
          scratchPaperView: { ...getMasterTabScratchPaperView(tab), newDraftId: "stable-id" },
        },
      })),
    })),
  });
  assert.deepEqual(withoutScratchDraftIds(actual), withoutScratchDraftIds(expected));
  assert.match(getMasterTabScratchPaperView(actual.panels[0].tabs[0]).newDraftId, /^[0-9a-f-]{36}$/i);
  assert.match(getMasterTabFoodView(actual.panels[0].tabs[0]).newMealDraftId, /^[0-9a-f-]{36}$/i);
  assert.match(getMasterTabFoodView(actual.panels[0].tabs[0]).newPlannedMealDraftId, /^[0-9a-f-]{36}$/i);
  assert.match(getMasterTabFoodView(actual.panels[0].tabs[0]).newCustomFoodDraftId, /^[0-9a-f-]{36}$/i);
  assert.match(getMasterTabFoodView(actual.panels[0].tabs[0]).newRecipeDraftId, /^[0-9a-f-]{36}$/i);
  assert.match(getMasterTabFoodView(actual.panels[0].tabs[0]).newSavedMealDraftId, /^[0-9a-f-]{36}$/i);
});

test("each Health tab gets an independent planned-entry identity separate from actual Food", () => {
  const initial = initializeMasterWorkspaceState("Health", DEFAULT_TASK_WORKSPACE_TABS_STATE, "Food");
  const firstFoodView = getMasterTabFoodView(initial.panels[0].tabs[0]);
  const next = createMasterTab(initial, initial.panels[0].id, {
    id: "another-health-tab",
    destination: { kind: "page", page: "Health" },
    presentation: { healthSection: "Food" },
  });
  const secondFoodView = getMasterTabFoodView(next.panels[0].tabs[1]);
  assert.notEqual(firstFoodView.newPlannedMealDraftId, firstFoodView.newMealDraftId);
  assert.notEqual(secondFoodView.newPlannedMealDraftId, secondFoodView.newMealDraftId);
  assert.notEqual(firstFoodView.newPlannedMealDraftId, secondFoodView.newPlannedMealDraftId);
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

test("functional Food presentation updates compose against the latest tab state", () => {
  const initial = initializeMasterWorkspaceState("Health", DEFAULT_TASK_WORKSPACE_TABS_STATE, "Food");
  const panelId = initial.panels[0].id;
  const tabId = initial.panels[0].activeTabId;
  let current = initial;

  for (const slot of ["breakfast", "lunch", "dinner", "snack"] as const) {
    current = updateMasterTabFoodView(current, panelId, tabId, (view) => ({
      ...view,
      activeMealEntrySlot: slot,
      mealEditorMode: "actual",
      editingMealPlanId: null,
    }));
    const view = getMasterTabFoodView(current.panels[0].tabs[0]);
    assert.equal(view.activeMealEntrySlot, slot);
    assert.equal(view.mealEditorMode, "actual");
  }

  current = updateMasterTabFoodView(current, panelId, tabId, (view) => ({ ...view, activeMealEntrySlot: "dinner" }));
  current = updateMasterTabFoodView(current, panelId, tabId, (view) => ({ ...view, mealEditorMode: "plan" }));
  current = updateMasterTabFoodView(current, panelId, tabId, (view) => ({ ...view, editingMealPlanId: null }));
  const plannedView = getMasterTabFoodView(current.panels[0].tabs[0]);
  assert.equal(plannedView.activeMealEntrySlot, "dinner");
  assert.equal(plannedView.mealEditorMode, "plan");
  assert.equal(plannedView.editingMealPlanId, null);

  current = updateMasterTabFoodView(current, panelId, tabId, (view) => ({ ...view, activeMealEntrySlot: "breakfast" }));
  current = updateMasterTabFoodView(current, panelId, tabId, (view) => ({ ...view, mealEditorMode: "actual" }));
  current = updateMasterTabFoodView(current, panelId, tabId, (view) => ({ ...view, isQuickEntryOpen: true }));
  const quickEntryView = getMasterTabFoodView(current.panels[0].tabs[0]);
  assert.equal(quickEntryView.activeMealEntrySlot, "breakfast");
  assert.equal(quickEntryView.mealEditorMode, "actual");
  assert.equal(quickEntryView.isQuickEntryOpen, true);
  assert.equal(quickEntryView.newMealDraftId, getMasterTabFoodView(initial.panels[0].tabs[0]).newMealDraftId);
  assert.equal(quickEntryView.newPlannedMealDraftId, getMasterTabFoodView(initial.panels[0].tabs[0]).newPlannedMealDraftId);

  const unchanged = updateMasterTabFoodView(current, panelId, tabId, (view) => ({ ...view }));
  assert.strictEqual(unchanged, current);
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

test("Split Right keeps an independent Tasks presentation and saved split restoration bounded to two panels", () => {
  const sourceTasksState = tasksState();
  const initial = initializeMasterWorkspaceState("Tasks", {
    ...sourceTasksState,
    tabs: sourceTasksState.tabs.map((tab) => ({
      ...tab,
      currentFolderId: "folder-left",
      taskTableLayoutPreferences: {
        columnOrder: ["title", "status"],
        sortState: { columnId: "title", optionId: "a-z" },
      },
    })),
  });
  const leftPanel = initial.panels[0];
  const leftTab = leftPanel.tabs[0];
  const split = duplicateFocusedPageIntoRightPanel(initial, { panelId: "right-panel", tabId: "right-tasks" });
  const rightPanel = split.panels.find((panel) => panel.side === "right");
  const rightTab = rightPanel?.tabs[0];

  assert.ok(rightPanel);
  assert.ok(rightTab);
  assert.equal(split.panels.length, 2);
  assert.equal(split.splitRatio, 0.5);
  assert.equal(resolveMasterTabTasksUiState(split, leftPanel.id, leftTab.id)?.selectedBucket, "priority_3_4");
  assert.equal(resolveMasterTabTasksUiState(split, rightPanel.id, rightTab.id)?.selectedBucket, "priority_3_4");
  assert.equal(resolveMasterTabTasksWorkspace(split, rightPanel.id, rightTab.id)?.tabs[0].currentFolderId, "folder-left");
  assert.deepEqual(resolveMasterTabTasksWorkspace(split, rightPanel.id, rightTab.id)?.tabs[0].taskTableLayoutPreferences, {
    columnOrder: ["title", "status"],
    sortState: { columnId: "title", optionId: "a-z" },
  });

  const rightSearch = updateMasterTabTasksUiState(split, rightPanel.id, rightTab.id, (current) => ({
    ...current,
    search: "right only",
  }));
  assert.equal(resolveMasterTabTasksUiState(rightSearch, rightPanel.id, rightTab.id)?.search, "right only");
  assert.equal(resolveMasterTabTasksUiState(rightSearch, leftPanel.id, leftTab.id)?.search, "");

  const restored = normalizeMasterWorkspaceState(JSON.parse(JSON.stringify(rightSearch)));
  assert.equal(restored.panels.length, 2);
  assert.equal(resolveMasterTabTasksUiState(restored, rightPanel.id, rightTab.id)?.search, "right only");
  const resized = adjustMasterWorkspaceSplitRatio(restored, 0.7);
  const closed = closeMasterSplit(resized);
  assert.equal(closed.panels.length, 1);
  assert.equal(duplicateFocusedPageIntoRightPanel(closed, { panelId: "right-panel-next", tabId: "right-tasks-next" }).splitRatio, 0.5);
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

test("master tab bars default expanded, persist per panel, and keep the left preference after closing split", () => {
  const initial = createDefaultMasterWorkspaceState();
  const left = initial.panels[0];
  assert.equal(left.tabsCollapsed, undefined);

  const split = duplicateFocusedPageIntoRightPanel(initial, { panelId: "right-panel", tabId: "right-tab" });
  const right = split.panels.find((panel) => panel.side === "right");
  assert.ok(right);
  assert.equal(right.tabsCollapsed, undefined);

  const leftCollapsed = setMasterWorkspacePanelTabsCollapsed(split, left.id, true);
  const bothPreferences = setMasterWorkspacePanelTabsCollapsed(leftCollapsed, right.id, true);
  const rightExpanded = setMasterWorkspacePanelTabsCollapsed(bothPreferences, right.id, false);
  assert.equal(rightExpanded.panels.find((panel) => panel.id === left.id)?.tabsCollapsed, true);
  assert.equal(rightExpanded.panels.find((panel) => panel.id === right.id)?.tabsCollapsed, undefined);

  const rightSecondTab = createMasterTab(rightExpanded, right.id, {
    id: "right-second-tab",
    destination: { kind: "page", page: "Notes" },
    presentation: {},
  }, true);
  assert.equal(rightSecondTab.panels.find((panel) => panel.id === left.id)?.tabsCollapsed, true);
  assert.equal(rightSecondTab.panels.find((panel) => panel.id === right.id)?.tabsCollapsed, undefined);

  const storage = memoryStorage();
  assert.equal(saveMasterWorkspaceState(storage, "tab-visibility-user", rightSecondTab), true);
  const restored = loadMasterWorkspaceState(storage, "tab-visibility-user");
  assert.equal(restored.panels.find((panel) => panel.id === left.id)?.tabsCollapsed, true);
  assert.equal(restored.panels.find((panel) => panel.id === right.id)?.tabsCollapsed, undefined);

  const closed = closeMasterSplit(restored);
  assert.equal(closed.panels.length, 1);
  assert.equal(closed.panels[0].tabsCollapsed, true);
});

test("stored Master Workspace panels without tab visibility remain expanded", () => {
  const base = createDefaultMasterWorkspaceState();
  const restored = normalizeMasterWorkspaceState({
    ...base,
    panels: [{
      ...base.panels[0],
      tabs: [{ id: "legacy-tab", destination: { kind: "page", page: "Home" }, presentation: {} }],
    }],
  });
  assert.equal(restored.panels[0].tabsCollapsed, undefined);
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
