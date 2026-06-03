"use client";

import type { Dispatch, SetStateAction } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TaskList, TaskListInsert } from "@/lib/database.types";
import type { TaskListDefinition, TaskListId } from "@/lib/task-lists";

type Message = {
  text: string;
  tone: "neutral" | "good" | "warn";
};

type TaskListSaveInput = {
  id: TaskListId;
  isVisible: boolean;
  name: string;
  rules: unknown;
};

type CustomTaskListInput = {
  membershipMode: "manual" | "rules";
  name: string;
  rules: unknown;
};

type UseTaskListActionsOptions = {
  availableTaskLists?: TaskListDefinition[];
  builtInTaskLists?: TaskListDefinition[];
  client?: SupabaseClient;
  currentUserId?: string;
  isBuiltInTaskListId?: (value: string) => boolean;
  isMissingTaskListsTableError?: (message: string) => boolean;
  mapTaskListRow?: (row: TaskList) => TaskListDefinition | null;
  setMessage?: Dispatch<SetStateAction<Message | null>>;
  setTaskListManualMemberships?: Dispatch<SetStateAction<Array<{ id: string; list_id: string; task_id: string; user_id: string; created_at: string }>>>;
  setTaskLists?: Dispatch<SetStateAction<TaskListDefinition[]>>;
  taskLists?: TaskListDefinition[];
};

const NOOP_SETTER = () => {};

export function useTaskListActions(options: UseTaskListActionsOptions = {}) {
  const {
    availableTaskLists = [],
    builtInTaskLists = [],
    client,
    currentUserId = "",
    isBuiltInTaskListId = () => false,
    isMissingTaskListsTableError = () => false,
    mapTaskListRow = () => null,
    setMessage = NOOP_SETTER as Dispatch<SetStateAction<Message | null>>,
    setTaskListManualMemberships = NOOP_SETTER as Dispatch<SetStateAction<Array<{ id: string; list_id: string; task_id: string; user_id: string; created_at: string }>>>,
    setTaskLists = NOOP_SETTER as Dispatch<SetStateAction<TaskListDefinition[]>>,
    taskLists = [],
  } = options;

  async function saveTaskListDefinition(input: TaskListSaveInput) {
    if (!client || !currentUserId) {
      setMessage({ tone: "warn", text: "Task list settings are unavailable right now." });
      return false;
    }
    const existingOverride = taskLists.find((list) => list.id === input.id) ?? null;
    const builtInList = builtInTaskLists.find((list) => list.id === input.id) ?? null;
    const baseline = existingOverride ?? builtInList;
    if (!baseline) {
      setMessage({ tone: "warn", text: "That list could not be found." });
      return false;
    }

    const nextDefinition: TaskListDefinition = {
      ...baseline,
      isVisible: input.isVisible,
      name: baseline.type === "custom" ? input.name : baseline.name,
      rules: baseline.membershipMode === "manual" ? null : (input.rules as TaskListDefinition["rules"]),
    };

    setTaskLists((current) => [
      ...current.filter((list) => list.id !== nextDefinition.id),
      nextDefinition,
    ]);

    const payload: TaskListInsert = {
      built_in_key: isBuiltInTaskListId(nextDefinition.id) ? nextDefinition.id : null,
      id: nextDefinition.id,
      is_deletable: nextDefinition.isDeletable,
      is_editable: nextDefinition.isEditable,
      is_visible: nextDefinition.isVisible,
      list_type: nextDefinition.type,
      membership_mode: nextDefinition.membershipMode,
      name: nextDefinition.name,
      rules_json: nextDefinition.rules ? JSON.stringify(nextDefinition.rules) : null,
      sort_order: nextDefinition.sortOrder,
      user_id: currentUserId,
    };

    const { data, error } = await client
      .from("adhdice_task_lists")
      .upsert(payload, { onConflict: "id" })
      .select("*")
      .single();

    if (error) {
      if (isMissingTaskListsTableError(error.message)) {
        setMessage({ tone: "warn", text: "Task list settings are not migrated yet, so these changes will only last for this session." });
        return true;
      }
      setMessage({ tone: "warn", text: error.message });
      return false;
    }

    if (data) {
      const mapped = mapTaskListRow(data);
      if (mapped) {
        setTaskLists((current) => [
          ...current.filter((list) => list.id !== mapped.id),
          mapped,
        ]);
      }
    }

    setMessage({ tone: "good", text: `${nextDefinition.name} settings saved.` });
    return true;
  }

  async function createCustomTaskList(input: CustomTaskListInput) {
    if (!client || !currentUserId) {
      setMessage({ tone: "warn", text: "Task lists are unavailable right now." });
      return false;
    }
    const nextId = `list:${crypto.randomUUID()}` as TaskListId;
    const nextDefinition: TaskListDefinition = {
      description: input.membershipMode === "manual"
        ? "Manual custom list."
        : "Custom smart list driven by rules.",
      id: nextId,
      isDeletable: true,
      isEditable: true,
      isVisible: true,
      membershipMode: input.membershipMode,
      name: input.name,
      rules: input.membershipMode === "rules" ? (input.rules as TaskListDefinition["rules"]) : null,
      sortOrder: availableTaskLists.length + taskLists.length + 1,
      type: "custom",
    };

    setTaskLists((current) => [...current, nextDefinition]);

    const payload: TaskListInsert = {
      built_in_key: null,
      id: nextDefinition.id,
      is_deletable: true,
      is_editable: true,
      is_visible: true,
      list_type: "custom",
      membership_mode: nextDefinition.membershipMode,
      name: nextDefinition.name,
      rules_json: nextDefinition.rules ? JSON.stringify(nextDefinition.rules) : null,
      sort_order: nextDefinition.sortOrder,
      user_id: currentUserId,
    };

    const { data, error } = await client
      .from("adhdice_task_lists")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      if (isMissingTaskListsTableError(error.message)) {
        setMessage({ tone: "warn", text: "Task lists are not migrated yet, so this custom list will only last for this session." });
        return { id: nextDefinition.id, persisted: false };
      }
      setMessage({ tone: "warn", text: error.message });
      return false;
    }

    if (data) {
      const mapped = mapTaskListRow(data);
      if (mapped) {
        setTaskLists((current) => [
          ...current.filter((list) => list.id !== mapped.id),
          mapped,
        ]);
      }
    }

    setMessage({ tone: "good", text: `${nextDefinition.name} created.` });
    return { id: nextDefinition.id, persisted: true };
  }

  async function deleteTaskList(listId: TaskListId) {
    const existing = taskLists.find((list) => list.id === listId);
    if (!existing) {
      setMessage({ tone: "warn", text: "That list could not be found." });
      return false;
    }
    if (!existing.isDeletable || existing.type !== "custom") {
      setMessage({ tone: "warn", text: "Only custom lists can be deleted here." });
      return false;
    }

    setTaskLists((current) => current.filter((list) => list.id !== listId));
    setTaskListManualMemberships((current) => current.filter((membership) => membership.list_id !== listId));

    if (!client || !currentUserId) {
      setMessage({ tone: "warn", text: "Task list settings are unavailable right now." });
      return false;
    }

    const { error: membershipDeleteError } = await client
      .from("adhdice_task_list_manual_memberships")
      .delete()
      .eq("list_id", listId)
      .eq("user_id", currentUserId);

    if (membershipDeleteError && !isMissingTaskListsTableError(membershipDeleteError.message)) {
      setMessage({ tone: "warn", text: membershipDeleteError.message });
      return false;
    }

    const { error } = await client
      .from("adhdice_task_lists")
      .delete()
      .eq("id", listId)
      .eq("user_id", currentUserId);

    if (error) {
      if (isMissingTaskListsTableError(error.message)) {
        return true;
      }
      setMessage({ tone: "warn", text: error.message });
      return false;
    }

    setMessage({ tone: "good", text: `${existing.name} deleted.` });
    return true;
  }

  return {
    createCustomTaskList,
    deleteTaskList,
    saveTaskListDefinition,
  };
}
