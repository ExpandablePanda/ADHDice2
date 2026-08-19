"use client";

import type { Task, TaskStatus } from "@/lib/database.types";

export function isClosedSubtaskStatus(status: TaskStatus) {
  return status === "done" || status === "did_my_best";
}

export function groupTaskSubtasksByTaskId(tasks: Task[]) {
  return tasks.reduce<Record<string, Task[]>>((accumulator, task) => {
    if (!task.parent_task_id) return accumulator;
    if (!accumulator[task.parent_task_id]) {
      accumulator[task.parent_task_id] = [];
    }
    accumulator[task.parent_task_id].push(task);
    return accumulator;
  }, {});
}

export function getNextPendingSubtask(taskId: string, subtasksByTaskId: Record<string, Task[]>) {
  return (subtasksByTaskId[taskId] ?? []).find((subtask) => !isClosedSubtaskStatus(subtask.status)) ?? null;
}
