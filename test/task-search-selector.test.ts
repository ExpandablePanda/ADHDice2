import assert from "node:assert/strict";
import test from "node:test";

import { buildStableTaskSearchScope, queryTaskSearch, shouldRunTaskSearch } from "../src/lib/task-search-selector.ts";
import type { Task } from "../src/lib/database.types.ts";

function entity(id: string, title: string, overrides: Partial<Task> = {}) {
  const task = { id, title, status: "pending", energy: "medium", is_urgent: false, due_on: null, pinned_at: null, parent_task_id: null, priority: "normal", repeat_frequency: "none", tags: [], notes: null, external_link_label: null, external_link_url: null, ...overrides } as Task;
  return { ancestorIds: task.parent_task_id ? [task.parent_task_id] : [], displayStatus: task.status, id, listIds: ["inbox"], rootParentId: task.parent_task_id ?? id, searchDocument: title.toLowerCase(), task };
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

test("search scope does not depend on workspace facts or archive/trash arrays", () => {
  const source = "" + buildStableTaskSearchScope;
  assert.doesNotMatch(source, /workspaceFacts|archiveFiltered|trashFiltered|rail|planningCandidates/);
});
