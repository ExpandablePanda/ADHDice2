import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTaskUiSettingsEnvelope,
  normalizeStoredTaskTableLayoutPreferences,
  resolveTaskTableLayoutPublishDecision,
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

  assert.equal(
    taskTableLayoutPreferencesEqual(
      { columnOrder: ["title", "due"] },
      { columnOrder: ["title", "due"], sortState: null },
    ),
    true,
  );
});

test("persisted layout application cannot echo stale local column order", () => {
  const persistedPreferences = { columnOrder: ["title", "due"] };

  assert.deepEqual(
    resolveTaskTableLayoutPublishDecision({
      isApplyingPersistedLayout: true,
      nextPreferences: { columnOrder: ["due", "title"] },
      persistedPreferences,
    }),
    { isApplyingPersistedLayout: true, shouldPublish: false },
  );

  assert.deepEqual(
    resolveTaskTableLayoutPublishDecision({
      isApplyingPersistedLayout: true,
      nextPreferences: persistedPreferences,
      persistedPreferences,
    }),
    { isApplyingPersistedLayout: false, shouldPublish: false },
  );

  assert.deepEqual(
    resolveTaskTableLayoutPublishDecision({
      isApplyingPersistedLayout: false,
      nextPreferences: { columnOrder: ["due", "title"] },
      persistedPreferences,
    }),
    { isApplyingPersistedLayout: false, shouldPublish: true },
  );

  assert.deepEqual(
    resolveTaskTableLayoutPublishDecision({
      isApplyingPersistedLayout: false,
      nextPreferences: { columnOrder: ["due", "title"], sortState: null },
      persistedPreferences: {},
    }),
    { isApplyingPersistedLayout: false, shouldPublish: true },
  );
});
