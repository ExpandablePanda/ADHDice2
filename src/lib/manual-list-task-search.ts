import type { Task } from "@/lib/database.types";
import { isTaskOpen } from "@/lib/task-buckets";
import type { TaskListId } from "@/lib/task-lists";

export function matchesManualListTaskSearch(task: Pick<Task, "title" | "tags">, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return task.title.toLowerCase().includes(normalizedQuery)
    || (task.tags ?? []).some((tag) => tag.toLowerCase().includes(normalizedQuery));
}

export function filterManualListTaskCandidates(
  tasks: readonly Task[],
  query: string,
  selectedListId: TaskListId,
  manualMembershipsByTaskId: Readonly<Record<string, readonly TaskListId[]>>,
) {
  return tasks
    .filter((task) =>
      isTaskOpen(task)
      && task.status !== "archived"
      && task.status !== "trashed"
      && !(manualMembershipsByTaskId[task.id] ?? []).includes(selectedListId)
      && matchesManualListTaskSearch(task, query)
    )
    .slice(0, 6);
}
