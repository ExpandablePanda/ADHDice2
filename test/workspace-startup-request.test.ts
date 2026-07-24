import assert from "node:assert/strict";
import test from "node:test";

import { createWorkspaceStartupRequestRegistry } from "../src/lib/workspace-startup-request.ts";

test("Strict replay joins one initial network request and the live owner applies its result", async () => {
  const registry = createWorkspaceStartupRequestRegistry();
  let requests = 0;
  let resolveRequest: ((value: string) => void) | null = null;
  const network = new Promise<string>((resolve) => { resolveRequest = resolve; });
  const first = registry.request("user-a", async () => { requests += 1; return network; });
  const second = registry.request("user-a", async () => { requests += 1; return "unexpected"; });
  const liveOwner = "second";
  let appliedBy: string | null = null;
  void first.promise.then(() => { if (liveOwner === "first") appliedBy = "first"; });
  void second.promise.then(() => { if (liveOwner === "second") appliedBy = "second"; });

  await Promise.resolve();
  resolveRequest?.("workspace");
  await Promise.all([first.promise, second.promise]);
  await Promise.resolve();
  assert.equal(requests, 1);
  assert.equal(second.joined, true);
  assert.equal(appliedBy, "second");
});

test("an obsolete owner cannot apply after a user change", async () => {
  const registry = createWorkspaceStartupRequestRegistry();
  let resolveRequest: ((value: string) => void) | null = null;
  const first = registry.request("user-a", () => new Promise<string>((resolve) => { resolveRequest = resolve; }));
  const liveUser = "user-b";
  let applied = false;
  void first.promise.then(() => { if (liveUser === "user-a") applied = true; });
  await Promise.resolve();
  resolveRequest?.("workspace-a");
  await first.promise;
  await Promise.resolve();
  assert.equal(applied, false);
});

test("a failed initial request is evicted and can retry", async () => {
  const registry = createWorkspaceStartupRequestRegistry();
  await assert.rejects(registry.request("user-a", async () => { throw new Error("offline"); }).promise, /offline/);
  await Promise.resolve();
  const retry = registry.request("user-a", async () => "recovered");
  assert.equal(retry.joined, false);
  assert.equal(await retry.promise, "recovered");
});

test("different users never share startup request state", async () => {
  const registry = createWorkspaceStartupRequestRegistry();
  const first = registry.request("user-a", async () => "a");
  const second = registry.request("user-b", async () => "b");
  assert.equal(second.joined, false);
  assert.deepEqual(await Promise.all([first.promise, second.promise]), ["a", "b"]);
});
