import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TASK_UI_STATE, DEFAULT_TASK_WORKSPACE_TAB_ID, isReportTaskWorkspaceTab, migrateLegacyTaskUiState, normalizeTaskWorkspaceTabsState, reorderTaskWorkspaceTabToIndex, reorderTaskWorkspaceTabs, VALID_TASK_VIEWS } from "../src/lib/task-ui-state.ts";

test("calendar is a valid task view with independent include-steps defaults", () => {
  assert.deepEqual(VALID_TASK_VIEWS, ["table", "list", "cards", "matrix", "grid", "calendar"]);
  assert.equal(DEFAULT_TASK_UI_STATE.includeStepsByView.calendar, false);
  assert.ok(DEFAULT_TASK_UI_STATE.visibleColumnsByView.calendar.length > 0);
});

test("task ui state migration repairs missing newer columns", () => {
  const migrated = migrateLegacyTaskUiState({
    ...DEFAULT_TASK_UI_STATE,
    visibleColumnsByView: {
      list: ["bucket", "due"],
      table: ["bucket", "due"],
      cards: ["bucket"],
      matrix: ["bucket"],
      grid: ["bucket"],
    },
  });

  for (const view of ["table", "list", "cards", "matrix", "grid", "calendar"] as const) {
    assert.equal(migrated.visibleColumnsByView[view].includes("estimated_time"), true);
    assert.equal(migrated.visibleColumnsByView[view].includes("actual_time"), true);
    assert.equal(migrated.visibleColumnsByView[view].includes("tags"), true);
    assert.equal(migrated.visibleColumnsByView[view].includes("link"), true);
    assert.equal(migrated.visibleColumnsByView[view].includes("notes"), true);
  }
  assert.equal(migrated.visibleColumnsByView.table.includes("date_completed"), true);
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
      grid: ["signal", "signal", "fake_column_4"],
    } as unknown as typeof DEFAULT_TASK_UI_STATE.visibleColumnsByView,
  });

  assert.equal(migrated.selectedBucket, DEFAULT_TASK_UI_STATE.selectedBucket);
  assert.equal(migrated.view, DEFAULT_TASK_UI_STATE.view);
  assert.deepEqual(migrated.statusFilters, []);
  assert.equal(migrated.visibleColumnsByView.table.includes("fake_column_table" as never), false);
  assert.equal(migrated.visibleColumnsByView.list.includes("fake_column" as never), false);
  assert.equal(migrated.visibleColumnsByView.cards.includes("fake_column_2" as never), false);
  assert.equal(migrated.visibleColumnsByView.matrix.includes("fake_column_3" as never), false);
  assert.equal(migrated.visibleColumnsByView.grid.includes("fake_column_4" as never), false);
  assert.equal(new Set(migrated.visibleColumnsByView.grid).size, migrated.visibleColumnsByView.grid.length);
});

test("task ui state migration removes the retired Trash status filter", () => {
  const migrated = migrateLegacyTaskUiState({
    ...DEFAULT_TASK_UI_STATE,
    statusFilters: ["pending", "trashed"],
  });

  assert.deepEqual(migrated.statusFilters, ["pending"]);
});

test("task ui state migration maps legacy list columns onto table view", () => {
  const migrated = migrateLegacyTaskUiState({
    ...DEFAULT_TASK_UI_STATE,
    visibleColumnsByView: {
      list: ["bucket", "due"],
      cards: ["bucket"],
      matrix: ["bucket"],
      grid: ["bucket"],
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
