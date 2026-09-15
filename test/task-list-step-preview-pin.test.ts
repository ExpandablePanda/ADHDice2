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
  assert.match(previewSource, /const result = await onCreateChildTask\?\.\(parentTaskId, title, substepTaskTypeSelectionValue\);/);
});

test("List Step and Substep drafts guard blur with the shared Task Type interaction lifecycle", () => {
  assert.match(previewSource, /const taskTypeInteractionParentIdRef = useRef<string \| null>\(null\)/);
  assert.match(previewSource, /if \(taskTypeInteractionParentIdRef\.current === parentTaskId\) return;/);
  assert.match(previewSource, /if \(taskTypeInteractionParentIdRef\.current === item\.id\) return;/);
  assert.equal((previewSource.match(/onInteractionStart=\{\(\) => beginTaskTypeInteraction/g) ?? []).length, 2);
  assert.equal((previewSource.match(/onInteractionEnd=\{\(\) => endTaskTypeInteraction/g) ?? []).length, 2);
  assert.match(previewSource, /const commitSubstepDraft = async \(parentTaskId: string\) => \{\s*endTaskTypeInteraction\(parentTaskId\);/);
  assert.match(previewSource, /const cancelSubstepDraft = \(parentTaskId = substepDraftParentId\) => \{[\s\S]*endTaskTypeInteraction\(parentTaskId\)/);
  assert.match(source, /<StepsCardPreview[\s\S]*parentTaskId=\{task\.id\}/);
});
