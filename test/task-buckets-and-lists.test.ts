import test from "node:test";
import assert from "node:assert/strict";
import { buildTaskHistoryFacts } from "../src/lib/task-history.ts";
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
    currentStreakByTaskId: {},
    focusedTaskIds: new Set<string>(),
    hasStepsByTaskId: {},
    historyFactsByTaskId: {},
    isDueToday: (date) => date === new Date().toISOString().slice(0, 10),
    isDueTomorrow: (date) => date === "2999-01-01",
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
    rules: [{ connector: undefined, rule: { field: "date_added", op: "is_today" } }],
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
    currentStreakByTaskId: {},
    focusedTaskIds: new Set<string>(),
    hasStepsByTaskId: {},
    historyFactsByTaskId: {},
    isDueToday: (date) => date === "2026-05-20",
    isDueTomorrow: (date) => date === "2026-05-21",
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

test("task list evaluation matches saved-row history rules and due tomorrow", () => {
  const task = createTask({
    created_at: "2026-06-01T09:00:00.000Z",
    due_on: "2026-06-13",
    id: "task-history-rule",
    sort_order: 1,
    status: "pending",
    title: "History rule task",
  });
  const lists = [
    ...getBuiltInTaskLists(),
    {
      description: "",
      id: "list:history-window",
      isDeletable: true,
      isEditable: true,
      isVisible: true,
      membershipMode: "rules" as const,
      name: "History Window",
      rules: {
        rules: [
          { rule: { field: "completed_history", op: "within_last", value: "3" } },
          { connector: "and", rule: { field: "completed_streak", op: "at_least", value: "1" } },
          { connector: "and", rule: { field: "due", op: "is_tomorrow" } },
        ],
      },
      sortOrder: 99,
      type: "custom" as const,
    },
    {
      description: "",
      id: "list:missed-window",
      isDeletable: true,
      isEditable: true,
      isVisible: true,
      membershipMode: "rules" as const,
      name: "Missed Window",
      rules: {
        rules: [
          { rule: { field: "missed_history", op: "last_within_last", value: "3" } },
          { connector: "and", rule: { field: "missed_streak", op: "equals", value: "1" } },
        ],
      },
      sortOrder: 100,
      type: "custom" as const,
    },
  ];
  const historyFactsByTaskId = {
    [task.id]: buildTaskHistoryFacts([
      {
        created_at: "2026-06-10T09:00:00.000Z",
        entry_date: "2026-06-10",
        id: "history-1",
        status: "did_my_best",
        task_id: task.id,
        updated_at: "2026-06-10T09:00:00.000Z",
        user_id: "test-user",
        was_completed: true,
      },
      {
        created_at: "2026-06-12T09:00:00.000Z",
        entry_date: "2026-06-12",
        id: "history-2",
        status: "missed",
        task_id: task.id,
        updated_at: "2026-06-12T09:00:00.000Z",
        user_id: "test-user",
        was_completed: false,
      },
    ], "2026-06-12"),
  };

  const memberships = evaluateTaskListMemberships(task, lists, {
    currentStreakByTaskId: {},
    focusedTaskIds: new Set<string>(),
    hasStepsByTaskId: {},
    historyFactsByTaskId,
    isDueToday: (date) => date === "2026-06-12",
    isDueTomorrow: (date) => date === "2026-06-13",
    isLater: (date) => Boolean(date && date > "2026-06-12"),
    isOpen: (candidate) => candidate.status !== "done" && candidate.status !== "did_my_best" && candidate.status !== "archived",
    isOverdue: (date) => Boolean(date && date < "2026-06-12"),
    manualMembershipsByTaskId: {},
  });

  assert.equal(memberships.some((membership) => membership.id === "list:history-window"), false);
  assert.equal(memberships.some((membership) => membership.id === "list:missed-window"), true);
});

test("completed-history smart lists can include closed tasks from saved rows", () => {
  const task = createTask({
    created_at: "2026-06-01T09:00:00.000Z",
    id: "task-closed-history-rule",
    sort_order: 1,
    status: "done",
    title: "Closed history task",
  });
  const lists = [
    ...getBuiltInTaskLists(),
    {
      description: "",
      id: "list:completed-today",
      isDeletable: true,
      isEditable: true,
      isVisible: true,
      membershipMode: "rules" as const,
      name: "Completed Today",
      rules: {
        rules: [{ rule: { field: "completed_history", op: "is_today" } }],
      },
      sortOrder: 101,
      type: "custom" as const,
    },
  ];

  const memberships = evaluateTaskListMemberships(task, lists, {
    currentStreakByTaskId: {},
    focusedTaskIds: new Set<string>(),
    hasStepsByTaskId: {},
    historyFactsByTaskId: {
      [task.id]: buildTaskHistoryFacts([
        {
          created_at: "2026-06-12T09:00:00.000Z",
          entry_date: "2026-06-12",
          id: "history-closed-1",
          status: "done",
          task_id: task.id,
          updated_at: "2026-06-12T09:00:00.000Z",
          user_id: "test-user",
          was_completed: true,
        },
      ], "2026-06-12"),
    },
    isDueToday: (date) => date === "2026-06-12",
    isDueTomorrow: () => false,
    isLater: (date) => Boolean(date && date > "2026-06-12"),
    isOpen: (candidate) => candidate.status !== "done" && candidate.status !== "did_my_best" && candidate.status !== "archived",
    isOverdue: (date) => Boolean(date && date < "2026-06-12"),
    manualMembershipsByTaskId: {},
  });

  assert.equal(memberships.some((membership) => membership.id === "list:completed-today"), true);
});
