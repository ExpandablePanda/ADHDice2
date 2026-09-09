import type { TaskTypeBehaviorProfile } from "./database.types.ts";
import {
  normalizeTaskBehaviorProfiles,
  type TaskBehaviorPolicy,
  type TaskBehaviorProfiles,
} from "./task-state-engine/behavior-policy.ts";

type ProfileQueryResult = {
  data: Array<Pick<TaskTypeBehaviorProfile, "task_type" | "unresolved_occurrence" | "positive_streak_on_unhandled" | "missed_streak_on_unhandled" | "rewards">> | null;
  error: { code?: string; message?: string } | null;
};

export type TaskTypeBehaviorProfileClient = {
  from(table: "adhdice_task_type_behavior_profiles"): {
    select(columns: string): {
      eq(column: string, value: string): Promise<ProfileQueryResult>;
    };
  };
};

export function isMissingTaskTypeBehaviorProfilesTableError(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message ?? "";
  return error?.code === "42P01"
    || /adhdice_task_type_behavior_profiles|relation .* does not exist/i.test(message);
}

export function taskTypeBehaviorProfileUpsertPayload(userId: string, policy: TaskBehaviorPolicy) {
  return {
    user_id: userId,
    task_type: "task" as const,
    unresolved_occurrence: policy.unresolvedOccurrence,
    positive_streak_on_unhandled: policy.positiveStreakOnUnhandled,
    missed_streak_on_unhandled: policy.missedStreakOnUnhandled,
    rewards: policy.rewards,
  };
}

export async function loadTaskTypeBehaviorProfiles(
  client: TaskTypeBehaviorProfileClient,
  userId: string,
): Promise<{ data: TaskBehaviorProfiles; error: { code?: string; message?: string } | null }> {
  if (!userId) return { data: {}, error: null };
  const result = await client
    .from("adhdice_task_type_behavior_profiles")
    .select("task_type,unresolved_occurrence,positive_streak_on_unhandled,missed_streak_on_unhandled,rewards")
    .eq("user_id", userId);
  if (result.error) return { data: {}, error: result.error };
  return { data: normalizeTaskBehaviorProfiles(result.data ?? []), error: null };
}
