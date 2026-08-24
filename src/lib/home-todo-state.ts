import { buildNewTaskDraft, type TaskDraft } from "@/components/task-app/task-editor-model";
import type { Task } from "@/lib/database.types";
import { getCalendarDayKey } from "@/lib/logical-day";
import type { TaskListMembership } from "@/lib/task-lists";
import { shiftDateKey } from "@/lib/task-grid-layout";

export type HomeTodoStateV1 = {
  clientUpdatedAt: string;
  schemaVersion: 1;
  taskIds: string[];
};

export type HomeTodoStateV2 = {
  clientUpdatedAt: string;
  schemaVersion: 2;
  taskIds: string[];
  tasksPerDay: HomeTodoTasksPerDay;
};

type HomeTodoStateCandidate = {
  clientUpdatedAt?: unknown;
  taskIds?: unknown;
  tasksPerDay?: unknown;
};

export const HOME_TODO_TASKS_PER_DAY_OPTIONS = [10, 11, 12, 13, 14, 15] as const;
export type HomeTodoTasksPerDay = typeof HOME_TODO_TASKS_PER_DAY_OPTIONS[number];
export const DEFAULT_HOME_TODO_TASKS_PER_DAY: HomeTodoTasksPerDay = 10;

export const EMPTY_HOME_TODO_STATE: HomeTodoStateV2 = {
  clientUpdatedAt: new Date(0).toISOString(),
  schemaVersion: 2,
  taskIds: [],
  tasksPerDay: DEFAULT_HOME_TODO_TASKS_PER_DAY,
};

export type HomeTodoDaySection<T = string> = {
  dayIndex: number;
  dateKey: string;
  label: string;
  startIndex: number;
  taskIds: T[];
};

export function normalizeHomeTodoTasksPerDay(value: unknown): HomeTodoTasksPerDay {
  return HOME_TODO_TASKS_PER_DAY_OPTIONS.includes(value as HomeTodoTasksPerDay)
    ? value as HomeTodoTasksPerDay
    : DEFAULT_HOME_TODO_TASKS_PER_DAY;
}

function formatOrdinalDay(day: number) {
  const suffix = day % 100 >= 11 && day % 100 <= 13
    ? "th"
    : day % 10 === 1
      ? "st"
      : day % 10 === 2
        ? "nd"
        : day % 10 === 3
          ? "rd"
          : "th";
  return `${day}${suffix}`;
}

export function formatHomeTodoDateLabel(dateKey: string, dayIndex: number) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  const month = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(date);
  const day = Number.parseInt(new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "UTC" }).format(date), 10);
  const dateLabel = `${month} ${formatOrdinalDay(day)}`;
  const prefix = dayIndex === 0
    ? "Today"
    : dayIndex === 1
      ? "Tomorrow"
      : new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long" }).format(date);
  return `${prefix} · ${dateLabel}`;
}

export function buildHomeTodoDaySections<T>(
  taskIds: readonly T[],
  tasksPerDay: unknown = DEFAULT_HOME_TODO_TASKS_PER_DAY,
  now: Date = new Date(),
  timezone?: string,
) {
  const normalizedTasksPerDay = normalizeHomeTodoTasksPerDay(tasksPerDay);
  const todayDateKey = getCalendarDayKey(now, timezone);
  const sections: HomeTodoDaySection<T>[] = Array.from({ length: 7 }, (_, dayIndex) => {
    const startIndex = dayIndex * normalizedTasksPerDay;
    return {
      dayIndex,
      dateKey: shiftDateKey(todayDateKey, dayIndex),
      label: formatHomeTodoDateLabel(shiftDateKey(todayDateKey, dayIndex), dayIndex),
      startIndex,
      taskIds: [...taskIds.slice(startIndex, startIndex + normalizedTasksPerDay)],
    };
  });
  return {
    sections,
    laterTaskIds: [...taskIds.slice(normalizedTasksPerDay * 7)],
  };
}

export async function createHomeTodoTask(
  title: string,
  onCreateTask: (draft: TaskDraft) => Promise<Task | null>,
  appendTaskId: (taskId: string) => void,
) {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return null;

  const createdTask = await onCreateTask(buildNewTaskDraft(trimmedTitle));
  if (!createdTask) return null;

  appendTaskId(createdTask.id);
  return createdTask;
}

export function normalizeHomeTodoState(value: unknown): HomeTodoStateV2 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...EMPTY_HOME_TODO_STATE };
  }
  const candidate = value as HomeTodoStateCandidate;
  const seen = new Set<string>();
  const taskIds = Array.isArray(candidate.taskIds)
    ? candidate.taskIds.filter((taskId): taskId is string => {
      if (typeof taskId !== "string" || !taskId.trim() || seen.has(taskId)) return false;
      seen.add(taskId);
      return true;
    })
    : [];
  const parsedUpdatedAt = typeof candidate.clientUpdatedAt === "string"
    ? Date.parse(candidate.clientUpdatedAt)
    : Number.NaN;
  return {
    clientUpdatedAt: Number.isFinite(parsedUpdatedAt)
      ? new Date(parsedUpdatedAt).toISOString()
      : EMPTY_HOME_TODO_STATE.clientUpdatedAt,
    schemaVersion: 2,
    taskIds,
    tasksPerDay: normalizeHomeTodoTasksPerDay(candidate.tasksPerDay),
  };
}

export function isHomeTodoTaskEligible(
  task: Task,
  tasks: readonly Task[],
  taskById = new Map(tasks.map((item) => [item.id, item])),
) {
  if (
    task.status === "complete"
    || task.status === "archived"
    || task.status === "trashed"
    || task.trashed_at
  ) {
    return false;
  }
  const visited = new Set<string>([task.id]);
  let parentId = task.parent_task_id;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = taskById.get(parentId);
    if (!parent) break;
    if (parent.status === "archived" || parent.status === "trashed" || parent.trashed_at) {
      return false;
    }
    parentId = parent.parent_task_id;
  }
  return true;
}

export function buildHomeTodoHierarchy(
  task: Task,
  tasks: readonly Task[],
  taskById = new Map(tasks.map((item) => [item.id, item])),
) {
  const labels: string[] = [];
  const visited = new Set<string>([task.id]);
  let parentId = task.parent_task_id;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = taskById.get(parentId);
    if (!parent) break;
    labels.unshift(parent.title || "Untitled task");
    parentId = parent.parent_task_id;
  }
  return labels;
}

export function getHomeTodoSearchText(
  task: Pick<Task, "notes" | "pinned_at" | "tags" | "title">,
  hierarchy: readonly string[],
  listMemberships: readonly Pick<TaskListMembership, "id">[],
) {
  return [
    task.title,
    task.notes,
    ...(task.tags ?? []),
    ...hierarchy,
    task.pinned_at ? "pinned" : "",
    ...listMemberships.map((membership) => membership.id),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function reconcileHomeTodoTaskIds(taskIds: readonly string[], tasks: readonly Task[]) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const seen = new Set<string>();
  return taskIds.filter((taskId) => {
    if (seen.has(taskId)) return false;
    seen.add(taskId);
    const task = taskById.get(taskId);
    return Boolean(task && isHomeTodoTaskEligible(task, tasks, taskById));
  });
}

export function moveHomeTodoTaskId(taskIds: readonly string[], taskId: string, direction: -1 | 1) {
  const from = taskIds.indexOf(taskId);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= taskIds.length) return [...taskIds];
  const next = [...taskIds];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

export function moveHomeTodoTaskIdToEdge(
  taskIds: readonly string[],
  taskId: string,
  edge: "bottom" | "top",
) {
  const from = taskIds.indexOf(taskId);
  if (from < 0) return [...taskIds];
  const next = [...taskIds];
  const [movedTaskId] = next.splice(from, 1);
  if (!movedTaskId) return [...taskIds];
  if (edge === "top") next.unshift(movedTaskId);
  else next.push(movedTaskId);
  return next;
}

export function sortHomeTodoSearchResults<T extends {
  hierarchy: readonly string[];
  task: Pick<Task, "id" | "title">;
}>(results: readonly T[]) {
  return [...results].sort((left, right) => {
    const leftPath = [...left.hierarchy, left.task.title || "Untitled task"];
    const rightPath = [...right.hierarchy, right.task.title || "Untitled task"];
    const sharedLength = Math.min(leftPath.length, rightPath.length);
    for (let index = 0; index < sharedLength; index += 1) {
      const comparison = leftPath[index]!.localeCompare(rightPath[index]!, undefined, {
        numeric: true,
        sensitivity: "base",
      });
      if (comparison !== 0) return comparison;
    }
    if (leftPath.length !== rightPath.length) return leftPath.length - rightPath.length;
    return left.task.id.localeCompare(right.task.id);
  });
}
