import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TASK_UI_STATE, migrateLegacyTaskUiState, normalizePersistedTaskEditorUiState } from "../src/lib/task-ui-state.ts";

test("task ui state migration repairs missing newer columns", () => {
  const migrated = migrateLegacyTaskUiState({
    ...DEFAULT_TASK_UI_STATE,
    visibleColumnsByView: {
      list: ["bucket", "due"],
      cards: ["bucket"],
      matrix: ["bucket"],
      grid: ["bucket"],
    },
  });

  for (const view of ["list", "cards", "matrix", "grid"] as const) {
    assert.equal(migrated.visibleColumnsByView[view].includes("estimated_time"), true);
    assert.equal(migrated.visibleColumnsByView[view].includes("actual_time"), true);
    assert.equal(migrated.visibleColumnsByView[view].includes("tags"), true);
    assert.equal(migrated.visibleColumnsByView[view].includes("link"), true);
    assert.equal(migrated.visibleColumnsByView[view].includes("notes"), true);
  }
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
      cards: ["fake_column_2"],
      matrix: ["notes", "fake_column_3"],
      grid: ["signal", "signal", "fake_column_4"],
    } as unknown as typeof DEFAULT_TASK_UI_STATE.visibleColumnsByView,
  });

  assert.equal(migrated.selectedBucket, DEFAULT_TASK_UI_STATE.selectedBucket);
  assert.equal(migrated.view, DEFAULT_TASK_UI_STATE.view);
  assert.deepEqual(migrated.statusFilters, []);
  assert.equal(migrated.visibleColumnsByView.list.includes("fake_column" as never), false);
  assert.equal(migrated.visibleColumnsByView.cards.includes("fake_column_2" as never), false);
  assert.equal(migrated.visibleColumnsByView.matrix.includes("fake_column_3" as never), false);
  assert.equal(migrated.visibleColumnsByView.grid.includes("fake_column_4" as never), false);
  assert.equal(new Set(migrated.visibleColumnsByView.grid).size, migrated.visibleColumnsByView.grid.length);
});

test("persisted editor state normalization rejects invalid data", () => {
  assert.deepEqual(normalizePersistedTaskEditorUiState(null), {
    isOpen: false,
    mode: "create",
    taskId: null,
  });

  assert.deepEqual(normalizePersistedTaskEditorUiState({
    isOpen: true,
    mode: "edit",
    taskId: "task-123",
  }), {
    isOpen: true,
    mode: "edit",
    taskId: "task-123",
  });
});
