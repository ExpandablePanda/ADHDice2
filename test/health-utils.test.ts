import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDefaultHealthProfile,
  buildHealthCoachMessage,
  buildHealthReminderTemplate,
  displayWeightToKilograms,
  getEligibleHealthAchievements,
  kilogramsToDisplayValue,
} from "../src/lib/health-utils.ts";

test("health weight conversion helpers round-trip between pounds and kilograms", () => {
  const kilograms = displayWeightToKilograms(180, "lb");
  assert.ok(Math.abs(kilograms - 81.6466) < 0.01);
  const pounds = kilogramsToDisplayValue(kilograms, "lb");
  assert.ok(Math.abs(pounds - 180) < 0.01);
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
