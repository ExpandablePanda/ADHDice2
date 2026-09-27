import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CURRENT_PROJECTION_LOGICAL_DAY_REFRESH_MAX_BATCHES,
  isCurrentProjectionLogicalDayRefreshComplete,
  runCurrentProjectionLogicalDayRefresh,
  type ProjectionBackfillOperatorClient,
  type ProjectionBackfillOperatorResult,
} from "../src/lib/task-current-projection-backfill-operator.ts";

const workspaceSource = readFileSync(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const achievementsSource = readFileSync(new URL("../src/hooks/useAchievementProgress.ts", import.meta.url), "utf8");

const TODAY = "2026-09-26";

type BatchResponse = {
  candidateCount: number;
  writtenCount: number;
  failedCount: number;
  remainingCount: number;
};

function createClient(plan: BatchResponse[]) {
  let calls = 0;
  const client = {
    functions: {
      invoke: async () => ({
        data: plan[calls++] ?? { candidateCount: 0, writtenCount: 0, failedCount: 0, remainingCount: 0 },
        error: null,
      }),
    },
  } as unknown as ProjectionBackfillOperatorClient;
  return { client, getCalls: () => calls };
}

function fullBatch(remainingCount: number): BatchResponse {
  return { candidateCount: 10, writtenCount: 10, failedCount: 0, remainingCount };
}

function result(overrides: Partial<ProjectionBackfillOperatorResult> = {}): ProjectionBackfillOperatorResult {
  return {
    startingCandidateCount: 0,
    requestCount: 0,
    batchCount: 0,
    processedCount: 0,
    writtenCount: 0,
    failedCount: 0,
    remainingCount: 0,
    stoppedReason: "candidate_count_zero",
    shouldContinueBecameFalse: false,
    errorMessage: null,
    ...overrides,
  };
}

test("424 stale candidates continue through more than ten batches", async () => {
  const plan = Array.from({ length: 42 }, (_, index) => fullBatch((41 - index) * 10 + 4));
  plan.push({ candidateCount: 4, writtenCount: 4, failedCount: 0, remainingCount: 0 });
  const fake = createClient(plan);

  const refresh = await runCurrentProjectionLogicalDayRefresh({
    client: fake.client,
    maxBatches: CURRENT_PROJECTION_LOGICAL_DAY_REFRESH_MAX_BATCHES,
  });

  assert.equal(fake.getCalls(), 43);
  assert.equal(refresh.startingCandidateCount, 424);
  assert.equal(refresh.processedCount, 424);
  assert.equal(refresh.writtenCount, 424);
  assert.equal(refresh.remainingCount, 0);
  assert.equal(refresh.stoppedReason, "partial_batch");
  assert.equal(isCurrentProjectionLogicalDayRefreshComplete(refresh), true);
});

test("43 sequential ten-row batches reach the zero-candidate response", async () => {
  const plan = Array.from({ length: 43 }, (_, index) => fullBatch((42 - index) * 10));
  plan.push({ candidateCount: 0, writtenCount: 0, failedCount: 0, remainingCount: 0 });
  const fake = createClient(plan);

  const refresh = await runCurrentProjectionLogicalDayRefresh({
    client: fake.client,
    maxBatches: CURRENT_PROJECTION_LOGICAL_DAY_REFRESH_MAX_BATCHES,
  });

  assert.equal(fake.getCalls(), 44);
  assert.equal(refresh.processedCount, 430);
  assert.equal(refresh.batchCount, 44);
  assert.equal(refresh.stoppedReason, "candidate_count_zero");
  assert.equal(isCurrentProjectionLogicalDayRefreshComplete(refresh), true);
});

test("ordinary startup state changes do not cancel the owner/day refresh", async () => {
  let startupStateRevision = 0;
  const plan = Array.from({ length: 43 }, (_, index) => fullBatch((42 - index) * 10));
  plan.push({ candidateCount: 0, writtenCount: 0, failedCount: 0, remainingCount: 0 });
  const fake = createClient(plan);

  const refresh = await runCurrentProjectionLogicalDayRefresh({
    client: fake.client,
    maxBatches: CURRENT_PROJECTION_LOGICAL_DAY_REFRESH_MAX_BATCHES,
    shouldContinue: () => startupStateRevision >= 0,
    onProgress: () => { startupStateRevision += 1; },
  });

  assert.equal(startupStateRevision, 44);
  assert.equal(fake.getCalls(), 44);
  assert.equal(refresh.shouldContinueBecameFalse, false);
  assert.equal(refresh.stoppedReason, "candidate_count_zero");
});

async function runFenceCancellation(kind: "owner" | "logical-day" | "unmount" | "generation") {
  let ownerId = "owner-1";
  let logicalDay = TODAY;
  let workspaceGeneration = 7;
  let isActive = true;
  const fake = createClient([fullBatch(20), fullBatch(10), fullBatch(0)]);

  const refresh = await runCurrentProjectionLogicalDayRefresh({
    client: fake.client,
    maxBatches: CURRENT_PROJECTION_LOGICAL_DAY_REFRESH_MAX_BATCHES,
    shouldContinue: () => isActive
      && ownerId === "owner-1"
      && logicalDay === TODAY
      && workspaceGeneration === 7,
    onProgress: () => {
      if (kind === "owner") ownerId = "owner-2";
      if (kind === "logical-day") logicalDay = "2026-09-27";
      if (kind === "unmount") isActive = false;
      if (kind === "generation") workspaceGeneration = 8;
    },
  });

  return { fake, refresh };
}

test("owner change still cancels an in-progress refresh", async () => {
  const { fake, refresh } = await runFenceCancellation("owner");
  assert.equal(fake.getCalls(), 1);
  assert.equal(refresh.stoppedReason, "unmounted");
  assert.equal(refresh.shouldContinueBecameFalse, true);
});

test("logical-day change still cancels an in-progress refresh", async () => {
  const { fake, refresh } = await runFenceCancellation("logical-day");
  assert.equal(fake.getCalls(), 1);
  assert.equal(refresh.shouldContinueBecameFalse, true);
});

test("genuine unmount still cancels an in-progress refresh", async () => {
  const { fake, refresh } = await runFenceCancellation("unmount");
  assert.equal(fake.getCalls(), 1);
  assert.equal(refresh.shouldContinueBecameFalse, true);
});

test("real workspace-generation invalidation still cancels an in-progress refresh", async () => {
  const { fake, refresh } = await runFenceCancellation("generation");
  assert.equal(fake.getCalls(), 1);
  assert.equal(refresh.shouldContinueBecameFalse, true);
});

test("remaining candidates do not mark the owner/day refresh complete", async () => {
  const fake = createClient(Array.from({ length: 50 }, () => fullBatch(100)));
  const refresh = await runCurrentProjectionLogicalDayRefresh({
    client: fake.client,
    maxBatches: CURRENT_PROJECTION_LOGICAL_DAY_REFRESH_MAX_BATCHES,
  });

  assert.equal(refresh.stoppedReason, "max_batches");
  assert.equal(refresh.remainingCount, 100);
  assert.equal(isCurrentProjectionLogicalDayRefreshComplete(refresh), false);
});

test("candidate-count zero marks the owner/day refresh complete", () => {
  assert.equal(isCurrentProjectionLogicalDayRefreshComplete(result()), true);
  assert.equal(isCurrentProjectionLogicalDayRefreshComplete(result({ remainingCount: 3 })), false);
  assert.equal(isCurrentProjectionLogicalDayRefreshComplete(result({ failedCount: 1, stoppedReason: "failed_count" })), false);
});

test("the owner effect restarts only for the actual client/owner boundary", () => {
  assert.match(workspaceSource, /\}, \[currentUser\?\.id, supabase\]\);/);
  assert.doesNotMatch(workspaceSource, /\}, \[currentUser\?\.id, behaviorSelectionStateRef, supabase, suppressCategoryReload\]\);/);
  assert.match(workspaceSource, /behaviorSelectionStateRef\.current/);
  assert.match(workspaceSource, /suppressCategoryReload\.current/);
});

test("terminal diagnostics include the refresh result and every cancellation fence", () => {
  assert.match(workspaceSource, /\[workspace:current-projection-refresh\] terminal owner=/);
  for (const field of [
    "startingCandidateCount",
    "requestCount",
    "batchCount",
    "processedCount",
    "writtenCount",
    "failedCount",
    "remainingCount",
    "stoppedReason",
    "shouldContinueBecameFalse",
    "startingWorkspaceGeneration",
    "currentWorkspaceGeneration",
    "isActive",
    "logicalDayChanged",
  ]) {
    assert.match(workspaceSource, new RegExp(field));
  }
  assert.doesNotMatch(workspaceSource, /current-projection-refresh[^\n]*entityId/);
});

test("7.15.46 bounded History fallback remains and global summary surfaces avoid broad History hydration", () => {
  const loader = workspaceSource.slice(workspaceSource.indexOf("async function loadTaskHistoryForTasks"), workspaceSource.indexOf("async function loadTaskHistoryStreakSummaries"));
  assert.match(loader, /fetchTaskHistoryForTaskIdsInBatches/);
  assert.match(loader, /\.in\("entity_id", batchTaskIds\)/);
  assert.match(loader, /TASK_HISTORY_ROLLOVER_BATCH_SIZE/);
  assert.match(taskAppSource, /taskActivitySummary\?\.tracked\.current_streak/);
  assert.match(taskAppSource, /todayCompletedCount=\{taskActivitySummary\?\.unfiltered_today_completed_count/);
  assert.doesNotMatch(taskAppSource, /activePageRef\.current === "Stats"[\s\S]*loadFullTaskHistory/);
  assert.doesNotMatch(taskAppSource, /activePageRef\.current === "Games"[\s\S]*loadFullTaskHistory/);
  assert.doesNotMatch(achievementsSource, /loadFullTaskHistory|adhdice_task_history_facts/);
});
