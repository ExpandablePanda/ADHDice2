import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/retire_goal_task_type_7_13_61.sql", import.meta.url), "utf8");
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

test("7.13.61 Goal retirement is transactional and refuses unexpected data", () => {
  assert.match(migration, /(?:^|\n)begin;/i);
  assert.match(migration, /goal_count bigint[\s\S]*where task_type = 'goal'[\s\S]*if goal_count <> 1/i);
  assert.match(migration, /title = 'Test'[\s\S]*status = 'trashed'/i);
  assert.match(migration, /no Goal data was deleted/i);
  assert.match(migration, /create temporary table adhdice_retired_goal_tasks[\s\S]*user_id uuid[\s\S]*task_id uuid/i);
  assert.doesNotMatch(migration, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  assert.doesNotMatch(migration, /set task_type\s*=\s*'task'|set task_type\s*=\s*'custom'/i);
  assert.match(migration, /notify pgrst, 'reload schema';[\s\S]*commit;\s*$/i);
});

test("7.13.61 removes Goal dependencies in the proven constraint-safe order", () => {
  const orderedSeams = [
    "set workflow_occurrence_id = null",
    "delete from public.adhdice_task_occurrence_effective_overrides",
    "delete from public.adhdice_task_calendar_overrides",
    "delete from public.adhdice_task_reward_claim_consumptions",
    "delete from public.adhdice_task_reward_grants",
    "delete from public.adhdice_task_reward_entitlements",
    "set resolved_history_id = null",
    "set affected_occurrence_id = null",
    "delete from public.adhdice_task_history_facts",
    "delete from public.adhdice_task_occurrences occurrence",
    "delete from public.adhdice_task_schedule_boundaries boundary",
    "delete from public.adhdice_task_command_operations",
    "delete from public.adhdice_clean_tasks task",
  ];
  let previousIndex = -1;
  for (const seam of orderedSeams) {
    const nextIndex = migration.indexOf(seam);
    assert.ok(nextIndex > previousIndex, `${seam} must follow the prior dependency cleanup`);
    previousIndex = nextIndex;
  }
  const profileCleanup = migration.indexOf("delete from public.adhdice_task_type_behavior_profiles");
  const selectionCleanup = migration.indexOf("delete from public.adhdice_task_behavior_selections\nwhere task_type = 'goal'");
  const taskDelete = migration.indexOf("delete from public.adhdice_clean_tasks task");
  assert.ok(profileCleanup > taskDelete);
  assert.ok(selectionCleanup > taskDelete);
  assert.match(migration, /order by boundary\.user_id, boundary\.entity_id, boundary\.boundary_sequence desc/);
  assert.match(migration, /update public\.adhdice_task_focus_days focus[\s\S]*unnest\(focus\.task_ids\)/i);
  assert.match(migration, /adhdice_task_events|adhdice_task_reward_claims|adhdice_task_active_timers|adhdice_scratch_note_task_links/i);
});

test("7.13.61 preserves ordinary Tasks, named Custom Task Types, and Milestones", () => {
  assert.doesNotMatch(migration, /adhdice_custom_behavior_rulesets|adhdice_custom_behavior_ruleset_revisions/i);
  assert.doesNotMatch(migration, /milestone|trophy|aura/i);
  assert.match(migration, /non-Goal child as an ordinary Task/i);
  assert.match(migration, /where target\.user_id = child\.user_id[\s\S]*target\.task_id = child\.parent_task_id/i);
  assert.match(migration, /where target\.user_id = task\.user_id and target\.task_id = task\.id/i);
});

test("7.13.61 tightens current Task Type constraints and keeps the Custom invariant", () => {
  assert.match(migration, /check \(task_type in \('task', 'custom'\)\)/i);
  assert.match(migration, /task_type = 'custom' and custom_ruleset_id is not null[\s\S]*task_type = 'task' and custom_ruleset_id is null/i);
  assert.match(migration, /no Goal data was deleted[\s\S]*do \$postconditions\$/i);
  for (const table of ["adhdice_clean_tasks", "adhdice_task_type_behavior_profiles", "adhdice_task_behavior_selections"]) {
    assert.match(schema, new RegExp(`${table}[\\s\\S]*task_type in \\('task', 'custom'\\)`, "i"));
  }
  assert.match(schema, /if new\.task_type not in \('task', 'custom'\)/i);
  assert.match(migration, /no Goal data was deleted[\s\S]*no Goal data was deleted[\s\S]*do \$postconditions\$/i);
  assert.match(migration, /left task_type=goal Task rows behind/);
  assert.match(migration, /left task_type=goal behavior profile rows behind/);
  assert.match(migration, /left task_type=goal behavior selection rows behind/);
});
