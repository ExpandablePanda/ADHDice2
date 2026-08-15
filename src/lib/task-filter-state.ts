import {
  DEFAULT_TASK_UI_STATE,
  type TaskUiState,
} from "@/lib/task-ui-state";
import type { TaskDisplayStatus } from "@/lib/task-display-status";

export const TASK_FILTER_STATUS_OPTIONS: TaskDisplayStatus[] = [
  "unscheduled",
  "pending",
  "in_progress",
  "delayed",
  "done",
  "did_my_best",
  "missed",
  "upcoming",
  "not_due",
  "complete",
  "archived",
];

const FILTER_BUCKET_IDS = new Set(["pinned", "routine"]);

export function hasActiveTaskFilters(state: TaskUiState) {
  return state.duplicateTitleMode
    || state.search.trim().length > 0
    || state.quickFilters.length > 0
    || state.statusFilters.length > 0
    || state.energyFilters.length > 0
    || state.tableColumnFilters.priority.length > 0
    || state.tableColumnFilters.repeat.length > 0
    || Object.values(state.tableColumnFilters.text).some((value) => value?.trim())
    || FILTER_BUCKET_IDS.has(state.selectedBucket)
    || state.matchAny !== DEFAULT_TASK_UI_STATE.matchAny;
}

export function resetTaskFiltersPreservingView(state: TaskUiState): TaskUiState {
  return {
    ...DEFAULT_TASK_UI_STATE,
    selectedBucket: FILTER_BUCKET_IDS.has(state.selectedBucket)
      ? DEFAULT_TASK_UI_STATE.selectedBucket
      : state.selectedBucket,
    tasksSurface: state.tasksSurface,
    view: state.view,
    visibleColumnsByView: state.visibleColumnsByView,
  };
}
