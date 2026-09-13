import { DEFAULT_CUSTOM_TASK_TYPE_TEMPLATE, type TaskBehaviorPolicy } from "./task-state-engine/behavior-policy.ts";

export type TaskTypeBehaviorTab = "task" | "goal" | "custom";

export const TASK_TYPE_BEHAVIOR_TABS: ReadonlyArray<{ label: string; value: TaskTypeBehaviorTab }> = [
  { label: "Task", value: "task" },
];

/** Create a detached local draft without introducing a persisted profile. */
export function buildDefaultCustomTaskTypeDraft(): TaskBehaviorPolicy {
  return {
    ...DEFAULT_CUSTOM_TASK_TYPE_TEMPLATE,
    id: "custom-task-type-draft",
    availableActions: [...DEFAULT_CUSTOM_TASK_TYPE_TEMPLATE.availableActions],
    needsActionTriggers: [...DEFAULT_CUSTOM_TASK_TYPE_TEMPLATE.needsActionTriggers],
  };
}

export function taskTypeBehaviorTabDescription(tab: TaskTypeBehaviorTab) {
  if (tab === "task") return null;
  if (tab === "custom") return "This legacy Custom assignment has no named Custom Task Type and is not configurable.";
  return "Behavior profile not configured yet.";
}
