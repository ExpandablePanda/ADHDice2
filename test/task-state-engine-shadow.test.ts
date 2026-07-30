import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { adaptLegacyTaskState } from "../src/lib/task-state-engine/legacy-adapter.ts";
import {
  ALLOWED_TASK_STATE_PATCH_FIELDS,
  assertSafeProposedTaskPatch,
  runTaskStateShadow,
} from "../src/lib/task-state-engine/shadow.ts";
import { registerTaskStateShadowBridge, type TaskStateShadowWindow } from "../src/lib/task-state-engine/runtime-bridge.ts";
import { KNOWN_SHADOW_SCENARIOS, SHADOW_NOW, legacyHistory, legacyTask } from "./task-state-engine-shadow-fixtures.ts";

const ADAPTER_OPTIONS = {
  now: SHADOW_NOW,
  timezone: "America/New_York",
  logicalDayRollover: "06:00",
};

test("legacy adapter maps every recurrence shape and keeps lifecycle separate", () => {
  const cases = [
    [legacyTask({ repeat_frequency: "none" }), "none"],
    [legacyTask({ repeat_frequency: "daily", repeat_interval: 1 }), "rolling"],
    [legacyTask({ repeat_frequency: "custom", repeat_interval: 9 }), "rolling"],
    [legacyTask({ repeat_frequency: "daily_until_complete", repeat_interval: 2 }), "rolling"],
    [legacyTask({ repeat_frequency: "weekly", repeat_interval: 2, repeat_days_of_week: [1, 4] }), "weekly"],
    [legacyTask({ repeat_frequency: "monthly", repeat_day_of_month: 15 }), "monthly"],
    [legacyTask({
      repeat_frequency: "monthly",
      repeat_monthly_mode: "ordinal_weekday",
      repeat_monthly_ordinal: "last",
      repeat_monthly_weekday: 5,
    }), "monthly"],
  ] as const;
  for (const [source, expectedKind] of cases) {
    assert.equal(adaptLegacyTaskState(source, [], ADAPTER_OPTIONS).engineInput.task.recurrence.kind, expectedKind);
  }
  const archived = adaptLegacyTaskState(legacyTask({ status: "archived", due_on: null }), [], ADAPTER_OPTIONS);
  assert.equal(archived.engineInput.task.lifecycle, "archived");
  assert.equal(archived.engineInput.task.activeStatus, "unscheduled");
  assert.equal(archived.unsupported[0]?.code, "lifecycle_active_status_unavailable");
});

test("legacy History mapping preserves explicit outcome and occurrence identity", () => {
  const task = legacyTask({ id: "mapped" });
  const source = legacyHistory("mapped", "2026-07-29", "done", {
    occurrence_due_on: "2026-07-30",
    occurrence_key: "canonical-occurrence",
    counted_as_due_occurrence: true,
  });
  const result = adaptLegacyTaskState(task, [source], ADAPTER_OPTIONS);
  assert.deepEqual(result.engineInput.history[0], {
    id: source.id,
    taskId: "mapped",
    logicalDate: "2026-07-29",
    outcome: "done",
    provenance: "import",
    occurredAt: source.updated_at,
    occurrenceIdentity: "canonical-occurrence",
  });
});

test("malformed legacy values warn and adaptation never mutates source objects", () => {
  const task = legacyTask({
    id: "malformed",
    repeat_frequency: "weekly",
    repeat_interval: 0,
    repeat_days_of_week: [1, 9],
  });
  const malformed = task as unknown as Record<string, unknown>;
  malformed.due_on = "not-a-date";
  const history = [legacyHistory("malformed", "2026-07-29", "done")];
  const before = structuredClone({ task, history });
  const result = adaptLegacyTaskState(task, history, ADAPTER_OPTIONS);
  assert.ok(result.warnings.some((warning) => warning.code === "malformed_date"));
  assert.ok(result.warnings.some((warning) => warning.code === "malformed_positive_integer"));
  assert.ok(result.warnings.some((warning) => warning.code === "malformed_weekdays"));
  assert.deepEqual({ task, history }, before);
});

test("known database-shaped scenarios produce structured classified reports", () => {
  const report = runTaskStateShadow({
    ...KNOWN_SHADOW_SCENARIOS,
    now: SHADOW_NOW,
    timezone: "America/New_York",
    rolloverTime: "06:00",
    options: {
      taskIds: KNOWN_SHADOW_SCENARIOS.tasks.map((task) => task.id),
      startDate: "2026-06-01",
      endDate: "2026-08-15",
      includeTitles: false,
    },
  });
  assert.equal(report.taskCountEvaluated, 19);
  assert.equal(report.logicalDate, "2026-07-30");
  assert.ok(report.matchCount > 0);
  assert.ok(report.approvedSemanticDifferences.some((item) => item.classification === "approved semantic difference"));
  assert.ok(report.perTask.every((detail) => !("taskTitle" in detail)));
  assert.equal(report.safetyViolations.length, 0);
  assert.ok(report.proposedHistoryRowCount <= 19 * 76);
  assert.ok(report.totalExecutionTimeMs >= 0);
});

test("large overdue windows stay bounded, preserve completed days, and repeat deterministically", () => {
  const task = legacyTask({ id: "large-range", due_on: "2025-07-30", repeat_frequency: "daily" });
  const history = [
    legacyHistory("large-range", "2026-06-01", "done"),
    legacyHistory("large-range", "2026-06-15", "did_my_best"),
  ];
  const run = (startDate: string) => runTaskStateShadow({
    tasks: [task],
    history,
    now: SHADOW_NOW,
    timezone: "America/New_York",
    rolloverTime: "06:00",
    options: { taskIds: [task.id], startDate, endDate: "2026-07-30", includeMatches: true },
  });
  const recent = run("2026-06-01");
  const year = run("2025-07-30");
  const repeated = run("2026-06-01");
  assert.equal(recent.perTask[0]?.engine.calendar["2026-06-01"], "done");
  assert.equal(recent.perTask[0]?.engine.calendar["2026-06-15"], "did_my_best");
  assert.equal(recent.perTask[0]?.engine.calendar["2026-07-30"], "open");
  assert.ok(recent.proposedHistoryRowCount <= 60);
  assert.ok(year.proposedHistoryRowCount <= 366);
  assert.deepEqual(
    { ...recent.perTask[0], durationMs: 0 },
    { ...repeated.perTask[0], durationMs: 0 },
  );
  assert.deepEqual(recent.proposedTaskPatchKeys, repeated.proposedTaskPatchKeys);
});

test("runtime bridge is development-only and never runs automatically", () => {
  const productionTarget: TaskStateShadowWindow = {
    __ADHDICE_RUN_TASK_STATE_SHADOW__: () => { throw new Error("must be removed"); },
  };
  registerTaskStateShadowBridge({
    environment: "production",
    getSnapshot: () => { throw new Error("must not read"); },
    target: productionTarget,
  });
  assert.equal(productionTarget.__ADHDICE_RUN_TASK_STATE_SHADOW__, undefined);

  let snapshotReads = 0;
  const developmentTarget: TaskStateShadowWindow = {};
  const output = {
    groupCollapsed() {},
    groupEnd() {},
    info() {},
    table() {},
    warn() {},
  };
  const cleanup = registerTaskStateShadowBridge({
    environment: "development",
    getSnapshot: () => {
      snapshotReads += 1;
      return {
        tasks: [legacyTask({ id: "runtime" })],
        history: [],
        now: SHADOW_NOW,
        timezone: "America/New_York",
        rolloverTime: "06:00",
      };
    },
    output,
    target: developmentTarget,
  });
  assert.equal(snapshotReads, 0);
  assert.equal(typeof developmentTarget.__ADHDICE_RUN_TASK_STATE_SHADOW__, "function");
  developmentTarget.__ADHDICE_RUN_TASK_STATE_SHADOW__?.();
  assert.equal(snapshotReads, 1);
  assert.ok(developmentTarget.__ADHDICE_LATEST_TASK_STATE_SHADOW__);
  cleanup();
  assert.equal(developmentTarget.__ADHDICE_RUN_TASK_STATE_SHADOW__, undefined);
});

test("shadow modules have no database, reward, rollover, or mutation imports", async () => {
  for (const path of [
    "src/lib/task-state-engine/legacy-adapter.ts",
    "src/lib/task-state-engine/shadow.ts",
    "src/lib/task-state-engine/runtime-bridge.ts",
  ]) {
    const source = await readFile(path, "utf8");
    assert.doesNotMatch(source, /from ["'][^"']*(supabase|useTask|reward|rollover|archive|trash|delete|restore)/i);
    assert.doesNotMatch(source, /\.(insert|update|upsert|delete|rpc)\s*\(/);
  }
});

test("patch allowlist rejects lifecycle, content, placement, and deletion fields", () => {
  assert.deepEqual([...ALLOWED_TASK_STATE_PATCH_FIELDS].sort(), [
    "activeOccurrenceDueOn",
    "activeStatusLogicalDate",
    "completedAt",
    "dueOn",
    "recurrenceCursor",
    "satisfiedOccurrenceIdentity",
    "status",
  ]);
  assert.doesNotThrow(() => assertSafeProposedTaskPatch({ status: "missed", dueOn: "2026-07-30" }));
  for (const field of ["trashed_at", "archived_at", "deleted_at", "title", "description", "list_id", "folder_id", "notes"]) {
    assert.throws(() => assertSafeProposedTaskPatch({ [field]: true }), new RegExp(field));
  }
});

test("archived and Trashed fixtures are inspected without mutation proposals", () => {
  const taskIds = ["archived", "trashed"];
  const report = runTaskStateShadow({
    ...KNOWN_SHADOW_SCENARIOS,
    now: SHADOW_NOW,
    timezone: "America/New_York",
    rolloverTime: "06:00",
    options: { taskIds, startDate: "2026-07-29", endDate: "2026-07-30" },
  });
  assert.equal(report.taskCountEvaluated, 2);
  assert.deepEqual(report.proposedTaskPatchKeys, []);
  assert.equal(report.proposedHistoryRowCount, 0);
  assert.equal(report.safetyViolations.length, 0);
});
