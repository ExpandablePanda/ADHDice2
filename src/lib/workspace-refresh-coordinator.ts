export type WorkspaceRefreshRequest = {
  source: string;
};

export const WORKSPACE_STALE_RESUME_THRESHOLD_MS = 5 * 60 * 1000;

export type WorkspaceResumeRefreshReason = "stale-resume" | "online-reconnect" | "bfcache-restore";

type WorkspaceResumeRefreshCoordinator = {
  documentHidden: () => void;
  documentVisible: () => void;
  focus: () => void;
  offline: () => void;
  online: () => void;
  pageShow: (persisted: boolean) => void;
  dispose: () => void;
};

type CreateWorkspaceResumeRefreshCoordinatorOptions = {
  isInitialLoadActive: () => boolean;
  isRecentCoreLoad: () => boolean;
  onRefresh: (reason: WorkspaceResumeRefreshReason) => void;
  onSkip?: (reason: "short-hidden-duration" | "recent-core-load" | "focus-only" | "initial-load-active" | "ordinary-pageshow") => void;
  now?: () => number;
  debounceMs?: number;
};

/**
 * Converts browser lifecycle noise into intentional resume refreshes. Focus and
 * ordinary pageshow are informational only; a short hidden interval is not
 * evidence that the workspace needs a broad reconciliation.
 */
export function createWorkspaceResumeRefreshCoordinator({
  isInitialLoadActive,
  isRecentCoreLoad,
  onRefresh,
  onSkip,
  now = Date.now,
  debounceMs = 450,
}: CreateWorkspaceResumeRefreshCoordinatorOptions): WorkspaceResumeRefreshCoordinator {
  let hiddenAt: number | null = null;
  let wasOffline = false;
  let queuedReason: WorkspaceResumeRefreshReason | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  function request(reason: WorkspaceResumeRefreshReason) {
    queuedReason = reason;
    if (timeout !== null) {
      return;
    }

    timeout = setTimeout(() => {
      timeout = null;
      const nextReason = queuedReason;
      queuedReason = null;
      if (!nextReason) {
        return;
      }
      if (isInitialLoadActive()) {
        onSkip?.("initial-load-active");
        return;
      }
      if (nextReason === "stale-resume" && isRecentCoreLoad()) {
        onSkip?.("recent-core-load");
        return;
      }
      onRefresh(nextReason);
    }, debounceMs);
  }

  return {
    documentHidden() {
      hiddenAt = now();
    },
    documentVisible() {
      const hiddenDuration = hiddenAt === null ? 0 : now() - hiddenAt;
      hiddenAt = null;
      if (hiddenDuration < WORKSPACE_STALE_RESUME_THRESHOLD_MS) {
        onSkip?.("short-hidden-duration");
        return;
      }
      request("stale-resume");
    },
    focus() {
      onSkip?.("focus-only");
    },
    offline() {
      wasOffline = true;
    },
    online() {
      if (!wasOffline) {
        return;
      }
      wasOffline = false;
      request("online-reconnect");
    },
    pageShow(persisted) {
      if (!persisted) {
        onSkip?.("ordinary-pageshow");
        return;
      }
      request("bfcache-restore");
    },
    dispose() {
      if (timeout !== null) {
        clearTimeout(timeout);
        timeout = null;
      }
      queuedReason = null;
    },
  };
}

type WorkspaceRefreshCoordinator<TRequest extends WorkspaceRefreshRequest> = {
  request: (request: TRequest) => Promise<void>;
  isRunning: () => boolean;
};

/**
 * Keeps one mounted user's broad workspace refreshes single-flight. A different
 * event that arrives during a load gets one trailing pass; duplicate events join
 * the active pass rather than building a queue.
 */
export function createWorkspaceRefreshCoordinator<TRequest extends WorkspaceRefreshRequest>(
  run: (request: TRequest) => Promise<void>,
  onDecision?: (decision: "started" | "joined" | "queued" | "completed", request: TRequest) => void,
): WorkspaceRefreshCoordinator<TRequest> {
  let inFlight: Promise<void> | null = null;
  let activeRequest: TRequest | null = null;
  let trailingRequest: TRequest | null = null;

  function start(request: TRequest) {
    activeRequest = request;
    onDecision?.("started", request);
    inFlight = (async () => {
      let nextRequest: TRequest | null = request;
      while (nextRequest) {
        await run(nextRequest);
        onDecision?.("completed", nextRequest);
        nextRequest = trailingRequest;
        trailingRequest = null;
        activeRequest = nextRequest;
        if (nextRequest) {
          onDecision?.("started", nextRequest);
        }
      }
    })().finally(() => {
      inFlight = null;
      activeRequest = null;
    });
    return inFlight;
  }

  return {
    request(request) {
      if (!inFlight) {
        return start(request);
      }

      if (!trailingRequest && activeRequest?.source !== request.source) {
        trailingRequest = request;
        onDecision?.("queued", request);
      } else {
        onDecision?.("joined", request);
      }
      return inFlight;
    },
    isRunning() {
      return inFlight !== null;
    },
  };
}
