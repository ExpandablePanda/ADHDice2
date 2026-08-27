import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const tableSource = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");
const listSource = readFileSync(new URL("../src/components/task-app/tasks-list-adapter.tsx", import.meta.url), "utf8");

test("Table status circles route Delayed through the existing Delay picker", () => {
  assert.match(tableSource, /function openTaskDelay\(taskId: string/);
  assert.match(tableSource, /if \(status === "delayed"\) \{\s*openTaskDelay\(task\.id, event\.currentTarget\);/);
  assert.match(tableSource, /if \(status === "delayed"\) \{\s*openTaskDelay\(item\.id, event\.currentTarget\);/);
  assert.match(tableSource, /if \(status === "delayed"\) \{\s*openTaskDelay\(taskId\);/);
  assert.match(tableSource, /onRequestDelay=\{\(subtaskId\) => openTaskDelay\(subtaskId\)\}/);
  assert.match(tableSource, /if \(status === "delayed"\) \{\s*onRequestDelay\?\.\(subtask\.id\);/);
  assert.match(tableSource, /metadataPanelId === "delay"/);
  assert.match(tableSource, /onSave=\{\(nextDueOn\) => applyTaskDelay\(metadataTask\.id, nextDueOn\)\}/);
});

test("List parent, Step, and Substep status circles never fall back to a bare Delayed status write", () => {
  assert.match(listSource, /if \(status === "delayed"\) \{\s*if \(onDelayTaskUntil\) onOpenQuickPanel\(item\.id, "delay"\);\s*return;/);
  assert.match(listSource, /if \(status === "delayed"\) \{\s*setRowContextMenu\(null\);\s*if \(tableProps\.onDelayTaskUntil\) openQuickPanel\(task\.id, "delay"\);\s*return;/);
  assert.doesNotMatch(listSource, /onDelayTaskUntil\((?:item|task)\.id, null\)/);
  assert.match(listSource, /<DelayQuickPanel[\s\S]*onSave=\{\(nextDueOn\) => onDelayTaskUntil\?\.\(item\.id, nextDueOn\)/);
  assert.match(listSource, /<DelayQuickPanel[\s\S]*onSave=\{\(nextDueOn\) => tableProps\.onDelayTaskUntil\?\.\(task\.id, nextDueOn\)/);
});

test("normal status-circle actions still use their existing status or schedule handlers", () => {
  assert.match(tableSource, /setTaskDisplayStatus\(task\.id, status\)/);
  assert.match(tableSource, /onTaskSubtaskStatusChange\?\.\(subtaskId, nextStatus\)/);
  assert.match(listSource, /onSetDue\?\.\(item\.id, \{ dueOn: "", dueTime: "" \}, \{ manualAction: "unscheduled_status" \}\)/);
  assert.match(listSource, /onSetStatus\?\.\(item\.id, status, childTask, \[item\.id\]\)/);
  assert.match(listSource, /tableProps\.onSetStatus\?\.\(task\.id, status, task, queueMeasuredListStatusScrollAnchor\(task\.id\)\)/);
});
