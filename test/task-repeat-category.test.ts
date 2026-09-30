import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createTask } from "../src/lib/task-buckets.ts";
import {
  buildCustomCadenceMutation,
  calcNextDueDateFromDate,
  createTaskRepeatEditorDraft,
  formatRepeatCompactLabel,
  formatRepeatFrequencyLabel,
  formatRepeatSummary,
  getTaskRepeatCategory,
  normalizePresetRepeatSelection,
  REPEAT_MONTHLY_MODE_OPTIONS,
  REPEAT_MONTHLY_ORDINAL_OPTIONS,
  taskRepeatEditorValueToUpdate,
  isWeekdaysRepeatSelection,
} from "../src/lib/task-repeat.ts";
import { classifyTaskStateRuntimeAction } from "../src/lib/task-state-runtime-actions.ts";

test("exact Weekdays is its own structured Repeat category", () => {
  assert.equal(isWeekdaysRepeatSelection("weekly", [1, 2, 3, 4, 5], 1), true);
  assert.equal(getTaskRepeatCategory("weekly", [1, 2, 3, 4, 5], 1), "weekdays");
  assert.equal(getTaskRepeatCategory("weekly", [1, 2, 3, 4, 5, 6], 1), "weekly");
  assert.equal(getTaskRepeatCategory("weekly", [1, 2, 3, 4, 5], 2), "custom");
});
test("Repeat has normal Weekdays category controls and no dedicated Weekdays-first sort", () => {
  const source = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");
  const editorSource = readFileSync(new URL("../src/components/ui/task-repeat-editor.tsx", import.meta.url), "utf8");
  const batchSource = readFileSync(new URL("../src/components/task-app/task-batch-edit-modal.tsx", import.meta.url), "utf8");
  const canonicalSource = readFileSync(new URL("../src/lib/task-app-derived.ts", import.meta.url), "utf8");
  const searchSource = readFileSync(new URL("../src/lib/task-search-selector.ts", import.meta.url), "utf8");
  assert.match(editorSource, /handlePresetClick\("weekdays"\)/);
  assert.match(editorSource, /data-repeat-editor-monthly-controls/);
  assert.match(editorSource, /data-repeat-editor-custom/);
  assert.match(editorSource, /data-repeat-editor-completion/);
  assert.match(editorSource, />Custom<\/p>/);
  assert.doesNotMatch(editorSource, /Custom Cadence|Custom cadence/);
  assert.doesNotMatch(batchSource, /Custom Cadence|Custom cadence|Ordinal weekday/);
  assert.match(source, /structuredFilters\.repeat\.includes\(getTaskRepeatCategory/);
  assert.match(canonicalSource, /getTaskRepeatCategory\(task\.repeat_frequency, task\.repeat_days_of_week, task\.repeat_interval, task\.repeat_day_of_month, task\.repeat_monthly_mode\)/);
  assert.match(searchSource, /getTaskRepeatCategory\(task\.repeat_frequency, task\.repeat_days_of_week, task\.repeat_interval, task\.repeat_day_of_month, task\.repeat_monthly_mode\)/);
  assert.doesNotMatch(source, /repeat_weekdays_first|Weekdays first/);
});

test("repeat categories distinguish fixed presets from legacy intervaled schedules", () => {
  assert.equal(getTaskRepeatCategory("none", [], 1), "none");
  assert.equal(getTaskRepeatCategory("daily", [], 1), "daily");
  assert.equal(getTaskRepeatCategory("daily", [], 3), "custom");
  assert.equal(getTaskRepeatCategory("daily_until_complete", [], 1), "daily_until_complete");
  assert.equal(getTaskRepeatCategory("daily_until_complete", [], 2), "custom");
  assert.equal(getTaskRepeatCategory("daily_until_complete", [], 1, 28), "custom");
  assert.equal(getTaskRepeatCategory("daily_until_complete", [4], 2), "custom");
  assert.equal(getTaskRepeatCategory("weekly", [1, 2, 3, 4, 5], 1), "weekdays");
  assert.equal(getTaskRepeatCategory("weekly", [2, 4], 1), "weekly");
  assert.equal(getTaskRepeatCategory("weekly", [2, 4], 2), "custom");
  assert.equal(getTaskRepeatCategory("monthly", [], 1), "monthly");
  assert.equal(getTaskRepeatCategory("monthly", [], 3), "custom");
  assert.equal(getTaskRepeatCategory("custom", [], 1), "custom");
});

test("monthly editor copy uses short plain-language labels", () => {
  assert.deepEqual(REPEAT_MONTHLY_MODE_OPTIONS, [
    { label: "Day of month", value: "day_of_month" },
    { label: "X of Every Month", value: "ordinal_weekday" },
  ]);
  assert.deepEqual(REPEAT_MONTHLY_ORDINAL_OPTIONS.map((option) => option.label), ["1st", "2nd", "3rd", "4th", "Last"]);
});

test("preset normalization resets incompatible recurrence fields immediately", () => {
  const current = {
    repeatFrequency: "weekly" as const,
    repeatInterval: 4,
    repeatDaysOfWeek: [2, 4],
    repeatDayOfMonth: 17,
    repeatMonthlyMode: "ordinal_weekday" as const,
    repeatMonthlyOrdinal: "third" as const,
    repeatMonthlyWeekday: 2,
  };
  const original = { ...current, repeatDaysOfWeek: [...current.repeatDaysOfWeek] };

  assert.deepEqual(normalizePresetRepeatSelection("none", current), {
    repeatFrequency: "none",
    repeatInterval: 1,
    repeatDaysOfWeek: [],
    repeatDayOfMonth: null,
    repeatMonthlyMode: "day_of_month",
    repeatMonthlyOrdinal: null,
    repeatMonthlyWeekday: null,
  });
  assert.deepEqual(normalizePresetRepeatSelection("daily", current).repeatInterval, 1);
  assert.deepEqual(normalizePresetRepeatSelection("daily_until_complete", current).repeatInterval, 1);
  assert.deepEqual(normalizePresetRepeatSelection("weekdays", current).repeatDaysOfWeek, [1, 2, 3, 4, 5]);
  assert.deepEqual(normalizePresetRepeatSelection("weekly", { repeatDaysOfWeek: [] }, { dueOn: "2026-08-04" }).repeatDaysOfWeek, [2]);
  assert.deepEqual(normalizePresetRepeatSelection("weekly", { repeatFrequency: "daily", repeatDaysOfWeek: [5] }, { dueOn: "2026-08-04" }).repeatDaysOfWeek, [2]);
  assert.deepEqual(normalizePresetRepeatSelection("monthly", { repeatFrequency: "daily", repeatMonthlyMode: "ordinal_weekday", repeatMonthlyOrdinal: "last", repeatMonthlyWeekday: 6 }, { dueOn: "2026-08-17" }).repeatDayOfMonth, 17);
  assert.deepEqual(normalizePresetRepeatSelection("monthly", {
    repeatFrequency: "monthly",
    repeatMonthlyMode: "ordinal_weekday",
    repeatMonthlyOrdinal: "third",
    repeatMonthlyWeekday: 2,
  }).repeatMonthlyOrdinal, "third");
  assert.deepEqual(current, original);
});

test("Weekly separates from the semantic Weekdays day set", () => {
  const weekdays = normalizePresetRepeatSelection("weekdays", {}, { dueOn: "2026-08-05" });
  const weekly = normalizePresetRepeatSelection("weekly", weekdays, { dueOn: "2026-08-05" });
  assert.deepEqual(weekly.repeatDaysOfWeek, [3]);
  assert.equal(getTaskRepeatCategory(weekly.repeatFrequency, weekly.repeatDaysOfWeek, weekly.repeatInterval), "weekly");

  const weekdaysAgain = normalizePresetRepeatSelection("weekdays", weekly, { dueOn: "2026-08-05" });
  assert.deepEqual(weekdaysAgain.repeatDaysOfWeek, [1, 2, 3, 4, 5]);
  assert.equal(getTaskRepeatCategory(weekdaysAgain.repeatFrequency, weekdaysAgain.repeatDaysOfWeek, weekdaysAgain.repeatInterval), "weekdays");

  const customWeekdays = normalizePresetRepeatSelection("weekly", {
    repeatFrequency: "weekly",
    repeatInterval: 3,
    repeatDaysOfWeek: [5, 1, 4, 2, 3],
  }, { dueOn: "2026-08-05" });
  assert.deepEqual(customWeekdays.repeatDaysOfWeek, [3]);
  assert.equal(getTaskRepeatCategory(customWeekdays.repeatFrequency, customWeekdays.repeatDaysOfWeek, customWeekdays.repeatInterval), "weekly");

  const ordinaryWeekly = normalizePresetRepeatSelection("weekly", {
    repeatFrequency: "weekly",
    repeatInterval: 2,
    repeatDaysOfWeek: [2, 4],
  });
  assert.deepEqual(ordinaryWeekly.repeatDaysOfWeek, [2, 4]);
});

test("repeat editor updates retain explicit nullable clears for canonical set_repeat", () => {
  const daily = normalizePresetRepeatSelection("daily", {
    repeatFrequency: "monthly",
    repeatDayOfMonth: 5,
    repeatMonthlyMode: "ordinal_weekday",
    repeatMonthlyOrdinal: "third",
    repeatMonthlyWeekday: 3,
  });
  const values = taskRepeatEditorValueToUpdate(daily);
  const action = classifyTaskStateRuntimeAction({
    replayIdentity: "repeat-null-clears",
    task: { canonical_revision: 1, due_on: "2026-08-05", id: "repeat-null-clears", repeat_frequency: "monthly", status: "pending" },
    values,
  });
  assert.equal(action.kind, "canonical_action");
  assert.deepEqual(action.intent?.schedule, {
    schedule_model: "rolling",
    repeat_frequency: "daily",
    repeat_interval: 1,
    repeat_days_of_week: [],
    repeat_day_of_month: null,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
    anchor_date: "2026-08-05",
  });
});

test("custom cadence helpers persist unit-specific canonical values", () => {
  const days = buildCustomCadenceMutation({
    unit: "daily",
    repeatInterval: 3,
    repeatDaysOfWeek: [2, 4],
    repeatDayOfMonth: 15,
    repeatMonthlyMode: "ordinal_weekday",
    repeatMonthlyOrdinal: "third",
    repeatMonthlyWeekday: 1,
  });
  assert.equal(days.repeatFrequency, "daily");
  assert.equal(days.repeatInterval, 3);
  assert.deepEqual(taskRepeatEditorValueToUpdate(days), {
    repeat_frequency: "daily",
    repeat_interval: 3,
    repeat_days_of_week: [],
    repeat_day_of_month: null,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
  });

  const weeks = buildCustomCadenceMutation({
    unit: "weekly",
    repeatInterval: 2,
    repeatDaysOfWeek: [2, 4],
    repeatDayOfMonth: null,
    repeatMonthlyMode: "day_of_month",
    repeatMonthlyOrdinal: null,
    repeatMonthlyWeekday: null,
  });
  assert.deepEqual(weeks, {
    repeatFrequency: "weekly",
    repeatInterval: 2,
    repeatDaysOfWeek: [2, 4],
    repeatDayOfMonth: null,
    repeatMonthlyMode: "day_of_month",
    repeatMonthlyOrdinal: null,
    repeatMonthlyWeekday: null,
  });

  const dayOfMonth = buildCustomCadenceMutation({
    unit: "monthly",
    repeatInterval: 3,
    repeatDaysOfWeek: [],
    repeatDayOfMonth: 15,
    repeatMonthlyMode: "day_of_month",
    repeatMonthlyOrdinal: null,
    repeatMonthlyWeekday: null,
  });
  assert.equal(dayOfMonth.repeatFrequency, "monthly");
  assert.equal(dayOfMonth.repeatInterval, 3);
  assert.equal(dayOfMonth.repeatDayOfMonth, 15);
  assert.equal(dayOfMonth.repeatMonthlyMode, "day_of_month");

  const ordinal = buildCustomCadenceMutation({
    unit: "monthly",
    repeatInterval: 3,
    repeatDaysOfWeek: [],
    repeatDayOfMonth: 15,
    repeatMonthlyMode: "ordinal_weekday",
    repeatMonthlyOrdinal: "third",
    repeatMonthlyWeekday: 1,
  });
  assert.deepEqual({
    repeatMonthlyMode: ordinal.repeatMonthlyMode,
    repeatMonthlyOrdinal: ordinal.repeatMonthlyOrdinal,
    repeatMonthlyWeekday: ordinal.repeatMonthlyWeekday,
  }, {
    repeatMonthlyMode: "ordinal_weekday",
    repeatMonthlyOrdinal: "third",
    repeatMonthlyWeekday: 1,
  });

  const untilComplete = buildCustomCadenceMutation({
    completionMode: "until_complete",
    unit: "monthly",
    repeatInterval: 3,
    repeatDaysOfWeek: [2],
    repeatDayOfMonth: 15,
    repeatMonthlyMode: "day_of_month",
    repeatMonthlyOrdinal: null,
    repeatMonthlyWeekday: null,
  });
  assert.deepEqual(taskRepeatEditorValueToUpdate(untilComplete), {
    repeat_frequency: "daily_until_complete",
    repeat_interval: 3,
    repeat_days_of_week: [],
    repeat_day_of_month: 15,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
  });
  assert.equal(createTaskRepeatEditorDraft({
    repeatFrequency: "daily_until_complete",
    repeatInterval: 3,
    repeatDaysOfWeek: [],
    repeatDayOfMonth: null,
    repeatMonthlyMode: "day_of_month",
    repeatMonthlyOrdinal: null,
    repeatMonthlyWeekday: null,
  }).completionMode, "until_complete");
  assert.equal(createTaskRepeatEditorDraft({
    repeatFrequency: "daily_until_complete",
    repeatInterval: 2,
    repeatDaysOfWeek: [4],
    repeatDayOfMonth: null,
    repeatMonthlyMode: "day_of_month",
    repeatMonthlyOrdinal: null,
    repeatMonthlyWeekday: null,
  }).unit, "weekly");
  assert.equal(createTaskRepeatEditorDraft({
    repeatFrequency: "daily_until_complete",
    repeatInterval: 1,
    repeatDaysOfWeek: [],
    repeatDayOfMonth: 28,
    repeatMonthlyMode: "day_of_month",
    repeatMonthlyOrdinal: null,
    repeatMonthlyWeekday: null,
  }).unit, "monthly");
});

test("custom Until complete preserves weekly and monthly recurrence fields", () => {
  const weekly = buildCustomCadenceMutation({
    completionMode: "until_complete",
    unit: "weekly",
    repeatInterval: 2,
    repeatDaysOfWeek: [4],
    repeatDayOfMonth: null,
    repeatMonthlyMode: "day_of_month",
    repeatMonthlyOrdinal: null,
    repeatMonthlyWeekday: null,
  });
  assert.equal(weekly.repeatFrequency, "daily_until_complete");
  assert.deepEqual(taskRepeatEditorValueToUpdate(weekly), {
    repeat_frequency: "daily_until_complete",
    repeat_interval: 2,
    repeat_days_of_week: [4],
    repeat_day_of_month: null,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
  });
  const weeklyAction = classifyTaskStateRuntimeAction({
    replayIdentity: "duc-weekly",
    task: { canonical_revision: 1, due_on: "2026-06-04", id: "duc-weekly", repeat_frequency: "daily", status: "pending" },
    values: taskRepeatEditorValueToUpdate(weekly),
  });
  assert.equal(weeklyAction.intent?.schedule.schedule_model, "fixed");

  const monthly = buildCustomCadenceMutation({
    completionMode: "until_complete",
    unit: "monthly",
    repeatInterval: 1,
    repeatDaysOfWeek: [],
    repeatDayOfMonth: 28,
    repeatMonthlyMode: "day_of_month",
    repeatMonthlyOrdinal: null,
    repeatMonthlyWeekday: null,
  });
  assert.equal(monthly.repeatFrequency, "daily_until_complete");
  assert.equal(monthly.repeatDayOfMonth, 28);
  assert.equal(taskRepeatEditorValueToUpdate(monthly).repeat_day_of_month, 28);
  const monthlyAction = classifyTaskStateRuntimeAction({
    replayIdentity: "duc-monthly",
    task: { canonical_revision: 1, due_on: "2026-06-28", id: "duc-monthly", repeat_frequency: "daily", status: "pending" },
    values: taskRepeatEditorValueToUpdate(monthly),
  });
  assert.equal(monthlyAction.intent?.schedule.schedule_model, "fixed");
});

test("custom repeat updates are canonical set_repeat payloads", () => {
  const sourceTask = {
    canonical_revision: 4,
    due_on: "2026-08-15",
    id: "custom-repeat-task",
    repeat_frequency: "daily" as const,
    status: "pending" as const,
  };
  for (const [unit, repeatFrequency, repeatInterval, repeatDaysOfWeek, repeatDayOfMonth] of [
    ["daily", "daily", 3, [], null],
    ["weekly", "weekly", 2, [2, 4], null],
    ["monthly", "monthly", 3, [], 15],
    ["daily-until-complete", "daily_until_complete", 3, [], null],
  ] as const) {
    const value = buildCustomCadenceMutation({
      completionMode: unit === "daily-until-complete" ? "until_complete" : "keep_repeating",
      unit: unit === "daily-until-complete" ? "monthly" : unit,
      repeatInterval,
      repeatDaysOfWeek,
      repeatDayOfMonth,
      repeatMonthlyMode: "day_of_month",
      repeatMonthlyOrdinal: null,
      repeatMonthlyWeekday: null,
    });
    assert.equal(value.repeatFrequency, repeatFrequency);
    const action = classifyTaskStateRuntimeAction({
      replayIdentity: `custom-${unit}`,
      task: sourceTask,
      values: taskRepeatEditorValueToUpdate(value),
    });
    assert.equal(action.kind, "canonical_action");
    assert.equal(action.actionType, "set_repeat");
    assert.notEqual(action.intent?.schedule.repeat_frequency, "custom");
  }
});

test("repeat formatters agree with the presentation category", () => {
  assert.equal(formatRepeatFrequencyLabel("daily", 1), "Daily");
  assert.equal(formatRepeatFrequencyLabel("daily", 3), "Every 3 days");
  assert.equal(formatRepeatFrequencyLabel("weekly", 1, [1, 2, 3, 4, 5]), "Weekdays");
  assert.equal(formatRepeatFrequencyLabel("weekly", 2, [2, 4]), "Every 2 weeks (Tue, Thu)");
  assert.equal(formatRepeatFrequencyLabel("monthly", 3), "Every 3 months");
  assert.equal(formatRepeatFrequencyLabel("monthly", 3, [], "ordinal_weekday", "third", 1), "Every 3 months (3rd Monday)");
  assert.equal(formatRepeatFrequencyLabel("custom", 3), "Custom");
  assert.doesNotMatch(formatRepeatFrequencyLabel("monthly", 4), /Monthly ·/);
  assert.equal(formatRepeatSummary({
    repeat_frequency: "weekly",
    repeat_interval: 2,
    repeat_days_of_week: [2, 4],
    repeat_day_of_month: null,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
  }), "Every 2 weeks (Tue, Thu)");
  assert.equal(formatRepeatSummary({
    repeat_frequency: "daily_until_complete",
    repeat_interval: 1,
    repeat_days_of_week: [],
    repeat_day_of_month: 28,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
  }), "Monthly on 28 until complete");
});

test("compact monthly repeat labels include the selected pattern", () => {
  assert.equal(formatRepeatCompactLabel("monthly", 1, [], "day_of_month", null, null, 1), "1st");
  assert.equal(formatRepeatCompactLabel("monthly", 1, [], "day_of_month", null, null, 15), "15th");
  assert.equal(formatRepeatCompactLabel("monthly", 1, [], "ordinal_weekday", "second", 2), "2nd Tue");
  assert.equal(formatRepeatCompactLabel("monthly", 1, [], "ordinal_weekday", "last", 1), "Last Mon");
  const monthlyUntilComplete = formatRepeatCompactLabel("daily_until_complete", 1, [], "day_of_month", null, null, 15);
  assert.match(monthlyUntilComplete, /^15th/);
  assert.match(monthlyUntilComplete, /Until Complete/);
  assert.equal(formatRepeatCompactLabel("daily_until_complete", 2, [], "day_of_month", null, null, 15), "15th · Until Complete");
  assert.equal(formatRepeatCompactLabel("monthly", 1, [], "ordinal_weekday", "third", 3), "3rd Wed");
  const ordinalMonthlyUntilComplete = formatRepeatCompactLabel("daily_until_complete", 1, [], "ordinal_weekday", "third", 3);
  assert.match(ordinalMonthlyUntilComplete, /^3rd Wed/);
  assert.match(ordinalMonthlyUntilComplete, /Until Complete/);
  const weeklyUntilComplete = formatRepeatCompactLabel("daily_until_complete", 1, [4]);
  assert.equal(weeklyUntilComplete, "Weekly (Thu) · Until Complete");
  assert.equal(formatRepeatCompactLabel("daily_until_complete", 2, [4]), "Every 2 weeks (Thu) · Until Complete");
  assert.equal(formatRepeatCompactLabel("daily_until_complete", 1), "Daily Until Complete");
  assert.equal(formatRepeatCompactLabel("daily_until_complete", 3), "Every 3 days · Until Complete");
  assert.notEqual(formatRepeatCompactLabel("monthly", 1, [], "day_of_month", null, null, 30), "Monthly");
  assert.equal(taskRepeatEditorValueToUpdate({
    repeatFrequency: "custom",
    repeatInterval: 3,
    repeatDaysOfWeek: [],
    repeatDayOfMonth: null,
    repeatMonthlyMode: "day_of_month",
    repeatMonthlyOrdinal: null,
    repeatMonthlyWeekday: null,
  }).repeat_frequency, "daily");
});

test("repeat date calculation keeps interval semantics independent of presentation category", () => {
  const base = {
    due_on: "2026-08-15",
    repeat_days_of_week: [],
    repeat_day_of_month: null,
    repeat_monthly_mode: "day_of_month" as const,
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
  };
  const task = (overrides: Partial<Parameters<typeof createTask>[0]>) => createTask({
    created_at: "2026-08-15T08:00:00.000Z",
    id: "repeat-date-test",
    sort_order: 1,
    status: "pending",
    title: "Repeat date test",
    ...base,
    ...overrides,
  });
  assert.equal(calcNextDueDateFromDate(task({ repeat_frequency: "daily", repeat_interval: 1 }), "2026-08-15"), "2026-08-16");
  assert.equal(calcNextDueDateFromDate(task({ repeat_frequency: "daily", repeat_interval: 3 }), "2026-08-15"), "2026-08-18");
  assert.equal(calcNextDueDateFromDate(task({ repeat_frequency: "weekly", repeat_interval: 1, repeat_days_of_week: [2] }), "2026-08-17"), "2026-08-18");
  assert.equal(calcNextDueDateFromDate(task({ repeat_frequency: "monthly", repeat_interval: 1 }), "2026-08-15"), "2026-09-15");
  assert.equal(calcNextDueDateFromDate(task({ repeat_frequency: "monthly", repeat_interval: 3 }), "2026-08-15"), "2026-11-15");
});
