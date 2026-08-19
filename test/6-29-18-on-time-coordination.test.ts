import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { clearMatchingOnTimeExecution, createEmptyOnTimePlan, type OnTimePlanV3 } from "../src/lib/on-time-plan-state.ts";

const execution = { plannedSeconds: 900, startedAt: "2026-07-14T12:00:00.000Z" };
const linkedItem = (id: string, occurrenceKey: string) => ({
  durationSource: "manual" as const,
  execution,
  hierarchySnapshot: [],
  id,
  kind: "task" as const,
  occurrenceDueOn: "2026-07-14",
  occurrenceKey,
  plannedSeconds: 900,
  taskId: "task-1",
  titleSnapshot: id,
});

test("execution clearing is occurrence-exact, preserves other items, and is idempotent", () => {
  const plan: OnTimePlanV3 = { ...createEmptyOnTimePlan(), items: [linkedItem("item-a", "occ-a"), linkedItem("item-b", "occ-b")] };
  const origin = { itemId: "item-a", occurrenceDueOn: "2026-07-14", occurrenceKey: "occ-a", taskId: "task-1" };
  const cleared = clearMatchingOnTimeExecution(plan, origin);
  assert.equal(cleared?.items[0]?.execution, null);
  assert.deepEqual(cleared?.items[1]?.execution, execution);
  assert.equal(clearMatchingOnTimeExecution(cleared!, origin), null);
  assert.equal(clearMatchingOnTimeExecution(plan, { ...origin, occurrenceKey: "occ-b" }), null);
});

test("Finish and Log stops the active timer, records actual seconds, and clears execution", async () => {
  const [app, workspace] = await Promise.all([
    readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/task-app/on-time-planner-workspace.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(workspace, /Finish &amp; Log/);
  assert.match(workspace, /terminalStatuses: TaskStatus\[\] = \["done", "did_my_best", "complete"\]/);
  assert.match(workspace, /timer \? <><TaskTableChipButton[\s\S]*<FinishAndLogControl/);
  assert.match(app, /stageTimedTaskCompletion\(task, \{ kind: "status", status \}, onTimeOrigin\)/);
  assert.match(app, /async function recordStoppedTaskTimer/);
  assert.match(app, /actual_seconds: nextActualSeconds/);
  assert.match(app, /clearOnTimeExecution\(onTimeOrigin\)/);
});

test("On-Time action availability and Finish and Log use the shared resolved Active Status", async () => {
  const workspace = await readFile(new URL("../src/components/task-app/on-time-planner-workspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /const unavailable = !task \|\| !resolvedStatus \|\| resolvedStatus === "trashed"/);
  assert.match(workspace, /<FinishAndLogControl currentStatus=\{resolvedStatus\}/);
  assert.doesNotMatch(workspace, /const unavailable[^\n]*task\.status/);
  assert.doesNotMatch(workspace, /FinishAndLogControl[^\n]*currentStatus=\{task\.status\}/);
});

test("selected Routine and Pinned icons fill only when selected", async () => {
  const table = await readFile(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");
  const selected = "border-[#ddd2ff] bg-[#f1ecff] text-[#5b3fd6] opacity-100 dark:border-[#57458f] dark:bg-[#2a2148] dark:text-[#cabfff]";
  assert.equal(table.split(selected).length - 1, 3);
  assert.match(table, /<Pin className=\{`h-3\.5 w-3\.5 stroke-current stroke-\[2\.5\] \$\{isPinned \? "fill-current" : ""\}`\}/);
  assert.match(table, /<ListTodo className=\{`h-3\.5 w-3\.5 stroke-current stroke-\[2\.5\] \$\{isRoutine \? "fill-current" : ""\}`\}/);
  assert.doesNotMatch(table, /<Pin[^>]*\? "" : "fill-current"/);
  assert.doesNotMatch(table, /<ListTodo[^>]*\? "" : "fill-current"/);
  assert.doesNotMatch(table.slice(table.indexOf('aria-label={isPinned'), table.indexOf('aria-label="Add Step"')), /bg-\[#6f57f6\] text-white/);
});

test("On-Time icon-label chips and canonical UI contracts use the shared gap", async () => {
  const [workspace, primitives, guide] = await Promise.all([
    readFile(new URL("../src/components/task-app/on-time-planner-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/ui/task-table-primitives.tsx", import.meta.url), "utf8"),
    readFile(new URL("../docs/UI_SYSTEM.md", import.meta.url), "utf8"),
  ]);
  assert.match(primitives, /TASK_TABLE_ICON_LABEL_GAP_CLASS = "gap-1\.5"/);
  for (const label of ["Pause task timer", "Resume task timer", "Stop &amp; Save task timer", "Start deadline", "Restart deadline", "Finish &amp; Log"]) {
    const index = workspace.indexOf(label);
    assert.notEqual(index, -1, label);
    assert.match(workspace.slice(Math.max(0, index - 260), index), /TASK_TABLE_ICON_LABEL_GAP_CLASS/);
  }
  assert.match(guide, /gap-1\.5/);
});
