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
});

test("Home batch intake keeps Scratchpad source text separate and activates Health lazily", () => {
  assert.match(homeSource, /Parse Batch Intake/);
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
});

test("Batch intake does not call meal persistence or direct Supabase writes", () => {
  assert.doesNotMatch(homeSource, /addMealEntry|\.from\(/);
  assert.doesNotMatch(readFileSync(new URL("../src/lib/home-batch-intake-executor.ts", import.meta.url), "utf8"), /\.from\(|addMealEntry/);
});
