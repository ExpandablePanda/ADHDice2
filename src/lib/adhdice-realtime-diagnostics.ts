const REALTIME_DIAGNOSTIC_LIMIT = 256;
const PRIVATE_KEY_PATTERN = /access.?token|authorization|email|password|secret|title|note|content/i;

export type AdhdiceRealtimeDiagnosticInput = {
  kind: string;
  channel?: "task" | "workspace";
  channelDebugId?: string;
  [key: string]: unknown;
};

export type AdhdiceRealtimeDiagnosticRecord = {
  sequence: number;
  timestamp: string;
  kind: string;
  channel?: "task" | "workspace";
  channelDebugId?: string;
  [key: string]: unknown;
};

function sanitizeValue(key: string, value: unknown, depth = 0): unknown {
  if (PRIVATE_KEY_PATTERN.test(key) || depth > 3) return undefined;
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, 32)
      .map((entry) => sanitizeValue(key, entry, depth + 1))
      .filter((entry) => entry !== undefined);
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .map(([childKey, childValue]) => [childKey, sanitizeValue(childKey, childValue, depth + 1)] as const)
        .filter(([, childValue]) => childValue !== undefined),
    );
  }
  return undefined;
}

export function createAdhdiceRealtimeDiagnosticBuffer(limit = REALTIME_DIAGNOSTIC_LIMIT) {
  const entries: AdhdiceRealtimeDiagnosticRecord[] = [];
  let sequence = 0;

  return {
    record(input: AdhdiceRealtimeDiagnosticInput) {
      const { kind, channel, channelDebugId, ...details } = input;
      const record: AdhdiceRealtimeDiagnosticRecord = {
        channel,
        channelDebugId,
        kind,
        sequence: ++sequence,
        timestamp: new Date().toISOString(),
        ...Object.fromEntries(
          Object.entries(details)
            .map(([key, value]) => [key, sanitizeValue(key, value)] as const)
            .filter(([, value]) => value !== undefined),
        ),
      };
      if (!record.channel) delete record.channel;
      if (!record.channelDebugId) delete record.channelDebugId;
      entries.push(record);
      while (entries.length > Math.max(1, limit)) entries.shift();
      return record;
    },
    snapshot() {
      return entries.map((entry) => ({ ...entry }));
    },
    clear() {
      entries.splice(0);
    },
  };
}

const realtimeDiagnosticBuffer = createAdhdiceRealtimeDiagnosticBuffer();
let channelDebugSequence = 0;
const pendingAuthorityTaskIds = new Set<string>();

export function createAdhdiceRealtimeChannelDebugId(channel: "task" | "workspace") {
  return `${channel}-${++channelDebugSequence}`;
}

export function recordAdhdiceRealtimeDiagnostic(input: AdhdiceRealtimeDiagnosticInput) {
  if (process.env.NODE_ENV === "production") return null;
  return realtimeDiagnosticBuffer.record(input);
}

export function recordAdhdiceTaskPostgresEventDiagnostic(input: {
  channelDebugId: string;
  eventType: string;
  taskId: string | null;
  newRow: unknown;
}) {
  const row = input.newRow as { canonical_revision?: number | null; revision?: number | null; updated_at?: string | null } | null;
  return recordAdhdiceRealtimeDiagnostic({
    channel: "task",
    channelDebugId: input.channelDebugId,
    eventType: input.eventType,
    kind: "task_postgres_event_received",
    newCanonicalRevision: row?.canonical_revision ?? null,
    newRevision: row?.revision ?? null,
    taskId: input.taskId,
    updatedAt: row?.updated_at ?? null,
  });
}

export function readAdhdiceRealtimeDiagnostics() {
  return realtimeDiagnosticBuffer.snapshot();
}

export function clearAdhdiceRealtimeDiagnostics() {
  realtimeDiagnosticBuffer.clear();
  pendingAuthorityTaskIds.clear();
}

export function markAdhdiceRealtimeAuthorityPending(taskId: string) {
  if (process.env.NODE_ENV === "production") return;
  if (pendingAuthorityTaskIds.size >= 64 && !pendingAuthorityTaskIds.has(taskId)) {
    const oldestTaskId = pendingAuthorityTaskIds.values().next().value;
    if (typeof oldestTaskId === "string") pendingAuthorityTaskIds.delete(oldestTaskId);
  }
  pendingAuthorityTaskIds.add(taskId);
}

export function consumeAdhdiceRealtimeAuthorityPending() {
  const taskIds = [...pendingAuthorityTaskIds];
  pendingAuthorityTaskIds.clear();
  return taskIds;
}

declare global {
  interface Window {
    clearAdhdiceRealtimeDiagnostics?: () => void;
    copyAdhdiceRealtimeDiagnostics?: () => Promise<string>;
  }
}

export function installAdhdiceRealtimeDiagnostics() {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return () => {};

  window.copyAdhdiceRealtimeDiagnostics = async () => {
    const serialized = JSON.stringify(readAdhdiceRealtimeDiagnostics(), null, 2);
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(serialized);
        return serialized;
      } catch {
        console.info(serialized);
        return serialized;
      }
    }
    console.info(serialized);
    return serialized;
  };
  window.clearAdhdiceRealtimeDiagnostics = clearAdhdiceRealtimeDiagnostics;

  return () => {
    delete window.copyAdhdiceRealtimeDiagnostics;
    delete window.clearAdhdiceRealtimeDiagnostics;
  };
}
