"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dispatch, SetStateAction } from "react";
import type { Task, TaskInsert, TaskSubtaskStatus } from "@/lib/database.types";
import type { TaskRoutingBucket } from "@/lib/task-buckets";
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
  replaceTaskSubtasks: (taskId: string, subtasks: Array<{ children: ImportedTaskSubtask[]; id: string; status: TaskSubtaskStatus; title: string }>) => Promise<{ saved: boolean; usedNestedFallback: boolean }>;
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
  replaceTaskSubtasks,
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
      setTasks((current) => sortTasksForUi([...current, ...importedTasks]));
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

  async function deleteTasks(taskIds: string[]) {
    markPendingTaskMutations?.(taskIds);
    const { error } = await client
      .from("adhdice_clean_tasks")
      .delete()
      .in("id", taskIds)
      .eq("user_id", currentUserId);

    if (error) {
      clearPendingTaskMutations?.(taskIds);
      setMessage({ tone: "warn", text: error.message });
      return false;
    }

    setTasks((current) => current.filter((task) => !taskIds.includes(task.id)));
    setTaskRouting((current) => {
      const next = { ...current };
      for (const taskId of taskIds) {
        delete next[taskId];
      }
      return next;
    });
    setMessage({ tone: "good", text: `Deleted ${taskIds.length} task${taskIds.length === 1 ? "" : "s"}.` });
    return true;
  }

  return {
    deleteTasks,
    importTasks,
  };
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
