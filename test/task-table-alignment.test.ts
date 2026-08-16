import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  getTaskTableAlignmentClass,
  getTaskTableChildAlignmentClass,
} from "../src/lib/task-table-alignment.ts";

const tableSource = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");

test("child Task Title is always left aligned while other columns follow their configured alignment", () => {
  assert.equal(getTaskTableChildAlignmentClass("title", "center"), "items-start text-left justify-start");
  assert.equal(getTaskTableChildAlignmentClass("title", "right"), "items-start text-left justify-start");
  assert.equal(getTaskTableChildAlignmentClass("status", "center"), "items-center text-center justify-center");
  assert.equal(getTaskTableChildAlignmentClass("due", "right"), "items-end text-right justify-end");
  assert.equal(getTaskTableChildAlignmentClass("priority", "left"), "items-start text-left justify-start");
});

test("Step and Substep mini-cell paths share child alignment authority", () => {
  const childCellSource = tableSource.slice(
    tableSource.indexOf("const renderChildTaskMiniCell"),
    tableSource.indexOf("const renderTableStepDraftCell"),
  );
  const sourceStepCellSource = tableSource.slice(
    tableSource.indexOf("const renderSourceStepMiniCell"),
    tableSource.indexOf("const renderSourceStepMiniRows"),
  );
  const childStatusSource = childCellSource.slice(
    childCellSource.indexOf('if (columnId === "status_icon")'),
    childCellSource.indexOf('if (columnId === "title")'),
  );
  const sourceStepStatusSource = sourceStepCellSource.slice(
    sourceStepCellSource.indexOf('if (columnId === "status_icon")'),
    sourceStepCellSource.indexOf('if (columnId === "title")'),
  );

  assert.match(childCellSource, /wrapStepMiniCellAction[\s\S]*getChildColumnAlignmentClass\(columnId\)/);
  assert.match(childCellSource, /columnId === "title"[\s\S]*getChildColumnAlignmentClass\(columnId\)/);
  assert.match(childCellSource, /columnId === "status_icon"[\s\S]*getChildColumnAlignmentClass\(columnId\)/);
  assert.match(sourceStepCellSource, /columnId === "status_icon"[\s\S]*getChildColumnAlignmentClass\(columnId\)/);
  assert.doesNotMatch(childStatusSource, /items-center justify-center/);
  assert.doesNotMatch(sourceStepStatusSource, /items-center justify-center/);
  assert.match(tableSource, /getTaskTableChildAlignmentClass\(columnId, alignment\)/);
  assert.equal(getTaskTableAlignmentClass("center"), "items-center text-center justify-center");
  assert.equal(getTaskTableAlignmentClass("right"), "items-end text-right justify-end");
});
