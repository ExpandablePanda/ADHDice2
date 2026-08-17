import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createTask } from "../src/lib/task-buckets.ts";
import type { TaskStateCommandFailure, TaskStateCommandSuccess } from "../src/lib/task-state-command-client.ts";
import { classifyTaskStateRuntimeAction } from "../src/lib/task-state-runtime-actions.ts";
import {
  executeTaskStateRuntimeAction,
  type TaskStateRuntimeLocalTask,
} from "../src/lib/task-state-runtime-executor.ts";

function task(overrides: Partial<TaskStateRuntimeLocalTask> = {}): TaskStateRuntimeLocalTask {
  return {
    ...createTask({
      created_at: "2026-08-10T12:00:00.000Z",
      id: "task-1",
      sort_order: 1,
      status: "pending",
      title: "Canonical task",
    }),
    canonicalization_status: "canonical_proven",
    canonical_revision: 4,
    canonical_updated_at: "2026-08-10T12:00:00.000Z",
    container_state: "active",
    entity_kind: "parent",
    prior_container_state: null,
    prior_container_state_status: "not_applicable",
    terminal_state: "active",
    workflow_command_id: null,
    workflow_logical_date: null,
    workflow_occurrence_id: null,
    workflow_revision: 1,
    workflow_started_at: null,
    workflow_state: "none",
    ...overrides,
  };
}

function startAction(currentTask = task()) {
  const action = classifyTaskStateRuntimeAction({ task: currentTask, values: { status: "in_progress" } });
  assert.equal(action.kind, "canonical_action");
  return action;
}

function delayAction(currentTask = task()) {
  const action = classifyTaskStateRuntimeAction({
    task: currentTask,
    canonicalIntent: {
      type: "delay_occurrence",
      logical_date: "2026-08-17",
      occurrence_key: "occurrence-1",
      effective_due_on: "2026-08-24",
    },
    replayIdentity: "delay-action-1",
  });
  assert.equal(action.kind, "canonical_action");
  return action;
}

function archiveAction(currentTask = task()) {
  const action = classifyTaskStateRuntimeAction({ task: currentTask, values: { status: "archived" } });
  assert.equal(action.kind, "canonical_action");
  return action;
}

function committedResponse(overrides: Partial<TaskStateCommandSuccess> = {}): TaskStateCommandSuccess {
  return {
    success: true,
    state: "committed",
    task_id: "task-1",
    command_id: "command-1",
    expected_revision: 4,
    next_revision: 5,
    was_replayed: false,
    conflict_code: null,
    canonical_task_patch: {
      canonicalization_status: "canonical_runtime",
      workflow_state: "in_progress",
      workflow_started_at: "2026-08-10T12:01:00.000Z",
      workflow_logical_date: "2026-08-10",
      workflow_occurrence_id: "occurrence-1",
      workflow_command_id: "command-1",
      workflow_revision: 2,
    },
    compatibility_projection: {
      status: "in_progress",
      due_on: "2026-08-10",
      completed_at: null,
      active_status_logical_date: "2026-08-10",
      active_occurrence_due_on: "2026-08-10",
    },
    side_effect_ids: {},
    error: null,
    ...overrides,
  };
}

function rejectedResponse(code: string): TaskStateCommandFailure {
  return {
    success: false,
    state: "rejected",
    task_id: "task-1",
    command_id: "command-1",
    expected_revision: 4,
    next_revision: 6,
    was_replayed: false,
    conflict_code: code,
    canonical_task_patch: null,
    compatibility_projection: null,
    side_effect_ids: {},
    error: {
      kind: "command_rejected",
      message: "Canonical Task State command was rejected.",
      code,
      status: 409,
    },
  };
}

test("committed canonical action invokes the browser command once and preserves replay identity", async () => {
  const currentTask = task();
  const action = startAction(currentTask);
  const intents: unknown[] = [];
  const result = await executeTaskStateRuntimeAction(action, currentTask, {
    invoke: async (intent) => {
      intents.push(intent);
      return committedResponse();
    },
  });

  assert.equal(result.success, true);
  assert.equal(intents.length, 1);
  assert.equal((intents[0] as { replay_identity: string }).replay_identity, action.replayIdentity);
  assert.equal((intents[0] as { expected_revision: number }).expected_revision, 4);
});

test("committed response reconciles canonical and compatibility fields without overwriting metadata", async () => {
  const currentTask = task({ title: "Keep this title", priority: "high", canonical_revision: 4 });
  const action = startAction(currentTask);
  const result = await executeTaskStateRuntimeAction(action, currentTask, {
    invoke: async () => committedResponse(),
  });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.task.title, "Keep this title");
  assert.equal(result.task.priority, "high");
  assert.equal(result.task.workflow_state, "in_progress");
  assert.equal(result.task.workflow_started_at, "2026-08-10T12:01:00.000Z");
  assert.equal(result.task.workflow_logical_date, "2026-08-10");
  assert.equal(result.task.workflow_occurrence_id, "occurrence-1");
  assert.equal(result.task.workflow_command_id, "command-1");
  assert.equal(result.task.workflow_revision, 2);
  assert.equal(result.task.canonicalization_status, "canonical_runtime");
  assert.equal(result.task.status, "in_progress");
  assert.equal(result.task.due_on, "2026-08-10");
  assert.equal(result.task.active_status_logical_date, "2026-08-10");
  assert.equal(result.task.active_occurrence_due_on, "2026-08-10");
  assert.equal(result.task.canonical_revision, 5);
  assert.equal(result.task.revision, currentTask.revision);
});

test("semantic no-op response preserves canonical revision and performs no local write", async () => {
  const currentTask = task();
  const action = archiveAction(currentTask);
  const result = await executeTaskStateRuntimeAction(action, currentTask, {
    invoke: async () => committedResponse({
      no_action: true,
      next_revision: currentTask.canonical_revision,
      canonical_task_patch: {},
      compatibility_projection: {
        status: currentTask.status,
        due_on: currentTask.due_on,
        completed_at: currentTask.completed_at,
        active_status_logical_date: currentTask.active_status_logical_date ?? null,
        active_occurrence_due_on: currentTask.active_occurrence_due_on ?? null,
      },
    }),
  });

  assert.equal(result.success, true, result.success ? undefined : result.error.message);
  if (result.success) assert.equal(result.task.canonical_revision, currentTask.canonical_revision);
});

test("committed canonical Delay reconciles the effective due date onto the local Task", async () => {
  const currentTask = task({ due_on: "2026-08-17" });
  const action = delayAction(currentTask);
  const result = await executeTaskStateRuntimeAction(action, currentTask, {
    invoke: async (intent) => {
      assert.equal(intent.type, "delay_occurrence");
      assert.equal(intent.effective_due_on, "2026-08-24");
      return committedResponse({
        compatibility_projection: {
          status: "delayed",
          due_on: "2026-08-24",
          completed_at: null,
          active_status_logical_date: null,
          active_occurrence_due_on: null,
        },
        canonical_task_patch: { canonicalization_status: "canonical_runtime" },
      });
    },
  });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.task.due_on, "2026-08-24");
  assert.equal(result.task.status, "delayed");
});

test("valid lifecycle enum values are accepted and reconciled from the committed response", async () => {
  const currentTask = task({ terminal_state: "permanently_complete" });
  const action = archiveAction(currentTask);
  const result = await executeTaskStateRuntimeAction(action, currentTask, {
    invoke: async () => committedResponse({
      canonical_task_patch: {
        canonicalization_status: "canonical_runtime",
        container_state: "archived",
        entity_kind: "parent",
        prior_container_state: "active",
        prior_container_state_status: "proven",
        terminal_state: "permanently_complete",
        workflow_state: "none",
      },
      compatibility_projection: {
        active_occurrence_due_on: null,
        active_status_logical_date: null,
        completed_at: "2026-08-09T12:00:00.000Z",
        due_on: null,
        status: "archived",
      },
    }),
  });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.task.container_state, "archived");
  assert.equal(result.task.terminal_state, "permanently_complete");
  assert.equal(result.task.status, "archived");
});

test("invalid lifecycle enum values fail closed before local reconciliation", async () => {
  const invalidFields = [
    ["entity_kind", "task"],
    ["terminal_state", "complete"],
    ["container_state", "deleted"],
    ["prior_container_state", "trashed"],
    ["prior_container_state_status", "guessed"],
    ["workflow_state", "running"],
  ] as const;

  for (const [field, value] of invalidFields) {
    const currentTask = task();
    const action = archiveAction(currentTask);
    const result = await executeTaskStateRuntimeAction(action, currentTask, {
      invoke: async () => committedResponse({
        canonical_task_patch: { [field]: value },
      }),
    });

    assert.equal(result.success, false, field);
    assert.equal(result.task, null, field);
    assert.equal(result.error.kind, "malformed_response", field);
    assert.match(result.error.message, new RegExp(field), field);
  }
});

test("malformed committed responses fail closed before local reconciliation", async () => {
  const currentTask = task();
  const action = startAction(currentTask);
  const malformed = committedResponse({
    compatibility_projection: {
      status: "in_progress",
      due_on: "2026-08-10",
      completed_at: null,
      active_status_logical_date: "2026-08-10",
    },
  });
  const result = await executeTaskStateRuntimeAction(action, currentTask, { invoke: async () => malformed });

  assert.equal(result.success, false);
  assert.equal(result.task, null);
  assert.equal(result.error.kind, "malformed_response");
  assert.match(result.error.message, /active_occurrence_due_on/);
});

test("rejected, stale, authentication, and invocation failures do not produce a local commit", async () => {
  const currentTask = task();
  const action = startAction(currentTask);

  const stale = await executeTaskStateRuntimeAction(action, currentTask, { invoke: async () => rejectedResponse("STALE_REVISION") });
  assert.equal(stale.success, false);
  assert.equal(stale.error.code, "STALE_REVISION");
  assert.equal(stale.task, null);

  const rejected = await executeTaskStateRuntimeAction(action, currentTask, { invoke: async () => rejectedResponse("COMMAND_REJECTED") });
  assert.equal(rejected.success, false);
  assert.equal(rejected.error.kind, "command_rejected");
  assert.equal(rejected.task, null);

  const authentication = await executeTaskStateRuntimeAction(action, currentTask, {
    invoke: async () => ({
      ...rejectedResponse("AUTHENTICATION_REQUIRED"),
      error: { kind: "authentication_failure", message: "Sign in again.", code: "authentication_failure", status: 401 },
    }),
  });
  assert.equal(authentication.success, false);
  assert.equal(authentication.error.kind, "authentication_failure");
  assert.equal(authentication.task, null);

  const invocation = await executeTaskStateRuntimeAction(action, currentTask, {
    invoke: async () => { throw new Error("network unavailable"); },
  });
  assert.equal(invocation.success, false);
  assert.equal(invocation.error.kind, "invocation_failure");
  assert.equal(invocation.task, null);
});

test("executor has no legacy Task, History, reward, or retry path", () => {
  const source = readFileSync(new URL("../src/lib/task-state-runtime-executor.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /updateTaskRowWithLegacyEnergyFallback|syncTaskHistory|onTasksCompleted|reconcileOverdue/);
});
