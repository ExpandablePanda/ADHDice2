import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const source = readFileSync(new URL("../src/components/task-app/tasks-list-adapter.tsx", import.meta.url), "utf8");
const previewStart = source.indexOf("function StepsCardPreview(");
const previewEnd = source.indexOf("function MetadataChipButton(", previewStart);
assert.ok(previewStart >= 0, "StepsCardPreview should exist");
assert.ok(previewEnd > previewStart, "StepsCardPreview boundary should be discoverable");
const previewSource = source.slice(previewStart, previewEnd);

test("StepsCardPreview owns explicit pin callback wiring", () => {
  assert.equal(previewSource.includes("tableProps."), false);
  assert.match(previewSource, /onTogglePinned\?: \(taskId: string\) => void/);

  const pinCallbackCalls = previewSource.match(/onTogglePinned\(item\.id\)/g) ?? [];
  assert.equal(pinCallbackCalls.length, 2, "desktop and mobile pin controls should pass the rendered item ID");
  assert.equal((previewSource.match(/item\.depth > 1 \? \"substep\" : \"step\"/g) ?? []).length >= 2, true);
});

test("StepsCardPreview binds optional custom Task Type rulesets before building child options", () => {
  assert.match(previewSource, /closeQuickPanel,\s*customBehaviorRulesets = \[\],/);
  assert.match(previewSource, /const taskTypeOptions = useMemo\(\(\) => buildTaskTypeSelectionOptions\(customBehaviorRulesets\)/);
  assert.match(previewSource, /resolveTaskTypeSelectionOption\(item\.taskType, item\.customRulesetId, customBehaviorRulesets\)/);
  assert.match(source, /<StepsCardPreview[\s\S]*?customBehaviorRulesets=\{tableProps\.customBehaviorRulesets\}/);
});

test("TasksSimpleList forwards pinning and preserves child creation wiring", () => {
  assert.match(source, /<StepsCardPreview[\s\S]*?onTogglePinned=\{tableProps\.onTogglePinned\}/);
  assert.match(source, /<StepsCardPreview[\s\S]*?onCreateChildTask=\{tableProps\.onCreateChildTask\}/);
  assert.match(previewSource, /<TaskChildCreationComposer/);
  assert.match(previewSource, /onCreateChildTask=\{onCreateChildTask\}/);
  assert.match(previewSource, /childLabel="Substep"/);
});

test("List Step and Substep drafts use one rich child composer and preserve the clicked parent", () => {
  assert.match(previewSource, /childLabel="Step"/);
  assert.match(previewSource, /childLabel="Substep"/);
  assert.match(previewSource, /parentTaskId=\{parentTaskId\}/);
  assert.match(previewSource, /parentTaskId=\{item\.id\}/);
  assert.match(previewSource, /setSubstepDraftParentId\(item\.id\)/);
  assert.match(source, /<StepsCardPreview[\s\S]*parentTaskId=\{task\.id\}/);
});
