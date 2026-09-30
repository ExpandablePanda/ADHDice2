import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  reconcilePendingTaskRepeats,
  type PendingTaskRepeat,
  type TaskRepeatReconciliationValue,
} from "../src/lib/task-repeat-reconciliation.ts";
import { formatRepeatCompactLabel } from "../src/lib/task-repeat.ts";

const tableSource = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");
const repeatEditorSource = readFileSync(new URL("../src/components/ui/task-repeat-editor.tsx", import.meta.url), "utf8");
const batchEditorSource = readFileSync(new URL("../src/components/task-app/task-batch-edit-modal.tsx", import.meta.url), "utf8");

function repeat(overrides: Partial<TaskRepeatReconciliationValue> = {}): TaskRepeatReconciliationValue {
  return {
    repeat: "daily",
    repeatInterval: 1,
    repeatDaysOfWeek: [],
    repeatDayOfMonth: null,
    repeatMonthlyMode: "day_of_month",
    repeatMonthlyOrdinal: null,
    repeatMonthlyWeekday: null,
    ...overrides,
  };
}

function pending(value: TaskRepeatReconciliationValue, generation = 1): PendingTaskRepeat {
  return { generation, value };
}

test("Repeat editors use the exact Monthly mode copy and preserve the stored enum", () => {
  assert.match(repeatEditorSource, /REPEAT_MONTHLY_MODE_OPTIONS/);
  assert.match(batchEditorSource, /\["ordinal_weekday", "X of Every Month"\]/);
  assert.match(batchEditorSource, /getTaskRepeatEditorUnit\(currentValue\)/);
  assert.doesNotMatch(repeatEditorSource, /Week \+ weekday/);
  assert.doesNotMatch(batchEditorSource, /Week \+ weekday/);
  assert.match(repeatEditorSource, /data-repeat-editor-monthly-mode/);
  assert.match(repeatEditorSource, /data-repeat-editor-monthly-ordinal/);
  assert.match(repeatEditorSource, /data-repeat-editor-monthly-weekday/);
  assert.match(repeatEditorSource, /className="grid gap-2" data-repeat-editor-monthly-controls/);
  assert.match(repeatEditorSource, /embedded = false/);
  assert.match(repeatEditorSource, /embedded \? "grid gap-2"/);
  assert.match(repeatEditorSource, /ordinal_weekday/);
});

test("stale upstream Repeat fields are overlaid while unrelated row fields reconcile", () => {
  const intended = repeat({ repeat: "monthly", repeatDayOfMonth: 15 });
  const staleRow = { id: "task-1", title: "Updated remotely", status: "done", ...repeat({ repeat: "daily" }) };
  const result = reconcilePendingTaskRepeats([staleRow], new Map([["task-1", pending(intended)]]));

  assert.deepEqual(result.nextRows[0], {
    ...staleRow,
    ...intended,
    repeatDaysOfWeek: [],
  });
  assert.equal(result.nextRows[0]?.title, "Updated remotely");
  assert.equal(result.nextRows[0]?.status, "done");
  assert.deepEqual(result.settled, []);
});

test("matching authoritative Repeat fields settle the current generation", () => {
  const intended = repeat({ repeat: "monthly", repeatDayOfMonth: 15 });
  const result = reconcilePendingTaskRepeats(
    [{ id: "task-1", title: "Task", ...intended }],
    new Map([["task-1", pending(intended, 4)]]),
  );

  assert.deepEqual(result.nextRows[0], { id: "task-1", title: "Task", ...intended });
  assert.deepEqual(result.settled, [{ generation: 4, taskId: "task-1" }]);
});

test("a newer Repeat generation remains authoritative over an older upstream result", () => {
  const newer = repeat({ repeat: "weekly", repeatDaysOfWeek: [2, 4] });
  const result = reconcilePendingTaskRepeats(
    [{ id: "task-1", title: "Task", ...repeat({ repeat: "daily" }) }],
    new Map([["task-1", pending(newer, 2)]]),
  );

  assert.equal(result.nextRows[0]?.repeat, "weekly");
  assert.deepEqual(result.nextRows[0]?.repeatDaysOfWeek, [2, 4]);
  assert.deepEqual(result.settled, []);
});

test("compact Repeat chips reflect each optimistic editor pattern immediately", () => {
  assert.equal(formatRepeatCompactLabel("daily", 1), "Daily");
  assert.equal(formatRepeatCompactLabel("weekly", 1, [4]), "Weekly (Thu)");
  assert.equal(formatRepeatCompactLabel("monthly", 1, [], "day_of_month", null, null, 15), "15th");
  assert.equal(formatRepeatCompactLabel("monthly", 1, [], "ordinal_weekday", "second", 2), "2nd Tue");
  assert.equal(formatRepeatCompactLabel("custom", 3), "Custom");
});

test("Table Repeat edits record pending values before invoking persistence and retain the editor", () => {
  const editStart = tableSource.indexOf("function setTaskRepeatValue");
  const editEnd = tableSource.indexOf("function getRunningTimer", editStart);
  const editSource = tableSource.slice(editStart, editEnd);

  assert.ok(editStart >= 0 && editEnd > editStart);
  assert.ok(editSource.indexOf("pendingRepeatByTaskIdRef.current.set") < editSource.indexOf("onTaskRepeatChange?."));
  assert.match(editSource, /repeatMutationGenerationRef/);
  assert.match(editSource, /persistenceResult\.then/);
  assert.match(editSource, /clearPendingTaskRepeat/);
  assert.match(tableSource, /layout=\{overlayMode === "repeat" \? "stack" : "row"\}/);
  assert.match(tableSource, /className="w-full max-w-full space-y-2"/);
  assert.match(tableSource, /embedded/);
  assert.doesNotMatch(repeatEditorSource, /draft\.completionMode !== "until_complete" \|\| unit\.value === "daily"/);
  assert.doesNotMatch(batchEditorSource, /draft\.repeatCustomCompletionMode !== "until_complete" \|\| unit === "daily"/);
});
