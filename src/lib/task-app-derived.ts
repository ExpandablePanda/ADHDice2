import { buildTaskHierarchyAdapter, type TaskHierarchyAdapter, type TaskHierarchyIssue } from "@/lib/task-hierarchy";
import { isWorkspacePerformanceDiagnosticsEnabled, logDevelopmentComputation, type DevelopmentComputationDiagnostic } from "@/lib/workspace-performance-diagnostics";
import { isArchiveLikeTask } from "@/lib/task-complete";
import { getMissingTaskGridWidgetTypes, type TaskGridLayoutItem } from "@/lib/task-grid-layout";
import { sortTasksForCockpit, matchesTaskQuickFilter } from "@/lib/task-cockpit";
import type {
  Task,
  TaskHistory,
  TaskStatus,
  TaskSubtask as DbTaskSubtask,
} from "@/lib/database.types";
import { computeTaskSpecificHistoryStats, getTaskFocusFilterFacts, getTaskHistoryLastDone, getTaskHistoryLastHandled } from "@/lib/task-history";
import type { TaskHistoryStreakSummary, TaskHistoryStreakSummaryMap } from "@/lib/task-history-streak-summaries";
import type { TaskEditorLinkedNote } from "@/lib/task-notes";
import type {
  TaskBucketContext,
} from "@/lib/task-buckets";
import type { TaskDisplayStatus, TaskDisplayStatusByTaskId } from "@/lib/task-display-status";
import type { TaskTableColumnFilters, TaskUiState } from "@/lib/task-ui-state";
import type {
  TaskListDefinition,
  TaskListEvaluationContext,
  TaskListMembership,
} from "@/lib/task-lists";
import { buildTaskListLookup, evaluateTaskListMemberships, isManualTaskListDestination } from "@/lib/task-lists";
import { isTaskFinished, isTaskOpen, isTaskUrgent, isTaskVisibleInPrimaryViews } from "@/lib/task-buckets";
import { formatTaskPriorityLevel, getTaskPriorityLevel, type TaskPriorityLevelOption } from "@/lib/task-priority";
import { getTaskRepeatCategory } from "@/lib/task-repeat";
import { isTaskInRecentTrash } from "@/lib/task-trash";
import { normalizeTitleForDuplicateDetection } from "@/lib/task-search";
import { todayISO } from "@/lib/utils";

type TaskGridItem = TaskGridLayoutItem<string>;
type TaskDerivedFilterState = Pick<TaskUiState, "duplicateTitleMode" | "energyFilters" | "includeStepsByView" | "matchAny" | "quickFilters" | "selectedBucket" | "statusFilters" | "tableColumnFilters" | "view">;

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

export type ChildTaskPreviewPriority = TaskPriorityLevelOption;

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
  isFocused: boolean;
  issueTypes: Array<TaskHierarchyIssue["type"]>;
  lastDoneAt: string | null;
  lastDoneDate: string | null;
  lastHandledAt: string | null;
  lastHandledDate: string | null;
  linkLabel: string;
  linkUrl: string;
  missedStreak: number;
  notes: string;
  parentTaskId: string | null;
  pinnedAt: string | null;
  priorityFlags: ChildTaskPreviewPriority[];
  repeat: Task["repeat_frequency"];
  repeatDayOfMonth: number | null;
  repeatDaysOfWeek: number[];
  repeatInterval: number;
  repeatMonthlyMode: Task["repeat_monthly_mode"];
  repeatMonthlyOrdinal: Task["repeat_monthly_ordinal"];
  repeatMonthlyWeekday: Task["repeat_monthly_weekday"];
  scheduledOn: string | null;
  status: TaskDisplayStatus;
  storedStatus: TaskStatus;
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
export type TaskAppStructuralData = {
  childTaskPreviewByParentTaskId: ChildTaskPreviewLookup;
  hierarchy: TaskHierarchyAdapter<Task>;
  taskHierarchyDiagnostics: TaskHierarchyDiagnostics;
  taskPrimaryVisibility: TaskPrimaryVisibility;
};
export type TaskRailListOption = {
  count: number;
  description: string;
  folderCounts?: {
    containedListCount: number;
    dueTodayCount: number;
    overdueCount: number;
    visibleTaskCount: number;
  };
  id: string;
  isCustom: boolean;
  label: string;
  structureKind?: "folder" | "list";
};

export type CanonicalTaskEntityFact = {
  ancestorIds: string[];
  displayStatus: TaskDisplayStatus;
  id: string;
  listMemberships: TaskListMembership[];
  rootParentId: string;
  searchDocument: string;
  task: Task;
};

export type StableCanonicalTaskIndex = {
  availableTaskLists: TaskListDefinition[];
  entityFactsById: Map<string, CanonicalTaskEntityFact>;
  focusedTaskIds: string[];
  listNameById: ReadonlyMap<string, string>;
  taskById: ReadonlyMap<string, Task>;
  taskListMembershipsByTaskId: Record<string, TaskListMembership[]>;
  todayDateKey: string;
  validChildTaskIdSet: ReadonlySet<string>;
};

export type TaskAppWorkspaceFacts = {
  activeTasks: Task[];
  allTaskTags: string[];
  archiveTasks: Task[];
  baseListCounts: Record<string, number>;
  doneTasks: Task[];
  focusPlannerTasks: Task[];
  lowEnergyTasks: Task[];
  overdueTasks: Task[];
  planningCandidates: Task[];
  primaryTasks: Task[];
  recentlyDeletedTasks: Task[];
  taskLinkedNotesByTaskId: Record<string, TaskEditorLinkedNote[]>;
  taskStatusCounts: Record<TaskDisplayStatus, number>;
  todayQueueTaskCount: number;
  todayTasks: Task[];
  urgentTasks: Task[];
  visibleTaskBaseFactsByTaskId: Record<string, VisibleTaskBaseFacts>;
  visibleTasks: Task[];
};

export type CanonicalTaskEntityProjection = {
  contextAncestorIds: Set<string>;
  contextRootParentIds: Set<string>;
  directSearchMatchedEntityIds: Set<string>;
  entityFactsById: Map<string, CanonicalTaskEntityFact>;
  hierarchyScopedEntityIds: Set<string>;
  hierarchyScopeKey: string;
  listFacetCounts: Record<string, number>;
  matchingDescendantIdsByRootParentId: Map<string, Set<string>>;
  postStatusMatchedEntityIds: Set<string>;
  preStatusMatchedEntityIds: Set<string>;
  primaryFacetVisibleEntityIds: Set<string>;
  searchExpandedDescendantIds: Set<string>;
  statusFacetCounts: Record<TaskDisplayStatus, number>;
  taskListMembershipsByTaskId: Record<string, TaskListMembership[]>;
  visibleRootParentIds: Set<string>;
};

function createEmptyTaskStatusCounts(): Record<TaskDisplayStatus, number> {
  return {
    unscheduled: 0,
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
  };
}

/** Counts actual parent/Step/Substep rows; rendering-only ancestors are never inputs. */
export function buildCanonicalActiveStatusCounts(
  parentTasks: readonly Task[],
  childTaskPreviewByParentTaskId: ChildTaskPreviewLookup,
  taskHistoryByTaskId: Record<string, TaskHistory[]>,
  todayDateKey: string,
  options: { childTaskIds?: ReadonlySet<string>; displayStatusByTaskId?: TaskDisplayStatusByTaskId; includeSteps?: boolean; parentTaskIds?: ReadonlySet<string> } = {},
) {
  const counts = createEmptyTaskStatusCounts();
  const displayStatus = (task: Pick<Task, "id" | "status">) => options.displayStatusByTaskId?.[task.id] ?? task.status;
  for (const task of parentTasks) {
    if (!options.parentTaskIds || options.parentTaskIds.has(task.id)) {
      counts[displayStatus(task)] += 1;
    }
    if (options.includeSteps === false) continue;
    for (const item of childTaskPreviewByParentTaskId[task.id]?.items ?? []) {
      if (options.childTaskIds && !options.childTaskIds.has(item.id)) continue;
      counts[options.displayStatusByTaskId?.[item.id] ?? item.status] += 1;
    }
  }
  return counts;
}

function matchesNormalizedSearchValue(value: string | null | undefined, normalizedSearchQuery: string) {
  return typeof value === "string" && value.toLowerCase().includes(normalizedSearchQuery);
}

function matchesNormalizedSearchValues(values: readonly string[] | null | undefined, normalizedSearchQuery: string) {
  return Array.isArray(values) && values.some((value) => matchesNormalizedSearchValue(value, normalizedSearchQuery));
}

const EMPTY_TASKS: Task[] = [];
const isDevelopment = process.env.NODE_ENV !== "production";

function buildVisibleTaskBaseFacts(task: Task, todayDateKey: string): VisibleTaskBaseFacts {
  const isOpenTask = isTaskOpen(task);
  const isDoneTask = isTaskFinished(task);
  const isOverdueTask = isOpenTask && Boolean(task.due_on && task.due_on < todayDateKey);
  const isUrgentTask = isOpenTask && isTaskUrgent(task);
  const isLowEnergyTask = isOpenTask && task.energy === "low";
  const isTodayTask = isOpenTask && task.status !== "missed" && task.due_on === todayDateKey;

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
  if (!isDevelopment || !isWorkspacePerformanceDiagnosticsEnabled() || typeof performance === "undefined") {
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

export function buildTaskHierarchyDiagnostics(
  tasks: Task[],
  adapter = buildTaskHierarchyAdapter(tasks),
): TaskHierarchyDiagnostics {
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

export function buildTaskPrimaryVisibility(
  tasks: Task[],
  adapter = buildTaskHierarchyAdapter(tasks),
): TaskPrimaryVisibility {
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

function getChildTaskPriorityFlags(task: Task): ChildTaskPreviewPriority[] {
  return [formatTaskPriorityLevel(getTaskPriorityLevel(task))];
}

export function buildChildTaskPreviewLookup(
  tasks: Task[],
  focusedTaskIds: readonly string[] = [],
  taskHistoryByTaskId: Record<string, TaskHistory[]> = {},
  todayDateKey = "",
  adapter = buildTaskHierarchyAdapter(tasks),
  taskHistoryStreakSummaryByTaskId: TaskHistoryStreakSummaryMap = {},
  taskDisplayStatusByTaskId: TaskDisplayStatusByTaskId = {},
): ChildTaskPreviewLookup {
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
        const streakSummary = taskHistoryStreakSummaryByTaskId[descendant.id];
        const historyStats: Pick<TaskHistoryStreakSummary, "currentStreak" | "missedStreak"> = streakSummary
          ?? computeTaskSpecificHistoryStats(
            descendant,
            taskHistoryByTaskId[descendant.id] ?? [],
            todayDateKey,
          );
        const lastDone = streakSummary
          ? {
            dateKey: streakSummary.lastDoneDate,
            timestamp: streakSummary.lastDoneAt,
          }
          : getTaskHistoryLastDone(taskHistoryByTaskId[descendant.id] ?? [], todayDateKey);
        const lastHandled = streakSummary?.lastHandledDate !== undefined
          ? {
            dateKey: streakSummary.lastHandledDate,
            timestamp: streakSummary.lastHandledAt ?? null,
          }
          : getTaskHistoryLastHandled(taskHistoryByTaskId[descendant.id] ?? [], todayDateKey);

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
          isFocused: focusedTaskIdSet.has(descendant.id),
          issueTypes: adapter.getNode(descendant.id)?.issueTypes ?? [],
          lastDoneAt: lastDone?.timestamp ?? null,
          lastDoneDate: lastDone?.dateKey ?? null,
          lastHandledAt: lastHandled?.timestamp ?? null,
          lastHandledDate: lastHandled?.dateKey ?? null,
          linkLabel: descendant.external_link_label ?? "",
          linkUrl: descendant.external_link_url ?? "",
          missedStreak: historyStats.missedStreak,
          notes: descendant.notes ?? "",
          parentTaskId: descendant.parent_task_id,
          pinnedAt: descendant.pinned_at ?? null,
          priorityFlags: getChildTaskPriorityFlags(descendant),
          repeat: descendant.repeat_frequency,
          repeatDayOfMonth: descendant.repeat_day_of_month,
          repeatDaysOfWeek: descendant.repeat_days_of_week ?? [],
          repeatInterval: Math.max(1, descendant.repeat_interval ?? 1),
          repeatMonthlyMode: descendant.repeat_monthly_mode,
          repeatMonthlyOrdinal: descendant.repeat_monthly_ordinal,
          repeatMonthlyWeekday: descendant.repeat_monthly_weekday,
          scheduledOn: descendant.scheduled_on,
          status: taskDisplayStatusByTaskId[descendant.id] ?? descendant.status,
          storedStatus: descendant.status,
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

export function buildTaskAppStructuralData({
  diagnosticDetails,
  focusedTaskIds,
  taskHistoryByTaskId,
  taskHistoryStreakSummaryByTaskId,
  taskDisplayStatusByTaskId,
  tasks,
  todayDateKey,
}: {
  diagnosticDetails?: DevelopmentComputationDiagnostic;
  focusedTaskIds: readonly string[];
  taskHistoryByTaskId: Record<string, TaskHistory[]>;
  taskHistoryStreakSummaryByTaskId?: TaskHistoryStreakSummaryMap;
  taskDisplayStatusByTaskId?: TaskDisplayStatusByTaskId;
  tasks: Task[];
  todayDateKey: string;
}): TaskAppStructuralData {
  const startedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
  const hierarchy = buildTaskHierarchyAdapter(tasks);
  const result = {
    childTaskPreviewByParentTaskId: buildChildTaskPreviewLookup(tasks, focusedTaskIds, taskHistoryByTaskId, todayDateKey, hierarchy, taskHistoryStreakSummaryByTaskId, taskDisplayStatusByTaskId),
    hierarchy,
    taskHierarchyDiagnostics: buildTaskHierarchyDiagnostics(tasks, hierarchy),
    taskPrimaryVisibility: buildTaskPrimaryVisibility(tasks, hierarchy),
  };
  if (diagnosticDetails) logDevelopmentComputation(diagnosticDetails, performance.now() - startedAt);
  return result;
}

function matchesCanonicalTableColumnFilters(
  task: Task,
  memberships: readonly TaskListMembership[],
  filters: TaskTableColumnFilters,
  listNameById: ReadonlyMap<string, string>,
) {
  if (filters.priority.length > 0 && !filters.priority.includes(String(getTaskPriorityLevel(task)) as TaskPriorityLevelOption)) return false;
  if (
    filters.repeat.length > 0
    && !filters.repeat.includes(getTaskRepeatCategory(task.repeat_frequency, task.repeat_days_of_week, task.repeat_interval))
  ) return false;

  return Object.entries(filters.text).every(([columnId, rawQuery]) => {
    const query = rawQuery?.trim().toLowerCase();
    if (!query) return true;
    let value = "";
    if (columnId === "title") value = task.title;
    if (columnId === "lists") value = memberships.map((membership) => listNameById.get(membership.id) ?? membership.id).join(" ");
    if (columnId === "tags") value = (task.tags ?? []).join(" ");
    if (columnId === "link") value = [task.external_link_label, task.external_link_url].filter(Boolean).join(" ");
    if (columnId === "notes") value = task.notes ?? "";
    return value.toLowerCase().includes(query);
  });
}

export function buildStableCanonicalTaskIndex({
  availableTaskLists,
  diagnosticDetails,
  focusedTaskIds,
  milestoneSearchTokensByTaskId,
  taskHistoryByTaskId,
  taskListEvaluationContext,
  taskSubtasksByTaskId,
  tasks,
  todayDateKey,
  taskDisplayStatusByTaskId = {},
  hierarchy = buildTaskHierarchyAdapter(tasks),
}: {
  availableTaskLists: TaskListDefinition[];
  diagnosticDetails?: DevelopmentComputationDiagnostic;
  focusedTaskIds: string[];
  milestoneSearchTokensByTaskId?: ReadonlyMap<string, readonly string[]>;
  taskHistoryByTaskId: Record<string, TaskHistory[]>;
  taskHistoryStreakSummaryByTaskId?: TaskHistoryStreakSummaryMap;
  taskListEvaluationContext: TaskListEvaluationContext;
  taskSubtasksByTaskId: Record<string, DbTaskSubtask[]>;
  tasks: Task[];
  todayDateKey: string;
  taskDisplayStatusByTaskId?: TaskDisplayStatusByTaskId;
  hierarchy?: TaskHierarchyAdapter<Task>;
}): StableCanonicalTaskIndex {
  const startedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
  const validChildTaskIdSet = new Set(hierarchy.validChildTaskIds);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const inheritedManualMembershipsByTaskId: TaskListEvaluationContext["manualMembershipsByTaskId"] = {};
  const rootParentIdByTaskId = new Map<string, string>();
  const ancestorIdsByTaskId = new Map<string, string[]>();

  for (const task of tasks) {
    const ancestors = hierarchy.getParentChain(task.id);
    const rootParentId = ancestors.at(-1)?.id ?? task.id;
    rootParentIdByTaskId.set(task.id, rootParentId);
    ancestorIdsByTaskId.set(task.id, ancestors.map((ancestor) => ancestor.id));
    inheritedManualMembershipsByTaskId[task.id] = [
      ...(taskListEvaluationContext.manualMembershipsByTaskId[rootParentId] ?? []),
    ];
  }
  const resolvedTaskDisplayStatusByTaskId: TaskDisplayStatusByTaskId = {};
  const focusFilterFactsByTaskId: Record<string, ReturnType<typeof getTaskFocusFilterFacts>> = {};
  for (const task of tasks) {
    resolvedTaskDisplayStatusByTaskId[task.id] = taskDisplayStatusByTaskId[task.id] ?? task.status;
    focusFilterFactsByTaskId[task.id] = getTaskFocusFilterFacts(
      task,
      taskHistoryByTaskId[task.id] ?? [],
      todayDateKey,
    );
  }

  const evaluationContext: TaskListEvaluationContext = {
    ...taskListEvaluationContext,
    focusFilterFactsByTaskId,
    manualMembershipsByTaskId: inheritedManualMembershipsByTaskId,
    taskDisplayStatusByTaskId: resolvedTaskDisplayStatusByTaskId,
  };
  const taskListLookup = buildTaskListLookup(availableTaskLists);
  const listNameById = new Map(availableTaskLists.map((list) => [list.id, list.name]));
  const entityFactsById = new Map<string, CanonicalTaskEntityFact>();
  const taskListMembershipsByTaskId: Record<string, TaskListMembership[]> = {};

  for (const task of tasks) {
    const listMemberships = evaluateTaskListMemberships(
      task,
      availableTaskLists,
      evaluationContext,
      undefined,
      taskListLookup,
    );
    taskListMembershipsByTaskId[task.id] = listMemberships;
    const searchDocument = [
      task.title,
      ...(task.tags ?? []),
      ...(milestoneSearchTokensByTaskId?.get(task.id) ?? []),
      ...(taskSubtasksByTaskId[task.id] ?? []).map((subtask) => subtask.title),
    ].join("\n").toLowerCase();
    entityFactsById.set(task.id, {
      ancestorIds: ancestorIdsByTaskId.get(task.id) ?? [],
      displayStatus: resolvedTaskDisplayStatusByTaskId[task.id]!,
      id: task.id,
      listMemberships,
      rootParentId: rootParentIdByTaskId.get(task.id) ?? task.id,
      searchDocument,
      task,
    });
  }

  const result = {
    availableTaskLists,
    entityFactsById,
    focusedTaskIds,
    listNameById,
    taskById,
    taskListMembershipsByTaskId,
    todayDateKey,
    validChildTaskIdSet,
  };
  if (diagnosticDetails) logDevelopmentComputation(diagnosticDetails, performance.now() - startedAt);
  return result;
}

export function queryCanonicalTaskEntityProjection({
  index,
  normalizedSearchQuery,
  taskUiState,
}: {
  index: StableCanonicalTaskIndex;
  normalizedSearchQuery: string;
  taskUiState: TaskDerivedFilterState;
}): CanonicalTaskEntityProjection {
  const {
    availableTaskLists,
    entityFactsById,
    focusedTaskIds,
    listNameById,
    taskById,
    taskListMembershipsByTaskId,
    validChildTaskIdSet,
  } = index;
  const searchIsActive = normalizedSearchQuery.length > 0;
  const isPinnedBucket = taskUiState.selectedBucket === "pinned";
  const includeDescendants = taskUiState.includeStepsByView[taskUiState.view] === true;
  const hasTrashedAncestor = (taskId: string) => (
    (entityFactsById.get(taskId)?.ancestorIds ?? []).some((ancestorId) => taskById.get(ancestorId)?.status === "trashed")
  );
  const isInSelectedBaseScope = (task: Task) => (
    taskUiState.selectedBucket === "trash"
      ? isTaskInRecentTrash(task)
      : task.status !== "trashed" && !hasTrashedAncestor(task.id)
  );
  const isInPrimaryFacetBaseScope = (task: Task) => (
    task.status !== "trashed"
    && !hasTrashedAncestor(task.id)
    && isTaskVisibleInPrimaryViews(task)
  );

  const matchesSharedNonSearchFilters = (fact: CanonicalTaskEntityFact) => {
    const quickChecks = taskUiState.quickFilters.map((filter) => matchesTaskQuickFilter(fact.task, filter, focusedTaskIds, index.todayDateKey));
    const matchesQuick = quickChecks.length === 0
      || (taskUiState.matchAny ? quickChecks.some(Boolean) : quickChecks.every(Boolean));
    const matchesEnergy = taskUiState.energyFilters.length === 0
      || taskUiState.energyFilters.includes(fact.task.energy);
    return matchesQuick
      && matchesEnergy
      && matchesCanonicalTableColumnFilters(
        fact.task,
        fact.listMemberships,
        taskUiState.tableColumnFilters,
        listNameById,
      );
  };
  const matchesSelectedList = (fact: CanonicalTaskEntityFact) => {
    if (taskUiState.selectedBucket === "all") return isTaskVisibleInPrimaryViews(fact.task);
    if (taskUiState.selectedBucket === "archive") return isArchiveLikeTask(fact.task);
    if (taskUiState.selectedBucket === "trash") return isTaskInRecentTrash(fact.task);
    if (taskUiState.selectedBucket === "pinned") return isTaskVisibleInPrimaryViews(fact.task) && Boolean(fact.task.pinned_at);
    return isTaskVisibleInPrimaryViews(fact.task)
      && fact.listMemberships.some((membership) => membership.id === taskUiState.selectedBucket);
  };
  const matchesSelectedStatus = (fact: CanonicalTaskEntityFact) => (
    taskUiState.statusFilters.length === 0 || taskUiState.statusFilters.includes(fact.displayStatus)
  );

  const directSearchMatchedEntityIds = new Set<string>();
  const searchExpandedDescendantIds = new Set<string>();
  const hierarchyScopedEntityIds = new Set<string>();
  const selectedScopeCandidateIds = new Set<string>();
  const selectedScopeRootIds = new Set<string>();
  const primaryFacetCandidateIds = new Set<string>();
  for (const fact of entityFactsById.values()) {
    if (isInSelectedBaseScope(fact.task)) {
      hierarchyScopedEntityIds.add(fact.id);
      if (taskUiState.selectedBucket === "trash") {
        for (const ancestorId of fact.ancestorIds) hierarchyScopedEntityIds.add(ancestorId);
      }
    }
    if (isInSelectedBaseScope(fact.task) && matchesSelectedList(fact) && matchesSharedNonSearchFilters(fact)) {
      selectedScopeCandidateIds.add(fact.id);
      if (fact.id === fact.rootParentId) selectedScopeRootIds.add(fact.id);
    }
    if (isInPrimaryFacetBaseScope(fact.task) && matchesSharedNonSearchFilters(fact)) {
      primaryFacetCandidateIds.add(fact.id);
    }
  }
  for (const fact of entityFactsById.values()) {
    if (
      !isPinnedBucket
      && isInSelectedBaseScope(fact.task)
      && selectedScopeRootIds.has(fact.rootParentId)
      && matchesSharedNonSearchFilters(fact)
    ) {
      selectedScopeCandidateIds.add(fact.id);
    }
    if (searchIsActive && selectedScopeCandidateIds.has(fact.id) && fact.searchDocument.includes(normalizedSearchQuery)) {
      directSearchMatchedEntityIds.add(fact.id);
    }
  }

  const buildSearchResultUniverse = (
    candidateIds: ReadonlySet<string>,
    directMatchIds: ReadonlySet<string>,
    collectExpandedDescendants = false,
    preserveDirectPinnedChildren = false,
  ) => {
    if (!searchIsActive) {
      return new Set(Array.from(candidateIds).filter((id) => (
        includeDescendants
        || !validChildTaskIdSet.has(id)
        || (preserveDirectPinnedChildren && Boolean(entityFactsById.get(id)?.task.pinned_at))
      )));
    }
    const resultIds = new Set(Array.from(directMatchIds).filter((id) => candidateIds.has(id)));
    if (!includeDescendants) return resultIds;

    const directlyMatchingRootIds = new Set(Array.from(directMatchIds).filter((id) => (
      candidateIds.has(id) && !validChildTaskIdSet.has(id)
    )));
    for (const candidateId of candidateIds) {
      const fact = entityFactsById.get(candidateId);
      if (!fact || fact.id === fact.rootParentId || !directlyMatchingRootIds.has(fact.rootParentId)) continue;
      resultIds.add(candidateId);
      if (collectExpandedDescendants) searchExpandedDescendantIds.add(candidateId);
    }
    return resultIds;
  };

  const selectedDirectMatchIds = new Set(Array.from(directSearchMatchedEntityIds).filter((id) => (
    selectedScopeCandidateIds.has(id)
  )));
  const primaryDirectMatchIds = new Set(Array.from(entityFactsById.values())
    .filter((fact) => fact.searchDocument.includes(normalizedSearchQuery) && primaryFacetCandidateIds.has(fact.id))
    .map((fact) => fact.id));
  const selectedPreStatusResultIds = buildSearchResultUniverse(
    selectedScopeCandidateIds,
    selectedDirectMatchIds,
    true,
    isPinnedBucket,
  );
  const preStatusMatchedEntityIds = new Set<string>();
  const postStatusMatchedEntityIds = new Set<string>();
  const listFacetCounts: Record<string, number> = {};
  const statusFacetCounts = createEmptyTaskStatusCounts();

  for (const entityId of selectedPreStatusResultIds) {
    const fact = entityFactsById.get(entityId);
    if (!fact) continue;
    preStatusMatchedEntityIds.add(fact.id);
    statusFacetCounts[fact.displayStatus] += 1;
    if (matchesSelectedStatus(fact)) postStatusMatchedEntityIds.add(fact.id);
  }
  const buildPrimaryFacetVisibleIds = (candidateIds: Set<string>) => {
    const directIds = new Set(Array.from(primaryDirectMatchIds).filter((id) => candidateIds.has(id)));
    const resultIds = buildSearchResultUniverse(candidateIds, directIds);
    return new Set(Array.from(resultIds).filter((id) => {
      const fact = entityFactsById.get(id);
      return fact ? matchesSelectedStatus(fact) : false;
    }));
  };
  const primaryFacetVisibleEntityIds = buildPrimaryFacetVisibleIds(primaryFacetCandidateIds);
  const countPrimaryFacet = (facetId: string, candidateIds: Set<string>) => {
    listFacetCounts[facetId] = buildPrimaryFacetVisibleIds(candidateIds).size;
  };
  listFacetCounts.all = primaryFacetVisibleEntityIds.size;
  const pinnedFacetVisibleEntityIds = new Set(Array.from(primaryFacetCandidateIds).filter((id) => (
    Boolean(entityFactsById.get(id)?.task.pinned_at)
    && primaryDirectMatchIds.has(id)
    && matchesSelectedStatus(entityFactsById.get(id)!)
  )));
  listFacetCounts.pinned = pinnedFacetVisibleEntityIds.size;
  for (const list of availableTaskLists) {
    if (listFacetCounts[list.id] !== undefined) continue;
    countPrimaryFacet(list.id, new Set(Array.from(primaryFacetCandidateIds).filter((id) => (
      entityFactsById.get(id)?.listMemberships.some((membership) => membership.id === list.id) === true
    ))));
  }

  const contextAncestorIds = new Set<string>();
  const visibleRootParentIds = new Set<string>();
  const matchingDescendantIdsByRootParentId = new Map<string, Set<string>>();
  for (const entityId of postStatusMatchedEntityIds) {
    const fact = entityFactsById.get(entityId);
    if (!fact) continue;
    visibleRootParentIds.add(fact.rootParentId);
    if (fact.id !== fact.rootParentId) {
      const descendantIds = matchingDescendantIdsByRootParentId.get(fact.rootParentId) ?? new Set<string>();
      descendantIds.add(fact.id);
      matchingDescendantIdsByRootParentId.set(fact.rootParentId, descendantIds);
    }
    for (const ancestorId of fact.ancestorIds) {
      if (!postStatusMatchedEntityIds.has(ancestorId)) contextAncestorIds.add(ancestorId);
    }
  }
  const contextRootParentIds = new Set(
    Array.from(visibleRootParentIds).filter((rootId) => (
      !postStatusMatchedEntityIds.has(rootId)
      && (matchingDescendantIdsByRootParentId.get(rootId)?.size ?? 0) > 0
    )),
  );
  const hierarchyScopeKey = JSON.stringify({
    columnFilters: taskUiState.tableColumnFilters,
    energyFilters: taskUiState.energyFilters,
    includeDescendants,
    matchAny: taskUiState.matchAny,
    quickFilters: taskUiState.quickFilters,
    search: normalizedSearchQuery,
    selectedBucket: taskUiState.selectedBucket,
    statusFilters: taskUiState.statusFilters,
    view: taskUiState.view,
  });

  return {
    contextAncestorIds,
    contextRootParentIds,
    directSearchMatchedEntityIds,
    entityFactsById,
    hierarchyScopedEntityIds,
    hierarchyScopeKey,
    listFacetCounts,
    matchingDescendantIdsByRootParentId,
    postStatusMatchedEntityIds,
    preStatusMatchedEntityIds,
    primaryFacetVisibleEntityIds,
    searchExpandedDescendantIds,
    statusFacetCounts,
    taskListMembershipsByTaskId,
    visibleRootParentIds,
  };
}

export function buildCanonicalTaskEntityProjection(input: {
  availableTaskLists: TaskListDefinition[];
  focusedTaskIds: string[];
  milestoneSearchTokensByTaskId?: ReadonlyMap<string, readonly string[]>;
  normalizedSearchQuery: string;
  taskHistoryByTaskId: Record<string, TaskHistory[]>;
  taskListEvaluationContext: TaskListEvaluationContext;
  taskSubtasksByTaskId: Record<string, DbTaskSubtask[]>;
  taskDisplayStatusByTaskId?: TaskDisplayStatusByTaskId;
  taskUiState: TaskDerivedFilterState;
  tasks: Task[];
  todayDateKey: string;
  hierarchy?: TaskHierarchyAdapter<Task>;
}) {
  const { normalizedSearchQuery, taskUiState, ...stableInputs } = input;
  return queryCanonicalTaskEntityProjection({
    index: buildStableCanonicalTaskIndex(stableInputs),
    normalizedSearchQuery,
    taskUiState,
  });
}

export function buildTaskAppWorkspaceFacts({
  availableTaskNotes,
  bucketContext,
  focusedTaskIds,
  structuralData,
  stableCanonicalTaskIndex,
  tasks,
  taskDisplayStatusByTaskId = {},
}: {
  availableTaskNotes: TaskEditorLinkedNote[];
  bucketContext: TaskBucketContext;
  focusedTaskIds: string[];
  structuralData: TaskAppStructuralData;
  stableCanonicalTaskIndex: StableCanonicalTaskIndex;
  tasks: Task[];
  taskDisplayStatusByTaskId?: TaskDisplayStatusByTaskId;
}): TaskAppWorkspaceFacts {
  const hiddenChildIds = new Set(structuralData.taskPrimaryVisibility.primaryHiddenChildTaskIds);
  const primaryTasks = tasks.filter((task) => !hiddenChildIds.has(task.id));
  const archiveTasks = primaryTasks.filter((task) => isArchiveLikeTask(task));
  const recentlyDeletedTasks = primaryTasks.filter((task) => isTaskInRecentTrash(task));
  const visibleTasks: Task[] = [];
  const activeTasks: Task[] = [];
  const doneTasks: Task[] = [];
  const overdueTasks: Task[] = [];
  const todayTasks: Task[] = [];
  const urgentFlaggedTasks: Task[] = [];
  const lowEnergyTasks: Task[] = [];
  const tags = new Set<string>();
  const visibleTaskBaseFactsByTaskId: Record<string, VisibleTaskBaseFacts> = {};
  const taskStatusCounts = primaryTasks.reduce<Record<TaskDisplayStatus, number>>((counts, task) => {
    counts[taskDisplayStatusByTaskId[task.id] ?? task.status] += 1;
    if (!isTaskVisibleInPrimaryViews(task)) return counts;
    visibleTasks.push(task);
    const facts = buildVisibleTaskBaseFacts(task, bucketContext.todayDateKey ?? todayISO());
    visibleTaskBaseFactsByTaskId[task.id] = facts;
    for (const tag of task.tags ?? []) tags.add(tag);
    if (facts.isOpenTask) {
      activeTasks.push(task);
      if (facts.isOverdueTask) overdueTasks.push(task);
      if (facts.isUrgentTask) urgentFlaggedTasks.push(task);
      if (facts.isLowEnergyTask && lowEnergyTasks.length < 4) lowEnergyTasks.push(task);
      if (facts.isTodayTask) todayTasks.push(task);
    }
    if (facts.isDoneTask) doneTasks.push(task);
    return counts;
  }, createEmptyTaskStatusCounts());
  const taskLinkedNotesByTaskId = availableTaskNotes.reduce<Record<string, TaskEditorLinkedNote[]>>((byTaskId, note) => {
    for (const taskId of note.linked_task_ids) (byTaskId[taskId] ??= []).push(note);
    return byTaskId;
  }, {});
  const baseListCounts: Record<string, number> = {};
  const listsById = new Map<string, Task[]>();
  for (const task of visibleTasks) {
    for (const membership of stableCanonicalTaskIndex.taskListMembershipsByTaskId[task.id] ?? []) {
      baseListCounts[membership.id] = (baseListCounts[membership.id] ?? 0) + 1;
      const members = listsById.get(membership.id) ?? [];
      members.push(task);
      listsById.set(membership.id, members);
    }
  }
  const uniquePlanningIds = new Set<string>();
  const inboxTasks = listsById.get("inbox") ?? [];
  const laterTasks = listsById.get("later") ?? [];
  const quickWinTasks = listsById.get("quick_wins") ?? [];
  const planningCandidates = sortTasksForCockpit([
    ...inboxTasks,
    ...laterTasks.filter((task) => !inboxTasks.some((candidate) => candidate.id === task.id)).slice(0, 8),
    ...quickWinTasks.filter((task) => !inboxTasks.some((candidate) => candidate.id === task.id)).slice(0, 6),
  ], bucketContext).filter((task) => {
    if (uniquePlanningIds.has(task.id)) return false;
    uniquePlanningIds.add(task.id);
    return true;
  }).slice(0, 5);
  const focusPlannerTasks = sortTasksForCockpit(visibleTasks.filter((task) => {
    const memberships = stableCanonicalTaskIndex.taskListMembershipsByTaskId[task.id] ?? [];
    return isTaskOpen(task) && memberships.some((membership) => ["today", "priority_5", "quick_wins", "focus"].includes(membership.id));
  }), bucketContext);
  const focusedTaskIdSet = new Set(focusedTaskIds);
  const todayQueueTaskCount = primaryTasks.filter((task) => (
    isTaskOpen(task)
    && (visibleTaskBaseFactsByTaskId[task.id]?.isTodayTask || focusedTaskIdSet.has(task.id) || getTaskPriorityLevel(task) === 5)
  )).length;
  return {
    activeTasks,
    allTaskTags: [...tags].sort(),
    archiveTasks,
    baseListCounts,
    doneTasks,
    focusPlannerTasks,
    lowEnergyTasks,
    overdueTasks,
    planningCandidates,
    primaryTasks,
    recentlyDeletedTasks,
    taskLinkedNotesByTaskId,
    taskStatusCounts,
    todayQueueTaskCount,
    todayTasks,
    urgentTasks: urgentFlaggedTasks.slice(0, 6),
    visibleTaskBaseFactsByTaskId,
    visibleTasks,
  };
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
  milestoneSearchTokensByTaskId?: ReadonlyMap<string, readonly string[]>;
  milestoneTaskIds?: ReadonlySet<string>;
  taskActualTimeEntryTaskId: string | null;
  taskEditorTaskId: string | null;
  taskGridLayout: TaskGridItem[];
  taskGridWidgetTypes: string[];
  taskHistoryByTaskId: Record<string, TaskHistory[]>;
  taskHistoryStreakSummaryByTaskId?: TaskHistoryStreakSummaryMap;
  todayDateKey: string;
  taskListEvaluationContext: TaskListEvaluationContext;
  taskSubtasksByTaskId: Record<string, DbTaskSubtask[]>;
  taskUiState: TaskDerivedFilterState;
  taskDisplayStatusByTaskId?: TaskDisplayStatusByTaskId;
  tasks: Task[];
  structuralData?: TaskAppStructuralData;
  stableCanonicalTaskIndex?: StableCanonicalTaskIndex;
  diagnosticDetails?: DevelopmentComputationDiagnostic;
  workspaceFacts?: TaskAppWorkspaceFacts;
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
  milestoneSearchTokensByTaskId,
  milestoneTaskIds,
  taskActualTimeEntryTaskId,
  taskEditorTaskId,
  taskGridLayout,
  taskGridWidgetTypes,
  taskHistoryByTaskId,
  taskHistoryStreakSummaryByTaskId,
  todayDateKey,
  taskListEvaluationContext,
  taskSubtasksByTaskId,
  taskUiState,
  taskDisplayStatusByTaskId = {},
  tasks,
  structuralData,
  stableCanonicalTaskIndex,
  diagnosticDetails,
  workspaceFacts,
}: ComputeTaskAppDerivedDataInput) {
  if (tasks.length === 0) {
    const emptyStructuralData = structuralData ?? buildTaskAppStructuralData({
      focusedTaskIds,
      taskHistoryByTaskId,
      taskHistoryStreakSummaryByTaskId,
      taskDisplayStatusByTaskId,
      tasks,
      todayDateKey,
    });
    const emptyIndex = stableCanonicalTaskIndex ?? buildStableCanonicalTaskIndex({
      availableTaskLists,
      focusedTaskIds,
      milestoneSearchTokensByTaskId,
      taskHistoryByTaskId,
      taskListEvaluationContext,
      taskSubtasksByTaskId,
      taskDisplayStatusByTaskId,
      tasks,
      todayDateKey,
      hierarchy: emptyStructuralData.hierarchy,
    });
    const canonicalEntityProjection = queryCanonicalTaskEntityProjection({
      availableTaskLists,
      index: emptyIndex,
      normalizedSearchQuery: deferredSearchQuery.toLowerCase(),
      taskUiState,
    });
    const emptyTasks: Task[] = [];
    return {
      activeTasks: emptyTasks,
      allTaskTags: [],
      archiveFilteredTasksSorted: emptyTasks,
      canonicalEntityProjection,
      canonicalMatchingChildTaskIds: new Set<string>(),
      canonicalVisibleRootTasksSorted: emptyTasks,
      childTaskPreviewByParentTaskId: {},
      collections: {
        filteredActiveTasks: emptyTasks, filteredDoneTasks: emptyTasks, filteredFocusTasks: emptyTasks,
        filteredLowEnergyTasks: emptyTasks, filteredOverdueTasks: emptyTasks, filteredTodayTasks: emptyTasks,
        filteredUrgentTasks: emptyTasks, inboxTasks: emptyTasks, laterTasks: emptyTasks, missedTasks: emptyTasks,
        quickWinTasks: emptyTasks, recurringTasks: emptyTasks, waitingTasks: emptyTasks,
      },
      doneTasks: emptyTasks,
      duplicateTitleGroups: [],
      filteredTasksSorted: emptyTasks,
      focusPlannerTasks: emptyTasks,
      listColumnPickerColumns: [
        ...listVisibleColumns,
        ...listColumnPickerOrder.filter((columnId) => !listVisibleColumns.includes(columnId)),
      ],
      lowEnergyTasks: emptyTasks,
      manualListOptions: [],
      milestoneFilteredTasksSorted: emptyTasks,
      missingGridWidgetTypes: [],
      momentumPercent: 0,
      overdueTasks: emptyTasks,
      planningCandidates: emptyTasks,
      searchMatchedChildTaskIds: new Set<string>(),
      searchMatchedParentTaskIds: [],
      searchMatchedStepParentTaskIds: new Set<string>(),
      selectedTaskForEditor: null,
      statusCountScopeArchiveTasksSorted: emptyTasks,
      statusCountScopeTasksSorted: emptyTasks,
      statusCountScopeTrashTasksSorted: emptyTasks,
      statusMatchedChildTaskIds: new Set<string>(),
      statusMatchedStepParentTaskIds: new Set<string>(),
      tableStatusCounts: canonicalEntityProjection.statusFacetCounts,
      taskForActualTimeEntry: null,
      taskHierarchyDiagnostics: emptyStructuralData.taskHierarchyDiagnostics,
      taskLinkedNotesByTaskId: {},
      taskListMembershipsByTaskId: {},
      taskPrimaryVisibility: emptyStructuralData.taskPrimaryVisibility,
      taskStatusCounts: createEmptyTaskStatusCounts(),
      todayQueueTaskCount: 0,
      todayTasks: emptyTasks,
      trashFilteredTasksSorted: emptyTasks,
      urgentTasks: emptyTasks,
      visibleListCounts: {},
    };
  }
  const totalStartedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
  const availableRuleCount = availableTaskLists.reduce((count, list) => count + (list.rules?.rules.length ?? 0), 0);

  const hierarchyDiagnosticsStartedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
  const resolvedStructuralData = structuralData ?? buildTaskAppStructuralData({
    focusedTaskIds,
    taskHistoryByTaskId,
    taskHistoryStreakSummaryByTaskId,
    taskDisplayStatusByTaskId,
    tasks,
    todayDateKey,
  });
  const { childTaskPreviewByParentTaskId, hierarchy, taskHierarchyDiagnostics, taskPrimaryVisibility } = resolvedStructuralData;
  const primaryHiddenChildTaskIds = new Set(taskPrimaryVisibility.primaryHiddenChildTaskIds);
  const normalizedSearchQuery = deferredSearchQuery.toLowerCase();
  logTaskDeriveStep("hierarchy preparation", hierarchyDiagnosticsStartedAt, {
    childTasks: taskHierarchyDiagnostics.childTaskIds.length,
    childTaskPreviewParents: Object.keys(childTaskPreviewByParentTaskId).length,
    invalidTasks: taskHierarchyDiagnostics.invalidTaskIds.length,
    maxDepth: taskHierarchyDiagnostics.maxDepth,
    primaryHiddenChildren: taskPrimaryVisibility.primaryHiddenChildTaskIds.length,
    tasks: taskHierarchyDiagnostics.totalTaskCount,
  });
  const canonicalProjectionStartedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
  const canonicalIndex = stableCanonicalTaskIndex ?? buildStableCanonicalTaskIndex({
    availableTaskLists,
    focusedTaskIds,
    milestoneSearchTokensByTaskId,
    taskHistoryByTaskId,
    taskListEvaluationContext,
    taskSubtasksByTaskId,
    taskDisplayStatusByTaskId,
    tasks,
    todayDateKey,
    hierarchy,
  });
  const canonicalEntityProjection = queryCanonicalTaskEntityProjection({
    index: canonicalIndex,
    normalizedSearchQuery,
    taskUiState,
  });
  logTaskDeriveStep("lightweight canonical query", canonicalProjectionStartedAt, {
    ...(diagnosticDetails ?? {}),
    computationName: "task view query",
    entities: canonicalEntityProjection.entityFactsById.size,
    matchedEntities: canonicalEntityProjection.postStatusMatchedEntityIds.size,
    searchLength: deferredSearchQuery.length,
  });

  const resolvedWorkspaceFacts = workspaceFacts ?? buildTaskAppWorkspaceFacts({
    availableTaskNotes,
    bucketContext,
    focusedTaskIds,
    stableCanonicalTaskIndex: canonicalIndex,
    structuralData: resolvedStructuralData,
    taskDisplayStatusByTaskId,
    tasks,
  });
  const {
    activeTasks,
    allTaskTags,
    archiveTasks,
    doneTasks,
    lowEnergyTasks,
    overdueTasks,
    primaryTasks,
    recentlyDeletedTasks,
    taskLinkedNotesByTaskId,
    taskStatusCounts,
    todayTasks,
    urgentTasks,
    visibleTaskBaseFactsByTaskId,
    visibleTasks,
  } = resolvedWorkspaceFacts;
  logTaskDeriveStep("reuse stable workspace facts", totalStartedAt, {
    activeTasks: activeTasks.length,
    doneTasks: doneTasks.length,
    statusBuckets: Object.keys(taskStatusCounts).length,
    tags: allTaskTags.length,
    tasks: primaryTasks.length,
  });

  const matchesTaskFilters = (task: Task, options: { ignoreStatus?: boolean } = {}) => {
    const ignoreStatus = options.ignoreStatus ?? false;
    const includeStepsInStatus = taskUiState.includeStepsByView?.[taskUiState.view] === true;
    const quickChecks = taskUiState.quickFilters.map((filter) => matchesTaskQuickFilter(task, filter, focusedTaskIds, todayDateKey));
    const matchesQuickFilters = quickChecks.length === 0
      ? true
      : taskUiState.matchAny
        ? quickChecks.some(Boolean)
        : quickChecks.every(Boolean);
    const matchesEnergy = taskUiState.energyFilters.length === 0 || taskUiState.energyFilters.includes(task.energy);
    if (!(matchesQuickFilters && matchesEnergy)) {
      return false;
    }

    const searchIsActive = normalizedSearchQuery.length > 0;
    const ownSearchMatch = !searchIsActive || matchesNormalizedSearchValue(task.title, normalizedSearchQuery)
      || matchesNormalizedSearchValues(task.tags, normalizedSearchQuery)
      || matchesNormalizedSearchValues(milestoneSearchTokensByTaskId?.get(task.id), normalizedSearchQuery);
    const sourceSubtaskTitleMatch = (taskSubtasksByTaskId[task.id] ?? []).some((subtask) => (
      matchesNormalizedSearchValue(subtask.title, normalizedSearchQuery)
    ));
    const childItems = childTaskPreviewByParentTaskId[task.id]?.items ?? [];
    const matchingChildSearchItems = searchIsActive
      ? childItems.filter((item) => (
        matchesNormalizedSearchValue(item.title, normalizedSearchQuery)
        || matchesNormalizedSearchValues(item.tags, normalizedSearchQuery)
      ))
      : childItems;

    const searchMatchesTaskGroup = ownSearchMatch || sourceSubtaskTitleMatch || matchingChildSearchItems.length > 0;
    if (ignoreStatus || taskUiState.statusFilters.length === 0) {
      return searchMatchesTaskGroup;
    }

    const ownDisplayStatus = taskDisplayStatusByTaskId[task.id] ?? task.status;
    const matchesOwnStatus = taskUiState.statusFilters.includes(ownDisplayStatus);
    const matchingChildStatusItems = includeStepsInStatus
      ? matchingChildSearchItems.filter((item) => taskUiState.statusFilters.includes(item.status))
      : [];
    const ownEntityMatches = matchesOwnStatus && (ownSearchMatch || sourceSubtaskTitleMatch);
    if (ownEntityMatches || matchingChildStatusItems.length > 0) {
      return true;
    }
    return false;
  };

  const matchesTaskStructuredFilters = (task: Task) => {
    const quickChecks = taskUiState.quickFilters.map((filter) => matchesTaskQuickFilter(task, filter, focusedTaskIds, todayDateKey));
    const matchesQuickFilters = quickChecks.length === 0
      ? true
      : taskUiState.matchAny
        ? quickChecks.some(Boolean)
        : quickChecks.every(Boolean);
    const matchesStatus = taskUiState.statusFilters.length === 0 || taskUiState.statusFilters.includes(taskDisplayStatusByTaskId[task.id] ?? task.status);
    const matchesEnergy = taskUiState.energyFilters.length === 0 || taskUiState.energyFilters.includes(task.energy);
    return matchesQuickFilters && matchesStatus && matchesEnergy;
  };

  const visibleFilteringStartedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
  const filteredVisibleTasks = activePage === "Tasks"
    ? visibleTasks.filter(matchesTaskFilters)
    : EMPTY_TASKS;
  const statusCountScopeTasksSorted = activePage === "Tasks"
    ? sortTasksForCockpit(visibleTasks.filter((task) => matchesTaskFilters(task, { ignoreStatus: true })), bucketContext)
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
  const milestoneFilteredTasksSorted = activePage === "Tasks"
    ? sortTasksForCockpit(primaryTasks.filter((task) => (
      milestoneTaskIds?.has(task.id)
      && task.status !== "trashed"
      && matchesTaskFilters(task)
    )), bucketContext)
    : EMPTY_TASKS;
  logTaskDeriveStep("visible task sorting", visibleSortingStartedAt, {
    matchingTasks: filteredTasksSorted.length,
    tasks: filteredVisibleTasks.length,
  });

  const archiveFilteringStartedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
  const filteredArchiveTasks = activePage === "Tasks"
    ? archiveTasks.filter(matchesTaskFilters)
    : EMPTY_TASKS;
  const statusCountScopeArchiveTasksSorted = activePage === "Tasks"
    ? sortTasksForCockpit(archiveTasks.filter((task) => matchesTaskFilters(task, { ignoreStatus: true })), bucketContext)
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
  const statusCountScopeTrashTasksSorted = activePage === "Tasks"
    ? sortTasksForCockpit(recentlyDeletedTasks.filter((task) => matchesTaskFilters(task, { ignoreStatus: true })), bucketContext)
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

  const membershipStartedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
  const canReuseMembershipScanForVisibleCounts = false;
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
    : canonicalEntityProjection.taskListMembershipsByTaskId;
  logTaskDeriveStep("smart-list membership evaluation", membershipStartedAt, {
    lists: availableTaskLists.length,
    matchedMemberships: Object.values(taskListMembershipsByTaskId).reduce((count, memberships) => count + memberships.length, 0),
    rules: availableRuleCount,
    tasks: Object.keys(taskListMembershipsByTaskId).length,
  });

  const visibleCountStartedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
  if (activePage === "Tasks" && !canReuseMembershipScanForVisibleCounts) {
    for (const task of filteredTasksSorted) {
      const memberships = taskListMembershipsByTaskId[task.id] ?? [];
      const baseFacts = visibleTaskBaseFactsByTaskId[task.id] ?? buildVisibleTaskBaseFacts(task, todayDateKey);

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
  if (activePage === "Tasks") {
    visibleListCounts.milestones = milestoneFilteredTasksSorted.length;
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

  const planningCandidates = resolvedWorkspaceFacts.planningCandidates;
  logTaskDeriveStep("reuse planning candidate facts", totalStartedAt, {
    inboxTasks: collections.inboxTasks.length,
    laterTasks: collections.laterTasks.length,
    planningCandidates: planningCandidates.length,
    quickWinTasks: collections.quickWinTasks.length,
    tasks: filteredTasksSorted.length,
  });

  const focusPlannerTasks = resolvedWorkspaceFacts.focusPlannerTasks;
  logTaskDeriveStep("reuse Focus planner facts", totalStartedAt, {
    focusPlannerTasks: focusPlannerTasks.length,
    tasks: filteredTasksSorted.length,
  });
  const todayQueueTaskCount = resolvedWorkspaceFacts.todayQueueTaskCount;

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
  const manualListOptions = activePage !== "Tasks"
    ? []
    : availableTaskLists
      .filter(isManualTaskListDestination)
      .map((list) => ({
        count: canonicalEntityProjection.listFacetCounts[list.id] ?? 0,
        label: list.name,
        value: list.id,
      }));
  const missingGridWidgetTypes = getMissingTaskGridWidgetTypes(taskGridLayout, taskGridWidgetTypes);
  logTaskDeriveStep("custom/manual list handling and final assembly", listAssemblyStartedAt, {
    manualListOptions: manualListOptions.length,
    missingGridWidgetTypes: missingGridWidgetTypes.length,
    tasks: tasks.length,
  });
  logTaskDeriveStep("total compute", totalStartedAt, {
    ...(diagnosticDetails ?? {}),
    computationName: "complete task derivation",
    lists: availableTaskLists.length,
    rules: availableRuleCount,
    tasks: tasks.length,
  });
  if (diagnosticDetails) logDevelopmentComputation(diagnosticDetails, performance.now() - totalStartedAt);
  const canonicalVisibleRootTasksSorted = activePage === "Tasks"
    ? sortTasksForCockpit(
      tasks.filter((task) => canonicalEntityProjection.visibleRootParentIds.has(task.id)),
      bucketContext,
    )
    : EMPTY_TASKS;
  const hasCanonicalMatchingBranch = normalizedSearchQuery.length > 0
    || taskUiState.statusFilters.length > 0
    || taskUiState.energyFilters.length > 0
    || taskUiState.quickFilters.length > 0
    || canonicalEntityProjection.contextRootParentIds.size > 0
    || taskUiState.tableColumnFilters.priority.length > 0
    || taskUiState.tableColumnFilters.repeat.length > 0
    || Object.values(taskUiState.tableColumnFilters.text).some((value) => Boolean(value?.trim()));
  const canonicalMatchingChildTaskIds = hasCanonicalMatchingBranch
    ? Array.from(
      canonicalEntityProjection.matchingDescendantIdsByRootParentId.values(),
    ).flatMap((descendantIds) => Array.from(descendantIds))
    : [];
  const canonicalMatchingBranchRootParentIds = hasCanonicalMatchingBranch
    ? Array.from(canonicalEntityProjection.visibleRootParentIds)
    : [];
  const canonicalSearchMatchedChildTaskIds = canonicalMatchingChildTaskIds;
  const canonicalSearchMatchedParentTaskIds = Array.from(
    canonicalEntityProjection.directSearchMatchedEntityIds,
  ).filter((id) => !primaryHiddenChildTaskIds.has(id));
  const canonicalSearchMatchedStepParentTaskIds = canonicalMatchingBranchRootParentIds;
  const canonicalChildTaskPreviewByParentTaskId = activePage !== "Tasks"
    ? childTaskPreviewByParentTaskId
    : Object.fromEntries(Object.entries(childTaskPreviewByParentTaskId).map(([rootId, group]) => {
      const hierarchyVisibleIds = taskUiState.selectedBucket === "pinned"
        ? new Set([
          ...canonicalEntityProjection.postStatusMatchedEntityIds,
          ...canonicalEntityProjection.contextAncestorIds,
        ])
        : canonicalEntityProjection.hierarchyScopedEntityIds;
      const items = group.items.filter((item) => hierarchyVisibleIds.has(item.id));
      return [rootId, {
        items,
        summary: {
          descendantCount: items.length,
          directChildCount: items.filter((item) => item.depth === 1).length,
          hasInvalidDescendants: items.some((item) => item.issueTypes.length > 0),
          invalidChildLinkCount: items.filter((item) => item.depth === 1 && item.issueTypes.length > 0).length,
        },
      }];
    }));

  return {
    activeTasks,
    allTaskTags,
    childTaskPreviewByParentTaskId: canonicalChildTaskPreviewByParentTaskId,
    canonicalEntityProjection,
    canonicalMatchingChildTaskIds,
    canonicalVisibleRootTasksSorted,
    collections,
    duplicateTitleGroups,
    doneTasks,
    focusPlannerTasks,
    listColumnPickerColumns,
    lowEnergyTasks,
    manualListOptions,
    milestoneFilteredTasksSorted,
    missingGridWidgetTypes,
    momentumPercent,
    overdueTasks,
    planningCandidates,
    filteredTasksSorted,
    statusCountScopeTasksSorted,
    statusCountScopeArchiveTasksSorted,
    statusCountScopeTrashTasksSorted,
    searchMatchedStepParentTaskIds: canonicalSearchMatchedStepParentTaskIds,
    searchMatchedChildTaskIds: canonicalSearchMatchedChildTaskIds,
    searchMatchedParentTaskIds: canonicalSearchMatchedParentTaskIds,
    statusMatchedChildTaskIds: canonicalMatchingChildTaskIds,
    statusMatchedStepParentTaskIds: canonicalMatchingBranchRootParentIds,
    archiveFilteredTasksSorted,
    trashFilteredTasksSorted,
    selectedTaskForEditor,
    taskForActualTimeEntry,
    taskHierarchyDiagnostics,
    taskPrimaryVisibility,
    taskLinkedNotesByTaskId,
    taskListMembershipsByTaskId: canonicalEntityProjection.taskListMembershipsByTaskId,
    taskStatusCounts,
    todayTasks,
    todayQueueTaskCount,
    urgentTasks,
    tableStatusCounts: canonicalEntityProjection.statusFacetCounts,
    visibleListCounts: resolvedWorkspaceFacts.baseListCounts,
  };
}
