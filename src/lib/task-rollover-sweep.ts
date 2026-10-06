import {
  invokeTaskRolloverSweep,
  type TaskRolloverSweepIntent,
  type TaskRolloverSweepResponse,
  type TaskStateCommandClient,
} from "@/lib/task-state-command-client";
import { sha256Hex, stableSerialize } from "@/lib/task-state-canonical/digest";
import {
  chunkTaskRolloverCommands,
  TASK_ROLLOVER_SWEEP_BATCH_SIZE,
} from "@/lib/task-rollover-batch";
import {
  classifyTaskStateRuntimeAction,
} from "@/lib/task-state-runtime-actions";
import { reconcileCommittedTask, type TaskStateRuntimeCanonicalAction, type TaskStateRuntimeLocalTask } from "@/lib/task-state-runtime-executor";

export type TaskRolloverSweepCandidate = {
  task: TaskStateRuntimeLocalTask;
  replayIdentity: string;
};

type RolloverSweepInvoke = (
  intent: TaskRolloverSweepIntent,
  options: { client: TaskStateCommandClient | null },
) => Promise<TaskRolloverSweepResponse>;

export type TaskRolloverSweepExecutionResult = {
  success: boolean;
  settledTaskIds: string[];
  committedTasks: Array<{ taskId: string; task: TaskStateRuntimeLocalTask }>;
  errorMessage: string | null;
  achievementFinalizationPending: boolean;
};

function createRolloverChunkReplayIdentity(input: {
  baseReplayIdentity: string;
  chunk: TaskRolloverSweepIntent["commands"];
  chunkIndex: number;
  chunkCount: number;
}) {
  if (input.chunkCount === 1) return input.baseReplayIdentity;
  const chunkFingerprint = sha256Hex(stableSerialize(input.chunk.map((command) => command.replay_identity))).slice(0, 12);
  return `${input.baseReplayIdentity.slice(0, 196)}:chunk:${input.chunkIndex + 1}:${chunkFingerprint}`;
}

function recordRolloverChunkDiagnostic(input: {
  diagnosticsEnabled: boolean;
  totalCandidateCount: number;
  chunkCount: number;
  chunkIndex: number;
  chunkSize: number;
  committedCount: number;
  durationMs: number;
  failureState: string;
}) {
  if (!input.diagnosticsEnabled || typeof console === "undefined") return;
  console.info("[rollover] sweep chunk", {
    committedCount: input.committedCount,
    chunkCount: input.chunkCount,
    chunkIndex: input.chunkIndex,
    chunkSize: input.chunkSize,
    durationMs: Math.round(input.durationMs),
    failureState: input.failureState,
    totalCandidateCount: input.totalCandidateCount,
  });
}

export async function executeTaskRolloverSweep(input: {
  client: TaskStateCommandClient | null;
  candidates: TaskRolloverSweepCandidate[];
  settledTaskIds: ReadonlySet<string>;
  achievementFinalizationPending: boolean;
  sweepReplayIdentity: string;
  diagnosticsEnabled?: boolean;
  invoke?: RolloverSweepInvoke;
}): Promise<TaskRolloverSweepExecutionResult> {
  const actionsByTaskId = new Map<string, { action: TaskStateRuntimeCanonicalAction; task: TaskStateRuntimeLocalTask }>();
  const commands: TaskRolloverSweepIntent["commands"] = [];

  for (const candidate of input.candidates) {
    if (input.settledTaskIds.has(candidate.task.id)) continue;
    const action = classifyTaskStateRuntimeAction({
      canonicalIntent: { type: "reconcile_rollover" },
      replayIdentity: candidate.replayIdentity,
      task: candidate.task,
      values: {},
    });
    if (action.kind !== "canonical_action" || action.actionType !== "reconcile_rollover" || !action.intent) {
      return {
        success: false,
        settledTaskIds: [],
        committedTasks: [],
        errorMessage: "A rollover Task State command could not be classified.",
        achievementFinalizationPending: false,
      };
    }
    actionsByTaskId.set(candidate.task.id, { action, task: candidate.task });
    commands.push(action.intent as TaskRolloverSweepIntent["commands"][number]);
  }

  if (commands.length === 0 && !input.achievementFinalizationPending) {
    return {
      success: true,
      settledTaskIds: [],
      committedTasks: [],
      errorMessage: null,
      achievementFinalizationPending: false,
    };
  }

  if (commands.length === 0) {
    return {
      success: false,
      settledTaskIds: [],
      committedTasks: [],
      errorMessage: "Rollover Achievement finalization requires replayable child commands.",
      achievementFinalizationPending: true,
    };
  }

  const committedTasks: TaskRolloverSweepExecutionResult["committedTasks"] = [];
  const settledTaskIds: string[] = [];
  let errorMessage: string | null = null;
  let achievementFinalizationPending = false;
  const chunks = chunkTaskRolloverCommands(commands, TASK_ROLLOVER_SWEEP_BATCH_SIZE);
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    const chunk = chunks[chunkIndex]!;
    const startedAt = typeof performance === "undefined" ? 0 : performance.now();
    let response: TaskRolloverSweepResponse;
    try {
      response = await (input.invoke ?? invokeTaskRolloverSweep)({
        type: "reconcile_rollover_sweep",
        replay_identity: createRolloverChunkReplayIdentity({
          baseReplayIdentity: input.sweepReplayIdentity,
          chunk,
          chunkCount: chunks.length,
          chunkIndex,
        }),
        commands: chunk,
      }, { client: input.client });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "The rollover sweep could not be invoked.";
      recordRolloverChunkDiagnostic({
        committedCount: 0,
        chunkCount: chunks.length,
        chunkIndex: chunkIndex + 1,
        chunkSize: chunk.length,
        diagnosticsEnabled: input.diagnosticsEnabled === true,
        durationMs: typeof performance === "undefined" ? 0 : performance.now() - startedAt,
        failureState: "invocation_failed",
        totalCandidateCount: input.candidates.length,
      });
      break;
    }

    let malformedResponse = false;
    for (const child of response.childResults) {
      if (!child.response) continue;
      const action = actionsByTaskId.get(child.taskId);
      if (!action) {
        malformedResponse = true;
        errorMessage = "The rollover sweep returned an unknown committed Task.";
        break;
      }
      try {
        committedTasks.push({
          taskId: child.taskId,
          task: reconcileCommittedTask(action.action, action.task, child.response),
        });
      } catch (error) {
        malformedResponse = true;
        errorMessage = error instanceof Error ? error.message : "The rollover sweep response was malformed.";
        break;
      }
    }

    const chunkFinalizationPending = response.achievementFinalizationPending || response.achievementStatus === "failed";
    achievementFinalizationPending = achievementFinalizationPending || chunkFinalizationPending;
    // A chunk whose Achievement finalization failed must be replayed with the
    // same child identities. Do not mark those Tasks settled or a retry would
    // lose the committed History fact IDs needed by the finalizer.
    if (!chunkFinalizationPending && !malformedResponse) {
      settledTaskIds.push(...response.committedTaskIds);
    }

    const failed = malformedResponse || !response.success || response.error !== null || chunkFinalizationPending;
    recordRolloverChunkDiagnostic({
      committedCount: response.committedTaskIds.length,
      chunkCount: chunks.length,
      chunkIndex: chunkIndex + 1,
      chunkSize: chunk.length,
      diagnosticsEnabled: input.diagnosticsEnabled === true,
      durationMs: typeof performance === "undefined" ? 0 : performance.now() - startedAt,
      failureState: malformedResponse
        ? "malformed_response"
        : response.error?.code ?? (chunkFinalizationPending ? "achievement_finalization_pending" : failed ? "chunk_failed" : "none"),
      totalCandidateCount: input.candidates.length,
    });
    if (failed) {
      errorMessage = errorMessage ?? response.error?.message ?? (
        chunkFinalizationPending
          ? "Rollover Tasks committed, but Achievement reconciliation did not complete."
          : "The rollover sweep did not complete."
      );
      break;
    }
  }

  return {
    success: errorMessage === null,
    settledTaskIds: [...new Set(settledTaskIds)],
    committedTasks,
    errorMessage,
    achievementFinalizationPending,
  };
}
