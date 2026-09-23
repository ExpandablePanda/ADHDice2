import type { Task, TaskHistory } from "./database.types.ts";

/**
 * Tracking exclusion is a direct Task attribute. Descendants inherit the
 * effective value through the same-table parent chain; no descendant rows are
 * mutated when an ancestor changes.
 */
export function isTaskDirectlyExcludedFromTracking(
  task: Pick<Task, "exclude_from_tracking">,
) {
  return task.exclude_from_tracking === true;
}

export function buildEffectiveTrackingExclusionSet(
  tasks: readonly Pick<Task, "id" | "parent_task_id" | "exclude_from_tracking">[],
) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const excludedByTaskId = new Map<string, boolean>();

  for (const task of tasks) {
    if (excludedByTaskId.has(task.id)) continue;

    const path: string[] = [];
    const pathIds = new Set<string>();
    let currentTaskId: string | null = task.id;
    let excluded = false;

    while (currentTaskId !== null) {
      const cached = excludedByTaskId.get(currentTaskId);
      if (cached !== undefined) {
        excluded = cached;
        break;
      }

      if (pathIds.has(currentTaskId)) {
        // A parent cycle has no exclusion of its own unless one was already
        // encountered while traversing the cycle. Terminate rather than
        // allowing malformed data to recurse forever.
        break;
      }

      pathIds.add(currentTaskId);
      path.push(currentTaskId);
      const currentTask = taskById.get(currentTaskId);
      if (!currentTask) break;
      if (isTaskDirectlyExcludedFromTracking(currentTask)) {
        excluded = true;
        break;
      }
      currentTaskId = currentTask.parent_task_id;
    }

    for (const pathTaskId of path) excludedByTaskId.set(pathTaskId, excluded);
  }

  return new Set([...excludedByTaskId].filter(([, excluded]) => excluded).map(([taskId]) => taskId));
}

export function isTaskEffectivelyExcludedFromTracking(
  task: Pick<Task, "id">,
  tasks: readonly Pick<Task, "id" | "parent_task_id" | "exclude_from_tracking">[],
) {
  return buildEffectiveTrackingExclusionSet(tasks).has(task.id);
}

export type TaskTrackingExclusionResolution =
  | { status: "resolved"; excluded: boolean }
  | { status: "unavailable"; message: string };

/**
 * Resolve one Task only after its supplied ancestor evidence is complete and
 * acyclic. The existing exclusion-set helper remains the semantic authority;
 * this wrapper prevents a bounded source loader from treating ambiguous
 * hierarchy evidence as included in tracking.
 */
export function resolveTaskTrackingExclusion(
  task: Pick<Task, "id">,
  tasks: readonly Pick<Task, "id" | "parent_task_id" | "exclude_from_tracking">[],
): TaskTrackingExclusionResolution {
  const taskById = new Map(tasks.map((candidate) => [candidate.id, candidate]));
  if (!taskById.has(task.id)) {
    return { status: "unavailable", message: "Canonical Task hierarchy evidence is missing." };
  }

  const seen = new Set<string>();
  let currentTaskId: string | null = task.id;
  while (currentTaskId !== null) {
    if (seen.has(currentTaskId)) {
      return { status: "unavailable", message: "Canonical Task hierarchy contains a parent cycle." };
    }
    seen.add(currentTaskId);
    const currentTask = taskById.get(currentTaskId);
    if (!currentTask) {
      return { status: "unavailable", message: "Canonical Task hierarchy evidence is incomplete." };
    }
    currentTaskId = currentTask.parent_task_id;
  }

  return {
    status: "resolved",
    excluded: isTaskEffectivelyExcludedFromTracking(task, tasks),
  };
}

export function filterTrackedTaskHistory(
  history: readonly TaskHistory[],
  tasks: readonly Pick<Task, "id" | "parent_task_id" | "exclude_from_tracking">[],
) {
  const excludedTaskIds = buildEffectiveTrackingExclusionSet(tasks);
  return history.filter((entry) => !excludedTaskIds.has(entry.task_id));
}
