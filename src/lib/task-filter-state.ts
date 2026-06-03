import {
  DEFAULT_TASK_UI_STATE,
  type TaskUiState,
} from "@/lib/task-ui-state";

export function hasActiveTaskFilters(state: TaskUiState) {
  return state.search.trim().length > 0
    || state.quickFilters.length > 0
    || state.statusFilters.length > 0
    || state.energyFilters.length > 0
    || state.matchAny !== DEFAULT_TASK_UI_STATE.matchAny;
}

export function resetTaskFiltersPreservingView(state: TaskUiState): TaskUiState {
  return {
    ...DEFAULT_TASK_UI_STATE,
    selectedBucket: state.selectedBucket,
    view: state.view,
    visibleColumnsByView: state.visibleColumnsByView,
  };
}
