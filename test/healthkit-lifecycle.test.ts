import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  createHealthKitLifecycleCoordinator,
  HEALTHKIT_AUTO_SYNC_COOLDOWN_MS,
} from "../src/lib/healthkit-lifecycle-coordinator.ts";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

test("native launch eligibility starts one automatic incremental sync", async () => {
  const triggers: string[] = [];
  const coordinator = createHealthKitLifecycleCoordinator({
    isEligible: () => true,
    onSync: async (trigger) => { triggers.push(trigger); },
  });

  assert.equal(await coordinator.requestAutomaticSync(), true);
  assert.deepEqual(triggers, ["automatic"]);
});

test("repeated foreground events while a sync is pending stay single-flight", async () => {
  const pending = deferred<void>();
  let calls = 0;
  const coordinator = createHealthKitLifecycleCoordinator({
    isEligible: () => true,
    onSync: async () => {
      calls += 1;
      await pending.promise;
    },
  });

  const first = coordinator.requestAutomaticSync();
  await Promise.resolve();
  assert.equal(await coordinator.requestAutomaticSync(), false);
  assert.equal(calls, 1);
  pending.resolve();
  assert.equal(await first, true);
});

test("automatic lifecycle attempts observe the 60 second cooldown", async () => {
  let now = 10_000;
  let calls = 0;
  const coordinator = createHealthKitLifecycleCoordinator({
    isEligible: () => true,
    now: () => now,
    onSync: async () => { calls += 1; },
  });

  assert.equal(await coordinator.requestAutomaticSync(), true);
  now += HEALTHKIT_AUTO_SYNC_COOLDOWN_MS - 1;
  assert.equal(await coordinator.requestAutomaticSync(), false);
  now += 1;
  assert.equal(await coordinator.requestAutomaticSync(), true);
  assert.equal(calls, 2);
});

test("manual sync bypasses automatic cooldown", async () => {
  let calls = 0;
  const coordinator = createHealthKitLifecycleCoordinator({
    isEligible: () => true,
    onSync: async (trigger) => { calls += trigger === "manual" ? 10 : 1; },
  });

  assert.equal(await coordinator.requestAutomaticSync(), true);
  await coordinator.runManualSync();
  assert.equal(calls, 11);
});

for (const [label, isEligible] of [
  ["web/non-native", false],
  ["unavailable HealthKit", false],
  ["missing authenticated Health scope", false],
] as const) {
  test(`${label} does not auto-sync`, async () => {
    let calls = 0;
    const coordinator = createHealthKitLifecycleCoordinator({
      isEligible: () => isEligible,
      onSync: async () => { calls += 1; },
    });
    assert.equal(await coordinator.requestAutomaticSync(), false);
    assert.equal(calls, 0);
  });
}

test("a failed automatic sync releases single-flight for a later retry", async () => {
  let calls = 0;
  let shouldFail = true;
  let now = 1_000;
  const coordinator = createHealthKitLifecycleCoordinator({
    isEligible: () => true,
    now: () => now,
    onSync: async () => {
      calls += 1;
      if (shouldFail) throw new Error("sync failed");
    },
  });

  assert.equal(await coordinator.requestAutomaticSync(), false);
  assert.equal(calls, 1);
  shouldFail = false;
  now += HEALTHKIT_AUTO_SYNC_COOLDOWN_MS;
  assert.equal(await coordinator.requestAutomaticSync(), true);
  assert.equal(calls, 2);
});

test("production wiring uses Capacitor active-state events and the existing incremental path", () => {
  const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
  const healthSource = readFileSync(new URL("../src/hooks/useHealth.ts", import.meta.url), "utf8");

  assert.match(taskAppSource, /App\.addListener\("appStateChange"/);
  assert.match(taskAppSource, /if \(isActive\) \{\s*void healthKitLifecycleCoordinator\.requestAutomaticSync\(\);/s);
  assert.match(taskAppSource, /runManualSync/);
  assert.match(taskAppSource, /onSync: \(trigger\) => syncIncrementalAppleHealthData\(trigger === "automatic" \? \{ silent: true \} : undefined\)/);
  assert.match(taskAppSource, /healthProfile\.user_id === healthSyncUserId/);
  assert.match(taskAppSource, /healthStorageMode === "remote"/);
  assert.match(healthSource, /async function syncIncrementalAppleHealthData\(options\?: HealthKitIncrementalSyncOptions\)/);
});
