"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dispatch, SetStateAction } from "react";
import type { Task, TaskInsert, TaskSubtaskStatus, TaskUpdate } from "@/lib/database.types";
import type { TaskRoutingBucket } from "@/lib/task-buckets";
import type { DeleteTaskRowResult, TaskRowUpdateOptions, UpdateTaskRowResult } from "@/lib/task-db-mutations";
import type { ImportedTaskSubtask, ImportedTaskWarning } from "@/lib/task-input-parsing";
import { parseImportedTaskLines } from "@/lib/task-input-parsing";
import { isMissingTaskActualSecondsColumnError, isMissingTaskEnergyNoneEnumError } from "@/lib/task-db-compat";

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
  setMessage: Dispatch<SetStateAction<Message | null>>;
  setTaskRouting: Dispatch<SetStateAction<Record<string, TaskRoutingBucket>>>;
  setTasks: Dispatch<SetStateAction<Task[]>>;
  shouldRouteTaskToInbox: (task: Task) => boolean;
  sortTasksForUi: (tasks: Task[]) => Task[];
  tasks: Task[];
  replaceTaskSubtasks: (taskId: string, subtasks: Array<{ children: ImportedTaskSubtask[]; id: string; status: TaskSubtaskStatus; title: string }>) => Promise<{ saved: boolean; usedNestedFallback: boolean }>;
  deleteTaskRow: (taskId: string, expectedTask?: Task | null) => Promise<DeleteTaskRowResult>;
  updateTaskRowWithLegacyEnergyFallback: (taskId: string, values: TaskUpdate, options?: TaskRowUpdateOptions) => Promise<UpdateTaskRowResult>;
};

export function useTaskCrudActions({
  client,
  clearPendingTaskMutations,
  currentUserId,
  markPendingTaskMutations,
  setMessage,
  setTaskRouting,
  setTasks,
  shouldRouteTaskToInbox,
  sortTasksForUi,
  tasks,
  replaceTaskSubtasks,
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

    const importedTasks: Task[] = [];
    const warnings: ImportedTaskWarning[] = [...parsed.warnings];
    const importErrors: ImportedTaskWarning[] = [];

    for (const [index, parsedTask] of parsed.tasks.entries()) {
      const payload: TaskInsert = {
        actual_seconds: parsedTask.actualSeconds ?? undefined,
        due_on: parsedTask.dueOn,
        due_time: parsedTask.dueTime,
        energy: parsedTask.energy,
        estimated_minutes: parsedTask.estimatedMinutes,
        is_important: parsedTask.isImportant,
        is_urgent: parsedTask.isUrgent,
        priority: parsedTask.priority,
        repeat_frequency: parsedTask.repeatFrequency,
        sort_order: Date.now() + index,
        status: parsedTask.status,
        tags: parsedTask.tags,
        title: parsedTask.title,
        user_id: currentUserId,
      };

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

      if (parsedTask.subtasks.length > 0) {
        const subtaskSave = await replaceTaskSubtasks(insertResult.data.id, parsedTask.subtasks);
        if (!subtaskSave.saved) {
          warnings.push({
            line: parsedTask.line,
            message: "Steps could not be saved for this task.",
          });
        } else if (subtaskSave.usedNestedFallback && containsNestedSubtasks(parsedTask.subtasks)) {
          warnings.push({
            line: parsedTask.line,
            message: "Nested substeps were flattened because this database is missing nested-subtask support.",
          });
        }
      }

      importedTasks.push(insertResult.data);
    }

    if (importedTasks.length > 0) {
      setTasks((current) => sortTasksForUi(mergeTasksById(current, importedTasks)));
      setTaskRouting((current) => {
        const next = { ...current };
        for (const task of importedTasks) {
          if (shouldRouteTaskToInbox(task)) {
            next[task.id] = "inbox";
          }
        }
        return next;
      });
    }

    const result = {
      errorCount: importErrors.length,
      importedCount: importedTasks.length,
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
    const taskIdSet = new Set(taskIds);
    const taskSnapshots = new Map(
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

      if (expectedTask && expectedTask.status !== "trashed") {
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

function containsNestedSubtasks(subtasks: ImportedTaskSubtask[]): boolean {
  return subtasks.some((subtask) => subtask.children.length > 0 || containsNestedSubtasks(subtask.children));
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
