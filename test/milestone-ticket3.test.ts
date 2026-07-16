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

const sql = readFileSync(new URL("../supabase/add_milestone_lifecycle.sql", import.meta.url), "utf8");
const taskApp = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");

function milestone(overrides: Partial<Milestone> = {}): Milestone {
  return { id: "m1", user_id: "u1", task_id: "t1", task_title_snapshot: "Goal", revision: 1, status: "active", task_trashed_at: null, last_restored_at: null, rules_version: "v1", questions_version: "v1", answers_snapshot: {}, recommendation_snapshot: {}, recommended_tier: "gold", recommended_target_date: "2026-07-20", allowed_target_date_min: "2026-07-17", allowed_target_date_max: "2026-08-01", deadline_kind: "none", external_deadline: null, feasibility_warning: null, rules_explanation: "x", initial_locked_tier: "gold", initial_locked_target_date: "2026-07-20", initial_aura_deadline: "2026-07-23", current_tier: "gold", current_target_date: "2026-07-20", current_aura_deadline: "2026-07-23", tier_raise_explanation: null, setup_correction_used: false, setup_corrected_at: null, completion_timezone: "America/New_York", completion_timing: null, completion_date_key: null, pre_completion_task_snapshot: null, trophy_awarded_at: null, trophy_revoked_at: null, aura_kind: null, aura_awarded_at: null, aura_revoked_at: null, abandoned_at: null, abandonment_reason: null, promoted_at: "2026-07-16T00:00:00Z", locked_at: "2026-07-16T00:00:00Z", completed_at: null, reversed_at: null, created_at: "2026-07-16T00:00:00Z", updated_at: "2026-07-16T00:00:00Z", ...overrides };
}

function task(overrides: Partial<Task> = {}): Task {
  return { id: "t1", user_id: "u1", parent_task_id: null, revision: 4, title: "Goal", notes: null, status: "pending", priority: "normal", priority_level: 0, energy: "none", is_urgent: false, is_important: false, due_on: "2026-07-20", active_status_logical_date: null, active_occurrence_due_on: null, scheduled_on: null, due_time: null, estimated_minutes: null, actual_seconds: 0, tags: [], external_link_label: null, external_link_url: null, one_step_at_a_time: false, subtasks_auto_reset: false, repeat_frequency: "none", repeat_interval: 1, repeat_days_of_week: [], repeat_day_of_month: null, repeat_monthly_mode: "day_of_month", repeat_monthly_ordinal: null, repeat_monthly_weekday: null, pinned_at: null, pin_order: null, sort_order: 0, completed_at: null, trashed_at: null, created_at: "2026-07-16T00:00:00Z", updated_at: "2026-07-16T00:00:00Z", ...overrides };
}

test("completion RPC contract keeps timing and awards authoritative", () => {
  assert.match(sql, /adhdice_complete_milestone\([\s\S]*p_expected_task_revision[\s\S]*p_expected_milestone_revision[\s\S]*p_operation_id/);
  assert.match(sql, /at time zone v_milestone\.completion_timezone/);
  assert.doesNotMatch(sql, /p_completion_date|p_aura_kind|p_completion_timing/);
});
test("target day is on time", () => assert.equal(classifyMilestoneLifecycleTiming("2026-07-20", "2026-07-20", "2026-07-23"), "on_time"));
for (const day of [21, 22, 23]) test(`grace day ${day - 20} is grace period`, () => assert.equal(classifyMilestoneLifecycleTiming(`2026-07-${day}`, "2026-07-20", "2026-07-23"), "grace_period"));
test("fourth day is late", () => assert.equal(classifyMilestoneLifecycleTiming("2026-07-24", "2026-07-20", "2026-07-23"), "late"));
test("standard Aura applies to non-Platinum eligible completion", () => assert.equal(getLifecycleMilestoneAuraKind("gold", "grace_period"), "standard"));
test("Platinum receives Diamond Aura", () => assert.equal(getLifecycleMilestoneAuraKind("platinum", "on_time"), "diamond"));
test("late completion has no aura", () => assert.equal(getLifecycleMilestoneAuraKind("platinum", "late"), "none"));
test("completion replay checks operation identity before locking rows", () => assert.ok(sql.indexOf("event_type in ('completed_on_time'") < sql.indexOf("where id = p_task_id for update")));
test("award and completion event uniqueness prevent replay duplicates", () => assert.match(sql, /unique \(user_id, operation_id, event_type\)|Ticket 1 foundation/));
test("existing descendant and timed-completion prerequisites remain before the RPC", () => {
  assert.ok(taskApp.indexOf("canTaskBeMarkedComplete") < taskApp.indexOf("milestoneData.completeMilestone"));
  assert.ok(taskApp.indexOf("stageTimedTaskCompletion") < taskApp.indexOf("milestoneData.completeMilestone"));
});
test("ordinary non-Milestone Complete keeps the guarded row update", () => assert.match(taskApp, /const completeUpdateValues[\s\S]*runGuardedTaskRowUpdate/));
test("ordinary reward remains single existing queue with no Milestone bonus", () => {
  assert.match(taskApp, /queueTaskRewards\(\[\{ previousStatus: task\.status, task: completedTask \}\]\)/);
  assert.match(sql, /'bonus_xp', 0, 'bonus_dice_rolls', 0/);
});
test("Daily Until Complete snapshot stores full task row and restoration fields", () => {
  assert.match(sql, /jsonb_build_object\('task', to_jsonb\(v_task\), 'history'/);
  assert.match(sql, /repeat_monthly_ordinal = v_restore\.repeat_monthly_ordinal/);
});
test("reversal revokes awards and preserves locked dates", () => {
  assert.match(sql, /trophy_revoked_at = v_now/);
  const reverseBody = sql.slice(sql.indexOf("adhdice_reverse_milestone_completion"), sql.indexOf("adhdice_abandon_milestone"));
  assert.doesNotMatch(reverseBody, /current_target_date\s*=/);
});
test("re-completion classifies against original current locked dates", () => assert.match(sql, /v_completion_date <= v_milestone\.current_target_date/));
test("abandonment grants no award", () => assert.doesNotMatch(sql.slice(sql.indexOf("adhdice_abandon_milestone"), sql.indexOf("adhdice_trash_milestone_task")), /award_granted|trophy_awarded_at/));
test("active Trash hides without pausing dates", () => assert.match(sql, /set task_trashed_at=v_now,revision=revision\+1/));
test("restore recreates only future reminders", () => assert.match(sql, /where s\.scheduled_date>=v_local_date/));
test("completed trophy survives Trash", () => assert.doesNotMatch(sql.slice(sql.indexOf("adhdice_trash_milestone_task"), sql.indexOf("adhdice_restore_milestone_task")), /status='abandoned'|trophy_awarded_at=/));
test("completed trophy survives physical deletion through nullable task FK", () => assert.match(sql, /delete from public\.adhdice_clean_tasks/));
test("active permanent deletion abandons its Milestone", () => assert.match(sql, /if v_milestone\.status='active'[\s\S]*status='abandoned'[\s\S]*task_deleted_permanently/));
test("active membership follows completion, reversal, abandonment, Trash, and restore", () => {
  const active = milestone();
  assert.equal(getCompletedMilestones([active]).length, 0);
  assert.equal(getCompletedMilestones([{ ...active, status: "completed" }]).length, 1);
});
test("Completed Milestones includes null task IDs", () => assert.equal(getCompletedMilestones([milestone({ status: "completed", task_id: null })]).length, 1));
test("Realtime and RPC merges remain revision-deduplicated", () => {
  assert.equal(mergeMilestoneRows([milestone({ revision: 2 })], milestone({ revision: 1 }))[0]!.revision, 2);
  assert.equal(mergeAuthoritativeMilestoneTask([task({ revision: 5 })], task({ revision: 4 }))[0]!.revision, 5);
});
test("known lifecycle RPC errors map to readable UI messages", () => assert.equal(formatMilestoneRpcError("Valid pre-completion task snapshot is required"), "This completion cannot be undone because its restore snapshot is unavailable."));
test("lifecycle arguments include both expected revisions and one operation ID", () => assert.deepEqual(buildMilestoneLifecycleArgs(task(), milestone(), "op"), { p_expected_milestone_revision: 1, p_expected_task_revision: 4, p_milestone_id: "m1", p_operation_id: "op", p_task_id: "t1" }));
