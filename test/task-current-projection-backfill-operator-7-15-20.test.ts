import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CURRENT_PROJECTION_BACKFILL_BATCH_SIZE,
  runCurrentProjectionBackfillOperator,
  type ProjectionBackfillOperatorClient,
} from "../src/lib/task-current-projection-backfill-operator.ts";

const operatorSource = readFileSync(new URL("../src/lib/task-current-projection-backfill-operator.ts", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("../src/components/task-app/settings-page.tsx", import.meta.url), "utf8");
const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");

type BatchPlan = {
  response?: { candidateCount: number; writtenCount: number; failedCount: number; remainingCount: number };
  error?: { message: string };
};

function createClient(input: {
  plans: BatchPlan[];
  events?: string[];
  afterInvoke?: (index: number) => void;
  getMaximumInFlight?: (value: number) => void;
}) {
  let planIndex = 0;
  let active = 0;
  let maximumInFlight = 0;
  const events = input.events ?? [];
  const updateMaximumInFlight = (value: number) => {
    maximumInFlight = Math.max(maximumInFlight, value);
    input.getMaximumInFlight?.(maximumInFlight);
  };

  const client = {
    functions: {
      invoke: async () => {
        const index = planIndex;
        planIndex += 1;
        active += 1;
        updateMaximumInFlight(active);
        events.push(`invoke:${index}:start`);
        await Promise.resolve();
        active -= 1;
        events.push(`invoke:${index}:end`);
        input.afterInvoke?.(index);
        const plan = input.plans[index] ?? { error: { message: "Unexpected extra request." } };
        return { data: plan.response ?? null, error: plan.error ?? null };
      },
    },
  } as unknown as ProjectionBackfillOperatorClient;

  return { client, events, getPlanCount: () => planIndex, getMaximumInFlight: () => maximumInFlight };
}

function fullBatch(remainingCount: number) {
  return { response: { candidateCount: CURRENT_PROJECTION_BACKFILL_BATCH_SIZE, writtenCount: CURRENT_PROJECTION_BACKFILL_BATCH_SIZE, failedCount: 0, remainingCount } };
}

test("50 operator makes exactly five sequential ten-candidate calls", async () => {
  const progress: number[] = [];
  const fake = createClient({ plans: [fullBatch(40), fullBatch(30), fullBatch(20), fullBatch(10), fullBatch(0)] });
  const result = await runCurrentProjectionBackfillOperator({
    client: fake.client,
    maxBatches: 5,
    onProgress: (value) => progress.push(value.processedCount),
  });

  assert.equal(fake.getPlanCount(), 5);
  assert.equal(fake.getMaximumInFlight(), 1);
  assert.deepEqual(progress, [10, 20, 30, 40, 50]);
  assert.equal(result.requestCount, 5);
  assert.equal(result.writtenCount, 50);
  assert.equal(result.failedCount, 0);
  assert.equal(result.remainingCount, 0);
  assert.equal(result.stoppedReason, "completed");
  assert.deepEqual(fake.events, [
    "invoke:0:start", "invoke:0:end", "invoke:1:start", "invoke:1:end", "invoke:2:start", "invoke:2:end",
    "invoke:3:start", "invoke:3:end", "invoke:4:start", "invoke:4:end",
  ]);
});

test("operator displays and returns the Edge-provided remaining count", async () => {
  const fake = createClient({ plans: [fullBatch(430)] });
  const result = await runCurrentProjectionBackfillOperator({ client: fake.client, maxBatches: 1 });

  assert.equal(result.writtenCount, 10);
  assert.equal(result.remainingCount, 430);
});

test("third request failure stops requests four and five", async () => {
  const fake = createClient({
    plans: [fullBatch(40), fullBatch(30), { error: { message: "transport" } }, fullBatch(10), fullBatch(0)],
  });
  const result = await runCurrentProjectionBackfillOperator({ client: fake.client, maxBatches: 5 });

  assert.equal(fake.getPlanCount(), 3);
  assert.equal(result.writtenCount, 20);
  assert.equal(result.failedCount, 0);
  assert.equal(result.stoppedReason, "request_failed");
  assert.equal(result.errorMessage, "transport");
});

test("failedCount greater than zero stops continuation after the failed batch", async () => {
  const fake = createClient({
    plans: [fullBatch(40), fullBatch(30), { response: { candidateCount: 10, writtenCount: 9, failedCount: 1, remainingCount: 21 } }, fullBatch(10), fullBatch(0)],
  });
  const result = await runCurrentProjectionBackfillOperator({ client: fake.client, maxBatches: 5 });

  assert.equal(fake.getPlanCount(), 3);
  assert.equal(result.writtenCount, 29);
  assert.equal(result.failedCount, 1);
  assert.equal(result.remainingCount, 21);
  assert.equal(result.stoppedReason, "failed_count");
});

test("candidateCount zero stops early", async () => {
  const fake = createClient({
    plans: [fullBatch(40), { response: { candidateCount: 0, writtenCount: 0, failedCount: 0, remainingCount: 0 } }, fullBatch(0)],
  });
  const result = await runCurrentProjectionBackfillOperator({ client: fake.client, maxBatches: 5 });

  assert.equal(fake.getPlanCount(), 2);
  assert.equal(result.remainingCount, 0);
  assert.equal(result.stoppedReason, "candidate_count_zero");
});

test("27 remaining candidates produce 10 plus 10 plus 7 and stop", async () => {
  const fake = createClient({
    plans: [fullBatch(17), fullBatch(7), { response: { candidateCount: 7, writtenCount: 7, failedCount: 0, remainingCount: 0 } }, fullBatch(0)],
  });
  const progress: number[] = [];
  const result = await runCurrentProjectionBackfillOperator({
    client: fake.client,
    maxBatches: 5,
    onProgress: (value) => progress.push(value.processedCount),
  });

  assert.equal(fake.getPlanCount(), 3);
  assert.deepEqual(progress, [10, 20, 27]);
  assert.equal(result.writtenCount, 27);
  assert.equal(result.remainingCount, 0);
  assert.equal(result.stoppedReason, "partial_batch");
});

test("operator stops between batches when rollover becomes active", async () => {
  let rolloverActive = false;
  const fake = createClient({ plans: [fullBatch(40), fullBatch(30)], afterInvoke: () => { rolloverActive = true; } });
  const result = await runCurrentProjectionBackfillOperator({
    client: fake.client,
    maxBatches: 5,
    isRolloverActive: () => rolloverActive,
  });

  assert.equal(fake.getPlanCount(), 1);
  assert.equal(result.writtenCount, 10);
  assert.equal(result.remainingCount, 40);
  assert.equal(result.stoppedReason, "rollover_active");
});

test("unmount stops the loop before launching another request", async () => {
  let mounted = true;
  const fake = createClient({ plans: [fullBatch(17), fullBatch(7)] });
  const result = await runCurrentProjectionBackfillOperator({
    client: fake.client,
    maxBatches: 5,
    shouldContinue: () => mounted,
    onProgress: () => { mounted = false; },
  });

  assert.equal(fake.getPlanCount(), 1);
  assert.equal(result.stoppedReason, "unmounted");
});

test("operator uses Edge remainingCount, not a browser count query", () => {
  assert.match(operatorSource, /remainingCount/);
  assert.match(operatorSource, /body: \{ limit: CURRENT_PROJECTION_REBUILD_BATCH_SIZE, afterTaskId \}/);
  assert.doesNotMatch(operatorSource, /from\(|adhdice_clean_tasks|count: "exact"|select\(/);
  assert.match(operatorSource, /afterTaskId|nextCursor/);
  assert.doesNotMatch(operatorSource, /adhdice_execute_task_state_command|adhdice_task_history_facts|adhdice_task_command_operations/);
});

test("both controls are development-only, share the rollover busy guard, and preserve ten-row behavior", () => {
  assert.match(settingsSource, /process\.env\.NODE_ENV !== "production"/);
  assert.match(settingsSource, /Rebuild V2 Projections · 10/);
  assert.match(settingsSource, /Rebuild V2 Projections · 50/);
  assert.equal((settingsSource.match(/disabled=\{isBackfillingProjections \|\| isRolloverActive\}/g) ?? []).length, 2);
  assert.match(settingsSource, /isRolloverActive/);
  assert.match(settingsSource, /Wait for Task rollover to finish before rebuilding V2 projections\./);
  assert.match(settingsSource, /handleProjectionBackfill\(1\)/);
  assert.match(settingsSource, /handleProjectionBackfill\(5\)/);
  assert.match(settingsSource, /shouldContinue: \(\) => isMountedRef\.current && isBackfillRunActiveRef\.current/);
  assert.match(settingsSource, /Rebuilding V2 projections · \$\{progress\.processedCount\} \/ \$\{progress\.totalCount\}/);
  assert.match(taskAppSource, /client=\{supabase\}/);
});

test("operator stays outside canonical mutation, History startup/read, and consumer cutover paths", () => {
  assert.doesNotMatch(operatorSource, /\.rpc\(|adhdice_execute_task_state_command|adhdice_task_history|taskHistory|useWorkspaceData|projection consumer/i);
  assert.doesNotMatch(settingsSource, /taskHistory|resolveTaskHistory|useWorkspaceData|adhdice_execute_task_state_command/);
});
