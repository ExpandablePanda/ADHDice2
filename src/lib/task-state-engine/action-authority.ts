import type { Task, TaskHistory, TaskUpdate } from "@/lib/database.types";
import { adaptLegacyTaskState } from "./legacy-adapter.ts";
import { evaluateTaskState } from "./engine.ts";
import { projectPersistableTaskStatePatch } from "./persistence-projection.ts";
import { TASK_STATE_ENGINE_INTEGRATION_ENABLED } from "./read-authority.ts";
import type { TaskHistoryOutcome } from "./types.ts";

function storedStatusForActiveStatus(status: ReturnType<typeof evaluateTaskState>["activeStatus"]): Task["status"] {
  return status === "unscheduled" ? "pending" : status;
}

export function evaluateTaskActionAuthority(input: {
  enabled?: boolean;
  history: TaskHistory[];
  logicalDayRollover: string;
  delayDays?: number;
  now: Date | string;
  outcome?: TaskHistoryOutcome;
  outcomeDate?: string;
  task: Task;
  timezone: string;
}) {
  if (!(input.enabled ?? TASK_STATE_ENGINE_INTEGRATION_ENABLED)) return null;
  const adapted = adaptLegacyTaskState(input.task, input.history, input);
  const result = evaluateTaskState({
    ...adapted.engineInput,
    ...(input.outcome ? { action: { type: "record_outcome" as const, outcome: input.outcome, logicalDate: input.outcomeDate, delayDays: input.delayDays, provenance: "manual" as const } } : {}),
  });
  const persistableTaskPatch = projectPersistableTaskStatePatch(result.proposedTaskPatch, input.task);
  const taskUpdate: TaskUpdate = {
    // An action plan always owns the resulting stored status. In particular,
    // a recurring Done must not fall back to the requested outcome when the
    // derived next status equals the task's pre-action status.
    status: storedStatusForActiveStatus(result.activeStatus),
    ...(Object.hasOwn(persistableTaskPatch, "dueOn") ? { due_on: persistableTaskPatch.dueOn } : {}),
    ...(Object.hasOwn(persistableTaskPatch, "completedAt") ? { completed_at: persistableTaskPatch.completedAt } : {}),
    ...(Object.hasOwn(persistableTaskPatch, "activeStatusLogicalDate") ? { active_status_logical_date: persistableTaskPatch.activeStatusLogicalDate } : {}),
    ...(Object.hasOwn(persistableTaskPatch, "activeOccurrenceDueOn") ? { active_occurrence_due_on: persistableTaskPatch.activeOccurrenceDueOn } : {}),
  };
  const actionHistoryDate = input.outcomeDate ?? result.logicalDate;
  const historyOutcome = input.outcome
    ? result.proposedHistoryChanges.find((change) => (
      change.type === "insert"
      && change.row.logicalDate === actionHistoryDate
      && change.row.outcome === input.outcome
    ))?.row.outcome ?? null
    : null;
  return {
    ...result,
    mutationPlan: {
      history: result.proposedHistoryChanges.flatMap((change) => change.type === "insert" ? [change.row] : []),
      historyOutcome,
      taskUpdate,
    },
    persistableTaskPatch,
  };
}
