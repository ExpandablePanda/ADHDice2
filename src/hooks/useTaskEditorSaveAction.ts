"use client";

import type { Dispatch, SetStateAction } from "react";
import type { Task, TaskUpdate } from "@/lib/database.types";
import type { TaskDraft, TaskSubtaskDraft } from "@/components/task-app/task-editor-model";
import type { TaskRowUpdateOptions, UpdateTaskRowResult } from "@/lib/task-db-mutations";
import { normalizeOpenTaskStatusForDueDate } from "@/lib/task-cockpit";
import { buildTaskUpdateConflictMessage } from "@/lib/task-db-mutations";
import { normalizeTaskPriorityFields } from "@/lib/task-priority";
import type { TaskRewardCandidate } from "@/lib/task-rewards";
import { shouldReconcileOverdueTaskMisses } from "@/lib/task-repeat";

type Message = {
  text: string;
  tone: "neutral" | "good" | "warn";
};

type SaveTaskEditorOptions = {
  focusToday?: boolean;
  linkedNoteIds?: string[];
  sortOrder?: number;
  subtasks?: TaskSubtaskDraft[];
  taskId?: string | null;
};

type InsertTaskRowResult = {
  data: Task | null;
  error: { message: string } | null;
  usedEnergyFallback: boolean;
};

type UseTaskEditorSaveActionOptions = {
  currentDayKey: string;
  focusedTaskIds: string[];
  onTasksCompleted: (candidates: TaskRewardCandidate[]) => Promise<void>;
  replaceTaskSubtasks: (taskId: string, subtasks: TaskSubtaskDraft[]) => Promise<{ saved: boolean; usedNestedFallback: boolean }>;
  reconcileOverdueTaskMisses: (task: Task) => Promise<boolean>;
  saveFocusSelection: (nextTaskIds: string[], validTaskIds?: Set<string> | Task[]) => Promise<void>;
  setMessage: Dispatch<SetStateAction<Message | null>>;
  setTasks: Dispatch<SetStateAction<Task[]>>;
  sortTasksForUi: (tasks: Task[]) => Task[];
  syncTaskHistoryEntry: (taskId: string, status: Task["status"]) => Promise<boolean>;
  syncTaskNoteLinks: (taskId: string, linkedNoteIds: string[]) => Promise<boolean>;
  tasks: Task[];
  updateTaskRowWithLegacyEnergyFallback: (taskId: string, values: TaskUpdate, options?: TaskRowUpdateOptions) => Promise<UpdateTaskRowResult>;
  insertTaskRowWithLegacyEnergyFallback: (payload: TaskDraft & { user_id: string; sort_order: number }) => Promise<InsertTaskRowResult>;
  currentUserId: string;
};

export function useTaskEditorSaveAction({
  currentDayKey,
  focusedTaskIds,
  insertTaskRowWithLegacyEnergyFallback,
  currentUserId,
  onTasksCompleted,
  replaceTaskSubtasks,
  reconcileOverdueTaskMisses,
  saveFocusSelection,
  setMessage,
  setTasks,
  sortTasksForUi,
  syncTaskHistoryEntry,
  syncTaskNoteLinks,
  tasks,
  updateTaskRowWithLegacyEnergyFallback,
}: UseTaskEditorSaveActionOptions) {
  async function saveTaskEditor(values: TaskDraft, options?: SaveTaskEditorOptions) {
    const focusToday = options?.focusToday ?? false;
    const linkedNoteIds = options?.linkedNoteIds ?? [];
    const sortOrder = options?.sortOrder ?? Date.now();
    const taskId = options?.taskId ?? null;
    const subtasks = options?.subtasks ?? [];
    const isEditing = Boolean(taskId);

    if (isEditing && taskId) {
      const previousTask = tasks.find((task) => task.id === taskId) ?? null;
      const normalizedUpdateValues = normalizeTaskPriorityFields({
        ...values,
        id: undefined,
      });
      const updateValues = previousTask && normalizedUpdateValues.due_on !== previousTask.due_on
        ? {
          ...normalizedUpdateValues,
          status: normalizeOpenTaskStatusForDueDate({
            due_on: normalizedUpdateValues.due_on ?? null,
            status: normalizedUpdateValues.status,
          }, currentDayKey),
        }
        : normalizedUpdateValues;
      const {
        conflict,
        data,
        error,
        usedEnergyFallback,
        usedActualSecondsFallback,
      } = await updateTaskRowWithLegacyEnergyFallback(taskId, updateValues, { expectedTask: previousTask });

      if (error) {
        setMessage({ tone: "warn", text: error.message });
        return null;
      }

      if (conflict) {
        if (conflict.latestTask) {
          setTasks((current) => sortTasksForUi(current.map((task) => task.id === taskId ? conflict.latestTask ?? task : task)));
        }
        setMessage({ tone: "warn", text: buildTaskUpdateConflictMessage(conflict) });
        return null;
      }

      if (!data) {
        setMessage({ tone: "warn", text: "Task saved, but Supabase did not return the updated task row." });
        return null;
      }

      const nextData = usedActualSecondsFallback && typeof updateValues.actual_seconds === "number"
        ? { ...data, actual_seconds: updateValues.actual_seconds }
        : data;

      setTasks((current) => sortTasksForUi(current.map((task) => task.id === taskId ? nextData : task)));

      if (shouldReconcileOverdueTaskMisses(nextData, currentDayKey)) {
        const historyReconciled = await reconcileOverdueTaskMisses(nextData);
        if (!historyReconciled) {
          return false;
        }
      }

      const historySaved = await syncTaskHistoryEntry(taskId, data.status);
      if (!historySaved) {
        return false;
      }

      const subtasksResult = await replaceTaskSubtasks(taskId, subtasks);
      if (!subtasksResult.saved) {
        return false;
      }

      const linkedNotesSaved = await syncTaskNoteLinks(taskId, linkedNoteIds);
      if (!linkedNotesSaved) {
        return false;
      }

      await onTasksCompleted([{ previousStatus: previousTask?.status ?? null, task: nextData }]);

      const nextFocusIds = focusToday
        ? Array.from(new Set([...focusedTaskIds, taskId]))
        : focusedTaskIds.filter((id) => id !== taskId);
      await saveFocusSelection(nextFocusIds);
      const usedAnyFallback = usedEnergyFallback || usedActualSecondsFallback || subtasksResult.usedNestedFallback;
      setMessage({
        tone: usedAnyFallback ? "warn" : "good",
        text: subtasksResult.usedNestedFallback
          ? "Your database is missing nested-subtask support, so subtasks were saved as a flat list. Run the subtask parent migration to enable nesting."
          : usedActualSecondsFallback
            ? "Manual time was saved, but your database is missing the task actual-time column. Run the actual-seconds migration to persist Actual Time on tasks."
            : usedEnergyFallback
              ? "Your database is missing the newer \"none\" energy level, so this task was saved with low energy instead. Run `supabase/add_task_energy_none.sql` to enable \"none\"."
            : "Task updated.",
      });
      return nextData;
    }

    const payload = normalizeTaskPriorityFields({
      ...values,
      user_id: currentUserId,
      sort_order: sortOrder,
    });
    const { data, error, usedEnergyFallback } = await insertTaskRowWithLegacyEnergyFallback(payload);

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return null;
    }

    if (data) {
      setTasks((current) => sortTasksForUi([...current, data]));
    }

    if (!data?.id) {
      setMessage({ tone: "warn", text: "Task saved, but the new task id was missing." });
      return null;
    }

    const historySaved = await syncTaskHistoryEntry(data.id, data.status);
    if (!historySaved) {
      return false;
    }

    const subtasksResult = await replaceTaskSubtasks(data.id, subtasks);
    if (!subtasksResult.saved) {
      return false;
    }

    const linkedNotesSaved = await syncTaskNoteLinks(data.id, linkedNoteIds);
    if (!linkedNotesSaved) {
      return false;
    }

    await onTasksCompleted([{ previousStatus: null, task: data }]);

    if (focusToday) {
      await saveFocusSelection(
        Array.from(new Set([...focusedTaskIds, data.id])),
        new Set([...tasks.map((currentTask) => currentTask.id), data.id]),
      );
    }

    const usedAnyFallback = usedEnergyFallback || subtasksResult.usedNestedFallback;
    setMessage({
      tone: usedAnyFallback ? "warn" : "good",
      text: subtasksResult.usedNestedFallback
        ? "Your database is missing nested-subtask support, so subtasks were saved as a flat list. Run the subtask parent migration to enable nesting."
        : usedEnergyFallback
          ? "Your database is missing the newer \"none\" energy level, so this task was saved with low energy instead. Run `supabase/add_task_energy_none.sql` to enable \"none\"."
          : "Task saved.",
    });
    return data;
  }

  return { saveTaskEditor };
}
