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

test("Home batch intake keeps Scratchpad source text separate and activates Health lazily", () => {
  assert.match(homeSource, /Parse Batch Intake/);
  assert.match(homeSource, /function openManualBatch\(\)/);
  assert.match(homeSource, /setBatchIntakeDrafts\(\[\]\)/);
  assert.match(homeSource, /Manual Batch/);
  assert.match(homeSource, /createManualBatchIntakeDraft/);
  assert.match(homeSource, /removeBatchIntakeRow/);
  assert.match(homeSource, /parseBatchIntake\(scratchpadDraft/);
  assert.match(homeSource, /setBatchIntakeDrafts\(applyBatchIntakeTaskMatches/);
  assert.match(homeSource, /setScratchpadDraft\(""\)/);
  assert.match(homeSource, /setBatchIntakeDrafts\(null\)/);
  assert.match(homeSource, /onProgress: setBatchIntakeApplyProgress/);
  assert.match(homeSource, /applyProgress=\{batchIntakeApplyProgress\}/);
  assert.match(reviewSource, /OperationProgressBar/);
  assert.match(reviewSource, /Applying Batch Intake/);
  assert.match(reviewSource, /applyProgress\.processed/);
  assert.match(appSource, /activePage === "Health" \|\| batchIntakeHealthActive/);
  assert.match(appSource, /onBatchIntakeHealthActivationChange=\{setBatchIntakeHealthActive\}/);
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
  assert.match(reviewSource, /Search custom foods…/);
  assert.match(reviewSource, /onAddMealFromParsed/);
  assert.doesNotMatch(reviewSource, /\+ Another/);
  assert.match(reviewSource, /\+ Add occurrence/);
  assert.match(reviewSource, /\+ Add submission/);
  assert.match(reviewSource, /getBatchIntakeReviewGroups/);
  assert.match(reviewSource, /Consumed quantity/);
  assert.match(reviewSource, /Choose a Focus completion time/);
});

test("cumulative Applied results back every supported row lock", () => {
  assert.match(homeSource, /setBatchIntakeExecutionResult\(\(previous\) => mergeBatchIntakeExecutionResults\(previous, result\)\)/);
  assert.match(reviewSource, /const locked = result\?\.status === "applied"/);
  assert.match(reviewSource, /disabled=\{locked\}/);
  assert.match(reviewSource, /onRemove && !locked/);
  assert.match(reviewSource, /groupHasApplied/);
  assert.match(reviewSource, /onAddOccurrence/);
  assert.doesNotMatch(reviewSource, /onAddAnother/);
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
