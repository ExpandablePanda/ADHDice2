import assert from "node:assert/strict";
import test from "node:test";

import { areTaskRowPropsEqual } from "../src/lib/task-row-memoization.ts";

test("row components stay memoized when model and row UI revision are unchanged", () => {
  const rowModel = { id: "task-1" };
  assert.equal(areTaskRowPropsEqual({ rowModel, taskId: "task-1", uiRevision: "r1" }, { rowModel, taskId: "task-1", uiRevision: "r1" }), true);
  assert.equal(areTaskRowPropsEqual({ rowModel, taskId: "task-1", uiRevision: "r1" }, { rowModel, taskId: "task-1", uiRevision: "r2" }), false);
});
