import type { TaskTypeBehaviorProfile } from "./database.types.ts";
import {
  normalizeTaskBehaviorPolicyRevisions,
  normalizeTaskBehaviorProfiles,
  normalizeTaskManualActions,
  STANDARD_TASK_BEHAVIOR_POLICY,
  type TaskBehaviorPolicy,
  type TaskBehaviorPolicyRevision,
  type TaskBehaviorPolicyRevisionMap,
  type TaskBehaviorProfiles,
  type TaskBehaviorPolicyRevisions,
  type TaskManualAction,
} from "./task-state-engine/behavior-policy.ts";
import type { TaskType } from "./task-type.ts";

type ProfileQueryRow = Pick<TaskTypeBehaviorProfile, "task_type" | "effective_from_logical_date" | "unresolved_occurrence" | "positive_streak_on_unhandled" | "missed_streak_on_unhandled" | "rewards" | "created_at" | "updated_at"> & {
  /** Optional keeps pre-7.13.38 source/test rows compatible. */
  available_actions?: readonly TaskManualAction[] | null;
};

type ProfileQueryResult = {
  data: ProfileQueryRow[] | null;
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
    || /adhdice_task_type_behavior_profiles|relation .* does not exist|column .*available_actions.* does not exist/i.test(message);
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
    available_actions: [...normalizeTaskManualActions(policy.availableActions)],
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
    .select("task_type,effective_from_logical_date,unresolved_occurrence,positive_streak_on_unhandled,missed_streak_on_unhandled,rewards,available_actions,created_at,updated_at")
    .eq("user_id", userId);
  if (result.error) return { data: {}, revisions: {}, error: result.error };
  const revisions: Partial<Record<TaskType, TaskBehaviorPolicyRevisions>> = {};
  for (const revision of normalizeTaskBehaviorPolicyRevisions(result.data ?? [])) {
    const { taskType, ...policyRevision } = revision;
    revisions[taskType] = [...(revisions[taskType] ?? []), policyRevision];
  }
  return { data: normalizeTaskBehaviorProfiles(result.data ?? []), revisions, error: null };
}
