import assert from "node:assert/strict";
import test from "node:test";

import { createManualBatchIntakeDraft, parseBatchIntake } from "../src/lib/home-batch-intake.ts";
import { applyBatchIntakeTaskMatches } from "../src/lib/home-batch-intake-matching.ts";
import { buildBatchIntakeExecutionPlan, executeBatchIntakePlan, getBatchIntakeApplyCount } from "../src/lib/home-batch-intake-executor.ts";
import type { Task } from "../src/lib/database.types.ts";

const fixture = `**10/2**
no cpap 430-630
cpap 4h 50m 11:30pm
no pap nap - 4-615pm
no pap nap - 10pm-1215am
15oz water pending
20oz water done
breakfast, 1 1/2 protein scoop. Forget it. 136 g banana 80 g cinnamon toast crunch milk 178 mL Turkey bacon, four
lunch - popcorn chick 15
din -44 lemonade, 51 pretz sticks, 9 turkey bacon
nba 2k, adhdice, wolverine, lamprey gsr, call dr raddick, call good sheppard, call dentist, call apria, animal control, dang, the run
**10/1**
cpap 3h42m - 6am
no cpap 6am-1118
no cpap nap 4-5pm
nap 9-11pm
weigh 233.6
35oz water done
breakfast - fanta Turkey bacon 8 watermelon 290g
lunch - 3 turkey bac, 70g cinnamon, 170ml milk
snack - 2 bread, turkey bacon 12, 4. pick spear, fanta, 70g pretz
change clothes, cook, nba 2k, wolverine, lamprey gsr, nba the run, lamprey sorter DONE, animal control, spy, madden, listen to album did my best, listten to singles, adhdice
**9/30**
cpap 5h50m - 830am
cpap 2h 10m - 12pm
nap no pap - 330-515pm
coding
1h
breakfast - 98g cinnamon, 220ml mlik, fanta
lunch - sandwich. 6 salami, 2 spears, 350g watermelon
din - 9 salami, 20 spicy nugg, dirty dr pepper, large fry
15oz water dine
tasks
nba 2k, adhdice, wolverine, spy, animal control, dang, outlaws, data annotation, nba the run
**9/29**
12-3am
5am-12pm
7-9pm nap
lunch - panini, medium mac, cherry float 20fl
din - 310g waterm, fant
water
5oz
tasks
lamprey tiers, lamprey urgent, lamprey dashboard, nba 2k, address sort DONE, adhdice, address submit, listen to album, wolverine, lamprey fraud call, nba the run, madden, animal control, poop, magic thee practicing app, budget, pm pills
**9/28**
no cpap sleep around 3:25am-450
455-9am
920-1233
1233-138
430-6
break- 84g cinna, 188ml milk, half fanta, cinnamon bowl 2 - 93g milk 125ml
lunch - fanta, two bread 9 salami
snack - 5 salami, chili seaweed, 300g watermelon
water 15oz pending
tasks
lamprey reports, digman, nba 2k
**9/27**
sleep no cpap 940-1239pm
nap no pap - 5:22-8pm
water
32oz done
15oz pending
lunch - 12 wings millers ale, side of fries, dr. pepper
snack - 2 string cheese
snack - 2 string cheese, 380g watermelon, 5 spears`;

test("golden Obsidian fixture parses Phase 1 records without silently dropping lines", () => {
  const drafts = parseBatchIntake(fixture, { referenceDate: "2026-10-03", preferredWeightUnit: "lb" });
  assert.equal(new Set(drafts.map((draft) => draft.date).filter(Boolean)).size, 6);
  assert.equal(drafts.filter((draft) => draft.kind === "water").length, 8);
  assert.equal(drafts.filter((draft) => draft.kind === "weight").length, 1);
  assert.equal(drafts.filter((draft) => draft.kind === "meal").length, 17);
  assert.equal(drafts.filter((draft) => draft.kind === "task").length, 53);
  assert.equal(drafts.filter((draft) => draft.kind === "task" && draft.outcome !== null).length, 3);
  assert.deepEqual(
    drafts.filter((draft) => draft.kind === "task" && draft.outcome !== null).map((draft) => [draft.taskTitle, draft.outcome]),
    [["lamprey sorter", "done"], ["listen to album", "did_my_best"], ["address sort", "done"]],
  );
  assert.equal(drafts.find((draft) => draft.sourceText === "15oz water dine")?.issues.includes("Choose Pending or Confirmed"), true);
  assert.equal(drafts.some((draft) => draft.sourceText === "no cpap 430-630" && draft.kind === "unsupported" && draft.reason === "Sleep/CPAP parsing deferred"), true);
  assert.equal(drafts.some((draft) => draft.sourceText === "coding" && draft.kind === "unsupported"), true);
  assert.equal(drafts.some((draft) => draft.sourceText === "1h" && draft.kind === "unsupported"), true);
  assert.equal(drafts.some((draft) => draft.sourceText === "tasks" || draft.sourceText === "water"), false);
  assert.equal(new Set(drafts.map((draft) => draft.id)).size, drafts.length);
  assert.ok(drafts.every((draft) => draft.origin === "parsed" && draft.sourceLineNumber !== null));
});

test("manual Batch Intake constructors use explicit manual origins and editable defaults", () => {
  const drafts = (["task", "water", "weight", "meal", "focus"] as const).map((kind) => createManualBatchIntakeDraft(kind, {
    date: "2026-10-03",
    id: `manual-${kind}`,
    preferredWeightUnit: "lb",
    time: "09:15",
  }));

  assert.deepEqual(drafts.map((draft) => draft.kind), ["task", "water", "weight", "meal", "focus"]);
  assert.ok(drafts.every((draft) => draft.origin === "manual" && draft.sourceLineNumber === null && draft.date === "2026-10-03"));
  assert.equal(drafts.find((draft) => draft.kind === "meal")?.entryMode, "structured");
  assert.equal(drafts.find((draft) => draft.kind === "focus")?.kind, "focus");
});

test("date parsing handles omitted years, explicit years, and New Year rollover", () => {
  const drafts = parseBatchIntake("**10/2**\\\n15oz\n1/2/2027\n15oz\n12/31\n15oz", { referenceDate: "2027-01-02", preferredWeightUnit: "kg" });
  assert.deepEqual(drafts.map((draft) => draft.date), ["2026-10-02", "2027-01-02", "2026-12-31"]);
});

test("missing-date lines remain visible with a missing-date issue", () => {
  const drafts = parseBatchIntake("15oz water pending\ncall dentist", { referenceDate: "2026-10-03" });
  assert.equal(drafts.length, 2);
  assert.ok(drafts.every((draft) => draft.date === null && draft.issues.includes("Missing date heading")));
});

test("structured aliases and status edits remain explicit", () => {
  const drafts = parseBatchIntake([
    "10/2/2026",
    "water",
    "15 oz pending",
    "15 fl oz done",
    "15fl oz",
    "water 20oz confirmed",
    "weight 106 kg",
    "weigh 233.6",
    "break - eggs",
    "breakfast, toast",
    "lunch - soup",
    "din - dinner",
    "dinner - pasta",
    "snack - fruit",
    "tasks",
    "animal control",
    "lamprey sorter DONE",
    "listen to album DID MY BEST",
  ].join("\n"), { referenceDate: "2026-10-03", preferredWeightUnit: "lb" });
  assert.equal(drafts.filter((draft) => draft.kind === "water").length, 4);
  assert.equal(drafts.find((draft) => draft.sourceText === "15fl oz")?.issues.includes("Choose Pending or Confirmed"), true);
  assert.deepEqual(drafts.filter((draft) => draft.kind === "meal").map((draft) => draft.mealSlot), ["breakfast", "breakfast", "lunch", "dinner", "dinner", "snack"]);
  assert.equal(drafts.find((draft) => draft.sourceText === "breakfast, toast")?.kind, "meal");
  const implicitWeight = drafts.find((draft) => draft.sourceText === "weigh 233.6");
  assert.equal(implicitWeight?.kind, "weight");
  assert.equal(implicitWeight?.kind === "weight" ? implicitWeight.unit : null, "lb");
  const unmarked = drafts.find((draft) => draft.kind === "task" && draft.taskTitle === "animal control");
  assert.equal(unmarked?.kind, "task");
  assert.equal(unmarked?.kind === "task" ? unmarked.outcome : "unexpected", null);
});

test("matching auto-selects one exact Task, preserves duplicates for review, and never fuzzy-selects", () => {
  const tasks = [
    { id: "one", title: "Call dentist", parent_task_id: null, status: "pending", permanently_deleted_at: null },
    { id: "two", title: "Lamprey", parent_task_id: null, status: "pending", permanently_deleted_at: null },
    { id: "three", title: "Lamprey", parent_task_id: null, status: "pending", permanently_deleted_at: null },
    { id: "archived", title: "Archived Task", parent_task_id: null, status: "archived", permanently_deleted_at: null },
    { id: "trash", title: "Call dentist", parent_task_id: null, status: "trashed", permanently_deleted_at: null },
  ] as unknown as Task[];
  const drafts = parseBatchIntake("10/2\nCall dentist, Lamprey, Lam", { referenceDate: "2026-10-03" });
  const matched = applyBatchIntakeTaskMatches(drafts, tasks);
  assert.equal(matched[0].kind, "task");
  assert.equal((matched[0] as Extract<typeof matched[number], { kind: "task" }>).selectedTaskId, "one");
  assert.equal((matched[1] as Extract<typeof matched[number], { kind: "task" }>).selectedTaskId, null);
  assert.match((matched[1] as Extract<typeof matched[number], { kind: "task" }>).issues.join(" "), /Multiple exact/);
  assert.equal((matched[2] as Extract<typeof matched[number], { kind: "task" }>).selectedTaskId, null);
  const archived = applyBatchIntakeTaskMatches(parseBatchIntake("10/2\ntasks\nArchived Task", { referenceDate: "2026-10-03" }), tasks)[0];
  assert.equal(archived.kind === "task" ? archived.selectedTaskId : "unexpected", "archived");
});

test("execution plan groups Task dates and excludes no-change, meals, unsupported, and invalid rows", () => {
  const drafts = parseBatchIntake("10/2\ntask one DONE, task one\n15oz water confirmed\nweigh 100 kg\nbreakfast toast", { referenceDate: "2026-10-03", preferredWeightUnit: "lb" });
  const taskDraft = drafts.find((draft) => draft.kind === "task" && draft.outcome === "done") as Extract<typeof drafts[number], { kind: "task" }>;
  const noChange = drafts.find((draft) => draft.kind === "task" && draft.taskTitle === "task one" && draft.outcome === null) as Extract<typeof drafts[number], { kind: "task" }>;
  const plan = buildBatchIntakeExecutionPlan([
    { ...taskDraft, selectedTaskId: "task-id", issues: [] },
    { ...noChange, selectedTaskId: "task-id", issues: [] },
    ...drafts.filter((draft) => draft.kind !== "task"),
  ], { preferredWeightUnit: "lb" });
  assert.deepEqual(plan.taskGroups[0].dates, ["2026-10-02"]);
  assert.equal(plan.taskGroups[0].rowIds.length, 1);
  assert.equal(plan.waterRows.length, 1);
  assert.equal(plan.weightRows.length, 1);
  assert.equal(getBatchIntakeApplyCount([
    { ...taskDraft, selectedTaskId: "task-id", issues: [] },
    { ...noChange, selectedTaskId: "task-id", issues: [] },
    ...drafts.filter((draft) => draft.kind !== "task"),
  ], { preferredWeightUnit: "lb" }), 3);
});

test("execution plan keeps parsed Meals review-only and includes valid manual Meals and Focus rows", () => {
  const parsedMeal = parseBatchIntake("10/2\nlunch - soup", { referenceDate: "2026-10-03" }).find((draft) => draft.kind === "meal");
  assert.ok(parsedMeal && parsedMeal.origin === "parsed");
  const task = createManualBatchIntakeDraft("task", { date: "2026-10-03", id: "manual-task" });
  const water = createManualBatchIntakeDraft("water", { date: "2026-10-03", id: "manual-water" });
  const weight = createManualBatchIntakeDraft("weight", { date: "2026-10-03", id: "manual-weight", preferredWeightUnit: "lb" });
  const meal = createManualBatchIntakeDraft("meal", { date: "2026-10-03", id: "manual-meal", time: "12:00" });
  const focus = createManualBatchIntakeDraft("focus", { date: "2026-10-03", id: "manual-focus", time: "13:00" });
  const drafts = [
    parsedMeal,
    { ...task, selectedTaskId: "canonical-task", outcome: "done" as const, issues: [] },
    { ...water, amount: 16, status: "confirmed" as const, issues: [] },
    { ...weight, value: 180, issues: [] },
    { ...meal, foodName: "Soup", calories: 240, issues: [] },
    { ...focus, title: "Deep work", durationSeconds: 1800, issues: [] },
  ];
  const plan = buildBatchIntakeExecutionPlan(drafts, { preferredWeightUnit: "lb" });

  assert.equal(plan.taskGroups.length, 1);
  assert.equal(plan.waterRows.length, 1);
  assert.equal(plan.weightRows.length, 1);
  assert.equal(plan.mealRows?.length, 1);
  assert.equal(plan.focusRows?.length, 1);
  assert.equal(getBatchIntakeApplyCount(drafts, { preferredWeightUnit: "lb" }), 5);
});

test("execution serializes Task groups and keeps failed groups retryable", async () => {
  const calls: string[] = [];
  const plan = {
    taskGroups: [{ key: "task:done", taskId: "task", outcome: "done" as const, dates: ["2026-10-02"], rowIds: ["row-task"] }],
    waterRows: [],
    weightRows: [],
  };
  const result = await executeBatchIntakePlan(plan, {
    syncTaskHistoryEntries: async () => { calls.push("history"); return false; },
    addWaterEntries: async () => ({ success: true, rows: [] }),
    addWeightEntries: async () => ({ success: true, rows: [] }),
  });
  assert.deepEqual(calls, ["history"]);
  assert.equal(result.rows[0].status, "failed");
  assert.equal(result.taskGroups[0].status, "failed");
});

test("execution reports completed Task, Water, and Weight rows without changing result semantics", async () => {
  const progress: Array<{ stage: "tasks" | "water" | "weight" | "complete"; processed: number; total: number; applied: number; failed: number }> = [];
  const plan = {
    taskGroups: [
      { key: "task:done", taskId: "task", outcome: "done" as const, dates: ["2026-10-01"], rowIds: ["task-1", "task-2"] },
      { key: "task:missed", taskId: "other-task", outcome: "missed" as const, dates: ["2026-10-02"], rowIds: ["task-3"] },
    ],
    waterRows: [
      { rowId: "water-1", input: {} as never },
      { rowId: "water-2", input: {} as never },
    ],
    weightRows: [{ rowId: "weight-1", input: {} as never }],
  };
  const result = await executeBatchIntakePlan(plan, {
    syncTaskHistoryEntries: async (taskId) => taskId === "task",
    addWaterEntries: async () => ({ success: false, rows: [{ index: 0, success: true }, { index: 1, success: false, error: "Water failed" }] }),
    addWeightEntries: async () => ({ success: true, rows: [{ index: 0, success: true }] }),
    addMealEntries: async () => ({ success: true, rows: [] }),
    handleManualFocusEntries: async () => ({ success: true, rows: [] }),
  }, { onProgress: (next) => progress.push(next) });

  assert.deepEqual(progress, [
    { stage: "tasks", processed: 0, total: 6, applied: 0, failed: 0 },
    { stage: "tasks", processed: 2, total: 6, applied: 2, failed: 0 },
    { stage: "tasks", processed: 3, total: 6, applied: 2, failed: 1 },
    { stage: "water", processed: 3, total: 6, applied: 2, failed: 1 },
    { stage: "water", processed: 5, total: 6, applied: 3, failed: 2 },
    { stage: "weight", processed: 5, total: 6, applied: 3, failed: 2 },
    { stage: "weight", processed: 6, total: 6, applied: 4, failed: 2 },
    { stage: "complete", processed: 6, total: 6, applied: 4, failed: 2 },
  ]);
  assert.deepEqual(result.rows.map((row) => [row.rowId, row.status]), [
    ["task-1", "applied"], ["task-2", "applied"], ["task-3", "failed"],
    ["water-1", "applied"], ["water-2", "failed"], ["weight-1", "applied"],
  ]);
});

test("retry progress total contains only the current executable rows", async () => {
  const progress: Array<{ stage: "tasks" | "water" | "weight" | "complete"; processed: number; total: number; applied: number; failed: number }> = [];
  const retryPlan = {
    taskGroups: [{ key: "task:done", taskId: "task", outcome: "done" as const, dates: ["2026-10-01"], rowIds: ["failed-task-1", "failed-task-2"] }],
    waterRows: [],
    weightRows: [],
  };
  await executeBatchIntakePlan(retryPlan, {
    syncTaskHistoryEntries: async () => true,
    addWaterEntries: async () => ({ success: true, rows: [] }),
    addWeightEntries: async () => ({ success: true, rows: [] }),
    addMealEntries: async () => ({ success: true, rows: [] }),
    handleManualFocusEntries: async () => ({ success: true, rows: [] }),
  }, { onProgress: (next) => progress.push(next) });

  assert.equal(progress[0]?.total, 2);
  assert.equal(progress.at(-1)?.processed, 2);
  assert.equal(progress.at(-1)?.stage, "complete");
});

test("execution runs Meals before Focus serially and preserves partial failures for retry", async () => {
  const calls: string[] = [];
  const progress: string[] = [];
  const plan = {
    taskGroups: [{ key: "task:done", taskId: "task", outcome: "done" as const, dates: ["2026-10-03"], rowIds: ["task-row"] }],
    waterRows: [{ rowId: "water-row", input: {} as never }],
    weightRows: [{ rowId: "weight-row", input: {} as never }],
    mealRows: [{ rowId: "meal-row", input: {} as never }],
    focusRows: [{ rowId: "focus-row", input: {} as never }],
  };
  const result = await executeBatchIntakePlan(plan, {
    syncTaskHistoryEntries: async () => { calls.push("task"); return true; },
    addWaterEntries: async () => { calls.push("water"); return { success: true, rows: [{ index: 0, success: true }] }; },
    addWeightEntries: async () => { calls.push("weight"); return { success: true, rows: [{ index: 0, success: true }] }; },
    addMealEntries: async () => { calls.push("meal"); return { success: false, rows: [{ index: 0, success: false, error: "Meal failed" }] }; },
    handleManualFocusEntries: async () => { calls.push("focus"); return { success: true, rows: [{ index: 0, success: true }] }; },
  }, { onProgress: (next) => progress.push(next.stage) });

  assert.deepEqual(calls, ["task", "water", "weight", "meal", "focus"]);
  assert.equal(result.rows.filter((row) => row.status === "applied").length, 4);
  assert.equal(result.rows.find((row) => row.rowId === "meal-row")?.status, "failed");
  assert.ok(progress.includes("meals"));
  assert.ok(progress.includes("focus"));
  assert.equal(progress.at(-1), "complete");
});
