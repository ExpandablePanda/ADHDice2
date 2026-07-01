import type { Task, TaskHistory, TaskStatus } from "@/lib/database.types";
import { shiftDateKey } from "@/lib/task-grid-layout";
import { getTaskDisplayStatusWithHistory } from "@/lib/task-cockpit";
import { buildTaskHierarchyAdapter } from "@/lib/task-hierarchy";
import type { TaskListDefinition, TaskListEvaluationContext } from "@/lib/task-lists";
import { formatRepeatSummary } from "@/lib/task-repeat";

export const TASK_REPORT_RANGE_OPTIONS = [
  { id: "today", label: "Today", days: 1 },
  { id: "last7", label: "Last 7 days", days: 7 },
  { id: "last30", label: "Last 30 days", days: 30 },
  { id: "last90", label: "Last 90 days", days: 90 },
  { id: "all", label: "All available", days: null },
] as const;

export const TASK_REPORT_DETAIL_OPTIONS = [
  { id: "summary", label: "Summary" },
  { id: "detailed", label: "Detailed" },
] as const;

export type TaskReportRangeId = typeof TASK_REPORT_RANGE_OPTIONS[number]["id"];
export type TaskReportDetailLevel = typeof TASK_REPORT_DETAIL_OPTIONS[number]["id"];

type GenerateTaskReportInput = {
  appVersion: string;
  availableTaskLists: TaskListDefinition[];
  detailLevel: TaskReportDetailLevel;
  generatedAt: Date;
  historySourceLabel: string;
  historyWarning: string | null;
  rangeId: TaskReportRangeId;
  taskHistory: TaskHistory[];
  taskListEvaluationContext: TaskListEvaluationContext;
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
  isTestLike: boolean;
  isTrashed: boolean;
  isUrgent: boolean;
  pathLabel: string;
  priorityLabel: string;
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

type DayBreakdown = {
  handledParents: number;
  handledSteps: number;
  handledTotal: number;
  missed: number;
  outcomes: Record<OutcomeLabel, LatestHistoryEntry[]>;
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
  if (!dateKey) {
    return "Unknown";
  }
  const [year, month, day] = dateKey.split("-").map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return dateKey;
  }
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatShortDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return dateKey;
  }
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function formatDateHeading(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return dateKey;
  }
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    weekday: "short",
    year: "numeric",
  }).format(date);
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

function resolveTaskReportHistoryFetchRange(rangeId: TaskReportRangeId, todayDateKey: string) {
  const option = TASK_REPORT_RANGE_OPTIONS.find((entry) => entry.id === rangeId) ?? TASK_REPORT_RANGE_OPTIONS[0];
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

function buildRange(rangeId: TaskReportRangeId, todayDateKey: string, history: TaskHistory[]): ReportRange {
  const option = TASK_REPORT_RANGE_OPTIONS.find((entry) => entry.id === rangeId) ?? TASK_REPORT_RANGE_OPTIONS[0];
  const fetchRange = resolveTaskReportHistoryFetchRange(rangeId, todayDateKey);
  if (option.days !== null) {
    return {
      ...fetchRange,
      label: option.label,
      spanDays: option.days,
    };
  }

  const sortedDates = history.map((entry) => entry.entry_date).sort();
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
    spanDays: Math.max(spanDays, history.length > 0 ? 1 : 0),
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

function capitalizeWord(value: string) {
  return `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
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

function buildPriorityLabel(task: Task) {
  return `${capitalizeWord(task.priority)} priority`;
}

function isTestLikeTaskTitle(title: string) {
  return title.trim().toLowerCase().includes("test");
}

function buildTaskMetadata(
  tasks: Task[],
  _availableTaskLists: TaskListDefinition[],
  taskListEvaluationContext: TaskListEvaluationContext,
  todayDateKey: string,
) {
  const taskHierarchy = buildTaskHierarchyAdapter(tasks);
  const metadataByTaskId = new Map<string, TaskReportTaskMetadata>();

  for (const task of tasks) {
    const title = task.title.trim() || "Untitled task";
    const ancestry = taskHierarchy.getParentChain(task.id)
      .map((ancestor) => ancestor.title?.trim() || "Untitled task")
      .reverse();
    const pathLabel = [...ancestry, title].join(" > ");

    metadataByTaskId.set(task.id, {
      cadenceLabel: formatRepeatSummary(task) ?? null,
      currentStatusLabel: STATUS_LABELS[getTaskDisplayStatusWithHistory(
        task,
        taskListEvaluationContext.taskHistoryByTaskId[task.id] ?? [],
        todayDateKey,
      )] ?? task.status,
      isImportant: task.is_important,
      isTestLike: isTestLikeTaskTitle(title),
      isTrashed: task.status === "trashed",
      isUrgent: task.is_urgent,
      pathLabel,
      priorityLabel: buildPriorityLabel(task),
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
  taskListEvaluationContext: TaskListEvaluationContext,
) {
  const metadataByTaskId = buildTaskMetadata(tasks, availableTaskLists, taskListEvaluationContext, todayDateKey);
  const workloadTasks = tasks.filter((task) => task.status !== "trashed");
  const currentStatusSnapshotCounts = workloadTasks.reduce<Record<string, number>>((accumulator, task) => {
    const metadata = metadataByTaskId.get(task.id);
    if (!metadata) {
      return accumulator;
    }
    incrementCount(accumulator, metadata.currentStatusLabel);
    return accumulator;
  }, {});

  return {
    activeLoadedTaskCount: tasks.filter((task) => task.status !== "trashed").length,
    currentStatusSnapshotCounts,
    snapshotTaskCount: workloadTasks.length,
    trashedLoadedTaskCount: tasks.filter((task) => task.status === "trashed").length,
  };
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
  taskListEvaluationContext: TaskListEvaluationContext,
) {
  const tasksById = new Map(tasks.map((task) => [task.id, task] as const));
  const metadataByTaskId = buildTaskMetadata(tasks, availableTaskLists, taskListEvaluationContext, todayDateKey);
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

function getHistoryTimestamp(entry: LatestHistoryEntry) {
  return entry.updated_at || entry.created_at || null;
}

function formatHistoryEntryMoment(entry: LatestHistoryEntry) {
  const timeLabel = formatTimeOnly(getHistoryTimestamp(entry));
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

function formatFlags(metadata: TaskReportTaskMetadata) {
  if (metadata.isUrgent && metadata.isImportant) {
    return "Urgent + Important";
  }
  if (metadata.isUrgent) {
    return "Urgent";
  }
  if (metadata.isImportant) {
    return "Important";
  }
  return null;
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
  const flags = formatFlags(entry.metadata);
  if (flags) {
    parts.push(`Flags: ${flags}`);
  }
  if (entry.task.priority !== "normal") {
    parts.push(`Priority: ${entry.metadata.priorityLabel}`);
  }
  return `- ${parts.filter((value): value is string => Boolean(value)).join(" — ")}`;
}

function sortLatestEntries(entries: LatestHistoryEntry[]) {
  return [...entries].sort((left, right) => left.metadata.pathLabel.localeCompare(right.metadata.pathLabel));
}

function formatDayRow(entry: LatestHistoryEntry) {
  const descriptor = entry.metadata.typeLabel === "Parent"
    ? entry.metadata.typeLabel
    : `${entry.metadata.typeLabel} — ${entry.metadata.pathLabel}`;
  const timeLabel = formatTimeOnly(getHistoryTimestamp(entry));
  return `- ${entry.metadata.title} — ${descriptor}${timeLabel ? ` — ${timeLabel}` : ""}`;
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
  availableTaskLists,
  detailLevel,
  generatedAt,
  historySourceLabel,
  historyWarning,
  rangeId,
  taskHistory,
  taskListEvaluationContext,
  tasks,
  todayDateKey,
}: GenerateTaskReportInput) {
  const range = buildRange(rangeId, todayDateKey, taskHistory);
  const snapshot = buildTaskSnapshotSections(tasks, todayDateKey, availableTaskLists, taskListEvaluationContext);
  const history = buildHistorySections(tasks, taskHistory, range, todayDateKey, availableTaskLists, taskListEvaluationContext);

  const lines = [
    "# ADHDice Report",
    "",
    "## Overall Stats",
    `- Generated: ${formatTimestamp(generatedAt)}`,
    `- App Version: ${appVersion}`,
    `- Selected Date Range: ${formatRangeSummary(range)}`,
    `- History Records Analyzed: ${taskHistory.length}`,
    `- History Source: ${historySourceLabel}`,
    `- Active vs Trashed Loaded: ${snapshot.activeLoadedTaskCount} active, ${snapshot.trashedLoadedTaskCount} trashed excluded`,
    ...(historyWarning ? [`- Warning: ${historyWarning}`] : []),
    formatOutcomeTotalLine("Done", history.outcomeTotals.Done),
    formatOutcomeTotalLine("Did My Best", history.outcomeTotals["Did My Best"]),
    formatOutcomeTotalLine("Complete", history.outcomeTotals.Complete),
    formatOutcomeTotalLine("Missed", history.outcomeTotals.Missed),
    `- Current Status Snapshot: ${formatStatusSnapshotCounts(snapshot.currentStatusSnapshotCounts)}`,
    `- Best Completion Day: ${history.topHandledDay ? `${formatDateLabel(history.topHandledDay.dateKey)} (${history.topHandledDay.count} handled)` : "None in selected range"}`,
    `- Highest Missed Day: ${history.highestMissedDay ? `${formatDateLabel(history.highestMissedDay.dateKey)} (${history.highestMissedDay.count} missed)` : "None in selected range"}`,
    `- Repeated Missed Count: ${history.repeatedMissCount}`,
    `- Daily Tasks With 0 Wins Count: ${history.dailyZeroWinCount}`,
  ];

  if (detailLevel === "detailed") {
    lines.push(
      "",
      "## All Current Task History",
      ...(history.taskPatterns.length > 0
        ? history.taskPatterns.map((entry) => formatTaskHistoryLine(entry))
        : ["- No active, non-trashed task history in the selected range."]),
      "",
      "## Day-by-Day Breakdown",
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
          `### ${formatDateHeading(dateKey)}`,
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
