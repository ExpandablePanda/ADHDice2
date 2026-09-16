import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildTaskAttentionProjection, buildTaskAttentionReasonMap, getTaskAttentionNotification, type TaskAttentionBehaviorPolicy } from "../src/lib/task-attention.ts";
import { createTask } from "../src/lib/task-buckets.ts";
import { buildTaskListCounts, evaluateTaskListMemberships, getBuiltInTaskLists, taskBelongsToList, type TaskListEvaluationContext } from "../src/lib/task-lists.ts";
import { STANDARD_TASK_BEHAVIOR_POLICY } from "../src/lib/task-state-engine/behavior-policy.ts";

const TODAY = "2026-09-12";
const attentionWorkspaceSource = readFileSync("src/components/task-app/attention-workspace.tsx", "utf8");
const attentionChipSource = readFileSync("src/components/task-app/task-attention-chip.tsx", "utf8");
const taskAppSource = readFileSync("src/components/task-app.tsx", "utf8");
const tasksSurfaceSwitchSource = readFileSync("src/components/task-app/tasks-surface-switch.tsx", "utf8");

function task(id: string, dueOn: string | null, status: "pending" | "in_progress" | "missed" | "done" = "pending", priorityLevel?: number) {
  return createTask({
    created_at: "2026-09-01T00:00:00.000Z",
    due_on: dueOn,
    id,
    priority_level: priorityLevel,
    sort_order: 0,
    status,
    title: id,
  });
}

function policy(id: string, missedStreakOnUnhandled: TaskAttentionBehaviorPolicy["missedStreakOnUnhandled"]) {
  return { ...STANDARD_TASK_BEHAVIOR_POLICY, id, missedStreakOnUnhandled };
}

function context(overrides: Partial<TaskListEvaluationContext> = {}): TaskListEvaluationContext {
  return {
    currentStreakByTaskId: {},
    focusedTaskIds: new Set<string>(),
    hasStepsByTaskId: {},
    historyFactsByTaskId: {},
    isDueToday: (date) => date === TODAY,
    isDueTomorrow: (date) => date === "2026-09-13",
    isLater: (date) => Boolean(date && date > "2026-09-13"),
    isOpen: (candidate) => candidate.status !== "done" && candidate.status !== "did_my_best" && candidate.status !== "archived" && candidate.status !== "trashed",
    isOverdue: (date) => Boolean(date && date < TODAY),
    manualMembershipsByTaskId: {},
    taskHistoryByTaskId: {},
    todayDateKey: TODAY,
    ...overrides,
  };
}

function membershipsFor(taskToCheck: ReturnType<typeof task>, attentionEligibleTaskIds: ReadonlySet<string>, lists = getBuiltInTaskLists()) {
  return evaluateTaskListMemberships(taskToCheck, lists, context({ attentionEligibleTaskIds }));
}

test("default Attention rules include only eligible overdue Tasks", () => {
  const rows = [
    task("overdue", "2026-09-11"),
    task("today", TODAY),
    task("future", "2026-09-13"),
    task("unscheduled", null),
  ];
  const policies = Object.fromEntries(rows.map((entry) => [entry.id, policy(entry.id, "ignore")])) as Record<string, TaskAttentionBehaviorPolicy>;
  const projection = buildTaskAttentionProjection({
    behaviorPoliciesByTaskId: policies,
    statusesByTaskId: Object.fromEntries(rows.map((entry) => [entry.id, entry.status])),
    tasks: rows,
  });

  const lists = getBuiltInTaskLists();
  assert.deepEqual(rows.filter((entry) => membershipsFor(entry, projection.attentionEligibleTaskIds, lists).some((membership) => membership.id === "attention")).map((entry) => entry.id), ["overdue"]);
  assert.equal(buildTaskListCounts(rows, lists, context({ attentionEligibleTaskIds: projection.attentionEligibleTaskIds })).attention, 1);
  assert.deepEqual([...projection.attentionEligibleTaskIds].sort(), ["future", "overdue", "today", "unscheduled"]);
});

test("locked Attention eligibility excludes tracked-miss profiles, including Custom rulesets", () => {
  const overdueTracked = task("tracked", "2026-09-11");
  const overdueIgnored = task("ignored", "2026-09-11");
  const projection = buildTaskAttentionProjection({
    behaviorPoliciesByTaskId: {
      tracked: policy("custom-tracked", "increment"),
      ignored: policy("custom-ignored", "ignore"),
    },
    statusesByTaskId: { tracked: "pending", ignored: "pending" },
    tasks: [overdueTracked, overdueIgnored],
  });

  assert.equal(projection.attentionEligibleTaskIds.has("tracked"), false);
  assert.equal(projection.attentionEligibleTaskIds.has("ignored"), true);
  assert.equal(membershipsFor(overdueTracked, projection.attentionEligibleTaskIds).some((membership) => membership.id === "attention"), false);
  assert.equal(membershipsFor(overdueIgnored, projection.attentionEligibleTaskIds).some((membership) => membership.id === "attention"), true);
});

test("legacy needsActionTriggers do not affect final Attention membership", () => {
  const overdue = task("legacy-trigger", "2026-09-11");
  const enabled = { ...policy("ignored", "ignore"), needsActionTriggers: ["missed", "due_today", "overdue"] };
  const disabled = { ...policy("ignored", "ignore"), needsActionTriggers: [] };
  const lists = getBuiltInTaskLists();

  const enabledProjection = buildTaskAttentionProjection({ behaviorPoliciesByTaskId: { [overdue.id]: enabled }, statusesByTaskId: { [overdue.id]: "pending" }, tasks: [overdue] });
  const disabledProjection = buildTaskAttentionProjection({ behaviorPoliciesByTaskId: { [overdue.id]: disabled }, statusesByTaskId: { [overdue.id]: "pending" }, tasks: [overdue] });
  assert.equal(membershipsFor(overdue, enabledProjection.attentionEligibleTaskIds, lists).some((membership) => membership.id === "attention"), true);
  assert.equal(membershipsFor(overdue, disabledProjection.attentionEligibleTaskIds, lists).some((membership) => membership.id === "attention"), true);
});

test("Attention rule edits use the normal evaluator while the eligibility gate remains locked", () => {
  const lists = getBuiltInTaskLists().map((list) => list.id === "attention"
    ? { ...list, rules: { rules: [{ rule: { field: "due", op: "is_today" as const } }] } }
    : list);
  const todayIgnored = task("today-ignored", TODAY);
  const todayTracked = task("today-tracked", TODAY);
  const projection = buildTaskAttentionProjection({
    behaviorPoliciesByTaskId: {
      "today-ignored": policy("ignored", "ignore"),
      "today-tracked": policy("tracked", "increment"),
    },
    statusesByTaskId: { "today-ignored": "pending", "today-tracked": "pending" },
    tasks: [todayIgnored, todayTracked],
  });

  assert.equal(membershipsFor(todayIgnored, projection.attentionEligibleTaskIds, lists).some((membership) => membership.id === "attention"), true);
  assert.equal(membershipsFor(todayTracked, projection.attentionEligibleTaskIds, lists).some((membership) => membership.id === "attention"), false);
});

test("non-due Attention rules still use canonical Task List operators", () => {
  const lists = getBuiltInTaskLists().map((list) => list.id === "attention"
    ? { ...list, rules: { rules: [{ rule: { field: "priority_level", op: "is" as const, value: "5" as const } }] } }
    : list);
  const ignored = task("priority-ignored", null, "pending", 5);
  const tracked = task("priority-tracked", null, "pending", 5);
  const projection = buildTaskAttentionProjection({
    behaviorPoliciesByTaskId: {
      "priority-ignored": policy("ignored", "ignore"),
      "priority-tracked": policy("tracked", "increment"),
    },
    statusesByTaskId: { "priority-ignored": "pending", "priority-tracked": "pending" },
    tasks: [ignored, tracked],
  });

  assert.equal(membershipsFor(ignored, projection.attentionEligibleTaskIds, lists).some((membership) => membership.id === "attention"), true);
  assert.equal(membershipsFor(tracked, projection.attentionEligibleTaskIds, lists).some((membership) => membership.id === "attention"), false);
});

test("an explicit empty Attention rule group matches nothing and does not use the default", () => {
  const lists = getBuiltInTaskLists().map((list) => list.id === "attention" ? { ...list, rules: { rules: [] } } : list);
  const overdue = task("overdue-empty", "2026-09-11");
  const attentionEligibleTaskIds = new Set([overdue.id]);

  assert.equal(evaluateTaskListMemberships(overdue, lists, context({ attentionEligibleTaskIds })).some((membership) => membership.id === "attention"), false);
  assert.equal(taskBelongsToList(overdue, "attention", lists, context({ attentionEligibleTaskIds })), false);
});

test("missing behavior policy or policy loading fails the Attention gate closed", () => {
  const overdue = task("overdue-loading", "2026-09-11");
  const base = {
    statusesByTaskId: { [overdue.id]: "pending" as const },
    tasks: [overdue],
  };
  assert.deepEqual([...buildTaskAttentionProjection(base).attentionEligibleTaskIds], []);
  assert.deepEqual([...buildTaskAttentionProjection({ ...base, behaviorPolicyLoading: true, behaviorPoliciesByTaskId: { [overdue.id]: policy("ignored", "ignore") } }).attentionEligibleTaskIds], []);
});

test("Attention reason map is populated only for final members and falls back for custom rules", () => {
  const overdue = task("overdue-reason", "2026-09-10");
  const missedOverdue = task("missed-overdue-reason", "2026-09-10", "missed");
  const future = task("future-reason", "2026-09-20");
  const reasons = buildTaskAttentionReasonMap({
    attentionRuleGroup: { rules: [{ rule: { field: "due", op: "is_overdue" } }] },
    listMembershipsByTaskId: {
      [overdue.id]: [{ id: "attention" }],
      [missedOverdue.id]: [{ id: "attention" }],
      [future.id]: [{ id: "attention" }],
    },
    statusesByTaskId: { [overdue.id]: "pending", [missedOverdue.id]: "missed", [future.id]: "pending" },
    tasks: [overdue, missedOverdue, future],
    todayKey: TODAY,
  });

  assert.equal(reasons[overdue.id], "overdue");
  assert.equal(reasons[missedOverdue.id], "overdue");
  assert.equal(reasons[future.id], "attention_rule");
  assert.equal(buildTaskAttentionReasonMap({
    attentionRuleGroup: { rules: [{ rule: { field: "priority_level", op: "is", value: "5" } }] },
    listMembershipsByTaskId: { [overdue.id]: [{ id: "attention" }] },
    statusesByTaskId: { [overdue.id]: "pending" },
    tasks: [overdue],
    todayKey: TODAY,
  })[overdue.id], "attention_rule");
  assert.equal(buildTaskAttentionReasonMap({
    listMembershipsByTaskId: {},
    statusesByTaskId: { [overdue.id]: "pending" },
    tasks: [overdue],
    todayKey: TODAY,
  })[overdue.id], undefined);
});

test("Attention notification reasons use the governed informational copy", () => {
  assert.deepEqual(getTaskAttentionNotification("overdue", "2026-09-10"), {
    description: "This task was due September 10, 2026 and is still unresolved.",
    reason: "overdue",
    title: "Overdue",
  });
  assert.deepEqual(getTaskAttentionNotification("attention_rule"), {
    description: "Matches your Attention list rules.",
    reason: "attention_rule",
    title: "Attention Rule",
  });
});

test("Attention remains a canonical row presentation with the working accessible popover", () => {
  assert.match(attentionChipSource, /AdhdIconButton/);
  assert.match(attentionChipSource, /tone="warning"/);
  assert.match(attentionChipSource, /variant="rowToolbar"/);
  assert.match(attentionChipSource, /<Bell aria-hidden="true" fill="currentColor" \/>/);
  assert.match(attentionChipSource, /if \(!notification\) \{[\s\S]*return null;/);
  assert.doesNotMatch(attentionChipSource, /tone="danger"/);
  assert.doesNotMatch(attentionChipSource, />\s*Attention\s*</);
  assert.match(attentionChipSource, /aria-label=\{`Needs attention: \$\{notification\.title\}`\}/);
  assert.match(attentionChipSource, /createPortal\([\s\S]*document\.body/);
  assert.match(attentionChipSource, /position: "fixed"/);
  assert.match(attentionChipSource, /window\.addEventListener\("resize", closeOnViewportChange\)/);
  assert.match(attentionChipSource, /window\.addEventListener\("scroll", closeOnViewportChange, true\)/);
  assert.match(attentionChipSource, /aria-expanded/);
  assert.match(attentionChipSource, /aria-haspopup="dialog"/);
  assert.match(attentionChipSource, /event\.key === "Escape"/);
  assert.match(attentionChipSource, /handlePointerDown/);
  assert.match(attentionChipSource, /Needs Attention/);
  assert.match(attentionChipSource, /TaskAttentionChip/);
  assert.match(taskAppSource, /attentionEligibleTaskIds/);
  assert.doesNotMatch(taskAppSource, /attentionTaskIds/);
  assert.doesNotMatch(taskAppSource, /listId === "attention"/);
  assert.doesNotMatch(tasksSurfaceSwitchSource, />\s*Attention\s*</);
  assert.doesNotMatch(taskAppSource, /<AttentionWorkspace/);
});

test("the inactive legacy Attention workspace does not classify rows independently", () => {
  assert.doesNotMatch(attentionWorkspaceSource, /buildAttentionTaskSections|behaviorPolicyLoading|needsActionTriggers/);
  assert.match(attentionWorkspaceSource, /already-derived final Attention members/);
});
