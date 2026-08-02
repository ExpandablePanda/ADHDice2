import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

import { buildChildTaskPreviewLookup } from "../src/lib/task-app-derived.ts";
import { createTask } from "../src/lib/task-buckets.ts";
import type { Task } from "../src/lib/database.types.ts";

const jiti = createJiti(import.meta.url, {
  alias: { "@": path.resolve(process.cwd(), "src") },
  jsx: { runtime: "automatic" },
});
const { TaskManagementTableV2 } = await jiti.import<{ TaskManagementTableV2: (props: Record<string, unknown>) => unknown }>(
  "../src/components/ui/task-management-table-v2.tsx",
);

function task(id: string, overrides: Partial<Task> = {}) {
  return createTask({
    created_at: "2026-07-19T12:00:00.000Z",
    id,
    sort_order: 0,
    status: "pending",
    title: id,
    ...overrides,
  });
}

function row(source: Task) {
  return {
    actualSeconds: 0, completedAt: null, createdAt: source.created_at, currentStreak: 0, dueOn: "", dueTime: "", energy: "medium",
    estimatedMinutes: 20, id: source.id, lastDoneAt: null, lastDoneDate: null, linkLabel: "", linkUrl: "", linkedNotes: [], lists: [],
    missedStreak: 0, notes: "", pinOrder: null, pinnedAt: null, priorities: ["3"], repeat: "none", repeatDayOfMonth: null,
    repeatDaysOfWeek: [], repeatInterval: 1, repeatMonthlyMode: "day_of_month", repeatMonthlyOrdinal: null, repeatMonthlyWeekday: null,
    status: "pending", subtasks: [], subtasksAutoReset: false, tags: [], title: source.title, trashedAt: null, updatedAt: source.updated_at,
  };
}

function renderTable(options: {
  overlayOnly?: boolean;
  overlayNode?: ReturnType<typeof createElement>;
}) {
  const parent = task("qa-parent", { title: "Parent" });
  const step = task("qa-step", { parent_task_id: parent.id, title: "Step" });
  const substep = task("qa-substep", { parent_task_id: step.id, title: "Substep" });
  const sibling = task("qa-sibling", { title: "Sibling" });

  return renderToStaticMarkup(createElement(TaskManagementTableV2, {
    allowInlineInspector: true,
    childTaskPreviewByParentTaskId: buildChildTaskPreviewLookup([parent, step, substep]),
    overlayNode: options.overlayNode,
    overlayOnly: options.overlayOnly,
    rows: [row(parent), row(sibling)],
    searchMatchedStepParentTaskIds: [parent.id],
    showHeader: false,
    visibleColumns: ["title", "status"],
  }));
}

function captureKeyWarnings(render: () => string) {
  const originalConsoleError = console.error;
  const messages: string[] = [];
  console.error = (...args: unknown[]) => {
    messages.push(args.map(String).join(" "));
  };
  try {
    render();
  } finally {
    console.error = originalConsoleError;
  }
  return messages.filter((message) => /unique "key" prop|same key/i.test(message));
}

test("Table parent, expanded Step/Substep, editor, and overlay rows have stable sibling keys", () => {
  const normalWarnings = captureKeyWarnings(() => renderTable({
    overlayNode: createElement("div", { "data-test-overlay": true }, "Overlay"),
  }));
  const overlayWarnings = captureKeyWarnings(() => renderTable({
    overlayNode: createElement("div", { "data-test-overlay": true }, "Overlay"),
    overlayOnly: true,
  }));

  assert.deepEqual(normalWarnings, []);
  assert.deepEqual(overlayWarnings, []);
});
