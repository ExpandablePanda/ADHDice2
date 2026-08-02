export type TaskSearchCommitScheduler = {
  setTimeout: (callback: () => void, delayMs: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

export function createTaskSearchCommitController(
  onCommit: (value: string) => void,
  scheduler: TaskSearchCommitScheduler,
  delayMs = 180,
) {
  let generation = 0;
  let pendingHandle: unknown = null;

  const cancelPending = () => {
    if (pendingHandle === null) return;
    scheduler.clearTimeout(pendingHandle);
    pendingHandle = null;
  };

  const publish = (value: string) => {
    generation += 1;
    const publishedGeneration = generation;
    cancelPending();
    onCommit(value);
    return publishedGeneration;
  };

  return {
    schedule(value: string) {
      generation += 1;
      const scheduledGeneration = generation;
      cancelPending();
      pendingHandle = scheduler.setTimeout(() => {
        pendingHandle = null;
        if (scheduledGeneration !== generation) return;
        onCommit(value);
      }, delayMs);
      return scheduledGeneration;
    },
    publish,
    cancel: cancelPending,
    dispose() {
      generation += 1;
      cancelPending();
    },
  };
}
