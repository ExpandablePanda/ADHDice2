"use client";

import type { Dispatch, SetStateAction } from "react";
import type { BatchTaskEditDraft } from "@/components/task-app/task-batch-edit-modal";
import type { Task, TaskStatus, TaskUpdate } from "@/lib/database.types";
import type { TaskRoutingBucket } from "@/lib/task-buckets";
import { normalizeOpenTaskStatusForDueDate } from "@/lib/task-cockpit";
import { buildTaskPriorityUpdate } from "@/lib/task-priority";
import type { TaskRewardCandidate } from "@/lib/task-rewards";

type Message = {
  text: string;
  tone: "neutral" | "good" | "warn";
};

type UpdateTaskRowResult = {
  data: Task | null;
  error: { message: string } | null;
  usedActualSecondsFallback: boolean;
  usedEnergyFallback: boolean;
};

type UseTaskBatchEditActionOptions = {
  clearListTaskSelection: () => void;
  currentDayKey: string;
  focusedTaskIds: string[];
  onTasksCompleted: (candidates: TaskRewardCandidate[]) => Promise<void>;
  parseDayOfMonth: (value: string) => number | null;
  parsePositiveInteger: (value: string) => number | null;
  routeTask: (taskId: string, bucket: TaskRoutingBucket | null) => void;
  saveFocusSelection: (nextTaskIds: string[], validTaskIds?: Set<string> | Task[]) => Promise<void>;
  selectedListTasks: Task[];
  setIsBatchEditModalOpen: Dispatch<SetStateAction<boolean>>;
  setMessage: Dispatch<SetStateAction<Message | null>>;
  setTasks: Dispatch<SetStateAction<Task[]>>;
  sortTasksForUi: (tasks: Task[]) => Task[];
  syncTaskHistoryEntry: (taskId: string, status: TaskStatus) => Promise<boolean>;
  tasks: Task[];
  updateTaskRowWithLegacyEnergyFallback: (taskId: string, values: TaskUpdate) => Promise<UpdateTaskRowResult>;
};

export function useTaskBatchEditAction({
  clearListTaskSelection,
  currentDayKey,
  focusedTaskIds,
  onTasksCompleted,
  parseDayOfMonth,
  parsePositiveInteger,
  routeTask,
  saveFocusSelection,
  selectedListTasks,
  setIsBatchEditModalOpen,
  setMessage,
  setTasks,
  sortTasksForUi,
  syncTaskHistoryEntry,
  tasks,
  updateTaskRowWithLegacyEnergyFallback,
}: UseTaskBatchEditActionOptions) {
  async function applyBatchTaskEdit(draft: BatchTaskEditDraft) {
    if (selectedListTasks.length === 0) {
      return;
    }

    let nextTasks = tasks;
    let successfulCount = 0;
    let fallbackCount = 0;
    let firstErrorMessage: string | null = null;
    const nextFocusedTaskIds = new Set(focusedTaskIds);
    const completedCandidates: TaskRewardCandidate[] = [];

    for (const task of selectedListTasks) {
      const updateValues: TaskUpdate = {};

      if (draft.status !== "unchanged") {
        updateValues.status = draft.status;
        updateValues.completed_at = draft.status === "done" || draft.status === "did_my_best"
          ? task.completed_at ?? new Date().toISOString()
          : null;
      }

      if (draft.priority !== "unchanged") {
        Object.assign(updateValues, buildTaskPriorityUpdate(Number.parseInt(draft.priority, 10) as 0 | 1 | 2 | 3 | 4 | 5));
      }

      if (draft.energy !== "unchanged") {
        updateValues.energy = draft.energy;
      }

      if (draft.dueOnMode === "set") {
        updateValues.due_on = draft.dueOn.trim() || null;
      } else if (draft.dueOnMode === "clear") {
        updateValues.due_on = null;
      }

      if (draft.dueOnMode !== "unchanged") {
        updateValues.status = normalizeOpenTaskStatusForDueDate({
          due_on: updateValues.due_on ?? task.due_on,
          status: (updateValues.status ?? task.status) as TaskStatus,
        }, currentDayKey);
      }

      if (draft.estimatedMinutesMode === "set") {
        updateValues.estimated_minutes = parsePositiveInteger(draft.estimatedMinutes);
      } else if (draft.estimatedMinutesMode === "clear") {
        updateValues.estimated_minutes = null;
      }

      if (draft.tagsMode === "replace") {
        updateValues.tags = draft.tags;
      } else if (draft.tagsMode === "clear") {
        updateValues.tags = [];
      }

      if (draft.oneStepAtATime !== "unchanged") {
        updateValues.one_step_at_a_time = draft.oneStepAtATime === "true";
      }

      if (draft.subtasksAutoReset !== "unchanged") {
        updateValues.subtasks_auto_reset = draft.subtasksAutoReset === "true";
      }

      if (draft.repeatFrequency !== "unchanged") {
        updateValues.repeat_frequency = draft.repeatFrequency;
        updateValues.repeat_interval = draft.repeatFrequency === "none"
          ? 1
          : Math.max(1, parsePositiveInteger(draft.repeatInterval) ?? 1);
        updateValues.repeat_days_of_week = draft.repeatFrequency === "weekly" || draft.repeatFrequency === "custom"
          ? [...draft.repeatDaysOfWeek].sort((left, right) => left - right)
          : [];
        updateValues.repeat_day_of_month = draft.repeatFrequency === "monthly" || draft.repeatFrequency === "custom"
          ? parseDayOfMonth(draft.repeatDayOfMonth)
          : null;
      }

      if (Object.keys(updateValues).length === 0) {
        successfulCount += 1;
        if (draft.route === "clear") {
          routeTask(task.id, null);
        } else if (draft.route === "focus") {
          routeTask(task.id, "today");
        } else if (draft.route !== "unchanged") {
          routeTask(task.id, draft.route);
        }

        if (draft.route === "focus") {
          nextFocusedTaskIds.add(task.id);
        } else if (draft.focusToday === "true") {
          nextFocusedTaskIds.add(task.id);
        } else if (draft.focusToday === "false") {
          nextFocusedTaskIds.delete(task.id);
        }
        continue;
      }

      const { data, error, usedEnergyFallback } = await updateTaskRowWithLegacyEnergyFallback(task.id, updateValues);

      if (error) {
        firstErrorMessage ??= error.message;
        continue;
      }

      if (!data) {
        firstErrorMessage ??= `Task "${task.title}" updated, but no task row came back from Supabase.`;
        continue;
      }

      nextTasks = nextTasks.map((currentTask) => currentTask.id === task.id ? data : currentTask);
      successfulCount += 1;
      if (usedEnergyFallback) {
        fallbackCount += 1;
      }

      if (data.status === "done" || data.status === "did_my_best" || data.status === "complete" || data.status === "archived" || data.status === "trashed") {
        routeTask(task.id, null);
      }

      const historySaved = await syncTaskHistoryEntry(task.id, data.status);
      if (!historySaved) {
        firstErrorMessage ??= `Task "${data.title}" was updated, but its history entry could not be saved.`;
        continue;
      }
      completedCandidates.push({ previousStatus: task.status, task: data });

      if (draft.route !== "unchanged" && draft.status !== "done" && draft.status !== "did_my_best") {
        if (draft.route === "clear") {
          routeTask(task.id, null);
        } else if (draft.route === "focus") {
          routeTask(task.id, "today");
        } else {
          routeTask(task.id, draft.route);
        }
      }

      if (draft.route === "focus") {
        nextFocusedTaskIds.add(task.id);
      } else if (draft.focusToday === "true") {
        nextFocusedTaskIds.add(task.id);
      } else if (draft.focusToday === "false") {
        nextFocusedTaskIds.delete(task.id);
      }
    }

    if (successfulCount === 0) {
      setMessage({ tone: "warn", text: firstErrorMessage ?? "No selected tasks were updated." });
      return;
    }

    setTasks(sortTasksForUi(nextTasks));
    await onTasksCompleted(completedCandidates);
    if (draft.route === "focus" || draft.focusToday !== "unchanged") {
      await saveFocusSelection([...nextFocusedTaskIds], new Set(nextTasks.map((task) => task.id)));
    }

    clearListTaskSelection();
    setIsBatchEditModalOpen(false);

    if (firstErrorMessage) {
      setMessage({
        tone: "warn",
        text: fallbackCount > 0
          ? `Updated ${successfulCount} task${successfulCount === 1 ? "" : "s"}, but some changes failed and ${fallbackCount} task${fallbackCount === 1 ? "" : "s"} used the legacy low-energy fallback. ${firstErrorMessage}`
          : `Updated ${successfulCount} task${successfulCount === 1 ? "" : "s"}, but some changes failed. ${firstErrorMessage}`,
      });
      return;
    }

    if (fallbackCount > 0) {
      setMessage({
        tone: "warn",
        text: `Updated ${successfulCount} task${successfulCount === 1 ? "" : "s"}. ${fallbackCount} task${fallbackCount === 1 ? "" : "s"} used low energy because your database is missing the newer "none" energy level. Run \`supabase/add_task_energy_none.sql\` to enable "none".`,
      });
      return;
    }

    setMessage({ tone: "good", text: `Updated ${successfulCount} task${successfulCount === 1 ? "" : "s"}.` });
  }

  return { applyBatchTaskEdit };
}
