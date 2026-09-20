import type { Task } from "@/lib/database.types";
import type { RecordTaskEvidenceItem } from "@/lib/records/evidence";

export function getSelectableRecordEvidenceTaskIds(
  evidence: readonly RecordTaskEvidenceItem[],
  tasksById: ReadonlyMap<string, Pick<Task, "id" | "status" | "permanently_deleted_at">>,
  effectivelyExcludedTaskIds: ReadonlySet<string>,
) {
  const taskIds = new Set<string>();
  for (const item of evidence) {
    const task = tasksById.get(item.taskId);
    if (!task || task.permanently_deleted_at || effectivelyExcludedTaskIds.has(task.id)) continue;
    taskIds.add(task.id);
  }
  return [...taskIds];
}

export function normalizeRecordEvidenceTaskSelection(
  taskIds: readonly string[],
  selectableTaskIds: ReadonlySet<string>,
) {
  return [...new Set(taskIds)].filter((taskId) => selectableTaskIds.has(taskId));
}

export function toggleRecordEvidenceTaskSelection(
  selectedTaskIds: readonly string[],
  taskId: string,
  selectableTaskIds: ReadonlySet<string>,
) {
  const next = new Set(normalizeRecordEvidenceTaskSelection(selectedTaskIds, selectableTaskIds));
  if (next.has(taskId)) next.delete(taskId);
  else if (selectableTaskIds.has(taskId)) next.add(taskId);
  return [...next];
}
