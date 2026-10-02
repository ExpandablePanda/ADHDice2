import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Task, TaskHistory } from "./database.types.ts";
import { fetchAllPagedRows, type PaginatedReadResult } from "./paginated-read.ts";
import { deduplicateTaskHistoryByLogicalDate } from "./task-state-canonical/history-deduplication.ts";
import type { CanonicalTaskHistoryFact } from "./task-state-canonical/types.ts";
import { mapCanonicalTaskHistoryFacts } from "./task-state-canonical/history-projection.ts";
import { quotaPeriodBounds, quotaProgressForTask } from "./task-state-engine/quota.ts";

export type QuotaCurrentPeriodHistoryWindow = {
  endDate: string;
  startDate: string;
};

export type QuotaCurrentPeriodHistoryByTaskId = Record<string, TaskHistory[]>;

export type QuotaCurrentPeriodHistoryClient = SupabaseClient<Database>;

type TaskWithQuotaBoundary = Task & {
  canonical_schedule_boundary?: {
    effective_from_logical_date?: string | null;
    repeat_frequency?: string | null;
  } | null;
};

export function getQuotaCurrentPeriodHistoryWindow(logicalDate: string): QuotaCurrentPeriodHistoryWindow {
  const weeklyStart = quotaPeriodBounds(logicalDate, "week").start;
  const monthlyStart = quotaPeriodBounds(logicalDate, "month").start;
  return {
    endDate: logicalDate,
    startDate: weeklyStart < monthlyStart ? weeklyStart : monthlyStart,
  };
}

export function getActiveQuotaTaskIds(tasks: readonly Task[], logicalDate: string) {
  return tasks
    .filter((task) => quotaProgressForTask({ task, logicalDate }) !== null)
    .map((task) => task.id)
    .filter((taskId, index, taskIds) => taskIds.indexOf(taskId) === index)
    .sort();
}

export function getActiveQuotaTaskContextKey(tasks: readonly Task[], logicalDate: string) {
  return tasks
    .filter((task) => quotaProgressForTask({ task, logicalDate }) !== null)
    .map((task) => {
      const taskWithQuotaBoundary = task as TaskWithQuotaBoundary;
      return [
        task.id,
        task.repeat_frequency,
        task.repeat_quota_count ?? null,
        task.status ?? null,
        task.due_on ?? null,
        task.terminal_state ?? null,
        task.container_state ?? null,
        taskWithQuotaBoundary.canonical_schedule_boundary?.effective_from_logical_date ?? null,
        taskWithQuotaBoundary.canonical_schedule_boundary?.repeat_frequency ?? null,
      ].join(":");
    })
    .sort()
    .join(",");
}

function toPaginatedReadResult<T>(result: { data: T[] | null; error: { code?: string; message?: string } | null }): PaginatedReadResult<T> {
  return {
    data: result.data,
    error: result.error
      ? { code: result.error.code, message: result.error.message ?? "Could not load quota History." }
      : null,
  };
}

export async function fetchQuotaCurrentPeriodHistory(
  client: QuotaCurrentPeriodHistoryClient,
  input: { logicalDate: string; ownerId: string; taskIds: readonly string[] },
): Promise<QuotaCurrentPeriodHistoryByTaskId> {
  const taskIds = [...new Set(input.taskIds)].filter(Boolean).sort();
  const rowsByTaskId: QuotaCurrentPeriodHistoryByTaskId = Object.fromEntries(taskIds.map((taskId) => [taskId, []]));
  if (taskIds.length === 0) return rowsByTaskId;

  const window = getQuotaCurrentPeriodHistoryWindow(input.logicalDate);
  const result = await fetchAllPagedRows<CanonicalTaskHistoryFact>(async (from, to) => {
    const page = await client
      .from("adhdice_task_history_facts")
      .select("*")
      .eq("user_id", input.ownerId)
      .in("entity_id", taskIds)
      .gte("logical_date", window.startDate)
      .lte("logical_date", window.endDate)
      .order("logical_date", { ascending: false })
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to);
    return toPaginatedReadResult(page as { data: CanonicalTaskHistoryFact[] | null; error: { code?: string; message?: string } | null });
  });

  if (result.error) throw new Error(result.error.message);

  const requestedTaskIds = new Set(taskIds);
  for (const row of mapCanonicalTaskHistoryFacts((result.data ?? []) as CanonicalTaskHistoryFact[]) as TaskHistory[]) {
    if (!requestedTaskIds.has(row.task_id)) continue;
    rowsByTaskId[row.task_id] = deduplicateTaskHistoryByLogicalDate([
      ...(rowsByTaskId[row.task_id] ?? []),
      row,
    ]);
  }
  return rowsByTaskId;
}
