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
  response?: { candidateCount: number; writtenCount: number; failedCount: number };
  error?: { message: string };
};

function createClient(input: {
  plans: BatchPlan[];
  remainingCounts: number[];
  events?: string[];
  getMaximumInFlight?: (value: number) => void;
}) {
  let planIndex = 0;
  let countIndex = 0;
  let active = 0;
  let maximumInFlight = 0;
  const events = input.events ?? [];
  const updateMaximumInFlight = (value: number) => {
    maximumInFlight = Math.max(maximumInFlight, value);
    input.getMaximumInFlight?.(maximumInFlight);
  };

  const query = (count: number) => {
    const current = {} as ReturnType<ProjectionBackfillOperatorClient["from"]>;
    Object.assign(current, {
      select: () => current,
      eq: () => current,
      is: () => current,
      in: () => current,
      then: (onfulfilled: (value: { count: number; error: null }) => unknown, onrejected?: (reason: unknown) => unknown) => {
        active += 1;
        updateMaximumInFlight(active);
        events.push("count:start");
        return Promise.resolve({ count, error: null }).then(
          (value) => {
            active -= 1;
            events.push("count:end");
            return onfulfilled(value);
          },
          (reason) => {
            active -= 1;
            events.push("count:end");
            return onrejected?.(reason);
          },
        );
      },
    });
    return current;
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
        const plan = input.plans[index] ?? { error: { message: "Unexpected extra request." } };
        return { data: plan.response ?? null, error: plan.error ?? null };
      },
    },
    from: () => {
      const count = input.remainingCounts[countIndex];
      countIndex += 1;
      return query(count ?? 0);
    },
  } as unknown as ProjectionBackfillOperatorClient;

  return { client, events, getPlanCount: () => planIndex, getMaximumInFlight: () => maximumInFlight };
}

function fullBatch() {
  return { response: { candidateCount: CURRENT_PROJECTION_BACKFILL_BATCH_SIZE, writtenCount: CURRENT_PROJECTION_BACKFILL_BATCH_SIZE, failedCount: 0 } };
}

test("50 operator makes exactly five sequential ten-candidate calls", async () => {
  const progress: number[] = [];
  const fake = createClient({ plans: [fullBatch(), fullBatch(), fullBatch(), fullBatch(), fullBatch()], remainingCounts: [40, 30, 20, 10, 0] });
  const result = await runCurrentProjectionBackfillOperator({
    client: fake.client,
    maxBatches: 5,
    userId: "owner-1",
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
  assert.deepEqual(fake.events.filter((event) => event.startsWith("invoke") || event === "count:start"), [
    "invoke:0:start", "invoke:0:end", "count:start", "invoke:1:start", "invoke:1:end", "count:start", "invoke:2:start", "invoke:2:end", "count:start", "invoke:3:start", "invoke:3:end", "count:start", "invoke:4:start", "invoke:4:end", "count:start",
  ]);
});

test("third request failure stops requests four and five", async () => {
  const fake = createClient({
    plans: [fullBatch(), fullBatch(), { error: { message: "transport" } }, fullBatch(), fullBatch()],
    remainingCounts: [40, 30],
  });
  const result = await runCurrentProjectionBackfillOperator({ client: fake.client, maxBatches: 5, userId: "owner-1" });

  assert.equal(fake.getPlanCount(), 3);
  assert.equal(result.writtenCount, 20);
  assert.equal(result.failedCount, 0);
  assert.equal(result.stoppedReason, "request_failed");
  assert.equal(result.errorMessage, "transport");
});

test("failedCount greater than zero stops continuation after the failed batch", async () => {
  const fake = createClient({
    plans: [fullBatch(), fullBatch(), { response: { candidateCount: 10, writtenCount: 9, failedCount: 1 } }, fullBatch(), fullBatch()],
    remainingCounts: [40, 30, 21],
  });
  const result = await runCurrentProjectionBackfillOperator({ client: fake.client, maxBatches: 5, userId: "owner-1" });

  assert.equal(fake.getPlanCount(), 3);
  assert.equal(result.writtenCount, 29);
  assert.equal(result.failedCount, 1);
  assert.equal(result.remainingCount, 21);
  assert.equal(result.stoppedReason, "failed_count");
});

test("candidateCount zero stops early", async () => {
  const fake = createClient({
    plans: [fullBatch(), { response: { candidateCount: 0, writtenCount: 0, failedCount: 0 } }, fullBatch()],
    remainingCounts: [40, 0],
  });
  const result = await runCurrentProjectionBackfillOperator({ client: fake.client, maxBatches: 5, userId: "owner-1" });

  assert.equal(fake.getPlanCount(), 2);
  assert.equal(result.remainingCount, 0);
  assert.equal(result.stoppedReason, "candidate_count_zero");
});

test("27 remaining candidates produce 10 plus 10 plus 7 and stop", async () => {
  const fake = createClient({
    plans: [fullBatch(), fullBatch(), { response: { candidateCount: 7, writtenCount: 7, failedCount: 0 } }, fullBatch()],
    remainingCounts: [17, 7, 0],
  });
  const progress: number[] = [];
  const result = await runCurrentProjectionBackfillOperator({
    client: fake.client,
    maxBatches: 5,
    userId: "owner-1",
    onProgress: (value) => progress.push(value.processedCount),
  });

  assert.equal(fake.getPlanCount(), 3);
  assert.deepEqual(progress, [10, 20, 27]);
  assert.equal(result.writtenCount, 27);
  assert.equal(result.remainingCount, 0);
  assert.equal(result.stoppedReason, "partial_batch");
});

test("unmount stops the loop before launching another request", async () => {
  let mounted = true;
  const fake = createClient({ plans: [fullBatch(), fullBatch()], remainingCounts: [17] });
  const result = await runCurrentProjectionBackfillOperator({
    client: fake.client,
    maxBatches: 5,
    userId: "owner-1",
    shouldContinue: () => mounted,
    onProgress: () => { mounted = false; },
  });

  assert.equal(fake.getPlanCount(), 1);
  assert.equal(result.stoppedReason, "unmounted");
});

test("operator count query is narrow, owner scoped, missing-only, and avoids cursor continuation", () => {
  assert.match(operatorSource, /from\("adhdice_clean_tasks"\)/);
  assert.match(operatorSource, /select\("id, adhdice_task_current_projections!left\(entity_id\)", \{ count: "exact", head: true \}\)/);
  assert.match(operatorSource, /eq\("user_id", userId\)/);
  assert.match(operatorSource, /is\("adhdice_task_current_projections\.entity_id", null\)/);
  assert.match(operatorSource, /body: \{ limit: CURRENT_PROJECTION_BACKFILL_BATCH_SIZE \}/);
  assert.doesNotMatch(operatorSource, /afterTaskId|nextCursor/);
  assert.doesNotMatch(operatorSource, /adhdice_execute_task_state_command|adhdice_task_history_facts|adhdice_task_command_operations/);
});

test("both controls are development-only, share the busy guard, and preserve the single ten-row action", () => {
  assert.match(settingsSource, /process\.env\.NODE_ENV !== "production"/);
  assert.match(settingsSource, /Backfill 10 Projections/);
  assert.match(settingsSource, /Backfill 50 Projections/);
  assert.equal((settingsSource.match(/disabled=\{isBackfillingProjections\}/g) ?? []).length, 2);
  assert.match(settingsSource, /isBackfillRunActiveRef\.current/);
  assert.match(settingsSource, /handleProjectionBackfill\(1\)/);
  assert.match(settingsSource, /handleProjectionBackfill\(5\)/);
  assert.match(settingsSource, /shouldContinue: \(\) => isMountedRef\.current && isBackfillRunActiveRef\.current/);
  assert.match(settingsSource, /Backfilling projections · \$\{progress\.processedCount\} \/ \$\{progress\.totalCount\}/);
  assert.match(taskAppSource, /client=\{supabase\}/);
});

test("operator stays outside canonical mutation, History startup/read, and consumer cutover paths", () => {
  assert.doesNotMatch(operatorSource, /\.rpc\(|adhdice_execute_task_state_command|adhdice_task_history|taskHistory|useWorkspaceData|projection consumer/i);
  assert.doesNotMatch(settingsSource, /taskHistory|resolveTaskHistory|useWorkspaceData|adhdice_execute_task_state_command/);
});
