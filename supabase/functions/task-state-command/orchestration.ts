import {
  CanonicalCommandPlanningError,
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
};

const defaultDependencies: OrchestrationDependencies = {
  loadReplayOperation: loadCanonicalTaskCommandOperationReplay,
  loadCanonicalState: loadCanonicalTaskState,
  buildEngineInput: buildCanonicalTaskStateEngineInput,
  buildCommand: buildTrustedTaskStateCommand,
  planCommand: planTaskStateCommand,
  serializePlan: serializeCanonicalTaskStateCommandForRpc,
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

  const rpcResult = await input.adminClient.rpc(
    "adhdice_execute_task_state_command",
    {
      p_user_id: input.userId,
      p_command: dependencies.serializePlan(plan),
    },
  );
  if (rpcResult.error) {
    const status = rpcResult.error.code === "40001" ? 409 : rpcResult.error.code === "42501" ? 403 : 422;
    return errorResponse("command_rejected", "Canonical Task State command was rejected.", status);
  }
  return { status: 200, body: rpcResult.data };
}
