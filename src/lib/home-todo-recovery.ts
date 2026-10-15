import { normalizeHomeTodoState, type HomeTodoState } from "@/lib/home-todo-state";

export const HOME_TODO_RESTORED_EVENT = "adhdice:home-todo-restored";

export type HomeTodoRestoredEventDetail = {
  userId: string;
  state: unknown;
  clientUpdatedAt: string;
  stateRevision: number;
  restoreGeneration: number;
};

export function announceHomeTodoRestored(detail: HomeTodoRestoredEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(HOME_TODO_RESTORED_EVENT, { detail }));
}

export type HomeTodoRecoveryCache = {
  state: HomeTodoState;
  restoreGeneration: number;
  stateRevision: number;
};

type HomeTodoRecoveryCacheEnvelope = {
  cacheVersion?: unknown;
  state?: unknown;
  restoreGeneration?: unknown;
  stateRevision?: unknown;
};

function safeRevision(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

export function parseHomeTodoRecoveryCache(value: unknown): HomeTodoRecoveryCache {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { state: normalizeHomeTodoState(null), restoreGeneration: 0, stateRevision: 0 };
  }
  const candidate = value as HomeTodoRecoveryCacheEnvelope;
  if (candidate.cacheVersion === 1) {
    return {
      state: normalizeHomeTodoState(candidate.state),
      restoreGeneration: safeRevision(candidate.restoreGeneration),
      stateRevision: safeRevision(candidate.stateRevision),
    };
  }
  // Before 7.16.165, localStorage stored the Home state directly.
  return { state: normalizeHomeTodoState(value), restoreGeneration: 0, stateRevision: 0 };
}

export function shouldPreferRemoteHomeTodoState(
  local: Pick<HomeTodoRecoveryCache, "state" | "restoreGeneration">,
  remote: { state: HomeTodoState; restoreGeneration: number },
) {
  if (local.restoreGeneration !== remote.restoreGeneration) return true;
  const localTimestamp = Date.parse(local.state.clientUpdatedAt) || 0;
  const remoteTimestamp = Date.parse(remote.state.clientUpdatedAt) || 0;
  return remoteTimestamp > localTimestamp;
}

export function homeTodoRecoveryConflictCacheKey(
  ownerId: string,
  localGeneration: number,
  remoteGeneration: number,
  localStateRevision?: number,
  remoteStateRevision?: number,
) {
  const key = "adhdice-home-todo-conflict:" + ownerId + ":" + localGeneration + ":" + remoteGeneration;
  if (Number.isSafeInteger(localStateRevision) && Number.isSafeInteger(remoteStateRevision)) {
    return key + ":revision:" + localStateRevision + ":" + remoteStateRevision;
  }
  return key;
}
