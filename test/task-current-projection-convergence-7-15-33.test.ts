import assert from "node:assert/strict";
import test from "node:test";

import { createTask } from "../src/lib/task-buckets.ts";
import type { Task } from "../src/lib/database.types.ts";
import {
  buildCurrentTaskProjection,
  type BuildCurrentTaskProjectionInput,
} from "../src/lib/task-current-projection.ts";
import {
  mapCanonicalTaskHistoryFacts,
  normalizeCanonicalActiveStatusHistoryRows,
} from "../src/lib/task-state-canonical/history-projection.ts";
import { buildCanonicalTaskStateEngineInput } from "../src/lib/task-state-canonical/engine-input.ts";
import type { CanonicalTaskStateReadModel } from "../src/lib/task-state-canonical/read-model.ts";
import type {
  CanonicalTaskHistoryFact,
  CanonicalTaskOccurrence,
  CanonicalTaskOccurrenceEffectiveOverride,
  CanonicalTaskScheduleBoundary,
  CanonicalTaskStateColumns,
} from "../src/lib/task-state-canonical/types.ts";
import { resolveActiveTaskStatuses } from "../src/lib/task-state-canonical/active-status-read.ts";
import { evaluateTaskState } from "../src/lib/task-state-engine/engine.ts";

const USER_ID = "00000000-0000-0000-0000-000000000001";
const PROJECTED_AT = "2026-09-23T16:00:00.000Z";
const TIMEZONE = "America/New_York";
const DAY_START = "06:00";

const IDS = {
  delayed: "233e433a-445a-467d-be9a-6ff2406d8c69",
  rollingStatusAndDue: "efc9690e-fbfa-4687-b9a4-c7e3a0399c94",
  rollingDueOnly: "e1ab421e-d75b-413c-b2cf-2fa86c66699d",
  weeklyDueOnly: "34559ec3-eab3-4ae3-98fc-691be8357975",
} as const;

type Fixture = {
  id: string;
  task: Task & CanonicalTaskStateColumns & { canonical_schedule_boundary: CanonicalTaskScheduleBoundary };
  readModel: CanonicalTaskStateReadModel;
};

function boundary(
  taskId: string,
  options: Pick<CanonicalTaskScheduleBoundary, "schedule_model" | "repeat_frequency" | "repeat_interval" | "repeat_days_of_week" | "anchor_date">,
  overrides: Partial<CanonicalTaskScheduleBoundary> = {},
): CanonicalTaskScheduleBoundary {
  return {
    actor_id: USER_ID,
    actor_kind: "user",
    affected_occurrence_id: null,
    anchor_confidence: "proven",
    anchor_date: options.anchor_date,
    anchor_kind: "user_selected",
    boundary_sequence: 1,
    boundary_type: "initial",
    command_id: null,
    created_at: "2026-01-01T12:00:00.000Z",
    day_start_time: DAY_START,
    due_time: null,
    effective_from_logical_date: "2026-01-01",
    entity_id: taskId,
    entity_kind: "parent",
    historical_scope_known: true,
    id: `boundary-${taskId}`,
    idempotence_identity: `boundary-${taskId}`,
    logical_day_settings_revision: 1,
    one_time_due_on: null,
    prior_boundary_id: null,
    prospective_only: false,
    repeat_day_of_month: null,
    repeat_days_of_week: options.repeat_days_of_week,
    repeat_frequency: options.repeat_frequency,
    repeat_interval: options.repeat_interval,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
    revision: 1,
    schedule_model: options.schedule_model,
    source: "fixture",
    source_task_revision: 1,
    timezone: TIMEZONE,
    updated_at: "2026-01-01T12:00:00.000Z",
    user_id: USER_ID,
    ...overrides,
  };
}

function fact(
  taskId: string,
  logicalDate: string,
  outcome: CanonicalTaskHistoryFact["outcome"],
  index: number,
  overrides: Partial<CanonicalTaskHistoryFact> = {},
): CanonicalTaskHistoryFact {
  return {
    actor_id: USER_ID,
    actor_kind: "user",
    command_id: `command-${taskId}-${index}`,
    created_at: `${logicalDate}T12:00:00.000Z`,
    day_start_time: DAY_START,
    effective_due_on: null,
    entity_id: taskId,
    entity_kind: "parent",
    event_kind: outcome === "delayed" ? "delay_audit" : "explicit_outcome",
    id: `fact-${taskId}-${index}`,
    idempotence_identity: `fact-${taskId}-${index}`,
    logical_date: logicalDate,
    logical_day_settings_revision: 1,
    occurrence_id: null,
    outcome,
    provenance_kind: "user",
    recurrence_source_fingerprint: null,
    revision: index,
    schedule_boundary_id: `boundary-${taskId}`,
    source: "fixture",
    source_legacy_history_id: null,
    timezone: TIMEZONE,
    updated_at: `${logicalDate}T12:00:00.000Z`,
    user_id: USER_ID,
    scheduled_due_on: null,
    ...overrides,
  };
}

function occurrence(
  taskId: string,
  scheduledDueOn: string,
  overrides: Partial<CanonicalTaskOccurrence> = {},
): CanonicalTaskOccurrence {
  return {
    actor_id: USER_ID,
    actor_kind: "user",
    command_id: "command-occurrence",
    created_at: `${scheduledDueOn}T12:00:00.000Z`,
    entity_id: taskId,
    entity_kind: "parent",
    id: `occurrence-${taskId}`,
    materialization_reason: "delay",
    occurrence_key: `task:${taskId}:occurrence:${scheduledDueOn}`,
    origin_confidence: "proven",
    origin_kind: "proven",
    provenance_kind: "user",
    recurrence_source_fingerprint: "fixture-fingerprint",
    resolution_state: "resolved",
    resolved_history_id: `fact-${taskId}-1`,
    resolved_logical_date: "2026-08-30",
    resolved_outcome: "delayed",
    revision: 1,
    scheduled_due_on: scheduledDueOn,
    source: "fixture",
    source_boundary_id: `boundary-${taskId}`,
    updated_at: "2026-08-30T12:00:00.000Z",
    user_id: USER_ID,
    ...overrides,
  };
}

function task(
  id: string,
  overrides: Partial<Task> & Partial<CanonicalTaskStateColumns> & { canonical_schedule_boundary: CanonicalTaskScheduleBoundary },
) {
  return {
    ...createTask({
      created_at: "2026-01-01T12:00:00.000Z",
      due_on: "2026-09-24",
      id,
      repeat_frequency: "daily",
      sort_order: 0,
      status: "pending",
      title: "Fixture",
      user_id: USER_ID,
    }),
    active_occurrence_due_on: null,
    active_status_logical_date: null,
    canonical_revision: 12,
    canonicalization_status: "canonical_runtime",
    canonical_schedule_boundary: overrides.canonical_schedule_boundary,
    container_state: "active",
    entity_kind: "parent",
    terminal_state: "active",
    workflow_command_id: null,
    workflow_logical_date: null,
    workflow_occurrence_id: null,
    workflow_revision: null,
    workflow_state: "none",
    ...overrides,
  } as Task & CanonicalTaskStateColumns & { canonical_schedule_boundary: CanonicalTaskScheduleBoundary };
}

function readModel(
  sourceTask: Fixture["task"],
  historyFacts: CanonicalTaskHistoryFact[],
  occurrences: CanonicalTaskOccurrence[] = [],
  calendarOverrides: CanonicalTaskStateReadModel["calendarOverrides"] = [],
  occurrenceEffectiveOverrides: CanonicalTaskOccurrenceEffectiveOverride[] = [],
  scheduleBoundaries: CanonicalTaskScheduleBoundary[] = [sourceTask.canonical_schedule_boundary],
): CanonicalTaskStateReadModel {
  return {
    task: sourceTask,
    commandOperations: [],
    scheduleBoundaries,
    occurrences,
    occurrenceEffectiveOverrides,
    historyFacts,
    calendarOverrides,
    rewardEntitlements: [],
    rewardGrants: [],
    rewardClaimConsumptions: [],
    behaviorSelections: [],
    logicalDayProfile: {
      day_start_time: DAY_START,
      settings_revision: 1,
      timezone: TIMEZONE,
    },
  };
}

function buildFixtures(): Fixture[] {
  const rollingStatusAndDueBoundaries = [
    boundary(IDS.rollingStatusAndDue, {
      anchor_date: null,
      repeat_days_of_week: [],
      repeat_frequency: "none",
      repeat_interval: 1,
      schedule_model: "unscheduled",
    }, {
      anchor_confidence: "unavailable",
      anchor_kind: "unknown",
      boundary_sequence: 1,
      effective_from_logical_date: "2026-08-26",
      historical_scope_known: false,
      id: "efc-boundary-1",
      idempotence_identity: "efc-boundary-1",
      prospective_only: true,
    }),
    boundary(IDS.rollingStatusAndDue, {
      anchor_date: null,
      repeat_days_of_week: [],
      repeat_frequency: "daily",
      repeat_interval: 1,
      schedule_model: "rolling",
    }, {
      anchor_confidence: "unavailable",
      anchor_kind: "unknown",
      boundary_sequence: 2,
      boundary_type: "repeat_change",
      effective_from_logical_date: "2026-09-21",
      historical_scope_known: false,
      id: "efc-boundary-2",
      idempotence_identity: "efc-boundary-2",
      prospective_only: true,
    }),
    boundary(IDS.rollingStatusAndDue, {
      anchor_date: null,
      repeat_days_of_week: [],
      repeat_frequency: "daily",
      repeat_interval: 2,
      schedule_model: "rolling",
    }, {
      anchor_confidence: "unavailable",
      anchor_kind: "unknown",
      boundary_sequence: 3,
      boundary_type: "repeat_change",
      effective_from_logical_date: "2026-09-21",
      historical_scope_known: false,
      id: "efc-boundary-3",
      idempotence_identity: "efc-boundary-3",
      prospective_only: true,
    }),
    boundary(IDS.rollingStatusAndDue, {
      anchor_date: "2026-09-19",
      repeat_days_of_week: [],
      repeat_frequency: "daily",
      repeat_interval: 2,
      schedule_model: "rolling",
    }, {
      boundary_sequence: 4,
      boundary_type: "due_date_change",
      effective_from_logical_date: "2026-09-21",
      id: "efc-boundary-4",
      idempotence_identity: "efc-boundary-4",
    }),
  ];
  const rollingStatusAndDueBoundary = rollingStatusAndDueBoundaries.at(-1)!;

  const rollingDueOnlyBoundaries = [
    boundary(IDS.rollingDueOnly, {
      anchor_date: null,
      repeat_days_of_week: [],
      repeat_frequency: "none",
      repeat_interval: 1,
      schedule_model: "unscheduled",
    }, {
      anchor_confidence: "unavailable",
      anchor_kind: "unknown",
      boundary_sequence: 1,
      effective_from_logical_date: "2026-09-21",
      historical_scope_known: false,
      id: "e1ab-boundary-1",
      idempotence_identity: "e1ab-boundary-1",
      prospective_only: true,
    }),
    boundary(IDS.rollingDueOnly, {
      anchor_date: null,
      repeat_days_of_week: [],
      repeat_frequency: "none",
      repeat_interval: 1,
      schedule_model: "one_time",
    }, {
      boundary_sequence: 2,
      boundary_type: "due_date_change",
      effective_from_logical_date: "2026-09-21",
      id: "e1ab-boundary-2",
      idempotence_identity: "e1ab-boundary-2",
      one_time_due_on: "2026-09-14",
    }),
    boundary(IDS.rollingDueOnly, {
      anchor_date: "2026-09-14",
      repeat_days_of_week: [],
      repeat_frequency: "daily",
      repeat_interval: 1,
      schedule_model: "rolling",
    }, {
      boundary_sequence: 3,
      boundary_type: "repeat_change",
      effective_from_logical_date: "2026-09-21",
      id: "e1ab-boundary-3",
      idempotence_identity: "e1ab-boundary-3",
    }),
    boundary(IDS.rollingDueOnly, {
      anchor_date: "2026-09-14",
      repeat_days_of_week: [],
      repeat_frequency: "daily",
      repeat_interval: 2,
      schedule_model: "rolling",
    }, {
      boundary_sequence: 4,
      boundary_type: "repeat_change",
      effective_from_logical_date: "2026-09-21",
      id: "e1ab-boundary-4",
      idempotence_identity: "e1ab-boundary-4",
    }),
  ];
  const rollingDueOnlyBoundary = rollingDueOnlyBoundaries.at(-1)!;

  const weeklyBoundaries = [
    boundary(IDS.weeklyDueOnly, {
      anchor_date: null,
      repeat_days_of_week: [],
      repeat_frequency: "none",
      repeat_interval: 1,
      schedule_model: "unscheduled",
    }, {
      anchor_confidence: "unavailable",
      anchor_kind: "unknown",
      boundary_sequence: 1,
      effective_from_logical_date: "2026-08-26",
      historical_scope_known: false,
      id: "weekly-boundary-1",
      idempotence_identity: "weekly-boundary-1",
      prospective_only: true,
    }),
    boundary(IDS.weeklyDueOnly, {
      anchor_date: null,
      repeat_days_of_week: [],
      repeat_frequency: "none",
      repeat_interval: 1,
      schedule_model: "one_time",
    }, {
      boundary_sequence: 2,
      boundary_type: "due_date_change",
      effective_from_logical_date: "2026-08-26",
      id: "weekly-boundary-2",
      idempotence_identity: "weekly-boundary-2",
      one_time_due_on: "2026-08-26",
    }),
    boundary(IDS.weeklyDueOnly, {
      anchor_date: "2026-08-26",
      repeat_days_of_week: [],
      repeat_frequency: "daily",
      repeat_interval: 1,
      schedule_model: "rolling",
    }, {
      boundary_sequence: 3,
      boundary_type: "repeat_change",
      effective_from_logical_date: "2026-08-26",
      id: "weekly-boundary-3",
      idempotence_identity: "weekly-boundary-3",
    }),
    boundary(IDS.weeklyDueOnly, {
      anchor_date: "2026-09-12",
      repeat_days_of_week: [1, 2, 3, 4, 5],
      repeat_frequency: "weekly",
      repeat_interval: 1,
      schedule_model: "fixed",
    }, {
      boundary_sequence: 4,
      boundary_type: "repeat_change",
      effective_from_logical_date: "2026-09-11",
      id: "weekly-boundary-4",
      idempotence_identity: "weekly-boundary-4",
    }),
  ];
  const weeklyBoundary = weeklyBoundaries.at(-1)!;

  const delayedBoundaries = [
    boundary(IDS.delayed, {
      anchor_date: null,
      repeat_days_of_week: [],
      repeat_frequency: "none",
      repeat_interval: 1,
      schedule_model: "unscheduled",
    }, {
      anchor_confidence: "unavailable",
      anchor_kind: "unknown",
      boundary_sequence: 1,
      effective_from_logical_date: "2026-08-26",
      historical_scope_known: false,
      id: "delayed-boundary-1",
      idempotence_identity: "delayed-boundary-1",
      prospective_only: true,
    }),
    boundary(IDS.delayed, {
      anchor_date: null,
      repeat_days_of_week: [],
      repeat_frequency: "none",
      repeat_interval: 1,
      schedule_model: "one_time",
    }, {
      boundary_sequence: 2,
      boundary_type: "due_date_change",
      effective_from_logical_date: "2026-08-26",
      id: "delayed-boundary-2",
      idempotence_identity: "delayed-boundary-2",
      one_time_due_on: "2026-08-26",
    }),
    boundary(IDS.delayed, {
      anchor_date: "2026-08-26",
      repeat_days_of_week: [],
      repeat_frequency: "daily",
      repeat_interval: 1,
      schedule_model: "rolling",
    }, {
      boundary_sequence: 3,
      boundary_type: "repeat_change",
      effective_from_logical_date: "2026-08-26",
      id: "delayed-boundary-3",
      idempotence_identity: "delayed-boundary-3",
    }),
    boundary(IDS.delayed, {
      anchor_date: "2026-08-26",
      repeat_days_of_week: [],
      repeat_frequency: "daily",
      repeat_interval: 2,
      schedule_model: "rolling",
    }, {
      boundary_sequence: 4,
      boundary_type: "repeat_change",
      effective_from_logical_date: "2026-08-26",
      id: "delayed-boundary-4",
      idempotence_identity: "delayed-boundary-4",
    }),
    boundary(IDS.delayed, {
      anchor_date: "2026-08-31",
      repeat_days_of_week: [],
      repeat_frequency: "daily",
      repeat_interval: 2,
      schedule_model: "rolling",
    }, {
      boundary_sequence: 5,
      boundary_type: "due_date_change",
      effective_from_logical_date: "2026-08-30",
      id: "delayed-boundary-5",
      idempotence_identity: "delayed-boundary-5",
    }),
  ];
  const delayedBoundary = delayedBoundaries.at(-1)!;

  const delayedOccurrence = occurrence(IDS.delayed, "2026-08-28");
  const delayedFact = fact(IDS.delayed, "2026-08-30", "delayed", 1, {
    effective_due_on: "2026-12-29",
    occurrence_id: delayedOccurrence.id,
    scheduled_due_on: "2026-08-28",
  });
  const delayedEffectiveOverride: CanonicalTaskOccurrenceEffectiveOverride = {
    accepted_payload_digest: "fixture-payload",
    action_logical_date: "2026-08-30",
    actor_id: USER_ID,
    actor_kind: "user",
    command_id: "command-delay",
    created_at: "2026-08-30T12:00:00.000Z",
    delay_kind: "delay",
    effective_due_on: "2026-12-29",
    entity_id: IDS.delayed,
    history_id: delayedFact.id,
    id: "override-delay-effective",
    idempotence_identity: "override-delay-effective",
    occurrence_id: delayedOccurrence.id,
    override_sequence: 1,
    prior_override_id: null,
    prior_override_sequence: null,
    provenance_kind: "user",
    revision: 1,
    scheduled_due_on: "2026-08-28",
    schedule_boundary_id: delayedBoundary.id,
    source: "fixture",
    updated_at: "2026-08-30T12:00:00.000Z",
    user_id: USER_ID,
  };

  const delayedTask = task(IDS.delayed, {
    canonical_schedule_boundary: delayedBoundary,
    due_on: "2026-12-29",
    repeat_frequency: "daily",
    repeat_interval: 2,
    status: "delayed",
    task_type: "custom",
  });

  return [
    {
      id: IDS.rollingStatusAndDue,
      task: task(IDS.rollingStatusAndDue, {
        canonical_schedule_boundary: rollingStatusAndDueBoundary,
        due_on: "2026-09-24",
        repeat_frequency: "daily",
        repeat_interval: 2,
        task_type: "custom",
      }),
      readModel: readModel(
        task(IDS.rollingStatusAndDue, {
          canonical_schedule_boundary: rollingStatusAndDueBoundary,
          due_on: "2026-09-24",
          repeat_frequency: "daily",
          repeat_interval: 2,
          task_type: "custom",
        }),
        [
          fact(IDS.rollingStatusAndDue, "2026-09-21", "done", 1, { scheduled_due_on: "2026-09-22" }),
          fact(IDS.rollingStatusAndDue, "2026-09-22", "done", 2, { scheduled_due_on: "2026-09-23" }),
        ],
        [],
        [],
        [],
        rollingStatusAndDueBoundaries,
      ),
    },
    {
      id: IDS.rollingDueOnly,
      task: task(IDS.rollingDueOnly, {
        canonical_schedule_boundary: rollingDueOnlyBoundary,
        due_on: "2026-09-25",
        repeat_frequency: "daily",
        repeat_interval: 2,
        task_type: "custom",
      }),
      readModel: readModel(
        task(IDS.rollingDueOnly, {
          canonical_schedule_boundary: rollingDueOnlyBoundary,
          due_on: "2026-09-25",
          repeat_frequency: "daily",
          repeat_interval: 2,
          task_type: "custom",
        }),
        [
          ...["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-20"].map((date, index) => (
            fact(IDS.rollingDueOnly, date, "done", index + 1)
          )),
          fact(IDS.rollingDueOnly, "2026-09-21", "done", 7, { scheduled_due_on: "2026-09-22" }),
          fact(IDS.rollingDueOnly, "2026-09-22", "done", 8),
          fact(IDS.rollingDueOnly, "2026-09-23", "done", 9, { scheduled_due_on: "2026-09-23" }),
        ],
        [],
        [],
        [],
        rollingDueOnlyBoundaries,
      ),
    },
    {
      id: IDS.weeklyDueOnly,
      task: task(IDS.weeklyDueOnly, {
        canonical_schedule_boundary: weeklyBoundary,
        due_on: "2026-09-12",
        repeat_frequency: "weekly",
        repeat_days_of_week: [1, 2, 3, 4, 5],
        repeat_interval: 1,
        task_type: "task",
      }),
      readModel: readModel(
        task(IDS.weeklyDueOnly, {
          canonical_schedule_boundary: weeklyBoundary,
          due_on: "2026-09-12",
          repeat_frequency: "weekly",
          repeat_days_of_week: [1, 2, 3, 4, 5],
          repeat_interval: 1,
        }),
        ["2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30", "2026-08-31", "2026-09-01", "2026-09-05", "2026-09-09", "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-21", "2026-09-22"].map((date, index) => (
          fact(IDS.weeklyDueOnly, date, "missed", index + 1, { scheduled_due_on: date, provenance_kind: "authorized_automation", event_kind: "authorized_automation" })
        )),
        [],
        [],
        [],
        weeklyBoundaries,
      ),
    },
    {
      id: IDS.delayed,
      task: delayedTask,
      readModel: readModel(
        delayedTask,
        [delayedFact],
        [delayedOccurrence],
        [{
          actor_id: USER_ID,
          actor_kind: "user",
          cleared_at: null,
          cleared_by_command_id: null,
          command_id: "command-calendar",
          created_at: "2026-08-30T12:00:00.000Z",
          entity_id: IDS.delayed,
          entity_kind: "parent",
          id: "calendar-override-delayed",
          idempotence_identity: "calendar-override-delayed",
          is_active: true,
          logical_date: "2026-08-30",
          override_state: "not_due",
          provenance_kind: "manual",
          reason: "fixture",
          revision: 1,
          source: "fixture",
          updated_at: "2026-08-30T12:00:00.000Z",
          user_id: USER_ID,
        }],
        [delayedEffectiveOverride],
        delayedBoundaries,
      ),
    },
  ];
}

function currentParity(fixture: Fixture) {
  const facts = fixture.readModel.historyFacts;
  const legacyHistory = mapCanonicalTaskHistoryFacts(facts);
  const legacy = resolveActiveTaskStatuses({
    historyByTaskId: { [fixture.id]: legacyHistory },
    logicalDayRollover: DAY_START,
    now: PROJECTED_AT,
    tasks: [fixture.task],
    timezone: TIMEZONE,
  });
  const projection = buildCurrentTaskProjection({
    behaviorContext: {},
    historyFence: { sourceRevision: 0, syncEpoch: "fixture-epoch", frontier: null },
    projectedAt: PROJECTED_AT,
    readModel: fixture.readModel,
  } satisfies BuildCurrentTaskProjectionInput);
  return {
    legacy: {
      status: legacy.statusesByTaskId[fixture.id],
      dueOn: legacy.dueOnByTaskId[fixture.id],
      history: legacyHistory.map((row) => ({ occurrence_key: row.occurrence_key, occurrence_due_on: row.occurrence_due_on })),
    },
    projection: {
      status: projection.display_status,
      nextDueOn: projection.next_due_on,
      currentEffectiveDueOn: projection.current_effective_due_on,
      history: fixture.readModel.historyFacts.map((row) => ({ occurrence_id: row.occurrence_id, scheduled_due_on: row.scheduled_due_on })),
    },
  };
}

test("7.15.33 locks the four live-derived source shapes and converges both reads", () => {
  const fixtures = buildFixtures();
  assert.deepEqual(fixtures.map(({ id }) => id), [
    IDS.rollingStatusAndDue,
    IDS.rollingDueOnly,
    IDS.weeklyDueOnly,
    IDS.delayed,
  ]);
  const expected = {
    [IDS.rollingStatusAndDue]: { status: "upcoming", dueOn: "2026-09-24" },
    [IDS.rollingDueOnly]: { status: "upcoming", dueOn: "2026-09-25" },
    [IDS.weeklyDueOnly]: { status: "missed", dueOn: "2026-09-12" },
    [IDS.delayed]: { status: "delayed", dueOn: "2026-12-29" },
  } as const;
  for (const fixture of fixtures) {
    const parity = currentParity(fixture);
    assert.deepEqual(
      { status: parity.legacy.status, dueOn: parity.legacy.dueOn },
      { status: parity.projection.status, dueOn: parity.projection.nextDueOn },
      fixture.id,
    );
    assert.deepEqual(
      { status: parity.projection.status, dueOn: parity.projection.nextDueOn },
      expected[fixture.id as keyof typeof expected],
      fixture.id,
    );
  }

  const metadataOnly = fixtures
    .filter(({ id }) => id !== IDS.delayed)
    .flatMap(({ readModel }) => normalizeCanonicalActiveStatusHistoryRows(mapCanonicalTaskHistoryFacts(readModel.historyFacts)));
  assert.ok(metadataOnly.length > 0);
  assert.ok(metadataOnly.every((row) => row.canonical_occurrence_id === null && row.occurrence_key === null));

  const delayed = fixtures.find(({ id }) => id === IDS.delayed)!;
  const delayedHistory = mapCanonicalTaskHistoryFacts(delayed.readModel.historyFacts);
  const normalizedDelayedHistory = normalizeCanonicalActiveStatusHistoryRows(delayedHistory);
  assert.equal(normalizedDelayedHistory[0]?.occurrence_key, delayedHistory[0]?.occurrence_key);
  assert.equal(currentParity(delayed).projection.currentEffectiveDueOn, "2026-12-29");

  const overrideOnlyProjection = buildCurrentTaskProjection({
    behaviorContext: {},
    historyFence: { sourceRevision: 0, syncEpoch: "fixture-epoch", frontier: null },
    projectedAt: PROJECTED_AT,
    readModel: {
      ...delayed.readModel,
      historyFacts: delayed.readModel.historyFacts.map((row) => ({ ...row, effective_due_on: null })),
    },
  });
  assert.equal(overrideOnlyProjection.display_status, "delayed");
  assert.equal(overrideOnlyProjection.next_due_on, "2026-12-29");
});

test("7.15.33 makes empty Calendar overrides neutral and preserves non-empty authority", () => {
  const fixture = buildFixtures().find(({ id }) => id === IDS.rollingStatusAndDue)!;
  const canonicalInput = buildCanonicalTaskStateEngineInput(fixture.readModel, {
    logicalDayRollover: DAY_START,
    now: PROJECTED_AT,
    timezone: TIMEZONE,
  });
  const withEmpty = evaluateTaskState(canonicalInput);
  const withoutCalendar = evaluateTaskState({ ...canonicalInput, calendarOverrides: undefined });
  assert.deepEqual(
    {
      status: withEmpty.activeStatus,
      dueOn: withEmpty.nextDueDate,
      effectiveDueOn: withEmpty.timeline.activeOccurrenceDueOn,
    },
    {
      status: withoutCalendar.activeStatus,
      dueOn: withoutCalendar.nextDueDate,
      effectiveDueOn: withoutCalendar.timeline.activeOccurrenceDueOn,
    },
  );

  const withNotDue = evaluateTaskState({
    ...canonicalInput,
    calendarOverrides: [{
      id: "fixture-not-due",
      logicalDate: "2026-09-24",
      overrideState: "not_due",
      provenance: "manual",
    }],
  });
  assert.notEqual(withNotDue.nextDueDate, withoutCalendar.nextDueDate);
});
