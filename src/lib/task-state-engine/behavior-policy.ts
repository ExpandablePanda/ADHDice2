/**
 * A Task Behavior Policy is engine configuration, not persisted Task data.
 *
 * The policy is intentionally resolved outside the Task row so future
 * user-facing TaskType values can select a profile without creating another
 * Task Engine or another source of recurrence, Calendar, streak, rollover,
 * or reward rules.
 *
 * The semantic fields below describe decisions the one Task Engine can
 * consume. Only the current standard profile is active in this foundation
 * ticket; no blank-occurrence or Pursuit behavior is activated here.
 */
import type { TaskType } from "../task-type.ts";
import { isTaskType } from "../task-type.ts";

export type UnresolvedOccurrenceBehavior = "missed" | "blank";
export type PositiveStreakUnhandledBehavior = "break" | "preserve";
export type MissedStreakUnhandledBehavior = "increment" | "ignore";
export type RewardBehavior = "enabled" | "disabled";

export type TaskBehaviorPolicy = Readonly<{
  id: string;
  unresolvedOccurrence: UnresolvedOccurrenceBehavior;
  positiveStreakOnUnhandled: PositiveStreakUnhandledBehavior;
  missedStreakOnUnhandled: MissedStreakUnhandledBehavior;
  rewards: RewardBehavior;
}>;

/** The behavior every existing Task uses until a later profile is selected. */
export const STANDARD_TASK_BEHAVIOR_POLICY: TaskBehaviorPolicy = Object.freeze({
  id: "standard-task",
  unresolvedOccurrence: "missed",
  positiveStreakOnUnhandled: "break",
  missedStreakOnUnhandled: "increment",
  rewards: "enabled",
});

/** Resolve a persisted TaskType, or a compatibility policy input, to the current profile. */
export function resolveTaskBehaviorPolicy(
  input?: TaskType | TaskBehaviorPolicy | null,
): TaskBehaviorPolicy {
  if (input && typeof input === "object") {
    return input;
  }
  if (isTaskType(input)) {
    return STANDARD_TASK_BEHAVIOR_POLICY;
  }
  return STANDARD_TASK_BEHAVIOR_POLICY;
}
