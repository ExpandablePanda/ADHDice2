import { createBrowserUuidV4 } from "@/lib/browser-uuid";

export type RollProfileSnapshot = {
  free_roll_bank: number;
  points: number;
  tokens: number;
  updated_at: string;
};

export type ProfileHydrationToken = {
  generation: number;
  authoritativeTimestamp: number;
};

export function getProfileSnapshotTimestamp(snapshot: Pick<RollProfileSnapshot, "updated_at">) {
  const timestamp = Date.parse(snapshot.updated_at);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function shouldApplyAuthoritativeProfileSnapshot(
  snapshot: Pick<RollProfileSnapshot, "updated_at">,
  latestAppliedTimestamp: number,
) {
  return getProfileSnapshotTimestamp(snapshot) >= latestAppliedTimestamp;
}

export function shouldApplyProfileHydration({
  currentAuthoritativeTimestamp,
  currentGeneration,
  snapshot,
  token,
}: {
  currentAuthoritativeTimestamp: number;
  currentGeneration: number;
  snapshot: Pick<RollProfileSnapshot, "updated_at">;
  token: ProfileHydrationToken;
}) {
  return token.generation === currentGeneration
    && token.authoritativeTimestamp === currentAuthoritativeTimestamp
    && shouldApplyAuthoritativeProfileSnapshot(snapshot, currentAuthoritativeTimestamp);
}

export function createRollOperationId(randomUuid?: () => string) {
  return randomUuid ? randomUuid() : createBrowserUuidV4();
}
