import {
  CanonicalCommandPlanningError,
  isCanonicalTaskStateCommandSemanticNoOp,
  planTaskStateCommand,
  serializeCanonicalTaskStateCommandForRpc,
} from "../../../src/lib/task-state-canonical/command-service.ts";
import {
  buildCanonicalTaskStateEngineInput,
  CanonicalWorkflowOccurrenceReferenceError,
} from "../../../src/lib/task-state-canonical/engine-input.ts";
import {
  loadCanonicalTaskCommandOperationReplay,
  loadCanonicalTaskState,
  type CanonicalReadClient,
} from "../../../src/lib/task-state-canonical/read-model.ts";
import type { CanonicalTaskRow } from "../../../src/lib/task-state-canonical/read-model.ts";
import type { CanonicalTaskCommandOperation } from "../../../src/lib/task-state-canonical/types.ts";
import {
  buildTrustedTaskStateCommand,
  buildTrustedTaskStateCommandReplayDescriptor,
  type HistoryOutcomeBatchIntent,
  type TaskStateCommandIntent,
  type TrustedTaskStateCommandReplayDescriptor,
} from "./domain.ts";
import { deterministicUuid } from "../../../src/lib/task-state-canonical/digest.ts";
import { logicalDateForTimestamp } from "../../../src/lib/task-state-engine/calendar.ts";

export type TrustedTaskStateCommandClient = CanonicalReadClient & {
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
};

export type TrustedTaskStateCommandResponse = {
  status: number;
  body: unknown;
};

type OrchestrationDependencies = {
  loadReplayOperation: typeof loadCanonicalTaskCommandOperationReplay;
  loadCanonicalState: typeof loadCanonicalTaskState;
  buildEngineInput: typeof buildCanonicalTaskStateEngineInput;
  buildCommand: typeof buildTrustedTaskStateCommand;
  planCommand: typeof planTaskStateCommand;
  serializePlan: typeof serializeCanonicalTaskStateCommandForRpc;
  invokeCommand: (input: {
    adminClient: TrustedTaskStateCommandClient;
    userId: string;
    serializedPlan: Record<string, unknown>;
    intent: TaskStateCommandIntent;
    deferAchievements?: boolean;
  }) => Promise<{ data: unknown; error: { code?: string | null; message?: string } | null }>;
  finalizeAchievements: (input: {
    adminClient: TrustedTaskStateCommandClient;
    userId: string;
    operationId: string;
  }) => Promise<{ data: unknown; error: { code?: string | null; message?: string } | null }>;
};

const defaultDependencies: OrchestrationDependencies = {
  loadReplayOperation: loadCanonicalTaskCommandOperationReplay,
  loadCanonicalState: loadCanonicalTaskState,
  buildEngineInput: buildCanonicalTaskStateEngineInput,
  buildCommand: buildTrustedTaskStateCommand,
  planCommand: planTaskStateCommand,
  serializePlan: serializeCanonicalTaskStateCommandForRpc,
  invokeCommand: async ({ adminClient, userId, serializedPlan, intent, deferAchievements = false }) => {
    const milestoneIntent = intent as TaskStateCommandIntent & {
      milestone_id?: string;
      expected_milestone_revision?: number;
      milestone_operation_id?: string;
    };
    if (milestoneIntent.milestone_id && milestoneIntent.expected_milestone_revision !== undefined && milestoneIntent.milestone_operation_id) {
      return adminClient.rpc("adhdice_execute_milestone_task_state_command", {
        p_user_id: userId,
        p_command: serializedPlan,
        p_milestone_id: milestoneIntent.milestone_id,
        p_expected_milestone_revision: milestoneIntent.expected_milestone_revision,
        p_operation_id: milestoneIntent.milestone_operation_id,
      });
    }
    return adminClient.rpc(deferAchievements
      ? "adhdice_execute_task_state_command_deferred_achievements"
      : "adhdice_execute_task_state_command", {
      p_user_id: userId,
      p_command: serializedPlan,
    });
  },
  finalizeAchievements: async ({ adminClient, userId, operationId }) => adminClient.rpc("adhdice_finalize_task_history_batch_achievements", {
    p_user_id: userId,
    p_operation_id: operationId,
  }),
};

function errorResponse(code: string, message: string, status = 409): TrustedTaskStateCommandResponse {
  return { status, body: { error: { code, message } } };
}

function replayUnavailableResponse(): TrustedTaskStateCommandResponse {
  return errorResponse("command_replay_unavailable", "Canonical command replay state is unavailable.", 503);
}

export function resolveTrustedTaskStateCommandReplay(input: {
  userId: string;
  taskId: string;
  descriptor: TrustedTaskStateCommandReplayDescriptor;
  operation: CanonicalTaskCommandOperation | null;
}): TrustedTaskStateCommandResponse | null {
  const { descriptor, operation } = input;
  if (!operation) return null;

  if (operation.user_id !== input.userId || operation.entity_id !== input.taskId) {
    return errorResponse(
      "REPLAY_ENTITY_MISMATCH",
      "The replay identity belongs to a different Task entity.",
    );
  }
  if (operation.command_id !== descriptor.commandId
    || operation.idempotence_identity !== descriptor.idempotenceIdentity
    || operation.accepted_payload_digest !== descriptor.acceptedPayloadDigest) {
    return errorResponse(
      "REPLAY_IDENTITY_REUSE_CONFLICT",
      "The replay identity was reused with a different accepted command.",
    );
  }
  if (operation.state === "committed" || operation.state === "rejected") {
    return {
      status: 200,
      body: { ...operation.result_references, was_replayed: true },
    };
  }
  return errorResponse(
    operation.state === "accepted" ? "REPLAY_IN_PROGRESS" : "REPLAY_OPERATION_CONFLICT",
    operation.state === "accepted"
      ? "The command replay identity is already being processed."
      : "The command replay identity requires explicit resolution.",
  );
}

async function lookupReplay(
  client: TrustedTaskStateCommandClient,
  userId: string,
  taskId: string,
  descriptor: TrustedTaskStateCommandReplayDescriptor,
  loadReplayOperation: typeof loadCanonicalTaskCommandOperationReplay,
) {
  try {
    const result = await loadReplayOperation(client, {
      userId,
      idempotenceIdentity: descriptor.idempotenceIdentity,
    });
    if (result.error) return replayUnavailableResponse();
    return resolveTrustedTaskStateCommandReplay({ userId, taskId, descriptor, operation: result.data });
  } catch {
    return replayUnavailableResponse();
  }
}

function planningErrorResponse(error: unknown): TrustedTaskStateCommandResponse {
  if (error instanceof CanonicalCommandPlanningError) {
    return errorResponse(error.code, error.message, error.code === "STALE_REVISION" ? 409 : 422);
  }
  if (error instanceof CanonicalWorkflowOccurrenceReferenceError) {
    return errorResponse(error.code, error.message, 422);
  }
  return errorResponse("canonical_state_unavailable", "Canonical Task State could not be planned.", 503);
}

function rejectedPlanResponse(conflictCode: string | null): TrustedTaskStateCommandResponse {
  const code = conflictCode ?? "COMMAND_REJECTED";
  return errorResponse(code, "Canonical Task State command was rejected.", code === "STALE_REVISION" ? 409 : 422);
}

function semanticNoOpResponse(input: {
  commandId: string;
  task: CanonicalTaskRow;
  plan: ReturnType<typeof planTaskStateCommand>;
}) {
  const { commandId, plan, task } = input;
  if (!task) throw new Error("A semantic no-op response requires the canonical Task.");
  return {
    status: 200,
    body: {
      state: "committed",
      task_id: task.id,
      command_id: commandId,
      expected_revision: task.canonical_revision,
      next_revision: task.canonical_revision,
      was_replayed: false,
      conflict_code: null,
      no_action: true,
      canonical_task_patch: {},
      compatibility_projection: {
        status: plan.normalizedResult.compatibilityProjection.status,
        due_on: plan.normalizedResult.compatibilityProjection.dueOn,
        completed_at: plan.normalizedResult.compatibilityProjection.completedAt,
        active_status_logical_date: plan.normalizedResult.compatibilityProjection.activeStatusLogicalDate,
        active_occurrence_due_on: plan.normalizedResult.compatibilityProjection.activeOccurrenceDueOn,
      },
    },
  } satisfies TrustedTaskStateCommandResponse;
}

export async function executeTrustedTaskStateCommand(input: {
  userId: string;
  intent: TaskStateCommandIntent;
  adminClient: TrustedTaskStateCommandClient;
  now?: string;
  dependencies?: Partial<OrchestrationDependencies>;
}): Promise<TrustedTaskStateCommandResponse> {
  const dependencies = { ...defaultDependencies, ...input.dependencies };
  const descriptor = buildTrustedTaskStateCommandReplayDescriptor({
    userId: input.userId,
    intent: input.intent,
  });
  const initialReplay = await lookupReplay(
    input.adminClient,
    input.userId,
    input.intent.task_id,
    descriptor,
    dependencies.loadReplayOperation,
  );
  if (initialReplay) return initialReplay;

  const readResult = await dependencies.loadCanonicalState(input.adminClient, {
    userId: input.userId,
    taskId: input.intent.task_id,
  });
  if (readResult.error || !readResult.data) {
    return errorResponse("canonical_state_unavailable", "Canonical Task State is unavailable.", 503);
  }

  const now = input.now ?? new Date().toISOString();
  let plan: ReturnType<typeof planTaskStateCommand>;
  try {
    const logicalDate = logicalDateForTimestamp(
      now,
      readResult.data.logicalDayProfile.timezone,
      readResult.data.logicalDayProfile.day_start_time,
    );
    const logicalDay = {
      identity: `logical-day:${input.userId}:${readResult.data.logicalDayProfile.settings_revision}:${readResult.data.logicalDayProfile.timezone}:${readResult.data.logicalDayProfile.day_start_time}:${logicalDate}`,
      logicalDate,
      timezone: readResult.data.logicalDayProfile.timezone,
      dayStartTime: readResult.data.logicalDayProfile.day_start_time,
      settingsRevision: readResult.data.logicalDayProfile.settings_revision,
    };
    const engineInput = dependencies.buildEngineInput(readResult.data, {
      now,
      timezone: logicalDay.timezone,
      logicalDayRollover: logicalDay.dayStartTime,
    });
    const command = dependencies.buildCommand({
      intent: input.intent,
      userId: input.userId,
      readModel: readResult.data,
      logicalDay,
      now,
    });
    plan = dependencies.planCommand({ task: readResult.data.task, engineInput }, command);
  } catch (error) {
    const finalReplay = await lookupReplay(
      input.adminClient,
      input.userId,
      input.intent.task_id,
      descriptor,
      dependencies.loadReplayOperation,
    );
    if (finalReplay) return finalReplay;
    return planningErrorResponse(error);
  }

  if (plan.normalizedResult.state === "rejected") {
    const finalReplay = await lookupReplay(
      input.adminClient,
      input.userId,
      input.intent.task_id,
      descriptor,
      dependencies.loadReplayOperation,
    );
    if (finalReplay) return finalReplay;
    return rejectedPlanResponse(plan.normalizedResult.conflictCode);
  }

  if (
    plan.command.commandType === "reconcile_rollover"
    && isCanonicalTaskStateCommandSemanticNoOp({ plan, task: readResult.data.task })
  ) {
    return semanticNoOpResponse({ commandId: plan.command.commandId, plan, task: readResult.data.task });
  }

  const rpcResult = await dependencies.invokeCommand({
    adminClient: input.adminClient,
    userId: input.userId,
    serializedPlan: dependencies.serializePlan(plan),
    intent: input.intent,
  });
  if (rpcResult.error) {
    const status = rpcResult.error.code === "40001" ? 409 : rpcResult.error.code === "42501" ? 403 : 422;
    return errorResponse("command_rejected", "Canonical Task State command was rejected.", status);
  }
  return { status: 200, body: rpcResult.data };
}

function childReplayIdentity(intent: HistoryOutcomeBatchIntent, logicalDate: string) {
  return `${intent.replay_identity}:history:${logicalDate}:${intent.outcome}`;
}

function batchOperationId(userId: string, replayIdentity: string) {
  return deterministicUuid(`task-history-outcome-batch-achievement:${userId}:${replayIdentity}`);
}

type BatchFailureKind = "command_rejected" | "malformed_response";

function batchFailure(error: TrustedTaskStateCommandResponse["body"], status: number, kind: BatchFailureKind = "command_rejected") {
  const record = error && typeof error === "object" && !Array.isArray(error)
    ? error as Record<string, unknown>
    : {};
  const nested = record.error && typeof record.error === "object" && !Array.isArray(record.error)
    ? record.error as Record<string, unknown>
    : record;
  return {
    kind,
    message: typeof nested.message === "string" ? nested.message : "Canonical Task State command was rejected.",
    code: typeof nested.code === "string" ? nested.code : null,
    status,
  };
}

function recordBatchTiming(input: {
  entryCount: number;
  childDurationMs: number;
  achievementDurationMs: number;
  totalDurationMs: number;
}) {
  if (typeof Deno === "undefined" || Deno.env.get("ADHDICE_EDGE_DIAGNOSTICS") !== "1") return;
  console.info("[task-state-command] history outcome batch timing", input);
}

type BatchAchievement = {
  status: "completed" | "inactive" | "failed" | "not_run";
  operation_id: string;
  error_code: string | null;
};

type BatchAchievementFinalization = {
  achievement: BatchAchievement;
  achievementWarning: string | null;
  durationMs: number;
};

function batchAchievementNotRun(operationId: string): BatchAchievementFinalization {
  return {
    achievement: { status: "not_run", operation_id: operationId, error_code: null },
    achievementWarning: null,
    durationMs: 0,
  };
}

async function finalizeBatchAchievements(input: {
  dependencies: OrchestrationDependencies;
  adminClient: TrustedTaskStateCommandClient;
  userId: string;
  operationId: string;
  partial: boolean;
}): Promise<BatchAchievementFinalization> {
  const startedAt = performance.now();
  let achievement: BatchAchievement = {
    status: "failed",
    operation_id: input.operationId,
    error_code: "ACHIEVEMENT_FINALIZATION_UNAVAILABLE",
  };
  let achievementWarning: string | null = input.partial
    ? "Some History changes committed, but Achievement reconciliation did not complete."
    : "History committed, but Achievement reconciliation did not complete.";
  try {
    const finalizer = await input.dependencies.finalizeAchievements({
      adminClient: input.adminClient,
      userId: input.userId,
      operationId: input.operationId,
    });
    const finalizerData = finalizer.data && typeof finalizer.data === "object" && !Array.isArray(finalizer.data)
      ? finalizer.data as Record<string, unknown>
      : null;
    const status = finalizerData?.status;
    if (finalizer.error) {
      achievement = {
        status: "failed",
        operation_id: input.operationId,
        error_code: finalizer.error.code ?? "ACHIEVEMENT_FINALIZATION_FAILED",
      };
    } else if (status === "completed" || status === "inactive") {
      achievement = { status, operation_id: input.operationId, error_code: null };
      achievementWarning = null;
    } else {
      achievement = {
        status: "failed",
        operation_id: input.operationId,
        error_code: typeof finalizerData?.error_code === "string" ? finalizerData.error_code : "ACHIEVEMENT_FINALIZATION_FAILED",
      };
    }
  } catch {
    achievement = {
      status: "failed",
      operation_id: input.operationId,
      error_code: "ACHIEVEMENT_FINALIZATION_FAILED",
    };
  }
  return {
    achievement,
    achievementWarning,
    durationMs: performance.now() - startedAt,
  };
}

async function partialBatchResponse(input: {
  dependencies: OrchestrationDependencies;
  adminClient: TrustedTaskStateCommandClient;
  userId: string;
  intent: HistoryOutcomeBatchIntent;
  operationId: string;
  startedAt: number;
  childResults: Array<Record<string, unknown>>;
  completedEntries: string[];
  failedEntryIndex: number;
  currentRevision: number;
  failure: ReturnType<typeof batchFailure>;
}): Promise<TrustedTaskStateCommandResponse> {
  const childDurationMs = performance.now() - input.startedAt;
  const hasCommittedChild = input.childResults.some((child) => child.state === "committed");
  const finalization = hasCommittedChild
    ? await finalizeBatchAchievements({
        dependencies: input.dependencies,
        adminClient: input.adminClient,
        userId: input.userId,
        operationId: input.operationId,
        partial: true,
      })
    : batchAchievementNotRun(input.operationId);
  recordBatchTiming({
    entryCount: input.intent.entries.length,
    childDurationMs,
    achievementDurationMs: finalization.durationMs,
    totalDurationMs: performance.now() - input.startedAt,
  });
  return {
    status: 200,
    body: {
      type: "history_outcome_batch",
      state: "partial",
      task_id: input.intent.task_id,
      batch_replay_identity: input.intent.replay_identity,
      expected_revision: input.intent.expected_revision,
      final_committed_revision: input.currentRevision,
      completed_entries: input.completedEntries,
      failed_entry_index: input.failedEntryIndex,
      child_results: input.childResults,
      achievement: finalization.achievement,
      achievement_warning: finalization.achievementWarning,
      error: input.failure,
    },
  };
}

export async function executeHistoryOutcomeBatch(input: {
  userId: string;
  intent: HistoryOutcomeBatchIntent;
  adminClient: TrustedTaskStateCommandClient;
  now?: string;
  dependencies?: Partial<OrchestrationDependencies>;
}): Promise<TrustedTaskStateCommandResponse> {
  const dependencies = { ...defaultDependencies, ...input.dependencies };
  const orderedEntries = [...input.intent.entries].sort((left, right) => left.logical_date.localeCompare(right.logical_date));
  const operationId = batchOperationId(input.userId, input.intent.replay_identity);
  const startedAt = performance.now();
  let currentRevision = input.intent.expected_revision;
  const childResults: Array<Record<string, unknown>> = [];
  const completedEntries: string[] = [];

  for (const [index, entry] of orderedEntries.entries()) {
    const replayIdentity = childReplayIdentity(input.intent, entry.logical_date);
    const childIntent: TaskStateCommandIntent = {
      type: "set_outcome",
      task_id: input.intent.task_id,
      replay_identity: replayIdentity,
      expected_revision: currentRevision,
      outcome: input.intent.outcome,
      logical_date: entry.logical_date,
      ...(entry.occurrence_key !== undefined ? { occurrence_key: entry.occurrence_key } : {}),
      ...(entry.scheduled_due_on !== undefined ? { scheduled_due_on: entry.scheduled_due_on } : {}),
    };
    const childResult = await executeTrustedTaskStateCommand({
      userId: input.userId,
      intent: childIntent,
      adminClient: input.adminClient,
      now: input.now,
      dependencies: {
        ...dependencies,
        invokeCommand: (commandInput) => dependencies.invokeCommand({ ...commandInput, deferAchievements: true }),
      },
    });
    const childBody = childResult.body;
    if (childResult.status !== 200 || !childBody || typeof childBody !== "object" || Array.isArray(childBody) || (childBody as Record<string, unknown>).state !== "committed") {
      const failure = batchFailure(childBody, childResult.status);
      childResults.push({
        index,
        logical_date: entry.logical_date,
        replay_identity: replayIdentity,
        expected_revision: currentRevision,
        state: "rejected",
        error: failure,
      });
      return partialBatchResponse({
        dependencies,
        adminClient: input.adminClient,
        userId: input.userId,
        intent: input.intent,
        operationId,
        startedAt,
        childResults,
        completedEntries,
        failedEntryIndex: index,
        currentRevision,
        failure,
      });
    }
    childResults.push({
      index,
      logical_date: entry.logical_date,
      replay_identity: replayIdentity,
      expected_revision: currentRevision,
      state: "committed",
      result: childBody,
    });
    const nextRevision = (childBody as Record<string, unknown>).next_revision;
    if (!Number.isInteger(nextRevision) || (nextRevision as number) < currentRevision) {
      const failure = batchFailure(
        { error: { code: "MALFORMED_CHILD_RESULT", message: "Canonical child result did not return a valid next revision." } },
        502,
        "malformed_response",
      );
      return partialBatchResponse({
        dependencies,
        adminClient: input.adminClient,
        userId: input.userId,
        intent: input.intent,
        operationId,
        startedAt,
        childResults,
        completedEntries,
        failedEntryIndex: index,
        currentRevision,
        failure,
      });
    }
    currentRevision = nextRevision as number;
    completedEntries.push(entry.logical_date);
  }

  const childDurationMs = performance.now() - startedAt;
  const finalization = await finalizeBatchAchievements({
    dependencies,
    adminClient: input.adminClient,
    userId: input.userId,
    operationId,
    partial: false,
  });
  recordBatchTiming({
    entryCount: orderedEntries.length,
    childDurationMs,
    achievementDurationMs: finalization.durationMs,
    totalDurationMs: performance.now() - startedAt,
  });
  return {
    status: 200,
    body: {
      type: "history_outcome_batch",
      state: "committed",
      task_id: input.intent.task_id,
      batch_replay_identity: input.intent.replay_identity,
      expected_revision: input.intent.expected_revision,
      final_committed_revision: currentRevision,
      completed_entries: completedEntries,
      failed_entry_index: null,
      child_results: childResults,
      achievement: finalization.achievement,
      achievement_warning: finalization.achievementWarning,
      error: null,
    },
  };
}
