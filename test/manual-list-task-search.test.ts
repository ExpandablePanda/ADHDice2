import assert from "node:assert/strict";
import test from "node:test";
import { createTask } from "../src/lib/task-buckets.ts";
import { filterManualListTaskCandidates, matchesManualListTaskSearch } from "../src/lib/manual-list-task-search.ts";

const selectedListId = "list:manual" as const;

function task(id: string, title: string, changes: Partial<ReturnType<typeof createTask>> = {}) {
  return createTask({
    created_at: "2026-08-16T00:00:00Z",
    id,
    sort_order: 0,
    status: "pending",
    title,
    ...changes,
  });
}

test("manual-list search preserves title matching and matches own tags case-insensitively", () => {
  const titled = task("title", "Check invoices");
  const tagged = task("tagged", "Prepare the week", { tags: ["Lamprey", "Calls"] });

  assert.equal(matchesManualListTaskSearch(titled, "invoice"), true);
  assert.equal(matchesManualListTaskSearch(tagged, "lamprey"), true);
  assert.equal(matchesManualListTaskSearch(tagged, "CALL"), true);
  assert.equal(matchesManualListTaskSearch(tagged, "water"), false);
});

test("manual-list candidates do not search hierarchy metadata and preserve exclusions", () => {
  const candidates = filterManualListTaskCandidates([
    task("title", "Check invoices"),
    task("tagged", "Prepare the week", { tags: ["Lamprey"] }),
    task("ancestor-only", "Prepare the week", { tags: ["Child-only"] }),
    task("already-member", "Check another task", { tags: ["Lamprey"] }),
    task("archived", "Archived task", { status: "archived", tags: ["Lamprey"] }),
    task("trashed", "Trashed task", { status: "trashed", tags: ["Lamprey"] }),
    task("finished", "Finished task", { status: "done", tags: ["Lamprey"] }),
  ], "lamprey", selectedListId, {
    "already-member": [selectedListId],
  });

  assert.deepEqual(candidates.map((candidate) => candidate.id), ["tagged"]);
});

test("manual-list candidate ordering and limit remain unchanged", () => {
  const candidates = filterManualListTaskCandidates(
    Array.from({ length: 8 }, (_, index) => task(`task-${index}`, `Task ${index}`, { tags: ["Lamprey"] })),
    "lamprey",
    selectedListId,
    {},
  );

  assert.deepEqual(candidates.map((candidate) => candidate.id), ["task-0", "task-1", "task-2", "task-3", "task-4", "task-5"]);
});
