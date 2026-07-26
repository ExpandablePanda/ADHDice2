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
import { computeTaskSpecificHistoryStats, getTaskFocusFilterFacts, getTaskHistoryLastDone } from "@/lib/task-history";
import type { TaskEditorLinkedNote } from "@/lib/task-notes";
import type {
  TaskBucketContext,
} from "@/lib/task-buckets";
import type { TaskTableColumnFilters, TaskUiState } from "@/lib/task-ui-state";
import type {
  TaskListDefinition,
  TaskListEvaluationContext,
  TaskListMembership,
} from "@/lib/task-lists";
import { buildTaskListLookup, evaluateTaskListMemberships, isManualTaskListDestination, isPrimaryRailTaskListEligible } from "@/lib/task-lists";
import { isTaskFinished, isTaskOpen, isTaskUrgent, isTaskVisibleInPrimaryViews } from "@/lib/task-buckets";
import { isDueToday, isOverdue } from "@/lib/task-cockpit";
import { formatTaskPriorityLevel, getTaskPriorityLevel, type TaskPriorityLevelOption } from "@/lib/task-priority";
import { isTaskInRecentTrash } from "@/lib/task-trash";
import { normalizeTitleForDuplicateDetection } from "@/lib/task-search";

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

export type CanonicalTaskEntityFact = {
  ancestorIds: string[];
  displayStatus: TaskStatus;
  id: string;
  listMemberships: TaskListMembership[];
  rootParentId: string;
  searchMatch: boolean;
  task: Task;
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
  searchExpandedDescendantIds: Set<string>;
  statusFacetCounts: Record<TaskStatus, number>;
  taskListMembershipsByTaskId: Record<string, TaskListMembership[]>;
  visibleRootParentIds: Set<string>;
};

function createEmptyTaskStatusCounts(): Record<TaskStatus, number> {
  return {
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
  options: { childTaskIds?: ReadonlySet<string>; includeSteps?: boolean; parentTaskIds?: ReadonlySet<string> } = {},
) {
  const counts = createEmptyTaskStatusCounts();
  for (const task of parentTasks) {
    if (!options.parentTaskIds || options.parentTaskIds.has(task.id)) {
      counts[getTaskDisplayStatusWithHistory(task, taskHistoryByTaskId[task.id] ?? [], todayDateKey)] += 1;
    }
    if (options.includeSteps === false) continue;
    for (const item of childTaskPreviewByParentTaskId[task.id]?.items ?? []) {
      if (options.childTaskIds && !options.childTaskIds.has(item.id)) continue;
      counts[item.status] += 1;
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

function getChildTaskPriorityFlags(task: Task): ChildTaskPreviewPriority[] {
  return [formatTaskPriorityLevel(getTaskPriorityLevel(task))];
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
        const lastDone = getTaskHistoryLastDone(taskHistoryByTaskId[descendant.id] ?? []);

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
          linkLabel: descendant.external_link_label ?? "",
          linkUrl: descendant.external_link_url ?? "",
          missedStreak: historyStats.missedStreak,
          notes: descendant.notes ?? "",
          parentTaskId: descendant.parent_task_id,
          priorityFlags: getChildTaskPriorityFlags(descendant),
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

function matchesCanonicalTableColumnFilters(
  task: Task,
  memberships: readonly TaskListMembership[],
  filters: TaskTableColumnFilters,
  listNameById: ReadonlyMap<string, string>,
) {
  if (filters.priority.length > 0 && !filters.priority.includes(String(getTaskPriorityLevel(task)) as TaskPriorityLevelOption)) return false;
  if (filters.repeat.length > 0 && !filters.repeat.includes(task.repeat_frequency)) return false;

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

export function buildCanonicalTaskEntityProjection({
  availableTaskLists,
  focusedTaskIds,
  milestoneSearchTokensByTaskId,
  normalizedSearchQuery,
  taskHistoryByTaskId,
  taskListEvaluationContext,
  taskSubtasksByTaskId,
  taskUiState,
  tasks,
  todayDateKey,
}: {
  availableTaskLists: TaskListDefinition[];
  focusedTaskIds: string[];
  milestoneSearchTokensByTaskId?: ReadonlyMap<string, readonly string[]>;
  normalizedSearchQuery: string;
  taskHistoryByTaskId: Record<string, TaskHistory[]>;
  taskListEvaluationContext: TaskListEvaluationContext;
  taskSubtasksByTaskId: Record<string, DbTaskSubtask[]>;
  taskUiState: TaskDerivedFilterState;
  tasks: Task[];
  todayDateKey: string;
}): CanonicalTaskEntityProjection {
  const hierarchy = buildTaskHierarchyAdapter(tasks);
  const searchIsActive = normalizedSearchQuery.length > 0;
  const includeDescendants = taskUiState.includeStepsByView[taskUiState.view] === true;
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
  const hasTrashedAncestor = (taskId: string) => (
    (ancestorIdsByTaskId.get(taskId) ?? []).some((ancestorId) => taskById.get(ancestorId)?.status === "trashed")
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

  const taskDisplayStatusByTaskId: Record<string, TaskStatus> = {};
  const focusFilterFactsByTaskId: Record<string, ReturnType<typeof getTaskFocusFilterFacts>> = {};
  for (const task of tasks) {
    taskDisplayStatusByTaskId[task.id] = getTaskDisplayStatusWithHistory(
      task,
      taskHistoryByTaskId[task.id] ?? [],
      todayDateKey,
    );
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
    taskDisplayStatusByTaskId,
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
    const searchMatch = !searchIsActive
      || matchesNormalizedSearchValue(task.title, normalizedSearchQuery)
      || matchesNormalizedSearchValues(task.tags, normalizedSearchQuery)
      || matchesNormalizedSearchValues(milestoneSearchTokensByTaskId?.get(task.id), normalizedSearchQuery)
      || (taskSubtasksByTaskId[task.id] ?? []).some((subtask) => (
        matchesNormalizedSearchValue(subtask.title, normalizedSearchQuery)
      ));
    entityFactsById.set(task.id, {
      ancestorIds: ancestorIdsByTaskId.get(task.id) ?? [],
      displayStatus: taskDisplayStatusByTaskId[task.id],
      id: task.id,
      listMemberships,
      rootParentId: rootParentIdByTaskId.get(task.id) ?? task.id,
      searchMatch,
      task,
    });
  }

  const matchesSharedNonSearchFilters = (fact: CanonicalTaskEntityFact) => {
    const quickChecks = taskUiState.quickFilters.map((filter) => matchesTaskQuickFilter(fact.task, filter, focusedTaskIds));
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
      if (searchIsActive && fact.searchMatch) directSearchMatchedEntityIds.add(fact.id);
    }
    if (isInPrimaryFacetBaseScope(fact.task) && matchesSharedNonSearchFilters(fact)) {
      primaryFacetCandidateIds.add(fact.id);
    }
  }

  const buildSearchResultUniverse = (
    candidateIds: ReadonlySet<string>,
    directMatchIds: ReadonlySet<string>,
    collectExpandedDescendants = false,
  ) => {
    if (!searchIsActive) {
      return new Set(Array.from(candidateIds).filter((id) => includeDescendants || !validChildTaskIdSet.has(id)));
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
    .filter((fact) => fact.searchMatch && primaryFacetCandidateIds.has(fact.id))
    .map((fact) => fact.id));
  const selectedPreStatusResultIds = buildSearchResultUniverse(
    selectedScopeCandidateIds,
    selectedDirectMatchIds,
    true,
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
  const countPrimaryFacet = (facetId: string, candidateIds: Set<string>) => {
    const directIds = new Set(Array.from(primaryDirectMatchIds).filter((id) => candidateIds.has(id)));
    const resultIds = buildSearchResultUniverse(candidateIds, directIds);
    listFacetCounts[facetId] = Array.from(resultIds).filter((id) => {
      const fact = entityFactsById.get(id);
      return fact ? matchesSelectedStatus(fact) : false;
    }).length;
  };
  countPrimaryFacet("all", primaryFacetCandidateIds);
  countPrimaryFacet("pinned", new Set(Array.from(primaryFacetCandidateIds).filter((id) => (
    Boolean(entityFactsById.get(id)?.task.pinned_at)
  ))));
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
    searchExpandedDescendantIds,
    statusFacetCounts,
    taskListMembershipsByTaskId,
    visibleRootParentIds,
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
  milestoneSearchTokensByTaskId,
  milestoneTaskIds,
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
  const canonicalEntityProjection = buildCanonicalTaskEntityProjection({
    availableTaskLists,
    focusedTaskIds,
    milestoneSearchTokensByTaskId,
    normalizedSearchQuery,
    taskHistoryByTaskId,
    taskListEvaluationContext,
    taskSubtasksByTaskId,
    taskUiState,
    tasks,
    todayDateKey,
  });
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
  }, createEmptyTaskStatusCounts());
  const allTaskTags = [...taskTagSet].sort();
  const urgentTasks = urgentFlaggedTasks.slice(0, 6);
  logTaskDeriveStep("base bucket and count aggregation", aggregateStartedAt, {
    activeTasks: activeTasks.length,
    doneTasks: doneTasks.length,
    statusBuckets: Object.keys(taskStatusCounts).length,
    tags: allTaskTags.length,
    tasks: primaryTasks.length,
  });

  const matchesTaskFilters = (task: Task, options: { ignoreStatus?: boolean } = {}) => {
    const ignoreStatus = options.ignoreStatus ?? false;
    const includeStepsInStatus = taskUiState.includeStepsByView?.[taskUiState.view] === true;
    const quickChecks = taskUiState.quickFilters.map((filter) => matchesTaskQuickFilter(task, filter, focusedTaskIds));
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

    const ownDisplayStatus = getTaskDisplayStatusWithHistory(task, taskHistoryByTaskId[task.id] ?? [], todayDateKey);
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
    const quickChecks = taskUiState.quickFilters.map((filter) => matchesTaskQuickFilter(task, filter, focusedTaskIds));
    const matchesQuickFilters = quickChecks.length === 0
      ? true
      : taskUiState.matchAny
        ? quickChecks.some(Boolean)
        : quickChecks.every(Boolean);
    const matchesStatus = taskUiState.statusFilters.length === 0 || taskUiState.statusFilters.includes(
      getTaskDisplayStatusWithHistory(task, taskHistoryByTaskId[task.id] ?? [], todayDateKey),
    );
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
        return isTaskOpen(task) && memberships.some((membership) => membership.id === "today" || membership.id === "priority_5" || membership.id === "quick_wins" || membership.id === "focus");
      }),
      bucketContext,
    );
  logTaskDeriveStep("focus planner grouping/sorting", focusPlannerStartedAt, {
    focusPlannerTasks: focusPlannerTasks.length,
    tasks: filteredTasksSorted.length,
  });
  const todayQueueTaskCount = primaryTasks.filter((task) => (
    isTaskOpen(task)
    && (
      visibleTaskBaseFactsByTaskId[task.id]?.isTodayTask
      || focusedTaskIdSet.has(task.id)
      || getTaskPriorityLevel(task) === 5
    )
  )).length;

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
    : availableTaskLists.filter((list) =>
      isPrimaryRailTaskListEligible(list)
      && (list.id !== "missed" || (canonicalEntityProjection.listFacetCounts[list.id] ?? 0) > 0)
    );
  const listRailOptions: TaskRailListOption[] = activePage !== "Tasks"
    ? []
    : visibleTaskLists.map((list) => ({
        count: canonicalEntityProjection.listFacetCounts[list.id] ?? 0,
        description: list.description,
        id: list.id,
        isCustom: list.type === "custom",
        label: list.name,
      }));
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
      const items = group.items.filter((item) => canonicalEntityProjection.hierarchyScopedEntityIds.has(item.id));
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
    listRailOptions,
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
    visibleListCounts: canonicalEntityProjection.listFacetCounts,
  };
}
