import type { Task, TaskHistory } from "../database.types.ts";
import type { CanonicalTaskStateColumns } from "../task-state-canonical/types.ts";
import type { CanonicalTaskScheduleBoundary } from "../task-state-canonical/types.ts";
import { occurrenceIdentity } from "./recurrence.ts";
import type {
  TaskCalendarOverride,
  TaskHistoryOutcome,
  TaskRecurrence,
  TaskStateEngineInput,
  TaskStateHistoryRow,
} from "./types.ts";

export type CanonicalProjectedTaskState = Task
  & Partial<CanonicalTaskStateColumns>
  & {
    canonical_schedule_anchor_date?: string | null;
    canonical_schedule_boundary?: CanonicalTaskScheduleBoundary | null;
  };

type DirectTaskStateContext = {
  now: string | Date;
  timezone: string;
  logicalDayRollover: string;
};

const SUCCESSFUL_OUTCOMES = new Set<TaskHistoryOutcome>(["done", "did_my_best", "complete"]);

function canonicalLifecycle(task: CanonicalProjectedTaskState): TaskStateEngineInput["task"]["lifecycle"] {
  if (task.terminal_state === "permanently_complete") return "complete";
  if (task.container_state === "trashed") return "trashed";
  if (task.container_state === "archived") return "archived";
  if (task.terminal_state || task.container_state || task.workflow_state) return "active";
  if (task.status === "complete") return "complete";
  if (task.status === "archived") return "archived";
  if (task.status === "trashed") return "trashed";
  return "active";
}

export function isCanonicalArchivedOrTrashed(task: CanonicalProjectedTaskState) {
  if (task.container_state === "archived" || task.container_state === "trashed") return true;
  if (task.terminal_state || task.container_state || task.workflow_state) return false;
  return task.status === "archived" || task.status === "trashed";
}

export function recurrenceFromBoundary(boundary: CanonicalTaskScheduleBoundary): TaskRecurrence {
  if (boundary.schedule_model === "unscheduled" || boundary.schedule_model === "one_time") return { kind: "none" };
  if (boundary.schedule_model === "rolling") {
    return {
      kind: "rolling",
      intervalDays: boundary.repeat_interval,
      ...(boundary.repeat_frequency === "daily_until_complete" ? { untilComplete: true } : {}),
    };
  }
  if (boundary.repeat_frequency === "weekly") {
    return {
      kind: "weekly",
      intervalWeeks: boundary.repeat_interval,
      weekdays: boundary.repeat_days_of_week,
      anchorDate: boundary.anchor_date,
    };
  }
  if (boundary.repeat_frequency === "monthly") {
    return {
      kind: "monthly",
      intervalMonths: boundary.repeat_interval,
      mode: boundary.repeat_monthly_mode,
      dayOfMonth: boundary.repeat_day_of_month,
      ordinal: boundary.repeat_monthly_ordinal,
      weekday: boundary.repeat_monthly_weekday,
      anchorDate: boundary.anchor_date,
    };
  }
  return {
    kind: "rolling",
    intervalDays: boundary.repeat_interval,
    ...(boundary.repeat_frequency === "daily_until_complete" ? { untilComplete: true } : {}),
  };
}

function recurrenceFromTask(task: Task): TaskRecurrence {
  if (task.repeat_frequency === "none") return { kind: "none" };
  if (task.repeat_frequency === "weekly") {
    return {
      kind: "weekly",
      intervalWeeks: task.repeat_interval,
      weekdays: task.repeat_days_of_week,
      anchorDate: task.due_on,
    };
  }
  if (task.repeat_frequency === "monthly") {
    return {
      kind: "monthly",
      intervalMonths: task.repeat_interval,
      mode: task.repeat_monthly_mode,
      dayOfMonth: task.repeat_day_of_month,
      ordinal: task.repeat_monthly_ordinal,
      weekday: task.repeat_monthly_weekday,
      anchorDate: task.due_on,
    };
  }
  return {
    kind: "rolling",
    intervalDays: task.repeat_interval,
    ...(task.repeat_frequency === "daily_until_complete" ? { untilComplete: true } : {}),
  };
}

function historyRows(taskId: string, history: readonly TaskHistory[]): TaskStateHistoryRow[] {
  return history
    .filter((row) => row.task_id === taskId)
    .filter((row) => ["done", "did_my_best", "missed", "delayed", "complete"].includes(row.status))
    .map((row) => ({
      id: row.id,
      taskId: row.task_id,
      logicalDate: row.entry_date,
      outcome: row.status as TaskHistoryOutcome,
      provenance: row.canonical_provenance_kind === "authorized_automation"
        ? "rollover"
        : row.canonical_provenance_kind === "migration_reconstruction"
          ? "import"
          : "manual",
      occurredAt: row.updated_at || row.created_at,
      occurrenceIdentity: row.occurrence_key,
      occurrenceDueOn: row.occurrence_due_on,
      ...(row.effective_due_on !== undefined ? { effectiveDueOn: row.effective_due_on } : {}),
      ...(row.recurrence_authoritative !== undefined ? { recurrenceAuthoritative: row.recurrence_authoritative } : {}),
      countedAsDueOccurrence: row.counted_as_due_occurrence,
      wasCompleted: row.was_completed ?? SUCCESSFUL_OUTCOMES.has(row.status as TaskHistoryOutcome),
      eventType: row.event_type,
    }));
}

export function buildDirectTaskStateEngineInput(
  task: CanonicalProjectedTaskState,
  history: readonly TaskHistory[],
  context: DirectTaskStateContext,
  options: Pick<TaskStateEngineInput, "calendarOverrides" | "workflow" | "action" | "calendarStart" | "calendarEnd"> = {},
): TaskStateEngineInput {
  const boundary = task.canonical_schedule_boundary ?? null;
  const lifecycle = canonicalLifecycle(task);
  const activeStatus: TaskStateEngineInput["task"]["activeStatus"] = lifecycle === "complete"
    ? "complete"
    : lifecycle !== "active"
      ? "pending"
      : task.workflow_state === "in_progress"
        ? "in_progress"
        : task.terminal_state || task.container_state || task.workflow_state
          ? "pending"
          : task.status === "in_progress"
            ? "in_progress"
            : task.status === "complete"
              ? "complete"
              : ["pending", "in_progress", "missed", "upcoming", "not_due", "delayed", "done", "did_my_best"].includes(task.status)
                ? task.status as TaskStateEngineInput["task"]["activeStatus"]
                : "pending";
  const recurrence = boundary ? recurrenceFromBoundary(boundary) : recurrenceFromTask(task);
  const dueOn = boundary
    ? boundary.schedule_model === "unscheduled"
      ? null
      : boundary.schedule_model === "one_time"
        ? boundary.one_time_due_on
        : task.due_on
    : task.due_on;
  const historicalScheduleAnchor = boundary
    ? boundary.schedule_model === "one_time"
      ? boundary.one_time_due_on
      : boundary.schedule_model === "unscheduled"
        ? null
        : boundary.anchor_date
    : task.canonical_schedule_anchor_date ?? task.due_on;

  return {
    task: {
      id: task.id,
      lifecycle,
      activeStatus,
      dueOn,
      historicalScheduleAnchor,
      historicalScheduleAnchorProven: boundary?.anchor_confidence === "proven",
      activeStatusLogicalDate: task.workflow_logical_date ?? task.active_status_logical_date,
      activeOccurrenceDueOn: task.workflow_state === "in_progress"
        ? task.active_occurrence_due_on
        : task.active_occurrence_due_on,
      recurrence,
    },
    history: historyRows(task.id, history),
    now: context.now,
    timezone: context.timezone,
    logicalDayRollover: context.logicalDayRollover,
    ...options,
  };
}

export function canonicalOccurrenceIdentity(taskId: string, dueOn: string | null) {
  return dueOn ? occurrenceIdentity(taskId, dueOn) : null;
}
