import type { Task } from "@/lib/database.types";

export type TaskTreeNode = {
  children: TaskTreeNode[];
  task: Task;
};

export type TaskHierarchyIssue =
  | {
    parentTaskId: string;
    taskId: string;
    type: "circular_parent";
    viaTaskIds: string[];
  }
  | {
    parentTaskId: string;
    taskId: string;
    type: "missing_parent" | "self_parent";
  };

export function isTopLevelTask(task: Pick<Task, "parent_task_id">) {
  return task.parent_task_id === null;
}

export function isChildTask(task: Pick<Task, "parent_task_id">) {
  return task.parent_task_id !== null;
}

export function sortTaskSiblings(tasks: Task[]) {
  return [...tasks].sort(compareSiblingOrder);
}

export function groupTasksByParentId(tasks: Task[]) {
  const grouped = new Map<string | null, Task[]>();

  for (const task of tasks) {
    const key = task.parent_task_id ?? null;
    const siblings = grouped.get(key);
    if (siblings) {
      siblings.push(task);
    } else {
      grouped.set(key, [task]);
    }
  }

  for (const [key, siblings] of grouped.entries()) {
    grouped.set(key, sortTaskSiblings(siblings));
  }

  return grouped;
}

export function detectTaskHierarchyIssues(tasks: Task[]) {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const issues: TaskHierarchyIssue[] = [];

  for (const task of tasks) {
    const parentTaskId = task.parent_task_id;
    if (parentTaskId === null) {
      continue;
    }

    if (parentTaskId === task.id) {
      issues.push({ parentTaskId, taskId: task.id, type: "self_parent" });
      continue;
    }

    if (!tasksById.has(parentTaskId)) {
      issues.push({ parentTaskId, taskId: task.id, type: "missing_parent" });
      continue;
    }

    const visitedTaskIds = new Set<string>([task.id]);
    const traversalPath = [task.id];
    let currentParentTaskId: string | null = parentTaskId;

    while (currentParentTaskId !== null) {
      if (visitedTaskIds.has(currentParentTaskId)) {
        traversalPath.push(currentParentTaskId);
        issues.push({
          parentTaskId,
          taskId: task.id,
          type: "circular_parent",
          viaTaskIds: traversalPath,
        });
        break;
      }

      visitedTaskIds.add(currentParentTaskId);
      traversalPath.push(currentParentTaskId);

      const parentTask = tasksById.get(currentParentTaskId);
      if (!parentTask) {
        break;
      }
      currentParentTaskId = parentTask.parent_task_id;
    }
  }

  return issues;
}

export function buildTaskTree(tasks: Task[]) {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const invalidTaskIds = new Set(detectTaskHierarchyIssues(tasks).map((issue) => issue.taskId));
  const childrenByParentId = groupTasksByParentId(tasks);

  function buildNode(task: Task, ancestry = new Set<string>()): TaskTreeNode {
    if (ancestry.has(task.id)) {
      return { children: [], task };
    }

    const nextAncestry = new Set(ancestry);
    nextAncestry.add(task.id);

    const children = (childrenByParentId.get(task.id) ?? [])
      .filter((child) => !invalidTaskIds.has(child.id))
      .map((child) => buildNode(child, nextAncestry));

    return { children, task };
  }

  const rootTasks = sortTaskSiblings(tasks.filter((task) => (
    isTopLevelTask(task)
    || invalidTaskIds.has(task.id)
    || (task.parent_task_id !== null && !tasksById.has(task.parent_task_id))
  )));

  return rootTasks.map((task) => buildNode(task));
}

export function getTaskDescendants(taskId: string, tasks: Task[]) {
  const childrenByParentId = groupTasksByParentId(tasks);
  const invalidTaskIds = new Set(detectTaskHierarchyIssues(tasks).map((issue) => issue.taskId));
  const descendants: Task[] = [];

  function visitChildren(parentId: string, ancestry = new Set<string>()) {
    const nextAncestry = new Set(ancestry);
    nextAncestry.add(parentId);

    for (const child of childrenByParentId.get(parentId) ?? []) {
      if (invalidTaskIds.has(child.id) || nextAncestry.has(child.id)) {
        continue;
      }

      descendants.push(child);
      visitChildren(child.id, nextAncestry);
    }
  }

  visitChildren(taskId);
  return descendants;
}

export function getTaskAncestors(taskId: string, tasks: Task[]) {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const ancestors: Task[] = [];
  const visitedTaskIds = new Set<string>([taskId]);
  let currentParentTaskId = tasksById.get(taskId)?.parent_task_id ?? null;

  while (currentParentTaskId !== null) {
    if (visitedTaskIds.has(currentParentTaskId)) {
      break;
    }

    visitedTaskIds.add(currentParentTaskId);
    const parentTask = tasksById.get(currentParentTaskId);
    if (!parentTask) {
      break;
    }

    ancestors.push(parentTask);
    currentParentTaskId = parentTask.parent_task_id;
  }

  return ancestors;
}

function compareSiblingOrder(left: Task, right: Task) {
  if (left.sort_order !== right.sort_order) {
    return left.sort_order - right.sort_order;
  }

  if (left.created_at !== right.created_at) {
    return right.created_at.localeCompare(left.created_at);
  }

  return left.id.localeCompare(right.id);
}
