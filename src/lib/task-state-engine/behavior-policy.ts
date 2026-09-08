/**
 * A Task Behavior Policy is engine configuration, not persisted Task data.
 *
 * The policy is intentionally resolved outside the Task row so future
 * user-facing TaskType values can select a profile without creating another
 * Task Engine or another source of recurrence, Calendar, streak, rollover,
 * or reward rules.
 *
 * Only the current standard profile is defined in this foundation ticket.
 * In particular, no blank-occurrence or Pursuit behavior is represented here.
 */
export type TaskBehaviorPolicy = Readonly<{
  id: string;
  occurrenceModel: "scheduled";
  recurrenceModel: "standard";
  rolloverModel: "standard";
  calendarModel: "standard";
  streakModel: "standard";
  rewardModel: "standard";
}>;

/** The behavior every existing Task uses until a later profile is selected. */
export const STANDARD_TASK_BEHAVIOR_POLICY: TaskBehaviorPolicy = Object.freeze({
  id: "standard-task",
  occurrenceModel: "scheduled",
  recurrenceModel: "standard",
  rolloverModel: "standard",
  calendarModel: "standard",
  streakModel: "standard",
  rewardModel: "standard",
});

/** Resolve an omitted or null policy to the current standard Task profile. */
export function resolveTaskBehaviorPolicy(
  policy?: TaskBehaviorPolicy | null,
): TaskBehaviorPolicy {
  return policy ?? STANDARD_TASK_BEHAVIOR_POLICY;
}
