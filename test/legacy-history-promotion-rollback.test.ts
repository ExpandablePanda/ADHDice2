import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { stableStringify } from "../scripts/legacy-history-promotion-dry-run.ts";
import {
  APPROVED_ROLLBACK_MUTATION_TABLES,
  buildRollbackPreview,
  executeLegacyHistoryPromotionRollback,
  formatRollbackPreview,
  parseLegacyHistoryRollbackArgs,
  rollbackConfirmationFailures,
  verifyRollbackPostflight,
  type RollbackConfirmation,
  type RollbackOperation,
  type RollbackRow,
  type RollbackSnapshot,
} from "../scripts/legacy-history-promotion-rollback.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const OPERATION_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_OPERATION_ID = "44444444-4444-4444-8444-444444444444";
const FINGERPRINT = "sha256:source-fingerprint";

function operation(overrides: Partial<RollbackOperation> = {}): RollbackOperation {
  return {
    id: OPERATION_ID,
    user_id: USER_ID,
    state: "committed",
    operation_kind: "backfill",
    operation_identity: "legacy-history-promotion-v1:11111111-1111-4111-8111-111111111111:sha256:source-fingerprint",
    input_fingerprint: FINGERPRINT,
    migration_version: "legacy-history-promotion-v1",
    schema_contract_version: "task-state-schema-v1",
    result_references: {},
    ...overrides,
  };
}

function fact(id: string, overrides: RollbackRow = {}): RollbackRow {
  return {
    id,
    user_id: USER_ID,
    entity_id: "55555555-5555-4555-8555-555555555555",
    logical_date: "2026-06-20",
    outcome: "done",
    event_kind: "explicit_outcome",
    scheduled_due_on: "2026-06-20",
    source_legacy_history_id: `66666666-6666-4666-8666-66666666666${id.slice(-1)}`,
    migration_operation_id: OPERATION_ID,
    provenance_kind: "migration_reconstruction",
    source: "legacy_history_promotion_v1",
    command_id: null,
    actor_kind: "migration",
    actor_id: null,
    occurrence_id: null,
    created_at: "2026-06-20T12:00:00.000Z",
    ...overrides,
  };
}

function snapshot(overrides: Partial<RollbackSnapshot> = {}): RollbackSnapshot {
  return {
    operation: operation(),
    canonicalFacts: [fact("fact-1"), fact("fact-2")],
    legacyHistoryFingerprint: "sha256:legacy-history",
    legacyEvidenceFingerprint: "sha256:legacy-evidence",
    ...overrides,
  };
}

function confirmation(preview: ReturnType<typeof buildRollbackPreview>, overrides: Partial<RollbackConfirmation> = {}): RollbackConfirmation {
  return {
    rollback: true,
    userId: USER_ID,
    operationId: OPERATION_ID,
    expectedFactCount: preview.matchingPromotedFacts,
    confirmSourceFingerprint: FINGERPRINT,
    confirmMigrationVersion: "legacy-history-promotion-v1",
    ...overrides,
  };
}

test("safe default has zero writes and no Supabase request", () => {
  const output = execFileSync(process.execPath, ["--experimental-strip-types", "scripts/legacy-history-promotion-rollback.ts"], { encoding: "utf8" });
  assert.match(output, /PREVIEW ONLY — NO WRITES PERFORMED/);
  assert.match(output, /No credentials were read/);
});

test("preview reads facts and reports without invoking mutation", () => {
  const preview = buildRollbackPreview(snapshot(), USER_ID, OPERATION_ID);
  assert.equal(preview.matchingPromotedFacts, 2);
  assert.equal(preview.validOwnershipFacts, 2);
  assert.equal(preview.plannedFactDeletes, 2);
  assert.equal(preview.plannedOperationUpdates, 1);
  assert.match(formatRollbackPreview(preview), /PREVIEW ONLY — NO WRITES PERFORMED/);
});

test("required rollback flags are fail-closed", () => {
  for (const args of [
    ["--rollback"],
    ["--rollback", "--operation-id", OPERATION_ID],
    ["--rollback", "--user-id", USER_ID],
    ["--rollback", "--user-id", USER_ID, "--operation-id", OPERATION_ID],
    ["--rollback", "--user-id", USER_ID, "--operation-id", OPERATION_ID, "--expected-fact-count", "2"],
    ["--rollback", "--user-id", USER_ID, "--operation-id", OPERATION_ID, "--expected-fact-count", "2", "--confirm-source-fingerprint", FINGERPRINT],
  ]) assert.throws(() => parseLegacyHistoryRollbackArgs(args), /MISSING|requires|INVALID/);
});

test("wrong fingerprint, count, or migration version blocks deletion", () => {
  const preview = buildRollbackPreview(snapshot(), USER_ID, OPERATION_ID);
  assert.match(rollbackConfirmationFailures(preview, confirmation(preview, { confirmSourceFingerprint: "sha256:wrong" })).join(";"), /fingerprint/);
  assert.match(rollbackConfirmationFailures(preview, confirmation(preview, { expectedFactCount: 1 })).join(";"), /fact count/);
  assert.match(rollbackConfirmationFailures(preview, confirmation(preview, { confirmMigrationVersion: "other-version" })).join(";"), /migration-version/);
});

test("wrong user, operation kind, and unrelated migration version block deletion", () => {
  const cases = [
    snapshot({ operation: operation({ user_id: OTHER_USER_ID }) }),
    snapshot({ operation: operation({ operation_kind: "verify" }) }),
    snapshot({ operation: operation({ migration_version: "other-migration" }) }),
  ];
  for (const value of cases) assert.ok(buildRollbackPreview(value, USER_ID, OPERATION_ID).blockingIssues.length > 0);
});

test("valid migration facts are selected while unrelated operation facts are preserved", () => {
  const preview = buildRollbackPreview(snapshot({ canonicalFacts: [fact("fact-1"), fact("fact-other", { migration_operation_id: OTHER_OPERATION_ID, source_legacy_history_id: "77777777-7777-4777-8777-777777777777" })] }), USER_ID, OPERATION_ID);
  assert.equal(preview.matchingPromotedFacts, 1);
  assert.equal(preview.plannedFactDeletes, 1);
  assert.deepEqual(preview.distinctSourceLegacyIds.length, 1);
});

for (const [label, field, value] of [
  ["wrong provenance", "provenance_kind", "repair"],
  ["wrong source", "source", "manual"],
  ["non-null command", "command_id", "88888888-8888-4888-8888-888888888888"],
  ["wrong actor", "actor_kind", "user"],
  ["missing source link", "source_legacy_history_id", null],
] as const) {
  test(`${label} aborts all deletion`, () => {
    const preview = buildRollbackPreview(snapshot({ canonicalFacts: [fact("fact-1", { [field]: value }), fact("fact-2")] }), USER_ID, OPERATION_ID);
    assert.equal(preview.plannedFactDeletes, 0);
    assert.ok(preview.invalidSuspiciousFacts.length > 0);
  });
}

test("duplicate source links are reported and block rollback", () => {
  const value = snapshot({ canonicalFacts: [fact("fact-1", { source_legacy_history_id: "same-source" }), fact("fact-2", { source_legacy_history_id: "same-source" })] });
  const preview = buildRollbackPreview(value, USER_ID, OPERATION_ID);
  assert.deepEqual(preview.duplicateSourceLinks, ["same-source"]);
  assert.equal(preview.plannedFactDeletes, 0);
});

test("rollback removes only exact-operation facts and retains operation metadata", async () => {
  let current = snapshot({ canonicalFacts: [fact("fact-1"), fact("fact-2"), fact("unrelated", { migration_operation_id: OTHER_OPERATION_ID, source_legacy_history_id: "unrelated-source" })] });
  const before = current;
  const preview = buildRollbackPreview(current, USER_ID, OPERATION_ID);
  let rpcCalls = 0;
  const result = await executeLegacyHistoryPromotionRollback({
    client: { rpc: async () => {
      rpcCalls += 1;
      current = snapshot({
        operation: operation({ state: "failed_retryable", error_code: "ROLLBACK_COMPLETED", result_references: { rollback_completed: true, original_source_fingerprint: FINGERPRINT } }),
        canonicalFacts: [fact("unrelated", { migration_operation_id: OTHER_OPERATION_ID, source_legacy_history_id: "unrelated-source" })],
      });
      return { data: { deleted_fact_count: 2, reward_writes: 0, task_state_writes: 0 }, error: null };
    } },
    before,
    confirmation: confirmation(preview),
    reload: async () => current,
  });
  assert.equal(rpcCalls, 1);
  assert.equal(result.deletedFactCount, 2);
  assert.equal(result.postflight.ok, true);
  assert.equal(result.postflight.unrelatedCanonicalFactsPreserved, true);
  assert.equal(result.postflight.legacyHistoryUntouched, true);
  assert.equal(result.postflight.legacyEvidenceUntouched, true);
});

test("rerunning a completed rollback is idempotent and reports zero remaining facts", () => {
  const value = snapshot({ operation: operation({ state: "failed_retryable", error_code: "ROLLBACK_COMPLETED", result_references: { rollback_completed: true, original_source_fingerprint: FINGERPRINT } }), canonicalFacts: [] });
  const preview = buildRollbackPreview(value, USER_ID, OPERATION_ID);
  assert.equal(preview.matchingPromotedFacts, 0);
  assert.equal(preview.plannedFactDeletes, 0);
  assert.equal(rollbackConfirmationFailures(preview, confirmation(preview, { expectedFactCount: 0 })).length, 0);
});

test("postflight detects remaining targeted facts and accidental unrelated deletion", () => {
  const before = snapshot({ canonicalFacts: [fact("fact-1"), fact("unrelated", { migration_operation_id: OTHER_OPERATION_ID })] });
  const after = snapshot({ operation: operation({ state: "failed_retryable", error_code: "ROLLBACK_COMPLETED", result_references: { rollback_completed: true, original_source_fingerprint: FINGERPRINT } }), canonicalFacts: [fact("fact-1")] });
  const remaining = verifyRollbackPostflight({ before, after, userId: USER_ID, operationId: OPERATION_ID, rpcResult: { reward_writes: 0, task_state_writes: 0 } });
  assert.equal(remaining.ok, false);
  assert.match(remaining.issues.join(";"), /targeted canonical facts remain/);
  const accidental = verifyRollbackPostflight({ before, after: { ...after, canonicalFacts: [fact("fact-1")] }, userId: USER_ID, operationId: OPERATION_ID, rpcResult: { reward_writes: 0, task_state_writes: 0 } });
  assert.match(accidental.issues.join(";"), /unrelated canonical facts changed/);
});

test("reward and Task State writes remain zero", () => {
  const preview = buildRollbackPreview(snapshot(), USER_ID, OPERATION_ID);
  assert.equal(preview.plannedRewardWrites, 0);
  assert.equal(preview.plannedTaskStateWrites, 0);
  const postflight = verifyRollbackPostflight({ before: snapshot(), after: snapshot({ operation: operation({ state: "failed_retryable", error_code: "ROLLBACK_COMPLETED", result_references: { rollback_completed: true, original_source_fingerprint: FINGERPRINT } }), canonicalFacts: [] }), userId: USER_ID, operationId: OPERATION_ID, rpcResult: { reward_writes: 0, task_state_writes: 0 } });
  assert.equal(postflight.rewardWrites, 0);
  assert.equal(postflight.taskStateWrites, 0);
});

test("rollback SQL and script mutation allowlists contain only the two approved tables", () => {
  const script = readFileSync(resolve("scripts/legacy-history-promotion-rollback.ts"), "utf8");
  const sql = readFileSync(resolve("supabase/rollback_legacy_history_promotion.sql"), "utf8");
  assert.deepEqual(APPROVED_ROLLBACK_MUTATION_TABLES, ["adhdice_task_history_facts", "adhdice_task_migration_operations"]);
  assert.match(script, /ROLLBACK_RPC_NAME/);
  const sqlTables = [...sql.matchAll(/public\.(adhdice_task_history_facts|adhdice_task_migration_operations)\b/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(sqlTables)].sort(), [...APPROVED_ROLLBACK_MUTATION_TABLES].sort());
  assert.doesNotMatch(sql, /adhdice_clean_tasks|adhdice_task_history\b|legacy_history_evidence|adhdice_task_reward|adhdice_task_state/);
  assert.match(sql, /state = 'failed_retryable'/);
  assert.match(sql, /ROLLBACK_COMPLETED/);
  assert.match(sql, /for update/);
  assert.match(stableStringify(APPROVED_ROLLBACK_MUTATION_TABLES), /adhdice_task_history_facts/);
});

test("rollback script source never exposes service-role credential on preview", () => {
  const source = readFileSync(resolve("scripts/legacy-history-promotion-rollback.ts"), "utf8");
  assert.match(source, /ADHDICE_SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(source, /if \(!options\.rollback\) return/);
  assert.match(source, /PREVIEW ONLY — NO WRITES PERFORMED/);
});
