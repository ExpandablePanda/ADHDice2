import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canTaskDelay, getSelectableTaskDisplayStatusesForTask, getSelectableTaskStatusesForTask } from "../src/lib/task-complete.ts";

const tableSource = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");
const listSource = readFileSync(new URL("../src/components/task-app/tasks-list-adapter.tsx", import.meta.url), "utf8");
const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");

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
  assert.match(listSource, /if \(status === "delayed"\) \{[\s\S]*canTaskDelay\(\{ dueOn: item\.dueOn, status: displayStatus \}\)[\s\S]*onOpenQuickPanel\(item\.id, "delay"\);/);
  assert.match(listSource, /if \(status === "delayed"\) \{[\s\S]*canTaskDelay\(\{ dueOn: task\.due_on, status: displayStatus \}\)[\s\S]*openQuickPanel\(task\.id, "delay"\);/);
  assert.doesNotMatch(listSource, /onDelayTaskUntil\((?:item|task)\.id, null\)/);
  assert.match(listSource, /<DelayQuickPanel[\s\S]*onSave=\{\(nextDueOn\) => onDelayTaskUntil\?\.\(item\.id, nextDueOn\)/);
  assert.match(listSource, /<DelayQuickPanel[\s\S]*onSave=\{\(nextDueOn\) => tableProps\.onDelayTaskUntil\?\.\(task\.id, nextDueOn\)/);
});

test("all client Delay surfaces share scheduled-occurrence eligibility", () => {
  for (const surface of ["parent", "step", "substep"]) {
    assert.equal(canTaskDelay({ dueOn: null, status: "unscheduled" }), false, surface);
    assert.equal(getSelectableTaskDisplayStatusesForTask({ dueOn: "", repeatFrequency: "weekly", status: "unscheduled" }).includes("delayed"), false, surface);
    assert.equal(getSelectableTaskStatusesForTask({ dueOn: "", repeatFrequency: "weekly", status: "pending" }).includes("delayed"), false, surface);
    assert.equal(canTaskDelay({ dueOn: "2026-08-05", status: "pending" }), true, surface);
    assert.equal(getSelectableTaskDisplayStatusesForTask({ dueOn: "2026-08-05", repeatFrequency: "weekly", status: "pending" }).includes("delayed"), true, surface);
  }
  for (const status of ["archived", "complete", "did_my_best", "done", "trashed"] as const) {
    assert.equal(canTaskDelay({ dueOn: "2026-08-05", status }), false, status);
  }
  assert.match(tableSource, /canTaskDelay\(\{ dueOn: task\.dueOn, status: task\.status \}\)/);
  assert.match(tableSource, /getSelectableTaskDisplayStatusesForTask/);
  assert.match(listSource, /getSelectableTaskDisplayStatusesForTask/);
  assert.match(taskAppSource, /canTaskDelay\(\{ dueOn: task\.due_on, status: task\.status \}\)/);
});

test("normal status-circle actions still use their existing status or schedule handlers", () => {
  assert.match(tableSource, /setTaskDisplayStatus\(task\.id, status\)/);
  assert.match(tableSource, /onTaskSubtaskStatusChange\?\.\(subtaskId, nextStatus\)/);
  assert.match(listSource, /onSetDue\?\.\(item\.id, \{ dueOn: "", dueTime: "" \}, \{ manualAction: "unscheduled_status" \}\)/);
  assert.match(listSource, /onSetStatus\?\.\(item\.id, status, childTask, \[item\.id\]\)/);
  assert.match(listSource, /tableProps\.onSetStatus\?\.\(task\.id, status, task, queueMeasuredListStatusScrollAnchor\(task\.id\)\)/);
});
