import assert from "node:assert/strict";
import test from "node:test";
import type { Milestone, MilestoneEvent, Task } from "@/lib/database.types";
import { createTask } from "@/lib/task-buckets";
import { DEFAULT_TASK_UI_STATE } from "@/lib/task-ui-state";
import { getBuiltInTaskLists } from "@/lib/task-lists";
import { generateTaskReport } from "@/lib/task-report";
import {
  buildHomeMilestoneDashboard,
  buildMilestoneEventOccurredAtRange,
  buildMilestoneReportSummary,
  classifyActiveMilestoneTiming,
  formatMilestoneDisplayDate,
  formatMilestoneReportSection,
  getHomeMilestoneNavigationState,
} from "../src/lib/milestones/index.ts";

function milestone(overrides: Partial<Milestone> = {}): Milestone {
  return { id: "m1", user_id: "u1", task_id: "t1", task_title_snapshot: "Saved title", revision: 1, status: "active", task_trashed_at: null, last_restored_at: null, rules_version: "v1", questions_version: "v1", answers_snapshot: {}, recommendation_snapshot: {}, recommended_tier: "gold", recommended_target_date: "2026-07-20", allowed_target_date_min: "2026-07-17", allowed_target_date_max: "2026-08-01", deadline_kind: "none", external_deadline: null, feasibility_warning: null, rules_explanation: "x", initial_locked_tier: "gold", initial_locked_target_date: "2026-07-20", initial_aura_deadline: "2026-07-23", current_tier: "gold", current_target_date: "2026-07-20", current_aura_deadline: "2026-07-23", tier_raise_explanation: null, setup_correction_used: false, setup_corrected_at: null, completion_timezone: "America/New_York", completion_timing: null, completion_date_key: null, pre_completion_task_snapshot: null, trophy_awarded_at: null, trophy_revoked_at: null, aura_kind: null, aura_awarded_at: null, aura_revoked_at: null, abandoned_at: null, abandonment_reason: null, promoted_at: "2026-07-16T00:00:00Z", locked_at: "2026-07-16T00:00:00Z", completed_at: null, reversed_at: null, created_at: "2026-07-16T00:00:00Z", updated_at: "2026-07-16T00:00:00Z", ...overrides };
}

function task(id: string, title = id): Task {
  return createTask({ id, title });
}

function event(id: string, eventType: MilestoneEvent["event_type"], occurredAt = "2026-07-16T12:00:00"): MilestoneEvent {
  return { id, operation_id: `op-${id}`, user_id: "u1", milestone_id: "m1", task_id: "t1", event_type: eventType, previous_state: null, next_state: null, metadata: {}, occurred_at: occurredAt, created_at: occurredAt };
}

function completed(id: string, tier: Milestone["current_tier"], aura: Milestone["aura_kind"], overrides: Partial<Milestone> = {}) {
  return milestone({ id, task_id: id, status: "completed", current_tier: tier, completion_date_key: "2026-07-16", completion_timing: aura === "none" ? "late" : "on_time", trophy_awarded_at: "2026-07-16T12:00:00Z", aura_kind: aura, aura_awarded_at: aura === "none" ? null : "2026-07-16T12:00:00Z", completed_at: "2026-07-16T12:00:00Z", ...overrides });
}

test("Home counts only active non-trashed rows and preserves deleted-task completions", () => {
  const rows = [milestone(), milestone({ id: "trash", task_trashed_at: "2026-07-16T00:00:00Z" }), milestone({ id: "abandoned", status: "abandoned" }), completed("deleted", "gold", "standard", { task_id: null })];
  const result = buildHomeMilestoneDashboard(rows, new Map([["t1", task("t1")]]), "2026-07-16");
  assert.equal(result.activeCount, 1);
  assert.equal(result.completedCount, 1);
  assert.equal(result.recentCompletion?.task_id, null);
});

test("Home active timing uses date-only target, grace, and aura boundaries", () => {
  const row = milestone();
  assert.equal(classifyActiveMilestoneTiming(row, "2026-07-19"), "on_track");
  assert.equal(classifyActiveMilestoneTiming(row, "2026-07-20"), "target_today");
  assert.equal(classifyActiveMilestoneTiming(row, "2026-07-23"), "grace_period");
  assert.equal(classifyActiveMilestoneTiming(row, "2026-07-24"), "past_aura_window");
});

test("Home nearest active rows are target-ordered and capped at three", () => {
  const rows = [24, 20, 22, 21].map((day, index) => milestone({ id: `m${index}`, task_id: `t${index}`, current_target_date: `2026-07-${day}`, current_aura_deadline: `2026-07-${day + 3}` }));
  const tasks = new Map(rows.map((row) => [row.task_id!, task(row.task_id!)]));
  const result = buildHomeMilestoneDashboard(rows, tasks, "2026-07-16");
  assert.deepEqual(result.nearestActive.map((entry) => entry.milestone.current_target_date), ["2026-07-20", "2026-07-21", "2026-07-22"]);
  assert.equal(result.remainingActiveCount, 1);
});

test("Home recent completion and earned trophy/Aura distribution use valid current awards only", () => {
  const rows = [
    completed("bronze", "bronze", "standard", { completion_date_key: "2026-07-12" }),
    completed("silver", "silver", "standard", { completion_date_key: "2026-07-13" }),
    completed("gold", "gold", "standard", { completion_date_key: "2026-07-14", task_id: null, task_title_snapshot: "Deleted winner" }),
    completed("platinum", "platinum", "diamond", { completion_date_key: "2026-07-15" }),
    completed("reversed", "gold", "standard", { status: "active", trophy_revoked_at: "2026-07-16T00:00:00Z", aura_revoked_at: "2026-07-16T00:00:00Z" }),
  ];
  const result = buildHomeMilestoneDashboard(rows, new Map(), "2026-07-16");
  assert.deepEqual(result.earnedTierCounts, { bronze: 1, silver: 1, gold: 1, platinum: 1 });
  assert.equal(result.standardAuraCount, 3);
  assert.equal(result.diamondAuraCount, 1);
  assert.equal(result.recentCompletion?.id, "platinum");
});

test("Home navigation targets the built-in list and Completed workspace", () => {
  assert.deepEqual(getHomeMilestoneNavigationState("active", DEFAULT_TASK_UI_STATE), { ...DEFAULT_TASK_UI_STATE, selectedBucket: "milestones", tasksSurface: "tasks" });
  assert.deepEqual(getHomeMilestoneNavigationState("completed", DEFAULT_TASK_UI_STATE), { ...DEFAULT_TASK_UI_STATE, tasksSurface: "completed_milestones" });
});

test("Home visible date formatter remains M-D-YY", () => assert.equal(formatMilestoneDisplayDate("2026-07-06"), "7-6-26"));

test("Milestone report counts semantic lifecycle events without award double-counting", () => {
  const events = [event("p", "promoted"), event("on", "completed_on_time"), event("grace", "completed_grace_period"), event("late", "completed_late"), event("award", "award_granted"), event("abandon", "abandoned"), event("reverse", "completion_reversed")];
  const result = buildMilestoneReportSummary(events, [], { startDateKey: "2026-07-16", endDateKey: "2026-07-16" });
  assert.deepEqual({ promoted: result.promoted, completedTotal: result.completedTotal, onTime: result.completedOnTime, grace: result.completedGracePeriod, late: result.completedLate, abandoned: result.abandoned, reversals: result.completionReversals }, { promoted: 1, completedTotal: 3, onTime: 1, grace: 1, late: 1, abandoned: 1, reversals: 1 });
});

test("Milestone report range is inclusive by local date and excludes outside/repeated events", () => {
  const inside = event("inside", "promoted", "2026-07-16T23:59:59");
  const outside = event("outside", "promoted", "2026-07-17T00:00:00");
  const result = buildMilestoneReportSummary([inside, inside, outside], [], { startDateKey: "2026-07-16", endDateKey: "2026-07-16" });
  assert.equal(result.promoted, 1);
  const bounds = buildMilestoneEventOccurredAtRange({ startDateKey: "2026-07-16", endDateKey: "2026-07-16" });
  assert.equal(bounds.startInclusive, new Date(2026, 6, 16).toISOString());
  assert.equal(bounds.endExclusive, new Date(2026, 6, 17).toISOString());
});

test("Current completed rows authoritatively provide earned tiers, Aura kinds, and deleted-task detail", () => {
  const rows = [completed("bronze", "bronze", "standard"), completed("platinum", "platinum", "diamond"), completed("late", "gold", "none", { task_id: null, task_title_snapshot: "Deleted late goal" }), completed("reversed", "silver", "standard", { trophy_revoked_at: "2026-07-17T00:00:00Z" })];
  const result = buildMilestoneReportSummary([], rows, { startDateKey: "2026-07-16", endDateKey: "2026-07-16" });
  assert.deepEqual(result.tiers, { bronze: 1, silver: 0, gold: 1, platinum: 1 });
  assert.equal(result.standardAuras, 1);
  assert.equal(result.diamondAuras, 1);
  assert.equal(result.completedWithoutAura, 1);
  assert.ok(result.details.some((row) => row.task_id === null && row.task_title_snapshot === "Deleted late goal"));
});

test("shared Markdown report includes the same Milestone aggregate while preserving existing sections", () => {
  const earned = completed("gold", "gold", "standard");
  const milestoneEvents = [event("on", "completed_on_time")];
  const summary = buildMilestoneReportSummary(milestoneEvents, [earned], { startDateKey: "2026-07-10", endDateKey: "2026-07-16" });
  const section = formatMilestoneReportSection(summary, false).join("\n");
  const report = generateTaskReport({ appVersion: "6.29.29", availableTaskLists: getBuiltInTaskLists(), detailLevel: "summary", focusCategories: [], focusHistory: [], generatedAt: new Date("2026-07-16T12:00:00Z"), historySourceLabel: "test", historyWarning: null, milestoneEvents, milestones: [earned], rangeId: "last7", taskHistory: [], tasks: [], todayDateKey: "2026-07-16" });
  assert.match(report, /## Overall Stats/);
  assert.match(report, /## Focus Report/);
  assert.ok(report.includes(section));
  assert.match(report, /Completed: 1 total; 1 on time; 0 grace period; 0 late/);
});
