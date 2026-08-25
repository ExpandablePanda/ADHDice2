import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type {
  HealthFitnessPlan,
  HealthFitnessPlanItem,
  HealthWorkout,
  HealthWorkoutPlanItemLink,
} from "@/lib/database.types";
import {
  buildActiveHealthFitnessPlanWeekViews,
  getHealthPlanItemWeekStatus,
  getHealthPlanWeekdayDate,
  getHealthWorkoutPlanItemLabel,
  isHealthWorkoutInWeek,
  reconcileHealthFitnessPlanItemDraft,
} from "@/lib/health-fitness-plans";
import { getHealthWeekBounds } from "@/lib/health-fitness";

const migration = readFileSync(new URL("../supabase/add_health_fitness_plans_7_11_44.sql", import.meta.url), "utf8");
const plansHook = readFileSync(new URL("../src/hooks/useFitnessPlans.ts", import.meta.url), "utf8");
const plansPanel = readFileSync(new URL("../src/components/task-app/health-fitness-plans-panel.tsx", import.meta.url), "utf8");
const healthHook = readFileSync(new URL("../src/hooks/useHealth.ts", import.meta.url), "utf8");
const fitnessTab = readFileSync(new URL("../src/components/task-app/health-fitness-tab.tsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8");

function plan(overrides: Partial<HealthFitnessPlan> = {}): HealthFitnessPlan {
  return {
    archived_at: null,
    created_at: "2026-08-20T12:00:00.000Z",
    id: "plan-1",
    name: "General Fitness",
    starts_on: "2026-08-24",
    updated_at: "2026-08-20T12:00:00.000Z",
    user_id: "user-1",
    ...overrides,
  };
}

function item(overrides: Partial<HealthFitnessPlanItem> = {}): HealthFitnessPlanItem {
  return {
    archived_at: null,
    created_at: "2026-08-20T12:00:00.000Z",
    day_of_week: 3,
    expected_duration_seconds: 1800,
    id: "item-1",
    notes: null,
    plan_id: "plan-1",
    sort_order: 0,
    title: "Strength Training",
    updated_at: "2026-08-20T12:00:00.000Z",
    user_id: "user-1",
    workout_type: "Strength Training",
    ...overrides,
  };
}

function workout(overrides: Partial<HealthWorkout> = {}): HealthWorkout {
  return {
    active_calories: null,
    created_at: "2026-08-27T12:00:00.000Z",
    duration_seconds: 1800,
    ended_at: null,
    id: "workout-1",
    notes: "",
    source: "manual",
    source_external_id: null,
    started_at: null,
    title: "Thursday session",
    updated_at: "2026-08-27T12:00:00.000Z",
    user_id: "user-1",
    workout_date: "2026-08-27",
    workout_type: "Different Type",
    ...overrides,
  };
}

function link(overrides: Partial<HealthWorkoutPlanItemLink> = {}): HealthWorkoutPlanItemLink {
  return {
    created_at: "2026-08-27T12:00:00.000Z",
    id: "link-1",
    plan_item_id: "item-1",
    user_id: "user-1",
    workout_id: "workout-1",
    ...overrides,
  };
}

test("multiple active plans coexist without a current-plan singleton", () => {
  const views = buildActiveHealthFitnessPlanWeekViews(
    [plan(), plan({ id: "plan-2", name: "Mobility", created_at: "2026-08-21T12:00:00.000Z" })],
    [item(), item({ id: "item-2", plan_id: "plan-2", title: "Stretching" })],
    [],
    [],
    "2026-08-27",
  );
  assert.deepEqual(views.map((view) => view.plan.name), ["General Fitness", "Mobility"]);
});

test("a plan supports multiple same-weekday items", () => {
  const views = buildActiveHealthFitnessPlanWeekViews(
    [plan()],
    [item(), item({ id: "item-2", title: "Push-Ups", sort_order: 1 })],
    [],
    [],
    "2026-08-27",
  );
  assert.equal(views[0]?.items.length, 2);
  assert.equal(views[0]?.items[0]?.day_of_week, views[0]?.items[1]?.day_of_week);
});

test("Fitness weeks are Monday through Sunday calendar weeks", () => {
  assert.deepEqual(getHealthWeekBounds("2026-08-27"), { endDate: "2026-08-30", startDate: "2026-08-24" });
  assert.equal(isHealthWorkoutInWeek(workout({ workout_date: "2026-08-30" }), "2026-08-27"), true);
  assert.equal(isHealthWorkoutInWeek(workout({ workout_date: "2026-08-23" }), "2026-08-27"), false);
});

test("the first plan week ignores weekdays before starts_on", () => {
  const startsWednesday = plan({ starts_on: "2026-08-26" });
  const monday = item({ day_of_week: 1, id: "monday" });
  const wednesday = item({ day_of_week: 3, id: "wednesday" });
  const mondayStatus = getHealthPlanItemWeekStatus(startsWednesday, monday, [], [], "2026-08-27");
  const wednesdayStatus = getHealthPlanItemWeekStatus(startsWednesday, wednesday, [], [], "2026-08-27");
  assert.equal(getHealthPlanWeekdayDate("2026-08-24", 1), "2026-08-24");
  assert.equal(mondayStatus.activeForCurrentWeek, false);
  assert.equal(wednesdayStatus.activeForCurrentWeek, true);
});

test("one workout can link to plan items in multiple plans", () => {
  const first = plan();
  const second = plan({ id: "plan-2", name: "Push-Up Program" });
  const firstItem = item();
  const secondItem = item({ id: "item-2", plan_id: second.id, title: "Push-Ups" });
  const links = [link(), link({ id: "link-2", plan_item_id: secondItem.id })];
  const views = buildActiveHealthFitnessPlanWeekViews([first, second], [firstItem, secondItem], links, [workout()], "2026-08-27");
  assert.equal(views.every((view) => view.items[0]?.completedForCurrentWeek), true);
});

test("a same-week workout on a different weekday completes an explicit link", () => {
  const status = getHealthPlanItemWeekStatus(plan(), item(), [link()], [workout({ workout_date: "2026-08-27" })], "2026-08-27");
  assert.equal(status.completedForCurrentWeek, true);
});

test("title and workout type similarity never completes an unlinked item", () => {
  const status = getHealthPlanItemWeekStatus(plan(), item({ title: "Thursday session", workout_type: "Different Type" }), [], [workout()], "2026-08-27");
  assert.equal(status.completedForCurrentWeek, false);
});

test("archived plans leave active plan views but preserve historical labels", () => {
  const archived = plan({ archived_at: "2026-08-28T12:00:00.000Z" });
  assert.deepEqual(buildActiveHealthFitnessPlanWeekViews([archived], [item()], [link()], [workout()], "2026-08-27"), []);
  assert.equal(getHealthWorkoutPlanItemLabel("item-1", [archived], [item()]), "General Fitness · Wednesday Strength Training");
});

test("archived plan items remain resolvable for existing associations", () => {
  const archivedItem = item({ archived_at: "2026-08-28T12:00:00.000Z" });
  assert.equal(getHealthWorkoutPlanItemLabel(archivedItem.id, [plan()], [archivedItem]), "General Fitness · Wednesday Strength Training");
});

test("duplicate workout and plan-item links are prevented by the database", () => {
  assert.match(migration, /unique \(workout_id, plan_item_id\)/);
  assert.match(plansHook, /const additions = desiredIds\.filter/);
  assert.doesNotMatch(plansHook, /delete\(\)[\s\S]*insert\(/);
});

test("migration enforces owner-scoped cross-table relationships", () => {
  assert.match(migration, /foreign key \(user_id, workout_id\)[\s\S]*references public\.adhdice_health_workouts \(user_id, id\)/);
  assert.match(migration, /foreign key \(user_id, plan_item_id\)[\s\S]*references public\.adhdice_health_fitness_plan_items \(user_id, id\)/);
  assert.match(migration, /using \(\(select auth\.uid\(\)\) = user_id\)/);
  assert.match(migration, /with check \(\(select auth\.uid\(\)\) = user_id\)/);
});

test("a workout can be logged with zero plan associations", () => {
  assert.match(fitnessTab, /saveHealthWorkoutBundle\(/);
  assert.match(fitnessTab, /shouldSavePlanLinks: hasExistingOrSelectedLinks/);
  assert.doesNotMatch(healthHook.slice(healthHook.indexOf("async function addWorkout"), healthHook.indexOf("async function updateWorkout")), /adhdice_health_fitness/);
});

test("editing associations is separate from canonical workout mutation", () => {
  const workoutMutationSection = healthHook.slice(healthHook.indexOf("async function addWorkout"), healthHook.indexOf("async function deleteWorkout"));
  assert.doesNotMatch(workoutMutationSection, /adhdice_health_workout_plan_item_links/);
  assert.match(fitnessTab, /saveWorkoutPlanItemLinks/);
  assert.match(pageSource, /saveWorkoutPlanItemLinks=\{saveWorkoutPlanItemLinks\}/);
});

test("Fitness Plan loading is isolated from workout recovery and Health snapshots", () => {
  assert.doesNotMatch(plansHook, /adhdice_health_workouts/);
  assert.match(plansHook, /setPlans\(\[\]\)/);
  assert.match(plansHook, /reportError\(`Fitness Plans are unavailable until the 7\.11\.44 Fitness Plans migration is applied/);
  assert.match(healthHook, /reconcileHealthWorkouts/);
});

test("the Fitness Plan editor keeps one Add Planned Item action at the bottom", () => {
  assert.equal(plansPanel.match(/>Add Planned Item<\/AdhdChip>/g)?.length, 1);
  const itemsIndex = plansPanel.indexOf("{editor.items.map");
  const addItemIndex = plansPanel.indexOf(">Add Planned Item</AdhdChip>");
  const saveIndex = plansPanel.indexOf("Save Plan");
  assert.ok(itemsIndex >= 0 && itemsIndex < addItemIndex);
  assert.ok(addItemIndex < saveIndex);
});

test("a created Fitness Plan item keeps its persisted identity for a later retry", () => {
  const initial = [
    { day_of_week: 1, expected_duration_minutes: "30", notes: "", title: "A", workout_type: "Strength" },
    { day_of_week: 2, expected_duration_minutes: "30", notes: "", title: "B", workout_type: "Strength" },
  ];
  const afterFirstInsert = reconcileHealthFitnessPlanItemDraft(initial, 0, "persisted-a");
  const retryOperations = afterFirstInsert.map((item) => item.id ? "update" : "insert");
  assert.deepEqual(retryOperations, ["update", "insert"]);
  assert.equal(afterFirstInsert[0]?.id, "persisted-a");
  assert.match(plansPanel, /reconcileHealthFitnessPlanItemDraft\(current\.items, index, created\.id\)/);
});

test("links use explicit identifiers and never attach a plan item to the workout row", () => {
  assert.match(migration, /create table if not exists public\.adhdice_health_workout_plan_item_links/);
  assert.doesNotMatch(migration, /fitness_plan_item_id/);
  assert.doesNotMatch(migration, /alter table public\.adhdice_health_workouts[\s\S]*plan_item/);
  assert.match(fitnessTab, /getHealthWorkoutPlanItemIds\(workout\.id, workoutPlanItemLinks\)/);
});
