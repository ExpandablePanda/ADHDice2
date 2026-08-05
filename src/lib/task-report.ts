import type { Milestone, MilestoneEvent, Task, TaskHistory, TaskStatus } from "@/lib/database.types";
import { buildFocusGoalPlan } from "@/lib/focus-goals";
import type { FocusCategory, FocusDailyGoalAdjustment, HistoricalFocusSession } from "@/lib/types";
import { shiftDateKey } from "@/lib/task-grid-layout";
import { buildTaskHierarchyAdapter } from "@/lib/task-hierarchy";
import { hasTaskListMembership, type TaskListDefinition, type TaskListMembership } from "@/lib/task-lists";
import { formatTaskPriorityLevel, getTaskPriorityLevel, inferLegacyTaskPriorityLevel, type TaskPriorityLevel } from "@/lib/task-priority";
import { formatRepeatSummary } from "@/lib/task-repeat";
import { buildMilestoneReportSummary, formatMilestoneReportSection } from "@/lib/milestones/milestone-report";
import {
  formatAchievementValue,
  formatTierLabel,
  type AchievementProgressModel,
} from "@/lib/achievement-progress";
import { getTaskOccurrenceIdentity } from "@/lib/records/identity";
import {
  formatRecordsReportSection,
  formatReportDate,
  isReportDateInRange,
  type ReportDateRange,
  type RecordsReportData,
} from "@/lib/report-presentation";

export const TASK_REPORT_RANGE_OPTIONS = [
  { id: "today", label: "Today", days: 1 },
  { id: "last7", label: "Last 7 days", days: 7 },
  { id: "last30", label: "Last 30 days", days: 30 },
  { id: "last90", label: "Last 90 days", days: 90 },
  { id: "custom", label: "Custom range", days: "custom" },
  { id: "all", label: "All available", days: null },
] as const;

export const TASK_REPORT_DETAIL_OPTIONS = [
  { id: "summary", label: "Summary" },
  { id: "detailed", label: "Detailed" },
] as const;

export type TaskReportRangeId = typeof TASK_REPORT_RANGE_OPTIONS[number]["id"];
export type TaskReportDetailLevel = typeof TASK_REPORT_DETAIL_OPTIONS[number]["id"];

export type TaskReportCustomRange = {
  endDateKey: string;
  startDateKey: string;
};

type GenerateTaskReportInput = {
  appVersion: string;
  achievementModel?: AchievementProgressModel | null;
  achievementWarning?: string | null;
  availableTaskLists: TaskListDefinition[];
  detailLevel: TaskReportDetailLevel;
  generatedAt: Date;
  historySourceLabel: string;
  historyWarning: string | null;
  focusCategories: FocusCategory[];
  focusDailyGoalAdjustments: FocusDailyGoalAdjustment[];
  focusHistory: HistoricalFocusSession[];
  listMembershipsByTaskId: Record<string, TaskListMembership[]>;
  milestoneEvents?: MilestoneEvent[];
  milestones?: Milestone[];
  milestoneWarning?: string | null;
  customRange?: TaskReportCustomRange | null;
  rangeId: TaskReportRangeId;
  records?: RecordsReportData;
  taskHistory: TaskHistory[];
  tasks: Task[];
  todayDateKey: string;
};

type ReportRange = {
  endDateKey: string | null;
  label: string;
  spanDays: number;
  startDateKey: string | null;
};

type TaskTypeLabel = "Parent" | "Step" | "Substep";
type OutcomeLabel = "Done" | "Did My Best" | "Complete" | "Missed";

type TaskReportTaskMetadata = {
  cadenceLabel: string | null;
  currentStatusLabel: string;
  isImportant: boolean;
  isPinned: boolean;
  isRoutine: boolean;
  isTestLike: boolean;
  isTrashed: boolean;
  isUrgent: boolean;
  pathLabel: string;
  priorityLevel: TaskPriorityLevel | null;
  title: string;
  typeLabel: TaskTypeLabel;
};

type LatestHistoryEntry = TaskHistory & {
  metadata: TaskReportTaskMetadata;
  taskTitle: string;
};

type TaskPatternEntry = {
  completeCount: number;
  didMyBestCount: number;
  doneCount: number;
  handledCount: number;
  historyEntries: LatestHistoryEntry[];
  metadata: TaskReportTaskMetadata;
  missedCount: number;
  task: Task;
  taskId: string;
};

type RankedDayEntry = {
  count: number;
  dateKey: string;
};

type OutcomeSplitCounts = {
  parentCount: number;
  stepCount: number;
};

type RoutineOutcomeCounts = {
  didMyBest: number;
  done: number;
  handled: number;
  missed: number;
};

type RoutinePerformanceSummary = {
  parents: RoutineOutcomeCounts;
  steps: RoutineOutcomeCounts;
};

type DayBreakdown = {
  handledParents: number;
  handledSteps: number;
  handledTotal: number;
  missed: number;
  outcomes: Record<OutcomeLabel, LatestHistoryEntry[]>;
};

type CompactStatusSummary = {
  byStatus: Record<string, number>;
  total: number;
};

type PriorityStatusSummary = CompactStatusSummary & {
  priorityLevel: TaskPriorityLevel;
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  archived: "Archived",
  complete: "Complete",
  delayed: "Delayed",
  did_my_best: "Did My Best",
  done: "Done",
  in_progress: "In Progress",
  missed: "Missed",
  not_due: "Not Due",
  pending: "Pending",
  trashed: "Trashed",
  upcoming: "Upcoming",
};

const STATUS_SNAPSHOT_ORDER = [
  "Pending",
  "In Progress",
  "Done",
  "Did My Best",
  "Complete",
  "Missed",
  "Delayed",
  "Upcoming",
  "Not Due",
  "Archived",
] as const;
const OUTCOME_ORDER: OutcomeLabel[] = ["Done", "Did My Best", "Complete", "Missed"];
const MISSED_DAILY_CAP = 25;

function formatDateLabel(dateKey: string | null) {
  return dateKey ? formatReportDate(dateKey) : "Unknown";
}

function formatShortDate(dateKey: string) {
  return formatReportDate(dateKey, { short: true });
}

function formatDateHeading(dateKey: string) {
  return formatReportDate(dateKey, { includeWeekday: true });
}

function formatTimestamp(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatRangeSummary(range: ReportRange) {
  if (range.startDateKey && range.endDateKey) {
    return `${range.label} (${formatDateLabel(range.startDateKey)} to ${formatDateLabel(range.endDateKey)})`;
  }
  return range.label;
}

function formatTimeOnly(isoString: string | null | undefined) {
  if (!isoString) {
    return null;
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatHistoryMoment(isoString: string | null | undefined) {
  if (!isoString) {
    return null;
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(date);
}

function getCreatedHistoryTimestamp(entry: Pick<TaskHistory, "created_at">) {
  return entry.created_at || null;
}

function getEditedHistoryTimestamp(entry: Pick<TaskHistory, "created_at" | "updated_at">) {
  if (!entry.updated_at || !entry.created_at || entry.updated_at === entry.created_at) {
    return null;
  }
  return entry.updated_at;
}

function formatHistoryCreatedLabel(entry: Pick<TaskHistory, "created_at">) {
  const timestamp = getCreatedHistoryTimestamp(entry);
  return timestamp ? `Logged ${formatHistoryMoment(timestamp) ?? timestamp}` : null;
}

function formatHistoryEditedLabel(entry: Pick<TaskHistory, "created_at" | "updated_at">) {
  const timestamp = getEditedHistoryTimestamp(entry);
  return timestamp ? `Edited ${formatHistoryMoment(timestamp) ?? timestamp}` : null;
}

function formatDurationCompact(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${minutes}m`;
}

function incrementCount(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

function compareHistoryEntries(left: TaskHistory, right: TaskHistory) {
  const leftTimestamp = left.updated_at || left.created_at || `${left.entry_date}T00:00:00.000Z`;
  const rightTimestamp = right.updated_at || right.created_at || `${right.entry_date}T00:00:00.000Z`;
  if (leftTimestamp !== rightTimestamp) {
    return leftTimestamp < rightTimestamp ? -1 : 1;
  }
  return left.id.localeCompare(right.id);
}

function normalizeTaskReportCustomRange(customRange: TaskReportCustomRange | null | undefined, todayDateKey: string): TaskReportCustomRange {
  const startDateKey = customRange?.startDateKey || todayDateKey;
  const endDateKey = customRange?.endDateKey || startDateKey;
  return startDateKey <= endDateKey
    ? { startDateKey, endDateKey }
    : { startDateKey: endDateKey, endDateKey: startDateKey };
}

function resolveTaskReportHistoryFetchRange(rangeId: TaskReportRangeId, todayDateKey: string, customRange?: TaskReportCustomRange | null) {
  const option = TASK_REPORT_RANGE_OPTIONS.find((entry) => entry.id === rangeId) ?? TASK_REPORT_RANGE_OPTIONS[0];
  if (option.days === "custom") {
    return normalizeTaskReportCustomRange(customRange, todayDateKey);
  }
  if (option.days !== null) {
    return {
      endDateKey: todayDateKey,
      startDateKey: shiftDateKey(todayDateKey, -(option.days - 1)),
    };
  }

  return {
    endDateKey: null,
    startDateKey: null,
  };
}

function buildRange(
  rangeId: TaskReportRangeId,
  todayDateKey: string,
  history: TaskHistory[],
  focusHistory: HistoricalFocusSession[] = [],
  focusDailyGoalAdjustments: FocusDailyGoalAdjustment[] = [],
  customRange?: TaskReportCustomRange | null,
): ReportRange {
  const option = TASK_REPORT_RANGE_OPTIONS.find((entry) => entry.id === rangeId) ?? TASK_REPORT_RANGE_OPTIONS[0];
  const fetchRange = resolveTaskReportHistoryFetchRange(rangeId, todayDateKey, customRange);
  if (option.days === "custom") {
    let spanDays = 0;
    let cursor = fetchRange.startDateKey;
    while (cursor <= fetchRange.endDateKey) {
      spanDays += 1;
      if (cursor === fetchRange.endDateKey) {
        break;
      }
      cursor = shiftDateKey(cursor, 1);
    }
    return {
      ...fetchRange,
      label: option.label,
      spanDays,
    };
  }
  if (option.days !== null) {
    return {
      ...fetchRange,
      label: option.label,
      spanDays: option.days,
    };
  }

  const sortedDates = [
    ...history.map((entry) => entry.entry_date),
    ...focusHistory.map((session) => session.date),
    ...focusDailyGoalAdjustments.map((adjustment) => adjustment.adjustmentDate),
  ].sort();
  const startDateKey = sortedDates[0] ?? null;
  const endDateKey = sortedDates.at(-1) ?? todayDateKey;
  let spanDays = 0;

  if (startDateKey && endDateKey) {
    let cursor = startDateKey;
    while (cursor <= endDateKey) {
      spanDays += 1;
      if (cursor === endDateKey) {
        break;
      }
      cursor = shiftDateKey(cursor, 1);
    }
  }

  return {
    endDateKey,
    label: option.label,
    spanDays: Math.max(spanDays, sortedDates.length > 0 ? 1 : 0),
    startDateKey,
  };
}

function isEntryInRange(entry: TaskHistory, range: ReportRange) {
  if (range.startDateKey && entry.entry_date < range.startDateKey) {
    return false;
  }
  if (range.endDateKey && entry.entry_date > range.endDateKey) {
    return false;
  }
  return true;
}

function getTaskTypeLabel(task: Task, depth: number | null): TaskTypeLabel {
  if (task.parent_task_id === null) {
    return "Parent";
  }
  if (depth === null || depth <= 1) {
    return "Step";
  }
  return "Substep";
}

function isTestLikeTaskTitle(title: string) {
  return title.trim().toLowerCase().includes("test");
}

function buildTaskHistoryByTaskId(taskHistory: TaskHistory[]) {
  return taskHistory.reduce<Record<string, TaskHistory[]>>((accumulator, entry) => {
    const entries = accumulator[entry.task_id] ?? [];
    entries.push(entry);
    accumulator[entry.task_id] = entries;
    return accumulator;
  }, {});
}

function isFocusSessionInRange(session: HistoricalFocusSession, range: ReportRange) {
  if (range.startDateKey && session.date < range.startDateKey) {
    return false;
  }
  if (range.endDateKey && session.date > range.endDateKey) {
    return false;
  }
  return true;
}

function buildFocusSection(
  range: ReportRange,
  focusCategories: FocusCategory[],
  focusHistory: HistoricalFocusSession[],
  focusDailyGoalAdjustments: FocusDailyGoalAdjustment[],
  todayDateKey: string,
) {
  const sortedCategories = [...focusCategories].sort((left, right) => left.title.localeCompare(right.title, undefined, { sensitivity: "base" }));
  const rangedSessions = focusHistory
    .filter((session) => isFocusSessionInRange(session, range))
    .sort((left, right) => {
      if (left.date !== right.date) {
        return left.date.localeCompare(right.date);
      }
      const leftCreatedAt = left.createdAt ?? "";
      const rightCreatedAt = right.createdAt ?? "";
      if (leftCreatedAt !== rightCreatedAt) {
        return leftCreatedAt.localeCompare(rightCreatedAt);
      }
      return left.id.localeCompare(right.id);
    });
  const categoryById = new Map(sortedCategories.map((category) => [category.id, category] as const));
  const rangedAdjustments = focusDailyGoalAdjustments
    .filter((adjustment) => {
      if (range.startDateKey && adjustment.adjustmentDate < range.startDateKey) {
        return false;
      }
      if (range.endDateKey && adjustment.adjustmentDate > range.endDateKey) {
        return false;
      }
      return true;
    })
    .sort((left, right) => {
      if (left.adjustmentDate !== right.adjustmentDate) {
        return left.adjustmentDate.localeCompare(right.adjustmentDate);
      }
      if (left.createdAt !== right.createdAt) {
        return left.createdAt.localeCompare(right.createdAt);
      }
      return left.id.localeCompare(right.id);
    });
  const sessionsByDate = rangedSessions.reduce<Map<string, HistoricalFocusSession[]>>((accumulator, session) => {
    const sessions = accumulator.get(session.date) ?? [];
    sessions.push(session);
    accumulator.set(session.date, sessions);
    return accumulator;
  }, new Map());
  const adjustmentLinesByDate = rangedAdjustments.reduce<Map<string, string[]>>((accumulator, adjustment) => {
    const sourceLabel = categoryById.get(adjustment.sourceCategoryId)?.title ?? "Deleted source";
    const targetLabel = categoryById.get(adjustment.targetCategoryId)?.title ?? "Deleted target";
    const lines = accumulator.get(adjustment.adjustmentDate) ?? [];
    lines.push(`- ${sourceLabel} -> ${targetLabel} — ${formatDurationCompact(adjustment.reductionSeconds)} — ${formatAdjustmentReason(adjustment.reason)}`);
    accumulator.set(adjustment.adjustmentDate, lines);
    return accumulator;
  }, new Map());
  const plan = buildFocusGoalPlan({
    adjustments: focusDailyGoalAdjustments,
    categories: sortedCategories,
    history: focusHistory,
    todayDate: range.endDateKey ?? todayDateKey,
  });

  const lines = ["## Focus Report"];

  if (sortedCategories.length === 0 && rangedSessions.length === 0) {
    lines.push("- No focus goals or focus sessions in the selected range.");
    return lines;
  }

  lines.push("", "### Focus Goals");
  if (sortedCategories.length === 0) {
    lines.push("- No focus categories configured.");
  } else {
    for (const summary of plan.summaries.sort((left, right) => left.category.title.localeCompare(right.category.title, undefined, { sensitivity: "base" }))) {
      const goalParts = [
        `Today ${formatDurationCompact(summary.todayActualSeconds)}/${formatDurationCompact(summary.adjustedTodayTargetSeconds)}`,
        `Week ${formatDurationCompact(summary.weekActualSeconds)}/${formatDurationCompact(summary.baseWeeklyTargetSeconds)}`,
        `Pace ${formatPaceStatus(summary.weeklyPaceBehindSeconds, summary.weekDeltaSeconds)}`,
      ];
      const reallocationParts = [
        summary.todayReceivedShiftSeconds > 0 ? `Received ${formatDurationCompact(summary.todayReceivedShiftSeconds)}` : null,
        summary.todaySourceShiftedSeconds > 0 ? `Shifted ${formatDurationCompact(summary.todaySourceShiftedSeconds)}` : null,
        summary.incomingCarryoverCreditSeconds > 0 ? `Carryover ${formatDurationCompact(summary.incomingCarryoverCreditSeconds)}` : null,
      ].filter((value): value is string => Boolean(value));
      lines.push(`- ${summary.category.title || "Untitled category"}: ${goalParts.join("; ")}${reallocationParts.length > 0 ? `; Reallocation ${reallocationParts.join(", ")}` : ""}`);
    }
  }

  lines.push("", "### Focus Reallocations");
  if (adjustmentLinesByDate.size === 0) {
    lines.push("- No focus reallocations in the selected range.");
  } else {
    for (const dateKey of [...adjustmentLinesByDate.keys()].sort((left, right) => left.localeCompare(right))) {
      lines.push("", `#### ${formatReportDate(dateKey)}`, ...adjustmentLinesByDate.get(dateKey)!);
    }
  }

  lines.push("", "### Focus Sessions by Day");
  if (sessionsByDate.size === 0) {
    lines.push("- No focus sessions in the selected range.");
    return lines;
  }

  const chronologicalDates = [...sessionsByDate.keys()].sort((left, right) => left.localeCompare(right));
  for (const dateKey of chronologicalDates) {
    const sessions = sessionsByDate.get(dateKey) ?? [];
    const totalSeconds = sessions.reduce((sum, session) => sum + Math.max(0, session.durationSeconds), 0);
    lines.push(
      "",
      `#### ${formatReportDate(dateKey)}`,
      `- Total: ${formatDurationCompact(totalSeconds)} across ${sessions.length} session${sessions.length === 1 ? "" : "s"}`,
    );
    for (const session of sessions) {
      const category = session.categoryId ? categoryById.get(session.categoryId) ?? null : null;
      const categoryLabel = category?.title || "Deleted/uncategorized category";
      const sessionTitle = session.title.trim() || "Untitled session";
      const typeParts = [session.focusType, session.focusSubtype, session.focusSubtype2].filter((value): value is string => Boolean(value));
      const notesSuffix = session.notes?.trim() ? ` — Notes: ${session.notes.trim()}` : "";
      lines.push(
        `- ${sessionTitle} — ${categoryLabel} — ${formatDurationCompact(session.durationSeconds)}${typeParts.length > 0 ? ` — ${typeParts.join(" / ")}` : ""}${notesSuffix}`,
      );
    }
  }

  return lines;
}

function buildTaskMetadata(
  tasks: Task[],
  _availableTaskLists: TaskListDefinition[],
  listMembershipsByTaskId: Record<string, TaskListMembership[]>,
  taskHistoryByTaskId: Record<string, TaskHistory[]>,
  todayDateKey: string,
) {
  const taskHierarchy = buildTaskHierarchyAdapter(tasks);
  const metadataByTaskId = new Map<string, TaskReportTaskMetadata>();

  for (const task of tasks) {
    const parentChain = taskHierarchy.getParentChain(task.id);
    const title = task.title.trim() || "Untitled task";
    const ancestry = parentChain
      .map((ancestor) => ancestor.title?.trim() || "Untitled task")
      .reverse();
    const pathLabel = [...ancestry, title].join(" > ");
    const rootParentId = parentChain.at(-1)?.id ?? task.id;
    const hasInheritedManualRoutineMembership = rootParentId !== task.id
      && (listMembershipsByTaskId[rootParentId] ?? []).some((membership) => membership.id === "routine" && membership.isManual);

    const priorityLevel = getTaskPriorityLevel(task);
    metadataByTaskId.set(task.id, {
      cadenceLabel: formatRepeatSummary(task) ?? null,
      currentStatusLabel: STATUS_LABELS[task.status] ?? task.status,
      isImportant: priorityLevel === 4,
      isPinned: Boolean(task.pinned_at),
      isRoutine: hasTaskListMembership(listMembershipsByTaskId[task.id] ?? [], "routine") || hasInheritedManualRoutineMembership,
      isTestLike: isTestLikeTaskTitle(title),
      isTrashed: task.status === "trashed" || parentChain.some((ancestor) => ancestor.status === "trashed"),
      isUrgent: priorityLevel === 5,
      pathLabel,
      priorityLevel: resolveReportPriorityLevel(task),
      title,
      typeLabel: getTaskTypeLabel(task, taskHierarchy.getDepth(task.id)),
    });
  }

  return metadataByTaskId;
}

function buildTaskSnapshotSections(
  tasks: Task[],
  todayDateKey: string,
  availableTaskLists: TaskListDefinition[],
  listMembershipsByTaskId: Record<string, TaskListMembership[]>,
  taskHistoryByTaskId: Record<string, TaskHistory[]>,
) {
  const metadataByTaskId = buildTaskMetadata(tasks, availableTaskLists, listMembershipsByTaskId, taskHistoryByTaskId, todayDateKey);
  const workloadTasks = tasks.filter((task) => !metadataByTaskId.get(task.id)?.isTrashed);
  const currentStatusSnapshotCounts = workloadTasks.reduce<Record<string, number>>((accumulator, task) => {
    const metadata = metadataByTaskId.get(task.id);
    if (!metadata) {
      return accumulator;
    }
    incrementCount(accumulator, metadata.currentStatusLabel);
    return accumulator;
  }, {});

  return {
    activeLoadedTaskCount: workloadTasks.length,
    currentStatusSnapshotCounts,
    metadataByTaskId,
    pinnedSummary: buildCompactTaskSummary(workloadTasks, metadataByTaskId, (metadata) => metadata.isPinned),
    prioritySummaries: buildPriorityStatusSummaries(workloadTasks, metadataByTaskId),
    snapshotTaskCount: workloadTasks.length,
    trashedLoadedTaskCount: tasks.length - workloadTasks.length,
  };
}

function buildCompactTaskSummary(
  tasks: Task[],
  metadataByTaskId: Map<string, TaskReportTaskMetadata>,
  predicate: (metadata: TaskReportTaskMetadata) => boolean,
): CompactStatusSummary {
  return tasks.reduce<CompactStatusSummary>((summary, task) => {
    const metadata = metadataByTaskId.get(task.id);
    if (!metadata || !predicate(metadata)) {
      return summary;
    }
    summary.total += 1;
    incrementCount(summary.byStatus, metadata.currentStatusLabel);
    return summary;
  }, { byStatus: {}, total: 0 });
}

function buildPriorityStatusSummaries(tasks: Task[], metadataByTaskId: Map<string, TaskReportTaskMetadata>) {
  const byPriority = new Map<TaskPriorityLevel, PriorityStatusSummary>();

  for (const task of tasks) {
    const metadata = metadataByTaskId.get(task.id);
    if (!metadata || metadata.priorityLevel === null) {
      continue;
    }

    const existing = byPriority.get(metadata.priorityLevel) ?? {
      byStatus: {},
      priorityLevel: metadata.priorityLevel,
      total: 0,
    };
    existing.total += 1;
    incrementCount(existing.byStatus, metadata.currentStatusLabel);
    byPriority.set(metadata.priorityLevel, existing);
  }

  return [...byPriority.values()].sort((left, right) => right.priorityLevel - left.priorityLevel);
}

function buildLatestEntries(entries: TaskHistory[], tasksById: Map<string, Task>, metadataByTaskId: Map<string, TaskReportTaskMetadata>) {
  const byTaskDate = new Map<string, LatestHistoryEntry>();
  for (const entry of entries) {
    const metadata = metadataByTaskId.get(entry.task_id);
    if (!metadata || !tasksById.has(entry.task_id)) {
      continue;
    }
    const key = `${entry.task_id}:${entry.entry_date}`;
    const existing = byTaskDate.get(key);
    if (!existing || compareHistoryEntries(existing, entry) < 0) {
      byTaskDate.set(key, {
        ...entry,
        metadata,
        taskTitle: metadata.title,
      });
    }
  }
  return [...byTaskDate.values()].sort(compareHistoryEntries);
}

function createEmptyDayBreakdown(): DayBreakdown {
  return {
    handledParents: 0,
    handledSteps: 0,
    handledTotal: 0,
    missed: 0,
    outcomes: {
      Complete: [],
      Done: [],
      "Did My Best": [],
      Missed: [],
    },
  };
}

function createEmptyOutcomeSplitCounts(): OutcomeSplitCounts {
  return {
    parentCount: 0,
    stepCount: 0,
  };
}

function getOutcomeLabel(status: TaskStatus): OutcomeLabel | null {
  if (status === "done") {
    return "Done";
  }
  if (status === "did_my_best") {
    return "Did My Best";
  }
  if (status === "complete") {
    return "Complete";
  }
  if (status === "missed") {
    return "Missed";
  }
  return null;
}

function compareRankedDayEntries(left: RankedDayEntry, right: RankedDayEntry) {
  return right.count - left.count || left.dateKey.localeCompare(right.dateKey);
}

function buildHistorySections(
  tasks: Task[],
  taskHistory: TaskHistory[],
  range: ReportRange,
  todayDateKey: string,
  availableTaskLists: TaskListDefinition[],
  listMembershipsByTaskId: Record<string, TaskListMembership[]>,
  taskHistoryByTaskId: Record<string, TaskHistory[]>,
) {
  const tasksById = new Map(tasks.map((task) => [task.id, task] as const));
  const metadataByTaskId = buildTaskMetadata(tasks, availableTaskLists, listMembershipsByTaskId, taskHistoryByTaskId, todayDateKey);
  const rangedEntries = taskHistory.filter((entry) => isEntryInRange(entry, range));
  const latestEntries = buildLatestEntries(rangedEntries, tasksById, metadataByTaskId);
  const dayBreakdownsByDate = new Map<string, DayBreakdown>();
  const outcomeTotals: Record<OutcomeLabel, OutcomeSplitCounts> = {
    Complete: createEmptyOutcomeSplitCounts(),
    Done: createEmptyOutcomeSplitCounts(),
    "Did My Best": createEmptyOutcomeSplitCounts(),
    Missed: createEmptyOutcomeSplitCounts(),
  };
  const taskPatternsByTaskId = new Map<string, TaskPatternEntry>();

  for (const entry of latestEntries) {
    const task = tasksById.get(entry.task_id);
    const outcomeLabel = getOutcomeLabel(entry.status);
    if (!task || !outcomeLabel || entry.metadata.isTrashed || entry.metadata.isTestLike) {
      continue;
    }

    const taskPattern = taskPatternsByTaskId.get(entry.task_id) ?? {
      completeCount: 0,
      didMyBestCount: 0,
      doneCount: 0,
      handledCount: 0,
      historyEntries: [],
      metadata: entry.metadata,
      missedCount: 0,
      task,
      taskId: entry.task_id,
    };
    taskPattern.historyEntries.push(entry);

    const dayBreakdown = dayBreakdownsByDate.get(entry.entry_date) ?? createEmptyDayBreakdown();
    dayBreakdown.outcomes[outcomeLabel].push(entry);

    if (outcomeLabel === "Missed") {
      taskPattern.missedCount += 1;
      dayBreakdown.missed += 1;
    } else {
      taskPattern.handledCount += 1;
      dayBreakdown.handledTotal += 1;
      if (entry.metadata.typeLabel === "Parent") {
        dayBreakdown.handledParents += 1;
      } else {
        dayBreakdown.handledSteps += 1;
      }

      if (outcomeLabel === "Done") {
        taskPattern.doneCount += 1;
      } else if (outcomeLabel === "Did My Best") {
        taskPattern.didMyBestCount += 1;
      } else if (outcomeLabel === "Complete") {
        taskPattern.completeCount += 1;
      }
    }

    const splitCounts = outcomeTotals[outcomeLabel];
    if (entry.metadata.typeLabel === "Parent") {
      splitCounts.parentCount += 1;
    } else {
      splitCounts.stepCount += 1;
    }

    dayBreakdownsByDate.set(entry.entry_date, dayBreakdown);
    taskPatternsByTaskId.set(entry.task_id, taskPattern);
  }

  const taskPatterns = [...taskPatternsByTaskId.values()]
    .filter((entry) => entry.historyEntries.length > 0)
    .sort((left, right) => left.metadata.pathLabel.localeCompare(right.metadata.pathLabel));
  const rankedHandledDays = [...dayBreakdownsByDate.entries()]
    .map(([dateKey, totals]) => ({ count: totals.handledTotal, dateKey }))
    .sort(compareRankedDayEntries);
  const rankedMissedDays = [...dayBreakdownsByDate.entries()]
    .map(([dateKey, totals]) => ({ count: totals.missed, dateKey }))
    .sort(compareRankedDayEntries);

  return {
    dayBreakdownsByDate,
    dailyZeroWinCount: taskPatterns.filter((entry) => entry.task.repeat_frequency === "daily" && entry.handledCount === 0 && entry.missedCount > 0).length,
    highestMissedDay: rankedMissedDays.find((entry) => entry.count > 0) ?? null,
    latestEntriesCount: latestEntries.length,
    outcomeTotals,
    repeatedMissCount: taskPatterns.filter((entry) => entry.missedCount >= 3).length,
    taskPatterns,
    topHandledDay: rankedHandledDays.find((entry) => entry.count > 0) ?? null,
  };
}

function createEmptyRoutineOutcomeCounts(): RoutineOutcomeCounts {
  return { didMyBest: 0, done: 0, handled: 0, missed: 0 };
}

function getRoutineOccurrenceIdentity(entry: TaskHistory, task: Task) {
  const occurrenceKey = entry.occurrence_key?.trim();
  if (occurrenceKey) return `occurrence-key:${occurrenceKey}`;
  if (entry.occurrence_due_on) return `occurrence-due-on:${entry.occurrence_due_on}`;
  return `history-fallback:${getTaskOccurrenceIdentity(entry, task)}`;
}

function buildRoutinePerformanceSummary(
  tasks: Task[],
  taskHistory: TaskHistory[],
  range: ReportRange,
  metadataByTaskId: Map<string, TaskReportTaskMetadata>,
): RoutinePerformanceSummary {
  const tasksById = new Map(tasks.map((task) => [task.id, task] as const));
  const latestByOccurrence = new Map<string, TaskHistory>();
  for (const entry of taskHistory) {
    const task = tasksById.get(entry.task_id);
    const metadata = metadataByTaskId.get(entry.task_id);
    if (!task || !metadata?.isRoutine || metadata.isTrashed || metadata.isTestLike || !isEntryInRange(entry, range)) continue;
    const identity = `${entry.task_id}:${getRoutineOccurrenceIdentity(entry, task)}`;
    const existing = latestByOccurrence.get(identity);
    if (!existing || compareHistoryEntries(existing, entry) < 0) latestByOccurrence.set(identity, entry);
  }

  const summary = {
    parents: createEmptyRoutineOutcomeCounts(),
    steps: createEmptyRoutineOutcomeCounts(),
  };
  for (const entry of latestByOccurrence.values()) {
    const metadata = metadataByTaskId.get(entry.task_id);
    if (!metadata) continue;
    const counts = metadata.typeLabel === "Parent" ? summary.parents : summary.steps;
    if (entry.status === "done" || entry.status === "complete") counts.done += 1;
    else if (entry.status === "did_my_best") counts.didMyBest += 1;
    else if (entry.status === "missed") counts.missed += 1;
    else continue;
    counts.handled = counts.done + counts.didMyBest;
  }
  return summary;
}

function formatRoutineOutcomeLine(label: string, counts: RoutineOutcomeCounts) {
  return `- ${label}: Done ${counts.done}; Did My Best ${counts.didMyBest}; Missed ${counts.missed}; Handled ${counts.handled}`;
}

function formatAchievementSection(
  model: AchievementProgressModel | null | undefined,
  range: ReportDateRange,
  warning: string | null | undefined,
) {
  const lines = ["## Achievements", "", "### Earned during the selected range"];
  if (warning) lines.push(`- Warning: ${warning}`);
  if (!model) {
    lines.push("- Achievement progress is unavailable.");
    lines.push("", "### Current progress snapshot", "- Achievement progress is unavailable.");
    return lines;
  }

  const earnedLines: string[] = [];
  for (const collection of model.collections) {
    for (const track of collection.tracks) {
      for (const tier of track.tiers) {
        if (!tier.earnedAt || !isReportDateInRange(tier.earnedAt, range)) continue;
        earnedLines.push(`- ${track.title} — Collection: ${collection.title} — Tier: ${formatTierLabel(tier.id)} — Permanently earned: ${formatReportDate(tier.earnedAt)}`);
      }
    }
    if (collection.masteredAt && isReportDateInRange(collection.masteredAt, range)) {
      earnedLines.push(`- ${collection.title} — Collection mastery aura earned: ${formatReportDate(collection.masteredAt)}`);
    }
  }
  lines.push(...(earnedLines.length > 0 ? earnedLines : ["- No permanent Achievement tiers or mastery auras earned in the selected range."]));

  lines.push("", "### Current progress snapshot");
  for (const collection of model.collections) {
    const masteryLabel = collection.isMastered
      ? `Mastered${collection.masteredAt ? ` ${formatReportDate(collection.masteredAt)}` : ""}`
      : "Mastery locked";
    lines.push(`- ${collection.title}: ${collection.earnedTiers} of ${collection.totalTiers} tiers — ${masteryLabel}`);
    for (const track of collection.tracks) {
      const earnedTiers = track.tiers.filter((tier) => tier.isEarned).map((tier) => formatTierLabel(tier.id));
      lines.push(
        `  - ${track.title} — Current progress: ${formatAchievementValue(track.currentValue, track.unit)}`
        + ` — Earned tiers: ${earnedTiers.length > 0 ? earnedTiers.join(", ") : "None"}`
        + ` — ${track.nextTier && track.nextThreshold !== null
          ? `Next: ${formatTierLabel(track.nextTier)} at ${formatAchievementValue(track.nextThreshold, track.unit)}`
          : "Platinum complete"}`,
      );
    }
  }
  return lines;
}

function formatStatusSnapshotCounts(counts: Record<string, number>) {
  const orderedEntries = [
    ...STATUS_SNAPSHOT_ORDER
      .map((label) => [label, counts[label] ?? 0] as const)
      .filter(([, count]) => count > 0),
    ...Object.entries(counts)
      .filter(([label, count]) => count > 0 && !STATUS_SNAPSHOT_ORDER.includes(label as typeof STATUS_SNAPSHOT_ORDER[number]))
      .sort((left, right) => left[0].localeCompare(right[0])),
  ];
  if (orderedEntries.length === 0) {
    return "None";
  }
  return orderedEntries.map(([label, count]) => `${label} ${count}`).join(", ");
}

function formatCompactTaskSummaryLine(label: string, summary: CompactStatusSummary) {
  return `- ${label}: ${summary.total} total${summary.total > 0 ? ` (${formatStatusSnapshotCounts(summary.byStatus)})` : ""}`;
}

function formatHistoryEntryMoment(entry: LatestHistoryEntry) {
  const createdTimestamp = getCreatedHistoryTimestamp(entry);
  const timeLabel = formatTimeOnly(createdTimestamp);
  if (!createdTimestamp) {
    return formatShortDate(entry.entry_date);
  }
  const loggedDateKey = createdTimestamp.slice(0, 10);
  if (loggedDateKey !== entry.entry_date) {
    const loggedLabel = formatHistoryMoment(createdTimestamp);
    return loggedLabel
      ? `${formatShortDate(entry.entry_date)} (logged ${loggedLabel})`
      : formatShortDate(entry.entry_date);
  }
  return timeLabel ? `${formatShortDate(entry.entry_date)} ${timeLabel}` : formatShortDate(entry.entry_date);
}

function formatDateRangeShort(startDateKey: string, endDateKey: string) {
  if (startDateKey === endDateKey) {
    return formatShortDate(startDateKey);
  }

  const [startYear, startMonth, startDay] = startDateKey.split("-").map((part) => Number.parseInt(part, 10));
  const [endYear, endMonth, endDay] = endDateKey.split("-").map((part) => Number.parseInt(part, 10));
  if (
    Number.isFinite(startYear)
    && Number.isFinite(startMonth)
    && Number.isFinite(startDay)
    && Number.isFinite(endYear)
    && Number.isFinite(endMonth)
    && Number.isFinite(endDay)
  ) {
    if (startYear === endYear && startMonth === endMonth) {
      const startMonthLabel = new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(startYear, startMonth - 1, startDay));
      return `${startMonthLabel} ${startDay}-${endDay}`;
    }
  }

  return `${formatShortDate(startDateKey)}-${formatShortDate(endDateKey)}`;
}

function compressDateKeys(dateKeys: string[]) {
  if (dateKeys.length === 0) {
    return "";
  }

  const uniqueDateKeys = [...new Set(dateKeys)].sort((left, right) => left.localeCompare(right));
  const segments: string[] = [];
  let rangeStart = uniqueDateKeys[0];
  let previous = uniqueDateKeys[0];

  for (let index = 1; index < uniqueDateKeys.length; index += 1) {
    const current = uniqueDateKeys[index];
    const expectedNext = shiftDateKey(previous, 1);
    if (current === expectedNext) {
      previous = current;
      continue;
    }
    segments.push(formatDateRangeShort(rangeStart, previous));
    rangeStart = current;
    previous = current;
  }

  segments.push(formatDateRangeShort(rangeStart, previous));
  return segments.join(", ");
}

function formatCompactHistory(entries: LatestHistoryEntry[]) {
  if (entries.length === 0) {
    return "No records in selected range";
  }

  const lines = OUTCOME_ORDER
    .map((outcomeLabel) => {
      const matchingEntries = entries.filter((entry) => getOutcomeLabel(entry.status) === outcomeLabel);
      if (matchingEntries.length === 0) {
        return null;
      }
      if (outcomeLabel === "Missed") {
        return `${outcomeLabel}: ${compressDateKeys(matchingEntries.map((entry) => entry.entry_date))}`;
      }
      return `${outcomeLabel}: ${matchingEntries.map((entry) => formatHistoryEntryMoment(entry)).join(", ")}`;
    })
    .filter((value): value is string => Boolean(value));

  return lines.join("; ");
}

function formatCurrentStreak(entries: LatestHistoryEntry[]) {
  if (entries.length === 0) {
    return "Mixed / none";
  }

  const latestOutcome = getOutcomeLabel(entries[entries.length - 1].status);
  if (!latestOutcome) {
    return "Mixed / none";
  }

  let streakCount = 0;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (getOutcomeLabel(entries[index].status) !== latestOutcome) {
      break;
    }
    streakCount += 1;
  }

  if (streakCount === 1 && entries.length > 1) {
    return "Mixed / none";
  }
  return `${streakCount} ${latestOutcome}`;
}

function formatTaskHistoryLine(entry: TaskPatternEntry) {
  const parts = [
    entry.metadata.title,
    `Type: ${entry.metadata.typeLabel}`,
    entry.metadata.typeLabel === "Parent" ? null : `Path: ${entry.metadata.pathLabel}`,
    `Current Status: ${entry.metadata.currentStatusLabel}`,
    `History: ${formatCompactHistory(entry.historyEntries)}`,
    `Current Streak: ${formatCurrentStreak(entry.historyEntries)}`,
    `Cadence: ${entry.metadata.cadenceLabel ?? "None"}`,
  ];
  if (entry.metadata.priorityLevel !== null) {
    parts.push(`Priority: ${formatTaskPriorityLevel(entry.metadata.priorityLevel)}`);
  }
  if (entry.metadata.isPinned) {
    parts.push("Pinned");
  }
  if (entry.metadata.isRoutine) {
    parts.push("Routine");
  }
  return `- ${parts.filter((value): value is string => Boolean(value)).join(" — ")}`;
}

function formatAdjustmentReason(reason: string) {
  return reason
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatPaceStatus(weeklyPaceBehindSeconds: number, weekDeltaSeconds: number) {
  if (weeklyPaceBehindSeconds > 0) {
    return `Behind ${formatDurationCompact(weeklyPaceBehindSeconds)}`;
  }
  if (weekDeltaSeconds > 0) {
    return `Over ${formatDurationCompact(weekDeltaSeconds)}`;
  }
  return "On pace";
}

function resolveReportPriorityLevel(task: Task) {
  if (task.priority_level !== null) {
    return getTaskPriorityLevel(task);
  }

  const legacyLevel = inferLegacyTaskPriorityLevel(task);
  return legacyLevel === 3 ? null : legacyLevel;
}

function sortLatestEntries(entries: LatestHistoryEntry[]) {
  return [...entries].sort((left, right) => left.metadata.pathLabel.localeCompare(right.metadata.pathLabel));
}

function formatDayRow(entry: LatestHistoryEntry) {
  const descriptor = entry.metadata.typeLabel === "Parent"
    ? entry.metadata.typeLabel
    : `${entry.metadata.typeLabel} — ${entry.metadata.pathLabel}`;
  const createdTimestamp = getCreatedHistoryTimestamp(entry);
  const createdDateKey = createdTimestamp?.slice(0, 10) ?? null;
  const createdTimingLabel = !createdTimestamp
    ? null
    : createdDateKey !== entry.entry_date
      ? formatHistoryCreatedLabel(entry)
      : formatTimeOnly(createdTimestamp);
  const editedTimingLabel = formatHistoryEditedLabel(entry);
  const timingParts = [createdTimingLabel, editedTimingLabel].filter((value): value is string => Boolean(value));
  return `- ${entry.metadata.title} — ${descriptor}${timingParts.length > 0 ? ` — ${timingParts.join(" — ")}` : ""}`;
}

function formatDayOutcomeGroup(outcomeLabel: OutcomeLabel, entries: LatestHistoryEntry[]) {
  const sortedEntries = sortLatestEntries(entries);
  const cappedEntries = outcomeLabel === "Missed" ? sortedEntries.slice(0, MISSED_DAILY_CAP) : sortedEntries;
  const lines = [`#### ${outcomeLabel}`];
  if (sortedEntries.length === 0) {
    lines.push("- None");
    return lines.join("\n");
  }
  if (outcomeLabel === "Missed" && sortedEntries.length > MISSED_DAILY_CAP) {
    lines.push(`Showing ${MISSED_DAILY_CAP} of ${sortedEntries.length}.`);
  }
  lines.push(...cappedEntries.map((entry) => formatDayRow(entry)));
  return lines.join("\n");
}

function formatOutcomeTotalLine(label: OutcomeLabel, counts: OutcomeSplitCounts) {
  const total = counts.parentCount + counts.stepCount;
  return `- ${label}: ${counts.parentCount} Parents, ${counts.stepCount} Steps/Substeps, ${total} Total`;
}

function generateTaskReport({
  appVersion,
  achievementModel = null,
  achievementWarning = null,
  availableTaskLists,
  detailLevel,
  focusCategories,
  focusDailyGoalAdjustments = [],
  focusHistory,
  generatedAt,
  historySourceLabel,
  historyWarning,
  listMembershipsByTaskId = {},
  milestoneEvents = [],
  milestones = [],
  milestoneWarning = null,
  customRange,
  rangeId,
  records = { currentRecords: [], events: [] },
  taskHistory,
  tasks,
  todayDateKey,
}: GenerateTaskReportInput) {
  const range = buildRange(rangeId, todayDateKey, taskHistory, focusHistory, focusDailyGoalAdjustments, customRange);
  const taskHistoryByTaskId = buildTaskHistoryByTaskId(taskHistory);
  const snapshot = buildTaskSnapshotSections(tasks, todayDateKey, availableTaskLists, listMembershipsByTaskId, taskHistoryByTaskId);
  const history = buildHistorySections(tasks, taskHistory, range, todayDateKey, availableTaskLists, listMembershipsByTaskId, taskHistoryByTaskId);
  const routinePerformance = buildRoutinePerformanceSummary(tasks, taskHistory, range, snapshot.metadataByTaskId);
  const focusSection = buildFocusSection(range, focusCategories, focusHistory, focusDailyGoalAdjustments, todayDateKey);
  const milestoneRange = resolveTaskReportHistoryFetchRange(rangeId, todayDateKey, customRange);
  const achievementSection = formatAchievementSection(achievementModel, milestoneRange, achievementWarning);
  const milestoneSection = formatMilestoneReportSection(
    buildMilestoneReportSummary(milestoneEvents, milestones, milestoneRange),
    detailLevel === "detailed",
    milestoneWarning,
  );
  const recordsSection = formatRecordsReportSection(
    records,
    milestoneRange,
    Object.fromEntries([...snapshot.metadataByTaskId].map(([taskId, metadata]) => [taskId, metadata.pathLabel])),
  );
  const reportEligibleHistoryCount = taskHistory.filter((entry) => {
    const metadata = snapshot.metadataByTaskId.get(entry.task_id);
    return metadata && !metadata.isTrashed;
  }).length;

  const lines = [
    "# ADHDice Report",
    "",
    "## Overview",
    `- Generated: ${formatTimestamp(generatedAt)}`,
    `- App Version: ${appVersion}`,
    `- Selected Date Range: ${formatRangeSummary(range)}`,
    `- History Records Analyzed: ${reportEligibleHistoryCount}`,
    `- History Source: ${historySourceLabel}`,
    `- Active vs Trashed Loaded: ${snapshot.activeLoadedTaskCount} active, ${snapshot.trashedLoadedTaskCount} trashed excluded`,
    ...(historyWarning ? [`- Warning: ${historyWarning}`] : []),
    formatOutcomeTotalLine("Done", history.outcomeTotals.Done),
    formatOutcomeTotalLine("Did My Best", history.outcomeTotals["Did My Best"]),
    formatOutcomeTotalLine("Complete", history.outcomeTotals.Complete),
    formatOutcomeTotalLine("Missed", history.outcomeTotals.Missed),
    `- Current Status Snapshot: ${formatStatusSnapshotCounts(snapshot.currentStatusSnapshotCounts)}`,
    ...(snapshot.pinnedSummary.total > 0 ? [formatCompactTaskSummaryLine("Pinned Tasks", snapshot.pinnedSummary)] : []),
    ...snapshot.prioritySummaries.map((summary) => `- Priority ${summary.priorityLevel}: ${formatStatusSnapshotCounts(summary.byStatus)}`),
    `- Best Completion Day: ${history.topHandledDay ? `${formatDateLabel(history.topHandledDay.dateKey)} (${history.topHandledDay.count} handled)` : "None in selected range"}`,
    `- Highest Missed Day: ${history.highestMissedDay ? `${formatDateLabel(history.highestMissedDay.dateKey)} (${history.highestMissedDay.count} missed)` : "None in selected range"}`,
    `- Repeated Missed Count: ${history.repeatedMissCount}`,
    `- Daily Tasks With 0 Wins Count: ${history.dailyZeroWinCount}`,
    "",
    "## Routine Performance",
    "- Range outcomes for Tasks currently in Routine",
    formatRoutineOutcomeLine("Parent Tasks", routinePerformance.parents),
    formatRoutineOutcomeLine("Steps/Substeps", routinePerformance.steps),
    "- Note: Routine membership reflects the current Routine list, including inherited manual membership, because historical membership is unavailable.",
    "",
    ...achievementSection,
    "",
    ...milestoneSection,
    "",
    ...recordsSection,
    "",
    ...focusSection,
  ];

  if (detailLevel === "detailed") {
    lines.push(
      "",
      "## Task History / details",
      "",
      "### All Current Task History",
      ...(history.taskPatterns.length > 0
        ? history.taskPatterns.map((entry) => formatTaskHistoryLine(entry))
        : ["- No active, non-trashed task history in the selected range."]),
      "",
      "### Day-by-Day Breakdown",
    );

    const chronologicalDates = [...history.dayBreakdownsByDate.keys()].sort((left, right) => left.localeCompare(right));
    if (chronologicalDates.length === 0) {
      lines.push("- No day-by-day records in the selected range.");
    } else {
      for (const dateKey of chronologicalDates) {
        const dayBreakdown = history.dayBreakdownsByDate.get(dateKey);
        if (!dayBreakdown) {
          continue;
        }
        lines.push(
          "",
          `#### ${formatDateHeading(dateKey)}`,
          `- Summary: Parents handled ${dayBreakdown.handledParents}; Steps/Substeps handled ${dayBreakdown.handledSteps}; Combined handled ${dayBreakdown.handledTotal}; Missed ${dayBreakdown.missed}`,
          "",
          formatDayOutcomeGroup("Done", dayBreakdown.outcomes.Done),
          "",
          formatDayOutcomeGroup("Did My Best", dayBreakdown.outcomes["Did My Best"]),
          "",
          formatDayOutcomeGroup("Complete", dayBreakdown.outcomes.Complete),
          "",
          formatDayOutcomeGroup("Missed", dayBreakdown.outcomes.Missed),
        );
      }
    }
  }

  lines.push(
    "",
    "## Analysis Request",
    "Please analyze this ADHDice report and help me with the following:",
    "",
    "- Identify task-by-task follow-through and missed-pattern trends across the selected range.",
    "- Call out which current tasks look overloaded, stale, avoidance-prone, or ready for simplification.",
    "- Use the day-by-day breakdown to spot context, sequencing, or timing patterns behind wins and misses.",
    "- Suggest which recurring tasks need lighter cadence, clearer success criteria, or a better time of day.",
    "- Propose a realistic 7-day adjustment plan plus 3 to 5 small experiments to improve follow-through.",
  );

  return lines.join("\n");
}

export { generateTaskReport, resolveTaskReportHistoryFetchRange };
