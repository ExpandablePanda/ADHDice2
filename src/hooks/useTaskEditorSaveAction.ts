"use client";

import type { Dispatch, SetStateAction } from "react";
import type { Task, TaskHistory, TaskHistoryInsert, TaskUpdate } from "@/lib/database.types";
import type { TaskDraft, TaskSubtaskDraft } from "@/components/task-app/task-editor-model";
import type { TaskRowUpdateOptions, UpdateTaskRowResult } from "@/lib/task-db-mutations";
import { buildTaskUpdateConflictMessage } from "@/lib/task-db-mutations";
import { applyTaskActiveStatusTracking } from "@/lib/task-active-status";
import { normalizeTaskPriorityFields } from "@/lib/task-priority";
import type { TaskRewardCandidate } from "@/lib/task-rewards";
import { shouldReconcileOverdueTaskMisses } from "@/lib/task-repeat";
import { evaluateTaskActionAuthority, evaluateTaskScheduleAuthority } from "@/lib/task-state-engine/action-authority";
import { TASK_STATE_ENGINE_INTEGRATION_ENABLED } from "@/lib/task-state-engine/read-authority";

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
  dayStartTime: string;
  focusedTaskIds: string[];
  onTasksCompleted: (candidates: TaskRewardCandidate[]) => Promise<void>;
  replaceTaskSubtasks: (taskId: string, subtasks: TaskSubtaskDraft[]) => Promise<{ saved: boolean; usedNestedFallback: boolean }>;
  reconcileOverdueTaskMisses: (task: Task) => Promise<boolean>;
  saveFocusSelection: (nextTaskIds: string[], validTaskIds?: Set<string> | Task[]) => Promise<void>;
  setMessage: Dispatch<SetStateAction<Message | null>>;
  setTasks: Dispatch<SetStateAction<Task[]>>;
  sortTasksForUi: (tasks: Task[]) => Task[];
  syncTaskHistoryEntry: (taskId: string, status: Task["status"], occurrenceTask?: Task | null, options?: { historyEntry?: TaskHistoryInsert }) => Promise<boolean>;
  syncTaskHistoryEntries?: (taskId: string, status: Task["status"], entryDates: string[], options?: { historyEntries?: TaskHistoryInsert[] }) => Promise<boolean>;
  syncTaskNoteLinks: (taskId: string, linkedNoteIds: string[]) => Promise<boolean>;
  taskHistory?: TaskHistory[];
  tasks: Task[];
  loadTaskHistoryForTasks?: (taskIds: string[]) => Promise<Record<string, TaskHistory[]>>;
  logicalDayNow?: Date | string;
  timezone: string;
  updateTaskRowWithLegacyEnergyFallback: (taskId: string, values: TaskUpdate, options?: TaskRowUpdateOptions) => Promise<UpdateTaskRowResult>;
  insertTaskRowWithLegacyEnergyFallback: (payload: TaskDraft & { user_id: string; sort_order: number }) => Promise<InsertTaskRowResult>;
  currentUserId: string;
};

export function useTaskEditorSaveAction({
  currentDayKey,
  dayStartTime = "00:00",
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
  syncTaskHistoryEntries,
  syncTaskNoteLinks,
  taskHistory = [],
  tasks,
  loadTaskHistoryForTasks,
  logicalDayNow = `${currentDayKey}T12:00:00.000Z`,
  timezone = "UTC",
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
      const dueDateChanged = Boolean(
        previousTask
        && normalizedUpdateValues.due_on !== previousTask.due_on,
      );
      const statusChanged = Boolean(
        previousTask
        && normalizedUpdateValues.status !== undefined
        && normalizedUpdateValues.status !== previousTask.status,
      );
      const scheduleChanged = Boolean(previousTask && (
        dueDateChanged
        || Object.hasOwn(normalizedUpdateValues, "due_time") && normalizedUpdateValues.due_time !== previousTask.due_time
        || ["repeat_frequency", "repeat_interval", "repeat_days_of_week", "repeat_day_of_month", "repeat_monthly_mode", "repeat_monthly_ordinal", "repeat_monthly_weekday"]
          .some((field) => Object.hasOwn(normalizedUpdateValues, field) && normalizedUpdateValues[field as keyof TaskUpdate] !== previousTask[field as keyof Task])
      ));
      const scheduleOnlyEdit = scheduleChanged && !statusChanged;
      const scopedHistory = loadTaskHistoryForTasks
        ? (await loadTaskHistoryForTasks([taskId]))[taskId] ?? []
        : taskHistory.filter((entry) => entry.task_id === taskId);
      const outcome = statusChanged && ["done", "did_my_best", "missed", "delayed", "complete"].includes(String(normalizedUpdateValues.status))
        ? normalizedUpdateValues.status as "done" | "did_my_best" | "missed" | "delayed" | "complete"
        : null;
      const actionAuthority = previousTask && outcome
        ? evaluateTaskActionAuthority({
          history: scopedHistory,
          logicalDayRollover: dayStartTime,
          now: logicalDayNow,
          outcome,
          task: previousTask,
          timezone,
        })
        : null;
      const scheduleAuthority = previousTask && scheduleOnlyEdit
        ? evaluateTaskScheduleAuthority({
          history: scopedHistory,
          logicalDayRollover: dayStartTime,
          now: logicalDayNow,
          proposedTask: { ...previousTask, ...normalizedUpdateValues } as Task,
          task: previousTask,
          timezone,
        })
        : null;
      const authorityUpdate = actionAuthority?.mutationPlan.taskUpdate ?? scheduleAuthority?.mutationPlan.taskUpdate;
      const dueNormalizedValues = authorityUpdate
        ? { ...normalizedUpdateValues, ...authorityUpdate }
        : normalizedUpdateValues;
      const updateValues = previousTask
        ? (scheduleOnlyEdit || actionAuthority) ? dueNormalizedValues : applyTaskActiveStatusTracking(previousTask, dueNormalizedValues, currentDayKey)
        : dueNormalizedValues;
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

      if (!scheduleOnlyEdit && !actionAuthority && shouldReconcileOverdueTaskMisses(nextData, currentDayKey)) {
        const historyReconciled = await reconcileOverdueTaskMisses(nextData);
        if (!historyReconciled) {
          return false;
        }
      }

      // A due-date edit changes only the next scheduling cursor. It must not
      // turn the normalized open status into a History delete or replacement.
      if (!scheduleOnlyEdit && statusChanged) {
        const historyEntries = actionAuthority?.mutationPlan.historyInserts;
        const historySaved = historyEntries?.length && syncTaskHistoryEntries
          ? await syncTaskHistoryEntries(taskId, data.status, historyEntries.map((entry) => entry.entry_date), { historyEntries })
          : await syncTaskHistoryEntry(taskId, data.status, previousTask ?? nextData, historyEntries?.[0]
            ? { historyEntry: historyEntries[0] }
            : undefined);
        if (!historySaved) {
          return false;
        }
      }

      const subtasksResult = await replaceTaskSubtasks(taskId, subtasks);
      if (!subtasksResult.saved) {
        return false;
      }

      const linkedNotesSaved = await syncTaskNoteLinks(taskId, linkedNoteIds);
      if (!linkedNotesSaved) {
        return false;
      }

      if (!scheduleOnlyEdit) {
        await onTasksCompleted([{
          // A future due-date edit on an already successful recurring task is a
          // manual anchor, not another completion to finalize.
          engineManaged: Boolean(actionAuthority),
          forceRecurringFinalization: !TASK_STATE_ENGINE_INTEGRATION_ENABLED
            && (values.status === "done" || values.status === "did_my_best")
            && values.status !== previousTask?.status,
          previousStatus: previousTask?.status ?? null,
          rewardEligible: actionAuthority?.rewardEligibility.eligible,
          task: nextData,
        }]);
      }

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

    const historySaved = await syncTaskHistoryEntry(data.id, data.status, data);
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
