import assert from "node:assert/strict";
import test from "node:test";
import { buildOnTimeHierarchy, calculateOnTimeSchedule, calculateOnTimeSequentialFinishes, getOnTimeDropIndex, getOnTimeElapsedSecondsByItemId, isLinkedItemOccurrenceCurrent, isOnTimeTaskEligible, moveOnTimeItem, reorderOnTimeItems } from "../src/lib/on-time-planner.ts";
import type { OnTimePlanItem } from "../src/lib/on-time-plan-state.ts";
import type { Task, TaskActualTimeEntry } from "../src/lib/database.types.ts";
import type { RunningTaskTimer } from "../src/components/ui/task-management-table-v2.tsx";

const item = (id: string, seconds: number | null, completed = false): OnTimePlanItem => ({ id, kind: "temporary", title: id, plannedSeconds: seconds, completed });
const base = { now: "2026-07-12T10:00:00Z", arriveAt: "2026-07-12T12:00:00Z", travelMinutes: 30, arrivalBufferMinutes: 10, items: [item("a", 1800)] };

test("arrival buffer, leave-by, and begin-preparing math", () => {
  const result = calculateOnTimeSchedule(base);
  assert.equal(result.targetArrivalAt, "2026-07-12T11:50:00.000Z");
  assert.equal(result.leaveBy, "2026-07-12T11:20:00.000Z");
  assert.equal(result.beginPreparingBy, "2026-07-12T10:50:00.000Z");
});

test("classifies threshold boundaries", () => {
  const at = (now: string) => calculateOnTimeSchedule({ ...base, now }).scheduleState;
  assert.equal(at("2026-07-12T10:34:59Z"), "ahead");
  assert.equal(at("2026-07-12T10:35:00Z"), "on_schedule");
  assert.equal(at("2026-07-12T10:45:00Z"), "tight");
  assert.equal(at("2026-07-12T10:50:01Z"), "behind");
});

test("missing duration is untrusted and completed items contribute zero", () => {
  const missing = calculateOnTimeSchedule({ ...base, items: [item("a", null)] });
  assert.deepEqual(missing.missingDurationItemIds, ["a"]);
  assert.equal(missing.projectionTrusted, false);
  const done = calculateOnTimeSchedule({ ...base, items: [item("a", null, true)] });
  assert.equal(done.remainingPreparationSeconds, 0);
});

test("leave-now requires complete preparation and leave time", () => {
  assert.equal(calculateOnTimeSchedule({ ...base, now: "2026-07-12T11:20:00Z", items: [] }).scheduleState, "leave_now");
  assert.equal(calculateOnTimeSchedule({ ...base, now: "2026-07-12T11:20:00Z" }).scheduleState, "behind");
});

test("passed deadline, overnight, invalid values, elapsed clamp, and zero preparation", () => {
  assert.equal(calculateOnTimeSchedule({ ...base, now: "2026-07-12T12:00:01Z", items: [] }).scheduleState, "behind");
  assert.equal(calculateOnTimeSchedule({ ...base, arriveAt: "2026-07-13T00:15:00Z" }).invalid, false);
  assert.equal(calculateOnTimeSchedule({ ...base, travelMinutes: -1 }).invalid, true);
  assert.equal(calculateOnTimeSchedule({ ...base, elapsedSecondsByItemId: { a: 9999 } }).remainingPreparationSeconds, 0);
  assert.equal(calculateOnTimeSchedule({ ...base, items: [] }).remainingPreparationSeconds, 0);
});

const task = (changes: Partial<Task> = {}) => ({
  id: "task-a", user_id: "user", parent_task_id: null, revision: 1, title: "Parent", notes: "notes", status: "pending", priority: "normal", energy: "none", is_urgent: false, is_important: false, due_on: null, active_status_logical_date: null, active_occurrence_due_on: null, scheduled_on: null, due_time: null, estimated_minutes: 10, actual_seconds: 0, tags: ["tag"], external_link_label: null, external_link_url: null, one_step_at_a_time: false, subtasks_auto_reset: false, repeat_frequency: "none", repeat_interval: 1, repeat_days_of_week: [], repeat_day_of_month: null, repeat_monthly_mode: "day_of_month", repeat_monthly_ordinal: null, repeat_monthly_weekday: null, pinned_at: null, pin_order: null, sort_order: 0, completed_at: null, trashed_at: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ...changes,
}) as Task;

test("picker eligibility includes hierarchy tasks and excludes unavailable or duplicate tasks", () => {
  const parent = task();
  const step = task({ id: "step", parent_task_id: parent.id, title: "Step" });
  const substep = task({ id: "substep", parent_task_id: step.id, title: "Substep" });
  const map = new Map([parent, step, substep].map((entry) => [entry.id, entry]));
  assert.deepEqual(buildOnTimeHierarchy(substep, map), ["Parent", "Step"]);
  assert.equal(isOnTimeTaskEligible(step, new Set()), true);
  assert.equal(isOnTimeTaskEligible(step, new Set([step.id])), false);
  assert.equal(isOnTimeTaskEligible(task({ status: "complete" }), new Set()), false);
  assert.equal(isOnTimeTaskEligible(task({ status: "archived" }), new Set()), false);
  assert.equal(isOnTimeTaskEligible(task({ trashed_at: "2026-01-02T00:00:00Z" }), new Set()), false);
});

test("occurrence advancement is stale and completion statuses contribute zero only while current", () => {
  const linked: OnTimePlanItem = { id: "linked", kind: "task", taskId: "task-a", titleSnapshot: "Parent", hierarchySnapshot: [], occurrenceKey: "occurrence:2026-07-12", occurrenceDueOn: "2026-07-12", plannedSeconds: 600, durationSource: "manual" };
  const current = task({ repeat_frequency: "daily", active_occurrence_due_on: "2026-07-12", status: "done" });
  assert.equal(isLinkedItemOccurrenceCurrent(linked, current), true);
  assert.equal(calculateOnTimeSchedule({ ...base, items: [linked], completionByItemId: { linked: true } }).remainingPreparationSeconds, 0);
  assert.equal(isLinkedItemOccurrenceCurrent(linked, { ...current, active_occurrence_due_on: "2026-07-13" }), false);
});

test("timer deduction counts exact task-timer evidence and active delta without its saved baseline", () => {
  const linked: OnTimePlanItem = { id: "linked", kind: "task", taskId: "task-a", titleSnapshot: "Parent", hierarchySnapshot: [], occurrenceKey: "occurrence:2026-07-12", occurrenceDueOn: "2026-07-12", plannedSeconds: 1000, durationSource: "manual" };
  const entry = (source: TaskActualTimeEntry["source"], duration: number, occurrenceKey = linked.occurrenceKey): TaskActualTimeEntry => ({ id: `${source}-${duration}`, task_id: "task-a", user_id: "user", entry_date: "2026-07-12", title_snapshot: "Parent", duration_seconds: duration, notes: null, occurrence_key: occurrenceKey, occurrence_due_on: "2026-07-12", source, estimate_eligible: true, exclusion_reason: null, completion_history_id: null, completion_completed_at: null, created_at: "2026-07-12T00:00:00Z" });
  const timer: RunningTaskTimer = { baseSeconds: 500, startedActualSeconds: 400, startedAt: 1_000, pausedAt: null, taskId: "task-a", title: "Parent", occurrenceKey: linked.occurrenceKey, occurrenceDueOn: linked.occurrenceDueOn };
  const elapsed = getOnTimeElapsedSecondsByItemId({ entries: [entry("task_timer", 300), entry("manual", 200), entry("import", 200), entry("task_timer", 900, "occurrence:other")], items: [linked], now: 11_000, timers: [timer] });
  assert.equal(elapsed.linked, 410);
  assert.equal(calculateOnTimeSchedule({ ...base, items: [linked], elapsedSecondsByItemId: elapsed }).remainingPreparationSeconds, 590);
  assert.equal(getOnTimeElapsedSecondsByItemId({ entries: [entry("task_timer", 1200)], items: [linked], now: 11_000, timers: [] }).linked, 1200);
});

test("temporary completion and move fallback update remaining time and preserve boundaries", () => {
  const items = [item("a", 60), item("b", 120)];
  assert.deepEqual(moveOnTimeItem(items, "a", -1).map((entry) => entry.id), ["a", "b"]);
  assert.deepEqual(moveOnTimeItem(items, "a", 1).map((entry) => entry.id), ["b", "a"]);
  assert.equal(calculateOnTimeSchedule({ ...base, items: [item("a", 60, true), item("b", 120)] }).remainingPreparationSeconds, 120);
});

test("sequential estimated finishes include prior remaining work and completed items contribute zero", () => {
  const items = [item("a", 600), item("done", 600, true), item("b", 300)];
  const finishes = calculateOnTimeSequentialFinishes({ now: "2026-07-12T10:00:00Z", items });
  assert.equal(finishes.a?.estimatedFinishAt, "2026-07-12T10:10:00.000Z");
  assert.equal(finishes.done?.state, "completed");
  assert.equal(finishes.b?.estimatedFinishAt, "2026-07-12T10:15:00.000Z");
});

test("missing time blocks downstream finishes while elapsed deduction, reordering, and overnight times remain exact", () => {
  const ordered = [item("a", 600), item("missing", null), item("b", 300)];
  const blocked = calculateOnTimeSequentialFinishes({ now: "2026-07-12T23:55:00Z", items: ordered, elapsedSecondsByItemId: { a: 120 } });
  assert.equal(blocked.a?.estimatedFinishAt, "2026-07-13T00:03:00.000Z");
  assert.equal(blocked.missing?.state, "unavailable");
  assert.equal(blocked.b?.state, "unavailable");
  const reordered = reorderOnTimeItems([item("a", 600), item("b", 300)], 1, 0);
  assert.deepEqual(reordered.map((entry) => entry.id), ["b", "a"]);
  assert.equal(calculateOnTimeSequentialFinishes({ now: "2026-07-12T10:00:00Z", items: reordered }).a?.estimatedFinishAt, "2026-07-12T10:15:00.000Z");
});

test("drop index uses stable fixed midpoints and final order changes only once", () => {
  assert.equal(getOnTimeDropIndex([10, 30, 50], 31, 0), 1);
  assert.equal(getOnTimeDropIndex([10, 30, 50], 60, 0), 2);
  assert.deepEqual(reorderOnTimeItems([item("a", 1), item("b", 1), item("c", 1)], 0, 2).map((entry) => entry.id), ["b", "c", "a"]);
});

test("active and paused timer deductions shift sequential finishes without exceeding planned time", () => {
  const linked: OnTimePlanItem = { id: "linked", kind: "task", taskId: "task-a", titleSnapshot: "Parent", hierarchySnapshot: [], occurrenceKey: "lifetime:task-a", occurrenceDueOn: null, plannedSeconds: 600, durationSource: "manual" };
  const running: RunningTaskTimer = { baseSeconds: 120, startedActualSeconds: 120, startedAt: 1_000, pausedAt: null, taskId: "task-a", title: "Parent", occurrenceKey: "lifetime:task-a", occurrenceDueOn: null };
  const paused = { ...running, pausedAt: 121_000 };
  const runningElapsed = getOnTimeElapsedSecondsByItemId({ entries: [], items: [linked], now: 181_000, timers: [running] });
  const pausedElapsed = getOnTimeElapsedSecondsByItemId({ entries: [], items: [linked], now: 181_000, timers: [paused] });
  assert.equal(runningElapsed.linked, 180);
  assert.equal(pausedElapsed.linked, 120);
  assert.equal(calculateOnTimeSequentialFinishes({ now: "2026-07-12T10:00:00Z", items: [linked], elapsedSecondsByItemId: runningElapsed }).linked?.estimatedFinishAt, "2026-07-12T10:07:00.000Z");
  assert.equal(calculateOnTimeSequentialFinishes({ now: "2026-07-12T10:00:00Z", items: [linked], elapsedSecondsByItemId: { linked: 9999 } }).linked?.estimatedFinishAt, "2026-07-12T10:00:00.000Z");
});
