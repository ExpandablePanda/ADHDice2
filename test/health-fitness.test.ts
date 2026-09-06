import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { HealthMetricEntry, HealthWorkout } from "@/lib/database.types";
import {
  addHealthWorkoutTypeOption,
  addHealthWorkoutTitleOption,
  buildHealthWorkoutFormPayload,
  getHealthDailyMovementMetrics,
  getHealthWorkoutActiveCaloriesForDate,
  getHealthWorkoutDisplayTitle,
  getHealthWorkoutImportAliasKey,
  getHealthWeekBounds,
  getHealthWeeklyMovementMetrics,
  getHealthWeeklyWorkoutSummary,
  HEALTH_WORKOUT_TYPES,
  moveFitnessOption,
  reconcileHealthWorkouts,
  removeHealthWorkoutTypeOption,
  removeHealthWorkoutTitleOption,
  renameHealthWorkoutTypeOption,
  renameHealthWorkoutTitleOption,
  sortHealthWorkouts,
} from "@/lib/health-fitness";
import { HEALTH_TABS, formatHealthTimestampDate, normalizeHealthProfile, normalizeHealthWorkoutImportAliases, shiftHealthDate } from "@/lib/health-utils";

const fitnessSource = readFileSync(new URL("../src/components/task-app/health-fitness-tab.tsx", import.meta.url), "utf8");
const reorderSource = readFileSync(new URL("../src/components/task-app/health-fitness-reorder-list.tsx", import.meta.url), "utf8");
const dropdownSource = readFileSync(new URL("../src/components/task-app/health-dropdown.tsx", import.meta.url), "utf8");
const hookSource = readFileSync(new URL("../src/hooks/useHealth.ts", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8");
const healthTabPreferenceSource = readFileSync(new URL("../src/lib/health-tab-preference.ts", import.meta.url), "utf8");
const migrationSource = readFileSync(new URL("../supabase/add_health_fitness_foundation_7_11_33.sql", import.meta.url), "utf8");
const titleOptionsMigrationSource = readFileSync(new URL("../supabase/add_health_workout_title_options_7_11_34.sql", import.meta.url), "utf8");
const typeOptionsMigrationSource = readFileSync(new URL("../supabase/add_health_workout_type_options_7_11_35.sql", import.meta.url), "utf8");
const importAliasesMigrationSource = readFileSync(new URL("../supabase/add_health_workout_import_aliases_7_12_68.sql", import.meta.url), "utf8");
const healthTablesSource = readFileSync(new URL("../supabase/add_health_tables.sql", import.meta.url), "utf8");
const schemaSource = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
const packageLock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8")) as { version: string; packages: { "": { version: string } } };
const appVersionSource = readFileSync(new URL("../public/app-version.json", import.meta.url), "utf8");
const appVersionModuleSource = readFileSync(new URL("../src/lib/app-version.ts", import.meta.url), "utf8");
const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const currentStateSource = readFileSync(new URL("../docs/CURRENT_STATE.md", import.meta.url), "utf8");

function workout(overrides: Partial<HealthWorkout> = {}): HealthWorkout {
  return {
    active_calories: null,
    created_at: "2026-08-23T12:00:00.000Z",
    duration_seconds: 1800,
    ended_at: null,
    id: "workout-1",
    notes: "",
    source: "manual",
    source_external_id: null,
    started_at: null,
    title: "Walking",
    updated_at: "2026-08-23T12:00:00.000Z",
    user_id: "user-1",
    workout_date: "2026-08-23",
    workout_type: "Walking",
    ...overrides,
  };
}

test("Fitness is a Health tab after Water and Settings is final", () => {
  assert.deepEqual(HEALTH_TABS, ["Today", "Food", "Water", "Fitness", "Journal", "Weight", "Sleep", "Insights", "Awards", "Settings"]);
});

test("Standing is a workout category without changing the existing types", () => {
  assert.deepEqual(HEALTH_WORKOUT_TYPES, [
    "Walking",
    "Running",
    "Strength Training",
    "Cycling",
    "Cardio",
    "Stretching",
    "Sports",
    "Standing",
    "Other",
  ]);
});

test("existing Health profiles safely receive the default workout type list", () => {
  const profile = normalizeHealthProfile({ user_id: "user-1" }, "user-1");
  assert.deepEqual(profile.workout_type_options, [...HEALTH_WORKOUT_TYPES]);
  assert.deepEqual(profile.workout_import_aliases, {});
  assert.match(healthTablesSource, /workout_type_options text\[\] not null default array\['Walking'.*'Standing'.*'Other'\]/);
  assert.match(schemaSource, /workout_type_options text\[\] not null default array\['Walking'.*'Standing'.*'Other'\]/);
  assert.match(typeOptionsMigrationSource, /add column if not exists workout_type_options text\[\]/);
  assert.match(typeOptionsMigrationSource, /where workout_type_options is null or cardinality\(workout_type_options\) = 0/);
  assert.match(typeOptionsMigrationSource, /alter column workout_type_options set not null/);
});

test("workout type options trim, reject empty and duplicates, rename, remove, and protect the final option", () => {
  const added = addHealthWorkoutTypeOption(["Walking"], "  Hiking  ");
  assert.deepEqual(added.value, ["Walking", "Hiking"]);
  assert.equal(addHealthWorkoutTypeOption(["Walking"], "   ").error, "Enter a workout type.");
  assert.equal(addHealthWorkoutTypeOption(["Walking"], " walking ").error, "That workout type already exists.");
  assert.deepEqual(renameHealthWorkoutTypeOption(["Walking", "Hiking"], "Hiking", "  Trail Run ").value, ["Walking", "Trail Run"]);
  assert.deepEqual(removeHealthWorkoutTypeOption(["Walking", "Trail Run"], "Trail Run").value, ["Walking"]);
  assert.equal(removeHealthWorkoutTypeOption(["Walking"], "Walking").error, "Keep at least one workout type.");
});

test("imported workout aliases are presentation-only and normalize safely", () => {
  const imported = workout({ source: "apple_health_import", title: "Activity 53", workout_type: "Other", active_calories: 320 });
  assert.equal(getHealthWorkoutImportAliasKey(imported), "Activity 53");
  assert.equal(getHealthWorkoutDisplayTitle(imported), "Activity 53");
  assert.equal(getHealthWorkoutDisplayTitle(imported, { "Activity 53": "  Aquatic Movement " }), "Aquatic Movement");
  assert.equal(getHealthWorkoutDisplayTitle(workout({ title: "My workout" }), { "My workout": "Changed" }), "My workout");
  assert.deepEqual(normalizeHealthWorkoutImportAliases({ " Activity 53 ": " Aquatic Movement ", empty: " ", bad: 42, nested: {} }), { "Activity 53": "Aquatic Movement" });
  assert.equal(imported.title, "Activity 53");
  assert.equal(imported.workout_type, "Other");
  assert.equal(imported.active_calories, 320);
});

test("imported workout aliases use an object-constrained profile migration and never rewrite workouts", () => {
  assert.match(importAliasesMigrationSource, /add column if not exists workout_import_aliases jsonb/);
  assert.match(importAliasesMigrationSource, /jsonb_typeof\(workout_import_aliases\) <> 'object'/);
  assert.match(importAliasesMigrationSource, /set not null/);
  assert.match(importAliasesMigrationSource, /workout_import_aliases_object_check/);
  assert.doesNotMatch(importAliasesMigrationSource, /adhdice_health_workouts/);
});

test("Fitness option reorder moves first-to-last and last-to-first without mutation", () => {
  const options = ["Walking", "Running", "Standing"];
  assert.deepEqual(moveFitnessOption(options, 0, 2), ["Running", "Standing", "Walking"]);
  assert.deepEqual(moveFitnessOption(options, 2, 0), ["Standing", "Walking", "Running"]);
  assert.deepEqual(options, ["Walking", "Running", "Standing"]);
});

test("Fitness option reorder is a no-op for same-position and invalid indexes", () => {
  const options = ["Walking", "Running", "Standing"];
  assert.deepEqual(moveFitnessOption(options, 1, 1), options);
  assert.deepEqual(moveFitnessOption(options, -1, 1), options);
  assert.deepEqual(moveFitnessOption(options, 0, 3), options);
  assert.deepEqual(moveFitnessOption(options, 0.5, 1), options);
});

test("Workout title reorder moves first-to-last and last-to-first", () => {
  const titles = ["Morning Walk", "Trail Hiking", "Evening Run"];
  assert.deepEqual(moveFitnessOption(titles, 0, 2), ["Trail Hiking", "Evening Run", "Morning Walk"]);
  assert.deepEqual(moveFitnessOption(titles, 2, 0), ["Evening Run", "Morning Walk", "Trail Hiking"]);
});

test("old saved Health tab values still normalize through the current tab list", () => {
  assert.match(healthTabPreferenceSource, /return HEALTH_TABS\.includes\(stored as HealthTab\) \? stored as HealthTab : "Today"/);
  assert.match(pageSource, /const activeTab = useSyncExternalStore\(subscribeToHealthTabPreference, readHealthTabPreference, \(\) => "Today"\)/);
});

test("manual workout form converts duration minutes to canonical seconds and falls back to type title", () => {
  const result = buildHealthWorkoutFormPayload({
    activeCalories: "250",
    date: "2026-08-23",
    durationMinutes: "45",
    notes: "",
    startTime: "18:30",
    title: "",
    workoutType: "Strength Training",
  }, "2026-08-23");
  assert.equal(result.error, null);
  assert.equal(result.value?.duration_seconds, 2700);
  assert.equal(result.value?.title, "Strength Training");
  assert.equal(result.value?.started_at !== null, true);
});

test("manual workout titles remain free text and trim before saving", () => {
  const result = buildHealthWorkoutFormPayload({
    activeCalories: "",
    date: "2026-08-23",
    durationMinutes: "30",
    notes: "",
    startTime: "",
    title: "  Evening walk  ",
    workoutType: "Walking",
  }, "2026-08-23");
  assert.equal(result.value?.title, "Evening walk");
});

test("saved workout title options trim, reject empty values, and reject case-insensitive duplicates", () => {
  const added = addHealthWorkoutTitleOption(["Upper Body"], "  Evening Walk  ");
  assert.deepEqual(added.value, ["Upper Body", "Evening Walk"]);
  assert.equal(addHealthWorkoutTitleOption([], "   ").error, "Enter a saved workout title.");
  assert.equal(addHealthWorkoutTitleOption(["Upper Body"], " upper body ").error, "That saved workout title already exists.");
});

test("saved workout title options apply the compact length guard", () => {
  assert.equal(addHealthWorkoutTitleOption([], "x".repeat(121)).value, null);
  assert.match(addHealthWorkoutTitleOption([], "x".repeat(121)).error ?? "", /120 characters or fewer/);
});

test("removing a saved title does not mutate workout rows", () => {
  const rows = [workout({ id: "existing-workout", title: "Upper Body" })];
  const nextTitles = removeHealthWorkoutTitleOption(["Upper Body", "Evening Walk"], "Upper Body");
  assert.deepEqual(nextTitles, ["Evening Walk"]);
  assert.deepEqual(rows, [workout({ id: "existing-workout", title: "Upper Body" })]);
  const removeStart = fitnessSource.indexOf("async function handleRemoveSavedTitle");
  const removeEnd = fitnessSource.indexOf("async function handleSubmit", removeStart);
  const removeSection = fitnessSource.slice(removeStart, removeEnd);
  assert.match(removeSection, /saveProfile\(\{[\s\S]*workout_title_options/);
  assert.doesNotMatch(removeSection, /deleteWorkout|updateWorkout/);
});

test("saved title add, rename, and remove stay separate from workout history", () => {
  const rows = [workout({ title: "Upper Body" })];
  assert.deepEqual(renameHealthWorkoutTitleOption(["Upper Body"], "Upper Body", "  Push Day  ").value, ["Push Day"]);
  assert.deepEqual(removeHealthWorkoutTitleOption(["Upper Body"], "Upper Body"), []);
  assert.deepEqual(rows, [workout({ title: "Upper Body" })]);
  assert.match(fitnessSource, /Fitness Settings/);
  assert.match(fitnessSource, /Workout Titles/);
  assert.match(fitnessSource, /handleRenameSavedTitle/);
});

test("existing Health profiles safely receive an empty saved-title list", () => {
  const profile = normalizeHealthProfile({ user_id: "user-1" }, "user-1");
  assert.deepEqual(profile.workout_title_options, []);
  assert.match(healthTablesSource, /workout_title_options text\[\] not null default '\{\}'/);
  assert.match(schemaSource, /workout_title_options text\[\] not null default '\{\}'/);
  assert.match(titleOptionsMigrationSource, /add column if not exists workout_title_options text\[\] default '\{\}'/);
  assert.match(titleOptionsMigrationSource, /where workout_title_options is null/);
  assert.match(titleOptionsMigrationSource, /alter column workout_title_options set default '\{\}'/);
  assert.match(titleOptionsMigrationSource, /alter column workout_title_options set not null/);
});

test("saved titles use the Health profile persistence authority and autocomplete keeps free text", () => {
  assert.match(pageSource, /<HealthFitnessTab[\s\S]*profile=\{activeProfile\}[\s\S]*saveProfile=\{saveProfile\}/);
  assert.match(fitnessSource, /saveProfile: \(updates: HealthProfileUpdate\) => Promise<boolean>/);
  assert.match(fitnessSource, /saveProfile\(\{ workout_title_options: result\.value \}\)/);
  assert.match(fitnessSource, /saveProfile\(\{ workout_type_options: nextOptions \}\)/);
  assert.match(fitnessSource, /<HealthAutocomplete[\s\S]*onChange=\{\(value\) => setDraft\(\(current\) => \(\{ \.\.\.current, title: value \}\)\)\}[\s\S]*suggestions=\{savedWorkoutTitles\}/);
  assert.match(dropdownSource, /onChange\(suggestion\.label\);[\s\S]*onSelect\?\.\(suggestion\)/);
  assert.match(hookSource, /normalizeHealthProfile\(profileResult\.data, userId\)/);
  assert.match(hookSource, /\.from\("adhdice_health_profiles"\)[\s\S]*\.upsert\([\s\S]*\.\.\.updates/);
});

test("manual workout entry reads profile workout type options", () => {
  assert.match(fitnessSource, /const workoutTypes = useMemo\([\s\S]*?profile\.workout_type_options\?\.length/);
  assert.match(fitnessSource, /options=\{workoutTypeOptions\}/);
  assert.doesNotMatch(fitnessSource, /const WORKOUT_TYPE_OPTIONS/);
});

test("Fitness Settings reorders both profile arrays through the existing save authority", () => {
  assert.match(fitnessSource, /<HealthFitnessReorderList[\s\S]*onSave=\{\(nextOptions\) => saveWorkoutTypeOptions\(nextOptions, "Workout types could not be saved\."\)\}[\s\S]*items=\{workoutTypes\}/);
  assert.match(fitnessSource, /label="saved workout title"[\s\S]*onSave=\{\(nextOptions\) => saveProfile\(\{ workout_title_options: nextOptions \}\)\}/);
  assert.match(fitnessSource, /saveProfile\(\{ workout_type_options: nextOptions \}\)/);
  assert.match(reorderSource, /moveFitnessOption\(currentItems, drag\.currentIndex, targetIndex\)/);
  assert.doesNotMatch(fitnessSource, /sort\(.*workout_type_options|sort\(.*workout_title_options/);
});

test("Workout dropdown and title autocomplete preserve the persisted profile order", () => {
  assert.match(fitnessSource, /profile\.workout_type_options\?\.length \? profile\.workout_type_options/);
  assert.match(fitnessSource, /options=\{workoutTypeOptions\}/);
  assert.match(fitnessSource, /suggestions=\{savedWorkoutTitles\}/);
  assert.doesNotMatch(fitnessSource, /workoutTypes\.slice\(\)\.sort|savedWorkoutTitles\.slice\(\)\.sort/);
});

test("Fitness option drag state cleans up pointer completion and keeps actions separate", () => {
  assert.match(reorderSource, /onPointerUp=\{handlePointerEnd\}/);
  assert.match(reorderSource, /onPointerCancel=\{handlePointerEnd\}/);
  assert.match(reorderSource, /onLostPointerCapture=\{handlePointerEnd\}/);
  assert.match(reorderSource, /setPointerCapture\(event\.pointerId\)/);
  assert.match(reorderSource, /releasePointerCapture\(drag\.pointerId\)/);
  assert.match(reorderSource, /cancelAnimationFrame\(animationFrameRef\.current\)/);
  assert.match(reorderSource, /useEffect\(\(\) => \(\) => \{[\s\S]*?cancelScheduledPointerMove\(\)/);
  assert.match(reorderSource, /dragRef\.current = null/);
  assert.match(reorderSource, /previewRef\.current = null/);
  assert.match(reorderSource, /aria-label=\{`Reorder \$\{label\} \$\{itemLabel\}`\}/);
  assert.match(fitnessSource, /aria-label=\{`Rename workout type \$\{type\}`\}/);
  assert.match(fitnessSource, /aria-label=\{`Remove saved workout title \$\{title\}`\}/);
});

test("Fitness option dragging caches row geometry and gates pointer movement to one frame", () => {
  const reorderSection = reorderSource;
  const moveStart = reorderSection.indexOf("function handlePointerMove");
  const moveSection = reorderSection.slice(moveStart, reorderSection.indexOf("function handlePointerEnd", moveStart));
  assert.match(reorderSection, /rowGeometryRef = useRef<Array<HealthFitnessRowGeometry \| null>>\(\[\]\)/);
  assert.match(reorderSection, /function cacheRowGeometry\(itemCount: number\)/);
  assert.match(reorderSection, /cacheRowGeometry\(startingItems\.length\);[\s\S]*?dragRef\.current = \{/);
  assert.match(reorderSection, /const bounds = row\.getBoundingClientRect\(\)/);
  assert.doesNotMatch(moveSection, /getBoundingClientRect/);
  assert.match(moveSection, /pendingPointerYRef\.current = event\.clientY/);
  assert.match(moveSection, /requestAnimationFrame\(\(\) => \{/);
  assert.match(moveSection, /if \(animationFrameRef\.current !== null\) \{\s+return;/);
  assert.match(reorderSection, /cancelScheduledPointerMove\(\);[\s\S]*?processPointerMove\(pointerY\)/);
});

test("Fitness option dragging avoids preview state churn within the same target row", () => {
  const reorderSection = reorderSource;
  const processStart = reorderSection.indexOf("function processPointerMove");
  const processSection = reorderSection.slice(processStart, reorderSection.indexOf("function handlePointerMove", processStart));
  assert.match(processSection, /if \(targetIndex === drag\.currentIndex\) \{\s+return;[\s\S]*?setPreviewItems\(nextItems\);[\s\S]*?setDraggingIndex\(targetIndex\);/);
  assert.doesNotMatch(processSection.slice(0, processSection.indexOf("if (targetIndex === drag.currentIndex)")), /setPreviewItems|setDraggingIndex/);
});

test("Fitness option dragging saves only on completed reorder and never touches workout rows", () => {
  const moveStart = reorderSource.indexOf("function handlePointerMove");
  const moveEnd = reorderSource.indexOf("function handlePointerEnd", moveStart);
  assert.doesNotMatch(reorderSource.slice(moveStart, moveEnd), /onSave\(/);
  const reorderSection = reorderSource;
  assert.match(reorderSection, /void persistCommittedPreview\(committedItems\)/);
  assert.match(reorderSection, /saved = await onSave\(committedItems\.map\(getItemId\)\)/);
  assert.doesNotMatch(reorderSection, /addWorkout|updateWorkout|deleteWorkout|adhdice_health_workouts/);
});

test("Fitness option drop keeps the committed preview until canonical props catch up", () => {
  const reorderSection = reorderSource;
  const clearStart = reorderSection.indexOf("function clearDragState");
  const clearEnd = reorderSection.indexOf("function getTargetIndex", clearStart);
  const clearSection = reorderSection.slice(clearStart, clearEnd);
  const committedSection = clearSection.slice(clearSection.indexOf("const committedItems = [...nextItems]"));
  assert.match(reorderSection, /const committedPreviewRef = useRef<T\[\] \| null>\(null\)/);
  assert.match(clearSection, /const committedItems = \[\.\.\.nextItems\];[\s\S]*committedPreviewRef\.current = committedItems;[\s\S]*previewRef\.current = committedItems;[\s\S]*void persistCommittedPreview\(committedItems\)/);
  assert.doesNotMatch(committedSection, /setPreviewItems\(null\)/);
  assert.match(reorderSection, /areItemOrdersEqual\(items, committedItems, getItemId\)[\s\S]*setPreviewItems\(null\)/);
});

test("Fitness option save failure rolls back the temporary committed preview", () => {
  const reorderSection = reorderSource;
  assert.match(reorderSection, /async function persistCommittedPreview\(committedItems: T\[\]\)/);
  assert.match(reorderSection, /saved = await onSave\(committedItems\.map\(getItemId\)\)/);
  assert.match(reorderSection, /if \(!saved\) \{[\s\S]*clearCommittedPreview\(committedItems\)/);
  assert.match(reorderSection, /previewRef\.current === committedItems/);
});

test("Fitness option second drags begin from the currently visible committed order", () => {
  const reorderSection = reorderSource;
  assert.match(reorderSource, /startingItems: T\[\]/);
  assert.match(reorderSection, /const startingItems = \[\.\.\.\(previewRef\.current \?\? itemsRef\.current\)\]/);
  assert.match(reorderSection, /areItemOrdersEqual\(nextItems, drag\.startingItems, getItemId\)/);
});

test("Fitness Settings keeps vertical scrolling while suppressing its visible system scrollbar", () => {
  assert.match(fitnessSource, /className="adhdice-scrollbar absolute right-0[\s\S]*overflow-y-auto/);
  assert.match(reorderSource, /data-fitness-option-list=\{label\}/);
  assert.doesNotMatch(fitnessSource, /overflow-y-hidden/);
});

test("Fitness Settings opens and closes through its site-styled control", () => {
  assert.match(fitnessSource, /aria-expanded=\{isSettingsOpen\}/);
  assert.match(fitnessSource, /setIsSettingsOpen\(\(current\) => !current\)/);
  assert.match(fitnessSource, /document\.addEventListener\("pointerdown", handleOutsidePointerDown\)/);
  assert.match(fitnessSource, /event\.key === "Escape"/);
  const settingsIndex = fitnessSource.indexOf("{isSettingsOpen ? (");
  const settingsSection = fitnessSource.slice(settingsIndex);
  assert.match(settingsSection, /Workout Types/);
  assert.match(settingsSection, /Workout Titles/);
});

test("explicit Log Workout intent queues one smooth reveal after opening the form", () => {
  assert.match(fitnessSource, /function queueFormReveal\(\)/);
  assert.match(fitnessSource, /pendingRevealRef\.current = true/);
  assert.match(fitnessSource, /workoutFormRef\.current\?\.scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
  assert.match(fitnessSource, /pendingRevealRef\.current = false;[\s\S]*?workoutFormRef\.current/);
  assert.match(fitnessSource, /openCreateForm\(\)[\s\S]*?queueFormReveal\(\)/);
  assert.match(fitnessSource, /onClick=\{isFormOpen \? resetForm : openCreateForm\}/);
  assert.match(fitnessSource, /open=\{isFormOpen \|\| isHistoryPanelOpen\}/);
});

test("ordinary Fitness rerenders do not repeat the explicit reveal, and Cancel clears it", () => {
  assert.match(fitnessSource, /if \(!isFormOpen \|\| !pendingRevealRef\.current\)/);
  assert.match(fitnessSource, /\}, \[isFormOpen, revealRequest\]\);/);
  assert.match(fitnessSource, /function resetForm\(\)[\s\S]*?pendingRevealRef\.current = false/);
});

test("edit intent also reveals the workout form when the history section is closed", () => {
  assert.match(fitnessSource, /function openEditForm\(workout: HealthWorkout\)[\s\S]*?setIsFormOpen\(true\);[\s\S]*?queueFormReveal\(\)/);
  assert.match(fitnessSource, /function queueFormReveal\(\)[\s\S]*?setIsHistoryPanelOpen\(true\)/);
});

test("workout dates cannot be in the future", () => {
  const result = buildHealthWorkoutFormPayload({
    activeCalories: "",
    date: "2026-08-24",
    durationMinutes: "30",
    notes: "",
    startTime: "",
    title: "Morning walk",
    workoutType: "Walking",
  }, "2026-08-23");
  assert.equal(result.value, null);
  assert.equal(result.error, "Future workout dates cannot be saved.");
});

test("workout duration must be positive", () => {
  const result = buildHealthWorkoutFormPayload({
    activeCalories: "",
    date: "2026-08-23",
    durationMinutes: "0",
    notes: "",
    startTime: "",
    title: "Walk",
    workoutType: "Walking",
  }, "2026-08-23");
  assert.equal(result.value, null);
  assert.equal(result.error, "Workout duration must be greater than zero.");
});

test("active calories are nullable and cannot be negative", () => {
  const nullable = buildHealthWorkoutFormPayload({
    activeCalories: "",
    date: "2026-08-23",
    durationMinutes: "20",
    notes: "",
    startTime: "",
    title: "Stretch",
    workoutType: "Stretching",
  }, "2026-08-23");
  assert.equal(nullable.value?.active_calories, null);

  const negative = buildHealthWorkoutFormPayload({
    activeCalories: "-1",
    date: "2026-08-23",
    durationMinutes: "20",
    notes: "",
    startTime: "",
    title: "Stretch",
    workoutType: "Stretching",
  }, "2026-08-23");
  assert.equal(negative.value, null);
  assert.equal(negative.error, "Active calories must be zero or greater.");
});

test("workout history sorts newest date and start time first", () => {
  const ordered = sortHealthWorkouts([
    workout({ id: "early", started_at: "2026-08-23T09:00:00.000Z" }),
    workout({ id: "yesterday", workout_date: "2026-08-22", started_at: "2026-08-22T20:00:00.000Z" }),
    workout({ id: "late", started_at: "2026-08-23T19:00:00.000Z" }),
  ]);
  assert.deepEqual(ordered.map((entry) => entry.id), ["late", "early", "yesterday"]);
});

test("fallback workout remains visible before remote recovery", () => {
  const fallbackWorkout = workout({ id: "fallback-workout", title: "Fallback Walk" });
  const recovery = reconcileHealthWorkouts([fallbackWorkout], []);
  assert.deepEqual(recovery.unreconciledLocalWorkouts, [fallbackWorkout]);
  assert.deepEqual(recovery.mergedWorkouts, [fallbackWorkout]);
  assert.match(hookSource, /id: normalizedInput\.id \?\? createLocalId\("health-workout"\)/);
});

test("remote recovery promotes local-only workouts using their existing identity and data", () => {
  const fallbackWorkout = workout({ id: "fallback-workout", title: "Fallback Walk", notes: "Keep this" });
  const recovery = reconcileHealthWorkouts([fallbackWorkout], []);
  assert.deepEqual(recovery.unreconciledLocalWorkouts[0], fallbackWorkout);
  assert.match(hookSource, /\.from\("adhdice_health_workouts"\)[\s\S]*?\.upsert\([\s\S]*?workoutRecovery\.unreconciledLocalWorkouts/);
  assert.match(hookSource, /ignoreDuplicates: true, onConflict: "id"/);
});

test("remote and local workouts merge without loss", () => {
  const remoteWorkout = workout({ id: "remote-workout", title: "Remote" });
  const fallbackWorkout = workout({ id: "fallback-workout", title: "Local" });
  const recovery = reconcileHealthWorkouts([remoteWorkout, fallbackWorkout], [remoteWorkout]);
  assert.deepEqual(new Set(recovery.mergedWorkouts.map((entry) => entry.id)), new Set(["remote-workout", "fallback-workout"]));
});

test("repeated recovery is idempotent and successful hydration keeps the promoted workout", () => {
  const fallbackWorkout = workout({ id: "fallback-workout" });
  const firstRecovery = reconcileHealthWorkouts([fallbackWorkout], []);
  const secondRecovery = reconcileHealthWorkouts(firstRecovery.mergedWorkouts, firstRecovery.mergedWorkouts);
  assert.deepEqual(secondRecovery.unreconciledLocalWorkouts, []);
  assert.equal(new Set(secondRecovery.mergedWorkouts.map((entry) => entry.id)).size, 1);
  assert.deepEqual(secondRecovery.mergedWorkouts, [fallbackWorkout]);
});

test("a remote row with the same identity wins without being overwritten", () => {
  const remoteWorkout = workout({ id: "same-id", title: "Canonical Remote" });
  const staleLocalWorkout = workout({ id: "same-id", title: "Stale Local" });
  const recovery = reconcileHealthWorkouts([staleLocalWorkout], [remoteWorkout]);
  assert.deepEqual(recovery.unreconciledLocalWorkouts, []);
  assert.equal(recovery.mergedWorkouts[0]?.title, "Canonical Remote");
});

test("similar legitimate workouts remain distinct because recovery deduplicates by id only", () => {
  const firstWorkout = workout({ id: "similar-one", title: "Walk", duration_seconds: 1800 });
  const secondWorkout = workout({ id: "similar-two", title: "Walk", duration_seconds: 1800 });
  const recovery = reconcileHealthWorkouts([firstWorkout, secondWorkout], []);
  assert.equal(recovery.mergedWorkouts.length, 2);
  assert.deepEqual(recovery.mergedWorkouts.map((entry) => entry.id).sort(), ["similar-one", "similar-two"]);
});

test("failed recovery keeps local rows visible and enables a later hydration retry", () => {
  const recoveryStart = hookSource.indexOf("const workoutRecovery =");
  const recoveryEnd = hookSource.indexOf("const remoteSnapshot =", recoveryStart);
  const recoverySection = hookSource.slice(recoveryStart, recoveryEnd);
  assert.match(hookSource.slice(recoveryStart), /workoutRecovery\.mergedWorkouts/);
  assert.match(recoverySection, /if \(recoveryError\) \{[\s\S]*?workoutRemoteEnabledRef\.current = false[\s\S]*?local workout is still visible[\s\S]*?retried/);
  assert.match(hookSource, /workoutRemoteEnabledRef\.current = !workoutsResult\.error[\s\S]*?reconcileHealthWorkouts/);
});

test("weekly workout totals count sessions, seconds-derived minutes, and non-null calories", () => {
  const summary = getHealthWeeklyWorkoutSummary([
    workout({ active_calories: 250, duration_seconds: 2700, id: "one", workout_date: "2026-08-18" }),
    workout({ active_calories: null, duration_seconds: 1800, id: "two", workout_date: "2026-08-23" }),
    workout({ active_calories: 100, duration_seconds: 3600, id: "outside", workout_date: "2026-08-10" }),
  ], "2026-08-23");
  assert.equal(summary.workouts, 2);
  assert.equal(summary.workoutMinutes, 75);
  assert.equal(summary.workoutActiveCalories, 250);
});

test("Fitness week bounds use the selected anchor date and stop next-week navigation at the current week", () => {
  assert.deepEqual(getHealthWeekBounds("2026-08-27"), { endDate: "2026-08-30", startDate: "2026-08-24" });
  assert.equal(getHealthWeekBounds("2026-08-27").startDate, getHealthWeekBounds("2026-08-24").startDate);
  assert.equal(getHealthWeekBounds("2026-09-03").startDate, "2026-08-31");
  assert.match(fitnessSource, /const \[weekAnchorDate, setWeekAnchorDate\] = useState\(today\)/);
  assert.match(fitnessSource, /aria-label="Previous week"[\s\S]*?moveWeek\(-1\)/);
  assert.match(fitnessSource, /aria-label="Next week" disabled=\{isCurrentWeek\}/);
  assert.match(fitnessSource, /setWeekAnchorDate\(today\)/);
  assert.match(fitnessSource, /aria-label="Fitness week date"/);
  assert.match(fitnessSource, /title=\{isCurrentWeek \? "This Week" : "Week"\}/);
});

test("Fitness Today has independent historical day navigation and uses the selected date for every daily card", () => {
  assert.equal(shiftHealthDate("2026-09-02", -1), "2026-09-01");
  assert.equal(shiftHealthDate("2026-09-01", 1), "2026-09-02");
  assert.equal(formatHealthTimestampDate("2026-09-01T12:00:00"), "Sep 1, 2026");
  assert.match(fitnessSource, /const \[selectedFitnessDate, setSelectedFitnessDate\] = useState\(today\)/);
  assert.match(fitnessSource, /getHealthDailyMovementMetrics\(metricEntries, selectedFitnessDate\)/);
  assert.match(fitnessSource, /getHealthWorkoutActiveCaloriesForDate\(workouts, selectedFitnessDate\)/);
  assert.match(fitnessSource, /aria-label="Previous day"[\s\S]*?moveFitnessDay\(-1\)/);
  assert.match(fitnessSource, /aria-label="Next day" disabled=\{isCurrentFitnessDate\}/);
  assert.match(fitnessSource, /if \(direction > 0 && nextDate > today\)/);
  assert.match(fitnessSource, /aria-label="Fitness day date"/);
  assert.match(fitnessSource, /max=\{today\}/);
  assert.match(fitnessSource, /setSelectedFitnessDate\(today\)/);
  assert.match(fitnessSource, /title=\{isCurrentFitnessDate \? "Today" : "Day"\}/);
  assert.match(fitnessSource, /formatHealthTimestampDate\(`\$\{selectedFitnessDate\}T12:00:00`\)/);
  const dailyProjectionSection = fitnessSource.slice(fitnessSource.indexOf("const dailyMovement"), fitnessSource.indexOf("const currentWeek"));
  assert.doesNotMatch(dailyProjectionSection, /weekAnchorDate/);
});

test("Fitness Today keeps canonical Total Active Calories separate from workout ledger calories", () => {
  const metrics = [
    { created_at: "", id: "energy", metric_date: "2026-08-23", metric_type: "active_energy_kcal", metric_value: 356.8, source: "manual", source_fingerprint: "energy", updated_at: "", user_id: "user-1" },
  ] as HealthMetricEntry[];
  const workouts = [
    workout({ active_calories: 276.3, id: "today-workout", workout_date: "2026-08-23" }),
    workout({ active_calories: 900, id: "other-day", workout_date: "2026-08-22" }),
  ];
  const totalActiveCalories = getHealthDailyMovementMetrics(metrics, "2026-08-23").activeEnergyKcal;
  const workoutActiveCalories = getHealthWorkoutActiveCaloriesForDate(workouts, "2026-08-23");
  assert.equal(totalActiveCalories, 356.8);
  assert.equal(workoutActiveCalories, 276.3);
  assert.notEqual(totalActiveCalories + workoutActiveCalories, totalActiveCalories);
  assert.match(fitnessSource, /label="Total Active Calories"/);
  assert.match(fitnessSource, /label="Workout Active Calories"/);
  assert.match(fitnessSource, /detail="workout ledger"/);
  assert.doesNotMatch(fitnessSource, /dailyMovement\.activeEnergyKcal \+ dailyWorkoutActiveCalories/);
});

test("Fitness Week totals use canonical daily Active Energy and do not infer missing dates from workouts", () => {
  const metrics = [
    { created_at: "", id: "monday", metric_date: "2026-08-24", metric_type: "active_energy_kcal", metric_value: 100, source: "manual", source_fingerprint: "monday", updated_at: "", user_id: "user-1" },
    { created_at: "", id: "wednesday", metric_date: "2026-08-26", metric_type: "active_energy_kcal", metric_value: 250.5, source: "manual", source_fingerprint: "wednesday", updated_at: "", user_id: "user-1" },
  ] as HealthMetricEntry[];
  const weeklyMovement = getHealthWeeklyMovementMetrics(metrics, "2026-08-27");
  const weeklyWorkoutSummary = getHealthWeeklyWorkoutSummary([
    workout({ active_calories: 276.3, id: "ledger-only", workout_date: "2026-08-25" }),
  ], "2026-08-27");
  assert.deepEqual(weeklyMovement, { activeEnergyKcal: 350.5, endDate: "2026-08-30", startDate: "2026-08-24" });
  assert.equal(weeklyWorkoutSummary.workoutActiveCalories, 276.3);
  assert.match(fitnessSource, /getHealthWeeklyMovementMetrics\(metricEntries, weekAnchorDate\)/);
  assert.match(fitnessSource, /label="Total Active Calories" value=\{`\$\{formatWholeNumber\(weeklyMovement\.activeEnergyKcal\)\} kcal`\}/);
  assert.match(fitnessSource, /label="Workout Active Calories" value=\{`\$\{formatWholeNumber\(weeklySummary\.workoutActiveCalories\)\} kcal`\}/);
  assert.doesNotMatch(fitnessSource, /weeklyMovement\.activeEnergyKcal \+ weeklySummary\.workoutActiveCalories/);
  assert.match(fitnessSource, /getHealthWeeklyWorkoutSummary\(workouts, weekAnchorDate\)/);
  assert.match(fitnessSource, /getHealthWeeklyMovementMetrics\(metricEntries, weekAnchorDate\)/);
  assert.doesNotMatch(dailyProjectionSectionForTest(fitnessSource), /weekAnchorDate/);
});

function dailyProjectionSectionForTest(source: string) {
  return source.slice(source.indexOf("const dailyMovement"), source.indexOf("const currentWeek"));
}

test("daily Fitness cards read the existing steps, active energy, and exercise metric authorities", () => {
  const metrics = [
    { created_at: "", id: "steps", metric_date: "2026-08-23", metric_type: "steps", metric_value: 5000, source: "manual", source_fingerprint: "steps", updated_at: "", user_id: "user-1" },
    { created_at: "", id: "calories", metric_date: "2026-08-23", metric_type: "active_energy_kcal", metric_value: 300, source: "manual", source_fingerprint: "calories", updated_at: "", user_id: "user-1" },
    { created_at: "", id: "exercise", metric_date: "2026-08-23", metric_type: "exercise_minutes", metric_value: 45, source: "manual", source_fingerprint: "exercise", updated_at: "", user_id: "user-1" },
  ] as HealthMetricEntry[];
  const movement = getHealthDailyMovementMetrics(metrics, "2026-08-23");
  assert.deepEqual(movement, { activeEnergyKcal: 300, exerciseMinutes: 45, steps: 5000 });
});

test("workout CRUD remains isolated from daily metric rows and local persistence is user-scoped", () => {
  const addStart = hookSource.indexOf("async function addWorkout");
  const addEnd = hookSource.indexOf("async function updateWorkout");
  const updateStart = addEnd;
  const updateEnd = hookSource.indexOf("async function deleteWorkout");
  const deleteStart = updateEnd;
  const deleteEnd = hookSource.indexOf("async function importAppleHealthData");
  for (const section of [hookSource.slice(addStart, addEnd), hookSource.slice(updateStart, updateEnd), hookSource.slice(deleteStart, deleteEnd)]) {
    assert.doesNotMatch(section, /adhdice_health_metric_entries/);
    assert.match(section, /workouts/);
  }
  assert.match(hookSource, /storageKey\(userId, "workouts"\)/);
  assert.match(hookSource, /storageKey\(profile\.user_id, "workouts"\)/);
  assert.match(hookSource, /workoutsResult\.error[\s\S]*?setStorageMode\("remote"\)/);
});

test("imported workout behavior remains read-only and outside recovery CRUD", () => {
  const importStart = hookSource.indexOf("async function importAppleHealthData");
  const importSection = hookSource.slice(importStart);
  assert.match(hookSource, /existingWorkout\.source !== "manual"/);
  assert.match(hookSource, /Imported workouts cannot be edited yet/);
  assert.match(hookSource, /Imported workouts cannot be deleted yet/);
  assert.doesNotMatch(importSection, /reconcileHealthWorkouts|adhdice_health_workouts/);
});

test("workout type and title option changes do not call workout CRUD", () => {
  for (const functionName of ["handleAddWorkoutType", "handleRenameWorkoutType", "handleRemoveWorkoutType", "handleRenameSavedTitle", "handleRemoveSavedTitle"]) {
    const start = fitnessSource.indexOf(`async function ${functionName}`);
    const end = fitnessSource.indexOf("\n  async function", start + 1);
    const section = fitnessSource.slice(start, end === -1 ? fitnessSource.length : end);
    assert.doesNotMatch(section, /addWorkout|updateWorkout|deleteWorkout/);
  }
});

test("existing Health areas remain wired while Fitness is isolated behind its component boundary", () => {
  assert.match(pageSource, /import \{ HealthFitnessTab \} from "\.\/health-fitness-tab"/);
  assert.match(pageSource, /<HealthFitnessTab[\s\S]*metricEntries=\{metricEntries\}[\s\S]*workouts=\{workouts\}/);
  assert.match(hookSource, /client\.from\("adhdice_health_meal_entries"\)/);
  assert.match(hookSource, /client\.from\("adhdice_health_water_entries"\)/);
  assert.match(hookSource, /client\.from\("adhdice_health_metric_entries"\)/);
});

test("Fitness migration is idempotent, text-typed, owner-scoped, and future-source ready", () => {
  assert.match(migrationSource, /create table if not exists public\.adhdice_health_workouts/);
  assert.match(migrationSource, /duration_seconds integer not null check \(duration_seconds > 0\)/);
  assert.match(migrationSource, /active_calories numeric check \(active_calories is null or active_calories >= 0\)/);
  assert.match(migrationSource, /source text not null default 'manual'/);
  assert.match(migrationSource, /create unique index if not exists adhdice_health_workouts_user_source_external_id_idx/);
  assert.match(migrationSource, /where source_external_id is not null/);
  assert.match(migrationSource, /grant select, insert, update, delete on table public\.adhdice_health_workouts to authenticated/);
  assert.match(migrationSource, /using \(\(select auth\.uid\(\)\) = user_id\)/);
  assert.doesNotMatch(migrationSource, /create type .*workout/i);
});

test("all 7.12.114 release version surfaces stay aligned", () => {
  assert.equal(packageJson.version, "7.12.114");
  assert.equal(packageLock.version, "7.12.114");
  assert.equal(packageLock.packages[""].version, "7.12.114");
  assert.match(appVersionSource, /"version":\s*"7\.12\.114"/);
  assert.match(appVersionModuleSource, /APP_VERSION = "7\.12\.114"/);
  assert.match(currentStateSource, /Current working app version: `7\.12\.114`/);
  assert.match(taskAppSource, /const APP_VERSION = CURRENT_APP_VERSION/);
  assert.match(taskAppSource, /const HUD_VERSION = APP_VERSION/);
});
