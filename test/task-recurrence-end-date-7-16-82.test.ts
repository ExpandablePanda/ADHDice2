import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  evaluateTaskState,
  buildTaskEffectiveTimeline,
} from "../src/lib/task-state-engine/index.ts";
import {
  nextFixedOccurrence,
  recurrenceAfterSuccess,
  recurrenceOccurrenceIsAllowed,
  scheduledOccurrences,
} from "../src/lib/task-state-engine/recurrence.ts";
import { quotaPeriodEvaluation, quotaPeriodFactFor } from "../src/lib/task-state-engine/quota.ts";
import {
  buildCanonicalTaskCreationPlan,
  CanonicalTaskCreationValidationError,
} from "../src/lib/task-state-canonical/task-creation.ts";
import {
  formatRepeatSummary,
  normalizePresetRepeatSelection,
} from "../src/lib/task-repeat.ts";
import { parseImportedTaskLines } from "../src/lib/task-input-parsing.ts";
import type { TaskInsert } from "../src/lib/database.types.ts";

const endOn = "2026-10-15";

test("recurrence End Date is inclusive and null preserves the existing infinite rule", () => {
  const recurrence = { kind: "rolling" as const, intervalDays: 1, endOn };
  assert.equal(recurrenceOccurrenceIsAllowed(recurrence, endOn), true);
  assert.equal(recurrenceOccurrenceIsAllowed(recurrence, "2026-10-16"), false);
  assert.equal(recurrenceOccurrenceIsAllowed({ kind: "rolling", intervalDays: 1, endOn: null }, "2099-01-01"), true);
  assert.deepEqual(
    scheduledOccurrences(recurrence, "2026-10-01", "2026-10-01", "2026-10-20").slice(-2),
    ["2026-10-14", endOn],
  );
});

test("rolling, fixed weekly, monthly, and ordinal monthly recurrence stop at the ceiling", () => {
  assert.deepEqual(
    scheduledOccurrences({ kind: "rolling", intervalDays: 2, endOn }, "2026-10-01", "2026-10-01", "2026-10-20").at(-1),
    endOn,
  );
  assert.deepEqual(
    scheduledOccurrences({ kind: "weekly", intervalWeeks: 1, weekdays: [1], anchorDate: "2026-10-05", endOn: "2026-10-15" }, "2026-10-05", "2026-10-01", "2026-10-31"),
    ["2026-10-05", "2026-10-12"],
  );
  assert.deepEqual(
    scheduledOccurrences({ kind: "monthly", intervalMonths: 1, mode: "day_of_month", dayOfMonth: 15, ordinal: null, weekday: null, anchorDate: "2026-10-15", endOn: "2026-11-14" }, "2026-10-15", "2026-10-01", "2026-12-31"),
    ["2026-10-15"],
  );
  assert.deepEqual(
    scheduledOccurrences({ kind: "monthly", intervalMonths: 1, mode: "ordinal_weekday", dayOfMonth: null, ordinal: "first", weekday: 1, anchorDate: "2026-10-05", endOn: "2026-11-20" }, "2026-10-05", "2026-10-01", "2026-12-31"),
    ["2026-10-05", "2026-11-02"],
  );
});

test("final rolling and fixed successes have no next occurrence, including Daily Until Complete", () => {
  const rolling = { kind: "rolling" as const, intervalDays: 1, untilComplete: true, endOn };
  assert.equal(recurrenceAfterSuccess(rolling, endOn, endOn, new Set()).nextDue, null);
  const weekly = { kind: "weekly" as const, intervalWeeks: 1, weekdays: [1], anchorDate: "2026-10-05", endOn: "2026-10-12" };
  assert.equal(nextFixedOccurrence(weekly, "2026-10-05", "2026-10-13", new Set()), null);
  assert.equal(recurrenceAfterSuccess(weekly, "2026-10-12", "2026-10-12", new Set()).nextDue, null);
});

test("the engine preserves an active ended recurrence without auto-completing or generating a later date", () => {
  const result = evaluateTaskState({
    task: {
      id: "ended-daily",
      lifecycle: "active",
      activeStatus: "pending",
      dueOn: "2026-10-15",
      recurrence: { kind: "rolling", intervalDays: 1, endOn },
    },
    history: [{
      id: "ended-daily-history",
      taskId: "ended-daily",
      logicalDate: endOn,
      outcome: "done",
      provenance: "manual",
      occurredAt: `${endOn}T12:00:00.000Z`,
      occurrenceDueOn: endOn,
      occurrenceIdentity: `task:ended-daily:occurrence:${endOn}`,
    }],
    now: "2026-10-16T12:00:00.000Z",
    timezone: "UTC",
    logicalDayRollover: "00:00",
  });
  assert.equal(result.nextDueDate, null);
  assert.equal(result.lifecycle, "active");
  assert.equal(result.proposedTaskPatch?.dueOn, null);
  assert.equal(result.calendar["2026-10-16"], "no_entry");

  const timeline = buildTaskEffectiveTimeline({
    task: {
      id: "ended-daily",
      lifecycle: "active",
      activeStatus: "pending",
      dueOn: endOn,
      recurrence: { kind: "rolling", intervalDays: 1, endOn },
    },
    history: [],
    logicalDate: endOn,
    calendarStart: endOn,
    calendarEnd: "2026-10-16",
  });
  assert.equal(timeline.days[endOn]?.state, "open");
  assert.equal(timeline.days["2026-10-16"]?.state, "no_entry");
});

test("a non-matching End Date never invents an occurrence on the boundary", () => {
  const recurrence = { kind: "weekly" as const, intervalWeeks: 1, weekdays: [1], anchorDate: "2026-10-05", endOn: "2026-10-15" };
  assert.deepEqual(scheduledOccurrences(recurrence, "2026-10-05", "2026-10-15", "2026-10-15"), []);
});

test("a legitimate final occurrence may be delayed beyond End Date without creating another occurrence", () => {
  const timeline = buildTaskEffectiveTimeline({
    task: {
      id: "delayed-final",
      lifecycle: "active",
      activeStatus: "delayed",
      dueOn: "2026-10-18",
      recurrence: { kind: "rolling", intervalDays: 1, endOn },
    },
    history: [{
      id: "delayed-final-history",
      taskId: "delayed-final",
      logicalDate: endOn,
      outcome: "delayed",
      provenance: "manual",
      occurredAt: `${endOn}T12:00:00.000Z`,
      occurrenceDueOn: endOn,
      occurrenceIdentity: "task:delayed-final:occurrence:2026-10-15",
      effectiveDueOn: "2026-10-18",
      recurrenceAuthoritative: true,
    }],
    logicalDate: "2026-10-18",
    calendarStart: endOn,
    calendarEnd: "2026-10-19",
  });
  assert.equal(timeline.days["2026-10-18"]?.state, "open");
  assert.equal(timeline.days["2026-10-19"]?.state, "no_entry");
  assert.equal(timeline.days[endOn]?.occurrenceDueOn, endOn);
  assert.equal(timeline.days[endOn]?.occurrenceIdentity, "task:delayed-final:occurrence:2026-10-15");
  assert.equal(timeline.nextDueOn, "2026-10-18");
});

test("final quota period is truncated without prorating or carrying balance beyond the end", () => {
  const recurrence = { kind: "quota" as const, period: "week" as const, count: 3, balanceEnabled: true, activationDate: "2026-10-01", endOn: "2026-10-07" };
  const evaluation = quotaPeriodEvaluation({ recurrence, logicalDate: "2026-10-07" });
  assert.equal(evaluation.baseQuota, 3);
  assert.equal(evaluation.daysRemainingIncludingToday, 1);
  assert.equal(quotaPeriodFactFor({
    recurrence,
    periodDate: "2026-10-07",
    history: [],
    eventKind: "period_close",
    idempotenceIdentity: "quota-end-7-16-82",
  }).periodEnd, "2026-10-07");
  assert.equal(quotaPeriodEvaluation({ recurrence, logicalDate: "2026-10-08" }).daysRemainingIncludingToday, 0);
  const ended = evaluateTaskState({
    task: {
      id: "ended-quota",
      lifecycle: "active",
      activeStatus: "not_due",
      dueOn: "2026-10-01",
      recurrence,
    },
    history: [],
    now: "2026-10-08T12:00:00.000Z",
    timezone: "UTC",
    logicalDayRollover: "00:00",
    calendarStart: "2026-10-01",
    calendarEnd: "2026-10-09",
  });
  assert.equal(ended.nextDueDate, null);
  assert.equal(ended.calendar["2026-10-08"], "no_entry");
});

function creationDraft(overrides: Partial<TaskInsert> = {}): Omit<TaskInsert, "user_id"> {
  return {
    title: "Bounded recurrence",
    status: "pending",
    priority: "normal",
    priority_level: 3,
    energy: "none",
    is_urgent: false,
    is_important: false,
    due_on: "2026-10-01",
    due_time: null,
    estimated_minutes: null,
    actual_seconds: 0,
    tags: [],
    notes: null,
    parent_task_id: null,
    repeat_frequency: "daily",
    repeat_interval: 1,
    repeat_days_of_week: [],
    repeat_day_of_month: null,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
    repeat_end_on: endOn,
    repeat_quota_count: null,
    repeat_quota_balance_enabled: false,
    scheduled_on: null,
    active_status_logical_date: null,
    active_occurrence_due_on: null,
    external_link_label: null,
    external_link_url: null,
    one_step_at_a_time: false,
    subtasks_auto_reset: false,
    pinned_at: null,
    pin_order: null,
    sort_order: 0,
    completed_at: null,
    trashed_at: null,
    ...overrides,
  };
}

test("canonical creation persists, validates, and normalizes recurrence End Date", () => {
  const plan = buildCanonicalTaskCreationPlan({
    draft: creationDraft(),
    entityKind: "parent",
    profile: { timezone: "UTC", day_start_time: "00:00", settings_revision: 1 },
    now: "2026-10-01T12:00:00.000Z",
  });
  assert.equal(plan.task.repeat_end_on, endOn);
  assert.equal(plan.schedule.repeat_end_on, endOn);
  const unboundedPlan = buildCanonicalTaskCreationPlan({
    draft: creationDraft({ repeat_end_on: null }),
    entityKind: "parent",
    profile: { timezone: "UTC", day_start_time: "00:00", settings_revision: 1 },
    now: "2026-10-01T12:00:00.000Z",
  });
  assert.equal(unboundedPlan.task.repeat_end_on, null);
  assert.equal(unboundedPlan.schedule.repeat_end_on, null);
  assert.equal(buildCanonicalTaskCreationPlan({
    draft: creationDraft({ repeat_frequency: "none", repeat_end_on: endOn }),
    entityKind: "parent",
    profile: { timezone: "UTC", day_start_time: "00:00", settings_revision: 1 },
    now: "2026-10-01T12:00:00.000Z",
  }).schedule.repeat_end_on, null);
  assert.throws(
    () => buildCanonicalTaskCreationPlan({
      draft: creationDraft({ repeat_end_on: "2026-09-30" }),
      entityKind: "parent",
      profile: { timezone: "UTC", day_start_time: "00:00", settings_revision: 1 },
      now: "2026-10-01T12:00:00.000Z",
    }),
    (error: unknown) => error instanceof CanonicalTaskCreationValidationError && error.code === "INVALID_REPEAT_END_DATE",
  );
});

test("shared repeat editor helpers and import metadata carry End Date and clear it for No Repeat", () => {
  assert.equal(formatRepeatSummary({
    repeat_frequency: "daily",
    repeat_interval: 1,
    repeat_days_of_week: [],
    repeat_day_of_month: null,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
    repeat_end_on: endOn,
  }), "Daily · Ends Oct 15");
  assert.equal(normalizePresetRepeatSelection("none", { repeatFrequency: "daily", repeatEndOn: endOn }).repeatEndOn, null);
  const parsed = parseImportedTaskLines(["Task *due-2026-10-01 *repeat-Daily *repeat_end-2026-10-15"]);
  assert.equal(parsed.tasks[0]?.repeatEndOn, endOn);
});

test("version and source-only SQL contract are present", () => {
  assert.match(readFileSync(new URL("../supabase/patch_task_recurrence_end_date_7_16_82.sql", import.meta.url), "utf8"), /add column if not exists repeat_end_on date/);
  assert.match(readFileSync(new URL("../src/lib/app-version.ts", import.meta.url), "utf8"), /7\.16\.83/);
});
