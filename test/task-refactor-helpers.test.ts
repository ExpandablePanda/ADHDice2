import test from "node:test";
import assert from "node:assert/strict";
import { createTask } from "../src/lib/task-buckets.ts";
import {
  isMissingParentSubtaskColumnError,
  isMissingTaskActualSecondsColumnError,
  isMissingTaskEnergyNoneEnumError,
  isMissingTaskListManualMembershipsTableError,
  isMissingTaskListsTableError,
} from "../src/lib/task-db-compat.ts";
import { isProbablyValidUrl, parseTagList } from "../src/lib/task-input-parsing.ts";
import { calcNextDueDate, formatRepeatSummary, resolveRecurringLiveStatusFromNextDueDate } from "../src/lib/task-repeat.ts";
import { formatTaskMetaLine } from "../src/lib/task-formatting.ts";
import { isValidDateKey, normalizeTaskFocusIds } from "../src/lib/task-focus-days.ts";
import { normalizeLogoSrc } from "../src/lib/profile-store.ts";
import { buildAgentPlanTaskItem } from "../src/lib/task-agent-plan.ts";
import { buildTaskTableRow } from "../src/lib/task-table-row.ts";
import { matchesTaskListRules } from "../src/lib/task-lists.ts";
import { buildFocusLabelOptions } from "../src/lib/task-focus-labels.ts";
import { buildWidgetTypeGuard, parseTaskGridLayoutJson } from "../src/lib/task-grid-parser.ts";
import { mapTaskListManualMembershipRow } from "../src/lib/task-list-mappers.ts";
import { getNextPendingSubtask } from "../src/lib/task-subtasks.ts";

test("db compat helpers match expected schema fallback errors", () => {
  assert.equal(isMissingParentSubtaskColumnError("parent_subtask_id adhdice_task_subtasks schema cache"), true);
  assert.equal(isMissingTaskListsTableError("adhdice_task_lists schema cache"), true);
  assert.equal(isMissingTaskListManualMembershipsTableError("adhdice_task_list_manual_memberships schema cache"), true);
  assert.equal(isMissingTaskEnergyNoneEnumError("adhdice_clean_task_energy invalid input value for enum \"none\""), true);
  assert.equal(isMissingTaskActualSecondsColumnError("actual_seconds adhdice_clean_tasks schema cache"), true);
});

test("focus-day helpers normalize valid UUID ids and date keys", () => {
  const ids = normalizeTaskFocusIds([
    "bad-id",
    "f61a2ef3-bb8d-44f9-bfb2-3bf07d493f43",
    "f61a2ef3-bb8d-44f9-bfb2-3bf07d493f43",
  ]);

  assert.deepEqual(ids, ["f61a2ef3-bb8d-44f9-bfb2-3bf07d493f43"]);
  assert.equal(isValidDateKey("2026-05-20"), true);
  assert.equal(isValidDateKey("2026/05/20"), false);
});

test("repeat helpers compute summaries and next due date", () => {
  const task = createTask({
    created_at: "2026-05-20T09:00:00.000Z",
    due_on: "2026-05-20",
    id: "task-repeat",
    repeat_days_of_week: [1, 3],
    repeat_frequency: "weekly",
    repeat_interval: 1,
    sort_order: 1,
    status: "pending",
    title: "Repeat",
  });

  assert.equal(formatRepeatSummary(task), "Weekly (Mon, Wed)");
  const nextDue = calcNextDueDate(task);
  assert.ok(nextDue);
});

test("repeat helpers resolve recurring live status from next due date and logical-day time", () => {
  const task = createTask({
    created_at: "2026-05-20T09:00:00.000Z",
    due_on: "2026-05-20",
    due_time: "21:00",
    id: "task-repeat-status",
    repeat_frequency: "daily",
    repeat_interval: 1,
    sort_order: 1,
    status: "done",
    title: "Repeat status",
  });

  assert.equal(
    resolveRecurringLiveStatusFromNextDueDate(task, {
      currentDayKey: "2026-05-21",
      dayStartTime: "06:00",
      nextDueDate: "2026-05-21",
      now: new Date("2026-05-21T18:00:00.000Z"),
      timezone: "UTC",
    }),
    "upcoming",
  );

  assert.equal(
    resolveRecurringLiveStatusFromNextDueDate(task, {
      currentDayKey: "2026-05-21",
      dayStartTime: "06:00",
      nextDueDate: "2026-05-22",
      now: new Date("2026-05-21T18:00:00.000Z"),
      timezone: "UTC",
    }),
    "not_due",
  );

  assert.equal(
    resolveRecurringLiveStatusFromNextDueDate(
      { due_time: "03:00" },
      {
        currentDayKey: "2026-05-21",
        dayStartTime: "06:00",
        nextDueDate: "2026-05-21",
        now: new Date("2026-05-22T02:30:00.000Z"),
        timezone: "UTC",
      },
    ),
    "upcoming",
  );

  assert.equal(
    resolveRecurringLiveStatusFromNextDueDate(
      { due_time: "23:00" },
      {
        currentDayKey: "2026-05-21",
        dayStartTime: "06:00",
        nextDueDate: "2026-05-21",
        now: new Date("2026-05-22T02:30:00.000Z"),
        timezone: "UTC",
      },
    ),
    "pending",
  );
});

test("task formatting and parsing helpers keep expected output", () => {
  const task = createTask({
    actual_seconds: 3600,
    created_at: "2026-05-20T09:00:00.000Z",
    due_on: "2026-05-20",
    due_time: "13:15",
    energy: "low",
    estimated_minutes: 30,
    id: "task-meta",
    is_important: true,
    sort_order: 1,
    status: "pending",
    title: "Meta",
  });

  const line = formatTaskMetaLine(task);
  assert.match(line, /energy/);
  assert.match(line, /important/);
  assert.match(line, /30 min/);

  assert.deepEqual(parseTagList("alpha, beta,alpha"), ["alpha", "beta"]);
  assert.equal(isProbablyValidUrl("https://example.com"), true);
  assert.equal(isProbablyValidUrl("ftp://example.com"), false);
});

test("profile helper normalizes basePath logo sources", () => {
  assert.equal(normalizeLogoSrc("/ADHDice2/logo.png"), "/logo.png");
  assert.equal(normalizeLogoSrc("data:image/png;base64,abc"), "data:image/png;base64,abc");
});

test("agent plan helper maps task to list row shape", () => {
  const task = createTask({
    created_at: "2026-05-20T09:00:00.000Z",
    id: "task-agent-row",
    sort_order: 1,
    status: "pending",
    title: "Agent row",
  });

  const row = buildAgentPlanTaskItem(task, {
    bucketContext: {
      focusedTaskIds: new Set<string>(),
      routing: {},
    },
    bucketLabels: { today: "Today", inbox: "Inbox", all: "All" },
    focusedTaskIdSet: new Set<string>(),
    linkedNotes: [],
    listDefinitions: [],
    listMemberships: [],
    subtasks: [],
  });

  assert.equal(row.id, "task-agent-row");
  assert.equal(row.title, "Agent row");
  assert.ok(Array.isArray(row.metadata));
});

test("task table row helper maps task directly to live table shape", () => {
  const task = createTask({
    actual_seconds: 600,
    created_at: "2026-05-20T09:00:00.000Z",
    due_on: "2026-05-20",
    energy: "medium",
    estimated_minutes: 25,
    external_link_label: "Spec",
    external_link_url: "https://example.com/spec",
    id: "task-table-row",
    is_important: true,
    repeat_frequency: "daily",
    sort_order: 1,
    status: "pending",
    tags: ["focus"],
    title: "Table row",
  });

  const row = buildTaskTableRow(task, {
    focusedTaskIdSet: new Set(["task-table-row"]),
    linkedNotes: [{ body: "", id: "note-1", linked_task_ids: [], title: "Note", updated_at: "2026-05-20T09:00:00.000Z" }],
    listDefinitions: [{
      description: "",
      id: "custom-list",
      isDeletable: true,
      isEditable: true,
      isVisible: true,
      membershipMode: "manual",
      name: "Custom",
      rules: null,
      sortOrder: 1,
      type: "custom",
    }],
    listMemberships: [{ id: "custom-list", isManual: true }],
    subtasks: [{
      created_at: "2026-05-20T09:00:00.000Z",
      id: "subtask-1",
      parent_subtask_id: null,
      sort_order: 1,
      status: "pending",
      task_id: "task-table-row",
      title: "Step",
      updated_at: "2026-05-20T09:00:00.000Z",
      user_id: "user-1",
    }],
    taskHistory: [],
    todayDateKey: "2026-05-20",
  });

  assert.equal(row.id, "task-table-row");
  assert.deepEqual(row.priorities, ["focus", "important"]);
  assert.deepEqual(row.lists, ["Custom"]);
  assert.equal(row.subtasks[0]?.title, "Step");
});

test("task list rule evaluation memoizes duplicate list references", () => {
  const task = createTask({
    created_at: "2026-05-20T09:00:00.000Z",
    energy: "low",
    id: "task-list-cache",
    sort_order: 1,
    status: "pending",
    title: "Cached list rule",
  });
  let isOpenChecks = 0;
  const lists = [
    {
      description: "",
      id: "list:target" as const,
      isDeletable: true,
      isEditable: true,
      isVisible: true,
      membershipMode: "rules" as const,
      name: "Target",
      rules: { rules: [{ rule: { field: "energy" as const, op: "is" as const, value: "low" as const } }] },
      sortOrder: 1,
      type: "custom" as const,
    },
  ];

  assert.equal(
    matchesTaskListRules(
      task,
      {
        rules: [
          { rule: { field: "list", op: "is", value: "list:target" } },
          { connector: "or", rule: { field: "list", op: "is", value: "list:target" } },
        ],
      },
      lists,
      {
        currentStreakByTaskId: {},
        focusedTaskIds: new Set<string>(),
        hasStepsByTaskId: {},
        isDueToday: () => false,
        isLater: () => false,
        isOpen: () => {
          isOpenChecks += 1;
          return true;
        },
        isOverdue: () => false,
        manualMembershipsByTaskId: {},
      },
    ),
    true,
  );
  assert.equal(isOpenChecks, 1);
});

test("grid parser helpers handle invalid and valid layout json", () => {
  const guard = buildWidgetTypeGuard({ urgent: "Urgent", import: "Import" } as const);
  const fallback = [{ h: 6, id: "fallback", type: "urgent" as const, w: 1, x: 0, y: 0 }];
  const parsed = parseTaskGridLayoutJson(
    JSON.stringify([{ id: "a", type: "urgent", h: 8, w: 2, x: 1, y: 3 }]),
    fallback,
    guard,
  );
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.id, "a");
  const invalid = parseTaskGridLayoutJson("{}", fallback, guard);
  assert.equal(invalid[0]?.id, "fallback");
});

test("focus label helper merges non-default category and history labels", () => {
  const options = buildFocusLabelOptions(
    [{
      color: "#000",
      dailyGoalSeconds: null,
      focusSubtype: "Creative",
      focusSubtype2: null,
      focusType: "Work",
      icon: "Code",
      id: "c1",
      title: "Deep Project",
      weeklyGoalSeconds: null,
    }],
    [{
      categoryId: "c1",
      date: "2026-05-20",
      durationSeconds: 1200,
      focusSubtype: "Shipped",
      focusSubtype2: null,
      focusType: "Work",
      id: "h1",
      notes: "",
      title: "Launch Work",
    }],
  );
  assert.ok(options.titles.includes("Deep Project"));
  assert.ok(options.titles.includes("Launch Work"));
});

test("list/subtask mapper helpers normalize ids and next open subtask", () => {
  const membership = mapTaskListManualMembershipRow({
    created_at: "2026-05-20T00:00:00.000Z",
    id: "m1",
    list_id: "custom-list",
    task_id: "task-1",
    user_id: "u1",
  });
  assert.equal(membership.list_id, "list:custom-list");

  const next = getNextPendingSubtask("task-1", {
    "task-1": [
      { id: "s1", parent_subtask_id: null, sort_order: 1, status: "done", task_id: "task-1", title: "done", user_id: "u1", created_at: "2026-05-20T00:00:00.000Z", updated_at: "2026-05-20T00:00:00.000Z" },
      { id: "s2", parent_subtask_id: null, sort_order: 2, status: "pending", task_id: "task-1", title: "next", user_id: "u1", created_at: "2026-05-20T00:00:00.000Z", updated_at: "2026-05-20T00:00:00.000Z" },
    ],
  });
  assert.equal(next?.id, "s2");
});
