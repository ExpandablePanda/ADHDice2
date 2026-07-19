import type { createBrowserSupabaseClient } from "@/lib/supabase";
import type {
  AchievementCollectionAward,
  AchievementNotification,
  AchievementProfile,
  AchievementProgress,
  AchievementTierAward,
} from "@/lib/database.types";
import { emptyAchievementRuntimeSnapshot, type AchievementRuntimeSnapshot } from "@/lib/achievement-progress";

export type AchievementRepositoryClient = NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;

export type AchievementRepositoryResult<T> = {
  data: T;
  error: string | null;
};

export async function loadAchievementRuntime(
  client: AchievementRepositoryClient,
  userId: string,
): Promise<AchievementRepositoryResult<AchievementRuntimeSnapshot>> {
  const [profileResult, progressResult, tierAwardsResult, collectionAwardsResult] = await Promise.all([
    client.from("adhdice_achievement_profiles").select("*").eq("user_id", userId).maybeSingle(),
    client.from("adhdice_achievement_progress").select("*").eq("user_id", userId).order("track_id", { ascending: true }),
    client.from("adhdice_achievement_tier_awards").select("*").eq("user_id", userId).order("earned_at", { ascending: true }),
    client.from("adhdice_achievement_collection_awards").select("*").eq("user_id", userId).order("earned_at", { ascending: true }),
  ]);
  const error = profileResult.error ?? progressResult.error ?? tierAwardsResult.error ?? collectionAwardsResult.error;
  if (error) return { data: emptyAchievementRuntimeSnapshot(), error: error.message };
  return {
    data: {
      collectionAwards: (collectionAwardsResult.data ?? []) as AchievementCollectionAward[],
      profile: (profileResult.data ?? null) as AchievementProfile | null,
      progress: (progressResult.data ?? []) as AchievementProgress[],
      tierAwards: (tierAwardsResult.data ?? []) as AchievementTierAward[],
    },
    error: null,
  };
}

export async function claimAchievementNotifications(
  client: Pick<AchievementRepositoryClient, "rpc">,
  limit = 10,
): Promise<AchievementRepositoryResult<AchievementNotification[]>> {
  const { data, error } = await client.rpc("adhdice_claim_achievement_notifications", { p_limit: limit });
  return error
    ? { data: [], error: error.message }
    : { data: (data ?? []) as AchievementNotification[], error: null };
}

export async function markAchievementNotificationSeen(
  client: Pick<AchievementRepositoryClient, "rpc">,
  notificationId: string,
): Promise<AchievementRepositoryResult<Record<string, unknown> | null>> {
  const { data, error } = await client.rpc("adhdice_mark_achievement_notification_seen", { p_notification_id: notificationId });
  return error
    ? { data: null, error: error.message }
    : { data: (data ?? null) as Record<string, unknown> | null, error: null };
}
