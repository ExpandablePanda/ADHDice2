import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  getTaskTableAlignmentClass,
  getTaskTableChildAlignmentClass,
  TASK_TABLE_GRID_ORIGIN_CLASS,
  TASK_TABLE_GRID_ORIGIN_PX,
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

test("all Table hierarchy grids use one shared origin and keep indentation inside title cells", () => {
  assert.equal(TASK_TABLE_GRID_ORIGIN_PX, 10);
  assert.equal(TASK_TABLE_GRID_ORIGIN_CLASS, "ml-[10px]");

  const gridMarkers = [
    "data-completed-steps-section",
    "data-table-step-draft-row",
    "data-task-table-child-grid",
    "data-task-table-source-step-grid",
    "data-task-table-parent-grid",
  ];
  for (const marker of gridMarkers) {
    const markerIndex = tableSource.indexOf(marker);
    const classStart = tableSource.lastIndexOf("className=", markerIndex);
    assert.ok(markerIndex >= 0 && classStart >= 0, `missing grid marker: ${marker}`);
    assert.match(tableSource.slice(classStart, markerIndex), /TASK_TABLE_GRID_ORIGIN_CLASS/);
  }
  assert.match(tableSource, /sticky top-0 z-20 \$\{TASK_TABLE_GRID_ORIGIN_CLASS\} grid/);

  assert.match(tableSource, /const parentTitleContentOffsetPx = TASK_TABLE_GRID_ORIGIN_PX \+ TABLE_GRID_START_PADDING_PX/);
  assert.match(tableSource, /titleCellPaddingPx: titleContentOffsetPx[\s\S]*- TASK_TABLE_GRID_ORIGIN_PX/);
  assert.match(tableSource, /column\.id === "title" \? \{ paddingLeft:/);
  assert.doesNotMatch(tableSource, /data-task-table-child-grid[\s\S]*marginLeft/);
});

test("all normal Table current-status indicators use one shared size helper", () => {
  const tableCurrentStatusSource = tableSource.slice(
    tableSource.indexOf("function renderRowCell"),
    tableSource.indexOf("const renderSourceStepMiniRows"),
  );
  assert.match(tableSource, /function renderTableCurrentStatusCircle\(status: TaskDisplayStatus\)/);
  assert.match(tableSource, /renderTaskStatusCircle\(status, TASK_TABLE_CURRENT_STATUS_CIRCLE_SIZE\)/);
  assert.equal((tableSource.match(/renderTableCurrentStatusCircle\((?:task|item|subtask|\"pending\")/g) ?? []).length, 5);
  for (const renderer of [
    tableSource.slice(tableSource.indexOf("const renderChildTaskMiniCell"), tableSource.indexOf("const renderTableStepDraftCell")),
    tableSource.slice(tableSource.indexOf("const renderTableStepDraftCell"), tableSource.indexOf("const renderChildTaskMiniRows")),
    tableSource.slice(tableSource.indexOf("const renderSourceStepMiniCell"), tableSource.indexOf("const renderSourceStepMiniRows")),
  ]) {
    assert.doesNotMatch(renderer, /renderTaskStatusCircle\((?:task|item|subtask)\.status, \"(?:sm|md)\"/);
    assert.doesNotMatch(renderer, /renderTaskStatusCircle\(\"pending\", \"(?:sm|md)\"/);
  }
  assert.match(tableCurrentStatusSource, /renderTableCurrentStatusCircle\(task\.status\)/);
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
