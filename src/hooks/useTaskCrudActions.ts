"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dispatch, SetStateAction } from "react";
import type { Task, TaskInsert, TaskUpdate } from "@/lib/database.types";
import type { TaskRoutingBucket } from "@/lib/task-buckets";
import { buildChildTaskCreationDraft } from "@/lib/task-child-creation";
import type { DeleteTaskRowResult, TaskRowUpdateOptions, UpdateTaskRowResult } from "@/lib/task-db-mutations";
import type { ImportedTaskSubtask, ImportedTaskWarning } from "@/lib/task-input-parsing";
import { parseImportedTaskLines } from "@/lib/task-input-parsing";
import { buildTaskHierarchyAdapter } from "@/lib/task-hierarchy";
import { normalizeTaskPriorityFields } from "@/lib/task-priority";
import { isMissingTaskActualSecondsColumnError, isMissingTaskEnergyNoneEnumError } from "@/lib/task-db-compat";
import { classifyTaskStateRuntimeAction, createTaskStateReplayIdentity } from "@/lib/task-state-runtime-actions";
import {
  executeTaskStateRuntimeAction,
  type TaskStateRuntimeExecutionResult,
  type TaskStateRuntimeLocalTask,
  type TaskStateRuntimeCanonicalAction,
} from "@/lib/task-state-runtime-executor";
import { TASK_STATE_CANONICAL_COMMANDS_ENABLED } from "@/lib/task-state-runtime-gate";

type Message = {
  text: string;
  tone: "neutral" | "good" | "warn";
};

export type ImportTasksResult = {
  errorCount: number;
  importedCount: number;
  warningCount: number;
};

type DeleteTasksOptions = {
  expectedTasks?: Map<string, Task | null>;
};

type UseTaskCrudActionsOptions = {
  client: SupabaseClient;
  clearPendingTaskMutations?: (taskIds: string[]) => void;
  currentUserId: string;
  markPendingTaskMutations?: (taskIds: string[]) => void;
  mutateMilestoneTask?: (action: "delete" | "trash", task: Task) => Promise<{ deleted: boolean; error: string | null; handled: boolean; task: Task | null }>;
  /** Test seam; production uses the disabled migration gate. */
  canonicalCommandsEnabled?: boolean;
  /** Test seam for the canonical executor; normal callers use the real executor. */
  canonicalCommandExecutor?: (action: TaskStateRuntimeCanonicalAction, task: TaskStateRuntimeLocalTask) => Promise<TaskStateRuntimeExecutionResult>;
  /** Lets enabled-gate deletion fail closed before invoking Milestone RPCs. */
  isMilestoneTask?: (task: Task) => boolean;
  setMessage: Dispatch<SetStateAction<Message | null>>;
  setTaskRouting: Dispatch<SetStateAction<Record<string, TaskRoutingBucket>>>;
  setTasks: Dispatch<SetStateAction<Task[]>>;
  shouldRouteTaskToInbox: (task: Task) => boolean;
  sortTasksForUi: (tasks: Task[]) => Task[];
  tasks: Task[];
  replaceTaskSubtasks?: unknown;
  deleteTaskRow: (taskId: string, expectedTask?: Task | null) => Promise<DeleteTaskRowResult>;
  updateTaskRowWithLegacyEnergyFallback: (taskId: string, values: TaskUpdate, options?: TaskRowUpdateOptions) => Promise<UpdateTaskRowResult>;
};

export function useTaskCrudActions({
  client,
  clearPendingTaskMutations,
  canonicalCommandsEnabled = TASK_STATE_CANONICAL_COMMANDS_ENABLED,
  canonicalCommandExecutor = (action, task) => executeTaskStateRuntimeAction(action, task),
  currentUserId,
  isMilestoneTask,
  markPendingTaskMutations,
  mutateMilestoneTask,
  setMessage,
  setTaskRouting,
  setTasks,
  shouldRouteTaskToInbox,
  sortTasksForUi,
  tasks,
  deleteTaskRow,
  updateTaskRowWithLegacyEnergyFallback,
}: UseTaskCrudActionsOptions) {
  async function importTasks(lines: string[]) {
    if (lines.every((line) => !line.trim())) {
      return { errorCount: 0, importedCount: 0, warningCount: 0 } satisfies ImportTasksResult;
    }

    const parsed = parseImportedTaskLines(lines);
    if (parsed.tasks.length === 0) {
      const warningText = formatWarningBlock(parsed.warnings);
      setMessage({
        tone: "warn",
        text: warningText ? `No tasks were imported.\n${warningText}` : "No tasks were imported.",
      });
      return {
        errorCount: 0,
        importedCount: 0,
        warningCount: parsed.warnings.length,
      } satisfies ImportTasksResult;
    }

    const importedAllTasks: Task[] = [];
    const importedRootTasks: Task[] = [];
    const warnings: ImportedTaskWarning[] = [...parsed.warnings];
    const importErrors: ImportedTaskWarning[] = [];

    for (const [index, parsedTask] of parsed.tasks.entries()) {
      const payload: TaskInsert = normalizeTaskPriorityFields({
        actual_seconds: parsedTask.actualSeconds ?? undefined,
        due_on: parsedTask.dueOn,
        due_time: parsedTask.dueTime,
        energy: parsedTask.energy,
        estimated_minutes: parsedTask.estimatedMinutes,
        is_important: parsedTask.isImportant,
        is_urgent: parsedTask.isUrgent,
        priority: parsedTask.priority,
        priority_level: parsedTask.priorityLevel,
        repeat_frequency: parsedTask.repeatFrequency,
        sort_order: Date.now() + index,
        status: parsedTask.status,
        tags: parsedTask.tags,
        title: parsedTask.title,
        user_id: currentUserId,
      });

      const insertResult = await insertImportedTaskRow(client, payload);
      if (insertResult.error) {
        importErrors.push({ line: parsedTask.line, message: insertResult.error.message });
        continue;
      }

      if (!insertResult.data) {
        importErrors.push({ line: parsedTask.line, message: "Task insert returned no row." });
        continue;
      }

      if (insertResult.usedActualFallback) {
        warnings.push({
          line: parsedTask.line,
          message: "Actual time was skipped because this database is missing the task actual-time column.",
        });
      }

      if (insertResult.usedEnergyFallback) {
        warnings.push({
          line: parsedTask.line,
          message: "Energy value \"none\" fell back to \"low\" because this database is missing the newer energy enum value.",
        });
      }

      importedRootTasks.push(insertResult.data);
      importedAllTasks.push(insertResult.data);

      if (parsedTask.subtasks.length > 0) {
        const childImport = await insertImportedChildTaskTree({
          children: parsedTask.subtasks,
          client,
          currentUserId,
          importErrors,
          parentTaskId: insertResult.data.id,
          warnings,
        });
        importedAllTasks.push(...childImport.insertedTasks);
      }
    }

    if (importedAllTasks.length > 0) {
      setTasks((current) => sortTasksForUi(mergeTasksById(current, importedAllTasks)));
      setTaskRouting((current) => {
        const next = { ...current };
        for (const task of importedRootTasks) {
          if (shouldRouteTaskToInbox(task)) {
            next[task.id] = "inbox";
          }
        }
        return next;
      });
    }

    const result = {
      errorCount: importErrors.length,
      importedCount: importedRootTasks.length,
      warningCount: warnings.length,
    } satisfies ImportTasksResult;

    setMessage({
      tone: importErrors.length > 0 || warnings.length > 0 ? "warn" : "good",
      text: buildImportSummaryMessage(result, warnings, importErrors),
    });

    return result;
  }

  async function deleteTasks(taskIds: string[], options?: DeleteTasksOptions) {
    markPendingTaskMutations?.(taskIds);
    const taskHierarchy = buildTaskHierarchyAdapter(tasks);
    const taskIdSet = new Set(taskIds);
    const taskSnapshots = new Map<string, Task | null>(
      tasks
        .filter((task) => taskIdSet.has(task.id))
        .map((task) => [task.id, task] as const),
    );
    if (options?.expectedTasks) {
      for (const [taskId, task] of options.expectedTasks.entries()) {
        taskSnapshots.set(taskId, task);
      }
    }
    const movedToTrashTasks: Task[] = [];
    const deletedTaskIds: string[] = [];
    const missingTaskIds: string[] = [];
    const conflictedTasks: Task[] = [];
    let firstErrorMessage: string | null = null;

    for (const taskId of taskIds) {
      const expectedTask = taskSnapshots.get(taskId) ?? null;

      if (expectedTask && mutateMilestoneTask) {
        if (canonicalCommandsEnabled && expectedTask.status !== "trashed" && !isMilestoneTask) {
          firstErrorMessage ??= "Canonical Trash could not verify Milestone lifecycle ownership; no legacy Trash fallback was used.";
          continue;
        }
        const milestoneResult = await mutateMilestoneTask(expectedTask.status === "trashed" ? "delete" : "trash", expectedTask);
        if (milestoneResult.handled) {
          if (milestoneResult.error) firstErrorMessage ??= milestoneResult.error;
          else if (milestoneResult.deleted) deletedTaskIds.push(taskId);
          else if (milestoneResult.task) movedToTrashTasks.push(milestoneResult.task);
          continue;
        }
      }

      if (expectedTask && expectedTask.status !== "trashed") {
        if (canonicalCommandsEnabled) {
          const runtimeAction = classifyTaskStateRuntimeAction({
            replayIdentity: createTaskStateReplayIdentity(),
            task: expectedTask as TaskStateRuntimeLocalTask,
            values: { status: "trashed" },
          });
          if (runtimeAction.kind !== "canonical_action" || runtimeAction.actionType !== "trash_task") {
            firstErrorMessage ??= runtimeAction.kind === "unsupported_state_mutation"
              ? runtimeAction.reason
              : "The canonical Trash action could not be classified.";
            continue;
          }

          let canonicalResult: TaskStateRuntimeExecutionResult;
          try {
            canonicalResult = await canonicalCommandExecutor(runtimeAction, expectedTask as TaskStateRuntimeLocalTask);
          } catch (error) {
            firstErrorMessage ??= error instanceof Error ? error.message : "The canonical Trash command could not be invoked.";
            continue;
          }
          if (!canonicalResult.success) {
            firstErrorMessage ??= canonicalResult.error.message;
            continue;
          }

          movedToTrashTasks.push(canonicalResult.task as Task);
          continue;
        }

        const result = await updateTaskRowWithLegacyEnergyFallback(taskId, {
          completed_at: null,
          status: "trashed",
          trashed_at: new Date().toISOString(),
        }, { expectedTask });

        if (result.error) {
          firstErrorMessage ??= result.error.message;
          continue;
        }

        if (result.conflict?.latestTask) {
          conflictedTasks.push(result.conflict.latestTask);
          continue;
        }

        if (result.conflict?.reason === "task_missing") {
          missingTaskIds.push(taskId);
          continue;
        }

        if (result.data) {
          movedToTrashTasks.push(result.data);
        }
        continue;
      }

      const result = await deleteTaskRow(taskId, expectedTask);

      if (result.error) {
        firstErrorMessage ??= result.error.message;
        continue;
      }

      if (result.conflict?.latestTask) {
        conflictedTasks.push(result.conflict.latestTask);
        continue;
      }

      if (result.conflict?.reason === "task_missing") {
        missingTaskIds.push(taskId);
        continue;
      }

      deletedTaskIds.push(taskId);
    }

    const removedTaskIds = new Set([...deletedTaskIds, ...missingTaskIds]);
    for (const taskId of [...removedTaskIds]) {
      for (const descendant of taskHierarchy.getDescendants(taskId)) {
        removedTaskIds.add(descendant.id);
      }
    }
    const replacementTasks = new Map(
      [...movedToTrashTasks, ...conflictedTasks].map((task) => [task.id, task] as const),
    );
    if (removedTaskIds.size > 0 || replacementTasks.size > 0) {
      setTasks((current) => {
        const nextTasks = current
          .filter((task) => !removedTaskIds.has(task.id))
          .map((task) => replacementTasks.get(task.id) ?? task);
        return sortTasksForUi(nextTasks);
      });
    }

    if (removedTaskIds.size > 0 || movedToTrashTasks.length > 0 || conflictedTasks.length > 0) {
      setTaskRouting((current) => {
        const next = { ...current };
        for (const taskId of removedTaskIds) {
          delete next[taskId];
        }
        for (const task of [...movedToTrashTasks, ...conflictedTasks]) {
          if (task.status === "archived" || task.status === "trashed" || task.status === "done" || task.status === "did_my_best" || task.status === "complete") {
            delete next[task.id];
          }
        }
        return next;
      });
    }

    clearPendingTaskMutations?.(taskIds);

    const deletedCount = deletedTaskIds.length + missingTaskIds.length;
    const trashedCount = movedToTrashTasks.length;
    const successfulCount = deletedCount + trashedCount;
    if (successfulCount === 0) {
      setMessage({
        tone: "warn",
        text: firstErrorMessage ?? "No tasks were deleted because newer cloud changes were found first.",
      });
      return false;
    }

    const successFragments = [
      trashedCount > 0 ? `Moved ${trashedCount} task${trashedCount === 1 ? "" : "s"} to trash.` : null,
      deletedCount > 0 ? `Deleted ${deletedCount} task${deletedCount === 1 ? "" : "s"} permanently.` : null,
    ].filter(Boolean);
    const successText = successFragments.join(" ");

    if (firstErrorMessage) {
      setMessage({
        tone: "warn",
        text: `${successText} Some delete actions failed. ${firstErrorMessage}`,
      });
      return true;
    }

    if (conflictedTasks.length > 0) {
      setMessage({
        tone: "warn",
        text: `${successText} ${conflictedTasks.length} task${conflictedTasks.length === 1 ? "" : "s"} changed in the cloud first and were refreshed instead of being updated.`,
      });
      return true;
    }

    setMessage({ tone: "good", text: successText });
    return true;
  }

  return {
    deleteTasks,
    importTasks,
  };
}

export function mergeTasksById(currentTasks: Task[], incomingTasks: Task[]) {
  if (incomingTasks.length === 0) {
    return currentTasks;
  }

  const tasksById = new Map(currentTasks.map((task) => [task.id, task]));
  for (const task of incomingTasks) {
    tasksById.set(task.id, task);
  }
  return Array.from(tasksById.values());
}

function formatWarningBlock(warnings: ImportedTaskWarning[]) {
  return warnings.map((warning) => `Line ${warning.line}: ${warning.message}`).join("\n");
}

function buildImportSummaryMessage(
  result: ImportTasksResult,
  warnings: ImportedTaskWarning[],
  importErrors: ImportedTaskWarning[],
) {
  const summary = `${result.importedCount} task${result.importedCount === 1 ? "" : "s"} imported.`;
  const warningBlock = formatWarningBlock(warnings);
  const errorBlock = formatWarningBlock(importErrors);

  if (!warningBlock && !errorBlock) {
    return summary;
  }

  const sections = [summary];
  if (warningBlock) {
    sections.push(`Warnings:\n${warningBlock}`);
  }
  if (errorBlock) {
    sections.push(`Import errors:\n${errorBlock}`);
  }
  return sections.join("\n\n");
}

async function insertImportedTaskRow(client: SupabaseClient, payload: TaskInsert) {
  let nextPayload: TaskInsert = payload;
  let usedActualFallback = false;
  let usedEnergyFallback = false;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await client
      .from("adhdice_clean_tasks")
      .insert(nextPayload)
      .select("*")
      .single();

    if (!result.error) {
      return {
        data: result.data,
        error: null,
        usedActualFallback,
        usedEnergyFallback,
      };
    }

    if (nextPayload.actual_seconds !== undefined && isMissingTaskActualSecondsColumnError(result.error.message)) {
      const { actual_seconds: _actualSeconds, ...payloadWithoutActual } = nextPayload;
      nextPayload = payloadWithoutActual;
      usedActualFallback = true;
      continue;
    }

    if (nextPayload.energy === "none" && isMissingTaskEnergyNoneEnumError(result.error.message)) {
      nextPayload = {
        ...nextPayload,
        energy: "low",
      };
      usedEnergyFallback = true;
      continue;
    }

    return {
      data: null,
      error: result.error,
      usedActualFallback,
      usedEnergyFallback,
    };
  }

  return {
    data: null,
    error: { message: "Task import retries were exhausted." },
    usedActualFallback,
    usedEnergyFallback,
  };
}

async function insertImportedChildTaskTree({
  children,
  client,
  currentUserId,
  importErrors,
  parentTaskId,
  warnings,
}: {
  children: ImportedTaskSubtask[];
  client: SupabaseClient;
  currentUserId: string;
  importErrors: ImportedTaskWarning[];
  parentTaskId: string;
  warnings: ImportedTaskWarning[];
}): Promise<{ insertedTasks: Task[] }> {
  const insertedTasks: Task[] = [];

  for (const [index, child] of children.entries()) {
    const childDraft = buildChildTaskCreationDraft({
      parentTaskId,
      title: child.title,
    });
    if (!childDraft.ok) {
      importErrors.push({
        line: child.line,
        message: "Step could not be created because the imported parent link was invalid.",
      });
      continue;
    }

    const payload: TaskInsert = normalizeTaskPriorityFields({
      ...childDraft.draft,
      actual_seconds: child.actualSeconds ?? undefined,
      due_on: child.dueOn,
      due_time: child.dueTime,
      energy: child.energy,
      estimated_minutes: child.estimatedMinutes,
      is_important: child.isImportant,
      is_urgent: child.isUrgent,
      parent_task_id: parentTaskId,
      priority: child.priority,
      priority_level: child.priorityLevel,
      repeat_frequency: child.repeatFrequency,
      sort_order: index,
      status: child.status,
      tags: child.tags,
      user_id: currentUserId,
    });

    const insertResult = await insertImportedTaskRow(client, payload);
    if (insertResult.error) {
      importErrors.push({ line: child.line, message: insertResult.error.message });
      continue;
    }

    if (!insertResult.data) {
      importErrors.push({ line: child.line, message: "Step insert returned no row." });
      continue;
    }

    if (insertResult.usedActualFallback) {
      warnings.push({
        line: child.line,
        message: "Step actual time was skipped because this database is missing the task actual-time column.",
      });
    }

    if (insertResult.usedEnergyFallback) {
      warnings.push({
        line: child.line,
        message: "Step energy value \"none\" fell back to \"low\" because this database is missing the newer energy enum value.",
      });
    }

    insertedTasks.push(insertResult.data);

    if (child.children.length > 0) {
      const descendantImport = await insertImportedChildTaskTree({
        children: child.children,
        client,
        currentUserId,
        importErrors,
        parentTaskId: insertResult.data.id,
        warnings,
      });
      insertedTasks.push(...descendantImport.insertedTasks);
    }
  }

  return { insertedTasks };
}
