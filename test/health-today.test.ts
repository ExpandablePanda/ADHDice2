import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type {
  HealthCheckIn,
  HealthJournalSignalOccurrence,
  HealthMealEntry,
  HealthMetricEntry,
  HealthSymptomEntry,
  HealthWaterEntry,
} from "@/lib/database.types";
import { buildHealthTodaySnapshot } from "@/lib/health-today";

const pageSource = readFileSync(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8");
const todaySource = readFileSync(new URL("../src/components/task-app/health-today-tab.tsx", import.meta.url), "utf8");
const todayDerivationSource = readFileSync(new URL("../src/lib/health-today.ts", import.meta.url), "utf8");

const today = "2026-09-01";

function checkIn(id: string, entryDate: string, entryTime: string, mood: number | null) {
  return {
    id,
    user_id: "user-1",
    entry_date: entryDate,
    entry_time: entryTime,
    mood_score: mood,
    energy_score: 6,
    stress_score: 5,
    clarity_score: null,
    symptom_tags: [],
    reflection: "",
    created_at: `${entryDate}T${entryTime}:00.000Z`,
    updated_at: `${entryDate}T${entryTime}:00.000Z`,
  } satisfies HealthCheckIn;
}

function meal(id: string, entryDate: string, calories: number, protein: number) {
  return {
    id,
    user_id: "user-1",
    entry_date: entryDate,
    meal_slot: "breakfast",
    logged_at: `${entryDate}T08:00:00.000Z`,
    food_name: id,
    brand_name: null,
    serving_label: "1 serving",
    calories,
    protein_g: protein,
    carbs_g: 0,
    fat_g: 0,
    barcode: null,
    provider: "manual",
    provider_item_id: null,
    attribution: null,
    created_at: `${entryDate}T08:00:00.000Z`,
    updated_at: `${entryDate}T08:00:00.000Z`,
    nutrition_snapshot: null,
  } satisfies HealthMealEntry;
}

function water(id: string, entryDate: string, amountFlOz: number, confirmedAt: string | null) {
  return {
    id,
    user_id: "user-1",
    entry_date: entryDate,
    logged_at: `${entryDate}T09:00:00.000Z`,
    amount: amountFlOz,
    unit: "fl_oz",
    amount_ml: amountFlOz * 29.5735,
    confirmed_at: confirmedAt,
    created_at: `${entryDate}T09:00:00.000Z`,
  } satisfies HealthWaterEntry;
}

function metric(id: string, entryDate: string, metricType: HealthMetricEntry["metric_type"], metricValue: number) {
  return {
    id,
    user_id: "user-1",
    metric_date: entryDate,
    metric_type: metricType,
    metric_value: metricValue,
    source: "manual",
    source_fingerprint: id,
    created_at: `${entryDate}T09:00:00.000Z`,
    updated_at: `${entryDate}T09:00:00.000Z`,
  } satisfies HealthMetricEntry;
}

function signalOccurrence(id: string, entryId: string, entryDate: string) {
  return {
    id,
    user_id: "user-1",
    journal_entry_id: entryId,
    signal_id: `signal-${id}`,
    entry_date: entryDate,
    occurred_at: `${entryDate}T10:00:00.000Z`,
    score: 5,
    note: null,
    created_at: `${entryDate}T10:00:00.000Z`,
    updated_at: `${entryDate}T10:00:00.000Z`,
  } satisfies HealthJournalSignalOccurrence;
}

function symptomOccurrence(id: string, entryId: string, entryDate: string) {
  return {
    id,
    user_id: "user-1",
    symptom_id: `symptom-${id}`,
    journal_entry_id: entryId,
    entry_date: entryDate,
    logged_at: `${entryDate}T10:30:00.000Z`,
    severity: 5,
    note: null,
    created_at: `${entryDate}T10:30:00.000Z`,
    updated_at: `${entryDate}T10:30:00.000Z`,
  } satisfies HealthSymptomEntry;
}

function emptySnapshot() {
  return buildHealthTodaySnapshot({
    checkIns: [],
    date: today,
    focusCategories: [],
    focusHistory: [],
    journalSignalOccurrences: [],
    mealEntries: [],
    metricEntries: [],
    symptomEntries: [],
    waterEntries: [],
  });
}

test("Today is a real snapshot panel with five canonical categories", () => {
  assert.match(pageSource, /<HealthTodayTab/);
  assert.doesNotMatch(pageSource, /id=\{getHealthTabPanelId\("Today"\)\}[^>]*\/>/);
  for (const label of ["Journal", "Food", "Water", "Sleep", "Movement"]) {
    assert.match(todaySource, new RegExp(`label="${label}"`));
  }
  assert.match(todaySource, /Today&apos;s Snapshot/);
  assert.match(todaySource, /Today · \{formatHealthDateLabel\(today\)\.toUpperCase\(\)\}/);
  assert.match(todaySource, /sm:grid-cols-2 xl:grid-cols-3/);
});

test("Today derives Food, confirmed Water, Sleep, and separate Movement metrics from existing helpers", () => {
  const snapshot = buildHealthTodaySnapshot({
    checkIns: [],
    date: today,
    focusCategories: [],
    focusHistory: [],
    journalSignalOccurrences: [],
    mealEntries: [meal("meal-today", today, 1640, 102), meal("meal-old", "2026-08-31", 900, 50)],
    metricEntries: [
      metric("steps-today", today, "steps", 6840),
      metric("minutes-today", today, "exercise_minutes", 22),
      metric("energy-today", today, "active_energy_kcal", 420),
      metric("sleep-today", today, "sleep_minutes", 432),
    ],
    symptomEntries: [],
    waterEntries: [water("confirmed", today, 48, `${today}T09:01:00.000Z`), water("pending", today, 999, null)],
  });

  assert.equal(snapshot.food.calories, 1640);
  assert.equal(snapshot.food.protein, 102);
  assert.equal(snapshot.water.fluidOunces, 48);
  assert.equal(snapshot.sleep.totalMinutes, 432);
  assert.deepEqual(snapshot.movement, { activeEnergyKcal: 420, exerciseMinutes: 22, steps: 6840 });
  assert.notEqual(snapshot.movement.steps + snapshot.movement.exerciseMinutes + snapshot.movement.activeEnergyKcal, snapshot.movement.steps);
  assert.match(todayDerivationSource, /sumMealNutritionForDate/);
  assert.match(todayDerivationSource, /sumWaterForDate/);
  assert.match(todayDerivationSource, /getHealthSleepDayTotal/);
  assert.match(todayDerivationSource, /getHealthDailyMovementMetrics/);
  assert.doesNotMatch(todaySource, /todayMovement/);
});

test("Today Journal uses today's entries, latest represented time, and Journal-owned Feelings", () => {
  const snapshot = buildHealthTodaySnapshot({
    checkIns: [checkIn("yesterday", "2026-08-31", "23:59", 2), checkIn("early", today, "08:00", 4), checkIn("latest", today, "11:00", 7)],
    date: today,
    focusCategories: [],
    focusHistory: [],
    journalSignalOccurrences: [signalOccurrence("one", "latest", today), signalOccurrence("two", "early", today), signalOccurrence("other-entry", "yesterday", today)],
    mealEntries: [],
    metricEntries: [],
    symptomEntries: [symptomOccurrence("three", "latest", today)],
    waterEntries: [],
  });

  assert.equal(snapshot.journal.entryCount, 2);
  assert.equal(snapshot.journal.latestEntry?.id, "latest");
  assert.equal(snapshot.journal.latestEntry?.mood_score, 7);
  assert.equal(snapshot.journal.feelingOccurrenceCount, 3);
});

test("Today renders safe empty states, canonical tab navigation, Quick Log, and Timeline without persistence", () => {
  const snapshot = emptySnapshot();
  assert.equal(snapshot.journal.latestEntry, null);
  assert.equal(snapshot.journal.entryCount, 0);
  assert.equal(snapshot.food.calories, 0);
  assert.equal(snapshot.water.fluidOunces, 0);
  assert.equal(snapshot.sleep.totalMinutes, 0);
  assert.deepEqual(snapshot.movement, { activeEnergyKcal: 0, exerciseMinutes: 0, steps: 0 });
  assert.match(todaySource, /No entry yet/);
  assert.match(todaySource, /No sleep logged/);
  for (const tab of ["Journal", "Food", "Water", "Sleep", "Fitness"]) {
    assert.match(todaySource, new RegExp(`onNavigate\\(\\"${tab}\\"\\)`));
  }
  assert.match(todaySource, /\[\"Workout\", \"Fitness\"\]/);
  assert.match(todaySource, /TODAY TIMELINE/);
  assert.match(todaySource, /No Health activity logged yet today/);
  assert.doesNotMatch(todaySource, /useState|localStorage|supabase|adhdice_health/);
});

test("HealthPage owns Today navigation and passes canonical records without adding Today persistence", () => {
  const todayBranch = pageSource.slice(pageSource.indexOf('{activeTab === "Today"'), pageSource.indexOf('{activeTab === "Fitness"'));
  assert.match(todayBranch, /onNavigate=\{persistHealthTabPreference\}/);
  for (const prop of ["checkIns", "mealEntries", "waterEntries", "metricEntries", "focusHistory", "journalSignals", "journalSignalOccurrences", "symptoms", "symptomEntries", "profile", "weightEntries", "workouts"]) {
    assert.match(todayBranch, new RegExp(`${prop}=`));
  }
  assert.doesNotMatch(todayBranch, /localStorage|supabase|setState|useState/);
});
