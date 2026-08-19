"use client";

import type { Dispatch, SetStateAction } from "react";
import type { BatchTaskEditDraft } from "@/components/task-app/task-batch-edit-modal";
import type { Task, TaskHistory, TaskHistoryActionInput, TaskStatus, TaskUpdate } from "@/lib/database.types";
import type { TaskRowUpdateOptions } from "@/lib/task-db-mutations";
import type { TaskRoutingBucket } from "@/lib/task-buckets";
import { buildTaskPriorityUpdate } from "@/lib/task-priority";
import type { TaskRewardCandidate } from "@/lib/task-rewards";
import { applyTaskActiveStatusTracking } from "@/lib/task-active-status";
import { evaluateTaskActionAuthority, evaluateTaskScheduleAuthority, isOccurrenceSensitiveTaskMutation } from "@/lib/task-state-engine/action-authority";
import type { TaskHistoryLoadMap } from "@/lib/task-history";
import {
  completeBatchEditProgress,
  createBatchEditProgress,
  recordBatchEditPlan,
  warnBatchEditProgress,
  type BatchEditProgress,
} from "@/lib/task-batch-edit-progress";
import { classifyTaskStateRuntimeAction, createTaskStateReplayIdentity, type TaskStateRuntimeAction } from "@/lib/task-state-runtime-actions";
import {
  executeTaskStateRuntimeAction,
  type TaskStateRuntimeExecutionResult,
  type TaskStateRuntimeLocalTask,
} from "@/lib/task-state-runtime-executor";

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
  canonicalCommandExecutor?: (action: Extract<TaskStateRuntimeAction, { kind: "canonical_action" }>, task: TaskStateRuntimeLocalTask) => Promise<TaskStateRuntimeExecutionResult>;
  clearListTaskSelection: () => void;
  currentDayKey: string;
  dayStartTime: string;
  focusedTaskIds: string[];
  onTaskHistoryMutation?: (taskId: string, taskHistory: TaskHistory[], nextTask?: Task) => void | Promise<void>;
  onTasksCompleted: (candidates: TaskRewardCandidate[]) => Promise<void>;
  parseDayOfMonth: (value: string) => number | null;
  parsePositiveInteger: (value: string) => number | null;
  routeTask: (taskId: string, bucket: TaskRoutingBucket | null) => void;
  saveFocusSelection: (nextTaskIds: string[], validTaskIds?: Set<string> | Task[]) => Promise<void>;
  setBatchEditProgress: Dispatch<SetStateAction<BatchEditProgress | null>>;
  selectedListTasks: Task[];
  setIsBatchEditModalOpen: Dispatch<SetStateAction<boolean>>;
  setMessage: Dispatch<SetStateAction<Message | null>>;
  setTasks: Dispatch<SetStateAction<Task[]>>;
  sortTasksForUi: (tasks: Task[]) => Task[];
  syncTaskHistoryEntry: (taskId: string, status: TaskStatus, occurrenceTask?: Task | null, options?: { historyEntry?: TaskHistoryActionInput; historySnapshot?: TaskHistory[] }) => Promise<boolean>;
  syncTaskHistoryEntries?: (taskId: string, status: TaskStatus, entryDates: string[], options?: { historyEntries?: TaskHistoryActionInput[]; historySnapshot?: TaskHistory[] }) => Promise<boolean>;
  taskHistory?: TaskHistory[];
  tasks: Task[];
  loadTaskHistoryForTasks?: (taskIds: string[]) => Promise<TaskHistoryLoadMap>;
  logicalDayNow?: Date | string;
  timezone: string;
  updateTaskRowWithLegacyEnergyFallback: (taskId: string, values: TaskUpdate, options?: TaskRowUpdateOptions) => Promise<UpdateTaskRowResult>;
};

export function useTaskBatchEditAction({
  canonicalCommandExecutor = (action, task) => executeTaskStateRuntimeAction(action, task),
  clearListTaskSelection,
  currentDayKey,
  dayStartTime = "00:00",
  focusedTaskIds,
  onTaskHistoryMutation,
  onTasksCompleted,
  parseDayOfMonth,
  parsePositiveInteger,
  routeTask,
  saveFocusSelection,
  setBatchEditProgress,
  selectedListTasks,
  setIsBatchEditModalOpen,
  setMessage,
  setTasks,
  sortTasksForUi,
  syncTaskHistoryEntry,
  syncTaskHistoryEntries,
  taskHistory = [],
  tasks,
  loadTaskHistoryForTasks,
  logicalDayNow = `${currentDayKey}T12:00:00.000Z`,
  timezone = "UTC",
  updateTaskRowWithLegacyEnergyFallback,
}: UseTaskBatchEditActionOptions) {
  async function applyBatchTaskEdit(draft: BatchTaskEditDraft) {
    if (selectedListTasks.length === 0) {
      return;
    }

    setBatchEditProgress(null);

    type BatchTaskPlan = {
      actionAuthority: ReturnType<typeof evaluateTaskActionAuthority>;
      runtimeAction: TaskStateRuntimeAction | null;
      dueDateOnlyEdit: boolean;
      scopedHistory: TaskHistory[];
      task: Task;
      trackedUpdateValues: TaskUpdate;
    };

    let nextTasks = tasks;
    let hasAuthoritativeTaskRowsToReconcile = false;
    const nextFocusedTaskIds = new Set(focusedTaskIds);
    const completedCandidates: TaskRewardCandidate[] = [];
    const taskPlans: BatchTaskPlan[] = [];

    // Preflight every selected task before persisting any part of the batch.
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

      const dueDateChanged = draft.dueOnMode !== "unchanged"
        && Object.hasOwn(updateValues, "due_on")
        && updateValues.due_on !== task.due_on;
      const scheduleChanged = dueDateChanged || draft.dueOnMode !== "unchanged" || draft.repeatFrequency !== "unchanged";
      const dueDateOnlyEdit = scheduleChanged && draft.status === "unchanged";

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

      const occurrenceSensitive = isOccurrenceSensitiveTaskMutation({
        forceOccurrenceSensitive: draft.dueOnMode !== "unchanged" || draft.repeatFrequency !== "unchanged",
        task,
        values: updateValues,
      });
      let scopedHistory = taskHistory.filter((entry) => entry.task_id === task.id);
      if (Object.keys(updateValues).some((field) => field !== "revision" && updateValues[field as keyof TaskUpdate] !== undefined)) {
        const runtimeAction = classifyTaskStateRuntimeAction({
          replayIdentity: createTaskStateReplayIdentity(),
          task: task as TaskStateRuntimeLocalTask,
          values: updateValues,
        });
        if (runtimeAction.kind === "unsupported_state_mutation") {
          setMessage({ tone: "warn", text: runtimeAction.reason });
          return;
        }
        taskPlans.push({
          actionAuthority: null,
          dueDateOnlyEdit: false,
          runtimeAction: runtimeAction.kind === "canonical_action" ? runtimeAction : null,
          scopedHistory,
          task,
          trackedUpdateValues: updateValues,
        });
        continue;
      }
      if (occurrenceSensitive && loadTaskHistoryForTasks) {
        const historyLoad = (await loadTaskHistoryForTasks([task.id]))[task.id];
        if (!historyLoad || historyLoad.status !== "ready") {
          setMessage({ tone: "warn", text: historyLoad?.error ?? "Could not load task history. The batch was not saved." });
          return;
        }
        scopedHistory = historyLoad.history;
      }
      const outcome = draft.status !== "unchanged" && ["done", "did_my_best", "missed", "delayed", "complete"].includes(draft.status)
        ? draft.status as "done" | "did_my_best" | "missed" | "delayed" | "complete"
        : null;
      const actionAuthority = outcome
        ? evaluateTaskActionAuthority({
          history: scopedHistory,
          logicalDayRollover: dayStartTime,
          now: logicalDayNow,
          outcome,
          task: { ...task, ...updateValues } as Task,
          timezone,
        })
        : null;
      const scheduleAuthority = !actionAuthority && dueDateOnlyEdit
        ? evaluateTaskScheduleAuthority({
          history: scopedHistory,
          logicalDayRollover: dayStartTime,
          now: logicalDayNow,
          proposedTask: { ...task, ...updateValues } as Task,
          task,
          timezone,
        })
        : null;
      const validationError = actionAuthority?.validationErrors[0] ?? scheduleAuthority?.validationErrors[0];
      if (validationError) {
        setMessage({ tone: "warn", text: validationError });
        return;
      }
      const authorityUpdate = actionAuthority?.mutationPlan.taskUpdate ?? scheduleAuthority?.mutationPlan.taskUpdate;
      const trackedUpdateValues = authorityUpdate
        ? { ...updateValues, ...authorityUpdate }
        : applyTaskActiveStatusTracking(task, updateValues, currentDayKey);

      taskPlans.push({ actionAuthority, dueDateOnlyEdit, runtimeAction: null, scopedHistory, task, trackedUpdateValues });
    }

    setIsBatchEditModalOpen(false);
    let progress = createBatchEditProgress(taskPlans.length);
    setBatchEditProgress(progress);

    for (const { actionAuthority, dueDateOnlyEdit, runtimeAction, scopedHistory, task, trackedUpdateValues } of taskPlans) {
      let planSuccess = false;
      let planErrorMessage: string | null = null;
      let planFallbackUsed = false;

      try {
        const updateValues = trackedUpdateValues;
        if (Object.keys(updateValues).length === 0) {
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
          planSuccess = true;
        } else if (runtimeAction?.kind === "canonical_action") {
          const canonicalResult = await canonicalCommandExecutor(runtimeAction, task as TaskStateRuntimeLocalTask);
          if (!canonicalResult.success) {
            planErrorMessage = `Task "${task.title}": ${canonicalResult.error.message}`;
          } else {
            nextTasks = nextTasks.map((currentTask) => currentTask.id === task.id ? canonicalResult.task : currentTask);
            hasAuthoritativeTaskRowsToReconcile = true;
            if (["archive_task", "trash_task", "complete_task", "set_outcome"].includes(runtimeAction.actionType)) routeTask(task.id, null);
            planSuccess = true;
          }
        } else {
          const { data, error, usedEnergyFallback } = await updateTaskRowWithLegacyEnergyFallback(task.id, trackedUpdateValues, { expectedTask: task });
          planFallbackUsed = usedEnergyFallback;

          if (error) {
            planErrorMessage = error.message;
          } else if (!data) {
            planErrorMessage = `Task "${task.title}" updated, but no task row came back from Supabase.`;
          } else {
            nextTasks = nextTasks.map((currentTask) => currentTask.id === task.id ? data : currentTask);
            hasAuthoritativeTaskRowsToReconcile = true;
            if (dueDateOnlyEdit) {
              void onTaskHistoryMutation?.(task.id, scopedHistory, data);
            }

            if (data.status === "done" || data.status === "did_my_best" || data.status === "complete" || data.status === "archived" || data.status === "trashed") {
              routeTask(task.id, null);
            }

            if (!dueDateOnlyEdit && draft.status !== "unchanged") {
              const historyEntries = actionAuthority?.mutationPlan.historyIntents;
              const historySaved = historyEntries?.length && syncTaskHistoryEntries
                ? await syncTaskHistoryEntries(task.id, data.status, historyEntries.map((entry) => entry.entry_date), { historyEntries, historySnapshot: scopedHistory })
                : await syncTaskHistoryEntry(task.id, data.status, task, historyEntries?.[0]
                  ? { historyEntry: historyEntries[0], historySnapshot: scopedHistory }
                  : { historySnapshot: scopedHistory });
              if (!historySaved) {
                planErrorMessage = `Task "${data.title}" was updated, but its history entry could not be saved.`;
              }
            }

            if (!planErrorMessage) {
              if (!dueDateOnlyEdit) {
                completedCandidates.push({
                  engineManaged: Boolean(actionAuthority),
                  previousStatus: task.status,
                  rewardEligible: actionAuthority?.rewardEligibility.eligible,
                  task: data,
                });
              }

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
              planSuccess = true;
            }
          }
        }
      } catch (error) {
        planErrorMessage = error instanceof Error ? error.message : `Task "${task.title}" could not be processed.`;
      }

      progress = recordBatchEditPlan(progress, {
        errorMessage: planErrorMessage,
        fallbackUsed: planFallbackUsed,
        success: planSuccess,
      });
      setBatchEditProgress(progress);
    }

    const didApplyBatchEffect = hasAuthoritativeTaskRowsToReconcile || progress.updated > 0;
    try {
      if (didApplyBatchEffect) {
        setTasks(sortTasksForUi(nextTasks));
        if (progress.updated > 0) {
          if (completedCandidates.length > 0) {
            await onTasksCompleted(completedCandidates);
          }
          if (draft.route === "focus" || draft.focusToday !== "unchanged") {
            await saveFocusSelection([...nextFocusedTaskIds], new Set(nextTasks.map((task) => task.id)));
          }
        }
        clearListTaskSelection();
      }
    } catch (error) {
      const finalizationError = error instanceof Error ? error.message : "Batch Edit finalization could not be completed.";
      setBatchEditProgress(warnBatchEditProgress(progress, finalizationError));
      return;
    }

    setBatchEditProgress(completeBatchEditProgress(progress));
  }

  return { applyBatchTaskEdit };
}
