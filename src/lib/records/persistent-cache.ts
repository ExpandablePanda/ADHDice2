import { RECORD_METRICS, type ProvisionalRecordCandidate } from "@/lib/records/types";
import type { RecordTaskEvidenceByRecordIdentity } from "@/lib/records/evidence";
import { recordsTimestampsMatch } from "@/lib/records/freshness";

export const RECORDS_LOCAL_DETAIL_CACHE_SCHEMA_VERSION = 2;

export type RecordsLocalDetailCache = Readonly<{
  lastCalculatedAt: string;
  provisionalCandidates: ProvisionalRecordCandidate[];
  schemaVersion: typeof RECORDS_LOCAL_DETAIL_CACHE_SCHEMA_VERSION;
  sessionKey: string;
  taskEvidenceByRecordIdentity: RecordTaskEvidenceByRecordIdentity;
  warnings: string[];
}>;

function invalidationKey(sessionKey: string) {
  return `adhdice:records:invalidated:v1:${sessionKey}`;
}

function detailKey(sessionKey: string) {
  return `adhdice:records:details:v2:${sessionKey}`;
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCachedTaskEvidence(value: unknown): value is RecordTaskEvidenceByRecordIdentity {
  if (!isRecordObject(value)) return false;
  return Object.values(value).every((items) => Array.isArray(items) && items.every((item) => (
    isRecordObject(item)
      && typeof item.taskId === "string"
      && typeof item.title === "string"
      && (item.entityKind === "parent" || item.entityKind === "step")
      && (item.outcome === "done" || item.outcome === "did_my_best" || item.outcome === "complete")
      && typeof item.logicalDate === "string"
      && (item.occurrenceDueOn === null || typeof item.occurrenceDueOn === "string")
      && typeof item.sourceRowId === "string"
      && typeof item.occurrenceIdentity === "string"
  )));
}

function isCachedProvisionalCandidates(value: unknown): value is ProvisionalRecordCandidate[] {
  if (!Array.isArray(value)) return false;
  return value.every((candidate) => {
    if (!isRecordObject(candidate) || typeof candidate.candidateIdentity !== "string" || typeof candidate.metricKey !== "string" || !Object.hasOwn(RECORD_METRICS, candidate.metricKey) || candidate.status !== "provisional" || typeof candidate.value !== "number" || !Number.isFinite(candidate.value)) return false;
    if (candidate.scopeKind !== "global" && candidate.scopeKind !== "task") return false;
    if (candidate.scopeId !== null && typeof candidate.scopeId !== "string") return false;
    if (candidate.titleSnapshot !== null && typeof candidate.titleSnapshot !== "string") return false;
    if (candidate.periodEnd !== null && typeof candidate.periodEnd !== "string") return false;
    if (candidate.periodKey !== null && typeof candidate.periodKey !== "string") return false;
    if (candidate.periodStart !== null && typeof candidate.periodStart !== "string") return false;
    if (typeof candidate.creditedDate !== "string" || typeof candidate.evidenceFingerprint !== "string" || typeof candidate.firstQualifiedAt !== "string" || typeof candidate.unit !== "string") return false;
    return isRecordObject(candidate.evidence) && Array.isArray(candidate.evidence.identities) && candidate.evidence.identities.every((identity) => typeof identity === "string") && Array.isArray(candidate.evidence.sourceRows);
  });
}

export function getRecordsLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readRecordsInvalidatedAt(storage: Storage | null, sessionKey: string) {
  if (!storage) return null;
  try {
    const value = storage.getItem(invalidationKey(sessionKey));
    return value && Number.isFinite(Date.parse(value)) ? value : null;
  } catch {
    return null;
  }
}

export function markRecordsInvalidated(storage: Storage | null, sessionKey: string, invalidatedAt = new Date().toISOString()) {
  if (!storage) return false;
  try {
    storage.setItem(invalidationKey(sessionKey), invalidatedAt);
    return true;
  } catch {
    return false;
  }
}

export function clearRecordsInvalidation(storage: Storage | null, sessionKey: string) {
  if (!storage) return false;
  try {
    storage.removeItem(invalidationKey(sessionKey));
    return true;
  } catch {
    return false;
  }
}

export function readRecordsLocalDetailCache(storage: Storage | null, sessionKey: string, lastCalculatedAt: string) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(detailKey(sessionKey));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecordObject(parsed)
      || parsed.schemaVersion !== RECORDS_LOCAL_DETAIL_CACHE_SCHEMA_VERSION
      || parsed.sessionKey !== sessionKey
      || typeof parsed.lastCalculatedAt !== "string"
      || !recordsTimestampsMatch(parsed.lastCalculatedAt, lastCalculatedAt)
      || !isCachedProvisionalCandidates(parsed.provisionalCandidates)
      || !Array.isArray(parsed.warnings)
      || !parsed.warnings.every((warning) => typeof warning === "string")
      || !isCachedTaskEvidence(parsed.taskEvidenceByRecordIdentity)) return null;
    return parsed as unknown as RecordsLocalDetailCache;
  } catch {
    return null;
  }
}

export function writeRecordsLocalDetailCache(storage: Storage | null, input: Omit<RecordsLocalDetailCache, "schemaVersion">) {
  if (!storage) return false;

  const serialize = (provisionalCandidates: ProvisionalRecordCandidate[]) => JSON.stringify({
    lastCalculatedAt: input.lastCalculatedAt,
    provisionalCandidates,
    schemaVersion: RECORDS_LOCAL_DETAIL_CACHE_SCHEMA_VERSION,
    sessionKey: input.sessionKey,
    taskEvidenceByRecordIdentity: input.taskEvidenceByRecordIdentity,
    warnings: input.warnings,
  });

  let fullSerialized: string | null = null;
  let fullError: unknown = null;
  try {
    fullSerialized = serialize(input.provisionalCandidates);
    storage.setItem(detailKey(input.sessionKey), fullSerialized);
    return true;
  } catch (error) {
    fullError = error;
  }

  let reducedSerialized: string | null = null;
  let reducedError: unknown = null;
  try {
    reducedSerialized = serialize([]);
    storage.setItem(detailKey(input.sessionKey), reducedSerialized);
    return true;
  } catch (error) {
    reducedError = error;
  }

  if (process.env.NODE_ENV !== "production") {
    const describeError = (error: unknown) => error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === "string" ? error : "unknown error";
    const describeSize = (label: string, serialized: string | null) => `${label}=${serialized === null ? "unavailable" : `${serialized.length} chars`}`;
    console.warn(`[records cache] rich detail write failed (${describeSize("full", fullSerialized)}, ${describeSize("reduced", reducedSerialized)}; full=${describeError(fullError)}; reduced=${describeError(reducedError)})`);
  }

  return false;
}
