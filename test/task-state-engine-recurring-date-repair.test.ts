import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { Task, TaskHistory } from "../src/lib/database.types.ts";
import {
  buildRecurringDateRepairReport,
  RECURRING_DATE_REPAIR_TASK_IDS,
} from "../src/lib/task-state-engine/recurring-date-repair-report.ts";
import {
  registerRecurringDateRepairReportBridge,
  type RecurringDateRepairWindow,
} from "../src/lib/task-state-engine/recurring-date-repair-runtime.ts";
import { legacyHistory, legacyTask, SHADOW_NOW } from "./task-state-engine-shadow-fixtures.ts";

const NOW = SHADOW_NOW;
const OPTIONS = { now: NOW, timezone: "America/New_York", rolloverTime: "06:00" } as const;

function report(tasks: Task[], history: TaskHistory[], affectedTaskIds = tasks.map((task) => task.id)) {
  return buildRecurringDateRepairReport({ ...OPTIONS, affectedTaskIds, tasks, history });
}

function explicitSuccess(taskId: string, entryDate: string, occurrenceDate: string) {
  return legacyHistory(taskId, entryDate, "done", {
    counted_as_due_occurrence: true,
    occurrence_due_on: occurrenceDate,
    occurrence_key: `task:${taskId}:occurrence:${occurrenceDate}`,
  });
}

function explicitOutcome(taskId: string, entryDate: string, occurrenceDate: string, status: TaskHistory["status"]) {
  return legacyHistory(taskId, entryDate, status, {
    counted_as_due_occurrence: true,
    occurrence_due_on: occurrenceDate,
    occurrence_key: `occurrence:${occurrenceDate}`,
  });
}

test("affected task scope is the exact 28-ID repair set", () => {
  assert.equal(RECURRING_DATE_REPAIR_TASK_IDS.length, 28);
  assert.equal(new Set(RECURRING_DATE_REPAIR_TASK_IDS).size, 28);
  assert.deepEqual(RECURRING_DATE_REPAIR_TASK_IDS, [
    "96d688b4-54f5-4884-9971-38b43cba4aa5", "40dfaed0-4c1c-4ab0-a930-3bc0accbed94",
    "b421f72a-2745-46df-81a1-d8c8416e1951", "87a9e225-b385-44c7-b336-c3b9c6c5ea1b",
    "8ee7441c-2e4d-439a-be7f-d1e19fdb2a41", "81b64697-4291-4d3d-913a-c9d0e2f8d804",
    "27035f67-c008-4e54-9761-c7f01cf0604d", "0c3ccc7b-fcce-4a6a-aa77-9c5cfd471fc7",
    "723be9b2-64c0-43a9-b49a-5b7f648f57ea", "a1eb2348-99ed-42bd-867b-ceb246128066",
    "b4940db0-5217-4f53-99d0-60e46933e58e", "09180da0-58bb-46e4-8ec2-53c1cc4d2f21",
    "7fb30d0c-1d12-4c3e-9c82-f39a82ff6055", "f4e11d51-6bba-4eff-a05f-7c2e81f19a92",
    "c72a281c-5932-4b7b-8e49-4ee4397acf6e", "058390ab-cc42-49ec-a458-8da05773732b",
    "8b50fb4b-a634-4c15-afb3-70307ebc528a", "d5d2d1ba-94f1-47d3-a7af-11fd3f208db1",
    "df4ef91d-fcee-4411-970c-0c1cf9520ff5", "dba6e6d4-981f-4941-a5c9-e78e8def250f",
    "a3e34bd7-35dd-44b0-82e0-7677c957c5f0", "713cfd40-287c-4531-bba5-46d9f6f2a496",
    "a415dc65-b841-448b-b8a8-4b299987cb8a", "01eda993-ddfc-4fb1-b817-1fb986d1b7b2",
    "52e90aba-364a-4b9f-8c03-e512a099fe44", "46c06353-7930-4ed3-9449-4ae2084ffa57",
    "c48c40ee-296a-4bd5-aec4-eec75ccf48ba", "9f69b644-4943-4329-9162-53fefe1bc7dc",
  ]);
});

test("weekly explicit occurrence identity produces a High-confidence next occurrence", () => {
  const task = legacyTask({ id: "weekly-explicit", due_on: "2026-09-06", repeat_frequency: "weekly", repeat_days_of_week: [0] });
  const result = report([task], [explicitSuccess(task.id, "2026-07-30", "2026-08-02")]).tasks[0];
  assert.equal(result.inferredLastLegitimateConsumedOccurrence, "2026-08-02");
  assert.equal(result.proposedNextDueDate, "2026-08-09");
  assert.equal(result.confidence, "High");
});

test("sequential weekly explicit occurrences are normal recurring History", () => {
  const task = legacyTask({ id: "weekly-sequence", due_on: "2026-09-07", repeat_frequency: "weekly", repeat_days_of_week: [1] });
  const history = ["2026-07-13", "2026-07-20", "2026-07-27"].map((date) => explicitOutcome(task.id, date, date, "done"));
  const result = report([task], history).tasks[0];
  assert.equal(result.proposedNextDueDate, "2026-08-03");
  assert.equal(result.inferredLastLegitimateConsumedOccurrence, "2026-07-27");
  assert.equal(result.replaySeedOccurrence, "2026-08-03");
  assert.equal(result.firstReplayedHistoryRow, null);
  assert.equal(result.lastReplayedHistoryRow, null);
  assert.equal(result.rejectedEvidence.length, 0);
});

test("live Monday and Tuesday consumed occurrences advance exactly once", () => {
  const monday = legacyTask({ id: "live-monday", due_on: "2026-08-10", repeat_frequency: "weekly", repeat_days_of_week: [1] });
  const tuesday = legacyTask({ id: "live-tuesday", due_on: "2026-08-11", repeat_frequency: "weekly", repeat_days_of_week: [2] });
  const result = report([monday, tuesday], [
    explicitOutcome(monday.id, "2026-07-27", "2026-07-27", "done"),
    explicitOutcome(tuesday.id, "2026-07-28", "2026-07-28", "did_my_best"),
  ]).tasks;
  assert.equal(result[0].inferredLastLegitimateConsumedOccurrence, "2026-07-27");
  assert.equal(result[0].replaySeedOccurrence, "2026-08-03");
  assert.equal(result[0].proposedNextDueDate, "2026-08-03");
  assert.equal(result[1].inferredLastLegitimateConsumedOccurrence, "2026-07-28");
  assert.equal(result[1].replaySeedOccurrence, "2026-08-04");
  assert.equal(result[1].proposedNextDueDate, "2026-08-04");
});

test("sequential monthly explicit occurrences are normal recurring History", () => {
  const task = legacyTask({ id: "monthly-sequence", due_on: "2026-11-15", repeat_frequency: "monthly", repeat_day_of_month: 15 });
  const history = ["2026-06-15", "2026-07-15"].map((date) => explicitOutcome(task.id, date, date, "did_my_best"));
  const result = report([task], history).tasks[0];
  assert.equal(result.proposedNextDueDate, "2026-08-15");
  assert.equal(result.rejectedEvidence.length, 0);
});

test("early completion uses occurrenceDueOn instead of entryDate", () => {
  const task = legacyTask({ id: "early", due_on: "2026-09-07", repeat_frequency: "weekly", repeat_days_of_week: [1] });
  const result = report([task], [explicitOutcome(task.id, "2026-07-11", "2026-07-13", "done")]).tasks[0];
  assert.equal(result.inferredLastLegitimateConsumedOccurrence, "2026-07-13");
  assert.equal(result.proposedNextDueDate, "2026-07-20");
});

test("live early action consuming a later occurrence advances from occurrence identity once", () => {
  const task = legacyTask({ id: "live-early", due_on: "2026-08-17", repeat_frequency: "weekly", repeat_days_of_week: [1] });
  const result = report([task], [explicitOutcome(task.id, "2026-07-27", "2026-08-03", "done")]).tasks[0];
  assert.equal(result.latestSuccessfulHistoryDate, "2026-07-27");
  assert.equal(result.inferredLastLegitimateConsumedOccurrence, "2026-08-03");
  assert.equal(result.replaySeedOccurrence, "2026-08-10");
  assert.equal(result.proposedNextDueDate, "2026-08-10");
});

test("late completion uses occurrenceDueOn instead of entryDate", () => {
  const task = legacyTask({ id: "late", due_on: "2026-09-07", repeat_frequency: "weekly", repeat_days_of_week: [1] });
  const result = report([task], [explicitOutcome(task.id, "2026-07-15", "2026-07-13", "done")]).tasks[0];
  assert.equal(result.inferredLastLegitimateConsumedOccurrence, "2026-07-13");
  assert.equal(result.proposedNextDueDate, "2026-07-20");
});

test("invalid off-schedule explicit occurrence is rejected", () => {
  const task = legacyTask({ id: "off-schedule", due_on: "2026-09-07", repeat_frequency: "weekly", repeat_days_of_week: [1] });
  const result = report([task], [explicitOutcome(task.id, "2026-07-12", "2026-07-12", "done")]).tasks[0];
  assert.equal(result.proposedNextDueDate, null);
  assert.match(result.rejectedEvidence[0]?.reason ?? "", /invalid for the configured recurrence/i);
});

test("weekly legacy unkeyed History uses an on-schedule success conservatively", () => {
  const task = legacyTask({ id: "weekly-unkeyed", due_on: "2026-09-06", repeat_frequency: "weekly", repeat_days_of_week: [0] });
  const result = report([task], [legacyHistory(task.id, "2026-08-02", "done")]).tasks[0];
  assert.equal(result.inferredLastLegitimateConsumedOccurrence, "2026-08-02");
  assert.equal(result.proposedNextDueDate, "2026-08-09");
  assert.equal(result.confidence, "Medium");
});

test("multiple-weekday recurrence advances through the shared fixed helper", () => {
  const task = legacyTask({ id: "multi-weekday", due_on: "2026-09-04", repeat_frequency: "weekly", repeat_days_of_week: [1, 3, 5] });
  const result = report([task], [explicitSuccess(task.id, "2026-07-30", "2026-07-31")]).tasks[0];
  assert.equal(result.proposedNextDueDate, "2026-08-03");
});

test("monthly fixed-date recurrence proposes the next configured date", () => {
  const task = legacyTask({ id: "monthly-fixed", due_on: "2026-11-15", repeat_frequency: "monthly", repeat_day_of_month: 15 });
  const result = report([task], [explicitSuccess(task.id, "2026-08-01", "2026-08-15")]).tasks[0];
  assert.equal(result.proposedNextDueDate, "2026-09-15");
  assert.equal(result.confidence, "High");
});

test("monthly ordinal recurrence proposes the next ordinal weekday", () => {
  const task = legacyTask({
    id: "monthly-ordinal",
    due_on: "2026-12-01",
    repeat_frequency: "monthly",
    repeat_monthly_mode: "ordinal_weekday",
    repeat_monthly_ordinal: "first",
    repeat_monthly_weekday: 2,
  });
  const result = report([task], [explicitSuccess(task.id, "2026-08-01", "2026-08-04")]).tasks[0];
  assert.equal(result.proposedNextDueDate, "2026-09-01");
});

test("custom interval recurrence rebases from latest successful History", () => {
  const task = legacyTask({ id: "custom", due_on: "2026-09-01", repeat_frequency: "custom", repeat_interval: 5 });
  const result = report([task], [legacyHistory(task.id, "2026-07-30", "done")]).tasks[0];
  assert.equal(result.inferredLastLegitimateConsumedOccurrence, "2026-07-30");
  assert.equal(result.proposedNextDueDate, "2026-08-04");
  assert.equal(result.confidence, "Medium");
});

test("conflicting explicit History evidence returns no proposal", () => {
  const task = legacyTask({ id: "conflict", due_on: "2026-09-06", repeat_frequency: "weekly", repeat_days_of_week: [0] });
  const history = [explicitSuccess(task.id, "2026-07-30", "2026-08-02")];
  history[0].occurrence_key = `task:${task.id}:occurrence:2026-08-09`;
  const result = report([task], history).tasks[0];
  assert.equal(result.proposedNextDueDate, null);
  assert.equal(result.confidence, "Low");
  assert.match(result.reasoning, /contradictory/i);
  assert.match(result.rejectedEvidence[0]?.reason ?? "", /disagree/i);
});

test("later Missed preserves the current unresolved occurrence under engine semantics", () => {
  const task = legacyTask({ id: "later-missed", due_on: "2026-09-07", repeat_frequency: "weekly", repeat_days_of_week: [1] });
  const history = [
    explicitOutcome(task.id, "2026-07-13", "2026-07-13", "done"),
    explicitOutcome(task.id, "2026-07-20", "2026-07-20", "missed"),
  ];
  const result = report([task], history).tasks[0];
  assert.equal(result.proposedNextDueDate, "2026-07-20");
  assert.equal(result.latestOccurrenceRelevantHistoryOutcome?.status, "missed");
  assert.equal(result.replaySeedOccurrence, "2026-07-20");
  assert.equal(result.firstReplayedHistoryRow?.status, "missed");
  assert.equal(result.lastReplayedHistoryRow?.occurrenceDueOn, "2026-07-20");
});

test("derived Missed identity is replayable evidence but never a consumed success", () => {
  const task = legacyTask({ id: "derived-missed", due_on: "2026-08-03", repeat_frequency: "weekly", repeat_days_of_week: [1] });
  const missed = legacyHistory(task.id, "2026-08-03", "missed", {
    occurrence_key: "derived-missed:2026-08-03",
    occurrence_due_on: null,
  });
  const result = report([task], [
    explicitOutcome(task.id, "2026-07-27", "2026-07-27", "done"),
    missed,
  ]).tasks[0];
  assert.equal(result.inferredLastLegitimateConsumedOccurrence, "2026-07-27");
  assert.equal(result.replaySeedOccurrence, "2026-08-03");
  assert.equal(result.firstReplayedHistoryRow?.id, missed.id);
  assert.equal(result.proposedNextDueDate, "2026-08-03");
  assert.equal(result.rejectedEvidence.length, 0);
});

test("later Delayed preserves the same unresolved occurrence under replayable engine semantics", () => {
  const task = legacyTask({ id: "later-delayed", due_on: "2026-09-07", repeat_frequency: "weekly", repeat_days_of_week: [1] });
  const history = [
    explicitOutcome(task.id, "2026-07-13", "2026-07-13", "done"),
    explicitOutcome(task.id, "2026-07-20", "2026-07-20", "delayed"),
  ];
  const result = report([task], history).tasks[0];
  assert.equal(result.proposedNextDueDate, "2026-07-20");
  assert.equal(result.latestOccurrenceRelevantHistoryOutcome?.status, "delayed");
  assert.equal(result.firstReplayedHistoryRow?.status, "delayed");
  assert.equal(result.lastReplayedHistoryRow?.occurrenceDueOn, "2026-07-20");
});

test("a later consumed occurrence produces the next currently unresolved occurrence", () => {
  const task = legacyTask({ id: "latest-consumed", due_on: "2026-09-07", repeat_frequency: "weekly", repeat_days_of_week: [1] });
  const result = report([task], [
    explicitOutcome(task.id, "2026-07-13", "2026-07-13", "done"),
    explicitOutcome(task.id, "2026-07-20", "2026-07-20", "did_my_best"),
  ]).tasks[0];
  assert.equal(result.inferredLastLegitimateConsumedOccurrence, "2026-07-20");
  assert.equal(result.proposedNextDueDate, "2026-07-27");
});

test("Done and Did My Best each consume one occurrence while Complete terminates", () => {
  for (const status of ["done", "did_my_best"] as const) {
    const task = legacyTask({ id: `once-${status}`, due_on: "2026-08-17", repeat_frequency: "weekly", repeat_days_of_week: [1] });
    const result = report([task], [explicitOutcome(task.id, "2026-07-27", "2026-07-27", status)]).tasks[0];
    assert.equal(result.proposedNextDueDate, "2026-08-03");
  }
  const completeTask = legacyTask({ id: "complete-terminates", due_on: "2026-08-17", repeat_frequency: "weekly", repeat_days_of_week: [1] });
  const completeResult = report([completeTask], [
    explicitOutcome(completeTask.id, "2026-07-27", "2026-07-27", "done"),
    explicitOutcome(completeTask.id, "2026-08-03", "2026-08-03", "complete"),
  ]).tasks[0];
  assert.equal(completeResult.replaySeedOccurrence, "2026-08-03");
  assert.equal(completeResult.firstReplayedHistoryRow?.status, "complete");
  assert.equal(completeResult.proposedNextDueDate, null);
});

test("genuinely ambiguous unkeyed early completion returns no proposal", () => {
  const task = legacyTask({ id: "ambiguous", due_on: "2026-09-07", repeat_frequency: "weekly", repeat_days_of_week: [1] });
  const history = [
    explicitOutcome(task.id, "2026-07-13", "2026-07-13", "done"),
    legacyHistory(task.id, "2026-07-18", "done"),
  ];
  const result = report([task], history).tasks[0];
  assert.equal(result.proposedNextDueDate, null);
  assert.match(result.reasoning, /guess/i);
});

test("missing task is reported and counted without inference", () => {
  const result = report([], [], ["missing"]);
  assert.equal(result.summary.missingTasks, 1);
  assert.equal(result.summary.noSafeProposal, 1);
  assert.equal(result.tasks[0].taskId, "missing");
  assert.equal(result.tasks[0].proposedNextDueDate, null);
});

test("missing History only preserves a schedule-valid future due date at Low confidence", () => {
  const task = legacyTask({ id: "no-history", due_on: "2026-08-02", repeat_frequency: "weekly", repeat_days_of_week: [0] });
  const result = report([task], []).tasks[0];
  assert.equal(result.latestSuccessfulHistoryDate, null);
  assert.equal(result.proposedNextDueDate, "2026-08-02");
  assert.equal(result.confidence, "Low");
});

test("an already-correct future due date is retained when explicit evidence confirms it", () => {
  const task = legacyTask({ id: "already-correct", due_on: "2026-08-09", repeat_frequency: "weekly", repeat_days_of_week: [0] });
  const result = report([task], [explicitSuccess(task.id, "2026-07-30", "2026-08-02")]).tasks[0];
  assert.equal(result.proposedNextDueDate, task.due_on);
  assert.equal(result.confidence, "High");
  assert.match(result.reasoning, /matching the persisted due date/);
});

test("proposal basis names the seed and excluded boundary when no History is replayed", () => {
  const task = legacyTask({ id: "bounded-wording", due_on: "2026-08-10", repeat_frequency: "weekly", repeat_days_of_week: [1] });
  const result = report([task], [explicitSuccess(task.id, "2026-08-01", "2026-08-03")]).tasks[0];
  assert.equal(result.replaySeedOccurrence, "2026-08-10");
  assert.equal(result.firstReplayedHistoryRow, null);
  assert.equal(result.lastReplayedHistoryRow, null);
  assert.match(result.proposalBasis ?? "", /seed 2026-08-10/);
  assert.match(result.proposalBasis ?? "", /excluded consumed-occurrence boundary at 2026-08-03/);
  assert.doesNotMatch(result.proposalBasis ?? "", /replay .* through/i);
});

test("report generation is deterministic and does not mutate source arrays or rows", () => {
  const task = legacyTask({ id: "stable", due_on: "2026-09-06", repeat_frequency: "weekly", repeat_days_of_week: [0] });
  const history = [explicitSuccess(task.id, "2026-07-30", "2026-08-02")];
  const before = JSON.stringify({ history, task });
  const first = report([task], history);
  const second = report([task], history);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify({ history, task }), before);
  assert.doesNotThrow(() => JSON.stringify(first));
});

test("development bridge exposes current report and rebuilds only from the latest snapshot", () => {
  let tasks = [legacyTask({ id: "bridge", due_on: "2026-08-02", repeat_frequency: "weekly", repeat_days_of_week: [0] })];
  let reads = 0;
  const target: RecurringDateRepairWindow = {};
  const cleanup = registerRecurringDateRepairReportBridge({
    environment: "development",
    getSnapshot: () => {
      reads += 1;
      return { ...OPTIONS, affectedTaskIds: ["bridge"], tasks, history: [] };
    },
    target,
  });
  assert.equal(reads, 1);
  assert.equal(target.__ADHDICE_RECURRING_DATE_REPAIR_REPORT__?.summary.foundTasks, 1);
  tasks = [];
  const rebuilt = target.__ADHDICE_BUILD_RECURRING_DATE_REPAIR_REPORT__?.();
  assert.equal(reads, 2);
  assert.equal(rebuilt?.summary.missingTasks, 1);
  cleanup();
  assert.equal(target.__ADHDICE_RECURRING_DATE_REPAIR_REPORT__, undefined);
  assert.equal(target.__ADHDICE_BUILD_RECURRING_DATE_REPAIR_REPORT__, undefined);
});

test("repair report modules contain no network, mutation, reward, lifecycle, rollover, or SQL calls", async () => {
  for (const path of [
    "src/lib/task-state-engine/recurring-date-repair-report.ts",
    "src/lib/task-state-engine/recurring-date-repair-runtime.ts",
  ]) {
    const source = await readFile(path, "utf8");
    assert.doesNotMatch(source, /from ["'][^"']*(supabase|useTask|reward|rollover-authority|archive|trash|delete|restore)/i);
    assert.doesNotMatch(source, /\.(insert|update|upsert|delete|rpc)\s*\(/);
    assert.doesNotMatch(source, /\b(fetch|XMLHttpRequest|WebSocket)\s*\(/);
  }
});

test("production bridge removes repair globals without reading loaded data", () => {
  const target: RecurringDateRepairWindow = {
    __ADHDICE_RECURRING_DATE_REPAIR_REPORT__: report([], [], []).tasks as never,
    __ADHDICE_BUILD_RECURRING_DATE_REPAIR_REPORT__: () => { throw new Error("must be removed"); },
  };
  registerRecurringDateRepairReportBridge({
    environment: "production",
    getSnapshot: () => { throw new Error("must not read"); },
    target,
  });
  assert.equal(target.__ADHDICE_RECURRING_DATE_REPAIR_REPORT__, undefined);
  assert.equal(target.__ADHDICE_BUILD_RECURRING_DATE_REPAIR_REPORT__, undefined);
});
