import test from "node:test";
import assert from "node:assert/strict";
import { buildManualMembershipMap, evaluateTaskListMemberships, getBuiltInTaskLists, parseTaskListRules } from "../src/lib/task-lists.ts";
import { createTask, getTaskBucket } from "../src/lib/task-buckets.ts";

test("task bucket logic keeps inbox and quick wins semantics", () => {
  const inboxTask = createTask({
    created_at: "2026-05-19T10:00:00.000Z",
    id: "task-inbox",
    sort_order: 1,
    status: "pending",
    title: "Inbox task",
  });
  const quickWinTask = createTask({
    created_at: "2026-05-19T11:00:00.000Z",
    energy: "low",
    estimated_minutes: 10,
    id: "task-quick",
    sort_order: 2,
    status: "pending",
    title: "Quick win",
  });

  assert.equal(getTaskBucket(inboxTask, { focusedTaskIds: new Set(), routing: {} }), "inbox");
  assert.equal(getTaskBucket(quickWinTask, { focusedTaskIds: new Set(), routing: { [quickWinTask.id]: "quick_wins" } }), "quick_wins");
});

test("task list evaluation honors manual memberships and date-added rules", () => {
  const task = createTask({
    created_at: `${new Date().toISOString().slice(0, 10)}T09:00:00.000Z`,
    id: "task-list",
    sort_order: 1,
    status: "pending",
    title: "Task list item",
  });

  const lists = getBuiltInTaskLists();
  const manualMembershipsByTaskId = buildManualMembershipMap([
    {
      created_at: "2026-05-19T09:00:00.000Z",
      id: "membership-1",
      list_id: "later",
      task_id: task.id,
      user_id: "test-user",
    },
  ]);
  const memberships = evaluateTaskListMemberships(task, lists, {
    focusedTaskIds: new Set<string>(),
    isDueToday: (date) => date === new Date().toISOString().slice(0, 10),
    isLater: (date) => Boolean(date && date > new Date().toISOString().slice(0, 10)),
    isOpen: (candidate) => candidate.status !== "done" && candidate.status !== "did_my_best" && candidate.status !== "archived",
    isOverdue: (date) => Boolean(date && date < new Date().toISOString().slice(0, 10)),
    manualMembershipsByTaskId,
  });

  assert.equal(memberships.some((membership) => membership.id === "later" && membership.isManual), true);

  const parsed = parseTaskListRules({
    combinator: "all",
    rules: [{ field: "date_added", op: "is_today" }],
  });
  assert.deepEqual(parsed, {
    combinator: "all",
    rules: [{ field: "date_added", op: "is_today" }],
  });
});

test("task list evaluation keeps manual memberships while applying rule memberships", () => {
  const task = createTask({
    created_at: "2026-05-19T09:00:00.000Z",
    due_on: "2026-05-20",
    id: "task-manual-and-rule",
    is_urgent: true,
    sort_order: 1,
    status: "pending",
    title: "Dual membership task",
  });

  const lists = getBuiltInTaskLists();
  const manualMembershipsByTaskId = buildManualMembershipMap([
    {
      created_at: "2026-05-20T09:30:00.000Z",
      id: "membership-manual-1",
      list_id: "later",
      task_id: task.id,
      user_id: "test-user",
    },
  ]);

  const memberships = evaluateTaskListMemberships(task, lists, {
    focusedTaskIds: new Set<string>(),
    isDueToday: (date) => date === "2026-05-20",
    isLater: (date) => Boolean(date && date > "2026-05-20"),
    isOpen: (candidate) => candidate.status !== "done" && candidate.status !== "did_my_best" && candidate.status !== "archived",
    isOverdue: (date) => Boolean(date && date < "2026-05-20"),
    manualMembershipsByTaskId,
  });

  assert.equal(memberships.some((membership) => membership.id === "later" && membership.isManual && membership.source === "manual"), true);
  assert.equal(memberships.some((membership) => membership.id === "urgent" && membership.source === "rule"), true);
});

test("manual membership compatibility routing does not add inbox entries", () => {
  const map = buildManualMembershipMap([], {
    "task-a": "inbox",
    "task-b": "today",
  });

  assert.deepEqual(map["task-a"], undefined);
  assert.deepEqual(map["task-b"], ["today"]);
});
