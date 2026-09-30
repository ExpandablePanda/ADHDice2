import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getTaskTableInlineActionRowContentClass } from "../src/components/ui/task-table-primitives.tsx";

const primitivesSource = readFileSync(new URL("../src/components/ui/task-table-primitives.tsx", import.meta.url), "utf8");
const tableSource = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");
const composerSource = readFileSync(new URL("../src/components/task-app/task-creation-composer.tsx", import.meta.url), "utf8");
const inputStart = primitivesSource.indexOf("export function TaskInlineChildDraftInput");
const inputEnd = primitivesSource.indexOf("export function TaskInlineChildDraft", inputStart + 1);
const inputSource = primitivesSource.slice(inputStart, inputEnd);
const tableStepDraftStart = tableSource.indexOf("function renderTableStepCreationComposer");
const tableStepDraftEnd = tableSource.indexOf("function beginTableStepDraft", tableStepDraftStart);
const tableStepDraftSource = tableSource.slice(tableStepDraftStart, tableStepDraftEnd);

assert.ok(inputStart >= 0, "TaskInlineChildDraftInput should be discoverable");
assert.ok(inputEnd > inputStart, "TaskInlineChildDraftInput boundary should be discoverable");

test("inline child title input reuses visible Table title typography", () => {
  assert.match(primitivesSource, /TASK_TABLE_INLINE_TITLE_TEXT_CLASS = `\$\{TASK_TABLE_CONTROL_FONT_CLASS\} \$\{TASK_TABLE_CHIP_TEXT_CLASS\}/);
  assert.match(primitivesSource, /TASK_TABLE_VISIBLE_TITLE_TEXT_CLASS = TASK_TABLE_INLINE_TITLE_TEXT_CLASS/);
  assert.match(primitivesSource, /TASK_TABLE_TITLE_RENAME_INPUT_TYPOGRAPHY_STYLE: CSSProperties/);
  assert.match(primitivesSource, /fontSize: "13px"[\s\S]*fontWeight: 500[\s\S]*letterSpacing: "normal"[\s\S]*lineHeight: "13px"/);
  assert.match(inputSource, /TASK_TABLE_INLINE_CHILD_CREATION_INPUT_CLASS/);
  assert.match(inputSource, /style=\{TASK_TABLE_TITLE_RENAME_INPUT_TYPOGRAPHY_STYLE\}/);
  assert.doesNotMatch(inputSource, /TASK_TABLE_INLINE_RENAME_EDITOR_CLASS/);
  assert.doesNotMatch(inputSource, /text-\[13px\]|font-medium|leading-|tracking-/);
});

test("child creation input separates taller geometry from compact rename geometry", () => {
  assert.match(primitivesSource, /TASK_TABLE_INLINE_RENAME_EDITOR_CLASS = `\$\{TASK_TABLE_INLINE_TITLE_TEXT_CLASS\} h-\[15px\] min-h-0 px-1 py-0`/);
  assert.match(primitivesSource, /TASK_TABLE_INLINE_CHILD_CREATION_INPUT_CLASS = `\$\{TASK_TABLE_INLINE_TITLE_TEXT_CLASS\} h-6 min-h-0 px-1\.5`/);
  assert.match(inputSource, /className=\{`\$\{TASK_TABLE_INLINE_CHILD_CREATION_INPUT_CLASS\}/);
  assert.doesNotMatch(inputSource, /h-\[15px\]/);
  assert.doesNotMatch(inputSource, /h-7|h-\[28px\]|py-1/);
  assert.match(tableSource, /className=\{`\$\{TASK_TABLE_INLINE_RENAME_EDITOR_CLASS\}/);
  assert.equal((tableSource.match(/TASK_TABLE_INLINE_RENAME_EDITOR_CLASS/g) ?? []).length, 5);
  assert.match(primitivesSource, /TASK_TABLE_INPUT_CLASS = `\$\{TASK_TABLE_CONTROL_FONT_CLASS\} \$\{TASK_TABLE_TEXT_CLASS\} w-full rounded-\[0\.95rem\][\s\S]*px-3 py-2/);
  assert.match(primitivesSource, /TASK_LIST_QUICK_PANEL_TEXT_INPUT_CLASS = "h-10 rounded-\[0\.9rem\]/);
});

test("Table Step and Substep title-cell drafts retain the shared input and creation wiring", () => {
  assert.match(tableStepDraftSource, /const childLabel = tableStepComposerChildLabels\[parentTaskId\] \?\? "Step"/);
  assert.match(tableStepDraftSource, /<TaskChildCreationComposer[\s\S]*parentTaskId=\{parentTaskId\}/);
  assert.match(tableStepDraftSource, /onCreateChildTask=\{onCreateChildTask/);
  assert.match(tableSource, /data-full-editor-child-draft-row=\{item\.id\}/);
  assert.match(tableSource, /placeholder="Substep title\.\.\."/);
  assert.match(tableSource, /<TaskTitleDraftInput[\s\S]*className=\{`\$\{TASK_TABLE_INLINE_RENAME_EDITOR_CLASS\}/);
  assert.equal((tableSource.match(/style=\{TASK_TABLE_TITLE_RENAME_INPUT_TYPOGRAPHY_STYLE\}/g) ?? []).length, 4);
  assert.match(tableSource, /TASK_TABLE_INLINE_RENAME_EDITOR_CLASS/);
});

test("Table child Task Type interaction belongs to TaskTypeSelect and leaves the title input API unchanged", () => {
  assert.doesNotMatch(inputSource, /onInteractionStart|onInteractionEnd/);
  assert.match(composerSource, /<TaskTypeSelect[\s\S]*onChange=\{setTaskTypeSelection\}[\s\S]*openOnFocus/);
  assert.match(tableStepDraftSource, /<TaskChildCreationComposer/);
});

test("Table inline action rows keep horizontal layout by default and stack Repeat content explicitly", () => {
  assert.equal(getTaskTableInlineActionRowContentClass("auto", "row"), "flex min-w-max items-start gap-1.5");
  assert.equal(getTaskTableInlineActionRowContentClass("visible", "row"), "flex w-full items-start gap-1.5");
  assert.equal(getTaskTableInlineActionRowContentClass("auto", "stack"), "grid w-full gap-2");
  assert.match(tableSource, /layout=\{overlayMode === "repeat" \? "stack" : "row"\}/);
  assert.match(primitivesSource, /layout\?: TaskTableInlineActionRowLayout/);
  assert.match(primitivesSource, /return "grid w-full gap-2"/);
});
