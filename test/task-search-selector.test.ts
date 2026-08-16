import assert from "node:assert/strict";
import test from "node:test";

import { buildStableTaskSearchScope, queryTaskSearch, shouldRunTaskSearch } from "../src/lib/task-search-selector.ts";
import type { Task } from "../src/lib/database.types.ts";

function entity(id: string, title: string, overrides: Partial<Task> = {}, listIds: readonly string[] = ["inbox"]) {
  const task = { id, title, status: "pending", energy: "medium", is_urgent: false, due_on: null, pinned_at: null, parent_task_id: null, priority: "normal", repeat_frequency: "none", tags: [], notes: null, external_link_label: null, external_link_url: null, ...overrides } as Task;
  return { ancestorIds: task.parent_task_id ? [task.parent_task_id] : [], displayStatus: task.status, id, listIds, rootParentId: task.parent_task_id ?? id, searchDocument: title.toLowerCase(), task };
}

function filtersFor(selectedBucket: string) {
  return {
    energyFilters: [],
    focusedTaskIds: [],
    matchAny: false,
    quickFilters: [],
    selectedBucket,
    statusFilters: [],
    tableColumnFilters: { priority: [], repeat: [], text: {} },
  };
}

function filtersForStatus(selectedBucket: string, status: Task["status"]) {
  return { ...filtersFor(selectedBucket), statusFilters: [status] };
}

test("query-only search preserves stable scope and returns one ID result", () => {
  const scope = buildStableTaskSearchScope([entity("root", "Root"), entity("step", "Needle", { parent_task_id: "root" })], {
    energyFilters: [], focusedTaskIds: [], matchAny: false, quickFilters: [], selectedBucket: "all", statusFilters: [], tableColumnFilters: { priority: [], repeat: [], text: {} },
  });
  const result = queryTaskSearch("needle", scope, true);
  assert.deepEqual([...result.matchingEntityIds], ["step", "root"]);
  assert.deepEqual([...result.matchingStepIds], ["step"]);
  assert.equal(scope.eligibleEntityIds.size, 2);
  assert.equal(shouldRunTaskSearch("Home"), false);
  assert.equal(shouldRunTaskSearch("Tasks"), true);
});

test("one committed query returns selected rows and primary facet counts from the same result", () => {
  const scope = buildStableTaskSearchScope([
    entity("custom-match", "Needle custom", { pinned_at: "2026-08-02T00:00:00Z" }, ["list:custom", "smart"]),
    entity("smart-match", "Needle smart", {}, ["smart"]),
    entity("custom-miss", "Other custom", {}, ["list:custom"]),
  ], {
    energyFilters: [], focusedTaskIds: [], matchAny: false, quickFilters: [], selectedBucket: "list:custom", statusFilters: [], tableColumnFilters: { priority: [], repeat: [], text: {} },
  });
  const result = queryTaskSearch("needle", scope, false);
  assert.deepEqual([...result.visibleRootTaskIds], ["custom-match"]);
  assert.deepEqual([...result.primaryFacetVisibleEntityIds].sort(), ["custom-match", "smart-match"]);
  assert.deepEqual(result.listFacetCounts, { all: 2, pinned: 1, smart: 2, "list:custom": 1 });
  assert.equal(scope.selectedScopeEligibleEntityIds.size, 2);
  assert.equal(scope.primaryFacetEligibleEntityIds.size, 3);
});

test("facet counts use root entities when steps are excluded and expand the existing hierarchy when included", () => {
  const scope = buildStableTaskSearchScope([
    entity("root", "Parent", {}, ["list:custom"]),
    entity("step", "Needle step", { parent_task_id: "root" }, ["list:custom"]),
  ], {
    energyFilters: [], focusedTaskIds: [], matchAny: false, quickFilters: [], selectedBucket: "all", statusFilters: [], tableColumnFilters: { priority: [], repeat: [], text: {} },
  });
  const withoutSteps = queryTaskSearch("needle", scope, false);
  assert.equal(withoutSteps.primaryFacetVisibleEntityIds.size, 0);
  const withSteps = queryTaskSearch("needle", scope, true);
  assert.deepEqual([...withSteps.primaryFacetVisibleEntityIds].sort(), ["step"]);
  assert.equal(withSteps.listFacetCounts["list:custom"], 1);
});

test("Pinned selection is entity-local and keeps directly pinned children visible without Include Steps", () => {
  const parent = entity("pinned-parent", "Pinned parent", { pinned_at: "2026-08-03T08:00:00Z" });
  const step = entity("pinned-step", "Pinned step", { parent_task_id: parent.id });
  const substep = {
    ...entity("pinned-substep", "Pinned substep", { parent_task_id: step.id, pinned_at: "2026-08-03T08:02:00Z" }),
    ancestorIds: [step.id, parent.id],
    rootParentId: parent.id,
  };
  const scope = buildStableTaskSearchScope([parent, step, substep], filtersFor("pinned"));
  const result = queryTaskSearch("", scope, false);

  assert.deepEqual([...scope.selectedScopeEligibleEntityIds], [parent.id, substep.id]);
  assert.deepEqual([...result.matchingEntityIds], [parent.id, substep.id]);
  assert.deepEqual(result.visibleRootTaskIds, [parent.id]);
  assert.deepEqual([...result.matchingStepIds], [substep.id]);
  assert.deepEqual([...result.searchExpandedDescendantIds], []);
  assert.deepEqual(Object.keys(result.listFacetCounts).sort(), ["all", "inbox", "pinned"]);
  assert.equal(result.listFacetCounts.pinned, 2);
});

test("Pinned parent does not expand unpinned descendants when Include Steps is on", () => {
  const parent = entity("pinned-root", "Pinned root", { pinned_at: "2026-08-03T08:00:00Z" });
  const step = entity("unpinned-step", "Unpinned step", { parent_task_id: parent.id });
  const scope = buildStableTaskSearchScope([parent, step], filtersFor("pinned"));
  const result = queryTaskSearch("", scope, true);

  assert.deepEqual([...result.matchingEntityIds], [parent.id]);
  assert.deepEqual([...result.matchingStepIds], []);
  assert.deepEqual([...result.searchExpandedDescendantIds], []);
  assert.equal(result.listFacetCounts.pinned, 1);
});

test("child-title search keeps the root as context without expanding siblings", () => {
  const result = queryTaskSearch("sonic", buildStableTaskSearchScope([
    entity("root", "Video Game Tasks"),
    entity("sonic", "Play Sonic", { parent_task_id: "root" }),
    entity("mario", "Play Mario", { parent_task_id: "root" }),
  ], {
    energyFilters: [], focusedTaskIds: [], matchAny: false, quickFilters: [], selectedBucket: "all", statusFilters: [], tableColumnFilters: { priority: [], repeat: [], text: {} },
  }), true);

  assert.deepEqual([...result.directSearchMatchedEntityIds], ["sonic"]);
  assert.deepEqual([...result.matchingEntityIds], ["sonic", "root"]);
  assert.deepEqual([...result.matchingStepIds], ["sonic"]);
  assert.deepEqual(result.visibleRootTaskIds, ["root"]);
  assert.deepEqual([...result.searchExpandedDescendantIds], []);
  assert.deepEqual([...result.matchingDescendantIdsByRootParentId.get("root")!], ["sonic"]);
  assert.deepEqual([...result.contextRootParentIds], ["root"]);
});

test("substep search keeps the owning Step and matching branch context", () => {
  const result = queryTaskSearch("controller", buildStableTaskSearchScope([
    entity("root", "Video Game Tasks"),
    entity("step", "Buy Accessories", { parent_task_id: "root" }),
    { ...entity("substep", "Buy Controller", { parent_task_id: "step" }), ancestorIds: ["step", "root"], rootParentId: "root" },
    entity("other-step", "Play Games", { parent_task_id: "root" }),
  ], {
    energyFilters: [], focusedTaskIds: [], matchAny: false, quickFilters: [], selectedBucket: "all", statusFilters: [], tableColumnFilters: { priority: [], repeat: [], text: {} },
  }), true);

  assert.deepEqual([...result.directSearchMatchedEntityIds], ["substep"]);
  assert.deepEqual([...result.matchingEntityIds], ["substep", "step", "root"]);
  assert.deepEqual([...result.matchingStepIds], ["substep"]);
  assert.deepEqual([...result.matchingDescendantIdsByRootParentId.get("root")!], ["substep"]);
  assert.equal(result.matchingEntityIds.has("other-step"), false);
});

test("multiple child matches retain both matching branches and no unrelated sibling", () => {
  const result = queryTaskSearch("play", buildStableTaskSearchScope([
    entity("root", "Video Game Tasks"),
    entity("sonic", "Play Sonic", { parent_task_id: "root" }),
    entity("mario", "Play Mario", { parent_task_id: "root" }),
    entity("buy", "Buy Controller", { parent_task_id: "root" }),
  ], {
    energyFilters: [], focusedTaskIds: [], matchAny: false, quickFilters: [], selectedBucket: "all", statusFilters: [], tableColumnFilters: { priority: [], repeat: [], text: {} },
  }), true);

  assert.deepEqual([...result.matchingStepIds], ["sonic", "mario"]);
  assert.deepEqual([...result.matchingDescendantIdsByRootParentId.get("root")!], ["sonic", "mario"]);
  assert.equal(result.matchingEntityIds.has("buy"), false);
});

test("direct parent title and tag/document matches expand every descendant", () => {
  const parent = { ...entity("root", "Video Game Tasks", { tags: ["games"] }), searchDocument: "video game tasks games" };
  const result = queryTaskSearch("games", buildStableTaskSearchScope([
    parent,
    entity("step", "Play Sonic", { parent_task_id: "root" }),
    { ...entity("substep", "Choose Character", { parent_task_id: "step" }), ancestorIds: ["step", "root"], rootParentId: "root" },
    entity("other", "Buy Controller", { parent_task_id: "root" }),
  ], {
    energyFilters: [], focusedTaskIds: [], matchAny: false, quickFilters: [], selectedBucket: "all", statusFilters: [], tableColumnFilters: { priority: [], repeat: [], text: {} },
  }), true);

  assert.deepEqual([...result.directSearchMatchedEntityIds], ["root"]);
  assert.deepEqual([...result.searchExpandedDescendantIds], ["step", "substep", "other"]);
  assert.deepEqual([...result.matchingStepIds], ["step", "substep", "other"]);
  assert.deepEqual([...result.matchingDescendantIdsByRootParentId.get("root")!], ["step", "substep", "other"]);
  assert.deepEqual([...result.contextRootParentIds], []);
});

test("the adapter child ID projection is equivalent for Table and List", () => {
  const result = queryTaskSearch("sonic", buildStableTaskSearchScope([
    entity("root", "Video Game Tasks"),
    entity("sonic", "Play Sonic", { parent_task_id: "root" }),
    entity("mario", "Play Mario", { parent_task_id: "root" }),
  ], {
    energyFilters: [], focusedTaskIds: [], matchAny: false, quickFilters: [], selectedBucket: "all", statusFilters: [], tableColumnFilters: { priority: [], repeat: [], text: {} },
  }), true);
  const adapterChildIds = Array.from(result.matchingDescendantIdsByRootParentId.values()).flatMap((ids) => Array.from(ids));

  assert.deepEqual(adapterChildIds, [...result.matchingStepIds]);
  assert.deepEqual([...result.visibleRootTaskIds], ["root"]);
});

test("manual selected roots make an unlisted depth-one child searchable", () => {
  const result = queryTaskSearch("magic", buildStableTaskSearchScope([
    entity("root", "Appanda", {}, ["list:manual"]),
    entity("step", "magic", { parent_task_id: "root" }, []),
    entity("sibling", "unrelated sibling", { parent_task_id: "root" }, []),
  ], filtersFor("list:manual")), true);

  assert.deepEqual([...result.directSearchMatchedEntityIds], ["step"]);
  assert.deepEqual(result.visibleRootTaskIds, ["root"]);
  assert.deepEqual([...result.matchingDescendantIdsByRootParentId.get("root")!], ["step"]);
  assert.equal(result.matchingEntityIds.has("sibling"), false);
});

test("manual selected roots make an unlisted depth-two descendant searchable", () => {
  const result = queryTaskSearch("goldy", buildStableTaskSearchScope([
    entity("root", "Appanda", {}, ["list:manual"]),
    entity("step", "Try Tools", { parent_task_id: "root" }, []),
    { ...entity("substep", "goldy.website", { parent_task_id: "step" }, []), ancestorIds: ["step", "root"], rootParentId: "root" },
  ], filtersFor("list:manual")), true);

  assert.deepEqual([...result.directSearchMatchedEntityIds], ["substep"]);
  assert.deepEqual([...result.matchingEntityIds], ["substep", "step", "root"]);
  assert.deepEqual(result.visibleRootTaskIds, ["root"]);
  assert.deepEqual([...result.matchingDescendantIdsByRootParentId.get("root")!], ["substep"]);
});

test("smart selected roots use the same descendant search eligibility without inheriting membership", () => {
  const root = entity("root", "Appanda", {}, ["list:smart"]);
  const step = entity("step", "Try Tools", { parent_task_id: "root" }, []);
  const substep = { ...entity("substep", "goldy.website", { parent_task_id: "step" }, []), ancestorIds: ["step", "root"], rootParentId: "root" };
  const scope = buildStableTaskSearchScope([root, step, substep], filtersFor("list:smart"));
  const result = queryTaskSearch("goldy", scope, true);

  assert.deepEqual([...result.directSearchMatchedEntityIds], ["substep"]);
  assert.deepEqual([...result.matchingDescendantIdsByRootParentId.get("root")!], ["substep"]);
  assert.deepEqual([...scope.selectedScopeEligibleEntityIds], ["root", "step", "substep"]);
});

test("selected-root descendant search still works when the status filter excludes the context root", () => {
  const result = queryTaskSearch("magic", buildStableTaskSearchScope([
    entity("root", "Appanda", { status: "missed" }, ["list:smart"]),
    entity("step", "magic", { parent_task_id: "root", status: "pending" }, []),
  ], filtersForStatus("list:smart", "pending")), true);

  assert.deepEqual([...result.directSearchMatchedEntityIds], ["step"]);
  assert.deepEqual([...result.matchingEntityIds], ["step", "root"]);
  assert.deepEqual(result.visibleRootTaskIds, ["root"]);
  assert.deepEqual([...result.matchingDescendantIdsByRootParentId.get("root")!], ["step"]);
});

test("independently eligible Steps and Substeps retain context without counting ancestors", () => {
  const scope = buildStableTaskSearchScope([
    entity("root", "Steps context", {}, ["list:other"]),
    entity("step", "magic", { parent_task_id: "root" }, ["list:steps"]),
  ], filtersFor("list:steps"));
  const result = queryTaskSearch("magic", scope, false);

  assert.deepEqual(result.visibleRootTaskIds, ["root"]);
  assert.deepEqual([...result.matchingEntityIds], ["step", "root"]);
  assert.deepEqual([...result.matchingDescendantIdsByRootParentId.get("root")!], ["step"]);
  const withSteps = queryTaskSearch("magic", scope, true);
  assert.deepEqual([...withSteps.primaryFacetVisibleEntityIds], ["step"]);
  assert.equal(withSteps.listFacetCounts["list:steps"], 1);
  assert.equal(withSteps.listFacetCounts["list:other"], undefined);
});

test("a selected-list root match expands every eligible descendant but not another hierarchy", () => {
  const result = queryTaskSearch("appanda", buildStableTaskSearchScope([
    entity("root", "Appanda", {}, ["list:smart"]),
    entity("step", "Try Tools", { parent_task_id: "root" }, []),
    { ...entity("substep", "goldy.website", { parent_task_id: "step" }, []), ancestorIds: ["step", "root"], rootParentId: "root" },
    entity("outside", "Other root", {}, []),
    entity("outside-child", "goldy outside", { parent_task_id: "outside" }, []),
  ], filtersFor("list:smart")), true);

  assert.deepEqual([...result.directSearchMatchedEntityIds], ["root"]);
  assert.deepEqual([...result.searchExpandedDescendantIds], ["step", "substep"]);
  assert.deepEqual([...result.matchingDescendantIdsByRootParentId.get("root")!], ["step", "substep"]);
  assert.deepEqual(result.visibleRootTaskIds, ["root"]);
  assert.equal(result.matchingEntityIds.has("outside-child"), false);
});

test("scoped Table and List child ID inputs stay equivalent for independent child matches", () => {
  const result = queryTaskSearch("goldy", buildStableTaskSearchScope([
    entity("root", "Appanda", {}, ["list:manual"]),
    entity("step", "Try Tools", { parent_task_id: "root" }, []),
    { ...entity("substep", "goldy.website", { parent_task_id: "step" }, []), ancestorIds: ["step", "root"], rootParentId: "root" },
  ], filtersFor("list:manual")), true);
  const rendererChildIds = Array.from(result.matchingDescendantIdsByRootParentId.values()).flatMap((ids) => Array.from(ids));

  assert.deepEqual(rendererChildIds, [...result.matchingStepIds]);
  assert.deepEqual(result.visibleRootTaskIds, ["root"]);
});

test("search scope does not depend on workspace facts or archive/trash arrays", () => {
  const source = "" + buildStableTaskSearchScope;
  assert.doesNotMatch(source, /workspaceFacts|archiveFiltered|trashFiltered|rail|planningCandidates/);
});
