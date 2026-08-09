import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { logicalDateForTimestamp } from "../src/lib/task-state-engine/calendar.ts";

export const REPORT_VERSION = "task-state-migration-dry-run-v1" as const;
export const MIGRATION_VERSION = "task-state-migration-v1" as const;
export const CLASSIFIER_VERSION = "task-state-classifier-v2" as const;
export const SCHEMA_CONTRACT_VERSION = "task-state-schema-v1" as const;
export const DEFAULT_BATCH_SIZE = 100;
export const MAX_BATCH_SIZE = 1000;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const MONTHLY_ORDINALS = new Set(["first", "second", "third", "fourth", "last"]);
const HISTORY_STATUSES = new Set(["done", "did_my_best", "missed", "delayed", "complete"]);
const ACTIVE_HISTORY_STATUSES = new Set(["done", "did_my_best", "delayed", "complete"]);
const SOURCE_NAMES = [
  "tasks",
  "history",
  "subtasks",
  "promotions",
  "profile",
  "taskEvents",
  "pointLedger",
  "rewardRolls",
  "rewardClaims",
  "pendingRewardAccount",
  "pendingRewardOperations",
  "pendingRewardItems",
  "rolloverEvidence",
] as const;

export type SourceName = (typeof SOURCE_NAMES)[number];
export type SourceStatus = {
  available: boolean;
  code?: string;
};
export type SourceAvailability = Record<SourceName, SourceStatus>;

export type LegacyRow = Record<string, unknown>;

export type MigrationSourceEvidence = {
  tasks: readonly LegacyRow[];
  history: readonly LegacyRow[];
  subtasks: readonly LegacyRow[];
  promotions: readonly LegacyRow[];
  profile: LegacyRow | null;
  taskEvents: readonly LegacyRow[];
  pointLedger: readonly LegacyRow[];
  rewardRolls: readonly LegacyRow[];
  rewardClaims: readonly LegacyRow[];
  pendingRewardAccount: readonly LegacyRow[];
  pendingRewardOperations: readonly LegacyRow[];
  pendingRewardItems: readonly LegacyRow[];
  rolloverEvidence: readonly LegacyRow[];
  availability?: Partial<SourceAvailability>;
};

export type ClassifierOptions = {
  userId: string;
  logicalDate?: string;
  currentInstant?: string | Date;
  classifierVersion?: string;
  schemaContractVersion?: string;
  entityDispositions?: EntityMigrationDispositions;
};

export type ScheduleModel = "unscheduled" | "one_time" | "rolling" | "fixed" | "ambiguous";
export type AnchorClassification = "proven" | "reconstructable" | "prospective" | "ambiguous";
export type MigrationEligibility = "safe" | "partial" | "needs_attention" | "blocked";
export type MigrationDisposition =
  | "safe_current_future_deterministic"
  | "historical_uncertainty_retained"
  | "owner_approved_history_exclusion"
  | "genuinely_blocked";

export type MigrationEntityDisposition = {
  preserveEntity: true;
  preserveCurrentConfiguration: true;
  excludeLegacyHistory: true;
  approval: "owner_approved";
  preserveCurrentCompleteProjection?: true;
  resetStaleLegacyWorkflowProjection?: true;
  resetStaleLegacyCompleteProjection?: true;
};

export type EntityMigrationDispositions = Readonly<Record<string, MigrationEntityDisposition>>;

export const OWNER_APPROVED_HISTORY_EXCLUSION: MigrationEntityDisposition = {
  preserveEntity: true,
  preserveCurrentConfiguration: true,
  excludeLegacyHistory: true,
  approval: "owner_approved",
};

export type MigrationDispositionCounts = {
  safeCurrentFutureDeterministic: number;
  historicalUncertaintyRetained: number;
  ownerApprovedHistoryExclusion: number;
  genuinelyBlocked: number;
};

export type MigrationCounts = {
  taskEntities: number;
  hierarchy: { parent: number; step: number; substep: number; orphan: number; cycle: number };
  scheduleModels: Record<ScheduleModel, number>;
  anchors: Record<AnchorClassification, number>;
  history: { explicit: number; automaticMissed: number; ambiguous: number; contradictory: number };
  occurrences: { proven: number; reconstructable: number; ambiguous: number };
  delay: { safe: number; ambiguous: number };
  completeContradictions: number;
  archiveTrash: { proven: number; priorUnknown: number; contradictory: number };
  inProgress: { valid: number; stale: number; contradictory: number };
  rewards: { mapped: number; consumed: number; pending: number; ambiguous: number };
  legacySubtasks: { promoted: number; unpromoted: number; nested: number; orphan: number; duplicate: number };
  migrationDisposition: MigrationDispositionCounts;
  orphanReferences: number;
  projectionMismatches: number;
  needsAttention: number;
};

export type HistoryClassification = {
  historyId: string;
  entryDate: string | null;
  status: string | null;
  classification: "explicit" | "automatic_missed" | "ambiguous" | "contradictory";
  confidence: "proven" | "high_confidence" | "not_promotable";
  canonicalEligible: boolean;
  historicalEvidenceEligible: boolean;
  provenance: "proven" | "unknown";
  excludedFromCanonicalReconstruction: boolean;
  evidence: string[];
  blockingIssueCodes: string[];
};

export type OccurrenceClassification = {
  historyId: string;
  scheduledDueOn: string | null;
  classification: "proven" | "reconstructable" | "ambiguous";
  confidence: "proven" | "high_confidence" | "not_promotable";
  evidence: string[];
  blockingIssueCodes: string[];
};

export type EntityClassification = {
  userId: string;
  entityId: string;
  entityKind: "parent" | "step" | "substep";
  parentEntityId: string | null;
  scheduleModel: ScheduleModel;
  anchor: {
    classification: AnchorClassification;
    confidence: "proven" | "high_confidence" | "ambiguous" | "unavailable";
    date: string | null;
    evidence: string[];
  };
  historyClassifications: HistoryClassification[];
  historyDisposition: "retained" | "owner_approved_excluded";
  occurrenceClassifications: OccurrenceClassification[];
  delayState: "none" | "safe" | "ambiguous";
  delayEvidence: string[];
  workflowProjectionDisposition: "retained" | "owner_approved_reset";
  lifecycleProjectionDisposition: "retained" | "owner_approved_complete_preserved" | "owner_approved_stale_complete_reset";
  lifecycleState: {
    terminal: string;
    container: string;
    priorContainer: "proven" | "unknown" | "contradictory";
  };
  workflowState: "none" | "valid_in_progress" | "stale" | "contradictory";
  rewardBootstrapState: "none" | "consumed_proven" | "pending_proven" | "safe" | "ambiguous";
  migrationEligibility: MigrationEligibility;
  migrationDisposition: MigrationDisposition;
  entityDisposition: MigrationEntityDisposition | null;
  blockingIssueCodes: string[];
  sourceFingerprints: Record<string, string>;
};

export type UserMigrationReport = {
  reportVersion: typeof REPORT_VERSION;
  migrationVersion: typeof MIGRATION_VERSION;
  classifierVersion: string;
  schemaContractVersion: typeof SCHEMA_CONTRACT_VERSION;
  generatedAt: string;
  userId: string;
  logicalDate: string | null;
  sourceFingerprints: { tasks: string; history: string; rewards: string };
  sourceAvailability: SourceAvailability;
  counts: MigrationCounts;
  eligibility: { safePercent: number; blockedEntityCount: number; commandCutoverEligible: boolean };
  entities: EntityClassification[];
};

export type GlobalMigrationReport = {
  reportVersion: typeof REPORT_VERSION;
  migrationVersion: typeof MIGRATION_VERSION;
  classifierVersion: string;
  schemaContractVersion: typeof SCHEMA_CONTRACT_VERSION;
  generatedAt: string;
  sourceFingerprints: { tasks: string; history: string; rewards: string };
  sourceAvailability: SourceAvailability;
  counts: MigrationCounts;
  eligibility: { safePercent: number; blockedEntityCount: number; commandCutoverEligible: boolean };
  userCount: number;
  classifiedUserCount: number;
  commandCutoverEligibleUserCount: number;
  blockedUserCount: number;
  users: Array<{ userId: string; counts: MigrationCounts; eligibility: UserMigrationReport["eligibility"] }>;
};

export type MigrationRunReport = {
  reportVersion: typeof REPORT_VERSION;
  migrationVersion: typeof MIGRATION_VERSION;
  classifierVersion: string;
  schemaContractVersion: typeof SCHEMA_CONTRACT_VERSION;
  generatedAt: string;
  userReports: UserMigrationReport[];
  entityRecords: EntityClassification[];
  global: GlobalMigrationReport;
};

type ScheduleClassification = {
  model: ScheduleModel;
  issueCodes: string[];
  evidence: string[];
  prospectiveOnly: boolean;
};

export class MigrationClassifierDiagnostic extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "MigrationClassifierDiagnostic";
    this.code = code;
  }
}

type ProfileLogicalDayContext = {
  timezone: string;
  dayStartTime: string;
};

function emptyAvailability(): SourceAvailability {
  return Object.fromEntries(SOURCE_NAMES.map((name) => [name, { available: true }])) as SourceAvailability;
}

export function emptySourceEvidence(): MigrationSourceEvidence {
  return {
    tasks: [],
    history: [],
    subtasks: [],
    promotions: [],
    profile: null,
    taskEvents: [],
    pointLedger: [],
    rewardRolls: [],
    rewardClaims: [],
    pendingRewardAccount: [],
    pendingRewardOperations: [],
    pendingRewardItems: [],
    rolloverEvidence: [],
    availability: emptyAvailability(),
  };
}

function value(row: LegacyRow | null | undefined, ...keys: string[]): unknown {
  if (!row) return undefined;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  }
  return undefined;
}

function stringValue(row: LegacyRow | null | undefined, ...keys: string[]): string | null {
  const candidate = value(row, ...keys);
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

function dateValue(row: LegacyRow | null | undefined, ...keys: string[]): string | null {
  const candidate = stringValue(row, ...keys);
  return candidate && DATE_KEY.test(candidate) ? candidate : null;
}

function numberValue(row: LegacyRow | null | undefined, ...keys: string[]): number | null {
  const candidate = value(row, ...keys);
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null;
}

function arrayValue(row: LegacyRow | null | undefined, ...keys: string[]): unknown[] {
  const candidate = value(row, ...keys);
  return Array.isArray(candidate) ? candidate : [];
}

function nestedValue(row: LegacyRow | null | undefined, path: string[]): unknown {
  let current: unknown = row;
  for (const key of path) {
    if (!current || typeof current !== "object" || !Object.prototype.hasOwnProperty.call(current, key)) return undefined;
    current = (current as LegacyRow)[key];
  }
  return current;
}

function asDate(valueToCheck: unknown): string | null {
  return typeof valueToCheck === "string" && DATE_KEY.test(valueToCheck) ? valueToCheck : null;
}

function compareStrings(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableValue(valueToSerialize: unknown): unknown {
  if (valueToSerialize === null || typeof valueToSerialize === "string" || typeof valueToSerialize === "boolean") return valueToSerialize;
  if (typeof valueToSerialize === "number") return Number.isFinite(valueToSerialize) ? valueToSerialize : String(valueToSerialize);
  if (typeof valueToSerialize === "bigint") return valueToSerialize.toString();
  if (Array.isArray(valueToSerialize)) return valueToSerialize.map(stableValue);
  if (typeof valueToSerialize === "object") {
    return Object.fromEntries(
      Object.entries(valueToSerialize as LegacyRow)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => compareStrings(left, right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return String(valueToSerialize);
}

export function stableStringify(valueToSerialize: unknown): string {
  return JSON.stringify(stableValue(valueToSerialize));
}

export function fingerprintEvidence(valueToFingerprint: unknown): string {
  const rows = Array.isArray(valueToFingerprint)
    ? valueToFingerprint.map(stableValue).sort((left, right) => compareStrings(JSON.stringify(left), JSON.stringify(right)))
    : stableValue(valueToFingerprint);
  return createHash("sha256").update(stableStringify(rows)).digest("hex");
}

function rowId(row: LegacyRow, fallback: string) {
  return stringValue(row, "id", "legacy_subtask_id", "operation_id", "source_operation_id") ?? fallback;
}

function validDate(valueToCheck: string | null): valueToCheck is string {
  return valueToCheck !== null && DATE_KEY.test(valueToCheck);
}

function dateDifferenceInDays(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000);
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function nthWeekdayOfMonth(year: number, monthIndex: number, weekday: number, ordinal: string): string | null {
  const lastDay = daysInMonth(year, monthIndex);
  const candidates: string[] = [];
  for (let day = 1; day <= lastDay; day += 1) {
    const date = new Date(Date.UTC(year, monthIndex, day));
    if (date.getUTCDay() === weekday) candidates.push(date.toISOString().slice(0, 10));
  }
  if (ordinal === "last") return candidates.at(-1) ?? null;
  const index = ["first", "second", "third", "fourth"].indexOf(ordinal);
  return index >= 0 ? candidates[index] ?? null : null;
}

type ScheduleConfiguration = {
  frequency: string | null;
  interval: number | null;
  weekdays: number[];
  dayOfMonth: number | null;
  monthlyMode: string | null;
  monthlyOrdinal: string | null;
  monthlyWeekday: number | null;
};

function scheduleConfiguration(task: LegacyRow): ScheduleConfiguration {
  const weekdays = arrayValue(task, "repeat_days_of_week").map((item) => typeof item === "number" ? item : Number(item));
  return {
    frequency: stringValue(task, "repeat_frequency"),
    interval: numberValue(task, "repeat_interval"),
    weekdays,
    dayOfMonth: numberValue(task, "repeat_day_of_month"),
    monthlyMode: stringValue(task, "repeat_monthly_mode"),
    monthlyOrdinal: stringValue(task, "repeat_monthly_ordinal"),
    monthlyWeekday: numberValue(task, "repeat_monthly_weekday"),
  };
}

function validRepeatInterval(interval: number | null): interval is number {
  return interval !== null && Number.isInteger(interval) && interval >= 1;
}

function isValidSchedule(task: LegacyRow, model: ScheduleModel): boolean {
  const configuration = scheduleConfiguration(task);
  if (model === "unscheduled" || model === "one_time") return configuration.frequency === "none";
  if (!validRepeatInterval(configuration.interval)) return false;
  if (model === "rolling") return ["daily", "custom", "daily_until_complete"].includes(configuration.frequency ?? "");
  if (model === "fixed" && configuration.frequency === "weekly") {
    return configuration.weekdays.length > 0
      && configuration.weekdays.every((weekday) => Number.isInteger(weekday) && weekday >= 0 && weekday <= 6)
      && new Set(configuration.weekdays).size === configuration.weekdays.length;
  }
  if (model === "fixed" && configuration.frequency === "monthly") {
    if (configuration.monthlyMode === "day_of_month") {
      return configuration.dayOfMonth !== null
        && Number.isInteger(configuration.dayOfMonth)
        && configuration.dayOfMonth >= 1
        && configuration.dayOfMonth <= 31
        && configuration.monthlyOrdinal === null
        && configuration.monthlyWeekday === null;
    }
    return configuration.monthlyMode === "ordinal_weekday"
      && configuration.monthlyOrdinal !== null
      && MONTHLY_ORDINALS.has(configuration.monthlyOrdinal)
      && configuration.monthlyWeekday !== null
      && Number.isInteger(configuration.monthlyWeekday)
      && configuration.monthlyWeekday >= 0
      && configuration.monthlyWeekday <= 6
      && configuration.dayOfMonth === null;
  }
  return false;
}

function prospectiveScheduleCompatibility(task: LegacyRow): string[] | null {
  const configuration = scheduleConfiguration(task);
  const dueOn = dateValue(task, "due_on");
  if (!dueOn || !validRepeatInterval(configuration.interval)) return null;
  if (configuration.frequency === "weekly" && configuration.weekdays.length === 0) {
    const weekday = new Date(`${dueOn}T00:00:00Z`).getUTCDay();
    return [
      "legacy_weekly_schedule_from_current_due_on",
      `prospective_weekday_from_due_on:${weekday}`,
      `prospective_cycle_interval:${configuration.interval}`,
      "historical_scope_unknown",
    ];
  }
  if (
    configuration.frequency === "monthly"
    && configuration.monthlyMode === "day_of_month"
    && configuration.dayOfMonth === null
    && configuration.monthlyOrdinal === null
    && configuration.monthlyWeekday === null
  ) {
    return [
      "legacy_monthly_day_of_month_from_current_due_on",
      `prospective_day_of_month_from_due_on:${new Date(`${dueOn}T00:00:00Z`).getUTCDate()}`,
      `prospective_cycle_interval:${configuration.interval}`,
      "historical_scope_unknown",
    ];
  }
  return null;
}

export function classifyScheduleModel(task: LegacyRow): ScheduleClassification {
  const frequency = stringValue(task, "repeat_frequency");
  const rawDueOn = stringValue(task, "due_on");
  const dueOn = dateValue(task, "due_on");
  if (rawDueOn !== null && dueOn === null) return { model: "ambiguous", issueCodes: ["INVALID_RECURRENCE_CONFIGURATION"], evidence: [], prospectiveOnly: false };
  if (frequency === "none" && dueOn === null) return { model: "unscheduled", issueCodes: [], evidence: [], prospectiveOnly: false };
  if (frequency === "none" && dueOn !== null) return { model: "one_time", issueCodes: [], evidence: [], prospectiveOnly: false };
  if (frequency === "daily" || frequency === "custom" || frequency === "daily_until_complete") {
    return isValidSchedule(task, "rolling")
      ? { model: "rolling", issueCodes: [], evidence: [], prospectiveOnly: false }
      : { model: "ambiguous", issueCodes: ["INVALID_RECURRENCE_CONFIGURATION"], evidence: [], prospectiveOnly: false };
  }
  if (frequency === "weekly" || frequency === "monthly") {
    if (isValidSchedule(task, "fixed")) return { model: "fixed", issueCodes: [], evidence: [], prospectiveOnly: false };
    const prospectiveEvidence = prospectiveScheduleCompatibility(task);
    if (prospectiveEvidence) return { model: "fixed", issueCodes: [], evidence: prospectiveEvidence, prospectiveOnly: true };
    return { model: "ambiguous", issueCodes: ["INVALID_RECURRENCE_CONFIGURATION"], evidence: [], prospectiveOnly: false };
  }
  return { model: "ambiguous", issueCodes: ["INVALID_RECURRENCE_CONFIGURATION"], evidence: [], prospectiveOnly: false };
}

function scheduledOnDate(task: LegacyRow, model: ScheduleModel, date: string, anchorDate: string | null = null): boolean {
  if (!validDate(date) || model === "ambiguous" || model === "unscheduled") return false;
  const configuration = scheduleConfiguration(task);
  if (model === "one_time") return dateValue(task, "due_on") === date;
  if (configuration.frequency === "daily" || configuration.frequency === "custom" || configuration.frequency === "daily_until_complete") {
    if (!anchorDate || !validDate(anchorDate)) return false;
    const delta = dateDifferenceInDays(anchorDate, date);
    return delta >= 0 && delta % (configuration.interval ?? 1) === 0;
  }
  if (configuration.frequency === "weekly") {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (!configuration.weekdays.includes(weekday)) return false;
    if (!anchorDate || (configuration.interval ?? 1) <= 1) return true;
    const delta = dateDifferenceInDays(anchorDate, date);
    return delta >= 0 && Math.floor(delta / 7) % (configuration.interval ?? 1) === 0;
  }
  if (configuration.frequency === "monthly") {
    const dateObject = new Date(`${date}T00:00:00Z`);
    if (configuration.monthlyMode === "ordinal_weekday") {
      return nthWeekdayOfMonth(
        dateObject.getUTCFullYear(),
        dateObject.getUTCMonth(),
        configuration.monthlyWeekday ?? -1,
        configuration.monthlyOrdinal ?? "",
      ) === date;
    }
    return dateObject.getUTCDate() === Math.min(configuration.dayOfMonth ?? 0, daysInMonth(dateObject.getUTCFullYear(), dateObject.getUTCMonth()));
  }
  return false;
}

function sourceStatus(sources: MigrationSourceEvidence, name: SourceName): SourceStatus {
  return sources.availability?.[name] ?? { available: true };
}

function sourceFingerprintForEntity(sources: MigrationSourceEvidence, taskId: string): Record<string, string> {
  const history = sources.history.filter((row) => stringValue(row, "task_id") === taskId);
  const rewardClaims = sources.rewardClaims.filter((row) => stringValue(row, "task_id") === taskId);
  const taskEvents = sources.taskEvents.filter((row) => stringValue(row, "task_id") === taskId);
  const pendingItems = sources.pendingRewardItems.filter((row) => {
    const payload = value(row, "reward_payload", "payload");
    return JSON.stringify(payload ?? {}).includes(taskId);
  });
  return {
    tasks: fingerprintEvidence(sources.tasks.filter((row) => stringValue(row, "id") === taskId)),
    history: fingerprintEvidence(history),
    rewards: fingerprintEvidence({
      claims: rewardClaims,
      taskEvents,
      pendingItems,
      rolls: sources.rewardRolls.filter((row) => rewardClaims.some((claim) => stringValue(claim, "reward_roll_id") === stringValue(row, "id"))),
      pointLedger: sources.pointLedger.filter((row) => stringValue(row, "ref_id") === taskId),
    }),
  };
}

function classifyAnchor(
  task: LegacyRow,
  model: ScheduleModel,
  scheduleEvidence: readonly string[],
  historyClassifications: readonly HistoryClassification[],
  occurrenceClassifications: readonly OccurrenceClassification[],
  delayState: "none" | "safe" | "ambiguous",
  historicalScheduleDates: ReadonlySet<string>,
  profileAvailable: boolean,
): EntityClassification["anchor"] {
  if (model === "unscheduled") return { classification: "proven", confidence: "proven", date: null, evidence: ["repeat_frequency=none", "due_on=null"] };
  if (model === "one_time") {
    const dueOn = dateValue(task, "due_on");
    return dueOn
      ? { classification: "proven", confidence: "proven", date: dueOn, evidence: ["one_time_due_on"] }
      : { classification: "ambiguous", confidence: "ambiguous", date: null, evidence: ["one_time_due_on_missing"] };
  }
  if (model === "ambiguous") return { classification: "ambiguous", confidence: "ambiguous", date: null, evidence: ["invalid_recurrence_configuration"] };

  const exactOccurrenceDates = occurrenceClassifications
    .filter((item) => item.classification === "proven" && item.scheduledDueOn !== null)
    .map((item) => item.scheduledDueOn as string)
    .sort(compareStrings);
  const explicitDates = historyClassifications
    .filter((item) => item.classification === "explicit" && item.entryDate !== null && ACTIVE_HISTORY_STATUSES.has(item.status ?? ""))
    .map((item) => item.entryDate as string)
    .sort(compareStrings);
  const canUseProspectiveCurrentSchedule = model === "rolling"
    && profileAvailable
    && dateValue(task, "due_on") !== null
    && historyClassifications.every((item) => item.classification !== "contradictory");
  const prospectiveEvidence = (extra: readonly string[] = []) => [
    "valid_forward_configuration",
    "current_due_cursor_only",
    ...(model === "rolling" ? ["rolling_current_schedule_deterministic"] : []),
    ...(delayState === "ambiguous" ? ["unresolved_historical_delay_provenance"] : []),
    ...scheduleEvidence,
    ...extra,
    "historical_scope_unknown",
  ];
  if (exactOccurrenceDates.length > 0) {
    const occurrenceEvidence = occurrenceClassifications.filter((item) => item.scheduledDueOn !== null);
    const historicalScheduleProven = occurrenceEvidence.length > 0
      && occurrenceEvidence.every((item) => item.classification === "proven" && item.evidence.includes("historical_schedule_boundary"));
    if (historicalScheduleProven) {
      return {
        classification: "reconstructable",
        confidence: "high_confidence",
        date: exactOccurrenceDates[0],
        evidence: ["exact_occurrence_identity", "historical_schedule_boundary"],
      };
    }
    if (canUseProspectiveCurrentSchedule) {
      return {
        classification: "prospective",
        confidence: "high_confidence",
        date: null,
        evidence: prospectiveEvidence(["occurrence_identity_proven", "historical_schedule_provenance_unavailable"]),
      };
    }
    return {
      classification: "ambiguous",
      confidence: "ambiguous",
      date: null,
      evidence: ["occurrence_identity_proven", "historical_schedule_provenance_unavailable"],
    };
  }
  if (explicitDates.length > 0) {
    const provenDates = explicitDates.filter((date) => historicalScheduleDates.has(date));
    if (provenDates.length === explicitDates.length) {
      return {
        classification: "reconstructable",
        confidence: "high_confidence",
        date: provenDates[0],
        evidence: ["explicit_history", "historical_schedule_boundary"],
      };
    }
    if (provenDates.length > 0) {
      if (canUseProspectiveCurrentSchedule) {
        return {
          classification: "prospective",
          confidence: "high_confidence",
          date: null,
          evidence: prospectiveEvidence(["explicit_history", "historical_schedule_evidence_conflicts"]),
        };
      }
      return { classification: "ambiguous", confidence: "ambiguous", date: null, evidence: ["explicit_history", "historical_schedule_evidence_conflicts"] };
    }
  }
  if (canUseProspectiveCurrentSchedule || (profileAvailable && dateValue(task, "due_on") !== null && historyClassifications.every((item) => item.classification !== "contradictory"))) {
    return {
      classification: "prospective",
      confidence: "high_confidence",
      date: null,
      evidence: prospectiveEvidence(),
    };
  }
  if (delayState === "ambiguous") {
    return { classification: "ambiguous", confidence: "ambiguous", date: null, evidence: ["unresolved_delay_origin_or_target"] };
  }
  return { classification: "ambiguous", confidence: "ambiguous", date: null, evidence: ["recurrence_anchor_unavailable"] };
}

function hasValidProfileContext(profile: LegacyRow | null): boolean {
  if (!profile) return false;
  const timezone = stringValue(profile, "timezone");
  const dayStart = stringValue(profile, "day_start_time", "logical_day_start");
  if (timezone === null || dayStart === null || !/^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/.test(dayStart)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

function profileLogicalDayContext(profile: LegacyRow | null): ProfileLogicalDayContext | null {
  if (!hasValidProfileContext(profile)) return null;
  return {
    timezone: stringValue(profile, "timezone") as string,
    dayStartTime: stringValue(profile, "day_start_time", "logical_day_start") as string,
  };
}

export function deriveCurrentLogicalDate(profile: LegacyRow | null, currentInstant: string | Date = new Date()): string {
  const context = profileLogicalDayContext(profile);
  if (!context) throw new MigrationClassifierDiagnostic("INVALID_LOGICAL_DAY_SETTINGS", "profile timezone and day_start_time are required to derive the current Logical Day");
  const instant = currentInstant instanceof Date ? currentInstant : new Date(currentInstant);
  if (Number.isNaN(instant.getTime())) throw new MigrationClassifierDiagnostic("INVALID_CURRENT_INSTANT", "current instant must be a valid timestamp");
  try {
    return logicalDateForTimestamp(instant, context.timezone, context.dayStartTime);
  } catch (error) {
    throw new MigrationClassifierDiagnostic("INVALID_LOGICAL_DAY_SETTINGS", `profile Logical Day settings could not be evaluated: ${String(error)}`);
  }
}

function hasExplicitActor(row: LegacyRow): boolean {
  const actor = stringValue(row, "actor_kind", "writer_kind", "source", "provenance", "origin");
  return actor !== null && ["user", "manual", "command", "authorized_automation", "explicit"].some((candidate) => actor.toLowerCase().includes(candidate));
}

function hasAutomaticActor(row: LegacyRow): boolean {
  const actor = stringValue(row, "actor_kind", "writer_kind", "source", "provenance", "origin", "event_type");
  return actor !== null && ["rollover", "automatic", "reconcile", "derived"].some((candidate) => actor.toLowerCase().includes(candidate));
}

function hasProvenExplicitWriter(taskId: string, row: LegacyRow, sources: MigrationSourceEvidence): { proven: boolean; evidence: string[] } {
  const entryDate = dateValue(row, "entry_date");
  if (!entryDate || hasAutomaticActor(row) || hasMatchingRolloverEvidence(taskId, entryDate, sources.rolloverEvidence)) {
    return { proven: false, evidence: [] };
  }
  if (stringValue(row, "command_id") !== null) return { proven: true, evidence: ["command_identity", "writer_chronology"] };
  if (hasExplicitActor(row)) return { proven: true, evidence: ["explicit_writer_context", "writer_chronology"] };
  return { proven: false, evidence: [] };
}

function hasMatchingRolloverEvidence(
  taskId: string,
  entryDate: string | null,
  rolloverEvidence: readonly LegacyRow[],
): boolean {
  if (!entryDate) return false;
  return rolloverEvidence.some((row) => {
    const evidenceTaskId = stringValue(row, "task_id", "entity_id");
    const evidenceDate = dateValue(row, "logical_date", "entry_date", "occurred_on");
    const taskIds = arrayValue(row, "task_ids", "entity_ids").map((item) => typeof item === "string" ? item : null).filter((item): item is string => item !== null);
    return evidenceDate === entryDate && (evidenceTaskId === taskId || taskIds.includes(taskId));
  });
}

type RawHistoryClassification = Omit<HistoryClassification, "historicalEvidenceEligible" | "provenance" | "excludedFromCanonicalReconstruction">;

function classifyHistory(
  taskId: string,
  history: readonly LegacyRow[],
  sources: MigrationSourceEvidence,
  excludeLegacyHistory = false,
): HistoryClassification[] {
  const relevant = history.filter((row) => stringValue(row, "task_id") === taskId);
  const byDate = new Map<string, LegacyRow[]>();
  for (const row of relevant) {
    const date = dateValue(row, "entry_date");
    if (date) byDate.set(date, [...(byDate.get(date) ?? []), row]);
  }
  const classifications: RawHistoryClassification[] = [...relevant]
    .sort((left, right) => compareStrings(rowId(left, ""), rowId(right, "")))
    .map((row, index): RawHistoryClassification => {
      const id = rowId(row, `${taskId}:history:${index}`);
      const entryDate = dateValue(row, "entry_date");
      const status = stringValue(row, "status");
      const issues: string[] = [];
      const evidence: string[] = [];
      const duplicateDate = entryDate !== null && (byDate.get(entryDate)?.length ?? 0) > 1;
      if (stringValue(row, "user_id") !== null && stringValue(row, "user_id") !== stringValue(sources.tasks.find((task) => stringValue(task, "id") === taskId), "user_id")) {
        return {
          historyId: id,
          entryDate,
          status,
          classification: "ambiguous",
          confidence: "not_promotable",
          canonicalEligible: false,
          evidence: ["history_owner_mismatch"],
          blockingIssueCodes: ["ORPHAN_HISTORY_REFERENCE"],
        };
      }
      if (duplicateDate) {
        issues.push("CONTRADICTORY_HISTORY_SAME_ENTITY_DATE");
        return {
          historyId: id,
          entryDate,
          status,
          classification: "contradictory",
          confidence: "not_promotable",
          canonicalEligible: false,
          evidence: ["multiple_assertions_without_replacement_proof"],
          blockingIssueCodes: issues,
        };
      }
      if (!status || !HISTORY_STATUSES.has(status)) {
        return {
          historyId: id,
          entryDate,
          status,
          classification: "ambiguous",
          confidence: "not_promotable",
          canonicalEligible: false,
          evidence: ["unsupported_history_status"],
          blockingIssueCodes: ["INVALID_HISTORY_STATUS"],
        };
      }
      if (status === "missed") {
        const writer = hasProvenExplicitWriter(taskId, row, sources);
        if (writer.proven) {
          evidence.push("explicit_manual_missed", ...writer.evidence);
          return { historyId: id, entryDate, status, classification: "explicit", confidence: "high_confidence", canonicalEligible: true, evidence, blockingIssueCodes: [] };
        }
        if (hasAutomaticActor(row) || hasMatchingRolloverEvidence(taskId, entryDate, sources.rolloverEvidence)) {
          evidence.push("rollover_evidence");
          return { historyId: id, entryDate, status, classification: "automatic_missed", confidence: "not_promotable", canonicalEligible: false, evidence, blockingIssueCodes: ["AUTOMATIC_MISSED_NOT_CANONICAL"] };
        }
        return { historyId: id, entryDate, status, classification: "ambiguous", confidence: "not_promotable", canonicalEligible: false, evidence: ["manual_and_automatic_writers_not_distinguished"], blockingIssueCodes: ["AMBIGUOUS_MISSED_PROVENANCE"] };
      }
      if (status === "complete") {
        if (stringValue(row, "event_type") === "completed_permanently") {
          return { historyId: id, entryDate, status, classification: "explicit", confidence: "proven", canonicalEligible: true, evidence: ["completed_permanently_event"], blockingIssueCodes: [] };
        }
        return { historyId: id, entryDate, status, classification: "ambiguous", confidence: "not_promotable", canonicalEligible: false, evidence: ["complete_status_without_terminal_event"], blockingIssueCodes: ["COMPLETE_PROJECTION_ONLY"] };
      }
      const writer = hasProvenExplicitWriter(taskId, row, sources);
      if (!writer.proven) {
        return {
          historyId: id,
          entryDate,
          status,
          classification: "ambiguous",
          confidence: "not_promotable",
          canonicalEligible: false,
          evidence: ["history_writer_provenance_unavailable"],
          blockingIssueCodes: ["AMBIGUOUS_HISTORY_PROVENANCE"],
        };
      }
      evidence.push(...writer.evidence);
      return { historyId: id, entryDate, status, classification: "explicit", confidence: stringValue(row, "command_id") ? "proven" : "high_confidence", canonicalEligible: true, evidence, blockingIssueCodes: issues };
    });
  return classifications.map((classification) => {
    const historicalEvidenceEligible = !excludeLegacyHistory
      && classification.classification !== "contradictory"
      && classification.status !== null
      && HISTORY_STATUSES.has(classification.status);
    const provenance = !excludeLegacyHistory && (classification.canonicalEligible || classification.classification === "automatic_missed")
      ? "proven"
      : "unknown";
    return {
      ...classification,
      canonicalEligible: excludeLegacyHistory ? false : classification.canonicalEligible,
      historicalEvidenceEligible,
      provenance,
      excludedFromCanonicalReconstruction: excludeLegacyHistory,
      evidence: excludeLegacyHistory
        ? [...classification.evidence, "owner_approved_history_exclusion"]
        : classification.evidence,
      blockingIssueCodes: excludeLegacyHistory ? [] : classification.blockingIssueCodes,
    };
  });
}

type HistoricalScheduleEvidence = {
  effectiveFrom: string;
  anchorDate: string;
  model: ScheduleModel;
  schedule: LegacyRow;
};

function historicalScheduleEvidenceFromRow(row: LegacyRow): HistoricalScheduleEvidence | null {
  const nested = value(row, "historical_schedule", "schedule_snapshot", "schedule_boundary", "schedule");
  const snapshot = nested && typeof nested === "object" && !Array.isArray(nested) ? nested as LegacyRow : row;
  const frequency = stringValue(snapshot, "repeat_frequency", "frequency")
    ?? stringValue(row, "repeat_frequency_at_event", "historical_repeat_frequency", "schedule_repeat_frequency");
  const effectiveFrom = dateValue(row, "effective_from_logical_date", "schedule_effective_from", "effective_from", "boundary_date", "event_logical_date", "logical_date", "occurred_on")
    ?? dateValue(snapshot, "effective_from_logical_date", "schedule_effective_from", "effective_from", "boundary_date");
  if (!frequency || !effectiveFrom) return null;
  const schedule: LegacyRow = {
    repeat_frequency: frequency,
    repeat_interval: numberValue(snapshot, "repeat_interval", "interval") ?? numberValue(row, "repeat_interval_at_event", "historical_repeat_interval") ?? 1,
    repeat_days_of_week: arrayValue(snapshot, "repeat_days_of_week", "weekdays").length > 0
      ? arrayValue(snapshot, "repeat_days_of_week", "weekdays")
      : arrayValue(row, "repeat_days_of_week_at_event", "historical_repeat_days_of_week"),
    repeat_day_of_month: numberValue(snapshot, "repeat_day_of_month", "day_of_month") ?? numberValue(row, "repeat_day_of_month_at_event", "historical_repeat_day_of_month"),
    repeat_monthly_mode: stringValue(snapshot, "repeat_monthly_mode", "monthly_mode") ?? stringValue(row, "repeat_monthly_mode_at_event") ?? "day_of_month",
    repeat_monthly_ordinal: stringValue(snapshot, "repeat_monthly_ordinal", "monthly_ordinal") ?? stringValue(row, "repeat_monthly_ordinal_at_event"),
    repeat_monthly_weekday: numberValue(snapshot, "repeat_monthly_weekday", "monthly_weekday") ?? numberValue(row, "repeat_monthly_weekday_at_event"),
    due_on: dateValue(snapshot, "due_on", "one_time_due_on", "current_due_on") ?? dateValue(row, "due_on_at_event", "historical_due_on"),
  };
  const scheduleClassification = classifyScheduleModel(schedule);
  if (scheduleClassification.model === "ambiguous" || scheduleClassification.prospectiveOnly) return null;
  const model = scheduleClassification.model;
  const anchorDate = dateValue(snapshot, "anchor_date", "schedule_anchor_date", "due_on", "one_time_due_on")
    ?? dateValue(row, "anchor_date_at_event", "historical_anchor_date")
    ?? effectiveFrom;
  return { effectiveFrom, anchorDate, model, schedule };
}

function historicalScheduleEvidenceForDate(
  taskId: string,
  date: string,
  history: readonly LegacyRow[],
  taskEvents: readonly LegacyRow[],
  userId?: string,
): HistoricalScheduleEvidence | null {
  const candidates = [...history, ...taskEvents]
    .filter((row) => stringValue(row, "task_id", "entity_id") === taskId && (userId === undefined || stringValue(row, "user_id") === null || stringValue(row, "user_id") === userId))
    .map(historicalScheduleEvidenceFromRow)
    .filter((candidate): candidate is HistoricalScheduleEvidence => candidate !== null)
    .filter((candidate) => candidate.effectiveFrom <= date && scheduledOnDate(candidate.schedule, candidate.model, date, candidate.anchorDate));
  return candidates.length === 1 ? candidates[0] : null;
}

function occurrenceDateFromKey(row: LegacyRow, taskId: string): string | null {
  const key = stringValue(row, "occurrence_key");
  if (!key) return null;
  const match = key.match(new RegExp(`^task:${taskId.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}:occurrence:(\\d{4}-\\d{2}-\\d{2})$`));
  return match?.[1] ?? null;
}

function classifyOccurrences(
  taskId: string,
  task: LegacyRow,
  model: ScheduleModel,
  history: readonly LegacyRow[],
  historyClassifications: readonly HistoryClassification[],
  sources: MigrationSourceEvidence,
): OccurrenceClassification[] {
  return history
    .filter((row) => stringValue(row, "task_id") === taskId)
    .sort((left, right) => compareStrings(rowId(left, ""), rowId(right, "")))
    .flatMap((row, index): OccurrenceClassification[] => {
      const historyId = rowId(row, `${taskId}:history:${index}`);
      const historyClassification = historyClassifications.find((item) => item.historyId === historyId);
      if (historyClassification?.classification === "automatic_missed") return [];
      const rawDue = dateValue(row, "occurrence_due_on");
      const keyDue = occurrenceDateFromKey(row, taskId);
      const due = rawDue ?? keyDue;
      if (rawDue && keyDue && rawDue !== keyDue) {
        return [{ historyId, scheduledDueOn: null, classification: "ambiguous", confidence: "not_promotable", evidence: ["occurrence_key_date_mismatch"], blockingIssueCodes: ["AMBIGUOUS_OCCURRENCE_IDENTITY"] }];
      }
      if (!due) {
        if (historyClassification?.classification === "explicit" && model === "one_time" && dateValue(task, "due_on") === dateValue(row, "entry_date")) {
          return [{ historyId, scheduledDueOn: dateValue(task, "due_on"), classification: "reconstructable", confidence: "high_confidence", evidence: ["one_time_due_date_reconstruction"], blockingIssueCodes: [] }];
        }
        return [];
      }
      const historicalSchedule = historicalScheduleEvidenceForDate(taskId, due, history, sources.taskEvents, stringValue(task, "user_id") ?? undefined);
      if (rawDue && keyDue) {
        return [{
          historyId,
          scheduledDueOn: due,
          classification: "proven",
          confidence: "high_confidence",
          evidence: ["matching_occurrence_key_and_due_date", ...(historicalSchedule ? ["historical_schedule_boundary"] : [])],
          blockingIssueCodes: [],
        }];
      }
      if (historicalSchedule) {
        return [{ historyId, scheduledDueOn: due, classification: "reconstructable", confidence: "high_confidence", evidence: ["single_occurrence_date_evidence", "historical_schedule_boundary"], blockingIssueCodes: [] }];
      }
      return [{ historyId, scheduledDueOn: due, classification: "ambiguous", confidence: "not_promotable", evidence: ["occurrence_schedule_provenance_unavailable"], blockingIssueCodes: ["AMBIGUOUS_OCCURRENCE_IDENTITY"] }];
    });
}

function delayTarget(row: LegacyRow): string | null {
  return dateValue(row, "delay_target_on", "target_due_on", "new_due_on")
    ?? asDate(nestedValue(row, ["metadata", "delayTargetOn"]));
}

function classifyDelay(
  task: LegacyRow,
  history: readonly LegacyRow[],
  model: ScheduleModel,
  occurrenceClassifications: readonly OccurrenceClassification[],
  sources: MigrationSourceEvidence,
): { state: "none" | "safe" | "ambiguous"; issueCodes: string[]; evidence: string[] } {
  const delayed = history.filter((row) => stringValue(row, "status") === "delayed");
  if (delayed.length === 0) return { state: "none", issueCodes: [], evidence: [] };
  const issues: string[] = [];
  const evidence: string[] = [];
  for (const row of delayed) {
    const historyId = rowId(row, "");
    const origin = dateValue(row, "occurrence_due_on") ?? occurrenceClassifications.find((item) => item.historyId === historyId)?.scheduledDueOn;
    const actionDate = dateValue(row, "entry_date");
    const target = delayTarget(row);
    const occurrenceEvidence = occurrenceClassifications.find((item) => item.historyId === historyId);
    const historicalOrigin = origin !== null && historicalScheduleEvidenceForDate(
      stringValue(task, "id") ?? "",
      origin,
      history,
      sources.taskEvents,
      stringValue(task, "user_id") ?? undefined,
    ) !== null;
    const oneTimeOrigin = model === "one_time" && origin !== null && dateValue(task, "due_on") === origin;
    if (!origin || !actionDate || !target || (!historicalOrigin && !oneTimeOrigin && !occurrenceEvidence?.evidence.includes("historical_schedule_boundary")) || dateDifferenceInDays(actionDate, target) <= 0) {
      issues.push("DELAY_ORIGIN_OR_TARGET_UNPROVEN");
      evidence.push("historical_delay_provenance_unknown");
    }
  }
  return issues.length > 0
    ? { state: "ambiguous", issueCodes: [...new Set(issues)], evidence: [...new Set(evidence)] }
    : { state: "safe", issueCodes: [], evidence: ["delay_origin_target_proven"] };
}

function analyzeHierarchy(tasks: readonly LegacyRow[], userId: string): Map<string, { kind: EntityClassification["entityKind"]; issues: string[]; cycle: boolean; orphan: boolean }> {
  const byId = new Map<string, LegacyRow>();
  const issuesById = new Map<string, string[]>();
  for (const task of tasks) {
    const id = stringValue(task, "id");
    if (!id) continue;
    if (byId.has(id)) issuesById.set(id, ["DUPLICATE_TASK_ID"]);
    else byId.set(id, task);
  }
  const cycleNodes = new Set<string>();
  const orphanNodes = new Set<string>();
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const visit = (id: string) => {
    if (state.get(id) === "done") return;
    if (state.get(id) === "visiting") {
      const start = stack.indexOf(id);
      for (const cycleId of stack.slice(start)) cycleNodes.add(cycleId);
      return;
    }
    state.set(id, "visiting");
    stack.push(id);
    const task = byId.get(id);
    const parentId = stringValue(task, "parent_task_id");
    if (parentId) {
      const parent = byId.get(parentId);
      if (!parent) orphanNodes.add(id);
      else if (stringValue(parent, "user_id") !== userId) orphanNodes.add(id);
      else visit(parentId);
    }
    stack.pop();
    state.set(id, "done");
  };
  for (const id of byId.keys()) visit(id);
  const result = new Map<string, { kind: EntityClassification["entityKind"]; issues: string[]; cycle: boolean; orphan: boolean }>();
  for (const [id, task] of byId) {
    const parentId = stringValue(task, "parent_task_id");
    const issues = [...(issuesById.get(id) ?? [])];
    if (cycleNodes.has(id)) issues.push("HIERARCHY_CYCLE");
    if (orphanNodes.has(id)) issues.push(byId.has(parentId ?? "") ? "CROSS_USER_PARENT" : "ORPHAN_PARENT_REFERENCE");
    let depth = 0;
    let current = parentId;
    const seen = new Set<string>();
    while (current && byId.has(current) && !seen.has(current)) {
      seen.add(current);
      depth += 1;
      current = stringValue(byId.get(current), "parent_task_id");
    }
    result.set(id, {
      kind: depth === 0 ? "parent" : depth === 1 ? "step" : "substep",
      issues: [...new Set(issues)],
      cycle: cycleNodes.has(id),
      orphan: orphanNodes.has(id),
    });
  }
  return result;
}

function classifyLegacySubtasks(sources: MigrationSourceEvidence, userId: string, tasksById: Map<string, LegacyRow>): { byTask: Map<string, string[]>; counts: MigrationCounts["legacySubtasks"] } {
  const counts = { promoted: 0, unpromoted: 0, nested: 0, orphan: 0, duplicate: 0 };
  const byTask = new Map<string, string[]>();
  const ownerSubtaskIds = new Set(sources.subtasks.filter((subtask) => stringValue(subtask, "user_id") === userId).map((subtask) => stringValue(subtask, "id")).filter((id): id is string => id !== null));
  const promotionsByLegacy = new Map<string, LegacyRow[]>();
  const promotionsByTask = new Map<string, LegacyRow[]>();
  for (const promotion of sources.promotions) {
    const legacyId = stringValue(promotion, "legacy_subtask_id");
    const taskId = stringValue(promotion, "task_id");
    if (legacyId) promotionsByLegacy.set(legacyId, [...(promotionsByLegacy.get(legacyId) ?? []), promotion]);
    if (taskId) promotionsByTask.set(taskId, [...(promotionsByTask.get(taskId) ?? []), promotion]);
  }
  for (const subtask of sources.subtasks) {
    const subtaskId = stringValue(subtask, "id");
    if (!subtaskId || stringValue(subtask, "user_id") !== userId) continue;
    const parentSubtaskId = stringValue(subtask, "parent_subtask_id");
    const taskId = stringValue(subtask, "task_id");
    const promotions = promotionsByLegacy.get(subtaskId) ?? [];
    if (parentSubtaskId) counts.nested += 1;
    if (!taskId || !tasksById.has(taskId)) {
      counts.orphan += 1;
      if (taskId) byTask.set(taskId, [...(byTask.get(taskId) ?? []), "ORPHAN_LEGACY_SUBTASK_REFERENCE"]);
      continue;
    }
    const promotedTaskId = promotions.length === 1 ? stringValue(promotions[0], "task_id") : null;
    const validPromotion = promotions.length === 1
      && promotedTaskId !== null
      && tasksById.has(promotedTaskId)
      && stringValue(promotions[0], "user_id") === userId
      && (promotionsByTask.get(promotedTaskId)?.length ?? 0) === 1;
    if (validPromotion) {
      counts.promoted += 1;
      byTask.set(promotedTaskId as string, [...(byTask.get(promotedTaskId as string) ?? []), "LEGACY_SUBTASK_PROMOTED"]);
    } else if (promotions.length === 0) {
      counts.unpromoted += 1;
      byTask.set(taskId, [...(byTask.get(taskId) ?? []), "LEGACY_SUBTASK_UNPROMOTED"]);
    } else {
      counts.duplicate += 1;
      byTask.set(taskId, [...(byTask.get(taskId) ?? []), "DUPLICATE_LEGACY_SUBTASK_PROMOTION"]);
    }
  }
  for (const promotion of sources.promotions) {
    const legacyId = stringValue(promotion, "legacy_subtask_id");
    if (stringValue(promotion, "user_id") === userId && legacyId !== null && !ownerSubtaskIds.has(legacyId)) counts.orphan += 1;
  }
  return { byTask, counts };
}

function classifyLifecycle(
  task: LegacyRow,
  historyClassifications: readonly HistoryClassification[],
  history: readonly LegacyRow[],
  preserveCurrentCompleteProjection = false,
  resetStaleCompleteProjection = false,
): {
  state: EntityClassification["lifecycleState"];
  issueCodes: string[];
  projectionDisposition: EntityClassification["lifecycleProjectionDisposition"];
} {
  const issues: string[] = [];
  const completeHistory = historyClassifications.filter((item) => item.status === "complete" && item.classification === "explicit");
  const completeDate = completeHistory.map((item) => item.entryDate).filter((date): date is string => date !== null).sort(compareStrings)[0] ?? null;
  const laterActive = completeDate !== null && history.some((row) => {
    const date = dateValue(row, "entry_date");
    return date !== null && date > completeDate && ACTIVE_HISTORY_STATUSES.has(stringValue(row, "status") ?? "") && stringValue(row, "status") !== "complete";
  });
  if (laterActive) issues.push("COMPLETE_FOLLOWED_BY_ACTIVE_HISTORY");
  const status = stringValue(task, "status");
  const currentCompleteProjection = status === "complete" && stringValue(task, "completed_at") !== null;
  const staleCompleteProjection = ["pending", "missed"].includes(status ?? "") && stringValue(task, "completed_at") !== null;
  const preserveCompleteProjection = preserveCurrentCompleteProjection && currentCompleteProjection;
  const resetCompleteProjection = resetStaleCompleteProjection && staleCompleteProjection;
  if (preserveCurrentCompleteProjection && !currentCompleteProjection) issues.push("OWNER_COMPLETE_PROJECTION_NOT_MATCHED");
  if (resetStaleCompleteProjection && !staleCompleteProjection) issues.push("OWNER_STALE_COMPLETE_PROJECTION_NOT_MATCHED");
  const terminal = resetCompleteProjection
    ? "active"
    : completeHistory.length > 0 || preserveCompleteProjection
    ? "permanently_complete"
    : status === "complete" || stringValue(task, "completed_at") !== null
      ? "ambiguous"
      : "active";
  if (terminal === "ambiguous") issues.push("COMPLETE_PROJECTION_ONLY");
  if (laterActive) issues.push("COMPLETE_TERMINAL_CONTRADICTION");

  const container = status === "archived" ? "archived" : status === "trashed" ? "trashed" : "active";
  const rawPrior = stringValue(task, "prior_container_state", "previous_container_state");
  const priorContainer = container !== "trashed" ? "proven" : rawPrior === "active" || rawPrior === "archived" ? "proven" : "unknown";
  if (container === "trashed" && rawPrior !== null && !["active", "archived"].includes(rawPrior)) {
    issues.push("CONTRADICTORY_TRASH_PRIOR_CONTAINER");
  }
  return {
    state: { terminal, container, priorContainer },
    issueCodes: [...new Set(issues)],
    projectionDisposition: preserveCompleteProjection
      ? "owner_approved_complete_preserved"
      : resetCompleteProjection
        ? "owner_approved_stale_complete_reset"
        : "retained",
  };
}

function isOwnerApprovedStaleWorkflowReset(
  task: LegacyRow,
  scheduleModel: ScheduleModel,
  logicalDate: string | null,
  lifecycle: EntityClassification["lifecycleState"],
  disposition: MigrationEntityDisposition | null,
): boolean {
  if (!disposition?.resetStaleLegacyWorkflowProjection) return false;
  if (lifecycle.terminal !== "active" || lifecycle.container !== "active") return false;
  const activeDate = dateValue(task, "active_status_logical_date");
  const claimedOccurrence = dateValue(task, "active_occurrence_due_on");
  return stringValue(task, "status") === "missed"
    && scheduleModel === "fixed"
    && stringValue(task, "repeat_frequency") === "weekly"
    && dateValue(task, "due_on") !== null
    && logicalDate !== null
    && activeDate !== null
    && claimedOccurrence !== null
    && activeDate < logicalDate
    && claimedOccurrence < logicalDate;
}

function classifyWorkflow(
  task: LegacyRow,
  logicalDate: string | null,
  lifecycle: EntityClassification["lifecycleState"],
  occurrenceClassifications: readonly OccurrenceClassification[],
  resetStaleLegacyWorkflowProjection = false,
): { state: EntityClassification["workflowState"]; issueCodes: string[] } {
  const status = stringValue(task, "status");
  const activeDate = dateValue(task, "active_status_logical_date");
  const claimedOccurrence = dateValue(task, "active_occurrence_due_on");
  if (resetStaleLegacyWorkflowProjection) return { state: "none", issueCodes: [] };
  if (status !== "in_progress" && activeDate === null && claimedOccurrence === null) return { state: "none", issueCodes: [] };
  if (lifecycle.terminal === "permanently_complete" || lifecycle.container !== "active") return { state: "contradictory", issueCodes: ["IN_PROGRESS_LIFECYCLE_CONTRADICTION"] };
  if (status !== "in_progress" || activeDate === null) return { state: "contradictory", issueCodes: ["IN_PROGRESS_FIELDS_CONTRADICTORY"] };
  if (logicalDate === null) return { state: "contradictory", issueCodes: ["LOGICAL_DAY_UNAVAILABLE"] };
  if (activeDate < logicalDate) return { state: "stale", issueCodes: ["STALE_IN_PROGRESS_NOT_DID_MY_BEST"] };
  if (claimedOccurrence !== null && !occurrenceClassifications.some((item) => item.classification === "proven" && item.scheduledDueOn === claimedOccurrence)) {
    return { state: "contradictory", issueCodes: ["IN_PROGRESS_OCCURRENCE_UNPROVEN"] };
  }
  return { state: "valid_in_progress", issueCodes: [] };
}

function rewardPayloadMatchesTask(payload: unknown, taskId: string): { task: boolean; date: string | null } {
  if (!payload || typeof payload !== "object") return { task: false, date: null };
  const object = payload as LegacyRow;
  const serialized = JSON.stringify(payload);
  const task = serialized.includes(taskId);
  const date = asDate(object.rewardDate) ?? asDate(object.reward_date);
  return { task, date };
}

function classifyRewards(
  taskId: string,
  historyClassifications: readonly HistoryClassification[],
  sources: MigrationSourceEvidence,
  excludeLegacyHistory = false,
): { state: EntityClassification["rewardBootstrapState"]; counts: MigrationCounts["rewards"]; issueCodes: string[] } {
  const counts = { mapped: 0, consumed: 0, pending: 0, ambiguous: 0 };
  const issues: string[] = [];
  if (excludeLegacyHistory) return { state: "none", counts, issueCodes: [] };
  const successDates = new Set(historyClassifications.filter((item) => item.classification === "explicit" && ["done", "did_my_best", "complete"].includes(item.status ?? "") && item.entryDate).map((item) => item.entryDate as string));
  const claims = sources.rewardClaims.filter((row) => stringValue(row, "task_id") === taskId);
  const rollsById = new Map(sources.rewardRolls.map((row) => [stringValue(row, "id"), row]));
  let consumed = 0;
  for (const claim of claims) {
    const rewardDate = dateValue(claim, "reward_date");
    const rollId = stringValue(claim, "reward_roll_id");
    const roll = rollId ? rollsById.get(rollId) : undefined;
    const rollDate = dateValue(roll, "reward_date");
    const subtaskId = stringValue(claim, "subtask_id");
    const subtaskMappingProven = subtaskId === null || (
      sources.subtasks.filter((row) => stringValue(row, "id") === subtaskId && stringValue(row, "user_id") === stringValue(claim, "user_id")).length === 1
      && sources.promotions.filter((row) => stringValue(row, "legacy_subtask_id") === subtaskId && stringValue(row, "user_id") === stringValue(claim, "user_id")).length === 1
    );
    if (!subtaskMappingProven) issues.push("AMBIGUOUS_REWARD_SUBTASK_MAPPING");
    if (rewardDate && roll && rollDate === rewardDate && successDates.has(rewardDate) && subtaskMappingProven) {
      counts.mapped += 1;
      counts.consumed += 1;
      consumed += 1;
    } else {
      counts.ambiguous += 1;
      issues.push("AMBIGUOUS_REWARD_CLAIM");
    }
  }
  const pending = sources.pendingRewardItems.filter((row) => {
    const match = rewardPayloadMatchesTask(value(row, "reward_payload", "payload"), taskId);
    const operationId = stringValue(row, "source_operation_id");
    const operationExists = operationId === null || sources.pendingRewardOperations.some((operation) => stringValue(operation, "operation_id") === operationId);
    return match.task && operationExists && (match.date === null || successDates.has(match.date));
  });
  if (pending.length > 0) {
    counts.mapped += pending.length;
    counts.pending += pending.length;
  }
  if (!sourceStatus(sources, "rewardClaims").available && successDates.size > 0) issues.push("REWARD_SOURCE_UNAVAILABLE");
  if (successDates.size > 0 && consumed === 0 && pending.length === 0) issues.push("REWARD_ENTITLEMENT_UNPROVEN");
  if (issues.some((issue) => issue === "AMBIGUOUS_REWARD_CLAIM" || issue === "AMBIGUOUS_REWARD_SUBTASK_MAPPING" || issue === "REWARD_SOURCE_UNAVAILABLE")) {
    return { state: "ambiguous", counts, issueCodes: [...new Set(issues)] };
  }
  if (counts.consumed > 0) return { state: "consumed_proven", counts, issueCodes: [] };
  if (counts.pending > 0) return { state: "pending_proven", counts, issueCodes: [] };
  return { state: "none", counts, issueCodes: [...new Set(issues)] };
}

function issueSeverity(issue: string): "blocked" | "attention" {
  if ([
    "HIERARCHY_CYCLE",
    "CROSS_USER_PARENT",
    "ORPHAN_PARENT_REFERENCE",
    "ORPHAN_HISTORY_REFERENCE",
    "INVALID_RECURRENCE_CONFIGURATION",
    "COMPLETE_TERMINAL_CONTRADICTION",
    "IN_PROGRESS_LIFECYCLE_CONTRADICTION",
    "IN_PROGRESS_FIELDS_CONTRADICTORY",
    "LOGICAL_DAY_UNAVAILABLE",
    "INVALID_LOGICAL_DAY_SETTINGS",
    "CONTRADICTORY_TRASH_PRIOR_CONTAINER",
    "OWNER_COMPLETE_PROJECTION_NOT_MATCHED",
    "OWNER_STALE_COMPLETE_PROJECTION_NOT_MATCHED",
    "DUPLICATE_LEGACY_SUBTASK_PROMOTION",
    "SOURCE_QUERY_FAILED",
  ].includes(issue)) return "blocked";
  if (issue.startsWith("SOURCE_UNAVAILABLE")) return "blocked";
  return "attention";
}

function classifyEligibility(
  model: ScheduleModel,
  anchor: EntityClassification["anchor"],
  lifecycle: EntityClassification["lifecycleState"],
  workflow: EntityClassification["workflowState"],
  issueCodes: readonly string[],
): MigrationEligibility {
  const inactiveSchedule = lifecycle.container === "trashed" || lifecycle.terminal === "permanently_complete";
  const trashedMalformedSchedule = lifecycle.container === "trashed"
    && model === "ambiguous"
    && issueCodes.includes("INVALID_RECURRENCE_CONFIGURATION");
  if (issueCodes.some((issue) => issueSeverity(issue) === "blocked" && !(trashedMalformedSchedule && issue === "INVALID_RECURRENCE_CONFIGURATION"))) return "blocked";
  if ((model === "ambiguous" && !trashedMalformedSchedule) || lifecycle.terminal === "ambiguous" || workflow === "contradictory") return "blocked";
  if (anchor.classification === "ambiguous" && !inactiveSchedule) return "blocked";
  if (anchor.classification === "prospective" || lifecycle.priorContainer === "unknown" || workflow === "stale" || issueCodes.length > 0) return "partial";
  return "safe";
}

function classifyMigrationDisposition(
  eligibility: MigrationEligibility,
  historyDisposition: EntityClassification["historyDisposition"],
): MigrationDisposition {
  if (eligibility === "blocked") return "genuinely_blocked";
  if (historyDisposition === "owner_approved_excluded") return "owner_approved_history_exclusion";
  if (eligibility !== "safe") return "historical_uncertainty_retained";
  return "safe_current_future_deterministic";
}

function isOwnerApprovedHistoryExclusion(disposition: MigrationEntityDisposition | null | undefined): disposition is MigrationEntityDisposition {
  return disposition?.preserveEntity === true
    && disposition.preserveCurrentConfiguration === true
    && disposition.excludeLegacyHistory === true
    && disposition.approval === "owner_approved";
}

function zeroCounts(): MigrationCounts {
  return {
    taskEntities: 0,
    hierarchy: { parent: 0, step: 0, substep: 0, orphan: 0, cycle: 0 },
    scheduleModels: { unscheduled: 0, one_time: 0, rolling: 0, fixed: 0, ambiguous: 0 },
    anchors: { proven: 0, reconstructable: 0, prospective: 0, ambiguous: 0 },
    history: { explicit: 0, automaticMissed: 0, ambiguous: 0, contradictory: 0 },
    occurrences: { proven: 0, reconstructable: 0, ambiguous: 0 },
    delay: { safe: 0, ambiguous: 0 },
    completeContradictions: 0,
    archiveTrash: { proven: 0, priorUnknown: 0, contradictory: 0 },
    inProgress: { valid: 0, stale: 0, contradictory: 0 },
    rewards: { mapped: 0, consumed: 0, pending: 0, ambiguous: 0 },
    legacySubtasks: { promoted: 0, unpromoted: 0, nested: 0, orphan: 0, duplicate: 0 },
    migrationDisposition: {
      safeCurrentFutureDeterministic: 0,
      historicalUncertaintyRetained: 0,
      ownerApprovedHistoryExclusion: 0,
      genuinelyBlocked: 0,
    },
    orphanReferences: 0,
    projectionMismatches: 0,
    needsAttention: 0,
  };
}

function addCounts(target: MigrationCounts, source: MigrationCounts) {
  target.taskEntities += source.taskEntities;
  for (const key of ["parent", "step", "substep", "orphan", "cycle"] as const) target.hierarchy[key] += source.hierarchy[key];
  for (const key of ["unscheduled", "one_time", "rolling", "fixed", "ambiguous"] as const) target.scheduleModels[key] += source.scheduleModels[key];
  for (const key of ["proven", "reconstructable", "prospective", "ambiguous"] as const) target.anchors[key] += source.anchors[key];
  for (const key of ["explicit", "automaticMissed", "ambiguous", "contradictory"] as const) target.history[key] += source.history[key];
  for (const key of ["proven", "reconstructable", "ambiguous"] as const) target.occurrences[key] += source.occurrences[key];
  for (const key of ["safe", "ambiguous"] as const) target.delay[key] += source.delay[key];
  target.completeContradictions += source.completeContradictions;
  for (const key of ["proven", "priorUnknown", "contradictory"] as const) target.archiveTrash[key] += source.archiveTrash[key];
  for (const key of ["valid", "stale", "contradictory"] as const) target.inProgress[key] += source.inProgress[key];
  for (const key of ["mapped", "consumed", "pending", "ambiguous"] as const) target.rewards[key] += source.rewards[key];
  for (const key of ["promoted", "unpromoted", "nested", "orphan", "duplicate"] as const) target.legacySubtasks[key] += source.legacySubtasks[key];
  for (const key of ["safeCurrentFutureDeterministic", "historicalUncertaintyRetained", "ownerApprovedHistoryExclusion", "genuinelyBlocked"] as const) {
    target.migrationDisposition[key] += source.migrationDisposition[key];
  }
  target.orphanReferences += source.orphanReferences;
  target.projectionMismatches += source.projectionMismatches;
  target.needsAttention += source.needsAttention;
}

function assertCountsEqual(left: MigrationCounts, right: MigrationCounts) {
  if (stableStringify(left) !== stableStringify(right)) throw new MigrationClassifierDiagnostic("INTERNAL_COUNT_RECONCILIATION", "report counts do not reconcile");
}

function unavailableSourceIssueCodes(sources: MigrationSourceEvidence): string[] {
  return SOURCE_NAMES
    .filter((name) => !sourceStatus(sources, name).available)
    .map((name) => `SOURCE_UNAVAILABLE_${name.toUpperCase()}`);
}

export function classifyUser(sourcesInput: MigrationSourceEvidence, options: ClassifierOptions): UserMigrationReport {
  const sources = { ...emptySourceEvidence(), ...sourcesInput, availability: { ...emptyAvailability(), ...(sourcesInput.availability ?? {}) } };
  const classifierVersion = options.classifierVersion ?? CLASSIFIER_VERSION;
  if (classifierVersion !== CLASSIFIER_VERSION) throw new MigrationClassifierDiagnostic("UNSUPPORTED_CLASSIFIER_VERSION", `expected ${CLASSIFIER_VERSION}, received ${classifierVersion}`);
  if ((options.schemaContractVersion ?? SCHEMA_CONTRACT_VERSION) !== SCHEMA_CONTRACT_VERSION) throw new MigrationClassifierDiagnostic("UNSUPPORTED_SCHEMA_CONTRACT_VERSION", `expected ${SCHEMA_CONTRACT_VERSION}`);
  if (!options.userId.trim()) throw new MigrationClassifierDiagnostic("INVALID_USER_ID", "userId is required");
  if (options.logicalDate !== undefined && !validDate(options.logicalDate)) throw new MigrationClassifierDiagnostic("INVALID_LOGICAL_DATE", "logical date must be YYYY-MM-DD");
  const logicalDate = options.logicalDate
    ?? (sourceStatus(sources, "profile").available && hasValidProfileContext(sources.profile)
      ? deriveCurrentLogicalDate(sources.profile, options.currentInstant)
      : null);
  const tasks = sources.tasks.filter((task) => stringValue(task, "user_id") === options.userId);
  const tasksById = new Map(tasks.map((task) => [stringValue(task, "id"), task] as const).filter(([id]) => id !== null) as Array<[string, LegacyRow]>);
  // The normal reader is owner-scoped. Test/diagnostic fixtures may still carry
  // a parent row from another owner; retaining it for this in-memory traversal
  // lets the classifier distinguish a cross-owner reference from a missing one.
  const hierarchy = analyzeHierarchy(sources.tasks, options.userId);
  const legacySubtasks = classifyLegacySubtasks(sources, options.userId, tasksById);
  const counts = zeroCounts();
  const entities: EntityClassification[] = [];
  for (const task of [...tasks].sort((left, right) => compareStrings(stringValue(left, "id") ?? "", stringValue(right, "id") ?? ""))) {
    const taskId = stringValue(task, "id");
    if (!taskId) continue;
    const hierarchyResult = hierarchy.get(taskId);
    if (!hierarchyResult) throw new MigrationClassifierDiagnostic("INTERNAL_HIERARCHY_MISSING", `no hierarchy result for task ${taskId}`);
    const schedule = classifyScheduleModel(task);
    const taskHistory = sources.history.filter((row) => stringValue(row, "task_id") === taskId);
    const entityDisposition = options.entityDispositions?.[taskId] ?? null;
    if (entityDisposition !== null && !isOwnerApprovedHistoryExclusion(entityDisposition)) {
      throw new MigrationClassifierDiagnostic("INVALID_ENTITY_DISPOSITION", `entity ${taskId} has an incomplete owner-approved History exclusion policy`);
    }
    const historyExcluded = isOwnerApprovedHistoryExclusion(entityDisposition);
    const historyForCanonicalReconstruction = historyExcluded ? [] : taskHistory;
    const historyClassifications = classifyHistory(taskId, taskHistory, sources, historyExcluded);
    const occurrenceClassifications = classifyOccurrences(taskId, task, schedule.model, historyForCanonicalReconstruction, historyClassifications, sources);
    const delay = classifyDelay(task, historyForCanonicalReconstruction, schedule.model, occurrenceClassifications, sources);
    const historicalScheduleDates = new Set(
      historyClassifications
        .filter((item) => !item.excludedFromCanonicalReconstruction && item.classification === "explicit" && item.entryDate !== null && ACTIVE_HISTORY_STATUSES.has(item.status ?? ""))
        .map((item) => item.entryDate as string)
        .filter((date) => historicalScheduleEvidenceForDate(taskId, date, historyForCanonicalReconstruction, sources.taskEvents, stringValue(task, "user_id") ?? undefined) !== null),
    );
    const anchor = classifyAnchor(task, schedule.model, schedule.evidence, historyClassifications.filter((item) => !item.excludedFromCanonicalReconstruction), occurrenceClassifications, delay.state, historicalScheduleDates, sourceStatus(sources, "profile").available && hasValidProfileContext(sources.profile));
    const lifecycle = classifyLifecycle(
      task,
      historyClassifications.filter((item) => !item.excludedFromCanonicalReconstruction),
      historyForCanonicalReconstruction,
      entityDisposition?.preserveCurrentCompleteProjection === true,
      entityDisposition?.resetStaleLegacyCompleteProjection === true,
    );
    if (lifecycle.state.container === "trashed" && (schedule.model === "ambiguous" || anchor.classification === "ambiguous")) {
      anchor.evidence.push("trashed_recurrence_anchor_requires_restore_repair");
    } else if (anchor.classification === "ambiguous" && lifecycle.state.terminal === "permanently_complete") {
      anchor.evidence.push("terminal_recurrence_anchor_not_required");
    }
    const workflowProjectionReset = isOwnerApprovedStaleWorkflowReset(task, schedule.model, logicalDate, lifecycle.state, entityDisposition);
    const workflow = classifyWorkflow(task, logicalDate, lifecycle.state, occurrenceClassifications, workflowProjectionReset);
    const rewards = classifyRewards(taskId, historyClassifications.filter((item) => !item.excludedFromCanonicalReconstruction), sources, historyExcluded);
    const issues = new Set<string>([
      ...hierarchyResult.issues,
      ...schedule.issueCodes,
      ...anchor.classification === "prospective" ? ["PROSPECTIVE_ONLY"] : [],
      ...anchor.classification === "ambiguous" ? ["RECURRENCE_ANCHOR_UNPROVEN"] : [],
      ...historyClassifications.flatMap((item) => item.blockingIssueCodes),
      ...occurrenceClassifications.flatMap((item) => item.blockingIssueCodes),
      ...delay.issueCodes,
      ...lifecycle.issueCodes,
      ...workflow.issueCodes,
      ...rewards.issueCodes,
      ...legacySubtasks.byTask.get(taskId) ?? [],
    ]);
    for (const issue of unavailableSourceIssueCodes(sources)) issues.add(issue);
    if (!sourceStatus(sources, "profile").available || !hasValidProfileContext(sources.profile)) issues.add("INVALID_LOGICAL_DAY_SETTINGS");
    if (logicalDate === null) issues.add("LOGICAL_DAY_UNAVAILABLE");
    if (dateValue(task, "active_occurrence_due_on") !== null && occurrenceClassifications.length === 0) {
      issues.add("PROJECTION_MISMATCH_ACTIVE_OCCURRENCE");
    }
    const hasProjectionMismatch = [...issues].some((issue) => issue.startsWith("PROJECTION_MISMATCH") || issue === "COMPLETE_PROJECTION_ONLY");
    const eligibility = classifyEligibility(schedule.model, anchor, lifecycle.state, workflow.state, [...issues]);
    const historyDisposition = historyExcluded ? "owner_approved_excluded" : "retained";
    const migrationDisposition = classifyMigrationDisposition(eligibility, historyDisposition);
    const entity: EntityClassification = {
      userId: options.userId,
      entityId: taskId,
      entityKind: hierarchyResult.kind,
      parentEntityId: stringValue(task, "parent_task_id"),
      scheduleModel: schedule.model,
      anchor,
      historyClassifications,
      historyDisposition,
      occurrenceClassifications,
      delayState: delay.state,
      delayEvidence: delay.evidence,
      workflowProjectionDisposition: workflowProjectionReset ? "owner_approved_reset" : "retained",
      lifecycleProjectionDisposition: lifecycle.projectionDisposition,
      lifecycleState: lifecycle.state,
      workflowState: workflow.state,
      rewardBootstrapState: rewards.state,
      migrationEligibility: eligibility,
      migrationDisposition,
      entityDisposition,
      blockingIssueCodes: [...issues].sort(compareStrings),
      sourceFingerprints: sourceFingerprintForEntity(sources, taskId),
    };
    entities.push(entity);
    counts.taskEntities += 1;
    counts.hierarchy[hierarchyResult.kind] += 1;
    if (hierarchyResult.orphan) counts.hierarchy.orphan += 1;
    if (hierarchyResult.cycle) counts.hierarchy.cycle += 1;
    counts.scheduleModels[schedule.model] += 1;
    counts.anchors[anchor.classification] += 1;
    for (const classification of historyClassifications) {
      if (classification.excludedFromCanonicalReconstruction) continue;
      counts.history[classification.classification === "automatic_missed" ? "automaticMissed" : classification.classification] += 1;
    }
    for (const classification of occurrenceClassifications) counts.occurrences[classification.classification] += 1;
    counts.delay[delay.state === "safe" ? "safe" : delay.state === "ambiguous" ? "ambiguous" : "safe"] += delay.state === "none" ? 0 : 1;
    if (lifecycle.issueCodes.includes("COMPLETE_TERMINAL_CONTRADICTION")) counts.completeContradictions += 1;
    if (lifecycle.state.priorContainer === "proven") counts.archiveTrash.proven += 1;
    else if (lifecycle.state.priorContainer === "unknown") counts.archiveTrash.priorUnknown += 1;
    else if (lifecycle.issueCodes.some((issue) => issue.includes("TRASH"))) counts.archiveTrash.contradictory += 1;
    if (workflow.state === "valid_in_progress") counts.inProgress.valid += 1;
    if (workflow.state === "stale") counts.inProgress.stale += 1;
    if (workflow.state === "contradictory") counts.inProgress.contradictory += 1;
    addCounts(counts, { ...zeroCounts(), rewards: rewards.counts });
    const dispositionCountKey = migrationDisposition === "safe_current_future_deterministic"
      ? "safeCurrentFutureDeterministic"
      : migrationDisposition === "historical_uncertainty_retained"
        ? "historicalUncertaintyRetained"
        : migrationDisposition === "owner_approved_history_exclusion"
          ? "ownerApprovedHistoryExclusion"
          : "genuinelyBlocked";
    counts.migrationDisposition[dispositionCountKey] += 1;
    if (hasProjectionMismatch) counts.projectionMismatches += 1;
    if (eligibility !== "safe") counts.needsAttention += 1;
  }
  counts.legacySubtasks = legacySubtasks.counts;
  counts.orphanReferences += entities.reduce((total, entity) => total + entity.blockingIssueCodes.filter((issue) => issue.includes("ORPHAN") || issue.includes("CROSS_USER")).length, 0);
  counts.orphanReferences += sources.history.filter((row) => {
    const taskId = stringValue(row, "task_id");
    return taskId !== null && !tasksById.has(taskId);
  }).length;
  counts.orphanReferences += sources.rewardClaims.filter((row) => {
    const taskId = stringValue(row, "task_id");
    return taskId !== null && !tasksById.has(taskId);
  }).length;
  const safeCount = entities.filter((entity) => entity.migrationEligibility === "safe").length;
  const blockedEntityCount = entities.filter((entity) => entity.migrationEligibility === "blocked").length;
  if (!sourceStatus(sources, "tasks").available) counts.needsAttention += 1;
  const commandCutoverEligible = entities.length > 0
    && safeCount === entities.length
    && counts.needsAttention === 0
    && logicalDate !== null
    && unavailableSourceIssueCodes(sources).length === 0;
  const sourceFingerprints = {
    tasks: fingerprintEvidence(sources.tasks),
    history: fingerprintEvidence(sources.history),
    rewards: fingerprintEvidence({
      taskEvents: sources.taskEvents,
      pointLedger: sources.pointLedger,
      rewardRolls: sources.rewardRolls,
      rewardClaims: sources.rewardClaims,
      pendingRewardAccount: sources.pendingRewardAccount,
      pendingRewardOperations: sources.pendingRewardOperations,
      pendingRewardItems: sources.pendingRewardItems,
      rolloverEvidence: sources.rolloverEvidence,
    }),
  };
  return {
    reportVersion: REPORT_VERSION,
    migrationVersion: MIGRATION_VERSION,
    classifierVersion,
    schemaContractVersion: SCHEMA_CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
    userId: options.userId,
    logicalDate,
    sourceFingerprints,
    sourceAvailability: sources.availability as SourceAvailability,
    counts,
    eligibility: {
      safePercent: entities.length === 0 ? 0 : Math.round((safeCount / entities.length) * 100),
      blockedEntityCount,
      commandCutoverEligible,
    },
    entities,
  };
}

export function buildMigrationRunReport(
  users: readonly { sources: MigrationSourceEvidence; userId: string; logicalDate?: string; currentInstant?: string | Date; entityDispositions?: EntityMigrationDispositions }[],
  options: { generatedAt?: string; currentInstant?: string | Date; classifierVersion?: string; schemaContractVersion?: string } = {},
): MigrationRunReport {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const userReports = [...users]
    .sort((left, right) => compareStrings(left.userId, right.userId))
    .map(({ sources, userId, logicalDate, currentInstant, entityDispositions }) => classifyUser(sources, {
      userId,
      logicalDate,
      currentInstant: currentInstant ?? options.currentInstant,
      classifierVersion: options.classifierVersion,
      schemaContractVersion: options.schemaContractVersion,
      entityDispositions,
    }))
    .map((report) => ({ ...report, generatedAt }));
  const globalCounts = zeroCounts();
  for (const report of userReports) addCounts(globalCounts, report.counts);
  const entityCount = userReports.reduce((total, report) => total + report.counts.taskEntities, 0);
  const safeEntityCount = userReports.reduce((total, report) => total + report.entities.filter((entity) => entity.migrationEligibility === "safe").length, 0);
  const blockedEntityCount = userReports.reduce((total, report) => total + report.eligibility.blockedEntityCount, 0);
  const global: GlobalMigrationReport = {
    reportVersion: REPORT_VERSION,
    migrationVersion: MIGRATION_VERSION,
    classifierVersion: options.classifierVersion ?? CLASSIFIER_VERSION,
    schemaContractVersion: SCHEMA_CONTRACT_VERSION,
    generatedAt,
    sourceFingerprints: {
      tasks: fingerprintEvidence(userReports.map((report) => report.sourceFingerprints.tasks)),
      history: fingerprintEvidence(userReports.map((report) => report.sourceFingerprints.history)),
      rewards: fingerprintEvidence(userReports.map((report) => report.sourceFingerprints.rewards)),
    },
    sourceAvailability: Object.fromEntries(SOURCE_NAMES.map((name) => [
      name,
      userReports.every((report) => report.sourceAvailability[name].available)
        ? { available: true }
        : userReports.find((report) => !report.sourceAvailability[name].available)?.sourceAvailability[name] ?? { available: false, code: "SOURCE_UNAVAILABLE" },
    ])) as SourceAvailability,
    counts: globalCounts,
    eligibility: {
      safePercent: entityCount === 0 ? 0 : Math.round((safeEntityCount / entityCount) * 100),
      blockedEntityCount,
      commandCutoverEligible: userReports.length > 0 && userReports.every((report) => report.eligibility.commandCutoverEligible),
    },
    userCount: userReports.length,
    classifiedUserCount: userReports.filter((report) => report.counts.taskEntities > 0).length,
    commandCutoverEligibleUserCount: userReports.filter((report) => report.eligibility.commandCutoverEligible).length,
    blockedUserCount: userReports.filter((report) => report.eligibility.blockedEntityCount > 0).length,
    users: userReports.map((report) => ({ userId: report.userId, counts: report.counts, eligibility: report.eligibility })),
  };
  const entityRecords = userReports.flatMap((report) => report.entities);
  const perUserTotals = zeroCounts();
  for (const report of userReports) addCounts(perUserTotals, report.counts);
  assertCountsEqual(globalCounts, perUserTotals);
  return {
    reportVersion: REPORT_VERSION,
    migrationVersion: MIGRATION_VERSION,
    classifierVersion: options.classifierVersion ?? CLASSIFIER_VERSION,
    schemaContractVersion: SCHEMA_CONTRACT_VERSION,
    generatedAt,
    userReports,
    entityRecords,
    global,
  };
}

export function serializeMigrationReport(report: MigrationRunReport, format: "json" | "jsonl" = "json"): string {
  if (format === "json") return `${JSON.stringify(report, null, 2)}\n`;
  const lines = [
    ...report.userReports.map((item) => JSON.stringify({ scope: "user", ...item })),
    ...report.entityRecords.map((item) => JSON.stringify({ scope: "entity", ...item })),
    JSON.stringify({ scope: "global", ...report.global }),
  ];
  return `${lines.join("\n")}\n`;
}

type ReadTableName =
  | "adhdice_clean_tasks"
  | "adhdice_task_history"
  | "adhdice_task_subtasks"
  | "adhdice_legacy_subtask_promotions"
  | "adhdice_user_profiles"
  | "adhdice_task_events"
  | "adhdice_point_ledger"
  | "adhdice_task_reward_rolls"
  | "adhdice_task_reward_claims"
  | "adhdice_pending_reward_dice"
  | "adhdice_pending_reward_dice_operations"
  | "adhdice_pending_reward_dice_items"
  | "adhdice_task_rollover_ledger";

const TABLE_SPECS: Record<SourceName, { table: ReadTableName; order: string; single?: boolean }> = {
  tasks: { table: "adhdice_clean_tasks", order: "id" },
  history: { table: "adhdice_task_history", order: "id" },
  subtasks: { table: "adhdice_task_subtasks", order: "id" },
  promotions: { table: "adhdice_legacy_subtask_promotions", order: "legacy_subtask_id" },
  profile: { table: "adhdice_user_profiles", order: "user_id", single: true },
  taskEvents: { table: "adhdice_task_events", order: "id" },
  pointLedger: { table: "adhdice_point_ledger", order: "id" },
  rewardRolls: { table: "adhdice_task_reward_rolls", order: "id" },
  rewardClaims: { table: "adhdice_task_reward_claims", order: "id" },
  pendingRewardAccount: { table: "adhdice_pending_reward_dice", order: "user_id", single: true },
  pendingRewardOperations: { table: "adhdice_pending_reward_dice_operations", order: "id" },
  pendingRewardItems: { table: "adhdice_pending_reward_dice_items", order: "id" },
  rolloverEvidence: { table: "adhdice_task_rollover_ledger", order: "logical_date" },
};

type ReadOnlyQueryClient = {
  from(table: ReadTableName): {
    select(columns: string): {
      eq(column: string, value: string): {
        order(column: string, options?: { ascending?: boolean }): {
          range(from: number, to: number): Promise<{ data: LegacyRow[] | null; error: { code?: string; message: string } | null }>;
        };
      };
    };
  };
};

type AuthenticatedReadClient = ReadOnlyQueryClient & {
  auth: {
    getUser(accessToken: string): Promise<{
      data: { user: { id: string } | null } | null;
      error: { code?: string; message: string } | null;
    }>;
  };
};

async function readBoundedTable(client: ReadOnlyQueryClient, sourceName: SourceName, userId: string, batchSize: number): Promise<LegacyRow[]> {
  const specification = TABLE_SPECS[sourceName];
  const rows: LegacyRow[] = [];
  for (let offset = 0; ; offset += batchSize) {
    const result = await client
      .from(specification.table)
      .select("*")
      .eq("user_id", userId)
      .order(specification.order, { ascending: true })
      .range(offset, offset + batchSize - 1);
    if (result.error) throw new MigrationClassifierDiagnostic(result.error.code ?? "SOURCE_QUERY_FAILED", `${sourceName}: ${result.error.message}`);
    const page = result.data ?? [];
    rows.push(...page);
    if (specification.single || page.length < batchSize) break;
  }
  return rows;
}

export async function loadOwnerScopedEvidence(client: ReadOnlyQueryClient, userId: string, batchSize: number): Promise<MigrationSourceEvidence> {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) throw new MigrationClassifierDiagnostic("INVALID_BATCH_SIZE", `batch size must be between 1 and ${MAX_BATCH_SIZE}`);
  const result = emptySourceEvidence();
  const availability = result.availability as SourceAvailability;
  for (const sourceName of SOURCE_NAMES) {
    try {
      const rows = await readBoundedTable(client, sourceName, userId, batchSize);
      if (sourceName === "profile") result.profile = rows[0] ?? null;
      else (result[sourceName] as LegacyRow[]) = rows;
    } catch (error) {
      const diagnostic = error instanceof MigrationClassifierDiagnostic ? error : new MigrationClassifierDiagnostic("SOURCE_QUERY_FAILED", String(error));
      availability[sourceName] = { available: false, code: diagnostic.code };
      if (sourceName === "profile") result.profile = null;
      else (result[sourceName] as LegacyRow[]) = [];
    }
  }
  return result;
}

export async function verifyAuthenticatedOwner(client: AuthenticatedReadClient, userId: string, accessToken: string): Promise<void> {
  if (!accessToken.trim()) throw new MigrationClassifierDiagnostic("AUTHENTICATION_REQUIRED", "an authenticated user access token is required");
  let result: Awaited<ReturnType<AuthenticatedReadClient["auth"]["getUser"]>>;
  try {
    result = await client.auth.getUser(accessToken);
  } catch (error) {
    throw new MigrationClassifierDiagnostic("AUTHENTICATION_FAILED", `authenticated identity could not be verified: ${String(error)}`);
  }
  if (result.error) throw new MigrationClassifierDiagnostic(result.error.code ?? "AUTHENTICATION_FAILED", result.error.message);
  const authenticatedUserId = result.data?.user?.id ?? null;
  if (authenticatedUserId === null) throw new MigrationClassifierDiagnostic("AUTHENTICATION_REQUIRED", "the classifier requires a non-anonymous authenticated user identity");
  if (authenticatedUserId !== userId) throw new MigrationClassifierDiagnostic("OWNER_IDENTITY_MISMATCH", "authenticated user identity does not match --user-id");
}

export async function loadAuthenticatedOwnerScopedEvidence(
  client: AuthenticatedReadClient,
  userId: string,
  accessToken: string,
  batchSize: number,
): Promise<MigrationSourceEvidence> {
  await verifyAuthenticatedOwner(client, userId, accessToken);
  return loadOwnerScopedEvidence(client, userId, batchSize);
}

type CliOptions = {
  userId: string;
  batchSize: number;
  accessToken: string | null;
  classifierVersion: string;
  schemaContractVersion: string;
  outputPath: string | null;
  format: "json" | "jsonl";
  logicalDate: string | null;
  historyExclusionEntityIds: string[];
  completeProjectionEntityIds: string[];
  staleWorkflowResetEntityIds: string[];
  staleCompleteProjectionResetEntityIds: string[];
};

function parseCliArgs(argv: readonly string[]): CliOptions {
  const values = new Map<string, string>();
  const historyExclusionEntityIds: string[] = [];
  const completeProjectionEntityIds: string[] = [];
  const staleWorkflowResetEntityIds: string[] = [];
  const staleCompleteProjectionResetEntityIds: string[] = [];
  const forbidden = new Set(["--write", "--allow-writes", "--repair", "--backfill", "--execute"]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (forbidden.has(argument)) throw new MigrationClassifierDiagnostic("WRITE_MODE_REJECTED", "the migration classifier is read-only");
    if (!argument.startsWith("--")) throw new MigrationClassifierDiagnostic("INVALID_ARGUMENT", `unexpected argument ${argument}`);
    const [key, inlineValue] = argument.split("=", 2);
    if (inlineValue !== undefined) {
      if (key === "--exclude-history-entity-id") historyExclusionEntityIds.push(inlineValue);
      else if (key === "--preserve-complete-projection-entity-id") completeProjectionEntityIds.push(inlineValue);
      else if (key === "--reset-stale-workflow-entity-id") staleWorkflowResetEntityIds.push(inlineValue);
      else if (key === "--reset-stale-complete-projection-entity-id") staleCompleteProjectionResetEntityIds.push(inlineValue);
      else values.set(key, inlineValue);
    }
    else if (["--user-id", "--batch-size", "--access-token", "--classifier-version", "--schema-contract-version", "--output", "--output-path", "--format", "--logical-date", "--mode", "--exclude-history-entity-id", "--preserve-complete-projection-entity-id", "--reset-stale-workflow-entity-id", "--reset-stale-complete-projection-entity-id"].includes(key)) {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) throw new MigrationClassifierDiagnostic("MISSING_ARGUMENT_VALUE", `${key} requires a value`);
      if (key === "--mode" && next === "write") throw new MigrationClassifierDiagnostic("WRITE_MODE_REJECTED", "the migration classifier is read-only");
      if (key === "--exclude-history-entity-id") historyExclusionEntityIds.push(next);
      else if (key === "--preserve-complete-projection-entity-id") completeProjectionEntityIds.push(next);
      else if (key === "--reset-stale-workflow-entity-id") staleWorkflowResetEntityIds.push(next);
      else if (key === "--reset-stale-complete-projection-entity-id") staleCompleteProjectionResetEntityIds.push(next);
      else values.set(key, next);
      index += 1;
    } else throw new MigrationClassifierDiagnostic("INVALID_ARGUMENT", `unknown argument ${key}`);
  }
  const userId = values.get("--user-id");
  if (!userId || !userId.trim()) throw new MigrationClassifierDiagnostic("INVALID_USER_ID", "--user-id is required for owner-scoped reads");
  const batchSize = Number(values.get("--batch-size") ?? DEFAULT_BATCH_SIZE);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) throw new MigrationClassifierDiagnostic("INVALID_BATCH_SIZE", `batch size must be between 1 and ${MAX_BATCH_SIZE}`);
  const classifierVersion = values.get("--classifier-version") ?? CLASSIFIER_VERSION;
  const schemaContractVersion = values.get("--schema-contract-version") ?? SCHEMA_CONTRACT_VERSION;
  const mode = values.get("--mode");
  if (mode !== undefined && mode !== "read" && mode !== "read-only") throw new MigrationClassifierDiagnostic("WRITE_MODE_REJECTED", "the migration classifier is read-only");
  if (classifierVersion !== CLASSIFIER_VERSION) throw new MigrationClassifierDiagnostic("UNSUPPORTED_CLASSIFIER_VERSION", `expected ${CLASSIFIER_VERSION}`);
  if (schemaContractVersion !== SCHEMA_CONTRACT_VERSION) throw new MigrationClassifierDiagnostic("UNSUPPORTED_SCHEMA_CONTRACT_VERSION", `expected ${SCHEMA_CONTRACT_VERSION}`);
  const format = values.get("--format") ?? "json";
  if (format !== "json" && format !== "jsonl") throw new MigrationClassifierDiagnostic("INVALID_FORMAT", "format must be json or jsonl");
  const logicalDate = values.get("--logical-date") ?? null;
  if (logicalDate !== null && !validDate(logicalDate)) throw new MigrationClassifierDiagnostic("INVALID_LOGICAL_DATE", "logical date must be YYYY-MM-DD");
  return {
    userId,
    batchSize,
    accessToken: values.get("--access-token") ?? null,
    classifierVersion,
    schemaContractVersion,
    outputPath: values.get("--output") ?? values.get("--output-path") ?? null,
    format,
    logicalDate,
    historyExclusionEntityIds: [...new Set(historyExclusionEntityIds.map((id) => id.trim()).filter(Boolean))],
    completeProjectionEntityIds: [...new Set(completeProjectionEntityIds.map((id) => id.trim()).filter(Boolean))],
    staleWorkflowResetEntityIds: [...new Set(staleWorkflowResetEntityIds.map((id) => id.trim()).filter(Boolean))],
    staleCompleteProjectionResetEntityIds: [...new Set(staleCompleteProjectionResetEntityIds.map((id) => id.trim()).filter(Boolean))],
  };
}

function buildCliEntityDispositions(options: CliOptions): EntityMigrationDispositions {
  const entityDispositions: Record<string, MigrationEntityDisposition> = {};
  const add = (entityIds: readonly string[], repair: Partial<MigrationEntityDisposition>) => {
    for (const entityId of entityIds) {
      entityDispositions[entityId] = {
        ...(entityDispositions[entityId] ?? OWNER_APPROVED_HISTORY_EXCLUSION),
        ...repair,
      };
    }
  };
  add(options.historyExclusionEntityIds, {});
  add(options.completeProjectionEntityIds, { preserveCurrentCompleteProjection: true });
  add(options.staleWorkflowResetEntityIds, { resetStaleLegacyWorkflowProjection: true });
  add(options.staleCompleteProjectionResetEntityIds, { resetStaleLegacyCompleteProjection: true });
  return entityDispositions;
}

async function main(argv: readonly string[]) {
  const options = parseCliArgs(argv);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new MigrationClassifierDiagnostic("SUPABASE_CONFIG_MISSING", "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required");
  const accessToken = options.accessToken ?? process.env.ADHDICE_SUPABASE_ACCESS_TOKEN ?? process.env.SUPABASE_USER_ACCESS_TOKEN;
  if (!accessToken?.trim()) throw new MigrationClassifierDiagnostic("AUTHENTICATION_REQUIRED", "--access-token, ADHDICE_SUPABASE_ACCESS_TOKEN, or SUPABASE_USER_ACCESS_TOKEN is required for authenticated owner-scoped reads");
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  }) as unknown as AuthenticatedReadClient;
  const sources = await loadAuthenticatedOwnerScopedEvidence(client, options.userId, accessToken, options.batchSize);
  const entityDispositions = buildCliEntityDispositions(options);
  const report = buildMigrationRunReport([{ userId: options.userId, sources, logicalDate: options.logicalDate ?? undefined, currentInstant: new Date(), entityDispositions }], {
    classifierVersion: options.classifierVersion,
    schemaContractVersion: options.schemaContractVersion,
  });
  const serialized = serializeMigrationReport(report, options.format);
  if (options.outputPath) await writeFile(resolve(options.outputPath), serialized, "utf8");
  else process.stdout.write(serialized);
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const diagnostic = error instanceof MigrationClassifierDiagnostic ? error : new MigrationClassifierDiagnostic("CLASSIFIER_FAILED", String(error));
    process.stderr.write(`${diagnostic.message}\n`);
    process.exitCode = 1;
  });
}
