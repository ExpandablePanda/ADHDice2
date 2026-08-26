import assert from "node:assert/strict";
import test from "node:test";
import { buildOnTimeHierarchy, calculateOnTimeSchedule, calculateOnTimeSequentialFinishes, classifyOnTimeRowState, createElapsedAwareOnTimeExecutionSnapshot, createOnTimeExecutionSnapshot, formatOnTimeArrivalDetail, formatOnTimeCountdown, formatOnTimeOperationalCountdown, formatUnsignedOperationalDuration, getOnTimeDropIndex, getOnTimeElapsedSecondsByItemId, getOnTimeExecutionTiming, isLinkedItemOccurrenceCurrent, isOnTimeTaskEligible, moveOnTimeItem, reorderOnTimeItems } from "../src/lib/on-time-planner.ts";
import type { OnTimePlanItem } from "../src/lib/on-time-plan-state.ts";
import type { Task } from "../src/lib/database.types.ts";
import type { TaskHistory } from "../src/lib/database.types.ts";
import { getTaskDisplayStatusWithHistory } from "../src/lib/task-cockpit.ts";
import type { RunningTaskTimer } from "../src/components/ui/task-management-table-v2.tsx";

const item = (id: string, seconds: number | null, completed = false): OnTimePlanItem => ({ id, kind: "temporary", title: id, plannedSeconds: seconds, completed, execution: null });
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

test("authoritative display status preserves due-today, future, recurrence, Step, and Substep parity", () => {
  const today = "2026-07-12";
  const dueToday = task({ due_on: today, status: "upcoming" });
  const future = task({ due_on: "2026-07-13", status: "upcoming" });
  const step = task({ id: "step", parent_task_id: dueToday.id, due_on: today, status: "upcoming" });
  const substep = task({ id: "substep", parent_task_id: step.id, due_on: today, status: "upcoming" });
  assert.equal(getTaskDisplayStatusWithHistory(dueToday, [], today), "pending");
  assert.equal(getTaskDisplayStatusWithHistory(future, [], today), "upcoming");
  assert.equal(getTaskDisplayStatusWithHistory(step, [], today), "pending");
  assert.equal(getTaskDisplayStatusWithHistory(substep, [], today), "pending");
  const recurring = task({ due_on: today, repeat_frequency: "daily", status: "pending" });
  const history = [{ id: "history", task_id: recurring.id, user_id: "user", entry_date: today, occurrence_key: `occurrence:${today}`, occurrence_due_on: today, status: "missed", event_type: "status", counted_as_due_occurrence: true, was_completed: false, created_at: `${today}T12:00:00Z`, updated_at: `${today}T12:00:00Z` }] as TaskHistory[];
  assert.equal(getTaskDisplayStatusWithHistory(recurring, history, today), "missed");
});

test("raw In Progress narrowly overrides anchored occurrence history for parents, Steps, and Substeps", () => {
  const today = "2026-07-15";
  const dueOn = "2026-07-12";
  const historyFor = (taskId: string, status: "missed" | "done" | "did_my_best") => [{
    id: `history-${taskId}-${status}`, task_id: taskId, user_id: "user", entry_date: dueOn,
    occurrence_key: `occurrence:${dueOn}`, occurrence_due_on: dueOn, status, event_type: "status",
    counted_as_due_occurrence: true, was_completed: status !== "missed",
    created_at: `${dueOn}T12:00:00Z`, updated_at: `${dueOn}T12:00:00Z`,
  }] as TaskHistory[];

  for (const [id, parentTaskId] of [["parent", null], ["step", "parent"], ["substep", "step"]] as const) {
    const recurring = task({ id, parent_task_id: parentTaskId, due_on: dueOn, repeat_frequency: "daily", status: "in_progress" });
    const history = historyFor(id, "missed");
    assert.equal(getTaskDisplayStatusWithHistory(recurring, history, today), "in_progress");
    assert.equal(history.length, 1);
  }
  for (const status of ["done", "did_my_best"] as const) {
    const recurring = task({ id: `terminal-${status}`, due_on: dueOn, repeat_frequency: "daily", status: "in_progress" });
    assert.equal(getTaskDisplayStatusWithHistory(recurring, historyFor(recurring.id, status), today), "in_progress");
  }
  const missed = task({ id: "raw-missed", due_on: dueOn, repeat_frequency: "daily", status: "missed" });
  assert.equal(getTaskDisplayStatusWithHistory(missed, historyFor(missed.id, "missed"), today), "missed");
  const pending = task({ id: "raw-pending", due_on: dueOn, repeat_frequency: "daily", status: "pending" });
  assert.equal(getTaskDisplayStatusWithHistory(pending, historyFor(pending.id, "done"), today), "done");
  assert.equal(getTaskDisplayStatusWithHistory(task({ status: "in_progress" }), [], today), "in_progress");
});

test("occurrence advancement is stale and completion statuses contribute zero only while current", () => {
  const linked: OnTimePlanItem = { id: "linked", kind: "task", taskId: "task-a", titleSnapshot: "Parent", hierarchySnapshot: [], occurrenceKey: "occurrence:2026-07-12", occurrenceDueOn: "2026-07-12", plannedSeconds: 600, durationSource: "manual", savedElapsedSeconds: 0, execution: null };
  const current = task({ repeat_frequency: "daily", active_occurrence_due_on: "2026-07-12", status: "done" });
  assert.equal(isLinkedItemOccurrenceCurrent(linked, current), true);
  assert.equal(calculateOnTimeSchedule({ ...base, items: [linked], completionByItemId: { linked: true } }).remainingPreparationSeconds, 0);
  assert.equal(isLinkedItemOccurrenceCurrent(linked, { ...current, active_occurrence_due_on: "2026-07-13" }), false);
});

test("linked terminal row states keep Missed visible and active while true terminal statuses resolve", () => {
  const linked: OnTimePlanItem = { id: "linked", kind: "task", taskId: "task-a", titleSnapshot: "Parent", hierarchySnapshot: [], occurrenceKey: null, occurrenceDueOn: null, plannedSeconds: 600, durationSource: "manual", savedElapsedSeconds: 0, execution: null };
  for (const [status, label] of [["done", "Done"], ["did_my_best", "Did My Best"], ["complete", "Complete"]] as const) {
    const state = classifyOnTimeRowState(linked, status);
    assert.equal(state.scheduleResolved, true);
    assert.equal(state.visibleLabel, label);
    assert.equal(state.renderActiveTiming, false);
  }
  assert.deepEqual(classifyOnTimeRowState(linked, "missed"), { scheduleResolved: false, semanticallyCompleted: false, visibleLabel: "Missed", renderActiveTiming: true });
  assert.equal(calculateOnTimeSchedule({ ...base, items: [linked], completionByItemId: { linked: false } }).remainingPreparationSeconds, 600);
  for (const status of ["pending", "in_progress", "delayed", "upcoming", "not_due"] as const) {
    assert.deepEqual(classifyOnTimeRowState(linked, status), { scheduleResolved: false, semanticallyCompleted: false, visibleLabel: null, renderActiveTiming: true });
  }
  assert.equal(classifyOnTimeRowState(item("temporary", 60, true)).visibleLabel, "Completed");
});

test("arrival detail and operational countdown preserve exact schedule classifications", () => {
  assert.equal(formatOnTimeArrivalDetail(899), "Arriving 15 min early");
  assert.equal(formatOnTimeArrivalDetail(-361), "Arriving 6 min late");
  assert.equal(formatOnTimeArrivalDetail(29), "Arriving on time");
  assert.equal(formatOnTimeArrivalDetail(-29), "Arriving on time");
  assert.equal(formatUnsignedOperationalDuration(3661), "1:01:01");
  const calculation = calculateOnTimeSchedule(base);
  assert.equal(formatOnTimeOperationalCountdown(calculation, Date.parse("2026-07-12T10:00:00Z")), "Begin preparing in 50:00");
  assert.equal(formatOnTimeOperationalCountdown(calculation, Date.parse("2026-07-12T11:00:00Z")), "Leave in 20:00");
  assert.equal(formatOnTimeOperationalCountdown(calculation, Date.parse("2026-07-12T11:20:00Z")), "Leave now");
  assert.equal(formatOnTimeOperationalCountdown(calculation, Date.parse("2026-07-12T11:21:01Z")), "1:01 past leave time");
  assert.equal(formatOnTimeOperationalCountdown(calculation, Date.parse("2026-07-12T11:50:00Z")), "Target arrival now");
  assert.equal(formatOnTimeOperationalCountdown(calculation, Date.parse("2026-07-12T11:51:01Z")), "1:01 past target arrival");
  assert.equal(formatOnTimeOperationalCountdown({ ...calculation, projectionTrusted: false }, Date.parse("2026-07-12T10:00:00Z")), null);
});

test("timer deduction counts only the active task-timer delta", () => {
  const linked: OnTimePlanItem = { id: "linked", kind: "task", taskId: "task-a", titleSnapshot: "Parent", hierarchySnapshot: [], occurrenceKey: "occurrence:2026-07-12", occurrenceDueOn: "2026-07-12", plannedSeconds: 1000, durationSource: "manual", savedElapsedSeconds: 0, execution: null };
  const timer: RunningTaskTimer = { baseSeconds: 500, startedActualSeconds: 400, startedAt: 1_000, pausedAt: null, taskId: "task-a", title: "Parent", occurrenceKey: linked.occurrenceKey, occurrenceDueOn: linked.occurrenceDueOn };
  const elapsed = getOnTimeElapsedSecondsByItemId({ items: [linked], now: 11_000, timers: [timer] });
  assert.equal(elapsed.linked, 110);
  assert.equal(calculateOnTimeSchedule({ ...base, items: [linked], elapsedSecondsByItemId: elapsed }).remainingPreparationSeconds, 890);
  assert.equal(getOnTimeElapsedSecondsByItemId({ items: [linked], now: 11_000, timers: [] }).linked, 0);
});

test("effective elapsed includes saved progress plus only an exact active timer occurrence", () => {
  const linked: OnTimePlanItem = { id: "linked", kind: "task", taskId: "task-a", titleSnapshot: "Parent", hierarchySnapshot: [], occurrenceKey: "occurrence:2026-07-12", occurrenceDueOn: "2026-07-12", plannedSeconds: 1800, durationSource: "manual", savedElapsedSeconds: 600, execution: null };
  const matching: RunningTaskTimer = { baseSeconds: 7200, startedActualSeconds: 7200, startedAt: 1_000, pausedAt: null, taskId: "task-a", title: "Parent", occurrenceKey: linked.occurrenceKey, occurrenceDueOn: linked.occurrenceDueOn };
  const otherOccurrence = { ...matching, occurrenceKey: "occurrence:2026-07-13", occurrenceDueOn: "2026-07-13" };
  const elapsed = getOnTimeElapsedSecondsByItemId({ items: [linked], now: 301_000, timers: [matching, otherOccurrence] });
  assert.equal(elapsed.linked, 900);
  assert.equal(calculateOnTimeSchedule({ ...base, items: [linked], elapsedSecondsByItemId: elapsed }).remainingPreparationSeconds, 900);
});

test("saved progress keeps schedule and sequential finish projections reduced after the timer disappears", () => {
  const linked: OnTimePlanItem = { id: "linked", kind: "task", taskId: "task-a", titleSnapshot: "Parent", hierarchySnapshot: [], occurrenceKey: "occurrence:2026-07-12", occurrenceDueOn: "2026-07-12", plannedSeconds: 1800, durationSource: "manual", savedElapsedSeconds: 900, execution: null };
  const input = { now: "2026-07-12T10:00:00Z", items: [linked], elapsedSecondsByItemId: { linked: 900 } };
  const savedElapsed = getOnTimeElapsedSecondsByItemId({ items: [linked], now: Date.parse(input.now), timers: [] });
  assert.equal(calculateOnTimeSequentialFinishes(input).linked?.estimatedFinishAt, "2026-07-12T10:15:00.000Z");
  assert.equal(calculateOnTimeSchedule({ ...base, items: [linked], elapsedSecondsByItemId: { linked: 900 } }).remainingPreparationSeconds, 900);
  assert.equal(savedElapsed.linked, 900);
  assert.equal(calculateOnTimeSchedule({ ...base, items: [linked], elapsedSecondsByItemId: savedElapsed }).remainingPreparationSeconds, 900);
});

test("saved progress is independent of lifetime Task actual seconds", () => {
  const linked: OnTimePlanItem = { id: "new-occurrence", kind: "task", taskId: "task-a", titleSnapshot: "Recurring task", hierarchySnapshot: [], occurrenceKey: "occurrence:2026-07-14", occurrenceDueOn: "2026-07-14", plannedSeconds: 1800, durationSource: "manual", savedElapsedSeconds: 0, execution: null };
  assert.equal(getOnTimeElapsedSecondsByItemId({ items: [linked], now: Date.parse("2026-07-14T12:00:00Z"), timers: [] })["new-occurrence"], 0);
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
  const linked: OnTimePlanItem = { id: "linked", kind: "task", taskId: "task-a", titleSnapshot: "Parent", hierarchySnapshot: [], occurrenceKey: "lifetime:task-a", occurrenceDueOn: null, plannedSeconds: 600, durationSource: "manual", savedElapsedSeconds: 0, execution: null };
  const running: RunningTaskTimer = { baseSeconds: 120, startedActualSeconds: 120, startedAt: 1_000, pausedAt: null, taskId: "task-a", title: "Parent", occurrenceKey: "lifetime:task-a", occurrenceDueOn: null };
  const paused = { ...running, pausedAt: 121_000 };
  const runningElapsed = getOnTimeElapsedSecondsByItemId({ entries: [], items: [linked], now: 181_000, timers: [running] });
  const pausedElapsed = getOnTimeElapsedSecondsByItemId({ entries: [], items: [linked], now: 181_000, timers: [paused] });
  assert.equal(runningElapsed.linked, 180);
  assert.equal(pausedElapsed.linked, 120);
  assert.equal(calculateOnTimeSequentialFinishes({ now: "2026-07-12T10:00:00Z", items: [linked], elapsedSecondsByItemId: runningElapsed }).linked?.estimatedFinishAt, "2026-07-12T10:07:00.000Z");
  assert.equal(calculateOnTimeSequentialFinishes({ now: "2026-07-12T10:00:00Z", items: [linked], elapsedSecondsByItemId: { linked: 9999 } }).linked?.estimatedFinishAt, "2026-07-12T10:00:00.000Z");
});

test("execution timing anchors ETA, catches up after background time, crosses zero, and formats hour scale", () => {
  const execution = createOnTimeExecutionSnapshot(1_200, "2026-07-12T10:00:00Z");
  assert.deepEqual(execution, { startedAt: "2026-07-12T10:00:00.000Z", plannedSeconds: 1_200 });
  const halfway = getOnTimeExecutionTiming(execution, "2026-07-12T10:10:00Z");
  assert.equal(halfway?.remainingSeconds, 600);
  assert.equal(halfway?.estimatedFinishAt, "2026-07-12T10:20:00.000Z");
  assert.equal(getOnTimeExecutionTiming(execution, "2026-07-12T10:20:00Z")?.remainingSeconds, 0);
  assert.equal(getOnTimeExecutionTiming(execution, "2026-07-12T10:23:42Z")?.remainingSeconds, -222);
  assert.equal(formatOnTimeCountdown(600), "10:00");
  assert.equal(formatOnTimeCountdown(0), "00:00");
  assert.equal(formatOnTimeCountdown(-222), "-3:42");
  assert.equal(formatOnTimeCountdown(3_661), "1:01:01");
  assert.equal(formatOnTimeCountdown(-3_661), "-1:01:01");
});

test("elapsed-aware Start adopts matching work while Restart creates a fresh full deadline", () => {
  const clickNow = Date.parse("2026-07-12T10:10:00Z");
  const started = createElapsedAwareOnTimeExecutionSnapshot({ elapsedSeconds: 420, intent: "start", plannedSeconds: 600, startedAt: clickNow });
  const restarted = createElapsedAwareOnTimeExecutionSnapshot({ elapsedSeconds: 420, intent: "restart", plannedSeconds: 600, startedAt: clickNow });
  assert.deepEqual(started, { startedAt: "2026-07-12T10:03:00.000Z", plannedSeconds: 600 });
  assert.equal(getOnTimeExecutionTiming(started, clickNow)?.remainingSeconds, 180);
  assert.equal(getOnTimeExecutionTiming(started, clickNow)?.estimatedFinishAt, "2026-07-12T10:13:00.000Z");
  assert.deepEqual(restarted, { startedAt: "2026-07-12T10:10:00.000Z", plannedSeconds: 600 });
  assert.equal(getOnTimeExecutionTiming(restarted, clickNow)?.remainingSeconds, 600);
  const overtime = createElapsedAwareOnTimeExecutionSnapshot({ elapsedSeconds: 900, intent: "start", plannedSeconds: 600, startedAt: clickNow });
  assert.equal(getOnTimeExecutionTiming(overtime, clickNow)?.remainingSeconds, -300);
  assert.deepEqual(createElapsedAwareOnTimeExecutionSnapshot({ elapsedSeconds: Number.NaN, intent: "start", plannedSeconds: 600, startedAt: clickNow }), restarted);
});

test("execution snapshot overrides timer evidence, retains captured duration, and clamps only future contribution", () => {
  const execution = createOnTimeExecutionSnapshot(1_200, "2026-07-12T10:00:00Z");
  const running = { ...item("running", 3_600), execution };
  const next = item("next", 300);
  const halfway = calculateOnTimeSequentialFinishes({ now: "2026-07-12T10:10:00Z", items: [running, next], elapsedSecondsByItemId: { running: 999 } });
  assert.equal(halfway.running?.estimatedFinishAt, "2026-07-12T10:20:00.000Z");
  assert.equal(halfway.next?.estimatedFinishAt, "2026-07-12T10:25:00.000Z");
  assert.equal(calculateOnTimeSchedule({ ...base, now: "2026-07-12T10:10:00Z", items: [running], elapsedSecondsByItemId: { running: 999 } }).remainingPreparationSeconds, 600);
  const overtime = calculateOnTimeSequentialFinishes({ now: "2026-07-12T10:25:00Z", items: [running, next] });
  assert.equal(overtime.running?.estimatedFinishAt, "2026-07-12T10:20:00.000Z");
  assert.equal(overtime.next?.estimatedFinishAt, "2026-07-12T10:30:00.000Z");
});

test("multiple execution snapshots remain independent", () => {
  const first = { ...item("first", 600), execution: createOnTimeExecutionSnapshot(600, "2026-07-12T10:00:00Z") };
  const second = { ...item("second", 900), execution: createOnTimeExecutionSnapshot(900, "2026-07-12T10:02:00Z") };
  assert.equal(getOnTimeExecutionTiming(first.execution, "2026-07-12T10:05:00Z")?.remainingSeconds, 300);
  assert.equal(getOnTimeExecutionTiming(second.execution, "2026-07-12T10:05:00Z")?.remainingSeconds, 720);
});
