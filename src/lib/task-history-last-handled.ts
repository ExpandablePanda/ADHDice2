import type { Task, TaskHistory } from "@/lib/database.types";
import { shouldExposeHistoryEventTimestamp } from "@/lib/task-history-cutover";
import type { CanonicalTaskCalendarOverride, CanonicalTaskCommandOperation } from "@/lib/task-state-canonical/types";

export type TaskManualActionRecord = {
  identity: string;
  logicalDate: string;
  occurredAt: string | null;
  source: "calendar_override" | "command" | "history";
  timestampIsAuthoritative?: boolean;
  taskId: string;
};

export type TaskHistoryLastHandledSummary = {
  dateKey: string;
  timestamp: string | null;
};

export type TaskHistoryLastHandledSummaryMap = Record<string, TaskHistoryLastHandledSummary>;

const MANUAL_COMMAND_TYPES = new Set<CanonicalTaskCommandOperation["command_type"]>([
  "set_outcome",
  "clear_outcome",
  "complete_task",
  "delay_occurrence",
  "calendar_override",
  "archive_task",
  "trash_task",
  "restore_task",
  "start_in_progress",
  "clear_in_progress",
]);

function isManualHistoryFact(entry: Pick<TaskHistory, "canonical_provenance_kind" | "canonical_source">) {
  const provenance = entry.canonical_provenance_kind;
  if (provenance === "migration_reconstruction" || provenance === "repair" || provenance === "authorized_automation") {
    return false;
  }
  return !entry.canonical_source || entry.canonical_source === "task_state_command" || provenance === undefined || provenance === "user" || provenance === "manual";
}

function isManualCalendarOverride(override: CanonicalTaskCalendarOverride) {
  return override.is_active
    && override.provenance_kind === "manual"
    && override.actor_kind === "user";
}

function isManualCommand(operation: CanonicalTaskCommandOperation) {
  if (operation.state !== "committed" || operation.source_kind !== "runtime" || !operation.requested_logical_date) {
    return false;
  }
  if (!MANUAL_COMMAND_TYPES.has(operation.command_type)) {
    return false;
  }
  return operation.command_type !== "set_due_date";
}

function isExplicitUnscheduledCommand(operation: CanonicalTaskCommandOperation) {
  return operation.state === "committed"
    && operation.source_kind === "runtime"
    && operation.command_type === "set_due_date"
    && operation.requested_logical_date !== null
    && operation.result_references.manual_action === "unscheduled_status";
}

function compareActionRecords(left: TaskManualActionRecord, right: TaskManualActionRecord) {
  const dateOrder = left.logicalDate.localeCompare(right.logicalDate);
  if (dateOrder !== 0) return dateOrder;
  const leftTimestamp = left.occurredAt ?? "";
  const rightTimestamp = right.occurredAt ?? "";
  if (leftTimestamp !== rightTimestamp) return leftTimestamp.localeCompare(rightTimestamp);
  return left.identity.localeCompare(right.identity);
}

function getPresentationTimestamp(record: TaskManualActionRecord, currentLogicalDateKey?: string) {
  if (!record.occurredAt || !currentLogicalDateKey || record.logicalDate >= currentLogicalDateKey) {
    return record.occurredAt;
  }
  if (record.timestampIsAuthoritative && record.occurredAt.slice(0, 10) === record.logicalDate) {
    return record.occurredAt;
  }
  return `${record.logicalDate}T00:00:00`;
}

function manualActionRecordsForTask(
  taskId: string,
  history: readonly TaskHistory[],
  calendarOverrides: readonly CanonicalTaskCalendarOverride[],
  commandOperations: readonly CanonicalTaskCommandOperation[],
) {
  const records: TaskManualActionRecord[] = [];
  for (const entry of history) {
    if (entry.task_id !== taskId || !isManualHistoryFact(entry)) continue;
    records.push({
      identity: `history:${entry.id}`,
      logicalDate: entry.entry_date,
      occurredAt: entry.updated_at || entry.created_at || null,
      source: "history",
      taskId,
      timestampIsAuthoritative: shouldExposeHistoryEventTimestamp(entry),
    });
  }
  for (const override of calendarOverrides) {
    if (override.entity_id !== taskId || !isManualCalendarOverride(override)) continue;
    records.push({
      identity: `calendar_override:${override.id}`,
      logicalDate: override.logical_date,
      occurredAt: override.updated_at || override.created_at || null,
      source: "calendar_override",
      taskId,
      timestampIsAuthoritative: true,
    });
  }
  for (const operation of commandOperations) {
    if (operation.entity_id !== taskId || (!isManualCommand(operation) && !isExplicitUnscheduledCommand(operation))) continue;
    records.push({
      identity: `command:${operation.id}`,
      logicalDate: operation.requested_logical_date!,
      occurredAt: operation.completed_at || operation.created_at || null,
      source: "command",
      taskId,
      timestampIsAuthoritative: true,
    });
  }
  return records;
}

export function buildTaskHistoryLastHandledSummaryMap(
  tasks: readonly Task[],
  history: readonly TaskHistory[],
  calendarOverrides: readonly CanonicalTaskCalendarOverride[] = [],
  commandOperations: readonly CanonicalTaskCommandOperation[] = [],
  currentLogicalDateKey?: string,
): TaskHistoryLastHandledSummaryMap {
  return Object.fromEntries(tasks.map((task) => {
    const latest = manualActionRecordsForTask(task.id, history, calendarOverrides, commandOperations)
      .sort(compareActionRecords)
      .at(-1);
    return [task.id, latest ? {
      dateKey: latest.logicalDate,
      timestamp: getPresentationTimestamp(latest, currentLogicalDateKey),
    } : null];
  }).filter((entry): entry is [string, TaskHistoryLastHandledSummary] => entry[1] !== null));
}
