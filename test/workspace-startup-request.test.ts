import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createWorkspaceStartupRequestRegistry,
  updateWorkspaceStartupRequestOwner,
} from "../src/lib/workspace-startup-request.ts";

const workspaceSource = readFileSync(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");

test("the workspace owner effect preserves same-user replay and invalidates only owner boundaries", async () => {
  const registry = createWorkspaceStartupRequestRegistry();
  let ownerUserId: string | null = null;
  let resolveFirst: ((value: string) => void) | null = null;
  const firstNetwork = new Promise<string>((resolve) => { resolveFirst = resolve; });

  ownerUserId = updateWorkspaceStartupRequestOwner(registry, ownerUserId, "user-a");
  const first = registry.request(ownerUserId, () => firstNetwork);
  ownerUserId = updateWorkspaceStartupRequestOwner(registry, ownerUserId, "user-a");
  const replay = registry.request(ownerUserId, async () => "unexpected-replay");

  assert.equal(replay.joined, true);
  assert.equal(replay.promise, first.promise);

  ownerUserId = updateWorkspaceStartupRequestOwner(registry, ownerUserId, "user-b");
  const retryForOldOwner = registry.request("user-a", async () => "old-owner-retry");
  assert.equal(retryForOldOwner.joined, false);
  assert.equal(await retryForOldOwner.promise, "old-owner-retry");

  const secondOwnerRequest = registry.request(ownerUserId, async () => "user-b-startup");
  assert.equal(await secondOwnerRequest.promise, "user-b-startup");

  ownerUserId = updateWorkspaceStartupRequestOwner(registry, ownerUserId, null);
  const retryAfterSignOut = registry.request("user-b", async () => "post-sign-out-retry");
  assert.equal(ownerUserId, null);
  assert.equal(retryAfterSignOut.joined, false);
  assert.equal(await retryAfterSignOut.promise, "post-sign-out-retry");

  resolveFirst?.("workspace-a");
  assert.equal(await first.promise, "workspace-a");
});

test("useWorkspaceData uses the owner lifecycle contract instead of unconditional startup invalidation", () => {
  assert.match(workspaceSource, /updateWorkspaceStartupRequestOwner/);
  assert.match(workspaceSource, /startupRequestUserIdRef\.current = updateWorkspaceStartupRequestOwner\(/);
  assert.doesNotMatch(workspaceSource, /if \(startupRequestUserIdRef\.current\) \{\s*workspaceStartupRequestRegistry\.invalidate/);
});

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
