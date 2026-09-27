export type TaskEntityReadError = {
  code?: string;
  message?: string;
};

export type TaskEntityFetchResult<T> = {
  data: T[] | null;
  error: TaskEntityReadError | null;
};

export type CanonicalTaskEntitySnapshotRow = {
  id: string;
  canonicalization_status?: string | null;
  terminal_state?: string | null;
  container_state?: string | null;
};

export type CanonicalTaskEntitySnapshotBoundaryRow = {
  entity_id: string;
};

export function isActiveCanonicalTaskEntityRow(task: CanonicalTaskEntitySnapshotRow) {
  return (
    (task.canonicalization_status === "canonical_proven" || task.canonicalization_status === "canonical_runtime")
    && task.terminal_state === "active"
    && task.container_state === "active"
  );
}

/**
 * Read only the requested visible Task entities and the boundary authority
 * required by those entities. An absent row is a valid not-found result; a
 * failed read is returned as an error so callers can retain their local data.
 */
export async function loadCanonicalTaskEntities<
  TaskRow extends CanonicalTaskEntitySnapshotRow,
  BoundaryRow extends CanonicalTaskEntitySnapshotBoundaryRow,
>(
  taskIds: readonly string[],
  loadTaskRows: (taskIds: string[]) => PromiseLike<TaskEntityFetchResult<TaskRow>>,
  loadScheduleBoundaries: (taskIds: string[]) => PromiseLike<TaskEntityFetchResult<BoundaryRow>>,
) {
  const requestedTaskIds = [...new Set(taskIds.filter((taskId) => taskId.length > 0))];
  if (requestedTaskIds.length === 0) {
    return {
      taskResult: { data: [] as TaskRow[], error: null },
      boundaryResult: { data: [] as BoundaryRow[], error: null },
    };
  }

  const taskResult = await loadTaskRows(requestedTaskIds);
  if (taskResult.error) {
    return { taskResult, boundaryResult: null };
  }

  const taskRows = taskResult.data ?? [];
  const activeTaskIds = taskRows
    .filter(isActiveCanonicalTaskEntityRow)
    .map((task) => task.id);
  const boundaryResult = activeTaskIds.length === 0
    ? { data: [] as BoundaryRow[], error: null }
    : await loadScheduleBoundaries(activeTaskIds);
  if (boundaryResult.error) {
    return { taskResult, boundaryResult };
  }

  const boundaryTaskIds = new Set((boundaryResult.data ?? []).map((boundary) => boundary.entity_id));
  const missingBoundaryTaskIds = activeTaskIds.filter((taskId) => !boundaryTaskIds.has(taskId));
  if (missingBoundaryTaskIds.length > 0) {
    return {
      taskResult,
      boundaryResult: {
        data: null,
        error: {
          code: "CANONICAL_TASK_SNAPSHOT_INCOMPLETE",
          message: `Incomplete targeted canonical Task snapshot; missing schedule boundaries for active Tasks: ${missingBoundaryTaskIds.join(", ")}`,
        },
      },
    };
  }

  return { taskResult, boundaryResult };
}

export type TaskEntityMergeStatus = "inserted" | "merged" | "removed" | "structurally_unchanged";

export function mergeTaskEntitySnapshot<TaskRow extends { id: string }>(
  currentTasks: readonly TaskRow[],
  requestedTaskIds: readonly string[],
  nextTasks: readonly TaskRow[],
) {
  const requestedIds = [...new Set(requestedTaskIds)];
  const requested = new Set(requestedIds);
  const nextById = new Map(nextTasks.map((task) => [task.id, task]));
  const currentById = new Map(currentTasks.map((task) => [task.id, task]));
  const outcomes = new Map<string, TaskEntityMergeStatus>();
  const mergedTasks: TaskRow[] = [];

  for (const currentTask of currentTasks) {
    if (!requested.has(currentTask.id)) {
      mergedTasks.push(currentTask);
      continue;
    }

    const nextTask = nextById.get(currentTask.id);
    if (!nextTask) {
      outcomes.set(currentTask.id, "removed");
      continue;
    }

    if (JSON.stringify(currentTask) === JSON.stringify(nextTask)) {
      outcomes.set(currentTask.id, "structurally_unchanged");
      mergedTasks.push(currentTask);
    } else {
      outcomes.set(currentTask.id, "merged");
      mergedTasks.push(nextTask);
    }
  }

  for (const taskId of requestedIds) {
    const nextTask = nextById.get(taskId);
    if (!nextTask || currentById.has(taskId)) continue;
    outcomes.set(taskId, "inserted");
    mergedTasks.push(nextTask);
  }

  return { tasks: mergedTasks, outcomes };
}

type TaskEntityReconciliationBatchRunner<Result> = (taskIds: string[]) => Promise<ReadonlyMap<string, Result>>;

type TaskEntityReconciliationWaiter<Result> = {
  eligibleRun: number;
  remainingTaskIds: Set<string>;
  results: Map<string, Result>;
  resolve: (results: Map<string, Result>) => void;
  reject: (error: unknown) => void;
};

/**
 * Coalesces entity invalidations in microtasks and gives events arriving
 * during an active read a trailing pass. The batch size prevents a burst from
 * becoming a workspace-wide read.
 */
export function createTaskEntityReconciliationCoordinator<Result>(
  runBatch: TaskEntityReconciliationBatchRunner<Result>,
  { maxBatchSize = 50 }: { maxBatchSize?: number } = {},
) {
  const pendingTaskIds = new Set<string>();
  const waiters: TaskEntityReconciliationWaiter<Result>[] = [];
  let scheduled = false;
  let running = false;
  let disposed = false;
  let completedRuns = 0;

  function schedule() {
    if (scheduled || disposed) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      void flush();
    });
  }

  function settleBatch(batchTaskIds: string[], batchResults: ReadonlyMap<string, Result>, runNumber: number) {
    for (const waiter of [...waiters]) {
      if (waiter.eligibleRun > runNumber) continue;
      let matched = false;
      for (const taskId of batchTaskIds) {
        if (!waiter.remainingTaskIds.has(taskId)) continue;
        waiter.remainingTaskIds.delete(taskId);
        waiter.results.set(taskId, batchResults.get(taskId) as Result);
        matched = true;
      }
      if (matched && waiter.remainingTaskIds.size === 0) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(waiter.results);
      }
    }
  }

  function rejectBatch(batchTaskIds: string[], error: unknown, runNumber: number) {
    for (const waiter of [...waiters]) {
      if (waiter.eligibleRun > runNumber || !batchTaskIds.some((taskId) => waiter.remainingTaskIds.has(taskId))) continue;
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.reject(error);
    }
  }

  async function flush() {
    if (disposed || running || pendingTaskIds.size === 0) return;
    running = true;
    const batchTaskIds = [...pendingTaskIds].slice(0, Math.max(1, maxBatchSize));
    for (const taskId of batchTaskIds) pendingTaskIds.delete(taskId);
    const runNumber = completedRuns + 1;

    try {
      const results = await runBatch(batchTaskIds);
      completedRuns = runNumber;
      if (!disposed) settleBatch(batchTaskIds, results, runNumber);
    } catch (error) {
      completedRuns = runNumber;
      if (!disposed) rejectBatch(batchTaskIds, error, runNumber);
    } finally {
      running = false;
      if (!disposed && pendingTaskIds.size > 0) schedule();
    }
  }

  return {
    request(taskIds: readonly string[]) {
      const requestedTaskIds = [...new Set(taskIds.filter((taskId) => taskId.length > 0))];
      if (requestedTaskIds.length === 0 || disposed) return Promise.resolve(new Map<string, Result>());
      for (const taskId of requestedTaskIds) pendingTaskIds.add(taskId);

      const eligibleRun = completedRuns + (running ? 2 : 1);
      return new Promise<Map<string, Result>>((resolve, reject) => {
        waiters.push({
          eligibleRun,
          remainingTaskIds: new Set(requestedTaskIds),
          results: new Map(),
          resolve,
          reject,
        });
        schedule();
      });
    },
    isRunning() {
      return running;
    },
    hasPending() {
      return pendingTaskIds.size > 0;
    },
    dispose() {
      disposed = true;
      pendingTaskIds.clear();
      scheduled = false;
      for (const waiter of waiters.splice(0)) waiter.resolve(new Map());
    },
  };
}
