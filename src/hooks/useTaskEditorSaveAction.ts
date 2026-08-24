"use client";

import type { Dispatch, SetStateAction } from "react";
import type { Task, TaskHistory, TaskHistoryActionInput, TaskUpdate } from "@/lib/database.types";
import type { TaskDraft, TaskSubtaskDraft } from "@/components/task-app/task-editor-model";
import type { CanonicalTaskCreator, TaskRowUpdateOptions, UpdateTaskRowResult } from "@/lib/task-db-mutations";
import { buildTaskUpdateConflictMessage } from "@/lib/task-db-mutations";
import { applyTaskActiveStatusTracking } from "@/lib/task-active-status";
import { normalizeTaskPriorityFields } from "@/lib/task-priority";
import type { TaskRewardCandidate } from "@/lib/task-rewards";
import { evaluateTaskActionAuthority, evaluateTaskScheduleAuthority, hasTaskScheduleChange, isOccurrenceSensitiveTaskMutation, stripStatusFromScheduleIntent } from "@/lib/task-state-engine/action-authority";
import type { TaskHistoryLoadMap } from "@/lib/task-history";
import { isTaskStateRuntimeLifecycleTransition, TASK_METADATA_UPDATE_FIELDS, TASK_STATE_OWNED_UPDATE_FIELDS } from "@/lib/task-state-runtime-actions";
import { mergeTaskWithCanonicalScheduleProjection } from "@/lib/task-state-canonical/schedule-projection";

type Message = {
  text: string;
  tone: "neutral" | "good" | "warn";
};

function taskEditFailureMessage(reason: string) {
  const detail = reason.trim() || "The persistence request failed.";
  return `Task wasn't updated: ${detail}`;
}

function taskCommitReconciliationFailureMessage(reason?: string) {
  const detail = reason?.trim();
  return `Task was saved, but ADHDice couldn't refresh the updated Task state. Refresh before editing it again.${detail ? ` ${detail}` : ""}`;
}

type SaveTaskEditorOptions = {
  focusToday?: boolean;
  linkedNoteIds?: string[];
  sortOrder?: number;
  subtasks?: TaskSubtaskDraft[];
  taskId?: string | null;
};

type UseTaskEditorSaveActionOptions = {
  canonicalTaskCreator?: CanonicalTaskCreator;
  canonicalTaskStateUpdate?: (taskId: string, values: TaskUpdate, options?: { manualAction?: "unscheduled_status" }) => Promise<boolean>;
  currentDayKey: string;
  dayStartTime: string;
  focusedTaskIds: string[];
  onTasksCompleted: (candidates: TaskRewardCandidate[]) => Promise<void>;
  onTaskHistoryMutation?: (taskId: string, taskHistory: TaskHistory[], nextTask?: Task) => void | Promise<void>;
  replaceTaskSubtasks: (taskId: string, subtasks: TaskSubtaskDraft[]) => Promise<{ saved: boolean }>;
  saveFocusSelection: (nextTaskIds: string[], validTaskIds?: Set<string> | Task[]) => Promise<void>;
  setMessage: Dispatch<SetStateAction<Message | null>>;
  setTasks: Dispatch<SetStateAction<Task[]>>;
  sortTasksForUi: (tasks: Task[]) => Task[];
  syncTaskHistoryEntry: (taskId: string, status: Task["status"], occurrenceTask?: Task | null, options?: { historyEntry?: TaskHistoryActionInput; historySnapshot?: TaskHistory[] }) => Promise<boolean>;
  syncTaskHistoryEntries?: (taskId: string, status: Task["status"], entryDates: string[], options?: { historyEntries?: TaskHistoryActionInput[]; historySnapshot?: TaskHistory[] }) => Promise<boolean>;
  syncTaskNoteLinks: (taskId: string, linkedNoteIds: string[]) => Promise<boolean>;
  taskHistory?: TaskHistory[];
  tasks: Task[];
  loadTaskHistoryForTasks?: (taskIds: string[]) => Promise<TaskHistoryLoadMap>;
  logicalDayNow?: Date | string;
  timezone: string;
  updateTaskRowWithLegacyEnergyFallback: (taskId: string, values: TaskUpdate, options?: TaskRowUpdateOptions) => Promise<UpdateTaskRowResult>;
  currentUserId: string;
};

export function useTaskEditorSaveAction({
  canonicalTaskCreator,
  canonicalTaskStateUpdate,
  currentDayKey,
  dayStartTime = "00:00",
  focusedTaskIds,
  currentUserId,
  onTasksCompleted,
  onTaskHistoryMutation,
  replaceTaskSubtasks,
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
      const statusChanged = Boolean(
        previousTask
        && normalizedUpdateValues.status !== undefined
        && normalizedUpdateValues.status !== previousTask.status,
      );
      if (
        previousTask
        && normalizedUpdateValues.status !== undefined
        && isTaskStateRuntimeLifecycleTransition(previousTask, normalizedUpdateValues.status)
      ) {
        setMessage({ tone: "warn", text: taskEditFailureMessage("Canonical lifecycle commands must be routed through the Task action coordinator; no legacy editor lifecycle fallback was used.") });
        return null;
      }
      const scheduleChanged = Boolean(previousTask && hasTaskScheduleChange(previousTask, normalizedUpdateValues));
      const changedStateFields = (TASK_STATE_OWNED_UPDATE_FIELDS as readonly string[]).filter((field) => {
        const nextValue = normalizedUpdateValues[field as keyof TaskUpdate];
        const previousValue = previousTask?.[field as keyof Task];
        return nextValue !== undefined && nextValue !== previousValue;
      });
      if (changedStateFields.length > 0 && !scheduleChanged) {
        setMessage({ tone: "warn", text: taskEditFailureMessage("Canonical Task State editor actions must use the Task action coordinator; no legacy editor state fallback was used.") });
        return null;
      }
      const scheduleOnlyEdit = scheduleChanged && !statusChanged;
      const scheduleIntentValues = scheduleOnlyEdit ? stripStatusFromScheduleIntent(normalizedUpdateValues) : normalizedUpdateValues;
      if (scheduleChanged) {
        const changedScheduleValues = Object.fromEntries(
          (TASK_STATE_OWNED_UPDATE_FIELDS as readonly string[])
            .filter((field) => field !== "status" && field !== "completed_at" && field !== "trashed_at" && field !== "parent_task_id")
            .filter((field) => {
              const nextValue = normalizedUpdateValues[field as keyof TaskUpdate];
              const previousValue = previousTask?.[field as keyof Task];
              return nextValue !== undefined && nextValue !== previousValue;
            })
            .map((field) => [field, normalizedUpdateValues[field as keyof TaskUpdate]]),
        ) as TaskUpdate;
        const changedMetadataValues = Object.fromEntries((TASK_METADATA_UPDATE_FIELDS as readonly string[]).flatMap((field) => {
          const nextValue = normalizedUpdateValues[field as keyof TaskUpdate];
          const previousValue = previousTask?.[field as keyof Task];
          return nextValue !== undefined && nextValue !== previousValue ? [[field, nextValue]] : [];
        })) as TaskUpdate;
        const hasNonScheduleStateChange = changedStateFields.some((field) => !Object.hasOwn(changedScheduleValues, field));
        if (hasNonScheduleStateChange || statusChanged || !canonicalTaskStateUpdate || Object.keys(changedScheduleValues).length === 0) {
          setMessage({ tone: "warn", text: taskEditFailureMessage("Canonical schedule commands cannot be combined with this editor change; no legacy schedule fallback was used.") });
          return null;
        }
        const canonicalSaved = await canonicalTaskStateUpdate(
          taskId,
          changedScheduleValues,
          changedScheduleValues.due_on === null ? { manualAction: "unscheduled_status" } : undefined,
        );
        if (!canonicalSaved) {
          return null;
        }
        let metadataTask: Task | null = null;
        if (Object.keys(changedMetadataValues).length > 0) {
          const metadataResult = await updateTaskRowWithLegacyEnergyFallback(taskId, changedMetadataValues);
          if (metadataResult.error || metadataResult.conflict || !metadataResult.data) {
            setMessage({
              tone: "warn",
              text: taskCommitReconciliationFailureMessage(metadataResult.error?.message ?? (metadataResult.conflict ? buildTaskUpdateConflictMessage(metadataResult.conflict) : "No updated metadata row was returned.")),
            });
            return null;
          }
          setTasks((current) => sortTasksForUi(current.map((candidate) => {
            if (candidate.id !== taskId) return candidate;
            const mergedMetadataTask = mergeTaskWithCanonicalScheduleProjection(candidate, metadataResult.data!);
            metadataTask = mergedMetadataTask;
            return mergedMetadataTask;
          })));
        }
        const subtasksResult = await replaceTaskSubtasks(taskId, subtasks);
        if (!subtasksResult.saved) return null;
        const linkedNotesSaved = await syncTaskNoteLinks(taskId, linkedNoteIds);
        if (!linkedNotesSaved) return null;
        const nextFocusIds = focusToday
          ? Array.from(new Set([...focusedTaskIds, taskId]))
          : focusedTaskIds.filter((id) => id !== taskId);
        await saveFocusSelection(nextFocusIds);
        setMessage({ tone: "good", text: Object.keys(changedMetadataValues).length > 0 ? "Task schedule and metadata updated." : "Task schedule updated." });
        return metadataTask ?? tasks.find((task) => task.id === taskId) ?? previousTask;
      }
      const occurrenceSensitive = isOccurrenceSensitiveTaskMutation({
        task: previousTask,
        values: normalizedUpdateValues,
      });
      let scopedHistory = taskHistory.filter((entry) => entry.task_id === taskId);
      if (occurrenceSensitive && loadTaskHistoryForTasks) {
        const historyLoad = (await loadTaskHistoryForTasks([taskId]))[taskId];
        if (!historyLoad || historyLoad.status !== "ready") {
          setMessage({ tone: "warn", text: taskEditFailureMessage(historyLoad?.error ?? "Could not load task history.") });
          return null;
        }
        scopedHistory = historyLoad.history;
      }
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
          proposedTask: { ...previousTask, ...scheduleIntentValues } as Task,
          task: previousTask,
          timezone,
        })
        : null;
      const validationError = actionAuthority?.validationErrors[0] ?? scheduleAuthority?.validationErrors[0];
      if (validationError) {
        setMessage({ tone: "warn", text: taskEditFailureMessage(validationError) });
        return null;
      }
      const authorityUpdate = actionAuthority?.mutationPlan.taskUpdate ?? scheduleAuthority?.mutationPlan.taskUpdate;
      const dueNormalizedValues = authorityUpdate
        ? { ...scheduleIntentValues, ...authorityUpdate }
        : scheduleIntentValues;
      const updateValues = previousTask
        ? (scheduleOnlyEdit || actionAuthority) ? dueNormalizedValues : applyTaskActiveStatusTracking(previousTask, dueNormalizedValues, currentDayKey)
        : dueNormalizedValues;
      let result: UpdateTaskRowResult;
      try {
        result = await updateTaskRowWithLegacyEnergyFallback(taskId, updateValues, { expectedTask: previousTask });
      } catch (error) {
        setMessage({ tone: "warn", text: taskEditFailureMessage(error instanceof Error ? error.message : "The task persistence request failed.") });
        return null;
      }
      const {
        conflict,
        data,
        error,
        usedEnergyFallback,
        usedActualSecondsFallback,
      } = result;

      if (error) {
        setMessage({ tone: "warn", text: taskEditFailureMessage(error.message) });
        return null;
      }

      if (conflict) {
        if (conflict.latestTask) {
          const latestTask = previousTask
            ? mergeTaskWithCanonicalScheduleProjection(previousTask, conflict.latestTask)
            : conflict.latestTask;
          setTasks((current) => sortTasksForUi(current.map((task) => task.id === taskId ? latestTask : task)));
        }
        setMessage({ tone: "warn", text: taskEditFailureMessage(buildTaskUpdateConflictMessage(conflict)) });
        return null;
      }

      if (!data) {
        setMessage({ tone: "warn", text: taskCommitReconciliationFailureMessage("Supabase did not return the updated Task row.") });
        return null;
      }

      const rawNextData = usedActualSecondsFallback && typeof updateValues.actual_seconds === "number"
        ? { ...data, actual_seconds: updateValues.actual_seconds }
        : data;
      const nextData = previousTask
        ? mergeTaskWithCanonicalScheduleProjection(previousTask, rawNextData)
        : rawNextData;

      setTasks((current) => sortTasksForUi(current.map((task) => task.id === taskId ? nextData : task)));
      if (scheduleOnlyEdit) {
        try {
          await onTaskHistoryMutation?.(taskId, scopedHistory, nextData);
        } catch (error) {
          setMessage({ tone: "warn", text: taskCommitReconciliationFailureMessage(error instanceof Error ? error.message : "The updated Task could not be reconciled locally.") });
          return null;
        }
      }

      // A due-date edit changes only the next scheduling cursor. It must not
      // turn the normalized open status into a History delete or replacement.
      if (!scheduleOnlyEdit && statusChanged) {
        const historyEntries = actionAuthority?.mutationPlan.historyIntents;
        const historySaved = historyEntries?.length && syncTaskHistoryEntries
          ? await syncTaskHistoryEntries(taskId, data.status, historyEntries.map((entry) => entry.entry_date), { historyEntries, historySnapshot: scopedHistory })
          : await syncTaskHistoryEntry(taskId, data.status, previousTask ?? nextData, {
            ...(historyEntries?.[0] ? { historyEntry: historyEntries[0] } : {}),
            historySnapshot: scopedHistory,
          });
        if (!historySaved) {
          setMessage({ tone: "warn", text: taskCommitReconciliationFailureMessage("Task History could not be synchronized.") });
          return false;
        }
      }

      const subtasksResult = await replaceTaskSubtasks(taskId, subtasks);
      if (!subtasksResult.saved) {
        setMessage({ tone: "warn", text: taskCommitReconciliationFailureMessage("The updated Task steps could not be synchronized.") });
        return false;
      }

      const linkedNotesSaved = await syncTaskNoteLinks(taskId, linkedNoteIds);
      if (!linkedNotesSaved) {
        setMessage({ tone: "warn", text: taskCommitReconciliationFailureMessage("The updated Task note links could not be synchronized.") });
        return false;
      }

      if (!scheduleOnlyEdit) {
        await onTasksCompleted([{
          // A future due-date edit on an already successful recurring task is a
          // manual anchor, not another completion to finalize.
          engineManaged: Boolean(actionAuthority),
          previousStatus: previousTask?.status ?? null,
          rewardEligible: actionAuthority?.rewardEligibility.eligible,
          task: nextData,
        }]);
      }

      const nextFocusIds = focusToday
        ? Array.from(new Set([...focusedTaskIds, taskId]))
        : focusedTaskIds.filter((id) => id !== taskId);
      await saveFocusSelection(nextFocusIds);
      const usedAnyFallback = usedEnergyFallback || usedActualSecondsFallback;
      setMessage({
        tone: usedAnyFallback ? "warn" : "good",
        text: usedActualSecondsFallback
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
    const creationResult = canonicalTaskCreator
      ? await canonicalTaskCreator(payload, "task_creation")
      : {
          data: null,
          error: { message: "Trusted canonical Task creation is unavailable." },
          usedEnergyFallback: false,
          usedActualSecondsFallback: false as const,
        };
    const { data, error, usedEnergyFallback } = creationResult;

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

    const subtasksResult = await replaceTaskSubtasks(data.id, subtasks);
    if (!subtasksResult.saved) {
      return false;
    }

    const linkedNotesSaved = await syncTaskNoteLinks(data.id, linkedNoteIds);
    if (!linkedNotesSaved) {
      return false;
    }

    if (focusToday) {
      await saveFocusSelection(
        Array.from(new Set([...focusedTaskIds, data.id])),
        new Set([...tasks.map((currentTask) => currentTask.id), data.id]),
      );
    }

    const usedAnyFallback = usedEnergyFallback;
    setMessage({
      tone: usedAnyFallback ? "warn" : "good",
      text: usedEnergyFallback
          ? "Your database is missing the newer \"none\" energy level, so this task was saved with low energy instead. Run `supabase/add_task_energy_none.sql` to enable \"none\"."
          : "Task saved.",
    });
    return data;
  }

  return { saveTaskEditor };
}
