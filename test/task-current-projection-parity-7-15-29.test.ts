import assert from "node:assert/strict";
import test from "node:test";

import { createTask } from "../src/lib/task-buckets.ts";
import type { Task, TaskHistory } from "../src/lib/database.types.ts";
import {
  classifyCurrentTaskProjectionParityMismatch,
  classifyCurrentTaskProjectionTimestampMismatch,
  compareCurrentTaskProjectionParity,
  type CurrentTaskProjectionReadRow,
} from "../src/lib/task-current-projection-read.ts";
import {
  buildTaskHistoryStreakSummary,
  type TaskHistoryStreakSummary,
} from "../src/lib/task-history-streak-summaries.ts";
import { STANDARD_TASK_BEHAVIOR_POLICY } from "../src/lib/task-state-engine/behavior-policy.ts";

const USER_ID = "00000000-0000-0000-0000-000000000001";
const HISTORY_EPOCH = "00000000-0000-0000-0000-000000000099";
const TODAY = "2026-09-23";

type FixtureRootCause =
  | "projection builder bug"
  | "projection input/read-model bug"
  | "stale-but-valid v1 row"
  | "schedule-boundary projection discrepancy"
  | "behavior-policy discrepancy"
  | "legacy oracle bug"
  | "lifecycle/inactive Task mismatch"
  | "unresolved";

type ParityFixture = {
  name: string;
  rootCause: FixtureRootCause;
  expectedClassification: "representation-only" | "semantic";
  field: "displayStatus" | "displayDueOn" | "currentPositiveStreak" | "lastHandledDate" | "lastHandledAt" | "lastDoneAt";
  projected: string | number | null;
  legacy: string | number | null;
  projectedLogicalDate?: string | null;
  legacyLogicalDate?: string | null;
  timestampClassification?: ReturnType<typeof classifyCurrentTaskProjectionTimestampMismatch>;
};

function task(overrides: Partial<Task> = {}) {
  return {
    ...createTask({
      created_at: "2026-09-01T12:00:00.000Z",
      due_on: "2026-09-20",
      id: "fixture-task",
      repeat_frequency: "daily",
      sort_order: 0,
      status: "pending",
      title: "Projection parity fixture",
      user_id: USER_ID,
    }),
    ...overrides,
  } as Task;
}

function history(taskId: string, logicalDate: string, status: TaskHistory["status"]): TaskHistory {
  return {
    counted_as_due_occurrence: true,
    created_at: `${logicalDate}T09:00:00.000Z`,
    entry_date: logicalDate,
    event_type: "status",
    id: `history-${taskId}-${logicalDate}`,
    occurrence_due_on: logicalDate,
    occurrence_key: `task:${taskId}:occurrence:${logicalDate}`,
    status,
    task_id: taskId,
    updated_at: `${logicalDate}T09:00:00.000Z`,
    user_id: USER_ID,
    was_completed: status === "done" || status === "did_my_best" || status === "complete",
  };
}

function projection(overrides: Partial<CurrentTaskProjectionReadRow> = {}): CurrentTaskProjectionReadRow {
  return {
    user_id: USER_ID,
    entity_id: "fixture-task",
    entity_kind: "parent",
    display_status: "pending",
    next_due_on: "2026-09-24",
    handled_current_logical_day: false,
    last_handled_logical_date: null,
    last_handled_at: null,
    last_done_logical_date: null,
    last_done_at: null,
    current_positive_streak: 0,
    current_missed_streak: 0,
    canonical_task_revision: 12,
    history_sync_epoch: HISTORY_EPOCH,
    history_source_revision: 0,
    logical_day_settings_revision: 7,
    projected_logical_date: TODAY,
    projection_schema_version: "task-current-projection-schema-v1",
    projection_algorithm_version: "task-current-projection-algorithm-v1",
    validity: "valid",
    updated_at: "2026-09-23T12:00:00.000Z",
    ...overrides,
  };
}

function compareFixture(fixture: ParityFixture) {
  const isTimestamp = fixture.field === "lastHandledAt" || fixture.field === "lastDoneAt";
  const classification = isTimestamp
    ? classifyCurrentTaskProjectionParityMismatch({
      field: fixture.field,
      legacyLogicalDate: fixture.legacyLogicalDate,
      projectedLogicalDate: fixture.projectedLogicalDate,
      timestampClassification: fixture.timestampClassification,
    })
    : classifyCurrentTaskProjectionParityMismatch({ field: fixture.field });
  assert.equal(classification, fixture.expectedClassification, fixture.name);
}

test("7.15.29 locks timestamp semantics for Last Done and Last Handled", () => {
  const settings = { logicalDayStart: "06:00", timezone: "America/New_York" };
  const logicalMidnight = "2026-09-18";
  const floating = "2026-09-18T00:00:00";
  const postgresReadback = "2026-09-18T00:00:00+00:00";
  const eventInstant = "2026-09-18T14:30:00.000Z";

  assert.equal(
    classifyCurrentTaskProjectionTimestampMismatch(postgresReadback, floating, settings),
    "same logical date but floating-time vs timestamptz",
  );
  assert.equal(
    classifyCurrentTaskProjectionTimestampMismatch(eventInstant, "2026-09-18T10:30:00-04:00", settings),
    "same instant / different serialization",
  );

  for (const field of ["lastDoneAt", "lastHandledAt"] as const) {
    compareFixture({
      name: `${field} synthesized logical-day presentation`,
      rootCause: "stale-but-valid v1 row",
      expectedClassification: "representation-only",
      field,
      projected: postgresReadback,
      legacy: floating,
      projectedLogicalDate: logicalMidnight,
      legacyLogicalDate: logicalMidnight,
      timestampClassification: "same logical date but floating-time vs timestamptz",
    });
    compareFixture({
      name: `${field} real event instant serialization`,
      rootCause: "stale-but-valid v1 row",
      expectedClassification: "representation-only",
      field,
      projected: eventInstant,
      legacy: "2026-09-18T10:30:00-04:00",
      projectedLogicalDate: logicalMidnight,
      legacyLogicalDate: logicalMidnight,
      timestampClassification: "same instant / different serialization",
    });
  }
});

test("7.15.29 classifies status and due mismatches as semantic", () => {
  const fixtures: ParityFixture[] = [
    {
      name: "canonical evaluator upcoming versus stale projection pending",
      rootCause: "stale-but-valid v1 row",
      expectedClassification: "semantic",
      field: "displayStatus",
      projected: "pending",
      legacy: "upcoming",
    },
    {
      name: "legacy later next due versus stale projection older due",
      rootCause: "schedule-boundary projection discrepancy",
      expectedClassification: "semantic",
      field: "displayDueOn",
      projected: "2026-09-18",
      legacy: "2026-09-24",
    },
    {
      name: "same status mismatch with policy boundary context",
      rootCause: "behavior-policy discrepancy",
      expectedClassification: "semantic",
      field: "displayStatus",
      projected: "pending",
      legacy: "upcoming",
    },
  ];

  for (const fixture of fixtures) {
    compareFixture(fixture);
    assert.equal(fixture.expectedClassification, "semantic", fixture.rootCause);
  }
});

test("7.15.29 locks the Custom ruleset streak fixture and source-revision-zero contract", () => {
  const fixtureTask = task({
    id: "custom-streak",
    due_on: "2026-09-20",
    canonicalization_status: "canonical_runtime",
    entity_kind: "parent",
    terminal_state: "active",
    container_state: "active",
    workflow_state: "none",
    canonical_revision: 1,
  });
  const customPolicy = {
    ...STANDARD_TASK_BEHAVIOR_POLICY,
    id: "custom-practice-revision-7",
    unresolvedOccurrence: "blank" as const,
  };
  const visibleHistory = [
    history(fixtureTask.id, "2026-09-21", "done"),
    history(fixtureTask.id, "2026-09-22", "done"),
    history(fixtureTask.id, "2026-09-23", "done"),
  ];
  const legacySummary = buildTaskHistoryStreakSummary(fixtureTask, visibleHistory, TODAY, {
    compatibilityOnly: true,
    behaviorPolicyRevisions: {
      custom: [{ ...customPolicy, effectiveFromLogicalDate: "2026-09-01" }],
    },
    namedCustomRulesetBehaviorPolicyRevisions: {
      practice: [{ ...customPolicy, effectiveFromLogicalDate: "2026-09-01" }],
    },
    behaviorSelectionsByTaskId: {
      [fixtureTask.id]: [{ effectiveFromLogicalDate: "2026-09-01", taskType: "custom", customRulesetId: "practice" }],
    },
    now: "2026-09-23T12:00:00.000Z",
    timezone: "UTC",
  });
  assert.equal(legacySummary.currentStreak, 3);

  const staleProjection = projection({
    entity_id: fixtureTask.id,
    current_positive_streak: 0,
    history_source_revision: 0,
  });
  const exactInputEvidence = {
    historyFactsVisibleToLegacy: visibleHistory.map(({ id, entry_date, status }) => ({ id, entry_date, status })),
    historyFactsLoadedByProjectionRebuildSource: visibleHistory.map(({ id, entry_date, status }) => ({ id, entry_date, status })),
    effectiveTrackingExclusion: false,
    effectiveBehaviorPolicyRevision: "custom-practice-revision-7",
    calendarOverrides: [],
    scheduleBoundary: { effectiveFromLogicalDate: "2026-09-20", repeatFrequency: "daily" },
    lifecycle: "active",
    resultingEffectiveTimeline: ["done", "done", "done"],
  };
  assert.deepEqual(exactInputEvidence.historyFactsLoadedByProjectionRebuildSource, exactInputEvidence.historyFactsVisibleToLegacy);
  assert.equal(staleProjection.history_source_revision, 0);
  assert.equal(legacySummary.currentStreak, 3);
  assert.equal(staleProjection.current_positive_streak, 0);
  assert.equal(
    classifyCurrentTaskProjectionParityMismatch({ field: "currentPositiveStreak" }),
    "semantic",
  );
});

test("7.15.29 locks Last Handled entity-scoping and lifecycle fixtures", () => {
  const fixtures: ParityFixture[] = [
    {
      name: "scoped command operation omitted from Last Handled rebuild",
      rootCause: "projection input/read-model bug",
      expectedClassification: "semantic",
      field: "lastHandledDate",
      projected: null,
      legacy: "2026-09-22",
    },
    {
      name: "legacy compatibility evidence is not canonical manual action evidence",
      rootCause: "legacy oracle bug",
      expectedClassification: "semantic",
      field: "lastHandledDate",
      projected: "2026-09-20",
      legacy: "2026-09-22",
    },
    {
      name: "inactive Task excluded from ordinary current parity",
      rootCause: "lifecycle/inactive Task mismatch",
      expectedClassification: "semantic",
      field: "lastHandledDate",
      projected: null,
      legacy: "2026-09-22",
    },
  ];

  for (const fixture of fixtures) {
    compareFixture(fixture);
    assert.equal(fixture.expectedClassification, "semantic", fixture.rootCause);
  }
});

test("7.15.29 produces deterministic representation-only and genuine semantic counts", () => {
  const rows: Array<{ fixture: ParityFixture; taskId: string }> = [
    {
      taskId: "representation-1",
      fixture: {
        name: "synthetic Last Done",
        rootCause: "stale-but-valid v1 row",
        expectedClassification: "representation-only",
        field: "lastDoneAt",
        projected: "2026-09-18T00:00:00+00:00",
        legacy: "2026-09-18T00:00:00",
        projectedLogicalDate: "2026-09-18",
        legacyLogicalDate: "2026-09-18",
        timestampClassification: "same logical date but floating-time vs timestamptz",
      },
    },
    {
      taskId: "representation-2",
      fixture: {
        name: "absolute Last Handled instant",
        rootCause: "stale-but-valid v1 row",
        expectedClassification: "representation-only",
        field: "lastHandledAt",
        projected: "2026-09-18T14:30:00.000Z",
        legacy: "2026-09-18T10:30:00-04:00",
        projectedLogicalDate: "2026-09-18",
        legacyLogicalDate: "2026-09-18",
        timestampClassification: "same instant / different serialization",
      },
    },
    {
      taskId: "semantic-1",
      fixture: {
        name: "status",
        rootCause: "stale-but-valid v1 row",
        expectedClassification: "semantic",
        field: "displayStatus",
        projected: "pending",
        legacy: "upcoming",
      },
    },
    {
      taskId: "semantic-2",
      fixture: {
        name: "due",
        rootCause: "schedule-boundary projection discrepancy",
        expectedClassification: "semantic",
        field: "displayDueOn",
        projected: "2026-09-18",
        legacy: "2026-09-24",
      },
    },
    {
      taskId: "semantic-3",
      fixture: {
        name: "positive streak",
        rootCause: "projection input/read-model bug",
        expectedClassification: "semantic",
        field: "currentPositiveStreak",
        projected: 0,
        legacy: 3,
      },
    },
  ];

  for (const row of rows) compareFixture(row.fixture);
  assert.equal(rows.filter(({ fixture }) => fixture.expectedClassification === "representation-only").length, 2);
  assert.equal(rows.filter(({ fixture }) => fixture.expectedClassification === "semantic").length, 3);
  assert.equal(new Set(rows.map(({ taskId }) => taskId)).size, 5);
});

test("7.15.29 parity comparator retains all requested fields for stable baseline accounting", () => {
  const stableTask = task({ id: "stable-task" });
  const legacySummary: TaskHistoryStreakSummary = {
    currentStreak: 1,
    missedStreak: 0,
    lastHandledDate: "2026-09-18",
    lastHandledAt: "2026-09-18T00:00:00",
    lastDoneDate: "2026-09-18",
    lastDoneAt: "2026-09-18T00:00:00",
  };
  const result = compareCurrentTaskProjectionParity({
    legacyCurrentRead: {
      dueOnByTaskId: { [stableTask.id]: "2026-09-24" },
      statusesByTaskId: { [stableTask.id]: "upcoming" },
    },
    legacySummaries: { [stableTask.id]: legacySummary },
    projectionsByTaskId: {
      [stableTask.id]: projection({
        entity_id: stableTask.id,
        display_status: "pending",
        next_due_on: "2026-09-18",
        current_positive_streak: 0,
        last_handled_logical_date: "2026-09-18",
        last_handled_at: "2026-09-18T00:00:00+00:00",
        last_done_logical_date: "2026-09-18",
        last_done_at: "2026-09-18T00:00:00+00:00",
      }),
    },
    tasks: [stableTask],
    logicalDayStart: "06:00",
    timezone: "America/New_York",
  });
  assert.equal(result.freshCount, 1);
  assert.deepEqual(result.mismatchedTaskIds, [stableTask.id]);
  assert.deepEqual(
    result.mismatchedFields.map(({ field }) => field),
    ["displayStatus", "displayDueOn", "currentPositiveStreak", "lastHandledAt", "lastDoneAt"],
  );
  assert.equal(result.mismatchDiagnostics.find(({ field }) => field === "lastDoneAt")?.timestampClassification, "same logical date but floating-time vs timestamptz");
});
