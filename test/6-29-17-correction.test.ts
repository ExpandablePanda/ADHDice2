import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Manual duration reconciliation uses the newest plan and covers every authoritative save path", async () => {
  const [app, hook, workspace] = await Promise.all([
    readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/hooks/useOnTimePlan.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/components/task-app/on-time-planner-workspace.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(hook, /const current = planRef\.current/);
  assert.match(hook, /updatePlanFromCurrent/);
  assert.match(hook, /onTimePlanSignature\(comparable\) === onTimePlanSignature\(current\)/);
  assert.match(workspace, /reconcileOnTimeManualDurationsFromTasks\(current, tasks\)/);
  assert.match(workspace, /const effectivePlan = useMemo/);
  assert.match(app, /onSetEstimatedMinutes: \(taskId, minutes\) => \{ void updateTask\(taskId, \{ estimated_minutes: minutes \}\); \}/);
  assert.match(app, /updatePlanFromCurrent=\{onTimePlan\.updatePlanFromCurrent\}/);
  assert.doesNotMatch(app, /reconcileOnTimeManualDurationAfterTaskSave/);
});

test("Table selection and On-Time deadline controls use the requested local treatments", async () => {
  const [table, workspace] = await Promise.all([
    readFile(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/task-app/on-time-planner-workspace.tsx", import.meta.url), "utf8"),
  ]);
  const strong = "border-[#ddd2ff] bg-[#f1ecff] text-[#5b3fd6] opacity-100 dark:border-[#57458f] dark:bg-[#2a2148] dark:text-[#cabfff]";
  assert.equal(table.split(strong).length - 1, 3);
  assert.match(workspace, /className=\{TASK_TABLE_ICON_LABEL_GAP_CLASS\} onClick=.*<RotateCcw size=\{12\}/);
  assert.match(workspace, /className=\{TASK_TABLE_ICON_LABEL_GAP_CLASS\} onClick=.*<Play size=\{12\}/);
  assert.match(workspace, />Reset deadline<\/TaskTableChipButton>/);
});
