import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import {
  HistoryPromotionDiagnostic,
  PROMOTION_MIGRATION_VERSION,
  PROMOTION_PROVENANCE,
  PROMOTION_SCHEMA_CONTRACT_VERSION,
  PROMOTION_SOURCE,
  stableStringify,
} from "./legacy-history-promotion-dry-run.ts";

export const APPROVED_ROLLBACK_MUTATION_TABLES = [
  "adhdice_task_history_facts",
  "adhdice_task_migration_operations",
] as const;

export const ROLLBACK_RPC_NAME = "adhdice_rollback_legacy_history_promotion" as const;
export const ROLLBACK_COMPLETED_ERROR_CODE = "ROLLBACK_COMPLETED" as const;

const UUID_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 1000;
const ROLLBACK_READ_TABLES = [
  "adhdice_task_migration_operations",
  "adhdice_task_history_facts",
  "adhdice_task_history",
  "adhdice_task_legacy_history_evidence",
] as const;

export type RollbackRow = Record<string, unknown>;

export type RollbackOperation = RollbackRow & {
  id: string;
  user_id: string;
  state: "started" | "committed" | "failed_retryable" | "failed_permanent";
  operation_kind: string;
  migration_version: string;
  schema_contract_version: string;
  input_fingerprint: string;
};

export type RollbackSnapshot = {
  operation: RollbackOperation | null;
  canonicalFacts: readonly RollbackRow[];
  legacyHistoryFingerprint: string;
  legacyEvidenceFingerprint: string;
};

export type RollbackFactSnapshot = {
  id: unknown;
  user_id: unknown;
  entity_id: unknown;
  logical_date: unknown;
  outcome: unknown;
  event_kind: unknown;
  scheduled_due_on: unknown;
  source_legacy_history_id: unknown;
  migration_operation_id: unknown;
  provenance_kind: unknown;
  source: unknown;
  created_at: unknown;
};

export type RollbackInvalidFact = {
  factId: unknown;
  issues: string[];
  snapshot: RollbackFactSnapshot;
};

export type RollbackPreview = {
  operationId: string;
  operationState: string | null;
  operationIdentity: string | null;
  sourceFingerprint: string | null;
  migrationVersion: string | null;
  schemaContractVersion: string | null;
  matchingPromotedFacts: number;
  validOwnershipFacts: number;
  invalidSuspiciousFacts: RollbackInvalidFact[];
  distinctSourceLegacyIds: string[];
  duplicateSourceLinks: string[];
  plannedFactDeletes: number;
  plannedOperationUpdates: number;
  plannedTaskStateWrites: 0;
  plannedRewardWrites: 0;
  snapshot: RollbackFactSnapshot[];
  legacyHistoryFingerprint: string;
  legacyEvidenceFingerprint: string;
  blockingIssues: string[];
};

export type RollbackConfirmation = {
  rollback: boolean;
  userId: string;
  operationId: string;
  expectedFactCount: number | null;
  confirmSourceFingerprint: string | null;
  confirmMigrationVersion: string | null;
};

export type RollbackExecutionResult = {
  operationId: string;
  deletedFactCount: number;
  operationState: string;
  postflight: RollbackPostflight;
  mutationTables: readonly string[];
  rewardWrites: 0;
  taskStateWrites: 0;
};

export type RollbackPostflight = {
  ok: boolean;
  issues: string[];
  remainingTargetedFacts: number;
  remainingSourceLinkedFacts: number;
  operationExists: boolean;
  operationCommitted: boolean;
  rollbackMetadataPresent: boolean;
  unrelatedCanonicalFactsPreserved: boolean;
  legacyHistoryUntouched: boolean;
  legacyEvidenceUntouched: boolean;
  rewardWrites: 0;
  taskStateWrites: 0;
};

type ReadQuery = {
  select(columns: string): ReadQuery;
  eq(column: string, value: string): ReadQuery;
  order(column: string, options?: { ascending?: boolean }): ReadQuery;
  range(from: number, to: number): Promise<{ data: RollbackRow[] | null; error: { code?: string; message: string } | null }>;
  maybeSingle(): Promise<{ data: RollbackRow | null; error: { code?: string; message: string } | null }>;
};

export type RollbackReadClient = {
  from(table: (typeof ROLLBACK_READ_TABLES)[number]): ReadQuery;
};

export type RollbackRpcClient = {
  rpc(functionName: string, args: Record<string, unknown>): Promise<{ data: RollbackRow | null; error: { code?: string; message: string } | null }>;
};

function asString(row: RollbackRow | null | undefined, key: string): string | null {
  const value = row?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function asNullableString(row: RollbackRow | null | undefined, key: string): string | null {
  const value = row?.[key];
  return value === null || value === undefined ? null : typeof value === "string" ? value : null;
}

function isAlreadyRolledBack(operation: RollbackOperation | null): boolean {
  return operation?.state === "failed_retryable"
    && operation.error_code === ROLLBACK_COMPLETED_ERROR_CODE
    && Boolean(operation.result_references && typeof operation.result_references === "object" && (operation.result_references as RollbackRow).rollback_completed === true);
}

function factSnapshot(fact: RollbackRow): RollbackFactSnapshot {
  return {
    id: fact.id,
    user_id: fact.user_id,
    entity_id: fact.entity_id,
    logical_date: fact.logical_date,
    outcome: fact.outcome,
    event_kind: fact.event_kind,
    scheduled_due_on: fact.scheduled_due_on,
    source_legacy_history_id: fact.source_legacy_history_id,
    migration_operation_id: fact.migration_operation_id,
    provenance_kind: fact.provenance_kind,
    source: fact.source,
    created_at: fact.created_at,
  };
}

function ownershipIssues(fact: RollbackRow, userId: string, operationId: string): string[] {
  const issues: string[] = [];
  if (fact.user_id !== userId) issues.push("user_id");
  if (fact.migration_operation_id !== operationId) issues.push("migration_operation_id");
  if (fact.provenance_kind !== PROMOTION_PROVENANCE) issues.push("provenance_kind");
  if (fact.source !== PROMOTION_SOURCE) issues.push("source");
  if (fact.source_legacy_history_id === null || fact.source_legacy_history_id === undefined) issues.push("source_legacy_history_id");
  if (fact.command_id !== null && fact.command_id !== undefined) issues.push("command_id");
  if (fact.actor_kind !== "migration") issues.push("actor_kind");
  if (fact.actor_id !== null && fact.actor_id !== undefined) issues.push("actor_id");
  if (fact.occurrence_id !== null && fact.occurrence_id !== undefined) issues.push("occurrence_id");
  return issues;
}

function fingerprintRows(rows: readonly RollbackRow[]): string {
  return `sha256:${createHash("sha256").update(stableStringify(rows)).digest("hex")}`;
}

export function buildRollbackPreview(snapshot: RollbackSnapshot, userId: string, operationId: string): RollbackPreview {
  const operation = snapshot.operation;
  const matchingFacts = snapshot.canonicalFacts.filter((fact) => fact.migration_operation_id === operationId);
  const invalidSuspiciousFacts = matchingFacts
    .map((fact) => ({ fact, issues: ownershipIssues(fact, userId, operationId) }))
    .filter(({ issues }) => issues.length > 0)
    .map(({ fact, issues }) => ({ factId: fact.id, issues, snapshot: factSnapshot(fact) }));
  const validFacts = matchingFacts.filter((fact) => ownershipIssues(fact, userId, operationId).length === 0);
  const sourceIds = matchingFacts
    .map((fact) => asString(fact, "source_legacy_history_id"))
    .filter((value): value is string => Boolean(value));
  const counts = sourceIds.reduce((result, sourceId) => result.set(sourceId, (result.get(sourceId) ?? 0) + 1), new Map<string, number>());
  const duplicateSourceLinks = [...counts.entries()].filter(([, count]) => count > 1).map(([sourceId]) => sourceId).sort();
  const blockingIssues: string[] = [];
  if (!operation) blockingIssues.push("selected migration operation was not found for the expected user");
  else {
    if (operation.user_id !== userId) blockingIssues.push("migration operation belongs to another user");
    if (operation.migration_version !== PROMOTION_MIGRATION_VERSION) blockingIssues.push("operation migration version is unrelated");
    if (operation.operation_kind !== "backfill") blockingIssues.push("operation kind is not backfill");
    if (operation.schema_contract_version !== PROMOTION_SCHEMA_CONTRACT_VERSION) blockingIssues.push("operation schema contract version is unrelated");
    if (operation.state !== "committed" && !isAlreadyRolledBack(operation)) blockingIssues.push("operation is not committed or already rollback-completed");
  }
  if (invalidSuspiciousFacts.length > 0) blockingIssues.push("one or more targeted facts fail the locked ownership contract");
  if (duplicateSourceLinks.length > 0) blockingIssues.push("duplicate source legacy links are suspicious");
  if (isAlreadyRolledBack(operation) && matchingFacts.length > 0) blockingIssues.push("rollback-completed operation has remaining targeted facts");
  const canPlan = blockingIssues.length === 0;
  return {
    operationId,
    operationState: operation?.state ?? null,
    operationIdentity: asNullableString(operation, "operation_identity"),
    sourceFingerprint: asNullableString(operation, "input_fingerprint"),
    migrationVersion: asNullableString(operation, "migration_version"),
    schemaContractVersion: asNullableString(operation, "schema_contract_version"),
    matchingPromotedFacts: matchingFacts.length,
    validOwnershipFacts: validFacts.length,
    invalidSuspiciousFacts,
    distinctSourceLegacyIds: [...new Set(sourceIds)].sort(),
    duplicateSourceLinks,
    plannedFactDeletes: canPlan ? matchingFacts.length : 0,
    plannedOperationUpdates: canPlan && !isAlreadyRolledBack(operation) ? 1 : 0,
    plannedTaskStateWrites: 0,
    plannedRewardWrites: 0,
    snapshot: matchingFacts.map(factSnapshot),
    legacyHistoryFingerprint: snapshot.legacyHistoryFingerprint,
    legacyEvidenceFingerprint: snapshot.legacyEvidenceFingerprint,
    blockingIssues,
  };
}

export function rollbackConfirmationFailures(preview: RollbackPreview, confirmation: RollbackConfirmation): string[] {
  const failures = [...preview.blockingIssues];
  if (!confirmation.rollback) failures.push("explicit --rollback confirmation is required");
  if (confirmation.expectedFactCount === null) failures.push("--expected-fact-count is required");
  else if (confirmation.expectedFactCount !== preview.matchingPromotedFacts) failures.push(`fact count mismatch: expected ${confirmation.expectedFactCount}, current ${preview.matchingPromotedFacts}`);
  if (!confirmation.confirmSourceFingerprint) failures.push("--confirm-source-fingerprint is required");
  else if (confirmation.confirmSourceFingerprint !== preview.sourceFingerprint) failures.push("source fingerprint mismatch");
  if (confirmation.confirmMigrationVersion !== PROMOTION_MIGRATION_VERSION) failures.push(`--confirm-migration-version must equal ${PROMOTION_MIGRATION_VERSION}`);
  return [...new Set(failures)];
}

export function verifyRollbackPostflight(input: {
  before: RollbackSnapshot;
  after: RollbackSnapshot;
  userId: string;
  operationId: string;
  rpcResult: RollbackRow;
}): RollbackPostflight {
  const { before, after, userId, operationId, rpcResult } = input;
  const remainingTargetedFacts = after.canonicalFacts.filter((fact) => fact.user_id === userId && fact.migration_operation_id === operationId).length;
  const remainingSourceLinkedFacts = after.canonicalFacts.filter((fact) => fact.source === PROMOTION_SOURCE && fact.migration_operation_id === operationId).length;
  const operation = after.operation;
  const operationExists = Boolean(operation && operation.id === operationId && operation.user_id === userId);
  const rollbackMetadataPresent = Boolean(operation
    && operation.error_code === ROLLBACK_COMPLETED_ERROR_CODE
    && typeof operation.result_references === "object"
    && operation.result_references !== null
    && (operation.result_references as RollbackRow).rollback_completed === true
    && (operation.result_references as RollbackRow).original_source_fingerprint === before.operation?.input_fingerprint);
  const beforeUnrelated = before.canonicalFacts.filter((fact) => fact.migration_operation_id !== operationId);
  const afterUnrelated = after.canonicalFacts.filter((fact) => fact.migration_operation_id !== operationId);
  const unrelatedCanonicalFactsPreserved = stableStringify(beforeUnrelated) === stableStringify(afterUnrelated);
  const legacyHistoryUntouched = before.legacyHistoryFingerprint === after.legacyHistoryFingerprint;
  const legacyEvidenceUntouched = before.legacyEvidenceFingerprint === after.legacyEvidenceFingerprint;
  const issues: string[] = [];
  if (remainingTargetedFacts > 0) issues.push("targeted canonical facts remain");
  if (remainingSourceLinkedFacts > 0) issues.push("source-linked targeted facts remain");
  if (!operationExists) issues.push("selected migration operation was deleted or changed owner");
  if (operation?.state === "committed") issues.push("selected migration operation remains committed");
  if (!rollbackMetadataPresent) issues.push("rollback diagnostic metadata is missing");
  if (!unrelatedCanonicalFactsPreserved) issues.push("unrelated canonical facts changed");
  if (!legacyHistoryUntouched) issues.push("original legacy History changed");
  if (!legacyEvidenceUntouched) issues.push("original legacy History evidence changed");
  if (rpcResult.reward_writes !== 0) issues.push("reward writes were recorded");
  if (rpcResult.task_state_writes !== 0) issues.push("Task State writes were recorded");
  return {
    ok: issues.length === 0,
    issues,
    remainingTargetedFacts,
    remainingSourceLinkedFacts,
    operationExists,
    operationCommitted: operation?.state === "committed",
    rollbackMetadataPresent,
    unrelatedCanonicalFactsPreserved,
    legacyHistoryUntouched,
    legacyEvidenceUntouched,
    rewardWrites: 0,
    taskStateWrites: 0,
  };
}

export async function executeLegacyHistoryPromotionRollback(input: {
  client: RollbackRpcClient;
  before: RollbackSnapshot;
  confirmation: RollbackConfirmation;
  reload: () => Promise<RollbackSnapshot>;
}): Promise<RollbackExecutionResult> {
  const current = await input.reload();
  const preview = buildRollbackPreview(current, input.confirmation.userId, input.confirmation.operationId);
  const failures = rollbackConfirmationFailures(preview, input.confirmation);
  if (failures.length > 0) throw new HistoryPromotionDiagnostic("ROLLBACK_BLOCKED", failures.join("; "));
  const result = await input.client.rpc(ROLLBACK_RPC_NAME, {
    p_user_id: input.confirmation.userId,
    p_operation_id: input.confirmation.operationId,
    p_expected_fact_count: input.confirmation.expectedFactCount,
    p_confirm_source_fingerprint: input.confirmation.confirmSourceFingerprint,
    p_confirm_migration_version: input.confirmation.confirmMigrationVersion,
  });
  if (result.error) throw new HistoryPromotionDiagnostic(result.error.code ?? "ROLLBACK_RPC_FAILED", result.error.message);
  const after = await input.reload();
  const postflight = verifyRollbackPostflight({ before: current, after, userId: input.confirmation.userId, operationId: input.confirmation.operationId, rpcResult: result.data ?? {} });
  if (!postflight.ok) throw new HistoryPromotionDiagnostic("ROLLBACK_POSTFLIGHT_FAILED", postflight.issues.join("; "));
  return {
    operationId: input.confirmation.operationId,
    deletedFactCount: typeof result.data?.deleted_fact_count === "number" ? result.data.deleted_fact_count : 0,
    operationState: after.operation?.state ?? "unknown",
    postflight,
    mutationTables: APPROVED_ROLLBACK_MUTATION_TABLES,
    rewardWrites: 0,
    taskStateWrites: 0,
  };
}

export function parseLegacyHistoryRollbackArgs(argv: readonly string[]): RollbackConfirmation & { outputPath: string | null; accessToken: string | null; batchSize: number; hasTarget: boolean } {
  if (argv.length === 0) return { rollback: false, userId: "", operationId: "", expectedFactCount: null, confirmSourceFingerprint: null, confirmMigrationVersion: null, outputPath: null, accessToken: null, batchSize: DEFAULT_BATCH_SIZE, hasTarget: false };
  const values = new Map<string, string>();
  let rollback = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--rollback") { rollback = true; continue; }
    const [key, inline] = argument.split("=", 2);
    if (inline !== undefined) values.set(key, inline);
    else if (["--user-id", "--operation-id", "--expected-fact-count", "--confirm-source-fingerprint", "--confirm-migration-version", "--access-token", "--output", "--batch-size"].includes(key)) {
      const next = argv[++index];
      if (!next || next.startsWith("--")) throw new HistoryPromotionDiagnostic("MISSING_ARGUMENT_VALUE", `${key} requires a value`);
      values.set(key, next);
    } else throw new HistoryPromotionDiagnostic("INVALID_ARGUMENT", `unknown argument ${key}`);
  }
  const userId = values.get("--user-id");
  const operationId = values.get("--operation-id");
  if (!userId || !UUID_KEY.test(userId)) throw new HistoryPromotionDiagnostic("MISSING_OR_INVALID_USER_ID", "--user-id must be a UUID");
  if (!operationId || !UUID_KEY.test(operationId)) throw new HistoryPromotionDiagnostic("MISSING_OR_INVALID_OPERATION_ID", "--operation-id must be a UUID");
  const batchSize = Number(values.get("--batch-size") ?? DEFAULT_BATCH_SIZE);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) throw new HistoryPromotionDiagnostic("INVALID_BATCH_SIZE", `batch size must be between 1 and ${MAX_BATCH_SIZE}`);
  const expectedRaw = values.get("--expected-fact-count");
  const expectedFactCount = expectedRaw === undefined ? null : Number(expectedRaw);
  if (rollback && expectedRaw === undefined) throw new HistoryPromotionDiagnostic("MISSING_EXPECTED_FACT_COUNT", "--expected-fact-count is required with --rollback");
  if (expectedRaw !== undefined && (!Number.isInteger(expectedFactCount) || expectedFactCount < 0)) throw new HistoryPromotionDiagnostic("INVALID_EXPECTED_FACT_COUNT", "--expected-fact-count must be a non-negative integer");
  const confirmSourceFingerprint = values.get("--confirm-source-fingerprint") ?? null;
  const confirmMigrationVersion = values.get("--confirm-migration-version") ?? null;
  if (rollback && confirmSourceFingerprint === null) throw new HistoryPromotionDiagnostic("MISSING_SOURCE_FINGERPRINT", "--confirm-source-fingerprint is required with --rollback");
  if (rollback && confirmSourceFingerprint !== null && !confirmSourceFingerprint.startsWith("sha256:")) throw new HistoryPromotionDiagnostic("INVALID_SOURCE_FINGERPRINT", "--confirm-source-fingerprint must be a sha256 fingerprint");
  if (rollback && confirmMigrationVersion === null) throw new HistoryPromotionDiagnostic("MISSING_MIGRATION_VERSION", "--confirm-migration-version is required with --rollback");
  return { rollback, userId, operationId, expectedFactCount, confirmSourceFingerprint, confirmMigrationVersion, outputPath: values.get("--output") ?? null, accessToken: values.get("--access-token") ?? null, batchSize, hasTarget: true };
}

async function readRows(client: Pick<RollbackReadClient, "from">, table: (typeof ROLLBACK_READ_TABLES)[number], userId: string, batchSize: number): Promise<RollbackRow[]> {
  const rows: RollbackRow[] = [];
  for (let offset = 0; ; offset += batchSize) {
    const result = await client.from(table).select("*").eq("user_id", userId).order("id", { ascending: true }).range(offset, offset + batchSize - 1);
    if (result.error) throw new HistoryPromotionDiagnostic(result.error.code ?? "ROLLBACK_READ_FAILED", `${table}: ${result.error.message}`);
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < batchSize) return rows;
  }
}

export async function loadLegacyHistoryRollbackSnapshot(client: RollbackReadClient, userId: string, operationId: string, batchSize = DEFAULT_BATCH_SIZE): Promise<RollbackSnapshot> {
  const operationResult = await client.from("adhdice_task_migration_operations").select("*").eq("user_id", userId).eq("id", operationId).maybeSingle();
  if (operationResult.error) throw new HistoryPromotionDiagnostic(operationResult.error.code ?? "ROLLBACK_OPERATION_READ_FAILED", operationResult.error.message);
  const [canonicalFacts, legacyHistory, legacyEvidence] = await Promise.all([
    readRows(client, "adhdice_task_history_facts", userId, batchSize),
    readRows(client, "adhdice_task_history", userId, batchSize),
    readRows(client, "adhdice_task_legacy_history_evidence", userId, batchSize),
  ]);
  return {
    operation: operationResult.data as RollbackOperation | null,
    canonicalFacts,
    legacyHistoryFingerprint: fingerprintRows(legacyHistory),
    legacyEvidenceFingerprint: fingerprintRows(legacyEvidence),
  };
}

export function formatRollbackPreview(preview: RollbackPreview): string {
  return [
    `OPERATION ID: ${preview.operationId}`,
    `OPERATION STATE: ${preview.operationState ?? "NOT FOUND"}`,
    `OPERATION IDENTITY: ${preview.operationIdentity ?? "UNKNOWN"}`,
    `SOURCE FINGERPRINT: ${preview.sourceFingerprint ?? "UNKNOWN"}`,
    `MIGRATION VERSION: ${preview.migrationVersion ?? "UNKNOWN"}`,
    `MATCHING PROMOTED FACTS: ${preview.matchingPromotedFacts}`,
    `VALID OWNERSHIP FACTS: ${preview.validOwnershipFacts}`,
    `INVALID / SUSPICIOUS FACTS: ${preview.invalidSuspiciousFacts.length}`,
    `DISTINCT SOURCE LEGACY IDS: ${preview.distinctSourceLegacyIds.length}`,
    `DUPLICATE SOURCE LINKS: ${preview.duplicateSourceLinks.length}`,
    `PLANNED FACT DELETES: ${preview.plannedFactDeletes}`,
    `PLANNED OPERATION UPDATES: ${preview.plannedOperationUpdates}`,
    "PLANNED TASK STATE WRITES = 0",
    "PLANNED REWARD WRITES = 0",
    preview.blockingIssues.length > 0 ? `ROLLBACK BLOCKED: ${preview.blockingIssues.join("; ")}` : "ROLLBACK READY ONLY WITH EXPLICIT CONFIRMATIONS",
    "PREVIEW ONLY — NO WRITES PERFORMED",
  ].join("\n") + "\n";
}

async function main(argv: readonly string[]): Promise<void> {
  if (argv.length === 0) {
    process.stdout.write("PREVIEW ONLY — NO WRITES PERFORMED\nExplicit rollback confirmations are absent. No credentials were read and no Supabase request was made.\n");
    return;
  }
  const options = parseLegacyHistoryRollbackArgs(argv);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const accessToken = options.accessToken ?? process.env.ADHDICE_SUPABASE_ACCESS_TOKEN ?? process.env.SUPABASE_USER_ACCESS_TOKEN;
  if (!url || !anonKey) throw new HistoryPromotionDiagnostic("SUPABASE_CONFIG_MISSING", "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required");
  if (!accessToken?.trim()) throw new HistoryPromotionDiagnostic("AUTHENTICATION_REQUIRED", "an authenticated user access token is required for read-only inspection");
  const readClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: `Bearer ${accessToken}` } } });
  const authenticatedUser = await readClient.auth.getUser(accessToken);
  if (authenticatedUser.error) throw new HistoryPromotionDiagnostic(authenticatedUser.error.code ?? "AUTHENTICATION_FAILED", authenticatedUser.error.message);
  if (authenticatedUser.data.user?.id !== options.userId) throw new HistoryPromotionDiagnostic("USER_ID_MISMATCH", "authenticated user does not match --user-id");
  const load = () => loadLegacyHistoryRollbackSnapshot(readClient as unknown as RollbackReadClient, options.userId, options.operationId, options.batchSize);
  const before = await load();
  const preview = buildRollbackPreview(before, options.userId, options.operationId);
  if (options.outputPath) await writeFile(resolve(options.outputPath), `${JSON.stringify(preview, null, 2)}\n`, "utf8");
  process.stdout.write(formatRollbackPreview(preview));
  if (!options.rollback) return;
  const serviceRoleKey = process.env.ADHDICE_SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey?.trim()) throw new HistoryPromotionDiagnostic("PRIVILEGED_EXECUTION_CREDENTIAL_REQUIRED", "explicit rollback requires ADHDICE_SUPABASE_SERVICE_ROLE_KEY; it is never used for preview");
  const writeClient = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } }) as unknown as RollbackRpcClient;
  const result = await executeLegacyHistoryPromotionRollback({ client: writeClient, before, confirmation: options, reload: load });
  process.stdout.write(`ROLLBACK EXECUTION\n${JSON.stringify(result, null, 2)}\n`);
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const diagnostic = error instanceof HistoryPromotionDiagnostic ? error : new HistoryPromotionDiagnostic("ROLLBACK_FAILED", String(error));
    process.stderr.write(`${diagnostic.message}\n`);
    process.exitCode = 1;
  });
}
