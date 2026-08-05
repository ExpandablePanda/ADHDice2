import type { TaskListContainer, TaskListFolder, TaskListRailItem } from "@/lib/database.types";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import type { TaskListDefinition, TaskListMembership } from "@/lib/task-lists";
import { todayISO } from "@/lib/utils";

export type TaskListFolderClient = NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;

export const TASK_LIST_FOLDER_CONFLICT_CODE = "ADHDICE_LIST_FOLDER_REVISION_CONFLICT";
export const ROOT_TASK_LIST_CONTAINER_KEY = "__root__";

export function getTaskListContainerKey(folderId: string | null | undefined) {
  return folderId ?? ROOT_TASK_LIST_CONTAINER_KEY;
}

export function getPersistedTaskListEntityId(listId: string) {
  return listId.startsWith("list:") ? listId.slice("list:".length) : listId;
}

export function buildPersistedTaskListByEntityId(lists: readonly TaskListDefinition[]) {
  return new Map(
    lists
      .filter((list) => list.id.startsWith("list:"))
      .map((list) => [getPersistedTaskListEntityId(list.id), list]),
  );
}

export type TaskListFolderIssue = {
  entityId: string;
  kind: "cycle" | "ineligible_list" | "orphan_folder" | "orphan_list";
  relatedId: string | null;
};

export type TaskListFolderTreeItem =
  | { entity: TaskListFolder; id: string; kind: "folder"; sortOrder: number }
  | { entity: TaskListDefinition; id: string; kind: "list"; sortOrder: number };

export type TaskListFolderTree = {
  childFoldersByParentId: Map<string | null, TaskListFolder[]>;
  descendantFolderIdsByFolderId: Map<string, Set<string>>;
  descendantListIdsByFolderId: Map<string, Set<string>>;
  folderById: Map<string, TaskListFolder>;
  folderPathById: Map<string, string>;
  issues: TaskListFolderIssue[];
  listPathById: Map<string, string>;
  mixedChildrenByFolderId: Map<string | null, TaskListFolderTreeItem[]>;
  normalListById: Map<string, TaskListDefinition>;
  normalListsByFolderId: Map<string | null, TaskListDefinition[]>;
};

export type FolderCountTaskFact = {
  id: string;
  listMemberships: readonly Pick<TaskListMembership, "id">[];
  task: {
    due_on: string | null;
  };
};

export type TaskListFolderCounts = {
  containedListCount: number;
  dueTodayCount: number;
  overdueCount: number;
  visibleTaskCount: number;
};

function compareTreeItems(left: TaskListFolderTreeItem, right: TaskListFolderTreeItem) {
  return left.sortOrder - right.sortOrder
    || left.kind.localeCompare(right.kind)
    || left.id.localeCompare(right.id);
}

export function buildTaskListFolderTree(
  folders: readonly TaskListFolder[],
  lists: readonly TaskListDefinition[],
): TaskListFolderTree {
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const invalidFolderIds = new Set<string>();
  const issues: TaskListFolderIssue[] = [];

  for (const folder of folders) {
    const visited = new Set<string>();
    let current: TaskListFolder | undefined = folder;
    while (current?.parent_folder_id) {
      if (visited.has(current.id)) {
        for (const id of visited) invalidFolderIds.add(id);
        issues.push({ entityId: folder.id, kind: "cycle", relatedId: current.id });
        break;
      }
      visited.add(current.id);
      const parent = folderById.get(current.parent_folder_id);
      if (!parent) {
        invalidFolderIds.add(folder.id);
        issues.push({ entityId: folder.id, kind: "orphan_folder", relatedId: current.parent_folder_id });
        break;
      }
      current = parent;
    }
  }

  // A descendant of corrupt data is also unsafe to render.
  let invalidCount = -1;
  while (invalidCount !== invalidFolderIds.size) {
    invalidCount = invalidFolderIds.size;
    for (const folder of folders) {
      if (folder.parent_folder_id && invalidFolderIds.has(folder.parent_folder_id)) {
        invalidFolderIds.add(folder.id);
      }
    }
  }

  const validFolders = folders.filter((folder) => !invalidFolderIds.has(folder.id));
  const childFoldersByParentId = new Map<string | null, TaskListFolder[]>();
  for (const folder of validFolders) {
    const siblings = childFoldersByParentId.get(folder.parent_folder_id) ?? [];
    siblings.push(folder);
    childFoldersByParentId.set(folder.parent_folder_id, siblings);
  }
  for (const siblings of childFoldersByParentId.values()) {
    siblings.sort((left, right) => compareTreeItems(
      { entity: left, id: left.id, kind: "folder", sortOrder: left.sort_order },
      { entity: right, id: right.id, kind: "folder", sortOrder: right.sort_order },
    ));
  }

  const folderPathById = new Map<string, string>();
  const buildFolderPath = (folderId: string, visited = new Set<string>()): string | null => {
    if (visited.has(folderId)) return null;
    const cached = folderPathById.get(folderId);
    if (cached) return cached;
    const folder = folderById.get(folderId);
    if (!folder || invalidFolderIds.has(folderId)) return null;
    visited.add(folderId);
    const parentPath = folder.parent_folder_id ? buildFolderPath(folder.parent_folder_id, visited) : "";
    if (parentPath === null) return null;
    const path = parentPath ? `${parentPath} / ${folder.name}` : folder.name;
    folderPathById.set(folderId, path);
    return path;
  };
  for (const folder of validFolders) buildFolderPath(folder.id);

  const normalListById = new Map<string, TaskListDefinition>();
  const normalListsByFolderId = new Map<string | null, TaskListDefinition[]>();
  const listPathById = new Map<string, string>();
  for (const list of lists) {
    const folderId = list.folderId ?? null;
    if (folderId && (!folderById.has(folderId) || invalidFolderIds.has(folderId))) {
      issues.push({ entityId: list.id, kind: "orphan_list", relatedId: folderId });
      continue;
    }
    normalListById.set(list.id, list);
    const siblings = normalListsByFolderId.get(folderId) ?? [];
    siblings.push(list);
    normalListsByFolderId.set(folderId, siblings);
    const folderPath = folderId ? folderPathById.get(folderId) : null;
    listPathById.set(list.id, folderPath ? `${folderPath} / ${list.name}` : list.name);
  }

  const mixedChildrenByFolderId = new Map<string | null, TaskListFolderTreeItem[]>();
  for (const folderId of [null, ...validFolders.map((folder) => folder.id)]) {
    const mixed: TaskListFolderTreeItem[] = [
      ...(childFoldersByParentId.get(folderId) ?? []).map((entity) => ({
        entity,
        id: entity.id,
        kind: "folder" as const,
        sortOrder: entity.sort_order,
      })),
      ...(normalListsByFolderId.get(folderId) ?? []).map((entity) => ({
        entity,
        id: entity.id,
        kind: "list" as const,
        sortOrder: entity.sortOrder,
      })),
    ].sort(compareTreeItems);
    mixedChildrenByFolderId.set(folderId, mixed);
  }

  const descendantFolderIdsByFolderId = new Map<string, Set<string>>();
  const descendantListIdsByFolderId = new Map<string, Set<string>>();
  const collectDescendants = (folderId: string, visited = new Set<string>()) => {
    const folderIds = new Set<string>();
    const listIds = new Set((normalListsByFolderId.get(folderId) ?? []).map((list) => list.id));
    if (visited.has(folderId)) return { folderIds, listIds };
    const nextVisited = new Set(visited).add(folderId);
    for (const child of childFoldersByParentId.get(folderId) ?? []) {
      folderIds.add(child.id);
      const descendants = collectDescendants(child.id, nextVisited);
      for (const id of descendants.folderIds) folderIds.add(id);
      for (const id of descendants.listIds) listIds.add(id);
    }
    return { folderIds, listIds };
  };
  for (const folder of validFolders) {
    const descendants = collectDescendants(folder.id);
    descendantFolderIdsByFolderId.set(folder.id, descendants.folderIds);
    descendantListIdsByFolderId.set(folder.id, descendants.listIds);
  }

  return {
    childFoldersByParentId,
    descendantFolderIdsByFolderId,
    descendantListIdsByFolderId,
    folderById: new Map(validFolders.map((folder) => [folder.id, folder])),
    folderPathById,
    issues,
    listPathById,
    mixedChildrenByFolderId,
    normalListById,
    normalListsByFolderId,
  };
}

export function buildTaskListFolderBreadcrumbs(tree: TaskListFolderTree, folderId: string | null) {
  if (!folderId) return [];
  const breadcrumbs: TaskListFolder[] = [];
  const visited = new Set<string>();
  let current = tree.folderById.get(folderId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    breadcrumbs.unshift(current);
    current = current.parent_folder_id ? tree.folderById.get(current.parent_folder_id) : undefined;
  }
  return breadcrumbs;
}

export function resolveCurrentTaskListFolder(
  currentFolderId: string | null,
  previousFolders: readonly TaskListFolder[],
  tree: TaskListFolderTree,
) {
  if (!currentFolderId || tree.folderById.has(currentFolderId)) return currentFolderId;
  const previousById = new Map(previousFolders.map((folder) => [folder.id, folder]));
  const visited = new Set<string>();
  let previous = previousById.get(currentFolderId);
  while (previous?.parent_folder_id && !visited.has(previous.id)) {
    visited.add(previous.id);
    if (tree.folderById.has(previous.parent_folder_id)) return previous.parent_folder_id;
    previous = previousById.get(previous.parent_folder_id);
  }
  return null;
}

export function canMoveFolderInto(
  tree: TaskListFolderTree,
  folderId: string,
  destinationFolderId: string | null,
) {
  return destinationFolderId !== folderId
    && !(destinationFolderId && tree.descendantFolderIdsByFolderId.get(folderId)?.has(destinationFolderId));
}

export function getTaskListContainerRevision(
  containers: readonly TaskListContainer[],
  folderId: string | null | undefined,
) {
  const containerKey = getTaskListContainerKey(folderId);
  return containers.find((container) => (
    getTaskListContainerKey(container.folder_id) === containerKey
  ))?.revision ?? null;
}

export function buildTaskListFolderCounts(
  tree: Pick<TaskListFolderTree, "descendantListIdsByFolderId" | "folderById">,
  facts: readonly FolderCountTaskFact[],
  visibleTaskIds: ReadonlySet<string>,
  todayDateKey: string = todayISO(),
) {
  const counts = new Map<string, TaskListFolderCounts>();
  for (const folderId of tree.folderById.keys()) {
    const listIds = tree.descendantListIdsByFolderId.get(folderId) ?? new Set<string>();
    const tasks = facts.filter((fact) => (
      visibleTaskIds.has(fact.id)
      && fact.listMemberships.some((membership) => listIds.has(membership.id))
    ));
    counts.set(folderId, {
      containedListCount: listIds.size,
      dueTodayCount: tasks.filter((fact) => fact.task.due_on === todayDateKey).length,
      overdueCount: tasks.filter((fact) => Boolean(fact.task.due_on && fact.task.due_on < todayDateKey)).length,
      visibleTaskCount: tasks.length,
    });
  }
  return counts;
}

export type AllTaskListDirectoryEntry =
  | { id: string; kind: "folder"; label: string; path: string }
  | { folderId: string | null; id: string; kind: "list" | "system"; label: string; path: string };

export function buildAllTaskListDirectory(
  tree: TaskListFolderTree,
  lists: readonly TaskListDefinition[],
  query = "",
) {
  const entries: AllTaskListDirectoryEntry[] = [
    ...Array.from(tree.folderById.values()).map((folder) => ({
      id: folder.id,
      kind: "folder" as const,
      label: folder.name,
      path: tree.folderPathById.get(folder.id) ?? folder.name,
    })),
    ...lists.map((list): AllTaskListDirectoryEntry => {
      const normal = list.type === "custom";
      const validNormal = tree.normalListById.has(list.id);
      return {
        folderId: validNormal ? list.folderId ?? null : null,
        id: list.id,
        kind: normal ? "list" : "system",
        label: list.name,
        path: normal ? tree.listPathById.get(list.id) ?? `[Invalid folder] / ${list.name}` : list.name,
      };
    }),
  ];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return entries
    .filter((entry) => !normalizedQuery || `${entry.label} ${entry.path}`.toLocaleLowerCase().includes(normalizedQuery))
    .sort((left, right) => left.path.localeCompare(right.path) || left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id));
}

type SupabaseErrorLike = {
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  message?: string | null;
};

export class TaskListFolderConflictError extends Error {
  readonly code = TASK_LIST_FOLDER_CONFLICT_CODE;

  constructor() {
    super("The folder or list order changed on another device. Reload and try again.");
    this.name = "TaskListFolderConflictError";
  }
}

export function isTaskListFolderConflict(error: unknown): boolean {
  if (error instanceof TaskListFolderConflictError) return true;
  const detail = error as SupabaseErrorLike | null;
  const text = `${detail?.message ?? ""} ${detail?.details ?? ""} ${detail?.hint ?? ""}`;
  return detail?.code === "40001" || text.includes(TASK_LIST_FOLDER_CONFLICT_CODE);
}

function throwFolderRepositoryError(error: SupabaseErrorLike) {
  if (isTaskListFolderConflict(error)) throw new TaskListFolderConflictError();
  throw error;
}

export async function loadTaskListFolders(client: TaskListFolderClient, userId: string) {
  const [foldersResult, containersResult, railItemsResult] = await Promise.all([
    client
      .from("adhdice_task_list_folders")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
    client
      .from("adhdice_task_list_containers")
      .select("*")
      .eq("user_id", userId),
    client
      .from("adhdice_task_list_rail_items")
      .select("*")
      .eq("user_id", userId)
      .order("container_folder_id", { ascending: true, nullsFirst: true })
      .order("sort_order", { ascending: true })
      .order("item_key", { ascending: true }),
  ]);

  if (foldersResult.error) throwFolderRepositoryError(foldersResult.error);
  if (containersResult.error) throwFolderRepositoryError(containersResult.error);
  if (railItemsResult.error) throwFolderRepositoryError(railItemsResult.error);

  return {
    containers: (containersResult.data ?? []) as TaskListContainer[],
    folders: (foldersResult.data ?? []) as TaskListFolder[],
    railItems: (railItemsResult.data ?? []) as TaskListRailItem[],
  };
}

async function mutateTaskListStructure(
  client: Pick<TaskListFolderClient, "rpc">,
  action: "create_folder" | "delete_folder" | "move_folder" | "move_list" | "rename_folder",
  payload: Record<string, unknown>,
) {
  const { data, error } = await client.rpc("adhdice_mutate_task_list_structure", {
    p_action: action,
    p_payload: payload,
  });
  if (error) throwFolderRepositoryError(error);
  return data;
}

export function createTaskListFolder(
  client: Pick<TaskListFolderClient, "rpc">,
  input: {
    expectedContainerRevision: number;
    name: string;
    parentFolderId: string | null;
  },
) {
  return mutateTaskListStructure(client, "create_folder", {
    expected_container_revision: input.expectedContainerRevision,
    name: input.name,
    parent_folder_id: input.parentFolderId,
  });
}

export function renameTaskListFolder(
  client: Pick<TaskListFolderClient, "rpc">,
  input: {
    expectedFolderRevision: number;
    folderId: string;
    name: string;
  },
) {
  return mutateTaskListStructure(client, "rename_folder", {
    expected_folder_revision: input.expectedFolderRevision,
    folder_id: input.folderId,
    name: input.name,
  });
}

export function moveTaskListFolder(
  client: Pick<TaskListFolderClient, "rpc">,
  input: {
    destinationFolderId: string | null;
    expectedDestinationRevision: number;
    expectedSourceRevision: number;
    folderId: string;
    targetIndex: number;
  },
) {
  return mutateTaskListStructure(client, "move_folder", {
    destination_folder_id: input.destinationFolderId,
    expected_destination_revision: input.expectedDestinationRevision,
    expected_source_revision: input.expectedSourceRevision,
    folder_id: input.folderId,
    target_index: input.targetIndex,
  });
}

export function moveNormalTaskList(
  client: Pick<TaskListFolderClient, "rpc">,
  input: {
    destinationFolderId: string | null;
    expectedDestinationRevision: number;
    expectedSourceRevision: number;
    listId: string;
    targetIndex: number;
  },
) {
  return mutateTaskListStructure(client, "move_list", {
    destination_folder_id: input.destinationFolderId,
    expected_destination_revision: input.expectedDestinationRevision,
    expected_source_revision: input.expectedSourceRevision,
    list_id: input.listId,
    target_index: input.targetIndex,
  });
}

export function deleteTaskListFolder(
  client: Pick<TaskListFolderClient, "rpc">,
  input: {
    expectedContentsRevision: number;
    expectedParentRevision: number;
    folderId: string;
  },
) {
  return mutateTaskListStructure(client, "delete_folder", {
    expected_contents_revision: input.expectedContentsRevision,
    expected_parent_revision: input.expectedParentRevision,
    folder_id: input.folderId,
  });
}
