import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildHealthCustomFoodImportTemplate,
  getHealthCustomFoodImportIdentityKey,
  HEALTH_CUSTOM_FOOD_IMPORT_FIELDS,
  parseHealthCustomFoodImport,
  validateHealthCustomFoodImportDraft,
} from "../src/lib/health-food-import.ts";
import type { HealthFoodLibraryItem } from "../src/lib/database.types.ts";
import { getHealthFoodIdentityKey, searchHealthFoodLibrary } from "../src/lib/health-library.ts";

const COMPLETED_FOOD = `
"Name": Goldfish Cheddar Crackers
"Brand": Pepperidge Farm
"Category": Snacks
"Serving Quantity": 55
"Serving Unit": cracker
"Serving Measure Value": 30
"Serving Measure Unit": g
"Calories": 140
"Protein (g)": 3
"Carbohydrates (g)": 20
"Fat (g)": 5
`;

test("custom food import template is generated from every active editable field", () => {
  const templateLines = buildHealthCustomFoodImportTemplate().split("\n");
  assert.equal(templateLines.length, HEALTH_CUSTOM_FOOD_IMPORT_FIELDS.length);
  for (const field of HEALTH_CUSTOM_FOOD_IMPORT_FIELDS) {
    assert.ok(templateLines.includes(`"${field.label}": `));
  }
  assert.ok(templateLines.every((line) => /^"[^\"]+": $/.test(line)));
});

test("placeholder and Copy Template use the same canonical template", () => {
  const source = readFileSync(new URL("../src/components/task-app/health-library-panel.tsx", import.meta.url), "utf8");
  assert.match(source, /placeholder=\{buildHealthCustomFoodImportTemplate\(\)\}/);
  assert.match(source, /const template = buildHealthCustomFoodImportTemplate\(\)/);
});

test("one completed block parses into an editable draft and preserves blank fields", () => {
  const parsed = parseHealthCustomFoodImport(COMPLETED_FOOD.replace('"Protein (g)": 3', '"Protein (g)": '));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.draft.food_name, "Goldfish Cheddar Crackers");
  assert.equal(parsed[0]?.draft.serving_quantity, "55");
  assert.equal(parsed[0]?.draft.protein_g, "");
  assert.equal(parsed[0]?.unknownFields.length, 0);
});

test("custom food blocks split on blank lines and delimiter lines", () => {
  const parsed = parseHealthCustomFoodImport(`${COMPLETED_FOOD}\n\n${COMPLETED_FOOD.replace("Goldfish Cheddar Crackers", "Apple")}`);
  const delimited = parseHealthCustomFoodImport(`${COMPLETED_FOOD}\n---\n${COMPLETED_FOOD.replace("Goldfish Cheddar Crackers", "Orange")}`);
  assert.equal(parsed.length, 2);
  assert.equal(delimited.length, 2);
  assert.equal(delimited[1]?.draft.food_name, "Orange");
});

test("field labels are case-insensitive and unknown fields are reported", () => {
  const parsed = parseHealthCustomFoodImport(`"nAmE": Apple\n"cArBoHyDrAtEs (G)": 12\n"Vitamin C": 4`);
  assert.equal(parsed[0]?.draft.food_name, "Apple");
  assert.equal(parsed[0]?.draft.carbs_g, "12");
  assert.deepEqual(parsed[0]?.unknownFields, ["Vitamin C"]);
});

test("valid custom foods validate independently from invalid foods", () => {
  const valid = parseHealthCustomFoodImport(COMPLETED_FOOD)[0]?.draft;
  const invalid = parseHealthCustomFoodImport(`${COMPLETED_FOOD.replace("Goldfish Cheddar Crackers", "").replace('"Calories": 140', '"Calories": nope')}`)[0]?.draft;
  assert.ok(valid);
  assert.ok(invalid);
  assert.equal(validateHealthCustomFoodImportDraft(valid).errors.length, 0);
  assert.ok(validateHealthCustomFoodImportDraft(invalid).errors.length > 0);
  assert.ok(validateHealthCustomFoodImportDraft(valid).input);
});

test("import identity reuses stable custom-food duplicate behavior", () => {
  const draft = parseHealthCustomFoodImport(COMPLETED_FOOD)[0]?.draft;
  assert.ok(draft);
  const input = validateHealthCustomFoodImportDraft(draft).input;
  assert.ok(input);
  assert.equal(getHealthCustomFoodImportIdentityKey(draft), getHealthFoodIdentityKey(input));
  const library: HealthFoodLibraryItem[] = [{
    ...input,
    attribution: input.attribution ?? null,
    barcode: input.barcode ?? null,
    id: "food-1",
    user_id: "user-1",
    created_at: "2026-08-04T00:00:00.000Z",
    updated_at: "2026-08-04T00:00:00.000Z",
    is_favorite: false,
    provider: input.provider ?? "manual",
    provider_item_id: input.provider_item_id ?? null,
    food_category: input.food_category ?? "Uncategorized",
    serving_label: input.serving_label ?? null,
    serving_size: input.serving_size ?? null,
    serving_quantity: input.serving_quantity ?? 1,
    serving_unit: input.serving_unit ?? "serving",
    serving_measure_value: input.serving_measure_value ?? null,
    serving_measure_unit: input.serving_measure_unit ?? null,
    serving_weight_amount: input.serving_weight_amount ?? null,
    serving_weight_unit: input.serving_weight_unit ?? null,
    brand_name: input.brand_name ?? null,
    category: input.category ?? null,
    protein_g: input.protein_g ?? null,
    carbs_g: input.carbs_g ?? null,
    fat_g: input.fat_g ?? null,
  }];
  assert.equal(getHealthFoodIdentityKey(library[0]), getHealthCustomFoodImportIdentityKey(draft));
  assert.equal(searchHealthFoodLibrary(library, "Goldfish").length, 1);
});

test("Health Library wires import preview, confirmation, and normal persistence", () => {
  const source = readFileSync(new URL("../src/components/task-app/health-library-panel.tsx", import.meta.url), "utf8");
  assert.match(source, /parseHealthCustomFoodImport\(foodImportText\)/);
  assert.match(source, /validateHealthCustomFoodImportDraft\(row\.draft\)/);
  assert.match(source, /await saveFood\(review\.input\)/);
  assert.match(source, /Confirm Import/);
  assert.match(source, /duplicate/);
});

test("Custom Food editing exposes and persists barcode without changing import fields", () => {
  const panel = readFileSync(new URL("../src/components/task-app/health-library-panel.tsx", import.meta.url), "utf8");
  const barcodeHandler = panel.slice(panel.indexOf("function handleFoodBarcodeDetected"), panel.indexOf("function openFoodImport"));
  assert.match(panel, /barcode: string/);
  assert.match(panel, /barcode: food\.barcode \?\? ""/);
  assert.match(panel, /barcode: emptyToNull\(foodDraft\.barcode\)/);
  assert.match(panel, /<HealthBarcodeScanner/);
  assert.match(barcodeHandler, /setFoodDraft\(\(current\) => \(\{ \.\.\.current, barcode: scannedBarcode \}\)\)/);
  assert.match(panel, /Barcode scanned\. No food details found, enter the remaining information manually\./);
  assert.match(panel, /mergeFoodDraftWithBarcodeResult/);
  assert.match(panel, /parseBarcodeServingLabel\(result\.servingLabel\)/);
  assert.match(panel, /servingMeasureValue: hasEditedServing \? draft\.servingMeasureValue : serving\.measureValue/);
  assert.doesNotMatch(barcodeHandler, /saveFood\(/);
  assert.match(panel, /Save food/);
});

test("Health import merges each successful food with the latest state and keeps counts distinct", () => {
  const hook = readFileSync(new URL("../src/hooks/useHealth.ts", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../src/components/task-app/health-library-panel.tsx", import.meta.url), "utf8");
  assert.match(hook, /healthSnapshotRef = useRef<HealthStateSnapshot \| null>\(null\)/);
  assert.match(hook, /const currentSnapshot = healthSnapshotRef\.current/);
  assert.match(hook, /currentSnapshot\.favorites\.filter/);
  assert.match(hook, /foodMutationRevisionAtFetchStart/);
  assert.match(hook, /hydratedFavorites/);
  assert.match(panel, /setFoodImportStatus\(`Imported \$\{imported\}; skipped \$\{skippedCount\}; duplicates \$\{duplicateCount\}; invalid \$\{invalidCount\}; failed \$\{failed\}\.\`\)/);
  assert.match(panel, /selectedIdentities/);
});

test("Deleting a custom food leaves meal rows and snapshot-backed editing independent", () => {
  const hook = readFileSync(new URL("../src/hooks/useHealth.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8");
  const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
  assert.match(hook, /favorites: favorites\.filter\(\(entry\) => entry\.id !== itemId\)/);
  assert.match(hook, /favorites: favorites\.filter\(\(entry\) => entry\.id !== itemId\)[\s\S]*?mealEntries,/);
  assert.match(schema, /source_food_id text,/);
  assert.doesNotMatch(schema, /source_food_id text\s+references\s+public\.adhdice_health_food_library/);
  assert.match(page, /const snapshot = entry\.food_snapshot/);
  assert.match(page, /sourceFoodId: entry\.source_food_id \?\? snapshot\.source_food_id/);
  assert.match(page, /getHealthMealSummaryParts\(entry\)/);
});

test("Health meal logger uses the selected ledger date and active section through insert and edit paths", () => {
  const source = readFileSync(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8");
  assert.match(source, /type=\"time\"[\s\S]*value=\{mealDraft\.time\}/);
  assert.match(source, /buildHealthMealLoggedAt\(selectedMealDate, mealDraft\.time\)/);
  assert.match(source, /entry_date: foodHistoryDate/);
  assert.match(source, /meal_slot: activeMealEntrySlot/);
  assert.match(source, /logged_at: loggedAt/);
  assert.match(source, /isHealthMealTimestampFuture\(foodHistoryDate, mealDraft\.time\)/);
  assert.match(source, /updateMealEntry\(entryId/);
});

test("Health meal logger exposes Quick Entry with optional library persistence and safe editing", () => {
  const source = readFileSync(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8");
  const hook = readFileSync(new URL("../src/hooks/useHealth.ts", import.meta.url), "utf8");
  assert.match(source, /const \[saveQuickEntryToLibrary, setSaveQuickEntryToLibrary\] = useState\(false\)/);
  assert.match(source, /Quick Entry/);
  assert.match(source, /food_name: mealDraft\.foodName\.trim\(\)/);
  assert.match(source, /calories: Math\.round\(calculation\.nutrientTotals\.calories\)/);
  assert.match(source, /protein_g: calculation\.nutrientTotals\.protein_g/);
  assert.match(source, /carbs_g: calculation\.nutrientTotals\.carbs_g/);
  assert.match(source, /fat_g: calculation\.nutrientTotals\.fat_g/);
  assert.match(source, /await saveFavoriteFood\(libraryInput\)/);
  assert.match(source, /source_food_id: sourceFoodId/);
  assert.match(source, /const foodSnapshot = buildMealFoodSnapshot\(\{ \.\.\.mealDraft, sourceFoodId \}\)/);
  assert.match(source, /food_snapshot: foodSnapshot/);
  assert.match(source, /meal_slot: activeMealEntrySlot/);
  assert.match(source, /entry_date: foodHistoryDate/);
  assert.match(source, /logged_at: loggedAt/);
  assert.match(hook, /\.map\(\(entry\) => entry\.id === entryId \? nextRow : entry\)/);
});
