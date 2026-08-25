import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8");
const useHealthSource = readFileSync(new URL("../src/hooks/useHealth.ts", import.meta.url), "utf8");

test("successful save resets only inside the saved branch and preserves draft context", () => {
  assert.match(source, /if \(saved\) \{\s+setMealDraft\(\(current\) => \{[\s\S]*?resetMealDraftForNextItem\(current\)/);
  assert.doesNotMatch(source, /if \(saved\) \{\s+setMealDraft\(\(current\) => createDefaultMealDraft/);
  assert.match(source, /setSaveQuickEntryToLibrary\(false\);\s+\}/);
});

test("failed addMealEntry leaves the draft untouched", () => {
  const saveBlock = source.slice(source.indexOf("async function handleSaveMeal()"), source.indexOf("function openMealComposerForSlot"));
  assert.match(saveBlock, /const saved = await addMealEntry\(/);
  assert.match(saveBlock, /if \(saved\) \{/);
  assert.equal((saveBlock.match(/resetMealDraftForNextItem/g) ?? []).length, 1);
});

test("the canonical meal payload sends the draft date, slot, and logged timestamp", () => {
  assert.match(source, /entry_date: mealDraft\.date,/);
  assert.match(source, /meal_slot: mealDraft\.mealSlot,/);
  assert.match(source, /logged_at: loggedAt,/);
  assert.match(useHealthSource, /from\("adhdice_health_meal_entries"\)\s*\.insert/);
});

test("section Add Food targets the selected history date through one composer helper", () => {
  assert.match(source, /function openMealComposerForSlot\(slot: HealthMealEntry\["meal_slot"\]\)/);
  assert.match(source, /prepareMealDraftForSelectedSlot\(current, foodHistoryDate, slot\)/);
  assert.match(source, /onClick=\{\(\) => openMealComposerForSlot\(slot\)\}/);
  assert.match(source, /mealComposerRef\.current\?\.scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
  assert.match(source, /id="health-food-composer-input"/);
});

test("all meal slots render from the canonical slot list with an Add Food action", () => {
  assert.match(source, /HEALTH_MEAL_SLOTS\.map\(\(slot\) =>/);
  assert.match(source, /\+ Add Food/);
  assert.match(source, /aria-label=\{`Add food to \$\{getMealSlotLabel\(slot\)\}`\}/);
  assert.match(source, /No \$\{getMealSlotLabel\(slot\)\.toLowerCase\(\)\} logged yet\./);
  assert.doesNotMatch(source, /selectedMeals\.length === 0 \? \([\s\S]*?No meals were logged on this date/);
});

test("the four canonical meal slots remain breakfast, lunch, dinner, and snack", () => {
  assert.match(source, /HEALTH_MEAL_SLOTS/);
  assert.match(readFileSync(new URL("../src/lib/health-utils.ts", import.meta.url), "utf8"), /\["breakfast", "lunch", "dinner", "snack"\]/);
});

test("manual date and meal controls remain editable", () => {
  assert.match(source, /onChange=\{\(value\) => setMealDraft\(\(current\) => \(\{ \.\.\.current, mealSlot: value/);
  assert.match(source, /onChange=\{\(value\) => setMealDraft\(\(current\) => \(\{ \.\.\.current, date: value \}\)\)\}/);
  assert.match(source, /onChange=\{\(value\) => setMealDraft\(\(current\) => \(\{ \.\.\.current, time: value \}\)\)\}/);
});

test("future meal timestamp validation remains on the canonical save path", () => {
  assert.match(source, /isHealthMealTimestampFuture\(mealDraft\.date, mealDraft\.time\)/);
  assert.match(source, /Future meal times cannot be saved\./);
});

test("Quick Entry uses the same draft context and stays available for another item", () => {
  assert.match(source, /function openQuickEntry\(\)[\s\S]*?resetMealDraftForNextItem\(current\)/);
  assert.match(source, /return isQuickEntryOpen \? \{ \.\.\.nextDraft, servingQuantity: 1 \} : nextDraft/);
  assert.match(source, /\{isQuickEntryOpen \? "Log Quick Entry" : "Log"\}/);
});

test("Favorite Add Today remains an explicit today-only persistence action", () => {
  assert.match(source, /entry_date: today,/);
  assert.match(source, /Add Today/);
});

test("history date state is not rewritten by the meal-save handler", () => {
  const saveBlock = source.slice(source.indexOf("async function handleSaveMeal()"), source.indexOf("function openMealComposerForSlot"));
  assert.doesNotMatch(saveBlock, /setFoodHistoryDate/);
});

test("existing edit, delete, and canonical totals paths remain present", () => {
  assert.match(source, /function startEditingMeal\(entry: HealthMealEntry\)/);
  assert.match(source, /deleteMealEntry\(entry\.id\)/);
  assert.match(source, /sumMealNutritionForDate\(mealEntries, foodHistoryDate\)/);
});
