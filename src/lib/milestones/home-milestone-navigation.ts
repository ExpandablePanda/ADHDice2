import type { TaskUiState } from "@/lib/task-ui-state";

export type HomeMilestoneDestination = "active" | "completed";

export function getHomeMilestoneNavigationState(destination: HomeMilestoneDestination, current: TaskUiState): TaskUiState {
  return destination === "completed"
    ? { ...current, tasksSurface: "completed_milestones" }
    : { ...current, selectedBucket: "milestones", tasksSurface: "tasks" };
}
