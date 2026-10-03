import type { Task } from "@/lib/database.types";
import type { BatchIntakeDraft, BatchIntakeTaskDraft } from "@/lib/home-batch-intake";

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

export function getBatchIntakeTaskCandidates(title: string, tasks: readonly Task[]): BatchIntakeTaskCandidate[] {
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
    context: buildTaskContext(task, byId),
  }));
}

export function getBatchIntakeTaskMatchState(title: string, tasks: readonly Task[]): BatchIntakeTaskMatchState {
  const exactCount = tasks.filter((task) => isBatchIntakeTaskSelectable(task) && normalizeBatchIntakeTaskTitle(task.title) === normalizeBatchIntakeTaskTitle(title)).length;
  return exactCount === 1 ? "unique_exact" : exactCount > 1 ? "multiple_exact" : "no_exact";
}

function buildTaskContext(task: Task, byId: Map<string, Task>) {
  const ancestors: string[] = [];
  let parentId = task.parent_task_id;
  const seen = new Set<string>();
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    ancestors.unshift(parent.title);
    parentId = parent.parent_task_id;
  }
  return ancestors.length ? ancestors.join(" › ") : task.status === "archived" ? "Archived" : "Top-level Task";
}

function taskMatchIssue(state: BatchIntakeTaskMatchState) {
  return state === "unique_exact"
    ? []
    : state === "multiple_exact"
      ? ["Multiple exact Task matches require review"]
      : ["Select an existing canonical Task; no exact match was found"];
}

export function applyBatchIntakeTaskMatches(drafts: readonly BatchIntakeDraft[], tasks: readonly Task[]): BatchIntakeDraft[] {
  return drafts.map((draft) => {
    if (draft.kind !== "task") return draft;
    const exactCandidates = getBatchIntakeTaskCandidates(draft.taskTitle, tasks).filter(
      ({ task }) => normalizeBatchIntakeTaskTitle(task.title) === normalizeBatchIntakeTaskTitle(draft.taskTitle),
    );
    const state = exactCandidates.length === 1 ? "unique_exact" : exactCandidates.length > 1 ? "multiple_exact" : "no_exact";
    const existingMatchIssues = draft.issues.filter((issue) => !issue.includes("exact Task match") && !issue.includes("canonical Task"));
    return {
      ...draft,
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
    selectedTaskId: selected?.id ?? null,
    issues: selected ? retainedIssues : [...retainedIssues, "Select a canonical Task before applying"],
  };
}
