import { buildTaskCollections } from "./task-selectors";
import { getMissingTaskGridWidgetTypes, type TaskGridLayoutItem } from "./task-grid-layout";
import { sortTasksForCockpit, matchesTaskQuickFilter } from "./task-cockpit";
import type {
  Task,
  TaskStatus,
  TaskSubtask as DbTaskSubtask,
} from "./database.types";
import type { TaskEditorLinkedNote } from "./task-notes";
import type {
  TaskBucketContext,
} from "./task-buckets";
import type { TaskUiState } from "./task-ui-state";
import type {
  TaskListDefinition,
  TaskListEvaluationContext,
  TaskListEvaluationPerf,
} from "./task-lists";
import { evaluateTaskListMemberships } from "./task-lists";
import { isTaskFinished, isTaskOpen, isTaskUrgent } from "./task-buckets";
import { isDueToday, isOverdue } from "./task-cockpit";

type TaskGridItem = TaskGridLayoutItem<string>;
type TaskDerivedFilterState = Pick<TaskUiState, "energyFilters" | "matchAny" | "quickFilters" | "statusFilters">;

const EMPTY_TASKS: Task[] = [];
const isDevelopment = process.env.NODE_ENV !== "production";

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
  taskListEvaluationContext,
  taskSubtasksByTaskId,
  taskUiState,
  tasks,
}: ComputeTaskAppDerivedDataInput) {
  const totalStartedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
  const availableRuleCount = availableTaskLists.reduce((count, list) => count + (list.rules?.rules.length ?? 0), 0);

  const normalizationStartedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
  const recentTrashFloor = Date.now() - (30 * 24 * 60 * 60 * 1000);
  const recentlyDeletedTasks = tasks.filter((task) => {
    if (task.status !== "archived") {
      return false;
    }

    const updatedAtMs = new Date(task.updated_at).getTime();
    return Number.isFinite(updatedAtMs) && updatedAtMs >= recentTrashFloor;
  });
  const visibleTasks = tasks.filter((task) => task.status !== "archived");
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
    recentlyDeletedTasks: recentlyDeletedTasks.length,
    tasks: tasks.length,
    visibleTasks: visibleTasks.length,
  });

  const aggregateStartedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
  const allTaskTags = [...new Set(visibleTasks.flatMap((task) => task.tags ?? []))].sort();
  const activeTasks = visibleTasks.filter(isTaskOpen);
  const doneTasks = visibleTasks.filter(isTaskFinished);
  const overdueTasks = activeTasks.filter((task) => isOverdue(task.due_on));
  const todayTasks = activeTasks.filter((task) => task.status !== "missed" && isDueToday(task.due_on));
  const urgentFlaggedTasks = activeTasks.filter(isTaskUrgent);
  const lowEnergyTasks = activeTasks.filter((task) => task.energy === "low").slice(0, 4);
  const urgentTasks = urgentFlaggedTasks.slice(0, 6);
  const taskStatusCounts = tasks.reduce<Record<TaskStatus, number>>((accumulator, task) => {
    accumulator[task.status] += 1;
    return accumulator;
  }, {
    pending: 0,
    in_progress: 0,
    done: 0,
    missed: 0,
    did_my_best: 0,
    upcoming: 0,
    not_due: 0,
    archived: 0,
  });
  logTaskDeriveStep("base bucket and count aggregation", aggregateStartedAt, {
    activeTasks: activeTasks.length,
    doneTasks: doneTasks.length,
    statusBuckets: Object.keys(taskStatusCounts).length,
    tags: allTaskTags.length,
    tasks: tasks.length,
  });

  const matchesTaskFilters = (task: Task) => {
    const subtaskTitles = (taskSubtasksByTaskId[task.id] ?? []).map((subtask) => subtask.title);
    const haystacks = [
      task.title,
      task.notes ?? "",
      task.external_link_label ?? "",
      ...subtaskTitles,
      ...(task.tags ?? []),
    ].map((value) => value.toLowerCase());
    const matchesSearch = deferredSearchQuery.length === 0 || haystacks.some((value) => value.includes(deferredSearchQuery));
    if (!matchesSearch) {
      return false;
    }

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
  const taskListMembershipsByTaskId = activePage !== "Tasks"
    ? {}
    : filteredTasksSorted.reduce<Record<string, ReturnType<typeof evaluateTaskListMemberships>>>((accumulator, task) => {
      accumulator[task.id] = evaluateTaskListMemberships(task, availableTaskLists, taskListEvaluationContext, taskListMembershipPerf);
      return accumulator;
    }, {});
  logTaskDeriveStep("smart-list membership evaluation", membershipStartedAt, {
    helperInboxMs: Math.round(taskListMembershipPerf?.inboxCheckMs ?? 0),
    helperManualMs: Math.round(taskListMembershipPerf?.manualMembershipSeedMs ?? 0),
    helperRuleMs: Math.round(taskListMembershipPerf?.ruleEvaluationMs ?? 0),
    lists: availableTaskLists.length,
    matchedMemberships: taskListMembershipPerf?.matchedRuleMemberships ?? 0,
    rules: availableRuleCount,
    tasks: filteredTasksSorted.length,
  });

  const visibleCountStartedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
  const visibleListCounts = activePage !== "Tasks"
    ? {}
    : filteredTasksSorted.reduce<Record<string, number>>((accumulator, task) => {
      for (const membership of taskListMembershipsByTaskId[task.id] ?? []) {
        accumulator[membership.id] = (accumulator[membership.id] ?? 0) + 1;
      }
      return accumulator;
    }, {});
  logTaskDeriveStep("task-list rail/count generation", visibleCountStartedAt, {
    listsWithCounts: Object.keys(visibleListCounts).length,
    tasks: filteredTasksSorted.length,
  });

  const collectionsStartedAt = isDevelopment && typeof performance !== "undefined" ? performance.now() : 0;
  const collections = buildTaskCollections(filteredTasksSorted, taskListMembershipsByTaskId, focusedTaskIds);
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
  const listRailOptions = activePage !== "Tasks"
    ? []
    : [
      {
        count: filteredTasksSorted.length,
        description: "Everything that matches the current search and filters.",
        id: "all",
        label: "All",
      },
      ...visibleTaskLists.map((list) => ({
        count: visibleListCounts[list.id] ?? 0,
        description: list.description,
        id: list.id,
        label: list.name,
      })),
      {
        count: trashFilteredTasksSorted.length,
        description: "Tasks moved to trash in the last 30 days.",
        id: "trash",
        label: "Trash",
      },
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
    collections,
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
    trashFilteredTasksSorted,
    selectedTaskForEditor,
    taskForActualTimeEntry,
    taskLinkedNotesByTaskId,
    taskListMembershipsByTaskId,
    taskStatusCounts,
    todayTasks,
    urgentTasks,
    visibleListCounts,
  };
}
