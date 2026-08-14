export type TaskLifecycleState = "active" | "complete" | "archived" | "trashed";

export type TaskActiveStatus =
  | "unscheduled"
  | "pending"
  | "in_progress"
  | "missed"
  | "upcoming"
  | "not_due"
  | "delayed"
  | "done"
  | "did_my_best"
  | "complete";

export type TaskCalendarState =
  | "open"
  | "in_progress"
  | "done"
  | "did_my_best"
  | "missed"
  | "delayed"
  | "complete"
  | "scheduled"
  | "not_due"
  | "no_entry";

export type TaskHistoryOutcome = "done" | "did_my_best" | "missed" | "delayed" | "complete";
export type TaskHistoryProvenance = "manual" | "rollover" | "reconciliation" | "import";
export type MonthlyOrdinal = "first" | "second" | "third" | "fourth" | "last";

export type TaskRecurrence =
  | { kind: "none" }
  | { kind: "rolling"; intervalDays: number; untilComplete?: boolean }
  | {
      kind: "weekly";
      intervalWeeks?: number;
      weekdays: number[];
      untilComplete?: boolean;
      anchorDate?: string | null;
    }
  | {
      kind: "monthly";
      intervalMonths?: number;
      mode: "day_of_month" | "ordinal_weekday";
      dayOfMonth?: number | null;
      ordinal?: MonthlyOrdinal | null;
      weekday?: number | null;
      untilComplete?: boolean;
      anchorDate?: string | null;
    };

export type TaskStateSnapshot = {
  id: string;
  lifecycle: TaskLifecycleState;
  activeStatus: TaskActiveStatus;
  dueOn: string | null;
  /** Stable schedule seed for read-only reconstruction; current due is derived output. */
  historicalScheduleAnchor?: string | null;
  activeStatusLogicalDate?: string | null;
  activeOccurrenceDueOn?: string | null;
  /** Optional persisted comparison inputs. Undefined means the source model cannot expose them. */
  recurrenceCursor?: string | null;
  satisfiedOccurrenceIdentity?: string | null;
  recurrence: TaskRecurrence;
};

export type TaskStateHistoryRow = {
  id: string;
  taskId: string;
  logicalDate: string;
  outcome: TaskHistoryOutcome;
  provenance: TaskHistoryProvenance;
  occurredAt: string;
  occurrenceIdentity?: string | null;
  occurrenceDueOn?: string | null;
  /** Internal read-model boundary: false preserves History metadata without driving recurrence. */
  recurrenceAuthoritative?: boolean;
  countedAsDueOccurrence?: boolean;
  wasCompleted?: boolean;
  eventType?: "status" | "completed_permanently";
  rewardClaimed?: boolean;
};

export type TaskCalendarOverrideState = "unscheduled" | "not_due" | "due_open";

export type TaskCalendarOverride = {
  id: string;
  logicalDate: string;
  overrideState: TaskCalendarOverrideState;
  revision?: number | null;
  source?: string | null;
  provenance?: string | null;
};

export type TaskWorkflowState = {
  state: "none" | "in_progress";
  logicalDate: string | null;
  occurrenceId?: string | null;
  commandId?: string | null;
  revision?: number | null;
};

export type TaskEffectiveTimelineSourceKind =
  | "history_fact"
  | "workflow"
  | "calendar_override"
  | "calculated";

export type TaskEffectiveTimelineObligation =
  | "none"
  | "due"
  | "overdue";

export type TaskEffectiveTimelineDay = {
  logicalDate: string;
  state: TaskCalendarState;
  sourceKind: TaskEffectiveTimelineSourceKind;
  handled: boolean;
  outcome: TaskHistoryOutcome | null;
  historyRowId: string | null;
  calendarOverrideId: string | null;
  workflowOccurrenceId: string | null;
  workflowCommandId: string | null;
  workflowRevision: number | null;
  occurrenceIdentity: string | null;
  occurrenceDueOn: string | null;
  obligation: TaskEffectiveTimelineObligation;
};

export type TaskEffectiveTimeline = {
  days: Record<string, TaskEffectiveTimelineDay>;
  activeStatus: TaskActiveStatus;
  activeOccurrenceDueOn: string | null;
  currentCompletedStreak: number;
  currentMissedStreak: number;
  currentObligation: TaskEffectiveTimelineObligation;
  nextDueOn: string | null;
  recurrenceAnchor: string | null;
  replayCheckpoint: TaskTimelineCheckpoint | null;
  unresolvedDueOn: string | null;
};

export type TaskTimelineReplayKind = "outcome" | "due_date" | "recurrence" | "recompute";

export type TaskTimelineReplayRequest = {
  changedLogicalDate: string;
  kind: TaskTimelineReplayKind;
  manualDueOn?: string | null;
};

export type TaskTimelineCheckpoint = {
  kind: "success" | "schedule_boundary" | "task_snapshot";
  logicalDate: string | null;
  occurrenceDueOn: string | null;
};

export type TaskStateAction =
  | {
      type: "record_outcome";
      outcome: TaskHistoryOutcome;
      logicalDate?: string;
      occurredAt?: string;
      delayDays?: number;
      delayUntilDate?: string | null;
      provenance?: Extract<TaskHistoryProvenance, "manual" | "import">;
      replaceExisting?: boolean;
      previousOutcome?: TaskHistoryOutcome | null;
      occurrenceDueOn?: string | null;
      occurrenceIdentity?: string | null;
      historicalOverride?: boolean;
    }
  | {
      type: "change_schedule";
      changedLogicalDate?: string;
      replayKind?: Extract<TaskTimelineReplayKind, "due_date" | "recurrence">;
      manualDueOn?: string | null;
    }
  | { type: "recompute"; fromLogicalDate: string };

export type TaskStateEngineInput = {
  task: TaskStateSnapshot;
  history: TaskStateHistoryRow[];
  now: string | Date;
  timezone: string;
  logicalDayRollover: string;
  /** Optional Calendar window; state evaluation otherwise uses today + the next 40 days. */
  calendarStart?: string;
  calendarEnd?: string;
  calendarOverrides?: TaskCalendarOverride[];
  workflow?: TaskWorkflowState;
  action?: TaskStateAction;
};

export type TaskHistoryChange =
  | { type: "insert"; row: TaskStateHistoryRow }
  | { type: "reject"; logicalDate: string; outcome: TaskHistoryOutcome; reason: string };

/**
 * This allow-list is deliberately unable to express lifecycle, archive, trash,
 * deletion, title, description, list, folder, or unrelated metadata changes.
 */
export type ProposedTaskStatePatch = Partial<{
  status: Exclude<TaskActiveStatus, "unscheduled"> | "unscheduled";
  dueOn: string | null;
  activeStatusLogicalDate: string | null;
  activeOccurrenceDueOn: string | null;
  recurrenceCursor: string | null;
  satisfiedOccurrenceIdentity: string | null;
  completedAt: string | null;
}>;

export type StreakDisposition =
  | "increment_positive"
  | "preserve_positive"
  | "break_positive"
  | "increment_missed"
  | "preserve_missed"
  | "none";

export type RewardEligibility = {
  eligible: boolean;
  identity: string | null;
  logicalDate: string | null;
  outcome: TaskHistoryOutcome | null;
  reason: "eligible" | "already_claimed" | "ineligible_outcome" | "no_outcome";
};

export type CurrentDayOutcomeFacts = {
  outcome: TaskHistoryOutcome | null;
  missedToday: boolean;
  successful: boolean;
  delayed: boolean;
};

export type TaskStateEngineResult = {
  logicalDate: string;
  lifecycle: TaskLifecycleState;
  activeStatus: TaskActiveStatus;
  calendar: Record<string, TaskCalendarState>;
  handledCurrentDay: boolean;
  currentDayOutcome: CurrentDayOutcomeFacts;
  continuousOverdue: {
    active: boolean;
    frozenDueOn: string | null;
    firstMissedDate: string | null;
  };
  recurrenceAnchor: string | null;
  nextDueDate: string | null;
  satisfiedOccurrenceIdentity: string | null;
  unresolvedOccurrenceIdentity: string | null;
  unresolvedOccurrenceDueOn: string | null;
  proposedHistoryChanges: TaskHistoryChange[];
  proposedTaskPatch: ProposedTaskStatePatch;
  streakDisposition: StreakDisposition;
  rewardEligibility: RewardEligibility;
  timeline: TaskEffectiveTimeline;
  validationErrors: string[];
};
