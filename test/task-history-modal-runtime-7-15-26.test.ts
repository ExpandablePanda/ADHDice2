import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TaskHistoryModal } from "../src/components/task-app/task-view-adapters.tsx";

const taskHistoryModalSource = readFileSync(new URL("../src/components/task-app/task-view-adapters.tsx", import.meta.url), "utf8");

const task = {
  id: "task-history-modal-runtime",
  user_id: "user-1",
  title: "History modal regression",
  status: "pending",
  due_on: "2026-09-23",
  task_type: "task",
  custom_ruleset_id: null,
  canonical_revision: 1,
  entity_kind: "parent",
} as never;

const canonicalAuthority = {
  canonicalization_status: "canonical_proven",
  container_state: "active",
  terminal_state: "active",
  workflow_state: "none",
};

const scheduleBoundary = {
  anchor_confidence: "proven",
  anchor_date: "2026-09-01",
  one_time_due_on: null,
  repeat_day_of_month: null,
  repeat_days_of_week: [],
  repeat_frequency: "daily",
  repeat_interval: 1,
  repeat_monthly_mode: "day_of_month",
  repeat_monthly_ordinal: null,
  repeat_monthly_weekday: null,
  schedule_model: "rolling",
};

const stateEngineContext = {
  logicalDayRollover: "00:00",
  now: "2026-09-23T12:00:00.000Z",
  timezone: "UTC",
};

function renderModal(nextTask: unknown, extraProps: Record<string, unknown> = {}) {
  return renderToStaticMarkup(createElement(TaskHistoryModal, {
    onClose: () => undefined,
    onRenameTaskTitle: () => true,
    onSetStatuses: async () => true,
    stateEngineContext,
    task: nextTask,
    taskHistory: [],
    taskTitle: "History modal regression",
    todayDateKey: "2026-09-23",
    ...extraProps,
  }));
}

test("TaskHistoryModal evaluates its statistics path without an unresolved identifier", () => {
  assert.doesNotThrow(() => renderToStaticMarkup(createElement(TaskHistoryModal, {
    onClose: () => undefined,
    onRenameTaskTitle: () => true,
    onSetStatuses: async () => true,
    task,
    taskHistory: [],
    taskTitle: "History modal regression",
    todayDateKey: "2026-09-23",
  })));
});

test("active canonical Task with a schedule projection continues through direct Calendar authority", () => {
  assert.doesNotThrow(() => renderModal({ ...task, ...canonicalAuthority, canonical_schedule_boundary: scheduleBoundary }));
  assert.match(taskHistoryModalSource, /!isMissingActiveCanonicalScheduleBoundary/);
});

test("active canonical Task without a schedule projection renders recoverable authority-unavailable UI", () => {
  assert.doesNotThrow(() => renderModal({ ...task, ...canonicalAuthority }, {
    onRefreshTaskAuthority: async () => true,
  }));
  assert.match(taskHistoryModalSource, /Task schedule authority is refreshing\. Refresh and try again\./);
  assert.match(taskHistoryModalSource, /Refresh Task/);
  assert.match(taskHistoryModalSource, /<button[^>]+onClick=\{onClose\}/);
  assert.match(taskHistoryModalSource, /if \(!calendarReadInput\) return null/);
  assert.doesNotMatch(taskHistoryModalSource, /compatibility.*fallback/i);
});

test("missing-boundary defense does not replace archived Task compatibility behavior", () => {
  assert.doesNotThrow(() => renderModal({
    ...task,
    ...canonicalAuthority,
    container_state: "archived",
  }));
});
