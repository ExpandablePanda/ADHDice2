import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync("supabase/patch_milestone_canonicalization_7_9_42.sql", "utf8");
const hook = readFileSync("src/hooks/useMilestoneData.ts", "utf8");
const app = readFileSync("src/components/task-app.tsx", "utf8");
const dbTypes = readFileSync("src/lib/database.types.ts", "utf8");
const orchestration = readFileSync("supabase/functions/task-state-command/orchestration.ts", "utf8");
const domain = readFileSync("supabase/functions/task-state-command/domain.ts", "utf8");
const schema = readFileSync("supabase/schema.sql", "utf8");

test("Milestone Task State paths are canonical-backed and metadata atomic", () => {
  assert.match(sql, /adhdice_execute_task_state_command\(p_user_id, p_command\)/);
  assert.match(sql, /surrounding transaction rolls back this canonical command/);
  assert.match(sql, /result_references = result_references \|\| jsonb_build_object/);
  assert.match(sql, /drop constraint if exists adhdice_milestones_lifecycle_check/);
  assert.doesNotMatch(schema, /pre_completion_task_snapshot is not null/);
  assert.match(hook, /invokeTaskStateCommand/);
  assert.match(orchestration, /adhdice_execute_milestone_task_state_command/);
  assert.match(domain, /milestone_operation_id/);
  assert.match(app, /runMilestoneTaskTrash\(task\)/);
  assert.match(app, /trashMilestoneTask\(buildMilestoneLifecycleArgs/);
  assert.doesNotMatch(hook, /client\.rpc\("adhdice_(?:complete|trash|restore)_milestone/);
  assert.doesNotMatch(app, /adhdice_(?:complete|trash|restore)_milestone/);
});

test("Milestones have no legacy Task State or legacy History writer", () => {
  assert.doesNotMatch(sql, /update public\.adhdice_clean_tasks|delete from public\.adhdice_clean_tasks|insert into public\.adhdice_clean_tasks/i);
  assert.doesNotMatch(sql, /adhdice_task_history(?!_facts)/i);
  assert.doesNotMatch(hook, /adhdice_task_history|\.from\("adhdice_clean_tasks"\)/i);
  assert.doesNotMatch(sql, /cascade/i);
});

test("obsolete Milestone Task mutation contracts are removed and deletion is normal", () => {
  for (const name of [
    "adhdice_complete_milestone",
    "adhdice_trash_milestone_task",
    "adhdice_restore_milestone_task",
    "adhdice_delete_milestone_task_permanently",
  ]) {
    assert.match(sql, new RegExp(`drop function if exists public\\.${name}`));
    assert.doesNotMatch(hook, new RegExp(name));
    assert.doesNotMatch(dbTypes, new RegExp(`${name}:`));
  }
  assert.match(app, /deleteTaskRow\(client, taskId, \{ expectedTask \}\)/);
});

test("reverse completion reports the missing canonical reopen capability", () => {
  assert.match(sql, /does not support reopening a permanently Complete Task/);
  assert.match(hook, /does not currently support reopening a permanently Complete Task/);
  assert.doesNotMatch(sql, /pre_completion_task_snapshot\s*->|jsonb_populate_record/);
});
