import type { CurrentTaskProjectionParityField } from "./task-current-projection-read.ts";
import type { TaskHistoryStreakSummary } from "./task-history-streak-summaries.ts";

export type CurrentTaskProjectionScopedVerificationIdentity = {
  logicalDate: string;
  projectionUpdatedAt: string | null;
  taskCanonicalRevision: number | null;
  taskId: string;
  workspaceGeneration: number;
};

export type CurrentTaskProjectionScopedVerificationResult<T> =
  | { status: "completed"; value: T }
  | { status: "stale"; value: null };

export type CurrentTaskProjectionScopedVerificationCacheEntry<T> = {
  identity: CurrentTaskProjectionScopedVerificationIdentity;
  value: T;
};

export type CurrentTaskProjectionScopedVerificationProof = {
  authoritativeLastHandled: Pick<TaskHistoryStreakSummary, "lastHandledAt" | "lastHandledDate">;
  identity: CurrentTaskProjectionScopedVerificationIdentity;
  resolved: true;
  taskId: string;
};

export type CurrentTaskProjectionScopedVerificationRequest<T> = {
  promise: Promise<CurrentTaskProjectionScopedVerificationResult<T>>;
  status: "already_verified" | "coalesced" | "started";
};

export type CurrentTaskProjectionScopedVerificationCoordinator<T> = {
  clear: () => void;
  getVerified: (identity: CurrentTaskProjectionScopedVerificationIdentity) => CurrentTaskProjectionScopedVerificationCacheEntry<T> | null;
  request: (
    identity: CurrentTaskProjectionScopedVerificationIdentity,
    verify: () => Promise<T>,
  ) => CurrentTaskProjectionScopedVerificationRequest<T>;
};

const LAST_HANDLED_PARITY_FIELDS = new Set<CurrentTaskProjectionParityField>([
  "lastHandledDate",
  "lastHandledAt",
]);

export function isLastHandledOnlyCurrentTaskProjectionParityMismatch(
  fields: readonly CurrentTaskProjectionParityField[],
) {
  return fields.length > 0 && fields.every((field) => LAST_HANDLED_PARITY_FIELDS.has(field));
}

function verificationIdentityKey(identity: CurrentTaskProjectionScopedVerificationIdentity) {
  return [
    identity.taskId,
    identity.taskCanonicalRevision ?? "null",
    identity.projectionUpdatedAt ?? "null",
    identity.logicalDate,
    identity.workspaceGeneration,
  ].join(":");
}

export function createCurrentTaskProjectionScopedVerificationCoordinator<T>(options: {
  cacheCompletedResult?: (value: T) => boolean;
  isCurrent?: (identity: CurrentTaskProjectionScopedVerificationIdentity) => boolean;
} = {}): CurrentTaskProjectionScopedVerificationCoordinator<T> {
  const inFlight = new Map<string, Promise<CurrentTaskProjectionScopedVerificationResult<T>>>();
  const verified = new Set<string>();
  const verifiedResults = new Map<string, CurrentTaskProjectionScopedVerificationCacheEntry<T>>();

  return {
    clear() {
      inFlight.clear();
      verified.clear();
      verifiedResults.clear();
    },
    getVerified(identity) {
      return verifiedResults.get(verificationIdentityKey(identity)) ?? null;
    },
    request(identity, verify) {
      const key = verificationIdentityKey(identity);
      if (verified.has(key)) {
        return {
          promise: Promise.resolve({ status: "stale", value: null } satisfies CurrentTaskProjectionScopedVerificationResult<T>),
          status: "already_verified",
        };
      }

      const existing = inFlight.get(key);
      if (existing) return { promise: existing, status: "coalesced" };

      const promise = Promise.resolve().then(async () => {
        const value = await verify();
        if (options.isCurrent && !options.isCurrent(identity)) {
          return { status: "stale", value: null } satisfies CurrentTaskProjectionScopedVerificationResult<T>;
        }
        verified.add(key);
        if (!options.cacheCompletedResult || options.cacheCompletedResult(value)) {
          verifiedResults.set(key, { identity, value });
        }
        return { status: "completed", value } satisfies CurrentTaskProjectionScopedVerificationResult<T>;
      }).finally(() => {
        if (inFlight.get(key) === promise) inFlight.delete(key);
      });
      inFlight.set(key, promise);
      return { promise, status: "started" };
    },
  };
}
