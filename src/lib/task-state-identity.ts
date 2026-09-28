import type { Task } from "./database.types.ts";
import { createProjectionDomainRevision } from "./stable-task-projection.ts";

export type ActiveStatusResultLike = {
  authority: string;
  dueOnByTaskId: Record<string, unknown>;
  statusesByTaskId: Record<string, unknown>;
};

export function areTaskCollectionsSemanticallyEqual(
  current: readonly Task[],
  next: readonly Task[],
) {
  return createProjectionDomainRevision("task-state", current)
    === createProjectionDomainRevision("task-state", next);
}

export function keepCurrentTaskArrayIfSemanticallyEqual(current: Task[], next: Task[]) {
  return areTaskCollectionsSemanticallyEqual(current, next) ? current : next;
}

function activeStatusSemanticValue(result: ActiveStatusResultLike | null) {
  if (result === null) return null;
  return {
    authority: result.authority,
    dueOnByTaskId: result.dueOnByTaskId,
    statusesByTaskId: result.statusesByTaskId,
  };
}

export function areActiveStatusResultsSemanticallyEqual(
  current: ActiveStatusResultLike | null,
  next: ActiveStatusResultLike | null,
) {
  return createProjectionDomainRevision("active-status-result", activeStatusSemanticValue(current))
    === createProjectionDomainRevision("active-status-result", activeStatusSemanticValue(next));
}

export function keepCurrentActiveStatusResult<T extends ActiveStatusResultLike | null>(current: T, next: T) {
  return areActiveStatusResultsSemanticallyEqual(current, next) ? current : next;
}
