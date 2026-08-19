import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createTask } from "../src/lib/task-buckets.ts";
import type { Task, TaskHistory } from "../src/lib/database.types.ts";
import { buildTaskHistoryLastHandledSummaryMap } from "../src/lib/task-history-last-handled.ts";
import type { CanonicalTaskCalendarOverride, CanonicalTaskCommandOperation } from "../src/lib/task-state-canonical/types.ts";

const taskId = "last-handled-task";

function task(overrides: Partial<Task> = {}) {
  return createTask({ created_at: "2026-08-01T09:00:00.000Z", id: taskId, sort_order: 0, status: "pending", title: "Last Handled", ...overrides });
}

function history(entryDate: string, status: TaskHistory["status"], overrides: Partial<TaskHistory> = {}): TaskHistory {
  return {
    counted_as_due_occurrence: true,
    created_at: `${entryDate}T09:00:00.000Z`,
    entry_date: entryDate,
    event_type: "status",
    id: `history-${entryDate}-${status}`,
    occurrence_due_on: entryDate,
    occurrence_key: `occurrence-${entryDate}`,
    status,
    task_id: taskId,
    updated_at: `${entryDate}T09:00:00.000Z`,
    user_id: "test-user",
    was_completed: status === "done" || status === "did_my_best" || status === "complete",
    ...overrides,
  };
}

function command(commandType: CanonicalTaskCommandOperation["command_type"], logicalDate: string, overrides: Partial<CanonicalTaskCommandOperation> = {}) {
  return {
    command_id: `command-${commandType}-${logicalDate}`,
    command_type: commandType,
    accepted_payload_digest: "sha256-0000000000000000000000000000000000000000000000000000000000000000",
    completed_at: `${logicalDate}T11:00:00.000Z`,
    conflict_code: null,
    created_at: `${logicalDate}T10:00:00.000Z`,
    entity_id: taskId,
    entity_kind: "parent",
    expected_boundary_sequence: null,
    expected_entity_revision: 1,
    expected_facts_fingerprint: null,
    expected_history_revision: null,
    expected_occurrence_revision: null,
    id: `operation-${commandType}-${logicalDate}`,
    idempotence_identity: `identity-${commandType}-${logicalDate}`,
    logical_day_context_identity: null,
    requested_logical_date: logicalDate,
    requested_occurrence_key: null,
    result_digest: null,
    result_references: {},
    schema_contract_version: "task-state-schema-v1",
    source_kind: "runtime",
    state: "committed",
    user_id: "test-user",
    ...overrides,
  } satisfies CanonicalTaskCommandOperation;
}

function override(logicalDate: string): CanonicalTaskCalendarOverride {
  return {
    actor_id: "test-user",
    actor_kind: "user",
    cleared_at: null,
    cleared_by_command_id: null,
    command_id: `override-command-${logicalDate}`,
    created_at: `${logicalDate}T08:00:00.000Z`,
    entity_id: taskId,
    entity_kind: "parent",
    id: `override-${logicalDate}`,
    idempotence_identity: `override-identity-${logicalDate}`,
    is_active: true,
    logical_date: logicalDate,
    override_state: "not_due",
    provenance_kind: "manual",
    reason: null,
    revision: 1,
    source: "task_state_command",
    updated_at: `${logicalDate}T08:00:00.000Z`,
    user_id: "test-user",
  };
}

test("Last Handled unions every manual command family and manual Not Due", () => {
  const operations = [
    command("start_in_progress", "2026-08-08"),
    command("delay_occurrence", "2026-08-09"),
    command("archive_task", "2026-08-10"),
    command("restore_task", "2026-08-11"),
    command("clear_in_progress", "2026-08-12"),
    command("trash_task", "2026-08-13"),
    command("clear_outcome", "2026-08-14"),
    command("complete_task", "2026-08-15"),
  ];
  const summary = buildTaskHistoryLastHandledSummaryMap(
    [task()],
    [history("2026-08-06", "done"), history("2026-08-07", "missed")],
    [override("2026-08-16")],
    operations,
    "2026-08-17",
  )[taskId];

  assert.deepEqual(summary, { dateKey: "2026-08-16", timestamp: "2026-08-16T08:00:00.000Z" });
});

test("Last Handled excludes calculated or non-manual command facts and preserves older workspace facts", () => {
  const summary = buildTaskHistoryLastHandledSummaryMap(
    [task()],
    [history("2026-07-01", "done"), history("2026-07-02", "missed", { canonical_provenance_kind: "migration_reconstruction" })],
    [],
    [
      command("reconcile_rollover", "2026-08-01"),
      command("set_repeat", "2026-08-02"),
      command("set_due_date", "2026-08-03"),
    ],
    "2026-08-17",
  )[taskId];

  assert.deepEqual(summary, { dateKey: "2026-07-01", timestamp: "2026-07-01T09:00:00.000Z" });
});

test("explicit Unscheduled is represented by its manual action-origin marker", () => {
  const summary = buildTaskHistoryLastHandledSummaryMap(
    [task()],
    [],
    [],
    [command("set_due_date", "2026-08-14", { result_references: { manual_action: "unscheduled_status" } })],
    "2026-08-15",
  )[taskId];

  assert.deepEqual(summary, { dateKey: "2026-08-14", timestamp: "2026-08-14T11:00:00.000Z" });
});

test("Unscheduled UI actions preserve the marker through the canonical due-date intent", () => {
  const tableSource = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");
  const listSource = readFileSync(new URL("../src/components/task-app/tasks-list-adapter.tsx", import.meta.url), "utf8");
  const runtimeSource = readFileSync(new URL("../src/lib/task-state-runtime-actions.ts", import.meta.url), "utf8");
  const domainSource = readFileSync(new URL("../supabase/functions/task-state-command/domain.ts", import.meta.url), "utf8");
  const rpcSource = readFileSync(new URL("../supabase/add_task_state_command_rpc.sql", import.meta.url), "utf8");

  assert.match(tableSource, /manualAction: "unscheduled_status"/);
  assert.match(listSource, /manualAction: "unscheduled_status"/);
  assert.match(runtimeSource, /manual_action: input\.manualAction/);
  assert.match(domainSource, /allowed\.add\("manual_action"\)/);
  assert.match(domainSource, /manual_action: intent\.manual_action/);
  assert.match(rpcSource, /manual_action', nullif\(v_payload->>'manual_action', ''\)/);
});

test("latest logical date wins while same-date timestamp is retained", () => {
  const summary = buildTaskHistoryLastHandledSummaryMap(
    [task()],
    [history("2026-08-14", "delayed", { updated_at: "2026-08-14T12:00:00.000Z" })],
    [],
    [command("start_in_progress", "2026-08-14", { completed_at: "2026-08-14T13:00:00.000Z" })],
    "2026-08-15",
  )[taskId];

  assert.deepEqual(summary, { dateKey: "2026-08-14", timestamp: "2026-08-14T13:00:00.000Z" });
});
