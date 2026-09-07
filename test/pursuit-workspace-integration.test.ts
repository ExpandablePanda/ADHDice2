import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/add_pursuit_task_parent_7_13_1.sql", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const headerSource = readFileSync(new URL("../src/components/task-app/tasks-page.tsx", import.meta.url), "utf8");
const tableSource = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");
const listSource = readFileSync(new URL("../src/components/task-app/tasks-list-adapter.tsx", import.meta.url), "utf8");
const rowSource = readFileSync(new URL("../src/components/task-app/pursuit-workspace-row.tsx", import.meta.url), "utf8");
const editorSource = readFileSync(new URL("../src/components/task-app/pursuits-workspace.tsx", import.meta.url), "utf8");

test("7.13.1 migration preserves Task-owned Pursuits on parent deletion", () => {
  assert.match(migration, /add column if not exists parent_task_id uuid/);
  assert.match(migration, /foreign key \(user_id, parent_task_id\)/);
  assert.match(migration, /on delete set null \(parent_task_id\)/);
  assert.match(migration, /check \(not \(parent_pursuit_id is not null and parent_task_id is not null\)\)/);
  assert.match(migration, /adhdice_pursuits_user_task_parent_idx/);
});

test("creation and child-step routing keep Task and Pursuit paths separate", () => {
  assert.match(headerSource, /New/);
  assert.match(headerSource, /onOpenTaskComposer\(\)/);
  assert.match(headerSource, /onOpenPursuitComposer\(\)/);
  assert.match(tableSource, /ChildTypeChooser/);
  assert.match(tableSource, /onCreateChildPursuit/);
  assert.match(appSource, /onCreateChildPursuit=\{openNewPursuitEditor\}/);
  assert.match(appSource, /initialParentTaskId=\{pursuitEditorState\.parentTaskId\}/);
  assert.match(appSource, /onCreate=\{pursuitData\.createPursuit\}/);
});

test("Table/List use a dedicated Pursuit rendering path and searchable domain rows", () => {
  assert.match(tableSource, /PursuitTableWorkspaceRow/);
  assert.match(tableSource, /filterPursuitsByTitle/);
  assert.match(listSource, /PursuitListWorkspaceRow/);
  assert.match(listSource, /filterPursuitsByTitle/);
  assert.match(rowSource, /pursuit: Pursuit/);
  assert.doesNotMatch(rowSource, /PrototypeTaskRow/);
  assert.match(editorSource, /export function PursuitEditorModal/);
  assert.match(appSource, /onOpenPursuit: openPursuitEditor/);
});

test("Pursuit presentation wiring does not feed rows into Task completion inputs", () => {
  assert.match(tableSource, /buildPursuitWorkspaceIndex/);
  assert.match(tableSource, /renderPursuitRows\(pursuitWorkspaceIndex/);
  assert.match(appSource, /tasks: tasksForActiveStatusRead/);
  assert.match(appSource, /pursuits: pursuitData\.pursuits/);
  assert.doesNotMatch(rowSource, /TaskStatus|TaskHistory|occurrence|adhdice_clean_tasks/);
});
