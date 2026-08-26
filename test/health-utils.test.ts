import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHealthMealLoggedAt,
  buildDefaultHealthProfile,
  buildWeightGoalForecast,
  buildHealthCoachMessage,
  buildHealthReminderTemplate,
  displayWeightToKilograms,
  formatEditableWeight,
  formatHealthMealSummary,
  formatHealthNutritionNumber,
  formatHealthSleepDuration,
  formatMealLoggedTime,
  buildHealthSleepTimestamps,
  buildHealthDailySleepSeries,
  getHealthSleepElapsedSeconds,
  getHealthSleepStartTimestamp,
  getCurrentHealthDateTimeInputs,
  getEligibleHealthAchievements,
  getHealthSleepDayTotal,
  getSleepFocusSessions,
  sortHealthSleepSessionsByStart,
  HEALTH_SLEEP_KINDS,
  normalizeHealthMealTime,
  normalizeHealthSleepKind,
  resolveHealthSleepKind,
  parseHealthSleepDuration,
  kilogramsToDisplayValue,
  isHealthMealTimestampFuture,
  sumMealNutritionForDate,
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
  assert.equal(formatMealLoggedTime("2026-07-28T07:00:00", "en-US"), "7:00 AM");
  assert.equal(formatMealLoggedTime("2026-07-28T12:00:00", "en-US"), "12:00 PM");
  assert.equal(formatMealLoggedTime("2026-07-28T19:30:00", "en-US"), "7:30 PM");
});

test("meal logger defaults and validates local date/time inputs", () => {
  const now = new Date(2026, 7, 4, 15, 26, 45);
  assert.deepEqual(getCurrentHealthDateTimeInputs(now), { date: "2026-08-04", time: "15:26" });
  const loggedAt = buildHealthMealLoggedAt("2026-08-03", "09:12");
  assert.ok(loggedAt);
  assert.equal(isHealthMealTimestampFuture("2026-08-03", "09:12", now), false);
  assert.equal(isHealthMealTimestampFuture("2026-08-04", "15:27", now), true);
  assert.equal(buildHealthMealLoggedAt("not-a-date", "09:12"), null);
});

test("meal timestamps accept PostgreSQL HH:MM and HH:MM:SS values and normalize time inputs", () => {
  assert.equal(normalizeHealthMealTime("19:30"), "19:30");
  assert.equal(normalizeHealthMealTime("19:30:00"), "19:30");
  assert.equal(buildHealthMealLoggedAt("2026-08-25", "19:30:00"), buildHealthMealLoggedAt("2026-08-25", "19:30"));
  const secondsLoggedAt = buildHealthMealLoggedAt("2026-08-25", "19:30:45");
  const minuteLoggedAt = buildHealthMealLoggedAt("2026-08-25", "19:30:00");
  assert.ok(secondsLoggedAt && minuteLoggedAt);
  assert.equal(Date.parse(secondsLoggedAt) - Date.parse(minuteLoggedAt), 45_000);
  assert.equal(normalizeHealthMealTime("19:30:61"), null);
});

test("health nutrition display numbers round to two decimals without forced zeroes", () => {
  assert.equal(formatHealthNutritionNumber(152.72727272727272), "152.73");
  assert.equal(formatHealthNutritionNumber(3), "3");
  assert.equal(formatHealthNutritionNumber(3.5), "3.5");
  assert.equal(formatHealthNutritionNumber(null), "—");
});

test("structured meal summaries use logged quantity and calculated nutrition", () => {
  const summary = formatHealthMealSummary({
    attribution: null,
    barcode: null,
    brand_name: null,
    calories: 153,
    carbs_g: 21.82,
    consumed_quantity: 60,
    consumed_unit: "Crackers",
    created_at: "2026-08-04T06:10:00.000Z",
    entry_date: "2026-08-04",
    fat_g: 5.45,
    food_name: "Goldfish",
    food_snapshot: {
      attribution: null,
      barcode: null,
      brand_name: null,
      calories: 140,
      carbs_g: 20,
      fat_g: 5,
      food_category: "Snacks",
      food_name: "Goldfish",
      provider: "manual",
      provider_item_id: null,
      serving_label: "55 Crackers / 30 g",
      serving_measure_unit: "g",
      serving_measure_value: 30,
      serving_quantity: 55,
      serving_unit: "Crackers",
      source_food_id: "food-1",
      protein_g: 2,
    },
    id: "meal-structured",
    logged_at: "2026-08-04T06:10:00.000Z",
    meal_slot: "breakfast",
    nutrition_snapshot: {
      calories: 152.72727272727272,
      carbs_g: 21.818181818181817,
      fat_g: 5.454545454545454,
      protein_g: 3.272727272727273,
    },
    protein_g: 3.27,
    provider: "manual",
    provider_item_id: null,
    serving_label: "60 Crackers / 55 Crackers / 30 g",
    updated_at: "2026-08-04T06:10:00.000Z",
    user_id: "user-1",
  }, "en-US");

  assert.match(summary, /^Breakfast \/ 60 Crackers \/ 153 kcal \/ Protein 3\.27g \/ Carbs 21\.82g \/ Fat 5\.45g \/ \d{1,2}:10/);
  assert.doesNotMatch(summary, /55 Crackers|30 g/);
});

test("legacy meal summaries fall back safely when structured quantity data is absent", () => {
  assert.equal(formatHealthMealSummary({
    attribution: null,
    barcode: null,
    brand_name: null,
    calories: 3,
    carbs_g: 4,
    created_at: "2026-08-04T06:10:00.000Z",
    entry_date: "2026-08-04",
    fat_g: 1.5,
    food_name: "Legacy food",
    id: "meal-legacy",
    logged_at: "invalid",
    meal_slot: "lunch",
    protein_g: 2,
    provider: "manual",
    provider_item_id: null,
    serving_label: "1 bowl",
    updated_at: "2026-08-04T06:10:00.000Z",
    user_id: "user-1",
  }), "Lunch / 1 bowl / 3 kcal / Protein 2g / Carbs 4g / Fat 1.5g");
});

test("daily meal totals prefer immutable calculated snapshots and fall back for legacy meals", () => {
  const total = sumMealNutritionForDate([
    {
      attribution: null,
      barcode: null,
      brand_name: null,
      calories: 51,
      carbs_g: 7,
      created_at: "2026-08-04T12:00:00.000Z",
      entry_date: "2026-08-04",
      fat_g: 1,
      food_name: "Goldfish",
      id: "meal-structured",
      logged_at: "2026-08-04T12:00:00.000Z",
      meal_slot: "snack",
      nutrition_snapshot: { calories: 50.90909090909091, carbs_g: 7.2727272727272725, fat_g: 1.8181818181818181, protein_g: 0.7272727272727273 },
      protein_g: 1,
      provider: "manual",
      provider_item_id: null,
      serving_label: "20 crackers",
      updated_at: "2026-08-04T12:00:00.000Z",
      user_id: "user-1",
    },
    {
      attribution: null,
      barcode: null,
      brand_name: null,
      calories: 100,
      carbs_g: 20,
      created_at: "2026-08-04T13:00:00.000Z",
      entry_date: "2026-08-04",
      fat_g: 3,
      food_name: "Legacy food",
      id: "meal-legacy",
      logged_at: "2026-08-04T13:00:00.000Z",
      meal_slot: "lunch",
      protein_g: 4,
      provider: "manual",
      provider_item_id: null,
      serving_label: "1 bowl",
      updated_at: "2026-08-04T13:00:00.000Z",
      user_id: "user-1",
    },
  ], "2026-08-04");

  assert.deepEqual(total, {
    calories: 150.9090909090909,
    carbs: 27.272727272727273,
    fat: 4.818181818181818,
    protein: 4.7272727272727275,
  });
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

test("Health Sleep classifications normalize supported and legacy subtypes", () => {
  assert.deepEqual(HEALTH_SLEEP_KINDS, ["CPAP Sleep", "CPAP Nap", "Sleep", "Nap"]);
  assert.equal(normalizeHealthSleepKind("CPAP Sleep"), "CPAP Sleep");
  assert.equal(normalizeHealthSleepKind("legacy-subtype"), "Sleep");
  assert.equal(normalizeHealthSleepKind(null), "Sleep");
});

test("Health Sleep resolver prioritizes explicit subtype over session title", () => {
  assert.equal(resolveHealthSleepKind({ focusSubtype: "CPAP Nap", title: "Sleep" }), "CPAP Nap");
  assert.equal(resolveHealthSleepKind({ focusSubtype: "CPAP Sleep", title: "Sleep" }), "CPAP Sleep");
  assert.equal(resolveHealthSleepKind({ focusSubtype: "Nap", title: "CPAP Sleep" }), "Nap");
});

test("Health Sleep resolver recovers normalized legacy session titles", () => {
  assert.equal(resolveHealthSleepKind({ focusSubtype: "Sleep", title: "CPAP Sleep" }), "CPAP Sleep");
  assert.equal(resolveHealthSleepKind({ focusSubtype: "Sleep", title: "Nap" }), "Nap");
  assert.equal(resolveHealthSleepKind({ focusSubtype: "Sleep", title: "CPAP Nap" }), "CPAP Nap");
  assert.equal(resolveHealthSleepKind({ focusSubtype: null, title: "  cpap-NAP  " }), "CPAP Nap");
  assert.equal(resolveHealthSleepKind({ focusSubtype: undefined, title: "Nap" }), "Nap");
});

test("Health Sleep resolver keeps generic and unrecognized legacy fallbacks", () => {
  assert.equal(resolveHealthSleepKind({ focusSubtype: "Sleep", title: "Sleep" }), "Sleep");
  assert.equal(resolveHealthSleepKind({ focusSubtype: "Sleep", title: "Overslept" }), "Sleep");
});

test("Health Sleep resolver uses the linked category only after session metadata", () => {
  assert.equal(resolveHealthSleepKind({ focusSubtype: null, title: "Legacy sleep label" }, { title: "CPAP Sleep" }), "CPAP Sleep");
  assert.equal(resolveHealthSleepKind({ focusSubtype: null, title: "Nap" }, { title: "CPAP Sleep" }), "Nap");
  assert.equal(resolveHealthSleepKind({ focusSubtype: "unsupported", title: "Also unsupported" }, { title: "Sleep" }), "Sleep");
});

test("Health Sleep resolver does not mutate session or linked category", () => {
  const session = { focusSubtype: null, title: "CPAP Sleep" };
  const category = { title: "Sleep" };
  const before = JSON.stringify({ session, category });
  assert.equal(resolveHealthSleepKind(session, category), "CPAP Sleep");
  assert.equal(JSON.stringify({ session, category }), before);
});

test("Health Sleep durations use compact friendly formatting", () => {
  assert.equal(formatHealthSleepDuration(0), "0m");
  assert.equal(formatHealthSleepDuration(45), "45m");
  assert.equal(formatHealthSleepDuration(420), "7h");
  assert.equal(formatHealthSleepDuration(450), "7h 30m");
});

test("Health Sleep timestamps preserve local start plus duration across midnight", () => {
  const durationSeconds = parseHealthSleepDuration("2", "30");
  assert.equal(durationSeconds, 2.5 * 60 * 60);
  const timestamps = buildHealthSleepTimestamps({ date: "2026-08-04", time: "23:30", durationSeconds: durationSeconds! });
  assert.ok(timestamps);
  assert.equal(Date.parse(timestamps!.endedAt) - Date.parse(timestamps!.startedAt), durationSeconds! * 1000);
  const inferred = getHealthSleepStartTimestamp({ startedAt: null, endedAt: timestamps!.endedAt, durationSeconds: durationSeconds! });
  assert.equal(Date.parse(inferred!), Date.parse(timestamps!.startedAt));
});

test("Health Sleep ledger sorting uses semantic starts without mutating Focus history", () => {
  const sessions = [
    { id: "invalid-a", startedAt: null, endedAt: null, durationSeconds: 3600 },
    { id: "2057", startedAt: "2026-08-04T20:57:00.000Z", endedAt: null, durationSeconds: 3600 },
    { id: "0502", startedAt: null, endedAt: "2026-08-04T06:02:00.000Z", durationSeconds: 3600 },
    { id: "0157", startedAt: "2026-08-04T01:57:00.000Z", endedAt: "2026-08-04T03:00:00.000Z", durationSeconds: 3600 },
    { id: "invalid-b", startedAt: "not-a-time", endedAt: "also-not-a-time", durationSeconds: 3600 },
    { id: "1653", startedAt: "2026-08-04T16:53:00.000Z", endedAt: null, durationSeconds: 3600 },
    { id: "0845", startedAt: "2026-08-04T08:45:00.000Z", endedAt: null, durationSeconds: 3600 },
  ].map((session) => ({
    categoryId: "sleep-category",
    date: "2026-08-04",
    focusType: "Sleep",
    title: "Sleep",
    ...session,
  }));
  const original = [...sessions];
  const sorted = sortHealthSleepSessionsByStart(sessions);

  assert.deepEqual(sorted.map((session) => session.id), ["0157", "0502", "0845", "1653", "2057", "invalid-a", "invalid-b"]);
  assert.equal(getHealthSleepStartTimestamp(sessions[3]), "2026-08-04T01:57:00.000Z");
  assert.equal(getHealthSleepStartTimestamp(sessions[2]), "2026-08-04T05:02:00.000Z");
  assert.deepEqual(sessions, original);
});

test("Health Sleep rejects invalid local date/time and recomputes edited duration", () => {
  assert.equal(parseHealthSleepDuration("0", "0"), null);
  assert.equal(parseHealthSleepDuration("1", "60"), null);
  assert.equal(buildHealthSleepTimestamps({ date: "2026-02-30", time: "09:00", durationSeconds: 3600 }), null);
  const edited = buildHealthSleepTimestamps({ date: "2026-08-04", time: "09:00", durationSeconds: 90 * 60 });
  assert.ok(edited);
  assert.equal(Date.parse(edited!.endedAt) - Date.parse(edited!.startedAt), 90 * 60 * 1000);
});

test("Health Sleep elapsed display derives from the canonical active session", () => {
  assert.equal(getHealthSleepElapsedSeconds({ accumulatedSeconds: 120, isRunning: true, startTime: 100_000 }, 101_501), 121);
  assert.equal(getHealthSleepElapsedSeconds({ accumulatedSeconds: 120, isRunning: false, startTime: 100_000 }, 101_501), 120);
});

test("Health Sleep daily series returns chronological selected-date totals without mutating inputs", () => {
  const focusCategories = [{ color: "#6f57f6", focusType: "Sleep", icon: "moon", id: "sleep", title: "Sleep" }];
  const focusHistory = [{ categoryId: "sleep", date: "2026-08-10", durationSeconds: 60 * 60, focusType: "Sleep", id: "focus-only", title: "Sleep" }];
  const metricEntries = [
    { metric_date: "2026-08-09", metric_type: "sleep_minutes" as const, metric_value: 420 },
    { metric_date: "2026-08-10", metric_type: "sleep_minutes" as const, metric_value: 30 },
  ];
  const before = JSON.stringify({ focusCategories, focusHistory, metricEntries });
  const series = buildHealthDailySleepSeries({ endDate: "2026-08-10", focusCategories, focusHistory, metricEntries });

  assert.equal(series.length, 7);
  assert.deepEqual(series.map((point) => point.date), [
    "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09", "2026-08-10",
  ]);
  assert.equal(series.at(-1)?.date, "2026-08-10");
  assert.equal(series[0]?.totalMinutes, 0);
  assert.equal(series[5]?.importedMinutes, 420);
  assert.equal(series[5]?.focusMinutes, 0);
  assert.equal(series[6]?.focusMinutes, 60);
  assert.equal(series[6]?.importedMinutes, 30);
  assert.equal(series[6]?.totalMinutes, 90);
  assert.equal(JSON.stringify({ focusCategories, focusHistory, metricEntries }), before);
});
