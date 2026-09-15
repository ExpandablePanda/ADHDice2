import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const primitivesSource = readFileSync(new URL("../src/components/ui/task-table-primitives.tsx", import.meta.url), "utf8");
const tableSource = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");
const inputStart = primitivesSource.indexOf("export function TaskInlineChildDraftInput");
const inputEnd = primitivesSource.indexOf("export function TaskInlineChildDraft", inputStart + 1);
const inputSource = primitivesSource.slice(inputStart, inputEnd);
const tableStepDraftStart = tableSource.indexOf("const renderTableStepDraftCell");
const tableStepDraftEnd = tableSource.indexOf("const renderChildTaskMiniRows", tableStepDraftStart);
const tableStepDraftSource = tableSource.slice(tableStepDraftStart, tableStepDraftEnd);

assert.ok(inputStart >= 0, "TaskInlineChildDraftInput should be discoverable");
assert.ok(inputEnd > inputStart, "TaskInlineChildDraftInput boundary should be discoverable");

test("inline child title input reuses visible Table title typography", () => {
  assert.match(primitivesSource, /TASK_TABLE_VISIBLE_TITLE_TEXT_CLASS = `\$\{TASK_TABLE_CONTROL_FONT_CLASS\} \$\{TASK_TABLE_CHIP_TEXT_CLASS\}/);
  assert.match(inputSource, /className=\{`\$\{TASK_TABLE_VISIBLE_TITLE_TEXT_CLASS\} h-7 min-h-0/);
  assert.match(inputSource, /px-1\.5 py-0/);
  assert.doesNotMatch(inputSource, /text-\[13px\]|font-medium|leading-|tracking-/);
});

test("inline child title input stays compact without changing unrelated input families", () => {
  assert.match(inputSource, /h-7/);
  assert.doesNotMatch(inputSource, /h-10|min-h-10|py-1/);
  assert.match(primitivesSource, /TASK_TABLE_INPUT_CLASS = `\$\{TASK_TABLE_CONTROL_FONT_CLASS\} \$\{TASK_TABLE_TEXT_CLASS\} w-full rounded-\[0\.95rem\][\s\S]*px-3 py-2/);
  assert.match(primitivesSource, /TASK_LIST_QUICK_PANEL_TEXT_INPUT_CLASS = "h-10 rounded-\[0\.9rem\]/);
});

test("Table Step and Substep title-cell drafts retain the shared input and creation wiring", () => {
  assert.match(tableStepDraftSource, /const childLabel = tableStepDraftChildLabels\[parentTaskId\] \?\? "Step"/);
  assert.match(tableStepDraftSource, /<TaskInlineChildDraftInput[\s\S]*onCommit=\{\(\) => commitTableStepDraft\(parentTaskId\)\}/);
  assert.match(tableStepDraftSource, /placeholder=\{`\$\{childLabel\} title\.\.\.`\}/);
  assert.match(tableStepDraftSource, /onChange=\{\(value\) => \{/);
});
