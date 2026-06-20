import { buildTaskHierarchyAdapter, type TaskHierarchyItem } from "@/lib/task-hierarchy";

export type TaskSiblingReorderDirection = "down" | "up";
export type TaskSiblingDropPlacement = "after" | "before";
export type TaskSiblingReorderInstruction =
  | TaskSiblingReorderDirection
  | {
      placement: TaskSiblingDropPlacement;
      targetTaskId: string;
    };

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
  instruction: TaskSiblingReorderInstruction,
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
  if (currentIndex < 0) {
    return { ok: false, reason: "boundary" };
  }

  const reordered = buildReorderedSiblings(siblings, currentIndex, instruction);
  if (!reordered) {
    return { ok: false, reason: "boundary" };
  }

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

function buildReorderedSiblings<TTask extends TaskHierarchyItem>(
  siblings: readonly TTask[],
  currentIndex: number,
  instruction: TaskSiblingReorderInstruction,
): TTask[] | null {
  if (typeof instruction === "string") {
    const targetIndex = instruction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= siblings.length) {
      return null;
    }

    const reordered = [...siblings];
    [reordered[currentIndex], reordered[targetIndex]] = [reordered[targetIndex]!, reordered[currentIndex]!];
    return reordered;
  }

  const currentTask = siblings[currentIndex];
  if (!currentTask) {
    return null;
  }

  const remainingSiblings = siblings.filter((sibling) => sibling.id !== currentTask.id);
  const targetIndex = remainingSiblings.findIndex((sibling) => sibling.id === instruction.targetTaskId);
  if (targetIndex < 0) {
    return null;
  }

  const insertIndex = instruction.placement === "before" ? targetIndex : targetIndex + 1;
  const reordered = [...remainingSiblings];
  reordered.splice(insertIndex, 0, currentTask);

  const orderChanged = reordered.some((sibling, index) => sibling.id !== siblings[index]?.id);
  return orderChanged ? reordered : null;
}
