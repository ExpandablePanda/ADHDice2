import { buildTaskHierarchyAdapter, type TaskHierarchyIssue } from "@/lib/task-hierarchy";
import { isArchiveLikeTask } from "@/lib/task-complete";
import { getMissingTaskGridWidgetTypes, type TaskGridLayoutItem } from "@/lib/task-grid-layout";
import { getTaskDisplayStatusWithHistory, sortTasksForCockpit, matchesTaskQuickFilter } from "@/lib/task-cockpit";
import type {
  Task,
  TaskHistory,
  TaskStatus,
  TaskSubtask as DbTaskSubtask,
} from "@/lib/database.types";
import { computeTaskSpecificHistoryStats, getTaskFocusFilterFacts } from "@/lib/task-history";
import type { TaskEditorLinkedNote } from "@/lib/task-notes";
import type {
  TaskBucketContext,
} from "@/lib/task-buckets";
import type { TaskUiState } from "@/lib/task-ui-state";
import type {
  TaskListDefinition,
  TaskListEvaluationContext,
  TaskListEvaluationPerf,
} from "@/lib/task-lists";
import { buildTaskListLookup, evaluateTaskListMemberships } from "@/lib/task-lists";
import { isTaskFinished, isTaskOpen, isTaskUrgent, isTaskVisibleInPrimaryViews } from "@/lib/task-buckets";
import { isDueToday, isOverdue } from "@/lib/task-cockpit";
import { isTaskInRecentTrash } from "@/lib/task-trash";
import { normalizeTitleForDuplicateDetection } from "@/lib/task-search";

type TaskGridItem = TaskGridLayoutItem<string>;
type TaskDerivedFilterState = Pick<TaskUiState, "duplicateTitleMode" | "energyFilters" | "matchAny" | "quickFilters" | "statusFilters">;

type VisibleTaskBaseFacts = {
  isDoneTask: boolean;
  isLowEnergyTask: boolean;
  isOpenTask: boolean;
  isOverdueTask: boolean;
  isTodayTask: boolean;
  isUrgentTask: boolean;
};

export type DuplicateTitleGroup = {
  count: number;
  displayTitle: string;
  normalizedTitle: string;
  tasks: Task[];
};

export type TaskHierarchyDiagnostics = {
  childTaskIds: string[];
  childTaskIdsByParentTaskId: Record<string, string[]>;
  cycleSummaries: Array<{
    parentTaskId: string;
    taskId: string;
    taskIds: string[];
  }>;
  cycleTaskIds: string[];
  depthByTaskId: Record<string, number | null>;
  invalidTaskIds: string[];
  maxDepth: number;
  orphanTaskIds: string[];
  rawChildTaskIdsByParentTaskId: Record<string, string[]>;
  topLevelTaskIds: string[];
  totalTaskCount: number;
  validChildTaskIds: string[];
};

export type TaskPrimaryVisibility = {
  cycleTaskIds: string[];
  invalidTaskIds: string[];
  orphanTaskIds: string[];
  primaryHiddenChildTaskIds: string[];
  primaryVisibleTaskIds: string[];
};

export type ChildTaskPreviewPriority = "focus" | "important" | "urgent";

export type ChildTaskPreview = {
  actualSeconds: number;
  createdAt: string;
  currentStreak: number;
  depth: number;
  dueOn: string | null;
  dueTime: string | null;
  energy: Task["energy"];
  estimatedMinutes: number | null;
  id: string;
  issueTypes: Array<TaskHierarchyIssue["type"]>;
  linkLabel: string;
  linkUrl: string;
  missedStreak: number;
  notes: string;
  parentTaskId: string | null;
  priorityFlags: ChildTaskPreviewPriority[];
  repeat: Task["repeat_frequency"];
  repeatDayOfMonth: number | null;
  repeatDaysOfWeek: number[];
  repeatInterval: number;
  repeatMonthlyMode: Task["repeat_monthly_mode"];
  repeatMonthlyOrdinal: Task["repeat_monthly_ordinal"];
  repeatMonthlyWeekday: Task["repeat_monthly_weekday"];
  scheduledOn: string | null;
  status: TaskStatus;
  tags: string[];
  title: string;
  updatedAt: string;
};

export type ChildTaskPreviewSummary = {
  descendantCount: number;
  directChildCount: number;
  hasInvalidDescendants: boolean;
  invalidChildLinkCount: number;
};

export type ChildTaskPreviewGroup = {
  items: ChildTaskPreview[];
  summary: ChildTaskPreviewSummary;
};

export type ChildTaskPreviewLookup = Record<string, ChildTaskPreviewGroup>;
export type TaskRailListOption = {
  count: number;
  description: string;
  id: string;
  isCustom: boolean;
  label: string;
};

function matchesNormalizedSearchValue(value: string | null | undefined, normalizedSearchQuery: string) {
  return typeof value === "string" && value.toLowerCase().includes(normalizedSearchQuery);
}

function matchesNormalizedSearchValues(values: readonly string[] | null | undefined, normalizedSearchQuery: string) {
  return Array.isArray(values) && values.some((value) => matchesNormalizedSearchValue(value, normalizedSearchQuery));
}

const EMPTY_TASKS: Task[] = [];
const isDevelopment = process.env.NODE_ENV !== "production";

function buildVisibleTaskBaseFacts(task: Task): VisibleTaskBaseFacts {
  const isOpenTask = isTaskOpen(task);
  const isDoneTask = isTaskFinished(task);
  const isOverdueTask = isOpenTask && isOverdue(task.due_on);
  const isUrgentTask = isOpenTask && isTaskUrgent(task);
  const isLowEnergyTask = isOpenTask && task.energy === "low";
  const isTodayTask = isOpenTask && task.status !== "missed" && isDueToday(task.due_on);

  return {
    isDoneTask,
    isLowEnergyTask,
    isOpenTask,
    isOverdueTask,
    isTodayTask,
    isUrgentTask,
  };
}

export function formatChildTaskPreviewDepthLabel(depth: number) {
  return depth > 1 ? "Substep" : "Step";
}

function pushTaskDeriveLog(message: string) {
  console.info(message);
  if (typeof window === "undefined") {
    return;
  }

  const deriveWindow = window as Window & { __ADHDICE_TASK_DERIVE_LOGS__?: string[] };
  deriveWindow.__ADHDICE_TASK_DERIVE_LOGS__ ??= [];
  deriveWindow.__ADHDICE_TASK_DERIVE_LOGS__.push(message);
}

function logTaskDeriveStep(
  step: string,
  startedAt: number,
  details: Record<string, number | string>,
) {
  if (!isDevelopment || typeof performance === "undefined") {
    return;
  }

  const detailString = Object.entries(details)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  pushTaskDeriveLog(
    `[tasks:derive] ${step} in ${Math.round(performance.now() - startedAt)}ms${detailString ? ` ${detailString}` : ""}`,
  );
}

function compareTasksByNewest(left: Task, right: Task) {
  const leftCreatedAt = new Date(left.created_at).getTime();
  const rightCreatedAt = new Date(right.created_at).getTime();
  if (Number.isFinite(leftCreatedAt) && Number.isFinite(rightCreatedAt) && leftCreatedAt !== rightCreatedAt) {
    return rightCreatedAt - leftCreatedAt;
  }

  return left.id.localeCompare(right.id);
}

function buildDuplicateTitleGroups(tasks: Task[]) {
  const groupsByTitle = new Map<string, Task[]>();

  for (const task of tasks) {
    const normalizedTitle = normalizeTitleForDuplicateDetection(task.title);
    if (!normalizedTitle) {
      continue;
    }

    const currentGroup = groupsByTitle.get(normalizedTitle);
    if (currentGroup) {
      currentGroup.push(task);
      continue;
    }

    groupsByTitle.set(normalizedTitle, [task]);
  }

  return Array.from(groupsByTitle.entries())
    .map(([normalizedTitle, groupedTasks]) => {
      const sortedTasks = [...groupedTasks].sort(compareTasksByNewest);
      const displayTitle = sortedTasks.find((task) => task.title.trim().length > 0)?.title.trim() ?? normalizedTitle;

      return {
        count: sortedTasks.length,
        displayTitle,
        normalizedTitle,
        tasks: sortedTasks,
      } satisfies DuplicateTitleGroup;
    })
    .filter((group) => group.count >= 2)
    .sort((left, right) => {
      if (left.count !== right.count) {
        return right.count - left.count;
      }

      return left.displayTitle.localeCompare(right.displayTitle, undefined, { sensitivity: "base" });
    });
}

function mapTaskIdsByParentTaskId(groupedTasks: Map<string, Task[]>) {
  return Object.fromEntries(
    Array.from(groupedTasks.entries()).map(([parentTaskId, children]) => [
      parentTaskId,
      children.map((child) => child.id),
    ]),
  );
}

export function buildTaskHierarchyDiagnostics(tasks: Task[]): TaskHierarchyDiagnostics {
  const adapter = buildTaskHierarchyAdapter(tasks);
  const depthByTaskId = Object.fromEntries(adapter.depthByTaskId.entries());
  const maxDepth = Object.values(depthByTaskId).reduce(
    (currentMax, depth) => (typeof depth === "number" ? Math.max(currentMax, depth) : currentMax),
    0,
  );

  return {
    childTaskIds: adapter.childTaskIds,
    childTaskIdsByParentTaskId: mapTaskIdsByParentTaskId(adapter.childrenByParentId),
    cycleSummaries: adapter.cycles.map((cycle) => ({
      parentTaskId: cycle.parentTaskId,
      taskId: cycle.taskId,
      taskIds: cycle.taskIds,
    })),
    cycleTaskIds: Array.from(adapter.cycleTaskIds),
    depthByTaskId,
    invalidTaskIds: Array.from(adapter.invalidTaskIds),
    maxDepth,
    orphanTaskIds: adapter.orphanTaskIds,
    rawChildTaskIdsByParentTaskId: mapTaskIdsByParentTaskId(adapter.rawChildrenByParentId),
    topLevelTaskIds: adapter.topLevelTaskIds,
    totalTaskCount: tasks.length,
    validChildTaskIds: adapter.validChildTaskIds,
  };
}

export function buildTaskPrimaryVisibility(tasks: Task[]): TaskPrimaryVisibility {
  const adapter = buildTaskHierarchyAdapter(tasks);
  const hiddenChildTaskIds = new Set(adapter.validChildTaskIds);

  return {
    cycleTaskIds: Array.from(adapter.cycleTaskIds),
    invalidTaskIds: Array.from(adapter.invalidTaskIds),
    orphanTaskIds: adapter.orphanTaskIds,
    primaryHiddenChildTaskIds: adapter.validChildTaskIds,
    primaryVisibleTaskIds: tasks
      .filter((task) => !hiddenChildTaskIds.has(task.id))
      .map((task) => task.id),
  };
}

function getChildTaskPriorityFlags(task: Task, focusedTaskIdSet: Set<string>): ChildTaskPreviewPriority[] {
  const priorityFlags: ChildTaskPreviewPriority[] = [];

  if (focusedTaskIdSet.has(task.id)) {
    priorityFlags.push("focus");
  }
  if (task.is_important) {
    priorityFlags.push("important");
  }
  if (task.is_urgent) {
    priorityFlags.push("urgent");
  }

  return priorityFlags;
}

export function buildChildTaskPreviewLookup(
  tasks: Task[],
  focusedTaskIds: readonly string[] = [],
  taskHistoryByTaskId: Record<string, TaskHistory[]> = {},
  todayDateKey = "",
): ChildTaskPreviewLookup {
  const adapter = buildTaskHierarchyAdapter(tasks);
  const focusedTaskIdSet = new Set(focusedTaskIds);
  const previewByParentTaskId: ChildTaskPreviewLookup = {};

  for (const task of tasks) {
    const descendants = adapter.getDescendants(task.id);
    const directChildren = adapter.getChildren(task.id);
    const invalidDirectChildren = (adapter.rawChildrenByParentId.get(task.id) ?? [])
      .filter((child) => adapter.invalidTaskIds.has(child.id));

    if (descendants.length === 0 && invalidDirectChildren.length === 0) {
      continue;
    }

    const parentDepth = adapter.getDepth(task.id);
    const parentBaseDepth = typeof parentDepth === "number" ? parentDepth : 0;

    previewByParentTaskId[task.id] = {
      items: descendants.map((descendant) => {
        const descendantDepth = adapter.getDepth(descendant.id);
        const relativeDepth = typeof descendantDepth === "number"
          ? Math.max(1, descendantDepth - parentBaseDepth)
          : 1;
        const historyStats = computeTaskSpecificHistoryStats(
          descendant,
          taskHistoryByTaskId[descendant.id] ?? [],
          todayDateKey,
        );

        return {
          actualSeconds: descendant.actual_seconds,
          createdAt: descendant.created_at,
          currentStreak: historyStats.currentStreak,
          depth: relativeDepth,
          dueOn: descendant.due_on,
          dueTime: descendant.due_time,
          energy: descendant.energy,
          estimatedMinutes: descendant.estimated_minutes,
          id: descendant.id,
          issueTypes: adapter.getNode(descendant.id)?.issueTypes ?? [],
          linkLabel: descendant.external_link_label ?? "",
          linkUrl: descendant.external_link_url ?? "",
          missedStreak: historyStats.missedStreak,
          notes: descendant.notes ?? "",
          parentTaskId: descendant.parent_task_id,
          priorityFlags: getChildTaskPriorityFlags(descendant, focusedTaskIdSet),
          repeat: descendant.repeat_frequency,
          repeatDayOfMonth: descendant.repeat_day_of_month,
          repeatDaysOfWeek: descendant.repeat_days_of_week ?? [],
          repeatInterval: Math.max(1, descendant.repeat_interval ?? 1),
          repeatMonthlyMode: descendant.repeat_monthly_mode,
          repeatMonthlyOrdinal: descendant.repeat_monthly_ordinal,
          repeatMonthlyWeekday: descendant.repeat_monthly_weekday,
          scheduledOn: descendant.scheduled_on,
          status: getTaskDisplayStatusWithHistory(
            descendant,
            taskHistoryByTaskId[descendant.id] ?? [],
            todayDateKey,
          ),
          tags: descendant.tags ?? [],
          title: descendant.title,
          updatedAt: descendant.updated_at,
        };
      }),
      summary: {
        descendantCount: descendants.length,
        directChildCount: directChildren.length,
        hasInvalidDescendants: invalidDirectChildren.length > 0,
        invalidChildLinkCount: invalidDirectChildren.length,
      },
    };
  }

  return previewByParentTaskId;
}

type ComputeTaskAppDerivedDataInput = {
  activePage: string;
  availableTaskLists: TaskListDefinition[];
  availableTaskNotes: TaskEditorLinkedNote[];
  bucketContext: TaskBucketContext;
  deferredSearchQuery: string;
  focusedTaskIds: string[];
  listColumnPickerOrder: string[];
  listVisibleColumns: string[];
  taskActualTimeEntryTaskId: string | null;
  taskEditorTaskId: string | null;
  taskGridLayout: TaskGridItem[];
  taskGridWidgetTypes: string[];
  taskHistoryByTaskId: Record<string, TaskHistory[]>;
  todayDateKey: string;
  taskListEvaluationContext: TaskListEvaluationContext;
  taskSubtasksByTaskId: Record<string, DbTaskSubtask[]>;
  taskUiState: TaskDerivedFilterState;
  tasks: Task[];
};

export function computeTaskAppDerivedData({
  activePage,
  availableTaskLists,
  availableTaskNotes,
  bucketContext,
  deferredSearchQuery,
  focusedTaskIds,
  listColumnPickerOrder,
  listVisibleColumns,
  taskActualTimeEntryTaskId,
  taskEditorTaskId,
  taskGridLayout,
  taskGridWidgetTypes,
  taskHistoryByTaskId,
  todayDateKey,
  taskListEvaluationContext,
  taskSubtasksByTaskId,
  taskUiState,
  tasks,
}: ComputeTaskAppDerivedDataInput) {
  const totalStartedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
  const availableRuleCount = availableTaskLists.reduce((count, list) => count + (list.rules?.rules.length ?? 0), 0);

  const hierarchyDiagnosticsStartedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
  const taskHierarchyDiagnostics = buildTaskHierarchyDiagnostics(tasks);
  const childTaskPreviewByParentTaskId = buildChildTaskPreviewLookup(tasks, focusedTaskIds, taskHistoryByTaskId, todayDateKey);
  const taskPrimaryVisibility = buildTaskPrimaryVisibility(tasks);
  const primaryHiddenChildTaskIds = new Set(taskPrimaryVisibility.primaryHiddenChildTaskIds);
  const normalizedSearchQuery = deferredSearchQuery.toLowerCase();
  const searchMatchedStepParentTaskIds = new Set<string>();
  logTaskDeriveStep("hierarchy diagnostics", hierarchyDiagnosticsStartedAt, {
    childTasks: taskHierarchyDiagnostics.childTaskIds.length,
    childTaskPreviewParents: Object.keys(childTaskPreviewByParentTaskId).length,
    invalidTasks: taskHierarchyDiagnostics.invalidTaskIds.length,
    maxDepth: taskHierarchyDiagnostics.maxDepth,
    primaryHiddenChildren: taskPrimaryVisibility.primaryHiddenChildTaskIds.length,
    tasks: taskHierarchyDiagnostics.totalTaskCount,
  });

  const normalizationStartedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
  const primaryTasks = tasks.filter((task) => !primaryHiddenChildTaskIds.has(task.id));
  const archiveTasks = primaryTasks.filter((task) => isArchiveLikeTask(task));
  const recentlyDeletedTasks = primaryTasks.filter((task) => isTaskInRecentTrash(task));
  const visibleTasks: Task[] = [];
  const taskLinkedNotesByTaskId = availableTaskNotes.reduce<Record<string, TaskEditorLinkedNote[]>>((accumulator, note) => {
    for (const taskId of note.linked_task_ids) {
      if (!accumulator[taskId]) {
        accumulator[taskId] = [];
      }
      accumulator[taskId].push(note);
    }
    return accumulator;
  }, {});
  logTaskDeriveStep("input normalization", normalizationStartedAt, {
    notes: availableTaskNotes.length,
    primaryTasks: primaryTasks.length,
    recentlyDeletedTasks: recentlyDeletedTasks.length,
    tasks: tasks.length,
    visibleTasks: visibleTasks.length,
  });

  const aggregateStartedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
  const taskTagSet = new Set<string>();
  const visibleTaskBaseFactsByTaskId: Record<string, VisibleTaskBaseFacts> = {};
  const activeTasks: Task[] = [];
  const doneTasks: Task[] = [];
  const overdueTasks: Task[] = [];
  const todayTasks: Task[] = [];
  const urgentFlaggedTasks: Task[] = [];
  const lowEnergyTasks: Task[] = [];
  const taskStatusCounts = primaryTasks.reduce<Record<TaskStatus, number>>((accumulator, task) => {
    accumulator[task.status] += 1;
    if (!isTaskVisibleInPrimaryViews(task)) {
      return accumulator;
    }
    visibleTasks.push(task);
    const baseFacts = buildVisibleTaskBaseFacts(task);
    visibleTaskBaseFactsByTaskId[task.id] = baseFacts;
    for (const tag of task.tags ?? []) {
      taskTagSet.add(tag);
    }
    if (baseFacts.isOpenTask) {
      activeTasks.push(task);
      if (baseFacts.isOverdueTask) {
        overdueTasks.push(task);
      }
      if (baseFacts.isUrgentTask) {
        urgentFlaggedTasks.push(task);
      }
      if (baseFacts.isLowEnergyTask && lowEnergyTasks.length < 4) {
        lowEnergyTasks.push(task);
      }
      if (baseFacts.isTodayTask) {
        todayTasks.push(task);
      }
    }
    if (baseFacts.isDoneTask) {
      doneTasks.push(task);
    }
    return accumulator;
  }, {
    pending: 0,
    in_progress: 0,
    delayed: 0,
    done: 0,
    missed: 0,
    did_my_best: 0,
    complete: 0,
    upcoming: 0,
    not_due: 0,
    archived: 0,
    trashed: 0,
  });
  const allTaskTags = [...taskTagSet].sort();
  const urgentTasks = urgentFlaggedTasks.slice(0, 6);
  logTaskDeriveStep("base bucket and count aggregation", aggregateStartedAt, {
    activeTasks: activeTasks.length,
    doneTasks: doneTasks.length,
    statusBuckets: Object.keys(taskStatusCounts).length,
    tags: allTaskTags.length,
    tasks: primaryTasks.length,
  });

  const matchesTaskFilters = (task: Task) => {
    const quickChecks = taskUiState.quickFilters.map((filter) => matchesTaskQuickFilter(task, filter, focusedTaskIds));
    const matchesQuickFilters = quickChecks.length === 0
      ? true
      : taskUiState.matchAny
        ? quickChecks.some(Boolean)
        : quickChecks.every(Boolean);
    const matchesStatus = taskUiState.statusFilters.length === 0 || taskUiState.statusFilters.includes(task.status);
    const matchesEnergy = taskUiState.energyFilters.length === 0 || taskUiState.energyFilters.includes(task.energy);
    if (!(matchesQuickFilters && matchesStatus && matchesEnergy)) {
      return false;
    }

    if (normalizedSearchQuery.length === 0) {
      return true;
    }

    if (matchesNormalizedSearchValue(task.title, normalizedSearchQuery) || matchesNormalizedSearchValues(task.tags, normalizedSearchQuery)) {
      return true;
    }

    const sourceSubtaskTitleMatch = (taskSubtasksByTaskId[task.id] ?? []).some((subtask) => (
      matchesNormalizedSearchValue(subtask.title, normalizedSearchQuery)
    ));
    if (sourceSubtaskTitleMatch) {
      searchMatchedStepParentTaskIds.add(task.id);
      return true;
    }

    const matchingChildSearch = childTaskPreviewByParentTaskId[task.id]?.items.some((item) => (
      matchesNormalizedSearchValue(item.title, normalizedSearchQuery)
      || matchesNormalizedSearchValues(item.tags, normalizedSearchQuery)
    )) ?? false;
    if (matchingChildSearch) {
      searchMatchedStepParentTaskIds.add(task.id);
      return true;
    }

    return false;
  };

  const matchesTaskStructuredFilters = (task: Task) => {
    const quickChecks = taskUiState.quickFilters.map((filter) => matchesTaskQuickFilter(task, filter, focusedTaskIds));
    const matchesQuickFilters = quickChecks.length === 0
      ? true
      : taskUiState.matchAny
        ? quickChecks.some(Boolean)
        : quickChecks.every(Boolean);
    const matchesStatus = taskUiState.statusFilters.length === 0 || taskUiState.statusFilters.includes(task.status);
    const matchesEnergy = taskUiState.energyFilters.length === 0 || taskUiState.energyFilters.includes(task.energy);
    return matchesQuickFilters && matchesStatus && matchesEnergy;
  };

  const visibleFilteringStartedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
  const filteredVisibleTasks = activePage === "Tasks"
    ? visibleTasks.filter(matchesTaskFilters)
    : EMPTY_TASKS;
  logTaskDeriveStep("visible task filtering", visibleFilteringStartedAt, {
    matchingTasks: filteredVisibleTasks.length,
    quickFilters: taskUiState.quickFilters.length,
    searchLength: deferredSearchQuery.length,
    tasks: visibleTasks.length,
  });

  const visibleSortingStartedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
  const filteredTasksSorted = activePage === "Tasks"
    ? sortTasksForCockpit(filteredVisibleTasks, bucketContext)
    : EMPTY_TASKS;
  logTaskDeriveStep("visible task sorting", visibleSortingStartedAt, {
    matchingTasks: filteredTasksSorted.length,
    tasks: filteredVisibleTasks.length,
  });

  const archiveFilteringStartedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
  const filteredArchiveTasks = activePage === "Tasks"
    ? archiveTasks.filter(matchesTaskFilters)
    : EMPTY_TASKS;
  logTaskDeriveStep("archive task filtering", archiveFilteringStartedAt, {
    matchingTasks: filteredArchiveTasks.length,
    tasks: archiveTasks.length,
  });

  const archiveSortingStartedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
  const archiveFilteredTasksSorted = activePage === "Tasks"
    ? sortTasksForCockpit(filteredArchiveTasks, bucketContext)
    : EMPTY_TASKS;
  logTaskDeriveStep("archive task sorting", archiveSortingStartedAt, {
    matchingTasks: archiveFilteredTasksSorted.length,
    tasks: filteredArchiveTasks.length,
  });

  const trashFilteringStartedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
  const filteredTrashTasks = activePage === "Tasks"
    ? recentlyDeletedTasks.filter(matchesTaskFilters)
    : EMPTY_TASKS;
  logTaskDeriveStep("trash task filtering", trashFilteringStartedAt, {
    matchingTasks: filteredTrashTasks.length,
    tasks: recentlyDeletedTasks.length,
  });

  const trashSortingStartedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
  const trashFilteredTasksSorted = activePage === "Tasks"
    ? sortTasksForCockpit(filteredTrashTasks, bucketContext)
    : EMPTY_TASKS;
  logTaskDeriveStep("trash task sorting", trashSortingStartedAt, {
    matchingTasks: trashFilteredTasksSorted.length,
    tasks: filteredTrashTasks.length,
  });

  const duplicateGroupsStartedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
  const duplicateTitleGroups = activePage !== "Tasks" || !taskUiState.duplicateTitleMode
    ? []
    : buildDuplicateTitleGroups(visibleTasks.filter(matchesTaskStructuredFilters))
      .filter((group) => deferredSearchQuery.length === 0 || group.tasks.some((task) => matchesTaskFilters(task)));
  logTaskDeriveStep("duplicate title grouping", duplicateGroupsStartedAt, {
    groups: duplicateTitleGroups.length,
    tasks: duplicateTitleGroups.reduce((count, group) => count + group.tasks.length, 0),
  });

  const duplicateGroupTaskIds = new Set<string>(duplicateTitleGroups.flatMap((group) => group.tasks.map((task) => task.id)));
  const duplicateGroupTasks = visibleTasks
    .filter((task) => duplicateGroupTaskIds.has(task.id))
    .sort(compareTasksByNewest);

  const taskListMembershipPerf: TaskListEvaluationPerf | undefined = isDevelopment
    ? {
      inboxCheckMs: 0,
      manualMembershipCount: 0,
      manualMembershipSeedMs: 0,
      matchedRuleMemberships: 0,
      ruleEvaluationMs: 0,
      ruleListChecks: 0,
      taskCount: 0,
    }
    : undefined;
  const membershipStartedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
  const membershipSourceTasks = taskUiState.duplicateTitleMode ? duplicateGroupTasks : filteredTasksSorted;
  const taskListLookup = buildTaskListLookup(availableTaskLists);
  const taskDisplayStatusByTaskId = membershipSourceTasks.reduce<Record<string, TaskStatus>>((accumulator, task) => {
    accumulator[task.id] = getTaskDisplayStatusWithHistory(
      task,
      taskHistoryByTaskId[task.id] ?? [],
      todayDateKey,
    );
    return accumulator;
  }, {});
  const focusFilterFactsByTaskId = membershipSourceTasks.reduce<Record<string, ReturnType<typeof getTaskFocusFilterFacts>>>((accumulator, task) => {
    accumulator[task.id] = getTaskFocusFilterFacts(
      task,
      taskHistoryByTaskId[task.id] ?? [],
      todayDateKey,
    );
    return accumulator;
  }, {});
  const cachedTaskListEvaluationContext: TaskListEvaluationContext = {
    ...taskListEvaluationContext,
    focusFilterFactsByTaskId,
    taskDisplayStatusByTaskId,
  };
  const canReuseMembershipScanForVisibleCounts = membershipSourceTasks === filteredTasksSorted;
  const focusedTaskIdSet = new Set(focusedTaskIds);
  const visibleListCounts: Record<string, number> = {};
  const filteredActiveTasks: Task[] = [];
  const filteredDoneTasks: Task[] = [];
  const filteredOverdueTasks: Task[] = [];
  const filteredUrgentTasks: Task[] = [];
  const filteredFocusTasks: Task[] = [];
  const filteredLowEnergyTasks: Task[] = [];
  const filteredTodayTasks: Task[] = [];
  const inboxTasks: Task[] = [];
  const laterTasks: Task[] = [];
  const missedTasks: Task[] = [];
  const quickWinTasks: Task[] = [];
  const recurringTasks: Task[] = [];
  const waitingTasks: Task[] = [];
  const taskListMembershipsByTaskId = activePage !== "Tasks"
    ? {}
    : membershipSourceTasks.reduce<Record<string, ReturnType<typeof evaluateTaskListMemberships>>>((accumulator, task) => {
      const memberships = evaluateTaskListMemberships(
        task,
        availableTaskLists,
        cachedTaskListEvaluationContext,
        taskListMembershipPerf,
        taskListLookup,
      );
      accumulator[task.id] = memberships;
      if (!canReuseMembershipScanForVisibleCounts) {
        return accumulator;
      }
      const baseFacts = visibleTaskBaseFactsByTaskId[task.id] ?? buildVisibleTaskBaseFacts(task);
      if (baseFacts.isOpenTask) {
        filteredActiveTasks.push(task);
        if (baseFacts.isOverdueTask) {
          filteredOverdueTasks.push(task);
        }
        if (baseFacts.isUrgentTask) {
          filteredUrgentTasks.push(task);
        }
        if (baseFacts.isLowEnergyTask && filteredLowEnergyTasks.length < 4) {
          filteredLowEnergyTasks.push(task);
        }
        if (baseFacts.isTodayTask) {
          filteredTodayTasks.push(task);
        }
      }
      if (baseFacts.isDoneTask) {
        filteredDoneTasks.push(task);
      }
      if (baseFacts.isOpenTask && focusedTaskIdSet.has(task.id)) {
        filteredFocusTasks.push(task);
      }
      for (const membership of memberships) {
        visibleListCounts[membership.id] = (visibleListCounts[membership.id] ?? 0) + 1;
        if (membership.id === "inbox") {
          inboxTasks.push(task);
        } else if (membership.id === "later") {
          laterTasks.push(task);
        } else if (membership.id === "missed") {
          missedTasks.push(task);
        } else if (membership.id === "quick_wins") {
          quickWinTasks.push(task);
        } else if (membership.id === "recurring") {
          recurringTasks.push(task);
        } else if (membership.id === "waiting") {
          waitingTasks.push(task);
        }
      }
      return accumulator;
    }, {});
  logTaskDeriveStep("smart-list membership evaluation", membershipStartedAt, {
    helperInboxMs: Math.round(taskListMembershipPerf?.inboxCheckMs ?? 0),
    helperManualMs: Math.round(taskListMembershipPerf?.manualMembershipSeedMs ?? 0),
    helperRuleMs: Math.round(taskListMembershipPerf?.ruleEvaluationMs ?? 0),
    lists: availableTaskLists.length,
    matchedMemberships: taskListMembershipPerf?.matchedRuleMemberships ?? 0,
    rules: availableRuleCount,
    tasks: membershipSourceTasks.length,
  });

  const visibleCountStartedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
  if (activePage === "Tasks" && !canReuseMembershipScanForVisibleCounts) {
    for (const task of filteredTasksSorted) {
      const memberships = taskListMembershipsByTaskId[task.id] ?? [];
      const baseFacts = visibleTaskBaseFactsByTaskId[task.id] ?? buildVisibleTaskBaseFacts(task);

      if (baseFacts.isOpenTask) {
        filteredActiveTasks.push(task);
        if (baseFacts.isOverdueTask) {
          filteredOverdueTasks.push(task);
        }
        if (baseFacts.isUrgentTask) {
          filteredUrgentTasks.push(task);
        }
        if (baseFacts.isLowEnergyTask && filteredLowEnergyTasks.length < 4) {
          filteredLowEnergyTasks.push(task);
        }
        if (baseFacts.isTodayTask) {
          filteredTodayTasks.push(task);
        }
      }

      if (baseFacts.isDoneTask) {
        filteredDoneTasks.push(task);
      }

      if (baseFacts.isOpenTask && focusedTaskIdSet.has(task.id)) {
        filteredFocusTasks.push(task);
      }

      for (const membership of memberships) {
        visibleListCounts[membership.id] = (visibleListCounts[membership.id] ?? 0) + 1;
        if (membership.id === "inbox") {
          inboxTasks.push(task);
        } else if (membership.id === "later") {
          laterTasks.push(task);
        } else if (membership.id === "missed") {
          missedTasks.push(task);
        } else if (membership.id === "quick_wins") {
          quickWinTasks.push(task);
        } else if (membership.id === "recurring") {
          recurringTasks.push(task);
        } else if (membership.id === "waiting") {
          waitingTasks.push(task);
        }
      }
    }
  }
  logTaskDeriveStep("task-list rail/count generation", visibleCountStartedAt, {
    listsWithCounts: Object.keys(visibleListCounts).length,
    tasks: filteredTasksSorted.length,
  });

  const collectionsStartedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
  const collections = {
    filteredActiveTasks,
    filteredDoneTasks,
    filteredFocusTasks,
    filteredLowEnergyTasks,
    filteredOverdueTasks,
    filteredTodayTasks,
    filteredUrgentTasks,
    inboxTasks,
    laterTasks,
    missedTasks,
    quickWinTasks,
    recurringTasks,
    waitingTasks,
  };
  logTaskDeriveStep("base bucket/list splitting", collectionsStartedAt, {
    focusTasks: collections.filteredFocusTasks.length,
    inboxTasks: collections.inboxTasks.length,
    laterTasks: collections.laterTasks.length,
    tasks: filteredTasksSorted.length,
  });

  const planningStartedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
  const seenPlanningCandidateIds = new Set<string>();
  const planningCandidates = activePage !== "Tasks"
    ? []
    : sortTasksForCockpit([
      ...collections.inboxTasks,
      ...collections.laterTasks.filter((task) => !collections.inboxTasks.some((inboxTask) => inboxTask.id === task.id)).slice(0, 8),
      ...collections.quickWinTasks.filter((task) => !collections.inboxTasks.some((inboxTask) => inboxTask.id === task.id)).slice(0, 6),
    ], bucketContext)
      .filter((task) => {
        if (seenPlanningCandidateIds.has(task.id)) {
          return false;
        }
        seenPlanningCandidateIds.add(task.id);
        return true;
      })
      .slice(0, 5);
  logTaskDeriveStep("planning candidate sorting/grouping", planningStartedAt, {
    inboxTasks: collections.inboxTasks.length,
    laterTasks: collections.laterTasks.length,
    planningCandidates: planningCandidates.length,
    quickWinTasks: collections.quickWinTasks.length,
    tasks: filteredTasksSorted.length,
  });

  const focusPlannerStartedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
  const focusPlannerTasks = activePage !== "Tasks"
    ? []
    : sortTasksForCockpit(
      filteredTasksSorted.filter((task) => {
        const memberships = taskListMembershipsByTaskId[task.id] ?? [];
        return isTaskOpen(task) && memberships.some((membership) => membership.id === "today" || membership.id === "urgent" || membership.id === "quick_wins" || membership.id === "focus");
      }),
      bucketContext,
    );
  logTaskDeriveStep("focus planner grouping/sorting", focusPlannerStartedAt, {
    focusPlannerTasks: focusPlannerTasks.length,
    tasks: filteredTasksSorted.length,
  });

  const listAssemblyStartedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
  const momentumPercent = activeTasks.length === 0
    ? 0
    : Math.min(100, Math.round((doneTasks.length / (doneTasks.length + activeTasks.length)) * 100));
  const selectedTaskForEditor = taskEditorTaskId
    ? tasks.find((task) => task.id === taskEditorTaskId) ?? null
    : null;
  const taskForActualTimeEntry = taskActualTimeEntryTaskId
    ? tasks.find((task) => task.id === taskActualTimeEntryTaskId) ?? null
    : null;
  const listColumnPickerColumns = [
    ...listVisibleColumns,
    ...listColumnPickerOrder.filter((columnId) => !listVisibleColumns.includes(columnId)),
  ].filter((columnId, index, columns) => columns.indexOf(columnId) === index);
  const visibleTaskLists = activePage !== "Tasks"
    ? []
    : availableTaskLists.filter((list) => list.isVisible && (list.id !== "missed" || (visibleListCounts[list.id] ?? 0) > 0));
  const listRailOptions: TaskRailListOption[] = activePage !== "Tasks"
    ? []
    : [
      {
        count: filteredTasksSorted.length,
        description: "Everything that matches the current search and filters.",
        id: "all",
        isCustom: false,
        label: "All",
      },
      ...visibleTaskLists.map((list) => ({
        count: visibleListCounts[list.id] ?? 0,
        description: list.description,
        id: list.id,
        isCustom: list.type === "custom",
        label: list.name,
      })),
    ];
  const manualListOptions = activePage !== "Tasks"
    ? []
    : availableTaskLists
      .filter((list) => list.membershipMode !== "rules" || list.id === "waiting")
      .map((list) => ({
        count: visibleListCounts[list.id] ?? 0,
        label: list.name,
        value: list.id,
      }));
  const missingGridWidgetTypes = getMissingTaskGridWidgetTypes(taskGridLayout, taskGridWidgetTypes);
  logTaskDeriveStep("custom/manual list handling and final assembly", listAssemblyStartedAt, {
    listRailOptions: listRailOptions.length,
    manualListOptions: manualListOptions.length,
    missingGridWidgetTypes: missingGridWidgetTypes.length,
    tasks: tasks.length,
    visibleLists: visibleTaskLists.length,
  });
  logTaskDeriveStep("total compute", totalStartedAt, {
    lists: availableTaskLists.length,
    rules: availableRuleCount,
    tasks: tasks.length,
  });

  return {
    activeTasks,
    allTaskTags,
    childTaskPreviewByParentTaskId,
    collections,
    duplicateTitleGroups,
    doneTasks,
    focusPlannerTasks,
    listColumnPickerColumns,
    listRailOptions,
    lowEnergyTasks,
    manualListOptions,
    missingGridWidgetTypes,
    momentumPercent,
    overdueTasks,
    planningCandidates,
    filteredTasksSorted,
    searchMatchedStepParentTaskIds: Array.from(searchMatchedStepParentTaskIds),
    archiveFilteredTasksSorted,
    trashFilteredTasksSorted,
    selectedTaskForEditor,
    taskForActualTimeEntry,
    taskHierarchyDiagnostics,
    taskPrimaryVisibility,
    taskLinkedNotesByTaskId,
    taskListMembershipsByTaskId,
    taskStatusCounts,
    todayTasks,
    urgentTasks,
    visibleListCounts,
  };
}
