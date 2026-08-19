import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { Task, TaskHistory } from "../src/lib/database.types.ts";
import { buildCanonicalActiveStatusCounts } from "../src/lib/task-app-derived.ts";
import { deduplicateTaskHistoryByLogicalDate } from "../src/lib/task-history.ts";
import { mapCanonicalTaskHistoryFacts } from "../src/lib/task-state-canonical/history-projection.ts";
import type { CanonicalTaskHistoryFact } from "../src/lib/task-state-canonical/types.ts";
import { resolveCompatibilityTaskStatuses } from "../src/lib/task-state-engine/read-authority.ts";
import { resolveTaskHistoryCalendarRead } from "../src/lib/task-state-engine/calendar-authority.ts";
import { buildTaskHistoryStreakSummary } from "../src/lib/task-history-streak-summaries.ts";
import { createProjectionDomainRevision } from "../src/lib/stable-task-projection.ts";

const TASK_ID = "28220db9-41cd-4452-a958-87091edc82b3";
const TODAY = "2026-08-17";

function task(overrides: Partial<Task> = {}): Task {
  return {
    active_occurrence_due_on: null,
    active_status_logical_date: null,
    actual_seconds: 0,
    completed_at: null,
    created_at: "2026-08-01T12:00:00.000Z",
    due_on: TODAY,
    due_time: null,
    energy: "medium",
    estimated_minutes: null,
    external_link_label: null,
    external_link_url: null,
    id: TASK_ID,
    is_important: false,
    is_urgent: false,
    notes: null,
    one_step_at_a_time: false,
    parent_task_id: null,
    pin_order: null,
    pinned_at: null,
    priority: "normal",
    repeat_day_of_month: null,
    repeat_days_of_week: [],
    repeat_frequency: "daily",
    repeat_interval: 1,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
    revision: 1,
    scheduled_on: null,
    sort_order: 0,
    status: "pending",
    subtasks_auto_reset: false,
    tags: [],
    title: "Log Calories",
    trashed_at: null,
    updated_at: "2026-08-17T12:00:00.000Z",
    user_id: "user-1",
    ...overrides,
  };
}

function history(
  entryDate: string,
  status: TaskHistory["status"],
  overrides: Partial<TaskHistory> = {},
): TaskHistory {
  return {
    counted_as_due_occurrence: true,
    created_at: `${entryDate}T12:00:00.000Z`,
    entry_date: entryDate,
    event_type: "status",
    id: `${status}-${entryDate}`,
    occurrence_due_on: entryDate,
    occurrence_key: `task:${TASK_ID}:occurrence:${entryDate}`,
    status,
    task_id: TASK_ID,
    updated_at: `${entryDate}T12:00:00.000Z`,
    user_id: "user-1",
    was_completed: status === "done" || status === "did_my_best" || status === "complete",
    ...overrides,
  };
}

function canonicalFact(
  entryDate: string,
  outcome: CanonicalTaskHistoryFact["outcome"],
  index: number,
  overrides: Partial<CanonicalTaskHistoryFact> = {},
): CanonicalTaskHistoryFact {
  return {
    actor_id: "user-1",
    actor_kind: "user",
    command_id: `command-${index}`,
    created_at: `${entryDate}T12:00:00.000Z`,
    effective_due_on: entryDate,
    entity_id: TASK_ID,
    entity_kind: "parent",
    event_kind: outcome === "complete" ? "terminal_complete" : "explicit_outcome",
    id: `canonical-${entryDate}`,
    idempotence_identity: `command-${index}:history`,
    logical_date: entryDate,
    logical_day_settings_revision: 1,
    occurrence_id: `occurrence-${entryDate}`,
    outcome,
    provenance_kind: "user",
    recurrence_source_fingerprint: null,
    revision: 1,
    schedule_boundary_id: null,
    scheduled_due_on: entryDate,
    source: "task-state-command",
    source_legacy_history_id: null,
    timezone: "America/New_York",
    updated_at: `${entryDate}T12:00:00.000Z`,
    user_id: "user-1",
    day_start_time: "06:00",
    ...overrides,
  };
}

function read(sourceTask: Task, historyRows: TaskHistory[]) {
  return resolveCompatibilityTaskStatuses({
    historyByTaskId: { [sourceTask.id]: historyRows },
    logicalDayRollover: "06:00",
    now: "2026-08-17T12:00:00.000Z",
    tasks: [sourceTask],
    timezone: "America/New_York",
  }).statusesByTaskId[sourceTask.id];
}

test("Log Calories mixed legacy/canonical chronology resolves stale Missed to Open", () => {
  const sourceTask = task();
  const legacyRows = [
    history("2026-08-01", "missed"),
    ...["2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07"]
      .map((date) => history(date, "done", { id: `legacy-${date}` })),
  ];
  const canonicalRows = mapCanonicalTaskHistoryFacts(
    ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14", "2026-08-15", "2026-08-16"]
      .map((date, index) => canonicalFact(date, "done", index)),
  );

  assert.equal(read(sourceTask, [legacyRows[0]!]), "missed", "the pre-fix sparse input reproduces the production regression");
  assert.equal(read(sourceTask, [...legacyRows, ...canonicalRows]), "pending");
  assert.equal(read(sourceTask, canonicalRows), "pending");
  assert.equal(read(sourceTask, canonicalRows), "pending", "pending is the internal Open projection");
});

test("genuine unresolved Missed remains Missed without a later success", () => {
  assert.equal(read(task({ status: "missed" }), [history("2026-08-01", "missed")]), "missed");
});

test("Done and Did My Best both resolve a Missed chain and reset the missed streak", () => {
  for (const outcome of ["done", "did_my_best"] as const) {
    const sourceTask = task();
    const rows = [history("2026-08-01", "missed"), history("2026-08-16", outcome)];
    assert.equal(read(sourceTask, rows), "pending", outcome);
    assert.equal(buildTaskHistoryStreakSummary(sourceTask, rows, TODAY, {
      compatibilityOnly: true,
      logicalDayRollover: "06:00",
      now: "2026-08-17T12:00:00.000Z",
      timezone: "America/New_York",
    }).missedStreak, 0, outcome);
  }
});

test("Not Due and Delayed facts do not become success boundaries", () => {
  const sourceTask = task({ status: "missed" });
  const missed = history("2026-08-01", "missed");
  const delayed = history("2026-08-16", "delayed", { effective_due_on: "2026-08-20" });
  assert.equal(read(sourceTask, [missed, delayed]), "missed");
  assert.equal(read(task({ status: "missed", due_on: "2026-08-20" }), [missed]), "missed");
});

test("migration Delayed History remains visible without driving current recurrence", () => {
  const sourceTask = task({ due_on: "2026-08-20", status: "pending" });
  const migratedDelayed = mapCanonicalTaskHistoryFacts([canonicalFact("2026-07-16", "delayed", 1, {
    occurrence_id: null,
    scheduled_due_on: null,
    effective_due_on: null,
    provenance_kind: "migration_reconstruction",
  })]);

  assert.equal(migratedDelayed[0]?.recurrence_authoritative, false);
  assert.equal(read(sourceTask, migratedDelayed), "upcoming");

  const calendar = resolveTaskHistoryCalendarRead({
    compatibilityOnly: true,
    calendarEnd: "2026-08-20",
    calendarStart: "2026-07-16",
    history: migratedDelayed,
    logicalDayRollover: "06:00",
    now: "2026-08-17T12:00:00.000Z",
    task: sourceTask,
    timezone: "America/New_York",
  });
  assert.equal(calendar?.states["2026-07-16"], "delayed");
  assert.equal(calendar?.timeline?.nextDueOn, "2026-08-20");

  const runtimeDelayed = mapCanonicalTaskHistoryFacts([canonicalFact("2026-08-17", "delayed", 2, {
    effective_due_on: "2026-08-20",
  })]);
  assert.equal(runtimeDelayed[0]?.recurrence_authoritative, true);
  assert.equal(read(task({ due_on: "2026-08-17" }), runtimeDelayed), "delayed");
});

test("canonical History outranks a legacy row on the same logical date", () => {
  const legacyMissed = history("2026-08-16", "missed", { id: "legacy-missed" });
  const canonicalDone = history("2026-08-16", "done", { id: "canonical-done", canonical_fact_id: "fact-1" });
  assert.equal(deduplicateTaskHistoryByLogicalDate([legacyMissed, canonicalDone])[0]?.status, "done");
});

test("the corrected display map supplies status counts and row parity", () => {
  const sourceTask = task();
  const displayStatusByTaskId = { [sourceTask.id]: read(sourceTask, [history("2026-08-16", "done")]) };
  const counts = buildCanonicalActiveStatusCounts([sourceTask], {}, {}, TODAY, {
    displayStatusByTaskId,
    includeSteps: false,
  });

  assert.equal(displayStatusByTaskId[sourceTask.id], "pending");
  assert.equal(counts.pending, 1);
  assert.equal(counts.missed, 0);
});

test("modal canonical hydration invalidates the active-status projection without being required at startup", async () => {
  const startupHistory = { [TASK_ID]: [history("2026-08-01", "missed")] };
  const hydratedHistory = { [TASK_ID]: [history("2026-08-16", "done")] };
  assert.notEqual(
    createProjectionDomainRevision("task-history-authoritative", startupHistory),
    createProjectionDomainRevision("task-history-authoritative", hydratedHistory),
  );

  const taskAppSource = await readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
  assert.match(taskAppSource, /createProjectionDomainRevision\("task-history-authoritative", taskHistoryByTaskId\)/);
  assert.match(taskAppSource, /taskHistoryByTaskId\[task\.id\]/);
});

test("child status and Table/List facets remain on the shared display-status map", async () => {
  const [derivedSource, listSource] = await Promise.all([
    readFile(new URL("../src/lib/task-app-derived.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/components/task-app/tasks-list-adapter.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(derivedSource, /displayStatusByTaskId\?\.?\[item\.id\]/);
  assert.match(derivedSource, /taskDisplayStatusByTaskId\[task\.id\]/);
  assert.match(listSource, /taskDisplayStatusByTaskId/);
});
