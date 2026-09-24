import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const workspace = source.slice(source.indexOf("type TestConceptId ="), source.indexOf("function PagePlaceholder", source.indexOf("type TestConceptId =")));

const concepts = [
  ["test-task-table", "Task Table #2"],
  ["test-d20", "D20 Face Mapper"],
  ["test-dice-face", "Dice Face Mapper"],
  ["test-dice-material", "Dice Material Lab"],
  ["test-task-table-prototype", "Task Table Prototype"],
  ["test-bucket-tray", "Bucket Tray"],
  ["test-rule-builder", "Rule Builder"],
] as const;

test("Test workspace keeps the seven stable concept IDs and labels in one registry", () => {
  assert.match(workspace, /const TEST_CONCEPTS = \[/);
  for (const [id, label] of concepts) {
    assert.match(workspace, new RegExp(`id: "${id}",\\s*label: "${label}"`));
  }
  assert.match(workspace, /TEST_DEFAULT_CONCEPT_ID: TestConceptId = "test-task-table"/);
});

test("Test workspace switches one selected render and persists only validated local selection", () => {
  assert.match(workspace, /const TEST_CONCEPT_STORAGE_KEY = "adhdice:test-selected-concept"/);
  assert.match(workspace, /window\.localStorage\.getItem\(TEST_CONCEPT_STORAGE_KEY\)/);
  assert.match(workspace, /return isTestConceptId\(storedValue\) \? storedValue : TEST_DEFAULT_CONCEPT_ID/);
  assert.match(workspace, /window\.localStorage\.setItem\(TEST_CONCEPT_STORAGE_KEY, nextConceptId\)/);
  assert.match(workspace, /<AdhdChip[\s\S]*aria-pressed=\{selectedConceptId === concept\.id\}[\s\S]*selected=\{selectedConceptId === concept\.id\}/);
  assert.match(workspace, /\{selectedConcept\.render\(\{ isDark, userId \}\)\}/);
  assert.doesNotMatch(workspace, /usePageShellLayout|ReorderablePageShells|PageShellLayoutControls/);

  for (const component of ["TaskManagementTableV2", "TestD20FaceMapper", "TestDiceFaceMapper", "TestDiceMaterialLab", "TestTaskTablePrototype", "TestBucketTrayPreview", "TestRuleBuilderPreview"]) {
    assert.equal((workspace.match(new RegExp(`<${component}`, "g")) ?? []).length, 1, `${component} should have one registry render path`);
  }
});
