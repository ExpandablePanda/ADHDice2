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
  type TaskStateCommandIntent,
  type TrustedTaskStateCommandReplayDescriptor,
} from "./domain.ts";
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
  }) => Promise<{ data: unknown; error: { code?: string | null; message?: string } | null }>;
};

const defaultDependencies: OrchestrationDependencies = {
  loadReplayOperation: loadCanonicalTaskCommandOperationReplay,
  loadCanonicalState: loadCanonicalTaskState,
  buildEngineInput: buildCanonicalTaskStateEngineInput,
  buildCommand: buildTrustedTaskStateCommand,
  planCommand: planTaskStateCommand,
  serializePlan: serializeCanonicalTaskStateCommandForRpc,
  invokeCommand: async ({ adminClient, userId, serializedPlan, intent }) => {
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
    return adminClient.rpc("adhdice_execute_task_state_command", {
      p_user_id: userId,
      p_command: serializedPlan,
    });
  },
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
    includeLegacyHistoryEvidence: false,
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
