import type { Task } from "@/lib/database.types";

export type TaskHierarchyItem = {
  created_at?: string | null;
  id: string;
  parent_task_id: string | null;
  sort_order?: number | null;
  title?: string | null;
};

export type TaskTreeNode = {
  children: TaskTreeNode[];
  task: Task;
};

export type TaskHierarchyNode<TTask extends TaskHierarchyItem> = {
  children: Array<TaskHierarchyNode<TTask>>;
  depth: number;
  issueTypes: TaskHierarchyIssue["type"][];
  parentTaskId: string | null;
  task: TTask;
};

type CircularTaskHierarchyIssue = {
  parentTaskId: string;
  taskId: string;
  type: "circular_parent";
  viaTaskIds: string[];
};

type MissingParentTaskHierarchyIssue = {
  parentTaskId: string;
  taskId: string;
  type: "missing_parent";
};

type SelfParentTaskHierarchyIssue = {
  parentTaskId: string;
  taskId: string;
  type: "self_parent";
};

export type TaskHierarchyIssue =
  | CircularTaskHierarchyIssue
  | MissingParentTaskHierarchyIssue
  | SelfParentTaskHierarchyIssue;

export type TaskHierarchyCycle<TTask extends TaskHierarchyItem> = {
  parentTaskId: string;
  taskId: string;
  taskIds: string[];
  tasks: TTask[];
};

export type TaskHierarchyOrphan<TTask extends TaskHierarchyItem> = {
  missingParentTaskId: string;
  task: TTask;
  taskId: string;
};

export type TaskHierarchyAdapter<TTask extends TaskHierarchyItem> = {
  childTaskIds: string[];
  childTasks: TTask[];
  childrenByParentId: Map<string, TTask[]>;
  cycleTaskIds: Set<string>;
  cycles: Array<TaskHierarchyCycle<TTask>>;
  depthByTaskId: Map<string, number | null>;
  getChildren(parentTaskId: string): TTask[];
  getDepth(taskId: string): number | null;
  getDescendants(taskId: string): TTask[];
  getNode(taskId: string): TaskHierarchyNode<TTask> | null;
  getParent(taskId: string): TTask | null;
  getParentChain(taskId: string): TTask[];
  invalidTaskIds: Set<string>;
  invalidTasks: TTask[];
  issues: TaskHierarchyIssue[];
  issuesByTaskId: Map<string, TaskHierarchyIssue[]>;
  nodesByTaskId: Map<string, TaskHierarchyNode<TTask>>;
  orphanTaskIds: string[];
  orphanTasks: TTask[];
  orphans: Array<TaskHierarchyOrphan<TTask>>;
  parentByTaskId: Map<string, TTask | null>;
  parentChainByTaskId: Map<string, TTask[]>;
  parentTaskIdByTaskId: Map<string, string | null>;
  rawChildrenByParentId: Map<string, TTask[]>;
  rootNodes: Array<TaskHierarchyNode<TTask>>;
  taskById: Map<string, TTask>;
  topLevelTaskIds: string[];
  topLevelTasks: TTask[];
  validChildTaskIds: string[];
  validChildTasks: TTask[];
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
  return detectTaskHierarchyIssuesForItems(tasks);
}

export function buildTaskHierarchyAdapter<TTask extends TaskHierarchyItem>(
  tasks: readonly TTask[],
): TaskHierarchyAdapter<TTask> {
  const indexedTasks = tasks.map((task, originalIndex) => ({ originalIndex, task }));
  const originalIndexByTaskId = new Map(indexedTasks.map(({ originalIndex, task }) => [task.id, originalIndex]));
  const taskById = new Map(indexedTasks.map(({ task }) => [task.id, task]));
  const issues = detectTaskHierarchyIssuesForItems(tasks);
  const issuesByTaskId = new Map<string, TaskHierarchyIssue[]>();

  for (const issue of issues) {
    const taskIssues = issuesByTaskId.get(issue.taskId) ?? [];
    taskIssues.push(issue);
    issuesByTaskId.set(issue.taskId, taskIssues);
  }

  const invalidTaskIds = new Set(issues.map((issue) => issue.taskId));
  const invalidTasks = sortHierarchySiblings(
    tasks.filter((task) => invalidTaskIds.has(task.id)),
    originalIndexByTaskId,
  );
  const orphans = issues
    .filter((issue): issue is Extract<TaskHierarchyIssue, { type: "missing_parent" }> => issue.type === "missing_parent")
    .map((issue) => {
      const task = taskById.get(issue.taskId);
      return task
        ? { missingParentTaskId: issue.parentTaskId, task, taskId: issue.taskId }
        : null;
    })
    .filter((orphan): orphan is TaskHierarchyOrphan<TTask> => orphan !== null);
  const orphanTaskIds = orphans.map((orphan) => orphan.taskId);
  const orphanTasks = sortHierarchySiblings(orphans.map((orphan) => orphan.task), originalIndexByTaskId);
  const cycles = issues
    .filter((issue): issue is Extract<TaskHierarchyIssue, { type: "circular_parent" }> => issue.type === "circular_parent")
    .map((issue) => ({
      parentTaskId: issue.parentTaskId,
      taskId: issue.taskId,
      taskIds: issue.viaTaskIds,
      tasks: issue.viaTaskIds.map((taskId) => taskById.get(taskId)).filter((task): task is TTask => Boolean(task)),
    }));
  const cycleTaskIds = new Set(cycles.flatMap((cycle) => cycle.taskIds));

  const topLevelTasks = sortHierarchySiblings(
    tasks.filter((task) => task.parent_task_id === null),
    originalIndexByTaskId,
  );
  const topLevelTaskIds = topLevelTasks.map((task) => task.id);
  const childTasks = sortHierarchySiblings(
    tasks.filter((task) => task.parent_task_id !== null),
    originalIndexByTaskId,
  );
  const childTaskIds = childTasks.map((task) => task.id);
  const validChildTasks = sortHierarchySiblings(
    childTasks.filter((task) => !invalidTaskIds.has(task.id) && task.parent_task_id !== null && taskById.has(task.parent_task_id)),
    originalIndexByTaskId,
  );
  const validChildTaskIds = validChildTasks.map((task) => task.id);

  const parentTaskIdByTaskId = new Map<string, string | null>();
  const parentByTaskId = new Map<string, TTask | null>();
  const rawChildrenByParentId = new Map<string, TTask[]>();
  const childrenByParentId = new Map<string, TTask[]>();

  for (const task of tasks) {
    parentTaskIdByTaskId.set(task.id, task.parent_task_id);
    parentByTaskId.set(task.id, task.parent_task_id ? taskById.get(task.parent_task_id) ?? null : null);

    if (task.parent_task_id !== null) {
      const rawSiblings = rawChildrenByParentId.get(task.parent_task_id) ?? [];
      rawSiblings.push(task);
      rawChildrenByParentId.set(task.parent_task_id, rawSiblings);
    }
  }

  for (const [parentTaskId, siblings] of rawChildrenByParentId.entries()) {
    rawChildrenByParentId.set(parentTaskId, sortHierarchySiblings(siblings, originalIndexByTaskId));

    if (!taskById.has(parentTaskId) || invalidTaskIds.has(parentTaskId)) {
      continue;
    }

    const validSiblings = siblings.filter((task) => !invalidTaskIds.has(task.id));
    if (validSiblings.length > 0) {
      childrenByParentId.set(parentTaskId, sortHierarchySiblings(validSiblings, originalIndexByTaskId));
    }
  }

  const depthByTaskId = new Map<string, number | null>();
  const nodesByTaskId = new Map<string, TaskHierarchyNode<TTask>>();
  const parentChainByTaskId = new Map<string, TTask[]>();

  function createNode(task: TTask, depth: number, parentChain: TTask[]): TaskHierarchyNode<TTask> {
    depthByTaskId.set(task.id, depth);
    parentChainByTaskId.set(task.id, parentChain);

    const node: TaskHierarchyNode<TTask> = {
      children: [],
      depth,
      issueTypes: (issuesByTaskId.get(task.id) ?? []).map((issue) => issue.type),
      parentTaskId: task.parent_task_id,
      task,
    };
    nodesByTaskId.set(task.id, node);

    node.children = (childrenByParentId.get(task.id) ?? [])
      .map((child) => createNode(child, depth + 1, [task, ...parentChain]));

    return node;
  }

  const validRootNodes = topLevelTasks
    .filter((task) => !invalidTaskIds.has(task.id))
    .map((task) => createNode(task, 0, []));
  const invalidRootNodes = invalidTasks.map((task) => {
    depthByTaskId.set(task.id, null);
    parentChainByTaskId.set(task.id, []);
    const node: TaskHierarchyNode<TTask> = {
      children: [],
      depth: 0,
      issueTypes: (issuesByTaskId.get(task.id) ?? []).map((issue) => issue.type),
      parentTaskId: task.parent_task_id,
      task,
    };
    nodesByTaskId.set(task.id, node);
    return node;
  });
  const rootNodes = sortHierarchyNodes([...validRootNodes, ...invalidRootNodes], originalIndexByTaskId);

  function getDescendants(taskId: string) {
    const descendants: TTask[] = [];

    function visit(parentTaskId: string) {
      for (const child of childrenByParentId.get(parentTaskId) ?? []) {
        descendants.push(child);
        visit(child.id);
      }
    }

    visit(taskId);
    return descendants;
  }

  return {
    childTaskIds,
    childTasks,
    childrenByParentId,
    cycleTaskIds,
    cycles,
    depthByTaskId,
    getChildren: (parentTaskId) => childrenByParentId.get(parentTaskId) ?? [],
    getDepth: (taskId) => depthByTaskId.get(taskId) ?? null,
    getDescendants,
    getNode: (taskId) => nodesByTaskId.get(taskId) ?? null,
    getParent: (taskId) => parentByTaskId.get(taskId) ?? null,
    getParentChain: (taskId) => parentChainByTaskId.get(taskId) ?? [],
    invalidTaskIds,
    invalidTasks,
    issues,
    issuesByTaskId,
    nodesByTaskId,
    orphanTaskIds,
    orphanTasks,
    orphans,
    parentByTaskId,
    parentChainByTaskId,
    parentTaskIdByTaskId,
    rawChildrenByParentId,
    rootNodes,
    taskById,
    topLevelTaskIds,
    topLevelTasks,
    validChildTaskIds,
    validChildTasks,
  };
}

function detectTaskHierarchyIssuesForItems(tasks: readonly TaskHierarchyItem[]) {
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

function sortHierarchySiblings<TTask extends TaskHierarchyItem>(
  tasks: readonly TTask[],
  originalIndexByTaskId: Map<string, number>,
) {
  return [...tasks].sort((left, right) => compareHierarchySiblingOrder(left, right, originalIndexByTaskId));
}

function sortHierarchyNodes<TTask extends TaskHierarchyItem>(
  nodes: Array<TaskHierarchyNode<TTask>>,
  originalIndexByTaskId: Map<string, number>,
) {
  return [...nodes].sort((left, right) => compareHierarchySiblingOrder(left.task, right.task, originalIndexByTaskId));
}

function compareHierarchySiblingOrder<TTask extends TaskHierarchyItem>(
  left: TTask,
  right: TTask,
  originalIndexByTaskId: Map<string, number>,
) {
  const leftSortOrder = typeof left.sort_order === "number" ? left.sort_order : Number.POSITIVE_INFINITY;
  const rightSortOrder = typeof right.sort_order === "number" ? right.sort_order : Number.POSITIVE_INFINITY;
  if (leftSortOrder !== rightSortOrder) {
    return leftSortOrder - rightSortOrder;
  }

  const leftTitle = left.title?.trim() ?? "";
  const rightTitle = right.title?.trim() ?? "";
  if (leftTitle || rightTitle) {
    const titleComparison = leftTitle.localeCompare(rightTitle, undefined, { sensitivity: "base" });
    if (titleComparison !== 0) {
      return titleComparison;
    }
  }

  if (left.id !== right.id) {
    return left.id.localeCompare(right.id);
  }

  return (originalIndexByTaskId.get(left.id) ?? 0) - (originalIndexByTaskId.get(right.id) ?? 0);
}
