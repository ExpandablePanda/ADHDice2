import type { Task } from "@/lib/database.types";
import type { PathNode } from "@/lib/paths-domain";
import { buildTaskHierarchyAdapter } from "@/lib/task-hierarchy";
import { formatTaskPriorityLabel, getTaskPriorityLevel } from "@/lib/task-priority";

export type PathsTaskNodeStep = {
  substeps: Task[];
  task: Task;
};

export type PathsTaskNodeView =
  | {
      kind: "missing";
      taskId: string | null;
    }
  | {
      activeSteps: PathsTaskNodeStep[];
      completedStepCount: number;
      completedSteps: PathsTaskNodeStep[];
      dueLabel: string | null;
      isComplete: boolean;
      kind: "task";
      priorityLabel: string | null;
      task: Task;
      totalStepCount: number;
    };

export function isPathsTaskAvailable(task: Task, tasks: readonly Task[]) {
  const taskById = new Map(tasks.map((entry) => [entry.id, entry]));
  const visited = new Set<string>();
  let current: Task | undefined = task;

  while (current && !visited.has(current.id)) {
    if (current.trashed_at || current.status === "trashed" || current.status === "archived") {
      return false;
    }
    visited.add(current.id);
    current = current.parent_task_id ? taskById.get(current.parent_task_id) : undefined;
  }

  return true;
}

export function buildPathsTaskNodeView(node: PathNode, tasks: readonly Task[]): PathsTaskNodeView {
  const taskId = node.linkedTaskIds[0] ?? null;
  const task = taskId ? tasks.find((entry) => entry.id === taskId) ?? null : null;
  if (!task || !isPathsTaskAvailable(task, tasks)) {
    return { kind: "missing", taskId };
  }

  const hierarchy = buildTaskHierarchyAdapter(tasks);
  const directSteps = hierarchy.getChildren(task.id)
    .filter((step) => isPathsTaskAvailable(step, tasks));
  const mapStep = (step: Task): PathsTaskNodeStep => ({
    substeps: hierarchy.getChildren(step.id)
      .filter((substep) => isPathsTaskAvailable(substep, tasks)),
    task: step,
  });
  const completedSteps = directSteps.filter(isCanonicalPathsStepComplete).map(mapStep);
  const activeSteps = directSteps.filter((step) => !isCanonicalPathsStepComplete(step)).map(mapStep);
  const priorityLevel = getTaskPriorityLevel(task);

  return {
    activeSteps,
    completedStepCount: completedSteps.length,
    completedSteps,
    dueLabel: task.due_on,
    isComplete: task.status === "complete",
    kind: "task",
    priorityLabel: priorityLevel > 0 ? formatTaskPriorityLabel(priorityLevel) : null,
    task,
    totalStepCount: directSteps.length,
  };
}

export function isCanonicalPathsStepComplete(task: Pick<Task, "status">) {
  return task.status === "complete";
}

export function isPathsNodeComplete({
  canonicalTaskComplete,
  localPathComplete,
  nodeKind,
}: {
  canonicalTaskComplete: boolean;
  localPathComplete: boolean;
  nodeKind: PathNode["kind"];
}) {
  return nodeKind === "task" ? canonicalTaskComplete : localPathComplete;
}
