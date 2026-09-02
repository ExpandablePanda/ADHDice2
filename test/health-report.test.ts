import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { HealthCheckIn, HealthJournalSignal, HealthMealEntry, HealthMetricEntry, HealthProfile, HealthSymptom, HealthSymptomEntry, HealthWaterEntry, HealthWorkout } from "../src/lib/database.types.ts";
import { EMPTY_HEALTH_REPORT_DATA, formatHealthReportSection, type HealthReportData } from "../src/lib/health-report.ts";
import type { ReportDateRange } from "../src/lib/report-presentation.ts";
import { createTask } from "../src/lib/task-buckets.ts";
import { getBuiltInTaskLists } from "../src/lib/task-lists.ts";
import { generateTaskReport } from "../src/lib/task-report.ts";

const range: ReportDateRange & { spanDays: number } = { endDateKey: "2026-09-02", spanDays: 3, startDateKey: "2026-08-31" };

const profile: HealthProfile = {
  carbs_goal_grams: 200,
  calorie_goal: 2000,
  created_at: "2026-01-01T00:00:00.000Z",
  fat_goal_grams: 70,
  movement_goal: 1,
  movement_goal_calories: 300,
  movement_goal_minutes: 30,
  preferred_weight_unit: "lb",
  protein_goal_grams: 120,
  sleep_goal_minutes: 420,
  target_weight_kg: 80,
  updated_at: "2026-01-01T00:00:00.000Z",
  user_id: "user-1",
  water_goal_ml: 2000,
  workout_title_options: [],
  workout_type_options: [],
  workout_import_aliases: {},
};

const checkIns: HealthCheckIn[] = [
  { id: "journal-1", user_id: "user-1", entry_date: "2026-08-31", entry_time: "08:00", mood_score: 7, energy_score: null, stress_score: 3, clarity_score: 8, symptom_tags: [], reflection: "Started gently.", created_at: "2026-08-31T08:00:00.000Z", updated_at: "2026-08-31T08:00:00.000Z" },
  { id: "journal-2", user_id: "user-1", entry_date: "2026-08-31", entry_time: "20:00", mood_score: 5, energy_score: 6, stress_score: null, clarity_score: null, symptom_tags: [], reflection: "", created_at: "2026-08-31T20:00:00.000Z", updated_at: "2026-08-31T20:00:00.000Z" },
];

const journalSignals: HealthJournalSignal[] = [{ id: "feeling-1", user_id: "user-1", kind: "emotion", symptom_id: null, name: "Calm", color: "#000000", low_label: "Low", high_label: "High", scale_labels: ["None", "1", "2", "3", "4", "5", "6", "7", "8", "9", "High"], in_template: true, template_sort_order: 0, archived_at: null, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" }];
const symptoms: HealthSymptom[] = [{ id: "symptom-1", user_id: "user-1", name: "Headache", color: "#000000", archived_at: null, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" }];

const data: HealthReportData = {
  checkIns,
  dateKeys: [],
  isAvailable: true,
  journalSignalOccurrences: [{ id: "occurrence-1", user_id: "user-1", journal_entry_id: "journal-1", signal_id: "feeling-1", entry_date: "2026-09-01", occurred_at: "2026-09-01T12:00:00.000Z", score: 4, note: "After lunch", created_at: "2026-09-01T12:00:00.000Z", updated_at: "2026-09-01T12:00:00.000Z" }],
  journalSignalValues: [{ id: "value-1", user_id: "user-1", journal_entry_id: "journal-1", signal_id: "feeling-1", score: 0, created_at: "2026-08-31T08:00:00.000Z", updated_at: "2026-08-31T08:00:00.000Z" }],
  journalSignals,
  mealEntries: [
    { id: "meal-1", user_id: "user-1", entry_date: "2026-08-31", meal_slot: "breakfast", logged_at: "2026-08-31T09:00:00.000Z", food_name: "Oats", brand_name: "Kitchen", serving_label: "1 bowl", calories: 500, protein_g: null, carbs_g: 80, fat_g: 10, barcode: null, provider: "provider-item", provider_item_id: "provider-id", attribution: null, nutrition_snapshot: { calories: 500, protein_g: null, carbs_g: 80, fat_g: 10, nutrition_details: { sodium_mg: 100 } }, created_at: "2026-08-31T09:00:00.000Z", updated_at: "2026-08-31T09:00:00.000Z" },
    { id: "meal-2", user_id: "user-1", entry_date: "2026-09-01", meal_slot: "lunch", logged_at: "2026-09-01T13:00:00.000Z", food_name: "Soup", brand_name: null, serving_label: "1 cup", calories: 300, protein_g: 20, carbs_g: 30, fat_g: 5, barcode: null, provider: "manual", provider_item_id: null, attribution: null, created_at: "2026-09-01T13:00:00.000Z", updated_at: "2026-09-01T13:00:00.000Z" },
  ],
  metricEntries: [
    { id: "steps-1", user_id: "user-1", metric_type: "steps", metric_date: "2026-08-31", metric_value: 5000, source: "manual", source_fingerprint: "fingerprint", created_at: "2026-08-31T00:00:00.000Z", updated_at: "2026-08-31T00:00:00.000Z" },
    { id: "sleep-1", user_id: "user-1", metric_type: "sleep_minutes", metric_date: "2026-09-01", metric_value: 420, source: "apple_health_import", source_fingerprint: "sleep-fingerprint", created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z" },
  ] as HealthMetricEntry[],
  profile,
  symptomEntries: [{ id: "symptom-entry-1", user_id: "user-1", symptom_id: "symptom-1", journal_entry_id: "journal-1", entry_date: "2026-09-01", logged_at: "2026-09-01T10:00:00.000Z", severity: 6, note: "Use a quieter block", created_at: "2026-09-01T10:00:00.000Z", updated_at: "2026-09-01T10:00:00.000Z" }] as HealthSymptomEntry[],
  symptoms,
  warnings: [],
  waterEntries: [
    { id: "water-confirmed", user_id: "user-1", entry_date: "2026-08-31", logged_at: "2026-08-31T10:00:00.000Z", amount: 2, unit: "cup", amount_ml: 480, confirmed_at: "2026-08-31T10:00:00.000Z", created_at: "2026-08-31T10:00:00.000Z" },
    { id: "water-pending", user_id: "user-1", entry_date: "2026-09-01", logged_at: "2026-09-01T10:00:00.000Z", amount: 8, unit: "fl_oz", amount_ml: 237, confirmed_at: null, created_at: "2026-09-01T10:00:00.000Z" },
  ] as HealthWaterEntry[],
  weightEntries: [
    { id: "weight-1", user_id: "user-1", entry_date: "2026-08-31", logged_at: "2026-08-31T07:00:00.000Z", weight_kg: 82, source: "manual", note: "Morning", created_at: "2026-08-31T07:00:00.000Z", updated_at: "2026-08-31T07:00:00.000Z" },
    { id: "weight-2", user_id: "user-1", entry_date: "2026-09-02", logged_at: "2026-09-02T07:00:00.000Z", weight_kg: 80, source: "manual", note: null, created_at: "2026-09-02T07:00:00.000Z", updated_at: "2026-09-02T07:00:00.000Z" },
  ] as HealthWeightEntry[],
  workouts: [{ id: "workout-1", user_id: "user-1", workout_date: "2026-09-01", started_at: "2026-09-01T18:00:00.000Z", ended_at: "2026-09-01T18:30:00.000Z", duration_seconds: 1800, title: "Walk", workout_type: "Walking", active_calories: 150, notes: "Easy pace", source: "manual", source_external_id: "external-id", created_at: "2026-09-01T18:00:00.000Z", updated_at: "2026-09-01T18:00:00.000Z" }] as HealthWorkout[],
};

test("Health report summarizes range-scoped domains without inventing missing values", () => {
  const report = formatHealthReportSection(data, range, false);
  const markdown = report.join("\n");
  assert.match(markdown, /Current Health Goals/);
  assert.match(markdown, /Days with food logged: 2/);
  assert.match(markdown, /Total calories: 800 kcal/);
  assert.match(markdown, /Average calories per logged day: 400 kcal/);
  assert.match(markdown, /Average protein from known nutrition data: 20 g across 1 logged day \(1 of 2 Food entries had known protein; 1 of 2 logged days fully covered\)/);
  assert.match(markdown, /Days with water logged: 1/);
  assert.match(markdown, /Total consumed water: 16\.23 fl oz/);
  assert.match(markdown, /Journal Entries: 2/);
  assert.match(markdown, /Energy: 1 logged; average 6/);
  assert.match(markdown, /Calm: 1 logged value; Explicit None 1/);
  assert.match(markdown, /Headache: 1 occurrence; average severity 6/);
  assert.match(markdown, /Calm: 1 occurrence; average score 4/);
  assert.match(markdown, /Measurements: 2/);
  assert.match(markdown, /Change from earliest to latest: -4.4 lb/);
  assert.match(markdown, /Steps: 1 recorded day/);
  assert.match(markdown, /Average duration per recorded day: 7h/);
  assert.match(markdown, /Workout count: 1/);
  assert.doesNotMatch(markdown, /water-pending|provider-id|fingerprint|external-id/);
});

test("Food nutrition targets use descriptive comparisons without changing known values", () => {
  const targetData: HealthReportData = {
    ...data,
    mealEntries: [{
      ...data.mealEntries[1],
      calories: 1813.5,
      carbs_g: 263.5,
      entry_date: "2026-09-02",
      fat_g: 60.3,
      id: "meal-target",
      nutrition_snapshot: null,
      protein_g: 87.8,
    }],
    profile: {
      ...profile,
      calorie_goal: 1813.5,
      carbs_goal_grams: 150,
      fat_goal_grams: 55,
      protein_goal_grams: 150,
    },
  };
  const markdown = formatHealthReportSection(targetData, range, false).join("\n");
  assert.match(markdown, /Current target: 150 g\/day protein; average 87\.8 g\/day protein; 62\.2 g below target/);
  assert.match(markdown, /Current target: 150 g\/day carbs; average 263\.5 g\/day carbs; 113\.5 g above target/);
  assert.match(markdown, /Current target: 55 g\/day fat; average 60\.3 g\/day fat; 5\.3 g above target/);
  assert.match(markdown, /Current target: 1,813\.5 kcal\/day; average 1,813\.5 kcal\/day; at target/);
  assert.doesNotMatch(markdown, /\b(?:met|failed|good|bad|over goal|under goal)\b/i);
});

test("Food calorie targets use each date's Active Energy and exclude workout calories", () => {
  const reportData: HealthReportData = {
    ...data,
    metricEntries: [
      ...data.metricEntries,
      { id: "energy-aug-31", user_id: "user-1", metric_type: "active_energy_kcal", metric_date: "2026-08-31", metric_value: 356.8, source: "manual", source_fingerprint: "energy-aug-31", created_at: "2026-08-31T23:00:00.000Z", updated_at: "2026-08-31T23:00:00.000Z" },
      { id: "energy-sep-01", user_id: "user-1", metric_type: "active_energy_kcal", metric_date: "2026-09-01", metric_value: 0, source: "manual", source_fingerprint: "energy-sep-01", created_at: "2026-09-01T23:00:00.000Z", updated_at: "2026-09-01T23:00:00.000Z" },
    ],
    profile: { ...profile, calorie_goal: 1900 },
    workouts: [{ ...data.workouts[0], active_calories: 900 }],
  };
  const summary = formatHealthReportSection(reportData, range, false).join("\n");
  const detailed = formatHealthReportSection(reportData, range, true).join("\n");

  assert.match(summary, /Average adjusted calorie target per logged day: 2,078\.4 kcal/);
  assert.match(summary, /Current target: 2,078\.4 kcal\/day; average 400 kcal\/day; 1,678\.4 kcal below target/);
  assert.match(detailed, /Adjusted calorie target: 2,256\.8 kcal\/day/);
  assert.match(detailed, /Adjusted calorie target: 1,900 kcal\/day/);
  assert.doesNotMatch(detailed, /Adjusted calorie target: 3,156\.8 kcal\/day/);
});

test("detailed workout reports use imported display aliases without changing arithmetic", () => {
  const markdown = formatHealthReportSection({
    ...data,
    profile: { ...profile, workout_import_aliases: { Walk: "Aquatic Movement" } },
    workouts: [{ ...data.workouts[0], source: "apple_health_import", title: "Walk", workout_type: "Activity 53", duration_seconds: 1800, active_calories: 150 }],
  }, range, true).join("\n");
  assert.match(markdown, /Aquatic Movement/);
  assert.match(markdown, /Workout count: 1/);
  assert.match(markdown, /Total active calories where known: 150 kcal/);
  assert.match(markdown, /Type: Activity 53/);
});

test("Food nutrition coverage keeps zero known, null unknown, and partial days explicit", () => {
  const partialMeal = (id: string, values: Pick<HealthMealEntry, "protein_g" | "carbs_g" | "fat_g">): HealthMealEntry => ({
    ...data.mealEntries[1],
    ...values,
    calories: 100,
    entry_date: "2026-09-02",
    id,
    logged_at: `2026-09-02T${id === "meal-zero" ? "12" : "13"}:00:00.000Z`,
    nutrition_snapshot: null,
  });
  const partialData: HealthReportData = {
    ...data,
    mealEntries: [
      partialMeal("meal-zero", { carbs_g: null, fat_g: null, protein_g: 0 }),
      partialMeal("meal-unknown", { carbs_g: 20, fat_g: null, protein_g: null }),
    ],
  };
  const markdown = formatHealthReportSection(partialData, range, false).join("\n");
  assert.match(markdown, /Average protein from known nutrition data: 0 g across 1 logged day \(1 of 2 Food entries had known protein; 0 of 1 logged days fully covered\)/);
  assert.match(markdown, /Average carbs from known nutrition data: 20 g across 1 logged day \(1 of 2 Food entries had known carbs; 0 of 1 logged days fully covered\)/);
  assert.match(markdown, /Average fat from known nutrition data: unknown across 0 logged days \(0 of 2 Food entries had known fat; 0 of 1 logged days fully covered\)/);
  assert.match(markdown, /Current target: 120 g\/day protein; average 0 g\/day protein; 120 g below target \(1 of 2 Food entries had known protein; 0 of 1 logged days fully covered\)/);
  assert.doesNotMatch(markdown, /Average protein from known nutrition data: unknown/);
});

test("Health report occurrence grammar distinguishes singular and plural", () => {
  const pluralData: HealthReportData = {
    ...data,
    journalSignalOccurrences: [
      ...data.journalSignalOccurrences,
      { ...data.journalSignalOccurrences[0], id: "occurrence-2", occurred_at: "2026-09-01T13:00:00.000Z" },
    ],
    symptomEntries: [
      ...data.symptomEntries,
      { ...data.symptomEntries[0], id: "symptom-entry-2", logged_at: "2026-09-01T11:00:00.000Z" },
    ],
  };
  const markdown = formatHealthReportSection(pluralData, range, false).join("\n");
  assert.match(markdown, /Headache: 2 occurrences; average severity 6/);
  assert.match(markdown, /Calm: 2 occurrences; average score 4/);
});

test("Current Health Goals formats sleep duration with the shared formatter", () => {
  const markdown = formatHealthReportSection({ ...data, profile: { ...profile, sleep_goal_minutes: 450 } }, range, false).join("\n");
  assert.match(markdown, /- Sleep: 7h 30m\/night/);
});

test("Health report detailed mode retains user-facing records and semantic labels", () => {
  const markdown = formatHealthReportSection(data, range, true).join("\n");
  assert.match(markdown, /Oats — Kitchen — 1 bowl — 500 kcal/);
  assert.match(markdown, /Nutrition details: Sodium 100mg/);
  assert.match(markdown, /Entered 2 cup/);
  assert.match(markdown, /Mood: 7/);
  assert.match(markdown, /Energy: Not logged/);
  assert.match(markdown, /Calm: None/);
  assert.match(markdown, /Note: Use a quieter block/);
  assert.match(markdown, /Source: Manual/);
  assert.doesNotMatch(markdown, /Not logged.*0/);
});

test("Health report failure is explicit and does not become fake zero data", () => {
  const markdown = formatHealthReportSection({ ...data, isAvailable: false, warnings: ["Food failed to load (timeout)."] }, range, false).join("\n");
  assert.match(markdown, /Health data is unavailable/);
  assert.match(markdown, /Food failed to load/);
  assert.doesNotMatch(markdown, /Total calories: 0/);
});

test("Detailed ADHDice report includes current Task metadata while Summary stays compact", () => {
  const task = createTask({
    active_occurrence_due_on: "2026-09-06",
    actual_seconds: 3660,
    due_on: "2026-09-13",
    due_time: "14:30",
    energy: "high",
    estimated_minutes: 45,
    external_link_label: "Spec",
    external_link_url: "https://example.test/spec",
    id: "task-internal-id",
    notes: "Keep this note in detailed mode.",
    repeat_frequency: "daily",
    tags: ["important"],
    title: "Write report",
  });
  const common = {
    appVersion: "7.12.62",
    availableTaskLists: getBuiltInTaskLists(),
    focusCategories: [],
    focusHistory: [],
    generatedAt: new Date("2026-09-02T12:00:00.000Z"),
    historySourceLabel: "Full selected date range fetch",
    historyWarning: null,
    listMembershipsByTaskId: { [task.id]: [{ id: "routine", isManual: true, source: "manual" as const }] },
    rangeId: "today" as const,
    taskHistory: [{ id: "history-id", task_id: task.id, user_id: "user-1", entry_date: "2026-09-02", occurrence_key: null, occurrence_due_on: null, status: "done" as const, event_type: "status" as const, counted_as_due_occurrence: true, was_completed: true, created_at: "2026-09-02T12:00:00.000Z", updated_at: "2026-09-02T12:00:00.000Z" }],
    tasks: [task],
    todayDateKey: "2026-09-02",
  };
  const detailed = generateTaskReport({ ...common, detailLevel: "detailed" });
  assert.match(detailed, /Due: Sep 13, 2026 at 2:30 PM/);
  assert.doesNotMatch(detailed, /Due: Sep 6, 2026/);
  assert.match(detailed, /Energy: high/);
  assert.match(detailed, /Estimated Time: 45m/);
  assert.match(detailed, /Actual Time: 1h 1m/);
  assert.match(detailed, /Lists: Routine/);
  assert.match(detailed, /Tags: important/);
  assert.match(detailed, /External Link: Spec — https:\/\/example\.test\/spec/);
  assert.match(detailed, /Notes: Keep this note in detailed mode\./);
  const summary = generateTaskReport({ ...common, detailLevel: "summary" });
  assert.doesNotMatch(summary, /Keep this note|External Link:|Tags: important/);
});

test("All available report range includes older Health dates", () => {
  const report = generateTaskReport({
    appVersion: "7.12.62",
    availableTaskLists: getBuiltInTaskLists(),
    detailLevel: "summary",
    focusCategories: [],
    focusHistory: [],
    generatedAt: new Date("2026-09-02T12:00:00.000Z"),
    healthData: { ...EMPTY_HEALTH_REPORT_DATA, dateKeys: ["2026-05-01"], mealEntries: [] },
    historySourceLabel: "Full selected date range fetch",
    historyWarning: null,
    rangeId: "all",
    taskHistory: [],
    tasks: [],
    todayDateKey: "2026-09-02",
  });
  assert.match(report, /Selected Date Range: All available \(May 1, 2026 to Sep 2, 2026\)/);
});

test("Report workspace fetches persisted Health independently of the Health page", () => {
  const source = readFileSync(new URL("../src/components/task-app/task-report-workspace.tsx", import.meta.url), "utf8");
  assert.match(source, /fetchHealthReportDataForRange/);
  assert.match(source, /adhdice_health_checkins/);
  assert.match(source, /adhdice_health_meal_entries/);
  assert.match(source, /adhdice_health_water_entries/);
  assert.match(source, /adhdice_health_metric_entries/);
  assert.match(source, /journal_entry_id/);
  assert.doesNotMatch(source, /useHealth\(/);
});
