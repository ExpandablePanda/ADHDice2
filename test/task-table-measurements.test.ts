import test from "node:test";
import assert from "node:assert/strict";
import { mergeMeasuredColumnWidths } from "@/lib/task-table-measurements";

test("mergeMeasuredColumnWidths keeps a 1px shrink from retriggering table state churn", () => {
  const current = {
    due: 148,
    title: 320,
  } as const;

  const next = mergeMeasuredColumnWidths(current, {
    due: 147,
    title: 320,
  }, ["due", "title"]);

  assert.equal(next, current);
});

test("mergeMeasuredColumnWidths still grows immediately when content gets wider", () => {
  const current = {
    due: 148,
    title: 320,
  } as const;

  const next = mergeMeasuredColumnWidths(current, {
    due: 149,
    title: 320,
  }, ["due", "title"]);

  assert.notEqual(next, current);
  assert.equal(next.due, 149);
});

test("mergeMeasuredColumnWidths allows real shrinks larger than the jitter tolerance", () => {
  const current = {
    due: 148,
    title: 320,
  } as const;

  const next = mergeMeasuredColumnWidths(current, {
    due: 146,
    title: 320,
  }, ["due", "title"]);

  assert.notEqual(next, current);
  assert.equal(next.due, 146);
});
