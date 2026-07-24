type WorkspaceStartupRequest<T> = {
  promise: Promise<T>;
};

export type WorkspaceStartupRequestHandle<T> = {
  joined: boolean;
  promise: Promise<T>;
};

/** Shares only in-flight authenticated startup requests; completed data is never cached. */
export function createWorkspaceStartupRequestRegistry() {
  const requests = new Map<string, WorkspaceStartupRequest<unknown>>();

  return {
    request<T>(userId: string, run: () => Promise<T>): WorkspaceStartupRequestHandle<T> {
      const existing = requests.get(userId) as WorkspaceStartupRequest<T> | undefined;
      if (existing) {
        return { joined: true, promise: existing.promise };
      }

      const request: WorkspaceStartupRequest<T> = { promise: Promise.resolve().then(run) };
      requests.set(userId, request);
      void request.promise.finally(() => {
        if (requests.get(userId) === request) {
          requests.delete(userId);
        }
      }).catch(() => {
        // The caller owns the original rejection.
      });
      return { joined: false, promise: request.promise };
    },
    invalidate(userId: string | null) {
      if (userId) {
        requests.delete(userId);
      }
    },
  };
}

export const workspaceStartupRequestRegistry = createWorkspaceStartupRequestRegistry();
