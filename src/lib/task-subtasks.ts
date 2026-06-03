"use client";

import type { TaskSubtask as DbTaskSubtask, TaskSubtaskStatus } from "@/lib/database.types";

export function isClosedSubtaskStatus(status: TaskSubtaskStatus) {
  return status === "done" || status === "did_my_best";
}

export function groupTaskSubtasksByTaskId(subtasks: DbTaskSubtask[]) {
  return subtasks.reduce<Record<string, DbTaskSubtask[]>>((accumulator, subtask) => {
    if (!accumulator[subtask.task_id]) {
      accumulator[subtask.task_id] = [];
    }
    accumulator[subtask.task_id].push(subtask);
    return accumulator;
  }, {});
}

export function mapTaskSubtaskRow(row: DbTaskSubtask) {
  return {
    ...row,
    parent_subtask_id: row.parent_subtask_id ?? null,
  };
}

export function getNextPendingSubtask(taskId: string, subtasksByTaskId: Record<string, DbTaskSubtask[]>) {
  return (subtasksByTaskId[taskId] ?? []).find((subtask) => !isClosedSubtaskStatus(subtask.status)) ?? null;
}
