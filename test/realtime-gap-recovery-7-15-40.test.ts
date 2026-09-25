import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createRealtimeGapCoordinator,
  type RealtimeGapIncident,
} from "../src/lib/realtime-gap-recovery.ts";
import {
  createAdhdiceRealtimeDiagnosticBuffer,
  describeAdhdiceRealtimeSubscriptionError,
} from "../src/lib/adhdice-realtime-diagnostics.ts";

const workspaceSource = readFileSync(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
const supabaseSource = readFileSync(new URL("../src/lib/supabase.ts", import.meta.url), "utf8");
const hudSource = readFileSync(new URL("../src/hooks/useTaskUiState.ts", import.meta.url), "utf8");

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
}

function subscribeAll(coordinator: ReturnType<typeof createRealtimeGapCoordinator>) {
  coordinator.reportStatus("workspace", "SUBSCRIBED");
  coordinator.reportStatus("task", "SUBSCRIBED");
  coordinator.reportStatus("projection", "SUBSCRIBED");
}

test("initial healthy subscriptions do not open or recover a gap", async () => {
  let recoveryCount = 0;
  const coordinator = createRealtimeGapCoordinator({ recover: () => { recoveryCount += 1; } });

  coordinator.reportStatus("task", "CHANNEL_ERROR");
  coordinator.reportStatus("task", "SUBSCRIBED");
  subscribeAll(coordinator);
  await flushMicrotasks();

  assert.equal(recoveryCount, 0);
  assert.equal(coordinator.getActiveIncident(), null);
});

test("one Task interruption recovers once after the Task channel resubscribes", async () => {
  const incidents: RealtimeGapIncident[] = [];
  const recoveries: RealtimeGapIncident[] = [];
  const coordinator = createRealtimeGapCoordinator({
    onGapOpened: (incident) => incidents.push(incident),
    recover: (incident) => { recoveries.push(incident); },
  });

  coordinator.reportStatus("task", "SUBSCRIBED");
  coordinator.reportStatus("task", "CHANNEL_ERROR", { error: new Error("socket") });
  coordinator.reportStatus("task", "CHANNEL_ERROR", { error: new Error("same outage") });
  coordinator.reportStatus("task", "SUBSCRIBED");
  coordinator.reportStatus("task", "SUBSCRIBED");
  await flushMicrotasks();

  assert.equal(incidents.length, 1);
  assert.equal(incidents[0]?.generation, 1);
  assert.deepEqual(incidents[0]?.affectedChannels, ["task"]);
  assert.equal(recoveries.length, 1);
  assert.equal(recoveries[0]?.statusesByChannel.task?.sort().join(","), "CHANNEL_ERROR");
  assert.equal(coordinator.getActiveIncident(), null);
});

test("simultaneous core failures form one incident and one coordinated recovery", async () => {
  const recoveries: RealtimeGapIncident[] = [];
  const coordinator = createRealtimeGapCoordinator({
    recover: (incident) => { recoveries.push(incident); },
  });

  subscribeAll(coordinator);
  coordinator.reportStatus("workspace", "CHANNEL_ERROR");
  coordinator.reportStatus("task", "CHANNEL_ERROR");
  coordinator.reportStatus("projection", "CHANNEL_ERROR");
  coordinator.reportStatus("task", "SUBSCRIBED");
  await flushMicrotasks();
  assert.equal(recoveries.length, 0, "recovery waits for every affected core channel");
  coordinator.reportStatus("workspace", "SUBSCRIBED");
  coordinator.reportStatus("projection", "SUBSCRIBED");
  await flushMicrotasks();

  assert.equal(recoveries.length, 1);
  assert.deepEqual(recoveries[0]?.affectedChannels, ["workspace", "task", "projection"]);
});

test("TIMED_OUT and unexpected active CLOSED are recoverable, expected cleanup CLOSED is not", async () => {
  let recoveryCount = 0;
  const coordinator = createRealtimeGapCoordinator({ recover: () => { recoveryCount += 1; } });

  coordinator.reportStatus("projection", "SUBSCRIBED");
  coordinator.reportStatus("projection", "TIMED_OUT");
  coordinator.reportStatus("projection", "SUBSCRIBED");
  await flushMicrotasks();
  assert.equal(recoveryCount, 1);

  coordinator.reportStatus("projection", "CLOSED", { expectedCleanup: true });
  coordinator.reportStatus("projection", "SUBSCRIBED");
  await flushMicrotasks();
  assert.equal(recoveryCount, 1);

  coordinator.reportStatus("projection", "CLOSED");
  coordinator.reportStatus("projection", "SUBSCRIBED");
  await flushMicrotasks();
  assert.equal(recoveryCount, 2);
});

test("duplicate healthy statuses do not recover, and recovery is single-flight", async () => {
  const activeRecovery = deferred<void>();
  let recoveryCount = 0;
  let joinedCount = 0;
  const coordinator = createRealtimeGapCoordinator({
    onRecoveryJoined: () => { joinedCount += 1; },
    recover: async () => {
      recoveryCount += 1;
      await activeRecovery.promise;
    },
  });

  coordinator.reportStatus("workspace", "SUBSCRIBED");
  coordinator.reportStatus("workspace", "SUBSCRIBED");
  await flushMicrotasks();
  assert.equal(recoveryCount, 0);

  coordinator.reportStatus("workspace", "CHANNEL_ERROR");
  coordinator.reportStatus("workspace", "SUBSCRIBED");
  await flushMicrotasks();
  coordinator.reportStatus("workspace", "SUBSCRIBED");
  activeRecovery.resolve();
  await flushMicrotasks();

  assert.equal(recoveryCount, 1);
  assert.ok(joinedCount >= 1);
});

test("production wiring preserves normal Task/Projection paths and adds one gap catch-up", () => {
  assert.match(workspaceSource, /createRealtimeGapCoordinator/);
  assert.match(workspaceSource, /realtimeGapCoordinator\?\.reportStatus\("workspace", status/);
  assert.match(workspaceSource, /realtimeGapCoordinator\?\.reportStatus\("task", status/);
  assert.match(workspaceSource, /realtimeGapCoordinator\?\.reportStatus\("projection", status/);
  assert.match(workspaceSource, /source: "realtime_gap_recovery"/);
  assert.match(workspaceSource, /loadCanonicalTaskSnapshot\([\s\S]*createTaskRowsRequest\(\)[\s\S]*loadTaskScheduleBoundaries/);
  assert.match(workspaceSource, /from\("adhdice_task_current_projections"\)[\s\S]*select\(CURRENT_TASK_PROJECTION_READ_COLUMNS\)[\s\S]*eq\("user_id", userId\)/);
  assert.match(workspaceSource, /requestTaskEntityReconciliationAfterGap/);
  assert.match(workspaceSource, /requestTaskEntityReconciliationAfterGap\(taskId, payload\.eventType\)/);
  assert.match(workspaceSource, /requestTaskEntityReconciliation\(taskId, eventType\)/);
  assert.doesNotMatch(
    workspaceSource.slice(
      workspaceSource.indexOf('table: "adhdice_clean_tasks"'),
      workspaceSource.indexOf('        .subscribe((status', workspaceSource.indexOf('table: "adhdice_clean_tasks"')),
    ),
    /source: "realtime_gap_recovery"/,
  );
  assert.match(workspaceSource, /requestTaskListDomainRefresh\("realtime_gap_recovery"\)/);
  assert.match(workspaceSource, /requestTaskContentFolderDomainRefresh\("realtime_gap_recovery"\)/);
  assert.match(workspaceSource, /requestFocusDomainRefresh\("realtime_gap_recovery"\)/);
  assert.doesNotMatch(workspaceSource.slice(workspaceSource.indexOf("runRealtimeGapRecovery"), workspaceSource.indexOf("function recordRealtimeGapDiagnostic")), /requestCoreWorkspaceRefresh/);
});

test("gap recovery keeps Notes and History lazy and refreshes only loaded consumers", () => {
  const recovery = workspaceSource.slice(
    workspaceSource.indexOf("async function runRealtimeGapRecovery"),
    workspaceSource.indexOf("function recordRealtimeGapDiagnostic"),
  );
  assert.match(recovery, /if \(hasLoadedNotesRef\.current\)/);
  assert.match(recovery, /loadNotes\(\{ force: true, silent: true \}\)/);
  assert.match(recovery, /if \(hasLoadedFullTaskHistoryRef\.current\)/);
  assert.match(recovery, /loadTaskHistory\([\s\S]*source: "realtime"/);
  assert.match(recovery, /loadTaskHistoryForTask\(taskId, \{ force: true, silent: true, source: "realtime" \}\)/);
  assert.match(recovery, /loadTaskHistoryDetailWindow\(taskId, \{[\s\S]*source: "gap_recovery"/);
  assert.match(recovery, /taskHistoryDetailByTaskIdRef/);
  assert.doesNotMatch(recovery, /loadTaskHistoryForTask\(taskId, \{ force: true, silent: true \}\)/);
  assert.doesNotMatch(recovery, /loadTaskHistory\(\{[\s\S]*source: "initial"/);
  assert.doesNotMatch(recovery, /requestCoreWorkspaceRefresh/);
});

test("subscription errors capture Task and Projection error arguments and heartbeat diagnostics are enabled", () => {
  assert.match(workspaceSource, /\.subscribe\(\(status, error\) =>/);
  assert.match(workspaceSource, /kind: "task_channel_subscription_error"/);
  assert.match(workspaceSource, /kind: "projection_channel_subscription_error"/);
  assert.match(workspaceSource, /describeAdhdiceRealtimeSubscriptionError\(error\)/);
  assert.match(supabaseSource, /heartbeatCallback: \(status, latency\) =>/);
  assert.match(supabaseSource, /kind: "realtime_heartbeat_status"/);
  assert.doesNotMatch(supabaseSource, /worker:\s*true/);
  assert.doesNotMatch(workspaceSource, /setInterval/);
});

test("heartbeat and subscription diagnostics keep useful sanitized fields", () => {
  const buffer = createAdhdiceRealtimeDiagnosticBuffer(4);
  buffer.record({
    kind: "realtime_heartbeat_status",
    latency: 42,
    status: "timeout",
    subscriptionError: describeAdhdiceRealtimeSubscriptionError({
      access_token: "secret-token",
      code: "TIMED_OUT",
      message: "heartbeat timeout",
      name: "RealtimeError",
    }),
  });

  const [record] = buffer.snapshot();
  assert.deepEqual(record?.subscriptionError, {
    code: "TIMED_OUT",
    message: "heartbeat timeout",
    name: "RealtimeError",
  });
  assert.equal(record?.access_token, undefined);
  assert.equal(record?.latency, 42);
});

test("HUD resubscribe performs its existing authoritative settings read without coupling to core recovery", () => {
  assert.match(hudSource, /hud_channel_subscription_error/);
  assert.match(hudSource, /kind: "realtime_gap_channel_resubscribed"/);
  assert.match(hudSource, /requestHudGapRecovery\(channelDebugId\)/);
  assert.match(hudSource, /const recovery = syncTaskUiSettingsToCloud\(\)/);
  assert.doesNotMatch(hudSource, /requestCoreWorkspaceRefresh/);
});

test("generation fences remain in the authoritative recovery readers", () => {
  const recovery = workspaceSource.slice(
    workspaceSource.indexOf("async function runRealtimeGapRecovery"),
    workspaceSource.indexOf("function recordRealtimeGapDiagnostic"),
  );
  assert.match(workspaceSource, /function canApplyCoreWorkspaceResult\(\) \{[\s\S]*workspaceGenerationRef\.current === workspaceGeneration/);
  assert.match(recovery, /reconcileCurrentTaskProjectionSnapshot/);
  assert.match(workspaceSource, /if \(!canApplyCoreWorkspaceResult\(\)\) return false;/);
});
