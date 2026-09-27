import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { Task } from "../src/lib/database.types.ts";
import {
  classifyCurrentTaskProjectionTimestampContract,
  classifyCurrentTaskProjectionTimestampMismatch,
  compareCurrentTaskProjectionParity,
  resolveCurrentTaskProjectionReads,
  type CurrentTaskProjectionReadRow,
} from "../src/lib/task-current-projection-read.ts";
import {
  createAdhdiceRealtimeDiagnosticBuffer,
  installAdhdiceRealtimeDiagnostics,
} from "../src/lib/adhdice-realtime-diagnostics.ts";
import {
  CURRENT_TASK_PROJECTION_ALGORITHM_VERSION,
  CURRENT_TASK_PROJECTION_SCHEMA_VERSION,
} from "../src/lib/task-current-projection.ts";

const USER_ID = "00000000-0000-0000-0000-000000000001";
const HISTORY_EPOCH = "00000000-0000-0000-0000-000000000099";
const workspaceSource = readFileSync(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const diagnosticsSource = readFileSync(new URL("../src/lib/adhdice-realtime-diagnostics.ts", import.meta.url), "utf8");

function task(overrides: Partial<Task> = {}) {
  return {
    id: "task-1",
    user_id: USER_ID,
    status: "pending",
    due_on: "2026-09-18",
    canonical_revision: 12,
    entity_kind: "parent",
    ...overrides,
  } as Task;
}

function projection(overrides: Partial<CurrentTaskProjectionReadRow> = {}): CurrentTaskProjectionReadRow {
  return {
    user_id: USER_ID,
    entity_id: "task-1",
    entity_kind: "parent",
    display_status: "pending",
    next_due_on: "2026-09-18",
    handled_current_logical_day: false,
    last_handled_logical_date: null,
    last_handled_at: null,
    last_handled_at_kind: null,
    last_done_logical_date: "2026-09-17",
    last_done_at: "2026-09-18T00:00:00+00:00",
    last_done_at_kind: "event_instant",
    current_positive_streak: 3,
    current_missed_streak: 0,
    canonical_task_revision: 12,
    history_sync_epoch: HISTORY_EPOCH,
    history_source_revision: 24,
    logical_day_settings_revision: 7,
    projected_logical_date: "2026-09-18",
    projection_schema_version: CURRENT_TASK_PROJECTION_SCHEMA_VERSION,
    projection_algorithm_version: CURRENT_TASK_PROJECTION_ALGORITHM_VERSION,
    validity: "valid",
    updated_at: "2026-09-18T15:00:00.000Z",
    ...overrides,
  };
}

test("Task and workspace Realtime traces cover channel generation, statuses, events, reloads, buffering, and cleanup", () => {
  assert.match(workspaceSource, /createAdhdiceRealtimeChannelDebugId/);
  assert.match(workspaceSource, /recordAdhdiceRealtimeDiagnostic/);
  assert.match(taskAppSource, /recordAdhdiceRealtimeDiagnostic/);
  for (const marker of [
    "task_postgres_event_received",
    "task_should_skip_reload",
    "task_reload_requested",
    "task_reload_queued",
    "task_reload_started",
    "task_reload_completed",
    "task_reload_fetched_trigger_task",
    "task_reload_error",
    "projection_postgres_event_received",
    "projection_event_buffer_enqueue",
    "projection_event_buffer_flush",
    "projection_merge_decision",
    "projection_reconcile_requested",
    "projection_reconcile_started",
    "projection_reconcile_result",
    "projection_reconcile_retry_scheduled",
    "projection_reconcile_completed",
    "projection_reconcile_cancelled",
    "projection_authority_trace",
    "channel_cleanup_completed",
  ]) {
    assert.match(`${workspaceSource}\n${taskAppSource}\n${diagnosticsSource}`, new RegExp(marker));
  }
  assert.match(workspaceSource, /\.subscribe\(\(status(?:, error)?\) =>[\s\S]*channel_subscribe_status/);
  assert.match(taskAppSource, /freshness[\s\S]*authority[\s\S]*selectedDisplayStatus/);
});

test("the source-level shared workspace channel shape remains explicit", () => {
  const taskChannelSource = workspaceSource.slice(
    workspaceSource.indexOf("const nextTaskChannel"),
    workspaceSource.indexOf("const workspaceChannelDebugId"),
  );
  const workspaceChannelSource = workspaceSource.slice(
    workspaceSource.indexOf("const workspaceChannel = client.channel"),
    workspaceSource.indexOf("return () => {", workspaceSource.indexOf("const workspaceChannel = client.channel")),
  );
  const projectionChannelSource = workspaceSource.slice(
    workspaceSource.indexOf("const nextProjectionChannel"),
    workspaceSource.indexOf("const workspaceChannel = client.channel"),
  );
  const tables = (source: string) => [...source.matchAll(/table: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(tables(taskChannelSource), ["adhdice_clean_tasks"]);
  assert.deepEqual([...new Set(tables(workspaceChannelSource))], [
    "adhdice_task_list_folders",
    "adhdice_task_content_folders",
    "adhdice_task_list_containers",
    "adhdice_task_list_rail_items",
    "adhdice_focus_categories",
    "adhdice_task_focus_days",
    "adhdice_task_lists",
    "adhdice_task_list_manual_memberships",
    "adhdice_notes",
    "adhdice_task_history_facts",
  ]);
  assert.doesNotMatch(workspaceChannelSource, /table: "adhdice_clean_tasks"/);
  assert.deepEqual(tables(projectionChannelSource), [
    "adhdice_task_current_projections",
    "adhdice_task_current_projections",
  ]);
  assert.match(projectionChannelSource, /client\.channel\(`adhdice_task_current_projections:\$\{userId\}`\)/);
  assert.match(projectionChannelSource, /status === "SUBSCRIBED"/);
  assert.match(projectionChannelSource, /status === "CHANNEL_ERROR" \|\| status === "TIMED_OUT"/);
  assert.match(projectionChannelSource, /projectionChannelStatusRef\.current = status/);
  assert.match(workspaceSource, /projectionChannelSubscriptionCountRef/);
  assert.match(workspaceSource, /projectionChannelCleanupCountRef/);
});

test("the diagnostics ring buffer is bounded and filters token, email, title, and notes", () => {
  const buffer = createAdhdiceRealtimeDiagnosticBuffer(2);
  buffer.record({
    kind: "safe",
    taskId: "task-1",
    access_token: "secret-token",
    email: "private@example.com",
    title: "private title",
    notes: "private notes",
  });
  buffer.record({ kind: "second", taskId: "task-2" });
  buffer.record({ kind: "third", taskId: "task-3" });
  const serialized = JSON.stringify(buffer.snapshot());
  assert.equal(buffer.snapshot().length, 2);
  assert.match(serialized, /task-2/);
  assert.match(serialized, /task-3/);
  assert.doesNotMatch(serialized, /secret-token|private@example\.com|private title|private notes/);
});

test("timestamp mismatch diagnostics distinguish serialization, logical-midnight, instant, and logical-date cases", () => {
  const settings = { logicalDayStart: "06:00", timezone: "America/New_York" };
  assert.equal(
    classifyCurrentTaskProjectionTimestampMismatch("2026-09-18T00:00:00.000Z", "2026-09-17T20:00:00-04:00", settings),
    "same instant / different serialization",
  );
  assert.equal(
    classifyCurrentTaskProjectionTimestampMismatch("2026-09-18T00:00:00+00:00", "2026-09-18T00:00:00", settings),
    "same logical date but floating-time vs timestamptz",
  );
  assert.equal(
    classifyCurrentTaskProjectionTimestampMismatch("2026-09-18T14:30:00.000Z", "2026-09-18T10:30:00-04:00", settings),
    "same instant / different serialization",
  );
  assert.equal(
    classifyCurrentTaskProjectionTimestampMismatch("2026-09-18T14:30:00.000Z", "2026-09-19T14:30:00.000Z", settings),
    "different logical date",
  );
  assert.equal(
    classifyCurrentTaskProjectionTimestampContract("lastDoneAt", "2026-09-18T00:00:00", { ...settings, logicalDate: "2026-09-18" }),
    "synthesized logical-day presentation time",
  );
  assert.equal(
    classifyCurrentTaskProjectionTimestampContract("lastDoneAt", "2026-09-18T00:00:00+00:00", { ...settings, logicalDate: "2026-09-18" }),
    "synthesized logical-day presentation time",
  );
  assert.equal(
    classifyCurrentTaskProjectionTimestampContract("lastDoneAt", "2026-09-18T14:30:00.000Z", { ...settings, logicalDate: "2026-09-18" }),
    "actual event time",
  );
  assert.equal(
    classifyCurrentTaskProjectionTimestampContract("lastDoneDate", "2026-09-18", { ...settings, logicalDate: "2026-09-18" }),
    "logical date",
  );

  const localFormatterProbe = execFileSync(process.execPath, [
    "-e",
    "console.log(JSON.stringify(['2026-09-18T00:00:00','2026-09-18T00:00:00+00:00'].map((value) => new Date(value).toLocaleString('en-US'))))",
  ], { env: { ...process.env, TZ: "America/New_York" }, encoding: "utf8" }).trim();
  assert.deepEqual(JSON.parse(localFormatterProbe), ["9/18/2026, 12:00:00 AM", "9/17/2026, 8:00:00 PM"]);
});

test("parity samples carry Task and projection source fences plus timestamp classification", () => {
  const result = compareCurrentTaskProjectionParity({
    legacyCurrentRead: {
      dueOnByTaskId: { "task-1": "2026-09-18" },
      statusesByTaskId: { "task-1": "pending" },
    },
    legacySummaries: {
      "task-1": {
        currentStreak: 2,
        missedStreak: 0,
        lastHandledDate: null,
        lastHandledAt: null,
        lastDoneDate: "2026-09-17",
        lastDoneAt: "2026-09-18T00:00:00",
      },
    },
    logicalDayStart: "06:00",
    projectionsByTaskId: { "task-1": projection({ last_done_logical_date: "2026-09-18" }) },
    tasks: [task()],
    timezone: "America/New_York",
  });
  const sample = result.mismatchDiagnostics.find((mismatch) => mismatch.field === "currentPositiveStreak");
  const timestampSample = result.mismatchDiagnostics.find((mismatch) => mismatch.field === "lastDoneAt");
  assert.equal(sample?.taskCanonicalRevision, 12);
  assert.equal(sample?.projectionCanonicalTaskRevision, 12);
  assert.equal(sample?.projectionHistorySourceRevision, 24);
  assert.equal(sample?.projectionUpdatedAt, "2026-09-18T15:00:00.000Z");
  assert.equal(timestampSample?.timestampClassification, "same logical date but floating-time vs timestamptz");
  assert.deepEqual(timestampSample?.timestampContract, {
    legacy: "synthesized logical-day presentation time",
    projected: "synthesized logical-day presentation time",
  });
});

test("authority diagnostics remain event-scoped and preserve stale-to-rebuilt freshness evidence", () => {
  assert.match(taskAppSource, /consumeAdhdiceRealtimeAuthorityPending\(\)/);
  assert.match(taskAppSource, /projectionCanonicalTaskRevision/);
  assert.match(taskAppSource, /projectionHistorySourceRevision/);
  assert.match(taskAppSource, /projectionValidity/);
  assert.match(taskAppSource, /selectedPositiveStreak/);
  const stale = resolveCurrentTaskProjectionReads({
    historySyncEpoch: HISTORY_EPOCH,
    logicalDaySettingsRevision: 7,
    projectionsByTaskId: { "task-1": projection({ canonical_task_revision: 11 }) },
    taskHistoryStreakSummaries: {},
    tasks: [task()],
    todayKey: "2026-09-18",
  });
  const rebuilt = resolveCurrentTaskProjectionReads({
    historySyncEpoch: HISTORY_EPOCH,
    logicalDaySettingsRevision: 7,
    projectionsByTaskId: { "task-1": projection({ canonical_task_revision: 12 }) },
    taskHistoryStreakSummaries: {},
    tasks: [task()],
    todayKey: "2026-09-18",
  });
  assert.deepEqual(stale.staleProjectionTaskIds, ["task-1"]);
  assert.deepEqual(rebuilt.freshProjectionTaskIds, ["task-1"]);
  const cleanup = installAdhdiceRealtimeDiagnostics();
  cleanup();
});
