import type { Task } from "@/lib/database.types";
import { batchIntakeCanonicalGroupId, type BatchIntakeDraft, type BatchIntakeTaskDraft } from "@/lib/home-batch-intake";
import { getTaskContentFolderPathLabel, type TaskContentFolderRow } from "@/lib/task-content-folders";

export type BatchIntakeTaskMatchState = "unique_exact" | "multiple_exact" | "no_exact";

export type BatchIntakeTaskCandidate = {
  task: Task;
  context: string;
};

export function normalizeBatchIntakeTaskTitle(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}
export function isBatchIntakeTaskSelectable(task: Pick<Task, "status" | "permanently_deleted_at">) {
  return task.status !== "trashed" && task.permanently_deleted_at == null;
}

export function getBatchIntakeTaskCandidates(title: string, tasks: readonly Task[], taskContentFolders: readonly TaskContentFolderRow[] = []): BatchIntakeTaskCandidate[] {
  const needle = normalizeBatchIntakeTaskTitle(title);
  if (!needle) return [];
  const eligible = tasks.filter(isBatchIntakeTaskSelectable);
  const exact = eligible.filter((task) => normalizeBatchIntakeTaskTitle(task.title) === needle);
  const source = exact.length > 0
    ? exact
    : eligible
      .filter((task) => normalizeBatchIntakeTaskTitle(task.title).includes(needle) || needle.includes(normalizeBatchIntakeTaskTitle(task.title)))
      .slice(0, 12);
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return source.map((task) => ({
    task,
    context: buildBatchIntakeTaskContext(task, byId, taskContentFolders),
  }));
}

export function getBatchIntakeTaskMatchState(title: string, tasks: readonly Task[]): BatchIntakeTaskMatchState {
  const exactCount = tasks.filter((task) => isBatchIntakeTaskSelectable(task) && normalizeBatchIntakeTaskTitle(task.title) === normalizeBatchIntakeTaskTitle(title)).length;
  return exactCount === 1 ? "unique_exact" : exactCount > 1 ? "multiple_exact" : "no_exact";
}

export function buildBatchIntakeTaskContext(task: Task, byId: Map<string, Task>, taskContentFolders: readonly TaskContentFolderRow[] = []) {
  const ancestors: string[] = [];
  let parentId = task.parent_task_id;
  const seen = new Set<string>([task.id]);
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    ancestors.unshift(parent.title);
    parentId = parent.parent_task_id;
  }
  const rootTask = (() => {
    let current = task;
    const rootSeen = new Set<string>();
    while (current.parent_task_id) {
      if (rootSeen.has(current.id)) return null;
      rootSeen.add(current.id);
      const parent = byId.get(current.parent_task_id);
      if (!parent) return null;
      current = parent;
    }
    return current;
  })();
  const folderPath = rootTask?.task_content_folder_id
    ? getTaskContentFolderPathLabel(taskContentFolders, rootTask.task_content_folder_id)
    : "";
  const context = ancestors.length
    ? `Parent: ${ancestors.join(" › ")}`
    : `Folder: ${folderPath || "No Folder"}`;
  const folderContext = ancestors.length && folderPath ? ` · Folder: ${folderPath}` : "";
  const archivedContext = task.status === "archived" ? " · Archived" : "";
  return `${context}${folderContext}${archivedContext}`;
}

function taskMatchIssue(state: BatchIntakeTaskMatchState) {
  return state === "unique_exact"
    ? []
    : state === "multiple_exact"
      ? ["Multiple exact Task matches require review"]
      : ["Select an existing canonical Task; no exact match was found"];
}

export function applyBatchIntakeTaskMatches(drafts: readonly BatchIntakeDraft[], tasks: readonly Task[], taskContentFolders: readonly TaskContentFolderRow[] = []): BatchIntakeDraft[] {
  return drafts.map((draft) => {
    if (draft.kind !== "task") return draft;
    const exactCandidates = getBatchIntakeTaskCandidates(draft.taskTitle, tasks, taskContentFolders).filter(
      ({ task }) => normalizeBatchIntakeTaskTitle(task.title) === normalizeBatchIntakeTaskTitle(draft.taskTitle),
    );
    const state = exactCandidates.length === 1 ? "unique_exact" : exactCandidates.length > 1 ? "multiple_exact" : "no_exact";
    const existingMatchIssues = draft.issues.filter((issue) => !issue.includes("exact Task match") && !issue.includes("canonical Task"));
    return {
      ...draft,
      groupId: state === "unique_exact" ? batchIntakeCanonicalGroupId("task", exactCandidates[0].task.id) : draft.groupId,
      selectedTaskId: state === "unique_exact" ? exactCandidates[0].task.id : null,
      confidence: state === "unique_exact" ? "high" : draft.confidence,
      issues: [...existingMatchIssues, ...taskMatchIssue(state)],
    } satisfies BatchIntakeTaskDraft;
  });
}

export function setBatchIntakeTaskSelection(
  draft: BatchIntakeTaskDraft,
  selectedTaskId: string | null,
  tasks: readonly Task[],
): BatchIntakeTaskDraft {
  const selected = selectedTaskId ? tasks.find((task) => task.id === selectedTaskId && isBatchIntakeTaskSelectable(task)) : null;
  const retainedIssues = draft.issues.filter((issue) => !issue.includes("exact Task match") && !issue.includes("canonical Task") && !issue.includes("Select a Task"));
  return {
    ...draft,
    ...(selected ? { groupId: batchIntakeCanonicalGroupId("task", selected.id) } : {}),
    selectedTaskId: selected?.id ?? null,
    issues: selected ? retainedIssues : [...retainedIssues, "Select a canonical Task before applying"],
  };
}
