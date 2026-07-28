import type { Task } from "@/lib/database.types";

export type HomeTodoStateV1 = {
  clientUpdatedAt: string;
  schemaVersion: 1;
  taskIds: string[];
};

export const EMPTY_HOME_TODO_STATE: HomeTodoStateV1 = {
  clientUpdatedAt: new Date(0).toISOString(),
  schemaVersion: 1,
  taskIds: [],
};

export function normalizeHomeTodoState(value: unknown): HomeTodoStateV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...EMPTY_HOME_TODO_STATE };
  }
  const candidate = value as Partial<HomeTodoStateV1>;
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
    schemaVersion: 1,
    taskIds,
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
