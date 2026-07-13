import test from "node:test";
import assert from "node:assert/strict";
import { mergeMeasuredColumnWidths, normalizeMeasuredColumnWidth } from "@/lib/task-table-measurements";

test("measurement normalization prevents sub-pixel width churn", () => {
  assert.equal(normalizeMeasuredColumnWidth(148.01), 149);
  assert.equal(normalizeMeasuredColumnWidth(148.99), 149);
  assert.equal(normalizeMeasuredColumnWidth(149), 149);

  const current = { title: 149 } as const;
  assert.equal(
    mergeMeasuredColumnWidths(current, { title: normalizeMeasuredColumnWidth(148.01) }, ["title"]),
    current,
  );
});

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

test("mergeMeasuredColumnWidths keeps passive real shrinks from changing table state", () => {
  const current = {
    due: 148,
    title: 320,
  } as const;

  const next = mergeMeasuredColumnWidths(current, {
    due: 146,
    title: 320,
  }, ["due", "title"]);

  assert.equal(next, current);
});
