export type TaskRolloverRpcError = { message: string };

export type TaskRolloverRpcResult = {
  error: TaskRolloverRpcError | null;
  /** Tasks whose command completed or was a semantic no-op in this sweep. */
  settledTaskIds?: string[];
  /** A committed child exists but the deterministic finalizer must be retried. */
  achievementFinalizationPending?: boolean;
};

export type TaskRolloverCoordinatorResult = {
  owned: boolean;
  result: TaskRolloverRpcResult;
};

type RunTaskRolloverOptions = {
  client: object;
  execute: (input: { settledTaskIds: ReadonlySet<string>; achievementFinalizationPending: boolean }) => Promise<TaskRolloverRpcResult>;
  logicalDayKey: string;
  onOwnedSettled: (result: TaskRolloverRpcResult) => Promise<void> | void;
  userId: string;
};

export class TaskRolloverSingleFlightCoordinator {
  private generation = 0;
  private ownerClient: object | null = null;
  private ownerUserId: string | null = null;
  private requests = new Map<string, Promise<TaskRolloverCoordinatorResult>>();
  private settledTaskIdsByLogicalDay = new Map<string, Set<string>>();
  private achievementFinalizationPendingByLogicalDay = new Map<string, boolean>();
  private tail: { generation: number; promise: Promise<void> } | null = null;
  private activeRequestCount = 0;
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  isBusy = () => this.activeRequestCount > 0;

  private notify() {
    for (const listener of this.listeners) listener();
  }

  setOwner(client: object | null, userId: string | null) {
    if (this.ownerClient === client && this.ownerUserId === userId) return;
    this.ownerClient = client;
    this.ownerUserId = userId;
    this.generation += 1;
    this.requests.clear();
    this.settledTaskIdsByLogicalDay.clear();
    this.achievementFinalizationPendingByLogicalDay.clear();
    this.tail = null;
    this.activeRequestCount = 0;
    this.notify();
  }

  run({ client, execute, logicalDayKey, onOwnedSettled, userId }: RunTaskRolloverOptions): Promise<TaskRolloverCoordinatorResult | null> {
    if (this.ownerClient !== client || this.ownerUserId !== userId) {
      return Promise.resolve(null);
    }
    const existing = this.requests.get(logicalDayKey);
    if (existing) return existing;

    const generation = this.generation;
    const settledTaskIds = this.settledTaskIdsByLogicalDay.get(logicalDayKey) ?? new Set<string>();
    const achievementFinalizationPending = this.achievementFinalizationPendingByLogicalDay.get(logicalDayKey) ?? false;
    const previous = this.tail?.generation === generation ? this.tail.promise : Promise.resolve();
    const request = previous
      .then(() => this.isCurrent(client, generation, userId) ? execute({ settledTaskIds, achievementFinalizationPending }) : null)
      .then(async (result): Promise<TaskRolloverCoordinatorResult> => {
        const owned = this.isCurrent(client, generation, userId);
        if (!result) return { owned: false, result: { error: null } };
        if (owned && result.settledTaskIds?.length) {
          const settled = this.settledTaskIdsByLogicalDay.get(logicalDayKey) ?? new Set<string>();
          for (const taskId of result.settledTaskIds) settled.add(taskId);
          this.settledTaskIdsByLogicalDay.set(logicalDayKey, settled);
        }
        if (owned) {
          if (result.achievementFinalizationPending) {
            this.achievementFinalizationPendingByLogicalDay.set(logicalDayKey, true);
          } else if (result.error === null) {
            this.achievementFinalizationPendingByLogicalDay.delete(logicalDayKey);
          }
        }
        if (owned) await onOwnedSettled(result);
        return { owned, result };
      });
    this.activeRequestCount += 1;
    this.notify();
    this.requests.set(logicalDayKey, request);
    void request.then(() => {
      if (this.requests.get(logicalDayKey) === request) {
        this.requests.delete(logicalDayKey);
      }
      if (this.generation === generation) {
        this.activeRequestCount = Math.max(0, this.activeRequestCount - 1);
        this.notify();
      }
    }, () => {
      if (this.requests.get(logicalDayKey) === request) {
        this.requests.delete(logicalDayKey);
      }
      if (this.generation === generation) {
        this.activeRequestCount = Math.max(0, this.activeRequestCount - 1);
        this.notify();
      }
    });
    this.tail = { generation, promise: request.then(() => undefined, () => undefined) };
    return request;
  }

  private isCurrent(client: object, generation: number, userId: string) {
    return this.ownerClient === client
      && this.ownerUserId === userId
      && this.generation === generation;
  }
}

export const taskRolloverCoordinator = new TaskRolloverSingleFlightCoordinator();
