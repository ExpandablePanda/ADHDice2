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

test("legacy adapter diagnoses absent task-level recurrence metadata and accepts it when available", () => {
  const absent = adaptLegacyTaskState(
    legacyTask({ id: "metadata-absent", repeat_frequency: "daily" }),
    [],
    ADAPTER_OPTIONS,
  );
  assert.ok(absent.unsupported.some((item) => item.code === "recurrence_cursor_unavailable"));
  assert.ok(absent.unsupported.some((item) => item.code === "satisfied_occurrence_identity_unavailable"));

  const available = adaptLegacyTaskState({
    ...legacyTask({ id: "metadata-available", repeat_frequency: "daily" }),
    recurrence_cursor: "2026-07-29",
    satisfied_occurrence_identity: "task:metadata-available:occurrence:2026-07-29",
  }, [], ADAPTER_OPTIONS);
  assert.equal(available.engineInput.task.recurrenceCursor, "2026-07-29");
  assert.equal(
    available.engineInput.task.satisfiedOccurrenceIdentity,
    "task:metadata-available:occurrence:2026-07-29",
  );
  assert.equal(available.unsupported.some((item) => item.code.includes("_unavailable")), false);
});

test("Unscheduled normalization avoids per-date engine-defect noise", () => {
  const task = legacyTask({ id: "normalized-unscheduled", status: "pending", due_on: null, repeat_frequency: "none" });
  const report = runTaskStateShadow({
    tasks: [task],
    history: [],
    now: "2026-07-31T14:00:00.000Z",
    timezone: "America/New_York",
    rolloverTime: "06:00",
    options: { taskIds: [task.id], startDate: "2026-06-01", endDate: "2026-09-01" },
  });
  assert.ok(report.approvedSemanticDifferences.some((item) => item.field === "activeStatus"));
  assert.ok(report.representationOnlyDifferences.length > 60);
  assert.equal(report.possibleEngineDefectCount, 0);
  assert.equal(report.unexpectedDifferences.length, 0);
});

test("daily overdue differences are approved only with supporting schedule and History facts", () => {
  const task = legacyTask({ id: "daily-july-31", status: "pending", due_on: "2026-07-30", repeat_frequency: "daily" });
  const identity = "task:daily-july-31:occurrence:2026-07-29";
  const history = [legacyHistory(task.id, "2026-07-29", "done", {
    occurrence_due_on: "2026-07-29",
    occurrence_key: identity,
    counted_as_due_occurrence: true,
  })];
  const report = runTaskStateShadow({
    tasks: [task],
    history,
    now: "2026-07-31T14:00:00.000Z",
    timezone: "America/New_York",
    rolloverTime: "06:00",
    options: { taskIds: [task.id], startDate: "2026-07-29", endDate: "2026-07-31" },
  });
  const detail = report.perTask[0];
  assert.equal(detail?.engine.activeStatus, "missed");
  assert.equal(detail?.engine.calendar["2026-07-29"], "done");
  assert.equal(detail?.engine.calendar["2026-07-30"], "missed");
  assert.equal(detail?.engine.calendar["2026-07-31"], "open");
  assert.equal(detail?.engine.nextDueDate, "2026-07-30");
  assert.equal(detail?.engine.recurrenceAnchor, "2026-07-29");
  assert.equal(detail?.engine.satisfiedOccurrenceIdentity, identity);
  assert.equal(detail?.engine.proposedHistoryCount, 1);
  assert.ok(report.approvedSemanticDifferences.some((item) => item.field === "activeStatus"));
  assert.ok(report.approvedSemanticDifferences.some((item) => item.field === "calendar.2026-07-30"));
  assert.ok(report.approvedSemanticDifferences.some((item) => item.field === "calendar.2026-07-31"));
});

test("sparse Calendar cells are representation-only while missing real schedules stay visible by task/group", () => {
  const unscheduled = legacyTask({ id: "sparse", status: "pending", due_on: null, repeat_frequency: "none" });
  const weekly = legacyTask({
    id: "scheduled",
    due_on: "2026-07-31",
    repeat_frequency: "weekly",
    repeat_days_of_week: [5],
  });
  const report = runTaskStateShadow({
    tasks: [unscheduled, weekly],
    history: [],
    now: "2026-07-31T14:00:00.000Z",
    timezone: "America/New_York",
    rolloverTime: "06:00",
    options: { taskIds: [unscheduled.id, weekly.id], startDate: "2026-07-01", endDate: "2026-09-30" },
  });
  const missingScheduled = report.unexpectedDifferences.filter((item) =>
    item.field.startsWith("calendar.") && item.calendarFacts?.scheduled && item.engineValue === "no_entry");
  assert.ok(report.representationOnlyDifferences.length > 50);
  assert.ok(missingScheduled.length > 0);
  assert.equal(report.possibleEngineDefectCount, 1);
  assert.equal(report.possibleEngineDefects.length, 1);
  assert.deepEqual(report.possibleEngineDefects[0]?.affectedFields, ["calendar"]);
  assert.ok((report.possibleEngineDefects[0]?.calendarSummary?.dateCount ?? 0) > 0);
  assert.equal(report.possibleEngineDefects[0]?.calendarSummary?.fullDetails, undefined);
  assert.ok(Object.keys(report.possibleEngineDefects[0]?.sanitizedProposedTaskPatch ?? {})
    .every((field) => ALLOWED_TASK_STATE_PATCH_FIELDS.has(field as never)));
  assert.equal(
    report.possibleDefectPatterns.find((pattern) =>
      pattern.pattern === "genuinely missing scheduled Calendar occurrence")?.comparisonCount,
    1,
  );
  const activeSummary = report.semanticGroupSummaries["active-status differences"];
  assert.equal(activeSummary?.evaluatedTaskCount, 2);
  assert.ok((activeSummary?.differingTaskCount ?? 0) < (activeSummary?.evaluatedTaskCount ?? 0));
  assert.equal(report.perTask.find((item) => item.taskId === "scheduled")?.summary.possibleEngineDefectGroupCount, 1);
});

test("defect pattern samples are bounded and Calendar dates do not dominate counts", () => {
  const tasks = Array.from({ length: 7 }, (_, index) => legacyTask({
    id: `bounded-${index}`,
    title: `Bounded ${index}`,
    due_on: "2026-07-31",
    repeat_frequency: "weekly",
    repeat_days_of_week: [5],
  }));
  const report = runTaskStateShadow({
    tasks,
    history: [],
    now: "2026-07-31T14:00:00.000Z",
    timezone: "America/New_York",
    rolloverTime: "06:00",
    options: { startDate: "2026-07-01", endDate: "2026-09-30", includeTitles: true },
  });
  const pattern = report.possibleDefectPatterns.find((item) =>
    item.pattern === "genuinely missing scheduled Calendar occurrence");
  assert.equal(pattern?.comparisonCount, 7);
  assert.equal(pattern?.affectedTaskCount, 7);
  assert.equal(pattern?.samples.length, 5);
  assert.equal(pattern?.taskTypeCounts["fixed-weekly"], 7);
});

test("Calendar defect records stay compact unless full detail is explicitly requested", () => {
  const task = legacyTask({ id: "compact-calendar", due_on: "2026-07-31", repeat_frequency: "weekly", repeat_days_of_week: [5] });
  const input = {
    tasks: [task], history: [], now: "2026-07-31T14:00:00.000Z", timezone: "America/New_York", rolloverTime: "06:00",
    options: { startDate: "2026-07-01", endDate: "2026-10-31" },
  };
  const compact = runTaskStateShadow(input);
  const detailed = runTaskStateShadow({ ...input, options: { ...input.options, includeFullDefectDetails: true } });
  const compactCalendar = compact.possibleEngineDefects[0]?.calendarSummary;
  const detailedCalendar = detailed.possibleEngineDefects[0]?.calendarSummary;
  assert.ok((compactCalendar?.dateCount ?? 0) > compactCalendar?.sampleDates.length!);
  assert.equal(compactCalendar?.fullDetails, undefined);
  assert.equal(detailedCalendar?.fullDetails?.length, detailedCalendar?.dateCount);
});

test("rolling recurrence does not require future legacy Due cells while overdue or awaiting success", () => {
  const overdueDaily = legacyTask({
    id: "rolling-overdue",
    status: "pending",
    due_on: "2026-07-29",
    repeat_frequency: "daily",
  });
  const everyX = legacyTask({
    id: "rolling-every-x",
    status: "pending",
    due_on: "2026-08-02",
    repeat_frequency: "custom",
    repeat_interval: 3,
  });
  const report = runTaskStateShadow({
    tasks: [overdueDaily, everyX],
    history: [],
    now: "2026-07-31T14:00:00.000Z",
    timezone: "America/New_York",
    rolloverTime: "06:00",
    options: { startDate: "2026-07-29", endDate: "2026-08-12" },
  });
  const rollingFuture = report.representationOnlyDifferences.filter((item) =>
    item.taskId === overdueDaily.id && item.calendarFacts?.dateRelation === "future" && item.currentSystemValue === "due");
  assert.ok(rollingFuture.length > 0);
  assert.equal(report.unexpectedDifferences.some((item) => item.taskId === overdueDaily.id && item.calendarFacts?.dateRelation === "future"), false);
  assert.equal(report.unexpectedDifferences.some((item) => item.taskId === everyX.id && item.calendarFacts?.date === "2026-08-05"), false);
});

test("fixed weekly and monthly Calendar occurrences remain defect candidates", () => {
  const tasks = [
    legacyTask({ id: "fixed-weekly", due_on: "2026-07-31", repeat_frequency: "weekly", repeat_days_of_week: [5] }),
    legacyTask({ id: "fixed-monthly", due_on: "2026-07-31", repeat_frequency: "monthly", repeat_day_of_month: 31 }),
  ];
  const report = runTaskStateShadow({
    tasks,
    history: [],
    now: "2026-07-31T14:00:00.000Z",
    timezone: "America/New_York",
    rolloverTime: "06:00",
    options: { startDate: "2026-08-01", endDate: "2026-09-30" },
  });
  assert.ok(report.unexpectedDifferences.some((item) => item.taskId === "fixed-weekly" && item.calendarFacts?.scheduled));
  assert.ok(report.unexpectedDifferences.some((item) => item.taskId === "fixed-monthly" && item.calendarFacts?.scheduled));
});

test("occurrence identity prefixes normalize and unavailable recurrence metadata stays limited", () => {
  const task = legacyTask({ id: "identity-prefix", due_on: "2026-08-02", repeat_frequency: "weekly", repeat_days_of_week: [0] });
  const history = [legacyHistory(task.id, "2026-07-30", "done", {
    occurrence_due_on: "2026-08-02",
    occurrence_key: "occurrence:2026-08-02",
    counted_as_due_occurrence: true,
  })];
  const report = runTaskStateShadow({
    tasks: [task], history, now: SHADOW_NOW, timezone: "America/New_York", rolloverTime: "06:00",
    options: { taskIds: [task.id], startDate: "2026-07-30", endDate: "2026-08-04" },
  });
  assert.equal(report.unexpectedDifferences.some((item) => item.field === "currentOccurrenceIdentity"), false);
  assert.ok(report.adapterLimitations.some((item) => item.field === "proposedTaskPatchKeys"));
});

test("real status differences remain visible beside unavailable recurrence metadata", () => {
  const task = legacyTask({ id: "metadata-plus-status", status: "missed", due_on: "2026-08-08", repeat_frequency: "daily" });
  const history = [legacyHistory(task.id, "2026-07-30", "done", {
    occurrence_due_on: "2026-08-08",
    occurrence_key: "task:metadata-plus-status:occurrence:2026-08-08",
    counted_as_due_occurrence: true,
  })];
  const report = runTaskStateShadow({
    tasks: [task], history, now: SHADOW_NOW, timezone: "America/New_York", rolloverTime: "06:00",
    options: { taskIds: [task.id], startDate: "2026-07-30", endDate: "2026-08-08" },
  });
  assert.ok(report.adapterLimitations.some((item) => item.field === "proposedTaskPatchKeys"));
  assert.ok(report.unexpectedDifferences.some((item) => item.field === "activeStatus"));
});

test("approved Pending-to-Missed remains narrow while Missed-to-Pending stays visible", () => {
  const overdue = legacyTask({ id: "pending-missed", status: "pending", due_on: "2026-07-29" });
  const staleMissed = legacyTask({ id: "missed-pending", status: "missed", due_on: "2026-07-30" });
  const report = runTaskStateShadow({
    tasks: [overdue, staleMissed], history: [], now: SHADOW_NOW, timezone: "America/New_York", rolloverTime: "06:00",
    options: { startDate: "2026-07-29", endDate: "2026-07-30" },
  });
  assert.ok(report.approvedSemanticDifferences.some((item) => item.taskId === overdue.id && item.field === "activeStatus"));
  assert.ok(report.unexpectedDifferences.some((item) => item.taskId === staleMissed.id && item.field === "activeStatus"));
});

test("skip accounting separates lifecycle exclusions from partial adapter support", () => {
  const tasks = [
    legacyTask({ id: "partial", repeat_frequency: "daily" }),
    legacyTask({ id: "completed-skip", status: "complete" }),
    legacyTask({ id: "archived-skip", status: "archived" }),
  ];
  const report = runTaskStateShadow({
    tasks,
    history: [],
    now: SHADOW_NOW,
    timezone: "America/New_York",
    rolloverTime: "06:00",
    options: { startDate: "2026-07-30", endDate: "2026-07-30" },
  });
  assert.equal(report.taskCountEvaluated, 1);
  assert.equal(report.taskCountSkipped, 2);
  assert.equal(report.skippedTasks.excludedLifecycleTaskCount, 2);
  assert.equal(report.skippedTasks.fullySkippedUnsupportedTaskCount, 0);
  assert.equal(report.skippedTasks.fullySkippedTaskCount, 2);
  assert.equal(report.skippedTasks.partiallyUnsupportedTaskCount, 1);
  assert.equal(report.skippedTasks.byReason["excluded complete lifecycle"]?.support, "fully skipped");
  assert.equal(report.skippedTasks.byReason.recurrence_cursor_unavailable?.support, "partially unsupported");
  assert.equal(report.skippedTasks.fullySkippedByLifecycleAndTaskType["complete:one-off"], 1);
  assert.equal(report.perTask.some((detail) => detail.taskId === "partial"), true);
});

test("shadow report includes full allow-listed proposed patch values", () => {
  const task = legacyTask({ id: "patch-values", status: "pending", due_on: null, repeat_frequency: "none" });
  const report = runTaskStateShadow({
    tasks: [task],
    history: [],
    now: SHADOW_NOW,
    timezone: "America/New_York",
    rolloverTime: "06:00",
    options: { taskIds: [task.id], startDate: "2026-07-30", endDate: "2026-07-30" },
  });
  assert.deepEqual(report.perTask[0]?.engine.proposedTaskPatch, { status: "unscheduled" });
  assert.deepEqual(report.perTask[0]?.engine.proposedTaskPatchKeys, ["status"]);
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
        tasks: [legacyTask({
          id: "runtime",
          notes: "PRIVATE NOTE",
          external_link_url: "https://private.example",
        })],
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
  developmentTarget.__ADHDICE_RUN_TASK_STATE_SHADOW__?.({ includeTitles: true });
  assert.equal(snapshotReads, 1);
  assert.ok(developmentTarget.__ADHDICE_LATEST_TASK_STATE_SHADOW__);
  const compact = developmentTarget.__ADHDICE_SUMMARIZE_TASK_STATE_SHADOW__?.({
    includeTitles: false,
    maxSamplesPerPattern: 1,
  });
  assert.equal(snapshotReads, 1);
  assert.ok(compact);
  assert.ok(compact?.possibleDefectPatterns.every((pattern) => pattern.samples.length <= 1));
  assert.ok(compact?.possibleEngineDefects.every((defect) => !("taskTitle" in defect)));
  const exported = developmentTarget.__ADHDICE_EXPORT_TASK_STATE_SHADOW__?.();
  assert.equal(snapshotReads, 1);
  assert.doesNotMatch(exported ?? "", /Shadow fixture/);
  assert.doesNotMatch(exported ?? "", /PRIVATE NOTE|private\.example/);
  assert.match(developmentTarget.__ADHDICE_EXPORT_TASK_STATE_SHADOW__?.({ includeTitles: true }) ?? "", /Shadow fixture/);
  cleanup();
  assert.equal(developmentTarget.__ADHDICE_RUN_TASK_STATE_SHADOW__, undefined);
  assert.equal(developmentTarget.__ADHDICE_SUMMARIZE_TASK_STATE_SHADOW__, undefined);
  assert.equal(developmentTarget.__ADHDICE_EXPORT_TASK_STATE_SHADOW__, undefined);
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
