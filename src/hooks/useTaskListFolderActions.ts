"use client";

import type { Dispatch, SetStateAction } from "react";
import type { TaskListContainer, TaskListFolder } from "@/lib/database.types";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import type { TaskListDefinition } from "@/lib/task-lists";
import {
  buildTaskListFolderTree,
  canMoveFolderInto,
  createTaskListFolder,
  deleteTaskListFolder,
  getTaskListContainerRevision,
  isTaskListFolderConflict,
  renameTaskListFolder,
} from "@/lib/task-list-folders";
import {
  buildCanonicalTaskListRailTree,
  moveTaskListRailItem,
} from "@/lib/task-list-rail-placement";
import type { TaskListRailItem } from "@/lib/database.types";
import type { TaskListRailMutationGeneration } from "@/lib/task-list-rail-order";

type Message = {
  text: string;
  tone: "neutral" | "good" | "warn";
};

type Client = NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;

type Options = {
  client: Client | null;
  containers: readonly TaskListContainer[];
  folders: readonly TaskListFolder[];
  lists: readonly TaskListDefinition[];
  placements: readonly TaskListRailItem[];
  refresh: () => Promise<void>;
  setMessage: Dispatch<SetStateAction<Message | null>>;
};

export function useTaskListFolderActions({
  client,
  containers,
  folders,
  lists,
  placements,
  refresh,
  setMessage,
}: Options) {
  const tree = buildTaskListFolderTree(folders, lists);
  const railTree = buildCanonicalTaskListRailTree(lists, folders, placements);

  const runMutation = async (
    mutation: () => Promise<unknown>,
    successText: string,
    generation?: TaskListRailMutationGeneration,
  ) => {
    const isCurrentGeneration = () => !generation || generation.isCurrent();
    if (!client) {
      if (isCurrentGeneration()) setMessage({ tone: "warn", text: "List organization is unavailable right now." });
      return false;
    }
    try {
      await mutation();
      if (!isCurrentGeneration()) return false;
      await refresh();
      if (!isCurrentGeneration()) return false;
      generation?.onResult?.("success");
      setMessage({ tone: "good", text: successText });
      return true;
    } catch (error) {
      if (!isCurrentGeneration()) return false;
      await refresh();
      if (!isCurrentGeneration()) return false;
      const result = isTaskListFolderConflict(error) ? "stale-conflict" : "ordinary-error";
      generation?.onResult?.(result);
      if (isTaskListFolderConflict(error)) {
        setMessage({
          tone: "warn",
          text: "List organization changed on another device. Refreshed the latest order.",
        });
      } else {
        setMessage({
          tone: "warn",
          text: error instanceof Error ? error.message : "List organization could not be saved.",
        });
      }
      return false;
    }
  };

  const requireContainerRevision = (folderId: string | null) => {
    const revision = getTaskListContainerRevision(containers, folderId);
    if (revision === null) {
      setMessage({ tone: "warn", text: "That list container is missing. Refresh and try again." });
    }
    return revision;
  };

  const createFolder = async (name: string, parentFolderId: string | null) => {
    const revision = requireContainerRevision(parentFolderId);
    if (revision === null || !client) return false;
    return runMutation(
      () => createTaskListFolder(client, {
        expectedContainerRevision: revision,
        name,
        parentFolderId,
      }),
      `${name} created.`,
    );
  };

  const renameFolder = async (folderId: string, name: string) => {
    const folder = tree.folderById.get(folderId);
    if (!folder || !client) return false;
    return runMutation(
      () => renameTaskListFolder(client, {
        expectedFolderRevision: folder.revision,
        folderId,
        name,
      }),
      `${name} renamed.`,
    );
  };

  const moveItem = async (
    itemKey: string,
    itemType: "folder" | "list",
    destinationFolderId: string | null,
    targetIndex: number,
    generation: TaskListRailMutationGeneration,
  ) => {
    const item = railTree.itemByKey.get(itemKey);
    if (!item || item.kind !== itemType || !client) {
      return false;
    }
    if (item.kind === "folder" && !canMoveFolderInto(tree, item.id, destinationFolderId)) {
      return false;
    }
    const sourceContainer = item.placement.container_folder_id;
    const sourceRevision = requireContainerRevision(sourceContainer);
    const destinationRevision = requireContainerRevision(destinationFolderId);
    if (sourceRevision === null || destinationRevision === null) return false;
    return runMutation(
      () => moveTaskListRailItem(client, {
        destinationContainerFolderId: destinationFolderId,
        expectedDestinationRevision: destinationRevision,
        expectedSourceRevision: sourceRevision,
        itemKey,
        targetIndex,
      }),
      itemType === "folder" ? "Folder moved." : "List moved.",
      generation,
    );
  };

  const deleteFolder = async (folderId: string) => {
    const folder = tree.folderById.get(folderId);
    if (!folder || !client) return false;
    const contentsRevision = requireContainerRevision(folder.id);
    const parentRevision = requireContainerRevision(folder.parent_folder_id);
    if (contentsRevision === null || parentRevision === null) return false;
    return runMutation(
      () => deleteTaskListFolder(client, {
        expectedContentsRevision: contentsRevision,
        expectedParentRevision: parentRevision,
        folderId,
      }),
      `${folder.name} deleted. Its contents were promoted.`,
    );
  };

  return {
    createFolder,
    deleteFolder,
    moveItem,
    renameFolder,
  };
}
