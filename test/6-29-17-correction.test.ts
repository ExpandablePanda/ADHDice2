import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isTimedCompletionEvidenceSaved, type TimedCompletionWorkflow } from "../src/lib/task-timed-completion.ts";

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

test("timed completion records evidence state and exposes completion-only retry", async () => {
  const [app, modal, workflow] = await Promise.all([
    readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/focus-modals.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/task-timed-completion.ts", import.meta.url), "utf8"),
  ]);
  for (const phase of ["stopping_timer", "awaiting_evidence", "saving_evidence", "evidence_saved_awaiting_completion", "completing_task", "failed_completion", "complete"]) assert.match(workflow, new RegExp(phase));
  assert.match(app, /persistStoppedTaskTimer\(task\.id\)/);
  assert.match(app, /onEvidenceSaved\?\.\(insertedEntry\.id\)/);
  assert.match(app, /from\("adhdice_clean_tasks"\).*select\("\*"\)/s);
  assert.match(app, /confirmPendingTaskComplete\(true, task, intent\.completePayload\)/);
  assert.match(app, /updateTaskStatus\(task, intent\.terminalAction, true, intent\.onTimeOrigin \?\? undefined\)/);
  assert.match(app, /intent\.phase !== "failed_completion"/);
  assert.match(modal, /Retry completion/);
  assert.match(modal, /completionError/);
  assert.doesNotMatch(app, /Retry Save to avoid duplicate evidence/);
  const evidenceSaved = { evidenceId: "entry", phase: "failed_completion" } as TimedCompletionWorkflow<null>;
  assert.equal(isTimedCompletionEvidenceSaved(evidenceSaved), true);
});

test("Table selection and On-Time deadline controls use the requested local treatments", async () => {
  const [table, workspace] = await Promise.all([
    readFile(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/task-app/on-time-planner-workspace.tsx", import.meta.url), "utf8"),
  ]);
  const strong = "border-[#ddd2ff] bg-[#f1ecff] text-[#5b3fd6] opacity-100 dark:border-[#57458f] dark:bg-[#2a2148] dark:text-[#cabfff]";
  assert.equal(table.split(strong).length - 1, 2);
  assert.match(workspace, /className=\{TASK_TABLE_ICON_LABEL_GAP_CLASS\} onClick=.*<RotateCcw size=\{12\}/);
  assert.match(workspace, /className=\{TASK_TABLE_ICON_LABEL_GAP_CLASS\} onClick=.*<Play size=\{12\}/);
  assert.match(workspace, />Reset deadline<\/TaskTableChipButton>/);
});
