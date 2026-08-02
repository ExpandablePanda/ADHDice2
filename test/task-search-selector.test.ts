import assert from "node:assert/strict";
import test from "node:test";

import { buildStableTaskSearchScope, queryTaskSearch, shouldRunTaskSearch } from "../src/lib/task-search-selector.ts";
import type { Task } from "../src/lib/database.types.ts";

function entity(id: string, title: string, overrides: Partial<Task> = {}, listIds: readonly string[] = ["inbox"]) {
  const task = { id, title, status: "pending", energy: "medium", is_urgent: false, due_on: null, pinned_at: null, parent_task_id: null, priority: "normal", repeat_frequency: "none", tags: [], notes: null, external_link_label: null, external_link_url: null, ...overrides } as Task;
  return { ancestorIds: task.parent_task_id ? [task.parent_task_id] : [], displayStatus: task.status, id, listIds, rootParentId: task.parent_task_id ?? id, searchDocument: title.toLowerCase(), task };
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
  assert.deepEqual([...withSteps.primaryFacetVisibleEntityIds].sort(), ["root", "step"]);
  assert.equal(withSteps.listFacetCounts["list:custom"], 2);
});

test("search scope does not depend on workspace facts or archive/trash arrays", () => {
  const source = "" + buildStableTaskSearchScope;
  assert.doesNotMatch(source, /workspaceFacts|archiveFiltered|trashFiltered|rail|planningCandidates/);
});
