export type RealtimeGapChannel = "workspace" | "task" | "projection";

export type RealtimeGapStatus =
  | "SUBSCRIBED"
  | "CHANNEL_ERROR"
  | "TIMED_OUT"
  | "CLOSED"
  | string;

export type RealtimeGapIncident = {
  generation: number;
  firstUnhealthyAt: number;
  affectedChannels: RealtimeGapChannel[];
  statusesByChannel: Record<string, string[]>;
};

type RealtimeGapStatusOptions = {
  error?: unknown;
  expectedCleanup?: boolean;
  now?: number;
};

type RealtimeGapCoordinatorOptions = {
  recover: (incident: RealtimeGapIncident) => Promise<void> | void;
  now?: () => number;
  onChannelResubscribed?: (incident: RealtimeGapIncident, channel: RealtimeGapChannel) => void;
  onChannelUnhealthy?: (incident: RealtimeGapIncident, channel: RealtimeGapChannel, status: RealtimeGapStatus, error?: unknown) => void;
  onGapOpened?: (incident: RealtimeGapIncident, channel: RealtimeGapChannel, status: RealtimeGapStatus, error?: unknown) => void;
  onRecoveryCompleted?: (incident: RealtimeGapIncident) => void;
  onRecoveryError?: (incident: RealtimeGapIncident, error: unknown) => void;
  onRecoveryJoined?: (incident: RealtimeGapIncident) => void;
  onRecoveryRequested?: (incident: RealtimeGapIncident) => void;
  onRecoveryStarted?: (incident: RealtimeGapIncident) => void;
};

type ChannelState = {
  hasHealthySubscription: boolean;
  lastStatus: RealtimeGapStatus;
};

const UNHEALTHY_STATUSES = new Set<RealtimeGapStatus>([
  "CHANNEL_ERROR",
  "TIMED_OUT",
  "CLOSED",
]);

function cloneIncident(
  generation: number,
  firstUnhealthyAt: number,
  affectedChannels: Set<RealtimeGapChannel>,
  statusesByChannel: Map<RealtimeGapChannel, Set<string>>,
): RealtimeGapIncident {
  return {
    affectedChannels: [...affectedChannels],
    firstUnhealthyAt,
    generation,
    statusesByChannel: Object.fromEntries(
      [...statusesByChannel.entries()].map(([channel, statuses]) => [channel, [...statuses]]),
    ),
  };
}

/**
 * Tracks post-subscription Realtime transport gaps without making transport
 * status itself an application-data authority. A recovery starts only after
 * every channel affected by the incident has subscribed again, and duplicate
 * status callbacks join the same incident/recovery.
 */
export function createRealtimeGapCoordinator({
  recover,
  now = Date.now,
  onChannelResubscribed,
  onChannelUnhealthy,
  onGapOpened,
  onRecoveryCompleted,
  onRecoveryError,
  onRecoveryJoined,
  onRecoveryRequested,
  onRecoveryStarted,
}: RealtimeGapCoordinatorOptions) {
  const channelState = new Map<RealtimeGapChannel, ChannelState>();
  let nextGeneration = 0;
  let incident: {
    generation: number;
    firstUnhealthyAt: number;
    affectedChannels: Set<RealtimeGapChannel>;
    resubscribedChannels: Set<RealtimeGapChannel>;
    statusesByChannel: Map<RealtimeGapChannel, Set<string>>;
    recoveryRequested: boolean;
    recoveryInFlight: boolean;
    trailingRecoveryRequested: boolean;
  } | null = null;
  let disposed = false;

  function stateFor(channel: RealtimeGapChannel) {
    const existing = channelState.get(channel);
    if (existing) return existing;
    const next = { hasHealthySubscription: false, lastStatus: "CLOSED" as RealtimeGapStatus };
    channelState.set(channel, next);
    return next;
  }

  function incidentSnapshot() {
    if (!incident) return null;
    return cloneIncident(
      incident.generation,
      incident.firstUnhealthyAt,
      incident.affectedChannels,
      incident.statusesByChannel,
    );
  }

  function allAffectedChannelsResubscribed() {
    return Boolean(
      incident
      && incident.affectedChannels.size > 0
      && [...incident.affectedChannels].every((channel) => incident.resubscribedChannels.has(channel)),
    );
  }

  function requestRecoveryIfReady() {
    if (disposed || !incident || !allAffectedChannelsResubscribed()) return;
    if (incident.recoveryInFlight) {
      onRecoveryJoined?.(incidentSnapshot()!);
      return;
    }
    if (incident.recoveryRequested) {
      onRecoveryJoined?.(incidentSnapshot()!);
      return;
    }

    incident.recoveryRequested = true;
    const recoveryIncident = incidentSnapshot()!;
    onRecoveryRequested?.(recoveryIncident);
    const recovery = incident;
    recovery.recoveryInFlight = true;
    void Promise.resolve()
      .then(async () => {
        onRecoveryStarted?.(recoveryIncident);
        await recover(recoveryIncident);
      })
      .then(
        () => {
          if (disposed || incident !== recovery) return;
          recovery.recoveryInFlight = false;
          onRecoveryCompleted?.(recoveryIncident);
          if (recovery.trailingRecoveryRequested) {
            recovery.trailingRecoveryRequested = false;
            recovery.recoveryRequested = false;
            requestRecoveryIfReady();
            return;
          }
          incident = null;
        },
        (error) => {
          if (disposed || incident !== recovery) return;
          recovery.recoveryInFlight = false;
          onRecoveryError?.(recoveryIncident, error);
          if (recovery.trailingRecoveryRequested) {
            recovery.trailingRecoveryRequested = false;
            recovery.recoveryRequested = false;
            requestRecoveryIfReady();
            return;
          }
          incident = null;
        },
      );
  }

  return {
    reportStatus(channel: RealtimeGapChannel, status: RealtimeGapStatus, options: RealtimeGapStatusOptions = {}) {
      if (disposed) return;
      const state = stateFor(channel);
      const timestamp = options.now ?? now();
      const expectedCleanup = options.expectedCleanup === true;
      const wasHealthy = state.hasHealthySubscription;
      state.lastStatus = status;

      if (status === "SUBSCRIBED") {
        state.hasHealthySubscription = true;
        if (!incident || !incident.affectedChannels.has(channel)) return;
        const wasResubscribed = incident.resubscribedChannels.has(channel);
        incident.resubscribedChannels.add(channel);
        if (!wasResubscribed) {
          const snapshot = incidentSnapshot()!;
          onChannelResubscribed?.(snapshot, channel);
        }
        requestRecoveryIfReady();
        return;
      }

      if (!UNHEALTHY_STATUSES.has(status) || expectedCleanup || !wasHealthy) return;

      if (!incident) {
        nextGeneration += 1;
        incident = {
          affectedChannels: new Set([channel]),
          firstUnhealthyAt: timestamp,
          generation: nextGeneration,
          recoveryInFlight: false,
          recoveryRequested: false,
          resubscribedChannels: new Set(),
          statusesByChannel: new Map([[channel, new Set([status])]]),
          trailingRecoveryRequested: false,
        };
        onGapOpened?.(incidentSnapshot()!, channel, status, options.error);
      } else {
        const wasAffected = incident.affectedChannels.has(channel);
        incident.affectedChannels.add(channel);
        const statuses = incident.statusesByChannel.get(channel) ?? new Set<string>();
        statuses.add(status);
        incident.statusesByChannel.set(channel, statuses);
        incident.resubscribedChannels.delete(channel);
        if (incident.recoveryInFlight && (!wasAffected || status !== "SUBSCRIBED")) {
          incident.trailingRecoveryRequested = true;
        }
      }

      onChannelUnhealthy?.(incidentSnapshot()!, channel, status, options.error);
    },
    getActiveIncident() {
      return incidentSnapshot();
    },
    reset() {
      incident = null;
      channelState.clear();
    },
    dispose() {
      disposed = true;
      incident = null;
      channelState.clear();
    },
  };
}

export type RealtimeGapCoordinator = ReturnType<typeof createRealtimeGapCoordinator>;
