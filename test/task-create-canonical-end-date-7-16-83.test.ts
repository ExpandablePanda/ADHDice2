import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const edgeSource = readFileSync(new URL("../supabase/functions/task-create-canonical/index.ts", import.meta.url), "utf8");

function edgeSetSource(declaration: string, nextDeclaration: string) {
  const start = edgeSource.indexOf(declaration);
  const end = edgeSource.indexOf(nextDeclaration, start);
  assert.ok(start >= 0 && end > start, `${declaration} must be present before ${nextDeclaration}`);
  return edgeSource.slice(start, end);
}

function declaredKeys(source: string) {
  return new Set([...source.matchAll(/"([^"]+)"/g)].map((match) => match[1]));
}

test("task-create-canonical allows nullable repeat_end_on without widening trusted input", () => {
  const taskKeys = declaredKeys(edgeSetSource("const TASK_KEYS = new Set([", "const FORBIDDEN_TASK_KEYS"));
  const forbiddenKeys = declaredKeys(edgeSetSource("const FORBIDDEN_TASK_KEYS = new Set([", "const UUID_KEY"));

  assert.equal(taskKeys.has("repeat_end_on"), true);
  assert.equal(forbiddenKeys.has("repeat_end_on"), false);
  assert.equal(taskKeys.has("unknown_task_field"), false);
  assert.equal(taskKeys.has("user_id"), false);
  assert.equal(forbiddenKeys.has("user_id"), true);
  assert.equal(forbiddenKeys.has("revision"), true);
  assert.match(edgeSource, /Object\.keys\(value\)\.some\(\(key\) => !TASK_KEYS\.has\(key\) \|\| FORBIDDEN_TASK_KEYS\.has\(key\)\)/);
});
