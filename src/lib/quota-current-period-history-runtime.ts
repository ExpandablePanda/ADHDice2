import type { TaskHistory } from "./database.types.ts";
import {
  fetchQuotaCurrentPeriodHistory,
  getQuotaCurrentPeriodHistoryWindow,
  type QuotaCurrentPeriodHistoryByTaskId,
  type QuotaCurrentPeriodHistoryClient,
} from "./quota-current-period-history-repository.ts";
import { createSingleFlightRefreshCoordinator } from "./workspace-refresh-coordinator.ts";

export type QuotaCurrentPeriodHistoryLoadStatus = "idle" | "loading" | "ready" | "error";

export type QuotaCurrentPeriodHistoryRuntimeState = {
  error: string | null;
  logicalDate: string | null;
  ownerId: string | null;
  rowsByTaskId: QuotaCurrentPeriodHistoryByTaskId;
  status: QuotaCurrentPeriodHistoryLoadStatus;
  taskIds: string[];
  taskIdsKey: string;
  window: { endDate: string; startDate: string } | null;
  workspaceGeneration: number | null;
};

export type QuotaCurrentPeriodHistoryLoadRequest = {
  client: QuotaCurrentPeriodHistoryClient;
  logicalDate: string;
  ownerId: string;
  reason: string;
  taskContextKey?: string;
  taskIds: readonly string[];
  workspaceGeneration: number;
};

export type QuotaCurrentPeriodHistoryRuntime = {
  clear: () => void;
  getState: () => QuotaCurrentPeriodHistoryRuntimeState;
  request: (request: QuotaCurrentPeriodHistoryLoadRequest, options?: { force?: boolean }) => Promise<boolean>;
};

type RuntimeContext = QuotaCurrentPeriodHistoryLoadRequest & {
  contextEpoch: number;
  taskIds: string[];
  taskIdsKey: string;
  window: { endDate: string; startDate: string };
};

const EMPTY_STATE: QuotaCurrentPeriodHistoryRuntimeState = {
  error: null,
  logicalDate: null,
  ownerId: null,
  rowsByTaskId: {},
  status: "idle",
  taskIds: [],
  taskIdsKey: "",
  window: null,
  workspaceGeneration: null,
};

function normalizeTaskIds(taskIds: readonly string[]) {
  return [...new Set(taskIds)].filter(Boolean).sort();
}

function requestKey(context: RuntimeContext) {
  return `${context.contextEpoch}:${context.ownerId}:${context.logicalDate}:${context.taskIdsKey}:${context.workspaceGeneration}`;
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : "Could not load current quota History.";
}

export function createQuotaCurrentPeriodHistoryRuntime(
  onStateChange: (state: QuotaCurrentPeriodHistoryRuntimeState) => void,
): QuotaCurrentPeriodHistoryRuntime {
  let state = EMPTY_STATE;
  let context: RuntimeContext | null = null;
  let contextEpoch = 0;
  let activeRequestKey: string | null = null;
  const refreshCoordinator = createSingleFlightRefreshCoordinator<boolean>();

  const publish = (next: QuotaCurrentPeriodHistoryRuntimeState) => {
    state = next;
    onStateChange(next);
  };

  const setContext = (request: QuotaCurrentPeriodHistoryLoadRequest) => {
    const taskIds = normalizeTaskIds(request.taskIds);
    const taskIdsKey = request.taskContextKey ?? taskIds.join(",");
    const window = getQuotaCurrentPeriodHistoryWindow(request.logicalDate);
    const contextChanged = context?.ownerId !== request.ownerId
      || context?.logicalDate !== request.logicalDate
      || context?.taskIdsKey !== taskIdsKey
      || context?.workspaceGeneration !== request.workspaceGeneration;
    context = { ...request, contextEpoch, taskIds, taskIdsKey, window };
    if (contextChanged) {
      publish({
        ...EMPTY_STATE,
        logicalDate: request.logicalDate,
        ownerId: request.ownerId,
        taskIds,
        taskIdsKey,
        window,
        workspaceGeneration: request.workspaceGeneration,
      });
    }
  };

  const isCurrentContext = (requestContext: RuntimeContext) => (
    context?.contextEpoch === requestContext.contextEpoch
    && context?.ownerId === requestContext.ownerId
    && context?.logicalDate === requestContext.logicalDate
    && context?.taskIdsKey === requestContext.taskIdsKey
    && context?.workspaceGeneration === requestContext.workspaceGeneration
  );

  const runRequest = async (requestContext: RuntimeContext) => {
    activeRequestKey = requestKey(requestContext);
    if (!isCurrentContext(requestContext)) return false;

    publish({
      ...state,
      error: null,
      logicalDate: requestContext.logicalDate,
      ownerId: requestContext.ownerId,
      rowsByTaskId: {},
      status: "loading",
      taskIds: requestContext.taskIds,
      taskIdsKey: requestContext.taskIdsKey,
      window: requestContext.window,
      workspaceGeneration: requestContext.workspaceGeneration,
    });

    try {
      const rowsByTaskId = await fetchQuotaCurrentPeriodHistory(requestContext.client, {
        logicalDate: requestContext.logicalDate,
        ownerId: requestContext.ownerId,
        taskIds: requestContext.taskIds,
      });
      if (!isCurrentContext(requestContext)) return false;
      publish({
        error: null,
        logicalDate: requestContext.logicalDate,
        ownerId: requestContext.ownerId,
        rowsByTaskId,
        status: "ready",
        taskIds: requestContext.taskIds,
        taskIdsKey: requestContext.taskIdsKey,
        window: requestContext.window,
        workspaceGeneration: requestContext.workspaceGeneration,
      });
      return true;
    } catch (error) {
      if (!isCurrentContext(requestContext)) return false;
      publish({
        error: formatError(error),
        logicalDate: requestContext.logicalDate,
        ownerId: requestContext.ownerId,
        rowsByTaskId: {},
        status: "error",
        taskIds: requestContext.taskIds,
        taskIdsKey: requestContext.taskIdsKey,
        window: requestContext.window,
        workspaceGeneration: requestContext.workspaceGeneration,
      });
      return false;
    }
  };

  return {
    clear() {
      contextEpoch += 1;
      context = null;
      activeRequestKey = null;
      publish(EMPTY_STATE);
    },
    getState() {
      return state;
    },
    request(request, options = {}) {
      setContext(request);
      const requestContext = context as RuntimeContext;
      const nextRequestKey = requestKey(requestContext);
      if (refreshCoordinator.isRunning()) {
        if (!options.force && activeRequestKey === nextRequestKey) return refreshCoordinator.request(async () => false);
        return refreshCoordinator.request(() => runRequest(requestContext), { refreshAfterCurrent: true });
      }
      if (!options.force && activeRequestKey === nextRequestKey && state.status === "ready") return Promise.resolve(true);

      const promise = refreshCoordinator.request(() => runRequest(requestContext));
      void promise.then(() => {
        if (!refreshCoordinator.isRunning() && activeRequestKey === nextRequestKey) activeRequestKey = null;
      }, () => {
        if (!refreshCoordinator.isRunning() && activeRequestKey === nextRequestKey) activeRequestKey = null;
      });
      return promise;
    },
  };
}

export function quotaCurrentPeriodHistoryRowsForTask(
  state: Pick<QuotaCurrentPeriodHistoryRuntimeState, "rowsByTaskId" | "status">,
  taskId: string,
): readonly TaskHistory[] | undefined {
  return state.status === "ready" ? state.rowsByTaskId[taskId] ?? [] : undefined;
}
