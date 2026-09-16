export type TaskEditorNavigationDirection = "next" | "previous";

export function normalizeTaskEditorNavigationTaskIds(taskIds: readonly string[]) {
  return Array.from(new Set(taskIds.filter((taskId) => taskId.length > 0)));
}

export function getTaskEditorNavigationPosition(taskIds: readonly string[], currentTaskId: string) {
  const normalizedTaskIds = normalizeTaskEditorNavigationTaskIds(taskIds);
  const index = normalizedTaskIds.indexOf(currentTaskId);
  return index < 0 ? null : { count: normalizedTaskIds.length, index: index + 1 };
}

export function getTaskEditorNavigationNeighbor({
  currentTaskId,
  direction,
  isTaskAvailable,
  taskIds,
}: {
  currentTaskId: string;
  direction: TaskEditorNavigationDirection;
  isTaskAvailable: (taskId: string) => boolean;
  taskIds: readonly string[];
}) {
  const normalizedTaskIds = normalizeTaskEditorNavigationTaskIds(taskIds);
  const currentIndex = normalizedTaskIds.indexOf(currentTaskId);
  if (currentIndex < 0) {
    return null;
  }

  const step = direction === "previous" ? -1 : 1;
  for (let index = currentIndex + step; index >= 0 && index < normalizedTaskIds.length; index += step) {
    const candidateTaskId = normalizedTaskIds[index];
    if (isTaskAvailable(candidateTaskId)) {
      return candidateTaskId;
    }
  }

  return null;
}
