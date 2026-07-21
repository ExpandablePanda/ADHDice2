import type { Task, TaskHistory } from "@/lib/database.types";
import { RECORDS_RULES_VERSION, type RecordMetricKey, type RecordScopeKind } from "@/lib/records/types";

export function getTaskOccurrenceIdentity(history: Pick<TaskHistory, "entry_date" | "occurrence_key" | "task_id">, task: Pick<Task, "repeat_frequency"> | null) {
  const persisted = history.occurrence_key?.trim();
  if (persisted) return persisted;
  if (task?.repeat_frequency === "none") return `lifetime:${history.task_id}`;
  return `logical-date:${history.entry_date}`;
}

export function stableRecordFingerprint(value: unknown) {
  const text = stableStringify(value);
  let hash = 14695981039346656037n;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function buildRecordEventIdentity(input: {
  candidateIdentity: string;
  metricKey: RecordMetricKey;
  scopeId: string | null;
  scopeKind: RecordScopeKind;
  value: number;
}) {
  return stableRecordFingerprint({ rulesVersion: RECORDS_RULES_VERSION, ...input });
}

export function buildPeriodCandidateIdentity(metricKey: RecordMetricKey, scopeKind: RecordScopeKind, scopeId: string | null, periodKey: string, evidenceIdentities: readonly string[]) {
  return `${metricKey}:${scopeKind}:${scopeId ?? "global"}:${periodKey}:${stableRecordFingerprint([...evidenceIdentities].sort())}`;
}

export function buildRunCandidateIdentity(kind: "streak" | "comeback", start: string, end: string, evidenceIdentities: readonly string[]) {
  return `${kind}:${start}:${end}:${stableRecordFingerprint([...evidenceIdentities].sort())}`;
}
