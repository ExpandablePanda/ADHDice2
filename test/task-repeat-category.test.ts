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
  assert.match(canonicalSource, /getTaskRepeatCategory\(task\.repeat_frequency, task\.repeat_days_of_week, task\.repeat_interval\)/);
  assert.match(searchSource, /getTaskRepeatCategory\(task\.repeat_frequency, task\.repeat_days_of_week, task\.repeat_interval\)/);
  assert.doesNotMatch(source, /repeat_weekdays_first|Weekdays first/);
});

test("repeat categories distinguish fixed presets from legacy intervaled schedules", () => {
  assert.equal(getTaskRepeatCategory("none", [], 1), "none");
  assert.equal(getTaskRepeatCategory("daily", [], 1), "daily");
  assert.equal(getTaskRepeatCategory("daily", [], 3), "custom");
  assert.equal(getTaskRepeatCategory("daily_until_complete", [], 1), "daily_until_complete");
  assert.equal(getTaskRepeatCategory("daily_until_complete", [], 2), "custom");
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
    { label: "Week + weekday", value: "ordinal_weekday" },
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
    repeat_day_of_month: null,
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
});

test("compact monthly repeat labels include the selected pattern", () => {
  assert.equal(formatRepeatCompactLabel("monthly", 1, [], "day_of_month", null, null, 1), "1st");
  assert.equal(formatRepeatCompactLabel("monthly", 1, [], "day_of_month", null, null, 15), "15th");
  assert.equal(formatRepeatCompactLabel("monthly", 1, [], "ordinal_weekday", "second", 2), "2nd Tue");
  assert.equal(formatRepeatCompactLabel("monthly", 1, [], "ordinal_weekday", "last", 1), "Last Mon");
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
