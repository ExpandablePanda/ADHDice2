import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const PROMOTION_REPORT_VERSION = "legacy-history-promotion-dry-run-v1" as const;
export const PROMOTION_SOURCE = "legacy_history_promotion_v1" as const;
export const PROMOTION_PROVENANCE = "migration_reconstruction" as const;
export const PROMOTION_MIGRATION_VERSION = "legacy-history-promotion-v1" as const;
export const PROMOTION_SCHEMA_CONTRACT_VERSION = "task-state-schema-v1" as const;
export const PROMOTION_MIGRATION_OPERATION_REQUIREMENT = "required_at_execution" as const;
export const DEFAULT_BATCH_SIZE = 100;
export const MAX_BATCH_SIZE = 1000;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const UUID_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HISTORY_OUTCOMES = new Set(["done", "did_my_best", "missed", "delayed", "complete"]);
export const SOURCE_TABLES = [
  "adhdice_task_history",
  "adhdice_task_legacy_history_evidence",
  "adhdice_task_history_facts",
  "adhdice_task_state_migration_entities",
  "adhdice_clean_tasks",
  "adhdice_user_profiles",
] as const;

export type PromotionRow = Record<string, unknown>;
export type PromotionSources = {
  legacyHistory: readonly PromotionRow[];
  legacyEvidence: readonly PromotionRow[];
  canonicalFacts: readonly PromotionRow[];
  migrationEntities: readonly PromotionRow[];
  tasks: readonly PromotionRow[];
  profile: PromotionRow | null;
};

export type PromotionFactPlan = {
  user_id: string;
  entity_id: string;
  entity_kind: "parent" | "step" | "substep";
  logical_date: string;
  outcome: "done" | "did_my_best" | "missed" | "delayed" | "complete";
  event_kind: "explicit_outcome" | "terminal_complete" | "delay_audit";
  occurrence_id: string | null;
  scheduled_due_on: string | null;
  effective_due_on: string | null;
  schedule_boundary_id: string | null;
  recurrence_source_fingerprint: string | null;
  provenance_kind: typeof PROMOTION_PROVENANCE;
  actor_kind: "migration";
  actor_id: null;
  source: typeof PROMOTION_SOURCE;
  logical_day_settings_revision: number | null;
  timezone: string | null;
  day_start_time: string | null;
  command_id: null;
  idempotence_identity: string;
  migration_operation_id: null;
  migration_operation_id_requirement: typeof PROMOTION_MIGRATION_OPERATION_REQUIREMENT;
  source_legacy_history_id: string;
  revision: 1;
  created_at: null;
  updated_at: null;
  created_at_strategy: "execution_now";
  updated_at_strategy: "execution_now";
};

export type PromotionReport = {
  reportVersion: typeof PROMOTION_REPORT_VERSION;
  generatedAt: string;
  userId: string;
  sourceCounts: {
    legacyHistory: number;
    legacyEvidence: number;
    canonicalFacts: number;
    migrationEntities: number;
    tasks: number;
  };
  candidateCounts: {
    straightforward: number;
    canonicalWins: number;
    ownerExcluded: number;
    delayedNeedingDecision: number;
    duplicateTaskDates: number;
    conflictingLegacyStatuses: number;
    liveLegacyOnly: number;
    evidenceOnly: number;
    snapshotDiverged: number;
    orphansMalformed: number;
  };
  statusCounts: Record<string, number>;
  dateRange: { min: string | null; max: string | null };
  snapshotComparison: {
    SNAPSHOT_MATCH: number;
    LIVE_LEGACY_ONLY: number;
    SNAPSHOT_DIVERGED: number;
    EVIDENCE_ONLY: number;
    divergences: Array<Record<string, unknown>>;
  };
  canonicalOverlapSummary: {
    overlapCount: number;
    agreeingCount: number;
    conflictingCount: number;
    overlaps: Array<Record<string, unknown>>;
  };
  ownerExcludedSummary: {
    rowCount: number;
    entityCount: number;
    entities: Array<Record<string, unknown>>;
  };
  delayedSummary: {
    total: number;
    needingDecision: number;
    exactTargetProven: number;
    rows: Array<Record<string, unknown>>;
  };
  blockingIssues: Array<Record<string, unknown>>;
  warnings: string[];
  plannedFacts: PromotionFactPlan[];
  plannedRewardWrites: 0;
  plannedCurrentTaskStateWrites: 0;
  plannedWrites: 0;
  sourceFingerprint: string;
};

type ReportOptions = { generatedAt?: string };

export class HistoryPromotionDiagnostic extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "HistoryPromotionDiagnostic";
    this.code = code;
  }
}

function value(row: PromotionRow | null | undefined, ...keys: string[]): unknown {
  if (!row) return undefined;
  for (const key of keys) if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  return undefined;
}

function stringValue(row: PromotionRow | null | undefined, ...keys: string[]): string | null {
  const candidate = value(row, ...keys);
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

function dateValue(row: PromotionRow | null | undefined, ...keys: string[]): string | null {
  const candidate = stringValue(row, ...keys);
  return candidate && DATE_KEY.test(candidate) ? candidate : null;
}

function numberValue(row: PromotionRow | null | undefined, ...keys: string[]): number | null {
  const candidate = value(row, ...keys);
  return typeof candidate === "number" && Number.isInteger(candidate) && Number.isFinite(candidate) ? candidate : null;
}

function objectValue(row: PromotionRow | null | undefined, ...keys: string[]): PromotionRow | null {
  const candidate = value(row, ...keys);
  return candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate as PromotionRow : null;
}

export function stableStringify(input: unknown): string {
  if (input === null || typeof input === "string" || typeof input === "boolean") return JSON.stringify(input);
  if (typeof input === "number") return Number.isFinite(input) ? JSON.stringify(input) : JSON.stringify(String(input));
  if (Array.isArray(input)) return `[${input.map(stableStringify).join(",")}]`;
  if (typeof input === "object") {
    return `{${Object.entries(input as PromotionRow).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(String(input));
}

function rowId(row: PromotionRow): string | null {
  return stringValue(row, "id", "source_history_id");
}

function entityId(row: PromotionRow): string | null {
  return stringValue(row, "task_id", "entity_id");
}

function logicalDate(row: PromotionRow): string | null {
  return dateValue(row, "entry_date", "logical_date", "legacy_entry_date");
}

function status(row: PromotionRow): string | null {
  const candidate = stringValue(row, "status", "outcome", "legacy_status");
  return candidate?.toLowerCase() ?? null;
}

function eventType(row: PromotionRow): string | null {
  return stringValue(row, "event_type", "legacy_event_type");
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortRows(rows: readonly PromotionRow[]): PromotionRow[] {
  return [...rows].sort((left, right) => compareStrings(rowId(left) ?? stableStringify(left), rowId(right) ?? stableStringify(right)));
}

export function buildPromotionSourceFingerprint(sources: PromotionSources): string {
  // Facts created by this migration are deliberately excluded so a retry can
  // retain the original operation identity while the planner sees them as
  // already promoted canonical wins. New non-migration canonical facts remain
  // covered and therefore still fail the execution fingerprint guard.
  const canonicalAuthority = sources.canonicalFacts.filter((fact) =>
    !(stringValue(fact, "provenance_kind") === PROMOTION_PROVENANCE &&
      stringValue(fact, "source") === PROMOTION_SOURCE &&
      stringValue(fact, "source_legacy_history_id")),
  );
  const payload = {
    legacyHistory: sortRows(sources.legacyHistory),
    legacyEvidence: sortRows(sources.legacyEvidence),
    canonicalFacts: sortRows(canonicalAuthority),
    migrationEntities: sortRows(sources.migrationEntities),
    tasks: sortRows(sources.tasks),
    profile: sources.profile,
  };
  return `sha256:${createHash("sha256").update(stableStringify(payload), "utf8").digest("hex")}`;
}

function historyKey(row: PromotionRow): string | null {
  const owner = stringValue(row, "user_id");
  const task = entityId(row);
  const date = logicalDate(row);
  return owner && task && date ? `${owner}:${task}:${date}` : null;
}

function parseDisposition(row: PromotionRow | null): PromotionRow | null {
  const classification = objectValue(row, "classification");
  if (classification) return classification;
  const raw = value(row, "classification");
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as PromotionRow : null;
    } catch {
      return null;
    }
  }
  return null;
}

function isOwnerExcluded(row: PromotionRow | null): boolean {
  const classification = parseDisposition(row);
  return stringValue(row, "historyDisposition", "history_disposition", "disposition") === "owner_approved_excluded"
    || stringValue(classification, "historyDisposition", "history_disposition", "disposition") === "owner_approved_excluded";
}

function entityKind(task: PromotionRow | null, migrationEntity: PromotionRow | null): "parent" | "step" | "substep" | null {
  const candidate = stringValue(migrationEntity, "entity_kind") ?? stringValue(task, "entity_kind");
  return candidate === "parent" || candidate === "step" || candidate === "substep" ? candidate : null;
}

function profileValues(profile: PromotionRow | null): { revision: number | null; timezone: string | null; dayStartTime: string | null } {
  return {
    revision: numberValue(profile, "settings_revision", "logical_day_settings_revision"),
    timezone: stringValue(profile, "timezone"),
    dayStartTime: stringValue(profile, "day_start_time", "logical_day_start"),
  };
}

function occurrenceDue(row: PromotionRow): string | null {
  return dateValue(row, "occurrence_due_on");
}

function countedAsDueOccurrence(row: PromotionRow): boolean | null {
  const candidate = value(row, "counted_as_due_occurrence", "legacy_counted_as_due_occurrence");
  return typeof candidate === "boolean" ? candidate : null;
}

function explicitDelayTarget(row: PromotionRow, evidence: PromotionRow | null): { target: string | null; evidence: string[] } {
  const directKeys = ["effective_due_on", "delay_target_on", "target_due_on", "new_due_on", "delayed_until"] as const;
  for (const key of directKeys) {
    const target = dateValue(row, key);
    if (target) return { target, evidence: [`legacy.${key}:${target}`] };
  }
  const metadata = objectValue(row, "metadata");
  const metadataTarget = dateValue(metadata, "effective_due_on", "delayTargetOn", "targetDueOn", "newDueOn");
  if (metadataTarget) return { target: metadataTarget, evidence: [`legacy.metadata:${metadataTarget}`] };
  const snapshot = objectValue(evidence, "source_snapshot", "sourceSnapshot");
  for (const key of directKeys) {
    const target = dateValue(snapshot, key);
    if (target) return { target, evidence: [`evidence.source_snapshot.${key}:${target}`] };
  }
  return { target: null, evidence: [] };
}

function availableDelayEvidence(row: PromotionRow, evidence: PromotionRow | null): Record<string, unknown> {
  const snapshot = objectValue(evidence, "source_snapshot", "sourceSnapshot");
  return {
    occurrence_due_on: occurrenceDue(row) ?? stringValue(evidence, "legacy_occurrence_due_on"),
    occurrence_key: stringValue(row, "occurrence_key") ?? stringValue(evidence, "legacy_occurrence_key"),
    explicit_effective_due_on: explicitDelayTarget(row, evidence).target,
    source_snapshot_fields: snapshot ? Object.keys(snapshot).sort(compareStrings) : [],
  };
}

function sourceComparison(legacy: PromotionRow, evidence: PromotionRow): "SNAPSHOT_MATCH" | "SNAPSHOT_DIVERGED" {
  const pairs: Array<[string | null, string | null]> = [
    [entityId(legacy), stringValue(evidence, "entity_id", "task_id")],
    [logicalDate(legacy), dateValue(evidence, "legacy_entry_date", "entry_date", "logical_date")],
    [status(legacy), status(evidence)],
    [eventType(legacy), eventType(evidence)],
  ];
  return pairs.every(([left, right]) => left === right) ? "SNAPSHOT_MATCH" : "SNAPSHOT_DIVERGED";
}

function increment(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1;
}

function issue(code: string, count: number, details?: unknown): Record<string, unknown> {
  return { code, count, ...(details === undefined ? {} : { details }) };
}

function assertOwnerScope(sources: PromotionSources, userId: string): void {
  const rows = [
    ...sources.legacyHistory,
    ...sources.legacyEvidence,
    ...sources.canonicalFacts,
    ...sources.migrationEntities,
    ...sources.tasks,
    ...(sources.profile ? [sources.profile] : []),
  ];
  if (rows.some((row) => stringValue(row, "user_id") !== null && stringValue(row, "user_id") !== userId)) {
    throw new HistoryPromotionDiagnostic("OWNER_SCOPE_MISMATCH", "a read source returned a row outside the requested owner scope");
  }
}

function makePlan(
  row: PromotionRow,
  task: PromotionRow,
  migrationEntity: PromotionRow | null,
  profile: ReturnType<typeof profileValues>,
  target: string | null,
): PromotionFactPlan | null {
  const sourceHistoryId = rowId(row);
  const owner = stringValue(row, "user_id");
  const taskId = entityId(row);
  const date = logicalDate(row);
  const outcome = status(row);
  const kind = entityKind(task, migrationEntity);
  const counted = countedAsDueOccurrence(row);
  if (!sourceHistoryId || !owner || !taskId || !date || !kind || !outcome || !HISTORY_OUTCOMES.has(outcome) || counted === null) return null;
  const effectiveDueOn = outcome === "delayed" ? target : null;
  if (outcome === "delayed" && effectiveDueOn === null) return null;
  const scheduledDueOn = counted ? occurrenceDue(row) ?? date : null;
  return {
    user_id: owner,
    entity_id: taskId,
    entity_kind: kind,
    logical_date: date,
    outcome: outcome as PromotionFactPlan["outcome"],
    event_kind: outcome === "complete" ? "terminal_complete" : outcome === "delayed" ? "delay_audit" : "explicit_outcome",
    occurrence_id: null,
    scheduled_due_on: scheduledDueOn,
    effective_due_on: effectiveDueOn,
    schedule_boundary_id: null,
    recurrence_source_fingerprint: null,
    provenance_kind: PROMOTION_PROVENANCE,
    actor_kind: "migration",
    actor_id: null,
    source: PROMOTION_SOURCE,
    logical_day_settings_revision: profile.revision,
    timezone: profile.timezone,
    day_start_time: profile.dayStartTime,
    command_id: null,
    idempotence_identity: `${PROMOTION_SOURCE}:${owner}:${taskId}:${date}:${sourceHistoryId}`,
    migration_operation_id: null,
    migration_operation_id_requirement: PROMOTION_MIGRATION_OPERATION_REQUIREMENT,
    source_legacy_history_id: sourceHistoryId,
    revision: 1,
    created_at: null,
    updated_at: null,
    created_at_strategy: "execution_now",
    updated_at_strategy: "execution_now",
  };
}

export function emptyPromotionSources(): PromotionSources {
  return { legacyHistory: [], legacyEvidence: [], canonicalFacts: [], migrationEntities: [], tasks: [], profile: null };
}

export function buildLegacyHistoryPromotionDryRun(
  sources: PromotionSources,
  userId: string,
  options: ReportOptions = {},
): PromotionReport {
  if (!userId.trim()) throw new HistoryPromotionDiagnostic("INVALID_USER_ID", "userId is required");
  assertOwnerScope(sources, userId);
  const legacyRows = sortRows(sources.legacyHistory);
  const evidenceRows = sortRows(sources.legacyEvidence);
  const canonicalRows = sortRows(sources.canonicalFacts);
  const migrationRows = sortRows(sources.migrationEntities);
  const taskRows = sortRows(sources.tasks);
  const tasksById = new Map(taskRows.map((row) => [stringValue(row, "id"), row] as const).filter(([id]) => id !== null));
  const migrationById = new Map(migrationRows.map((row) => [stringValue(row, "entity_id"), row] as const).filter(([id]) => id !== null));
  const evidenceBySourceId = new Map(evidenceRows.map((row) => [stringValue(row, "source_history_id", "id"), row] as const).filter(([id]) => id !== null));
  const canonicalByKey = new Map(canonicalRows.map((row) => [`${stringValue(row, "user_id")}:${stringValue(row, "entity_id", "task_id")}:${dateValue(row, "logical_date", "entry_date")}`, row] as const));
  const statusCounts: Record<string, number> = {};
  const keyRows = new Map<string, PromotionRow[]>();
  for (const row of legacyRows) {
    increment(statusCounts, status(row) ?? "<malformed>");
    const key = historyKey(row);
    if (key) keyRows.set(key, [...(keyRows.get(key) ?? []), row]);
  }
  const duplicateKeys = new Set([...keyRows.entries()].filter(([, rows]) => rows.length > 1).map(([key]) => key));
  const conflictingKeys = new Set([...keyRows.entries()].filter(([, rows]) => new Set(rows.map(status)).size > 1).map(([key]) => key));
  const canonicalOverlaps: Array<Record<string, unknown>> = [];
  const snapshotDivergences: Array<Record<string, unknown>> = [];
  const delayedRows: Array<Record<string, unknown>> = [];
  const ownerExcludedRows = new Map<string, PromotionRow[]>();
  const plans: PromotionFactPlan[] = [];
  const blocking: Record<string, { count: number; ids: string[] }> = {};
  const warnings: string[] = [];
  const addBlocking = (code: string, id: string | null) => {
    const current = blocking[code] ?? { count: 0, ids: [] };
    current.count += 1;
    if (id && current.ids.length < 25) current.ids.push(id);
    blocking[code] = current;
  };
  let snapshotMatches = 0;
  let liveLegacyOnly = 0;
  let snapshotDiverged = 0;
  for (const row of legacyRows) {
    const sourceId = rowId(row);
    const taskId = entityId(row);
    const date = logicalDate(row);
    const rowStatus = status(row);
    const task = taskId ? tasksById.get(taskId) ?? null : null;
    const evidence = sourceId ? evidenceBySourceId.get(sourceId) ?? null : null;
    if (!sourceId || !taskId || !date || !rowStatus || !HISTORY_OUTCOMES.has(rowStatus) || !task) {
      addBlocking(task ? "MALFORMED_LEGACY_HISTORY" : "ORPHAN_OR_MALFORMED", sourceId);
      continue;
    }
    if (evidence === null) {
      liveLegacyOnly += 1;
    } else {
      const comparison = sourceComparison(row, evidence);
      if (comparison === "SNAPSHOT_MATCH") snapshotMatches += 1;
      else {
        snapshotDiverged += 1;
        snapshotDivergences.push({ source_history_id: sourceId, task_id: taskId, logical_date: date, legacy_status: rowStatus, evidence_status: status(evidence) });
        addBlocking("SNAPSHOT_DIVERGED", sourceId);
      }
    }
    const migrationEntity = migrationById.get(taskId) ?? null;
    if (isOwnerExcluded(migrationEntity)) {
      ownerExcludedRows.set(taskId, [...(ownerExcludedRows.get(taskId) ?? []), row]);
      continue;
    }
    const canonical = canonicalByKey.get(`${userId}:${taskId}:${date}`) ?? null;
    if (canonical) {
      const canonicalOutcome = status(canonical);
      const agrees = canonicalOutcome === rowStatus;
      canonicalOverlaps.push({
        source_legacy_history_id: sourceId,
        entity_id: taskId,
        title: stringValue(task, "title"),
        logical_date: date,
        legacy_outcome: rowStatus,
        canonical_outcome: canonicalOutcome,
        disposition: "CANONICAL_WINS",
        agrees,
      });
      continue;
    }
    if (duplicateKeys.has(historyKey(row)!)) {
      addBlocking("DUPLICATE_TASK_DATE", sourceId);
      continue;
    }
    if (conflictingKeys.has(historyKey(row)!)) {
      addBlocking("CONFLICTING_LEGACY_STATUS", sourceId);
      continue;
    }
    if (snapshotDivergences.some((item) => item.source_history_id === sourceId)) continue;
    let target: string | null = null;
    if (rowStatus === "delayed") {
      const delay = explicitDelayTarget(row, evidence);
      const exact = delay.target !== null && delay.target > date;
      if (!exact) {
        delayedRows.push({
          source_legacy_history_id: sourceId,
          entity_id: taskId,
          title: stringValue(task, "title"),
          logical_date: date,
          available_occurrence_due_on: occurrenceDue(row),
          available_evidence: availableDelayEvidence(row, evidence),
          exact_effective_due_on_proven: false,
          effective_due_on: null,
          reason: delay.target === null ? "no_explicit_effective_due_on" : "effective_due_on_not_after_logical_date",
        });
        addBlocking("DELAYED_SCHEMA_DECISION_REQUIRED", sourceId);
        continue;
      }
      target = delay.target;
      delayedRows.push({
        source_legacy_history_id: sourceId,
        entity_id: taskId,
        title: stringValue(task, "title"),
        logical_date: date,
        available_occurrence_due_on: occurrenceDue(row),
        available_evidence: availableDelayEvidence(row, evidence),
        exact_effective_due_on_proven: true,
        effective_due_on: target,
        reason: null,
      });
      // Delayed remains a separate later-handling disposition even when the
      // source happens to expose an exact target. This promotion is only for
      // straightforward recorded outcomes and never imports Delayed facts.
      continue;
    }
    const plan = makePlan(row, task, migrationEntity, profileValues(sources.profile), target);
    if (!plan) {
      addBlocking("CANONICAL_PLAN_FIELDS_UNPROVEN", sourceId);
      continue;
    }
    plans.push(plan);
  }
  const liveIds = new Set(legacyRows.map(rowId).filter((id): id is string => id !== null));
  const evidenceOnly = evidenceRows.filter((row) => {
    const sourceId = stringValue(row, "source_history_id", "id");
    return sourceId !== null && !liveIds.has(sourceId);
  });
  for (const row of evidenceOnly) addBlocking("EVIDENCE_ONLY", stringValue(row, "source_history_id", "id"));
  if (liveLegacyOnly > 0) warnings.push(`${liveLegacyOnly} live legacy rows have no retained evidence snapshot; they remain candidates only when all other rules pass.`);
  const excludedEntities = [...ownerExcludedRows.entries()].sort(([left], [right]) => compareStrings(left, right)).map(([id, rows]) => {
    const dates = rows.map(logicalDate).filter((date): date is string => date !== null).sort(compareStrings);
    const counts: Record<string, number> = {};
    rows.forEach((row) => increment(counts, status(row) ?? "<malformed>"));
    const disposition = migrationById.get(id);
    return {
      entity_id: id,
      title: stringValue(tasksById.get(id), "title"),
      row_count: rows.length,
      date_range: { min: dates[0] ?? null, max: dates.at(-1) ?? null },
      status_counts: counts,
      disposition_metadata: disposition ? { state: stringValue(disposition, "state"), classification: parseDisposition(disposition), blocking_issue_count: numberValue(disposition, "blocking_issue_count") } : null,
    };
  });
  plans.sort((left, right) => compareStrings(`${left.entity_id}:${left.logical_date}:${left.source_legacy_history_id}`, `${right.entity_id}:${right.logical_date}:${right.source_legacy_history_id}`));
  const dates = legacyRows.map(logicalDate).filter((date): date is string => date !== null).sort(compareStrings);
  const duplicateTaskDates = [...duplicateKeys].reduce((count, key) => count + (keyRows.get(key)?.length ?? 0), 0);
  const conflictingLegacyStatuses = [...conflictingKeys].reduce((count, key) => count + (keyRows.get(key)?.length ?? 0), 0);
  const blockingIssues = Object.entries(blocking).sort(([left], [right]) => compareStrings(left, right)).map(([code, data]) => issue(code, data.count, { source_history_ids: data.ids }));
  return {
    reportVersion: PROMOTION_REPORT_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    userId,
    sourceCounts: { legacyHistory: legacyRows.length, legacyEvidence: evidenceRows.length, canonicalFacts: canonicalRows.length, migrationEntities: migrationRows.length, tasks: taskRows.length },
    candidateCounts: {
      straightforward: plans.length,
      canonicalWins: canonicalOverlaps.length,
      ownerExcluded: [...ownerExcludedRows.values()].reduce((count, rows) => count + rows.length, 0),
      delayedNeedingDecision: delayedRows.filter((row) => row.exact_effective_due_on_proven === false).length,
      duplicateTaskDates: duplicateTaskDates,
      conflictingLegacyStatuses,
      liveLegacyOnly,
      evidenceOnly: evidenceOnly.length,
      snapshotDiverged,
      orphansMalformed: blocking.ORPHAN_OR_MALFORMED?.count ?? 0,
    },
    statusCounts,
    dateRange: { min: dates[0] ?? null, max: dates.at(-1) ?? null },
    snapshotComparison: { SNAPSHOT_MATCH: snapshotMatches, LIVE_LEGACY_ONLY: liveLegacyOnly, SNAPSHOT_DIVERGED: snapshotDiverged, EVIDENCE_ONLY: evidenceOnly.length, divergences: snapshotDivergences },
    canonicalOverlapSummary: { overlapCount: canonicalOverlaps.length, agreeingCount: canonicalOverlaps.filter((item) => item.agrees === true).length, conflictingCount: canonicalOverlaps.filter((item) => item.agrees === false).length, overlaps: canonicalOverlaps },
    ownerExcludedSummary: { rowCount: [...ownerExcludedRows.values()].reduce((count, rows) => count + rows.length, 0), entityCount: excludedEntities.length, entities: excludedEntities },
    delayedSummary: { total: delayedRows.length, needingDecision: delayedRows.filter((row) => row.exact_effective_due_on_proven === false).length, exactTargetProven: delayedRows.filter((row) => row.exact_effective_due_on_proven === true).length, rows: delayedRows },
    blockingIssues,
    warnings,
    plannedFacts: plans,
    plannedRewardWrites: 0,
    plannedCurrentTaskStateWrites: 0,
    plannedWrites: 0,
    sourceFingerprint: buildPromotionSourceFingerprint(sources),
  };
}

export function comparePromotionBaseline(report: PromotionReport): string[] {
  const expected: Record<string, number> = {
    totalLegacy: 11107,
    straightforward: 11010,
    canonicalWins: 1,
    ownerExcluded: 82,
    delayedNeedingDecision: 14,
    liveLegacyOnly: 11,
    evidenceOnly: 0,
    snapshotDiverged: 0,
    duplicateTaskDates: 0,
    conflictingLegacyStatuses: 0,
  };
  const actual: Record<string, number> = {
    totalLegacy: report.sourceCounts.legacyHistory,
    straightforward: report.candidateCounts.straightforward,
    canonicalWins: report.candidateCounts.canonicalWins,
    ownerExcluded: report.candidateCounts.ownerExcluded,
    delayedNeedingDecision: report.candidateCounts.delayedNeedingDecision,
    liveLegacyOnly: report.candidateCounts.liveLegacyOnly,
    evidenceOnly: report.candidateCounts.evidenceOnly,
    snapshotDiverged: report.candidateCounts.snapshotDiverged,
    duplicateTaskDates: report.candidateCounts.duplicateTaskDates,
    conflictingLegacyStatuses: report.candidateCounts.conflictingLegacyStatuses,
  };
  return Object.keys(expected).filter((key) => expected[key] !== actual[key]).map((key) => `${key}: expected ${expected[key]}, got ${actual[key]}`);
}

export function formatPromotionSummary(report: PromotionReport, baselineMismatches: readonly string[] = []): string {
  const lines = [
    `TOTAL LEGACY: ${report.sourceCounts.legacyHistory}`,
    `STRAIGHTFORWARD: ${report.candidateCounts.straightforward}`,
    `CANONICAL WINS: ${report.candidateCounts.canonicalWins}`,
    `OWNER-EXCLUDED: ${report.candidateCounts.ownerExcluded}`,
    `DELAYED SKIPPED: ${report.delayedSummary.total}`,
    `DUPLICATES: ${report.candidateCounts.duplicateTaskDates}`,
    `CONFLICTING LEGACY STATUSES: ${report.candidateCounts.conflictingLegacyStatuses}`,
    `LIVE-LEGACY-ONLY: ${report.candidateCounts.liveLegacyOnly}`,
    `EVIDENCE-ONLY: ${report.candidateCounts.evidenceOnly}`,
    `SNAPSHOT-DIVERGED: ${report.candidateCounts.snapshotDiverged}`,
    `PLANNED INSERTS: ${report.plannedFacts.length}`,
    "PLANNED REWARD WRITES = 0",
    "PLANNED TASK STATE WRITES = 0",
    `SOURCE FINGERPRINT: ${report.sourceFingerprint}`,
  ];
  if (baselineMismatches.length > 0) lines.push(`STOP: LIVE BASELINE MISMATCH (${baselineMismatches.join("; ")})`);
  return `${lines.join("\n")}\n`;
}

type ReadTable = (typeof SOURCE_TABLES)[number];
const READ_ORDER_COLUMN: Record<ReadTable, string> = {
  adhdice_task_history: "id",
  adhdice_task_legacy_history_evidence: "id",
  adhdice_task_history_facts: "id",
  adhdice_task_state_migration_entities: "id",
  adhdice_clean_tasks: "id",
  adhdice_user_profiles: "user_id",
};
type ReadFrom = { select(columns: string): ReadQuery };
type ReadQuery = {
  eq(column: string, value: string): ReadQuery;
  order(column: string, options?: { ascending?: boolean }): ReadQuery;
  range(from: number, to: number): Promise<{ data: PromotionRow[] | null; error: { code?: string; message: string } | null }>;
};
export type ReadOnlyPromotionClient = {
  from(table: ReadTable): ReadFrom;
  auth: { getUser(accessToken: string): Promise<{ data: { user: { id: string } | null } | null; error: { code?: string; message: string } | null }> };
};

async function readTable(client: Pick<ReadOnlyPromotionClient, "from">, table: ReadTable, userId: string, batchSize: number): Promise<PromotionRow[]> {
  const rows: PromotionRow[] = [];
  const orderColumn = READ_ORDER_COLUMN[table];
  for (let offset = 0; ; offset += batchSize) {
    const result = await client.from(table).select("*").eq("user_id", userId).order(orderColumn, { ascending: true }).range(offset, offset + batchSize - 1);
    if (result.error) throw new HistoryPromotionDiagnostic(result.error.code ?? "SOURCE_QUERY_FAILED", `${table}: ${result.error.message}`);
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < batchSize) return rows;
  }
}

export async function loadPromotionSources(client: Pick<ReadOnlyPromotionClient, "from">, userId: string, batchSize = DEFAULT_BATCH_SIZE): Promise<PromotionSources> {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) throw new HistoryPromotionDiagnostic("INVALID_BATCH_SIZE", `batch size must be between 1 and ${MAX_BATCH_SIZE}`);
  const [legacyHistory, legacyEvidence, canonicalFacts, migrationEntities, tasks, profiles] = await Promise.all([
    readTable(client, "adhdice_task_history", userId, batchSize),
    readTable(client, "adhdice_task_legacy_history_evidence", userId, batchSize),
    readTable(client, "adhdice_task_history_facts", userId, batchSize),
    readTable(client, "adhdice_task_state_migration_entities", userId, batchSize),
    readTable(client, "adhdice_clean_tasks", userId, batchSize),
    readTable(client, "adhdice_user_profiles", userId, batchSize),
  ]);
  return { legacyHistory, legacyEvidence, canonicalFacts, migrationEntities, tasks, profile: profiles[0] ?? null };
}

export async function loadAuthenticatedPromotionSources(client: ReadOnlyPromotionClient, userId: string, accessToken: string, batchSize = DEFAULT_BATCH_SIZE): Promise<PromotionSources> {
  if (!accessToken.trim()) throw new HistoryPromotionDiagnostic("AUTHENTICATION_REQUIRED", "an authenticated user access token is required");
  const identity = await client.auth.getUser(accessToken);
  if (identity.error) throw new HistoryPromotionDiagnostic(identity.error.code ?? "AUTHENTICATION_FAILED", identity.error.message);
  const authenticatedUserId = identity.data?.user?.id ?? null;
  if (!authenticatedUserId) throw new HistoryPromotionDiagnostic("AUTHENTICATION_REQUIRED", "a non-anonymous authenticated user is required");
  if (authenticatedUserId !== userId) throw new HistoryPromotionDiagnostic("OWNER_IDENTITY_MISMATCH", "authenticated identity does not match userId");
  return loadPromotionSources(client, userId, batchSize);
}

function parseCliArgs(argv: readonly string[]): { userId: string; batchSize: number; accessToken: string | null; outputPath: string | null } {
  const values = new Map<string, string>();
  const forbidden = new Set(["--write", "--allow-writes", "--insert", "--update", "--delete", "--upsert", "--rpc", "--execute", "--migrate"]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (forbidden.has(argument)) throw new HistoryPromotionDiagnostic("WRITE_MODE_REJECTED", "this planner is permanently read-only");
    const [key, inline] = argument.split("=", 2);
    if (inline !== undefined) values.set(key, inline);
    else if (["--user-id", "--batch-size", "--access-token", "--output"].includes(key)) {
      const next = argv[++index];
      if (!next || next.startsWith("--")) throw new HistoryPromotionDiagnostic("MISSING_ARGUMENT_VALUE", `${key} requires a value`);
      values.set(key, next);
    } else throw new HistoryPromotionDiagnostic("INVALID_ARGUMENT", `unknown argument ${key}`);
  }
  const userId = values.get("--user-id");
  if (!userId || !UUID_KEY.test(userId)) throw new HistoryPromotionDiagnostic("INVALID_USER_ID", "--user-id must be a UUID");
  const batchSize = Number(values.get("--batch-size") ?? DEFAULT_BATCH_SIZE);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) throw new HistoryPromotionDiagnostic("INVALID_BATCH_SIZE", `batch size must be between 1 and ${MAX_BATCH_SIZE}`);
  return { userId, batchSize, accessToken: values.get("--access-token") ?? null, outputPath: values.get("--output") ?? null };
}

async function main(argv: readonly string[]): Promise<void> {
  const options = parseCliArgs(argv);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const accessToken = options.accessToken ?? process.env.ADHDICE_SUPABASE_ACCESS_TOKEN ?? process.env.SUPABASE_USER_ACCESS_TOKEN;
  if (!url || !anonKey) throw new HistoryPromotionDiagnostic("SUPABASE_CONFIG_MISSING", "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required");
  if (!accessToken?.trim()) throw new HistoryPromotionDiagnostic("AUTHENTICATION_REQUIRED", "--access-token, ADHDICE_SUPABASE_ACCESS_TOKEN, or SUPABASE_USER_ACCESS_TOKEN is required");
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: `Bearer ${accessToken}` } } }) as unknown as ReadOnlyPromotionClient;
  const sources = await loadAuthenticatedPromotionSources(client, options.userId, accessToken, options.batchSize);
  const report = buildLegacyHistoryPromotionDryRun(sources, options.userId);
  const mismatches = comparePromotionBaseline(report);
  process.stderr.write(formatPromotionSummary(report, mismatches));
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (options.outputPath) await writeFile(resolve(options.outputPath), serialized, "utf8");
  else process.stdout.write(serialized);
  if (mismatches.length > 0) process.exitCode = 2;
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const diagnostic = error instanceof HistoryPromotionDiagnostic ? error : new HistoryPromotionDiagnostic("PLANNER_FAILED", String(error));
    process.stderr.write(`${diagnostic.message}\n`);
    process.exitCode = 1;
  });
}
