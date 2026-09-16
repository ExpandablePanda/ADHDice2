export type TaskMoveDeleteResult<TDeleteResult> = {
  deleteAttempted: boolean;
  deleteResult: TDeleteResult | null;
  deleted: boolean;
  failedTaskId: string | null;
  movedTaskIds: string[];
};

export async function moveAssignedTasksToTaskAndDeleteRuleset<TDeleteResult extends boolean | { ok: boolean }>({
  taskIds,
  moveTask,
  deleteRuleset,
}: {
  deleteRuleset: () => Promise<TDeleteResult>;
  moveTask: (taskId: string) => Promise<boolean>;
  taskIds: readonly string[];
}): Promise<TaskMoveDeleteResult<TDeleteResult>> {
  const movedTaskIds: string[] = [];
  for (const taskId of Array.from(new Set(taskIds))) {
    let moved = false;
    try {
      moved = await moveTask(taskId);
    } catch {
      moved = false;
    }
    if (!moved) {
      return {
        deleteAttempted: false,
        deleteResult: null,
        deleted: false,
        failedTaskId: taskId,
        movedTaskIds,
      };
    }
    movedTaskIds.push(taskId);
  }

  const deleteResult = await deleteRuleset();
  return {
    deleteAttempted: true,
    deleteResult,
    deleted: typeof deleteResult === "boolean" ? deleteResult : deleteResult.ok,
    failedTaskId: null,
    movedTaskIds,
  };
}
