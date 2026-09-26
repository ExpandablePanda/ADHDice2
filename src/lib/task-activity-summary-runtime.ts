import {
  fetchTaskActivitySummary,
  type TaskActivitySummaryClient,
} from "./task-activity-summary-repository";
import {
  TaskActivitySummaryError,
  type TaskActivitySummary,
} from "./task-activity-summary";
import { isWorkspacePerformanceDiagnosticsEnabled } from "./workspace-performance-diagnostics";
import { createSingleFlightRefreshCoordinator } from "./workspace-refresh-coordinator";

export type TaskActivitySummaryLoadStatus = "idle" | "loading" | "ready" | "error";

export type TaskActivitySummaryRuntimeState = {
  error: string | null;
  logicalDate: string | null;
  ownerId: string | null;
  status: TaskActivitySummaryLoadStatus;
  summary: TaskActivitySummary | null;
};

export type TaskActivitySummaryLoadRequest = {
  client: TaskActivitySummaryClient;
  logicalDate: string;
  ownerId: string;
  reason: string;
  workspaceGeneration: number;
};

export type TaskActivitySummaryRuntime = {
  clear: () => void;
  getState: () => TaskActivitySummaryRuntimeState;
  request: (request: TaskActivitySummaryLoadRequest, options?: { force?: boolean }) => Promise<boolean>;
};

type RuntimeContext = TaskActivitySummaryLoadRequest & { contextEpoch: number };

const EMPTY_STATE: TaskActivitySummaryRuntimeState = {
  error: null,
  logicalDate: null,
  ownerId: null,
  status: "idle",
  summary: null,
};

function requestKey(context: RuntimeContext) {
  return `${context.contextEpoch}:${context.ownerId}:${context.logicalDate}:${context.workspaceGeneration}`;
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : "Could not load the Task activity summary.";
}

export function createTaskActivitySummaryRuntime(
  onStateChange: (state: TaskActivitySummaryRuntimeState) => void,
): TaskActivitySummaryRuntime {
  let state = EMPTY_STATE;
  let context: RuntimeContext | null = null;
  let contextEpoch = 0;
  let activeRequestKey: string | null = null;
  const refreshCoordinator = createSingleFlightRefreshCoordinator<boolean>();

  const publish = (next: TaskActivitySummaryRuntimeState) => {
    state = next;
    onStateChange(next);
  };

  const setContext = (request: TaskActivitySummaryLoadRequest) => {
    const ownerOrDateChanged = context?.ownerId !== request.ownerId || context?.logicalDate !== request.logicalDate;
    context = { ...request, contextEpoch };
    if (ownerOrDateChanged) {
      publish({
        ...EMPTY_STATE,
        logicalDate: request.logicalDate,
        ownerId: request.ownerId,
      });
    }
  };

  const isCurrentContext = (requestContext: RuntimeContext) => (
    context?.contextEpoch === requestContext.contextEpoch
    && context.ownerId === requestContext.ownerId
    && context.logicalDate === requestContext.logicalDate
    && context.workspaceGeneration === requestContext.workspaceGeneration
  );

  const runRequest = async (requestContext: RuntimeContext) => {
    activeRequestKey = requestKey(requestContext);
    if (!isCurrentContext(requestContext)) {
      return false;
    }

    publish({
      ...state,
      error: null,
      logicalDate: requestContext.logicalDate,
      ownerId: requestContext.ownerId,
      status: "loading",
    });
    const startedAt = typeof performance === "undefined" ? 0 : performance.now();

    try {
      const summary = await fetchTaskActivitySummary(requestContext.client, requestContext.logicalDate);
      if (summary.as_of_logical_date !== requestContext.logicalDate) {
        throw new TaskActivitySummaryError(
          "malformed-response",
          `Task activity summary returned ${summary.as_of_logical_date} for ${requestContext.logicalDate}.`,
        );
      }
      if (!isCurrentContext(requestContext)) {
        if (isWorkspacePerformanceDiagnosticsEnabled()) {
          console.info(
            `[task-activity-summary] discarded source=${requestContext.reason}`
              + ` logicalDate=${requestContext.logicalDate} stale=true reason=context-changed`,
          );
        }
        return false;
      }

      publish({
        error: null,
        logicalDate: requestContext.logicalDate,
        ownerId: requestContext.ownerId,
        status: "ready",
        summary,
      });
      if (isWorkspacePerformanceDiagnosticsEnabled()) {
        const durationMs = startedAt === 0 ? null : Math.round(performance.now() - startedAt);
        console.info(
          `[task-activity-summary] loaded source=${requestContext.reason}`
            + ` logicalDate=${summary.as_of_logical_date}`
            + ` revision=${summary.history_current_revision}`
            + ` epoch=${summary.history_sync_epoch}`
            + ` rpcMs=${durationMs ?? "unknown"}`
            + ` payloadBytes=${JSON.stringify(summary).length}`,
        );
      }
      return true;
    } catch (error) {
      if (!isCurrentContext(requestContext)) {
        if (isWorkspacePerformanceDiagnosticsEnabled()) {
          console.info(
            `[task-activity-summary] discarded source=${requestContext.reason}`
              + ` logicalDate=${requestContext.logicalDate} stale=true reason=context-changed`,
          );
        }
        return false;
      }

      const message = formatError(error);
      publish({
        error: message,
        logicalDate: requestContext.logicalDate,
        ownerId: requestContext.ownerId,
        status: "error",
        summary: state.summary,
      });
      if (isWorkspacePerformanceDiagnosticsEnabled()) {
        console.info(
          `[task-activity-summary] failed source=${requestContext.reason}`
            + ` logicalDate=${requestContext.logicalDate}`
            + ` retainedLastKnownGood=${state.summary !== null}`
            + ` error=${message}`,
        );
      }
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
        if (!options.force && activeRequestKey === nextRequestKey) {
          return refreshCoordinator.request(async () => false);
        }
        return refreshCoordinator.request(() => runRequest(requestContext), { refreshAfterCurrent: true });
      }

      const promise = refreshCoordinator.request(() => runRequest(requestContext));
      void promise.then(() => {
        if (!refreshCoordinator.isRunning() && activeRequestKey === nextRequestKey) {
          activeRequestKey = null;
        }
      }, () => {
        if (!refreshCoordinator.isRunning() && activeRequestKey === nextRequestKey) {
          activeRequestKey = null;
        }
      });
      return promise;
    },
  };
}
