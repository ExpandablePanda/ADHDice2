export type ProjectionReconciliationAttempt = "immediate" | "retry";

export type ProjectionReconciliationResult<T> = {
  attempt: ProjectionReconciliationAttempt;
  entityId: string;
  fresh: boolean;
  projection: T | null;
};

type ProjectionReconciliationJob = {
  cancelled: boolean;
  entityId: string;
  generation: number;
  promise: Promise<void>;
  retryResolve: (() => void) | null;
  retryTimer: unknown;
};

export function createBoundedTaskProjectionReconciler<T>({
  isCurrentGeneration,
  isFresh,
  load,
  onCompleted,
  onCancelled,
  onReconcileStarted,
  onResult,
  onRetryScheduled,
  retryDelayMs = 4500,
  schedule = (callback, delayMs) => setTimeout(callback, delayMs),
  cancel = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}: {
  cancel?: (handle: unknown) => void;
  isCurrentGeneration: (generation: number) => boolean;
  isFresh: (projection: T | null, entityId: string) => boolean;
  load: (entityId: string) => Promise<T | null>;
  onCancelled?: (entityId: string, generation: number) => void;
  onCompleted?: (entityId: string, generation: number) => void;
  onReconcileStarted?: (entityId: string, generation: number) => void;
  onResult?: (result: ProjectionReconciliationResult<T>, generation: number) => void;
  onRetryScheduled?: (entityId: string, generation: number, delayMs: number) => void;
  retryDelayMs?: number;
  schedule?: (callback: () => void, delayMs: number) => unknown;
}) {
  const jobs = new Map<string, ProjectionReconciliationJob>();

  function cancelJob(job: ProjectionReconciliationJob) {
    if (job.cancelled) return;
    job.cancelled = true;
    if (job.retryTimer !== null) {
      cancel(job.retryTimer);
      job.retryTimer = null;
    }
    job.retryResolve?.();
    job.retryResolve = null;
    if (jobs.get(job.entityId) === job) jobs.delete(job.entityId);
    onCancelled?.(job.entityId, job.generation);
  }

  function canContinue(job: ProjectionReconciliationJob) {
    return !job.cancelled && isCurrentGeneration(job.generation);
  }

  async function waitForRetry(job: ProjectionReconciliationJob) {
    await new Promise<void>((resolve) => {
      job.retryResolve = resolve;
      job.retryTimer = schedule(() => {
        job.retryTimer = null;
        job.retryResolve = null;
        resolve();
      }, retryDelayMs);
    });
  }

  function completeJob(job: ProjectionReconciliationJob) {
    if (jobs.get(job.entityId) === job) jobs.delete(job.entityId);
    onCompleted?.(job.entityId, job.generation);
  }

  function request(entityId: string, generation: number) {
    const existing = jobs.get(entityId);
    if (existing?.generation === generation && !existing.cancelled) return existing.promise;
    if (existing) cancelJob(existing);

    const job: ProjectionReconciliationJob = {
      cancelled: false,
      entityId,
      generation,
      promise: Promise.resolve(),
      retryResolve: null,
      retryTimer: null,
    };

    const run = async () => {
      onReconcileStarted?.(entityId, generation);
      const attempts: ProjectionReconciliationAttempt[] = ["immediate"];
      let projection: T | null = null;

      for (const attempt of attempts) {
        if (!canContinue(job)) {
          cancelJob(job);
          return;
        }
        try {
          projection = await load(entityId);
        } catch {
          projection = null;
        }
        if (!canContinue(job)) {
          cancelJob(job);
          return;
        }
        const fresh = isFresh(projection, entityId);
        onResult?.({ attempt, entityId, fresh, projection }, generation);
        if (fresh) {
          completeJob(job);
          return;
        }

        if (attempt === "immediate") {
          onRetryScheduled?.(entityId, generation, retryDelayMs);
          await waitForRetry(job);
          if (!canContinue(job)) {
            cancelJob(job);
            return;
          }
          attempts.push("retry");
        }
      }

      if (!canContinue(job)) {
        cancelJob(job);
        return;
      }
      completeJob(job);
    };

    jobs.set(entityId, job);
    job.promise = run();
    return job.promise;
  }

  return {
    cancel(entityId: string) {
      const job = jobs.get(entityId);
      if (job) cancelJob(job);
    },
    dispose() {
      for (const job of [...jobs.values()]) cancelJob(job);
    },
    request,
  };
}
