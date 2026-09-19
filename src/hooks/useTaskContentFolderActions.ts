"use client";

import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Task, TaskContentFolder, TaskUpdate } from "@/lib/database.types";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import {
  buildTaskContentFolderAssignmentPatch,
  normalizeTaskContentFolderName,
  normalizeTaskContentFolderRow,
  validateTaskContentFolderName,
} from "@/lib/task-content-folders";

type Client = NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;
type Message = { text: string; tone: "neutral" | "good" | "warn" };

type Options = {
  client: Client | null;
  folders: readonly TaskContentFolder[];
  setFolders: Dispatch<SetStateAction<TaskContentFolder[]>>;
  setMessage: Dispatch<SetStateAction<Message | null>>;
  setTasks: Dispatch<SetStateAction<Task[]>>;
  updateTaskRow: (taskId: string, values: TaskUpdate, expectedTask: Task) => Promise<boolean>;
  userId: string | null | undefined;
};

export function useTaskContentFolderActions({
  client,
  folders,
  setFolders,
  setMessage,
  setTasks,
  updateTaskRow,
  userId,
}: Options) {
  const createFolderAndMoveTask = useCallback(async (task: Task, rawName: string) => {
    const name = normalizeTaskContentFolderName(rawName);
    const validationError = validateTaskContentFolderName(name);
    if (validationError || !client || !userId) {
      setMessage({ tone: "warn", text: validationError ?? "Folders are unavailable until you sign in." });
      return false;
    }

    const { data, error } = await client
      .from("adhdice_task_content_folders")
      .insert({ name, user_id: userId })
      .select("*")
      .single();
    const folder = normalizeTaskContentFolderRow(data);
    if (error || !folder) {
      setMessage({ tone: "warn", text: error?.message ?? "Folder could not be created." });
      return false;
    }
    setFolders((current) => [...current, folder]);

    const rollbackCreatedFolder = async () => {
      const rollback = await client
        .from("adhdice_task_content_folders")
        .delete()
        .eq("user_id", userId)
        .eq("id", folder.id);
      setFolders((current) => current.filter((entry) => entry.id !== folder.id));
      return rollback.error;
    };

    let didPersist = false;
    try {
      didPersist = await updateTaskRow(task.id, buildTaskContentFolderAssignmentPatch(task, folder.id), task);
    } catch (moveError) {
      const rollbackError = await rollbackCreatedFolder();
      if (rollbackError) {
        setMessage({ tone: "warn", text: `Task move failed, and the new Folder could not be rolled back: ${rollbackError.message}` });
      } else {
        setMessage({ tone: "warn", text: moveError instanceof Error ? moveError.message : "Task could not be moved into the new Folder." });
      }
      return false;
    }
    if (!didPersist) {
      const rollbackError = await rollbackCreatedFolder();
      if (rollbackError) {
        setMessage({ tone: "warn", text: `Task move failed, and the new Folder could not be rolled back: ${rollbackError.message}` });
      }
      return false;
    }

    setMessage({ tone: "good", text: `Folder "${folder.name}" created and "${task.title}" moved into it.` });
    return true;
  }, [client, setFolders, setMessage, updateTaskRow, userId]);

  const renameFolder = useCallback(async (folderId: string, rawName: string) => {
    const name = normalizeTaskContentFolderName(rawName);
    const validationError = validateTaskContentFolderName(name);
    const folder = folders.find((entry) => entry.id === folderId);
    if (validationError || !client || !userId || !folder) {
      setMessage({ tone: "warn", text: validationError ?? "Folder could not be found." });
      return false;
    }
    const { data, error } = await client
      .from("adhdice_task_content_folders")
      .update({ name })
      .eq("user_id", userId)
      .eq("id", folderId)
      .select("*")
      .single();
    const nextFolder = normalizeTaskContentFolderRow(data);
    if (error || !nextFolder) {
      setMessage({ tone: "warn", text: error?.message ?? "Folder could not be renamed." });
      return false;
    }
    setFolders((current) => current.map((entry) => entry.id === folderId ? nextFolder : entry));
    setMessage({ tone: "good", text: `Folder "${nextFolder.name}" renamed.` });
    return true;
  }, [client, folders, setFolders, setMessage, userId]);

  const deleteFolder = useCallback(async (folderId: string) => {
    const folder = folders.find((entry) => entry.id === folderId);
    if (!client || !userId || !folder) {
      setMessage({ tone: "warn", text: "Folder could not be found." });
      return false;
    }
    const { error } = await client
      .from("adhdice_task_content_folders")
      .delete()
      .eq("user_id", userId)
      .eq("id", folderId);
    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return false;
    }
    setFolders((current) => current.filter((entry) => entry.id !== folderId));
    setTasks((current) => current.map((task) => task.task_content_folder_id === folderId
      ? { ...task, task_content_folder_id: null }
      : task));
    setMessage({ tone: "good", text: `Folder "${folder.name}" deleted. Its Tasks are now ungrouped.` });
    return true;
  }, [client, folders, setFolders, setMessage, setTasks, userId]);

  const moveTaskToFolder = useCallback(async (task: Task, folderId: string | null) => {
    if (folderId !== null && !folders.some((folder) => folder.id === folderId)) {
      setMessage({ tone: "warn", text: "That Folder is no longer available. Refresh and try again." });
      return false;
    }
    const didPersist = await updateTaskRow(task.id, buildTaskContentFolderAssignmentPatch(task, folderId), task);
    if (didPersist) {
      const folderName = folderId ? folders.find((folder) => folder.id === folderId)?.name : null;
      setMessage({
        tone: "good",
        text: task.parent_task_id && folderName
          ? `"${task.title}" moved to "${folderName}" and is now a top-level Task.`
          : folderName
            ? `"${task.title}" moved to "${folderName}".`
            : `"${task.title}" is now ungrouped.`,
      });
    }
    return didPersist;
  }, [folders, setMessage, updateTaskRow]);

  return { createFolderAndMoveTask, deleteFolder, moveTaskToFolder, renameFolder };
}
