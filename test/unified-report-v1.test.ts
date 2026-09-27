import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildUnifiedReportReadModel, type UnifiedReportSourceRows } from "../src/lib/unified-report-read-model.ts";
import { generateTaskReport } from "../src/lib/task-report.ts";

const emptySource = (overrides: Partial<UnifiedReportSourceRows> = {}): UnifiedReportSourceRows => ({
  checkIns: [],
  endDateKey: "2026-09-03",
  focusCategories: [],
  focusSessions: [],
  history: [],
  meals: [],
  metrics: [],
  profile: null,
  records: [],
  signalOccurrences: [],
  signalValues: [],
  signals: [],
  startDateKey: "2026-09-01",
  symptomEntries: [],
  symptoms: [],
  tasks: [],
  todayDateKey: "2026-09-03",
  water: [],
  weight: [],
  workouts: [],
  ...overrides,
});

function report(model: ReturnType<typeof buildUnifiedReportReadModel>) {
  return generateTaskReport({
    appVersion: "7.15.56",
    generatedAt: new Date("2026-09-03T12:00:00Z"),
    historySourceLabel: "test compact model",
    historyWarning: null,
    rangeId: "custom",
    customRange: { endDateKey: "2026-09-03", startDateKey: "2026-09-01" },
    reportData: model,
    todayDateKey: "2026-09-03",
  });
}

test("unified report removes detail chips and browser-side broad raw reads", () => {
  const workspace = readFileSync(new URL("../src/components/task-app/task-report-workspace.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(workspace, /TASK_REPORT_DETAIL_OPTIONS|TaskReportDetailLevel|detailLevel|Summary.*Detailed/);
  assert.doesNotMatch(workspace, /select\("\*"\)/);
  assert.match(workspace, /readUnifiedReport\(client, userId/);
  const reportReadClient = readFileSync(new URL("../src/lib/report-read-client.ts", import.meta.url), "utf8");
  assert.match(reportReadClient, /functions\.invoke<UnifiedReportReadModel>\("report-read"/);
  const reportReadDomain = readFileSync(new URL("../supabase/functions/report-read/domain.ts", import.meta.url), "utf8");
  assert.doesNotMatch(reportReadDomain, /select\("\*"\)/);
  assert.match(reportReadDomain, /adhdice_task_history_facts.*entity_id,logical_date,outcome,updated_at/s);
  assert.match(reportReadDomain, /adhdice_health_meal_entries.*entry_date,meal_slot,food_name,calories,protein_g,carbs_g,fat_g/);
  const taskReport = readFileSync(new URL("../src/lib/task-report.ts", import.meta.url), "utf8");
  assert.doesNotMatch(taskReport, /detailLevel|## Overview|Current progress snapshot|Milestone/);
});

test("Task daily outcomes preserve hierarchy and distinguish new misses from cumulative backlog", () => {
  const model = buildUnifiedReportReadModel(emptySource({
    history: [
      { entity_id: "parent", logical_date: "2026-08-31", outcome: "missed", updated_at: "2026-08-31T12:00:00Z" },
      { entity_id: "step", logical_date: "2026-09-01", outcome: "missed", updated_at: "2026-09-01T12:00:00Z" },
      { entity_id: "parent", logical_date: "2026-09-02", outcome: "done", updated_at: "2026-09-02T12:00:00Z" },
    ],
    tasks: [
      { id: "parent", parent_task_id: null, title: "Morning routine" },
      { id: "step", parent_task_id: "parent", title: "Brush teeth" },
    ],
  }));
  assert.deepEqual(model.tasks.days.map((day) => ({ date: day.dateKey, newMisses: day.newMisses, totalMisses: day.totalMisses })), [
    { date: "2026-09-01", newMisses: ["Morning routine > Brush teeth"], totalMisses: 2 },
    { date: "2026-09-02", newMisses: [], totalMisses: 1 },
    { date: "2026-09-03", newMisses: [], totalMisses: 1 },
  ]);
  const markdown = report(model);
  assert.match(markdown, /Total Misses: 2 \(includes 1 new\)/);
  assert.match(markdown, /Morning routine > Brush teeth/);
  assert.doesNotMatch(markdown, /Total Misses: 2 \+ 1/);
});

test("unified report represents every selected date and includes Focus sessions", () => {
  const model = buildUnifiedReportReadModel(emptySource({
    focusCategories: [{ id: "coding", title: "Coding", focus_type: "Work", focus_subtype: null, focus_subtype_2: null }],
    focusSessions: [{ category_id: "coding", duration_seconds: 1500, id: "focus-1", session_date: "2026-09-02", title_snapshot: "Morning sprint" }],
  }));
  assert.deepEqual(model.days.map((day) => day.dateKey), ["2026-09-01", "2026-09-02", "2026-09-03"]);
  assert.equal(model.focus.totalSeconds, 1500);
  assert.equal(model.focus.sessionCount, 1);
  const markdown = report(model);
  assert.match(markdown, /### Sep 1, 2026/);
  assert.match(markdown, /### Sep 2, 2026/);
  assert.match(markdown, /### Sep 3, 2026/);
  assert.match(markdown, /Morning sprint — Coding — 25m/);
});

test("Journal keeps useful human fields while dropping persistence metadata", () => {
  const model = buildUnifiedReportReadModel(emptySource({
    checkIns: [{
      clarity_score: 8,
      energy_score: null,
      entry_date: "2026-09-01",
      entry_time: "08:30",
      entry_type: "start_of_day",
      id: "journal-1",
      mood_score: 7,
      reflection: "Started gently.",
      stress_score: 3,
      symptom_tags: ["headache"],
      structured_answers: { event_description: "A useful check-in", linked_event_ids: ["internal-id"], schema_version: 1 },
    }],
  }));
  const markdown = report(model);
  assert.match(markdown, /Tags: headache/);
  assert.match(markdown, /Reflection: Started gently\./);
  assert.match(markdown, /Event Description: A useful check-in/);
  assert.doesNotMatch(markdown, /internal-id|schema_version/);
});

test("food keeps individual macros small and reports partial daily micronutrient coverage", () => {
  const model = buildUnifiedReportReadModel(emptySource({
    meals: [
      { carbs_g: 2, calories: 280, entry_date: "2026-09-01", fat_g: 20, food_name: "Eggs", food_snapshot: { nutrition_details: { dietary_fiber_g: 1 } }, meal_slot: "breakfast", nutrition_snapshot: null, protein_g: 24 },
      { carbs_g: 30, calories: 200, entry_date: "2026-09-01", fat_g: 4, food_name: "Toast", food_snapshot: null, meal_slot: "breakfast", nutrition_snapshot: null, protein_g: 6 },
    ],
    profile: { calorie_goal: 2200, carbs_goal_grams: 200, fat_goal_grams: 70, preferred_weight_unit: "lb", protein_goal_grams: 150, sleep_goal_minutes: 480, water_goal_ml: 2365 },
  }));
  const day = model.days[0];
  assert.deepEqual(day.food.macros, { calories: 480, carbs_g: 32, fat_g: 24, protein_g: 30 });
  const markdown = report(model);
  assert.match(markdown, /Eggs\n  - 280 kcal \| 24g protein \| 2g carbs \| 20g fat/);
  assert.match(markdown, /Daily Nutrition Summary \(partial known-data coverage\)/);
  assert.doesNotMatch(markdown, /Eggs[\s\S]*Vitamin|Eggs[\s\S]*Sodium/);
});

test("food omits missing individual macros without changing known values", () => {
  const model = buildUnifiedReportReadModel(emptySource({
    meals: [{ carbs_g: 39, calories: 140, entry_date: "2026-09-01", fat_g: null, food_name: "Caffeine Free", food_snapshot: null, meal_slot: "snack", nutrition_snapshot: null, protein_g: null }],
  }));
  const markdown = report(model);
  assert.match(markdown, /Caffeine Free\n  - 140 kcal \| 39g carbs/);
  assert.doesNotMatch(markdown, /Caffeine Free\n  - [^\n]*unknown/);
  assert.doesNotMatch(markdown, /Caffeine Free\n  - [^\n]*protein|Caffeine Free\n  - [^\n]*fat/);
});

test("nutrition summary omits unavailable and zero nutrients while preserving useful coverage and labels", () => {
  const model = buildUnifiedReportReadModel(emptySource({
    meals: [
      { carbs_g: 1, calories: 100, entry_date: "2026-09-01", fat_g: 1, food_name: "Known", food_snapshot: { nutrition_details: { dietary_fiber_g: 6.8, sodium_mg: 1769.5, vitamin_c_mg: 130, saturated_fat_g: 1.2, vitamin_b12_mcg: 2, choline_mg: 10, copper_mg: 0, vitamin_a_mcg_rae: 0, vitamin_e_mg: null } }, meal_slot: "breakfast", nutrition_snapshot: null, protein_g: 1 },
      { carbs_g: 1, calories: 100, entry_date: "2026-09-01", fat_g: 1, food_name: "Partial", food_snapshot: { nutrition_details: { dietary_fiber_g: null, sodium_mg: null, vitamin_c_mg: null, saturated_fat_g: null, vitamin_b12_mcg: null, choline_mg: null, copper_mg: 0, vitamin_a_mcg_rae: 0, vitamin_e_mg: null } }, meal_slot: "breakfast", nutrition_snapshot: null, protein_g: 1 },
    ],
  }));
  const markdown = report(model);
  assert.match(markdown, /Daily Nutrition Summary \(partial known-data coverage\)/);
  assert.match(markdown, /- Fiber: 6\.8g \(1 of 2 food entries known\)/);
  assert.match(markdown, /- Sodium: 1,769\.5mg \(1 of 2 food entries known\)/);
  assert.match(markdown, /- Vitamin C: 130mg \(1 of 2 food entries known\)/);
  assert.match(markdown, /- Saturated Fat: 1\.2g \(1 of 2 food entries known\)/);
  assert.match(markdown, /- Vitamin B12: 2mcg \(1 of 2 food entries known\)/);
  assert.match(markdown, /- Choline: 10mg \(1 of 2 food entries known\)/);
  assert.doesNotMatch(markdown, /Copper: 0mg|Vitamin A: 0mcg|Vitamin E: 0mg/);
  assert.doesNotMatch(markdown, /Saturated Fat G|Vitamin B12 Mcg|Choline Mg/);
});

test("nutrition summary omits values that round to displayed zero", () => {
  const model = buildUnifiedReportReadModel(emptySource({
    meals: [{ carbs_g: 1, calories: 100, entry_date: "2026-09-01", fat_g: 1, food_name: "Trace nutrients", food_snapshot: { nutrition_details: { vitamin_b6_mg: 0.04, vitamin_d_mcg: 0.1 } }, meal_slot: "breakfast", nutrition_snapshot: null, protein_g: 1 }],
  }));
  const markdown = report(model);
  assert.doesNotMatch(markdown, /Vitamin B6: 0mg/);
  assert.match(markdown, /Vitamin D: 0\.1mcg/);
});

test("unavailable PATHS and On-Time sections are omitted from summary and daily detail", () => {
  const markdown = report(buildUnifiedReportReadModel(emptySource()));
  assert.doesNotMatch(markdown, /^### PATHS$/m);
  assert.doesNotMatch(markdown, /^#### PATHS$/m);
  assert.doesNotMatch(markdown, /^### On-Time$/m);
  assert.doesNotMatch(markdown, /^#### On-Time$/m);
  assert.doesNotMatch(markdown, /No persisted PATHS|Historical On-Time sessions/);
});

test("water and weight emit logged and Not logged states", () => {
  const model = buildUnifiedReportReadModel(emptySource({
    water: [{ amount_ml: 1892, confirmed_at: "2026-09-01T20:00:00Z", entry_date: "2026-09-01" }],
    weight: [{ entry_date: "2026-09-01", logged_at: "2026-09-01T08:00:00Z", weight_kg: 109.68 }],
  }));
  const markdown = report(model);
  assert.match(markdown, /64 fl oz/);
  assert.match(markdown, /### Sep 2, 2026[\s\S]*#### Water\n- Not logged/);
  assert.match(markdown, /#### Weight\n- 241\.8 lb/);
});

test("Achievements and Records are range-scoped and do not emit current snapshots", () => {
  const model = buildUnifiedReportReadModel(emptySource({
    records: [
      { credited_date: "2026-09-02", event_kind: "set", metric_key: "global_tasks_done", scope_id: null, scope_kind: "global", title_snapshot: null, unit: "tasks", value: 10 },
      { credited_date: "2026-08-31", event_kind: "set", metric_key: "global_tasks_done", scope_id: null, scope_kind: "global", title_snapshot: null, unit: "tasks", value: 9 },
    ],
  }));
  const markdown = generateTaskReport({
    appVersion: "7.15.56",
    generatedAt: new Date("2026-09-03T12:00:00Z"),
    historySourceLabel: "test compact model",
    historyWarning: null,
    rangeId: "custom",
    customRange: { endDateKey: "2026-09-03", startDateKey: "2026-09-01" },
    reportData: model,
    todayDateKey: "2026-09-03",
    achievementModel: {
      collections: [{ masteredAt: null, title: "Consistency", tracks: [{ title: "Finisher", tiers: [{ earnedAt: "2026-09-02T12:00:00Z", id: "bronze" }] }] }],
    } as never,
  });
  assert.match(markdown, /Finisher.*Earned: Sep 2, 2026/);
  assert.match(markdown, /Set: Global Tasks Done — Sep 2, 2026/);
  assert.doesNotMatch(markdown, /Sep 31|Sep 1, 2026.*Global Tasks Done/);
  assert.doesNotMatch(markdown, /Current global Records|Current per-task Records snapshot|Current progress snapshot/);
});
