import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createTask } from "../src/lib/task-buckets.ts";
import type { Task } from "../src/lib/database.types.ts";
import {
  prepareTaskAppDerivedPresentation,
  type ChildTaskPreviewLookup,
  type TaskAppDerivedPresentation,
  type TaskSearchPresentationSelection,
} from "../src/lib/task-app-derived.ts";
import { buildTaskAppViewReadModel, type TaskAppViewReadModelDerivedResults } from "../src/lib/task-app-view-read-model.ts";
import { buildStableTaskSearchScope, queryTaskSearch } from "../src/lib/task-search-selector.ts";
import { DEFAULT_TASK_UI_STATE } from "../src/lib/task-ui-state.ts";

function task(id: string, title: string, parentTaskId: string | null = null, sortOrder = 1) {
  return createTask({
    id,
    parent_task_id: parentTaskId,
    sort_order: sortOrder,
    status: "pending",
    title,
  });
}

function childPreviewLookup(...idsByParent: Array<[string, string[]]>) {
  return Object.fromEntries(idsByParent.map(([parentId, ids]) => [parentId, {
    items: ids.map((id) => ({ id })),
    summary: { descendantCount: ids.length, directChildCount: ids.length, hasInvalidDescendants: false, invalidChildLinkCount: 0 },
  }])) as unknown as ChildTaskPreviewLookup;
}

function derivedResults(
  roots: Task[],
  previews: ChildTaskPreviewLookup = {},
  searchMatchedChildTaskIds: string[] = [],
  searchMatchedStepParentTaskIds: string[] = [],
): TaskAppViewReadModelDerivedResults {
  return {
    canonicalVisibleRootTasksSorted: roots,
    childTaskPreviewByParentTaskId: previews,
    searchMatchedChildTaskIds,
    searchMatchedStepParentTaskIds,
  };
}

function presentation(overrides: Partial<typeof DEFAULT_TASK_UI_STATE> = {}): TaskAppDerivedPresentation {
  return prepareTaskAppDerivedPresentation({ ...DEFAULT_TASK_UI_STATE, ...overrides });
}

function selectSearch(tasks: Task[], query: string): TaskSearchPresentationSelection {
  const taskById = new Map(tasks.map((item) => [item.id, item]));
  const entities = tasks.map((item) => {
    const ancestorIds: string[] = [];
    let currentParentId = item.parent_task_id;
    while (currentParentId) {
      ancestorIds.push(currentParentId);
      currentParentId = taskById.get(currentParentId)?.parent_task_id ?? null;
    }
    return {
      ancestorIds,
      displayStatus: item.status,
      id: item.id,
      listIds: ["inbox"],
      rootParentId: ancestorIds.at(-1) ?? item.id,
      searchDocument: item.title.toLowerCase(),
      task: item,
    };
  });
  const result = queryTaskSearch(query, buildStableTaskSearchScope(entities, {
    energyFilters: [],
    focusedTaskIds: [],
    matchAny: false,
    quickFilters: [],
    selectedBucket: "all",
    statusFilters: [],
    tableColumnFilters: { priority: [], repeat: [], text: {} },
  }), true);

  return {
    ...result,
    visibleTasks: result.visibleRootTaskIds
      .map((id) => taskById.get(id))
      .filter((item): item is Task => Boolean(item)),
  };
}

function buildReadModel({
  canonicalTasks,
  calendarTasksForRead = canonicalTasks,
  derived,
  presentation: viewPresentation,
  searchSelection = null,
}: {
  canonicalTasks: Task[];
  calendarTasksForRead?: Task[];
  derived: TaskAppViewReadModelDerivedResults;
  presentation: TaskAppDerivedPresentation;
  searchSelection?: TaskSearchPresentationSelection | null;
}) {
  return buildTaskAppViewReadModel({ canonicalTasks, calendarTasksForRead, derived, presentation: viewPresentation, searchSelection });
}

test("separate presentations select different rows from the same canonical task inputs", () => {
  const alpha = task("alpha", "Alpha task", null, 1);
  const beta = task("beta", "Beta task", null, 2);
  const canonicalTasks = [alpha, beta];
  const derived = derivedResults(canonicalTasks);
  const alphaPresentation = presentation({ search: "alpha", selectedBucket: "all" });
  const betaPresentation = presentation({ search: "beta", selectedBucket: "all" });

  const alphaReadModel = buildReadModel({ canonicalTasks, derived, presentation: alphaPresentation, searchSelection: selectSearch(canonicalTasks, "alpha") });
  const betaReadModel = buildReadModel({ canonicalTasks, derived, presentation: betaPresentation, searchSelection: selectSearch(canonicalTasks, "beta") });

  assert.deepEqual(alphaReadModel.selectedBucketTasks.map((item) => item.id), [alpha.id]);
  assert.deepEqual(betaReadModel.selectedBucketTasks.map((item) => item.id), [beta.id]);
  assert.deepEqual(alphaReadModel.visibleListTaskIds, [alpha.id]);
  assert.deepEqual(betaReadModel.visibleListTaskIds, [beta.id]);
});

test("Calendar Include Steps preserves canonical parent order and search-matched descendants", () => {
  const parent = task("parent", "Project", null, 1);
  const step = task("step", "Needle step", parent.id, 1);
  const substep = task("substep", "Needle substep", step.id, 1);
  const sibling = task("sibling", "Other step", parent.id, 2);
  const canonicalTasks = [sibling, substep, parent, step];
  const searchSelection = selectSearch(canonicalTasks, "needle");
  const derived = derivedResults([parent], childPreviewLookup([parent.id, [step.id, substep.id, sibling.id]]));
  const withSteps = buildReadModel({
    canonicalTasks,
    derived,
    presentation: presentation({
      includeStepsByView: { ...DEFAULT_TASK_UI_STATE.includeStepsByView, calendar: true },
      search: "needle",
      view: "calendar",
    }),
    searchSelection,
  });
  const withoutSteps = buildReadModel({
    canonicalTasks,
    derived,
    presentation: presentation({
      includeStepsByView: { ...DEFAULT_TASK_UI_STATE.includeStepsByView, calendar: false },
      search: "needle",
      view: "calendar",
    }),
    searchSelection,
  });

  assert.deepEqual(withSteps.calendarTasks.map((item) => item.id), [parent.id, step.id, substep.id]);
  assert.deepEqual(withoutSteps.calendarTasks.map((item) => item.id), [parent.id]);
  assert.deepEqual(withSteps.searchMatchedChildTaskIds, [substep.id, step.id]);
  assert.deepEqual(withSteps.searchMatchedStepParentTaskIds, [parent.id]);
});

test("Calendar without search appends all included descendants in preview order", () => {
  const parent = task("plain-parent", "Project");
  const first = task("plain-first", "First", parent.id, 1);
  const second = task("plain-second", "Second", parent.id, 2);
  const canonicalTasks = [second, parent, first];
  const result = buildReadModel({
    canonicalTasks,
    derived: derivedResults([parent], childPreviewLookup([parent.id, [first.id, second.id]])),
    presentation: presentation({ includeStepsByView: { ...DEFAULT_TASK_UI_STATE.includeStepsByView, calendar: true }, view: "calendar" }),
  });

  assert.deepEqual(result.calendarTasks.map((item) => item.id), [parent.id, first.id, second.id]);
});

test("filter activation, reset identity, fallback hierarchy IDs, and visible ordering are preserved", () => {
  const second = task("second", "Second", null, 2);
  const first = task("first", "First", null, 1);
  const canonicalTasks = [second, first];
  const fallbackChildIds = ["step-a", "step-b"];
  const fallbackParentIds = ["first"];
  const derived = derivedResults([second, first], {}, fallbackChildIds, fallbackParentIds);
  const activeFilterPresentation = presentation({
    energyFilters: ["high"],
    quickFilters: ["urgent"],
    statusFilters: ["pending"],
    tableColumnFilters: { ...DEFAULT_TASK_UI_STATE.tableColumnFilters, text: { title: "  word  " } },
    view: "list",
  });
  const activeFilterReadModel = buildReadModel({ canonicalTasks, derived, presentation: activeFilterPresentation });
  const searchedReadModel = buildReadModel({
    canonicalTasks,
    derived,
    presentation: presentation({ ...activeFilterPresentation.taskUiState, search: "word" }),
  });
  const duplicateTitleModePresentation = presentation({ search: "has:duplicate-title", view: "list" });
  const duplicateTitleModeReadModel = buildReadModel({ canonicalTasks, derived, presentation: duplicateTitleModePresentation });

  assert.equal(activeFilterReadModel.hierarchyStatusFilterActive, true);
  assert.equal(searchedReadModel.hierarchyStatusFilterActive, false);
  assert.deepEqual(activeFilterReadModel.searchMatchedChildTaskIds, fallbackChildIds);
  assert.deepEqual(activeFilterReadModel.searchMatchedStepParentTaskIds, fallbackParentIds);
  assert.deepEqual(activeFilterReadModel.visibleListTaskIds, [second.id, first.id]);
  assert.equal(activeFilterReadModel.listSelectionResetKey, JSON.stringify({
    duplicateTitleMode: false,
    energyFilters: ["high"],
    matchAny: true,
    quickFilters: ["urgent"],
    search: "",
    selectedBucket: "today",
    statusFilters: ["pending"],
    view: "list",
  }));
  assert.notEqual(activeFilterReadModel.listSelectionResetKey, searchedReadModel.listSelectionResetKey);
  assert.equal(duplicateTitleModePresentation.duplicateTitleMode, true);
  assert.equal(JSON.parse(duplicateTitleModeReadModel.listSelectionResetKey).duplicateTitleMode, true);
});

test("view selection does not mutate canonical tasks, derived results, presentation, or search results", () => {
  const parent = task("immutable-parent", "Parent");
  const step = task("immutable-step", "Needle step", parent.id);
  const canonicalTasks = [parent, step];
  const derived = derivedResults([parent], childPreviewLookup([parent.id, [step.id]]), [step.id], [parent.id]);
  const viewPresentation = presentation({
    includeStepsByView: { ...DEFAULT_TASK_UI_STATE.includeStepsByView, calendar: true },
    search: "needle",
    view: "calendar",
  });
  const searchSelection = selectSearch(canonicalTasks, "needle");
  const before = structuredClone({ canonicalTasks, derived, presentation: viewPresentation, searchSelection });

  buildReadModel({ canonicalTasks, derived, presentation: viewPresentation, searchSelection });

  assert.deepEqual({ canonicalTasks, derived, presentation: viewPresentation, searchSelection }, before);
});

test("TaskApp keeps the view read-model separate from canonical projection work", () => {
  const source = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
  const readModelSource = readFileSync(new URL("../src/lib/task-app-view-read-model.ts", import.meta.url), "utf8");
  const projectionStart = source.indexOf("const tasksForCalendarRead = useMemo(");
  const readModelStart = source.indexOf("const taskAppViewReadModel = useMemo(", projectionStart);
  const derivationStart = source.indexOf("const derivedData = useMemo(");

  assert.ok(derivationStart >= 0 && projectionStart > derivationStart && readModelStart > projectionStart);
  assert.match(source.slice(readModelStart, source.indexOf("const {", readModelStart)), /buildTaskAppViewReadModel\(/);
  assert.match(readModelSource, /selectCalendarTasks\(/);
  assert.match(source.slice(readModelStart, source.indexOf("const {", readModelStart)), /calendarTasksForRead: tasksForCalendarRead/);
  assert.match(source.slice(readModelStart, source.indexOf("const {", readModelStart)), /searchSelection: taskSearchSelection/);
});
