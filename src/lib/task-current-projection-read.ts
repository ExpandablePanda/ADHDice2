import type { Task, TaskCurrentProjection } from "@/lib/database.types";
import { isCurrentTaskProjectionFresh } from "@/lib/task-current-projection-freshness";
import type { TaskDisplayStatus, TaskDisplayStatusByTaskId } from "@/lib/task-display-status";
import type { TaskHistoryStreakSummary, TaskHistoryStreakSummaryMap } from "@/lib/task-history-streak-summaries";

export const CURRENT_TASK_PROJECTION_READ_COLUMNS = [
  "user_id",
  "entity_id",
  "entity_kind",
  "display_status",
  "current_effective_due_on",
  "handled_current_logical_day",
  "last_handled_logical_date",
  "last_handled_at",
  "last_done_logical_date",
  "last_done_at",
  "current_positive_streak",
  "current_missed_streak",
  "canonical_task_revision",
  "history_sync_epoch",
  "logical_day_settings_revision",
  "projected_logical_date",
  "projection_schema_version",
  "projection_algorithm_version",
  "validity",
  "updated_at",
].join(",");

export type CurrentTaskProjectionReadRow = Pick<
  TaskCurrentProjection,
  | "user_id"
  | "entity_id"
  | "entity_kind"
  | "display_status"
  | "current_effective_due_on"
  | "handled_current_logical_day"
  | "last_handled_logical_date"
  | "last_handled_at"
  | "last_done_logical_date"
  | "last_done_at"
  | "current_positive_streak"
  | "current_missed_streak"
  | "canonical_task_revision"
  | "history_sync_epoch"
  | "logical_day_settings_revision"
  | "projected_logical_date"
  | "projection_schema_version"
  | "projection_algorithm_version"
  | "validity"
  | "updated_at"
>;

export type CurrentTaskProjectionReadMap = Record<string, CurrentTaskProjectionReadRow>;

export type LegacyCurrentTaskRead = {
  dueOnByTaskId?: Readonly<Record<string, string | null>>;
  statusesByTaskId?: Readonly<Record<string, TaskDisplayStatus>>;
};

export type CurrentTaskProjectionReadResolution = {
  displayStatusByTaskId: TaskDisplayStatusByTaskId;
  dueOnByTaskId: Record<string, string | null>;
  effectiveTaskHistoryStreakSummaries: TaskHistoryStreakSummaryMap;
  freshProjectionByTaskId: CurrentTaskProjectionReadMap;
  freshProjectionTaskIds: string[];
  staleProjectionTaskIds: string[];
  missingProjectionTaskIds: string[];
};

export type CurrentTaskProjectionParityMismatch = {
  field: "displayStatus" | "currentEffectiveDueOn" | "currentPositiveStreak" | "currentMissedStreak" | "lastHandledDate" | "lastHandledAt" | "lastDoneDate" | "lastDoneAt";
  taskId: string;
};

export type CurrentTaskProjectionParityResult = {
  fallbackCount: number;
  freshCount: number;
  mismatchedFields: CurrentTaskProjectionParityMismatch[];
  mismatchedTaskIds: string[];
};

export function indexCurrentTaskProjectionRows(rows: readonly CurrentTaskProjectionReadRow[]) {
  return rows.reduce<CurrentTaskProjectionReadMap>((map, row) => {
    map[row.entity_id] = row;
    return map;
  }, {});
}

function shouldReplaceCurrentTaskProjection(
  current: CurrentTaskProjectionReadRow | undefined,
  next: CurrentTaskProjectionReadRow,
) {
  if (!current) return true;
  return next.updated_at >= current.updated_at;
}

export function mergeCurrentTaskProjectionRows(
  current: CurrentTaskProjectionReadMap,
  rows: readonly CurrentTaskProjectionReadRow[],
) {
  let changed = false;
  const next = { ...current };
  for (const row of rows) {
    if (!shouldReplaceCurrentTaskProjection(next[row.entity_id], row)) continue;
    if (next[row.entity_id] === row) continue;
    next[row.entity_id] = row;
    changed = true;
  }
  return changed ? next : current;
}

export function projectionToTaskHistoryStreakSummary(
  projection: Pick<
    CurrentTaskProjectionReadRow,
    | "current_positive_streak"
    | "current_missed_streak"
    | "last_handled_logical_date"
    | "last_handled_at"
    | "last_done_logical_date"
    | "last_done_at"
  >,
): TaskHistoryStreakSummary {
  return {
    currentStreak: projection.current_positive_streak,
    missedStreak: projection.current_missed_streak,
    lastHandledDate: projection.last_handled_logical_date,
    lastHandledAt: projection.last_handled_at,
    lastDoneDate: projection.last_done_logical_date,
    lastDoneAt: projection.last_done_at,
  };
}

function hasOwn<T extends object>(value: T | undefined, key: PropertyKey): boolean {
  return value !== undefined && Object.hasOwn(value, key);
}

export function resolveCurrentTaskProjectionReads({
  historySyncEpoch,
  legacyCurrentRead,
  logicalDaySettingsRevision,
  projectionsByTaskId,
  taskHistoryStreakSummaries,
  tasks,
  todayKey,
}: {
  historySyncEpoch: string | null;
  legacyCurrentRead?: LegacyCurrentTaskRead;
  logicalDaySettingsRevision: number | null;
  projectionsByTaskId: CurrentTaskProjectionReadMap;
  taskHistoryStreakSummaries: TaskHistoryStreakSummaryMap;
  tasks: readonly Task[];
  todayKey: string;
}): CurrentTaskProjectionReadResolution {
  const displayStatusByTaskId: TaskDisplayStatusByTaskId = {};
  const dueOnByTaskId: Record<string, string | null> = {};
  const effectiveTaskHistoryStreakSummaries: TaskHistoryStreakSummaryMap = {};
  const freshProjectionByTaskId: CurrentTaskProjectionReadMap = {};
  const freshProjectionTaskIds: string[] = [];
  const staleProjectionTaskIds: string[] = [];
  const missingProjectionTaskIds: string[] = [];

  for (const task of tasks) {
    const projection = projectionsByTaskId[task.id];
    const isFresh = Boolean(
      projection
      && typeof task.canonical_revision === "number"
      && typeof task.entity_kind === "string"
      && typeof logicalDaySettingsRevision === "number"
      && historySyncEpoch
      && isCurrentTaskProjectionFresh(projection, {
        userId: task.user_id,
        entityId: task.id,
        entityKind: task.entity_kind,
        canonicalTaskRevision: task.canonical_revision,
        historySyncEpoch,
        logicalDaySettingsRevision,
        projectedLogicalDate: todayKey,
      }),
    );

    if (isFresh && projection) {
      freshProjectionByTaskId[task.id] = projection;
      freshProjectionTaskIds.push(task.id);
      displayStatusByTaskId[task.id] = projection.display_status;
      dueOnByTaskId[task.id] = projection.current_effective_due_on;
      effectiveTaskHistoryStreakSummaries[task.id] = projectionToTaskHistoryStreakSummary(projection);
      continue;
    }

    if (projection) staleProjectionTaskIds.push(task.id);
    else missingProjectionTaskIds.push(task.id);

    if (hasOwn(legacyCurrentRead?.statusesByTaskId, task.id)) {
      displayStatusByTaskId[task.id] = legacyCurrentRead!.statusesByTaskId![task.id]!;
    } else {
      displayStatusByTaskId[task.id] = task.status;
    }

    if (hasOwn(legacyCurrentRead?.dueOnByTaskId, task.id)) {
      dueOnByTaskId[task.id] = legacyCurrentRead!.dueOnByTaskId![task.id]!;
    }
    if (taskHistoryStreakSummaries[task.id]) {
      effectiveTaskHistoryStreakSummaries[task.id] = taskHistoryStreakSummaries[task.id]!;
    }
  }

  return {
    displayStatusByTaskId,
    dueOnByTaskId,
    effectiveTaskHistoryStreakSummaries,
    freshProjectionByTaskId,
    freshProjectionTaskIds,
    staleProjectionTaskIds,
    missingProjectionTaskIds,
  };
}

export function compareCurrentTaskProjectionParity({
  legacyCurrentRead,
  legacySummaries,
  projectionsByTaskId,
  tasks,
}: {
  legacyCurrentRead: Required<LegacyCurrentTaskRead>;
  legacySummaries: TaskHistoryStreakSummaryMap;
  projectionsByTaskId: CurrentTaskProjectionReadMap;
  tasks: readonly Task[];
}): CurrentTaskProjectionParityResult {
  const mismatchedFields: CurrentTaskProjectionParityMismatch[] = [];
  let freshCount = 0;

  for (const task of tasks) {
    const projection = projectionsByTaskId[task.id];
    if (!projection) continue;
    freshCount += 1;
    const legacySummary = legacySummaries[task.id];
    const legacyValues = {
      currentEffectiveDueOn: hasOwn(legacyCurrentRead.dueOnByTaskId, task.id)
        ? legacyCurrentRead.dueOnByTaskId[task.id]
        : task.due_on,
      currentMissedStreak: legacySummary?.missedStreak ?? 0,
      currentPositiveStreak: legacySummary?.currentStreak ?? 0,
      displayStatus: hasOwn(legacyCurrentRead.statusesByTaskId, task.id)
        ? legacyCurrentRead.statusesByTaskId[task.id]
        : task.status,
      lastDoneAt: legacySummary?.lastDoneAt ?? null,
      lastDoneDate: legacySummary?.lastDoneDate ?? null,
      lastHandledAt: legacySummary?.lastHandledAt ?? null,
      lastHandledDate: legacySummary?.lastHandledDate ?? null,
    };
    const comparisons: Array<[CurrentTaskProjectionParityMismatch["field"], unknown, unknown]> = [
      ["displayStatus", projection.display_status, legacyValues.displayStatus],
      ["currentEffectiveDueOn", projection.current_effective_due_on, legacyValues.currentEffectiveDueOn],
      ["currentPositiveStreak", projection.current_positive_streak, legacyValues.currentPositiveStreak],
      ["currentMissedStreak", projection.current_missed_streak, legacyValues.currentMissedStreak],
      ["lastHandledDate", projection.last_handled_logical_date, legacyValues.lastHandledDate],
      ["lastHandledAt", projection.last_handled_at, legacyValues.lastHandledAt],
      ["lastDoneDate", projection.last_done_logical_date, legacyValues.lastDoneDate],
      ["lastDoneAt", projection.last_done_at, legacyValues.lastDoneAt],
    ];
    for (const [field, projected, legacy] of comparisons) {
      if (projected !== legacy) mismatchedFields.push({ field, taskId: task.id });
    }
  }

  return {
    fallbackCount: Math.max(0, tasks.length - freshCount),
    freshCount,
    mismatchedFields,
    mismatchedTaskIds: [...new Set(mismatchedFields.map((mismatch) => mismatch.taskId))],
  };
}

export function createCurrentTaskProjectionEventBuffer(
  onFlush: (rows: readonly CurrentTaskProjectionReadRow[]) => void,
  options: {
    flushWindowMs?: number;
    schedule?: (callback: () => void, delayMs: number) => unknown;
    cancel?: (handle: unknown) => void;
  } = {},
) {
  const pendingRows = new Map<string, CurrentTaskProjectionReadRow>();
  const schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const cancel = options.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const flushWindowMs = options.flushWindowMs ?? 50;
  let timer: unknown = null;

  const flush = () => {
    timer = null;
    if (pendingRows.size === 0) return;
    const rows = [...pendingRows.values()];
    pendingRows.clear();
    onFlush(rows);
  };

  return {
    enqueue(row: CurrentTaskProjectionReadRow) {
      pendingRows.set(row.entity_id, row);
      if (timer === null) timer = schedule(flush, flushWindowMs);
    },
    flush,
    dispose() {
      if (timer !== null) cancel(timer);
      timer = null;
      pendingRows.clear();
    },
  };
}
