const PENDING_TASK_MUTATION_TTL_MS = 10_000;

type PendingTaskMutationState = {
  explicitScopeCount: number;
  expiresAt: number | null;
};

export type PendingTaskMutationTracker = {
  beginPendingTaskMutationScope: (taskIds: string[]) => void;
  clearPendingTaskMutations: (taskIds: string[]) => void;
  endPendingTaskMutationScope: (taskIds: string[]) => void;
  markPendingTaskMutations: (taskIds: string[]) => void;
  shouldSkipTaskReload: (change: { eventType: string; taskId: string | null }) => boolean;
};

function uniqueTaskIds(taskIds: string[]) {
  return [...new Set(taskIds)].filter(Boolean);
}

export function createPendingTaskMutationTracker(now: () => number = Date.now): PendingTaskMutationTracker {
  const stateByTaskId = new Map<string, PendingTaskMutationState>();

  function getState(taskId: string) {
    const existing = stateByTaskId.get(taskId);
    if (existing) return existing;

    const created: PendingTaskMutationState = { explicitScopeCount: 0, expiresAt: null };
    stateByTaskId.set(taskId, created);
    return created;
  }

  function removeIfUnowned(taskId: string, state: PendingTaskMutationState) {
    if (state.explicitScopeCount === 0 && state.expiresAt === null) {
      stateByTaskId.delete(taskId);
    }
  }

  return {
    beginPendingTaskMutationScope: (taskIds) => {
      for (const taskId of uniqueTaskIds(taskIds)) {
        getState(taskId).explicitScopeCount += 1;
      }
    },
    clearPendingTaskMutations: (taskIds) => {
      for (const taskId of uniqueTaskIds(taskIds)) {
        const state = stateByTaskId.get(taskId);
        if (!state) continue;
        state.expiresAt = null;
        removeIfUnowned(taskId, state);
      }
    },
    endPendingTaskMutationScope: (taskIds) => {
      for (const taskId of uniqueTaskIds(taskIds)) {
        const state = stateByTaskId.get(taskId);
        if (!state) continue;
        state.explicitScopeCount = Math.max(0, state.explicitScopeCount - 1);
        removeIfUnowned(taskId, state);
      }
    },
    markPendingTaskMutations: (taskIds) => {
      const expiresAt = now() + PENDING_TASK_MUTATION_TTL_MS;
      for (const taskId of uniqueTaskIds(taskIds)) {
        getState(taskId).expiresAt = expiresAt;
      }
    },
    shouldSkipTaskReload: (change) => {
      const taskId = change.taskId;
      if (!taskId) return false;

      const state = stateByTaskId.get(taskId);
      if (!state) return false;
      if (state.explicitScopeCount > 0) return true;
      if (state.expiresAt === null) return false;
      if (state.expiresAt < now()) {
        stateByTaskId.delete(taskId);
        return false;
      }

      state.expiresAt = null;
      removeIfUnowned(taskId, state);
      return true;
    },
  };
}
