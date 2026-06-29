import {
  DEFAULT_TASK_UI_STATE,
  type TaskUiState,
} from "@/lib/task-ui-state";
import type { TaskStatus } from "@/lib/database.types";

export const TASK_FILTER_STATUS_OPTIONS: TaskStatus[] = [
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
  "trashed",
];

export function hasActiveTaskFilters(state: TaskUiState) {
  return state.duplicateTitleMode
    || state.search.trim().length > 0
    || state.quickFilters.length > 0
    || state.statusFilters.length > 0
    || state.energyFilters.length > 0
    || state.matchAny !== DEFAULT_TASK_UI_STATE.matchAny;
}

export function resetTaskFiltersPreservingView(state: TaskUiState): TaskUiState {
  return {
    ...DEFAULT_TASK_UI_STATE,
    selectedBucket: state.selectedBucket,
    tasksSurface: state.tasksSurface,
    view: state.view,
    visibleColumnsByView: state.visibleColumnsByView,
  };
}
