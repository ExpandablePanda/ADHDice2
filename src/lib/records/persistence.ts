import { RECORD_METRICS, RECORDS_RULES_VERSION, type DurableCurrentRecord, type DurableRecordEvent, type RecordEvidence, type RecordMetricKey, type RecordsEvaluation } from "@/lib/records/types";

export const RECORDS_EVIDENCE_SCHEMA_VERSION = 2;
export const RECORDS_MANIFEST_SCHEMA_VERSION = 1;
export const RECORDS_CHUNK_TARGET_BYTES = 400 * 1024;
export const RECORDS_CHUNK_CLIENT_MAX_BYTES = 750 * 1024;
export const RECORDS_COMPACT_TOTAL_MAX_BYTES = 2 * 1024 * 1024;
export const RECORDS_EVIDENCE_MAX_BYTES = 8 * 1024;

export type RecordsRowKind = "current" | "event";
export type RecordsSectionKey = "global_tasks" | "streaks" | "focus" | "per_task" | "record_history";

export type CompactRecordEvidence = {
  schemaVersion: 2;
  kind: "period_aggregate" | "streak" | "biggest_comeback" | "focus_session" | "occurrence";
  evidenceDigest: string;
  evidenceCount: number;
  creditedDate?: string;
  periodKey?: string;
  periodStart?: string;
  periodEnd?: string;
  streakStart?: string;
  streakEnd?: string;
  streakLength?: number;
  missedRunStart?: string;
  missedRunEnd?: string;
  missedCount?: number;
  missedEvidenceDigest?: string;
  successfulEndpointDate?: string;
  successfulEndpointIdentity?: string;
  occurrenceIdentity?: string;
  sourceRowId?: string;
  result?: string;
  entityKind?: string;
  entityId?: string;
  focusSessionId?: string;
  logicalDate?: string;
  durationSeconds?: number;
  categoryId?: string;
  sessionScopeIdentity?: string;
  scalarValue: number;
  scalarUnit: string;
};

export type CompactCurrentRecordRow = ReturnType<typeof compactCurrentRow>;
export type CompactRecordEventRow = ReturnType<typeof compactEventRow>;
export type CompactRecordsRow = CompactCurrentRecordRow | CompactRecordEventRow;

export type RecordsReconciliationChunk = {
  rowKind: RecordsRowKind;
  sectionKey: RecordsSectionKey;
  chunkIndex: number;
  chunkDigest: string;
  rowCount: number;
  rows: CompactRecordsRow[];
  bytes: number;
};

export type RecordsExpectedPartition = {
  row_kind: RecordsRowKind;
  section_key: RecordsSectionKey;
  chunk_count: number;
  row_count: number;
};

export type RecordsReconciliationManifest = {
  manifest_schema_version: 1;
  evidence_schema_version: 2;
  rules_version: typeof RECORDS_RULES_VERSION;
  manifest_digest: string;
  evaluation_digest: string;
  evaluated_at: string;
  timezone: string;
  logical_day_start: string;
  expected_partitions: RecordsExpectedPartition[];
  expected_current_row_count: number;
  expected_event_row_count: number;
  expected_chunk_count: number;
};

export type SerializedRecordsReconciliation = {
  chunks: RecordsReconciliationChunk[];
  currentRows: CompactCurrentRecordRow[];
  eventRows: CompactRecordEventRow[];
  manifest: RecordsReconciliationManifest;
  measurements: {
    compactTotalBytes: number;
    totalChunks: number;
    maximumChunkBytes: number;
    maximumEvidenceBytes: number;
    currentRowCount: number;
    eventRowCount: number;
  };
};

const textEncoder = new TextEncoder();

export function utf8Bytes(value: unknown) {
  return textEncoder.encode(typeof value === "string" ? value : JSON.stringify(value)).byteLength;
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export async function recordsSha256(value: unknown) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", textEncoder.encode(canonicalize(value)));
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function sortedIdentities(evidence: RecordEvidence) {
  return [...new Set(evidence.identities.map(String))].sort();
}

function sourceRows(evidence: RecordEvidence) {
  return evidence.sourceRows as Array<Record<string, string | number | boolean | null | undefined>>;
}

function evidenceKind(metricKey: RecordMetricKey) {
  if (metricKey === "longest_focus_session") return "focus_session" as const;
  if (metricKey === "task_biggest_comeback") return "biggest_comeback" as const;
  if (metricKey.endsWith("_streak")) return "streak" as const;
  return "period_aggregate" as const;
}

export async function compactRecordEvidence(record: Pick<DurableCurrentRecord | DurableRecordEvent, "creditedDate" | "evidence" | "metricKey" | "periodEnd" | "periodKey" | "periodStart" | "unit" | "value">): Promise<CompactRecordEvidence> {
  const identities = sortedIdentities(record.evidence);
  const rows = sourceRows(record.evidence);
  const digestInput = { evidenceContractVersion: RECORDS_EVIDENCE_SCHEMA_VERSION, identities };
  const base = {
    schemaVersion: RECORDS_EVIDENCE_SCHEMA_VERSION,
    kind: evidenceKind(record.metricKey),
    evidenceDigest: await recordsSha256(digestInput),
    evidenceCount: identities.length,
    creditedDate: record.creditedDate,
    scalarValue: record.value,
    scalarUnit: record.unit,
  } satisfies CompactRecordEvidence;

  if (base.kind === "focus_session") {
    const row = rows[0] ?? {};
    return {
      ...base,
      focusSessionId: String(row.source_row_id ?? identities[0]?.replace(/^focus:/, "") ?? ""),
      logicalDate: String(row.session_date ?? record.creditedDate),
      durationSeconds: Number(row.duration_seconds ?? record.value),
      ...(row.category_id ? { categoryId: String(row.category_id) } : {}),
      sessionScopeIdentity: String(row.runtime_session_id ?? row.source ?? "focus"),
    };
  }
  if (base.kind === "biggest_comeback") {
    const endpoint = rows.at(-1) ?? {};
    const missed = rows.slice(0, -1);
    const occurrenceIdentity = (row: Record<string, string | number | boolean | null | undefined>) =>
      row.task_id && row.canonical_occurrence_identity ? `task:${row.task_id}:${row.canonical_occurrence_identity}` : "";
    return {
      ...base,
      missedRunStart: record.periodStart ?? record.creditedDate,
      missedRunEnd: String(missed.at(-1)?.occurrence_due_on ?? missed.at(-1)?.entry_date ?? record.periodStart ?? record.creditedDate),
      missedCount: record.value,
      missedEvidenceDigest: await recordsSha256({ evidenceContractVersion: RECORDS_EVIDENCE_SCHEMA_VERSION, identities: missed.map(occurrenceIdentity).filter(Boolean).sort() }),
      ...(endpoint.entity_kind ? { entityKind: String(endpoint.entity_kind) } : {}),
      successfulEndpointDate: String(endpoint.occurrence_due_on ?? endpoint.entry_date ?? record.periodEnd ?? record.creditedDate),
      successfulEndpointIdentity: occurrenceIdentity(endpoint) || identities.at(-1) || "",
    };
  }
  if (base.kind === "streak") {
    return {
      ...base,
      ...(rows[0]?.entity_kind ? { entityKind: String(rows[0].entity_kind) } : {}),
      streakStart: record.periodStart ?? record.creditedDate,
      streakEnd: record.periodEnd ?? record.creditedDate,
      streakLength: record.value,
    };
  }
  if (base.kind === "period_aggregate") {
    return {
      ...base,
      ...(record.periodKey ? { periodKey: record.periodKey } : {}),
      ...(record.periodStart ? { periodStart: record.periodStart } : {}),
      ...(record.periodEnd ? { periodEnd: record.periodEnd } : {}),
    };
  }
  const row = rows[0] ?? {};
  return {
    ...base,
    occurrenceIdentity: String(row.canonical_occurrence_identity ?? identities[0] ?? ""),
    ...(row.source_row_id ? { sourceRowId: String(row.source_row_id) } : {}),
    ...(row.status ? { result: String(row.status) } : {}),
    ...(row.entity_kind ? { entityKind: String(row.entity_kind) } : {}),
    ...(row.task_id ? { entityId: String(row.task_id) } : {}),
  };
}

function recordSection(metricKey: RecordMetricKey): Exclude<RecordsSectionKey, "record_history"> {
  const section = RECORD_METRICS[metricKey].section;
  return section === "tasks" ? "global_tasks" : section;
}

function compactCurrentRow(record: DurableCurrentRecord, evidence: CompactRecordEvidence) {
  return {
    record_identity: `${record.metricKey}:${record.scopeKind}:${record.scopeId ?? "global"}`,
    metric_key: record.metricKey,
    scope_kind: record.scopeKind,
    scope_id: record.scopeId,
    title_snapshot: record.titleSnapshot,
    value: record.value,
    unit: record.unit,
    credited_date: record.creditedDate,
    period_key: record.periodKey,
    period_start: record.periodStart,
    period_end: record.periodEnd,
    candidate_identity: record.candidateIdentity,
    first_achieved_at: record.firstAchievedAt,
    evidence_fingerprint: evidence.evidenceDigest,
    evidence_snapshot: evidence,
  };
}

function compactEventRow(event: DurableRecordEvent, evidence: CompactRecordEvidence) {
  return {
    record_identity: event.eventIdentity,
    metric_key: event.metricKey,
    scope_kind: event.scopeKind,
    scope_id: event.scopeId,
    title_snapshot: event.titleSnapshot,
    event_kind: event.eventKind,
    value: event.value,
    unit: event.unit,
    credited_date: event.creditedDate,
    period_key: event.periodKey,
    period_start: event.periodStart,
    period_end: event.periodEnd,
    event_identity: event.eventIdentity,
    candidate_identity: event.candidateIdentity,
    evidence_fingerprint: evidence.evidenceDigest,
    evidence_snapshot: evidence,
    first_qualified_at: event.firstQualifiedAt,
    first_achieved_at: event.firstAchievedAt,
  };
}

async function finalizeChunk(rowKind: RecordsRowKind, sectionKey: RecordsSectionKey, chunkIndex: number, rows: CompactRecordsRow[]): Promise<RecordsReconciliationChunk> {
  const chunkDigest = await recordsSha256({ evidenceSchemaVersion: RECORDS_EVIDENCE_SCHEMA_VERSION, rowKind, sectionKey, chunkIndex, rows });
  const envelope = { run_id: "00000000-0000-0000-0000-000000000000", row_kind: rowKind, section_key: sectionKey, chunk_index: chunkIndex, chunk_digest: chunkDigest, row_count: rows.length, rows };
  const bytes = utf8Bytes({ p_payload: envelope });
  if (bytes > RECORDS_CHUNK_CLIENT_MAX_BYTES) throw new Error(`Records ${sectionKey} chunk exceeds the 750 KiB client limit.`);
  return { rowKind, sectionKey, chunkIndex, chunkDigest, rowCount: rows.length, rows, bytes };
}

async function chunkPartition(rowKind: RecordsRowKind, sectionKey: RecordsSectionKey, rows: CompactRecordsRow[]) {
  const chunks: RecordsReconciliationChunk[] = [];
  let pending: CompactRecordsRow[] = [];
  for (const row of rows) {
    const evidenceBytes = utf8Bytes(row.evidence_snapshot);
    if (evidenceBytes >= RECORDS_EVIDENCE_MAX_BYTES) throw new Error(`Records evidence exceeds the 8 KiB limit for ${row.record_identity}.`);
    const candidate = [...pending, row];
    const estimate = utf8Bytes({ p_payload: { run_id: "00000000-0000-0000-0000-000000000000", row_kind: rowKind, section_key: sectionKey, chunk_index: chunks.length, chunk_digest: `sha256:${"0".repeat(64)}`, row_count: candidate.length, rows: candidate } });
    if (pending.length && estimate > RECORDS_CHUNK_TARGET_BYTES) {
      chunks.push(await finalizeChunk(rowKind, sectionKey, chunks.length, pending));
      pending = [row];
    } else pending = candidate;
  }
  if (pending.length) chunks.push(await finalizeChunk(rowKind, sectionKey, chunks.length, pending));
  return chunks;
}

export async function serializeRecordsReconciliation(evaluation: RecordsEvaluation, timezone: string, logicalDayStart: string): Promise<SerializedRecordsReconciliation> {
  const currentRows = await Promise.all(evaluation.currentRecords.map(async (record) => compactCurrentRow(record, await compactRecordEvidence(record))));
  const eventRows = await Promise.all(evaluation.events.map(async (event) => compactEventRow(event, await compactRecordEvidence(event))));
  const partitions: Array<{ rowKind: RecordsRowKind; sectionKey: RecordsSectionKey; rows: CompactRecordsRow[] }> = [
    ...(["global_tasks", "streaks", "focus", "per_task"] as const).map((sectionKey) => ({ rowKind: "current" as const, sectionKey, rows: currentRows.filter((row) => recordSection(row.metric_key) === sectionKey) })),
    { rowKind: "event", sectionKey: "record_history", rows: eventRows },
  ];
  const chunkGroups = await Promise.all(partitions.map((partition) => chunkPartition(partition.rowKind, partition.sectionKey, partition.rows)));
  const chunks = chunkGroups.flat();
  const expectedPartitions = partitions.map((partition, index) => ({
    row_kind: partition.rowKind,
    section_key: partition.sectionKey,
    chunk_count: chunkGroups[index].length,
    row_count: partition.rows.length,
  }));
  const manifestSeed = {
    manifestSchemaVersion: RECORDS_MANIFEST_SCHEMA_VERSION,
    evidenceSchemaVersion: RECORDS_EVIDENCE_SCHEMA_VERSION,
    rulesVersion: RECORDS_RULES_VERSION,
    timezone,
    logicalDayStart,
    expectedPartitions,
    chunkDigests: chunks.map((chunk) => `${chunk.rowKind}:${chunk.sectionKey}:${chunk.chunkIndex}:${chunk.chunkDigest}`),
  };
  const evaluationDigest = await recordsSha256(manifestSeed.chunkDigests);
  const manifestDigest = await recordsSha256({ ...manifestSeed, evaluationDigest });
  const manifest: RecordsReconciliationManifest = {
    manifest_schema_version: RECORDS_MANIFEST_SCHEMA_VERSION,
    evidence_schema_version: RECORDS_EVIDENCE_SCHEMA_VERSION,
    rules_version: RECORDS_RULES_VERSION,
    manifest_digest: manifestDigest,
    evaluation_digest: evaluationDigest,
    evaluated_at: evaluation.evaluatedAt,
    timezone,
    logical_day_start: logicalDayStart,
    expected_partitions: expectedPartitions,
    expected_current_row_count: currentRows.length,
    expected_event_row_count: eventRows.length,
    expected_chunk_count: chunks.length,
  };
  const compactTotalBytes = utf8Bytes({
    manifest,
    chunks: chunks.map((chunk) => ({
      chunkDigest: chunk.chunkDigest,
      chunkIndex: chunk.chunkIndex,
      rowCount: chunk.rowCount,
      rowKind: chunk.rowKind,
      rows: chunk.rows,
      sectionKey: chunk.sectionKey,
    })),
  });
  if (compactTotalBytes >= RECORDS_COMPACT_TOTAL_MAX_BYTES) throw new Error("Compact Records reconciliation exceeds the 2 MiB safety ceiling.");
  const maximumEvidenceBytes = Math.max(0, ...[...currentRows, ...eventRows].map((row) => utf8Bytes(row.evidence_snapshot)));
  return {
    chunks,
    currentRows,
    eventRows,
    manifest,
    measurements: {
      compactTotalBytes,
      totalChunks: chunks.length,
      maximumChunkBytes: Math.max(0, ...chunks.map((chunk) => chunk.bytes)),
      maximumEvidenceBytes,
      currentRowCount: currentRows.length,
      eventRowCount: eventRows.length,
    },
  };
}

export function recordsUploadEnvelope(runId: string, chunk: RecordsReconciliationChunk) {
  return {
    run_id: runId,
    row_kind: chunk.rowKind,
    section_key: chunk.sectionKey,
    chunk_index: chunk.chunkIndex,
    chunk_digest: chunk.chunkDigest,
    row_count: chunk.rowCount,
    rows: chunk.rows,
  };
}
