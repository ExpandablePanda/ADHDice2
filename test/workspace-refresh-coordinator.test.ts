import assert from "node:assert/strict";
import test from "node:test";

import {
  createWorkspaceRefreshCoordinator,
  createWorkspaceResumeRefreshCoordinator,
  WORKSPACE_STALE_RESUME_THRESHOLD_MS,
} from "../src/lib/workspace-refresh-coordinator.ts";

function flushResumeRefresh() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

test("workspace refresh coordinator joins duplicate callers and permits one meaningful trailing refresh", async () => {
  const started: string[] = [];
  let finishActiveLoad: (() => void) | null = null;
  const activeLoad = new Promise<void>((resolve) => {
    finishActiveLoad = resolve;
  });
  const coordinator = createWorkspaceRefreshCoordinator(async ({ source }: { source: string }) => {
    started.push(source);
    if (source === "manual") {
      await activeLoad;
    }
  });

  const first = coordinator.request({ source: "manual" });
  const duplicate = coordinator.request({ source: "manual" });
  const firstNewEvent = coordinator.request({ source: "realtime" });
  const duplicateNewEvent = coordinator.request({ source: "realtime" });

  assert.deepEqual(started, ["manual"]);
  finishActiveLoad?.();
  await Promise.all([first, duplicate, firstNewEvent, duplicateNewEvent]);
  assert.deepEqual(started, ["manual", "realtime"]);
  assert.equal(coordinator.isRunning(), false);
});

test("short hide/show skips a workspace refresh while focus-only remains ineligible", async () => {
  let now = 0;
  const refreshed: string[] = [];
  const skipped: string[] = [];
  const coordinator = createWorkspaceResumeRefreshCoordinator({
    isInitialLoadActive: () => false,
    isRecentCoreLoad: () => false,
    now: () => now,
    debounceMs: 0,
    onRefresh: (reason) => refreshed.push(reason),
    onSkip: (reason) => skipped.push(reason),
  });

  coordinator.documentHidden();
  now += WORKSPACE_STALE_RESUME_THRESHOLD_MS - 1;
  coordinator.documentVisible();
  coordinator.focus();
  await flushResumeRefresh();

  assert.deepEqual(refreshed, []);
  assert.deepEqual(skipped, ["short-hidden-duration", "focus-only"]);
});

test("five-minute hide/show and clustered qualifying signals request one refresh", async () => {
  let now = 0;
  const refreshed: string[] = [];
  const coordinator = createWorkspaceResumeRefreshCoordinator({
    isInitialLoadActive: () => false,
    isRecentCoreLoad: () => false,
    now: () => now,
    debounceMs: 0,
    onRefresh: (reason) => refreshed.push(reason),
  });

  coordinator.documentHidden();
  now += WORKSPACE_STALE_RESUME_THRESHOLD_MS;
  coordinator.documentVisible();
  coordinator.pageShow(true);
  coordinator.focus();
  await flushResumeRefresh();

  assert.equal(refreshed.length, 1);
});

test("a genuine offline-to-online transition refreshes once", async () => {
  const refreshed: string[] = [];
  const coordinator = createWorkspaceResumeRefreshCoordinator({
    isInitialLoadActive: () => false,
    isRecentCoreLoad: () => true,
    debounceMs: 0,
    onRefresh: (reason) => refreshed.push(reason),
  });

  coordinator.online();
  coordinator.offline();
  coordinator.online();
  coordinator.online();
  await flushResumeRefresh();

  assert.deepEqual(refreshed, ["online-reconnect"]);
});

test("initial boot skips queued resume work, while manual refresh remains independent", async () => {
  let initialLoadActive = true;
  const refreshed: string[] = [];
  const skipped: string[] = [];
  const coordinator = createWorkspaceResumeRefreshCoordinator({
    isInitialLoadActive: () => initialLoadActive,
    isRecentCoreLoad: () => false,
    debounceMs: 0,
    onRefresh: (reason) => refreshed.push(reason),
    onSkip: (reason) => skipped.push(reason),
  });

  coordinator.pageShow(true);
  await flushResumeRefresh();
  initialLoadActive = false;

  const manualRuns: string[] = [];
  const refreshCoordinator = createWorkspaceRefreshCoordinator(async ({ source }: { source: string }) => {
    manualRuns.push(source);
  });
  await refreshCoordinator.request({ source: "manual" });

  assert.deepEqual(skipped, ["initial-load-active"]);
  assert.deepEqual(refreshed, []);
  assert.deepEqual(manualRuns, ["manual"]);
});
