import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { moveTaskHierarchy } from "../src/lib/task-hierarchy-mutation.ts";

const appSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const tableSource = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");
const listSource = readFileSync(new URL("../src/components/task-app/tasks-list-adapter.tsx", import.meta.url), "utf8");
const taskPageSource = readFileSync(new URL("../src/components/task-app/task-page.tsx", import.meta.url), "utf8");
const hierarchySource = readFileSync(new URL("../src/lib/task-hierarchy-mutation.ts", import.meta.url), "utf8");

type RpcReply = { data: unknown[] | null; error: { code?: string; message: string } | null };

function createRpcClient(replies: Array<RpcReply | Promise<RpcReply>>) {
  let calls = 0;
  const client = {
    rpc: async () => {
      const reply = replies[Math.min(calls, replies.length - 1)];
      calls += 1;
      return await reply;
    },
  };
  return { calls: () => calls, client };
}

function intent(taskId = "task-1", expectedRevision = 4) {
  return {
    expectedCanonicalRevision: 9,
    expectedRevision,
    newParentTaskId: "parent-1",
    newTaskContentFolderId: null,
    taskId,
  };
}

test("100 identical concurrent hierarchy intents share one RPC", async () => {
  let resolveRpc: ((reply: RpcReply) => void) | null = null;
  const pendingReply = new Promise<RpcReply>((resolve) => {
    resolveRpc = resolve;
  });
  const { calls, client } = createRpcClient([pendingReply]);
  const attempts = Array.from({ length: 100 }, () => moveTaskHierarchy(client, intent()));

  assert.equal(calls(), 1);
  resolveRpc?.({ data: [], error: null });
  await Promise.all(attempts);
  assert.equal(calls(), 1);
});

test("a duplicate invocation while pending does not issue a second RPC", async () => {
  let resolveRpc: ((reply: RpcReply) => void) | null = null;
  const pendingReply = new Promise<RpcReply>((resolve) => {
    resolveRpc = resolve;
  });
  const { calls, client } = createRpcClient([pendingReply]);
  const first = moveTaskHierarchy(client, intent("task-pending"));
  const second = moveTaskHierarchy(client, intent("task-pending"));

  assert.equal(calls(), 1);
  resolveRpc?.({ data: [], error: null });
  await Promise.all([first, second]);
});

test("a stale response blocks the exact intent until a fresh revision is supplied", async () => {
  const stale = { code: "40001", message: "Task hierarchy is stale; refresh before moving it." };
  const { calls, client } = createRpcClient([{ data: [], error: stale }]);
  const first = await moveTaskHierarchy(client, intent("task-stale"));
  const blocked = await moveTaskHierarchy(client, intent("task-stale"));

  assert.equal(calls(), 1);
  assert.equal(first.error?.code, "40001");
  assert.equal(blocked.error?.code, "40001");
  assert.equal(blocked.staleIntentBlocked, true);
});

test("a fresh authoritative revision permits an explicit later retry", async () => {
  const stale = { code: "40001", message: "Task hierarchy is stale; refresh before moving it." };
  const { calls, client } = createRpcClient([
    { data: [], error: stale },
    { data: [], error: null },
  ]);

  await moveTaskHierarchy(client, intent("task-fresh", 4));
  const retry = await moveTaskHierarchy(client, intent("task-fresh", 5));

  assert.equal(calls(), 2);
  assert.equal(retry.error, null);
});

test("success clears the in-flight guard", async () => {
  const { calls, client } = createRpcClient([
    { data: [], error: null },
    { data: [], error: null },
  ]);

  await moveTaskHierarchy(client, intent("task-success"));
  await moveTaskHierarchy(client, intent("task-success"));

  assert.equal(calls(), 2);
});

test("a non-stale network failure does not create an automatic retry loop", async () => {
  const { calls, client } = createRpcClient([
    Promise.reject(new Error("Failed to fetch")),
    { data: [], error: null },
  ]);

  await assert.rejects(moveTaskHierarchy(client, intent("task-network")), /Failed to fetch/);
  assert.equal(calls(), 1);
  await moveTaskHierarchy(client, intent("task-network"));
  assert.equal(calls(), 2);
});

test("different Tasks remain independently mutable", async () => {
  let resolveA: ((reply: RpcReply) => void) | null = null;
  const pendingA = new Promise<RpcReply>((resolve) => { resolveA = resolve; });
  const { calls, client } = createRpcClient([pendingA, { data: [], error: null }]);
  const first = moveTaskHierarchy(client, intent("task-a"));
  const second = moveTaskHierarchy(client, intent("task-b"));

  assert.equal(calls(), 2);
  resolveA?.({ data: [], error: null });
  await Promise.all([first, second]);
});

test("a different later intent for one Task proceeds after the prior intent settles", async () => {
  const { calls, client } = createRpcClient([
    { data: [], error: null },
    { data: [], error: null },
  ]);

  await moveTaskHierarchy(client, intent("task-later"));
  await moveTaskHierarchy(client, { ...intent("task-later"), newParentTaskId: "parent-2" });

  assert.equal(calls(), 2);
});

test("Table and List expose one shared event-driven mutation path", () => {
  assert.match(taskPageSource, /view === "table"\s*\n\s*\? tableViewPanel\s*\n\s*: view === "list"\s*\n\s*\? listViewPanel/);
  assert.doesNotMatch(tableSource, /adhdice_move_task_hierarchy|moveTaskHierarchy\(|persistTaskHierarchyRow\(/);
  assert.doesNotMatch(listSource, /adhdice_move_task_hierarchy|moveTaskHierarchy\(|persistTaskHierarchyRow\(/);
});

test("hierarchy mutation has no render/effect, pointermove, timer, or automatic retry trigger", () => {
  const persistBlock = appSource.slice(
    appSource.indexOf("const persistTaskHierarchyRow"),
    appSource.indexOf("const compatibilityRoutingMemberships"),
  );
  assert.doesNotMatch(persistBlock, /useEffect|setInterval|setTimeout|pointermove|retry/i);
  assert.doesNotMatch(hierarchySource, /setInterval|setTimeout|retry/i);
  assert.match(appSource, /isTaskHierarchyStaleConflict\(result\.error\)/);
  assert.match(appSource, /reconcileStaleHierarchyIntent\(hierarchyIntent\)/);
});

test("stale reconciliation coalesces one refresh per identical intent and skips blocked repeats", () => {
  const reconciliationBlock = appSource.slice(
    appSource.indexOf("const staleHierarchyReconciliationRef"),
    appSource.indexOf("const persistTaskHierarchyRow"),
  );
  assert.match(reconciliationBlock, /new Map<string, Promise<void>>\(\)/);
  assert.match(reconciliationBlock, /const existingRefresh = staleHierarchyReconciliationRef\.current\.get\(intentKey\)/);
  assert.match(reconciliationBlock, /const refresh = softRefreshWorkspace\(\)\.finally/);
  assert.match(appSource, /if \(!result\.staleIntentBlocked\)/);
});

test("hidden/tab lifecycle code does not restart hierarchy mutations", () => {
  const lifecycleBlock = appSource.slice(
    appSource.indexOf("function runDayReset"),
    appSource.indexOf("const taskListFolderActions"),
  );
  assert.doesNotMatch(lifecycleBlock, /moveTaskHierarchy|persistTaskHierarchyRow|adhdice_move_task_hierarchy/);
});
