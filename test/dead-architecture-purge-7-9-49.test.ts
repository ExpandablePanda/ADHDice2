import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/purge_dead_architecture_7_9_49.sql");
const productionSources = [
  read("src/components/task-app.tsx"),
  read("src/hooks/useWorkspaceData.ts"),
  read("src/hooks/useTaskTimers.ts"),
  read("src/lib/on-time-planner.ts"),
  read("src/lib/task-state-canonical/read-model.ts"),
  read("src/lib/record-repository.ts"),
  read("src/components/task-app/task-report-workspace.tsx"),
  read("scripts/local-qa-session-handler.ts"),
].join("\n");

test("7.9.49 purge is explicit, non-cascading, and preserves provenance", () => {
  assert.match(migration, /(?:^|\n)begin;/);
  assert.match(migration, /commit;\s*$/);
  assert.doesNotMatch(migration, /\bcascade\b/i);
  for (const table of [
    "adhdice_task_history",
    "adhdice_task_actual_time_entries",
    "adhdice_task_legacy_history_evidence",
    "adhdice_task_state_migrations",
    "adhdice_task_state_migration_entities",
    "adhdice_task_state_migration_issues",
    "adhdice_task_state_migration_schema_contract",
    "adhdice_prize_board",
    "user_tasks",
    "user_focus",
    "user_dice",
    "user_notes",
    "user_economy",
  ]) {
    assert.match(migration, new RegExp(`drop table if exists public\\.${table};`));
  }
  for (const fn of [
    "adhdice_link_inserted_task_duration_evidence",
    "adhdice_link_task_duration_evidence",
    "adhdice_link_task_timer_duration_evidence",
    "adhdice_capture_task_history_occurrence",
    "adhdice_migration_backfill_entity",
    "adhdice_migration_finalize_user",
    "adhdice_rollback_legacy_history_promotion",
  ]) {
    assert.match(migration, new RegExp(`drop (?:function|trigger) if exists[^;]*${fn}`));
  }
});

test("current production paths cannot reintroduce retired runtime architecture", () => {
  assert.doesNotMatch(productionSources, /adhdice_task_history\b/);
  assert.doesNotMatch(productionSources, /adhdice_task_actual_time_entries/);
  assert.doesNotMatch(productionSources, /completion_history_id|TaskActualTimeEntry|task-duration-(?:evidence|statistics)|adhdice_migration_(?:backfill_entity|finalize_user)/);
  assert.doesNotMatch(productionSources, /adhdice_rollback_legacy_history_promotion/);
  assert.match(productionSources, /adhdice_task_history_facts/);
  assert.match(productionSources, /adhdice_task_active_timers/);
  assert.match(read("src/hooks/useEconomy.ts"), /adhdice_task_events/);
  assert.match(read("src/components/task-app/roll-page.tsx"), /adhdice_vault_prizes/);
  for (const table of ["user_tasks", "user_focus", "user_dice", "user_notes", "user_economy", "adhdice_prize_board"]) {
    assert.doesNotMatch(productionSources, new RegExp(table));
  }
});

test("canonical History and timer contracts remain wired", () => {
  assert.match(read("src/hooks/useWorkspaceData.ts"), /from\("adhdice_task_history_facts"\)/);
  assert.match(read("src/lib/record-repository.ts"), /from\("adhdice_task_history_facts"\)/);
  assert.match(read("src/components/task-app/task-report-workspace.tsx"), /from\("adhdice_task_history_facts"\)/);
  assert.match(read("src/components/task-app.tsx"), /async function recordStoppedTaskTimer/);
  assert.match(read("src/components/task-app.tsx"), /actual_seconds: nextActualSeconds/);
  assert.doesNotMatch(read("supabase/schema.sql"), /adhdice_task_history\b/);
  assert.doesNotMatch(read("supabase/schema.sql"), /adhdice_task_actual_time_entries/);
  assert.match(read("supabase/schema.sql"), /adhdice_task_history_facts/);
});
