import type { Task, TaskHistory } from "./database.types.ts";
import { shiftDateKey } from "./date-key.ts";
import { computeTaskHistoryStats } from "./task-history.ts";
import { filterTrackedTaskHistory } from "./task-tracking.ts";

export const TASK_ACTIVITY_SUMMARY_CONTRACT_VERSION = "task-activity-summary-v1" as const;
export const TASK_HISTORY_SYNC_PROTOCOL_VERSION = "task-history-sync-v1" as const;

export type TaskActivitySummary = {
  contract_version: typeof TASK_ACTIVITY_SUMMARY_CONTRACT_VERSION;
  as_of_logical_date: string;
  history_sync_epoch: string;
  history_current_revision: number;
  history_protocol_version: typeof TASK_HISTORY_SYNC_PROTOCOL_VERSION;
  tracked: {
    logged_days: number;
    completed_days: number;
    missed_days: number;
    done_rate: number;
    current_streak: number;
    best_streak: number;
  };
  tracked_recent_completed_counts: Array<{
    logical_date: string;
    completed_count: number;
  }>;
  unfiltered_today_completed_count: number;
};

export type TaskActivitySummaryLegacyOracle = {
  asOfLogicalDate: string;
  tracked: TaskActivitySummary["tracked"];
  trackedRecentCompletedCounts: TaskActivitySummary["tracked_recent_completed_counts"];
  unfilteredTodayCompletedCount: number;
};

export type TaskActivitySummaryParity = {
  matched: boolean;
  mismatchedFields: string[];
};

export class TaskActivitySummaryError extends Error {
  readonly code: "malformed-response" | "rpc-failed" | "invalid-request";

  constructor(code: TaskActivitySummaryError["code"], message: string) {
    super(message);
    this.name = "TaskActivitySummaryError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function asRequiredDateKey(value: unknown, field: string) {
  if (!isDateKey(value)) {
    throw new TaskActivitySummaryError("malformed-response", `Task activity summary has an invalid ${field}.`);
  }
  return value;
}

function asRequiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TaskActivitySummaryError("malformed-response", `Task activity summary has an invalid ${field}.`);
  }
  return value;
}

function asNonNegativeSafeInteger(value: unknown, field: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TaskActivitySummaryError("malformed-response", `Task activity summary has an invalid ${field}.`);
  }
  return value as number;
}

function asPercentage(value: unknown, field: string) {
  const percentage = asNonNegativeSafeInteger(value, field);
  if (percentage > 100) {
    throw new TaskActivitySummaryError("malformed-response", `Task activity summary has an invalid ${field}.`);
  }
  return percentage;
}

function parseTracked(value: unknown): TaskActivitySummary["tracked"] {
  if (!isRecord(value)) {
    throw new TaskActivitySummaryError("malformed-response", "Task activity summary is missing tracked metrics.");
  }
  return {
    logged_days: asNonNegativeSafeInteger(value.logged_days, "tracked.logged_days"),
    completed_days: asNonNegativeSafeInteger(value.completed_days, "tracked.completed_days"),
    missed_days: asNonNegativeSafeInteger(value.missed_days, "tracked.missed_days"),
    done_rate: asPercentage(value.done_rate, "tracked.done_rate"),
    current_streak: asNonNegativeSafeInteger(value.current_streak, "tracked.current_streak"),
    best_streak: asNonNegativeSafeInteger(value.best_streak, "tracked.best_streak"),
  };
}

function parseRecentCounts(value: unknown, asOfLogicalDate: string): TaskActivitySummary["tracked_recent_completed_counts"] {
  if (!Array.isArray(value) || value.length !== 7) {
    throw new TaskActivitySummaryError("malformed-response", "Task activity summary must contain exactly seven recent dates.");
  }

  const expectedDates = Array.from({ length: 7 }, (_, index) => shiftDateKey(asOfLogicalDate, index - 6));
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new TaskActivitySummaryError("malformed-response", "Task activity summary contains a malformed recent count.");
    }
    const logicalDate = asRequiredDateKey(entry.logical_date, `tracked_recent_completed_counts[${index}].logical_date`);
    if (logicalDate !== expectedDates[index]) {
      throw new TaskActivitySummaryError("malformed-response", "Task activity summary recent dates are not deterministic.");
    }
    return {
      logical_date: logicalDate,
      completed_count: asNonNegativeSafeInteger(entry.completed_count, `tracked_recent_completed_counts[${index}].completed_count`),
    };
  });
}

export function parseTaskActivitySummaryResponse(value: unknown): TaskActivitySummary {
  const response = Array.isArray(value)
    ? value.length === 1 ? value[0] : null
    : value;
  if (!isRecord(response)) {
    throw new TaskActivitySummaryError("malformed-response", "Task activity summary response is missing.");
  }
  if (response.contract_version !== TASK_ACTIVITY_SUMMARY_CONTRACT_VERSION) {
    throw new TaskActivitySummaryError("malformed-response", "Task activity summary contract version is unsupported.");
  }
  const asOfLogicalDate = asRequiredDateKey(response.as_of_logical_date, "as_of_logical_date");
  const historyProtocolVersion = asRequiredString(response.history_protocol_version, "history_protocol_version");
  if (historyProtocolVersion !== TASK_HISTORY_SYNC_PROTOCOL_VERSION) {
    throw new TaskActivitySummaryError("malformed-response", "Task activity summary History protocol version is unsupported.");
  }
  const tracked = parseTracked(response.tracked);
  if (tracked.completed_days > tracked.logged_days || tracked.missed_days !== tracked.logged_days - tracked.completed_days) {
    throw new TaskActivitySummaryError("malformed-response", "Task activity summary tracked day totals are inconsistent.");
  }
  return {
    contract_version: TASK_ACTIVITY_SUMMARY_CONTRACT_VERSION,
    as_of_logical_date: asOfLogicalDate,
    history_sync_epoch: asRequiredString(response.history_sync_epoch, "history_sync_epoch"),
    history_current_revision: asNonNegativeSafeInteger(response.history_current_revision, "history_current_revision"),
    history_protocol_version: TASK_HISTORY_SYNC_PROTOCOL_VERSION,
    tracked,
    tracked_recent_completed_counts: parseRecentCounts(response.tracked_recent_completed_counts, asOfLogicalDate),
    unfiltered_today_completed_count: asNonNegativeSafeInteger(response.unfiltered_today_completed_count, "unfiltered_today_completed_count"),
  };
}

export function buildTaskActivitySummaryLegacyOracle(
  history: readonly TaskHistory[],
  tasks: readonly Pick<Task, "id" | "parent_task_id" | "exclude_from_tracking">[],
  asOfLogicalDate: string,
): TaskActivitySummaryLegacyOracle {
  if (!isDateKey(asOfLogicalDate)) {
    throw new TaskActivitySummaryError("invalid-request", "Task activity summary requires a valid as-of logical date.");
  }
  const trackedHistory = filterTrackedTaskHistory(history, tasks);
  const stats = computeTaskHistoryStats(trackedHistory, asOfLogicalDate);
  const trackedRecentCompletedCounts = Array.from({ length: 7 }, (_, index) => {
    const logicalDate = shiftDateKey(asOfLogicalDate, index - 6);
    return {
      logical_date: logicalDate,
      completed_count: trackedHistory.filter((entry) => entry.entry_date === logicalDate && entry.was_completed).length,
    };
  });
  return {
    asOfLogicalDate,
    tracked: {
      logged_days: stats.loggedDays,
      completed_days: stats.completedDays,
      missed_days: stats.missedDays,
      done_rate: stats.doneRate,
      current_streak: stats.currentStreak,
      best_streak: stats.bestStreak,
    },
    trackedRecentCompletedCounts,
    unfilteredTodayCompletedCount: history.filter((entry) => entry.entry_date === asOfLogicalDate && entry.was_completed).length,
  };
}

export function compareTaskActivitySummary(
  summary: TaskActivitySummary,
  legacy: TaskActivitySummaryLegacyOracle,
): TaskActivitySummaryParity {
  const mismatchedFields: string[] = [];
  const compare = (field: string, actual: unknown, expected: unknown) => {
    if (actual !== expected) mismatchedFields.push(field);
  };

  compare("as_of_logical_date", summary.as_of_logical_date, legacy.asOfLogicalDate);
  for (const field of ["logged_days", "completed_days", "missed_days", "done_rate", "current_streak", "best_streak"] as const) {
    compare(`tracked.${field}`, summary.tracked[field], legacy.tracked[field]);
  }
  for (let index = 0; index < 7; index += 1) {
    const serverCount = summary.tracked_recent_completed_counts[index];
    const legacyCount = legacy.trackedRecentCompletedCounts[index];
    compare(`tracked_recent_completed_counts[${index}].logical_date`, serverCount?.logical_date, legacyCount?.logical_date);
    compare(`tracked_recent_completed_counts[${index}].completed_count`, serverCount?.completed_count, legacyCount?.completed_count);
  }
  compare("unfiltered_today_completed_count", summary.unfiltered_today_completed_count, legacy.unfilteredTodayCompletedCount);
  return { matched: mismatchedFields.length === 0, mismatchedFields };
}
