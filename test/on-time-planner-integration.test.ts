import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("On-Time opens the shared overlay in place and requests Estimated Time", async () => {
  const [source, workspace] = await Promise.all([
    readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/task-app/on-time-planner-workspace.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(source, /onOpenTask=\{openTaskInSharedTasksEditorFromOnTime\}/);
  const onTimeOpen = source.slice(source.indexOf("const openTaskInSharedTasksEditorFromOnTime"), source.indexOf("const closeSharedTaskEditorOverlay"));
  assert.match(onTimeOpen, /openSharedTaskEditor\(taskId, \{ initialField: "estimated_time" \}\)/);
  assert.doesNotMatch(onTimeOpen, /tasksSurface|setRequestedListOverlayTaskId|setSuppressDetachedListNoticeTaskId/);
  assert.match(source, /showSharedTaskEditorOverlay=\{Boolean\(sharedTaskEditorOverlayTaskId\)\}/);
  assert.match(source, /setSharedTaskEditorOverlayTaskId\(null\)/);
  assert.match(workspace, /!unavailable && !stale && task/);
  assert.match(workspace, /onClick=\{\(\) => onOpen\(task\.id\)\}>Open/);
  assert.doesNotMatch(source.slice(source.indexOf("<OnTimePlannerWorkspace"), source.indexOf("</OnTimePlannerWorkspace>") + 1), /onOpenTask=\{openTaskEditorFromId\}/);
});

test("linked planner cards use the shared status circle rail and guarded root save path", async () => {
  const [workspace, appSource] = await Promise.all([
    readFile(new URL("../src/components/task-app/on-time-planner-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(workspace, /renderTaskStatusCircle\(currentStatus, "sm"\)/);
  assert.match(workspace, /TaskStatusCircleRail/);
  assert.match(workspace, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(workspace, /!unavailable && !stale && task/);
  assert.match(appSource, /onSetTaskStatus=\{\(task, status, origin\) => \{ void updateTaskStatus\(task, status, false, origin\); \}\}/);
  assert.match(appSource, /taskDisplayStatusByTaskId=\{taskDisplayStatusByTaskId\}/);
  assert.match(workspace, /TaskStatusCircleRail currentStatus=\{currentStatus\}/);
  assert.match(workspace, /hierarchySnapshot: buildOnTimeHierarchy\(task, tasksById\), execution: null/);
});

test("planner Stop and Save delegates to the shared tray workflow without direct evidence writes", async () => {
  const [workspace, appSource, sortable] = await Promise.all([
    readFile(new URL("../src/components/task-app/on-time-planner-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/task-app/on-time-planner-sortable-list.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(workspace, /onStopAndSave\(task\.id, origin\)/);
  assert.match(appSource, /onStopAndSaveTimer=\{\(taskId, origin\) => stopHudTaskTimer\(taskId, origin\)\}/);
  assert.doesNotMatch(workspace, /task_actual_time_entries|insert\(|upsert\(/);
  assert.match(sortable, /requestAnimationFrame/);
  assert.match(sortable, /onLostPointerCapture/);
  assert.match(sortable, /onPointerCancel/);
  assert.match(sortable, /cancelDrag/);
  assert.match(sortable, /suppressClickRef/);
});

test("planner execution controls persist anchored deadlines without interval writes", async () => {
  const [workspace, hook] = await Promise.all([
    readFile(new URL("../src/components/task-app/on-time-planner-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/hooks/useOnTimePlan.ts", import.meta.url), "utf8"),
  ]);
  assert.match(workspace, /createElapsedAwareOnTimeExecutionSnapshot\(\{ elapsedSeconds: elapsed, intent, plannedSeconds: item\.plannedSeconds, startedAt \}\)/);
  assert.match(workspace, /intent === "start" && item\.kind === "task"/);
  assert.match(workspace, /if \(!task \|\| !await onStart\(task, startedAt\)\) return;/);
  assert.match(workspace, /startExecution\("restart"\)/);
  assert.match(workspace, /item\.plannedSeconds \? <TaskTableChipButton[\s\S]*Restart deadline/);
  assert.match(workspace, /onPatch\(\{ execution \}\)/);
  assert.match(workspace, /onPatch\(\{ execution: null \}\)/);
  assert.match(workspace, /Start deadline/);
  assert.match(workspace, /Reset deadline/);
  assert.match(workspace, /Restart deadline/);
  assert.match(workspace, /visibilitychange/);
  assert.match(workspace, /pageshow/);
  assert.doesNotMatch(workspace, /setInterval\([^)]*updatePlan/);
  assert.doesNotMatch(hook, /setInterval/);
});

test("Start accepts only occurrence-matching timers while Restart leaves timers untouched", async () => {
  const [workspace, appSource] = await Promise.all([
    readFile(new URL("../src/components/task-app/on-time-planner-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8"),
  ]);
  const startHandler = workspace.slice(workspace.indexOf("const startExecution"), workspace.indexOf("const timingControls"));
  assert.match(startHandler, /intent === "start"/);
  assert.match(startHandler, /await onStart\(task, startedAt\)/);
  assert.match(appSource, /!occurrenceIdentityMatches\(existing, evidence\)/);
  assert.match(appSource, /another occurrence is already active/);
  const controlStart = workspace.indexOf("const timingControls");
  const restartControl = workspace.slice(controlStart, workspace.indexOf('if (item.kind === "temporary")', controlStart));
  assert.match(restartControl, /startExecution\("restart"\)/);
  assert.doesNotMatch(restartControl, /onStart/);
});
