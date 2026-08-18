import assert from "node:assert/strict";
import test from "node:test";
import { evaluateTaskState } from "../src/lib/task-state-engine/engine.ts";
import { planTaskStateCommand, serializeCanonicalTaskStateCommandForRpc } from "../src/lib/task-state-canonical/command-service.ts";
import { validateTaskStateCommandIntent } from "../supabase/functions/task-state-command/domain.ts";
import type { TaskStateEngineInput, TaskStateHistoryRow } from "../src/lib/task-state-engine/types.ts";
import type { CanonicalTaskRow } from "../src/lib/task-state-canonical/read-model.ts";

const NOW = "2026-08-17T12:00:00.000Z";

function history(logicalDate: string, provenance: TaskStateHistoryRow["provenance"] = "rollover", occurrenceDueOn = logicalDate): TaskStateHistoryRow {
  return {
    id: `00000000-0000-4000-8000-${logicalDate.replaceAll("-", "").padStart(12, "0")}`,
    taskId: "task-1",
    logicalDate,
    outcome: "missed",
    provenance,
    occurredAt: `${logicalDate}T12:00:00.000Z`,
    occurrenceIdentity: `task:task-1:occurrence:${occurrenceDueOn}`,
    occurrenceDueOn,
  };
}

function engineInput(overrides: Partial<TaskStateEngineInput["task"]> = {}, rows: TaskStateHistoryRow[] = []): TaskStateEngineInput {
  return {
    task: {
      id: "task-1",
      lifecycle: "active",
      activeStatus: "pending",
      dueOn: "2026-08-14",
      historicalScheduleAnchor: "2026-08-14",
      historicalScheduleAnchorProven: true,
      recurrence: { kind: "rolling", intervalDays: 1 },
      ...overrides,
    },
    history: rows,
    now: NOW,
    timezone: "America/New_York",
    logicalDayRollover: "06:00",
    action: { type: "reconcile_rollover" },
  };
}

function insertedMissed(input: TaskStateEngineInput) {
  return evaluateTaskState(input).proposedHistoryChanges.flatMap((change) => (
    change.type === "insert" && change.row.outcome === "missed" ? [change.row] : []
  ));
}

test("automatic Missed materializes passed Daily obligations but never today", () => {
  assert.deepEqual(insertedMissed(engineInput()).map((row) => row.logicalDate), ["2026-08-14", "2026-08-15", "2026-08-16"]);
  assert.equal(insertedMissed(engineInput({ dueOn: "2026-08-17", historicalScheduleAnchor: "2026-08-17" })).length, 0);
});

test("Unscheduled and zero-History schedules without a proven start create nothing", () => {
  assert.equal(insertedMissed(engineInput({ dueOn: null, historicalScheduleAnchor: null, historicalScheduleAnchorProven: false, recurrence: { kind: "none" } })).length, 0);
  assert.equal(insertedMissed(engineInput({ dueOn: null, historicalScheduleAnchor: "2026-08-14", historicalScheduleAnchorProven: false, recurrence: { kind: "rolling", intervalDays: 1 } })).length, 0);
});

test("zero-History recovery accepts the current due cursor and never crosses latest saved History", () => {
  assert.deepEqual(insertedMissed(engineInput()).map((row) => row.logicalDate), ["2026-08-14", "2026-08-15", "2026-08-16"]);
  const saved = { ...history("2026-08-14", "manual"), outcome: "done" as const };
  assert.deepEqual(insertedMissed(engineInput({}, [saved])).map((row) => row.logicalDate), ["2026-08-15", "2026-08-16"]);
});

test("independent Daily automatic Missed survives an earlier correction", () => {
  const rows = [history("2026-08-14"), history("2026-08-15"), history("2026-08-16")];
  const result = evaluateTaskState({
    ...engineInput({}, rows),
    action: { type: "record_outcome", logicalDate: "2026-08-14", outcome: "done", replaceExisting: true, previousOutcome: "missed", occurrenceDueOn: "2026-08-14", historicalOverride: true },
  });
  assert.deepEqual(result.proposedHistoryChanges.filter((change) => change.type === "delete"), []);
});

test("dependent rolling Auto Missed reconciles after its source correction while manual Missed remains", () => {
  const automatic = [history("2026-08-16", "rollover", "2026-08-16"), history("2026-08-17", "rollover", "2026-08-16")];
  const corrected = evaluateTaskState({
    ...engineInput({ dueOn: "2026-08-16", recurrence: { kind: "rolling", intervalDays: 3 } }, automatic),
    now: "2026-08-18T12:00:00.000Z",
    action: { type: "record_outcome", logicalDate: "2026-08-16", outcome: "done", replaceExisting: true, previousOutcome: "missed", occurrenceDueOn: "2026-08-16", historicalOverride: true },
  });
  assert.deepEqual(corrected.proposedHistoryChanges.flatMap((change) => change.type === "delete" ? [change.logicalDate] : []), ["2026-08-17"]);
  assert.equal(corrected.nextDueDate, "2026-08-19");

  const manual = [automatic[0]!, history("2026-08-17", "manual", "2026-08-16")];
  const preserved = evaluateTaskState({ ...engineInput({ dueOn: "2026-08-16", recurrence: { kind: "rolling", intervalDays: 3 } }, manual), now: "2026-08-18T12:00:00.000Z", action: correctedAction() });
  assert.equal(preserved.proposedHistoryChanges.some((change) => change.type === "delete"), false);
});

function correctedAction() {
  return { type: "record_outcome" as const, logicalDate: "2026-08-16", outcome: "done" as const, replaceExisting: true, previousOutcome: "missed" as const, occurrenceDueOn: "2026-08-16", historicalOverride: true };
}

test("stale In Progress still becomes one automatic Did My Best without Auto Missed", () => {
  const result = evaluateTaskState(engineInput({ activeStatus: "in_progress", activeStatusLogicalDate: "2026-08-16", activeOccurrenceDueOn: "2026-08-16", dueOn: "2026-08-16" }));
  const inserts = result.proposedHistoryChanges.flatMap((change) => change.type === "insert" ? [change.row] : []);
  assert.deepEqual(inserts.map((row) => [row.logicalDate, row.outcome]), [["2026-08-16", "did_my_best"]]);
});

test("browser intent cannot forge automation provenance or automatic persistence sections", () => {
  const base = { type: "reconcile_rollover", task_id: "task-1", replay_identity: "rollover-1" };
  assert.ok(validateTaskStateCommandIntent(base));
  assert.equal(validateTaskStateCommandIntent({ ...base, source_kind: "authorized_automation" }), null);
  assert.equal(validateTaskStateCommandIntent({ ...base, automatic_history_facts: [{ outcome: "missed" }] }), null);
});

test("Auto Missed retry is idempotent and produces no reward entitlement", () => {
  const first = insertedMissed(engineInput());
  assert.equal(insertedMissed(engineInput({}, first)).length, 0);

  const task = {
    id: "task-1", user_id: "owner-1", entity_kind: "parent", revision: 3, canonical_revision: 3,
    canonicalization_status: "canonical_runtime", terminal_state: "active", container_state: "active",
    prior_container_state: null, prior_container_state_status: "not_applicable", terminal_completed_at: null,
    container_trashed_at: null, workflow_state: "none", workflow_started_at: null, workflow_logical_date: null,
    workflow_occurrence_id: null, workflow_command_id: null, workflow_revision: 1, canonical_created_at: NOW,
    canonical_updated_at: NOW, projection_source_canonical_revision: 3, projection_source_fingerprint: "x", projection_version: "task-state-projection-v1",
    status: "pending", due_on: "2026-08-14", completed_at: null, active_status_logical_date: null, active_occurrence_due_on: null,
  } as unknown as CanonicalTaskRow;
  const plan = planTaskStateCommand({ task, engineInput: engineInput() }, {
    type: "rollover", userId: "owner-1", taskId: "task-1", entityKind: "parent", acceptedIntent: { type: "reconcile_rollover" },
    expectedRevision: 3, logicalDay: { identity: "day", logicalDate: "2026-08-17", timezone: "America/New_York", dayStartTime: "06:00", settingsRevision: 1 },
    idempotenceIdentity: "runtime:rollover-1", sourceKind: "authorized_automation", scheduleBoundaryId: "11111111-1111-4111-8111-111111111111",
  });
  const payload = serializeCanonicalTaskStateCommandForRpc(plan).payload as Record<string, unknown>;
  assert.equal(plan.normalizedResult.automaticHistoryFacts.length, 3);
  assert.equal(plan.normalizedResult.rewardEntitlement, null);
  assert.equal("reward_program_version" in payload, false);
  assert.equal((payload.automatic_history_facts as Array<Record<string, unknown>>).every((fact) => fact.provenance_kind === "authorized_automation"), true);
});
