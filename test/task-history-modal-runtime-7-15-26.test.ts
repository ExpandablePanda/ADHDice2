import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TaskHistoryModal } from "../src/components/task-app/task-view-adapters.tsx";

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
