import assert from "node:assert/strict";
import test from "node:test";
import type { RecordTaskEvidenceItem } from "../src/lib/records/evidence.ts";
import { getSelectableRecordEvidenceTaskIds, normalizeRecordEvidenceTaskSelection, toggleRecordEvidenceTaskSelection } from "../src/lib/records/tracking-selection.ts";

function evidence(taskId: string, sourceRowId = taskId) {
  return { entityKind: "parent_task", logicalDate: "2026-09-20", occurrenceIdentity: sourceRowId, outcome: "done", sourceRowId, taskId, title: taskId } as RecordTaskEvidenceItem;
}

function task(id: string, status: "pending" | "trashed" = "pending", permanently_deleted_at: string | null = null) {
  return { id, permanently_deleted_at, status };
}

test("Record Evidence selection is Task-level and excludes unavailable or effectively excluded Tasks", () => {
  const tasks = new Map([
    ["included", task("included")],
    ["trashed", task("trashed", "trashed")],
    ["tombstoned", task("tombstoned", "trashed", "2026-09-20T12:00:00Z")],
  ]);
  const selectable = getSelectableRecordEvidenceTaskIds(
    [evidence("included", "first"), evidence("included", "second"), evidence("trashed"), evidence("tombstoned"), evidence("missing")],
    tasks,
    new Set(["excluded"]),
  );

  assert.deepEqual(selectable, ["included", "trashed"]);
  assert.deepEqual(normalizeRecordEvidenceTaskSelection(["included", "included", "excluded", "missing"], new Set(selectable)), ["included"]);
  assert.deepEqual(toggleRecordEvidenceTaskSelection([], "trashed", new Set(selectable)), ["trashed"]);
  assert.deepEqual(toggleRecordEvidenceTaskSelection(["trashed", "trashed"], "trashed", new Set(selectable)), []);
});

test("Select all and Clear operate on the deduplicated eligible Task set", () => {
  const selectable = new Set(["a", "b", "c"]);
  const all = normalizeRecordEvidenceTaskSelection(["a", "b", "a", "c"], selectable);
  assert.deepEqual(all, ["a", "b", "c"]);
  assert.deepEqual(normalizeRecordEvidenceTaskSelection([], selectable), []);
});
