import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EditableEntityHeaderTitle } from "../src/components/ui-system/editable-entity-header-title.tsx";

const sharedTitleSource = readFileSync(new URL("../src/components/ui-system/editable-entity-header-title.tsx", import.meta.url), "utf8");
const pursuitSource = readFileSync(new URL("../src/components/task-app/pursuits-workspace.tsx", import.meta.url), "utf8");
const modalSource = readFileSync(new URL("../src/components/task-app/task-view-adapters.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");

test("Task and Pursuit headers use the same shared editable title control", () => {
  assert.match(pursuitSource, /<EditableEntityHeaderTitle aria-label="Pursuit title" onChange=\{setTitle\} placeholder="Name this Pursuit" value=\{title\} \/>/);
  assert.match(modalSource, /<EditableEntityHeaderTitle aria-label="Task title" onCancel=\{cancelTaskTitle\} onChange=\{setTaskTitleDraft\} onCommit=\{commitTaskTitle\} placeholder="Name this Task" value=\{taskTitleDraft\} \/>/);
  assert.doesNotMatch(modalSource, /<h2[^>]*>\{taskTitle\}<\/h2>/);
});

test("shared title control preserves the approved Pursuit input presentation", () => {
  const markup = renderToStaticMarkup(createElement(EditableEntityHeaderTitle, {
    "aria-label": "Task title",
    onChange: () => undefined,
    placeholder: "Name this Task",
    value: "Task",
  }));

  assert.match(markup, /class="mt-1 w-full min-w-0 border-0 bg-transparent p-0 text-xl font-semibold text-\[#403a54\] outline-none placeholder:text-\[#b5aec8\] focus:ring-0 dark:text-white\/88"/);
  assert.match(sharedTitleSource, /onBlur=\{onCommit \? \(\) => \{ void onCommit\(\); \} : undefined\}/);
});

test("Task title editing commits through the canonical Task update and supports draft recovery", () => {
  const modalStart = modalSource.indexOf("export function TaskHistoryModal");
  const modal = modalSource.slice(modalStart, modalSource.indexOf("\nexport function BottomDockAdapter", modalStart));
  const flowStart = appSource.indexOf("const taskHistoryFlow");
  const flow = appSource.slice(flowStart, appSource.indexOf("\n  function togglePinnedFilter", flowStart));

  assert.match(sharedTitleSource, /event\.key === "Enter"/);
  assert.match(sharedTitleSource, /event\.key === "Escape"/);
  assert.match(modal, /const nextTitle = taskTitleDraft\.trim\(\)/);
  assert.match(modal, /if \(!nextTitle \|\| nextTitle === taskTitle\)/);
  assert.match(modal, /setTaskTitleDraft\(taskTitle\)/);
  assert.match(modal, /onCancel=\{cancelTaskTitle\}/);
  assert.match(modal, /onCommit=\{commitTaskTitle\}/);
  assert.match(modal, /onRenameTaskTitle\(task\.id, nextTitle\)/);
  assert.match(flow, /onRenameTaskTitle: \(taskId: string, nextTitle: string\): Promise<boolean> => updateTask\(taskId, \{ title: nextTitle \}\)/);
});

test("Pursuit keeps its existing form-owned title editing behavior", () => {
  assert.match(pursuitSource, /<EditableEntityHeaderTitle aria-label="Pursuit title" onChange=\{setTitle\}/);
  assert.doesNotMatch(pursuitSource, /onCommit=\{.*Pursuit/);
  assert.match(pursuitSource, /<form className="flex min-h-0 flex-1 flex-col" onSubmit=\{handleSubmit\}>/);
});
