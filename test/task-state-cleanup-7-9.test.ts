import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync("src/components/task-app.tsx", "utf8");
const create = readFileSync("src/hooks/useTaskCreateAction.ts", "utf8");
const crud = readFileSync("src/hooks/useTaskCrudActions.ts", "utf8");
const subtasks = readFileSync("src/hooks/useTaskSubtaskActions.ts", "utf8");

test("canonical Task creation and import have no direct Task-table fallback", () => {
  assert.match(create, /insertTaskRowWithCanonicalCreation/);
  assert.match(crud, /insertImportedTaskRow/);
  assert.match(crud, /canonicalTaskCreator\(payload, "task_import"\)/);
  assert.doesNotMatch(create, /from\(["']adhdice_clean_tasks["']\)|\.insert\(/);
  assert.doesNotMatch(crud, /from\(["']adhdice_clean_tasks["']\)|\.insert\(/);
});

test("explicitly legacy-only checklist rows keep their direct subtask table path", () => {
  assert.match(subtasks, /adhdice_task_subtasks/);
  assert.match(subtasks, /const legacyOnly =/);
  assert.match(subtasks, /promotedTaskByLegacyId/);
  assert.match(subtasks, /canonicalTaskStateUpdate/);
});

test("production Task State cleanup removes the runtime gate module and legacy rollover callers", () => {
  assert.equal(existsSync("src/lib/task-state-runtime-gate.ts"), false);
  assert.doesNotMatch(app, /TASK_STATE_CANONICAL_COMMANDS_ENABLED|adhdice_reconcile_task_rollover|adhdice_apply_task_state_engine_rollover/);
});
