"use client";

import type { Dispatch, SetStateAction } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TaskListManualMembership as DbTaskListManualMembership } from "@/lib/database.types";
import type { TaskListId, TaskListManualMembership } from "@/lib/task-lists";
import type { TaskRoutingBucket } from "@/lib/task-buckets";

type Message = {
  text: string;
  tone: "neutral" | "good" | "warn";
};

type UseTaskRoutingActionsOptions = {
  client: SupabaseClient;
  currentUserId: string;
  isMissingTaskListManualMembershipsTableError: (message: string) => boolean;
  manualMembershipsByTaskId: Record<string, TaskListId[]>;
  mapTaskListManualMembershipRow: (row: DbTaskListManualMembership) => TaskListManualMembership;
  setMessage: Dispatch<SetStateAction<Message | null>>;
  setTaskListManualMemberships: Dispatch<SetStateAction<TaskListManualMembership[]>>;
  setTaskRouting: Dispatch<SetStateAction<Record<string, TaskRoutingBucket>>>;
  taskListManualMemberships: TaskListManualMembership[];
};

export function useTaskRoutingActions({
  client,
  currentUserId,
  isMissingTaskListManualMembershipsTableError,
  manualMembershipsByTaskId,
  mapTaskListManualMembershipRow,
  setMessage,
  setTaskListManualMemberships,
  setTaskRouting,
  taskListManualMemberships,
}: UseTaskRoutingActionsOptions) {
  function routeTask(taskId: string, bucket: TaskRoutingBucket | null) {
    setTaskRouting((current) => {
      if (!bucket) {
        return Object.fromEntries(
          Object.entries(current).filter(([id]) => id !== taskId),
        ) as Record<string, TaskRoutingBucket>;
      }

      return {
        ...current,
        [taskId]: bucket,
      };
    });
  }

  async function setTaskManualListMembership(taskId: string, listId: TaskListId, included: boolean) {
    const isCompatibilityList = listId === "today" || listId === "later" || listId === "quick_wins" || listId === "waiting";

    setTaskListManualMemberships((current) => {
      const alreadyIncluded = current.some((membership) => membership.task_id === taskId && membership.list_id === listId);
      if (included) {
        if (alreadyIncluded) {
          return current;
        }
        return [
          ...current,
          {
            created_at: new Date().toISOString(),
            id: `temp:${taskId}:${listId}`,
            list_id: listId,
            task_id: taskId,
            user_id: currentUserId,
          },
        ];
      }

      return current.filter((membership) => !(membership.task_id === taskId && membership.list_id === listId));
    });

    if (isCompatibilityList) {
      routeTask(taskId, included ? listId : null);
    }

    const existingMembership = taskListManualMemberships.find((membership) => membership.task_id === taskId && membership.list_id === listId);
    if (included && existingMembership && !existingMembership.id.startsWith("temp:")) {
      return;
    }

    if (!included && !existingMembership) {
      return;
    }

    if (included) {
      const { data, error } = await client
        .from("adhdice_task_list_manual_memberships")
        .insert({
          list_id: listId,
          task_id: taskId,
          user_id: currentUserId,
        })
        .select("*")
        .single();

      if (error) {
        if (isMissingTaskListManualMembershipsTableError(error.message)) {
          return;
        }
        setMessage({ tone: "warn", text: error.message });
        return;
      }

      if (data) {
        const mapped = mapTaskListManualMembershipRow(data);
        setTaskListManualMemberships((current) => [
          ...current.filter((membership) => !(membership.task_id === taskId && membership.list_id === listId)),
          mapped,
        ]);
      }

      return;
    }

    const membershipId = existingMembership?.id ?? null;
    if (membershipId && !membershipId.startsWith("temp:")) {
      const { error } = await client
        .from("adhdice_task_list_manual_memberships")
        .delete()
        .eq("id", membershipId)
        .eq("user_id", currentUserId);

      if (error && !isMissingTaskListManualMembershipsTableError(error.message)) {
        setMessage({ tone: "warn", text: error.message });
      }
    }
  }

  async function toggleTaskManualListMembership(taskId: string, listId: string) {
    const typedListId = listId as TaskListId;
    const currentlyIncluded = (manualMembershipsByTaskId[taskId] ?? []).includes(typedListId);
    await setTaskManualListMembership(taskId, typedListId, !currentlyIncluded);
  }

  return {
    routeTask,
    setTaskManualListMembership,
    toggleTaskManualListMembership,
  };
}
