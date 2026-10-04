import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const healthSource = readFileSync(new URL("../src/hooks/useHealth.ts", import.meta.url), "utf8");
const homeSource = readFileSync(new URL("../src/components/task-app/home-page.tsx", import.meta.url), "utf8");
const reviewSource = readFileSync(new URL("../src/components/task-app/home-batch-intake-review.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");

test("Health batch writes stay inside useHealth and publish one complete snapshot", () => {
  assert.match(healthSource, /async function addWaterEntries\(/);
  assert.match(healthSource, /async function addWeightEntries\(/);
  assert.match(healthSource, /\.from\("adhdice_health_water_entries"\)\s*\n\s*\.upsert/);
  assert.match(healthSource, /\.from\("adhdice_health_weight_entries"\)\s*\n\s*\.upsert/);
  assert.match(healthSource, /waterEntries: \[\.\.\.nextRows/);
  assert.match(healthSource, /weightEntries: \[\.\.\.nextRows/);
  assert.match(healthSource, /claimEligibleAwards\(nextSnapshot, operation/);
  assert.match(healthSource, /onConflict: "id"/);
  assert.match(healthSource, /did not return every Water row/);
  assert.match(healthSource, /did not return every Weight row/);
  assert.match(healthSource, /async function addMealEntries\(/);
  assert.match(healthSource, /\.from\("adhdice_health_meal_entries"\)\s*\n\s*\.upsert/);
  assert.match(healthSource, /mealEntries: \[\.\.\.nextRows/);
  assert.match(healthSource, /did not return every Meal row/);
});

test("Health Meal writes normalize integer calories before local and remote persistence", () => {
  const singleMealSource = healthSource.slice(healthSource.indexOf("async function addMealEntry"), healthSource.indexOf("async function addMealEntries"));
  const batchMealSource = healthSource.slice(healthSource.indexOf("async function addMealEntries"), healthSource.indexOf("async function deleteMealEntry"));
  assert.match(healthSource, /normalizeHealthMealStoredCalories/);
  assert.match(singleMealSource, /const storedCalories = normalizeHealthMealStoredCalories\(input\.calories\)/);
  assert.match(singleMealSource, /calories: storedCalories/);
  assert.match(singleMealSource, /\.insert\(\{[\s\S]*calories: storedCalories,[\s\S]*user_id: userId/);
  assert.match(batchMealSource, /const storedCalories = normalizeHealthMealStoredCalories\(input\.calories\)/);
  assert.match(batchMealSource, /validInputs\.push\(\{ index, input: \{ \.\.\.input, calories: storedCalories \} \}\)/);
  assert.match(batchMealSource, /calories: input\.calories/);
  assert.match(batchMealSource, /localRows\.map\(\(\{\s*created_at, updated_at, \.\.\.row\s*\}/);
});

test("Home batch intake keeps Scratchpad source text separate and activates Health lazily", () => {
  assert.match(homeSource, /Parse Batch Intake/);
  assert.match(homeSource, /function openManualBatch\(\)/);
  assert.match(homeSource, /setBatchIntakeDrafts\(\[\]\)/);
  assert.match(homeSource, /Manual Batch/);
  assert.match(homeSource, /Shorthand/);
  assert.match(homeSource, /Scratchpad Shorthand V1/);
  assert.match(homeSource, /NBA 2K - Done 9\/27 9\/28 9\/29/);
  assert.match(homeSource, /createManualBatchIntakeDraft/);
  assert.match(homeSource, /removeBatchIntakeRow/);
  assert.match(homeSource, /parseBatchIntake\(scratchpadDraft/);
  assert.match(homeSource, /setBatchIntakeDrafts\(applyBatchIntakeTaskMatches/);
  assert.match(homeSource, /setScratchpadDraft\(""\)/);
  assert.match(homeSource, /setBatchIntakeDrafts\(null\)/);
  assert.match(homeSource, /onProgress: setBatchIntakeApplyProgress/);
  assert.match(homeSource, /applyProgress=\{batchIntakeApplyProgress\}/);
  assert.match(homeSource, /applyBatchIntakeTaskMatches\(parsed, tasks, taskContentFolders\)/);
  assert.match(homeSource, /taskContentFolders=\{taskContentFolders\}/);
  assert.match(reviewSource, /OperationProgressBar/);
  assert.match(reviewSource, /Applying Batch Intake/);
  assert.match(reviewSource, /applyProgress\.processed/);
  assert.match(appSource, /activePage === "Health" \|\| batchIntakeHealthActive/);
  assert.match(appSource, /onBatchIntakeHealthActivationChange=\{setBatchIntakeHealthActive\}/);
  assert.match(appSource, /<TaskHomePage[\s\S]*taskContentFolders=\{taskContentFolders\}/);
  assert.match(appSource, /batchIntakeFocusActive/);
  assert.match(appSource, /activePage === "Focus" \|\| activePage === "Stats" \|\| activePage === "Health" \|\| batchIntakeFocusActive/);
  assert.match(appSource, /onBatchIntakeFocusActivationChange=\{setBatchIntakeFocusActive\}/);
  assert.match(reviewSource, /\+ \{kind === "task"/);
  assert.match(reviewSource, /Meals review-only/);
  assert.match(reviewSource, /Focus Session/);
  assert.match(reviewSource, /onRemoveRow/);
  assert.match(homeSource, /draft\.kind === "water" \|\| draft\.kind === "weight" \|\| draft\.kind === "meal"/);
  assert.match(homeSource, /focusCategories,/);
  assert.match(appSource, /healthFoods=\{healthFavorites\}/);
  assert.match(reviewSource, /Add another food/);
  assert.match(reviewSource, /Search foods to add…/);
  assert.match(reviewSource, /onAddMealFood/);
  assert.match(reviewSource, /\+ Add manual food/);
  assert.doesNotMatch(reviewSource, /\+ Another/);
  assert.match(reviewSource, /\+ Add occurrence/);
  assert.match(reviewSource, /\+ Add submission/);
  assert.match(reviewSource, /getBatchIntakeReviewGroups/);
  assert.match(reviewSource, /Consumed quantity/);
  assert.match(reviewSource, /Choose a Focus completion time/);
  assert.match(reviewSource, /Food proposals/);
  assert.match(reviewSource, /const \[proposalSearch, setProposalSearch\]/);
  assert.match(reviewSource, /proposalSearch\[proposal\.id\] \?\? proposal\.proposedFoodName/);
  assert.match(reviewSource, /What I meant/);
  assert.match(reviewSource, /Correct food proposal/);
  assert.match(reviewSource, /proposedQuantity/);
  assert.match(reviewSource, /proposedUnit/);
  assert.match(reviewSource, /Use manual food/);
  assert.match(reviewSource, /onResolveMealProposal/);
  assert.match(reviewSource, /const executablePlan = buildBatchIntakeExecutionPlan/);
  assert.match(reviewSource, /const healthRows = executablePlan\.waterRows\.length/);
  assert.doesNotMatch(reviewSource, /blockedExecutableRow/);
  assert.match(reviewSource, /Only ready entries will be applied/);
  assert.match(reviewSource, /Nothing is ready to apply yet/);
  assert.match(reviewSource, /sticky bottom-0/);
  assert.doesNotMatch(reviewSource, /text-\[11px\]/);
  assert.match(reviewSource, /Parsed: \$\{details\} · line/);
  assert.match(reviewSource, /taskContentFolders=\{taskContentFolders\}/);
});

test("cumulative Applied results back every supported row lock", () => {
  assert.match(homeSource, /setBatchIntakeExecutionResult\(\(previous\) => mergeBatchIntakeExecutionResults\(previous, result\)\)/);
  assert.match(reviewSource, /const locked = result\?\.status === "applied"/);
  assert.match(reviewSource, /disabled=\{locked\}/);
  assert.match(reviewSource, /onRemove && !locked/);
  assert.match(reviewSource, /groupHasApplied/);
  assert.match(reviewSource, /onAddOccurrence/);
  assert.doesNotMatch(reviewSource, /onAddAnother/);
  assert.match(reviewSource, /Meal · \$\{mealSlotLabel\(occurrence\.mealSlot\)\}/);
  assert.match(reviewSource, /Meal slot<select[^>]+disabled=\{sharedDisabled\}/);
  assert.match(reviewSource, /Date<input[^>]+disabled=\{sharedDisabled\}/);
  assert.match(reviewSource, /Time<input[^>]+disabled=\{sharedDisabled\}/);
  assert.match(reviewSource, /Unit<select[^>]+disabled=\{rowDisabled\}/);
  assert.match(reviewSource, /unitSource: event\.target\.value \? "explicit" : "missing"/);
  assert.match(homeSource, /appliedFoodChild/);
});

test("resolved library Meals review consumed amount only while manual foods retain serving definitions", () => {
  assert.match(reviewSource, /food\.foodMode === "manual" \? <><label[\s\S]*Serving quantity[\s\S]*Serving unit/);
  assert.match(reviewSource, /Consumed quantity/);
  assert.match(reviewSource, /Consumed unit/);
  assert.doesNotMatch(reviewSource, /servingLabel|Saved serving/);
  assert.match(reviewSource, /const optionValues = food\.foodMode === "manual" && !options\.some/);
  assert.match(reviewSource, /Choose a consumed unit for this food/);
  assert.match(reviewSource, /updateConsumption\(food, food\.consumedQuantity, event\.target\.value, true\)/);
});

test("library Meal unit review requires explicit canonical-unit confirmation before nutrition is shown", () => {
  assert.match(reviewSource, /const unitNeedsReview = food\.foodMode === "library" && food\.issues\.includes\("Choose a consumed unit for this food"\)/);
  assert.match(reviewSource, /const consumedUnitSelectValue = unitNeedsReview \? "" : food\.consumedUnit/);
  assert.match(reviewSource, /value=\{consumedUnitSelectValue\}/);
  assert.match(reviewSource, /\{unitNeedsReview \? <option value="" disabled>Choose…<\/option> : null\}/);
  assert.match(reviewSource, /\{!unitNeedsReview && calculation \?/);
  assert.match(reviewSource, /const optionValues = food\.foodMode === "manual" && !options\.some/);
  assert.match(reviewSource, /getHealthFoodMeasurementOptions\(\{ servingUnit: food\.servingUnit, servingMeasureUnit: food\.servingMeasureUnit \}\)/);
});

test("Meal review keeps add and correct actions separate and preserves source evidence", () => {
  assert.match(reviewSource, /onChange=\{\(event\) => updateProposalSearch\(proposal, event\.target\.value\)\}/);
  assert.match(reviewSource, /onClick=\{\(\) => onResolveMealProposal\(proposal, food\)\}/);
  assert.match(reviewSource, /onClick=\{\(\) => onAddMealFood\(occurrence, food\)\}/);
  assert.match(reviewSource, /Source: \{proposal\.rawToken\}/);
  assert.match(reviewSource, /const proposalDisabled = disabled \|\| proposalResult\?\.status === "applied"/);
  assert.match(reviewSource, /disabled=\{sharedDisabled\} onChange=\{\(event\) => setFoodSearch/);
  assert.doesNotMatch(reviewSource, /Search custom foods…/);
});

test("Focus review routes title/category identity edits through shared helpers and group propagation", () => {
  assert.match(reviewSource, /updateBatchIntakeFocusTitle\(first, event\.target\.value\)/);
  assert.match(reviewSource, /updateBatchIntakeFocusCategory\(first, category\)/);
  assert.match(homeSource, /changeBatchIntakeFocusDraftGroup\(current, nextDraft, appliedDraftIds\)/);
});

test("Batch Intake resets cumulative results only when a review is replaced or closed", () => {
  const parseBlock = homeSource.slice(homeSource.indexOf("function parseScratchpadBatch"), homeSource.indexOf("function openManualBatch"));
  const manualBlock = homeSource.slice(homeSource.indexOf("function openManualBatch"), homeSource.indexOf("function addManualBatchRow"));
  const addRowBlock = homeSource.slice(homeSource.indexOf("function addManualBatchRow"), homeSource.indexOf("function removeBatchIntakeRow"));
  const closeBlock = homeSource.slice(homeSource.indexOf("function closeBatchIntakeReview"), homeSource.indexOf("async function applyBatchIntake"));
  assert.match(parseBlock, /setBatchIntakeExecutionResult\(null\)/);
  assert.match(manualBlock, /setBatchIntakeExecutionResult\(null\)/);
  assert.doesNotMatch(addRowBlock, /setBatchIntakeExecutionResult\(null\)/);
  assert.match(closeBlock, /setBatchIntakeExecutionResult\(null\)/);
});

test("Batch intake does not call meal persistence or direct Supabase writes", () => {
  assert.doesNotMatch(homeSource, /addMealEntry|\.from\(/);
  assert.doesNotMatch(readFileSync(new URL("../src/lib/home-batch-intake-executor.ts", import.meta.url), "utf8"), /\.from\(|addMealEntry/);
});

test("Focus batch authority owns validation, stable writes, and complete history publication", () => {
  const focusSource = readFileSync(new URL("../src/hooks/useFocus.ts", import.meta.url), "utf8");
  assert.match(focusSource, /async function handleManualFocusEntries\(/);
  assert.match(focusSource, /\.from\("adhdice_focus_sessions"\)\s*\n\s*\.upsert/);
  assert.match(focusSource, /focusHistoryRef\.current/);
  assert.match(focusSource, /queueDailySurplusPrompt/);
  assert.match(focusSource, /setFocusHistory\(nextHistory\)/);
});
