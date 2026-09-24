"use client";

import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Task, TaskContentFolder } from "@/lib/database.types";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import {
  getTaskContentFolderParentForTask,
  normalizeTaskContentFolderName,
  normalizeTaskContentFolderRow,
  validateTaskContentFolderName,
  validateTaskContentFolderParent,
} from "@/lib/task-content-folders";
import { isTaskTypeIconKey } from "@/lib/task-type-presentation";
import type { WorkspaceDomainMutationBarrier } from "@/lib/workspace-refresh-coordinator";

type Client = NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;
type Message = { text: string; tone: "neutral" | "good" | "warn" };

type Options = {
  client: Client | null;
  folders: readonly TaskContentFolder[];
  setFolders: Dispatch<SetStateAction<TaskContentFolder[]>>;
  setMessage: Dispatch<SetStateAction<Message | null>>;
  setTasks: Dispatch<SetStateAction<Task[]>>;
  moveTaskHierarchy: (task: Task, newParentTaskId: string | null, newTaskContentFolderId: string | null) => Promise<boolean>;
  invalidateTaskContentFolderDomainGeneration?: WorkspaceDomainMutationBarrier;
  userId: string | null | undefined;
};

export function useTaskContentFolderActions({
  client,
  folders,
  setFolders,
  setMessage,
  setTasks,
  moveTaskHierarchy,
  invalidateTaskContentFolderDomainGeneration = () => {},
  userId,
}: Options) {
  const createFolder = useCallback(async (rawName: string, parentFolderId: string | null = null) => {
    const name = normalizeTaskContentFolderName(rawName);
    const validationError = validateTaskContentFolderName(name);
    const parentError = validateTaskContentFolderParent(folders, null, parentFolderId, userId);
    if (validationError || parentError || !client || !userId) {
      setMessage({ tone: "warn", text: validationError ?? parentError ?? "Folders are unavailable until you sign in." });
      return false;
    }

    invalidateTaskContentFolderDomainGeneration();
    const result = parentFolderId
      ? await client
        .from("adhdice_task_content_folders")
        .insert({ icon_key: "folder", name, parent_folder_id: parentFolderId, user_id: userId })
        .select("*")
        .single()
      : await client
        .from("adhdice_task_content_folders")
        .insert({ name, user_id: userId })
        .select("*")
        .single();
    const folder = normalizeTaskContentFolderRow(result.data);
    if (result.error || !folder) {
      setMessage({ tone: "warn", text: result.error?.message ?? "Folder could not be created." });
      return false;
    }
    setFolders((current) => [...current, folder]);
    setMessage({ tone: "good", text: `Folder "${folder.name}" created.` });
    return true;
  }, [client, folders, invalidateTaskContentFolderDomainGeneration, setFolders, setMessage, userId]);

  const createFolderAndMoveTask = useCallback(async (task: Task, rawName: string) => {
    const name = normalizeTaskContentFolderName(rawName);
    const validationError = validateTaskContentFolderName(name);
    const parentFolderId = getTaskContentFolderParentForTask(task);
    const parentError = validateTaskContentFolderParent(folders, null, parentFolderId, userId);
    if (validationError || parentError || !client || !userId) {
      setMessage({ tone: "warn", text: validationError ?? parentError ?? "Folders are unavailable until you sign in." });
      return false;
    }

    invalidateTaskContentFolderDomainGeneration();
    const result = parentFolderId
      ? await client
        .from("adhdice_task_content_folders")
        .insert({ icon_key: "folder", name, parent_folder_id: parentFolderId, user_id: userId })
        .select("*")
        .single()
      : await client
        .from("adhdice_task_content_folders")
        .insert({ name, user_id: userId })
        .select("*")
        .single();
    const folder = normalizeTaskContentFolderRow(result.data);
    if (result.error || !folder) {
      setMessage({ tone: "warn", text: result.error?.message ?? "Folder could not be created." });
      return false;
    }
    setFolders((current) => [...current, folder]);

    const rollbackCreatedFolder = async () => {
      invalidateTaskContentFolderDomainGeneration();
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
      didPersist = await moveTaskHierarchy(task, null, folder.id);
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
  }, [client, folders, invalidateTaskContentFolderDomainGeneration, moveTaskHierarchy, setFolders, setMessage, userId]);

  const renameFolder = useCallback(async (folderId: string, rawName: string) => {
    const name = normalizeTaskContentFolderName(rawName);
    const validationError = validateTaskContentFolderName(name);
    const folder = folders.find((entry) => entry.id === folderId);
    if (validationError || !client || !userId || !folder) {
      setMessage({ tone: "warn", text: validationError ?? "Folder could not be found." });
      return false;
    }
    invalidateTaskContentFolderDomainGeneration();
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
  }, [client, folders, invalidateTaskContentFolderDomainGeneration, setFolders, setMessage, userId]);

  const updateFolderIcon = useCallback(async (folderId: string, iconKey: string) => {
    const folder = folders.find((entry) => entry.id === folderId);
    if (!isTaskTypeIconKey(iconKey)) {
      setMessage({ tone: "warn", text: "That Folder icon is not available." });
      return false;
    }
    if (!client || !userId || !folder) {
      setMessage({ tone: "warn", text: "Folder could not be found." });
      return false;
    }
    invalidateTaskContentFolderDomainGeneration();
    const { data, error } = await client
      .from("adhdice_task_content_folders")
      .update({ icon_key: iconKey })
      .eq("user_id", userId)
      .eq("id", folderId)
      .select("*")
      .single();
    const nextFolder = normalizeTaskContentFolderRow(data);
    if (error || !nextFolder) {
      setMessage({ tone: "warn", text: error?.message ?? "Folder icon could not be updated." });
      return false;
    }
    setFolders((current) => current.map((entry) => entry.id === folderId ? nextFolder : entry));
    setMessage({ tone: "good", text: `Folder "${nextFolder.name}" icon updated.` });
    return true;
  }, [client, folders, invalidateTaskContentFolderDomainGeneration, setFolders, setMessage, userId]);

  const moveFolder = useCallback(async (folderId: string, destinationFolderId: string | null) => {
    const folder = folders.find((entry) => entry.id === folderId);
    if (!folder || !client || !userId || folder.user_id !== userId) {
      setMessage({ tone: "warn", text: "Folder could not be found." });
      return false;
    }
    const validationError = validateTaskContentFolderParent(folders, folderId, destinationFolderId, userId);
    if (validationError) {
      setMessage({ tone: "warn", text: validationError });
      return false;
    }
    invalidateTaskContentFolderDomainGeneration();
    const { data, error } = await client
      .from("adhdice_task_content_folders")
      .update({ parent_folder_id: destinationFolderId })
      .eq("user_id", userId)
      .eq("id", folderId)
      .select("*")
      .single();
    const nextFolder = normalizeTaskContentFolderRow(data);
    if (error || !nextFolder) {
      setMessage({ tone: "warn", text: error?.message ?? "Folder could not be moved." });
      return false;
    }
    setFolders((current) => current.map((entry) => entry.id === folderId ? nextFolder : entry));
    setMessage({ tone: "good", text: `Folder "${nextFolder.name}" moved.` });
    return true;
  }, [client, folders, invalidateTaskContentFolderDomainGeneration, setFolders, setMessage, userId]);

  const deleteFolder = useCallback(async (folderId: string) => {
    const folder = folders.find((entry) => entry.id === folderId);
    if (!client || !userId || !folder) {
      setMessage({ tone: "warn", text: "Folder could not be found." });
      return false;
    }
    invalidateTaskContentFolderDomainGeneration();
    const { error } = await client.rpc("adhdice_delete_task_content_folder", { p_folder_id: folderId });
    if (error) {
      setMessage({ tone: "warn", text: error.message });
      return false;
    }
    const promotedParentId = folder.parent_folder_id ?? null;
    setFolders((current) => current
      .filter((entry) => entry.id !== folderId)
      .map((entry) => entry.parent_folder_id === folderId ? { ...entry, parent_folder_id: promotedParentId } : entry));
    setTasks((current) => current.map((task) => task.task_content_folder_id === folderId
      ? { ...task, task_content_folder_id: promotedParentId }
      : task));
    setMessage({
      tone: "good",
      text: promotedParentId
        ? `Folder "${folder.name}" deleted and its contents promoted.`
        : `Folder "${folder.name}" deleted. Its direct Tasks are now ungrouped.`,
    });
    return true;
  }, [client, folders, invalidateTaskContentFolderDomainGeneration, setFolders, setMessage, setTasks, userId]);

  const moveTaskToFolder = useCallback(async (task: Task, folderId: string | null) => {
    if (folderId !== null && !folders.some((folder) => folder.id === folderId && folder.user_id === userId)) {
      setMessage({ tone: "warn", text: "That Folder is no longer available. Refresh and try again." });
      return false;
    }
    const didPersist = await moveTaskHierarchy(task, null, folderId);
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
  }, [folders, moveTaskHierarchy, setMessage, userId]);

  return {
    createFolder,
    createFolderAndMoveTask,
    deleteFolder,
    moveFolder,
    moveTaskToFolder,
    renameFolder,
    updateFolderIcon,
  };
}
