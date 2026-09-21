import type { EvaluatedRecordCandidate, ProvisionalRecordCandidate, RecordMetricKey, RecordScopeKind } from "@/lib/records/types";

export type RecordTaskEvidenceOutcome = "done" | "did_my_best" | "complete";

export type RecordTaskEvidenceItem = {
  taskId: string;
  title: string;
  entityKind: "parent" | "step";
  outcome: RecordTaskEvidenceOutcome;
  logicalDate: string;
  occurrenceDueOn: string | null;
  sourceRowId: string;
  occurrenceIdentity: string;
};

export type RecordTaskEvidenceByRecordIdentity = Record<string, RecordTaskEvidenceItem[]>;

export const TASK_EVIDENCE_RECORD_METRICS = [
  "parent_tasks_day",
  "parent_tasks_week",
  "parent_tasks_month",
  "steps_day",
  "steps_week",
  "steps_month",
  "permanent_completes_day",
] as const satisfies readonly RecordMetricKey[];

const TASK_EVIDENCE_RECORD_METRIC_SET = new Set<RecordMetricKey>(TASK_EVIDENCE_RECORD_METRICS);

type EvidenceCandidate = Pick<EvaluatedRecordCandidate | ProvisionalRecordCandidate, "evidence" | "metricKey" | "scopeId" | "scopeKind">;

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseOutcome(value: unknown): RecordTaskEvidenceOutcome | null {
  return value === "done" || value === "did_my_best" || value === "complete" ? value : null;
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseEvidenceRow(row: Record<string, unknown>): RecordTaskEvidenceItem | null {
  const outcome = parseOutcome(row.status);
  const occurrenceDueOn = row.occurrence_due_on;
  if (
    !nonEmptyString(row.task_id)
    || !nonEmptyString(row.title)
    || (row.entity_kind !== "parent" && row.entity_kind !== "step")
    || !outcome
    || !nonEmptyString(row.entry_date)
    || (occurrenceDueOn !== null && !nonEmptyString(occurrenceDueOn))
    || !nonEmptyString(row.source_row_id)
    || !nonEmptyString(row.canonical_occurrence_identity)
  ) return null;

  return {
    taskId: row.task_id,
    title: row.title,
    entityKind: row.entity_kind,
    outcome,
    logicalDate: row.entry_date,
    occurrenceDueOn: occurrenceDueOn === null ? null : occurrenceDueOn,
    sourceRowId: row.source_row_id,
    occurrenceIdentity: row.canonical_occurrence_identity,
  };
}

function compareEvidence(left: RecordTaskEvidenceItem, right: RecordTaskEvidenceItem) {
  return compareText(left.logicalDate, right.logicalDate)
    || compareText(left.title, right.title)
    || compareText(left.entityKind, right.entityKind)
    || compareText(left.outcome, right.outcome)
    || compareText(left.occurrenceDueOn ?? "", right.occurrenceDueOn ?? "")
    || compareText(left.sourceRowId, right.sourceRowId)
    || compareText(left.occurrenceIdentity, right.occurrenceIdentity);
}

export function isSupportedTaskEvidenceMetric(metricKey: RecordMetricKey) {
  return TASK_EVIDENCE_RECORD_METRIC_SET.has(metricKey);
}

export function recordIdentity(metricKey: RecordMetricKey, scopeKind: RecordScopeKind, scopeId: string | null) {
  return `${metricKey}:${scopeKind}:${scopeId ?? "global"}`;
}

export function parseRecordTaskEvidenceSourceRows(metricKey: RecordMetricKey, sourceRows: unknown) {
  if (!isSupportedTaskEvidenceMetric(metricKey) || !Array.isArray(sourceRows)) return [];
  return sourceRows
    .map((row) => isRecordObject(row) ? parseEvidenceRow(row) : null)
    .filter((item): item is RecordTaskEvidenceItem => item !== null)
    .sort(compareEvidence);
}

export function buildTaskEvidenceByRecordIdentity(records: readonly EvidenceCandidate[]): RecordTaskEvidenceByRecordIdentity {
  const result: RecordTaskEvidenceByRecordIdentity = {};
  for (const record of records) {
    if (!isSupportedTaskEvidenceMetric(record.metricKey) || record.scopeKind !== "global" || record.scopeId !== null) continue;
    result[recordIdentity(record.metricKey, record.scopeKind, record.scopeId)] = parseRecordTaskEvidenceSourceRows(record.metricKey, record.evidence.sourceRows);
  }
  return result;
}

export function formatRecordTaskEvidenceOutcome(outcome: RecordTaskEvidenceOutcome) {
  if (outcome === "done") return "Done";
  if (outcome === "did_my_best") return "Did My Best";
  return "Completed";
}

export function formatRecordTaskEvidenceEntityKind(entityKind: RecordTaskEvidenceItem["entityKind"]) {
  return entityKind === "step" ? "Step" : "Task";
}

export function getRecordTaskEvidenceCount(value: number, evidence: readonly RecordTaskEvidenceItem[]) {
  const evidenceCount = evidence.length;
  return evidenceCount === value
    ? {
      matches: true,
      text: `${evidenceCount.toLocaleString()} of ${value.toLocaleString()} counted occurrences`,
      warning: null,
    }
    : {
      matches: false,
      text: `${evidenceCount.toLocaleString()} evidence items found for a Record value of ${value.toLocaleString()}`,
      warning: "Record evidence is out of sync. Refresh Records to recalculate.",
    };
}
