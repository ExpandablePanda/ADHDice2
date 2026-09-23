import {
  invokeTaskRolloverSweep,
  type TaskRolloverSweepIntent,
  type TaskRolloverSweepResponse,
  type TaskStateCommandClient,
} from "@/lib/task-state-command-client";
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

export async function executeTaskRolloverSweep(input: {
  client: TaskStateCommandClient | null;
  candidates: TaskRolloverSweepCandidate[];
  settledTaskIds: ReadonlySet<string>;
  achievementFinalizationPending: boolean;
  sweepReplayIdentity: string;
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

  let response: TaskRolloverSweepResponse;
  try {
    response = await (input.invoke ?? invokeTaskRolloverSweep)({
      type: "reconcile_rollover_sweep",
      replay_identity: input.sweepReplayIdentity,
      commands,
    }, { client: input.client });
  } catch (error) {
    return {
      success: false,
      settledTaskIds: [],
      committedTasks: [],
      errorMessage: error instanceof Error ? error.message : "The rollover sweep could not be invoked.",
      achievementFinalizationPending: false,
    };
  }

  const committedTasks: TaskRolloverSweepExecutionResult["committedTasks"] = [];
  for (const child of response.childResults) {
    if (!child.response) continue;
    const action = actionsByTaskId.get(child.taskId);
    if (!action) {
      return {
        success: false,
        settledTaskIds: response.committedTaskIds,
        committedTasks,
        errorMessage: "The rollover sweep returned an unknown committed Task.",
        achievementFinalizationPending: response.achievementFinalizationPending,
      };
    }
    try {
      committedTasks.push({
        taskId: child.taskId,
        task: reconcileCommittedTask(action.action, action.task, child.response),
      });
    } catch (error) {
      return {
        success: false,
        settledTaskIds: response.committedTaskIds,
        committedTasks,
        errorMessage: error instanceof Error ? error.message : "The rollover sweep response was malformed.",
        achievementFinalizationPending: response.achievementFinalizationPending,
      };
    }
  }

  return {
    success: response.success,
    settledTaskIds: response.committedTaskIds,
    committedTasks,
    errorMessage: response.error?.message ?? null,
    achievementFinalizationPending: response.achievementFinalizationPending,
  };
}
