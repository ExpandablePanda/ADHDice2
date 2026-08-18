import type { Task, TaskHistory, TaskHistoryInsert, TaskUpdate } from "@/lib/database.types";
import { logicalDateForTimestamp } from "./calendar.ts";
import { buildCompatibilityTaskStateEngineInput, buildDirectTaskStateEngineInput, type CanonicalProjectedTaskState } from "./direct-input.ts";
import { evaluateTaskState } from "./engine.ts";
import { projectPersistableTaskStatePatch } from "./persistence-projection.ts";
import { TASK_STATE_ENGINE_INTEGRATION_ENABLED } from "./read-authority.ts";
import type { TaskHistoryChange, TaskHistoryOutcome, TaskStateHistoryRow } from "./types.ts";

const OCCURRENCE_SENSITIVE_TASK_UPDATE_FIELDS = [
  "status",
  "due_on",
  "due_time",
  "repeat_frequency",
  "repeat_interval",
  "repeat_days_of_week",
  "repeat_day_of_month",
  "repeat_monthly_mode",
  "repeat_monthly_ordinal",
  "repeat_monthly_weekday",
  "completed_at",
  "active_status_logical_date",
  "active_occurrence_due_on",
] as const;

const TASK_SCHEDULE_FIELDS = [
  "due_on",
  "due_time",
  "repeat_frequency",
  "repeat_interval",
  "repeat_days_of_week",
  "repeat_day_of_month",
  "repeat_monthly_mode",
  "repeat_monthly_ordinal",
  "repeat_monthly_weekday",
] as const;

function areTaskUpdateValuesEqual(left: unknown, right: unknown) {
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }
  return left === right;
}

export function hasTaskScheduleChange(task: Task, values: TaskUpdate) {
  return TASK_SCHEDULE_FIELDS.some((field) => (
    Object.hasOwn(values, field)
    && !areTaskUpdateValuesEqual(values[field], task[field])
  ));
}

export function stripStatusFromScheduleIntent(values: TaskUpdate) {
  if (!Object.hasOwn(values, "status")) return values;
  return Object.fromEntries(Object.entries(values).filter(([field]) => field !== "status")) as TaskUpdate;
}

export function isOccurrenceSensitiveTaskMutation(input: {
  engineManaged?: boolean;
  forceOccurrenceSensitive?: boolean;
  historyEntries?: TaskHistoryInsert[];
  historyEntry?: TaskHistoryInsert;
  historyStatus?: Task["status"];
  task?: Task | null;
  values: TaskUpdate;
}) {
  if (
    input.engineManaged
    || input.forceOccurrenceSensitive
    || input.historyStatus !== undefined
    || input.historyEntry
    || input.historyEntries?.length
  ) {
    return true;
  }

  return OCCURRENCE_SENSITIVE_TASK_UPDATE_FIELDS.some((field) => (
    Object.hasOwn(input.values, field)
    && (!input.task || !areTaskUpdateValuesEqual(input.values[field], input.task[field]))
  ));
}

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
  compatibilityOnly?: boolean;
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
  historicalOverride?: boolean;
  task: Task;
  timezone: string;
}) {
  if (!(input.enabled ?? TASK_STATE_ENGINE_INTEGRATION_ENABLED)) return null;
  const buildInput = input.compatibilityOnly ? buildCompatibilityTaskStateEngineInput : buildDirectTaskStateEngineInput;
  const engineInput = buildInput(input.task as CanonicalProjectedTaskState, input.history, input, {
    action: input.outcome ? {
      type: "record_outcome",
      outcome: input.outcome,
      ...(input.outcomeDate ? { logicalDate: input.outcomeDate } : {}),
      delayDays: input.delayDays,
      delayUntilDate: input.delayUntilDate,
      provenance: "manual",
      ...(input.replaceExisting ? { replaceExisting: true } : {}),
      ...(input.previousOutcome !== undefined ? { previousOutcome: input.previousOutcome } : {}),
      ...(input.occurrenceDueOn !== undefined ? { occurrenceDueOn: input.occurrenceDueOn } : {}),
      ...(input.occurrenceIdentity !== undefined ? { occurrenceIdentity: input.occurrenceIdentity } : {}),
      ...(input.historicalOverride ? { historicalOverride: true } : {}),
    } : undefined,
  });
  const result = evaluateTaskState({
    ...engineInput,
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
    ? result.proposedHistoryChanges
      .filter((change): change is Extract<TaskHistoryChange, { type: "insert" }> => change.type === "insert")
      .find((change) => change.row.logicalDate === actionHistoryDate && change.row.outcome === input.outcome)
      ?.row.outcome ?? null
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
  compatibilityOnly?: boolean;
  enabled?: boolean;
  history: TaskHistory[];
  logicalDayRollover: string;
  now: Date | string;
  proposedTask: Task;
  task: Task;
  timezone: string;
}) {
  if (!(input.enabled ?? TASK_STATE_ENGINE_INTEGRATION_ENABLED)) return null;
  const buildInput = input.compatibilityOnly ? buildCompatibilityTaskStateEngineInput : buildDirectTaskStateEngineInput;
  const engineInput = buildInput(input.proposedTask as CanonicalProjectedTaskState, input.history, input, {
    action: {
      type: "change_schedule",
      changedLogicalDate: logicalDateForTimestamp(input.now, input.timezone, input.logicalDayRollover),
      replayKind: input.proposedTask.due_on !== input.task.due_on ? "due_date" : "recurrence",
      ...(input.proposedTask.due_on !== input.task.due_on ? { manualDueOn: input.proposedTask.due_on } : {}),
    },
  });
  const result = evaluateTaskState({
    ...engineInput,
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
