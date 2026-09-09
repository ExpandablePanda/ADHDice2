import type { TaskTypeBehaviorProfile } from "./database.types.ts";
import {
  normalizeTaskBehaviorPolicyRevisions,
  normalizeTaskBehaviorProfiles,
  type TaskBehaviorPolicy,
  type TaskBehaviorPolicyRevisions,
  type TaskBehaviorProfiles,
} from "./task-state-engine/behavior-policy.ts";

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

export function taskTypeBehaviorProfileUpsertPayload(userId: string, policy: TaskBehaviorPolicy, effectiveFromLogicalDate: string) {
  return {
    user_id: userId,
    task_type: "task" as const,
    effective_from_logical_date: effectiveFromLogicalDate,
    unresolved_occurrence: policy.unresolvedOccurrence,
    positive_streak_on_unhandled: policy.positiveStreakOnUnhandled,
    missed_streak_on_unhandled: policy.missedStreakOnUnhandled,
    rewards: policy.rewards,
  };
}

export async function loadTaskTypeBehaviorProfiles(
  client: TaskTypeBehaviorProfileClient,
  userId: string,
): Promise<{ data: TaskBehaviorProfiles; revisions: TaskBehaviorPolicyRevisions; error: { code?: string; message?: string } | null }> {
  if (!userId) return { data: {}, revisions: [], error: null };
  const result = await client
    .from("adhdice_task_type_behavior_profiles")
    .select("task_type,effective_from_logical_date,unresolved_occurrence,positive_streak_on_unhandled,missed_streak_on_unhandled,rewards,created_at,updated_at")
    .eq("user_id", userId);
  if (result.error) return { data: {}, revisions: [], error: result.error };
  const revisions = normalizeTaskBehaviorPolicyRevisions(result.data ?? [])
    .filter((revision) => revision.taskType === "task")
    .map((revision) => ({
      id: revision.id,
      unresolvedOccurrence: revision.unresolvedOccurrence,
      positiveStreakOnUnhandled: revision.positiveStreakOnUnhandled,
      missedStreakOnUnhandled: revision.missedStreakOnUnhandled,
      rewards: revision.rewards,
      effectiveFromLogicalDate: revision.effectiveFromLogicalDate,
    }));
  return { data: normalizeTaskBehaviorProfiles(result.data ?? []), revisions, error: null };
}
