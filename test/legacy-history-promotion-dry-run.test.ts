import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  buildLegacyHistoryPromotionDryRun,
  emptyPromotionSources,
  loadPromotionSources,
  type PromotionRow,
  type PromotionSources,
} from "../scripts/legacy-history-promotion-dry-run.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function task(id: string, overrides: PromotionRow = {}): PromotionRow {
  return { id, user_id: USER_ID, title: `Task ${id}`, entity_kind: "parent", ...overrides };
}

function history(id: string, taskId: string, status: string, date: string, overrides: PromotionRow = {}): PromotionRow {
  return { id, task_id: taskId, user_id: USER_ID, entry_date: date, status, event_type: status === "complete" ? "completed_permanently" : "status", occurrence_due_on: null, counted_as_due_occurrence: true, ...overrides };
}

function sources(overrides: Partial<PromotionSources> = {}): PromotionSources {
  return {
    ...emptyPromotionSources(),
    tasks: [task("task-done"), task("task-dmb"), task("task-missed"), task("task-complete"), task("task-delayed"), task("task-excluded"), task("task-live-only"), task("task-diverged")],
    profile: { user_id: USER_ID, timezone: "America/New_York", day_start_time: "06:00", settings_revision: 3 },
    ...overrides,
  };
}

test("done, did_my_best, missed, and complete map directly with canonical event kinds", () => {
  const report = buildLegacyHistoryPromotionDryRun(sources({
    legacyHistory: [
      history("h-done", "task-done", "done", "2026-06-20"),
      history("h-dmb", "task-dmb", "did_my_best", "2026-06-21"),
      history("h-missed", "task-missed", "missed", "2026-06-22"),
      history("h-complete", "task-complete", "complete", "2026-06-23"),
    ],
  }), USER_ID, { generatedAt: "2026-08-13T00:00:00.000Z" });
  assert.deepEqual(report.plannedFacts.map((fact) => [fact.outcome, fact.event_kind]).sort(), [
    ["complete", "terminal_complete"],
    ["did_my_best", "explicit_outcome"],
    ["done", "explicit_outcome"],
    ["missed", "explicit_outcome"],
  ]);
  assert.equal(report.plannedFacts.find((fact) => fact.source_legacy_history_id === "h-missed")?.outcome, "missed");
});

test("canonical fact on the same task/date wins whether outcomes agree or conflict", () => {
  const report = buildLegacyHistoryPromotionDryRun(sources({
    legacyHistory: [
      history("h-agree", "task-done", "done", "2026-06-20"),
      history("h-conflict", "task-missed", "missed", "2026-06-22"),
    ],
    canonicalFacts: [
      { id: "c-agree", user_id: USER_ID, entity_id: "task-done", logical_date: "2026-06-20", outcome: "done" },
      { id: "c-conflict", user_id: USER_ID, entity_id: "task-missed", logical_date: "2026-06-22", outcome: "did_my_best" },
    ],
  }), USER_ID);
  assert.equal(report.plannedFacts.length, 0);
  assert.equal(report.candidateCounts.canonicalWins, 2);
  assert.equal(report.canonicalOverlapSummary.agreeingCount, 1);
  assert.equal(report.canonicalOverlapSummary.conflictingCount, 1);
  assert.equal(report.canonicalOverlapSummary.overlaps[1]?.disposition, "CANONICAL_WINS");
});

test("duplicate task/date keys and conflicting legacy statuses are detected", () => {
  const report = buildLegacyHistoryPromotionDryRun(sources({
    legacyHistory: [
      history("h-duplicate-a", "task-done", "done", "2026-06-20"),
      history("h-duplicate-b", "task-done", "done", "2026-06-20"),
      history("h-conflict-a", "task-missed", "missed", "2026-06-22"),
      history("h-conflict-b", "task-missed-2", "done", "2026-06-22"),
    ],
    tasks: [task("task-done"), task("task-missed"), task("task-missed-2")],
  }), USER_ID);
  assert.equal(report.candidateCounts.duplicateTaskDates, 2);
  assert.equal(report.candidateCounts.conflictingLegacyStatuses, 0);
  assert.equal(report.plannedFacts.length, 2);

  const conflicting = buildLegacyHistoryPromotionDryRun(sources({
    legacyHistory: [
      history("h-conflict-a", "task-missed", "missed", "2026-06-22"),
      history("h-conflict-b", "task-missed", "done", "2026-06-22"),
    ],
    tasks: [task("task-missed")],
  }), USER_ID);
  assert.equal(conflicting.candidateCounts.conflictingLegacyStatuses, 2);
  assert.equal(conflicting.plannedFacts.length, 0);
});

test("owner-approved exclusions are reported by stable entity identity with human-review metadata", () => {
  const report = buildLegacyHistoryPromotionDryRun(sources({
    legacyHistory: [
      history("h-excluded-a", "task-excluded", "done", "2026-06-20"),
      history("h-excluded-b", "task-excluded", "missed", "2026-06-21"),
    ],
    migrationEntities: [{ user_id: USER_ID, entity_id: "task-excluded", entity_kind: "parent", state: "needs_attention", classification: { historyDisposition: "owner_approved_excluded", reason: "reviewed" } }],
  }), USER_ID);
  assert.equal(report.candidateCounts.ownerExcluded, 2);
  assert.equal(report.ownerExcludedSummary.entityCount, 1);
  assert.equal(report.ownerExcludedSummary.entities[0]?.entity_id, "task-excluded");
  assert.equal(report.plannedFacts.length, 0);
});

test("live-legacy-only and snapshot divergence are distinct classifications", () => {
  const report = buildLegacyHistoryPromotionDryRun(sources({
    legacyHistory: [
      history("h-live-only", "task-live-only", "done", "2026-06-20"),
      history("h-diverged", "task-diverged", "done", "2026-06-21"),
    ],
    legacyEvidence: [{ source_history_id: "h-diverged", user_id: USER_ID, entity_id: "task-diverged", legacy_entry_date: "2026-06-21", legacy_status: "missed", legacy_event_type: "status" }],
  }), USER_ID);
  assert.equal(report.candidateCounts.liveLegacyOnly, 1);
  assert.equal(report.candidateCounts.snapshotDiverged, 1);
  assert.equal(report.snapshotComparison.SNAPSHOT_DIVERGED, 1);
  assert.equal(report.plannedFacts.length, 1);
  assert.equal(report.plannedFacts[0]?.source_legacy_history_id, "h-live-only");
});

test("delayed history without an exact target is never guessed", () => {
  const report = buildLegacyHistoryPromotionDryRun(sources({
    legacyHistory: [history("h-delayed", "task-delayed", "delayed", "2026-07-01", { occurrence_due_on: "2026-07-01" })],
    tasks: [task("task-delayed", { due_on: "2026-08-30" })],
  }), USER_ID);
  assert.equal(report.candidateCounts.delayedNeedingDecision, 1);
  assert.equal(report.delayedSummary.rows[0]?.exact_effective_due_on_proven, false);
  assert.equal(report.delayedSummary.rows[0]?.effective_due_on, null);
  assert.equal(report.plannedFacts.length, 0);
});

test("planned facts preserve source identity, migration provenance, and zero reward effects", () => {
  const report = buildLegacyHistoryPromotionDryRun(sources({
    legacyHistory: [history("h-source", "task-done", "done", "2026-06-20", { occurrence_due_on: "2026-06-20" })],
  }), USER_ID);
  const fact = report.plannedFacts[0]!;
  assert.equal(fact.source_legacy_history_id, "h-source");
  assert.equal(fact.provenance_kind, "migration_reconstruction");
  assert.equal(fact.actor_kind, "migration");
  assert.equal(fact.command_id, null);
  assert.equal(fact.migration_operation_id, null);
  assert.equal(fact.migration_operation_id_requirement, "required_at_execution");
  assert.equal(fact.occurrence_id, null);
  assert.equal(fact.scheduled_due_on, "2026-06-20");
  assert.equal(report.plannedRewardWrites, 0);
  assert.equal(report.plannedCurrentTaskStateWrites, 0);
  assert.equal(report.plannedWrites, 0);
});

test("counted-as-due bridge preserves an explicit occurrence due date", () => {
  const report = buildLegacyHistoryPromotionDryRun(sources({
    legacyHistory: [history("h-due", "task-done", "done", "2026-06-20", { counted_as_due_occurrence: true, occurrence_due_on: "2026-06-19" })],
  }), USER_ID);
  assert.equal(report.plannedFacts[0]?.scheduled_due_on, "2026-06-19");
});

test("counted-as-due bridge uses entry date when the due date is absent", () => {
  const report = buildLegacyHistoryPromotionDryRun(sources({
    legacyHistory: [history("h-entry", "task-done", "done", "2026-06-20", { counted_as_due_occurrence: true, occurrence_due_on: null })],
  }), USER_ID);
  assert.equal(report.plannedFacts[0]?.scheduled_due_on, "2026-06-20");
});

test("counted-as-due false suppresses compatibility due metadata", () => {
  const withDue = buildLegacyHistoryPromotionDryRun(sources({
    legacyHistory: [history("h-not-due", "task-done", "done", "2026-06-20", { counted_as_due_occurrence: false, occurrence_due_on: "2026-06-19" })],
  }), USER_ID);
  const withoutDue = buildLegacyHistoryPromotionDryRun(sources({
    legacyHistory: [history("h-not-due-2", "task-done", "done", "2026-06-20", { counted_as_due_occurrence: false, occurrence_due_on: null })],
  }), USER_ID);
  assert.equal(withDue.plannedFacts[0]?.scheduled_due_on, null);
  assert.equal(withoutDue.plannedFacts[0]?.scheduled_due_on, null);
});

test("counted-as-due metadata changes do not change candidate eligibility", () => {
  const report = buildLegacyHistoryPromotionDryRun(sources({
    legacyHistory: [
      history("h-1", "task-done", "done", "2026-06-20", { counted_as_due_occurrence: true, occurrence_due_on: "2026-06-20" }),
      history("h-2", "task-dmb", "did_my_best", "2026-06-21", { counted_as_due_occurrence: true, occurrence_due_on: null }),
      history("h-3", "task-missed", "missed", "2026-06-22", { counted_as_due_occurrence: false, occurrence_due_on: "2026-06-22" }),
      history("h-4", "task-complete", "complete", "2026-06-23", { counted_as_due_occurrence: false, occurrence_due_on: null }),
    ],
  }), USER_ID);
  assert.equal(report.candidateCounts.straightforward, 4);
  assert.equal(report.plannedFacts.length, 4);
});

test("results are deterministic independent of input ordering", () => {
  const input = sources({
    legacyHistory: [history("h-b", "task-dmb", "did_my_best", "2026-06-21"), history("h-a", "task-done", "done", "2026-06-20")],
  });
  const reversed: PromotionSources = { ...input, legacyHistory: [...input.legacyHistory].reverse(), tasks: [...input.tasks].reverse() };
  const left = buildLegacyHistoryPromotionDryRun(input, USER_ID, { generatedAt: "2026-08-13T00:00:00.000Z" });
  const right = buildLegacyHistoryPromotionDryRun(reversed, USER_ID, { generatedAt: "2026-08-13T00:00:00.000Z" });
  assert.deepEqual(right, left);
});

test("the planner source has no Supabase mutation calls", () => {
  const source = readFileSync(resolve("scripts/legacy-history-promotion-dry-run.ts"), "utf8");
  for (const method of ["insert", "update", "delete", "upsert", "rpc"]) assert.doesNotMatch(source, new RegExp(`\\.${method}\\s*\\(`));
});

test("the read client exposes only SELECT-shaped table access and the loader invokes no mutation API", async () => {
  const calls: string[] = [];
  const client = {
    from(table: string) {
      calls.push(table);
      const query = {
        select() { return query; },
        eq() { return query; },
        order() { return query; },
        range: async () => ({ data: [], error: null }),
      };
      return query;
    },
  };
  const loaded = await loadPromotionSources(client as never, USER_ID, 10);
  assert.deepEqual(loaded, emptyPromotionSources());
  assert.deepEqual(calls.sort(), [
    "adhdice_clean_tasks",
    "adhdice_task_history",
    "adhdice_task_history_facts",
    "adhdice_task_legacy_history_evidence",
    "adhdice_task_state_migration_entities",
    "adhdice_user_profiles",
  ]);
});
