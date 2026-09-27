import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { Task, TaskHistory, TaskCurrentProjection } from "../src/lib/database.types.ts";
import {
  buildTaskHistoryLastHandledPresentationSummaryMap,
} from "../src/lib/task-history-last-handled.ts";
import {
  getTaskHistoryLastDonePresentation,
  type TaskHistoryStreakEntry,
} from "../src/lib/task-history.ts";
import {
  CURRENT_TASK_PROJECTION_ALGORITHM_VERSION,
  CURRENT_TASK_PROJECTION_SCHEMA_VERSION,
} from "../src/lib/task-current-projection.ts";
import { isCurrentTaskProjectionFresh } from "../src/lib/task-current-projection-freshness.ts";
import { projectionToTaskHistoryStreakSummary } from "../src/lib/task-current-projection-read.ts";

const migration = readFileSync(new URL("../supabase/patch_task_current_projection_v2_7_15_30.sql", import.meta.url), "utf8");

function historyEntry(overrides: Partial<TaskHistoryStreakEntry> = {}) {
  return {
    id: "history-1",
    task_id: "task-1",
    entry_date: "2026-09-18",
    occurrence_key: null,
    occurrence_due_on: null,
    status: "done",
    event_type: "status",
    counted_as_due_occurrence: true,
    was_completed: true,
    created_at: "2026-09-18T14:30:00.000Z",
    updated_at: "2026-09-18T14:30:00.000Z",
    ...overrides,
  } as TaskHistoryStreakEntry;
}

function projection(overrides: Partial<TaskCurrentProjection> = {}) {
  return {
    user_id: "user-1",
    entity_id: "task-1",
    entity_kind: "parent",
    validity: "valid",
    last_handled_logical_date: "2026-09-18",
    last_handled_at: "2026-09-18T14:30:00.000Z",
    last_handled_at_kind: "event_instant",
    last_done_logical_date: "2026-09-18",
    last_done_at: "2026-09-18T14:30:00.000Z",
    last_done_at_kind: "event_instant",
    canonical_task_revision: 1,
    history_sync_epoch: "epoch-1",
    logical_day_settings_revision: 1,
    projected_logical_date: "2026-09-24",
    projection_schema_version: CURRENT_TASK_PROJECTION_SCHEMA_VERSION,
    projection_algorithm_version: CURRENT_TASK_PROJECTION_ALGORITHM_VERSION,
    ...overrides,
  } as TaskCurrentProjection;
}

test("V2 presentation results distinguish real event instants from synthetic logical midnight", () => {
  assert.deepEqual(getTaskHistoryLastDonePresentation([historyEntry()], "2026-09-24"), {
    dateKey: "2026-09-18",
    timestamp: "2026-09-18T14:30:00.000Z",
    timestampKind: "event_instant",
  });
  assert.deepEqual(getTaskHistoryLastDonePresentation([historyEntry({ updated_at: "2026-09-19T14:30:00.000Z" })], "2026-09-24"), {
    dateKey: "2026-09-18",
    timestamp: "2026-09-18T00:00:00",
    timestampKind: "logical_day_presentation",
  });
});

test("V2 Last Handled presentation carries an explicit timestamp kind", () => {
  const task = { id: "task-1" } as Task;
  const history = [historyEntry({
    canonical_source: "task_state_command",
    canonical_provenance_kind: "manual",
  })] as unknown as TaskHistory[];
  assert.deepEqual(buildTaskHistoryLastHandledPresentationSummaryMap([task], history, [], [], "2026-09-24")["task-1"], {
    dateKey: "2026-09-18",
    timestamp: "2026-09-18T14:30:00.000Z",
    timestampKind: "event_instant",
  });
});

test("V2 adapter reconstructs floating logical midnight without a New York date shift", () => {
  const summary = projectionToTaskHistoryStreakSummary(projection({
    last_handled_at: null,
    last_handled_at_kind: "logical_day_presentation",
    last_done_at: null,
    last_done_at_kind: "logical_day_presentation",
  }));
  assert.equal(summary.lastHandledAt, "2026-09-18T00:00:00");
  assert.equal(summary.lastDoneAt, "2026-09-18T00:00:00");
});

test("V2 freshness accepts exact V2 rows and rejects V1 rows", () => {
  const current = {
    userId: "user-1",
    entityId: "task-1",
    entityKind: "parent" as const,
    canonicalTaskRevision: 1,
    historySyncEpoch: "epoch-1",
    logicalDaySettingsRevision: 1,
    projectedLogicalDate: "2026-09-24",
  };
  assert.equal(isCurrentTaskProjectionFresh(projection(), current), true);
  assert.equal(isCurrentTaskProjectionFresh(projection({
    projection_schema_version: "task-current-projection-schema-v1",
    projection_algorithm_version: "task-current-projection-algorithm-v1",
    last_handled_at_kind: null,
    last_done_at_kind: null,
  }), current), false);
});

test("V2 SQL widens only exact version pairs, enforces timestamp semantics, and protects V2 from downgrade", () => {
  assert.match(migration, /last_handled_at_kind text/);
  assert.match(migration, /last_done_at_kind text/);
  assert.match(migration, /projection_schema_version = 'task-current-projection-schema-v1'[\s\S]*projection_algorithm_version = 'task-current-projection-algorithm-v1'/i);
  assert.match(migration, /projection_schema_version = 'task-current-projection-schema-v2'[\s\S]*projection_algorithm_version = 'task-current-projection-algorithm-v2'/i);
  assert.match(migration, /last_handled_at_kind = 'event_instant'/i);
  assert.match(migration, /last_handled_at_kind = 'logical_day_presentation'/i);
  assert.match(migration, /last_done_at_kind = 'event_instant'/i);
  assert.match(migration, /last_done_at_kind = 'logical_day_presentation'/i);
  assert.match(migration, /would downgrade V2/i);
  assert.match(migration, /adhdice_list_task_current_projection_rebuild_candidates/i);
  assert.match(migration, /adhdice_count_task_current_projection_rebuild_candidates/i);
  assert.match(migration, /p_limit < 1 or p_limit > 10/i);
  assert.match(migration, /current_user <> 'service_role'/i);
});
