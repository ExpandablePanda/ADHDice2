import { buildTaskHierarchyAdapter, type TaskHierarchyItem } from "@/lib/task-hierarchy";

export type TaskSiblingReorderDirection = "down" | "up";

export type TaskSiblingSortOrderUpdate = {
  id: string;
  sortOrder: number;
};

export type TaskSiblingReorderPlan =
  | {
      ok: true;
      orderedTaskIds: string[];
      parentTaskId: string;
      updates: TaskSiblingSortOrderUpdate[];
    }
  | {
      ok: false;
      reason: "boundary" | "invalid_hierarchy" | "not_child" | "task_not_found";
    };

export function buildTaskSiblingReorderPlan<TTask extends TaskHierarchyItem>(
  tasks: readonly TTask[],
  taskId: string,
  direction: TaskSiblingReorderDirection,
): TaskSiblingReorderPlan {
  const adapter = buildTaskHierarchyAdapter(tasks);
  const task = adapter.taskById.get(taskId);

  if (!task) {
    return { ok: false, reason: "task_not_found" };
  }
  if (task.parent_task_id === null) {
    return { ok: false, reason: "not_child" };
  }
  if (adapter.invalidTaskIds.has(taskId)) {
    return { ok: false, reason: "invalid_hierarchy" };
  }

  const taskDepth = adapter.getDepth(taskId);
  const siblings = adapter.getChildren(task.parent_task_id);
  if (taskDepth === null || siblings.some((sibling) => adapter.getDepth(sibling.id) !== taskDepth)) {
    return { ok: false, reason: "invalid_hierarchy" };
  }

  const currentIndex = siblings.findIndex((sibling) => sibling.id === taskId);
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= siblings.length) {
    return { ok: false, reason: "boundary" };
  }

  const reordered = [...siblings];
  [reordered[currentIndex], reordered[targetIndex]] = [reordered[targetIndex]!, reordered[currentIndex]!];
  const updates = reordered.flatMap((sibling, index) => {
    const sortOrder = index + 1;
    return sibling.sort_order === sortOrder ? [] : [{ id: sibling.id, sortOrder }];
  });

  return {
    ok: true,
    orderedTaskIds: reordered.map((sibling) => sibling.id),
    parentTaskId: task.parent_task_id,
    updates,
  };
}
