import type { Task } from "@/lib/database.types";
import { selectCalendarTasks } from "@/lib/task-calendar-selection";
import type {
  ChildTaskPreviewLookup,
  TaskAppDerivedPresentation,
  TaskSearchPresentationSelection,
} from "@/lib/task-app-derived";

export type TaskAppViewReadModelDerivedResults = {
  canonicalVisibleRootTasksSorted: Task[];
  childTaskPreviewByParentTaskId: ChildTaskPreviewLookup;
  searchMatchedChildTaskIds: readonly string[] | ReadonlySet<string>;
  searchMatchedStepParentTaskIds: readonly string[] | ReadonlySet<string>;
};

export type TaskAppViewReadModel = {
  calendarTasks: Task[];
  hierarchyStatusFilterActive: boolean;
  listSelectionResetKey: string;
  searchMatchedChildTaskIds: readonly string[] | ReadonlySet<string>;
  searchMatchedStepParentTaskIds: readonly string[] | ReadonlySet<string>;
  selectedBucketTasks: Task[];
  visibleListTaskIds: string[];
};

/** Builds the display selections for one Tasks presentation from shared derivation inputs. */
export function buildTaskAppViewReadModel({
  canonicalTasks,
  calendarTasksForRead,
  derived,
  presentation,
  searchSelection,
}: {
  /** Existing Task inputs used to retain Calendar's canonical input ordering. */
  canonicalTasks: readonly Task[];
  /** Existing active-status Calendar projection; this helper never rebuilds it. */
  calendarTasksForRead: readonly Task[];
  derived: TaskAppViewReadModelDerivedResults;
  presentation: TaskAppDerivedPresentation;
  searchSelection: TaskSearchPresentationSelection | null;
}): TaskAppViewReadModel {
  const selectedBucketTasks = searchSelection?.visibleTasks ?? derived.canonicalVisibleRootTasksSorted;
  const calendarSelectedTaskIds = new Set(selectedBucketTasks.map((task) => task.id));
  const calendarSelectedTasks = canonicalTasks.filter((task) => calendarSelectedTaskIds.has(task.id));
  const childTaskIds = Object.values(derived.childTaskPreviewByParentTaskId)
    .flatMap((group) => group.items.map((item) => item.id));
  const searchIsActive = presentation.normalizedSearchQuery.length > 0;
  const calendarSearchMatchingEntityIds = searchIsActive ? searchSelection?.matchingEntityIds : null;
  const calendarTasks = selectCalendarTasks({
    childTaskIds,
    includeSteps: presentation.taskUiState.includeStepsByView.calendar,
    matchingSearchEntityIds: calendarSearchMatchingEntityIds,
    searchIsActive,
    selectedTasks: calendarSelectedTasks,
    tasks: calendarTasksForRead,
  });
  const searchMatchedChildTaskIds = searchSelection
    ? Array.from(searchSelection.matchingDescendantIdsByRootParentId.values())
      .flatMap((descendantIds) => Array.from(descendantIds))
    : derived.searchMatchedChildTaskIds;
  const searchMatchedStepParentTaskIds = searchSelection
    ? searchSelection.visibleRootTaskIds
    : derived.searchMatchedStepParentTaskIds;
  const { tableColumnFilters } = presentation.taskUiState;
  const hierarchyStatusFilterActive = !searchIsActive && (
    presentation.taskUiState.statusFilters.length > 0
    || presentation.taskUiState.energyFilters.length > 0
    || presentation.taskUiState.quickFilters.length > 0
    || tableColumnFilters.priority.length > 0
    || tableColumnFilters.repeat.length > 0
    || (tableColumnFilters.taskType?.length ?? 0) > 0
    || Object.values(tableColumnFilters.text).some((value) => Boolean(value?.trim()))
  );
  const listSelectionResetKey = JSON.stringify({
    duplicateTitleMode: presentation.duplicateTitleMode,
    energyFilters: presentation.taskUiState.energyFilters,
    matchAny: presentation.taskUiState.matchAny,
    quickFilters: presentation.taskUiState.quickFilters,
    search: presentation.normalizedSearchQuery,
    selectedBucket: presentation.taskUiState.selectedBucket,
    statusFilters: presentation.taskUiState.statusFilters,
    view: presentation.taskUiState.view,
  });

  return {
    calendarTasks,
    hierarchyStatusFilterActive,
    listSelectionResetKey,
    searchMatchedChildTaskIds,
    searchMatchedStepParentTaskIds,
    selectedBucketTasks,
    visibleListTaskIds: selectedBucketTasks.map((task) => task.id),
  };
}
