import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildAttentionTaskSections, buildTaskAttentionProjection, getTaskAttentionNotification } from "../src/lib/task-attention.ts";
import { createTask } from "../src/lib/task-buckets.ts";
import {
  resolveTaskBehaviorPolicyForTask,
  STANDARD_TASK_BEHAVIOR_POLICY,
  type TaskBehaviorPolicy,
} from "../src/lib/task-state-engine/behavior-policy.ts";

const TODAY = "2026-09-12";
const attentionWorkspaceSource = readFileSync("src/components/task-app/attention-workspace.tsx", "utf8");
const attentionChipSource = readFileSync("src/components/task-app/task-attention-chip.tsx", "utf8");
const taskAppSource = readFileSync("src/components/task-app.tsx", "utf8");
const tasksSurfaceSwitchSource = readFileSync("src/components/task-app/tasks-surface-switch.tsx", "utf8");

function task(id: string, dueOn: string | null, status: "pending" | "in_progress" | "missed" | "done" = "pending") {
  return createTask({
    created_at: "2026-09-01T00:00:00.000Z",
    due_on: dueOn,
    id,
    sort_order: 0,
    status,
    title: id,
  });
}

function policy(id: string, needsActionTriggers: TaskBehaviorPolicy["needsActionTriggers"]): TaskBehaviorPolicy {
  return { ...STANDARD_TASK_BEHAVIOR_POLICY, id, needsActionTriggers };
}

function sections(
  tasks: ReturnType<typeof task>[],
  behaviorPoliciesByTaskId: Readonly<Record<string, Pick<TaskBehaviorPolicy, "needsActionTriggers">>> = {},
) {
  return buildAttentionTaskSections({
    behaviorPoliciesByTaskId,
    statusesByTaskId: Object.fromEntries(tasks.map((entry) => [entry.id, entry.status])),
    tasks,
    todayKey: TODAY,
  });
}

test("Standard Needs Action preserves Missed, Due Today, Overdue, and baseline fall-through behavior", () => {
  const rows = [
    task("missed", "2026-09-10", "missed"),
    task("today", TODAY),
    task("overdue", "2026-09-11"),
    task("in-progress-today", TODAY, "in_progress"),
    task("in-progress-future", "2026-09-13", "in_progress"),
    task("future", "2026-09-13"),
  ];
  const result = sections(rows);
  assert.deepEqual(result.needsAction.map((entry) => entry.id).sort(), ["in-progress-today", "missed", "overdue", "today"]);
  assert.deepEqual(result.inProgress.map((entry) => entry.id), ["in-progress-future"]);
  assert.deepEqual(result.comingUp.map((entry) => entry.id), ["future"]);
});

test("Needs Action trigger filtering preserves Missed precedence and exact date conditions", () => {
  const missed = task("missed", "2026-09-01", "missed");
  const today = task("today", TODAY);
  const overdue = task("overdue", "2026-09-11");
  const inProgressToday = task("in-progress-today", TODAY, "in_progress");
  const result = sections([missed, today, overdue, inProgressToday], {
    missed: policy("no-missed", ["due_today", "overdue"]),
    today: policy("no-due-today", ["missed", "overdue"]),
    overdue: policy("no-overdue", ["missed", "due_today"]),
    "in-progress-today": policy("no-due-today", ["missed", "overdue"]),
  });

  assert.deepEqual(result.needsAction, []);
  assert.deepEqual(result.inProgress.map((entry) => entry.id), ["in-progress-today"]);

  const overdueOnly = sections([missed, today, overdue], {
    missed: policy("overdue-only", ["overdue"]),
    today: policy("overdue-only", ["overdue"]),
    overdue: policy("overdue-only", ["overdue"]),
  });
  assert.deepEqual(overdueOnly.needsAction.map((entry) => entry.id), ["overdue"]);
  assert.deepEqual(overdueOnly.comingUp, []);
});

test("terminal, unscheduled, and future facts stay excluded regardless of enabled triggers", () => {
  const terminal = task("terminal", "2026-09-01", "done");
  const unscheduled = task("unscheduled", null);
  const future = task("future", "2026-09-13");
  const result = buildAttentionTaskSections({
    behaviorPoliciesByTaskId: {
      terminal: policy("all", ["missed", "due_today", "overdue"]),
      unscheduled: policy("all", ["missed", "due_today", "overdue"]),
      future: policy("all", ["missed", "due_today", "overdue"]),
    },
    statusesByTaskId: { terminal: "done", unscheduled: "unscheduled", future: "pending" },
    tasks: [terminal, unscheduled, future],
    todayKey: TODAY,
  });
  assert.deepEqual(result.needsAction, []);
  assert.deepEqual(result.comingUp.map((entry) => entry.id), ["future"]);
});

test("Attention uses effective Task, Custom Default, named Custom, and selection-timeline policies", () => {
  const taskRevision = { ...STANDARD_TASK_BEHAVIOR_POLICY, id: "task-revision", effectiveFromLogicalDate: TODAY, needsActionTriggers: ["missed", "due_today"] as const };
  const customRevision = { ...STANDARD_TASK_BEHAVIOR_POLICY, id: "custom-revision", effectiveFromLogicalDate: TODAY, needsActionTriggers: ["missed", "due_today", "overdue"] as const };
  const namedRevision = { ...STANDARD_TASK_BEHAVIOR_POLICY, id: "named-revision", effectiveFromLogicalDate: TODAY, needsActionTriggers: ["missed", "due_today"] as const };
  const context = {
    behaviorPolicyRevisions: { task: [taskRevision], custom: [customRevision] },
    namedCustomRulesetBehaviorPolicyRevisions: { "ruleset-one": [namedRevision] },
  };
  const taskPolicy = resolveTaskBehaviorPolicyForTask({ ...context, logicalDate: TODAY, taskId: "task-one", taskType: "task" }).policy;
  const customDefaultPolicy = resolveTaskBehaviorPolicyForTask({ ...context, logicalDate: TODAY, taskId: "custom-default", taskType: "custom", customRulesetId: null }).policy;
  const namedCustomPolicy = resolveTaskBehaviorPolicyForTask({ ...context, logicalDate: TODAY, taskId: "named-custom", taskType: "custom", customRulesetId: "ruleset-one" }).policy;
  const historicalSelectionPolicy = resolveTaskBehaviorPolicyForTask({
    ...context,
    behaviorSelectionsByTaskId: {
      "selected-custom": [
        { effectiveFromLogicalDate: "2026-09-01", taskType: "custom", customRulesetId: "ruleset-one" },
      ],
    },
    customRulesetId: null,
    logicalDate: TODAY,
    taskId: "selected-custom",
    taskType: "custom",
  }).policy;

  assert.deepEqual(taskPolicy.needsActionTriggers, ["missed", "due_today"]);
  assert.deepEqual(customDefaultPolicy.needsActionTriggers, ["missed", "due_today", "overdue"]);
  assert.deepEqual(namedCustomPolicy.needsActionTriggers, ["missed", "due_today"]);
  assert.deepEqual(historicalSelectionPolicy.needsActionTriggers, ["missed", "due_today"]);
  assert.notDeepEqual(customDefaultPolicy.needsActionTriggers, namedCustomPolicy.needsActionTriggers);
});

test("canonical Attention projection includes only effective Needs Action membership", () => {
  const rows = [
    task("missed", "2026-09-10", "missed"),
    task("today", TODAY),
    task("overdue", "2026-09-11"),
    task("in-progress-today", TODAY, "in_progress"),
    task("coming-up", "2026-09-13"),
    task("unscheduled", null),
    task("done", "2026-09-11", "done"),
  ];
  const allTriggers = Object.fromEntries(rows.map((entry) => [entry.id, policy(entry.id, ["missed", "due_today", "overdue"]) ]));
  const enabled = buildTaskAttentionProjection({
    behaviorPoliciesByTaskId: allTriggers,
    statusesByTaskId: {
      done: "done",
      "coming-up": "pending",
      "in-progress-today": "in_progress",
      missed: "missed",
      overdue: "pending",
      today: "pending",
      unscheduled: "unscheduled",
    },
    tasks: rows,
    todayKey: TODAY,
  });

  assert.deepEqual([...enabled.taskIds].sort(), ["in-progress-today", "missed", "overdue", "today"]);
  assert.equal(enabled.reasonByTaskId.missed, "missed");
  assert.equal(enabled.reasonByTaskId.today, "due_today");
  assert.equal(enabled.reasonByTaskId.overdue, "overdue");
  assert.equal(enabled.classificationByTaskId["coming-up"]?.section, "coming_up");

  const disabled = buildTaskAttentionProjection({
    behaviorPoliciesByTaskId: {
      missed: policy("missed-disabled", ["due_today", "overdue"]),
      today: policy("today-disabled", ["missed", "overdue"]),
      overdue: policy("overdue-disabled", ["missed", "due_today"]),
      "in-progress-today": policy("today-disabled", ["missed", "overdue"]),
    },
    statusesByTaskId: {
      "in-progress-today": "in_progress",
      missed: "missed",
      overdue: "pending",
      today: "pending",
    },
    tasks: rows.slice(0, 4),
    todayKey: TODAY,
  });
  assert.deepEqual([...disabled.taskIds], []);
  assert.equal(disabled.classificationByTaskId["in-progress-today"]?.section, "in_progress");

  const loading = buildTaskAttentionProjection({
    behaviorPoliciesByTaskId: allTriggers,
    behaviorPolicyLoading: true,
    statusesByTaskId: { missed: "missed" },
    tasks: [rows[0]!],
    todayKey: TODAY,
  });
  assert.deepEqual([...loading.taskIds], []);
});

test("Attention notification reasons use the governed informational copy", () => {
  assert.deepEqual(getTaskAttentionNotification("missed"), {
    description: "This task is currently Missed.",
    reason: "missed",
    title: "Missed",
  });
  assert.deepEqual(getTaskAttentionNotification("due_today"), {
    description: "This task is due today and is still unresolved.",
    reason: "due_today",
    title: "Due Today",
  });
  assert.deepEqual(getTaskAttentionNotification("overdue", "2026-09-10"), {
    description: "This task was due September 10, 2026 and is still unresolved.",
    reason: "overdue",
    title: "Overdue",
  });
});

test("Attention is a canonical row presentation and no longer a top-level surface", () => {
  assert.match(attentionChipSource, /aria-expanded/);
  assert.match(attentionChipSource, /aria-haspopup="dialog"/);
  assert.match(attentionChipSource, /event\.key === "Escape"/);
  assert.match(attentionChipSource, /handlePointerDown/);
  assert.match(attentionChipSource, /Needs Attention/);
  assert.match(attentionChipSource, /TaskAttentionChip/);
  assert.doesNotMatch(tasksSurfaceSwitchSource, />\s*Attention\s*</);
  assert.doesNotMatch(taskAppSource, /<AttentionWorkspace/);
});

test("Attention waits for effective behavior readiness before classifying Task rows", () => {
  assert.match(attentionWorkspaceSource, /behaviorPolicyLoading/);
  assert.match(attentionWorkspaceSource, /behaviorPolicyLoading\s*\?\s*\{ comingUp: \[\], inProgress: \[\], needsAction: \[\] \}/);
  assert.match(attentionWorkspaceSource, /buildAttentionTaskSections\(\{ behaviorPoliciesByTaskId:/);
});
