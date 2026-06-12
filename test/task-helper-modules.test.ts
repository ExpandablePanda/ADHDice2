import test from "node:test";
import assert from "node:assert/strict";
import { createTask } from "../src/lib/task-buckets.ts";
import { hasActiveTaskFilters, resetTaskFiltersPreservingView } from "../src/lib/task-filter-state.ts";
import {
  formatDueTimeLabel,
  getTaskDisplayStatus,
  getTaskDueDateBucket,
  getListPriorityLabel,
  matchesTaskQuickFilter,
} from "../src/lib/task-cockpit.ts";
import {
  getMomentumMetric,
  getNextMomentumView,
  updateFocusedTaskIdsByDate,
} from "../src/lib/task-momentum.ts";
import {
  buildTaskGridWidget,
  formatDateKey,
  getMissingTaskGridWidgetTypes,
  getSpanFromDisplayRows,
  moveTaskGridItem,
  normalizeTaskGridLayout,
  reorderTaskGridItems,
  shiftDateKey,
} from "../src/lib/task-grid-layout.ts";
import { parseImportedTaskLines } from "../src/lib/task-input-parsing.ts";
import {
  analyzeTaskUpdateReapplySafety,
  buildTaskUpdateConflictMessage,
  deleteTaskRow,
  updateTaskRowWithLegacyEnergyFallback,
} from "../src/lib/task-db-mutations.ts";
import {
  buildTaskTree,
  detectTaskHierarchyIssues,
  getTaskAncestors,
  getTaskDescendants,
  groupTasksByParentId,
  isChildTask,
  isTopLevelTask,
  sortTaskSiblings,
} from "../src/lib/task-hierarchy.ts";
import { buildTaskCollections } from "../src/lib/task-selectors.ts";
import { DEFAULT_TASK_UI_STATE } from "../src/lib/task-ui-state.ts";
import { buildTaskListCounts, getBuiltInTaskLists } from "../src/lib/task-lists.ts";

test("filter state helpers detect active filters and preserve key UI state on reset", () => {
  const activeState = {
    ...DEFAULT_TASK_UI_STATE,
    search: "invoice",
    selectedBucket: "later",
    view: "matrix" as const,
  };

  assert.equal(hasActiveTaskFilters(DEFAULT_TASK_UI_STATE), false);
  assert.equal(hasActiveTaskFilters(activeState), true);

  const reset = resetTaskFiltersPreservingView(activeState);
  assert.equal(reset.search, "");
  assert.equal(reset.selectedBucket, "later");
  assert.equal(reset.view, "matrix");
});

test("task selectors build expected filtered collections and list memberships", () => {
  const today = formatDateKey(new Date());
  const openTask = createTask({
    created_at: `${today}T09:00:00.000Z`,
    due_on: today,
    energy: "low",
    id: "task-open",
    sort_order: 1,
    status: "pending",
    title: "Open",
  });
  const doneTask = createTask({
    created_at: `${today}T10:00:00.000Z`,
    id: "task-done",
    sort_order: 2,
    status: "done",
    title: "Done",
  });

  const collections = buildTaskCollections(
    [openTask, doneTask],
    {
      "task-open": [{ id: "inbox" }, { id: "quick_wins" }],
      "task-done": [{ id: "completed" }],
    },
    ["task-open"],
  );

  assert.equal(collections.filteredActiveTasks.length, 1);
  assert.equal(collections.filteredDoneTasks.length, 1);
  assert.equal(collections.filteredFocusTasks.length, 1);
  assert.equal(collections.filteredLowEnergyTasks.length, 1);
  assert.equal(collections.inboxTasks.length, 1);
  assert.equal(collections.quickWinTasks.length, 1);
});

test("momentum helpers cycle view, update day buckets, and compute metrics", () => {
  const today = formatDateKey(new Date());
  const doneFocused = createTask({
    created_at: `${today}T08:00:00.000Z`,
    due_on: today,
    id: "task-focus-done",
    sort_order: 1,
    status: "done",
    title: "Focused done",
  });
  const openFocused = createTask({
    created_at: `${today}T09:00:00.000Z`,
    due_on: today,
    id: "task-focus-open",
    sort_order: 2,
    status: "pending",
    title: "Focused open",
  });

  assert.equal(getNextMomentumView("urgent"), "today");
  assert.equal(getNextMomentumView("today"), "focus");
  assert.equal(getNextMomentumView("focus"), "urgent");

  const updated = updateFocusedTaskIdsByDate({}, today, ["task-focus-open"]);
  assert.deepEqual(updated[today], ["task-focus-open"]);

  const metric = getMomentumMetric({
    doneTasks: [doneFocused],
    focusedTaskIds: ["task-focus-done", "task-focus-open"],
    tasks: [doneFocused, openFocused],
    todayTasks: [openFocused],
    urgentTasks: [],
  }, "focus");

  assert.equal(metric.totalCount, 2);
  assert.equal(metric.doneTasks.length, 1);
});

test("cockpit helpers format metadata and evaluate quick filters", () => {
  const today = formatDateKey(new Date());
  const task = createTask({
    created_at: `${today}T07:00:00.000Z`,
    due_on: today,
    id: "task-cockpit",
    is_urgent: true,
    sort_order: 1,
    status: "pending",
    title: "Cockpit",
  });

  assert.equal(formatDueTimeLabel("13:05"), "1:05 PM");
  assert.equal(matchesTaskQuickFilter(task, "today", []), true);
  assert.equal(matchesTaskQuickFilter(task, "urgent", []), true);
  assert.equal(getListPriorityLabel(task, new Set<string>()), "Urgent");
});

test("date bucket helpers classify due_on windows and normalize stale future statuses", () => {
  const today = formatDateKey(new Date());
  const tomorrow = shiftDateKey(today, 1);
  const sevenDaysOut = shiftDateKey(today, 7);
  const eightDaysOut = shiftDateKey(today, 8);
  const yesterday = shiftDateKey(today, -1);

  const todayTask = createTask({
    created_at: `${today}T07:30:00.000Z`,
    due_on: today,
    id: "task-due-today",
    sort_order: 11,
    status: "not_due",
    title: "Due today",
  });
  const tomorrowTask = createTask({
    created_at: `${today}T07:31:00.000Z`,
    due_on: tomorrow,
    id: "task-due-tomorrow",
    sort_order: 12,
    status: "not_due",
    title: "Due tomorrow",
  });
  const sevenDaysTask = createTask({
    created_at: `${today}T07:32:00.000Z`,
    due_on: sevenDaysOut,
    id: "task-due-seven-days",
    sort_order: 13,
    status: "not_due",
    title: "Due in seven days",
  });
  const eightDaysTask = createTask({
    created_at: `${today}T07:33:00.000Z`,
    due_on: eightDaysOut,
    id: "task-due-eight-days",
    sort_order: 14,
    status: "upcoming",
    title: "Due in eight days",
  });
  const overdueTask = createTask({
    created_at: `${today}T07:34:00.000Z`,
    due_on: yesterday,
    id: "task-overdue",
    sort_order: 15,
    status: "not_due",
    title: "Overdue task",
  });
  const noDueDateTask = createTask({
    created_at: `${today}T07:35:00.000Z`,
    id: "task-no-due-date",
    sort_order: 16,
    status: "upcoming",
    title: "No due date task",
  });

  assert.equal(getTaskDueDateBucket(todayTask), "today");
  assert.equal(getTaskDueDateBucket(tomorrowTask), "upcoming");
  assert.equal(getTaskDueDateBucket(sevenDaysTask), "upcoming");
  assert.equal(getTaskDueDateBucket(eightDaysTask), "not_due");
  assert.equal(getTaskDueDateBucket(overdueTask), "overdue");
  assert.equal(getTaskDueDateBucket(noDueDateTask), "none");

  assert.equal(getTaskDisplayStatus(todayTask), "pending");
  assert.equal(getTaskDisplayStatus(tomorrowTask), "upcoming");
  assert.equal(getTaskDisplayStatus(sevenDaysTask), "upcoming");
  assert.equal(getTaskDisplayStatus(eightDaysTask), "not_due");
  assert.equal(getTaskDisplayStatus(overdueTask), "missed");
  assert.equal(getTaskDisplayStatus(noDueDateTask), "not_due");
});

test("grid layout helpers normalize, reorder, move, and date utilities behave consistently", () => {
  const isWidgetType = (value: string): value is "urgent" | "import" => value === "urgent" || value === "import";
  const layout = normalizeTaskGridLayout([
    { h: 7, id: "a", type: "urgent", w: 2, x: 0, y: 0 },
    { h: 6, id: "b", type: "import", w: 2, x: 0, y: 0 },
  ], isWidgetType, 4, 24);
  assert.equal(layout.length, 2);
  assert.equal(layout[0]?.x, 0);
  assert.equal(layout[1]?.x, 2);

  const reordered = reorderTaskGridItems(layout, "a", "b", isWidgetType, 4, 24);
  assert.equal(reordered[0]?.id, "b");

  const moved = moveTaskGridItem(reordered, "a", "up", isWidgetType, 4, 24);
  assert.equal(moved[0]?.id, "a");

  const nextWidget = buildTaskGridWidget("urgent", "grid-urgent-id");
  assert.equal(nextWidget.w, 2);
  assert.equal(nextWidget.id, "grid-urgent-id");

  const missing = getMissingTaskGridWidgetTypes(layout, ["urgent", "import"]);
  assert.deepEqual(missing, []);

  assert.equal(getSpanFromDisplayRows(2, 24), 4);
  assert.equal(shiftDateKey("2026-05-20", 1), "2026-05-21");
});

test("task list counts preserve built-in bucket memberships", () => {
  const today = formatDateKey(new Date());
  const inboxTask = createTask({
    created_at: `${today}T08:00:00.000Z`,
    id: "task-inbox",
    sort_order: 1,
    status: "pending",
    title: "Inbox task",
  });
  const todayTask = createTask({
    created_at: `${today}T09:00:00.000Z`,
    due_on: today,
    id: "task-today",
    sort_order: 2,
    status: "pending",
    title: "Today task",
  });

  const counts = buildTaskListCounts([inboxTask, todayTask], getBuiltInTaskLists(), {
    currentStreakByTaskId: {},
    focusedTaskIds: new Set<string>(),
    hasStepsByTaskId: {},
    historyFactsByTaskId: {},
    isDueToday: (date) => date === today,
    isLater: () => false,
    isOpen: (task) => task.status === "pending" || task.status === "in_progress",
    isOverdue: () => false,
    manualMembershipsByTaskId: {},
  });

  assert.equal(counts.inbox, 1);
  assert.equal(counts.today, 1);
});

test("import parser captures parent metadata and nested steps", () => {
  const parsed = parseImportedTaskLines([
    "Clean Ears #hygiene *due-Today *repeat-Daily",
    "Moisturize",
    "-AM",
    "--Face",
    "--Feet",
    "-PM",
  ], { todayDateKey: "2026-06-10" });

  assert.equal(parsed.tasks.length, 2);
  assert.equal(parsed.tasks[0]?.title, "Clean Ears");
  assert.deepEqual(parsed.tasks[0]?.tags, ["hygiene"]);
  assert.equal(parsed.tasks[0]?.dueOn, "2026-06-10");
  assert.equal(parsed.tasks[0]?.repeatFrequency, "daily");
  assert.equal(parsed.tasks[1]?.subtasks[0]?.title, "AM");
  assert.equal(parsed.tasks[1]?.subtasks[0]?.children[0]?.title, "Face");
  assert.equal(parsed.tasks[1]?.subtasks[0]?.children[1]?.title, "Feet");
  assert.equal(parsed.tasks[1]?.subtasks[1]?.title, "PM");
});

test("import parser preserves step status and warns on unsupported step metadata", () => {
  const parsed = parseImportedTaskLines([
    "Clean Bathroom #home *due-Today",
    "-Sink #cleaning *estimate-5m *status-InProgress",
    "-Floor *due-Tomorrow",
  ], { todayDateKey: "2026-06-10" });

  assert.equal(parsed.tasks.length, 1);
  assert.equal(parsed.tasks[0]?.subtasks[0]?.title, "Sink");
  assert.equal(parsed.tasks[0]?.subtasks[0]?.status, "in_progress");
  assert.match(parsed.warnings.map((warning) => warning.message).join("\n"), /do not currently persist tags/i);
  assert.match(parsed.warnings.map((warning) => warning.message).join("\n"), /do not currently persist estimated time/i);
  assert.match(parsed.warnings.map((warning) => warning.message).join("\n"), /do not currently persist due dates/i);
});

test("import parser warns on orphan steps and unknown metadata", () => {
  const parsed = parseImportedTaskLines([
    "-Orphan step",
    "Task title *mood-Happy",
  ], { todayDateKey: "2026-06-10" });

  assert.equal(parsed.tasks.length, 1);
  assert.match(parsed.warnings.map((warning) => warning.message).join("\n"), /no parent task above it/i);
  assert.match(parsed.warnings.map((warning) => warning.message).join("\n"), /unknown metadata field "mood"/i);
});

test("task update conflict helpers only auto-reapply low-risk untouched fields", () => {
  const baseTask = createTask({
    created_at: "2026-06-11T12:00:00.000Z",
    id: "task-conflict",
    notes: "base notes",
    revision: 3,
    sort_order: 1,
    status: "pending",
    title: "Base title",
  });
  const latestTask = {
    ...baseTask,
    energy: "high" as const,
    revision: 4,
  };

  const safePlan = analyzeTaskUpdateReapplySafety(baseTask, latestTask, { title: "Retitled" });
  assert.equal(safePlan.canAutoReapply, true);
  assert.deepEqual(safePlan.conflictingFields, []);

  const sameFieldConflictPlan = analyzeTaskUpdateReapplySafety(
    baseTask,
    { ...latestTask, title: "Remote title" },
    { title: "Local title" },
  );
  assert.equal(sameFieldConflictPlan.canAutoReapply, false);
  assert.equal(sameFieldConflictPlan.reason, "same_field_changed_remotely");
  assert.deepEqual(sameFieldConflictPlan.conflictingFields, ["title"]);

  const highRiskPlan = analyzeTaskUpdateReapplySafety(baseTask, latestTask, { status: "done" });
  assert.equal(highRiskPlan.canAutoReapply, false);
  assert.equal(highRiskPlan.reason, "high_risk_patch");
  assert.deepEqual(highRiskPlan.conflictingFields, ["status"]);

  assert.match(
    buildTaskUpdateConflictMessage({
      attemptedReapply: false,
      conflictingFields: ["status"],
      latestTask,
      reason: "high_risk_patch",
    }),
    /higher-risk fields/i,
  );
});

test("task hierarchy helpers identify roots, children, ancestry, descendants, and invalid links", () => {
  const tasks = [
    createTask({
      created_at: "2026-06-11T08:00:00.000Z",
      id: "root",
      sort_order: 0,
      status: "pending",
      title: "Root",
    }),
    createTask({
      created_at: "2026-06-11T08:05:00.000Z",
      id: "child-b",
      parent_task_id: "root",
      sort_order: 2,
      status: "pending",
      title: "Child B",
    }),
    createTask({
      created_at: "2026-06-11T08:04:00.000Z",
      id: "child-a",
      parent_task_id: "root",
      sort_order: 1,
      status: "pending",
      title: "Child A",
    }),
    createTask({
      created_at: "2026-06-11T08:06:00.000Z",
      id: "grandchild",
      parent_task_id: "child-b",
      sort_order: 0,
      status: "pending",
      title: "Grandchild",
    }),
    createTask({
      created_at: "2026-06-11T08:07:00.000Z",
      id: "orphan",
      parent_task_id: "missing-parent",
      sort_order: 3,
      status: "pending",
      title: "Orphan",
    }),
    createTask({
      created_at: "2026-06-11T08:08:00.000Z",
      id: "self-loop",
      parent_task_id: "self-loop",
      sort_order: 4,
      status: "pending",
      title: "Self loop",
    }),
    createTask({
      created_at: "2026-06-11T08:09:00.000Z",
      id: "cycle-a",
      parent_task_id: "cycle-b",
      sort_order: 5,
      status: "pending",
      title: "Cycle A",
    }),
    createTask({
      created_at: "2026-06-11T08:10:00.000Z",
      id: "cycle-b",
      parent_task_id: "cycle-a",
      sort_order: 6,
      status: "pending",
      title: "Cycle B",
    }),
  ];

  assert.equal(isTopLevelTask(tasks[0]!), true);
  assert.equal(isChildTask(tasks[0]!), false);
  assert.equal(isChildTask(tasks[1]!), true);

  assert.deepEqual(
    sortTaskSiblings(tasks.filter((task) => task.parent_task_id === "root")).map((task) => task.id),
    ["child-a", "child-b"],
  );

  const grouped = groupTasksByParentId(tasks);
  assert.deepEqual((grouped.get("root") ?? []).map((task) => task.id), ["child-a", "child-b"]);
  assert.deepEqual((grouped.get(null) ?? []).map((task) => task.id), ["root"]);

  assert.deepEqual(getTaskAncestors("grandchild", tasks).map((task) => task.id), ["child-b", "root"]);
  assert.deepEqual(getTaskDescendants("root", tasks).map((task) => task.id), ["child-a", "child-b", "grandchild"]);

  const tree = buildTaskTree(tasks);
  const rootNode = tree.find((node) => node.task.id === "root");
  assert.ok(rootNode);
  assert.deepEqual(rootNode.children.map((node) => node.task.id), ["child-a", "child-b"]);
  assert.deepEqual(rootNode.children[1]?.children.map((node) => node.task.id), ["grandchild"]);
  assert.ok(tree.some((node) => node.task.id === "orphan"));
  assert.ok(tree.some((node) => node.task.id === "self-loop"));
  assert.ok(tree.some((node) => node.task.id === "cycle-a"));
  assert.ok(tree.some((node) => node.task.id === "cycle-b"));

  const issues = detectTaskHierarchyIssues(tasks);
  assert.deepEqual(
    issues.filter((issue) => issue.type === "missing_parent").map((issue) => issue.taskId),
    ["orphan"],
  );
  assert.deepEqual(
    issues.filter((issue) => issue.type === "self_parent").map((issue) => issue.taskId),
    ["self-loop"],
  );
  assert.deepEqual(
    issues.filter((issue) => issue.type === "circular_parent").map((issue) => issue.taskId),
    ["cycle-a", "cycle-b"],
  );
});

test("guarded task update succeeds when the expected revision still matches", async () => {
  const task = createTask({
    created_at: "2026-06-11T12:00:00.000Z",
    id: "task-guarded-success",
    notes: "Before",
    revision: 3,
    sort_order: 1,
    status: "pending",
    title: "Before",
  });
  const client = createTaskUpdateTestClient(task);

  const result = await updateTaskRowWithLegacyEnergyFallback(
    client as never,
    task.id,
    { notes: "After" },
    () => false,
    () => false,
    { expectedTask: task },
  );

  assert.equal(result.error, null);
  assert.equal(result.conflict, null);
  assert.equal(result.reappliedOnLatestRevision, false);
  assert.equal(result.data?.notes, "After");
  assert.equal(result.data?.revision, 4);
  assert.equal(client.getUpdateAttemptCount(), 1);
});

test("guarded task update reports a same-field remote conflict without retrying the write", async () => {
  const expectedTask = createTask({
    created_at: "2026-06-11T12:00:00.000Z",
    id: "task-same-field-conflict",
    notes: "Before",
    revision: 3,
    sort_order: 1,
    status: "pending",
    title: "Before",
  });
  const remoteTask = {
    ...expectedTask,
    revision: 4,
    title: "Remote title",
  };
  const client = createTaskUpdateTestClient(remoteTask);

  const result = await updateTaskRowWithLegacyEnergyFallback(
    client as never,
    expectedTask.id,
    { title: "Local title" },
    () => false,
    () => false,
    { expectedTask },
  );

  assert.equal(result.data, null);
  assert.equal(result.error, null);
  assert.equal(result.reappliedOnLatestRevision, false);
  assert.equal(result.conflict?.reason, "same_field_changed_remotely");
  assert.deepEqual(result.conflict?.conflictingFields, ["title"]);
  assert.equal(result.conflict?.attemptedReapply, false);
  assert.equal(result.conflict?.latestTask?.title, "Remote title");
  assert.equal(client.getUpdateAttemptCount(), 1);
});

test("guarded task update safely reapplies a low-risk patch onto the latest revision", async () => {
  const expectedTask = createTask({
    created_at: "2026-06-11T12:00:00.000Z",
    id: "task-safe-reapply",
    notes: "Before",
    revision: 3,
    sort_order: 1,
    status: "pending",
    title: "Before",
  });
  const remoteTask = {
    ...expectedTask,
    energy: "high" as const,
    revision: 4,
  };
  const client = createTaskUpdateTestClient(remoteTask);

  const result = await updateTaskRowWithLegacyEnergyFallback(
    client as never,
    expectedTask.id,
    { title: "Local title" },
    () => false,
    () => false,
    { expectedTask },
  );

  assert.equal(result.error, null);
  assert.equal(result.conflict, null);
  assert.equal(result.reappliedOnLatestRevision, true);
  assert.equal(result.data?.title, "Local title");
  assert.equal(result.data?.energy, "high");
  assert.equal(result.data?.revision, 5);
  assert.equal(client.getLatestTaskSnapshot().energy, "high");
  assert.equal(client.getUpdateAttemptCount(), 2);
});

test("guarded task update does not reapply a stale high-risk patch", async () => {
  const expectedTask = createTask({
    created_at: "2026-06-11T12:00:00.000Z",
    id: "task-high-risk-conflict",
    notes: "Before",
    revision: 3,
    sort_order: 1,
    status: "pending",
    title: "Before",
  });
  const remoteTask = {
    ...expectedTask,
    revision: 4,
    status: "in_progress" as const,
  };
  const client = createTaskUpdateTestClient(remoteTask);

  const result = await updateTaskRowWithLegacyEnergyFallback(
    client as never,
    expectedTask.id,
    { status: "done" },
    () => false,
    () => false,
    { expectedTask },
  );

  assert.equal(result.data, null);
  assert.equal(result.error, null);
  assert.equal(result.reappliedOnLatestRevision, false);
  assert.equal(result.conflict?.reason, "high_risk_patch");
  assert.deepEqual(result.conflict?.conflictingFields, ["status"]);
  assert.equal(result.conflict?.attemptedReapply, false);
  assert.equal(client.getUpdateAttemptCount(), 1);
  assert.equal(client.getLatestTaskSnapshot().status, "in_progress");
});

test("guarded task delete succeeds when the expected revision still matches", async () => {
  const task = createTask({
    created_at: "2026-06-11T12:00:00.000Z",
    id: "task-delete-success",
    revision: 6,
    sort_order: 1,
    status: "archived",
    title: "Delete me",
  });
  const client = createTaskUpdateTestClient(task);

  const result = await deleteTaskRow(
    client as never,
    task.id,
    { expectedTask: task },
  );

  assert.equal(result.error, null);
  assert.equal(result.conflict, null);
  assert.equal(result.data?.id, task.id);
  assert.equal(client.getLatestTaskSnapshot(), null);
  assert.equal(client.getDeleteAttemptCount(), 1);
});

test("guarded task delete refreshes the latest row when the revision changed first", async () => {
  const expectedTask = createTask({
    created_at: "2026-06-11T12:00:00.000Z",
    id: "task-delete-conflict",
    revision: 3,
    sort_order: 1,
    status: "archived",
    title: "Delete me",
  });
  const remoteTask = {
    ...expectedTask,
    revision: 4,
    title: "Changed remotely",
  };
  const client = createTaskUpdateTestClient(remoteTask);

  const result = await deleteTaskRow(
    client as never,
    expectedTask.id,
    { expectedTask },
  );

  assert.equal(result.data, null);
  assert.equal(result.error, null);
  assert.equal(result.conflict?.reason, "stale_revision_race");
  assert.equal(result.conflict?.latestTask?.title, "Changed remotely");
  assert.equal(client.getLatestTaskSnapshot()?.title, "Changed remotely");
  assert.equal(client.getDeleteAttemptCount(), 1);
});

function createTaskUpdateTestClient(initialTask: ReturnType<typeof createTask>) {
  let currentTask = { ...initialTask };
  let pendingUpdateValues: Record<string, unknown> = {};
  let pendingId: string | null = null;
  let pendingRevision: number | undefined;
  let updateAttemptCount = 0;
  let deleteAttemptCount = 0;

  return {
    from() {
      return {
        delete() {
          pendingId = null;
          pendingRevision = undefined;

          return {
            eq(field: string, value: string | number) {
              if (field === "id" && typeof value === "string") {
                pendingId = value;
              }
              if (field === "revision" && typeof value === "number") {
                pendingRevision = value;
              }

              return this;
            },
            select() {
              return {
                maybeSingle: async () => {
                  deleteAttemptCount += 1;

                  if (!currentTask || pendingId !== currentTask.id) {
                    return { data: null, error: null };
                  }

                  if (pendingRevision !== undefined && currentTask.revision !== pendingRevision) {
                    return { data: null, error: null };
                  }

                  const deletedTask = { ...currentTask };
                  currentTask = null as unknown as typeof currentTask;
                  return {
                    data: deletedTask,
                    error: null,
                  };
                },
              };
            },
          };
        },
        select() {
          return {
            eq(field: string, value: string) {
              if (field === "id") {
                pendingId = value;
              }

              return {
                maybeSingle: async () => ({
                  data: currentTask && pendingId === currentTask.id ? { ...currentTask } : null,
                  error: null,
                }),
              };
            },
          };
        },
        update(values: Record<string, unknown>) {
          pendingUpdateValues = values;
          pendingId = null;
          pendingRevision = undefined;

          return {
            eq(field: string, value: string | number) {
              if (field === "id" && typeof value === "string") {
                pendingId = value;
              }
              if (field === "revision" && typeof value === "number") {
                pendingRevision = value;
              }

              return this;
            },
            select() {
              return {
                maybeSingle: async () => {
                  updateAttemptCount += 1;

                  if (!currentTask || pendingId !== currentTask.id) {
                    return { data: null, error: null };
                  }

                  if (pendingRevision !== undefined && currentTask.revision !== pendingRevision) {
                    return { data: null, error: null };
                  }

                  currentTask = {
                    ...currentTask,
                    ...pendingUpdateValues,
                  };

                  return {
                    data: { ...currentTask },
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    },
    getLatestTaskSnapshot() {
      return currentTask ? { ...currentTask } : null;
    },
    getDeleteAttemptCount() {
      return deleteAttemptCount;
    },
    getUpdateAttemptCount() {
      return updateAttemptCount;
    },
  };
}
