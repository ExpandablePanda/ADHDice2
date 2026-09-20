import type { TaskContentFolder, TaskUpdate } from "@/lib/database.types";

export const TASK_CONTENT_FOLDER_NAME_MAX_LENGTH = 120;

export type TaskContentFolderRow = Pick<
  TaskContentFolder,
  "created_at" | "icon_key" | "id" | "name" | "parent_folder_id" | "updated_at" | "user_id"
>;

type TaskContentFolderMembershipTask = {
  parent_task_id?: string | null;
  task_content_folder_id?: string | null;
};

export type TaskContentFolderPresentationNode<TTask> =
  | {
      depth: number;
      kind: "task";
      task: TTask;
    }
  | {
      children: TaskContentFolderPresentationNode<TTask>[];
      depth: number;
      descendantTaskIds: string[];
      firstVisibleDescendantIndex: number | null;
      // Kept as a compatibility field for the flat 7.14 presentation contract.
      // The recursive `children` tree is the authority for nested rendering.
      folder: TaskContentFolderRow;
      firstVisibleMemberIndex: number;
      kind: "folder";
      members: TTask[];
      visibleTaskCount: number;
    };

export type TaskContentFolderPresentationBlock<TTask> = TaskContentFolderPresentationNode<TTask>;
type TaskContentFolderFolderNode<TTask> = Extract<TaskContentFolderPresentationNode<TTask>, { kind: "folder" }>;

export type TaskContentFolderRenderEntry<TTask> =
  | {
      collapsed: boolean;
      depth: number;
      folder: TaskContentFolderRow;
      kind: "folder";
      members: TTask[];
      visibleTaskCount: number;
    }
  | {
      depth: number;
      kind: "task";
      task: TTask;
    };

export type TaskContentFolderMenuOption = {
  id: string | null;
  label: string;
};

export type TaskContentFolderMemberFact = {
  id: string;
  parent_task_id?: string | null;
  task_content_folder_id?: string | null;
  isPinned: boolean;
  isRoutine: boolean;
  hasAttention: boolean;
};

export type TaskContentFolderMemberSummary = {
  allPinned: boolean;
  allRoutine: boolean;
  anyPinned: boolean;
  anyRoutine: boolean;
  attentionCount: number;
  memberTaskIds: string[];
  pinnedTaskIds: string[];
  routineTaskIds: string[];
};

export type TaskContentFolderProjectionOptions = {
  /** Allow persistent empty folders to remain visible in normal browsing. */
  includeEmptyFolders?: boolean;
  /** Folder IDs that are empty across the broad Task universe, not just the visible result. */
  persistentEmptyFolderIds?: ReadonlySet<string>;
};

export type TaskContentFolderVisibilityInput = {
  /** Retained for callers that track the selected bucket; bucket identity does not decide visibility. */
  currentListId?: string | null;
  hasHierarchyFiltersActive?: boolean;
  hasSearchActive?: boolean;
  hasStructuredFiltersActive?: boolean;
};

export function shouldIncludeEmptyTaskContentFolders({
  hasHierarchyFiltersActive = false,
  hasSearchActive = false,
  hasStructuredFiltersActive = false,
}: TaskContentFolderVisibilityInput) {
  return !hasHierarchyFiltersActive
    && !hasSearchActive
    && !hasStructuredFiltersActive;
}

function normalizeParentId(folder: Pick<TaskContentFolderRow, "parent_folder_id">) {
  return folder.parent_folder_id ?? null;
}

function folderCreatedAt(folder: TaskContentFolderRow) {
  return folder.created_at || "";
}

export function getTaskContentFolderDescendantIds(
  folders: readonly TaskContentFolderRow[],
  folderId: string,
) {
  const descendants = new Set<string>();
  const childrenByParent = new Map<string, string[]>();
  for (const folder of folders) {
    const parentId = normalizeParentId(folder);
    if (parentId) {
      const children = childrenByParent.get(parentId) ?? [];
      children.push(folder.id);
      childrenByParent.set(parentId, children);
    }
  }

  const visit = (parentId: string) => {
    for (const childId of childrenByParent.get(parentId) ?? []) {
      if (descendants.has(childId)) continue;
      descendants.add(childId);
      visit(childId);
    }
  };
  visit(folderId);
  return descendants;
}

export function canMoveTaskContentFolderInto(
  folders: readonly TaskContentFolderRow[],
  folderId: string,
  destinationFolderId: string | null,
  ownerUserId?: string | null,
) {
  if (destinationFolderId === null) return true;
  if (destinationFolderId === folderId) return false;
  const destination = folders.find((folder) => folder.id === destinationFolderId);
  if (!destination) return false;
  if (ownerUserId && destination.user_id !== ownerUserId) return false;
  return !getTaskContentFolderDescendantIds(folders, folderId).has(destinationFolderId);
}

export function validateTaskContentFolderParent(
  folders: readonly TaskContentFolderRow[],
  folderId: string | null,
  parentFolderId: string | null,
  ownerUserId?: string | null,
) {
  if (parentFolderId === null) return null;
  if (folderId && folderId === parentFolderId) return "A Folder cannot be its own parent.";
  const parent = folders.find((folder) => folder.id === parentFolderId);
  if (!parent || (ownerUserId && parent.user_id !== ownerUserId)) {
    return "That parent Folder is unavailable.";
  }
  if (folderId && getTaskContentFolderDescendantIds(folders, folderId).has(parentFolderId)) {
    return "A Folder cannot be moved inside one of its descendants.";
  }
  return null;
}

export function getTaskContentFolderPath(
  folders: readonly TaskContentFolderRow[],
  folderId: string,
) {
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const path: string[] = [];
  const seen = new Set<string>();
  let current = folderById.get(folderId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current.name);
    const parentId = normalizeParentId(current);
    current = parentId ? folderById.get(parentId) : undefined;
  }
  return path;
}

export function getTaskContentFolderPathLabel(
  folders: readonly TaskContentFolderRow[],
  folderId: string,
) {
  return getTaskContentFolderPath(folders, folderId).join(" / ");
}

export function getTaskContentFolderMoveOptions(
  folders: readonly TaskContentFolderRow[],
  folderId: string,
  ownerUserId?: string | null,
): TaskContentFolderMenuOption[] {
  const options = folders
    .filter((folder) => canMoveTaskContentFolderInto(folders, folderId, folder.id, ownerUserId))
    .sort((left, right) => (
      getTaskContentFolderPathLabel(folders, left.id).localeCompare(getTaskContentFolderPathLabel(folders, right.id))
      || left.id.localeCompare(right.id)
    ))
    .map((folder) => ({ id: folder.id, label: getTaskContentFolderPathLabel(folders, folder.id) }));
  return [{ id: null, label: "No Parent" }, ...options];
}

export function buildTaskContentFolderMemberSummary(
  tasks: readonly TaskContentFolderMemberFact[],
  folderId: string,
  folders: readonly TaskContentFolderRow[] = [],
): TaskContentFolderMemberSummary {
  const folderIds = new Set([folderId, ...getTaskContentFolderDescendantIds(folders, folderId)]);
  const members = tasks.filter((task) => (
    (task.parent_task_id ?? null) === null
    && task.task_content_folder_id !== null
    && folderIds.has(task.task_content_folder_id ?? "")
  ));
  const memberTaskIds = members.map((task) => task.id);
  const pinnedTaskIds = members.filter((task) => task.isPinned).map((task) => task.id);
  const routineTaskIds = members.filter((task) => task.isRoutine).map((task) => task.id);

  return {
    allPinned: members.length > 0 && pinnedTaskIds.length === members.length,
    allRoutine: members.length > 0 && routineTaskIds.length === members.length,
    anyPinned: pinnedTaskIds.length > 0,
    anyRoutine: routineTaskIds.length > 0,
    attentionCount: members.filter((task) => task.hasAttention).length,
    memberTaskIds,
    pinnedTaskIds,
    routineTaskIds,
  };
}

export function getTaskContentFolderRoutineToggleTaskIds(summary: Pick<TaskContentFolderMemberSummary, "allRoutine" | "memberTaskIds" | "routineTaskIds">) {
  return summary.allRoutine
    ? summary.routineTaskIds
    : summary.memberTaskIds.filter((taskId) => !summary.routineTaskIds.includes(taskId));
}

export function normalizeTaskContentFolderName(value: string) {
  return value.trim().slice(0, TASK_CONTENT_FOLDER_NAME_MAX_LENGTH);
}

export function validateTaskContentFolderName(value: string) {
  const name = value.trim();
  if (!name) return "Folder name can't be empty.";
  if (name.length > TASK_CONTENT_FOLDER_NAME_MAX_LENGTH) {
    return `Folder names must be ${TASK_CONTENT_FOLDER_NAME_MAX_LENGTH} characters or fewer.`;
  }
  return null;
}

export function normalizeTaskContentFolderRow(row: unknown): TaskContentFolderRow | null {
  if (!row || typeof row !== "object") return null;
  const candidate = row as Partial<TaskContentFolderRow>;
  if (
    typeof candidate.id !== "string"
    || typeof candidate.user_id !== "string"
    || typeof candidate.name !== "string"
    || typeof candidate.created_at !== "string"
    || typeof candidate.updated_at !== "string"
  ) {
    return null;
  }
  const name = normalizeTaskContentFolderName(candidate.name);
  return validateTaskContentFolderName(name)
    ? null
    : {
        ...candidate,
        icon_key: typeof candidate.icon_key === "string" ? candidate.icon_key : "folder",
        name,
        parent_folder_id: typeof candidate.parent_folder_id === "string" ? candidate.parent_folder_id : null,
      } as TaskContentFolderRow;
}

export function buildTaskContentFolderAssignmentPatch(
  task: TaskContentFolderMembershipTask,
  folderId: string | null,
): TaskUpdate {
  return task.parent_task_id
    ? { parent_task_id: null, task_content_folder_id: folderId }
    : { task_content_folder_id: folderId };
}

export function getTaskContentFolderParentForTask(
  task: TaskContentFolderMembershipTask,
) {
  return (task.parent_task_id ?? null) === null ? task.task_content_folder_id ?? null : null;
}

export function validateTaskContentFolderMembership(
  task: TaskContentFolderMembershipTask,
  folderIds: ReadonlySet<string>,
) {
  const parentTaskId = task.parent_task_id ?? null;
  const folderId = task.task_content_folder_id ?? null;
  if (parentTaskId !== null && folderId !== null) {
    return "A Step/Substep cannot also be a direct Folder member.";
  }
  if (folderId !== null && !folderIds.has(folderId)) {
    return "Task Folder membership references an unavailable Folder.";
  }
  return null;
}

type FolderProjectionTask = { id: string; parent_task_id?: string | null; task_content_folder_id?: string | null };

export function getActuallyEmptyTaskContentFolderIds<TTask extends FolderProjectionTask>(
  allTasks: readonly TTask[],
  folders: readonly TaskContentFolderRow[],
) {
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const occupiedFolderIds = new Set<string>();

  const markFolderAndAncestors = (folderId: string) => {
    const visited = new Set<string>();
    let current = folderById.get(folderId);
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      occupiedFolderIds.add(current.id);
      const parentId = normalizeParentId(current);
      current = parentId ? folderById.get(parentId) : undefined;
    }
  };

  for (const task of allTasks) {
    if ((task.parent_task_id ?? null) !== null || !task.task_content_folder_id) continue;
    if (folderById.has(task.task_content_folder_id)) {
      markFolderAndAncestors(task.task_content_folder_id);
    }
  }

  return new Set(folders.filter((folder) => !occupiedFolderIds.has(folder.id)).map((folder) => folder.id));
}

function sortProjectionChildren<TTask extends FolderProjectionTask>(
  children: TaskContentFolderPresentationNode<TTask>[],
  folders: readonly TaskContentFolderRow[],
  visibleTaskIndex: ReadonlyMap<string, number>,
) {
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  return children.sort((left, right) => {
    const leftIsStructural = left.kind === "folder" && left.firstVisibleDescendantIndex === null;
    const rightIsStructural = right.kind === "folder" && right.firstVisibleDescendantIndex === null;
    if (leftIsStructural !== rightIsStructural) return leftIsStructural ? -1 : 1;

    const leftIndex = left.kind === "task" ? visibleTaskIndex.get(left.task.id) ?? Number.MAX_SAFE_INTEGER : left.firstVisibleDescendantIndex ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = right.kind === "task" ? visibleTaskIndex.get(right.task.id) ?? Number.MAX_SAFE_INTEGER : right.firstVisibleDescendantIndex ?? Number.MAX_SAFE_INTEGER;
    if (!leftIsStructural && !rightIsStructural && leftIndex !== rightIndex) return leftIndex - rightIndex;
    if (left.kind === "task" && right.kind === "task") return 0;
    if (left.kind === "task") return -1;
    if (right.kind === "task") return 1;
    const leftFolder = folderById.get(left.folder.id) ?? left.folder;
    const rightFolder = folderById.get(right.folder.id) ?? right.folder;
    return folderCreatedAt(leftFolder).localeCompare(folderCreatedAt(rightFolder)) || left.folder.id.localeCompare(right.folder.id);
  });
}

export function buildTaskContentFolderPresentation<TTask extends FolderProjectionTask>(
  visibleTasks: readonly TTask[],
  folders: readonly TaskContentFolderRow[],
  options: TaskContentFolderProjectionOptions = {},
): TaskContentFolderPresentationBlock<TTask>[] {
  const includeEmptyFolders = options.includeEmptyFolders ?? false;
  const persistentEmptyFolderIds = options.persistentEmptyFolderIds;
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const visibleTaskIndex = new Map(visibleTasks.map((task, index) => [task.id, index]));
  const directTasksByFolder = new Map<string, TTask[]>();
  const standalone: TaskContentFolderPresentationNode<TTask>[] = [];

  visibleTasks.forEach((task) => {
    const folderId = (task.parent_task_id ?? null) === null ? task.task_content_folder_id ?? null : null;
    const folder = folderId ? folderById.get(folderId) : undefined;
    if (!folder) {
      standalone.push({ depth: 0, kind: "task", task });
      return;
    }
    const members = directTasksByFolder.get(folder.id) ?? [];
    members.push(task);
    directTasksByFolder.set(folder.id, members);
  });

  const childFoldersByParent = new Map<string | null, TaskContentFolderRow[]>();
  for (const folder of folders) {
    const parentId = normalizeParentId(folder);
    const effectiveParentId = parentId && folderById.has(parentId) && parentId !== folder.id ? parentId : null;
    const children = childFoldersByParent.get(effectiveParentId) ?? [];
    children.push(folder);
    childFoldersByParent.set(effectiveParentId, children);
  }

  const buildFolder = (
    folder: TaskContentFolderRow,
    depth: number,
    ancestorIds: ReadonlySet<string>,
  ): TaskContentFolderFolderNode<TTask> | null => {
    if (ancestorIds.has(folder.id)) return null;
    const nextAncestors = new Set(ancestorIds);
    nextAncestors.add(folder.id);
    const directMembers = directTasksByFolder.get(folder.id) ?? [];
    const childNodes = (childFoldersByParent.get(folder.id) ?? [])
      .map((child) => buildFolder(child, depth + 1, nextAncestors))
      .filter((child): child is TaskContentFolderFolderNode<TTask> => child !== null);
    const children: TaskContentFolderPresentationNode<TTask>[] = [
      ...directMembers.map((task) => ({ depth: depth + 1, kind: "task" as const, task })),
      ...childNodes,
    ];
    sortProjectionChildren(children, folders, visibleTaskIndex);
    const descendantTaskIds = children.flatMap((child) => child.kind === "task" ? [child.task.id] : child.descendantTaskIds);
    const descendantIndexes = descendantTaskIds
      .map((taskId) => visibleTaskIndex.get(taskId))
      .filter((index): index is number => typeof index === "number");
    const keepFolder = descendantTaskIds.length > 0
      || childNodes.length > 0
      || (includeEmptyFolders && (!persistentEmptyFolderIds || persistentEmptyFolderIds.has(folder.id)));
    if (!keepFolder) return null;
    const firstVisibleDescendantIndex = descendantIndexes.length > 0 ? Math.min(...descendantIndexes) : null;
    return {
      children,
      depth,
      descendantTaskIds,
      firstVisibleDescendantIndex,
      folder,
      firstVisibleMemberIndex: firstVisibleDescendantIndex ?? visibleTasks.length,
      kind: "folder",
      members: directMembers,
      visibleTaskCount: descendantTaskIds.length,
    };
  };

  const roots = (childFoldersByParent.get(null) ?? [])
    .map((folder) => buildFolder(folder, 0, new Set<string>()))
    .filter((folder): folder is TaskContentFolderFolderNode<TTask> => folder !== null);
  return sortProjectionChildren([...standalone, ...roots], folders, visibleTaskIndex) as TaskContentFolderPresentationBlock<TTask>[];
}

export function flattenTaskContentFolderPresentation<TTask extends FolderProjectionTask>(
  presentation: readonly TaskContentFolderPresentationNode<TTask>[],
  collapsedFolderIds: ReadonlySet<string> = new Set(),
): TaskContentFolderRenderEntry<TTask>[] {
  const entries: TaskContentFolderRenderEntry<TTask>[] = [];
  const visit = (node: TaskContentFolderPresentationNode<TTask>) => {
    if (node.kind === "task") {
      entries.push({ depth: node.depth, kind: "task", task: node.task });
      return;
    }
    const collapsed = collapsedFolderIds.has(node.folder.id);
    entries.push({
      collapsed,
      depth: node.depth,
      folder: node.folder,
      kind: "folder",
      members: node.members,
      visibleTaskCount: node.visibleTaskCount,
    });
    if (!collapsed) node.children.forEach(visit);
  };
  presentation.forEach(visit);
  return entries;
}

export function getTaskContentFolderMenuOptions(
  folders: readonly TaskContentFolderRow[],
  task: TaskContentFolderMembershipTask,
): TaskContentFolderMenuOption[] {
  const options: TaskContentFolderMenuOption[] = folders
    .slice()
    .sort((left, right) => (
      getTaskContentFolderPathLabel(folders, left.id).localeCompare(getTaskContentFolderPathLabel(folders, right.id))
      || left.id.localeCompare(right.id)
    ))
    .map((folder) => ({ id: folder.id, label: getTaskContentFolderPathLabel(folders, folder.id) }));
  if ((task.parent_task_id ?? null) === null) options.unshift({ id: null, label: "No Folder" });
  return options;
}

export function countVisibleTaskContentFolderMembers<TTask extends FolderProjectionTask>(
  visibleTasks: readonly TTask[],
  folderId: string,
  folders: readonly TaskContentFolderRow[] = [],
) {
  const folderIds = new Set([folderId, ...getTaskContentFolderDescendantIds(folders, folderId)]);
  return visibleTasks.filter((task) => (
    (task.parent_task_id ?? null) === null
    && task.task_content_folder_id !== null
    && folderIds.has(task.task_content_folder_id ?? "")
  )).length;
}
