/**
 * A Task Behavior Policy is engine configuration, not persisted Task data.
 *
 * The policy is intentionally resolved outside the Task row so future
 * user-facing TaskType values can select a profile without creating another
 * Task Engine or another source of recurrence, Calendar, streak, rollover,
 * or reward rules.
 *
 * The semantic fields below describe decisions the one Task Engine can
 * consume. In 7.13.17 only the persisted Task profile is active; other
 * TaskTypes retain the Standard fallback until their semantics are approved.
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

export type TaskBehaviorPolicyField = Exclude<keyof TaskBehaviorPolicy, "id">;
export type TaskBehaviorProfiles = Readonly<Partial<Record<TaskType, TaskBehaviorPolicy>>>;

const POLICY_VALUES = {
  unresolvedOccurrence: new Set<UnresolvedOccurrenceBehavior>(["missed", "blank"]),
  positiveStreakOnUnhandled: new Set<PositiveStreakUnhandledBehavior>(["break", "preserve"]),
  missedStreakOnUnhandled: new Set<MissedStreakUnhandledBehavior>(["increment", "ignore"]),
  rewards: new Set<RewardBehavior>(["enabled", "disabled"]),
} as const;

/** The behavior every existing Task uses until a later profile is selected. */
export const STANDARD_TASK_BEHAVIOR_POLICY: TaskBehaviorPolicy = Object.freeze({
  id: "standard-task",
  unresolvedOccurrence: "missed",
  positiveStreakOnUnhandled: "break",
  missedStreakOnUnhandled: "increment",
  rewards: "enabled",
});

function isPolicyValue<T extends TaskBehaviorPolicyField>(field: T, value: unknown): value is TaskBehaviorPolicy[T] {
  return POLICY_VALUES[field].has(value as never);
}

function isStandardPolicyValues(input: Pick<TaskBehaviorPolicy, TaskBehaviorPolicyField>) {
  return input.unresolvedOccurrence === STANDARD_TASK_BEHAVIOR_POLICY.unresolvedOccurrence
    && input.positiveStreakOnUnhandled === STANDARD_TASK_BEHAVIOR_POLICY.positiveStreakOnUnhandled
    && input.missedStreakOnUnhandled === STANDARD_TASK_BEHAVIOR_POLICY.missedStreakOnUnhandled
    && input.rewards === STANDARD_TASK_BEHAVIOR_POLICY.rewards;
}

/** Normalize untrusted database/profile data to one complete engine policy. */
export function normalizeTaskBehaviorProfile(input: unknown, taskType: TaskType = "task"): TaskBehaviorPolicy {
  if (typeof input !== "object" || input === null) return STANDARD_TASK_BEHAVIOR_POLICY;
  const candidate = input as Partial<TaskBehaviorPolicy>;
  if (typeof candidate.id === "string"
    && candidate.id.trim()
    && "unresolvedOccurrence" in candidate
    && "positiveStreakOnUnhandled" in candidate
    && "missedStreakOnUnhandled" in candidate
    && "rewards" in candidate) {
    const completePolicy = candidate as TaskBehaviorPolicy;
    if (isPolicyValue("unresolvedOccurrence", completePolicy.unresolvedOccurrence)
      && isPolicyValue("positiveStreakOnUnhandled", completePolicy.positiveStreakOnUnhandled)
      && isPolicyValue("missedStreakOnUnhandled", completePolicy.missedStreakOnUnhandled)
      && isPolicyValue("rewards", completePolicy.rewards)) {
      return completePolicy;
    }
  }
  if (!isPolicyValue("unresolvedOccurrence", candidate.unresolvedOccurrence)
    || !isPolicyValue("positiveStreakOnUnhandled", candidate.positiveStreakOnUnhandled)
    || !isPolicyValue("missedStreakOnUnhandled", candidate.missedStreakOnUnhandled)
    || !isPolicyValue("rewards", candidate.rewards)) {
    return STANDARD_TASK_BEHAVIOR_POLICY;
  }
  const values: Pick<TaskBehaviorPolicy, TaskBehaviorPolicyField> = {
    unresolvedOccurrence: candidate.unresolvedOccurrence as UnresolvedOccurrenceBehavior,
    positiveStreakOnUnhandled: candidate.positiveStreakOnUnhandled as PositiveStreakUnhandledBehavior,
    missedStreakOnUnhandled: candidate.missedStreakOnUnhandled as MissedStreakUnhandledBehavior,
    rewards: candidate.rewards as RewardBehavior,
  };
  if (isStandardPolicyValues(values)) return STANDARD_TASK_BEHAVIOR_POLICY;
  return Object.freeze({
    id: typeof candidate.id === "string" && candidate.id.trim() ? candidate.id : `${taskType}-behavior-profile`,
    ...values,
  });
}

export function normalizeTaskBehaviorProfiles(rows: readonly unknown[]): TaskBehaviorProfiles {
  const profiles: Partial<Record<TaskType, TaskBehaviorPolicy>> = {};
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const candidate = row as { task_type?: unknown };
    if (!isTaskType(candidate.task_type)) continue;
    profiles[candidate.task_type] = normalizeTaskBehaviorProfile({
      id: `${candidate.task_type}-behavior-profile`,
      unresolvedOccurrence: (row as { unresolved_occurrence?: unknown }).unresolved_occurrence,
      positiveStreakOnUnhandled: (row as { positive_streak_on_unhandled?: unknown }).positive_streak_on_unhandled,
      missedStreakOnUnhandled: (row as { missed_streak_on_unhandled?: unknown }).missed_streak_on_unhandled,
      rewards: (row as { rewards?: unknown }).rewards,
    }, candidate.task_type);
  }
  return profiles;
}

/** Resolve a persisted TaskType, or a compatibility policy input, to the current profile. */
export function resolveTaskBehaviorPolicy(
  input?: TaskType | TaskBehaviorPolicy | null,
  profiles?: TaskBehaviorProfiles,
): TaskBehaviorPolicy {
  if (input && typeof input === "object") {
    return normalizeTaskBehaviorProfile(input);
  }
  if (isTaskType(input)) {
    // Only the Task profile is activated in 7.13.17. Other TaskTypes retain
    // the safe Standard fallback until their own semantics are approved.
    if (input === "task" && profiles?.task) return normalizeTaskBehaviorProfile(profiles.task, input);
    return STANDARD_TASK_BEHAVIOR_POLICY;
  }
  if (profiles?.task) return normalizeTaskBehaviorProfile(profiles.task, "task");
  return STANDARD_TASK_BEHAVIOR_POLICY;
}
