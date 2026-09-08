import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  formatTaskTypeLabel,
  isTaskType,
  normalizeTaskType,
  TASK_TYPE_OPTIONS,
  type TaskType,
} from "../src/lib/task-type.ts";
import { createTask } from "../src/lib/task-buckets.ts";
import { buildNewTaskDraft } from "../src/components/task-app/task-editor-model.ts";
import { buildChildTaskCreationDraft } from "../src/lib/task-child-creation.ts";

test("TaskType exposes the four product labels and safely normalizes compatibility input", () => {
  assert.deepEqual(TASK_TYPE_OPTIONS.map((option) => option.value), ["task", "pursuit", "goal", "custom"]);
  for (const taskType of ["task", "pursuit", "goal", "custom"] as TaskType[]) {
    assert.equal(isTaskType(taskType), true);
    assert.equal(normalizeTaskType(taskType), taskType);
    assert.equal(formatTaskTypeLabel(taskType), taskType[0].toUpperCase() + taskType.slice(1));
  }
  assert.equal(normalizeTaskType(undefined), "task");
  assert.equal(normalizeTaskType(null), "task");
  assert.equal(normalizeTaskType("legacy"), "task");
});

test("normal and child Task creation default TaskType to task", () => {
  assert.equal(buildNewTaskDraft("New Task").task_type, "task");
  const child = buildChildTaskCreationDraft({ parentTaskId: "parent-1", title: "Step" });
  assert.equal(child.ok, true);
  assert.equal(child.draft?.task_type, "task");
  assert.equal(createTask({ id: "task-1", title: "Task", status: "pending", created_at: "2026-09-08", sort_order: 0 }).task_type, "task");
});

test("TaskType migration is additive and does not touch legacy Pursuit tables", () => {
  const migration = readFileSync("supabase/add_task_type_7_13_16.sql", "utf8");
  const schema = readFileSync("supabase/schema.sql", "utf8");
  assert.match(migration, /add column if not exists task_type text/i);
  assert.match(migration, /set task_type = 'task'/i);
  assert.match(migration, /alter column task_type set default 'task'/i);
  assert.match(migration, /alter column task_type set not null/i);
  assert.match(migration, /adhdice_clean_tasks_task_type_check/i);
  assert.match(migration, /'task', 'pursuit', 'goal', 'custom'/i);
  assert.doesNotMatch(migration, /adhdice_pursuits|adhdice_pursuit_activities/i);
  assert.doesNotMatch(migration, /entity_kind/i);
  assert.match(schema, /task_type text not null default 'task'/i);
  assert.match(schema, /constraint adhdice_clean_tasks_task_type_check/i);
});

test("Task duplication preserves TaskType through the shared editor draft", () => {
  const taskApp = readFileSync("src/components/task-app.tsx", "utf8");
  const duplicateBranch = taskApp.slice(taskApp.indexOf("const duplicateValues: TaskDraft"), taskApp.indexOf("const duplicateTask = await saveTaskEditor", taskApp.indexOf("const duplicateValues: TaskDraft")));
  assert.match(duplicateBranch, /task_type: task\.task_type/);
});

test("Task Engine remains TaskType-agnostic while direct normalization owns policy resolution", () => {
  const engine = readFileSync("src/lib/task-state-engine/engine.ts", "utf8");
  const directInput = readFileSync("src/lib/task-state-engine/direct-input.ts", "utf8");
  assert.doesNotMatch(engine, /task_type|taskType/);
  assert.match(directInput, /normalizeTaskType\(task\.task_type\)/);
  assert.match(directInput, /resolveTaskBehaviorPolicy\(normalizeTaskType\(task\.task_type\)\)/);
});
