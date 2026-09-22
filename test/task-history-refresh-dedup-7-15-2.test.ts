import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createSingleFlightRefreshCoordinator } from "../src/lib/workspace-refresh-coordinator.ts";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

const workspaceSource = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");

test("A: each core refresh captures exactly one full History hydration Promise", () => {
  const coreLoader = workspaceSource.slice(
    workspaceSource.indexOf("async function loadCoreWorkspaceData"),
    workspaceSource.indexOf("const requestCoreWorkspaceRefresh"),
  );

  assert.equal((coreLoader.match(/loadTaskHistory\(\{/g) ?? []).length, 1);
  assert.match(coreLoader, /const canonicalHistoryHydration = loadTaskHistory\(\{ silent, source \}\);/);
  assert.match(coreLoader, /startBackgroundTaskHistoryHydration\(\s*\(\) => canonicalHistoryHydration/);
  assert.doesNotMatch(coreLoader, /source: "startup"/);
});

test("B: manual soft refresh waits for its captured History hydration", () => {
  const coreLoader = workspaceSource.slice(
    workspaceSource.indexOf("async function loadCoreWorkspaceData"),
    workspaceSource.indexOf("const requestCoreWorkspaceRefresh"),
  );
  const softRefresh = workspaceSource.slice(
    workspaceSource.indexOf("async function runSoftWorkspaceRefresh"),
    workspaceSource.indexOf("softWorkspaceRefreshRef.current =", workspaceSource.indexOf("async function runSoftWorkspaceRefresh")),
  );

  assert.match(coreLoader, /if \(source !== "initial"\) \{\s*await canonicalHistoryHydration;\s*\}/);
  assert.match(softRefresh, /await requestCoreWorkspaceRefresh\(\{ silent: true, source \}\)/);
  assert.match(softRefresh, /if \(includeSecondaryIfLoaded\)/);
  assert.match(softRefresh, /loadNotes\(\{ silent: true \}\)/);
  assert.doesNotMatch(softRefresh, /loadTaskHistory\(/);
});

test("C: resume refresh uses one core History hydration and waits for it", () => {
  assert.match(workspaceSource, /runSoftWorkspaceRefresh\(\{ includeSecondaryIfLoaded: true, source: "resume" \}\)/);
  const coreLoader = workspaceSource.slice(
    workspaceSource.indexOf("async function loadCoreWorkspaceData"),
    workspaceSource.indexOf("const requestCoreWorkspaceRefresh"),
  );
  const softRefresh = workspaceSource.slice(
    workspaceSource.indexOf("async function runSoftWorkspaceRefresh"),
    workspaceSource.indexOf("softWorkspaceRefreshRef.current =", workspaceSource.indexOf("async function runSoftWorkspaceRefresh")),
  );
  assert.equal((coreLoader.match(/loadTaskHistory\(\{/g) ?? []).length, 1);
  assert.match(coreLoader, /source !== "initial"/);
  assert.match(softRefresh, /await requestCoreWorkspaceRefresh\(\{ silent: true, source \}\)/);
  assert.doesNotMatch(softRefresh, /hasLoadedFullTaskHistoryRef\.current\) await loadTaskHistory/);
});

test("D: resume and mutation lifecycle state clears only after core refresh completion", () => {
  const softRefresh = workspaceSource.slice(
    workspaceSource.indexOf("async function runSoftWorkspaceRefresh"),
    workspaceSource.indexOf("softWorkspaceRefreshRef.current =", workspaceSource.indexOf("async function runSoftWorkspaceRefresh")),
  );
  const requestIndex = softRefresh.indexOf("await requestCoreWorkspaceRefresh({ silent: true, source })");
  assert.ok(requestIndex >= 0);
  assert.ok(softRefresh.indexOf("taskResumeSyncInFlightRef.current = false", requestIndex) > requestIndex);
  assert.ok(softRefresh.indexOf("setIsTaskResumeSyncPending(false)", requestIndex) > requestIndex);
  assert.match(workspaceSource, /prepareTaskMutationRef\.current = async \(\) => \{[\s\S]*runSoftWorkspaceRefresh\(\{ includeSecondaryIfLoaded: false, source: "mutation" \}\)/);
});

test("E: mutation preflight joins the same canonical core refresh barrier", () => {
  const coreLoader = workspaceSource.slice(
    workspaceSource.indexOf("async function loadCoreWorkspaceData"),
    workspaceSource.indexOf("const requestCoreWorkspaceRefresh"),
  );
  const mutationPreflight = workspaceSource.slice(
    workspaceSource.indexOf("prepareTaskMutationRef.current = async () =>"),
    workspaceSource.indexOf("initialCoreLoadActiveRef.current = true"),
  );
  assert.match(coreLoader, /const canonicalHistoryHydration = loadTaskHistory\(\{ silent, source \}\);/);
  assert.match(coreLoader, /await canonicalHistoryHydration/);
  assert.match(mutationPreflight, /await runSoftWorkspaceRefresh\(\{ includeSecondaryIfLoaded: false, source: "mutation" \}\)/);
  assert.doesNotMatch(mutationPreflight, /loadTaskHistory\(/);
});

test("F: waiting for History does not create a second full History read", () => {
  const coreLoader = workspaceSource.slice(
    workspaceSource.indexOf("async function loadCoreWorkspaceData"),
    workspaceSource.indexOf("const requestCoreWorkspaceRefresh"),
  );
  const softRefresh = workspaceSource.slice(
    workspaceSource.indexOf("async function runSoftWorkspaceRefresh"),
    workspaceSource.indexOf("softWorkspaceRefreshRef.current =", workspaceSource.indexOf("async function runSoftWorkspaceRefresh")),
  );
  assert.equal((coreLoader.match(/loadTaskHistory\(\{/g) ?? []).length, 1);
  assert.equal((coreLoader.match(/canonicalHistoryHydration/g) ?? []).length, 3);
  assert.doesNotMatch(softRefresh, /loadTaskHistory\(/);
});

test("G: initial startup retains background History sequencing and authoritative gating", () => {
  const coreLoader = workspaceSource.slice(
    workspaceSource.indexOf("async function loadCoreWorkspaceData"),
    workspaceSource.indexOf("const requestCoreWorkspaceRefresh"),
  );
  const criticalCommitIndex = coreLoader.indexOf("startTransition(() => {");
  const historyHydrationIndex = coreLoader.indexOf("const canonicalHistoryHydration = loadTaskHistory({ silent, source });");
  assert.ok(criticalCommitIndex >= 0 && historyHydrationIndex > criticalCommitIndex);
  assert.match(coreLoader, /if \(source !== "initial"\) \{\s*await canonicalHistoryHydration;/);
  assert.match(workspaceSource, /initialCoreLoadActiveRef\.current = true/);
  assert.match(workspaceSource, /workspaceStartupRequestRegistry\.request\(userId, \(\) => requestCoreWorkspaceRefresh\(\{ silent: false, source: "initial" \}\)\)/);
});

test("H: an equivalent in-flight caller reuses the current Promise", async () => {
  const firstRead = deferred<boolean>();
  let reads = 0;
  const coordinator = createSingleFlightRefreshCoordinator<boolean>();
  const current = coordinator.request(async () => {
    reads += 1;
    return await firstRead.promise;
  });
  const joined = coordinator.request(async () => {
    reads += 1;
    return true;
  });

  assert.strictEqual(joined, current);
  assert.equal(reads, 1);
  firstRead.resolve(true);
  await Promise.all([current, joined]);
  assert.equal(reads, 1);
});

test("I: multiple equivalent join callers still perform one network hydration", async () => {
  const firstRead = deferred<boolean>();
  let reads = 0;
  const coordinator = createSingleFlightRefreshCoordinator<boolean>();
  const current = coordinator.request(async () => {
    reads += 1;
    return await firstRead.promise;
  });
  const joined = Array.from({ length: 5 }, () => coordinator.request(async () => {
    reads += 1;
    return true;
  }));

  assert.equal(reads, 1);
  firstRead.resolve(true);
  await Promise.all([current, ...joined]);
  assert.equal(reads, 1);
});

test("J: refresh-after-current performs exactly one trailing full refresh", async () => {
  const firstRead = deferred<boolean>();
  const trailingRead = deferred<boolean>();
  const started: string[] = [];
  const coordinator = createSingleFlightRefreshCoordinator<boolean>();
  const current = coordinator.request(async () => {
    started.push("current");
    return await firstRead.promise;
  });
  const refreshAfterCurrent = coordinator.request(async () => {
    started.push("trailing");
    return await trailingRead.promise;
  }, { refreshAfterCurrent: true });

  assert.strictEqual(refreshAfterCurrent, current);
  firstRead.resolve(true);
  await flushMicrotasks();
  assert.deepEqual(started, ["current", "trailing"]);
  trailingRead.resolve(true);
  await current;
  assert.deepEqual(started, ["current", "trailing"]);
});

test("K: repeated refresh-after-current callers collapse to one trailing refresh", async () => {
  const firstRead = deferred<boolean>();
  const trailingRead = deferred<boolean>();
  let reads = 0;
  const coordinator = createSingleFlightRefreshCoordinator<boolean>();
  const current = coordinator.request(async () => {
    reads += 1;
    return await firstRead.promise;
  });
  coordinator.request(async () => {
    reads += 1;
    return await trailingRead.promise;
  }, { refreshAfterCurrent: true });
  coordinator.request(async () => {
    reads += 1;
    return true;
  }, { refreshAfterCurrent: true });
  coordinator.request(async () => {
    reads += 1;
    return true;
  }, { refreshAfterCurrent: true });

  firstRead.resolve(true);
  await flushMicrotasks();
  assert.equal(reads, 2);
  trailingRead.resolve(true);
  await current;
  assert.equal(reads, 2);
});

test("L: rollover explicitly requests a fresh snapshot after current", () => {
  const rollover = workspaceSource.slice(
    workspaceSource.indexOf("rolloverWorkspaceReconciliationRef.current = async () =>"),
    workspaceSource.indexOf("prepareTaskMutationRef.current", workspaceSource.indexOf("rolloverWorkspaceReconciliationRef.current = async () =>")),
  );

  assert.match(rollover, /loadTaskHistory\(\{ silent: true, source: "rollover", refreshAfterCurrent: true \}\)/);
});

test("M: 7.15.1 task-scoped cache-first and forced reads remain intact", async () => {
  const [updateActionSource, historyActionsSource, appSource] = await Promise.all([
    readFile(new URL("../src/hooks/useTaskUpdateAction.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/hooks/useTaskHistoryActions.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(workspaceSource, /if \(!force && taskHistoryLoadStateByTaskIdRef\.current\[taskId\]\?\.status === "ready"\)/);
  assert.match(updateActionSource, /loadTaskHistoryForTasks\(\[taskId\], \{ force: true, silent: true \}\)/);
  assert.match(historyActionsSource, /loadTaskHistoryForTasks\(\[taskId\], \{ force: true, silent: true \}\)/);
  assert.match(appSource, /loadTaskHistoryForTasks\(\[task\.id\], \{ force: true, silent: true \}\)/);
  assert.match(appSource, /loadTaskHistoryForTasks\(\[taskId\], \{ force: true, silent: true \}\)/);
});
