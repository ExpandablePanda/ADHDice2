import assert from "node:assert/strict";
import test from "node:test";

import {
  formatRepeatCompactLabel,
  formatRepeatSummary,
  normalizePresetRepeatSelection,
  normalizeTaskRepeatQuotaCount,
  taskRepeatEditorValueToUpdate,
} from "../src/lib/task-repeat.ts";

test("quota presets keep quota count separate from repeat interval", () => {
  const value = normalizePresetRepeatSelection("per_week", { repeatQuotaCount: 5, repeatQuotaBalanceEnabled: true });
  assert.equal(value.repeatFrequency, "per_week");
  assert.equal(value.repeatInterval, 1);
  assert.equal(value.repeatQuotaCount, 5);
  assert.equal(value.repeatQuotaBalanceEnabled, true);
  assert.deepEqual(taskRepeatEditorValueToUpdate(value), {
    repeat_day_of_month: null,
    repeat_days_of_week: [],
    repeat_frequency: "per_week",
    repeat_interval: 1,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
    repeat_quota_balance_enabled: true,
    repeat_quota_count: 5,
  });
});

test("quota counts clamp to 7 per week and 31 per month", () => {
  assert.equal(normalizePresetRepeatSelection("per_week", { repeatQuotaCount: 99 }).repeatQuotaCount, 7);
  assert.equal(taskRepeatEditorValueToUpdate({
    repeatFrequency: "per_week",
    repeatInterval: 9,
    repeatDaysOfWeek: [],
    repeatDayOfMonth: null,
    repeatMonthlyMode: "day_of_month",
    repeatMonthlyOrdinal: null,
    repeatMonthlyWeekday: null,
    repeatQuotaCount: 99,
  }).repeat_quota_count, 7);
  assert.equal(taskRepeatEditorValueToUpdate({
    repeatFrequency: "per_month",
    repeatInterval: 1,
    repeatDaysOfWeek: [],
    repeatDayOfMonth: null,
    repeatMonthlyMode: "day_of_month",
    repeatMonthlyOrdinal: null,
    repeatMonthlyWeekday: null,
    repeatQuotaCount: 99,
  }).repeat_quota_count, 31);
});

test("new quota presets remain pending until an explicit count exists", () => {
  assert.equal(normalizePresetRepeatSelection("per_month", { repeatFrequency: "none" }).repeatQuotaCount, null);
  assert.equal(normalizePresetRepeatSelection("per_week", { repeatFrequency: "none" }).repeatQuotaCount, null);
  assert.equal(normalizeTaskRepeatQuotaCount("per_month", null), null);
  assert.equal(normalizeTaskRepeatQuotaCount("per_week", 0), null);
  assert.equal(taskRepeatEditorValueToUpdate({
    repeatFrequency: "per_month",
    repeatInterval: 1,
    repeatDaysOfWeek: [],
    repeatDayOfMonth: null,
    repeatMonthlyMode: "day_of_month",
    repeatMonthlyOrdinal: null,
    repeatMonthlyWeekday: null,
    repeatQuotaCount: null,
  }).repeat_quota_count, null);
});

test("existing quota counts remain available when switching quota periods", () => {
  assert.equal(normalizePresetRepeatSelection("per_month", { repeatFrequency: "per_week", repeatQuotaCount: 4 }).repeatQuotaCount, 4);
  assert.equal(normalizePresetRepeatSelection("per_week", { repeatFrequency: "per_month", repeatQuotaCount: 7 }).repeatQuotaCount, 7);
});

test("quota labels show the configured count and optional balance", () => {
  const task = {
    repeat_frequency: "per_month" as const,
    repeat_interval: 1,
    repeat_days_of_week: [],
    repeat_day_of_month: null,
    repeat_monthly_mode: "day_of_month" as const,
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
    repeat_quota_count: 3,
    repeat_quota_balance_enabled: true,
    repeat_quota_balance: -3,
  };
  assert.equal(formatRepeatSummary(task), "3 Per Month (-3)");
  assert.equal(formatRepeatCompactLabel("per_month", 1, [], "day_of_month", null, null, null, 3, true, -3), "3 Per Month (-3)");
  assert.equal(formatRepeatCompactLabel("per_week", 1, [], "day_of_month", null, null, null, 3, true, 1), "3 Per Week (+1)");
  assert.equal(formatRepeatCompactLabel("per_week", 1, [], "day_of_month", null, null, null, 3, true, 0), "3 Per Week");
});

test("switching away from quota clears quota fields", () => {
  const value = normalizePresetRepeatSelection("daily", { repeatQuotaCount: 4, repeatQuotaBalanceEnabled: true });
  assert.equal(value.repeatQuotaCount, null);
  assert.equal(value.repeatQuotaBalanceEnabled, false);
});
