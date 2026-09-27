import assert from "node:assert/strict";
import test from "node:test";

import type { Task, TaskHistory } from "../src/lib/database.types.ts";
import { legacyHistory, legacyTask } from "./task-state-engine-shadow-fixtures.ts";
import {
  buildCompactActiveStatusReadProjection,
  createActiveStatusReadInputFingerprint,
  type ActiveStatusReadProjectionRecord,
  type ActiveStatusReadProjectionInput,
} from "../src/lib/task-state-canonical/active-status-read.ts";
import type { CanonicalTaskScheduleBoundary, CanonicalTaskStateColumns } from "../src/lib/task-state-canonical/types.ts";
import { projectTasksForActiveStatusRead, resolveActiveTaskStatuses } from "../src/lib/task-state-engine/read-authority.ts";

const NOW = "2026-08-17T16:00:00.000Z";
const TIMEZONE = "America/New_York";
const ROLLOVER = "06:00";

type ProjectionTask = Task & Partial<CanonicalTaskStateColumns> & {
  canonical_schedule_boundary: CanonicalTaskScheduleBoundary;
};

function boundaryFor(task: Task, overrides: Partial<CanonicalTaskScheduleBoundary> = {}): CanonicalTaskScheduleBoundary {
  const scheduleModel = task.due_on === null && task.repeat_frequency === "none"
    ? "unscheduled"
    : task.repeat_frequency === "none" ? "one_time"
      : task.repeat_frequency === "weekly" || task.repeat_frequency === "monthly" ? "fixed" : "rolling";
  const repeatFrequency = task.repeat_frequency === "weekly"
    ? "weekly"
    : task.repeat_frequency === "monthly"
      ? "monthly"
      : task.repeat_frequency === "daily_until_complete"
        ? "daily_until_complete"
        : scheduleModel === "rolling" ? "daily" : "none";
  return {
    id: `boundary-${task.id}`,
    user_id: task.user_id,
    entity_id: task.id,
    entity_kind: "parent",
    effective_from_logical_date: task.due_on ?? "2026-08-17",
    boundary_sequence: 1,
    boundary_type: "initial",
    schedule_model: scheduleModel,
    repeat_frequency: repeatFrequency,
    repeat_interval: task.repeat_interval,
    repeat_days_of_week: task.repeat_days_of_week,
    repeat_day_of_month: task.repeat_day_of_month,
    repeat_monthly_mode: task.repeat_monthly_mode,
    repeat_monthly_ordinal: task.repeat_monthly_ordinal,
    repeat_monthly_weekday: task.repeat_monthly_weekday,
    one_time_due_on: scheduleModel === "one_time" ? task.due_on : null,
    due_time: task.due_time,
    anchor_date: scheduleModel === "unscheduled" ? null : task.due_on,
    anchor_kind: scheduleModel === "unscheduled" ? "unknown" : "user_selected",
    anchor_confidence: scheduleModel === "unscheduled" ? "unavailable" : "proven",
    historical_scope_known: true,
    prospective_only: false,
    prior_boundary_id: null,
    affected_occurrence_id: null,
    logical_day_settings_revision: 3,
    timezone: TIMEZONE,
    day_start_time: ROLLOVER,
    actor_kind: "user",
    actor_id: task.user_id,
    source: "task-state-command",
    command_id: null,
    idempotence_identity: `boundary:${task.id}`,
    schema_contract_version: "task-state-schema-v1",
    source_task_revision: task.revision,
    revision: 1,
    created_at: task.created_at,
    updated_at: task.updated_at,
    ...overrides,
  };
}

function canonicalTask(
  id: string,
  taskOverrides: Partial<Task> = {},
  boundaryOverrides: Partial<CanonicalTaskScheduleBoundary> = {},
): ProjectionTask {
  const source = legacyTask({
    id,
    due_on: "2026-08-17",
    repeat_frequency: "none",
    status: "pending",
    task_type: "task",
    custom_ruleset_id: null,
    ...taskOverrides,
  });
  return {
    ...source,
    canonicalization_status: source.canonicalization_status ?? "canonical_runtime",
    entity_kind: source.entity_kind ?? "parent",
    terminal_state: source.terminal_state ?? (source.status === "complete" ? "permanently_complete" : "active"),
    container_state: source.container_state ?? "active",
    prior_container_state: source.prior_container_state ?? null,
    prior_container_state_status: source.prior_container_state_status ?? "not_applicable",
    terminal_completed_at: source.terminal_completed_at ?? null,
    container_trashed_at: source.container_trashed_at ?? null,
    workflow_state: source.workflow_state ?? (source.status === "in_progress" ? "in_progress" : "none"),
    workflow_started_at: source.workflow_started_at ?? null,
    workflow_logical_date: source.workflow_logical_date ?? null,
    workflow_occurrence_id: source.workflow_occurrence_id ?? null,
    workflow_command_id: source.workflow_command_id ?? null,
    workflow_revision: source.workflow_revision ?? 1,
    canonical_revision: source.canonical_revision ?? 1,
    canonical_created_at: source.canonical_created_at ?? source.created_at,
    canonical_updated_at: source.canonical_updated_at ?? source.updated_at,
    projection_source_canonical_revision: source.projection_source_canonical_revision ?? 1,
    projection_source_fingerprint: source.projection_source_fingerprint ?? `seed:${id}`,
    projection_version: source.projection_version ?? "task-state-projection-v1",
    canonical_schedule_boundary: boundaryFor(source, boundaryOverrides),
  };
}

function historyRow(
  taskId: string,
  logicalDate: string,
  status: TaskHistory["status"],
  overrides: Partial<TaskHistory> = {},
) {
  return legacyHistory(taskId, logicalDate, status, {
    occurrence_due_on: logicalDate,
    occurrence_key: `task:${taskId}:occurrence:${logicalDate}`,
    counted_as_due_occurrence: true,
    ...overrides,
  });
}

function input(tasks: ProjectionTask[], historyByTaskId: Record<string, TaskHistory[]> = {}): ActiveStatusReadProjectionInput {
  return {
    historyByTaskId,
    logicalDayRollover: ROLLOVER,
    now: NOW,
    tasks,
    timezone: TIMEZONE,
  };
}

type Scenario = {
  name: string;
  input: ActiveStatusReadProjectionInput;
};

const scenarios: Scenario[] = [
  {
    name: "one-time pending",
    input: input([canonicalTask("one-time-pending")]),
  },
  {
    name: "one-time completed",
    input: input([canonicalTask("one-time-completed", { due_on: "2026-08-16" })], {
      "one-time-completed": [historyRow("one-time-completed", "2026-08-16", "done")],
    }),
  },
  {
    name: "unscheduled",
    input: input([canonicalTask("unscheduled", { due_on: null })]),
  },
  {
    name: "independent Daily pending",
    input: input([canonicalTask("daily-pending", { repeat_frequency: "daily" })]),
  },
  {
    name: "independent Daily Done",
    input: input([canonicalTask("daily-done", { repeat_frequency: "daily" })], {
      "daily-done": [historyRow("daily-done", "2026-08-17", "done")],
    }),
  },
  {
    name: "independent Daily older Missed plus later success",
    input: input([canonicalTask("daily-missed-success", { repeat_frequency: "daily", status: "missed" })], {
      "daily-missed-success": [
        historyRow("daily-missed-success", "2026-08-15", "missed"),
        historyRow("daily-missed-success", "2026-08-17", "done"),
      ],
    }),
  },
  {
    name: "Daily-until-complete unresolved Missed chain",
    input: input([canonicalTask("daily-until-complete-unresolved", { repeat_frequency: "daily_until_complete", status: "missed" })], {
      "daily-until-complete-unresolved": [
        historyRow("daily-until-complete-unresolved", "2026-08-15", "missed"),
        historyRow("daily-until-complete-unresolved", "2026-08-16", "missed"),
      ],
    }),
  },
  {
    name: "Daily-until-complete resolved state",
    input: input([canonicalTask("daily-until-complete-resolved", { repeat_frequency: "daily_until_complete" })], {
      "daily-until-complete-resolved": [
        historyRow("daily-until-complete-resolved", "2026-08-15", "missed"),
        historyRow("daily-until-complete-resolved", "2026-08-16", "done"),
      ],
    }),
  },
  {
    name: "rolling recurrence",
    input: input([canonicalTask("rolling", { due_on: "2026-08-17", repeat_frequency: "custom", repeat_interval: 3 })]),
  },
  {
    name: "rolling recurrence older Missed plus later success",
    input: input([canonicalTask("rolling-missed-success", { due_on: "2026-08-19", repeat_frequency: "custom", repeat_interval: 3, status: "missed" })], {
      "rolling-missed-success": [
        historyRow("rolling-missed-success", "2026-08-14", "missed", { occurrence_due_on: "2026-08-14", occurrence_key: "task:rolling-missed-success:occurrence:2026-08-14" }),
        historyRow("rolling-missed-success", "2026-08-16", "done", { occurrence_due_on: "2026-08-16", occurrence_key: "task:rolling-missed-success:occurrence:2026-08-16" }),
      ],
    }),
  },
  {
    name: "weekly recurrence",
    input: input([canonicalTask("weekly", { due_on: "2026-08-17", repeat_frequency: "weekly", repeat_days_of_week: [1] })]),
  },
  {
    name: "weekly success targeting a scheduled occurrence",
    input: input([canonicalTask("weekly-target", { due_on: "2026-08-17", repeat_frequency: "weekly", repeat_days_of_week: [1] })], {
      "weekly-target": [historyRow("weekly-target", "2026-08-17", "done", { occurrence_due_on: "2026-08-24", occurrence_key: "task:weekly-target:occurrence:2026-08-24" })],
    }),
  },
  {
    name: "monthly day-of-month",
    input: input([canonicalTask("monthly-day", { due_on: "2026-09-15", repeat_frequency: "monthly", repeat_day_of_month: 15 })]),
  },
  {
    name: "monthly ordinal-weekday",
    input: input([canonicalTask("monthly-ordinal", {
      due_on: "2026-09-01",
      repeat_frequency: "monthly",
      repeat_monthly_mode: "ordinal_weekday",
      repeat_monthly_ordinal: "first",
      repeat_monthly_weekday: 2,
    })]),
  },
  {
    name: "delayed occurrence",
    input: input([canonicalTask("delayed", { repeat_frequency: "daily" })], {
      delayed: [historyRow("delayed", "2026-08-17", "delayed", { effective_due_on: "2026-08-20" })],
    }),
  },
  {
    name: "permanently Complete",
    input: input([canonicalTask("permanently-complete", { status: "complete", due_on: null })]),
  },
  {
    name: "stale In Progress",
    input: input([canonicalTask("stale-in-progress", {
      active_status_logical_date: "2026-08-16",
      status: "in_progress",
      workflow_logical_date: "2026-08-16",
      workflow_state: "in_progress",
    })]),
  },
  {
    name: "future rolled-forward due date",
    input: input([canonicalTask("future-due", { due_on: "2026-08-24", repeat_frequency: "daily" })]),
  },
  {
    name: "identity-bearing Missed",
    input: input([canonicalTask("identity-missed", { repeat_frequency: "daily", status: "missed" })], {
      "identity-missed": [historyRow("identity-missed", "2026-08-17", "missed")],
    }),
  },
  {
    name: "legacy identity-less History",
    input: input([canonicalTask("legacy-identity-less", { due_on: "2026-08-17", repeat_frequency: "weekly", repeat_days_of_week: [1] })], {
      "legacy-identity-less": [legacyHistory("legacy-identity-less", "2026-08-17", "missed")],
    }),
  },
  {
    name: "recurrence_authoritative=false row",
    input: input([canonicalTask("non-authoritative", { due_on: "2026-08-24", repeat_frequency: "daily" })], {
      "non-authoritative": [historyRow("non-authoritative", "2026-08-15", "delayed", {
        effective_due_on: null,
        recurrence_authoritative: false,
      })],
    }),
  },
  {
    name: "multiple same-day canonical ordering",
    input: input([canonicalTask("same-day-ordering", { repeat_frequency: "daily" })], {
      "same-day-ordering": [
        historyRow("same-day-ordering", "2026-08-17", "missed", { id: "legacy-same-day", canonical_fact_id: null }),
        historyRow("same-day-ordering", "2026-08-17", "done", { id: "canonical-same-day", canonical_fact_id: "fact-same-day" }),
      ],
    }),
  },
  {
    name: "archived and trashed lifecycle handling",
    input: input([
      canonicalTask("archived", { container_state: "archived", status: "archived" }),
      canonicalTask("trashed", { container_state: "trashed", status: "trashed" }),
    ]),
  },
];

function reconstructCompactProjection(records: readonly ActiveStatusReadProjectionRecord[]) {
  const statusesByTaskId: Record<string, ActiveStatusReadProjectionRecord["activeStatus"]> = {};
  const dueOnByTaskId: Record<string, string | null> = {};
  for (const record of records) {
    statusesByTaskId[record.taskId] = record.activeStatus;
    if (Object.hasOwn(record, "dueOn")) dueOnByTaskId[record.taskId] = record.dueOn!;
  }
  return { dueOnByTaskId, statusesByTaskId };
}

test("compact Active Status projection has exact full-History resolver parity across required scenarios", () => {
  assert.equal(scenarios.length, 23);
  for (const scenario of scenarios) {
    const compact = buildCompactActiveStatusReadProjection(scenario.input);
    const reference = resolveActiveTaskStatuses(scenario.input);
    assert.equal(compact.tasks.length, scenario.input.tasks.length, scenario.name);
    for (const [index, task] of scenario.input.tasks.entries()) {
      const record = compact.tasks[index]!;
      const hasReferenceDueOn = Object.hasOwn(reference.dueOnByTaskId, task.id);
      assert.equal(record.taskId, task.id, scenario.name);
      assert.equal(record.activeStatus, reference.statusesByTaskId[task.id], scenario.name);
      assert.equal(Object.hasOwn(record, "dueOn"), hasReferenceDueOn, scenario.name);
      if (hasReferenceDueOn) assert.equal(record.dueOn, reference.dueOnByTaskId[task.id], scenario.name);
    }
    assert.equal(compact.projectionVersion, "active-status-read-v1", scenario.name);
    assert.equal(compact.context.logicalDate, "2026-08-17", scenario.name);
  }
});

test("compact dueOn preserves explicit null/date and omits lifecycle projections", () => {
  const tasks = [
    canonicalTask("unscheduled-presence", { due_on: null }),
    canonicalTask("scheduled-presence", { due_on: "2026-08-18" }),
    canonicalTask("archived-presence", { container_state: "archived", due_on: "2026-08-19", status: "archived" }),
    canonicalTask("trashed-presence", { container_state: "trashed", due_on: "2026-08-20", status: "trashed" }),
  ];
  const scenarioInput = input(tasks);
  const reference = resolveActiveTaskStatuses(scenarioInput);
  const compact = buildCompactActiveStatusReadProjection(scenarioInput);
  const recordFor = (taskId: string) => compact.tasks.find((record) => record.taskId === taskId)!;

  assert.equal(Object.hasOwn(recordFor("unscheduled-presence"), "dueOn"), true);
  assert.equal(recordFor("unscheduled-presence").dueOn, null);
  assert.equal(Object.hasOwn(reference.dueOnByTaskId, "unscheduled-presence"), true);

  assert.equal(Object.hasOwn(recordFor("scheduled-presence"), "dueOn"), true);
  assert.equal(recordFor("scheduled-presence").dueOn, reference.dueOnByTaskId["scheduled-presence"]);

  for (const taskId of ["archived-presence", "trashed-presence"]) {
    assert.equal(Object.hasOwn(recordFor(taskId), "dueOn"), false);
    assert.equal(Object.hasOwn(reference.dueOnByTaskId, taskId), false);
  }

  const reconstructed = reconstructCompactProjection(compact.tasks);
  const projected = projectTasksForActiveStatusRead(tasks, reconstructed.statusesByTaskId, reconstructed.dueOnByTaskId);
  assert.equal(projected.find((task) => task.id === "archived-presence")?.due_on, "2026-08-19");
  assert.equal(projected.find((task) => task.id === "trashed-presence")?.due_on, "2026-08-20");
});

test("compact records reconstruct exact resolver maps, including dueOn presence", () => {
  for (const scenario of scenarios) {
    const reference = resolveActiveTaskStatuses(scenario.input);
    const compact = buildCompactActiveStatusReadProjection(scenario.input);
    const reconstructed = reconstructCompactProjection(compact.tasks);

    assert.deepEqual(reconstructed.statusesByTaskId, reference.statusesByTaskId, scenario.name);
    assert.deepEqual(reconstructed.dueOnByTaskId, reference.dueOnByTaskId, scenario.name);
    for (const task of scenario.input.tasks) {
      assert.equal(
        Object.hasOwn(reconstructed.dueOnByTaskId, task.id),
        Object.hasOwn(reference.dueOnByTaskId, task.id),
        scenario.name,
      );
    }
  }
});

test("compact Active Status projection has no History transport and scales with Task count", () => {
  const tasks = Array.from({ length: 500 }, (_, index) => canonicalTask(`scale-${index}`, { repeat_frequency: "daily" }));
  const historyByTaskId = Object.fromEntries(tasks.map((task) => [
    task.id,
    Array.from({ length: 34 }, (_, index) => historyRow(task.id, `2026-07-${String(index + 1).padStart(2, "0")}`, "missed")),
  ]));
  const compact = buildCompactActiveStatusReadProjection(input(tasks, historyByTaskId));

  assert.equal(Object.hasOwn(compact, "history"), false);
  assert.equal(JSON.stringify(compact).includes("history-scale-"), false);
  assert.equal(compact.tasks.length, 500);
  const allowedRecordKeys = new Set(["activeStatus,dueOn,taskId", "activeStatus,taskId"]);
  assert.equal(compact.tasks.every((record) => allowedRecordKeys.has(Object.keys(record).sort().join(","))), true);
});

test("projection fingerprint distinguishes logical-day, policy, source, and Task State context", () => {
  const source = scenarios[3]!.input;
  const sourceRevision = { ...source, sourceRevision: "canonical-state:1" };
  const changedSource = { ...source, sourceRevision: "canonical-state:2" };
  const changedLogicalDay = { ...sourceRevision, now: "2026-08-18T16:00:00.000Z" };
  const changedTimezone = { ...sourceRevision, timezone: "UTC" };
  const changedRollover = { ...sourceRevision, logicalDayRollover: "00:00" };
  const changedPolicy = {
    ...sourceRevision,
    behaviorSelectionsByTaskId: {
      [source.tasks[0]!.id]: [{ effectiveFromLogicalDate: "2026-08-17", taskType: "task" as const, customRulesetId: null }],
    },
  };

  const originalFingerprint = createActiveStatusReadInputFingerprint(sourceRevision);
  for (const changed of [changedSource, changedLogicalDay, changedTimezone, changedRollover, changedPolicy]) {
    assert.notEqual(createActiveStatusReadInputFingerprint(changed), originalFingerprint);
  }
});
