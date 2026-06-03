import { isUuid } from "@/lib/focus-utils";
import type { Task, TaskFocusDay as DbTaskFocusDay } from "@/lib/database.types";

export function isValidDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function normalizeTaskFocusIds(
  taskIds: string[] | null | undefined,
  validTaskIds?: Set<string> | Task[],
) {
  const validTaskIdSet = Array.isArray(validTaskIds)
    ? new Set(validTaskIds.map((task) => task.id))
    : validTaskIds;

  return Array.from(
    new Set(
      (taskIds ?? []).filter((taskId): taskId is string => {
        if (typeof taskId !== "string" || !isUuid(taskId)) {
          return false;
        }

        return validTaskIdSet ? validTaskIdSet.has(taskId) : true;
      }),
    ),
  );
}

export function mapTaskFocusDayRows(rows: DbTaskFocusDay[], tasks: Task[]) {
  const validTaskIds = new Set(tasks.map((task) => task.id));

  return rows.reduce<Record<string, string[]>>((accumulator, row) => {
    const normalizedTaskIds = normalizeTaskFocusIds(row.task_ids, validTaskIds);
    if (normalizedTaskIds.length > 0) {
      accumulator[row.focus_date] = normalizedTaskIds;
    }
    return accumulator;
  }, {});
}
