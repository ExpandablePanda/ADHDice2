"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dispatch, SetStateAction } from "react";
import type { Task, TaskInsert, TaskStatus, TaskUpdate } from "@/lib/database.types";
import type { TaskSubtaskDraft } from "@/components/task-app/task-editor-model";
import { buildChildTaskCreationDraft } from "@/lib/task-child-creation";
import { insertTaskRowWithCanonicalCreation, type CanonicalTaskCreator } from "@/lib/task-db-mutations";
import { buildTaskHierarchyAdapter } from "@/lib/task-hierarchy";

type Message = {
  text: string;
  tone: "neutral" | "good" | "warn";
};

type UseTaskSubtaskActionsOptions = {
  canonicalTaskCreator?: CanonicalTaskCreator;
  canonicalTaskStateUpdate?: (taskId: string, values: TaskUpdate, options?: { expectedTask?: Task | null }) => Promise<boolean>;
  client: SupabaseClient;
  currentUserId: string;
  setMessage: Dispatch<SetStateAction<Message | null>>;
  setTasks: Dispatch<SetStateAction<Task[]>>;
  tasks: Task[];
};

export function useTaskSubtaskActions({
  canonicalTaskCreator,
  canonicalTaskStateUpdate,
  client,
  currentUserId,
  setMessage,
  setTasks,
  tasks,
}: UseTaskSubtaskActionsOptions) {
  const createTask = canonicalTaskCreator
    ?? ((payload: TaskInsert, source?: "task_creation" | "task_import") => insertTaskRowWithCanonicalCreation(client, payload, source));

  async function updateCanonicalTask(taskId: string, values: TaskUpdate) {
    if (!canonicalTaskStateUpdate) {
      setMessage({ tone: "warn", text: "Canonical Task State is unavailable; no child-task fallback was used." });
      return false;
    }
    const task = tasks.find((candidate) => candidate.id === taskId) ?? null;
    if (!task) {
      setMessage({ tone: "warn", text: "That child Task no longer exists." });
      return false;
    }
    return canonicalTaskStateUpdate(taskId, values, { expectedTask: task });
  }

  async function replaceTaskSubtasks(taskId: string, drafts: TaskSubtaskDraft[]) {
    const existingChildren = buildTaskHierarchyAdapter(tasks).getChildren(taskId);
    const retainedIds = new Set<string>();
    let sortOrder = 0;

    async function saveDrafts(items: TaskSubtaskDraft[], parentTaskId: string): Promise<boolean> {
      for (const item of items) {
        const title = item.title.trim();
        if (!title) continue;
        const existing = tasks.find((task) => task.id === item.id) ?? null;
        if (existing) {
          retainedIds.add(existing.id);
          if (await updateCanonicalTask(existing.id, {
            parent_task_id: parentTaskId,
            sort_order: sortOrder++,
            status: item.status,
            title,
          }) !== true) return false;
          if (!await saveDrafts(item.children, existing.id)) return false;
          continue;
        }

        const childDraft = buildChildTaskCreationDraft({ parentTaskId, title });
        if (!childDraft.ok) {
          setMessage({ tone: "warn", text: "A child Task could not be created because its parent link was invalid." });
          return false;
        }
        const result = await createTask({
          ...childDraft.draft,
          sort_order: sortOrder++,
          status: item.status,
          user_id: currentUserId,
        }, "task_creation");
        if (result.error || !result.data) {
          setMessage({ tone: "warn", text: result.error?.message ?? "Child Task creation returned no row." });
          return false;
        }
        retainedIds.add(result.data.id);
        setTasks((current) => [...current, result.data as Task]);
        if (!await saveDrafts(item.children, result.data.id)) return false;
      }
      return true;
    }

    if (!await saveDrafts(drafts, taskId)) {
      return { saved: false, usedNestedFallback: false };
    }

    for (const child of existingChildren) {
      if (!retainedIds.has(child.id)) {
        if (!await updateCanonicalTask(child.id, { status: "trashed" })) {
          return { saved: false, usedNestedFallback: false };
        }
      }
    }
    return { saved: true, usedNestedFallback: false };
  }

  async function resetTaskSubtasksToPending(taskId: string) {
    const descendants = buildTaskHierarchyAdapter(tasks).getDescendants(taskId);
    for (const child of descendants) {
      if (!await updateCanonicalTask(child.id, { status: "pending" })) return false;
    }
    return true;
  }

  async function updateTaskSubtaskStatus(subtaskId: string, status: TaskStatus) {
    const previousTask = tasks.find((task) => task.id === subtaskId) ?? null;
    if (!previousTask) {
      setMessage({ tone: "warn", text: "That child Task no longer exists." });
      return false;
    }
    if (status === "upcoming" || status === "not_due") {
      setMessage({ tone: "warn", text: "Upcoming and Not Due are derived canonical child states and cannot be written directly." });
      return false;
    }
    const saved = await updateCanonicalTask(subtaskId, { status });
    if (!saved) return false;
    return true;
  }

  async function renameTaskSubtask(subtaskId: string, title: string) {
    const trimmedTitle = title.trim();
    return trimmedTitle ? updateCanonicalTask(subtaskId, { title: trimmedTitle }) : false;
  }

  async function deleteTaskSubtask(subtaskId: string) {
    const descendants = buildTaskHierarchyAdapter(tasks).getDescendants(subtaskId);
    for (const child of [tasks.find((task) => task.id === subtaskId), ...descendants]) {
      if (child && !await updateCanonicalTask(child.id, { status: "trashed" })) return false;
    }
    return true;
  }

  async function addTaskSubtask(taskId: string) {
    return addCanonicalChild(taskId, "New step");
  }

  async function addChildTaskSubtask(parentSubtaskId: string) {
    return addCanonicalChild(parentSubtaskId, "New child step");
  }

  async function addCanonicalChild(parentTaskId: string, title: string) {
    const result = buildChildTaskCreationDraft({ parentTaskId, title });
    if (!result.ok) {
      setMessage({ tone: "warn", text: "Could not find a valid parent Task." });
      return null;
    }
    const nextSortOrder = buildTaskHierarchyAdapter(tasks).getChildren(parentTaskId).length;
    const created = await createTask({
      ...result.draft,
      sort_order: nextSortOrder,
      user_id: currentUserId,
    }, "task_creation");
    if (created.error || !created.data) {
      setMessage({ tone: "warn", text: created.error?.message ?? "Child Task creation returned no row." });
      return null;
    }
    setTasks((current) => [...current, created.data as Task]);
    return created.data.id;
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
