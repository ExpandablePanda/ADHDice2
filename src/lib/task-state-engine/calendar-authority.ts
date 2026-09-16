import type { Task, TaskHistory } from "@/lib/database.types";
import type { CanonicalTaskStateColumns, CanonicalTaskScheduleBoundary } from "../task-state-canonical/types.ts";
import { deduplicateTaskHistoryByLogicalDate } from "@/lib/task-history";
import { logicalDateForTimestamp, shiftDateKey } from "./calendar.ts";
import { buildCompatibilityTaskStateEngineInput, buildDirectTaskStateEngineInput, isCanonicalArchivedOrTrashed, type CanonicalProjectedTaskState } from "./direct-input.ts";
import { evaluateTaskState } from "./engine.ts";
import { TASK_STATE_ENGINE_INTEGRATION_ENABLED } from "./read-authority.ts";
import { evaluateTaskActionAuthority, resolveTaskStatusOptionsForTask } from "./action-authority.ts";
import { buildTaskEffectiveTimeline } from "./effective-timeline.ts";
import { createProjectionDomainRevision } from "../stable-task-projection.ts";
import type { TaskCalendarOverride, TaskHistoryOutcome } from "./types.ts";
import type { TaskEffectiveTimeline } from "./types.ts";
import type { TaskBehaviorPolicyResolutionContext } from "./behavior-policy.ts";
import { selectTaskBehaviorProjectionSemantics } from "./behavior-policy.ts";
import { normalizeTaskType } from "../task-type.ts";

export type TaskHistoryCalendarActionStatus = "done" | "did_my_best" | "delayed" | "missed" | "complete";

export type TaskHistoryCalendarAuthorityState = "delayed" | "due" | "not_due" | "blank" | "in_progress" | "done" | "did_my_best" | "missed" | "complete";

const CALENDAR_STATE_MAP = {
  open: "due",
  scheduled: "due",
  no_entry: "not_due",
  upcoming: "not_due",
  unhandled_blank: "blank",
} as const;

function mapCalendarStates(calendar: Record<string, string>) {
  return Object.fromEntries(Object.entries(calendar).map(([date, state]) => [
    date,
    state === "open" || state === "scheduled" || state === "no_entry" || state === "upcoming" || state === "unhandled_blank" ? CALENDAR_STATE_MAP[state] : state,
  ])) as Record<string, TaskHistoryCalendarAuthorityState>;
}

export type TaskHistoryCalendarReadResult = {
  authority: "effective_timeline" | "engine_fallback";
  states: Record<string, TaskHistoryCalendarAuthorityState>;
  timeline: TaskEffectiveTimeline | null;
};

type TaskHistoryCalendarTask = Task & Partial<CanonicalTaskStateColumns> & {
  canonical_schedule_anchor_date?: string | null;
  canonical_schedule_boundary?: CanonicalTaskScheduleBoundary | null;
};

/** Central Calendar read bridge. Explicit History always wins in the engine. */
export type TaskHistoryCalendarReadInput = TaskBehaviorPolicyResolutionContext & {
  compatibilityOnly?: boolean;
  enabled?: boolean;
  history: TaskHistory[];
  calendarOverrides?: TaskCalendarOverride[];
  calendarStart?: string;
  calendarEnd?: string;
  logicalDayRollover: string;
  now: Date | string;
  task: TaskHistoryCalendarTask;
  timezone: string;
};

function taskHistoryCalendarTaskIdentity(task: TaskHistoryCalendarTask) {
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
    custom_ruleset_id: task.custom_ruleset_id,
    terminal_state: task.terminal_state,
    workflow_logical_date: task.workflow_logical_date,
    workflow_state: task.workflow_state,
  };
}

/** Semantic identity for the canonical History Calendar/Effective Timeline read. */
export function createTaskHistoryCalendarReadRevision(input: TaskHistoryCalendarReadInput) {
  return createProjectionDomainRevision(`task-history-calendar:${input.task.id}`, {
    behavior: selectTaskBehaviorProjectionSemantics({
      behaviorPolicyRevisions: input.behaviorPolicyRevisions,
      behaviorProfiles: input.behaviorProfiles,
      customRulesetId: input.task.custom_ruleset_id,
      behaviorSelectionsByTaskId: input.behaviorSelectionsByTaskId,
      logicalDate: logicalDateForTimestamp(input.now, input.timezone, input.logicalDayRollover),
      namedCustomRulesetBehaviorPolicyRevisions: input.namedCustomRulesetBehaviorPolicyRevisions,
      taskId: input.task.id,
      taskType: normalizeTaskType(input.task.task_type),
    }).streak,
    calendarEnd: input.calendarEnd,
    calendarOverrides: (input.calendarOverrides ?? []).map((override) => ({
      id: override.id,
      logicalDate: override.logicalDate,
      overrideState: override.overrideState,
      revision: override.revision,
    })),
    calendarStart: input.calendarStart,
    history: deduplicateTaskHistoryByLogicalDate(input.history).map((row) => ({
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
    })),
    logicalDayRollover: input.logicalDayRollover,
    logicalDate: logicalDateForTimestamp(input.now, input.timezone, input.logicalDayRollover),
    task: taskHistoryCalendarTaskIdentity(input.task),
    timezone: input.timezone,
  });
}

export function resolveTaskHistoryCalendarRead(input: TaskHistoryCalendarReadInput): TaskHistoryCalendarReadResult | null {
  if (!(input.enabled ?? TASK_STATE_ENGINE_INTEGRATION_ENABLED)) return null;
  const normalizedHistory = deduplicateTaskHistoryByLogicalDate(input.history);
  const buildInput = input.compatibilityOnly ? buildCompatibilityTaskStateEngineInput : buildDirectTaskStateEngineInput;
  const engineInput = buildInput(input.task as CanonicalProjectedTaskState, normalizedHistory, input, {
    calendarOverrides: input.calendarOverrides,
    ...(input.calendarStart ? { calendarStart: input.calendarStart } : {}),
    ...(input.calendarEnd ? { calendarEnd: input.calendarEnd } : {}),
  });

  if (!isCanonicalArchivedOrTrashed(input.task as CanonicalProjectedTaskState)) {
    const logicalDate = logicalDateForTimestamp(input.now, input.timezone, input.logicalDayRollover);
    const calendarStart = input.calendarStart ?? logicalDate;
    const calendarEnd = input.calendarEnd ?? shiftDateKey(logicalDate, 40);
    const timeline = buildTaskEffectiveTimeline({
      behaviorPolicy: engineInput.behaviorPolicy,
      behaviorPolicyRevisions: engineInput.behaviorPolicyRevisions,
      task: engineInput.task,
      history: engineInput.history,
      calendarOverrides: input.calendarOverrides,
      logicalDate,
      calendarStart,
      calendarEnd,
    });
    return {
      authority: "effective_timeline",
      states: mapCalendarStates(Object.fromEntries(
        Object.entries(timeline.days).map(([date, day]) => [date, day.state]),
      )),
      timeline,
    };
  }

  const result = evaluateTaskState({
    ...engineInput,
  });
  return {
    authority: "engine_fallback",
    states: mapCalendarStates(result.calendar),
    timeline: null,
  };
}

export function resolveTaskHistoryCalendarStates(input: TaskBehaviorPolicyResolutionContext & {
  compatibilityOnly?: boolean;
  enabled?: boolean;
  history: TaskHistory[];
  calendarOverrides?: TaskCalendarOverride[];
  calendarStart?: string;
  calendarEnd?: string;
  logicalDayRollover: string;
  now: Date | string;
  task: Task;
  timezone: string;
}) {
  return resolveTaskHistoryCalendarRead(input)?.states ?? null;
}

/** The Calendar asks the same evaluator whether an action can be offered. */
export function resolveTaskHistoryCalendarActionStatuses(input: TaskBehaviorPolicyResolutionContext & {
  compatibilityOnly?: boolean;
  enabled?: boolean;
  history: TaskHistory[];
  logicalDate: string;
  logicalDates?: readonly string[];
  policyLoading?: boolean;
  logicalDayRollover: string;
  historicalOverride?: boolean;
  now: Date | string;
  task: Task;
  timezone: string;
}) {
  if (!(input.enabled ?? TASK_STATE_ENGINE_INTEGRATION_ENABLED)) return null;
  const normalizedHistory = deduplicateTaskHistoryByLogicalDate(input.history);
  const candidates: TaskHistoryCalendarActionStatus[] = ["done", "did_my_best", "delayed", "missed", "complete"];
  const logicalDates = input.logicalDates?.length ? input.logicalDates : [input.logicalDate];
  let sharedStatuses: TaskHistoryCalendarActionStatus[] | null = null;
  for (const logicalDate of logicalDates) {
    const existingEntry = normalizedHistory.find((entry) => entry.entry_date === logicalDate) ?? null;
    const historicalOverrideOccurrenceDueOn = input.historicalOverride
      && !existingEntry
      && input.task.repeat_frequency !== "none"
      ? logicalDate
      : undefined;
    const policyStatuses = resolveTaskStatusOptionsForTask({
      ...input,
      logicalDate,
      statuses: candidates,
      taskId: input.task.id,
      taskType: normalizeTaskType(input.task.task_type),
      customRulesetId: input.task.custom_ruleset_id,
      policyLoading: input.policyLoading,
    });
    const dateStatuses = policyStatuses.filter((outcome) => !evaluateTaskActionAuthority({
      ...input,
      history: normalizedHistory,
      ...(outcome === "delayed" ? { delayDays: 1 } : {}),
      ...(input.historicalOverride ? { historicalOverride: true } : {}),
      outcome,
      outcomeDate: logicalDate,
      ...(existingEntry ? {
        occurrenceDueOn: existingEntry.occurrence_due_on ?? logicalDate,
        occurrenceIdentity: existingEntry.occurrence_key ?? undefined,
        previousOutcome: existingEntry.status as TaskHistoryOutcome,
        replaceExisting: true,
      } : {
        occurrenceDueOn: historicalOverrideOccurrenceDueOn,
      }),
    })?.validationErrors.length) as TaskHistoryCalendarActionStatus[];
    sharedStatuses = sharedStatuses === null
      ? dateStatuses
      : sharedStatuses.filter((status) => dateStatuses.includes(status));
  }
  return sharedStatuses ?? [];
}
