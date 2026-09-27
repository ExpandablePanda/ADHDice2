type RealtimeSnapshotLifecycleState = "new" | "connected" | "disconnected";

const DISCONNECTED_STATUSES = new Set(["TIMED_OUT", "CHANNEL_ERROR", "CLOSED"]);

export function createRealtimeSnapshotLifecycle() {
  let channelState: RealtimeSnapshotLifecycleState = "new";
  let channelGeneration = 0;
  let hydration: { channelGeneration: number } | null = null;
  let hydrationFresh = false;
  let wasHidden = false;
  let wasOffline = false;
  let disposed = false;

  function beginHydration(force = false) {
    if (disposed || channelState !== "connected" || hydration) return false;
    if (!force && hydrationFresh) return false;
    hydration = { channelGeneration };
    hydrationFresh = false;
    return true;
  }

  return {
    handleStatus(status: string) {
      if (disposed) return false;
      if (status === "SUBSCRIBED") {
        if (channelState === "connected") return false;
        channelState = "connected";
        channelGeneration += 1;
        hydrationFresh = false;
        return beginHydration(true);
      }
      if (DISCONNECTED_STATUSES.has(status)) {
        if (channelState !== "disconnected") channelGeneration += 1;
        channelState = "disconnected";
        hydrationFresh = false;
      }
      return false;
    },
    handleVisibilityChange(visibilityState: DocumentVisibilityState) {
      if (visibilityState === "hidden") {
        wasHidden = true;
        return false;
      }
      if (visibilityState !== "visible") return false;
      const resumedFromHidden = wasHidden;
      wasHidden = false;
      return resumedFromHidden && beginHydration(true);
    },
    handlePageShow(persisted: boolean) {
      return persisted && beginHydration(true);
    },
    handleOffline() {
      wasOffline = true;
    },
    handleOnline() {
      if (!wasOffline) return false;
      wasOffline = false;
      return beginHydration(true);
    },
    handleBroadcast() {
      // Realtime payloads remain authoritative. A broadcast only retries a
      // snapshot when the current lifecycle is already known to be stale.
      return beginHydration();
    },
    completeHydration(succeeded = true) {
      const currentHydration = hydration;
      hydration = null;
      hydrationFresh = Boolean(
        succeeded
        && currentHydration
        && currentHydration.channelGeneration === channelGeneration
        && channelState === "connected",
      );
    },
    dispose() {
      disposed = true;
      hydration = null;
      hydrationFresh = false;
    },
  };
}
