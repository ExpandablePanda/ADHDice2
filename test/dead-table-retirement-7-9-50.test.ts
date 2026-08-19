import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read("supabase/retire_dead_tables_and_legacy_plumbing_7_9_50.sql");
const productionSources = [
  read("src/hooks/useWorkspaceData.ts"),
  read("src/hooks/useTaskRewardController.ts"),
  read("src/hooks/useFocus.ts"),
  read("src/hooks/useTaskSubtaskActions.ts"),
  read("src/hooks/useAchievements.ts"),
  read("src/lib/database.types.ts"),
];

test("production runtime has no approved dead-table or retired-RPC references", () => {
  const source = productionSources.join("\n");
  assert.doesNotMatch(source, /adhdice_(?:task_subtasks|legacy_subtask_promotions|focus_counter_migrations|achievement_unlocks|roll_board_assignments|roll_master_prizes)/);
  assert.doesNotMatch(source, /adhdice_(?:migrate_pending_reward_dice|migrate_focus_counters|award_pending_reward_dice)/);
});

test("forward cleanup is explicit, ordered, and never cascades", () => {
  assert.doesNotMatch(migration, /\bcascade\b/i);
  assert.match(migration, /drop function if exists public\.adhdice_award_pending_reward_dice/);
  assert.match(migration, /drop function if exists public\.adhdice_migrate_pending_reward_dice/);
  assert.match(migration, /alter table public\.adhdice_task_reward_claims drop column if exists subtask_id/);
  const firstTableDrop = migration.indexOf("drop table if exists");
  assert.ok(firstTableDrop > migration.indexOf("drop policy if exists"));
  for (const table of [
    "adhdice_achievement_unlocks",
    "adhdice_roll_board_assignments",
    "adhdice_roll_master_prizes",
    "adhdice_task_subtasks",
    "adhdice_legacy_subtask_promotions",
    "adhdice_focus_counter_migrations",
  ]) {
    assert.match(migration, new RegExp(`drop table if exists public\\.${table}`));
  }
});

test("canonical claim remains current and tolerates deleted source Tasks", () => {
  const claim = migration.slice(migration.indexOf("create or replace function public.adhdice_claim_pending_reward_dice"), migration.indexOf("drop function if exists public.adhdice_award_pending_reward_dice"));
  assert.match(claim, /from public\.adhdice_clean_tasks task/);
  assert.match(claim, /insert into public\.adhdice_task_reward_rolls/);
  assert.match(claim, /update public\.adhdice_pending_reward_dice_items/);
  assert.doesNotMatch(claim, /adhdice_task_subtasks|subtask_id/);
});

test("canonical parent, Step, and Substep rewards keep actual entity task IDs", () => {
  const bridge = read("supabase/add_canonical_reward_entitlement_bridge.sql");
  assert.match(bridge, /'taskId', v_task\.id/);
  assert.match(bridge, /'subtaskId', null/);
  assert.doesNotMatch(bridge, /adhdice_task_subtasks|adhdice_legacy_subtask_promotions/);
});

test("Focus hydrates current counters/events without migration bootstrap", () => {
  const focus = read("src/hooks/useFocus.ts");
  assert.match(focus, /from\("adhdice_focus_counters"\)/);
  assert.match(focus, /from\("adhdice_focus_counter_events"\)/);
  assert.doesNotMatch(focus, /adhdice_migrate_focus_counters|migrateThenHydrate/);
});
