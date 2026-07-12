"use client";

import { useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TaskList, TaskListInsert } from "@/lib/database.types";
import { reconcileTaskListRows } from "@/lib/task-list-mappers";
import { getStoredTaskListMembershipMode, type TaskListDefinition, type TaskListId, type TaskListManualMembership } from "@/lib/task-lists";

type Message = {
  text: string;
  tone: "neutral" | "good" | "warn";
};

type TaskListSaveInput = {
  id: TaskListId;
  isVisible: boolean;
  name: string;
  orderedListIds: TaskListId[];
  rules: unknown;
};

type CustomTaskListInput = {
  membershipMode: "manual" | "rules";
  name: string;
  rules: unknown;
};

type PersistTaskListDefinitionsOptions = {
  missingTableMessage: string;
  nextDefinitions: TaskListDefinition[];
  successMessage: string;
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
  setTaskListManualMemberships?: Dispatch<SetStateAction<TaskListManualMembership[]>>;
  setTaskLists?: Dispatch<SetStateAction<TaskListDefinition[]>>;
  taskListDataGeneration?: MutableRefObject<number>;
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
    setTaskListManualMemberships = NOOP_SETTER as Dispatch<SetStateAction<TaskListManualMembership[]>>,
    setTaskLists = NOOP_SETTER as Dispatch<SetStateAction<TaskListDefinition[]>>,
    taskListDataGeneration,
    taskLists = [],
  } = options;
  const latestReorderRequestIdRef = useRef(0);
  const latestTaskListsRef = useRef(taskLists);
  latestTaskListsRef.current = taskLists;

  async function persistTaskListDefinitions({
    missingTableMessage,
    nextDefinitions,
    successMessage,
  }: PersistTaskListDefinitionsOptions) {
    setTaskLists(nextDefinitions);

    if (!client || !currentUserId) {
      setMessage({ tone: "warn", text: "Task list settings are unavailable right now." });
      return false;
    }

    const payloads: TaskListInsert[] = nextDefinitions.map((definition) => ({
      built_in_key: isBuiltInTaskListId(definition.id) ? definition.id : null,
      id: definition.id,
      is_deletable: definition.isDeletable,
      is_editable: definition.isEditable,
      is_visible: definition.isVisible,
      list_type: definition.type,
      membership_mode: getStoredTaskListMembershipMode(definition.membershipMode),
      name: definition.name,
      rules_json: definition.rules ? JSON.stringify(definition.rules) : null,
      sort_order: definition.sortOrder,
      user_id: currentUserId,
    }));

    const { data, error } = await client
      .from("adhdice_task_lists")
      .upsert(payloads, { onConflict: "user_id,id" })
      .select("*");

    if (error) {
      if (isMissingTaskListsTableError(error.message)) {
        setMessage({ tone: "warn", text: missingTableMessage });
        return true;
      }
      setMessage({ tone: "warn", text: error.message });
      return false;
    }

    if (data) {
      const mappedRows = reconcileTaskListRows(data, mapTaskListRow);
      if (mappedRows.length > 0) {
        mappedRows.sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
        setTaskLists(mappedRows);
      }
    }

    setMessage({ tone: "good", text: successMessage });
    return true;
  }

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

    const allDefinitionsById = new Map<TaskListId, TaskListDefinition>(availableTaskLists.map((list) => [list.id, list]));
    const normalizedOrderedListIds = [
      ...input.orderedListIds.filter((listId, index, listIds) => allDefinitionsById.has(listId) && listIds.indexOf(listId) === index),
      ...availableTaskLists.map((list) => list.id).filter((listId) => !input.orderedListIds.includes(listId)),
    ];

    const nextDefinitions = normalizedOrderedListIds.map((listId, index) => {
      const currentDefinition = allDefinitionsById.get(listId)!;
      if (listId !== input.id) {
        return {
          ...currentDefinition,
          sortOrder: index,
        };
      }

      return {
        ...currentDefinition,
        isVisible: input.isVisible,
        name: currentDefinition.type === "custom" ? input.name : currentDefinition.name,
        rules: currentDefinition.membershipMode === "manual" ? null : (input.rules as TaskListDefinition["rules"]),
        sortOrder: index,
      };
    });
    const savedDefinition = nextDefinitions.find((list) => list.id === input.id) ?? baseline;
    const saved = await persistTaskListDefinitions({
      missingTableMessage: "Task list settings are not migrated yet, so these changes will only last for this session.",
      nextDefinitions,
      successMessage: `${savedDefinition.name} settings saved.`,
    });
    if (!saved) {
      return false;
    }
    return reorderTaskLists(normalizedOrderedListIds);
  }

  async function reorderTaskLists(orderedListIds: TaskListId[]) {
    if (!client || !currentUserId) {
      setMessage({ tone: "warn", text: "Task list settings are unavailable right now." });
      return false;
    }

    const requestId = latestReorderRequestIdRef.current + 1;
    latestReorderRequestIdRef.current = requestId;
    if (taskListDataGeneration) {
      taskListDataGeneration.current += 1;
    }
    const fixedListIds = new Set<TaskListId>(["routine"]);
    const reorderableLists = availableTaskLists.filter((list) => !fixedListIds.has(list.id));
    if (reorderableLists.length <= 1) {
      return true;
    }

    const reorderableListIds = new Set(reorderableLists.map((list) => list.id));
    const normalizedOrderedListIds = [
      ...orderedListIds.filter((listId, index, listIds) => reorderableListIds.has(listId) && listIds.indexOf(listId) === index),
      ...reorderableLists.map((list) => list.id).filter((listId) => !orderedListIds.includes(listId)),
    ];

    let reorderableListIndex = 0;
    const nextDefinitions = availableTaskLists.map((list, index) => {
      const nextList = reorderableListIds.has(list.id)
        ? availableTaskLists.find((entry) => entry.id === normalizedOrderedListIds[reorderableListIndex++]) ?? list
        : list;

      return {
        ...nextList,
        sortOrder: index,
      };
    });

    const previousTaskLists = latestTaskListsRef.current;
    latestTaskListsRef.current = nextDefinitions;
    setTaskLists(nextDefinitions);
    const { data, error } = await client.rpc("reorder_task_lists", {
      ordered_list_ids: normalizedOrderedListIds,
    });

    if (error) {
      if (requestId !== latestReorderRequestIdRef.current) {
        return false;
      }
      latestTaskListsRef.current = previousTaskLists;
      setTaskLists(previousTaskLists);
      if (isMissingTaskListsTableError(error.message)) {
        setMessage({ tone: "warn", text: "Task-list ordering requires the 6.25.27 Supabase migration." });
        return false;
      }
      setMessage({ tone: "warn", text: error.message });
      return false;
    }

    if (requestId !== latestReorderRequestIdRef.current) {
      return true;
    }

    const mappedRows = reconcileTaskListRows(data ?? [], mapTaskListRow);
    const returnedIds = new Set(mappedRows.map((row) => row.id));
    const responseIsComplete = normalizedOrderedListIds.every((listId) => returnedIds.has(listId));
    if (!responseIsComplete || mappedRows.length === 0) {
      latestTaskListsRef.current = previousTaskLists;
      setTaskLists(previousTaskLists);
      setMessage({ tone: "warn", text: "The saved list order response was incomplete. Please try again." });
      return false;
    }
    mappedRows.sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
    latestTaskListsRef.current = mappedRows;
    setTaskLists(mappedRows);
    setMessage({ tone: "good", text: "List order saved." });
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
      sortOrder: availableTaskLists.reduce((maxSortOrder, list) => Math.max(maxSortOrder, list.sortOrder), -1) + 1,
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
    reorderTaskLists,
    saveTaskListDefinition,
  };
}
