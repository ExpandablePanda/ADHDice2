"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dispatch, SetStateAction } from "react";
import { isUuid } from "@/lib/focus-utils";
import type { TaskSubtask as DbTaskSubtask, TaskSubtaskInsert, TaskSubtaskStatus } from "@/lib/database.types";
import type { TaskSubtaskDraft } from "@/components/task-app/task-editor-model";

type Message = {
  text: string;
  tone: "neutral" | "good" | "warn";
};

type UseTaskSubtaskActionsOptions = {
  client: SupabaseClient;
  currentUserId: string;
  isMissingParentSubtaskColumnError: (message: string) => boolean;
  mapTaskSubtaskRow: (row: DbTaskSubtask) => DbTaskSubtask;
  setMessage: Dispatch<SetStateAction<Message | null>>;
  setSupportsNestedSubtasks: Dispatch<SetStateAction<boolean>>;
  setTaskSubtasks: Dispatch<SetStateAction<DbTaskSubtask[]>>;
  supportsNestedSubtasks: boolean;
  taskSubtasks: DbTaskSubtask[];
};

export function useTaskSubtaskActions({
  client,
  currentUserId,
  isMissingParentSubtaskColumnError,
  mapTaskSubtaskRow,
  setMessage,
  setSupportsNestedSubtasks,
  setTaskSubtasks,
  supportsNestedSubtasks,
  taskSubtasks,
}: UseTaskSubtaskActionsOptions) {
  async function replaceTaskSubtasks(taskId: string, subtasks: TaskSubtaskDraft[]) {
    const { error: deleteError } = await client
      .from("adhdice_task_subtasks")
      .delete()
      .eq("task_id", taskId)
      .eq("user_id", currentUserId);

    if (deleteError) {
      setMessage({ tone: "warn", text: deleteError.message });
      return { saved: false, usedNestedFallback: false };
    }

    const counter = { n: 0 };
    function flattenRecursive(items: TaskSubtaskDraft[], parentId: string | null = null): TaskSubtaskInsert[] {
      const result: TaskSubtaskInsert[] = [];
      for (const item of items) {
        const trimmed = item.title.trim();
        if (!trimmed) continue;
        const id = isUuid(item.id) ? item.id : crypto.randomUUID();
        result.push({
          id,
          parent_subtask_id: parentId,
          sort_order: counter.n++,
          status: item.status,
          task_id: taskId,
          title: trimmed,
          user_id: currentUserId,
        });
        result.push(...flattenRecursive(item.children, id));
      }
      return result;
    }
    const cleanedSubtasks = flattenRecursive(subtasks);

    if (cleanedSubtasks.length === 0) {
      setTaskSubtasks((current) => current.filter((subtask) => subtask.task_id !== taskId));
      return { saved: true, usedNestedFallback: false };
    }

    const { data, error } = await client
      .from("adhdice_task_subtasks")
      .insert(cleanedSubtasks)
      .select("*");

    if (error && isMissingParentSubtaskColumnError(error.message)) {
      setSupportsNestedSubtasks(false);
      const fallbackPayload = cleanedSubtasks.map((subtask) => ({
        ...subtask,
        parent_subtask_id: undefined,
      }));
      const { data: fallbackData, error: fallbackError } = await client
        .from("adhdice_task_subtasks")
        .insert(fallbackPayload)
        .select("*");

      if (fallbackError) {
        setMessage({ tone: "warn", text: fallbackError.message });
        return { saved: false, usedNestedFallback: false };
      }

      const mappedFallbackSubtasks = (fallbackData ?? []).map(mapTaskSubtaskRow);
      setTaskSubtasks((current) => [
        ...current.filter((subtask) => subtask.task_id !== taskId),
        ...mappedFallbackSubtasks,
      ]);
      return { saved: true, usedNestedFallback: true };
    }

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return { saved: false, usedNestedFallback: false };
    }

    setSupportsNestedSubtasks(true);
    const mappedSubtasks = (data ?? []).map(mapTaskSubtaskRow);
    setTaskSubtasks((current) => [
      ...current.filter((subtask) => subtask.task_id !== taskId),
      ...mappedSubtasks,
    ]);
    return { saved: true, usedNestedFallback: false };
  }

  async function resetTaskSubtasksToPending(taskId: string) {
    const { data, error } = await client
      .from("adhdice_task_subtasks")
      .update({ status: "pending" })
      .eq("task_id", taskId)
      .eq("user_id", currentUserId)
      .select("*");

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return false;
    }

    const mappedSubtasks = (data ?? []).map(mapTaskSubtaskRow);
    setTaskSubtasks((current) => [
      ...current.filter((subtask) => subtask.task_id !== taskId),
      ...mappedSubtasks,
    ]);
    return true;
  }

  async function updateTaskSubtaskStatus(subtaskId: string, status: TaskSubtaskStatus) {
    const { data, error } = await client
      .from("adhdice_task_subtasks")
      .update({ status })
      .eq("id", subtaskId)
      .eq("user_id", currentUserId)
      .select("*")
      .single();

    if (error) {
      const isMissingSubtaskStatusEnumValue = error.message.includes("adhdice_clean_task_subtask_status")
        && error.message.includes("invalid input value for enum");
      setMessage({
        tone: "warn",
        text: isMissingSubtaskStatusEnumValue
          ? "Your local database is missing the newer subtask statuses. Run the subtask status migration, then reload."
          : error.message,
      });
      return;
    }

    if (!data) return;
    const mappedSubtask = mapTaskSubtaskRow(data);
    setTaskSubtasks((current) => current.map((subtask) => subtask.id === mappedSubtask.id ? mappedSubtask : subtask));
  }

  async function renameTaskSubtask(subtaskId: string, title: string) {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      return false;
    }

    const { data, error } = await client
      .from("adhdice_task_subtasks")
      .update({ title: trimmedTitle })
      .eq("id", subtaskId)
      .eq("user_id", currentUserId)
      .select("*")
      .single();

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return false;
    }

    if (!data) {
      return false;
    }

    const mappedSubtask = mapTaskSubtaskRow(data);
    setTaskSubtasks((current) => current.map((subtask) => subtask.id === mappedSubtask.id ? mappedSubtask : subtask));
    return true;
  }

  function collectDescendantSubtaskIds(subtasks: DbTaskSubtask[], parentId: string): string[] {
    const directChildren = subtasks.filter((subtask) => (subtask.parent_subtask_id ?? null) === parentId);
    return directChildren.flatMap((subtask) => [subtask.id, ...collectDescendantSubtaskIds(subtasks, subtask.id)]);
  }

  async function deleteTaskSubtask(subtaskId: string) {
    const descendantIds = collectDescendantSubtaskIds(taskSubtasks, subtaskId);
    const idsToDelete = [subtaskId, ...descendantIds];

    const { error } = await client
      .from("adhdice_task_subtasks")
      .delete()
      .in("id", idsToDelete)
      .eq("user_id", currentUserId);

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return false;
    }

    const deletedIdSet = new Set(idsToDelete);
    setTaskSubtasks((current) => current.filter((subtask) => !deletedIdSet.has(subtask.id)));
    return true;
  }

  async function addTaskSubtask(taskId: string) {
    const nextSortOrder = taskSubtasks
      .filter((subtask) => subtask.task_id === taskId)
      .reduce((max, subtask) => Math.max(max, subtask.sort_order), -1) + 1;

    const basePayload = {
      id: crypto.randomUUID(),
      sort_order: nextSortOrder,
      status: "pending" as const,
      task_id: taskId,
      title: "New step",
      user_id: currentUserId,
    };

    const primaryPayload: TaskSubtaskInsert = supportsNestedSubtasks
      ? { ...basePayload, parent_subtask_id: null }
      : basePayload;

    let insertResult = await client
      .from("adhdice_task_subtasks")
      .insert(primaryPayload)
      .select("*")
      .single();

    if (insertResult.error && isMissingParentSubtaskColumnError(insertResult.error.message)) {
      setSupportsNestedSubtasks(false);
      insertResult = await client
        .from("adhdice_task_subtasks")
        .insert(basePayload)
        .select("*")
        .single();
    }

    if (insertResult.error) {
      setMessage({ tone: "warn", text: insertResult.error.message });
      return null;
    }

    if (!insertResult.data) {
      return null;
    }

    const mappedSubtask = mapTaskSubtaskRow(insertResult.data);
    setTaskSubtasks((current) => [...current, mappedSubtask]);
    return mappedSubtask.id;
  }

  async function addChildTaskSubtask(parentSubtaskId: string) {
    const parentSubtask = taskSubtasks.find((subtask) => subtask.id === parentSubtaskId) ?? null;
    if (!parentSubtask) {
      setMessage({ tone: "warn", text: "Could not find that parent step." });
      return null;
    }

    if (!supportsNestedSubtasks) {
      setMessage({
        tone: "warn",
        text: "Your database is missing nested-subtask support. Run the subtask parent migration to add child steps.",
      });
      return null;
    }

    const nextSortOrder = taskSubtasks
      .filter((subtask) => subtask.task_id === parentSubtask.task_id)
      .reduce((max, subtask) => Math.max(max, subtask.sort_order), -1) + 1;

    const payload: TaskSubtaskInsert = {
      id: crypto.randomUUID(),
      parent_subtask_id: parentSubtaskId,
      sort_order: nextSortOrder,
      status: "pending",
      task_id: parentSubtask.task_id,
      title: "New child step",
      user_id: currentUserId,
    };

    const { data, error } = await client
      .from("adhdice_task_subtasks")
      .insert(payload)
      .select("*")
      .single();

    if (error && isMissingParentSubtaskColumnError(error.message)) {
      setSupportsNestedSubtasks(false);
      setMessage({
        tone: "warn",
        text: "Your database is missing nested-subtask support. Run the subtask parent migration to add child steps.",
      });
      return null;
    }

    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return null;
    }

    if (!data) {
      return null;
    }

    setSupportsNestedSubtasks(true);
    const mappedSubtask = mapTaskSubtaskRow(data);
    setTaskSubtasks((current) => [...current, mappedSubtask]);
    return mappedSubtask.id;
  }

  return {
    addChildTaskSubtask,
    addTaskSubtask,
    deleteTaskSubtask,
    renameTaskSubtask,
    replaceTaskSubtasks,
    resetTaskSubtasksToPending,
    updateTaskSubtaskStatus,
  };
}
