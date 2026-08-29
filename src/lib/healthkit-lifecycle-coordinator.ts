export const HEALTHKIT_AUTO_SYNC_COOLDOWN_MS = 60_000;

export type HealthKitSyncTrigger = "automatic" | "manual";

type HealthKitLifecycleCoordinatorOptions<TSyncResult> = {
  isEligible: () => boolean | Promise<boolean>;
  onSync: (trigger: HealthKitSyncTrigger) => Promise<TSyncResult>;
  cooldownMs?: number;
  now?: () => number;
};

export type HealthKitLifecycleCoordinator<TSyncResult> = {
  requestAutomaticSync: () => Promise<boolean>;
  runManualSync: () => Promise<TSyncResult>;
};

/**
 * Converts native active-state events into bounded incremental Health syncs.
 * Manual refreshes share the single-flight guard but intentionally bypass the
 * automatic cooldown.
 */
export function createHealthKitLifecycleCoordinator<TSyncResult>({
  cooldownMs = HEALTHKIT_AUTO_SYNC_COOLDOWN_MS,
  isEligible,
  now = Date.now,
  onSync,
}: HealthKitLifecycleCoordinatorOptions<TSyncResult>): HealthKitLifecycleCoordinator<TSyncResult> {
  let lastAutomaticAttemptAt: number | null = null;
  let inFlight: Promise<unknown> | null = null;

  function startSync(trigger: HealthKitSyncTrigger) {
    const sync = Promise.resolve().then(() => onSync(trigger));
    const tracked = sync.finally(() => {
      if (inFlight === tracked) {
        inFlight = null;
      }
    });
    inFlight = tracked;
    return tracked;
  }

  async function requestAutomaticSync() {
    if (inFlight) {
      return false;
    }

    const requestedAt = now();
    if (lastAutomaticAttemptAt !== null && requestedAt - lastAutomaticAttemptAt < cooldownMs) {
      return false;
    }

    try {
      if (!(await isEligible())) {
        return false;
      }
    } catch {
      return false;
    }

    lastAutomaticAttemptAt = now();
    try {
      await startSync("automatic");
      return true;
    } catch {
      return false;
    }
  }

  function runManualSync() {
    if (inFlight) {
      return inFlight;
    }
    return startSync("manual");
  }

  return { requestAutomaticSync, runManualSync };
}
