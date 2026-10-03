import {
  fetchHomeCurrentDayHistory,
  type HomeCurrentDayHistoryClient,
} from "./home-current-day-history-repository.ts";
import { isWorkspacePerformanceDiagnosticsEnabled } from "./workspace-performance-diagnostics.ts";
import { createSingleFlightRefreshCoordinator } from "./workspace-refresh-coordinator.ts";
import type { TaskHistory } from "./database.types.ts";

export type HomeCurrentDayHistoryLoadStatus = "idle" | "loading" | "ready" | "error";

export type HomeCurrentDayHistoryRuntimeState = {
  error: string | null;
  logicalDate: string | null;
  ownerId: string | null;
  rows: TaskHistory[];
  status: HomeCurrentDayHistoryLoadStatus;
  workspaceGeneration: number | null;
};

export type HomeCurrentDayHistoryLoadRequest = {
  client: HomeCurrentDayHistoryClient;
  logicalDate: string;
  ownerId: string;
  reason: string;
  workspaceGeneration: number;
};

export type HomeCurrentDayHistoryRuntime = {
  clear: () => void;
  getState: () => HomeCurrentDayHistoryRuntimeState;
  invalidate: (request: Pick<HomeCurrentDayHistoryLoadRequest, "logicalDate" | "ownerId" | "workspaceGeneration">) => void;
  request: (request: HomeCurrentDayHistoryLoadRequest, options?: { force?: boolean }) => Promise<boolean>;
};

type RuntimeContext = HomeCurrentDayHistoryLoadRequest & { contextEpoch: number };

const EMPTY_STATE: HomeCurrentDayHistoryRuntimeState = {
  error: null,
  logicalDate: null,
  ownerId: null,
  rows: [],
  status: "idle",
  workspaceGeneration: null,
};

function requestKey(context: RuntimeContext) {
  return `${context.contextEpoch}:${context.ownerId}:${context.logicalDate}:${context.workspaceGeneration}`;
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : "Could not load today's completions.";
}

function successfulRowCount(rows: readonly TaskHistory[]) {
  return rows.filter((row) => row.status === "done" || row.status === "did_my_best" || row.status === "complete").length;
}

export function createHomeCurrentDayHistoryRuntime(
  onStateChange: (state: HomeCurrentDayHistoryRuntimeState) => void,
): HomeCurrentDayHistoryRuntime {
  let state = EMPTY_STATE;
  let context: RuntimeContext | null = null;
  let contextEpoch = 0;
  let activeRequestKey: string | null = null;
  const refreshCoordinator = createSingleFlightRefreshCoordinator<boolean>();

  const publish = (next: HomeCurrentDayHistoryRuntimeState) => {
    state = next;
    onStateChange(next);
  };

  const setContext = (request: HomeCurrentDayHistoryLoadRequest) => {
    const contextChanged = context?.ownerId !== request.ownerId
      || context?.logicalDate !== request.logicalDate
      || context?.workspaceGeneration !== request.workspaceGeneration;
    if (contextChanged) contextEpoch += 1;
    context = { ...request, contextEpoch };
    if (contextChanged) {
      publish({
        ...EMPTY_STATE,
        logicalDate: request.logicalDate,
        ownerId: request.ownerId,
        workspaceGeneration: request.workspaceGeneration,
      });
    }
  };

  const isCurrentContext = (requestContext: RuntimeContext) => (
    context?.contextEpoch === requestContext.contextEpoch
    && context.ownerId === requestContext.ownerId
    && context.logicalDate === requestContext.logicalDate
    && context.workspaceGeneration === requestContext.workspaceGeneration
  );

  const hasReadyResultForContext = (requestContext: RuntimeContext) => (
    state.status === "ready"
    && state.ownerId === requestContext.ownerId
    && state.logicalDate === requestContext.logicalDate
    && state.workspaceGeneration === requestContext.workspaceGeneration
  );

  const logDiagnostic = (
    requestContext: RuntimeContext,
    requestStatus: HomeCurrentDayHistoryLoadStatus,
    rows: readonly TaskHistory[],
    extra = "",
  ) => {
    if (!isWorkspacePerformanceDiagnosticsEnabled()) return;
    console.info(
      `[home-current-day-history] owner=${requestContext.ownerId}`
        + ` logicalDay=${requestContext.logicalDate}`
        + ` reason=${requestContext.reason}`
        + ` rows=${rows.length}`
        + ` successfulRows=${successfulRowCount(rows)}`
        + ` generation=${requestContext.workspaceGeneration}`
        + ` requestStatus=${requestStatus}`
        + `${extra ? ` ${extra}` : ""}`,
    );
  };

  const runRequest = async (requestContext: RuntimeContext) => {
    activeRequestKey = requestKey(requestContext);
    if (!isCurrentContext(requestContext)) return false;

    const retainReadyResult = hasReadyResultForContext(requestContext);
    publish({
      ...state,
      error: null,
      logicalDate: requestContext.logicalDate,
      ownerId: requestContext.ownerId,
      status: retainReadyResult ? "ready" : "loading",
      workspaceGeneration: requestContext.workspaceGeneration,
    });
    logDiagnostic(requestContext, retainReadyResult ? "ready" : "loading", state.rows, retainReadyResult ? "phase=revalidate" : "");

    try {
      const rows = await fetchHomeCurrentDayHistory(requestContext.client, {
        logicalDate: requestContext.logicalDate,
        ownerId: requestContext.ownerId,
      });
      if (!isCurrentContext(requestContext)) {
        if (isWorkspacePerformanceDiagnosticsEnabled()) {
          console.info(
            `[home-current-day-history] owner=${requestContext.ownerId}`
              + ` logicalDay=${requestContext.logicalDate}`
              + ` reason=${requestContext.reason}`
              + ` rows=${rows.length}`
              + ` successfulRows=${successfulRowCount(rows)}`
              + ` generation=${requestContext.workspaceGeneration}`
              + " requestStatus=discarded",
          );
        }
        return false;
      }

      publish({
        error: null,
        logicalDate: requestContext.logicalDate,
        ownerId: requestContext.ownerId,
        rows,
        status: "ready",
        workspaceGeneration: requestContext.workspaceGeneration,
      });
      logDiagnostic(requestContext, "ready", rows);
      return true;
    } catch (error) {
      if (!isCurrentContext(requestContext)) return false;

      const message = formatError(error);
      if (retainReadyResult) {
        publish({
          ...state,
          error: message,
          logicalDate: requestContext.logicalDate,
          ownerId: requestContext.ownerId,
          status: "ready",
          workspaceGeneration: requestContext.workspaceGeneration,
        });
        logDiagnostic(requestContext, "ready", state.rows, `phase=revalidate error=${message}`);
        return false;
      }

      publish({
        error: message,
        logicalDate: requestContext.logicalDate,
        ownerId: requestContext.ownerId,
        rows: state.rows,
        status: "error",
        workspaceGeneration: requestContext.workspaceGeneration,
      });
      logDiagnostic(requestContext, "error", state.rows, `error=${message}`);
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
    invalidate(request) {
      contextEpoch += 1;
      context = null;
      activeRequestKey = null;
      publish({
        ...EMPTY_STATE,
        logicalDate: request.logicalDate,
        ownerId: request.ownerId,
        workspaceGeneration: request.workspaceGeneration,
      });
    },
    request(request, options = {}) {
      setContext(request);
      const requestContext = context as RuntimeContext;
      const nextRequestKey = requestKey(requestContext);
      if (refreshCoordinator.isRunning()) {
        if (!options.force && activeRequestKey === nextRequestKey) {
          return refreshCoordinator.request(async () => false);
        }
        return refreshCoordinator.request(() => runRequest(requestContext), { refreshAfterCurrent: true });
      }

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
