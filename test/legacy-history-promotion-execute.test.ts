import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  buildLegacyHistoryPromotionDryRun,
  buildPromotionSourceFingerprint,
  emptyPromotionSources,
  type PromotionRow,
  type PromotionSources,
} from "../scripts/legacy-history-promotion-dry-run.ts";
import {
  APPROVED_EXECUTION_MUTATION_TABLES,
  buildPromotionFactInsert,
  buildPromotionOperationIdentity,
  executeLegacyHistoryPromotion,
  parsePromotionExecutionArgs,
  verifyLegacyHistoryPromotion,
  type PromotionExecutionClient,
  type PromotionExecutionConfirmation,
} from "../scripts/legacy-history-promotion-execute.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const MIGRATION_VERSION = "legacy-history-promotion-v1" as const;

function task(id: string, overrides: PromotionRow = {}): PromotionRow {
  return { id, user_id: USER_ID, title: `Task ${id}`, entity_kind: "parent", ...overrides };
}

function history(id: string, taskId: string, status: string, date = "2026-06-20", overrides: PromotionRow = {}): PromotionRow {
  return {
    id,
    task_id: taskId,
    user_id: USER_ID,
    entry_date: date,
    status,
    event_type: status === "complete" ? "completed_permanently" : "status",
    occurrence_due_on: null,
    counted_as_due_occurrence: true,
    ...overrides,
  };
}

function sources(overrides: Partial<PromotionSources> = {}): PromotionSources {
  return {
    ...emptyPromotionSources(),
    tasks: [task("task-1"), task("task-2"), task("task-3"), task("task-4"), task("task-excluded"), task("task-delayed")],
    profile: { user_id: USER_ID, timezone: "America/New_York", day_start_time: "06:00", settings_revision: 1 },
    ...overrides,
  };
}

function confirmation(inputSources: PromotionSources, expectedCandidateCount: number, overrides: Partial<PromotionExecutionConfirmation> = {}): PromotionExecutionConfirmation {
  return {
    execute: true,
    userId: USER_ID,
    expectedCandidateCount,
    confirmSourceFingerprint: buildPromotionSourceFingerprint(inputSources),
    confirmMigrationVersion: MIGRATION_VERSION,
    ...overrides,
  };
}

class FakeQuery {
  private filters: Record<string, string> = {};
  private action: "read" | "insert" | "update" = "read";
  private values: PromotionRow | null = null;
  private readonly client: FakeClient;
  private readonly table: string;

  constructor(client: FakeClient, table: string) {
    this.client = client;
    this.table = table;
  }

  select(columns: string): FakeQuery { void columns; return this; }

  eq(column: string, value: string): FakeQuery {
    this.filters[column] = value;
    return this;
  }

  insert(values: PromotionRow): FakeQuery {
    this.action = "insert";
    this.values = values;
    return this;
  }

  update(values: PromotionRow): FakeQuery {
    this.action = "update";
    this.values = values;
    return this;
  }

  async maybeSingle(): Promise<{ data: PromotionRow | null; error: { code?: string; message: string } | null }> {
    this.client.calls.push(`${this.action}:${this.table}`);
    if (this.action === "insert") return this.client.insert(this.table, this.values ?? {}, this.filters);
    if (this.action === "update") return this.client.update(this.table, this.values ?? {}, this.filters);
    return { data: this.client.find(this.table, this.filters), error: null };
  }

}

class FakeClient implements PromotionExecutionClient {
  readonly calls: string[] = [];
  readonly operations: PromotionRow[] = [];
  readonly facts: PromotionRow[] = [];
  raceOnNextFactInsert = false;

  from(table: string): FakeQuery { return new FakeQuery(this, table); }

  find(table: string, filters: Record<string, string>): PromotionRow | null {
    const rows = table === "adhdice_task_migration_operations" ? this.operations : this.facts;
    return rows.find((row) => Object.entries(filters).every(([key, value]) => row[key] === value)) ?? null;
  }

  insert(table: string, values: PromotionRow, filters: Record<string, string>): { data: PromotionRow | null; error: { code?: string; message: string } | null } {
    void filters;
    if (table === "adhdice_task_migration_operations") {
      const row = { ...values, id: `operation-${this.operations.length + 1}` };
      this.operations.push(row);
      return { data: row, error: null };
    }
    if (this.raceOnNextFactInsert) {
      this.raceOnNextFactInsert = false;
      this.facts.push({ id: `race-${this.facts.length + 1}`, user_id: values.user_id, entity_id: values.entity_id, logical_date: values.logical_date, outcome: "did_my_best", source: "manual" });
      return { data: null, error: { code: "23505", message: "canonical key raced" } };
    }
    const key = `${values.user_id}:${values.entity_id}:${values.logical_date}`;
    if (this.facts.some((fact) => `${fact.user_id}:${fact.entity_id}:${fact.logical_date}` === key)) return { data: null, error: { code: "23505", message: "canonical key exists" } };
    const row = { ...values, id: `fact-${this.facts.length + 1}` };
    this.facts.push(row);
    return { data: row, error: null };
  }

  update(table: string, values: PromotionRow, filters: Record<string, string>): { data: PromotionRow | null; error: { code?: string; message: string } | null } {
    const row = this.find(table, filters);
    if (!row) return { data: null, error: { code: "NOT_FOUND", message: "row not found" } };
    Object.assign(row, values);
    return { data: row, error: null };
  }
}

function run(client: FakeClient, inputSources: PromotionSources, overrides: Partial<PromotionExecutionConfirmation> = {}, reloadSources?: () => Promise<PromotionSources>) {
  const report = buildLegacyHistoryPromotionDryRun(inputSources, USER_ID);
  return executeLegacyHistoryPromotion({
    client,
    sources: inputSources,
    confirmation: confirmation(inputSources, report.candidateCounts.straightforward, overrides),
    reloadSources: reloadSources ?? (async () => ({ ...inputSources, canonicalFacts: [...inputSources.canonicalFacts, ...client.facts] })),
  });
}

test("safe default prints preview-only and has no write mode", () => {
  const output = execFileSync(process.execPath, ["--experimental-strip-types", resolve("scripts/legacy-history-promotion-execute.ts")], { encoding: "utf8" });
  assert.match(output, /PREVIEW ONLY — NO WRITES PERFORMED/);
});

test("missing execute or any required confirmation blocks before mutation", async () => {
  assert.equal(parsePromotionExecutionArgs(["--user-id", USER_ID]).execute, false);
  assert.throws(() => parsePromotionExecutionArgs(["--execute", "--user-id", USER_ID]), /INVALID_EXPECTED_COUNT/);
  assert.throws(() => parsePromotionExecutionArgs(["--execute", "--user-id", USER_ID, "--expected-candidate-count", "1"]), /INVALID_SOURCE_FINGERPRINT/);
  const inputSources = sources({ legacyHistory: [history("h-no-execute", "task-1", "done")] });
  const client = new FakeClient();
  await assert.rejects(run(client, inputSources, { execute: false }), /EXECUTION_BLOCKED/);
  assert.deepEqual(client.calls, []);
});

test("direct Done, Did My Best, Missed, and Complete plans insert exact outcomes", async () => {
  const inputSources = sources({ legacyHistory: [
    history("h-done", "task-1", "done", "2026-06-20"),
    history("h-dmb", "task-2", "did_my_best", "2026-06-21"),
    history("h-missed", "task-3", "missed", "2026-06-22"),
    history("h-complete", "task-4", "complete", "2026-06-23"),
  ] });
  const client = new FakeClient();
  const result = await run(client, inputSources);
  assert.equal(result.insertedFacts, 4);
  assert.deepEqual(client.facts.map((fact) => [fact.outcome, fact.event_kind]).sort(), [
    ["complete", "terminal_complete"],
    ["did_my_best", "explicit_outcome"],
    ["done", "explicit_outcome"],
    ["missed", "explicit_outcome"],
  ]);
});

test("counted-as-due bridge preserves present due, bridges absent due to entry date, and suppresses false", () => {
  const inputSources = sources({ legacyHistory: [
    history("h-present", "task-1", "done", "2026-06-20", { occurrence_due_on: "2026-06-19", counted_as_due_occurrence: true }),
    history("h-absent", "task-2", "done", "2026-06-21", { occurrence_due_on: null, counted_as_due_occurrence: true }),
    history("h-false-present", "task-3", "done", "2026-06-22", { occurrence_due_on: "2026-06-21", counted_as_due_occurrence: false }),
    history("h-false-absent", "task-4", "done", "2026-06-23", { occurrence_due_on: null, counted_as_due_occurrence: false }),
  ] });
  const report = buildLegacyHistoryPromotionDryRun(inputSources, USER_ID);
  assert.deepEqual(report.plannedFacts.map((fact) => fact.scheduled_due_on), ["2026-06-19", "2026-06-21", null, null]);
});

test("insert plan retains source identity, provenance, null occurrence, and operation identity", async () => {
  const inputSources = sources({ legacyHistory: [history("h-source", "task-1", "done")] });
  const client = new FakeClient();
  const result = await run(client, inputSources);
  const fact = client.facts[0]!;
  assert.equal(fact.source_legacy_history_id, "h-source");
  assert.equal(fact.provenance_kind, "migration_reconstruction");
  assert.equal(fact.actor_kind, "migration");
  assert.equal(fact.actor_id, null);
  assert.equal(fact.command_id, null);
  assert.equal(fact.migration_operation_id, result.operationId);
  assert.equal(fact.occurrence_id, null);
  assert.equal(result.operationIdentity, buildPromotionOperationIdentity(USER_ID, result.sourceFingerprint));
});

test("canonical wins, owner-excluded rows, and Delayed rows are never promoted", async () => {
  const inputSources = sources({
    legacyHistory: [
      history("h-canonical", "task-1", "missed"),
      history("h-excluded", "task-excluded", "done", "2026-06-21"),
      history("h-delayed", "task-delayed", "delayed", "2026-06-22"),
    ],
    canonicalFacts: [{ id: "canonical", user_id: USER_ID, entity_id: "task-1", logical_date: "2026-06-20", outcome: "did_my_best", source: "manual" }],
    migrationEntities: [{ user_id: USER_ID, entity_id: "task-excluded", entity_kind: "parent", classification: { historyDisposition: "owner_approved_excluded" } }],
  });
  const report = buildLegacyHistoryPromotionDryRun(inputSources, USER_ID);
  assert.equal(report.plannedFacts.length, 0);
  assert.equal(report.candidateCounts.canonicalWins, 1);
  assert.equal(report.candidateCounts.ownerExcluded, 1);
  assert.equal(report.candidateCounts.delayedNeedingDecision, 1);
  const client = new FakeClient();
  const result = await run(client, inputSources);
  assert.equal(result.insertedFacts, 0);
  assert.equal(client.facts.length, 0);
});

test("even an exact Delayed target remains outside the straightforward promotion set", () => {
  const inputSources = sources({
    legacyHistory: [history("h-delayed-exact", "task-delayed", "delayed", "2026-06-20", { effective_due_on: "2026-06-25" })],
    tasks: [task("task-delayed", { due_on: "2026-06-25" })],
  });
  const report = buildLegacyHistoryPromotionDryRun(inputSources, USER_ID);
  assert.equal(report.delayedSummary.total, 1);
  assert.equal(report.delayedSummary.exactTargetProven, 1);
  assert.equal(report.plannedFacts.length, 0);
});

test("source fingerprint is deterministic and changes on meaningful source drift", () => {
  const inputSources = sources({ legacyHistory: [history("h-1", "task-1", "done")] });
  const reversed = { ...inputSources, legacyHistory: [...inputSources.legacyHistory].reverse(), tasks: [...inputSources.tasks].reverse() };
  assert.equal(buildPromotionSourceFingerprint(inputSources), buildPromotionSourceFingerprint(reversed));
  assert.notEqual(buildPromotionSourceFingerprint(inputSources), buildPromotionSourceFingerprint({ ...inputSources, legacyHistory: [history("h-1", "task-1", "missed")] }));
});

test("fingerprint and candidate-count drift abort before creating an operation", async () => {
  const inputSources = sources({ legacyHistory: [history("h-drift", "task-1", "done")] });
  const client = new FakeClient();
  await assert.rejects(run(client, inputSources, { confirmSourceFingerprint: "sha256:wrong" }), /EXECUTION_BLOCKED/);
  await assert.rejects(run(client, inputSources, { expectedCandidateCount: 2 }), /EXECUTION_BLOCKED/);
  assert.deepEqual(client.calls, []);
});

test("canonical race is skipped and never overwritten", async () => {
  const inputSources = sources({ legacyHistory: [history("h-race", "task-1", "missed")] });
  const client = new FakeClient();
  client.raceOnNextFactInsert = true;
  const result = await run(client, inputSources);
  assert.equal(result.insertedFacts, 0);
  assert.equal(result.canonicalRaceSkips, 1);
  assert.equal(client.facts[0]?.outcome, "did_my_best");
  assert.equal(client.facts[0]?.source, "manual");
});

test("partial retry reuses operation and does not duplicate facts", async () => {
  const inputSources = sources({ legacyHistory: [history("h-retry", "task-1", "done")] });
  const client = new FakeClient();
  let reloadCount = 0;
  await assert.rejects(run(client, inputSources, {}, async () => {
    reloadCount += 1;
    if (reloadCount === 2) throw new Error("simulated post-insert interruption");
    return { ...inputSources, canonicalFacts: client.facts };
  }), /simulated post-insert interruption/);
  const result = await run(client, inputSources, { expectedCandidateCount: 0 });
  assert.equal(result.insertedFacts, 0);
  assert.equal(result.plannedInserts, 0);
  assert.equal(result.alreadyPresentSkips, 0);
  assert.equal(client.facts.length, 1);
  assert.equal(client.operations[0]?.state, "committed");
});

test("postflight detects missing, wrong-outcome, and bad-source-linkage facts", () => {
  const inputSources = sources({ legacyHistory: [history("h-verify", "task-1", "done")] });
  const report = buildLegacyHistoryPromotionDryRun(inputSources, USER_ID);
  const base = { beforeSources: inputSources, beforeReport: report, operationId: "operation-1", mutationCounts: { operationWrites: 1, factWrites: 1, rewardWrites: 0 as const, taskStateWrites: 0 as const } };
  const missing = verifyLegacyHistoryPromotion({ ...base, afterSources: { ...inputSources, canonicalFacts: [] } });
  assert.equal(missing.ok, false);
  const wrong = verifyLegacyHistoryPromotion({ ...base, afterSources: { ...inputSources, canonicalFacts: [{ ...buildPromotionFactInsert(report.plannedFacts[0]!, "operation-1"), outcome: "missed" }] } });
  assert.match(wrong.issues.join(";"), /outcome/);
  const badLink = verifyLegacyHistoryPromotion({ ...base, afterSources: { ...inputSources, canonicalFacts: [{ ...buildPromotionFactInsert(report.plannedFacts[0]!, "operation-1"), source_legacy_history_id: "other-source" }] } });
  assert.match(badLink.issues.join(";"), /source_legacy_history_id/);
});

test("postflight preserves exclusions and reports zero rewards and Task State writes", () => {
  const inputSources = sources({
    legacyHistory: [history("h-excluded", "task-excluded", "done"), history("h-delayed", "task-delayed", "delayed", "2026-06-21")],
    migrationEntities: [{ user_id: USER_ID, entity_id: "task-excluded", classification: { historyDisposition: "owner_approved_excluded" } }],
  });
  const report = buildLegacyHistoryPromotionDryRun(inputSources, USER_ID);
  const verification = verifyLegacyHistoryPromotion({ beforeSources: inputSources, afterSources: inputSources, beforeReport: report, operationId: "operation-1", mutationCounts: { operationWrites: 0, factWrites: 0, rewardWrites: 0, taskStateWrites: 0 } });
  assert.equal(verification.ok, true);
  assert.equal(verification.rewardWrites, 0);
  assert.equal(verification.taskStateWrites, 0);
});

test("executor source is structurally restricted to the two approved mutation tables", () => {
  const source = readFileSync(resolve("scripts/legacy-history-promotion-execute.ts"), "utf8");
  const mutationCalls = [...source.matchAll(/from\("([^"]+)"\)\.(?:insert|update|delete|upsert|rpc)\(/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(mutationCalls)].sort(), [...APPROVED_EXECUTION_MUTATION_TABLES].sort());
  assert.match(source, /rewardWrites: 0/);
  assert.match(source, /taskStateWrites: 0/);
  assert.doesNotMatch(source, /from\("[^"]*(?:reward|banked|xp|points|token|achievement)[^"]*"\)\.(?:insert|update|delete|upsert|rpc)\(/i);
  assert.doesNotMatch(source, /adhdice_clean_tasks|adhdice_task_occurrences|adhdice_task_schedule_boundaries/);
});
