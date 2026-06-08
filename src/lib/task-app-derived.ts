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
} from "./task-lists";
import { evaluateTaskListMemberships } from "./task-lists";
import { isTaskFinished, isTaskOpen, isTaskUrgent } from "./task-buckets";
import { isDueToday, isOverdue } from "./task-cockpit";

type TaskGridItem = TaskGridLayoutItem<string>;

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
  taskUiState: TaskUiState;
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

  const filteredTasksSorted = activePage === "Tasks"
    ? sortTasksForCockpit(visibleTasks.filter(matchesTaskFilters), bucketContext)
    : [];
  const trashFilteredTasksSorted = activePage === "Tasks"
    ? sortTasksForCockpit(recentlyDeletedTasks.filter(matchesTaskFilters), bucketContext)
    : [];
  const taskListMembershipsByTaskId = activePage !== "Tasks"
    ? {}
    : filteredTasksSorted.reduce<Record<string, ReturnType<typeof evaluateTaskListMemberships>>>((accumulator, task) => {
      accumulator[task.id] = evaluateTaskListMemberships(task, availableTaskLists, taskListEvaluationContext);
      return accumulator;
    }, {});
  const visibleListCounts = activePage !== "Tasks"
    ? {}
    : filteredTasksSorted.reduce<Record<string, number>>((accumulator, task) => {
      for (const membership of taskListMembershipsByTaskId[task.id] ?? []) {
        accumulator[membership.id] = (accumulator[membership.id] ?? 0) + 1;
      }
      return accumulator;
    }, {});
  const collections = buildTaskCollections(filteredTasksSorted, taskListMembershipsByTaskId, focusedTaskIds);
  const planningCandidates = activePage !== "Tasks"
    ? []
    : sortTasksForCockpit([
      ...collections.inboxTasks,
      ...collections.laterTasks.filter((task) => !collections.inboxTasks.some((inboxTask) => inboxTask.id === task.id)).slice(0, 8),
      ...collections.quickWinTasks.filter((task) => !collections.inboxTasks.some((inboxTask) => inboxTask.id === task.id)).slice(0, 6),
    ], bucketContext)
      .filter((task, index, collection) => collection.findIndex((candidate) => candidate.id === task.id) === index)
      .slice(0, 5);
  const focusPlannerTasks = activePage !== "Tasks"
    ? []
    : sortTasksForCockpit(
      filteredTasksSorted.filter((task) => {
        const memberships = taskListMembershipsByTaskId[task.id] ?? [];
        return isTaskOpen(task) && memberships.some((membership) => membership.id === "today" || membership.id === "urgent" || membership.id === "quick_wins" || membership.id === "focus");
      }),
      bucketContext,
    );

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
