import type { Task, TaskHistory } from "@/lib/database.types";
import type { TaskDisplayStatusByTaskId } from "@/lib/task-display-status";
import { deduplicateTaskHistoryByLogicalDate } from "@/lib/task-history";
import type { CanonicalTaskStateColumns } from "../task-state-canonical/types.ts";
import { buildCompatibilityTaskStateEngineInput, buildDirectTaskStateEngineInput, isCanonicalArchivedOrTrashed, type CanonicalProjectedTaskState } from "./direct-input.ts";
import { evaluateTaskState } from "./engine.ts";
import type { TaskBehaviorPolicyRevisionMap, TaskBehaviorProfiles } from "./behavior-policy.ts";
import { selectTaskBehaviorProjectionSemantics } from "./behavior-policy.ts";
import { createProjectionDomainRevision, type StableTaskProjectionCache } from "../stable-task-projection.ts";
import { normalizeTaskType } from "../task-type.ts";
import { logicalDateForTimestamp } from "./calendar.ts";

/**
 * Compatibility export retained for callers that still gate Task State
 * integration. Active Status reads themselves always use the engine below.
 */
export const TASK_STATE_ENGINE_INTEGRATION_ENABLED = true;

export type ActiveStatusAuthority = "engine";
export type ActiveStatusReadResult = {
  authority: ActiveStatusAuthority;
  statusesByTaskId: TaskDisplayStatusByTaskId;
  dueOnByTaskId: Record<string, string | null>;
};

type ActiveStatusReadTask = Task & Partial<CanonicalTaskStateColumns> & {
  canonical_schedule_anchor_date?: string | null;
  canonical_schedule_boundary?: CanonicalProjectedTaskState["canonical_schedule_boundary"];
};
type ActiveStatusReadInput = {
  behaviorProfiles?: TaskBehaviorProfiles;
  behaviorPolicyRevisions?: TaskBehaviorPolicyRevisionMap;
  enabled?: boolean;
  historyByTaskId: Record<string, TaskHistory[]>;
  logicalDayRollover: string;
  now: string | Date;
  tasks: ActiveStatusReadTask[];
  timezone: string;
};

export type ActiveStatusTaskReadInput = Omit<ActiveStatusReadInput, "historyByTaskId" | "tasks"> & {
  history: TaskHistory[];
  task: ActiveStatusReadTask;
};

function activeStatusTaskIdentity(task: ActiveStatusReadTask) {
  const boundary = task.canonical_schedule_boundary;
  return {
    active_occurrence_due_on: task.active_occurrence_due_on,
    active_status_logical_date: task.active_status_logical_date,
    canonical_schedule_anchor_date: task.canonical_schedule_anchor_date,
    canonical_schedule_boundary: boundary
      ? {
        anchor_confidence: boundary.anchor_confidence,
        anchor_date: boundary.anchor_date,
        one_time_due_on: boundary.one_time_due_on,
        repeat_day_of_month: boundary.repeat_day_of_month,
        repeat_days_of_week: boundary.repeat_days_of_week,
        repeat_frequency: boundary.repeat_frequency,
        repeat_interval: boundary.repeat_interval,
        repeat_monthly_mode: boundary.repeat_monthly_mode,
        repeat_monthly_ordinal: boundary.repeat_monthly_ordinal,
        repeat_monthly_weekday: boundary.repeat_monthly_weekday,
        schedule_model: boundary.schedule_model,
      }
      : null,
    canonicalization_status: task.canonicalization_status,
    container_state: task.container_state,
    due_on: task.due_on,
    id: task.id,
    repeat_day_of_month: task.repeat_day_of_month,
    repeat_days_of_week: task.repeat_days_of_week,
    repeat_frequency: task.repeat_frequency,
    repeat_interval: task.repeat_interval,
    repeat_monthly_mode: task.repeat_monthly_mode,
    repeat_monthly_ordinal: task.repeat_monthly_ordinal,
    repeat_monthly_weekday: task.repeat_monthly_weekday,
    status: task.status,
    task_type: task.task_type,
    terminal_state: task.terminal_state,
    workflow_logical_date: task.workflow_logical_date,
    workflow_state: task.workflow_state,
  };
}

function activeStatusHistoryIdentity(history: readonly TaskHistory[]) {
  return history.map((row) => ({
    canonical_provenance_kind: row.canonical_provenance_kind,
    counted_as_due_occurrence: row.counted_as_due_occurrence,
    created_at: row.created_at,
    effective_due_on: row.effective_due_on,
    entry_date: row.entry_date,
    event_type: row.event_type,
    id: row.id,
    occurrence_due_on: row.occurrence_due_on,
    occurrence_key: row.occurrence_key,
    recurrence_authoritative: row.recurrence_authoritative,
    status: row.status,
    task_id: row.task_id,
    updated_at: row.updated_at,
    was_completed: row.was_completed,
  }));
}

/** Semantic cache identity for one Task's Active Status projection. */
export function createActiveStatusTaskProjectionRevision(input: ActiveStatusTaskReadInput) {
  return createProjectionDomainRevision(`active-status-task:${input.task.id}`, {
    history: activeStatusHistoryIdentity(input.history),
    logicalDayRollover: input.logicalDayRollover,
    logicalDate: logicalDateForTimestamp(input.now, input.timezone, input.logicalDayRollover),
    policy: selectTaskBehaviorProjectionSemantics({
      behaviorPolicyRevisions: input.behaviorPolicyRevisions,
      behaviorProfiles: input.behaviorProfiles,
      taskType: normalizeTaskType(input.task.task_type),
    }).activeStatus,
    task: activeStatusTaskIdentity(input.task),
    timezone: input.timezone,
  });
}

export function resolveActiveTaskStatus(input: ActiveStatusTaskReadInput) {
  const normalizedHistory = deduplicateTaskHistoryByLogicalDate(input.history);
  if (isCanonicalArchivedOrTrashed(input.task)) {
    return {
      status: input.task.container_state === "trashed" || input.task.status === "trashed" ? "trashed" : "archived",
      // The legacy whole-collection read omitted archived/trashed due dates.
      // Preserve that presentation fallback in the incremental path.
      dueOn: undefined,
    } as const;
  }
  const engineInput = buildDirectTaskStateEngineInput(input.task, normalizedHistory, input);
  const evaluated = evaluateTaskState(engineInput);
  return { dueOn: evaluated.nextDueDate, status: evaluated.activeStatus } as const;
}

export type IncrementalActiveStatusReadResult = ActiveStatusReadResult & {
  evaluatedTasks: number;
  reusedTasks: number;
};

export function resolveActiveTaskStatusesIncrementally(
  input: ActiveStatusReadInput,
  projectionCache: StableTaskProjectionCache,
): IncrementalActiveStatusReadResult {
  const statusesByTaskId: TaskDisplayStatusByTaskId = {};
  const dueOnByTaskId: Record<string, string | null> = {};
  let evaluatedTasks = 0;
  let reusedTasks = 0;
  for (const task of input.tasks) {
    const taskInput = {
      behaviorProfiles: input.behaviorProfiles,
      behaviorPolicyRevisions: input.behaviorPolicyRevisions,
      history: input.historyByTaskId[task.id] ?? [],
      logicalDayRollover: input.logicalDayRollover,
      now: input.now,
      task,
      timezone: input.timezone,
    } satisfies ActiveStatusTaskReadInput;
    const cached = projectionCache.getOrCreateByKey(
      "active-status",
      task.id,
      createActiveStatusTaskProjectionRevision(taskInput),
      () => {
        evaluatedTasks += 1;
        return resolveActiveTaskStatus(taskInput);
      },
    );
    if (cached.reused) reusedTasks += 1;
    statusesByTaskId[task.id] = cached.value.status;
    if (cached.value.dueOn !== undefined) dueOnByTaskId[task.id] = cached.value.dueOn;
  }
  projectionCache.retainKeys("active-status", input.tasks.map((task) => task.id));
  return { authority: "engine", dueOnByTaskId, evaluatedTasks, reusedTasks, statusesByTaskId };
}

function resolveTaskStatuses(input: ActiveStatusReadInput, compatibilityOnly: boolean): ActiveStatusReadResult {
  const statusesByTaskId: TaskDisplayStatusByTaskId = {};
  const dueOnByTaskId: Record<string, string | null> = {};
  for (const task of input.tasks) {
    const normalizedHistory = deduplicateTaskHistoryByLogicalDate(input.historyByTaskId[task.id] ?? []);
    if (isCanonicalArchivedOrTrashed(task)) {
      statusesByTaskId[task.id] = task.container_state === "trashed" || task.status === "trashed" ? "trashed" : "archived";
      continue;
    }
    const buildInput = compatibilityOnly ? buildCompatibilityTaskStateEngineInput : buildDirectTaskStateEngineInput;
    const engineInput = buildInput(task, normalizedHistory, {
      behaviorProfiles: input.behaviorProfiles,
      behaviorPolicyRevisions: input.behaviorPolicyRevisions,
      now: input.now,
      timezone: input.timezone,
      logicalDayRollover: input.logicalDayRollover,
    });
    const evaluated = evaluateTaskState(engineInput);
    statusesByTaskId[task.id] = evaluated.activeStatus;
    dueOnByTaskId[task.id] = evaluated.nextDueDate;
  }
  return { authority: "engine", dueOnByTaskId, statusesByTaskId };
}

/** The production shared Active Status authority. */
export function resolveActiveTaskStatuses(input: ActiveStatusReadInput): ActiveStatusReadResult {
  return resolveTaskStatuses(input, false);
}

/** Compatibility-only Active Status translation for legacy/test-shaped Task fixtures. */
export function resolveCompatibilityTaskStatuses(input: ActiveStatusReadInput): ActiveStatusReadResult {
  return resolveTaskStatuses(input, true);
}

/** Presentation-only copies; never pass these to a persistence mutation. */
export function projectTasksForActiveStatusRead(
  tasks: Task[],
  statusesByTaskId: TaskDisplayStatusByTaskId,
  dueOnByTaskId: Record<string, string | null> = {},
) {
  return tasks.map((task) => {
    const hasCanonicalStatus = Object.hasOwn(statusesByTaskId, task.id);
    const hasCanonicalDueOn = Object.hasOwn(dueOnByTaskId, task.id);
    const status = hasCanonicalStatus ? statusesByTaskId[task.id]! : task.status;
    const projectedStatus = status === "unscheduled" ? task.status : status;
    const dueOn = hasCanonicalDueOn ? dueOnByTaskId[task.id] ?? null : task.due_on;
    // The database-backed Task row remains valid when the engine-only display
    // status is unscheduled. Callers must consume the map for presentation.
    if (projectedStatus === task.status && dueOn === task.due_on) return task;
    return {
      ...task,
      ...(projectedStatus !== task.status ? { status: projectedStatus } : {}),
      ...(hasCanonicalDueOn ? { due_on: dueOn } : {}),
    };
  });
}
