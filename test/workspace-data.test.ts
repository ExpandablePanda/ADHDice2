import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { fetchAllPagedRows } from "../src/hooks/useWorkspaceData.ts";

test("fetchAllPagedRows accumulates full pages until the first short page", async () => {
  const pageSize = 1000;
  const ranges: Array<[number, number]> = [];
  const pages = [
    Array.from({ length: pageSize }, (_, index) => `row-${index}`),
    Array.from({ length: pageSize }, (_, index) => `row-${pageSize + index}`),
    ["row-2000", "row-2001"],
  ];

  const result = await fetchAllPagedRows<string>(async (from, to) => {
    ranges.push([from, to]);
    return { data: pages[ranges.length - 1] ?? [], error: null };
  }, pageSize);

  assert.equal(result.error, null);
  assert.equal(result.data?.length, 2002);
  assert.deepEqual(ranges, [[0, 999], [1000, 1999], [2000, 2999]]);
  assert.equal(result.data?.at(0), "row-0");
  assert.equal(result.data?.at(-1), "row-2001");
});

test("fetchAllPagedRows stops on fetch errors without returning partial rows", async () => {
  const result = await fetchAllPagedRows<string>(async (from) => {
    if (from === 0) {
      return { data: Array.from({ length: 1000 }, (_, index) => `row-${index}`), error: null };
    }

    return { data: null, error: { message: "Supabase said no" } };
  });

  assert.equal(result.data, null);
  assert.equal(result.error?.message, "Supabase said no");
});

test("workspace ownership effect does not depend on active page navigation", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");

  assert.match(source, /activePageRef\.current = activePage/);
  assert.match(source, /\}, \[currentUser\?\.id, supabase, suppressCategoryReload\]\);/);
  assert.doesNotMatch(source, /\}, \[activePage, currentUser\?\.id/);
});

test("initial boot guards lifecycle refreshes and only persisted pageshow is eligible", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");

  assert.match(source, /initialCoreLoadActiveRef\.current = true/);
  assert.match(source, /workspaceStartupRequestRegistry\.request\(userId, \(\) => requestCoreWorkspaceRefresh\(\{ silent: false, source: "initial" \}\)\)/);
  assert.match(source, /resumeRefreshCoordinator\.pageShow\(event\.persisted\)/);
  assert.match(source, /resumeRefreshCoordinator\.focus\(\)/);
});

test("normal startup loads critical Task History facts without starting a full History scan", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const coreLoader = source.slice(source.indexOf("async function loadCoreWorkspaceData"), source.indexOf("const requestCoreWorkspaceRefresh"));

  assert.match(coreLoader, /loadCriticalTaskHistoryFacts\(nextTasks\)/);
  assert.doesNotMatch(coreLoader, /loadTaskHistory\(\{ silent: true, source: "secondary" \}\)/);
  assert.doesNotMatch(coreLoader, /loadActualTime\(|loadNotes\(/);
  assert.match(source, /loadFullTaskHistoryRef\.current = \(\) => loadTaskHistory/);
});

test("empty critical hydration returns before complete Task derivation stages", async () => {
  const source = await readFile(new URL("../src/lib/task-app-derived.ts", import.meta.url), "utf8");
  const emptyGuard = source.slice(source.indexOf("if (tasks.length === 0)"), source.indexOf("const totalStartedAt"));
  assert.match(emptyGuard, /return \{/);
  assert.doesNotMatch(emptyGuard, /logTaskDeriveStep|logDevelopmentComputation/);
});

test("rollover reconciliation reloads only task rows and does not request a broad core refresh", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const reconciliation = source.slice(
    source.indexOf("rolloverWorkspaceReconciliationRef.current = async () =>"),
    source.indexOf("prepareTaskMutationRef.current", source.indexOf("rolloverWorkspaceReconciliationRef.current = async () =>")),
  );

  assert.match(reconciliation, /reloadTaskRows\(\{ silent: true, source: "rollover" \}\)/);
  assert.doesNotMatch(reconciliation, /requestCoreWorkspaceRefresh|loadCoreWorkspaceData|softRefreshWorkspace/);
});

test("rollover reconciliation never promotes critical startup facts into a full History load", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const reconciliation = source.slice(
    source.indexOf("rolloverWorkspaceReconciliationRef.current = async () =>"),
    source.indexOf("prepareTaskMutationRef.current", source.indexOf("rolloverWorkspaceReconciliationRef.current = async () =>")),
  );

  assert.match(reconciliation, /if \(!hasLoadedFullTaskHistoryRef\.current\)/);
  assert.match(reconciliation, /only critical facts are cached/);
  assert.match(reconciliation, /Rollover history reconciliation requested after already-loaded history/);
  assert.match(reconciliation, /await loadTaskHistory\(\{ silent: true, source: "rollover" \}\)/);
});

test("canonical paginated history reload joins an active scan instead of duplicating it", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
  const historyLoader = source.slice(source.indexOf("async function loadTaskHistory"), source.indexOf("async function loadCriticalTaskHistoryFacts"));

  assert.match(historyLoader, /if \(taskHistoryLoadInFlightRef\.current\)[\s\S]*queuedTaskHistoryReloadRef\.current = true/);
  assert.match(historyLoader, /Rollover history reconciliation joined an in-flight history load/);
  assert.match(historyLoader, /fetchAllPagedRows<DbTaskHistory>/);
});

test("manual refresh remains the broad core workspace refresh path", async () => {
  const source = await readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");

  assert.match(source, /softWorkspaceRefreshRef\.current = \(\) => runSoftWorkspaceRefresh\(\{[\s\S]*source: "manual"/);
  assert.match(source, /await requestCoreWorkspaceRefresh\(\{ silent: true, source \}\)/);
});
