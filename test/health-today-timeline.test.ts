import assert from "node:assert/strict";
import test from "node:test";

import type {
  HealthCheckIn,
  HealthJournalSignal,
  HealthJournalSignalOccurrence,
  HealthMealEntry,
  HealthMetricEntry,
  HealthSymptom,
  HealthSymptomEntry,
  HealthWaterEntry,
  HealthWeightEntry,
  HealthWorkout,
} from "@/lib/database.types";
import { buildHealthTodayTimeline } from "@/lib/health-today";

const today = "2026-09-01";
const at = (time: string) => `${today}T${time.length === 5 ? `${time}:00` : time}`;

function checkIn(id: string, entryTime: string, overrides: Partial<HealthCheckIn> = {}) {
  return {
    id,
    user_id: "user-1",
    entry_date: today,
    entry_time: entryTime,
    mood_score: null,
    energy_score: null,
    stress_score: null,
    clarity_score: null,
    symptom_tags: [],
    reflection: "",
    created_at: at("23:59"),
    updated_at: at("23:59"),
    ...overrides,
  } satisfies HealthCheckIn;
}

function meal(id: string, loggedAt: string, mealSlot: HealthMealEntry["meal_slot"] = "breakfast", calories = 100, snapshotCalories: number | null = null) {
  return {
    id,
    user_id: "user-1",
    entry_date: today,
    meal_slot: mealSlot,
    logged_at: loggedAt,
    food_name: id,
    brand_name: null,
    serving_label: "1 serving",
    calories,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    barcode: null,
    provider: "manual",
    provider_item_id: null,
    attribution: null,
    created_at: loggedAt,
    updated_at: loggedAt,
    nutrition_snapshot: snapshotCalories === null ? null : { calories: snapshotCalories, protein_g: null, carbs_g: null, fat_g: null },
  } satisfies HealthMealEntry;
}

function water(id: string, loggedAt: string, confirmedAt: string | null) {
  return {
    id,
    user_id: "user-1",
    entry_date: today,
    logged_at: loggedAt,
    amount: 20,
    unit: "fl_oz",
    amount_ml: 591,
    confirmed_at: confirmedAt,
    created_at: loggedAt,
  } satisfies HealthWaterEntry;
}

function signal(id: string, kind: HealthJournalSignal["kind"], name: string) {
  return {
    id,
    user_id: "user-1",
    kind,
    symptom_id: null,
    name,
    color: "#8d7bf5",
    low_label: "None",
    high_label: "Extreme",
    scale_labels: [],
    in_template: true,
    template_sort_order: 0,
    archived_at: null,
    created_at: at("00:00"),
    updated_at: at("00:00"),
  } satisfies HealthJournalSignal;
}

function occurrence(id: string, entryId: string, signalId: string, occurredAt: string) {
  return {
    id,
    user_id: "user-1",
    journal_entry_id: entryId,
    signal_id: signalId,
    entry_date: today,
    occurred_at: occurredAt,
    score: 4,
    note: null,
    created_at: occurredAt,
    updated_at: occurredAt,
  } satisfies HealthJournalSignalOccurrence;
}

function symptom(id: string, name: string) {
  return {
    id,
    user_id: "user-1",
    name,
    color: "#8d7bf5",
    archived_at: null,
    created_at: at("00:00"),
    updated_at: at("00:00"),
  } satisfies HealthSymptom;
}

function symptomEntry(id: string, entryId: string, symptomId: string, loggedAt: string) {
  return {
    id,
    user_id: "user-1",
    symptom_id: symptomId,
    journal_entry_id: entryId,
    entry_date: today,
    logged_at: loggedAt,
    severity: 6,
    note: null,
    created_at: loggedAt,
    updated_at: loggedAt,
  } satisfies HealthSymptomEntry;
}

function timeline(overrides: Partial<Parameters<typeof buildHealthTodayTimeline>[0]> = {}) {
  return buildHealthTodayTimeline({
    checkIns: [],
    date: today,
    focusCategories: [],
    focusHistory: [],
    journalSignals: [],
    journalSignalOccurrences: [],
    mealEntries: [],
    symptomEntries: [],
    symptoms: [],
    waterEntries: [],
    weightEntries: [],
    workouts: [],
    ...overrides,
  });
}

test("Today Timeline filters to today, sorts timed records first, and breaks ties deterministically", () => {
  const events = timeline({
    checkIns: [checkIn("journal", "08:10")],
    mealEntries: [meal("meal", at("09:40")), { ...meal("old", "2026-08-31T07:00:00"), entry_date: "2026-08-31" }],
    waterEntries: [water("water", at("09:40"), at("09:41"))],
    weightEntries: [{ id: "untimed", entry_date: today, logged_at: "invalid", weight_kg: 80, note: null } as HealthWeightEntry],
  });

  assert.deepEqual(events.map((event) => event.id), ["journal:journal", "meal:meal", "water:water", "weight:untimed"]);
  assert.equal(events.at(-1)?.timeLabel, "Time not logged");
  assert.ok(events[1]!.sortMinutes! <= events[2]!.sortMinutes!);
});

test("Food Timeline uses actual rows, excludes plans by construction, groups only the same slot and minute, and sums snapshots", () => {
  const events = timeline({
    mealEntries: [
      meal("one", at("11:08"), "breakfast", 999, 50),
      meal("two", at("11:08:59"), "breakfast", 999, 150),
      meal("later", at("11:09"), "breakfast", 60, 60),
    ],
  });

  assert.equal(events.length, 2);
  assert.equal(events[0]!.kind, "meal");
  assert.match(events[0]!.detail, /200 kcal/);
  assert.doesNotMatch(events[0]!.detail, /1998/);
  assert.match(events[1]!.detail, /60 kcal/);
});

test("Water and canonical Feeling occurrences retain their semantics and names", () => {
  const events = timeline({
    checkIns: [checkIn("entry", "08:00")],
    journalSignals: [signal("emotion", "emotion", "Anxiety"), signal("other", "other", "Focus")],
    journalSignalOccurrences: [occurrence("emotion-occurrence", "entry", "emotion", at("16:15")), occurrence("other-occurrence", "entry", "other", at("16:20"))],
    symptomEntries: [symptomEntry("symptom-occurrence", "entry", "reflux", at("13:30"))],
    symptoms: [symptom("reflux", "Reflux")],
    waterEntries: [water("confirmed", at("09:40"), at("09:41")), water("pending", at("09:45"), null)],
  });

  assert.equal(events.filter((event) => event.kind === "water").length, 1);
  assert.deepEqual(events.filter((event) => event.kind === "feeling").map((event) => [event.title, event.detail]), [
    ["Symptom", "Reflux · 6/10"],
    ["Emotion", "Anxiety · 4/10"],
    ["Other Feeling", "Focus · 4/10"],
  ]);
  assert.equal(events.filter((event) => event.kind === "journal").length, 1);
});

test("Workout, Weight, Journal, and Sleep Timeline events use their canonical activity values", () => {
  const events = timeline({
    checkIns: [checkIn("journal", "22:30", { mood_score: 7, energy_score: null, stress_score: 5, reflection: "A reflection" })],
    focusCategories: [{ id: "sleep-category", title: "Sleep", focusType: "Sleep", color: "#8d7bf5", icon: "moon" }],
    focusHistory: [
      { id: "sleep", categoryId: "sleep-category", title: "Sleep", date: today, startedAt: at("23:15"), endedAt: at("06:27"), durationSeconds: 7 * 3600 + 12 * 60, focusType: "Sleep" },
      { id: "untimed-sleep", categoryId: "sleep-category", title: "Nap", date: today, startedAt: null, endedAt: at("15:00"), durationSeconds: 2700, focusType: "Sleep", createdAt: at("14:00") },
    ],
    metricEntries: [{ metric_date: today, metric_type: "sleep_minutes", metric_value: 480 } as HealthMetricEntry],
    weightEntries: [{ id: "weight", entry_date: today, logged_at: at("07:45"), weight_kg: 83.55, note: null } as HealthWeightEntry],
    workouts: [{ id: "workout", workout_date: today, started_at: at("18:20"), ended_at: at("19:02"), duration_seconds: 2520, title: "Upper Body", workout_type: "Strength", active_calories: 320 } as HealthWorkout, { id: "untimed-workout", workout_date: today, started_at: null, created_at: at("12:00"), duration_seconds: 600, title: "Walk", workout_type: "Cardio" } as HealthWorkout],
    preferredWeightUnit: "lb",
  });

  assert.equal(events.find((event) => event.id === "workout:workout")?.detail, "Upper Body · 42m");
  assert.equal(events.find((event) => event.id === "workout:untimed-workout")?.timeLabel, "Time not logged");
  assert.equal(events.find((event) => event.kind === "weight")?.detail, "184.2 lb");
  assert.equal(events.find((event) => event.kind === "journal")?.sortMinutes, 22 * 60 + 30);
  assert.equal(events.find((event) => event.kind === "journal")?.detail, "Mood 7 · Stress 5");
  assert.equal(events.find((event) => event.id === "sleep:sleep")?.title, "Sleep");
  assert.equal(events.find((event) => event.id === "sleep:sleep")?.detail, "7h 12m");
  assert.equal(events.find((event) => event.id === "sleep:untimed-sleep")?.timeLabel, "Time not logged");
  assert.equal(events.filter((event) => event.kind === "sleep").length, 2);
});
