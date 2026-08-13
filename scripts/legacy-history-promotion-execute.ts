import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import {
  buildLegacyHistoryPromotionDryRun,
  comparePromotionBaseline,
  formatPromotionSummary,
  loadAuthenticatedPromotionSources,
  type PromotionFactPlan,
  type PromotionReport,
  type PromotionRow,
  type PromotionSources,
  stableStringify,
  HistoryPromotionDiagnostic,
  PROMOTION_MIGRATION_VERSION,
  PROMOTION_PROVENANCE,
  PROMOTION_SCHEMA_CONTRACT_VERSION,
  PROMOTION_SOURCE,
  DEFAULT_BATCH_SIZE,
  MAX_BATCH_SIZE,
} from "./legacy-history-promotion-dry-run.ts";

export const APPROVED_EXECUTION_MUTATION_TABLES = [
  "adhdice_task_migration_operations",
  "adhdice_task_history_facts",
] as const;

type QueryResult<T> = { data: T | null; error: { code?: string; message: string } | null };
type ExecutionQuery = {
  select(columns: string): ExecutionQuery;
  eq(column: string, value: string): ExecutionQuery;
  maybeSingle(): Promise<QueryResult<PromotionRow>>;
  insert(values: PromotionRow): ExecutionQuery;
  update(values: PromotionRow): ExecutionQuery;
};

export type PromotionExecutionClient = {
  from(table: string): ExecutionQuery;
};

export type PromotionExecutionConfirmation = {
  execute: boolean;
  userId: string;
  expectedCandidateCount: number;
  confirmSourceFingerprint: string;
  confirmMigrationVersion: typeof PROMOTION_MIGRATION_VERSION;
};

export type PromotionExecutionMutationCounts = {
  operationWrites: number;
  factWrites: number;
  rewardWrites: 0;
  taskStateWrites: 0;
};

export type PromotionExecutionResult = {
  mode: "execution";
  operationId: string;
  operationIdentity: string;
  sourceFingerprint: string;
  plannedInserts: number;
  insertedFacts: number;
  canonicalRaceSkips: number;
  alreadyPresentSkips: number;
  mutationCounts: PromotionExecutionMutationCounts;
  postflight: PromotionVerificationResult;
};

export type PromotionVerificationResult = {
  ok: boolean;
  issues: string[];
  expectedFacts: number;
  verifiedFacts: number;
  duplicateCanonicalKeys: string[];
  remainingStraightforward: number;
  rewardWrites: 0;
  taskStateWrites: 0;
};

type PromotionOperation = PromotionRow & {
  id: string;
  state: "started" | "committed" | "failed_retryable" | "failed_permanent";
};

function asString(row: PromotionRow | null | undefined, key: string): string | null {
  const value = row?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function asNullableString(row: PromotionRow | null | undefined, key: string): string | null {
  const value = row?.[key];
  return value === null || value === undefined ? null : typeof value === "string" ? value : null;
}

function sameJson(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}

function sourceId(row: PromotionRow): string | null {
  return asString(row, "id") ?? asString(row, "source_history_id");
}

function canonicalKey(row: PromotionRow): string | null {
  const userId = asString(row, "user_id");
  const entityId = asString(row, "entity_id") ?? asString(row, "task_id");
  const logicalDate = asString(row, "logical_date") ?? asString(row, "entry_date");
  return userId && entityId && logicalDate ? `${userId}:${entityId}:${logicalDate}` : null;
}

export function buildPromotionFactInsert(plan: PromotionFactPlan, operationId: string): PromotionRow {
  if (plan.logical_day_settings_revision === null || !plan.timezone || !plan.day_start_time) {
    throw new HistoryPromotionDiagnostic("PROFILE_METADATA_REQUIRED", "valid logical-day profile values are required before execution");
  }
  return {
    user_id: plan.user_id,
    entity_id: plan.entity_id,
    entity_kind: plan.entity_kind,
    logical_date: plan.logical_date,
    outcome: plan.outcome,
    event_kind: plan.event_kind,
    occurrence_id: null,
    scheduled_due_on: plan.scheduled_due_on,
    effective_due_on: plan.effective_due_on,
    schedule_boundary_id: null,
    recurrence_source_fingerprint: null,
    provenance_kind: PROMOTION_PROVENANCE,
    actor_kind: "migration",
    actor_id: null,
    source: PROMOTION_SOURCE,
    logical_day_settings_revision: plan.logical_day_settings_revision,
    timezone: plan.timezone,
    day_start_time: plan.day_start_time,
    command_id: null,
    idempotence_identity: plan.idempotence_identity,
    migration_operation_id: operationId,
    source_legacy_history_id: plan.source_legacy_history_id,
    revision: 1,
  };
}

export function buildPromotionOperationIdentity(userId: string, fingerprint: string): string {
  return `${PROMOTION_MIGRATION_VERSION}:${userId}:${fingerprint}`;
}

function operationInsert(userId: string, fingerprint: string, identity: string): PromotionRow {
  return {
    user_id: userId,
    entity_id: null,
    operation_kind: "backfill",
    operation_identity: identity,
    input_fingerprint: fingerprint,
    state: "started",
    result_fingerprint: null,
    result_references: {},
    migration_version: PROMOTION_MIGRATION_VERSION,
    classifier_version: PROMOTION_MIGRATION_VERSION,
    schema_contract_version: PROMOTION_SCHEMA_CONTRACT_VERSION,
    error_code: null,
    error_message: null,
  };
}

function operationPatch(state: PromotionOperation["state"], resultReferences: PromotionRow, error?: { code: string; message: string }): PromotionRow {
  return {
    state,
    result_fingerprint: typeof resultReferences.result_fingerprint === "string" ? resultReferences.result_fingerprint : null,
    result_references: resultReferences,
    error_code: error?.code ?? null,
    error_message: error?.message ?? null,
    completed_at: state === "committed" ? new Date().toISOString() : null,
  };
}

async function findOperation(client: PromotionExecutionClient, userId: string, identity: string): Promise<PromotionOperation | null> {
  const result = await client.from("adhdice_task_migration_operations").select("*").eq("user_id", userId).eq("operation_identity", identity).maybeSingle();
  if (result.error) throw new HistoryPromotionDiagnostic(result.error.code ?? "OPERATION_READ_FAILED", result.error.message);
  return result.data as PromotionOperation | null;
}

async function createOrResumeOperation(client: PromotionExecutionClient, userId: string, fingerprint: string): Promise<PromotionOperation> {
  const identity = buildPromotionOperationIdentity(userId, fingerprint);
  const existing = await findOperation(client, userId, identity);
  if (existing) {
    if (existing.state === "failed_permanent") throw new HistoryPromotionDiagnostic("OPERATION_FAILED_PERMANENT", "the deterministic migration operation is permanently failed");
    const id = asString(existing, "id");
    if (!id) throw new HistoryPromotionDiagnostic("OPERATION_ID_MISSING", "existing migration operation has no id");
    return { ...existing, id, state: existing.state };
  }
  const result = await client.from("adhdice_task_migration_operations").insert(operationInsert(userId, fingerprint, identity)).select("*").maybeSingle();
  if (result.error) {
    const raced = await findOperation(client, userId, identity);
    if (raced) return raced;
    throw new HistoryPromotionDiagnostic(result.error.code ?? "OPERATION_CREATE_FAILED", result.error.message);
  }
  const created = result.data as PromotionOperation | null;
  const id = asString(created, "id");
  if (!created || !id) throw new HistoryPromotionDiagnostic("OPERATION_CREATE_MALFORMED", "migration operation create returned no id");
  return { ...created, id, state: "started" };
}

async function updateOperation(client: PromotionExecutionClient, operation: PromotionOperation, patch: PromotionRow): Promise<void> {
  const result = await client.from("adhdice_task_migration_operations").update(patch).eq("user_id", operation.user_id as string).eq("id", operation.id).select("*").maybeSingle();
  if (result.error) throw new HistoryPromotionDiagnostic(result.error.code ?? "OPERATION_UPDATE_FAILED", result.error.message);
}

async function readCanonicalAtKey(client: PromotionExecutionClient, plan: PromotionFactPlan): Promise<PromotionRow | null> {
  const result = await client.from("adhdice_task_history_facts").select("*").eq("user_id", plan.user_id).eq("entity_id", plan.entity_id).eq("logical_date", plan.logical_date).maybeSingle();
  if (result.error) throw new HistoryPromotionDiagnostic(result.error.code ?? "CANONICAL_READ_FAILED", result.error.message);
  return result.data;
}

function executionGuardFailures(report: PromotionReport, confirmation: PromotionExecutionConfirmation): string[] {
  const failures: string[] = [];
  if (!confirmation.execute) failures.push("explicit --execute confirmation is required");
  if (confirmation.expectedCandidateCount !== report.candidateCounts.straightforward) failures.push(`candidate count mismatch: expected ${confirmation.expectedCandidateCount}, current ${report.candidateCounts.straightforward}`);
  if (confirmation.confirmSourceFingerprint !== report.sourceFingerprint) failures.push("source fingerprint mismatch");
  if (confirmation.confirmMigrationVersion !== PROMOTION_MIGRATION_VERSION) failures.push("migration version confirmation mismatch");
  if (report.candidateCounts.snapshotDiverged > 0) failures.push("snapshot-diverged source rows are present");
  if (report.candidateCounts.evidenceOnly > 0) failures.push("evidence-only source rows are present");
  if (report.candidateCounts.duplicateTaskDates > 0) failures.push("duplicate legacy task/date rows are present");
  if (report.candidateCounts.conflictingLegacyStatuses > 0) failures.push("conflicting legacy statuses are present");
  if (report.candidateCounts.orphansMalformed > 0) failures.push("orphan or malformed legacy rows are present");
  if (report.plannedFacts.some((plan) => plan.logical_day_settings_revision === null || !plan.timezone || !plan.day_start_time)) failures.push("logical-day profile metadata is incomplete");
  return failures;
}

function addIssue(issues: string[], message: string): void {
  if (!issues.includes(message)) issues.push(message);
}

export function verifyLegacyHistoryPromotion(input: {
  beforeSources: PromotionSources;
  afterSources: PromotionSources;
  beforeReport: PromotionReport;
  operationId: string;
  mutationCounts: PromotionExecutionMutationCounts;
}): PromotionVerificationResult {
  const { beforeSources, afterSources, beforeReport, operationId, mutationCounts } = input;
  const issues: string[] = [];
  const facts = afterSources.canonicalFacts;
  const factsByKey = new Map(facts.map((fact) => [canonicalKey(fact), fact] as const));
  const duplicateKeys = [...facts.reduce((counts, fact) => {
    const key = canonicalKey(fact);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map<string, number>()).entries()].filter(([, count]) => count > 1).map(([key]) => key);
  if (duplicateKeys.length > 0) addIssue(issues, "duplicate canonical task/date facts detected");

  let verifiedFacts = 0;
  for (const plan of beforeReport.plannedFacts) {
    const fact = factsByKey.get(`${plan.user_id}:${plan.entity_id}:${plan.logical_date}`);
    if (!fact) {
      addIssue(issues, `missing promoted fact for source ${plan.source_legacy_history_id}`);
      continue;
    }
    // A canonical fact may have appeared after preflight. It is authoritative
    // even when it is not the migration fact we planned, so accept the race
    // as a canonical win and never validate or overwrite it as ours.
    if (asNullableString(fact, "source_legacy_history_id") !== plan.source_legacy_history_id) {
      if (asString(fact, "provenance_kind") === PROMOTION_PROVENANCE && asString(fact, "source") === PROMOTION_SOURCE) {
        addIssue(issues, `malformed promoted fact ${plan.source_legacy_history_id}: source_legacy_history_id`);
      }
      continue;
    }
    const expected = buildPromotionFactInsert(plan, operationId);
    for (const key of ["outcome", "event_kind", "occurrence_id", "scheduled_due_on", "provenance_kind", "actor_kind", "actor_id", "command_id", "source", "migration_operation_id", "source_legacy_history_id", "revision", "logical_day_settings_revision", "timezone", "day_start_time", "idempotence_identity"] as const) {
      if (!sameJson(fact[key], expected[key])) addIssue(issues, `malformed promoted fact ${plan.source_legacy_history_id}: ${key}`);
    }
    verifiedFacts += 1;
  }

  const beforeCanonicalByKey = new Map(beforeSources.canonicalFacts.map((fact) => [canonicalKey(fact), fact] as const));
  for (const overlap of beforeReport.canonicalOverlapSummary.overlaps) {
    const key = `${beforeReport.userId}:${String(overlap.entity_id)}:${String(overlap.logical_date)}`;
    const before = beforeCanonicalByKey.get(key);
    const after = factsByKey.get(key);
    if (!before || !after || !sameJson(before, after)) addIssue(issues, `canonical-wins fact changed at ${key}`);
  }

  const excludedIds = new Set(beforeSources.legacyHistory.filter((row) => beforeReport.ownerExcludedSummary.entities.some((entity) => entity.entity_id === (row.task_id ?? row.entity_id))).map(sourceId).filter((id): id is string => Boolean(id)));
  const delayedIds = new Set(beforeReport.delayedSummary.rows.filter((row) => row.exact_effective_due_on_proven === false).map((row) => String(row.source_legacy_history_id)));
  for (const fact of facts) {
    const id = asNullableString(fact, "source_legacy_history_id");
    if (id && (excludedIds.has(id) || delayedIds.has(id))) addIssue(issues, `excluded or Delayed source was promoted: ${id}`);
  }

  if (!sameJson(beforeSources.legacyHistory, afterSources.legacyHistory)) addIssue(issues, "legacy History source rows changed");
  if (!sameJson(beforeSources.legacyEvidence, afterSources.legacyEvidence)) addIssue(issues, "legacy evidence source rows changed");
  if (!sameJson(beforeSources.tasks, afterSources.tasks)) addIssue(issues, "Task State source rows changed");

  const afterReport = buildLegacyHistoryPromotionDryRun(afterSources, beforeReport.userId);
  if (afterReport.plannedFacts.length !== 0) addIssue(issues, `remaining straightforward inserts: ${afterReport.plannedFacts.length}`);
  if (mutationCounts.rewardWrites !== 0) addIssue(issues, "reward writes were recorded");
  if (mutationCounts.taskStateWrites !== 0) addIssue(issues, "Task State writes were recorded");

  return {
    ok: issues.length === 0,
    issues,
    expectedFacts: beforeReport.plannedFacts.length,
    verifiedFacts,
    duplicateCanonicalKeys: duplicateKeys,
    remainingStraightforward: afterReport.plannedFacts.length,
    rewardWrites: 0,
    taskStateWrites: 0,
  };
}

export async function executeLegacyHistoryPromotion(input: {
  client: PromotionExecutionClient;
  sources: PromotionSources;
  confirmation: PromotionExecutionConfirmation;
  reloadSources: () => Promise<PromotionSources>;
}): Promise<PromotionExecutionResult> {
  // Refresh the complete read-only source set immediately before any write
  // boundary. The caller's earlier preview is confirmation input, not write
  // authority.
  const currentSources = await input.reloadSources();
  const report = buildLegacyHistoryPromotionDryRun(currentSources, input.confirmation.userId);
  const failures = executionGuardFailures(report, input.confirmation);
  if (failures.length > 0) throw new HistoryPromotionDiagnostic("EXECUTION_BLOCKED", failures.join("; "));

  const operation = await createOrResumeOperation(input.client, input.confirmation.userId, report.sourceFingerprint);
  const identity = asString(operation, "operation_identity") ?? buildPromotionOperationIdentity(input.confirmation.userId, report.sourceFingerprint);
  if (operation.state === "committed") {
    const afterSources = await input.reloadSources();
    const postflight = verifyLegacyHistoryPromotion({ beforeSources: currentSources, afterSources, beforeReport: report, operationId: operation.id, mutationCounts: { operationWrites: 0, factWrites: 0, rewardWrites: 0, taskStateWrites: 0 } });
    if (!postflight.ok) throw new HistoryPromotionDiagnostic("COMMITTED_OPERATION_POSTFLIGHT_FAILED", postflight.issues.join("; "));
    return { mode: "execution", operationId: operation.id, operationIdentity: identity, sourceFingerprint: report.sourceFingerprint, plannedInserts: report.plannedFacts.length, insertedFacts: 0, canonicalRaceSkips: 0, alreadyPresentSkips: report.plannedFacts.length, mutationCounts: { operationWrites: 0, factWrites: 0, rewardWrites: 0, taskStateWrites: 0 }, postflight };
  }

  let insertedFacts = 0;
  let canonicalRaceSkips = 0;
  let alreadyPresentSkips = 0;
  try {
    for (const plan of report.plannedFacts) {
      const existing = await readCanonicalAtKey(input.client, plan);
      if (existing) {
        alreadyPresentSkips += 1;
        continue;
      }
      const result = await input.client.from("adhdice_task_history_facts").insert(buildPromotionFactInsert(plan, operation.id)).select("*").maybeSingle();
      if (result.error) {
        const raced = await readCanonicalAtKey(input.client, plan);
        if (raced) {
          canonicalRaceSkips += 1;
          continue;
        }
        throw new HistoryPromotionDiagnostic(result.error.code ?? "FACT_INSERT_FAILED", result.error.message);
      }
      insertedFacts += 1;
    }
    const afterSources = await input.reloadSources();
    const mutationCounts = { operationWrites: operation.state === "started" ? 1 : 0, factWrites: insertedFacts, rewardWrites: 0 as const, taskStateWrites: 0 as const };
    const postflight = verifyLegacyHistoryPromotion({ beforeSources: currentSources, afterSources, beforeReport: report, operationId: operation.id, mutationCounts });
    if (!postflight.ok) {
      await updateOperation(input.client, operation, operationPatch("failed_retryable", { result_fingerprint: report.sourceFingerprint, insertedFacts, canonicalRaceSkips, alreadyPresentSkips }, { code: "POSTFLIGHT_FAILED", message: postflight.issues.join("; ") }));
      throw new HistoryPromotionDiagnostic("POSTFLIGHT_FAILED", postflight.issues.join("; "));
    }
    await updateOperation(input.client, operation, operationPatch("committed", { result_fingerprint: report.sourceFingerprint, insertedFacts, canonicalRaceSkips, alreadyPresentSkips }));
    return { mode: "execution", operationId: operation.id, operationIdentity: identity, sourceFingerprint: report.sourceFingerprint, plannedInserts: report.plannedFacts.length, insertedFacts, canonicalRaceSkips, alreadyPresentSkips, mutationCounts, postflight };
  } catch (error) {
    const diagnostic = error instanceof HistoryPromotionDiagnostic ? error : new HistoryPromotionDiagnostic("EXECUTION_FAILED", String(error));
    await updateOperation(input.client, operation, operationPatch("failed_retryable", { result_fingerprint: report.sourceFingerprint, insertedFacts, canonicalRaceSkips, alreadyPresentSkips }, { code: diagnostic.code, message: diagnostic.message }));
    throw diagnostic;
  }
}

type CliOptions = PromotionExecutionConfirmation & { batchSize: number; accessToken: string | null; outputPath: string | null };

export function parsePromotionExecutionArgs(argv: readonly string[]): CliOptions {
  const values = new Map<string, string>();
  let execute = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--execute") { execute = true; continue; }
    const [key, inline] = argument.split("=", 2);
    if (inline !== undefined) values.set(key, inline);
    else if (["--user-id", "--expected-candidate-count", "--confirm-source-fingerprint", "--confirm-migration-version", "--batch-size", "--access-token", "--output"].includes(key)) {
      const next = argv[++index];
      if (!next || next.startsWith("--")) throw new HistoryPromotionDiagnostic("MISSING_ARGUMENT_VALUE", `${key} requires a value`);
      values.set(key, next);
    } else throw new HistoryPromotionDiagnostic("INVALID_ARGUMENT", `unknown argument ${key}`);
  }
  const userId = values.get("--user-id");
  if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) throw new HistoryPromotionDiagnostic("INVALID_USER_ID", "--user-id must be a UUID");
  const batchSize = Number(values.get("--batch-size") ?? DEFAULT_BATCH_SIZE);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) throw new HistoryPromotionDiagnostic("INVALID_BATCH_SIZE", `batch size must be between 1 and ${MAX_BATCH_SIZE}`);
  if (!execute) return { execute: false, userId, expectedCandidateCount: 0, confirmSourceFingerprint: "", confirmMigrationVersion: PROMOTION_MIGRATION_VERSION, batchSize, accessToken: values.get("--access-token") ?? null, outputPath: values.get("--output") ?? null };
  const expected = Number(values.get("--expected-candidate-count"));
  const fingerprint = values.get("--confirm-source-fingerprint");
  const migrationVersion = values.get("--confirm-migration-version");
  if (!Number.isInteger(expected) || expected < 0) throw new HistoryPromotionDiagnostic("INVALID_EXPECTED_COUNT", "--expected-candidate-count must be a non-negative integer");
  if (!fingerprint?.startsWith("sha256:")) throw new HistoryPromotionDiagnostic("INVALID_SOURCE_FINGERPRINT", "--confirm-source-fingerprint must be a sha256 fingerprint");
  if (migrationVersion !== PROMOTION_MIGRATION_VERSION) throw new HistoryPromotionDiagnostic("INVALID_MIGRATION_VERSION", `--confirm-migration-version must equal ${PROMOTION_MIGRATION_VERSION}`);
  return { execute, userId, expectedCandidateCount: expected, confirmSourceFingerprint: fingerprint, confirmMigrationVersion: migrationVersion, batchSize, accessToken: values.get("--access-token") ?? null, outputPath: values.get("--output") ?? null };
}

async function main(argv: readonly string[]): Promise<void> {
  if (argv.length === 0) {
    process.stdout.write("PREVIEW ONLY — NO WRITES PERFORMED\nExecution confirmations are absent. Supply --user-id for a read-only preflight; --execute requires every explicit confirmation.\n");
    return;
  }
  const options = parsePromotionExecutionArgs(argv);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const accessToken = options.accessToken ?? process.env.ADHDICE_SUPABASE_ACCESS_TOKEN ?? process.env.SUPABASE_USER_ACCESS_TOKEN;
  if (!url || !anonKey) throw new HistoryPromotionDiagnostic("SUPABASE_CONFIG_MISSING", "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required");
  if (!accessToken?.trim()) throw new HistoryPromotionDiagnostic("AUTHENTICATION_REQUIRED", "an authenticated user access token is required");
  const readClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: `Bearer ${accessToken}` } } });
  const load = () => loadAuthenticatedPromotionSources(readClient as never, options.userId, accessToken, options.batchSize);
  const sources = await load();
  const report = buildLegacyHistoryPromotionDryRun(sources, options.userId);
  process.stderr.write(formatPromotionSummary(report, comparePromotionBaseline(report)));
  if (options.outputPath) await writeFile(resolve(options.outputPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  else process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!options.execute) return;
  const serviceRoleKey = process.env.ADHDICE_SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey?.trim()) throw new HistoryPromotionDiagnostic("PRIVILEGED_EXECUTION_CREDENTIAL_REQUIRED", "explicit execution requires ADHDICE_SUPABASE_SERVICE_ROLE_KEY; it is never used for read-only preflight");
  const writeClient = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } }) as unknown as PromotionExecutionClient;
  const result = await executeLegacyHistoryPromotion({ client: writeClient, sources, confirmation: options, reloadSources: load });
  process.stdout.write(`EXECUTION MODE\n${JSON.stringify(result, null, 2)}\n`);
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const diagnostic = error instanceof HistoryPromotionDiagnostic ? error : new HistoryPromotionDiagnostic("EXECUTOR_FAILED", String(error));
    process.stderr.write(`${diagnostic.message}\n`);
    process.exitCode = 1;
  });
}
