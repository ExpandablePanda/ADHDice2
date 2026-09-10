/**
 * A Task Behavior Policy is engine configuration, not persisted Task data.
 *
 * The policy is intentionally resolved outside the Task row so future
 * user-facing TaskType values can select a profile without creating another
 * Task Engine or another source of recurrence, Calendar, streak, rollover,
 * or reward rules.
 *
 * The semantic fields below describe decisions the one Task Engine can
 * consume. Task and Custom are the currently active configurable profiles;
 * Pursuit and Goal retain the Standard fallback until their semantics are
 * approved.
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

export type TaskBehaviorPolicyRevision = Readonly<TaskBehaviorPolicy & {
  effectiveFromLogicalDate: string;
}>;

export type TaskBehaviorPolicyRevisions = readonly TaskBehaviorPolicyRevision[];
export type TaskBehaviorPolicyRevisionMap = Readonly<Partial<Record<TaskType, TaskBehaviorPolicyRevisions>>>;

export type TaskBehaviorPolicyField = Exclude<keyof TaskBehaviorPolicy, "id">;
export type TaskBehaviorProfiles = Readonly<Partial<Record<TaskType, TaskBehaviorPolicy>>>;

export type TaskBehaviorProjectionSemantics = {
  activeStatus: {
    profile: Pick<TaskBehaviorPolicy, "unresolvedOccurrence">;
    revisions: readonly Pick<TaskBehaviorPolicyRevision, "effectiveFromLogicalDate" | "unresolvedOccurrence">[];
  };
  streak: {
    profile: Pick<TaskBehaviorPolicy, "unresolvedOccurrence" | "positiveStreakOnUnhandled" | "missedStreakOnUnhandled">;
    revisions: readonly Pick<TaskBehaviorPolicyRevision, "effectiveFromLogicalDate" | "unresolvedOccurrence" | "positiveStreakOnUnhandled" | "missedStreakOnUnhandled">[];
  };
  rewards: {
    profile: Pick<TaskBehaviorPolicy, "rewards">;
    revisions: readonly Pick<TaskBehaviorPolicyRevision, "effectiveFromLogicalDate" | "rewards">[];
  };
};

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

/**
 * Projection-specific policy inputs. Keep this at the engine boundary so a
 * change to one behavior concern cannot invalidate unrelated projections.
 */
export function selectTaskBehaviorProjectionSemantics(input: {
  behaviorProfiles?: TaskBehaviorProfiles;
  behaviorPolicyRevisions?: TaskBehaviorPolicyRevisionMap;
  taskType?: TaskType | null;
}): TaskBehaviorProjectionSemantics {
  const taskType = input.taskType === "task" || input.taskType === undefined || input.taskType === null
    ? "task"
    : input.taskType;
  const profile = taskType === "task" || taskType === "custom"
    ? normalizeTaskBehaviorProfile(input.behaviorProfiles?.[taskType], taskType)
    : STANDARD_TASK_BEHAVIOR_POLICY;
  const revisions = taskType === "task" || taskType === "custom"
    ? input.behaviorPolicyRevisions?.[taskType] ?? []
    : [];
  return {
    activeStatus: {
      profile: { unresolvedOccurrence: profile.unresolvedOccurrence },
      revisions: revisions.map((revision) => ({
        effectiveFromLogicalDate: revision.effectiveFromLogicalDate,
        unresolvedOccurrence: revision.unresolvedOccurrence,
      })),
    },
    streak: {
      profile: {
        missedStreakOnUnhandled: profile.missedStreakOnUnhandled,
        positiveStreakOnUnhandled: profile.positiveStreakOnUnhandled,
        unresolvedOccurrence: profile.unresolvedOccurrence,
      },
      revisions: revisions.map((revision) => ({
        effectiveFromLogicalDate: revision.effectiveFromLogicalDate,
        missedStreakOnUnhandled: revision.missedStreakOnUnhandled,
        positiveStreakOnUnhandled: revision.positiveStreakOnUnhandled,
        unresolvedOccurrence: revision.unresolvedOccurrence,
      })),
    },
    rewards: {
      profile: { rewards: profile.rewards },
      revisions: revisions.map((revision) => ({
        effectiveFromLogicalDate: revision.effectiveFromLogicalDate,
        rewards: revision.rewards,
      })),
    },
  };
}

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

export function normalizeTaskBehaviorProfiles(rows: readonly unknown[], logicalDate?: string): TaskBehaviorProfiles {
  const revisions = normalizeTaskBehaviorPolicyRevisions(rows);
  const profiles: Partial<Record<TaskType, TaskBehaviorPolicy>> = {};
  const targetDate = logicalDate ?? revisions.map((revision) => revision.effectiveFromLogicalDate).sort().at(-1) ?? "0000-00-00";
  for (const taskType of ["task", "pursuit", "goal", "custom"] as const) {
    const taskRevision = revisions
      .filter((candidate) => candidate.taskType === taskType && candidate.effectiveFromLogicalDate <= targetDate)
      .at(-1);
    if (taskRevision) {
      profiles[taskType] = normalizeTaskBehaviorProfile({
        id: `${taskType}-behavior-profile`,
        unresolvedOccurrence: taskRevision.unresolvedOccurrence,
        positiveStreakOnUnhandled: taskRevision.positiveStreakOnUnhandled,
        missedStreakOnUnhandled: taskRevision.missedStreakOnUnhandled,
        rewards: taskRevision.rewards,
      }, taskType);
    }
  }
  return profiles;
}

export type NormalizedTaskBehaviorPolicyRevision = TaskBehaviorPolicyRevision & { taskType: TaskType };

function isLogicalDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Normalize and deterministically order the user-scoped revision timeline. */
export function normalizeTaskBehaviorPolicyRevisions(rows: readonly unknown[]): NormalizedTaskBehaviorPolicyRevision[] {
  const revisions: NormalizedTaskBehaviorPolicyRevision[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const candidate = row as { task_type?: unknown; effective_from_logical_date?: unknown };
    if (!isTaskType(candidate.task_type)) continue;
    if (!isLogicalDate(candidate.effective_from_logical_date)) continue;
    const policy = normalizeTaskBehaviorProfile({
      id: `${candidate.task_type}-behavior-profile`,
      unresolvedOccurrence: (row as { unresolved_occurrence?: unknown }).unresolved_occurrence,
      positiveStreakOnUnhandled: (row as { positive_streak_on_unhandled?: unknown }).positive_streak_on_unhandled,
      missedStreakOnUnhandled: (row as { missed_streak_on_unhandled?: unknown }).missed_streak_on_unhandled,
      rewards: (row as { rewards?: unknown }).rewards,
    }, candidate.task_type);
    if (policy === STANDARD_TASK_BEHAVIOR_POLICY && !(
      (row as { unresolved_occurrence?: unknown }).unresolved_occurrence === "missed"
      && (row as { positive_streak_on_unhandled?: unknown }).positive_streak_on_unhandled === "break"
      && (row as { missed_streak_on_unhandled?: unknown }).missed_streak_on_unhandled === "increment"
      && (row as { rewards?: unknown }).rewards === "enabled"
    )) continue;
    revisions.push({
      ...policy,
      effectiveFromLogicalDate: candidate.effective_from_logical_date,
      taskType: candidate.task_type,
    });
  }
  return revisions.sort((left, right) => left.taskType.localeCompare(right.taskType)
    || left.effectiveFromLogicalDate.localeCompare(right.effectiveFromLogicalDate)
    || left.id.localeCompare(right.id));
}

/** Resolve the latest revision effective on an ADHDice logical date. */
export function resolveTaskBehaviorPolicyForLogicalDate(input: {
  revisions?: readonly Pick<TaskBehaviorPolicyRevision, "effectiveFromLogicalDate" | "unresolvedOccurrence" | "positiveStreakOnUnhandled" | "missedStreakOnUnhandled" | "rewards">[];
  logicalDate: string;
}): TaskBehaviorPolicy {
  const revision = [...(input.revisions ?? [])]
    .filter((candidate) => candidate.effectiveFromLogicalDate <= input.logicalDate)
    .sort((left, right) => left.effectiveFromLogicalDate.localeCompare(right.effectiveFromLogicalDate))
    .at(-1);
  if (!revision) return STANDARD_TASK_BEHAVIOR_POLICY;
  return normalizeTaskBehaviorProfile({
    ...revision,
    id: "effective-task-behavior-policy",
  });
}

/** Resolve a persisted TaskType, or a compatibility policy input, to the current profile. */
export function resolveTaskBehaviorPolicy(
  input?: TaskType | TaskBehaviorPolicy | null,
  profiles?: TaskBehaviorProfiles,
  revisions?: TaskBehaviorPolicyRevisionMap,
  logicalDate?: string,
): TaskBehaviorPolicy {
  if (input && typeof input === "object") {
    return normalizeTaskBehaviorProfile(input);
  }
  if (isTaskType(input)) {
    if (input === "task" || input === "custom") {
      if (logicalDate && revisions?.[input]?.length) {
        return resolveTaskBehaviorPolicyForLogicalDate({ revisions: revisions[input], logicalDate });
      }
      if (profiles?.[input]) return normalizeTaskBehaviorProfile(profiles[input], input);
    }
    return STANDARD_TASK_BEHAVIOR_POLICY;
  }
  if (profiles?.task) return normalizeTaskBehaviorProfile(profiles.task, "task");
  return STANDARD_TASK_BEHAVIOR_POLICY;
}
