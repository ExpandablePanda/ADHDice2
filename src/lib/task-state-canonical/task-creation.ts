import type {
  TaskInsert,
  TaskRepeatFrequency,
  TaskRepeatMonthlyMode,
  TaskRepeatMonthlyOrdinal,
  TaskStatus,
} from "../database.types";
import { logicalDateForTimestamp } from "../task-state-engine/calendar.ts";
import type { CanonicalEntityKind } from "./types.ts";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_KEY = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const SAFE_INITIAL_STATUSES = new Set<TaskStatus>(["pending", "upcoming", "not_due", "archived"]);
const REPEAT_FREQUENCIES = new Set<TaskRepeatFrequency>([
  "none",
  "daily",
  "weekly",
  "monthly",
  "custom",
  "daily_until_complete",
]);
const MONTHLY_MODES = new Set<TaskRepeatMonthlyMode>(["day_of_month", "ordinal_weekday"]);
const MONTHLY_ORDINALS = new Set<NonNullable<TaskRepeatMonthlyOrdinal>>(["first", "second", "third", "fourth", "last"]);
const TASK_PRIORITIES = new Set(["low", "normal", "high"]);
const TASK_ENERGIES = new Set(["none", "low", "medium", "high"]);
const UUID_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CanonicalTaskCreationDraft = Omit<TaskInsert, "user_id" | "id" | "revision">;

export type CanonicalTaskCreationProfile = {
  timezone: string;
  day_start_time: string;
  settings_revision: number;
};

export type CanonicalTaskCreationPlan = {
  task: CanonicalTaskCreationDraft;
  canonical: {
    entity_kind: CanonicalEntityKind;
    terminal_state: "active";
    container_state: "active" | "archived";
    prior_container_state: null;
    prior_container_state_status: "not_applicable";
    workflow_state: "none";
    workflow_revision: 1;
    canonical_revision: 1;
  };
  schedule: {
    effective_from_logical_date: string;
    schedule_model: "unscheduled" | "one_time" | "rolling" | "fixed";
    repeat_frequency: TaskRepeatFrequency;
    repeat_interval: number;
    repeat_days_of_week: number[];
    repeat_day_of_month: number | null;
    repeat_monthly_mode: TaskRepeatMonthlyMode;
    repeat_monthly_ordinal: TaskRepeatMonthlyOrdinal | null;
    repeat_monthly_weekday: number | null;
    one_time_due_on: string | null;
    due_time: string | null;
    anchor_date: string | null;
    anchor_kind: "user_selected" | "unknown";
    anchor_confidence: "proven" | "unavailable";
    historical_scope_known: false;
    prospective_only: true;
    logical_day_settings_revision: number;
    timezone: string;
    day_start_time: string;
    source: "task_creation" | "task_import";
  };
};

export class CanonicalTaskCreationValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CanonicalTaskCreationValidationError";
    this.code = code;
  }
}

function fail(code: string, message: string): never {
  throw new CanonicalTaskCreationValidationError(code, message);
}

function isDate(value: string | null): value is string {
  return value !== null && DATE_KEY.test(value);
}

function isTime(value: string | null): value is string {
  return value === null || TIME_KEY.test(value);
}

function validDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day;
}

function normalizedDraft(input: Omit<TaskInsert, "user_id">): CanonicalTaskCreationDraft {
  if (input.title === undefined || typeof input.title !== "string" || input.title.trim().length === 0) {
    fail("INVALID_TITLE", "A non-empty Task title is required.");
  }
  if (input.completed_at !== undefined && input.completed_at !== null) {
    fail("UNSAFE_TERMINAL_SNAPSHOT", "Imported completion timestamps require canonical provenance and were not accepted.");
  }
  if (input.trashed_at !== undefined && input.trashed_at !== null) {
    fail("UNSAFE_TRASH_SNAPSHOT", "Imported Trash timestamps require canonical container provenance and were not accepted.");
  }

  return {
    parent_task_id: input.parent_task_id ?? null,
    title: input.title.trim(),
    notes: input.notes ?? null,
    status: input.status ?? "pending",
    priority: input.priority ?? "normal",
    priority_level: input.priority_level ?? 0,
    energy: input.energy ?? "none",
    is_urgent: input.is_urgent ?? false,
    is_important: input.is_important ?? false,
    due_on: input.due_on ?? null,
    active_status_logical_date: null,
    active_occurrence_due_on: null,
    scheduled_on: input.scheduled_on ?? null,
    due_time: input.due_time ?? null,
    estimated_minutes: input.estimated_minutes ?? null,
    actual_seconds: input.actual_seconds ?? 0,
    tags: input.tags ?? [],
    external_link_label: input.external_link_label ?? null,
    external_link_url: input.external_link_url ?? null,
    one_step_at_a_time: input.one_step_at_a_time ?? false,
    subtasks_auto_reset: input.subtasks_auto_reset ?? false,
    repeat_frequency: input.repeat_frequency ?? "none",
    repeat_interval: input.repeat_interval ?? 1,
    repeat_days_of_week: input.repeat_days_of_week ?? [],
    repeat_day_of_month: input.repeat_day_of_month ?? null,
    repeat_monthly_mode: input.repeat_monthly_mode ?? "day_of_month",
    repeat_monthly_ordinal: input.repeat_monthly_ordinal ?? null,
    repeat_monthly_weekday: input.repeat_monthly_weekday ?? null,
    pinned_at: input.pinned_at ?? null,
    pin_order: input.pin_order ?? null,
    sort_order: input.sort_order ?? 0,
    completed_at: null,
    trashed_at: null,
  };
}

function validateDraft(draft: CanonicalTaskCreationDraft): void {
  if (!SAFE_INITIAL_STATUSES.has(draft.status ?? "pending")) {
    fail(
      "UNSAFE_IMPORTED_STATUS",
      `Task status "${draft.status}" requires handled History, workflow, delay, or lifecycle provenance and cannot be initialized from this snapshot.`,
    );
  }
  if (draft.due_on !== null && (!DATE_KEY.test(draft.due_on) || !validDate(draft.due_on))) {
    fail("INVALID_DUE_DATE", "Task due date is invalid.");
  }
  if (draft.parent_task_id !== null && !UUID_KEY.test(draft.parent_task_id)) {
    fail("INVALID_PARENT_TASK", "Task parent identity is invalid.");
  }
  if (!TASK_PRIORITIES.has(draft.priority ?? "normal")) fail("INVALID_PRIORITY", "Task priority is invalid.");
  if (!Number.isInteger(draft.priority_level) || (draft.priority_level ?? -1) < 0 || (draft.priority_level ?? 6) > 5) {
    fail("INVALID_PRIORITY_LEVEL", "Task priority level is invalid.");
  }
  if (!TASK_ENERGIES.has(draft.energy ?? "none")) fail("INVALID_ENERGY", "Task energy is invalid.");
  if (typeof draft.notes !== "string" && draft.notes !== null) fail("INVALID_NOTES", "Task notes are invalid.");
  if (typeof draft.is_urgent !== "boolean" || typeof draft.is_important !== "boolean") fail("INVALID_FLAGS", "Task priority flags are invalid.");
  if (draft.scheduled_on !== null && (!DATE_KEY.test(draft.scheduled_on) || !validDate(draft.scheduled_on))) fail("INVALID_SCHEDULED_DATE", "Task scheduled date is invalid.");
  if (!isTime(draft.due_time ?? null)) fail("INVALID_DUE_TIME", "Task due time is invalid.");
  if (!REPEAT_FREQUENCIES.has(draft.repeat_frequency ?? "none")) fail("INVALID_REPEAT_FREQUENCY", "Task repeat frequency is invalid.");
  if (!Number.isInteger(draft.repeat_interval) || (draft.repeat_interval ?? 0) < 1) fail("INVALID_REPEAT_INTERVAL", "Task repeat interval must be a positive integer.");
  if ((draft.repeat_days_of_week ?? []).some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    fail("INVALID_REPEAT_WEEKDAYS", "Task repeat weekdays are invalid.");
  }
  if (draft.repeat_day_of_month !== null && (!Number.isInteger(draft.repeat_day_of_month) || draft.repeat_day_of_month < 1 || draft.repeat_day_of_month > 31)) {
    fail("INVALID_REPEAT_DAY", "Task repeat day of month is invalid.");
  }
  if (!MONTHLY_MODES.has(draft.repeat_monthly_mode ?? "day_of_month")) fail("INVALID_MONTHLY_MODE", "Task monthly repeat mode is invalid.");
  if (draft.repeat_monthly_ordinal !== null && !MONTHLY_ORDINALS.has(draft.repeat_monthly_ordinal)) fail("INVALID_MONTHLY_ORDINAL", "Task monthly repeat ordinal is invalid.");
  if (draft.repeat_monthly_weekday !== null && (!Number.isInteger(draft.repeat_monthly_weekday) || draft.repeat_monthly_weekday < 0 || draft.repeat_monthly_weekday > 6)) {
    fail("INVALID_MONTHLY_WEEKDAY", "Task monthly repeat weekday is invalid.");
  }
  if (draft.repeat_monthly_mode === "day_of_month" && (draft.repeat_monthly_ordinal !== null || draft.repeat_monthly_weekday !== null)) {
    fail("INVALID_MONTHLY_FIELDS", "Day-of-month repeats cannot include ordinal-weekday fields.");
  }
  if (draft.repeat_monthly_mode === "ordinal_weekday" && (draft.repeat_monthly_ordinal === null || draft.repeat_monthly_weekday === null)) {
    fail("INVALID_MONTHLY_FIELDS", "Ordinal-weekday repeats require both ordinal and weekday fields.");
  }
  if (draft.estimated_minutes !== null && (!Number.isInteger(draft.estimated_minutes) || draft.estimated_minutes < 1)) fail("INVALID_ESTIMATE", "Estimated minutes must be positive.");
  if (!Number.isInteger(draft.actual_seconds) || (draft.actual_seconds ?? 0) < 0) fail("INVALID_ACTUAL_SECONDS", "Actual seconds must be non-negative.");
  if (!Array.isArray(draft.tags) || draft.tags.some((tag) => typeof tag !== "string")) fail("INVALID_TAGS", "Task tags are invalid.");
  if (typeof draft.external_link_label !== "string" && draft.external_link_label !== null) fail("INVALID_EXTERNAL_LINK", "Task external link label is invalid.");
  if (typeof draft.external_link_url !== "string" && draft.external_link_url !== null) fail("INVALID_EXTERNAL_LINK", "Task external link URL is invalid.");
  if (typeof draft.one_step_at_a_time !== "boolean" || typeof draft.subtasks_auto_reset !== "boolean") fail("INVALID_SUBTASK_FLAGS", "Task subtask settings are invalid.");
  if (draft.pinned_at !== null && Number.isNaN(new Date(draft.pinned_at).getTime())) fail("INVALID_PIN_TIMESTAMP", "Task pin timestamp is invalid.");
  if (draft.pin_order !== null && !Number.isInteger(draft.pin_order)) fail("INVALID_PIN_ORDER", "Task pin order is invalid.");
  if (!Number.isInteger(draft.sort_order)) fail("INVALID_SORT_ORDER", "Task sort order is invalid.");
}

export function buildCanonicalTaskCreationPlan(input: {
  draft: Omit<TaskInsert, "user_id">;
  entityKind: CanonicalEntityKind;
  profile: CanonicalTaskCreationProfile;
  now: string | Date;
  source?: "task_creation" | "task_import";
}): CanonicalTaskCreationPlan {
  const draft = normalizedDraft(input.draft);
  validateDraft(draft);

  if (typeof input.profile.timezone !== "string"
    || input.profile.timezone.trim().length === 0
    || typeof input.profile.day_start_time !== "string"
    || !TIME_KEY.test(input.profile.day_start_time)
    || !Number.isInteger(input.profile.settings_revision)
    || input.profile.settings_revision < 1) {
    fail("INVALID_LOGICAL_DAY_SETTINGS", "Canonical logical-day settings are unavailable.");
  }

  const now = input.now instanceof Date ? input.now : new Date(input.now);
  if (Number.isNaN(now.getTime())) fail("INVALID_CREATION_TIMESTAMP", "Canonical creation timestamp is invalid.");

  let logicalDate: string;
  try {
    logicalDate = logicalDateForTimestamp(now, input.profile.timezone, input.profile.day_start_time);
  } catch {
    fail("INVALID_LOGICAL_DAY_SETTINGS", "Canonical logical-day settings are invalid.");
  }

  const frequency = draft.repeat_frequency ?? "none";
  const scheduleModel = frequency === "none"
    ? draft.due_on === null ? "unscheduled" : "one_time"
    : frequency === "weekly" || frequency === "monthly" ? "fixed" : "rolling";
  if (scheduleModel === "one_time" && !isDate(draft.due_on)) fail("INVALID_ONE_TIME_SCHEDULE", "A one-time Task requires a valid due date.");
  if ((frequency === "weekly" || frequency === "monthly") && !isDate(draft.due_on)) {
    fail("RECURRENCE_ANCHOR_UNPROVEN", "Weekly and monthly Tasks require a due date anchor.");
  }
  if (frequency === "weekly" && (draft.repeat_days_of_week ?? []).length === 0) {
    fail("INVALID_WEEKLY_SCHEDULE", "Weekly Tasks require at least one weekday.");
  }

  const anchorDate = scheduleModel === "fixed" ? draft.due_on : null;
  return {
    task: draft,
    canonical: {
      entity_kind: input.entityKind,
      terminal_state: "active",
      container_state: draft.status === "archived" ? "archived" : "active",
      prior_container_state: null,
      prior_container_state_status: "not_applicable",
      workflow_state: "none",
      workflow_revision: 1,
      canonical_revision: 1,
    },
    schedule: {
      effective_from_logical_date: logicalDate,
      schedule_model: scheduleModel,
      repeat_frequency: frequency,
      repeat_interval: draft.repeat_interval ?? 1,
      repeat_days_of_week: [...(draft.repeat_days_of_week ?? [])],
      repeat_day_of_month: draft.repeat_day_of_month ?? null,
      repeat_monthly_mode: draft.repeat_monthly_mode ?? "day_of_month",
      repeat_monthly_ordinal: draft.repeat_monthly_ordinal ?? null,
      repeat_monthly_weekday: draft.repeat_monthly_weekday ?? null,
      one_time_due_on: scheduleModel === "one_time" ? draft.due_on : null,
      due_time: draft.due_time ?? null,
      anchor_date: anchorDate,
      anchor_kind: anchorDate ? "user_selected" : "unknown",
      anchor_confidence: anchorDate ? "proven" : "unavailable",
      historical_scope_known: false,
      prospective_only: true,
      logical_day_settings_revision: input.profile.settings_revision,
      timezone: input.profile.timezone,
      day_start_time: input.profile.day_start_time,
      source: input.source ?? "task_creation",
    },
  };
}
