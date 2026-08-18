import type { Task, TaskHistory } from "../database.types.ts";
import { resolveTaskHistoryRecurrenceAuthority } from "../task-history-cutover.ts";
import { occurrenceIdentity } from "./recurrence.ts";
import type {
  TaskActiveStatus,
  TaskLifecycleState,
  TaskRecurrence,
  TaskStateEngineInput,
  TaskStateHistoryRow,
} from "./types.ts";

export type LegacyAdapterIssue = {
  code: string;
  message: string;
  path: string;
  value?: unknown;
};

export type LegacyTaskStateAdapterResult = {
  engineInput: TaskStateEngineInput;
  warnings: LegacyAdapterIssue[];
  unsupported: LegacyAdapterIssue[];
};

type LegacyAdapterOptions = {
  now: string | Date;
  timezone: string;
  logicalDayRollover: string;
};

const ACTIVE_STATUSES = new Set<TaskActiveStatus>([
  "pending",
  "in_progress",
  "missed",
  "upcoming",
  "not_due",
  "delayed",
  "done",
  "did_my_best",
  "complete",
]);
const HISTORY_OUTCOMES = new Set(["done", "did_my_best", "missed", "delayed", "complete"]);
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const ROLLOVER_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

function issue(code: string, path: string, message: string, value?: unknown): LegacyAdapterIssue {
  return value === undefined ? { code, message, path } : { code, message, path, value };
}

function stringValue(row: Record<string, unknown>, key: string) {
  return typeof row[key] === "string" ? row[key] as string : null;
}

function optionalStringValue(
  row: Record<string, unknown>,
  key: string,
  warnings: LegacyAdapterIssue[],
) {
  if (!Object.hasOwn(row, key)) return undefined;
  const value = row[key];
  if (value === null || value === "") return null;
  if (typeof value === "string") return value;
  warnings.push(issue("malformed_string", key, "Expected a string or null.", value));
  return null;
}

function optionalDateValue(
  row: Record<string, unknown>,
  key: string,
  warnings: LegacyAdapterIssue[],
) {
  if (!Object.hasOwn(row, key)) return undefined;
  return nullableDate(row, key, warnings);
}

function nullableDate(
  row: Record<string, unknown>,
  key: string,
  warnings: LegacyAdapterIssue[],
) {
  const value = row[key];
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && DATE_KEY.test(value)) return value;
  warnings.push(issue("malformed_date", key, "Expected a YYYY-MM-DD date or null.", value));
  return null;
}

function positiveInteger(
  value: unknown,
  path: string,
  warnings: LegacyAdapterIssue[],
) {
  if (Number.isInteger(value) && Number(value) > 0) return Number(value);
  warnings.push(issue("malformed_positive_integer", path, "Expected a positive whole number.", value));
  return 1;
}

function lifecycleAndStatus(
  row: Record<string, unknown>,
  dueOn: string | null,
  warnings: LegacyAdapterIssue[],
  unsupported: LegacyAdapterIssue[],
): { activeStatus: TaskActiveStatus; lifecycle: TaskLifecycleState } {
  const raw = row.status;
  if (raw === "archived" || raw === "trashed") {
    unsupported.push(issue(
      "lifecycle_active_status_unavailable",
      "status",
      `Legacy ${raw} rows do not retain their prior active status.`,
      raw,
    ));
    return {
      lifecycle: raw,
      activeStatus: dueOn ? "pending" : "unscheduled",
    };
  }
  if (raw === "complete") return { lifecycle: "complete", activeStatus: "complete" };
  if (typeof raw === "string" && ACTIVE_STATUSES.has(raw as TaskActiveStatus)) {
    return { lifecycle: "active", activeStatus: raw as TaskActiveStatus };
  }
  warnings.push(issue("unknown_task_status", "status", "Unknown legacy task status.", raw));
  return { lifecycle: "active", activeStatus: dueOn ? "pending" : "unscheduled" };
}

function recurrenceFromLegacy(
  row: Record<string, unknown>,
  dueOn: string | null,
  warnings: LegacyAdapterIssue[],
  unsupported: LegacyAdapterIssue[],
): TaskRecurrence {
  const frequency = row.repeat_frequency;
  if (frequency === "none" || frequency === null || frequency === undefined) return { kind: "none" };
  const interval = positiveInteger(row.repeat_interval, "repeat_interval", warnings);
  if (frequency === "daily" || frequency === "custom" || frequency === "daily_until_complete") {
    return {
      kind: "rolling",
      intervalDays: interval,
      ...(frequency === "daily_until_complete" ? { untilComplete: true } : {}),
    };
  }
  if (frequency === "weekly") {
    const rawDays = row.repeat_days_of_week;
    const weekdays = Array.isArray(rawDays)
      ? rawDays.filter((value): value is number => Number.isInteger(value) && value >= 0 && value <= 6)
      : [];
    if (!Array.isArray(rawDays) || weekdays.length !== rawDays.length) {
      warnings.push(issue(
        "malformed_weekdays",
        "repeat_days_of_week",
        "Weekly weekdays must contain only integers from 0 through 6.",
        rawDays,
      ));
    }
    if (weekdays.length === 0 && !dueOn) {
      unsupported.push(issue(
        "weekly_anchor_unavailable",
        "due_on",
        "A weekly task without weekdays or a due date has no recurrence anchor.",
      ));
    }
    return {
      kind: "weekly",
      intervalWeeks: interval,
      weekdays: [...new Set(weekdays)].sort((left, right) => left - right),
      anchorDate: dueOn,
    };
  }
  if (frequency === "monthly") {
    const mode = row.repeat_monthly_mode;
    if (mode !== "day_of_month" && mode !== "ordinal_weekday") {
      warnings.push(issue("unknown_monthly_mode", "repeat_monthly_mode", "Unknown monthly recurrence mode.", mode));
    }
    const normalizedMode = mode === "ordinal_weekday" ? mode : "day_of_month";
    const dayOfMonth = row.repeat_day_of_month;
    const ordinal = row.repeat_monthly_ordinal;
    const weekday = row.repeat_monthly_weekday;
    if (normalizedMode === "day_of_month" && dayOfMonth !== null && dayOfMonth !== undefined
      && (!Number.isInteger(dayOfMonth) || Number(dayOfMonth) < 1 || Number(dayOfMonth) > 31)) {
      warnings.push(issue("malformed_month_day", "repeat_day_of_month", "Monthly day must be from 1 through 31.", dayOfMonth));
    }
    if (normalizedMode === "ordinal_weekday") {
      if (!["first", "second", "third", "fourth", "last"].includes(String(ordinal))) {
        warnings.push(issue("malformed_monthly_ordinal", "repeat_monthly_ordinal", "Unknown monthly ordinal.", ordinal));
      }
      if (!Number.isInteger(weekday) || Number(weekday) < 0 || Number(weekday) > 6) {
        warnings.push(issue("malformed_monthly_weekday", "repeat_monthly_weekday", "Monthly weekday must be from 0 through 6.", weekday));
      }
    }
    return {
      kind: "monthly",
      intervalMonths: interval,
      mode: normalizedMode,
      dayOfMonth: Number.isInteger(dayOfMonth) && Number(dayOfMonth) >= 1 && Number(dayOfMonth) <= 31
        ? Number(dayOfMonth)
        : null,
      ordinal: ["first", "second", "third", "fourth", "last"].includes(String(ordinal))
        ? ordinal as Extract<TaskRecurrence, { kind: "monthly" }>["ordinal"]
        : null,
      weekday: Number.isInteger(weekday) && Number(weekday) >= 0 && Number(weekday) <= 6
        ? Number(weekday)
        : null,
      anchorDate: dueOn,
    };
  }
  warnings.push(issue("unknown_recurrence", "repeat_frequency", "Unknown legacy recurrence type.", frequency));
  return { kind: "none" };
}

function mapHistory(
  source: readonly unknown[],
  taskId: string,
  warnings: LegacyAdapterIssue[],
  unsupported: LegacyAdapterIssue[],
) {
  const mapped: TaskStateHistoryRow[] = [];
  source.forEach((value, index) => {
    const row = asRecord(value);
    const path = `history[${index}]`;
    if (row.task_id !== taskId) return;
    if (!HISTORY_OUTCOMES.has(String(row.status))) {
      warnings.push(issue(
        "unsupported_history_status",
        `${path}.status`,
        "Only explicit Task State Engine outcomes can be adapted.",
        row.status,
      ));
      return;
    }
    const logicalDate = nullableDate(row, "entry_date", warnings);
    if (!logicalDate) return;
    const id = stringValue(row, "id");
    if (!id) warnings.push(issue("missing_history_id", `${path}.id`, "History row has no stable id.", row.id));
    const occurredAt = stringValue(row, "updated_at") || stringValue(row, "created_at");
    if (!occurredAt || Number.isNaN(Date.parse(occurredAt))) {
      warnings.push(issue("malformed_history_timestamp", `${path}.updated_at`, "History row has no valid timestamp.", occurredAt));
    }
    const occurrenceKey = stringValue(row, "occurrence_key");
    const occurrenceDueOn = nullableDate(row, "occurrence_due_on", warnings);
    const effectiveDueOn = optionalDateValue(row, "effective_due_on", warnings);
    if (!occurrenceKey && row.counted_as_due_occurrence === true && !occurrenceDueOn) {
      unsupported.push(issue(
        "occurrence_identity_unavailable",
        `${path}.occurrence_key`,
        "A counted due occurrence has neither occurrence key nor due date.",
      ));
    }
    const outcome = row.status as TaskStateHistoryRow["outcome"];
    const expectedCompleted = outcome === "done" || outcome === "did_my_best" || outcome === "complete";
    if (typeof row.was_completed === "boolean" && row.was_completed !== expectedCompleted) {
      warnings.push(issue(
        "history_completion_conflict",
        `${path}.was_completed`,
        "Legacy completion flag conflicts with the explicit History outcome.",
        row.was_completed,
      ));
    }
    const canonicalProvenance = stringValue(row, "canonical_provenance_kind");
    mapped.push({
      id: id ?? `legacy-history:${taskId}:${logicalDate}:${index}`,
      taskId,
      logicalDate,
      outcome,
      provenance: canonicalProvenance === "authorized_automation" ? "rollover" : "import",
      occurredAt: occurredAt && !Number.isNaN(Date.parse(occurredAt))
        ? occurredAt
        : `${logicalDate}T12:00:00.000Z`,
      occurrenceIdentity: occurrenceKey ?? (occurrenceDueOn ? occurrenceIdentity(taskId, occurrenceDueOn) : null),
      occurrenceDueOn,
      ...(effectiveDueOn !== undefined ? { effectiveDueOn } : {}),
      recurrenceAuthoritative: resolveTaskHistoryRecurrenceAuthority(
        logicalDate,
        typeof row.recurrence_authoritative === "boolean" ? row.recurrence_authoritative : undefined,
      ),
      countedAsDueOccurrence: typeof row.counted_as_due_occurrence === "boolean"
        ? row.counted_as_due_occurrence
        : undefined,
      wasCompleted: typeof row.was_completed === "boolean" ? row.was_completed : undefined,
      eventType: row.event_type === "completed_permanently" ? "completed_permanently" : "status",
    });
  });
  return mapped;
}

export function adaptLegacyTaskState(
  taskValue: Task | unknown,
  historyValues: readonly TaskHistory[] | readonly unknown[],
  options: LegacyAdapterOptions,
): LegacyTaskStateAdapterResult {
  const task = asRecord(taskValue);
  const warnings: LegacyAdapterIssue[] = [];
  const unsupported: LegacyAdapterIssue[] = [];
  const id = stringValue(task, "id") ?? "legacy-task:missing-id";
  if (!stringValue(task, "id")) warnings.push(issue("missing_task_id", "id", "Task row has no stable id.", task.id));
  const dueOn = nullableDate(task, "due_on", warnings);
  const historicalScheduleAnchor = optionalDateValue(task, "canonical_schedule_anchor_date", warnings);
  const activeStatusLogicalDate = nullableDate(task, "active_status_logical_date", warnings);
  const activeOccurrenceDueOn = nullableDate(task, "active_occurrence_due_on", warnings);
  const state = lifecycleAndStatus(task, dueOn, warnings, unsupported);
  const recurrence = recurrenceFromLegacy(task, dueOn, warnings, unsupported);
  const recurrenceCursor = optionalDateValue(task, "recurrence_cursor", warnings);
  const satisfiedOccurrenceIdentity = optionalStringValue(task, "satisfied_occurrence_identity", warnings);
  if (recurrence.kind !== "none" && recurrenceCursor === undefined) {
    unsupported.push(issue(
      "recurrence_cursor_unavailable",
      "recurrence_cursor",
      "The current task model has no persisted recurrence cursor field; active_occurrence_due_on is a different live-occurrence value.",
    ));
  }
  if (recurrence.kind !== "none" && satisfiedOccurrenceIdentity === undefined) {
    unsupported.push(issue(
      "satisfied_occurrence_identity_unavailable",
      "satisfied_occurrence_identity",
      "The current task model stores occurrence identity on History rows, not as task-level satisfied-occurrence metadata.",
    ));
  }
  if (task.due_time !== null && task.due_time !== undefined) {
    unsupported.push(issue(
      "due_time_not_modeled",
      "due_time",
      "The 7.6.0 engine models logical dates, not within-day due-time transitions.",
      task.due_time,
    ));
  }
  if (!ROLLOVER_TIME.test(options.logicalDayRollover)) {
    warnings.push(issue(
      "malformed_rollover_time",
      "logicalDayRollover",
      "Expected a 24-hour HH:MM rollover time.",
      options.logicalDayRollover,
    ));
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: options.timezone }).format();
  } catch {
    warnings.push(issue("malformed_timezone", "timezone", "Expected a valid IANA timezone.", options.timezone));
  }

  return {
    engineInput: {
      task: {
        id,
        lifecycle: state.lifecycle,
        activeStatus: state.activeStatus,
        dueOn,
        ...(historicalScheduleAnchor !== undefined ? { historicalScheduleAnchor } : {}),
        activeStatusLogicalDate,
        activeOccurrenceDueOn,
        ...(recurrenceCursor !== undefined ? { recurrenceCursor } : {}),
        ...(satisfiedOccurrenceIdentity !== undefined ? { satisfiedOccurrenceIdentity } : {}),
        recurrence,
      },
      history: mapHistory(historyValues, id, warnings, unsupported),
      now: options.now,
      timezone: options.timezone,
      logicalDayRollover: options.logicalDayRollover,
    },
    warnings,
    unsupported,
  };
}
