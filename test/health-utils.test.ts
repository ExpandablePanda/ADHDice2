import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDefaultHealthProfile,
  buildWeightGoalForecast,
  buildHealthCoachMessage,
  buildHealthReminderTemplate,
  displayWeightToKilograms,
  formatEditableWeight,
  formatMealLoggedTime,
  getEligibleHealthAchievements,
  getHealthSleepDayTotal,
  getSleepFocusSessions,
  kilogramsToDisplayValue,
} from "../src/lib/health-utils.ts";

test("health weight conversion helpers round-trip between pounds and kilograms", () => {
  const kilograms = displayWeightToKilograms(180, "lb");
  assert.ok(Math.abs(kilograms - 81.6466) < 0.01);
  const pounds = kilogramsToDisplayValue(kilograms, "lb");
  assert.ok(Math.abs(pounds - 180) < 0.01);
});

test("target-weight draft display removes conversion noise", () => {
  assert.equal(formatEditableWeight(90.72, "lb"), "200");
  assert.equal(formatEditableWeight(78.24, "kg"), "78.2");
});

test("meal logged time formats valid timestamps and omits invalid values", () => {
  assert.equal(formatMealLoggedTime("invalid", "en-US"), null);
  assert.match(formatMealLoggedTime("2026-07-28T12:30:00.000Z", "en-US") ?? "", /\d{1,2}:30/);
});

function weight(date: string, weightKg: number, loggedAt = `${date}T08:00:00.000Z`) {
  return {
    created_at: loggedAt,
    entry_date: date,
    id: `${date}-${weightKg}-${loggedAt}`,
    logged_at: loggedAt,
    note: null,
    source: "manual" as const,
    updated_at: loggedAt,
    user_id: "user-1",
    weight_kg: weightKg,
  };
}

test("weight goal forecast requires enough distinct-day history", () => {
  const forecast = buildWeightGoalForecast([
    weight("2026-07-20", 95),
    weight("2026-07-27", 94),
  ], 90, "2026-07-28");
  assert.equal(forecast.status, "insufficient");
});

test("weight goal forecast estimates loss and gain target dates", () => {
  const loss = buildWeightGoalForecast([
    weight("2026-07-14", 100),
    weight("2026-07-21", 99),
    weight("2026-07-28", 98),
  ], 96, "2026-07-28");
  assert.equal(loss.status, "forecast");
  assert.equal(loss.estimatedDate, "2026-08-11");

  const gain = buildWeightGoalForecast([
    weight("2026-07-14", 70),
    weight("2026-07-21", 71),
    weight("2026-07-28", 72),
  ], 74, "2026-07-28");
  assert.equal(gain.status, "forecast");
  assert.equal(gain.estimatedDate, "2026-08-11");
});

test("weight goal forecast handles reached, away, and same-day replacement", () => {
  const reached = buildWeightGoalForecast([
    weight("2026-07-14", 92),
    weight("2026-07-21", 91),
    weight("2026-07-28", 90.04),
  ], 90, "2026-07-28");
  assert.equal(reached.status, "reached");

  const away = buildWeightGoalForecast([
    weight("2026-07-14", 90),
    weight("2026-07-21", 91),
    weight("2026-07-28", 92),
    weight("2026-07-28", 93, "2026-07-28T20:00:00.000Z"),
  ], 85, "2026-07-28");
  assert.equal(away.status, "away");
  assert.equal(away.sampleCount, 3);
  assert.equal(away.currentWeightKg, 93);
});

test("health achievements unlock when enough tracking history exists", () => {
  const checkIns = Array.from({ length: 7 }, (_, index) => ({
    created_at: `2026-05-${String(index + 1).padStart(2, "0")}T08:00:00.000Z`,
    energy_score: 3,
    entry_date: `2026-05-${String(index + 1).padStart(2, "0")}`,
    id: `checkin-${index}`,
    mood_score: 4,
    reflection: "steady",
    symptom_tags: [],
    updated_at: `2026-05-${String(index + 1).padStart(2, "0")}T08:00:00.000Z`,
    user_id: "user-1",
  }));
  const mealEntries = Array.from({ length: 7 }, (_, index) => ({
    attribution: null,
    barcode: null,
    brand_name: null,
    calories: 400,
    carbs_g: 35,
    created_at: `2026-05-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
    entry_date: `2026-05-${String(index + 1).padStart(2, "0")}`,
    fat_g: 12,
    food_name: "Lunch",
    id: `meal-${index}`,
    logged_at: `2026-05-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
    meal_slot: "lunch" as const,
    protein_g: 25,
    provider: "manual",
    provider_item_id: null,
    serving_label: "1 bowl",
    updated_at: `2026-05-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
    user_id: "user-1",
  }));
  const weightEntries = Array.from({ length: 3 }, (_, index) => ({
    created_at: `2026-05-${String(index + 1).padStart(2, "0")}T07:00:00.000Z`,
    entry_date: `2026-05-${String(index + 1).padStart(2, "0")}`,
    id: `weight-${index}`,
    logged_at: `2026-05-${String(index + 1).padStart(2, "0")}T07:00:00.000Z`,
    note: null,
    source: "manual" as const,
    updated_at: `2026-05-${String(index + 1).padStart(2, "0")}T07:00:00.000Z`,
    user_id: "user-1",
    weight_kg: 80 + index,
  }));

  const eligible = getEligibleHealthAchievements({
    awards: [],
    checkIns,
    mealEntries,
    metricEntries: [],
    weightEntries,
  }).map((achievement) => achievement.code);

  assert.ok(eligible.includes("first_check_in"));
  assert.ok(eligible.includes("seven_gentle_days"));
  assert.ok(eligible.includes("nourishment_notes"));
  assert.ok(eligible.includes("scale_awareness"));
});

test("health coach message nudges toward the next missing signal", () => {
  const profile = buildDefaultHealthProfile("user-1");
  const coachMessage = buildHealthCoachMessage({
    checkIns: [],
    mealEntries: [],
    metricEntries: [],
    profile,
    weights: [],
  });

  assert.match(coachMessage, /check-in/i);
});

test("health reminder template builds weekly weigh-in on the anchor weekday", () => {
  const reminder = buildHealthReminderTemplate("weigh_in", "2026-05-27");

  assert.equal(reminder.title, "Weekly weigh-in");
  assert.equal(reminder.repeatFrequency, "weekly");
  assert.deepEqual(reminder.repeatDaysOfWeek, [3]);
  assert.deepEqual(reminder.tags, ["health", "weight"]);
});

test("health sleep totals include imported sleep and sleep focus sessions", () => {
  const focusCategories = [
    {
      color: "#8fb7ff",
      focusType: "Sleep",
      icon: "moon",
      id: "sleep-category",
      title: "Sleep",
    },
    {
      color: "#6f57f6",
      focusType: "Work",
      icon: "code",
      id: "work-category",
      title: "Coding",
    },
  ];
  const focusHistory = [
    {
      categoryId: "sleep-category",
      date: "2026-05-27",
      durationSeconds: 90 * 60,
      focusType: "Sleep",
      id: "sleep-session",
      title: "Sleep",
    },
    {
      categoryId: "work-category",
      date: "2026-05-27",
      durationSeconds: 45 * 60,
      focusType: "Work",
      id: "work-session",
      title: "Coding",
    },
    {
      categoryId: null,
      date: "2026-05-28",
      durationSeconds: 30 * 60,
      focusType: "Personal",
      id: "historical-sleep-session",
      title: "Sleep nap",
    },
  ];
  const metricEntries = [
    {
      created_at: "2026-05-27T07:00:00.000Z",
      id: "sleep-metric",
      metric_date: "2026-05-27",
      metric_type: "sleep_minutes" as const,
      metric_unit: "min",
      metric_value: 420,
      source: "apple_health",
      source_fingerprint: "sleep-import",
      updated_at: "2026-05-27T07:00:00.000Z",
      user_id: "user-1",
    },
  ];

  assert.deepEqual(getSleepFocusSessions(focusHistory, focusCategories).map((session) => session.id), [
    "sleep-session",
    "historical-sleep-session",
  ]);
  assert.deepEqual(getHealthSleepDayTotal({
    date: "2026-05-27",
    focusCategories,
    focusHistory,
    metricEntries,
  }), {
    date: "2026-05-27",
    focusMinutes: 90,
    importedMinutes: 420,
    totalMinutes: 510,
  });
});
