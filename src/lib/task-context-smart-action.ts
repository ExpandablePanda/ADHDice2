import type {
  TaskEnergy,
  TaskRepeatFrequency,
  TaskRepeatMonthlyMode,
  TaskRepeatMonthlyOrdinal,
  TaskStatus,
} from "@/lib/database.types";
import type { TaskPriorityLevelOption } from "@/lib/task-priority";

export const TASK_CONTEXT_SMART_ACTION_STORAGE_PREFIX = "adhdice-task-context-smart-action:v1";
const TASK_CONTEXT_SMART_ACTION_VERSION = 1;
const MAX_DISPLAY_LABEL_LENGTH = 160;
const TASK_CONTEXT_SMART_ACTION_STATUSES: readonly TaskStatus[] = [
  "pending",
  "in_progress",
  "done",
  "missed",
  "did_my_best",
  "upcoming",
  "not_due",
  "archived",
  "complete",
];
const TASK_CONTEXT_SMART_ACTION_ENERGIES: readonly TaskEnergy[] = ["none", "low", "medium", "high"];
const TASK_CONTEXT_SMART_ACTION_REPEATS: readonly TaskRepeatFrequency[] = [
  "none",
  "daily",
  "weekly",
  "monthly",
  "custom",
  "daily_until_complete",
  "per_week",
  "per_month",
];
const TASK_CONTEXT_SMART_ACTION_MONTHLY_MODES: readonly TaskRepeatMonthlyMode[] = ["day_of_month", "ordinal_weekday"];
const TASK_CONTEXT_SMART_ACTION_MONTHLY_ORDINALS: readonly TaskRepeatMonthlyOrdinal[] = ["first", "second", "third", "fourth", "last"];
const TASK_CONTEXT_SMART_ACTION_PRIORITIES: readonly TaskPriorityLevelOption[] = ["0", "1", "2", "3", "4", "5"];

export type TaskContextSmartRepeatValue = {
  repeatFrequency: TaskRepeatFrequency;
  repeatInterval: number;
  repeatDaysOfWeek: number[];
  repeatDayOfMonth: number | null;
  repeatMonthlyMode: TaskRepeatMonthlyMode;
  repeatMonthlyOrdinal: TaskRepeatMonthlyOrdinal | null;
  repeatMonthlyWeekday: number | null;
  repeatEndOn: string | null;
  repeatQuotaCount?: number | null;
  repeatQuotaBalanceEnabled?: boolean;
};

export type TaskContextSmartActionInput =
  | { kind: "status"; status: TaskStatus }
  | { kind: "due"; dueOn: string; dueTime: string }
  | { kind: "priority"; priorities: TaskPriorityLevelOption[] }
  | { kind: "energy"; energy: TaskEnergy }
  | { kind: "repeat"; value: TaskContextSmartRepeatValue }
  | { kind: "list"; listId: string; label: string; operation: "add" | "remove" }
  | { kind: "tags"; tags: string[] }
  | { kind: "folder"; folderId: string | null; label: string }
  | { kind: "parent"; parentTaskId: string; label: string }
  | { kind: "restore" }
  | { kind: "remove" }
  | { kind: "duplicate" }
;

export type TaskContextSmartAction = { version: typeof TASK_CONTEXT_SMART_ACTION_VERSION } & TaskContextSmartActionInput;

export type TaskContextSmartActionTarget = {
  status: TaskStatus;
  parentTaskId?: string | null;
  taskContentFolderId?: string | null;
  listIds?: readonly string[];
};

export type TaskContextSmartActionEligibility = {
  availableStatuses?: readonly TaskStatus[];
  availableListIds?: readonly string[];
  availableFolderIds?: readonly (string | null)[];
  availableParentIds?: readonly string[];
  canApplyDue?: boolean;
  canApplyPriority?: boolean;
  canApplyEnergy?: boolean;
  canApplyTags?: boolean;
  canApplyList?: boolean;
  canApplyFolder?: boolean;
  canApplyParent?: boolean;
  canApplyRestore?: boolean;
  canApplyDuplicate?: boolean;
  canApplyRepeat?: boolean;
  canRemoveFromCurrentList?: boolean;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isOneOf<TValue extends string>(value: unknown, values: readonly TValue[]): value is TValue {
  return typeof value === "string" && values.includes(value as TValue);
}

function isValidDateKey(value: unknown): value is string {
  return value === "" || (isString(value) && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isValidTime(value: unknown): value is string {
  return value === "" || (isString(value) && /^\d{2}:\d{2}$/.test(value));
}

function isSafeDisplayLabel(value: unknown): value is string {
  return isString(value) && value.trim().length > 0 && value.length <= MAX_DISPLAY_LABEL_LENGTH;
}

function isValidRepeatValue(value: unknown): value is TaskContextSmartRepeatValue {
  if (!isObject(value)
    || !isOneOf(value.repeatFrequency, TASK_CONTEXT_SMART_ACTION_REPEATS)
    || typeof value.repeatInterval !== "number"
    || !Number.isInteger(value.repeatInterval)
    || value.repeatInterval < 1
    || !Array.isArray(value.repeatDaysOfWeek)
    || !value.repeatDaysOfWeek.every((day) => typeof day === "number" && Number.isInteger(day) && day >= 0 && day <= 6)
    || (typeof value.repeatDayOfMonth !== "number" && value.repeatDayOfMonth !== null)
    || (typeof value.repeatDayOfMonth === "number" && (!Number.isInteger(value.repeatDayOfMonth) || value.repeatDayOfMonth < 1 || value.repeatDayOfMonth > 31))
    || !isOneOf(value.repeatMonthlyMode, TASK_CONTEXT_SMART_ACTION_MONTHLY_MODES)
    || (value.repeatMonthlyOrdinal !== null && !isOneOf(value.repeatMonthlyOrdinal, TASK_CONTEXT_SMART_ACTION_MONTHLY_ORDINALS))
    || (typeof value.repeatMonthlyWeekday !== "number" && value.repeatMonthlyWeekday !== null)
    || (typeof value.repeatMonthlyWeekday === "number" && (!Number.isInteger(value.repeatMonthlyWeekday) || value.repeatMonthlyWeekday < 0 || value.repeatMonthlyWeekday > 6))
    || !isNullableString(value.repeatEndOn)
    || (value.repeatEndOn !== null && !isValidDateKey(value.repeatEndOn))
    || (value.repeatQuotaCount !== undefined && value.repeatQuotaCount !== null && (typeof value.repeatQuotaCount !== "number" || !Number.isInteger(value.repeatQuotaCount) || value.repeatQuotaCount < 1))
    || (value.repeatQuotaBalanceEnabled !== undefined && typeof value.repeatQuotaBalanceEnabled !== "boolean")) {
    return false;
  }

  return true;
}

export function getTaskContextSmartActionStorageKey(userId: string) {
  return `${TASK_CONTEXT_SMART_ACTION_STORAGE_PREFIX}:${userId}`;
}

export function readTaskContextSmartAction(userId: string | null | undefined): TaskContextSmartAction | null {
  if (!userId || typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getTaskContextSmartActionStorageKey(userId));
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return isValidTaskContextSmartAction(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeTaskContextSmartAction(userId: string | null | undefined, action: TaskContextSmartAction) {
  if (!userId || typeof window === "undefined" || !isValidTaskContextSmartAction(action)) {
    return false;
  }

  try {
    window.localStorage.setItem(getTaskContextSmartActionStorageKey(userId), JSON.stringify(action));
    return true;
  } catch {
    return false;
  }
}

export function isValidTaskContextSmartAction(value: unknown): value is TaskContextSmartAction {
  if (!isObject(value) || value.version !== TASK_CONTEXT_SMART_ACTION_VERSION || !isString(value.kind)) {
    return false;
  }

  switch (value.kind) {
    case "status":
      return isOneOf(value.status, TASK_CONTEXT_SMART_ACTION_STATUSES) && value.status !== "trashed";
    case "due":
      return isValidDateKey(value.dueOn) && isValidTime(value.dueTime);
    case "priority":
      return Array.isArray(value.priorities)
        && value.priorities.length <= 1
        && value.priorities.every((priority) => isOneOf(priority, TASK_CONTEXT_SMART_ACTION_PRIORITIES));
    case "energy":
      return isOneOf(value.energy, TASK_CONTEXT_SMART_ACTION_ENERGIES);
    case "repeat":
      return isValidRepeatValue(value.value);
    case "list":
      return isString(value.listId) && value.listId.length > 0
        && isSafeDisplayLabel(value.label)
        && (value.operation === "add" || value.operation === "remove");
    case "tags":
      return Array.isArray(value.tags)
        && value.tags.length <= 100
        && value.tags.every((tag) => isSafeDisplayLabel(tag));
    case "folder":
      return (value.folderId === null || (isString(value.folderId) && value.folderId.length > 0))
        && isSafeDisplayLabel(value.label);
    case "parent":
      return isString(value.parentTaskId) && value.parentTaskId.length > 0 && isSafeDisplayLabel(value.label);
    case "restore":
    case "remove":
    case "duplicate":
      return true;
    default:
      return false;
  }
}

export function getTaskContextSmartActionLabel(action: TaskContextSmartAction): string {
  switch (action.kind) {
    case "status":
      return `Repeat: ${action.status === "pending" ? "Open" : action.status.split("_").map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" ")}`;
    case "due":
      return `Repeat: Due ${action.dueOn || "No date"}${action.dueTime ? ` · ${action.dueTime}` : ""}`;
    case "priority":
      return `Repeat: Priority ${action.priorities[0] ?? "None"}`;
    case "energy":
      return `Repeat: Energy ${action.energy.charAt(0).toUpperCase()}${action.energy.slice(1)}`;
    case "repeat":
      return `Repeat: ${action.value.repeatFrequency === "none" ? "No repeat" : action.value.repeatFrequency.replaceAll("_", " ")}`;
    case "list":
      return `Repeat: ${action.operation === "add" ? "Add to" : "Remove from"} ${action.label}`;
    case "tags":
      return `Repeat: Tags ${action.tags.length > 0 ? action.tags.map((tag) => `#${tag}`).join(", ") : "none"}`;
    case "folder":
      return `Repeat: Move to ${action.label}`;
    case "parent":
      return `Repeat: Move into ${action.label}`;
    case "restore":
      return "Repeat: Restore to inbox";
    case "remove":
      return "Repeat: Remove from current list";
    case "duplicate":
      return "Repeat: Duplicate task";
  }
}

export function isTaskContextSmartActionEligible(
  action: TaskContextSmartAction,
  target: TaskContextSmartActionTarget,
  options: TaskContextSmartActionEligibility = {},
) {
  switch (action.kind) {
    case "status":
      return !options.availableStatuses || options.availableStatuses.includes(action.status);
    case "due":
      return options.canApplyDue !== false;
    case "priority":
      return options.canApplyPriority !== false;
    case "energy":
      return options.canApplyEnergy !== false;
    case "tags":
      return options.canApplyTags !== false;
    case "duplicate":
      return options.canApplyDuplicate !== false;
    case "repeat":
      return options.canApplyRepeat !== false;
    case "list": {
      if (options.canApplyList === false) {
        return false;
      }
      if (options.availableListIds && !options.availableListIds.includes(action.listId)) {
        return false;
      }
      const hasList = target.listIds?.includes(action.listId) ?? false;
      return action.operation === "add" ? !hasList : hasList;
    }
    case "folder": {
      if (options.canApplyFolder === false) {
        return false;
      }
      if (action.folderId === null && target.parentTaskId !== null && target.parentTaskId !== undefined) {
        return false;
      }
      if (options.availableFolderIds && !options.availableFolderIds.includes(action.folderId)) {
        return false;
      }
      return target.taskContentFolderId !== action.folderId;
    }
    case "parent":
      return options.canApplyParent !== false && Boolean(options.availableParentIds?.includes(action.parentTaskId));
    case "restore":
      return options.canApplyRestore !== false && (target.status === "archived" || target.status === "trashed");
    case "remove":
      return options.canRemoveFromCurrentList === true;
  }
}
