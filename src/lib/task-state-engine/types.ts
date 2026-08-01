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
  rewardClaimed?: boolean;
};

export type TaskStateAction =
  | {
      type: "record_outcome";
      outcome: TaskHistoryOutcome;
      logicalDate?: string;
      occurredAt?: string;
      delayDays?: number;
      provenance?: Extract<TaskHistoryProvenance, "manual" | "import">;
    }
  | { type: "recompute"; fromLogicalDate: string };

export type TaskStateEngineInput = {
  task: TaskStateSnapshot;
  history: TaskStateHistoryRow[];
  now: string | Date;
  timezone: string;
  logicalDayRollover: string;
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
  proposedHistoryChanges: TaskHistoryChange[];
  proposedTaskPatch: ProposedTaskStatePatch;
  streakDisposition: StreakDisposition;
  rewardEligibility: RewardEligibility;
  validationErrors: string[];
};
