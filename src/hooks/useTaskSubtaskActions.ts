"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dispatch, SetStateAction } from "react";
import { isUuid } from "@/lib/focus-utils";
import type { LegacySubtaskPromotion, Task, TaskStatus, TaskSubtask as DbTaskSubtask, TaskSubtaskInsert, TaskSubtaskStatus, TaskUpdate } from "@/lib/database.types";
import type { TaskSubtaskDraft } from "@/components/task-app/task-editor-model";
import { TASK_STATE_CANONICAL_COMMANDS_ENABLED } from "@/lib/task-state-runtime-gate";

type Message = {
  text: string;
  tone: "neutral" | "good" | "warn";
};

type UseTaskSubtaskActionsOptions = {
  canonicalCommandsEnabled?: boolean;
  canonicalTaskStateUpdate?: (taskId: string, values: TaskUpdate, options?: { expectedTask?: Task | null }) => Promise<boolean>;
  client: SupabaseClient;
  currentUserId: string;
  isMissingParentSubtaskColumnError: (message: string) => boolean;
  mapTaskSubtaskRow: (row: DbTaskSubtask) => DbTaskSubtask;
  onSubtaskCompletedReward?: (candidates: Array<{ claimRef: { subtaskId: string; taskId: string; title: string }; previousStatus: TaskStatus | null; task: Task }>) => Promise<void>;
  setMessage: Dispatch<SetStateAction<Message | null>>;
  setSupportsNestedSubtasks: Dispatch<SetStateAction<boolean>>;
  setTaskSubtasks: Dispatch<SetStateAction<DbTaskSubtask[]>>;
  supportsNestedSubtasks: boolean;
  tasks: Task[];
  taskSubtasks: DbTaskSubtask[];
  taskLegacySubtaskPromotions?: LegacySubtaskPromotion[];
};

export function useTaskSubtaskActions({
  canonicalCommandsEnabled = TASK_STATE_CANONICAL_COMMANDS_ENABLED,
  canonicalTaskStateUpdate,
  client,
  currentUserId,
  isMissingParentSubtaskColumnError,
  mapTaskSubtaskRow,
  onSubtaskCompletedReward,
  setMessage,
  setSupportsNestedSubtasks,
  setTaskSubtasks,
  supportsNestedSubtasks,
  tasks,
  taskSubtasks,
  taskLegacySubtaskPromotions = [],
}: UseTaskSubtaskActionsOptions) {
  const promotedTaskByLegacyId = new Map(taskLegacySubtaskPromotions.map((promotion) => [promotion.legacy_subtask_id, promotion.task_id]));

  async function updatePromotedTask(legacySubtaskId: string, values: TaskUpdate) {
    const taskId = promotedTaskByLegacyId.get(legacySubtaskId);
    if (!taskId || !canonicalTaskStateUpdate) return null;
    const task = tasks.find((candidate) => candidate.id === taskId) ?? null;
    if (!task) {
      setMessage({ tone: "warn", text: "The promoted Step no longer exists; no legacy child-state fallback was used." });
      return false;
    }
    return canonicalTaskStateUpdate(taskId, values, { expectedTask: task });
  }
  function isRewardSubtaskStatus(status: TaskSubtaskStatus) {
    return status === "done" || status === "did_my_best";
  }

  async function replaceTaskSubtasks(taskId: string, subtasks: TaskSubtaskDraft[]) {
    const promotedIds = new Set<string>(taskLegacySubtaskPromotions
      .filter((promotion) => taskSubtasks.some((subtask) => subtask.id === promotion.legacy_subtask_id && subtask.task_id === taskId))
      .map((promotion) => promotion.legacy_subtask_id)
      .filter((id): id is string => typeof id === "string"));
    let deleteQuery = client
      .from("adhdice_task_subtasks")
      .delete()
      .eq("task_id", taskId)
      .eq("user_id", currentUserId);
    if (promotedIds.size > 0) deleteQuery = deleteQuery.not("id", "in", `(${[...promotedIds].join(",")})`);
    const { error: deleteError } = await deleteQuery;

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

    if (canonicalCommandsEnabled && promotedIds.size > 0) {
      for (const draft of cleanedSubtasks) {
        if (!draft.id || !promotedIds.has(draft.id)) continue;
        const promoted = await updatePromotedTask(draft.id, { title: draft.title, status: draft.status as TaskStatus });
        if (promoted !== true) return { saved: false, usedNestedFallback: false };
      }
    }

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
    if (canonicalCommandsEnabled) {
      const promoted = taskSubtasks.filter((subtask) => subtask.task_id === taskId && promotedTaskByLegacyId.has(subtask.id));
      for (const subtask of promoted) {
        if (await updatePromotedTask(subtask.id, { status: "pending" }) !== true) return false;
      }
      const legacyOnly = taskSubtasks.some((subtask) => subtask.task_id === taskId && !promotedTaskByLegacyId.has(subtask.id));
      if (!legacyOnly) return true;
    }
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
    if (canonicalCommandsEnabled) {
      if (promotedTaskByLegacyId.has(subtaskId)) {
        if (status === "upcoming" || status === "not_due") {
          setMessage({ tone: "warn", text: "Upcoming and Not Due are derived canonical Step states and cannot be written directly." });
          return false;
        }
        return (await updatePromotedTask(subtaskId, { status })) === true;
      }
      // Unpromoted checklist rows are intentionally legacy-only entities.
    }
    const previousSubtask = taskSubtasks.find((subtask) => subtask.id === subtaskId) ?? null;
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

    if (
      onSubtaskCompletedReward
      && previousSubtask
      && isRewardSubtaskStatus(mappedSubtask.status)
      && !isRewardSubtaskStatus(previousSubtask.status)
    ) {
      const parentTask = tasks.find((task) => task.id === mappedSubtask.task_id);
      if (parentTask) {
        await onSubtaskCompletedReward([{
          claimRef: {
            subtaskId: mappedSubtask.id,
            taskId: parentTask.id,
            title: mappedSubtask.title,
          },
          previousStatus: null,
          task: parentTask,
        }]);
      }
    }
  }

  async function renameTaskSubtask(subtaskId: string, title: string) {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      return false;
    }

    if (canonicalCommandsEnabled && promotedTaskByLegacyId.has(subtaskId)) {
      return (await updatePromotedTask(subtaskId, { title: trimmedTitle })) === true;
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
    if (canonicalCommandsEnabled) {
      if (promotedTaskByLegacyId.has(subtaskId)) {
        return (await updatePromotedTask(subtaskId, { status: "trashed" })) === true;
      }
      // Unpromoted checklist rows remain an explicitly noncanonical entity.
    }
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
    // This API adds a legacy checklist row. Same-table canonical Steps are
    // created through the Task creation coordinator, so the two models never
    // silently compete for the same logical child.
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
    // See addTaskSubtask: an unpromoted nested checklist remains explicitly
    // legacy-only and cannot conflict with a promoted canonical Step.
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
