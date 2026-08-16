import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  getTaskTableAlignmentClass,
  getTaskTableChildAlignmentClass,
} from "../src/lib/task-table-alignment.ts";

const tableSource = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");

test("child Task Title is left aligned and vertically centered", () => {
  for (const alignment of ["left", "center", "right"] as const) {
    assert.equal(getTaskTableChildAlignmentClass("title", alignment), "items-center text-left justify-start");
  }
});

test("child metadata keeps vertical centering independent from horizontal alignment", () => {
  assert.equal(getTaskTableChildAlignmentClass("priority", "left"), "items-center text-left justify-start");
  assert.equal(getTaskTableChildAlignmentClass("status", "center"), "items-center text-center justify-center");
  assert.equal(getTaskTableChildAlignmentClass("due", "right"), "items-center text-right justify-end");

  assert.doesNotMatch(getTaskTableChildAlignmentClass("priority", "left"), /items-start/);
  assert.doesNotMatch(getTaskTableChildAlignmentClass("due", "right"), /items-end/);
});

test("parent and child alignment helpers retain their separate contracts", () => {
  assert.equal(getTaskTableAlignmentClass("left"), "items-start text-left justify-start");
  assert.equal(getTaskTableAlignmentClass("center"), "items-center text-center justify-center");
  assert.equal(getTaskTableAlignmentClass("right"), "items-end text-right justify-end");
});

test("Step and Substep mini-cell paths use one shared child-cell placement authority", () => {
  const childCellSource = tableSource.slice(
    tableSource.indexOf("const renderChildTaskMiniCell"),
    tableSource.indexOf("const renderTableStepDraftCell"),
  );
  const sourceStepCellSource = tableSource.slice(
    tableSource.indexOf("const renderSourceStepMiniCell"),
    tableSource.indexOf("const renderSourceStepMiniRows"),
  );
  const childRowsSource = tableSource.slice(
    tableSource.indexOf("const renderChildTaskMiniRows"),
    tableSource.indexOf("const renderSourceStepMiniCell"),
  );
  const sourceRowsSource = tableSource.slice(tableSource.indexOf("const renderSourceStepMiniRows"));

  assert.doesNotMatch(childCellSource, /getChildColumnAlignmentClass\(/);
  assert.doesNotMatch(sourceStepCellSource, /getChildColumnAlignmentClass\(/);
  assert.match(childRowsSource, /data-task-table-child-cell[\s\S]*getChildColumnAlignmentClass\(column\.id\)/);
  assert.match(sourceRowsSource, /data-task-table-source-step-rows[\s\S]*getChildColumnAlignmentClass\(column\.id\)/);
  assert.match(tableSource, /data-task-table-parent-grid[\s\S]*getColumnAlignmentClass\(column\.id\)/);
});

test("compact and expanded parent/child status rails do not override resolved placement", () => {
  const parentRendererStart = tableSource.indexOf("function renderRowCell");
  const parentStatusSource = tableSource.slice(
    tableSource.indexOf('if (columnId === "status_icon")', parentRendererStart),
    tableSource.indexOf('if (columnId === "title")', parentRendererStart),
  );
  const childStatusSource = tableSource.slice(
    tableSource.indexOf('if (columnId === "status_icon")', tableSource.indexOf("const renderChildTaskMiniCell")),
    tableSource.indexOf('if (columnId === "title")', tableSource.indexOf("const renderChildTaskMiniCell")),
  );

  assert.doesNotMatch(parentStatusSource, /justify-(start|center|end)/);
  assert.doesNotMatch(parentStatusSource, /(?<!max-)w-full\b/);
  assert.doesNotMatch(childStatusSource, /getChildColumnAlignmentClass\(|justify-(start|center|end)/);
  assert.match(tableSource, /columnAlignments\[columnId\] \?\? "center"/);
});
