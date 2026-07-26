import type {
  TaskListContainer,
  TaskListFolder,
  TaskListRailItem,
  TaskListRailItemType,
} from "@/lib/database.types";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import type { TaskListDefinition } from "@/lib/task-lists";
import {
  TASK_LIST_FOLDER_CONFLICT_CODE,
  TaskListFolderConflictError,
  getPersistedTaskListEntityId,
  isTaskListFolderConflict,
} from "@/lib/task-list-folders";

export const TASK_LIST_RAIL_MAX_SORT_ORDER = 1_000_000;

export type TaskListRailManifestItem = {
  default_container_folder_id: string | null;
  default_sort_order: number;
  entity_id: string | null;
  item_key: string;
  item_type: TaskListRailItemType;
  list_subtype: string | null;
};

export type CanonicalTaskListRailTreeItem =
  | {
      entity: TaskListFolder;
      entityId: string;
      id: string;
      itemKey: string;
      kind: "folder";
      listSubtype: null;
      placement: TaskListRailItem;
      sortOrder: number;
    }
  | {
      entity: TaskListDefinition;
      entityId: string | null;
      id: string;
      itemKey: string;
      kind: "list";
      listSubtype: string;
      placement: TaskListRailItem;
      sortOrder: number;
    };

export type CanonicalTaskListRailTree = {
  descendantFolderIdsByFolderId: Map<string, Set<string>>;
  descendantListIdsByFolderId: Map<string, Set<string>>;
  folderById: Map<string, TaskListFolder>;
  itemByKey: Map<string, CanonicalTaskListRailTreeItem>;
  mixedChildrenByFolderId: Map<string | null, CanonicalTaskListRailTreeItem[]>;
};

export type CanonicalTaskListRailDirectoryEntry =
  | { id: string; kind: "folder"; label: string; path: string }
  | { folderId: string | null; id: string; kind: "list" | "system"; label: string; path: string };

export function getTaskListRailItemKey(list: Pick<TaskListDefinition, "id">) {
  return list.id.startsWith("list:") ? list.id : `system:${list.id}`;
}

export function getTaskListRailFolderItemKey(folderId: string) {
  return `folder:${folderId}`;
}

export function buildTaskListRailManifest(
  lists: readonly TaskListDefinition[],
  folders: readonly TaskListFolder[],
): TaskListRailManifestItem[] {
  const listItems = lists.map((list, index): TaskListRailManifestItem => ({
    default_container_folder_id: list.folderId ?? null,
    default_sort_order: Math.min(
      TASK_LIST_RAIL_MAX_SORT_ORDER,
      Math.max(0, Number.isSafeInteger(list.sortOrder) ? list.sortOrder : index),
    ),
    entity_id: list.id.startsWith("list:") ? getPersistedTaskListEntityId(list.id) : null,
    item_key: getTaskListRailItemKey(list),
    item_type: "list",
    list_subtype: `${list.type}:${list.membershipMode}`,
  }));
  const folderItems = folders.map((folder): TaskListRailManifestItem => ({
    default_container_folder_id: folder.parent_folder_id,
    default_sort_order: Math.min(
      TASK_LIST_RAIL_MAX_SORT_ORDER,
      Math.max(0, Number.isSafeInteger(folder.sort_order) ? folder.sort_order : 0),
    ),
    entity_id: folder.id,
    item_key: getTaskListRailFolderItemKey(folder.id),
    item_type: "folder",
    list_subtype: null,
  }));
  return [...listItems, ...folderItems];
}

export function seedMissingTaskListRailPlacements(
  userId: string,
  manifest: readonly TaskListRailManifestItem[],
  saved: readonly TaskListRailItem[],
  timestamp = new Date(0).toISOString(),
) {
  const savedByKey = new Map(saved.map((item) => [item.item_key, item]));
  const nextEndByContainer = new Map<string | null, number>();
  for (const item of saved) {
    nextEndByContainer.set(
      item.container_folder_id,
      Math.max(nextEndByContainer.get(item.container_folder_id) ?? 0, item.sort_order + 1),
    );
  }
  return manifest.map((definition) => {
    const existing = savedByKey.get(definition.item_key);
    if (existing) return existing;
    const nextOrder = nextEndByContainer.get(definition.default_container_folder_id) ?? 0;
    nextEndByContainer.set(definition.default_container_folder_id, nextOrder + 1);
    return {
      container_folder_id: definition.default_container_folder_id,
      created_at: timestamp,
      entity_id: definition.entity_id,
      item_key: definition.item_key,
      item_type: definition.item_type,
      sort_order: nextOrder,
      updated_at: timestamp,
      user_id: userId,
    };
  });
}

function comparePlacement(
  left: CanonicalTaskListRailTreeItem,
  right: CanonicalTaskListRailTreeItem,
) {
  return left.sortOrder - right.sortOrder || left.itemKey.localeCompare(right.itemKey);
}

export function buildCanonicalTaskListRailTree(
  lists: readonly TaskListDefinition[],
  folders: readonly TaskListFolder[],
  placements: readonly TaskListRailItem[],
  userId = "",
): CanonicalTaskListRailTree {
  const manifest = buildTaskListRailManifest(lists, folders);
  const completePlacements = seedMissingTaskListRailPlacements(userId, manifest, placements);
  const placementByKey = new Map(completePlacements.map((item) => [item.item_key, item]));
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const items: CanonicalTaskListRailTreeItem[] = [
    ...lists.flatMap((list) => {
      const itemKey = getTaskListRailItemKey(list);
      const placement = placementByKey.get(itemKey);
      if (!placement || (placement.container_folder_id && !folderById.has(placement.container_folder_id))) return [];
      return [{
        entity: list,
        entityId: placement.entity_id,
        id: list.id,
        itemKey,
        kind: "list" as const,
        listSubtype: `${list.type}:${list.membershipMode}`,
        placement,
        sortOrder: placement.sort_order,
      }];
    }),
    ...folders.flatMap((folder) => {
      const itemKey = getTaskListRailFolderItemKey(folder.id);
      const placement = placementByKey.get(itemKey);
      if (!placement || (placement.container_folder_id && !folderById.has(placement.container_folder_id))) return [];
      return [{
        entity: folder,
        entityId: folder.id,
        id: folder.id,
        itemKey,
        kind: "folder" as const,
        listSubtype: null,
        placement,
        sortOrder: placement.sort_order,
      }];
    }),
  ];
  const itemByKey = new Map(items.map((item) => [item.itemKey, item]));
  const mixedChildrenByFolderId = new Map<string | null, CanonicalTaskListRailTreeItem[]>();
  for (const item of items) {
    const container = item.placement.container_folder_id;
    const siblings = mixedChildrenByFolderId.get(container) ?? [];
    siblings.push(item);
    mixedChildrenByFolderId.set(container, siblings);
  }
  for (const siblings of mixedChildrenByFolderId.values()) siblings.sort(comparePlacement);

  const descendantFolderIdsByFolderId = new Map<string, Set<string>>();
  const descendantListIdsByFolderId = new Map<string, Set<string>>();
  const collect = (folderId: string, visited = new Set<string>()) => {
    const folderIds = new Set<string>();
    const listIds = new Set<string>();
    if (visited.has(folderId)) return { folderIds, listIds };
    const nextVisited = new Set(visited).add(folderId);
    for (const child of mixedChildrenByFolderId.get(folderId) ?? []) {
      if (child.kind === "list") listIds.add(child.id);
      else {
        folderIds.add(child.id);
        const nested = collect(child.id, nextVisited);
        for (const id of nested.folderIds) folderIds.add(id);
        for (const id of nested.listIds) listIds.add(id);
      }
    }
    return { folderIds, listIds };
  };
  for (const folder of folders) {
    const descendants = collect(folder.id);
    descendantFolderIdsByFolderId.set(folder.id, descendants.folderIds);
    descendantListIdsByFolderId.set(folder.id, descendants.listIds);
  }
  return {
    descendantFolderIdsByFolderId,
    descendantListIdsByFolderId,
    folderById,
    itemByKey,
    mixedChildrenByFolderId,
  };
}

export function buildCanonicalTaskListRailDirectory(
  tree: CanonicalTaskListRailTree,
  query = "",
): CanonicalTaskListRailDirectoryEntry[] {
  const folderPathById = new Map<string, string>();
  const buildFolderPath = (folderId: string, visited = new Set<string>()): string => {
    const cached = folderPathById.get(folderId);
    if (cached) return cached;
    const folderItem = tree.itemByKey.get(getTaskListRailFolderItemKey(folderId));
    if (!folderItem || folderItem.kind !== "folder" || visited.has(folderId)) return "[Invalid folder]";
    const nextVisited = new Set(visited).add(folderId);
    const parentId = folderItem.placement.container_folder_id;
    const parentPath = parentId ? buildFolderPath(parentId, nextVisited) : "";
    const path = parentPath ? `${parentPath} / ${folderItem.entity.name}` : folderItem.entity.name;
    folderPathById.set(folderId, path);
    return path;
  };
  const entries = Array.from(tree.itemByKey.values()).map((item): CanonicalTaskListRailDirectoryEntry => {
    if (item.kind === "folder") {
      return { id: item.id, kind: "folder", label: item.entity.name, path: buildFolderPath(item.id) };
    }
    const folderId = item.placement.container_folder_id;
    const folderPath = folderId ? buildFolderPath(folderId) : "";
    return {
      folderId,
      id: item.id,
      kind: item.entity.type === "custom" ? "list" : "system",
      label: item.entity.name,
      path: folderPath ? `${folderPath} / ${item.entity.name}` : item.entity.name,
    };
  });
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return entries
    .filter((entry) => !normalizedQuery || `${entry.label} ${entry.path}`.toLocaleLowerCase().includes(normalizedQuery))
    .sort((left, right) => left.path.localeCompare(right.path) || left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id));
}

type RailClient = NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;
type SupabaseErrorLike = { code?: string | null; details?: string | null; hint?: string | null; message?: string | null };

function throwRailError(error: SupabaseErrorLike) {
  if (isTaskListFolderConflict(error)) throw new TaskListFolderConflictError();
  throw error;
}

export async function reconcileTaskListRailPlacements(
  client: Pick<RailClient, "rpc">,
  manifest: readonly TaskListRailManifestItem[],
) {
  const { data, error } = await client.rpc("adhdice_reconcile_task_list_rail_items", {
    p_manifest: manifest,
  });
  if (error) throwRailError(error);
  return (data ?? []) as TaskListRailItem[];
}

export async function moveTaskListRailItem(
  client: Pick<RailClient, "rpc">,
  input: {
    destinationContainerFolderId: string | null;
    expectedDestinationRevision: number;
    expectedSourceRevision: number;
    itemKey: string;
    targetIndex: number;
  },
) {
  if (!Number.isSafeInteger(input.targetIndex) || input.targetIndex < 0 || input.targetIndex > TASK_LIST_RAIL_MAX_SORT_ORDER) {
    throw new RangeError("Destination index must be a bounded nonnegative integer.");
  }
  const { data, error } = await client.rpc("adhdice_mutate_task_list_rail_placement", {
    p_payload: {
      destination_container_folder_id: input.destinationContainerFolderId,
      expected_destination_revision: input.expectedDestinationRevision,
      expected_source_revision: input.expectedSourceRevision,
      item_key: input.itemKey,
      target_index: input.targetIndex,
    },
  });
  if (error) throwRailError(error);
  const result = data as { code?: string; status?: string } | null;
  if (result?.status === "conflict" || result?.code === TASK_LIST_FOLDER_CONFLICT_CODE) {
    throw new TaskListFolderConflictError();
  }
  return result;
}

export function getTaskListRailContainerRevision(
  containers: readonly TaskListContainer[],
  folderId: string | null,
) {
  return containers.find((container) => container.folder_id === folderId)?.revision ?? null;
}
