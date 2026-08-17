import type { Task, TaskHistory } from "@/lib/database.types";
import { adaptLegacyTaskState } from "./legacy-adapter.ts";
import { evaluateTaskState } from "./engine.ts";
import {
  canonicalizePersistableTaskStatePatch,
  canonicalizeStoredTaskStateForPatch,
  projectPersistableTaskStatePatch,
} from "./persistence-projection.ts";
import type { PersistableTaskStatePatch } from "./persistence-projection.ts";
import type { TaskHistoryOutcome } from "./types.ts";

export type EngineRolloverHistoryRow = {
  logicalDate: string;
  occurrenceIdentity: string | null;
  outcome: TaskHistoryOutcome;
  taskId: string;
};

export type EngineRolloverTaskPlan = {
  expectedRevision: number;
  history: EngineRolloverHistoryRow[];
  patch: PersistableTaskStatePatch;
  rewardEligible: boolean;
  taskId: string;
};

export type EngineRolloverPlan = {
  logicalDate: string;
  remainingPatchSummaries: EngineRolloverPatchSummary[];
  tasks: EngineRolloverTaskPlan[];
  tasksEvaluated: number;
  unsupportedTaskIds: string[];
};

export type EngineRolloverPatchSummary = {
  patchKeys: Array<keyof PersistableTaskStatePatch>;
  projectedNormalizedValues: ReturnType<typeof canonicalizePersistableTaskStatePatch>;
  storedNormalizedValues: ReturnType<typeof canonicalizeStoredTaskStateForPatch>;
  taskId: string;
};

const MAX_REMAINING_PATCH_SUMMARIES = 50;

/**
 * The only production rollover planner. It consumes the workspace's loaded
 * snapshots and deliberately cannot express archive, trash, or unsupported
 * recurrence metadata writes.
 */
export function createEngineRolloverPlan(input: {
  history: TaskHistory[];
  includeDiagnostics?: boolean;
  now: Date | string;
  rolloverTime: string;
  tasks: Task[];
  timezone: string;
}): EngineRolloverPlan {
  const historyByTaskId = new Map<string, TaskHistory[]>();
  for (const row of input.history) {
    const rows = historyByTaskId.get(row.task_id) ?? [];
    rows.push(row);
    historyByTaskId.set(row.task_id, rows);
  }
  const tasks: EngineRolloverTaskPlan[] = [];
  const remainingPatchSummaries: EngineRolloverPatchSummary[] = [];
  const unsupportedTaskIds: string[] = [];
  let logicalDate = "";
  for (const task of input.tasks) {
    if (task.status === "archived" || task.status === "trashed") continue;
    const adapted = adaptLegacyTaskState(task, historyByTaskId.get(task.id) ?? [], {
      now: input.now,
      timezone: input.timezone,
      logicalDayRollover: input.rolloverTime,
    });
    // Unsupported adapter metadata is diagnostic-only. The projection below
    // guarantees it cannot cross the persistence boundary.
    if (adapted.unsupported.length > 0) unsupportedTaskIds.push(task.id);
    const result = evaluateTaskState({
      ...adapted.engineInput,
      action: { type: "reconcile_rollover" },
    });
    logicalDate ||= result.logicalDate;
    const history = result.proposedHistoryChanges.flatMap((change) => change.type === "insert" ? [{
      logicalDate: change.row.logicalDate,
      occurrenceIdentity: change.row.occurrenceIdentity ?? null,
      outcome: change.row.outcome,
      taskId: task.id,
    }] : []);
    const patch = projectPersistableTaskStatePatch(result.proposedTaskPatch, task);
    if (input.includeDiagnostics !== false && Object.keys(patch).length > 0 && remainingPatchSummaries.length < MAX_REMAINING_PATCH_SUMMARIES) {
      remainingPatchSummaries.push({
        patchKeys: Object.keys(patch) as Array<keyof PersistableTaskStatePatch>,
        projectedNormalizedValues: canonicalizePersistableTaskStatePatch(patch),
        storedNormalizedValues: canonicalizeStoredTaskStateForPatch(patch, task),
        taskId: task.id,
      });
    }
    if (history.length > 0 || Object.keys(patch).length > 0) {
      tasks.push({
        expectedRevision: task.revision,
        history,
        patch,
        rewardEligible: result.rewardEligibility.eligible && history.some((row) => row.outcome === "did_my_best"),
        taskId: task.id,
      });
    }
  }
  return { logicalDate, remainingPatchSummaries, tasks, tasksEvaluated: input.tasks.length, unsupportedTaskIds };
}

export function engineRolloverPlanHasMutations(plan: EngineRolloverPlan) {
  return plan.tasks.length > 0;
}

export function engineRolloverPlanTaskMutationCandidates(plan: EngineRolloverPlan) {
  return plan.tasks.filter((entry) => Object.keys(entry.patch).length > 0);
}
