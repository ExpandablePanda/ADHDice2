import type { Task, TaskContentFolder, TaskUpdate } from "@/lib/database.types";

export const TASK_CONTENT_FOLDER_NAME_MAX_LENGTH = 120;

export type TaskContentFolderRow = Pick<TaskContentFolder, "created_at" | "icon_key" | "id" | "name" | "updated_at" | "user_id">;

export type TaskContentFolderPresentationBlock<TTask> =
  | {
      firstVisibleMemberIndex: number;
      folder: TaskContentFolderRow;
      kind: "folder";
      members: TTask[];
    }
  | {
      firstVisibleMemberIndex: number;
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

export function buildTaskContentFolderMemberSummary(
  tasks: readonly TaskContentFolderMemberFact[],
  folderId: string,
): TaskContentFolderMemberSummary {
  const members = tasks.filter((task) => (
    (task.parent_task_id ?? null) === null
    && task.task_content_folder_id === folderId
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
    : { ...candidate, icon_key: typeof candidate.icon_key === "string" ? candidate.icon_key : "folder", name } as TaskContentFolderRow;
}

export function buildTaskContentFolderAssignmentPatch(
  task: Pick<Task, "parent_task_id">,
  folderId: string | null,
): TaskUpdate {
  return task.parent_task_id
    ? { parent_task_id: null, task_content_folder_id: folderId }
    : { task_content_folder_id: folderId };
}

export function validateTaskContentFolderMembership(
  task: Pick<Task, "parent_task_id" | "task_content_folder_id">,
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

export function buildTaskContentFolderPresentation<TTask extends { id: string; parent_task_id?: string | null; task_content_folder_id?: string | null }>(
  visibleTasks: readonly TTask[],
  folders: readonly TaskContentFolderRow[],
): TaskContentFolderPresentationBlock<TTask>[] {
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const folderMembers = new Map<string, TTask[]>();
  const folderFirstIndex = new Map<string, number>();
  const standalone: TaskContentFolderPresentationBlock<TTask>[] = [];

  visibleTasks.forEach((task, index) => {
    const folderId = (task.parent_task_id ?? null) === null ? task.task_content_folder_id ?? null : null;
    const folder = folderId ? folderById.get(folderId) : undefined;
    if (!folder) {
      standalone.push({ firstVisibleMemberIndex: index, kind: "task", task });
      return;
    }
    const members = folderMembers.get(folder.id) ?? [];
    members.push(task);
    folderMembers.set(folder.id, members);
    if (!folderFirstIndex.has(folder.id)) folderFirstIndex.set(folder.id, index);
  });

  const folderBlocks = [...folderMembers.entries()].map(([folderId, members]) => ({
    firstVisibleMemberIndex: folderFirstIndex.get(folderId) ?? 0,
    folder: folderById.get(folderId)!,
    kind: "folder" as const,
    members,
  }));

  return [...standalone, ...folderBlocks].sort((left, right) => left.firstVisibleMemberIndex - right.firstVisibleMemberIndex);
}

export function getTaskContentFolderMenuOptions(
  folders: readonly TaskContentFolderRow[],
  task: Pick<Task, "parent_task_id" | "task_content_folder_id">,
): TaskContentFolderMenuOption[] {
  const options: TaskContentFolderMenuOption[] = folders
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
    .map((folder) => ({ id: folder.id, label: folder.name }));
  if ((task.parent_task_id ?? null) === null) options.unshift({ id: null, label: "No Folder" });
  return options;
}

export function countVisibleTaskContentFolderMembers<TTask extends { parent_task_id?: string | null; task_content_folder_id?: string | null }>(
  visibleTasks: readonly TTask[],
  folderId: string,
) {
  return visibleTasks.filter((task) => (task.parent_task_id ?? null) === null && task.task_content_folder_id === folderId).length;
}
