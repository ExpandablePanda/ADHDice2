import { RECORDS_RULES_VERSION, type PersistedRecordCurrent, type PersistedRecordEvent, type ProvisionalRecordCandidate } from "@/lib/records/types";
import type { RecordTaskEvidenceByRecordIdentity } from "@/lib/records/evidence";

export type RecordsSessionSnapshot = {
  currentRecords: PersistedRecordCurrent[];
  events: PersistedRecordEvent[];
  hasSuccessfulResult: true;
  lastCalculatedAt: string;
  provisionalCandidates: ProvisionalRecordCandidate[];
  taskEvidenceByRecordIdentity: RecordTaskEvidenceByRecordIdentity;
  warnings: string[];
};

export type RecordsSessionRefresh = Omit<RecordsSessionSnapshot, "hasSuccessfulResult" | "lastCalculatedAt"> & {
  evaluatedAt: string;
};

const recordsSessionSnapshots = new Map<string, RecordsSessionSnapshot>();

export function buildRecordsSessionCacheKey(input: { logicalDayStart: string; rulesVersion?: string; timezone: string; userId: string }) {
  return `${input.userId}:${input.rulesVersion ?? RECORDS_RULES_VERSION}:${input.timezone}:${input.logicalDayStart}`;
}

function isRecordsSessionSnapshot(value: unknown): value is RecordsSessionSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<RecordsSessionSnapshot>;
  return snapshot.hasSuccessfulResult === true
    && typeof snapshot.lastCalculatedAt === "string"
    && Array.isArray(snapshot.currentRecords)
    && Array.isArray(snapshot.events)
    && Array.isArray(snapshot.provisionalCandidates)
    && Array.isArray(snapshot.warnings)
    && Boolean(snapshot.taskEvidenceByRecordIdentity)
    && typeof snapshot.taskEvidenceByRecordIdentity === "object";
}

export function getRecordsSessionSnapshot(key: string) {
  const snapshot = recordsSessionSnapshots.get(key);
  return snapshot && isRecordsSessionSnapshot(snapshot) ? snapshot : null;
}

export function createRecordsSessionSnapshot(input: RecordsSessionRefresh): RecordsSessionSnapshot {
  return {
    currentRecords: input.currentRecords,
    events: input.events,
    hasSuccessfulResult: true,
    lastCalculatedAt: input.evaluatedAt,
    provisionalCandidates: input.provisionalCandidates,
    taskEvidenceByRecordIdentity: input.taskEvidenceByRecordIdentity,
    warnings: input.warnings,
  };
}

export function setRecordsSessionSnapshot(key: string, input: RecordsSessionRefresh) {
  const snapshot = createRecordsSessionSnapshot(input);
  recordsSessionSnapshots.set(key, snapshot);
  return snapshot;
}

export function invalidateRecordsSessionSnapshot(key: string) {
  recordsSessionSnapshots.delete(key);
}

export function clearRecordsSessionCache() {
  recordsSessionSnapshots.clear();
}
