"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dispatch, SetStateAction } from "react";
import type { Task, TaskInsert } from "@/lib/database.types";
import type { TaskRoutingBucket } from "@/lib/task-buckets";
import { buildChildTaskCreationDraft } from "@/lib/task-child-creation";
import {
  insertTaskRowWithCanonicalCreation,
  type CanonicalTaskCreator,
  type DeleteTaskRowResult,
} from "@/lib/task-db-mutations";
import type { ImportedTaskSubtask, ImportedTaskWarning } from "@/lib/task-input-parsing";
import { countImportedTaskNodes, parseImportedTaskLines } from "@/lib/task-input-parsing";
import { buildTaskHierarchyAdapter } from "@/lib/task-hierarchy";
import { normalizeTaskPriorityFields } from "@/lib/task-priority";
import { classifyTaskStateRuntimeAction, createTaskStateReplayIdentity } from "@/lib/task-state-runtime-actions";
import {
  executeTaskStateRuntimeAction,
  type TaskStateRuntimeExecutionResult,
  type TaskStateRuntimeLocalTask,
  type TaskStateRuntimeCanonicalAction,
} from "@/lib/task-state-runtime-executor";

type Message = {
  text: string;
  tone: "neutral" | "good" | "warn";
};

export type ImportTasksResult = {
  errorCount: number;
  importedCount: number;
  warningCount: number;
};

export type TaskImportProgress = {
  processed: number;
  total: number;
};

export type TaskImportOptions = {
  onProgress?: (progress: TaskImportProgress) => void;
};

type DeleteTasksOptions = {
  expectedTasks?: Map<string, Task | null>;
};

type UseTaskCrudActionsOptions = {
  canonicalTaskCreator?: CanonicalTaskCreator;
  client: SupabaseClient;
  clearPendingTaskMutations?: (taskIds: string[]) => void;
  currentUserId: string;
  markPendingTaskMutations?: (taskIds: string[]) => void;
  onTaskRevealRequested?: (taskId: string) => void;
  runMilestoneTaskTrash?: (task: Task) => Promise<{ error: string | null; handled: boolean; task: Task | null }>;
  /** Test seam for the canonical executor; normal callers use the real executor. */
  canonicalCommandExecutor?: (action: TaskStateRuntimeCanonicalAction, task: TaskStateRuntimeLocalTask) => Promise<TaskStateRuntimeExecutionResult>;
  isMilestoneTask?: (task: Task) => boolean;
  setMessage: Dispatch<SetStateAction<Message | null>>;
  setTaskRouting: Dispatch<SetStateAction<Record<string, TaskRoutingBucket>>>;
  setTasks: Dispatch<SetStateAction<Task[]>>;
  shouldRouteTaskToInbox: (task: Task) => boolean;
  sortTasksForUi: (tasks: Task[]) => Task[];
  tasks: Task[];
  deleteTaskRow: (taskId: string, expectedTask?: Task | null) => Promise<DeleteTaskRowResult>;
};

export function useTaskCrudActions({
  client,
  canonicalTaskCreator,
  clearPendingTaskMutations,
  canonicalCommandExecutor = (action, task) => executeTaskStateRuntimeAction(action, task),
  currentUserId,
  markPendingTaskMutations,
  onTaskRevealRequested,
  runMilestoneTaskTrash,
  setMessage,
  setTaskRouting,
  setTasks,
  shouldRouteTaskToInbox,
  sortTasksForUi,
  tasks,
  isMilestoneTask,
  deleteTaskRow,
}: UseTaskCrudActionsOptions) {
  const createTask = canonicalTaskCreator ?? ((payload: TaskInsert, source?: "task_creation" | "task_import") => insertTaskRowWithCanonicalCreation(client, payload, source));

  async function importTasks(lines: string[], options?: TaskImportOptions) {
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
    const total = countImportedTaskNodes(parsed.tasks);
    let processed = 0;
    const markProcessed = () => {
      processed = Math.min(total, processed + 1);
      options?.onProgress?.({ processed, total });
    };
    const markSkippedDescendants = (children: ImportedTaskSubtask[]) => {
      for (const child of children) {
        markProcessed();
        markSkippedDescendants(child.children);
      }
    };
    options?.onProgress?.({ processed, total });

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

      let insertResult: ImportedTaskInsertResult;
      try {
        insertResult = await insertImportedTaskRow({
          canonicalTaskCreator: createTask,
          payload,
        });
      } catch (error) {
        importErrors.push({
          line: parsedTask.line,
          message: error instanceof Error ? error.message : "Task insert failed.",
        });
        markProcessed();
        markSkippedDescendants(parsedTask.subtasks);
        continue;
      }
      if (insertResult.error) {
        importErrors.push({ line: parsedTask.line, message: insertResult.error.message });
        markProcessed();
        markSkippedDescendants(parsedTask.subtasks);
        continue;
      }

      if (!insertResult.data) {
        importErrors.push({ line: parsedTask.line, message: "Task insert returned no row." });
        markProcessed();
        markSkippedDescendants(parsedTask.subtasks);
        continue;
      }

      markProcessed();

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
          canonicalTaskCreator: createTask,
          currentUserId,
          importErrors,
          parentTaskId: insertResult.data.id,
          warnings,
          onTaskSettled: markProcessed,
          markSkippedDescendants,
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
      if (importedRootTasks.length > 0) {
        onTaskRevealRequested?.(importedRootTasks[0].id);
      }
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

      if (expectedTask && expectedTask.status !== "trashed") {
        if (isMilestoneTask?.(expectedTask) && runMilestoneTaskTrash) {
          const milestoneResult = await runMilestoneTaskTrash(expectedTask);
          if (milestoneResult.handled) {
            if (milestoneResult.error) firstErrorMessage ??= milestoneResult.error;
            else if (milestoneResult.task) movedToTrashTasks.push(milestoneResult.task);
            continue;
          }
        }

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

type ImportedTaskInsertResult = {
  data: Task | null;
  error: { message: string } | null;
  usedEnergyFallback: boolean;
};

async function insertImportedTaskRow({
  canonicalTaskCreator,
  payload,
}: {
  canonicalTaskCreator: CanonicalTaskCreator;
  payload: TaskInsert;
}): Promise<ImportedTaskInsertResult> {
  const result = await canonicalTaskCreator(payload, "task_import");
  return {
    data: result.data,
    error: result.error,
    usedEnergyFallback: result.usedEnergyFallback,
  };
}

async function insertImportedChildTaskTree({
  children,
  canonicalTaskCreator,
  currentUserId,
  importErrors,
  parentTaskId,
  warnings,
  onTaskSettled,
  markSkippedDescendants,
}: {
  children: ImportedTaskSubtask[];
  canonicalTaskCreator: CanonicalTaskCreator;
  currentUserId: string;
  importErrors: ImportedTaskWarning[];
  parentTaskId: string;
  warnings: ImportedTaskWarning[];
  onTaskSettled: () => void;
  markSkippedDescendants: (children: ImportedTaskSubtask[]) => void;
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
      onTaskSettled();
      markSkippedDescendants(child.children);
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

    let insertResult: ImportedTaskInsertResult;
    try {
      insertResult = await insertImportedTaskRow({
        canonicalTaskCreator,
        payload,
      });
    } catch (error) {
      importErrors.push({
        line: child.line,
        message: error instanceof Error ? error.message : "Step insert failed.",
      });
      onTaskSettled();
      markSkippedDescendants(child.children);
      continue;
    }
    if (insertResult.error) {
      importErrors.push({ line: child.line, message: insertResult.error.message });
      onTaskSettled();
      markSkippedDescendants(child.children);
      continue;
    }

    if (!insertResult.data) {
      importErrors.push({ line: child.line, message: "Step insert returned no row." });
      onTaskSettled();
      markSkippedDescendants(child.children);
      continue;
    }

    onTaskSettled();

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
        canonicalTaskCreator,
        currentUserId,
        importErrors,
        parentTaskId: insertResult.data.id,
        warnings,
        onTaskSettled,
        markSkippedDescendants,
      });
      insertedTasks.push(...descendantImport.insertedTasks);
    }
  }

  return { insertedTasks };
}
