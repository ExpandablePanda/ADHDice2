import assert from "node:assert/strict";
import test from "node:test";

import { createTask } from "../src/lib/task-buckets.ts";
import { mapCanonicalTaskHistoryFact } from "../src/lib/task-state-canonical/history-projection.ts";
import { buildCanonicalTaskStateEngineInput } from "../src/lib/task-state-canonical/engine-input.ts";
import type { CanonicalTaskHistoryFact, CanonicalTaskScheduleBoundary } from "../src/lib/task-state-canonical/types.ts";
import { projectTaskWithCanonicalScheduleBoundary } from "../src/lib/task-state-canonical/schedule-projection.ts";
import type { CanonicalTaskStateReadModel } from "../src/lib/task-state-canonical/read-model.ts";
import { createEngineRolloverPlan } from "../src/lib/task-state-engine/rollover-authority.ts";
import { resolveActiveTaskStatuses } from "../src/lib/task-state-engine/read-authority.ts";
import { resolveTaskHistoryCalendarRead } from "../src/lib/task-state-engine/calendar-authority.ts";

const CONTEXT = { logicalDayRollover: "00:00", now: "2026-08-18T12:00:00.000Z", timezone: "UTC" };

function boundary(taskId: string, scheduleModel: CanonicalTaskScheduleBoundary["schedule_model"]): CanonicalTaskScheduleBoundary {
  return {
    id: `${taskId}:boundary`, user_id: "user-1", entity_id: taskId, entity_kind: "parent",
    effective_from_logical_date: "2026-08-01", boundary_sequence: 1, boundary_type: "initial",
    schedule_model: scheduleModel, repeat_frequency: scheduleModel === "unscheduled" ? "none" : "daily",
    repeat_interval: 1, repeat_days_of_week: [], repeat_day_of_month: null, repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null, repeat_monthly_weekday: null, one_time_due_on: scheduleModel === "one_time" ? "2026-08-17" : null,
    due_time: null, anchor_date: scheduleModel === "unscheduled" ? null : "2026-08-17", anchor_kind: "user_selected",
    anchor_confidence: "proven", historical_scope_known: true, prospective_only: false, prior_boundary_id: null,
    affected_occurrence_id: null, logical_day_settings_revision: 1, timezone: "UTC", day_start_time: "00:00",
    actor_kind: "user", actor_id: "user-1", source: "test", command_id: null, idempotence_identity: `${taskId}:boundary`,
    schema_contract_version: "task-state-schema-v1",
    source_task_revision: 1, revision: 1, created_at: "2026-08-01T12:00:00.000Z", updated_at: "2026-08-01T12:00:00.000Z",
  };
}

function canonicalTask(taskId: string, overrides: Record<string, unknown> = {}) {
  return {
    ...createTask({ id: taskId, title: "Final cutover", status: "missed", due_on: "2026-08-01", repeat_frequency: "daily", repeat_interval: 1 }),
    canonicalization_status: "canonical_runtime", entity_kind: "parent", terminal_state: "active", container_state: "active",
    prior_container_state: null, prior_container_state_status: "not_applicable", workflow_state: "none", workflow_revision: 1,
    canonical_revision: 1, canonical_created_at: "2026-08-01T12:00:00.000Z", canonical_updated_at: "2026-08-01T12:00:00.000Z",
    projection_source_canonical_revision: 1, projection_source_fingerprint: "test", projection_version: "task-state-projection-v1",
    ...overrides,
  };
}

function fact(taskId: string, logicalDate: string, outcome: CanonicalTaskHistoryFact["outcome"]): CanonicalTaskHistoryFact {
  return {
    id: `${taskId}:${logicalDate}`, user_id: "user-1", entity_id: taskId, entity_kind: "parent", logical_date: logicalDate,
    outcome, event_kind: outcome === "complete" ? "terminal_complete" : "explicit_outcome", occurrence_id: null,
    scheduled_due_on: null, effective_due_on: null, schedule_boundary_id: null, recurrence_source_fingerprint: null,
    provenance_kind: "user", actor_kind: "user", actor_id: "user-1", source: "test", logical_day_settings_revision: 1,
    timezone: "UTC", day_start_time: "00:00", command_id: "00000000-0000-4000-8000-000000000001",
    idempotence_identity: `${taskId}:${logicalDate}`, source_legacy_history_id: null, revision: 1,
    created_at: `${logicalDate}T12:00:00.000Z`, updated_at: `${logicalDate}T12:00:00.000Z`,
  };
}

test("canonical schedule boundary wins over stale raw repeat and due compatibility fields", () => {
  const source = canonicalTask("unscheduled", { due_on: "2026-08-01", repeat_frequency: "daily", status: "missed" });
  const projected = projectTaskWithCanonicalScheduleBoundary(source, boundary(source.id, "unscheduled"));
  const result = resolveActiveTaskStatuses({
    historyByTaskId: { [source.id]: [] }, tasks: [projected], ...CONTEXT,
  });
  assert.equal(result.statusesByTaskId[source.id], "unscheduled");
});

test("canonical History remains visible without legacy History input", () => {
  const source = canonicalTask("history-only", { status: "missed" });
  const projected = projectTaskWithCanonicalScheduleBoundary(source, boundary(source.id, "one_time"));
  const history = [mapCanonicalTaskHistoryFact(fact(source.id, "2026-08-17", "done"))];
  const calendar = resolveTaskHistoryCalendarRead({
    ...CONTEXT, calendarStart: "2026-08-17", calendarEnd: "2026-08-18", history, task: projected,
  });
  assert.equal(calendar?.states["2026-08-17"], "done");
});

test("rollover does not re-plan a canonical fact from an omitted legacy-only row", () => {
  const source = canonicalTask("rollover-history", { status: "missed" });
  const projected = projectTaskWithCanonicalScheduleBoundary(source, boundary(source.id, "one_time"));
  const history = [mapCanonicalTaskHistoryFact(fact(source.id, "2026-08-17", "done"))];
  const plan = createEngineRolloverPlan({ ...CONTEXT, history, rolloverTime: "00:00", tasks: [projected] });
  assert.equal(plan.tasks.find((entry) => entry.taskId === source.id)?.history.length ?? 0, 0);
});

test("canonical engine input ignores stale raw Task.status", () => {
  const source = canonicalTask("canonical-input", { status: "missed", due_on: "2026-08-01", repeat_frequency: "daily" });
  const readModel = {
    task: source,
    commandOperations: [], scheduleBoundaries: [boundary(source.id, "unscheduled")], occurrences: [],
    occurrenceEffectiveOverrides: [], historyFacts: [], calendarOverrides: [], rewardEntitlements: [], rewardGrants: [],
    rewardClaimConsumptions: [], legacyHistoryEvidence: [], logicalDayProfile: { timezone: "UTC", day_start_time: "00:00", settings_revision: 1 },
  } as unknown as CanonicalTaskStateReadModel;
  assert.equal(buildCanonicalTaskStateEngineInput(readModel, CONTEXT).task.activeStatus, "pending");
});
