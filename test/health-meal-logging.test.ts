import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8");
const useHealthSource = readFileSync(new URL("../src/hooks/useHealth.ts", import.meta.url), "utf8");
const healthUtilsSource = readFileSync(new URL("../src/lib/health-utils.ts", import.meta.url), "utf8");
const foodSource = source.slice(source.indexOf('{activeTab === "Food"'), source.indexOf('{activeTab === "Water"'));
const inlineEditorSource = source.slice(source.indexOf("function renderMealEntryEditor()"), source.indexOf("\n\n  return (", source.indexOf("function renderMealEntryEditor()")));
const saveSource = source.slice(source.indexOf("async function handleSaveMeal()"), source.indexOf("function openMealComposerForSlot"));
const favoriteHandlerSource = source.slice(source.indexOf("function handleFavoriteReuse"), source.indexOf("async function handleRemoveFavorite"));
const recentHandlerSource = source.slice(source.indexOf("function handleRecentFoodReuse"), source.indexOf("async function handleRemoveFavorite"));
const lookupHandlerSource = source.slice(source.indexOf("function applyLookupResult"), source.indexOf("function applyMealFoodPickerSuggestion"));

test("the Food page no longer renders a global meal composer", () => {
  assert.doesNotMatch(source, /mealComposerRef/);
  assert.doesNotMatch(source, /scrollIntoView/);
  assert.doesNotMatch(source, /health-food-composer-input/);
  assert.doesNotMatch(foodSource, /Quick Add Food/);
  assert.doesNotMatch(foodSource, /Log Quick Entry/);
  assert.doesNotMatch(foodSource, /ref=\{mealComposerRef\}/);
});

test("all four canonical meal sections remain visible for empty and populated days", () => {
  assert.match(source, /HEALTH_MEAL_SLOTS\.map\(\(slot\) =>/);
  assert.match(source, /No \$\{getMealSlotLabel\(slot\)\.toLowerCase\(\)\} logged yet\./);
  assert.match(source, /aria-label=\{`Add food to \$\{getMealSlotLabel\(slot\)\}`\}/);
  assert.match(source, /\+ Add Food/);
  assert.doesNotMatch(foodSource, /selectedMeals\.length === 0 \? \([\s\S]*?No meals were logged on this date/);
});

test("the meal ledger keeps breakfast, lunch, dinner, and snack as its only slots", () => {
  assert.match(healthUtilsSource, /\["breakfast", "lunch", "dinner", "snack"\]/);
});

test("each section opens the one shared inline editor for its own slot", () => {
  assert.match(source, /const \[activeMealEntrySlot, setActiveMealEntrySlot\] = useState/);
  assert.match(foodSource, /onClick=\{\(\) => openMealComposerForSlot\(slot\)\}/);
  assert.match(foodSource, /activeMealEntrySlot === slot \? renderMealEntryEditor\(\) : null/);
  assert.match(source, /setActiveMealEntrySlot\(slot\);/);
});

test("inline editor keeps food capabilities and excludes Date and Meal controls", () => {
  assert.match(inlineEditorSource, /HealthAutocomplete/);
  assert.match(inlineEditorSource, /getHealthFoodMeasurementOptions/);
  assert.match(inlineEditorSource, /Quick Entry/);
  assert.match(inlineEditorSource, /type=\"time\"/);
  assert.match(inlineEditorSource, /Add Food/);
  assert.match(inlineEditorSource, /Done/);
  assert.doesNotMatch(inlineEditorSource, /<Field label=\"Date\">/);
  assert.doesNotMatch(inlineEditorSource, /<Field label=\"Meal\">/);
  assert.doesNotMatch(inlineEditorSource, /ariaLabel=\"Meal\"/);
});

test("selected ledger date and active section are the canonical new-entry authorities", () => {
  assert.match(saveSource, /buildHealthMealLoggedAt\(foodHistoryDate, mealDraft\.time\)/);
  assert.match(saveSource, /entry_date: foodHistoryDate,/);
  assert.match(saveSource, /meal_slot: activeMealEntrySlot,/);
  assert.match(source, /prepareMealDraftForSelectedSlot\(current, foodHistoryDate, slot\)/);
  assert.match(source, /preserveFoodDraft\s*\? \{ \.\.\.current, date: foodHistoryDate, mealSlot: slot \}/);
});

test("successful save preserves context, clears food fields, and keeps the inline editor open", () => {
  assert.match(saveSource, /if \(saved\) \{\s+setMealDraft\(\(current\) => \{[\s\S]*?resetMealDraftForNextItem\(current\)/);
  assert.match(saveSource, /date: foodHistoryDate,/);
  assert.match(saveSource, /mealSlot: activeMealEntrySlot,/);
  assert.match(saveSource, /return isQuickEntryOpen \? \{ \.\.\.nextDraft, servingQuantity: 1 \} : nextDraft/);
  assert.doesNotMatch(saveSource, /setActiveMealEntrySlot\(null\)/);
  assert.doesNotMatch(saveSource, /createDefaultMealDraft/);
});

test("failed canonical saves leave the inline draft intact", () => {
  assert.match(saveSource, /const saved = await addMealEntry\(/);
  assert.equal((saveSource.match(/resetMealDraftForNextItem/g) ?? []).length, 1);
  assert.match(saveSource, /if \(saved\) \{/);
});

test("Done closes only the active inline editor", () => {
  assert.match(source, /function closeMealEntryEditor\(\) \{\s+setActiveMealEntrySlot\(null\);/);
  assert.match(inlineEditorSource, /<AdhdChip onClick=\{closeMealEntryEditor\}>Done<\/AdhdChip>/);
});

test("changing the ledger date closes the editor before changing date authority", () => {
  assert.match(source, /function handleFoodHistoryDateChange\(date: string\) \{\s+setActiveMealEntrySlot\(null\);\s+setFoodHistoryDate\(date\);/);
  assert.equal((source.match(/onChange=\{handleFoodHistoryDateChange\}/g) ?? []).length, 2);
  assert.doesNotMatch(saveSource, /setFoodHistoryDate/);
});

test("Quick Entry remains available inside the active section and uses its context", () => {
  assert.match(inlineEditorSource, /onClick=\{isQuickEntryOpen \? closeQuickEntry : openQuickEntry\}/);
  assert.match(inlineEditorSource, /Add Quick Entry/);
  assert.match(source, /date: foodHistoryDate,\s+mealSlot: activeMealEntrySlot \?\? current\.mealSlot,\s+servingQuantity: 1/);
  assert.match(saveSource, /sourceFoodId = null/);
  assert.match(saveSource, /return isQuickEntryOpen \? \{ \.\.\.nextDraft, servingQuantity: 1 \} : nextDraft/);
});

test("future timestamp validation remains on the canonical selected-date save path", () => {
  assert.match(source, /isHealthMealTimestampFuture\(foodHistoryDate, mealDraft\.time\)/);
  assert.match(source, /Future meal times cannot be saved\./);
});

test("Favorite reuse cannot save or silently choose a meal when the editor is closed", () => {
  assert.match(favoriteHandlerSource, /if \(activeMealEntrySlot === null\) \{\s+return;/);
  assert.doesNotMatch(favoriteHandlerSource, /addMealEntry/);
  assert.doesNotMatch(favoriteHandlerSource, /entry_date:/);
  assert.doesNotMatch(favoriteHandlerSource, /meal_slot:/);
  assert.doesNotMatch(favoriteHandlerSource, /today/);
  assert.match(foodSource, /disabled=\{activeMealEntrySlot === null\}/);
  assert.match(foodSource, /Open a meal first/);
});

test("Favorite reuse fills the active Breakfast, Lunch, Dinner, or Snack editor", () => {
  assert.match(favoriteHandlerSource, /applyLookupResult\(\{/);
  assert.match(favoriteHandlerSource, /foodName: selection\.foodName/);
  assert.match(favoriteHandlerSource, /servingMeasureUnit: selection\.servingMeasureUnit/);
  assert.match(foodSource, /`Use in \$\{getMealSlotLabel\(activeMealEntrySlot\)\}`/);
  assert.match(source, /activeMealEntrySlot === slot \? renderMealEntryEditor\(\) : null/);
  assert.match(saveSource, /entry_date: foodHistoryDate,/);
  assert.match(saveSource, /meal_slot: activeMealEntrySlot,/);
});

test("Favorite reuse preserves selected date, active slot, current time, and normal Add confirmation", () => {
  assert.match(lookupHandlerSource, /setMealDraft\(\(current\) => \(\{\s+\.\.\.current,/);
  assert.doesNotMatch(lookupHandlerSource, /date:|mealSlot:/);
  assert.match(favoriteHandlerSource, /applyLookupResult\(\{/);
  assert.match(source, /time: value/);
  assert.match(inlineEditorSource, /disabled=\{!canSaveMeal\}/);
  assert.match(inlineEditorSource, /Add Food/);
  assert.doesNotMatch(favoriteHandlerSource, /await/);
});

test("Recent Food reuse cannot invisibly fill a closed editor", () => {
  assert.match(recentHandlerSource, /if \(activeMealEntrySlot === null\) \{\s+return;/);
  assert.match(recentHandlerSource, /applyLookupResult\(\{/);
  assert.doesNotMatch(recentHandlerSource, /addMealEntry/);
  assert.match(foodSource, /disabled=\{activeMealEntrySlot === null\}/);
});

test("Recent Food reuse fills the active editor without changing date or meal slot", () => {
  assert.match(recentHandlerSource, /foodName: item\.food_name/);
  assert.match(recentHandlerSource, /providerItemId: item\.provider_item_id \?\? item\.id/);
  assert.match(recentHandlerSource, /sourceFoodId: item\.source_food_id \?\? item\.food_snapshot\?\.source_food_id/);
  assert.match(lookupHandlerSource, /setMealDraft\(\(current\) => \(\{\s+\.\.\.current,/);
  assert.doesNotMatch(lookupHandlerSource, /date:|mealSlot:/);
  assert.match(saveSource, /entry_date: foodHistoryDate,/);
  assert.match(saveSource, /meal_slot: activeMealEntrySlot,/);
  assert.match(inlineEditorSource, /disabled=\{!canSaveMeal\}/);
});

test("canonical persistence, editing, deletion, and totals remain unchanged", () => {
  assert.match(useHealthSource, /from\("adhdice_health_meal_entries"\)\s*\.insert/);
  assert.match(source, /function startEditingMeal\(entry: HealthMealEntry\)/);
  assert.match(source, /deleteMealEntry\(entry\.id\)/);
  assert.match(source, /sumMealNutritionForDate\(mealEntries, foodHistoryDate\)/);
});
