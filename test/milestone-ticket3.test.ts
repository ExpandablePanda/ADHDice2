import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Milestone, Task } from "@/lib/database.types";
import {
  buildMilestoneLifecycleArgs,
  classifyMilestoneLifecycleTiming,
  formatMilestoneRpcError,
  getCompletedMilestones,
  getLifecycleMilestoneAuraKind,
  mergeAuthoritativeMilestoneTask,
  mergeMilestoneRows,
} from "../src/lib/milestones/index.ts";

const sql = readFileSync(new URL("../supabase/patch_milestone_canonicalization_7_9_42.sql", import.meta.url), "utf8");
const foundation = readFileSync(new URL("../supabase/add_milestones_foundation.sql", import.meta.url), "utf8");
const taskApp = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const milestoneHook = readFileSync(new URL("../src/hooks/useMilestoneData.ts", import.meta.url), "utf8");

function milestone(overrides: Partial<Milestone> = {}): Milestone {
  return { id: "m1", user_id: "u1", task_id: "t1", task_title_snapshot: "Goal", revision: 1, status: "active", task_trashed_at: null, last_restored_at: null, rules_version: "v1", questions_version: "v1", answers_snapshot: {}, recommendation_snapshot: {}, recommended_tier: "gold", recommended_target_date: "2026-07-20", allowed_target_date_min: "2026-07-17", allowed_target_date_max: "2026-08-01", deadline_kind: "none", external_deadline: null, feasibility_warning: null, rules_explanation: "x", initial_locked_tier: "gold", initial_locked_target_date: "2026-07-20", initial_aura_deadline: "2026-07-23", current_tier: "gold", current_target_date: "2026-07-20", current_aura_deadline: "2026-07-23", tier_raise_explanation: null, setup_correction_used: false, setup_corrected_at: null, completion_timezone: "America/New_York", completion_timing: null, completion_date_key: null, pre_completion_task_snapshot: null, trophy_awarded_at: null, trophy_revoked_at: null, aura_kind: null, aura_awarded_at: null, aura_revoked_at: null, abandoned_at: null, abandonment_reason: null, promoted_at: "2026-07-16T00:00:00Z", locked_at: "2026-07-16T00:00:00Z", completed_at: null, reversed_at: null, created_at: "2026-07-16T00:00:00Z", updated_at: "2026-07-16T00:00:00Z", ...overrides };
}

function task(overrides: Partial<Task> = {}): Task {
  return { id: "t1", user_id: "u1", parent_task_id: null, revision: 4, title: "Goal", notes: null, status: "pending", priority: "normal", priority_level: 0, energy: "none", is_urgent: false, is_important: false, due_on: "2026-07-20", active_status_logical_date: null, active_occurrence_due_on: null, scheduled_on: null, due_time: null, estimated_minutes: null, actual_seconds: 0, tags: [], external_link_label: null, external_link_url: null, one_step_at_a_time: false, subtasks_auto_reset: false, repeat_frequency: "none", repeat_interval: 1, repeat_days_of_week: [], repeat_day_of_month: null, repeat_monthly_mode: "day_of_month", repeat_monthly_ordinal: null, repeat_monthly_weekday: null, pinned_at: null, pin_order: null, sort_order: 0, completed_at: null, trashed_at: null, created_at: "2026-07-16T00:00:00Z", updated_at: "2026-07-16T00:00:00Z", ...overrides };
}

test("Milestone promotion remains limited to canonical parent Tasks", () => {
  assert.match(foundation, /v_task\.entity_kind is distinct from 'parent'/);
  assert.match(foundation, /v_task\.parent_task_id is not null/);
  assert.doesNotMatch(foundation, /entity_kind\s*=\s*'milestone'/i);
});

test("completion uses the canonical executor and commits only metadata afterward", () => {
  assert.match(sql, /adhdice_execute_task_state_command\(p_user_id, p_command\)/);
  assert.match(sql, /v_command_type not in \('complete_task', 'trash_task', 'restore_task'\)/);
  assert.match(sql, /status = 'completed'[\s\S]*trophy_awarded_at/);
  assert.match(sql, /bonus_xp.*0.*bonus_dice_rolls.*0/);
  assert.doesNotMatch(sql, /adhdice_task_history(?!_facts)/i);
  assert.doesNotMatch(sql, /update public\.adhdice_clean_tasks|delete from public\.adhdice_clean_tasks|insert into public\.adhdice_clean_tasks/i);
});

test("Trash and Restore use canonical lifecycle commands with atomic Milestone metadata", () => {
  assert.match(sql, /v_command_type = 'trash_task'/);
  assert.match(sql, /v_command_type = 'restore_task'/);
  assert.match(sql, /container_state is distinct from 'trashed'/);
  assert.match(sql, /container_state is distinct from 'active'/);
  assert.match(sql, /where schedule\.scheduled_date >= v_local_date/);
  assert.doesNotMatch(milestoneHook, /rpc\("adhdice_(?:complete|trash|restore)_milestone/);
  assert.match(taskApp, /milestoneData\.restoreMilestoneTask/);
});

test("Permanent deletion uses the normal Task authority and preserves nullable Milestone identity", () => {
  assert.doesNotMatch(milestoneHook, /deleteMilestoneTaskPermanently|adhdice_delete_milestone_task_permanently/);
  assert.doesNotMatch(taskApp, /deleteMilestoneTaskPermanently|adhdice_delete_milestone_task_permanently/);
  assert.match(taskApp, /deleteTaskRow\(client, taskId, \{ expectedTask \}\)/);
  assert.match(readFileSync(new URL("../supabase/add_milestones_foundation.sql", import.meta.url), "utf8"), /task_id uuid references public\.adhdice_clean_tasks\(id\) on delete set null/i);
});

test("reverse completion fails closed because canonical reopen is not available", () => {
  assert.match(sql, /does not support reopening a permanently Complete Task/);
  assert.doesNotMatch(sql, /jsonb_populate_record\(null::public\.adhdice_clean_tasks/);
  assert.doesNotMatch(sql, /adhdice_task_history(?!_facts)/i);
  assert.match(milestoneHook, /does not currently support reopening a permanently Complete Task/);
});

test("Milestone metadata and historical rows remain independently preserved", () => {
  assert.match(foundation, /on delete set null/i);
  assert.match(foundation, /recommendation_snapshot/);
  assert.match(foundation, /current_tier/);
  assert.match(foundation, /adhdice_milestone_reminders/);
  assert.match(foundation, /adhdice_milestone_events/);
});

test("existing Milestone timing, awards, correction, and merge behavior remains covered", () => {
  assert.equal(classifyMilestoneLifecycleTiming("2026-07-20", "2026-07-20", "2026-07-23"), "on_time");
  assert.equal(classifyMilestoneLifecycleTiming("2026-07-24", "2026-07-20", "2026-07-23"), "late");
  assert.equal(getLifecycleMilestoneAuraKind("platinum", "on_time"), "diamond");
  assert.equal(getLifecycleMilestoneAuraKind("gold", "late"), "none");
  assert.equal(getCompletedMilestones([milestone({ status: "completed" })]).length, 1);
  assert.equal(mergeMilestoneRows([milestone({ revision: 2 })], milestone({ revision: 1 }))[0]!.revision, 2);
  assert.equal(mergeAuthoritativeMilestoneTask([task({ revision: 5 })], task({ revision: 4 }))[0]!.revision, 5);
  assert.equal(formatMilestoneRpcError("Milestone revision conflict"), "This task changed elsewhere. Refresh its details and try again.");
  assert.deepEqual(buildMilestoneLifecycleArgs(task(), milestone(), "op"), { p_expected_milestone_revision: 1, p_expected_task_revision: 4, p_milestone_id: "m1", p_operation_id: "op", p_task_id: "t1" });
});
