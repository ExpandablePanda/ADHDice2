import type { TaskTypeBehaviorProfile } from "./database.types.ts";
import {
  normalizeTaskBehaviorPolicyRevisions,
  normalizeTaskBehaviorProfiles,
  STANDARD_TASK_BEHAVIOR_POLICY,
  type TaskBehaviorPolicy,
  type TaskBehaviorPolicyRevision,
  type TaskBehaviorPolicyRevisionMap,
  type TaskBehaviorProfiles,
} from "./task-state-engine/behavior-policy.ts";
import type { TaskType } from "./task-type.ts";

type ProfileQueryResult = {
  data: Array<Pick<TaskTypeBehaviorProfile, "task_type" | "effective_from_logical_date" | "unresolved_occurrence" | "positive_streak_on_unhandled" | "missed_streak_on_unhandled" | "rewards" | "created_at" | "updated_at">> | null;
  error: { code?: string; message?: string } | null;
};

export type TaskTypeBehaviorProfileClient = {
  from(table: "adhdice_task_type_behavior_profiles"): {
      select(columns: string): {
        eq(column: string, value: string): Promise<ProfileQueryResult>;
      };
    upsert(values: unknown, options?: { onConflict?: string }): Promise<{ error: { code?: string; message?: string } | null }>;
  };
};

export function isMissingTaskTypeBehaviorProfilesTableError(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message ?? "";
  return error?.code === "42P01"
    || /adhdice_task_type_behavior_profiles|relation .* does not exist/i.test(message);
}

export function taskTypeBehaviorProfileUpsertPayload(userId: string, taskType: TaskType, policy: TaskBehaviorPolicy, effectiveFromLogicalDate: string) {
  return {
    user_id: userId,
    task_type: taskType,
    effective_from_logical_date: effectiveFromLogicalDate,
    unresolved_occurrence: policy.unresolvedOccurrence,
    positive_streak_on_unhandled: STANDARD_TASK_BEHAVIOR_POLICY.positiveStreakOnUnhandled,
    missed_streak_on_unhandled: policy.missedStreakOnUnhandled,
    rewards: policy.rewards,
  };
}

/** Replace one logical-day revision without touching any other TaskType. */
export function replaceTaskTypeBehaviorProfileRevision(
  revisions: TaskBehaviorPolicyRevisionMap,
  taskType: TaskType,
  effectiveFromLogicalDate: string,
  revision: TaskBehaviorPolicyRevision | null,
): TaskBehaviorPolicyRevisionMap {
  const nextRevisions = (revisions[taskType] ?? []).filter((candidate) => candidate.effectiveFromLogicalDate !== effectiveFromLogicalDate);
  return {
    ...revisions,
    [taskType]: revision ? [...nextRevisions, revision].sort((left, right) => left.effectiveFromLogicalDate.localeCompare(right.effectiveFromLogicalDate)) : nextRevisions,
  };
}

export async function loadTaskTypeBehaviorProfiles(
  client: TaskTypeBehaviorProfileClient,
  userId: string,
): Promise<{ data: TaskBehaviorProfiles; revisions: TaskBehaviorPolicyRevisionMap; error: { code?: string; message?: string } | null }> {
  if (!userId) return { data: {}, revisions: {}, error: null };
  const result = await client
    .from("adhdice_task_type_behavior_profiles")
    .select("task_type,effective_from_logical_date,unresolved_occurrence,positive_streak_on_unhandled,missed_streak_on_unhandled,rewards,created_at,updated_at")
    .eq("user_id", userId);
  if (result.error) return { data: {}, revisions: {}, error: result.error };
  const revisions: Partial<Record<TaskType, TaskBehaviorPolicyRevisions>> = {};
  for (const revision of normalizeTaskBehaviorPolicyRevisions(result.data ?? [])) {
    const { taskType, ...policyRevision } = revision;
    revisions[taskType] = [...(revisions[taskType] ?? []), policyRevision];
  }
  return { data: normalizeTaskBehaviorProfiles(result.data ?? []), revisions, error: null };
}
