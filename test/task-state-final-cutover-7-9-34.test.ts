import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createTask } from "../src/lib/task-buckets.ts";
import { buildDirectTaskStateEngineInput, CanonicalTaskStateBoundaryRequiredError } from "../src/lib/task-state-engine/direct-input.ts";
import type { CanonicalTaskScheduleBoundary } from "../src/lib/task-state-canonical/types.ts";

const preview = readFileSync(new URL("../supabase/preview_task_state_canonical_initialization_7_9_34.sql", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrate_task_state_canonical_initialization_7_9_34.sql", import.meta.url), "utf8");
const verifier = readFileSync(new URL("../supabase/verify_task_state_canonical_initialization_7_9_34.sql", import.meta.url), "utf8");

const CONTEXT = { now: "2026-08-18T12:00:00.000Z", timezone: "UTC", logicalDayRollover: "00:00" };

function boundary(taskId: string, model: CanonicalTaskScheduleBoundary["schedule_model"]): CanonicalTaskScheduleBoundary {
  return {
    id: `${taskId}:boundary`, user_id: "user-1", entity_id: taskId, entity_kind: "parent",
    effective_from_logical_date: "2026-08-18", boundary_sequence: 1, boundary_type: "initial",
    schedule_model: model, repeat_frequency: model === "unscheduled" ? "none" : "daily", repeat_interval: 1,
    repeat_days_of_week: [], repeat_day_of_month: null, repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null, repeat_monthly_weekday: null, one_time_due_on: null, due_time: null,
    anchor_date: model === "unscheduled" ? null : "2026-08-18", anchor_kind: model === "unscheduled" ? "unknown" : "migration_prospective",
    anchor_confidence: model === "unscheduled" ? "unavailable" : "high_confidence", historical_scope_known: false,
    prospective_only: true, prior_boundary_id: null, affected_occurrence_id: null, logical_day_settings_revision: 1,
    timezone: "UTC", day_start_time: "00:00", actor_kind: "migration", actor_id: null,
    source: "test", command_id: null, idempotence_identity: `${taskId}:boundary`, migration_operation_id: null,
    migration_version: "test", classifier_version: "test", schema_contract_version: "task-state-schema-v1",
    source_task_revision: 1, revision: 1, created_at: "2026-08-18T12:00:00.000Z", updated_at: "2026-08-18T12:00:00.000Z",
  };
}

function canonicalTask(overrides: Record<string, unknown> = {}) {
  return {
    ...createTask({ id: "task-1", title: "Cutover", status: "in_progress", due_on: "2026-08-17", repeat_frequency: "daily" }),
    canonicalization_status: "canonical_proven",
    entity_kind: "parent",
    terminal_state: "active",
    container_state: "active",
    prior_container_state: null,
    prior_container_state_status: "not_applicable",
    workflow_state: "none",
    workflow_revision: 1,
    canonical_revision: 1,
    ...overrides,
  };
}

test("active canonical Task State fails closed when the schedule boundary is missing", () => {
  assert.throws(
    () => buildDirectTaskStateEngineInput(canonicalTask(), [], CONTEXT),
    (error: unknown) => error instanceof CanonicalTaskStateBoundaryRequiredError
      && error.code === "CANONICAL_SCHEDULE_BOUNDARY_REQUIRED",
  );
});

test("initialized canonical lifecycle ignores stale raw In Progress status", () => {
  const input = buildDirectTaskStateEngineInput(
    canonicalTask({ status: "in_progress", canonical_schedule_boundary: boundary("task-1", "unscheduled") }),
    [],
    CONTEXT,
  );
  assert.equal(input.task.activeStatus, "pending");
});

test("initialized canonical schedule ignores stale raw repeat and due fields", () => {
  const input = buildDirectTaskStateEngineInput(
    canonicalTask({ due_on: "2026-08-17", repeat_frequency: "daily", canonical_schedule_boundary: boundary("task-1", "unscheduled") }),
    [],
    CONTEXT,
  );
  assert.equal(input.task.dueOn, null);
  assert.deepEqual(input.task.recurrence, { kind: "none" });
});

test("7.9.34 initialization artifacts are dynamic, prospective, side-effect-free, and rerunnable", () => {
  for (const sql of [preview, migration]) {
    assert.doesNotMatch(sql, /\bparent_task\./i, "7.9.34 SQL must use the joined parent alias");
    assert.match(sql, /left join public\.adhdice_clean_tasks parent\b/i);
    assert.match(sql, /parent\.id/i);
    assert.match(sql, /parent\.parent_task_id/i);
  }
  assert.match(preview, /where task\.canonicalization_status = 'legacy_uninitialized'/i);
  assert.match(migration, /where task\.canonicalization_status = 'legacy_uninitialized'/i);
  assert.match(migration, /status::text not in \('complete', 'archived', 'trashed'\)/i);
  assert.match(migration, /operation_identity = v_operation_identity/i);
  assert.match(migration, /exists \([\s\S]*adhdice_task_schedule_boundaries boundary/i);
  assert.match(migration, /current-task-schedule-v1/i);
  assert.match(migration, /workflow_state = 'none'/i);
  assert.match(migration, /workflow_logical_date = null/i);
  assert.match(migration, /workflow_occurrence_id = null/i);
  assert.doesNotMatch(migration, /insert into public\.adhdice_task_history_facts\s*\(/i);
  assert.doesNotMatch(migration, /insert into public\.adhdice_task_occurrences\s*\(/i);
  assert.doesNotMatch(migration, /insert into public\.adhdice_task_reward_entitlements\s*\(/i);
  assert.doesNotMatch(migration, /\b25\b/);
  for (const metric of [
    "remaining_active_legacy_uninitialized_violations",
    "active_canonical_missing_boundary_violations",
    "initialized_canonical_semantics_violations",
    "migration_history_violations",
    "migration_reward_violations",
    "overall_status",
  ]) assert.match(verifier, new RegExp(metric));
  assert.match(verifier, /initialized_tasks as \([\s\S]*join initialized_operations operation[\s\S]*operation\.entity_id = task\.id/i);
  assert.match(verifier, /\(select count\(\*\) from initialized_tasks task[\s\S]*initialized_canonical_semantics_violations/i);
  assert.match(verifier, /\(select count\(\*\) from canonical_active task[\s\S]*active_canonical_missing_boundary_violations/i);
  assert.doesNotMatch(verifier.replace(/--[^\n]*/g, ""), /\b(insert|update|delete|alter|drop|truncate)\b/i);
});

test("7.9.36 verifier disambiguates the monthly weekday source", () => {
  const migrationBoundaries = verifier.match(/migration_boundaries as \([\s\S]*?\), schedule_translation as \(/i)?.[0] ?? "";
  const scheduleTranslation = verifier.match(/schedule_translation as \([\s\S]*?\), metrics as \(/i)?.[0] ?? "";

  assert.match(migrationBoundaries, /task\.repeat_monthly_weekday\s+as\s+raw_repeat_monthly_weekday,\s*boundary\.\*/i);
  assert.doesNotMatch(migrationBoundaries, /task\.repeat_monthly_weekday\s*,\s*boundary\.\*/i);
  assert.match(scheduleTranslation, /repeat_monthly_weekday\s+is\s+not\s+distinct\s+from\s+case\s+when\s+raw_repeat_monthly_mode\s*=\s*'ordinal_weekday'\s+then\s+raw_repeat_monthly_weekday\s+else\s+null\s+end/i);
  assert.doesNotMatch(scheduleTranslation, /then\s+repeat_monthly_weekday\s+else/i);
});

test("7.9.37 initialization aliases the raw monthly weekday before normalized expansion", () => {
  for (const sql of [preview, migration]) {
    const rawCandidates = sql.match(/raw_candidates as \([\s\S]*?\), normalized as \(/i)?.[0] ?? "";
    const normalized = sql.match(/normalized as \([\s\S]*?\n\s*from raw_candidates candidate\s*\)/i)?.[0] ?? "";

    assert.match(rawCandidates, /task\.repeat_monthly_weekday\s+as\s+raw_repeat_monthly_weekday\s*,/i);
    assert.doesNotMatch(rawCandidates, /task\.repeat_monthly_weekday\s*,/i);
    assert.match(normalized, /candidate\.\*[\s\S]*candidate\.raw_repeat_monthly_weekday[\s\S]*as repeat_monthly_weekday/i);
    assert.equal(normalized.match(/\bas repeat_monthly_weekday\b/gi)?.length, 1);
    assert.doesNotMatch(normalized, /candidate\.repeat_monthly_weekday\b/i);
  }
});
