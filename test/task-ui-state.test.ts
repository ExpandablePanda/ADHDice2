import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { closeTaskWorkspaceTabState, createTaskWorkspaceTabState, DEFAULT_TASK_UI_STATE, DEFAULT_TASK_WORKSPACE_TABS_STATE, DEFAULT_TASK_WORKSPACE_TAB_ID, isReportTaskWorkspaceTab, migrateLegacyTaskUiState, normalizeTaskWorkspaceTabsState, renameTaskWorkspaceTabState, reorderTaskWorkspaceTabToIndex, reorderTaskWorkspaceTabs, resolveActiveTaskUiState, resolveActiveTaskWorkspaceTab, updateActiveTaskUiState, VALID_TASK_VIEWS } from "../src/lib/task-ui-state.ts";

test("calendar is a valid task view with independent include-steps defaults", () => {
  assert.deepEqual(VALID_TASK_VIEWS, ["table", "list", "cards", "matrix", "calendar"]);
  assert.equal(DEFAULT_TASK_UI_STATE.includeStepsByView.calendar, false);
  assert.ok(DEFAULT_TASK_UI_STATE.visibleColumnsByView.calendar.length > 0);
});

test("useTaskUiState has no retired Task Grid local-storage path", async () => {
  const source = await readFile(new URL("../src/hooks/useTaskUiState.ts", import.meta.url), "utf8");

  assert.doesNotMatch(source, /TASK_GRID_STORAGE_KEY|taskGridLayout|TaskGrid/);
});

test("task ui state migration repairs missing newer columns", () => {
  const migrated = migrateLegacyTaskUiState({
    ...DEFAULT_TASK_UI_STATE,
    visibleColumnsByView: {
      list: ["bucket", "due"],
      table: ["bucket", "due"],
      cards: ["bucket"],
      matrix: ["bucket"],
    },
  });

  for (const view of ["table", "list", "cards", "matrix", "calendar"] as const) {
    assert.equal(migrated.visibleColumnsByView[view].includes("estimated_time"), true);
    assert.equal(migrated.visibleColumnsByView[view].includes("actual_time"), true);
    assert.equal(migrated.visibleColumnsByView[view].includes("tags"), true);
    assert.equal(migrated.visibleColumnsByView[view].includes("link"), true);
    assert.equal(migrated.visibleColumnsByView[view].includes("notes"), true);
  }
  assert.equal(migrated.visibleColumnsByView.table.includes("date_completed"), true);
  assert.equal(migrated.visibleColumnsByView.table.includes("task_type"), true);
  assert.deepEqual(migrated.visibleColumnsByView.table.slice(0, 2), ["bucket", "due"]);
  assert.equal(migrated.visibleColumnsByView.table.includes("streak"), false);
  assert.equal(migrated.visibleColumnsByView.list.includes("date_completed"), false);
  assert.equal(migrated.visibleColumnsByView.list.includes("streak"), false);
  assert.equal(migrated.includeStepsByView.calendar, false);
});

test("legacy task workspace tabs preserve existing state while adding calendar defaults", () => {
  const normalized = normalizeTaskWorkspaceTabsState({
    activeTabId: "workspace-2",
    tabs: [
      {
        id: "workspace-1",
        isRailHidden: true,
        label: "Planning",
        taskUiState: {
          ...DEFAULT_TASK_UI_STATE,
          includeStepsByView: { ...DEFAULT_TASK_UI_STATE.includeStepsByView, list: true },
          search: "Vera",
          selectedBucket: "list:planning",
          view: "list",
        },
      },
      {
        id: "workspace-2",
        isRailHidden: false,
        label: "Calendar",
        taskUiState: {
          ...DEFAULT_TASK_UI_STATE,
          includeStepsByView: { ...DEFAULT_TASK_UI_STATE.includeStepsByView, calendar: true },
          view: "calendar",
        },
      },
    ],
  });

  assert.equal(normalized.tabs.length, 2);
  assert.equal(normalized.activeTabId, "workspace-2");
  assert.equal(normalized.tabs[0]?.taskUiState.search, "Vera");
  assert.equal(normalized.tabs[0]?.taskUiState.selectedBucket, "list:planning");
  assert.equal(normalized.tabs[0]?.taskUiState.includeStepsByView.list, true);
  assert.equal(normalized.tabs[1]?.taskUiState.view, "calendar");
  assert.equal(normalized.tabs[1]?.taskUiState.includeStepsByView.calendar, true);
});

test("task ui state migration drops invalid columns and repairs bucket/view/status filters", () => {
  const migrated = migrateLegacyTaskUiState({
    ...DEFAULT_TASK_UI_STATE,
    selectedBucket: "",
    // @ts-expect-error testing invalid persisted value
    view: "kanban",
    // @ts-expect-error testing invalid persisted value
    statusFilters: "pending",
    visibleColumnsByView: {
      list: ["bucket", "fake_column", "bucket", "due"],
      table: ["bucket", "fake_column_table", "due"],
      cards: ["fake_column_2"],
      matrix: ["notes", "fake_column_3"],
    } as unknown as typeof DEFAULT_TASK_UI_STATE.visibleColumnsByView,
  });

  assert.equal(migrated.selectedBucket, DEFAULT_TASK_UI_STATE.selectedBucket);
  assert.equal(migrated.view, DEFAULT_TASK_UI_STATE.view);
  assert.deepEqual(migrated.statusFilters, []);
  assert.equal(migrated.visibleColumnsByView.table.includes("fake_column_table" as never), false);
  assert.equal(migrated.visibleColumnsByView.list.includes("fake_column" as never), false);
  assert.equal(migrated.visibleColumnsByView.cards.includes("fake_column_2" as never), false);
  assert.equal(migrated.visibleColumnsByView.matrix.includes("fake_column_3" as never), false);
});

test("legacy Upcoming status filters normalize to Not Due without duplication", () => {
  const migrated = migrateLegacyTaskUiState({
    ...DEFAULT_TASK_UI_STATE,
    statusFilters: ["upcoming", "not_due", "pending"],
  });

  assert.deepEqual(migrated.statusFilters, ["not_due", "pending"]);
});

test("task ui state migration removes the retired Trash status filter", () => {
  const migrated = migrateLegacyTaskUiState({
    ...DEFAULT_TASK_UI_STATE,
    statusFilters: ["pending", "trashed"],
  });

  assert.deepEqual(migrated.statusFilters, ["pending"]);
});

test("task ui state migration moves the retired Attention surface into the Attention list", () => {
  const migrated = migrateLegacyTaskUiState({
    ...DEFAULT_TASK_UI_STATE,
    selectedBucket: "today",
    tasksSurface: "attention",
  });

  assert.equal(migrated.tasksSurface, "tasks");
  assert.equal(migrated.selectedBucket, "attention");
});

test("task ui state migration maps legacy list columns onto table view", () => {
  const migrated = migrateLegacyTaskUiState({
    ...DEFAULT_TASK_UI_STATE,
    visibleColumnsByView: {
      list: ["bucket", "due"],
      cards: ["bucket"],
      matrix: ["bucket"],
    } as unknown as typeof DEFAULT_TASK_UI_STATE.visibleColumnsByView,
  });

  assert.equal(migrated.visibleColumnsByView.table.includes("bucket"), true);
  assert.equal(migrated.visibleColumnsByView.table.includes("due"), true);
  assert.equal(migrated.visibleColumnsByView.table.includes("streak"), false);
});

test("task ui state migration preserves shared Table filters and defaults legacy tabs empty", () => {
  assert.deepEqual(migrateLegacyTaskUiState({}).tableColumnFilters, {
    priority: [],
    repeat: [],
    taskType: [],
    text: {},
  });

  const migrated = migrateLegacyTaskUiState({
    ...DEFAULT_TASK_UI_STATE,
    tableColumnFilters: {
      priority: ["5"],
      repeat: ["weekly"],
      text: { title: "Family" },
    },
  });
  assert.deepEqual(migrated.tableColumnFilters, {
    priority: ["5"],
    repeat: ["weekly"],
    taskType: [],
    text: { title: "Family" },
  });
});

test("default task ui state includes streak only for new table layouts", () => {
  assert.equal(DEFAULT_TASK_UI_STATE.visibleColumnsByView.table.includes("streak"), true);
  assert.equal(DEFAULT_TASK_UI_STATE.visibleColumnsByView.list.includes("streak"), false);
  assert.equal(DEFAULT_TASK_UI_STATE.visibleColumnsByView.cards.includes("streak"), false);
});

test("task workspace migration drops the legacy report tab and preserves report as the active surface", () => {
  const normalized = normalizeTaskWorkspaceTabsState({
    activeTabId: "workspace-report",
    tabs: [
      {
        id: "workspace-1",
        isRailHidden: false,
        kind: "tasks",
        label: "Tab 1",
        taskUiState: {
          ...DEFAULT_TASK_UI_STATE,
          tasksSurface: "tasks",
        },
      },
      {
        id: "workspace-report",
        isRailHidden: true,
        kind: "report",
        label: "Report",
        taskUiState: {
          ...DEFAULT_TASK_UI_STATE,
          tasksSurface: "tasks",
        },
      },
    ],
  });

  assert.equal(normalized.tabs.length, 1);
  assert.equal(normalized.activeTabId, "workspace-1");
  assert.equal(normalized.tabs[0].taskUiState.tasksSurface, "report");
});

test("task workspace migration rebuilds a task tab when a legacy report tab was the only saved tab", () => {
  const normalized = normalizeTaskWorkspaceTabsState({
    activeTabId: "workspace-report",
    tabs: [
      {
        id: "workspace-report",
        isRailHidden: true,
        kind: "report",
        label: "Report",
        taskUiState: DEFAULT_TASK_UI_STATE,
      },
    ],
  });

  assert.equal(normalized.tabs.length, 1);
  assert.equal(normalized.activeTabId, DEFAULT_TASK_WORKSPACE_TAB_ID);
  assert.equal(normalized.tabs[0].taskUiState.tasksSurface, "report");
});

test("report workspace tabs are identified by their active surface", () => {
  assert.equal(isReportTaskWorkspaceTab({
    id: "workspace-report",
    isRailHidden: false,
    label: "Report",
    taskUiState: {
      ...DEFAULT_TASK_UI_STATE,
      tasksSurface: "report",
    },
  }), true);

  assert.equal(isReportTaskWorkspaceTab({
    id: "workspace-1",
    isRailHidden: false,
    label: "Tab 1",
    taskUiState: {
      ...DEFAULT_TASK_UI_STATE,
      tasksSurface: "tasks",
    },
  }), false);
});

test("task ui state migration preserves the Brainstorm surface", () => {
  const migrated = migrateLegacyTaskUiState({ ...DEFAULT_TASK_UI_STATE, tasksSurface: "brainstorm" });
  assert.equal(migrated.tasksSurface, "brainstorm");
});

test("task workspace tab reorder preserves active tab id", () => {
  const state = normalizeTaskWorkspaceTabsState({
    activeTabId: "workspace-2",
    tabs: [
      {
        id: "workspace-1",
        isRailHidden: false,
        kind: "tasks",
        label: "Tab 1",
        taskUiState: DEFAULT_TASK_UI_STATE,
      },
      {
        id: "workspace-2",
        isRailHidden: true,
        kind: "tasks",
        label: "Tab 2",
        taskUiState: {
          ...DEFAULT_TASK_UI_STATE,
          selectedBucket: "focus",
        },
      },
      {
        id: "workspace-3",
        isRailHidden: false,
        kind: "tasks",
        label: "Tab 3",
        taskUiState: {
          ...DEFAULT_TASK_UI_STATE,
          selectedBucket: "priority_5",
        },
      },
    ],
  });

  const movedLeft = reorderTaskWorkspaceTabs(state, "workspace-2", -1);
  assert.deepEqual(movedLeft.tabs.map((tab) => tab.id), ["workspace-2", "workspace-1", "workspace-3"]);
  assert.equal(movedLeft.activeTabId, "workspace-2");

  const movedRight = reorderTaskWorkspaceTabs(movedLeft, "workspace-2", 1);
  assert.deepEqual(movedRight.tabs.map((tab) => tab.id), ["workspace-1", "workspace-2", "workspace-3"]);
  assert.equal(movedRight.activeTabId, "workspace-2");
  assert.equal(reorderTaskWorkspaceTabs(movedRight, "workspace-1", -1), movedRight);

  const draggedToEnd = reorderTaskWorkspaceTabToIndex(state, "workspace-1", 2);
  assert.deepEqual(draggedToEnd.tabs.map((tab) => tab.id), ["workspace-2", "workspace-3", "workspace-1"]);
  assert.equal(draggedToEnd.activeTabId, "workspace-2");
});

test("nested task tab create, rename, reorder, and close operations stay within their workspace snapshot", () => {
  const firstWorkspace = normalizeTaskWorkspaceTabsState({
    ...DEFAULT_TASK_WORKSPACE_TABS_STATE,
    tabs: [
      { ...DEFAULT_TASK_WORKSPACE_TABS_STATE.tabs[0], id: "workspace-a-1", label: "A1" },
    ],
    activeTabId: "workspace-a-1",
  });
  const secondWorkspace = normalizeTaskWorkspaceTabsState(firstWorkspace);
  const created = createTaskWorkspaceTabState(firstWorkspace, {
    ...firstWorkspace.tabs[0],
    id: "workspace-a-2",
    label: "Tab 2",
  });
  const renamed = renameTaskWorkspaceTabState(created, "workspace-a-2", "Research");
  const reordered = reorderTaskWorkspaceTabToIndex(renamed, "workspace-a-2", 0);
  const closed = closeTaskWorkspaceTabState(reordered, "workspace-a-1");

  assert.deepEqual(closed.tabs.map((tab) => [tab.id, tab.label]), [["workspace-a-2", "Research"]]);
  assert.equal(closed.activeTabId, "workspace-a-2");
  assert.deepEqual(secondWorkspace.tabs.map((tab) => [tab.id, tab.label]), [["workspace-a-1", "A1"]]);
  assert.equal(secondWorkspace.activeTabId, "workspace-a-1");
});

test("task presentation adapters resolve independent workspace snapshots", () => {
  const first = normalizeTaskWorkspaceTabsState({
    activeTabId: "tasks-a",
    tabs: [{
      ...DEFAULT_TASK_WORKSPACE_TABS_STATE.tabs[0],
      id: "tasks-a",
      taskUiState: {
        ...DEFAULT_TASK_UI_STATE,
        quickFilters: ["today"],
        view: "list",
        listSortBySurface: { "tasks:home": { field: "title", direction: "asc" } },
      },
    }],
  });
  const second = normalizeTaskWorkspaceTabsState({
    activeTabId: "tasks-b",
    tabs: [{
      ...DEFAULT_TASK_WORKSPACE_TABS_STATE.tabs[0],
      id: "tasks-b",
      taskUiState: {
        ...DEFAULT_TASK_UI_STATE,
        quickFilters: ["urgent"],
        view: "cards",
        listSortBySurface: { "tasks:home": { field: "priority", direction: "desc" } },
      },
    }],
  });

  assert.equal(resolveActiveTaskWorkspaceTab(first).id, "tasks-a");
  assert.deepEqual(resolveActiveTaskUiState(first).quickFilters, ["today"]);
  assert.equal(resolveActiveTaskUiState(first).view, "list");
  assert.deepEqual(resolveActiveTaskUiState(first).listSortBySurface["tasks:home"], { field: "title", direction: "asc" });
  assert.equal(resolveActiveTaskWorkspaceTab(second).id, "tasks-b");
  assert.deepEqual(resolveActiveTaskUiState(second).quickFilters, ["urgent"]);
  assert.equal(resolveActiveTaskUiState(second).view, "cards");
  assert.deepEqual(resolveActiveTaskUiState(second).listSortBySurface["tasks:home"], { field: "priority", direction: "desc" });

  const firstUpdated = updateActiveTaskUiState(first, (current) => ({ ...current, search: "first only" }));
  assert.equal(resolveActiveTaskUiState(firstUpdated).search, "first only");
  assert.equal(resolveActiveTaskUiState(second).search, "");
  assert.equal(first.tabs[0].taskUiState.search, "");
  assert.equal(second.tabs[0].taskUiState.search, "");
});

test("valid active task tab updates only the intended tab and preserves others", () => {
  const firstTab = {
    ...DEFAULT_TASK_WORKSPACE_TABS_STATE.tabs[0],
    id: "tasks-a",
    taskUiState: { ...DEFAULT_TASK_UI_STATE, search: "initial" },
  };
  const activeTab = {
    ...DEFAULT_TASK_WORKSPACE_TABS_STATE.tabs[0],
    id: "tasks-active",
    taskUiState: { ...DEFAULT_TASK_UI_STATE, selectedBucket: "focus" },
  };
  const thirdTab = { ...DEFAULT_TASK_WORKSPACE_TABS_STATE.tabs[0], id: "tasks-c" };
  const snapshot = {
    ...DEFAULT_TASK_WORKSPACE_TABS_STATE,
    activeTabId: activeTab.id,
    tabs: [firstTab, activeTab, thirdTab],
  };

  const withSearch = updateActiveTaskUiState(snapshot, (current) => ({ ...current, search: "latest" }));
  const withBucket = updateActiveTaskUiState(withSearch, (current) => ({ ...current, selectedBucket: `${current.selectedBucket}:next` }));

  assert.equal(withBucket.tabs[1].taskUiState.search, "latest");
  assert.equal(withBucket.tabs[1].taskUiState.selectedBucket, "focus:next");
  assert.equal(withBucket.tabs[0], firstTab);
  assert.equal(withBucket.tabs[2], thirdTab);
  assert.equal(snapshot.tabs[1], activeTab);
  assert.equal(snapshot.tabs[1].taskUiState.search, "");
  assert.equal(snapshot.tabs[1].taskUiState.selectedBucket, "focus");
  assert.equal(updateActiveTaskUiState(snapshot, (current) => current), snapshot);
});

test("invalid active task tab reads fall back to the existing first tab", () => {
  const firstTab = {
    ...DEFAULT_TASK_WORKSPACE_TABS_STATE.tabs[0],
    id: "tasks-first",
    taskUiState: { ...DEFAULT_TASK_UI_STATE, view: "matrix" as const },
  };
  const snapshot = {
    ...DEFAULT_TASK_WORKSPACE_TABS_STATE,
    activeTabId: "missing-tab",
    tabs: [firstTab],
  };

  assert.equal(resolveActiveTaskWorkspaceTab(snapshot), firstTab);
  assert.equal(resolveActiveTaskUiState(snapshot).view, "matrix");
});

test("invalid active task tab updates are a no-op", () => {
  const snapshot = {
    ...DEFAULT_TASK_WORKSPACE_TABS_STATE,
    activeTabId: "missing-tab",
    tabs: [{ ...DEFAULT_TASK_WORKSPACE_TABS_STATE.tabs[0], id: "tasks-first" }],
  };

  assert.equal(updateActiveTaskUiState(snapshot, (current) => ({ ...current, search: "ignored" })), snapshot);
});

test("empty task workspace tab updates are a no-op", () => {
  const snapshot = { ...DEFAULT_TASK_WORKSPACE_TABS_STATE, tabs: [] };

  assert.equal(resolveActiveTaskWorkspaceTab(snapshot), DEFAULT_TASK_WORKSPACE_TABS_STATE.tabs[0]);
  assert.equal(updateActiveTaskUiState(snapshot, (current) => ({ ...current, search: "ignored" })), snapshot);
});

test("single-tab task presentation behavior and hook wiring remain intact", async () => {
  const singlePanel = {
    ...DEFAULT_TASK_WORKSPACE_TABS_STATE,
    tabs: [{
      ...DEFAULT_TASK_WORKSPACE_TABS_STATE.tabs[0],
      taskUiState: { ...DEFAULT_TASK_UI_STATE, view: "list" as const },
    }],
  };
  assert.equal(resolveActiveTaskUiState(singlePanel).view, "list");
  const updated = updateActiveTaskUiState(singlePanel, (current) => ({ ...current, selectedBucket: "focus" }));
  assert.equal(updated.tabs.length, 1);
  assert.equal(resolveActiveTaskUiState(updated).view, "list");
  assert.equal(resolveActiveTaskUiState(updated).selectedBucket, "focus");

  const source = await readFile(new URL("../src/hooks/useTaskUiState.ts", import.meta.url), "utf8");
  assert.match(source, /resolveActiveTaskWorkspaceTab\(taskWorkspaceTabsState\)/);
  assert.match(source, /resolveActiveTaskUiState\(taskWorkspaceTabsState\)/);
  assert.match(source, /updateActiveTaskUiState\(current, updater\)/);
});
