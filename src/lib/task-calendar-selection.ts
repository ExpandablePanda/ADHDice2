import type { Task } from "@/lib/database.types";

export function selectCalendarTasks({
  childTaskIds,
  includeSteps,
  matchingSearchEntityIds,
  searchIsActive,
  selectedTasks,
  tasks,
}: {
  childTaskIds: readonly string[];
  includeSteps: boolean;
  matchingSearchEntityIds: ReadonlySet<string> | null | undefined;
  searchIsActive: boolean;
  selectedTasks: readonly Task[];
  tasks: readonly Task[];
}) {
  const tasksById = new Map(tasks.map((task) => [task.id, task] as const));
  const selectedTasksById = new Map(selectedTasks.map((task) => [task.id, task] as const));

  if (includeSteps) {
    for (const childTaskId of childTaskIds) {
      if (searchIsActive && !matchingSearchEntityIds?.has(childTaskId)) {
        continue;
      }
      const task = tasksById.get(childTaskId);
      if (task) {
        selectedTasksById.set(task.id, task);
      }
    }
  }

  return Array.from(selectedTasksById.values());
}
