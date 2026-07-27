import type { Task, TaskHistory, TaskStatus } from "@/lib/database.types";
import { getTaskDisplayStatusWithHistory } from "@/lib/task-cockpit";
import { computeTaskSpecificHistoryStats } from "@/lib/task-history";
import { getTaskPriorityLevel } from "@/lib/task-priority";

export type ListSortField =
  | "manual"
  | "due_date"
  | "status"
  | "priority"
  | "title"
  | "recently_added"
  | "recently_updated"
  | "streak"
  | "estimated_duration";

export type ListSortDirection = "asc" | "desc";
export type ListSortPreference = { field: ListSortField; direction: ListSortDirection };
export type ListSortBySurface = Record<string, ListSortPreference>;

export const DEFAULT_LIST_SORT_PREFERENCE: ListSortPreference = { field: "manual", direction: "asc" };
export const LIST_SORT_FIELDS: readonly ListSortField[] = [
  "manual",
  "due_date",
  "status",
  "priority",
  "title",
  "recently_added",
  "recently_updated",
  "streak",
  "estimated_duration",
];

const LIST_STATUS_ORDER: Record<TaskStatus, number> = {
  pending: 0,
  in_progress: 1,
  missed: 2,
  upcoming: 3,
  not_due: 3,
  delayed: 4,
  done: 5,
  did_my_best: 5,
  complete: 5,
  archived: 5,
  trashed: 6,
};

export function normalizeListSortPreference(value: unknown): ListSortPreference {
  if (!value || typeof value !== "object") return DEFAULT_LIST_SORT_PREFERENCE;
  const candidate = value as Partial<ListSortPreference>;
  if (!LIST_SORT_FIELDS.includes(candidate.field as ListSortField)) return DEFAULT_LIST_SORT_PREFERENCE;
  if (candidate.direction !== "asc" && candidate.direction !== "desc") return DEFAULT_LIST_SORT_PREFERENCE;
  return candidate.field === "manual"
    ? DEFAULT_LIST_SORT_PREFERENCE
    : { field: candidate.field as ListSortField, direction: candidate.direction };
}

export function normalizeListSortBySurface(value: unknown): ListSortBySurface {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([surfaceId]) => surfaceId.trim().length > 0)
      .map(([surfaceId, preference]) => [surfaceId, normalizeListSortPreference(preference)]),
  );
}

export function getListSortSurfaceId(tasksSurface: string, listId: string) {
  return `${tasksSurface}:${listId}`;
}

function compareNullable<T>(left: T | null | undefined, right: T | null | undefined, compare: (a: T, b: T) => number) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return compare(left, right);
}

export function sortListParentTasks(
  tasks: readonly Task[],
  preference: ListSortPreference,
  context: { taskHistoryByTaskId?: Record<string, TaskHistory[]>; todayDateKey?: string } = {},
) {
  const normalized = normalizeListSortPreference(preference);
  if (normalized.field === "manual") return [...tasks];

  const historyByTaskId = context.taskHistoryByTaskId ?? {};
  const todayDateKey = context.todayDateKey ?? "";
  const direction = normalized.direction === "asc" ? 1 : -1;
  const originalIndex = new Map(tasks.map((task, index) => [task.id, index] as const));

  return [...tasks].sort((left, right) => {
    let result = 0;
    switch (normalized.field) {
      case "due_date":
        if ((left.due_on == null) !== (right.due_on == null)) return left.due_on == null ? 1 : -1;
        result = compareNullable(left.due_on, right.due_on, (a, b) => a.localeCompare(b))
          || compareNullable(left.due_time, right.due_time, (a, b) => a.localeCompare(b));
        break;
      case "status":
        result = LIST_STATUS_ORDER[getTaskDisplayStatusWithHistory(left, historyByTaskId[left.id] ?? [], todayDateKey)]
          - LIST_STATUS_ORDER[getTaskDisplayStatusWithHistory(right, historyByTaskId[right.id] ?? [], todayDateKey)];
        break;
      case "priority":
        result = getTaskPriorityLevel(left) - getTaskPriorityLevel(right);
        break;
      case "title":
        result = left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
        break;
      case "recently_added":
        result = left.created_at.localeCompare(right.created_at);
        break;
      case "recently_updated":
        result = left.updated_at.localeCompare(right.updated_at);
        break;
      case "streak":
        result = computeTaskSpecificHistoryStats(left, historyByTaskId[left.id] ?? [], todayDateKey).currentStreak
          - computeTaskSpecificHistoryStats(right, historyByTaskId[right.id] ?? [], todayDateKey).currentStreak;
        break;
      case "estimated_duration":
        if ((left.estimated_minutes == null) !== (right.estimated_minutes == null)) return left.estimated_minutes == null ? 1 : -1;
        result = compareNullable(left.estimated_minutes, right.estimated_minutes, (a, b) => a - b);
        break;
      default:
        break;
    }
    return result === 0 ? (originalIndex.get(left.id) ?? 0) - (originalIndex.get(right.id) ?? 0) : result * direction;
  });
}
