import test from "node:test";
import assert from "node:assert/strict";
import { buildTaskHistoryFacts } from "../src/lib/task-history.ts";
import { buildManualMembershipMap, evaluateTaskListMemberships, getBuiltInTaskLists, parseTaskListRules, taskBelongsToList } from "../src/lib/task-lists.ts";
import { createTask, getTaskBucket } from "../src/lib/task-buckets.ts";

function createTaskListEvaluationContext(
  overrides: Partial<Parameters<typeof evaluateTaskListMemberships>[2]> = {},
): Parameters<typeof evaluateTaskListMemberships>[2] {
  return {
    currentStreakByTaskId: {},
    focusedTaskIds: new Set<string>(),
    hasStepsByTaskId: {},
    historyFactsByTaskId: {},
    isDueToday: (date) => date === "2026-06-24",
    isDueTomorrow: (date) => date === "2026-06-25",
    isLater: (date) => Boolean(date && date > "2026-06-24"),
    isOpen: (candidate) => candidate.status !== "done" && candidate.status !== "did_my_best" && candidate.status !== "archived" && candidate.status !== "trashed",
    isOverdue: (date) => Boolean(date && date < "2026-06-24"),
    manualMembershipsByTaskId: {},
    taskHistoryByTaskId: {},
    todayDateKey: "2026-06-24",
    ...overrides,
  };
}

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
    isOpen: (candidate) => candidate.status !== "done" && candidate.status !== "did_my_best" && candidate.status !== "archived" && candidate.status !== "trashed",
    isOverdue: (date) => Boolean(date && date < new Date().toISOString().slice(0, 10)),
    manualMembershipsByTaskId,
    taskHistoryByTaskId: {},
    todayDateKey: new Date().toISOString().slice(0, 10),
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

test("built-in task lists include Routine as a persisted manual system list", () => {
  const routineList = getBuiltInTaskLists().find((list) => list.id === "routine") ?? null;

  assert.ok(routineList);
  assert.equal(routineList?.membershipMode, "manual");
  assert.equal(routineList?.type, "system");
  assert.equal(routineList?.name, "Routine");
});

test("inbox saved due-empty rule constrains both bulk and direct membership checks", () => {
  const datedTask = createTask({
    created_at: "2026-06-24T09:00:00.000Z",
    due_on: "2026-06-24",
    id: "task-inbox-dated",
    sort_order: 1,
    status: "pending",
    title: "Inbox task with due date",
  });
  const undatedTask = createTask({
    created_at: "2026-06-24T09:05:00.000Z",
    id: "task-inbox-undated",
    sort_order: 2,
    status: "pending",
    title: "Inbox task without due date",
  });
  const lists = getBuiltInTaskLists().map((list) =>
    list.id === "inbox"
      ? {
        ...list,
        rules: {
          rules: [{ rule: { field: "due", op: "is_empty" } }],
        },
      }
      : list,
  );
  const context = createTaskListEvaluationContext();

  const datedMemberships = evaluateTaskListMemberships(datedTask, lists, context);
  const undatedMemberships = evaluateTaskListMemberships(undatedTask, lists, context);

  assert.equal(datedMemberships.some((membership) => membership.id === "inbox"), false);
  assert.equal(undatedMemberships.some((membership) => membership.id === "inbox"), true);
  assert.equal(taskBelongsToList(datedTask, "inbox", lists, context), false);
  assert.equal(taskBelongsToList(undatedTask, "inbox", lists, context), true);
});

test("inbox saved rules still respect built-in inbox exclusion and manual membership exclusion", () => {
  const urgentTask = createTask({
    created_at: "2026-06-24T10:00:00.000Z",
    id: "task-inbox-urgent",
    is_urgent: true,
    sort_order: 1,
    status: "pending",
    title: "Urgent task",
  });
  const manualTask = createTask({
    created_at: "2026-06-24T10:05:00.000Z",
    id: "task-inbox-manual",
    sort_order: 2,
    status: "pending",
    title: "Manual list task",
  });
  const lists = getBuiltInTaskLists().map((list) =>
    list.id === "inbox"
      ? {
        ...list,
        rules: {
          rules: [{ rule: { field: "due", op: "is_empty" } }],
        },
      }
      : list,
  );
  const context = createTaskListEvaluationContext({
    manualMembershipsByTaskId: buildManualMembershipMap([
      {
        created_at: "2026-06-24T10:10:00.000Z",
        id: "membership-inbox-1",
        list_id: "later",
        task_id: manualTask.id,
        user_id: "test-user",
      },
    ]),
  });

  const urgentMemberships = evaluateTaskListMemberships(urgentTask, lists, context);
  const manualMemberships = evaluateTaskListMemberships(manualTask, lists, context);

  assert.equal(urgentMemberships.some((membership) => membership.id === "inbox"), false);
  assert.equal(manualMemberships.some((membership) => membership.id === "inbox"), false);
  assert.equal(taskBelongsToList(urgentTask, "inbox", lists, context), false);
  assert.equal(taskBelongsToList(manualTask, "inbox", lists, context), false);
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
    isOpen: (candidate) => candidate.status !== "done" && candidate.status !== "did_my_best" && candidate.status !== "archived" && candidate.status !== "trashed",
    isOverdue: (date) => Boolean(date && date < "2026-05-20"),
    manualMembershipsByTaskId,
    taskHistoryByTaskId: {},
    todayDateKey: "2026-05-20",
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
    isOpen: (candidate) => candidate.status !== "done" && candidate.status !== "did_my_best" && candidate.status !== "archived" && candidate.status !== "trashed",
    isOverdue: (date) => Boolean(date && date < "2026-06-12"),
    manualMembershipsByTaskId: {},
    taskHistoryByTaskId: {
      [task.id]: [
        {
          created_at: "2026-06-10T09:00:00.000Z",
          entry_date: "2026-06-10",
          id: "history-1",
          status: "did_my_best",
          task_id: task.id,
          updated_at: "2026-06-10T09:00:00.000Z",
          user_id: "test-user",
          was_completed: true,
          counted_as_due_occurrence: false,
          event_type: "status",
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
          counted_as_due_occurrence: false,
          event_type: "status",
        },
      ],
    },
    todayDateKey: "2026-06-12",
  });

  assert.equal(memberships.some((membership) => membership.id === "list:history-window"), false);
  assert.equal(memberships.some((membership) => membership.id === "list:missed-window"), true);
});

test("history-status smart lists use today/current-occurrence history instead of stale raw status", () => {
  const staleMissedTask = createTask({
    created_at: "2026-06-01T09:00:00.000Z",
    due_on: "2026-06-20",
    id: "task-stale-missed",
    repeat_frequency: "none",
    sort_order: 1,
    status: "missed",
    title: "Stale missed task",
  });
  const recurringDoneTask = createTask({
    created_at: "2026-06-01T09:05:00.000Z",
    due_on: "2026-06-20",
    id: "task-recurring-done",
    repeat_frequency: "daily",
    repeat_interval: 1,
    sort_order: 2,
    status: "pending",
    title: "Recurring done task",
  });
  const lists = [
    ...getBuiltInTaskLists(),
    {
      description: "",
      id: "list:exclude-missed-today",
      isDeletable: true,
      isEditable: true,
      isVisible: true,
      membershipMode: "rules" as const,
      name: "Exclude Missed Today",
      rules: {
        rules: [{ rule: { field: "history_status", op: "is_not", value: "missed_today" } }],
      },
      sortOrder: 101,
      type: "custom" as const,
    },
    {
      description: "",
      id: "list:done-today",
      isDeletable: true,
      isEditable: true,
      isVisible: true,
      membershipMode: "rules" as const,
      name: "Done Today",
      rules: {
        rules: [{ rule: { field: "history_status", op: "is", value: "done_today" } }],
      },
      sortOrder: 102,
      type: "custom" as const,
    },
  ];
  const taskHistoryByTaskId = {
    [staleMissedTask.id]: [
      {
        counted_as_due_occurrence: false,
        created_at: "2026-06-20T09:00:00.000Z",
        entry_date: "2026-06-20",
        event_type: "status" as const,
        id: "stale-missed-history",
        status: "missed" as const,
        task_id: staleMissedTask.id,
        updated_at: "2026-06-20T09:00:00.000Z",
        user_id: "test-user",
        was_completed: false,
      },
    ],
    [recurringDoneTask.id]: [
      {
        counted_as_due_occurrence: false,
        created_at: "2026-06-20T09:05:00.000Z",
        entry_date: "2026-06-20",
        event_type: "status" as const,
        id: "recurring-done-history",
        status: "done" as const,
        task_id: recurringDoneTask.id,
        updated_at: "2026-06-20T09:05:00.000Z",
        user_id: "test-user",
        was_completed: true,
      },
    ],
  };
  const historyFactsByTaskId = {
    [staleMissedTask.id]: buildTaskHistoryFacts(taskHistoryByTaskId[staleMissedTask.id], "2026-06-24"),
    [recurringDoneTask.id]: buildTaskHistoryFacts(taskHistoryByTaskId[recurringDoneTask.id], "2026-06-24"),
  };
  const context = createTaskListEvaluationContext({
    historyFactsByTaskId,
    taskHistoryByTaskId,
    todayDateKey: "2026-06-24",
  });

  const staleMissedMemberships = evaluateTaskListMemberships(staleMissedTask, lists, context);
  const recurringDoneMemberships = evaluateTaskListMemberships(recurringDoneTask, lists, context);

  assert.equal(staleMissedMemberships.some((membership) => membership.id === "list:exclude-missed-today"), true);
  assert.equal(recurringDoneMemberships.some((membership) => membership.id === "list:done-today"), true);
});

test("normal status smart lists use visible current status and keep history-status logic separate", () => {
  const recurringPendingTask = createTask({
    created_at: "2026-06-01T09:00:00.000Z",
    due_on: "2026-06-24",
    id: "task-recurring-visible-pending",
    repeat_frequency: "daily",
    repeat_interval: 1,
    sort_order: 1,
    status: "not_due",
    title: "Recurring visible pending task",
  });
  const recurringDoneTodayTask = createTask({
    created_at: "2026-06-01T09:02:00.000Z",
    due_on: "2026-06-24",
    id: "task-recurring-done-today",
    repeat_frequency: "daily",
    repeat_interval: 1,
    sort_order: 2,
    status: "pending",
    title: "Recurring done today task",
  });
  const recurringOlderDoneTask = createTask({
    created_at: "2026-06-01T09:03:00.000Z",
    due_on: "2026-06-24",
    id: "task-recurring-older-done",
    repeat_frequency: "daily",
    repeat_interval: 1,
    sort_order: 3,
    status: "pending",
    title: "Recurring older done task",
  });
  const inProgressTask = createTask({
    created_at: "2026-06-01T09:05:00.000Z",
    due_on: "2026-06-24",
    id: "task-in-progress",
    repeat_frequency: "daily",
    repeat_interval: 1,
    sort_order: 4,
    status: "in_progress",
    title: "In progress task",
  });
  const rolledForwardDoneTodayTask = createTask({
    created_at: "2026-06-01T09:06:00.000Z",
    due_on: "2026-06-25",
    id: "task-rolled-forward-done-today",
    repeat_frequency: "daily",
    repeat_interval: 1,
    sort_order: 5,
    status: "upcoming",
    title: "Rolled forward done today task",
  });
  const rolledForwardMissedTodayTask = createTask({
    created_at: "2026-06-01T09:07:00.000Z",
    due_on: "2026-06-25",
    id: "task-rolled-forward-missed-today",
    repeat_frequency: "daily",
    repeat_interval: 1,
    sort_order: 6,
    status: "upcoming",
    title: "Rolled forward missed today task",
  });
  const lists = [
    ...getBuiltInTaskLists(),
    {
      description: "",
      id: "list:due-pending",
      isDeletable: true,
      isEditable: true,
      isVisible: true,
      membershipMode: "rules" as const,
      name: "Due Pending",
      rules: {
        rules: [
          { rule: { field: "due", op: "is_today" } },
          { connector: "and", rule: { field: "status", op: "is", value: ["pending"] } },
        ],
      },
      sortOrder: 103,
      type: "custom" as const,
    },
    {
      description: "",
      id: "list:due-pending-or-progress",
      isDeletable: true,
      isEditable: true,
      isVisible: true,
      membershipMode: "rules" as const,
      name: "Due Pending Or Progress",
      rules: {
        rules: [
          { rule: { field: "due", op: "is_today" } },
          { connector: "and", rule: { field: "status", op: "is", value: ["pending", "in_progress"] } },
        ],
      },
      sortOrder: 104,
      type: "custom" as const,
    },
    {
      description: "",
      id: "list:due-not-pending",
      isDeletable: true,
      isEditable: true,
      isVisible: true,
      membershipMode: "rules" as const,
      name: "Due Not Pending",
      rules: {
        rules: [
          { rule: { field: "due", op: "is_today" } },
          { connector: "and", rule: { field: "status", op: "is_not", value: ["pending"] } },
        ],
      },
      sortOrder: 105,
      type: "custom" as const,
    },
    {
      description: "",
      id: "list:history-done-today-only",
      isDeletable: true,
      isEditable: true,
      isVisible: true,
      membershipMode: "rules" as const,
      name: "History Done Today Only",
      rules: {
        rules: [{ rule: { field: "history_status", op: "is", value: "done_today" } }],
      },
      sortOrder: 106,
      type: "custom" as const,
    },
    {
      description: "",
      id: "list:status-done-only",
      isDeletable: true,
      isEditable: true,
      isVisible: true,
      membershipMode: "rules" as const,
      name: "Status Done Only",
      rules: {
        rules: [{ rule: { field: "status", op: "is", value: "done" } }],
      },
      sortOrder: 107,
      type: "custom" as const,
    },
    {
      description: "",
      id: "list:history-missed-today-only",
      isDeletable: true,
      isEditable: true,
      isVisible: true,
      membershipMode: "rules" as const,
      name: "History Missed Today Only",
      rules: {
        rules: [{ rule: { field: "history_status", op: "is", value: "missed_today" } }],
      },
      sortOrder: 108,
      type: "custom" as const,
    },
  ];
  const taskHistoryByTaskId = {
    [recurringPendingTask.id]: [],
    [recurringDoneTodayTask.id]: [
      {
        created_at: "2026-06-24T09:20:00.000Z",
        entry_date: "2026-06-24",
        event_type: null,
        id: "history-recurring-done-today",
        note: null,
        status: "done" as const,
        task_id: recurringDoneTodayTask.id,
        updated_at: "2026-06-24T09:20:00.000Z",
        user_id: "user-1",
        was_completed: true,
      },
    ],
    [recurringOlderDoneTask.id]: [
      {
        created_at: "2026-06-23T09:20:00.000Z",
        entry_date: "2026-06-23",
        event_type: null,
        id: "history-recurring-done-yesterday",
        note: null,
        status: "done" as const,
        task_id: recurringOlderDoneTask.id,
        updated_at: "2026-06-23T09:20:00.000Z",
        user_id: "user-1",
        was_completed: true,
      },
    ],
    [inProgressTask.id]: [],
    [rolledForwardDoneTodayTask.id]: [
      {
        created_at: "2026-06-24T09:25:00.000Z",
        entry_date: "2026-06-24",
        event_type: null,
        id: "history-rolled-forward-done-today",
        note: null,
        status: "done" as const,
        task_id: rolledForwardDoneTodayTask.id,
        updated_at: "2026-06-24T09:25:00.000Z",
        user_id: "user-1",
        was_completed: true,
      },
    ],
    [rolledForwardMissedTodayTask.id]: [
      {
        created_at: "2026-06-24T09:30:00.000Z",
        entry_date: "2026-06-24",
        event_type: null,
        id: "history-rolled-forward-missed-today",
        note: null,
        status: "missed" as const,
        task_id: rolledForwardMissedTodayTask.id,
        updated_at: "2026-06-24T09:30:00.000Z",
        user_id: "user-1",
        was_completed: false,
      },
    ],
  };
  const context = createTaskListEvaluationContext({
    historyFactsByTaskId: {
      [recurringDoneTodayTask.id]: buildTaskHistoryFacts(taskHistoryByTaskId[recurringDoneTodayTask.id], "2026-06-24"),
      [recurringOlderDoneTask.id]: buildTaskHistoryFacts(taskHistoryByTaskId[recurringOlderDoneTask.id], "2026-06-24"),
      [rolledForwardDoneTodayTask.id]: buildTaskHistoryFacts(taskHistoryByTaskId[rolledForwardDoneTodayTask.id], "2026-06-24"),
      [rolledForwardMissedTodayTask.id]: buildTaskHistoryFacts(taskHistoryByTaskId[rolledForwardMissedTodayTask.id], "2026-06-24"),
    },
    taskHistoryByTaskId,
  });

  const recurringPendingMemberships = evaluateTaskListMemberships(recurringPendingTask, lists, context);
  const recurringDoneTodayMemberships = evaluateTaskListMemberships(recurringDoneTodayTask, lists, context);
  const recurringOlderDoneMemberships = evaluateTaskListMemberships(recurringOlderDoneTask, lists, context);
  const inProgressMemberships = evaluateTaskListMemberships(inProgressTask, lists, context);
  const rolledForwardDoneTodayMemberships = evaluateTaskListMemberships(rolledForwardDoneTodayTask, lists, context);
  const rolledForwardMissedTodayMemberships = evaluateTaskListMemberships(rolledForwardMissedTodayTask, lists, context);

  assert.equal(recurringPendingMemberships.some((membership) => membership.id === "list:due-pending"), true);
  assert.equal(recurringPendingMemberships.some((membership) => membership.id === "list:due-pending-or-progress"), true);
  assert.equal(recurringPendingMemberships.some((membership) => membership.id === "list:due-not-pending"), false);
  assert.equal(recurringPendingMemberships.some((membership) => membership.id === "list:history-done-today-only"), false);
  assert.equal(recurringDoneTodayMemberships.some((membership) => membership.id === "list:due-pending"), false);
  assert.equal(recurringDoneTodayMemberships.some((membership) => membership.id === "list:history-done-today-only"), true);
  assert.equal(recurringOlderDoneMemberships.some((membership) => membership.id === "list:due-pending"), true);
  assert.equal(recurringOlderDoneMemberships.some((membership) => membership.id === "list:history-done-today-only"), false);
  assert.equal(inProgressMemberships.some((membership) => membership.id === "list:due-pending"), false);
  assert.equal(inProgressMemberships.some((membership) => membership.id === "list:due-pending-or-progress"), true);
  assert.equal(inProgressMemberships.some((membership) => membership.id === "list:due-not-pending"), true);
  assert.equal(rolledForwardDoneTodayMemberships.some((membership) => membership.id === "list:status-done-only"), false);
  assert.equal(rolledForwardDoneTodayMemberships.some((membership) => membership.id === "list:history-done-today-only"), true);
  assert.equal(rolledForwardMissedTodayMemberships.some((membership) => membership.id === "missed"), false);
  assert.equal(rolledForwardMissedTodayMemberships.some((membership) => membership.id === "list:history-missed-today-only"), true);
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
    isOpen: (candidate) => candidate.status !== "done" && candidate.status !== "did_my_best" && candidate.status !== "archived" && candidate.status !== "trashed",
    isOverdue: (date) => Boolean(date && date < "2026-06-12"),
    manualMembershipsByTaskId: {},
    taskHistoryByTaskId: {
      [task.id]: [
        {
          created_at: "2026-06-12T09:00:00.000Z",
          entry_date: "2026-06-12",
          id: "history-closed-1",
          status: "done",
          task_id: task.id,
          updated_at: "2026-06-12T09:00:00.000Z",
          user_id: "test-user",
          was_completed: true,
          counted_as_due_occurrence: false,
          event_type: "status",
        },
      ],
    },
    todayDateKey: "2026-06-12",
  });

  assert.equal(memberships.some((membership) => membership.id === "list:completed-today"), true);
});
