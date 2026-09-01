import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8");
const scannerSource = readFileSync(new URL("../src/components/task-app/health-barcode-scanner.tsx", import.meta.url), "utf8");
const useHealthSource = readFileSync(new URL("../src/hooks/useHealth.ts", import.meta.url), "utf8");
const healthUtilsSource = readFileSync(new URL("../src/lib/health-utils.ts", import.meta.url), "utf8");
const foodSource = source.slice(source.indexOf('{activeTab === "Food"'), source.indexOf('{activeTab === "Water"'));
const inlineEditorSource = source.slice(source.indexOf("function renderMealEntryEditor()"), source.indexOf("\n\n  return (", source.indexOf("function renderMealEntryEditor()")));
const barcodeToolsSource = source.slice(source.indexOf("function renderMealBarcodeTools()"), source.indexOf("function renderMealCategoryFilter()"));
const categorySource = source.slice(source.indexOf("function renderMealCategoryFilter()"), source.indexOf("function renderMealEntryEditor()"));
const saveSource = source.slice(source.indexOf("async function handleSaveMeal()"), source.indexOf("function openMealComposerForSlot"));
const submitSource = source.slice(source.indexOf("async function submitMeal()"), source.indexOf("function clearMealDraft"));
const clearSource = source.slice(source.indexOf("function clearMealDraft"), source.indexOf("function openMealComposerForSlot"));
const healthPanelSource = source.slice(source.indexOf("function HealthPanel("));
const sectionMiniTitleSource = source.slice(source.indexOf("function SectionMiniTitle("), source.indexOf("function FoodHistoryDateChip("));
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

test("Add Food keeps personal sources and removes public text search", () => {
  assert.doesNotMatch(source, /searchHealthFoods|Search foods and barcodes|USDA FoodData Central|Search public foods/);
  assert.match(inlineEditorSource, /placeholder="Search custom foods"/);
  assert.match(source, /title="Favorites & Recent Foods"/);
  assert.match(source, /<HealthLibraryPanel/);
});

test("Add Food barcode lookup fills the draft without saving it", () => {
  assert.match(source, /<HealthBarcodeScanner/);
  assert.match(inlineEditorSource, /renderMealBarcodeTools\(\)/);
  assert.match(source, /function handleMealBarcodeDetected\(barcode: string\)/);
  assert.match(source, /void runBarcodeLookup\(barcode\)/);
  assert.match(source, /setMealDraft\(\(current\) => \(\{ \.\.\.current, barcode: trimmedCode \}\)\)/);
  assert.match(source, /if \(!result\) \{\s+setBarcodeLookupError\("No food details found for this barcode\./);
  assert.match(source, /applyLookupResult\(result\)/);
  assert.doesNotMatch(source.slice(source.indexOf("function handleMealBarcodeDetected"), source.indexOf("function applyLookupResult")), /addMealEntry/);
});

test("Clear resets the current food draft and lookup state without changing editor context", () => {
  assert.match(inlineEditorSource, /title="Clear current food selection"/);
  assert.match(clearSource, /setMealDraft\(\(current\) => resetMealDraftForNextItem\(current\)\)/);
  assert.match(clearSource, /setCustomFoodSearchQuery\(""\)/);
  assert.match(clearSource, /setBarcodeLookupError\(""\)/);
  assert.match(clearSource, /setBarcodeLookupStatus\("idle"\)/);
  assert.match(clearSource, /setIsScannerOpen\(false\)/);
  assert.doesNotMatch(clearSource, /setMealEditorMode|setEditingMealPlanId|setActiveMealEntrySlot/);
});

test("Meal Logging uses compact header/body spacing while other HealthPanel instances keep the default", () => {
  const mealLoggingStart = foodSource.indexOf('<HealthPanel\n            className="min-w-0"');
  const mealLoggingEnd = foodSource.indexOf("<HealthPanel\n", mealLoggingStart + 1);
  const mealLoggingPanel = foodSource.slice(mealLoggingStart, mealLoggingEnd);
  assert.ok(mealLoggingStart >= 0 && mealLoggingEnd > mealLoggingStart);
  assert.match(mealLoggingPanel, /contentTopClassName="pt-1 sm:pt-1"/);
  assert.match(mealLoggingPanel, /headerChevronClassName="-translate-y-0.5"/);
  assert.match(mealLoggingPanel, /headerPaddingClassName="py-2 sm:py-2"/);
  assert.match(mealLoggingPanel, /<div className="grid gap-3">/);
  assert.doesNotMatch(mealLoggingPanel, /className="mt-3 grid gap-3"/);
  assert.match(healthPanelSource, /contentTopClassName = "pt-3 sm:pt-4"/);
  assert.match(healthPanelSource, /headerChevronClassName = ""/);
  assert.match(healthPanelSource, /headerPaddingClassName = "py-4 sm:py-5"/);
  assert.match(healthPanelSource, /headerChevronClassName\?: string/);
  assert.match(healthPanelSource, /headerPaddingClassName\?: string/);
  assert.match(healthPanelSource, /headerPaddingClassName\].filter\(Boolean\).join\(" "\)/);
  assert.match(healthPanelSource, /className=\{`px-3 pb-4 sm:px-5 sm:pb-5 \$\{contentTopClassName\}`\}/);
  assert.match(foodSource, /<HealthPanel[\s\S]*?subtitle="Daily totals"/);
  assert.match(foodSource, /<HealthPanel[\s\S]*?title="Favorites & Recent Foods"/);
});

test("Meal Logging keeps its date chip inline while SectionMiniTitle keeps default action alignment", () => {
  const mealLoggingStart = foodSource.indexOf('<HealthPanel\n            className="min-w-0"');
  const mealLoggingEnd = foodSource.indexOf("<HealthPanel\n", mealLoggingStart + 1);
  const mealLoggingPanel = foodSource.slice(mealLoggingStart, mealLoggingEnd);
  const titleRowStart = mealLoggingPanel.indexOf('<div className="flex flex-wrap items-center gap-2">');
  const titleRowEnd = mealLoggingPanel.indexOf("</div>", titleRowStart);
  const titleRow = mealLoggingPanel.slice(titleRowStart, titleRowEnd);
  assert.ok(titleRowStart >= 0 && titleRowEnd > titleRowStart);
  assert.doesNotMatch(titleRow, /justify-between/);
  assert.doesNotMatch(titleRow, /SectionMiniTitle/);
  assert.ok(titleRow.indexOf('<p className="text-[11px]') < titleRow.indexOf("<FoodHistoryDateChip"));
  assert.match(sectionMiniTitleSource, /<div className="flex flex-wrap items-center justify-between gap-2">/);
  assert.match(foodSource, /<SectionMiniTitle title="Planned" \/>/);
  assert.match(foodSource, /<SectionMiniTitle title="Favorites" \/>/);
  assert.match(foodSource, /<SectionMiniTitle title="Recent Foods" \/>/);
});

test("inline Add Food removes manual barcode controls and keeps one compact scanner action", () => {
  assert.doesNotMatch(inlineEditorSource, /Barcode \(optional\)/);
  assert.doesNotMatch(barcodeToolsSource, /<input/);
  assert.doesNotMatch(barcodeToolsSource, />Lookup</);
  assert.match(barcodeToolsSource, /<AdhdIconButton/);
  assert.match(barcodeToolsSource, /aria-label="Scan barcode"/);
  assert.match(barcodeToolsSource, /title="Scan barcode"/);
  assert.match(barcodeToolsSource, /<ScanBarcode/);
  assert.match(inlineEditorSource, /isScannerOpen \? <HealthBarcodeScanner/);
  assert.doesNotMatch(barcodeToolsSource, /<div/);
});

test("inline Add Food categories are collapsed by default and visibly retain an active filter", () => {
  assert.match(source, /const \[isCustomFoodCategoriesOpen, setIsCustomFoodCategoriesOpen\] = useState\(false\)/);
  assert.match(categorySource, /aria-expanded=\{isCustomFoodCategoriesOpen\}/);
  assert.match(categorySource, /\{selectedCustomFoodCategory && !isCustomFoodCategoriesOpen \? `Categories · \$\{selectedCustomFoodCategory\}` : "Categories"\}/);
  assert.match(categorySource, /\{isCustomFoodCategoriesOpen \? \(/);
  assert.match(categorySource, /setSelectedCustomFoodCategory\(\(current\) => current === category \? null : category\)/);
  const openSource = source.slice(source.indexOf("function openMealComposerForSlot"), source.indexOf("function closeMealEntryEditor"));
  assert.match(openSource, /setSelectedCustomFoodCategory\(null\)/);
  assert.match(openSource, /setIsCustomFoodCategoriesOpen\(false\)/);
});

test("normal Add Food keeps the primary keyboard fields ahead of the scanner action", () => {
  const foodIndex = inlineEditorSource.indexOf('ariaLabel="Search custom foods"');
  const measurementIndex = inlineEditorSource.indexOf('ariaLabel="Measurement"');
  const amountIndex = inlineEditorSource.indexOf('label="Amount"');
  const timeIndex = inlineEditorSource.indexOf('label="Time"');
  const scannerIndex = inlineEditorSource.indexOf("renderMealBarcodeTools()");
  assert.ok(foodIndex >= 0 && foodIndex < measurementIndex);
  assert.ok(measurementIndex < amountIndex);
  assert.ok(amountIndex < timeIndex);
  assert.ok(timeIndex < scannerIndex);
  assert.match(inlineEditorSource, /minmax\(4rem,0\.4fr\)/);
  assert.ok(scannerIndex < inlineEditorSource.indexOf("renderMealCategoryFilter()"));
});

test("Categories are visually placed beneath Food without changing the fast keyboard order", () => {
  assert.match(categorySource, /sm:col-start-1 sm:row-start-2/);
  assert.ok(inlineEditorSource.indexOf('ariaLabel="Search custom foods"') < inlineEditorSource.indexOf('ariaLabel="Measurement"'));
  assert.ok(inlineEditorSource.indexOf('ariaLabel="Measurement"') < inlineEditorSource.indexOf('label="Amount"'));
  assert.ok(inlineEditorSource.indexOf('label="Amount"') < inlineEditorSource.indexOf('label="Time"'));
  assert.ok(inlineEditorSource.indexOf('label="Time"') < inlineEditorSource.indexOf("renderMealBarcodeTools()"));
  assert.ok(inlineEditorSource.indexOf("renderMealBarcodeTools()") < inlineEditorSource.indexOf("renderMealCategoryFilter()"));
  assert.match(source, /const \[isCustomFoodCategoriesOpen, setIsCustomFoodCategoriesOpen\] = useState\(false\)/);
});

test("Amount Enter fast-submits actual and plan food, while invalid or composing Enter does nothing", () => {
  assert.match(inlineEditorSource, /event\.key !== "Enter"/);
  assert.match(inlineEditorSource, /event\.isComposing/);
  assert.match(inlineEditorSource, /event\.preventDefault\(\)/);
  assert.match(inlineEditorSource, /if \(canSaveMeal\) \{\s+void submitMeal\(\);/);
  assert.match(submitSource, /if \(!canSaveMeal \|\| mealSaveInFlightRef\.current\)/);
  assert.match(inlineEditorSource, /: isQuickEntryOpen \? "Add Quick Entry" : "Add Food"/);
  assert.match(inlineEditorSource, /editingMealPlanId \? "Save Plan" : "Add to Plan"/);
});

test("Done is the plan action and planned time no longer disables it", () => {
  assert.match(inlineEditorSource, />Done<\/AdhdChip>/);
  assert.match(source, /canMarkDone = isHealthMealPlanConfirmEligible\(plan\)/);
  assert.match(source, />Done<\/button>/);
  assert.doesNotMatch(source, /Confirm becomes available when the planned time arrives/);
});

test("Done uses the local date RPC input, server timestamp, and plan snapshots", () => {
  assert.match(source, /todayHealthDate\(\)/);
  assert.match(useHealthSource, /p_actual_entry_date: actualEntryDate/);
  assert.match(useHealthSource, /buildActualMealEntryInputFromPlan\(plan, \{ entryDate: actualEntryDate, loggedAt: confirmedAt \}\)/);
  assert.match(useHealthSource, /setMessage\(\{ tone: "good", text: newlyCreated \? "Meal plan marked Done\."/);
});

test("the reusable barcode scanner prefers the rear camera and cleans up on every exit", () => {
  assert.match(scannerSource, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(scannerSource, /facingMode: \{ ideal: "environment" \}/);
  assert.match(scannerSource, /formats: \["ean_13", "ean_8", "upc_a", "upc_e"\]/);
  assert.match(scannerSource, /track\.stop\(\)/);
  assert.match(scannerSource, /cancelAnimationFrame\(frameId\)/);
  assert.match(scannerSource, /onDetectedRef\.current\(firstCode\)/);
});

test("native Capacitor scanning bypasses web capability detection and returns the raw barcode", () => {
  assert.match(scannerSource, /import \{ Capacitor \} from "@capacitor\/core"/);
  assert.match(scannerSource, /CapacitorBarcodeScanner\.scanBarcode\(/);
  assert.match(scannerSource, /CapacitorBarcodeScannerCameraDirection\.BACK/);
  assert.match(scannerSource, /CapacitorBarcodeScannerTypeHint\.ALL/);
  assert.match(scannerSource, /const result = await CapacitorBarcodeScanner\.scanBarcode/);
  assert.match(scannerSource, /const barcode = result\.ScanResult\?\.trim\(\)/);
  assert.match(scannerSource, /onDetectedRef\.current\(barcode\)/);
  const nativePlatformCheck = scannerSource.slice(scannerSource.indexOf("if (Capacitor.isNativePlatform())"), scannerSource.indexOf("const detector ="));
  assert.doesNotMatch(nativePlatformCheck, /BarcodeDetector|getUserMedia/);
});

test("native cancellation closes cleanly while genuine native failures remain in the scanner surface", () => {
  assert.match(scannerSource, /NATIVE_SCAN_CANCELLED_CODE/);
  assert.match(scannerSource, /isNativeScanCancellation\(caughtError\)/);
  assert.match(scannerSource, /if \(isNativeScanCancellation\(caughtError\)\) \{\s+onCloseRef\.current\(\);\s+return;/);
  assert.match(scannerSource, /setError\(getNativeScanFailureMessage\(caughtError\)\)/);
  assert.doesNotMatch(scannerSource.slice(scannerSource.indexOf("if (isNativeScanCancellation"), scannerSource.indexOf("setError(getNativeScanFailureMessage")), /onDetectedRef/);
  assert.match(scannerSource, /Camera permission is unavailable/);
  assert.match(scannerSource, /native barcode scanner is unavailable/);
});

test("web fallback keeps BarcodeDetector support detection and browser-only unsupported copy", () => {
  assert.match(scannerSource, /setSupport\(detector && hasCamera \? "ready" : "unsupported"\)/);
  assert.match(scannerSource, /new detectorCtor\(\{ formats: \["ean_13", "ean_8", "upc_a", "upc_e"\] \}\)/);
  assert.match(scannerSource, /Camera barcode scanning is not available in this browser\./);
  assert.match(scannerSource, /support === "unsupported"/);
  assert.match(scannerSource, /support === "native"/);
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

test("inline editor keeps actual fast-entry order and adds Date/Meal only for plan mode", () => {
  assert.match(inlineEditorSource, /HealthAutocomplete/);
  assert.match(inlineEditorSource, /getHealthFoodMeasurementOptions/);
  assert.match(inlineEditorSource, /Quick Entry/);
  assert.match(inlineEditorSource, /type=\"time\"/);
  assert.match(inlineEditorSource, /Add Food/);
  assert.match(inlineEditorSource, /Done/);
  assert.match(inlineEditorSource, /isPlanMode/);
  assert.match(inlineEditorSource, /<Field label=\"Planned date\">/);
  assert.match(inlineEditorSource, /ariaLabel=\"Planned meal\"/);
});

test("selected ledger date and active section are the canonical new-entry authorities", () => {
  assert.match(saveSource, /const selectedMealDate = mealEditorMode === \"plan\" \? mealDraft\.date : foodHistoryDate/);
  assert.match(saveSource, /buildHealthMealLoggedAt\(selectedMealDate, mealDraft\.time\)/);
  assert.match(saveSource, /entry_date: foodHistoryDate,/);
  assert.match(saveSource, /meal_slot: activeMealEntrySlot,/);
  assert.match(source, /prepareMealDraftForSelectedSlot\(current, foodHistoryDate, slot\)/);
  assert.match(source, /preserveFoodDraft\s*\? \{ \.\.\.current, date: foodHistoryDate, mealSlot: slot \}/);
});

test("successful save preserves context, clears food fields, and keeps the inline editor open", () => {
  assert.match(saveSource, /if \(saved\) \{/);
  assert.match(saveSource, /setMealDraft\(\(current\) => \{[\s\S]*?resetMealDraftForNextItem\(current\)/);
  assert.match(saveSource, /date: selectedMealDate,/);
  assert.match(saveSource, /mealSlot: activeMealEntrySlot,/);
  assert.match(saveSource, /return isQuickEntryOpen \? \{ \.\.\.nextDraft, servingQuantity: 1 \} : nextDraft/);
  assert.match(saveSource, /mealEditorMode === "plan" && editingMealPlanId/);
  assert.match(saveSource, /setActiveMealEntrySlot\(null\)/);
  assert.doesNotMatch(saveSource, /createDefaultMealDraft/);
});

test("failed canonical saves leave the inline draft intact", () => {
  assert.match(saveSource, /addMealEntry\(\{/);
  assert.equal((saveSource.match(/resetMealDraftForNextItem/g) ?? []).length, 2);
  assert.match(saveSource, /if \(saved\) \{/);
});

test("Done closes only the active inline editor", () => {
  assert.match(source, /function closeMealEntryEditor\(\) \{\s+setActiveMealEntrySlot\(null\);/);
  assert.match(inlineEditorSource, /<AdhdChip onClick=\{closeMealEntryEditor\}>Done<\/AdhdChip>/);
});

test("changing the ledger date closes the editor before changing date authority", () => {
  assert.match(source, /function handleFoodHistoryDateChange\(date: string\) \{\s+setActiveMealEntrySlot\(null\);\s+setEditingMealPlanId\(null\);\s+setMealEditorMode\("actual"\);\s+setIsScannerOpen\(false\);\s+setFoodHistoryDate\(date\);/);
  assert.equal((source.match(/onChange=\{handleFoodHistoryDateChange\}/g) ?? []).length, 2);
  assert.doesNotMatch(saveSource, /setFoodHistoryDate/);
});

test("Quick Entry remains available inside the active section and uses its context", () => {
  assert.match(inlineEditorSource, /onClick=\{isQuickEntryOpen \? closeQuickEntry : openQuickEntry\}/);
  assert.match(inlineEditorSource, /Add Quick Entry/);
  assert.match(source, /date: foodHistoryDate,\s+mealSlot: activeMealEntrySlot \?\? current\.mealSlot,\s+servingQuantity: 1/);
  assert.match(source, /\.\.\.resetMealDraftForNextItem\(current\),\s+barcode: current\.barcode,/);
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

test("logged food cards expose one prominent effective-calorie line and preserve planned cards", () => {
  const loggedCard = foodSource.slice(foodSource.indexOf("{slotMeals.length === 0"), foodSource.indexOf("{editingMealId === entry.id"));
  assert.match(loggedCard, /formatHealthMealSummary\(entry, undefined, \{ includeCalories: false \}\)/);
  assert.match(loggedCard, /text-sm font-semibold[^}]*\{formatHealthNutritionNumber\(getHealthMealNutritionValue\(entry, "calories"\)\)\} kcal/);
  assert.match(loggedCard, /NutritionDetailsDisclosure details=\{entry\.nutrition_snapshot\?\.nutrition_details\}/);
  assert.match(loggedCard, /startEditingMeal\(entry\)/);
  assert.match(loggedCard, /handleSaveFavoriteFromMeal\(entry\)/);
  assert.match(loggedCard, /deleteMealEntry\(entry\.id\)/);
  assert.match(foodSource, /plan\.nutrition_snapshot\?\.calories \?\? plan\.calories\)\} kcal · \{formatPlanTime/);
});

test("logged cards and meal-slot totals share the snapshot-first calorie authority", () => {
  assert.match(source, /const slotCaloriesTotal = slotMeals\.reduce\(\(total, entry\) => total \+ getHealthMealNutritionValue\(entry, "calories"\), 0\)/);
  assert.match(healthUtilsSource, /export function getHealthMealNutritionValue\(entry: HealthMealEntry/);
  assert.match(healthUtilsSource, /getHealthMealNutritionValue\(entry, "calories"\)/);
  assert.match(healthUtilsSource, /options\.includeCalories === false \? null/);
});
