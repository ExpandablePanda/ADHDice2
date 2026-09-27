import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createTask } from "../src/lib/task-buckets.ts";
import type { Task, TaskHistory } from "../src/lib/database.types.ts";
import {
  buildTaskHistoryLastHandledSummaryMap,
} from "../src/lib/task-history-last-handled.ts";
import {
  compareCurrentTaskProjectionParity,
  type CurrentTaskProjectionReadRow,
} from "../src/lib/task-current-projection-read.ts";
import {
  createCurrentTaskProjectionScopedVerificationCoordinator,
  isLastHandledOnlyCurrentTaskProjectionParityMismatch,
  type CurrentTaskProjectionScopedVerificationProof,
} from "../src/lib/task-current-projection-parity-verifier.ts";

const USER_ID = "00000000-0000-0000-0000-000000000001";
const HISTORY_EPOCH = "00000000-0000-0000-0000-000000000099";

function task(id = "fixture-task") {
  return {
    ...createTask({
      created_at: "2026-08-01T12:00:00.000Z",
      due_on: "2026-09-24",
      id,
      repeat_frequency: "daily",
      sort_order: 0,
      status: "pending",
      title: "Last Handled parity fixture",
      user_id: USER_ID,
    }),
    canonicalization_status: "canonical_runtime",
    canonical_revision: 12,
    container_state: "active",
    entity_kind: "parent",
    terminal_state: "active",
    workflow_state: "none",
  } as Task;
}

function historyFact(taskId: string): TaskHistory {
  return {
    counted_as_due_occurrence: true,
    created_at: "2026-08-28T09:00:00.000Z",
    entry_date: "2026-08-28",
    event_type: "status",
    id: `history-${taskId}`,
    occurrence_due_on: "2026-08-28",
    occurrence_key: `task:${taskId}:occurrence:2026-08-28`,
    status: "done",
    task_id: taskId,
    updated_at: "2026-08-28T09:00:00.000Z",
    user_id: USER_ID,
    was_completed: true,
  };
}

function manualSetOutcome(taskId: string, requestedLogicalDate: string) {
  return {
    accepted_payload_digest: "fixture-payload",
    command_id: `command-${requestedLogicalDate}`,
    command_type: "set_outcome",
    completed_at: "2026-08-30T12:00:00.000Z",
    created_at: "2026-08-30T12:00:00.000Z",
    entity_id: taskId,
    entity_kind: "parent",
    expected_boundary_sequence: null,
    expected_entity_revision: 11,
    expected_facts_fingerprint: null,
    expected_history_revision: null,
    expected_occurrence_revision: null,
    id: `operation-${requestedLogicalDate}`,
    idempotence_identity: `fixture-${requestedLogicalDate}`,
    logical_day_context_identity: "fixture-day-context",
    requested_logical_date: requestedLogicalDate,
    requested_occurrence_key: `task:${taskId}:occurrence:${requestedLogicalDate}`,
    result_digest: "fixture-result",
    result_references: { manual_action: "done" },
    schema_contract_version: "task-state-schema-v1",
    source_kind: "runtime",
    state: "committed",
    user_id: USER_ID,
    conflict_code: null,
  } as const;
}

function projection(taskId: string, logicalDate = "2026-08-30"): CurrentTaskProjectionReadRow {
  return {
    user_id: USER_ID,
    entity_id: taskId,
    entity_kind: "parent",
    display_status: "pending",
    next_due_on: "2026-09-24",
    handled_current_logical_day: false,
    last_handled_logical_date: logicalDate,
    last_handled_at: "2026-08-30T12:00:00.000Z",
    last_handled_at_kind: "event_instant",
    last_done_logical_date: null,
    last_done_at: null,
    last_done_at_kind: null,
    current_positive_streak: 0,
    current_missed_streak: 0,
    canonical_task_revision: 12,
    history_sync_epoch: HISTORY_EPOCH,
    history_source_revision: 1,
    logical_day_settings_revision: 7,
    projected_logical_date: "2026-09-24",
    projection_schema_version: "task-current-projection-schema-v1",
    projection_algorithm_version: "task-current-projection-algorithm-v1",
    validity: "valid",
    updated_at: "2026-09-24T12:00:00.000Z",
  };
}

function scopedProof(taskValue: Task, summary: { lastHandledDate: string | null; lastHandledAt: string | null }, overrides: Partial<CurrentTaskProjectionScopedVerificationProof["identity"]> = {}): CurrentTaskProjectionScopedVerificationProof {
  return {
    authoritativeLastHandled: summary,
    identity: {
      logicalDate: "2026-09-24",
      projectionUpdatedAt: projection(taskValue.id).updated_at,
      taskCanonicalRevision: taskValue.canonical_revision ?? null,
      taskId: taskValue.id,
      workspaceGeneration: 1,
      ...overrides,
    },
    resolved: true,
    taskId: taskValue.id,
  };
}

function parity(taskValue: Task, summary: { lastHandledDate: string | null; lastHandledAt: string | null }, options: {
  scopedProof?: CurrentTaskProjectionScopedVerificationProof;
  status?: "pending" | "done" | "missed" | "archived" | "trashed";
  dueOn?: string | null;
  currentStreak?: number;
  missedStreak?: number;
  lastDoneDate?: string | null;
  lastDoneAt?: string | null;
} = {}) {
  return compareCurrentTaskProjectionParity({
    legacyCurrentRead: {
      dueOnByTaskId: { [taskValue.id]: options.dueOn ?? taskValue.due_on },
      statusesByTaskId: { [taskValue.id]: options.status ?? "pending" },
    },
    legacySummaries: {
      [taskValue.id]: {
        currentStreak: options.currentStreak ?? 0,
        lastDoneAt: options.lastDoneAt ?? null,
        lastDoneDate: options.lastDoneDate ?? null,
        lastHandledAt: summary.lastHandledAt,
        lastHandledDate: summary.lastHandledDate,
        missedStreak: options.missedStreak ?? 0,
      },
    },
    projectionsByTaskId: { [taskValue.id]: projection(taskValue.id) },
    scopedLastHandledVerificationProofs: options.scopedProof
      ? { [taskValue.id]: options.scopedProof }
      : undefined,
    tasks: [taskValue],
    logicalDate: "2026-09-24",
    workspaceGeneration: 1,
  });
}

test("incomplete bulk command coverage produces the old Last Handled value, while scoped coverage restores parity", () => {
  const currentTask = task();
  const history = [historyFact(currentTask.id)];
  const bulkSummary = buildTaskHistoryLastHandledSummaryMap([currentTask], history, [], [], "2026-09-24")[currentTask.id];
  const scopedSummary = buildTaskHistoryLastHandledSummaryMap(
    [currentTask],
    history,
    [],
    [manualSetOutcome(currentTask.id, "2026-08-30")],
    "2026-09-24",
  )[currentTask.id];

  assert.deepEqual(bulkSummary, { dateKey: "2026-08-28", timestamp: "2026-08-28T09:00:00.000Z" });
  assert.deepEqual(scopedSummary, { dateKey: "2026-08-30", timestamp: "2026-08-30T12:00:00.000Z" });
  assert.deepEqual(parity(currentTask, {
    lastHandledAt: bulkSummary.timestamp,
    lastHandledDate: bulkSummary.dateKey,
  }).mismatchedFields.map(({ field }) => field), ["lastHandledDate", "lastHandledAt"]);
  assert.deepEqual(parity(currentTask, {
    lastHandledAt: scopedSummary.timestamp,
    lastHandledDate: scopedSummary.dateKey,
  }).mismatchedFields, []);
});

test("a resolved scoped Last Handled proof survives a later bulk overwrite and leaves ordinary summary fields authoritative", () => {
  const currentTask = task("durable-proof");
  const bulkSummary = { lastHandledAt: "2026-08-28T09:00:00.000Z", lastHandledDate: "2026-08-28" };
  const scopedSummary = { lastHandledAt: "2026-08-30T12:00:00.000Z", lastHandledDate: "2026-08-30" };
  const proof = scopedProof(currentTask, scopedSummary);

  assert.deepEqual(parity(currentTask, bulkSummary, { scopedProof: proof }).mismatchedFields, []);

  const independentlyChangedSummary = parity(currentTask, bulkSummary, {
    currentStreak: 4,
    dueOn: "2026-09-25",
    lastDoneAt: "2026-09-23T12:00:00.000Z",
    lastDoneDate: "2026-09-23",
    missedStreak: 2,
    scopedProof: proof,
    status: "done",
  });
  assert.deepEqual(independentlyChangedSummary.mismatchedFields.map(({ field }) => field), [
    "displayStatus",
    "displayDueOn",
    "currentPositiveStreak",
    "currentMissedStreak",
    "lastDoneDate",
    "lastDoneAt",
  ]);
});

test("a scoped proof is ignored when any verification identity fence changes", () => {
  const currentTask = task("identity-proof");
  const proof = scopedProof(currentTask, {
    lastHandledAt: "2026-08-30T12:00:00.000Z",
    lastHandledDate: "2026-08-30",
  });
  const bulkSummary = {
    lastHandledAt: "2026-08-28T09:00:00.000Z",
    lastHandledDate: "2026-08-28",
  };

  for (const overrides of [
    { taskCanonicalRevision: 13 },
    { projectionUpdatedAt: "2026-09-24T12:01:00.000Z" },
    { logicalDate: "2026-09-25" },
    { workspaceGeneration: 2 },
  ]) {
    const result = parity(currentTask, bulkSummary, {
      scopedProof: { ...proof, identity: { ...proof.identity, ...overrides } },
    });
    assert.deepEqual(result.mismatchedFields.map(({ field }) => field), ["lastHandledDate", "lastHandledAt"]);
  }
});

test("a genuine Last Handled mismatch remains a parity blocker after scoped verification", () => {
  const currentTask = task("genuine-mismatch");
  const result = parity(currentTask, {
    lastHandledAt: "2026-08-29T00:00:00",
    lastHandledDate: "2026-08-29",
  });
  assert.deepEqual(result.mismatchedFields.map(({ field }) => field), ["lastHandledDate", "lastHandledAt"]);
});

test("scoped verifier runs once per identity, coalesces duplicates, and reopens for each changed fence", async () => {
  let currentIdentity = {
    logicalDate: "2026-09-24",
    projectionUpdatedAt: "2026-09-24T12:00:00.000Z",
    taskCanonicalRevision: 12,
    taskId: "fixture-task",
    workspaceGeneration: 1,
  };
  let calls = 0;
  const coordinator = createCurrentTaskProjectionScopedVerificationCoordinator<string>({
    isCurrent: (identity) => JSON.stringify(identity) === JSON.stringify(currentIdentity),
  });
  const identity = { ...currentIdentity };
  const first = coordinator.request(identity, async () => {
    calls += 1;
    return "first";
  });
  const duplicate = coordinator.request(identity, async () => {
    calls += 1;
    return "duplicate";
  });

  assert.equal(first.status, "started");
  assert.equal(duplicate.status, "coalesced");
  assert.equal((await first.promise).status, "completed");
  assert.equal((await duplicate.promise).status, "completed");
  assert.equal(calls, 1);
  assert.equal(coordinator.request(identity, async () => "should-not-run").status, "already_verified");

  for (const changedIdentity of [
    { taskCanonicalRevision: 13 },
    { projectionUpdatedAt: "2026-09-24T12:01:00.000Z" },
    { logicalDate: "2026-09-25" },
    { workspaceGeneration: 2 },
  ]) {
    currentIdentity = { ...currentIdentity, ...changedIdentity };
    const next = coordinator.request({ ...currentIdentity }, async () => {
      calls += 1;
      return "changed";
    });
    assert.equal(next.status, "started");
    assert.equal((await next.promise).status, "completed");
  }
  assert.equal(calls, 5);
});

test("only a resolved scoped verification is retained as a parity proof", async () => {
  const identity = {
    logicalDate: "2026-09-24",
    projectionUpdatedAt: "2026-09-24T12:00:00.000Z",
    taskCanonicalRevision: 12,
    taskId: "cache-task",
    workspaceGeneration: 1,
  };
  const coordinator = createCurrentTaskProjectionScopedVerificationCoordinator<{
    authoritativeLastHandled: { lastHandledAt: string | null; lastHandledDate: string | null };
    resolved: boolean;
  }>({
    cacheCompletedResult: (value) => value.resolved,
  });

  const unresolved = coordinator.request(identity, async () => ({
    authoritativeLastHandled: { lastHandledAt: "2026-08-29T00:00:00.000Z", lastHandledDate: "2026-08-29" },
    resolved: false,
  }));
  assert.deepEqual(await unresolved.promise, {
    status: "completed",
    value: {
      authoritativeLastHandled: { lastHandledAt: "2026-08-29T00:00:00.000Z", lastHandledDate: "2026-08-29" },
      resolved: false,
    },
  });
  assert.equal(coordinator.getVerified(identity), null);
  assert.equal(coordinator.request(identity, async () => ({
    authoritativeLastHandled: { lastHandledAt: null, lastHandledDate: null },
    resolved: true,
  })).status, "already_verified");

  coordinator.clear();
  const resolved = coordinator.request(identity, async () => ({
    authoritativeLastHandled: { lastHandledAt: "2026-08-30T12:00:00.000Z", lastHandledDate: "2026-08-30" },
    resolved: true,
  }));
  assert.equal((await resolved.promise).status, "completed");
  assert.deepEqual(coordinator.getVerified(identity)?.value, {
    authoritativeLastHandled: { lastHandledAt: "2026-08-30T12:00:00.000Z", lastHandledDate: "2026-08-30" },
    resolved: true,
  });
});

test("stale generation results are ignored and non-Last-Handled or inactive mismatches do not qualify", async () => {
  let currentGeneration = 1;
  const coordinator = createCurrentTaskProjectionScopedVerificationCoordinator<string>({
    isCurrent: (identity) => identity.workspaceGeneration === currentGeneration,
  });
  let resolveVerification!: (value: string) => void;
  const stale = coordinator.request({
    logicalDate: "2026-09-24",
    projectionUpdatedAt: "2026-09-24T12:00:00.000Z",
    taskCanonicalRevision: 12,
    taskId: "stale-task",
    workspaceGeneration: 1,
  }, () => new Promise<string>((resolve) => {
    resolveVerification = resolve;
  }));
  await Promise.resolve();
  currentGeneration = 2;
  resolveVerification("stale");
  assert.deepEqual(await stale.promise, { status: "stale", value: null });
  assert.equal(isLastHandledOnlyCurrentTaskProjectionParityMismatch(["lastHandledDate"]), true);
  assert.equal(isLastHandledOnlyCurrentTaskProjectionParityMismatch(["lastHandledDate", "lastHandledAt"]), true);
  assert.equal(isLastHandledOnlyCurrentTaskProjectionParityMismatch(["displayStatus"]), false);
  assert.equal(isLastHandledOnlyCurrentTaskProjectionParityMismatch([]), false);

  const inactiveTask = { ...task("inactive-task"), container_state: "trashed" } as Task;
  const inactiveParity = parity(inactiveTask, {
    lastHandledAt: "2026-08-29T00:00:00.000Z",
    lastHandledDate: "2026-08-29",
  });
  assert.deepEqual(inactiveParity.mismatchedFields, []);
  assert.deepEqual(inactiveParity.excludedInactiveTaskIds, ["inactive-task"]);

  const workspaceSource = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const appSource = await readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
  assert.match(workspaceSource, /loadActiveCalendarOverrides\(taskId\)[\s\S]*loadManualActionCommandOperations\(taskId\)/);
  assert.match(appSource, /projection_parity_scoped_verification_requested/);
  assert.match(appSource, /projection_parity_scoped_verification_started/);
  assert.match(appSource, /projection_parity_scoped_verification_completed/);
  assert.match(appSource, /cacheCompletedResult: \(value\) => value\.resolved/);
  assert.match(appSource, /getVerified\(identity\)/);
  assert.match(appSource, /scopedLastHandledVerificationProofs/);
  assert.match(appSource, /refreshTaskHistoryStreakSummary\(taskId, undefined, undefined, \(summary\)/);
  assert.match(appSource, /isCurrentTaskProjectionParityEligibleTask\(task\)/);
});
