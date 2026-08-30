import test from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  buildTaskUiSettingsEnvelope,
  normalizeStoredTaskTableLayoutPreferences,
  normalizeTaskUiSettingsSyncMetadata,
  resolveTaskTableLayoutPublishDecision,
  resolveTaskUiSettingsReconciliation,
  splitTaskUiSettingsEnvelope,
  taskTableLayoutPreferencesEqual,
} from "@/lib/task-table-layout-persistence";

const taskUiStateSource = readFileSync(
  new URL("../src/hooks/useTaskUiState.ts", import.meta.url),
  "utf8",
);

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
      hasHudUiState: true,
      hasTaskTableLayout: false,
      hudUiStateValue: legacyHudState,
      syncMetadata: { hudUpdatedAt: null, taskTableLayoutUpdatedAt: null },
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
      hasHudUiState: true,
      hasTaskTableLayout: true,
      hudUiStateValue: hudUiState,
      syncMetadata: { hudUpdatedAt: null, taskTableLayoutUpdatedAt: null },
      taskTableLayoutPreferences: {
        columnOrder: ["title", "due"],
        sortState: { columnId: "due", optionId: "due_asc" },
      },
    },
  );
});

test("legacy cloud timestamps provide freshness for both slices", () => {
  assert.deepEqual(
    normalizeTaskUiSettingsSyncMetadata({}, "2026-08-30T10:00:00.000Z"),
    {
      hudUpdatedAt: "2026-08-30T10:00:00.000Z",
      taskTableLayoutUpdatedAt: "2026-08-30T10:00:00.000Z",
    },
  );
});

function snapshot({
  hud,
  table,
  hudUpdatedAt,
  tableUpdatedAt,
  hasHud = true,
  hasTable = true,
}: {
  hud: unknown;
  table: Parameters<typeof buildTaskUiSettingsEnvelope>[1];
  hudUpdatedAt: string | null;
  tableUpdatedAt: string | null;
  hasHud?: boolean;
  hasTable?: boolean;
}) {
  return {
    hasHudUiState: hasHud,
    hasTaskTableLayout: hasTable,
    hudUiStateValue: hud,
    syncMetadata: { hudUpdatedAt, taskTableLayoutUpdatedAt: tableUpdatedAt },
    taskTableLayoutPreferences: table,
  };
}

test("independent newer HUD and Table slices merge without clobbering either", () => {
  const result = resolveTaskUiSettingsReconciliation({
    local: snapshot({
      hud: { page: "device-b" },
      table: { columnOrder: ["title", "due"] },
      hudUpdatedAt: "2026-08-30T10:05:00.000Z",
      tableUpdatedAt: "2026-08-30T09:00:00.000Z",
    }),
    remote: snapshot({
      hud: { page: "device-a" },
      table: { columnOrder: ["due", "title"] },
      hudUpdatedAt: "2026-08-30T10:00:00.000Z",
      tableUpdatedAt: "2026-08-30T10:01:00.000Z",
    }),
  });

  assert.deepEqual(result.hudUiStateValue, { page: "device-b" });
  assert.deepEqual(result.taskTableLayoutPreferences, { columnOrder: ["due", "title"] });
  assert.equal(result.shouldPush, true);
});

test("a newer remote Table slice beats a newer local HUD slice only for Table", () => {
  const result = resolveTaskUiSettingsReconciliation({
    local: snapshot({
      hud: { page: "local" },
      table: { columnOrder: ["title", "due"] },
      hudUpdatedAt: "2026-08-30T10:05:00.000Z",
      tableUpdatedAt: "2026-08-30T09:00:00.000Z",
    }),
    remote: snapshot({
      hud: { page: "remote-stale" },
      table: { columnOrder: ["due", "title"] },
      hudUpdatedAt: "2026-08-30T09:00:00.000Z",
      tableUpdatedAt: "2026-08-30T10:01:00.000Z",
    }),
  });

  assert.deepEqual(result.hudUiStateValue, { page: "local" });
  assert.deepEqual(result.taskTableLayoutPreferences, { columnOrder: ["due", "title"] });
  assert.equal(result.shouldPush, true);
});

test("a newer local Table slice can push while retaining a newer remote HUD slice", () => {
  const result = resolveTaskUiSettingsReconciliation({
    local: snapshot({
      hud: { page: "local-stale" },
      table: { sortState: { columnId: "due", optionId: "due_desc" } },
      hudUpdatedAt: "2026-08-30T09:00:00.000Z",
      tableUpdatedAt: "2026-08-30T10:05:00.000Z",
    }),
    remote: snapshot({
      hud: { page: "remote-new" },
      table: { sortState: { columnId: "title", optionId: "title_asc" } },
      hudUpdatedAt: "2026-08-30T10:01:00.000Z",
      tableUpdatedAt: "2026-08-30T10:00:00.000Z",
    }),
  });

  assert.deepEqual(result.hudUiStateValue, { page: "remote-new" });
  assert.deepEqual(result.taskTableLayoutPreferences, { sortState: { columnId: "due", optionId: "due_desc" } });
  assert.equal(result.shouldPush, true);
});

test("sort direction, sort column, and column order round-trip through the cloud envelope", () => {
  const preferences = {
    columnOrder: ["status_icon", "title", "due"],
    sortState: { columnId: "due", optionId: "due_asc" },
  };
  const envelope = buildTaskUiSettingsEnvelope({ page: "today" }, preferences, {
    hudUpdatedAt: "2026-08-30T10:00:00.000Z",
    taskTableLayoutUpdatedAt: "2026-08-30T10:02:00.000Z",
  });

  const parsed = splitTaskUiSettingsEnvelope(envelope);
  assert.deepEqual(parsed.taskTableLayoutPreferences, preferences);
  assert.deepEqual(parsed.syncMetadata, {
    hudUpdatedAt: "2026-08-30T10:00:00.000Z",
    taskTableLayoutUpdatedAt: "2026-08-30T10:02:00.000Z",
  });
});

test("Task UI cloud sync reads remote state before independently arbitrating HUD and Table slices", () => {
  assert.match(taskUiStateSource, /HUD_UI_UPDATED_AT_STORAGE_KEY/);
  assert.match(taskUiStateSource, /TASK_TABLE_LAYOUT_UPDATED_AT_STORAGE_KEY/);
  assert.match(taskUiStateSource, /hudUpdatedAt/);
  assert.match(taskUiStateSource, /taskTableLayoutUpdatedAt/);
  assert.match(taskUiStateSource, /resolveTaskUiSettingsReconciliation/);
  assert.doesNotMatch(taskUiStateSource, /isRemoteNewerThanLocal/);

  const syncSource = taskUiStateSource.slice(taskUiStateSource.indexOf("const syncTaskUiSettingsToCloud"));
  assert.ok(syncSource.indexOf(".select(") < syncSource.indexOf("resolveTaskUiSettingsReconciliation"));
  assert.ok(syncSource.indexOf("resolveTaskUiSettingsReconciliation") < syncSource.indexOf(".upsert("));
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
