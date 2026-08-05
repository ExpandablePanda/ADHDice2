import type { Task, TaskHistory, TaskHistoryInsert, TaskUpdate } from "@/lib/database.types";
import { adaptLegacyTaskState } from "./legacy-adapter.ts";
import { evaluateTaskState } from "./engine.ts";
import { projectPersistableTaskStatePatch } from "./persistence-projection.ts";
import { TASK_STATE_ENGINE_INTEGRATION_ENABLED } from "./read-authority.ts";
import type { TaskHistoryOutcome } from "./types.ts";
import type { TaskStateHistoryRow } from "./types.ts";

function storedStatusForActiveStatus(status: ReturnType<typeof evaluateTaskState>["activeStatus"]): Task["status"] {
  return status === "unscheduled" ? "pending" : status;
}

export function taskStateHistoryRowToInsert(
  row: TaskStateHistoryRow,
  userId: string,
): TaskHistoryInsert {
  const occurrenceDueOn = row.occurrenceDueOn
    ?? row.occurrenceIdentity?.match(/(\d{4}-\d{2}-\d{2})$/)?.[1]
    ?? null;
  const successful = row.outcome === "done" || row.outcome === "did_my_best" || row.outcome === "complete";
  return {
    entry_date: row.logicalDate,
    event_type: row.eventType ?? (row.outcome === "complete" ? "completed_permanently" : "status"),
    occurrence_due_on: occurrenceDueOn,
    occurrence_key: row.occurrenceIdentity,
    status: row.outcome,
    task_id: row.taskId,
    user_id: userId,
    was_completed: row.wasCompleted ?? successful,
    counted_as_due_occurrence: row.countedAsDueOccurrence ?? Boolean(occurrenceDueOn),
  };
}

export function evaluateTaskActionAuthority(input: {
  enabled?: boolean;
  history: TaskHistory[];
  logicalDayRollover: string;
  delayDays?: number;
  delayUntilDate?: string | null;
  now: Date | string;
  outcome?: TaskHistoryOutcome;
  outcomeDate?: string;
  replaceExisting?: boolean;
  previousOutcome?: TaskHistoryOutcome | null;
  occurrenceDueOn?: string | null;
  occurrenceIdentity?: string | null;
  task: Task;
  timezone: string;
}) {
  if (!(input.enabled ?? TASK_STATE_ENGINE_INTEGRATION_ENABLED)) return null;
  const adapted = adaptLegacyTaskState(input.task, input.history, input);
  const result = evaluateTaskState({
    ...adapted.engineInput,
    ...(input.outcome ? {
      action: {
        type: "record_outcome" as const,
        outcome: input.outcome,
        logicalDate: input.outcomeDate,
        delayDays: input.delayDays,
        delayUntilDate: input.delayUntilDate,
        provenance: "manual" as const,
        ...(input.replaceExisting ? { replaceExisting: true } : {}),
        ...(input.previousOutcome !== undefined ? { previousOutcome: input.previousOutcome } : {}),
        ...(input.occurrenceDueOn !== undefined ? { occurrenceDueOn: input.occurrenceDueOn } : {}),
        ...(input.occurrenceIdentity !== undefined ? { occurrenceIdentity: input.occurrenceIdentity } : {}),
      },
    } : {}),
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
      historyInserts: result.proposedHistoryChanges.flatMap((change) => (
        change.type === "insert" ? [taskStateHistoryRowToInsert(change.row, input.task.user_id)] : []
      )),
      historyOutcome,
      taskUpdate,
    },
    persistableTaskPatch,
  };
}

/**
 * Schedule edits are evaluated by the same engine as status actions. The
 * proposed task is the schedule snapshot, while complete task-scoped History
 * remains the only source for unresolved outcomes and occurrence identity.
 */
export function evaluateTaskScheduleAuthority(input: {
  enabled?: boolean;
  history: TaskHistory[];
  logicalDayRollover: string;
  now: Date | string;
  proposedTask: Task;
  task: Task;
  timezone: string;
}) {
  if (!(input.enabled ?? TASK_STATE_ENGINE_INTEGRATION_ENABLED)) return null;
  const adapted = adaptLegacyTaskState(input.proposedTask, input.history, input);
  const result = evaluateTaskState({
    ...adapted.engineInput,
    action: { type: "change_schedule" },
  });
  const persistableTaskPatch = projectPersistableTaskStatePatch(result.proposedTaskPatch, input.task);
  const taskUpdate: TaskUpdate = {
    due_on: input.proposedTask.due_on,
    status: storedStatusForActiveStatus(result.activeStatus),
    ...(Object.hasOwn(persistableTaskPatch, "activeStatusLogicalDate")
      ? { active_status_logical_date: persistableTaskPatch.activeStatusLogicalDate }
      : {}),
    ...(Object.hasOwn(persistableTaskPatch, "activeOccurrenceDueOn")
      ? { active_occurrence_due_on: persistableTaskPatch.activeOccurrenceDueOn }
      : {}),
  };
  return {
    ...result,
    mutationPlan: {
      history: [] as TaskStateHistoryRow[],
      historyInserts: [] as TaskHistoryInsert[],
      taskUpdate,
      rewardEligibility: { ...result.rewardEligibility, eligible: false, reason: "no_outcome" as const },
      unresolvedOccurrenceDueOn: result.unresolvedOccurrenceDueOn,
      unresolvedOccurrenceIdentity: result.unresolvedOccurrenceIdentity,
    },
    persistableTaskPatch,
  };
}
