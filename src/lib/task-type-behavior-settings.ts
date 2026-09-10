export type TaskTypeBehaviorTab = "task" | "pursuit" | "goal" | "custom";

export const TASK_TYPE_BEHAVIOR_TABS: ReadonlyArray<{ label: string; value: TaskTypeBehaviorTab }> = [
  { label: "Task", value: "task" },
  { label: "Pursuit", value: "pursuit" },
  { label: "Goal", value: "goal" },
  { label: "Custom", value: "custom" },
];

export function taskTypeBehaviorTabDescription(tab: TaskTypeBehaviorTab) {
  return tab === "task" || tab === "custom" ? null : "Behavior profile not configured yet.";
}
