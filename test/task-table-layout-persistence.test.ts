import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTaskUiSettingsEnvelope,
  normalizeStoredTaskTableLayoutPreferences,
  splitTaskUiSettingsEnvelope,
  taskTableLayoutPreferencesEqual,
} from "@/lib/task-table-layout-persistence";

test("normalizeStoredTaskTableLayoutPreferences keeps only explicit valid fields", () => {
  assert.deepEqual(
    normalizeStoredTaskTableLayoutPreferences({
      columnOrder: ["title", 3, "due"],
      sortState: { columnId: "due", optionId: "due_desc" },
    }),
    {
      columnOrder: ["title", "due"],
      sortState: { columnId: "due", optionId: "due_desc" },
    },
  );

  assert.deepEqual(
    normalizeStoredTaskTableLayoutPreferences({
      columnOrder: "bad",
      sortState: { columnId: "due" },
    }),
    {},
  );

  assert.deepEqual(
    normalizeStoredTaskTableLayoutPreferences({
      sortState: null,
    }),
    { sortState: null },
  );
});

test("splitTaskUiSettingsEnvelope preserves legacy hud-only payloads", () => {
  const legacyHudState = {
    activeHudPageId: "today",
    isHudCollapsed: false,
  };

  assert.deepEqual(
    splitTaskUiSettingsEnvelope(legacyHudState),
    {
      hudUiStateValue: legacyHudState,
      taskTableLayoutPreferences: {},
    },
  );
});

test("splitTaskUiSettingsEnvelope reads task table layout from the combined envelope", () => {
  const hudUiState = { activeHudPageId: "today" };
  const combined = buildTaskUiSettingsEnvelope(hudUiState, {
    columnOrder: ["title", "due"],
    sortState: { columnId: "due", optionId: "due_asc" },
  });

  assert.deepEqual(
    splitTaskUiSettingsEnvelope(combined),
    {
      hudUiStateValue: hudUiState,
      taskTableLayoutPreferences: {
        columnOrder: ["title", "due"],
        sortState: { columnId: "due", optionId: "due_asc" },
      },
    },
  );
});

test("taskTableLayoutPreferencesEqual compares explicit layout state only", () => {
  assert.equal(
    taskTableLayoutPreferencesEqual(
      { columnOrder: ["title", "due"], sortState: { columnId: "due", optionId: "due_desc" } },
      { columnOrder: ["title", "due"], sortState: { columnId: "due", optionId: "due_desc" } },
    ),
    true,
  );

  assert.equal(
    taskTableLayoutPreferencesEqual(
      { columnOrder: ["title", "due"] },
      { columnOrder: ["due", "title"] },
    ),
    false,
  );
});
