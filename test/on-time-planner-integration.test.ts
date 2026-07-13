import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("On-Time opens the shared overlay in place without Table navigation or reveal", async () => {
  const source = await readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
  assert.match(source, /onOpenTask=\{openTaskInSharedTasksEditorFromOnTime\}/);
  const onTimeOpen = source.slice(source.indexOf("const openTaskInSharedTasksEditorFromOnTime"), source.indexOf("const returnToOnTimeAfterSharedOverlay"));
  assert.match(onTimeOpen, /setOnTimeSharedOverlayTaskId\(taskId\)/);
  assert.doesNotMatch(onTimeOpen, /tasksSurface|setRequestedListOverlayTaskId|setSuppressDetachedListNoticeTaskId/);
  assert.match(source, /showTableOverlayOnTime=\{Boolean\(onTimeSharedOverlayTaskId\)\}/);
  assert.match(source, /setOnTimeSharedOverlayTaskId\(null\)/);
  assert.doesNotMatch(source.slice(source.indexOf("<OnTimePlannerWorkspace"), source.indexOf("</OnTimePlannerWorkspace>") + 1), /onOpenTask=\{openTaskEditorFromId\}/);
});

test("linked planner cards use the shared status circle rail and guarded root save path", async () => {
  const [workspace, appSource] = await Promise.all([
    readFile(new URL("../src/components/task-app/on-time-planner-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(workspace, /renderTaskStatusCircle\(task\.status, "sm"\)/);
  assert.match(workspace, /TaskStatusCircleRail/);
  assert.match(workspace, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(workspace, /!unavailable && !stale && task/);
  assert.match(appSource, /onSetTaskStatus=\{\(task, status\) => \{ void updateTaskStatus\(task, status\); \}\}/);
});

test("planner Stop and Save delegates to the shared tray workflow without direct evidence writes", async () => {
  const [workspace, appSource, sortable] = await Promise.all([
    readFile(new URL("../src/components/task-app/on-time-planner-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/task-app/on-time-planner-sortable-list.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(workspace, /onStopAndSave\(task\.id\)/);
  assert.match(appSource, /onStopAndSaveTimer=\{stopHudTaskTimer\}/);
  assert.doesNotMatch(workspace, /task_actual_time_entries|insert\(|upsert\(/);
  assert.match(sortable, /requestAnimationFrame/);
  assert.match(sortable, /onLostPointerCapture/);
  assert.match(sortable, /onPointerCancel/);
  assert.match(sortable, /cancelDrag/);
  assert.match(sortable, /suppressClickRef/);
});
