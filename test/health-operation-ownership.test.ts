import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  captureHealthOperation,
  isCurrentHealthOperation,
  type HealthOperationOwner,
} from "../src/lib/health-operation-ownership.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function owner(userId: string | null, generation = 1, active = true): HealthOperationOwner {
  return { active, generation, userId };
}

async function commitWhenCurrent<T>(
  currentOwner: HealthOperationOwner,
  token: ReturnType<typeof captureHealthOperation>,
  pending: Promise<T>,
  commit: (value: T) => void,
) {
  const value = await pending;
  if (isCurrentHealthOperation(currentOwner, token)) {
    commit(value);
  }
}

test("stale hydration cannot replace the next owner's snapshot or loading state", async () => {
  const currentOwner = owner("user-a");
  const token = captureHealthOperation(currentOwner);
  const pending = deferred<string>();
  const state = { loading: true, message: "B is active", snapshot: "user-b" };

  const commit = commitWhenCurrent(currentOwner, token, pending.promise, (snapshot) => {
    state.snapshot = snapshot;
    state.loading = false;
    state.message = "A loaded";
  });
  currentOwner.userId = "user-b";
  currentOwner.generation += 1;
  pending.resolve("user-a");
  await commit;

  assert.deepEqual(state, { loading: true, message: "B is active", snapshot: "user-b" });
});

test("stale Journal saves cannot write the active owner's cache or message", async () => {
  const currentOwner = owner("user-a");
  const token = captureHealthOperation(currentOwner);
  const pending = deferred<string>();
  const localStorageByUser = new Map([["user-b", "B snapshot"]]);
  const state = { message: "B is active" };

  const commit = commitWhenCurrent(currentOwner, token, pending.promise, (snapshot) => {
    localStorageByUser.set(currentOwner.userId!, snapshot);
    state.message = "A saved";
  });
  currentOwner.userId = "user-b";
  currentOwner.generation += 1;
  pending.resolve("A journal entry");
  await commit;

  assert.equal(localStorageByUser.get("user-b"), "B snapshot");
  assert.equal(state.message, "B is active");
});

test("stale award claims cannot change the active owner's economy or awards", async () => {
  const currentOwner = owner("user-a");
  const token = captureHealthOperation(currentOwner);
  const pending = deferred<{ economy: number; award: string }>();
  const state = { economy: 20, awards: ["B award"] };

  const commit = commitWhenCurrent(currentOwner, token, pending.promise, (result) => {
    state.economy = result.economy;
    state.awards.push(result.award);
  });
  currentOwner.userId = "user-b";
  currentOwner.generation += 1;
  pending.resolve({ award: "A award", economy: 999 });
  await commit;

  assert.deepEqual(state, { economy: 20, awards: ["B award"] });
});

test("sign-out and inactive Health invalidate pending operations", async () => {
  for (const nextOwner of [
    owner(null, 2, false),
    owner("user-a", 2, false),
  ]) {
    const currentOwner = owner("user-a");
    const token = captureHealthOperation(currentOwner);
    const pending = deferred<void>();
    let commits = 0;
    const commit = commitWhenCurrent(currentOwner, token, pending.promise, () => {
      commits += 1;
    });
    Object.assign(currentOwner, nextOwner);
    pending.resolve();
    await commit;
    assert.equal(commits, 0);
  }
});

test("a newer hydration generation supersedes an older operation for the same owner", async () => {
  const currentOwner = owner("user-a");
  const oldToken = captureHealthOperation(currentOwner);
  const pending = deferred<string>();
  let snapshot = "new hydration";
  const commit = commitWhenCurrent(currentOwner, oldToken, pending.promise, (value) => {
    snapshot = value;
  });

  currentOwner.generation += 1;
  pending.resolve("old hydration");
  await commit;

  assert.equal(snapshot, "new hydration");
});

test("the current same-owner operation still commits normally", async () => {
  const currentOwner = owner("user-a");
  const token = captureHealthOperation(currentOwner);
  const pending = deferred<string>();
  let snapshot = "before";
  const commit = commitWhenCurrent(currentOwner, token, pending.promise, (value) => {
    snapshot = value;
  });
  pending.resolve("saved");
  await commit;

  assert.equal(snapshot, "saved");
});

test("useHealth wires the shared token through hydration, awards, and economy commits", () => {
  const healthSource = readFileSync(new URL("../src/hooks/useHealth.ts", import.meta.url), "utf8");
  const economySource = readFileSync(new URL("../src/hooks/useEconomy.ts", import.meta.url), "utf8");

  assert.match(healthSource, /healthOperationGenerationRef/);
  assert.match(healthSource, /captureHealthOperation/);
  assert.match(healthSource, /claimEligibleAwards\(snapshotToApply, hydrationOperation/);
  assert.match(healthSource, /claimEligibleAwards\(nextSnapshot, operation/);
  assert.match(economySource, /isCurrent\(\)/);
});
