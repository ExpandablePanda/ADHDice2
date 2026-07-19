export type TaskRolloverRpcError = { message: string };

export type TaskRolloverRpcResult = {
  error: TaskRolloverRpcError | null;
};

export type TaskRolloverCoordinatorResult = {
  owned: boolean;
  result: TaskRolloverRpcResult;
};

type RunTaskRolloverOptions = {
  client: object;
  execute: () => Promise<TaskRolloverRpcResult>;
  logicalDayKey: string;
  onOwnedSettled: (result: TaskRolloverRpcResult) => Promise<void> | void;
  userId: string;
};

export class TaskRolloverSingleFlightCoordinator {
  private generation = 0;
  private ownerClient: object | null = null;
  private ownerUserId: string | null = null;
  private requests = new Map<string, Promise<TaskRolloverCoordinatorResult>>();
  private tail: { generation: number; promise: Promise<void> } | null = null;

  setOwner(client: object | null, userId: string | null) {
    if (this.ownerClient === client && this.ownerUserId === userId) return;
    this.ownerClient = client;
    this.ownerUserId = userId;
    this.generation += 1;
    this.requests.clear();
    this.tail = null;
  }

  run({ client, execute, logicalDayKey, onOwnedSettled, userId }: RunTaskRolloverOptions): Promise<TaskRolloverCoordinatorResult | null> {
    if (this.ownerClient !== client || this.ownerUserId !== userId) {
      return Promise.resolve(null);
    }
    const existing = this.requests.get(logicalDayKey);
    if (existing) return existing;

    const generation = this.generation;
    const previous = this.tail?.generation === generation ? this.tail.promise : Promise.resolve();
    const request = previous
      .then(() => this.isCurrent(client, generation, userId) ? execute() : null)
      .then(async (result): Promise<TaskRolloverCoordinatorResult> => {
        const owned = this.isCurrent(client, generation, userId);
        if (!result) return { owned: false, result: { error: null } };
        if (owned) await onOwnedSettled(result);
        return { owned, result };
      });
    this.requests.set(logicalDayKey, request);
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
