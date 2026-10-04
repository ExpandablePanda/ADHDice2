import assert from "node:assert/strict";
import test from "node:test";

import type { HealthFoodLibraryItem, Task } from "../src/lib/database.types.ts";
import type { FocusCategory } from "../src/lib/types.ts";
import {
  calculateBatchIntakeMealNutrition,
  getBatchIntakeReviewGroups,
  parseBatchIntake,
  reconcileBatchIntakeMealFoodProposals,
  type BatchIntakeMealFoodProposalDraft,
} from "../src/lib/home-batch-intake.ts";
import { applyBatchIntakeTaskMatches } from "../src/lib/home-batch-intake-matching.ts";
import { buildBatchIntakeExecutionPlan, executeBatchIntakePlan, getBatchIntakeApplyCount } from "../src/lib/home-batch-intake-executor.ts";
import { tokenizeShorthandCsv, extractTrailingShorthandTime } from "../src/lib/scratchpad-shorthand.ts";

const codingCategory: FocusCategory = {
  id: "focus-coding",
  title: "Coding",
  focusType: "Work",
  focusSubtype: "Deep Work",
  focusSubtype2: null,
  color: "#6f57f6",
  icon: "code",
};

const turkeyBacon = {
  id: "food-turkey-bacon",
  user_id: "user-1",
  food_name: "Turkey Bacon",
  brand_name: "Acme",
  category: "Protein",
  food_category: "Protein",
  serving_label: "4 slices",
  serving_size: "4 slices",
  serving_quantity: 4,
  serving_unit: "slice",
  serving_measure_value: null,
  serving_measure_unit: null,
  serving_weight_amount: null,
  serving_weight_unit: null,
  calories: 120,
  protein_g: 10,
  carbs_g: 2,
  fat_g: 8,
  nutrition_details: null,
  barcode: null,
  provider: "custom",
  provider_item_id: "provider-turkey-bacon",
  attribution: "Custom Food",
  is_favorite: true,
  created_at: "2026-10-03T12:00:00Z",
  updated_at: "2026-10-03T12:00:00Z",
} satisfies HealthFoodLibraryItem;

const watermelon = { ...turkeyBacon, id: "food-watermelon", food_name: "Watermelon", serving_label: "100 g", serving_size: "100 g", serving_quantity: 100, serving_unit: "serving", serving_measure_value: 100, serving_measure_unit: "g", calories: 30, provider_item_id: "provider-watermelon" } satisfies HealthFoodLibraryItem;
const fanta = { ...turkeyBacon, id: "food-fanta", food_name: "Fanta", serving_label: "20 fl oz", serving_size: "20 fl oz", serving_quantity: 1, serving_unit: "serving", serving_measure_value: 20, serving_measure_unit: "fl_oz", calories: 250, provider_item_id: "provider-fanta" } satisfies HealthFoodLibraryItem;

const canonicalTasks = [
  "NBA 2K",
  "ADHDice",
  "Wolverine",
  "Address Sort",
  "Listen to Album",
].map((title, index) => ({ id: `task-${index}`, title, parent_task_id: null, status: "pending", permanently_deleted_at: null })) as unknown as Task[];

const shorthandGoldenFixture = `10/2
w: 15oz pending, 20oz done
b: turkey bacon 8, watermelon 290g, fanta 20fl oz @ 11:30am
f: Coding 1h @ 2:30pm
t: nba 2k done, adhdice dmb, wolverine

10/1
wt: 233.6
t: address sort done, listen to album dmb`;

const multiDateCanonicalTasks = ["NBA 2K", "NBA The Run", "Wolverine", "Madden 27"].map((title, index) => ({
  id: `multi-date-task-${index}`,
  parent_task_id: null,
  permanently_deleted_at: null,
  status: "pending",
  title,
})) as unknown as Task[];

const multiDateQaFixture = `t: NBA 2K - Done 9/27 9/28 9/29 9/30 10/2 10/3
t: NBA The Run - Done 9/29 9/30 10/2
t: Wolverine - Done 9/27 9/29 9/30 10/2 10/3
t: Madden 27 - Done 9/29`;

test("Shorthand V1 golden fixture is deterministic with explicit context", () => {
  const parsed = parseBatchIntake(shorthandGoldenFixture, {
    focusCategories: [codingCategory],
    preferredWeightUnit: "lb",
    referenceDate: "2026-10-03",
  });
  const matched = applyBatchIntakeTaskMatches(parsed, canonicalTasks);
  assert.equal(matched.filter((draft) => draft.kind === "task").length, 5);
  assert.equal(matched.filter((draft) => draft.kind === "water").length, 2);
  assert.equal(matched.filter((draft) => draft.kind === "weight").length, 1);
  assert.equal(matched.filter((draft) => draft.kind === "focus").length, 1);
  assert.equal(matched.filter((draft) => draft.kind === "meal" && draft.entryMode === "occurrence").length, 1);
  assert.equal(matched.filter((draft) => draft.kind === "meal" && draft.entryMode === "food_proposal").length, 3);
  assert.deepEqual(matched.filter((draft) => draft.kind === "task").map((draft) => draft.outcome), ["done", "did_my_best", null, "done", "did_my_best"]);
  const water = matched.filter((draft) => draft.kind === "water");
  assert.deepEqual(water.map((draft) => [draft.amount, draft.unit, draft.status]), [[15, "fl_oz", "pending"], [20, "fl_oz", "confirmed"]]);
  const weight = matched.find((draft) => draft.kind === "weight");
  assert.equal(weight?.kind === "weight" ? weight.unit : null, "lb");
  const focus = matched.find((draft) => draft.kind === "focus");
  assert.deepEqual(focus?.kind === "focus" ? [focus.categoryId, focus.durationSeconds, focus.completionTime] : [], ["focus-coding", 3600, "14:30"]);
  const occurrence = matched.find((draft) => draft.kind === "meal" && draft.entryMode === "occurrence");
  assert.equal(occurrence?.kind === "meal" && occurrence.entryMode === "occurrence" ? occurrence.time : null, "11:30");

  const reconciled = reconcileBatchIntakeMealFoodProposals(matched, [turkeyBacon, watermelon, fanta], { createWriteId: (proposal) => `write-${proposal.id}` });
  const resolvedFoods = reconciled.filter((draft) => draft.kind === "meal" && draft.entryMode === "food");
  assert.equal(resolvedFoods.length, 3);
  assert.deepEqual(resolvedFoods.map((draft) => draft.kind === "meal" && draft.entryMode === "food" ? [draft.foodName, draft.consumedQuantity, draft.consumedUnit, draft.rawToken] : []), [
    ["Turkey Bacon", 8, "slice", "turkey bacon 8"],
    ["Watermelon", 290, "g", "watermelon 290g"],
    ["Fanta", 20, "fl_oz", "fanta 20fl oz"],
  ]);
  assert.equal(getBatchIntakeApplyCount(reconciled, { preferredWeightUnit: "lb" }), 11);
  assert.equal(getBatchIntakeReviewGroups(reconciled).find((group) => group.kind === "meal")?.occurrenceIds.length, 1);
});

test("V1 prefix, precedence, date, CSV, and time rules are explicit", () => {
  const drafts = parseBatchIntake(["TASKS", "f:Coding 1h30m @ 4:15 pm", "W:20oz done\\", "nba 2k", "b: \"Soup, Jr.\" 2"].join("\n"), { focusCategories: [codingCategory], referenceDate: "2026-10-03", preferredWeightUnit: "lb" });
  assert.deepEqual(drafts.map((draft) => draft.kind), ["focus", "water", "task", "meal", "meal"]);
  assert.equal(drafts[0]?.kind === "focus" ? drafts[0].durationSeconds : null, 5400);
  assert.equal(drafts[0]?.kind === "focus" ? drafts[0].completionTime : null, "16:15");
  assert.equal(drafts[1]?.kind === "water" ? drafts[1].status : null, "confirmed");
  assert.equal(drafts[2]?.kind === "task" ? drafts[2].taskTitle : null, "nba 2k");
  assert.equal(drafts.filter((draft) => draft.kind === "meal" && draft.entryMode === "food_proposal")[0]?.kind, "meal");
  assert.deepEqual(tokenizeShorthandCsv('"Call Smith, Jr." done, "Say ""hello""" dmb'), ["Call Smith, Jr. done", "Say \"hello\" dmb"]);
  assert.deepEqual(extractTrailingShorthandTime("Food @ 16:15"), { body: "Food", time: "16:15" });
  assert.deepEqual(extractTrailingShorthandTime("Food @ arbitrary"), { body: "Food @ arbitrary", time: null });

  const missingDate = parseBatchIntake("f: Coding 1h", { focusCategories: [codingCategory], referenceDate: "2026-10-03" })[0];
  assert.equal(missingDate?.issues.includes("Missing date heading"), true);
});

test("Task multi-date shorthand expands the QA fixture into 15 flat occurrences and four canonical groups", async () => {
  const parsed = parseBatchIntake(multiDateQaFixture, { referenceDate: "2026-10-03" });
  const taskDrafts = parsed.filter((draft) => draft.kind === "task");
  assert.equal(taskDrafts.length, 15);
  assert.deepEqual(
    taskDrafts.reduce<Record<string, number>>((counts, draft) => {
      counts[draft.taskTitle] = (counts[draft.taskTitle] ?? 0) + 1;
      return counts;
    }, {}),
    { "NBA 2K": 6, "NBA The Run": 3, "Wolverine": 5, "Madden 27": 1 },
  );
  assert.ok(taskDrafts.every((draft) => draft.outcome === "done" && multiDateQaFixture.split("\n").includes(draft.sourceText)));
  assert.equal(new Set(taskDrafts.map((draft) => draft.id)).size, 15);

  const matched = applyBatchIntakeTaskMatches(parsed, multiDateCanonicalTasks);
  const taskGroups = getBatchIntakeReviewGroups(matched).filter((group) => group.kind === "task");
  assert.deepEqual(taskGroups.map((group) => group.drafts.length), [6, 3, 5, 1]);
  assert.ok(taskGroups.every((group) => group.drafts.every((draft) => draft.kind === "task" && draft.selectedTaskId !== null)));

  const plan = buildBatchIntakeExecutionPlan(matched);
  assert.equal(getBatchIntakeApplyCount(matched), 15);
  assert.deepEqual(plan.taskGroups.map((group) => [group.taskId, group.dates.length, group.rowIds.length]), [
    ["multi-date-task-0", 6, 6],
    ["multi-date-task-1", 3, 3],
    ["multi-date-task-2", 5, 5],
    ["multi-date-task-3", 1, 1],
  ]);

  const receivedDates: string[][] = [];
  const progress: Array<{ processed: number; total: number }> = [];
  const firstTaskPlan = { ...plan, taskGroups: [plan.taskGroups[0]!] };
  const result = await executeBatchIntakePlan(firstTaskPlan, {
    syncTaskHistoryEntries: async (_taskId, _outcome, dates) => { receivedDates.push(dates); return true; },
    addWaterEntries: async () => ({ success: true, rows: [] }),
    addWeightEntries: async () => ({ success: true, rows: [] }),
    addMealEntries: async () => ({ success: true, rows: [] }),
    handleManualFocusEntries: async () => ({ success: true, rows: [] }),
  }, { onProgress: (next) => progress.push({ processed: next.processed, total: next.total }) });
  assert.deepEqual(receivedDates, [["2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-02", "2026-10-03"]]);
  assert.equal(result.rows.length, 6);
  assert.equal(progress.at(-1)?.total, 6);
  assert.equal(progress.at(-1)?.processed, 6);
});

test("Task multi-date shorthand normalizes outcomes, dates, duplicate dates, and heading precedence", () => {
  const parsed = parseBatchIntake([
    "10/3",
    "t: DMB task - DMB 9/29 10/1",
    "t: Best task - Did My Best 09/28",
    "t: Missed task - Missed 9/27 09/27",
    "t: Date formats - Done 9/7 09/08 9/9/2026 09/10/2026",
    "t: Inline wins - Done 9/27 9/28",
    "t: Heading fallback - Done",
  ].join("\n"), { referenceDate: "2026-10-03" });
  const tasks = parsed.filter((draft) => draft.kind === "task");
  assert.deepEqual(tasks.map((draft) => [draft.taskTitle, draft.outcome, draft.date]), [
    ["DMB task", "did_my_best", "2026-09-29"],
    ["DMB task", "did_my_best", "2026-10-01"],
    ["Best task", "did_my_best", "2026-09-28"],
    ["Missed task", "missed", "2026-09-27"],
    ["Date formats", "done", "2026-09-07"],
    ["Date formats", "done", "2026-09-08"],
    ["Date formats", "done", "2026-09-09"],
    ["Date formats", "done", "2026-09-10"],
    ["Inline wins", "done", "2026-09-27"],
    ["Inline wins", "done", "2026-09-28"],
    ["Heading fallback", "done", "2026-10-03"],
  ]);
  assert.equal(new Set(tasks.filter((draft) => draft.taskTitle === "Missed task").map((draft) => draft.date)).size, 1);
});

test("yearless inline dates reuse heading inference at the year boundary", () => {
  const drafts = parseBatchIntake("t: New Year task - Done 12/31", { referenceDate: "2027-01-02" });
  assert.equal(drafts[0]?.kind === "task" ? drafts[0].date : null, "2026-12-31");
});

test("malformed inline dates remain reviewable without blocking valid sibling occurrences", () => {
  const parsed = parseBatchIntake("10/3\nt: NBA 2K - Done 9/27 nope 10/2 9/27", { referenceDate: "2026-10-03" });
  const tasks = parsed.filter((draft) => draft.kind === "task");
  assert.deepEqual(tasks.map((draft) => draft.date), ["2026-09-27", null, "2026-10-02"]);
  assert.equal(tasks[1]?.kind === "task" ? tasks[1].issues.includes("Invalid Task shorthand date: nope") : false, true);
  const matched = applyBatchIntakeTaskMatches(parsed, [multiDateCanonicalTasks[0]!]);
  assert.equal(getBatchIntakeApplyCount(matched), 2);
  assert.equal(getBatchIntakeReviewGroups(matched).filter((group) => group.kind === "task")[0]?.drafts.length, 3);
});

test("Task multi-date disambiguation preserves ordinary hyphenated titles and no-outcome behavior", () => {
  const drafts = parseBatchIntake("10/2\nt: Spider-Man 2 done\nt: Call Mom - follow up\nt: NBA 2K - 9/27 9/28", { referenceDate: "2026-10-03" });
  assert.deepEqual(drafts.filter((draft) => draft.kind === "task").map((draft) => [draft.taskTitle, draft.outcome, draft.date]), [
    ["Spider-Man 2", "done", "2026-10-02"],
    ["Call Mom - follow up", null, "2026-10-02"],
    ["NBA 2K - 9/27 9/28", null, "2026-10-02"],
  ]);
});

test("Task execution plans retain inline date source order", () => {
  const parsed = parseBatchIntake("t: NBA 2K - Done 10/2 9/27", { referenceDate: "2026-10-03" });
  const matched = applyBatchIntakeTaskMatches(parsed, [multiDateCanonicalTasks[0]!]);
  const plan = buildBatchIntakeExecutionPlan(matched);
  assert.deepEqual(plan.taskGroups[0]?.dates, ["2026-10-02", "2026-09-27"]);
});

test("explicit Focus stays Focus when category is unknown and exact matching stays strict", () => {
  const unknown = parseBatchIntake("10/2\nf: Writing 45 min @ 8pm", { focusCategories: [codingCategory], referenceDate: "2026-10-03" })[0];
  assert.equal(unknown?.kind, "focus");
  assert.equal(unknown?.kind === "focus" ? unknown.categoryId : "unexpected", null);
  assert.equal(unknown?.kind === "focus" ? unknown.issues.includes("No exact saved Focus category match") : false, true);
  const fuzzyTask = applyBatchIntakeTaskMatches(parseBatchIntake("10/2\nt: NBA", { referenceDate: "2026-10-03" }), canonicalTasks)[0];
  assert.equal(fuzzyTask?.kind === "task" ? fuzzyTask.selectedTaskId : "unexpected", null);
});

test("weight and Meal proposals retain review state when Health context cannot resolve them", () => {
  const drafts = parseBatchIntake("10/2\nwt: 233.6\nb: Protein Bar 20, Unknown Food", { referenceDate: "2026-10-03" });
  const weight = drafts.find((draft) => draft.kind === "weight");
  assert.equal(weight?.kind === "weight" ? weight.unit : "unexpected", null);
  assert.equal(weight?.issues.includes("Health preferred weight unit is not ready"), true);
  const proposals = drafts.filter((draft): draft is BatchIntakeMealFoodProposalDraft => draft.kind === "meal" && draft.entryMode === "food_proposal");
  const unresolved = reconcileBatchIntakeMealFoodProposals(drafts, [turkeyBacon]);
  assert.equal(unresolved.filter((draft) => draft.kind === "meal" && draft.entryMode === "food_proposal").length, proposals.length);
  assert.equal(unresolved.some((draft) => draft.kind === "meal" && draft.entryMode === "food_proposal" && draft.issues.some((issue) => issue.includes("No exact Custom Food"))), true);
});

test("multiple exact Custom Food names remain proposals and do not duplicate on reconciliation", () => {
  const parsed = parseBatchIntake("10/2\nb: turkey bacon", { referenceDate: "2026-10-03" });
  const duplicateFood = { ...turkeyBacon, id: "food-turkey-bacon-duplicate", provider_item_id: "provider-turkey-bacon-duplicate" };
  const reconciled = reconcileBatchIntakeMealFoodProposals(parsed, [turkeyBacon, duplicateFood]);
  assert.equal(reconciled.filter((draft) => draft.kind === "meal" && draft.entryMode === "food_proposal").length, 1);
  assert.equal(reconciled.some((draft) => draft.kind === "meal" && draft.entryMode === "food_proposal" && draft.issues.includes("Multiple exact Custom Food matches require review")), true);
  assert.equal(reconcileBatchIntakeMealFoodProposals(reconciled, [turkeyBacon, duplicateFood]).filter((draft) => draft.kind === "meal" && draft.entryMode === "food_proposal").length, 1);
});

test("unitless quantity adopts stored serving unit and uses Health nutrition calculation after exact resolution", () => {
  const parsed = parseBatchIntake("10/2\nb: turkey bacon 8", { referenceDate: "2026-10-03" });
  const resolved = reconcileBatchIntakeMealFoodProposals(parsed, [turkeyBacon], { createWriteId: () => "stable-write" });
  const food = resolved.find((draft) => draft.kind === "meal" && draft.entryMode === "food");
  assert.equal(food?.kind === "meal" && food.entryMode === "food" ? food.consumedUnit : null, "slice");
  assert.equal(food?.kind === "meal" && food.entryMode === "food" ? calculateBatchIntakeMealNutrition(food)?.nutrientTotals.calories : null, 240);
  assert.equal(food?.kind === "meal" && food.entryMode === "food" ? food.writeId : null, "stable-write");
});
