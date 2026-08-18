import type { Task, TaskHistory } from "@/lib/database.types";
import { buildCompatibilityTaskStateEngineInput, buildDirectTaskStateEngineInput, isCanonicalArchivedOrTrashed, type CanonicalProjectedTaskState } from "./direct-input.ts";
import { evaluateTaskState } from "./engine.ts";
import {
  canonicalizePersistableTaskStatePatch,
  canonicalizeStoredTaskStateForPatch,
  projectPersistableTaskStatePatch,
} from "./persistence-projection.ts";
import type { PersistableTaskStatePatch } from "./persistence-projection.ts";
import type { TaskHistoryOutcome } from "./types.ts";
import type { CanonicalTaskStateColumns } from "../task-state-canonical/types.ts";

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
  allowCanonicalAutomaticMissed?: boolean;
  compatibilityOnly?: boolean;
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
    if (isCanonicalArchivedOrTrashed(task as CanonicalProjectedTaskState)) continue;
    const buildInput = input.compatibilityOnly ? buildCompatibilityTaskStateEngineInput : buildDirectTaskStateEngineInput;
    const engineInput = buildInput(task as CanonicalProjectedTaskState, historyByTaskId.get(task.id) ?? [], {
      now: input.now,
      timezone: input.timezone,
      logicalDayRollover: input.rolloverTime,
    });
    const result = evaluateTaskState({
      ...engineInput,
      action: { type: "reconcile_rollover" },
    });
    // Canonical workflow rollover is committed by the trusted command after
    // candidate selection. The client planner must not turn compatibility
    // projections into a second workflow/History mutation.
    const canonicalWorkflow = (task as CanonicalProjectedTaskState).workflow_state === "in_progress";
    logicalDate ||= result.logicalDate;
    const history = result.proposedHistoryChanges.flatMap((change) => (
      change.type === "insert"
      && !canonicalWorkflow
      && (change.row.outcome !== "missed" || input.allowCanonicalAutomaticMissed === true)
    ) ? [{
      logicalDate: change.row.logicalDate,
      occurrenceIdentity: change.row.occurrenceIdentity ?? null,
      outcome: change.row.outcome,
      taskId: task.id,
    }] : []);
    const patch = canonicalWorkflow ? {} : projectPersistableTaskStatePatch(result.proposedTaskPatch, task);
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

export function engineRolloverPlanTaskMutationCandidates(
  plan: EngineRolloverPlan,
  tasks: Array<Task & Partial<Pick<CanonicalTaskStateColumns, "workflow_state" | "workflow_logical_date">>> = [],
) {
  const compatibilityCandidates = plan.tasks.filter((entry) => (
    Object.keys(entry.patch).length > 0 || entry.history.length > 0
  ));
  const candidateByTaskId = new Map(compatibilityCandidates.map((entry) => [entry.taskId, entry]));

  // Canonical workflow state owns rollover eligibility. Compatibility status
  // remains eligible only for Tasks without a canonical workflow, preserving
  // the existing projection-only rollover behavior at that boundary.
  for (const task of tasks) {
    if (task.workflow_state !== "in_progress") continue;
    const isStale = task.workflow_logical_date !== null
      && task.workflow_logical_date !== undefined
      && task.workflow_logical_date < plan.logicalDate;
    if (!isStale) {
      candidateByTaskId.delete(task.id);
      continue;
    }
    if (!candidateByTaskId.has(task.id)) {
      candidateByTaskId.set(task.id, {
        expectedRevision: task.revision,
        history: [],
        patch: {},
        rewardEligible: false,
        taskId: task.id,
      });
    }
  }

  return [...candidateByTaskId.values()];
}
