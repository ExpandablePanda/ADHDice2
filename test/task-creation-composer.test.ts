import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("7.15.69 Home To-do metadata plumbing is removed and Home owns V6 state", () => {
  const app = read("../src/components/task-app.tsx");
  const home = read("../src/components/task-app/home-page.tsx");
  const table = read("../src/components/ui/task-management-table-v2.tsx");
  const adapter = read("../src/components/task-app/tasks-list-adapter.tsx");
  assert.doesNotMatch(app, /useHomeTodoState\(/);
  assert.match(home, /useHomeTodoState\(userId\)/);
  for (const source of [app, table, adapter]) {
    assert.doesNotMatch(source, /homeTodoTaskIds|onSetHomeTodoMembership|home_todo/);
  }
});

test("Table and List New Task restore the canonical full-editor flow", () => {
  const app = read("../src/components/task-app.tsx");
  const composer = read("../src/components/task-app/task-creation-composer.tsx");
  assert.match(app, /const openInlineNewListTaskComposer = useCallback\(\(\) => \{/);
  assert.match(app, /openInlineNewListTaskComposer[\s\S]*createTaskAndOpenSharedEditor\([\s\S]*buildNewTaskDraft\("New Task"\)/);
  assert.match(app, /openInlineNewListTaskComposer[\s\S]*routeToCurrentBucket: true/);
  assert.doesNotMatch(app, /isTaskCreationComposerOpen|taskCreationInitialTypeSelection|createTaskFromComposer/);
  assert.match(composer, /if \(isCreating \|\| !title\.trim\(\)\) return;/);
  assert.match(composer, /const createdTask = await onCreate\(/);
  assert.match(composer, /if \(createdTask && "error" in createdTask\)/);
  assert.match(composer, /resetDraft\(\);[\s\S]*onCreated\?\.\(\)/);
  assert.match(composer, /function resetDraft\(\)/);
  assert.match(composer, /function handleCancel\(\)/);
  assert.match(composer, /resetDraft\(\);[\s\S]*onCancel\(\);/);
});

test("shared creation composer exposes Home metadata semantics for Home and child creation", () => {
  const composer = read("../src/components/task-app/task-creation-composer.tsx");
  const repeatEditor = read("../src/components/ui/task-repeat-editor.tsx");
  const repeatLib = read("../src/lib/task-repeat.ts");
  for (const label of ["Task title", "Task Type", "Due date", "Due time", "Priority", "Energy", "Repeat", "Tags", "Add", "Cancel"]) {
    assert.match(composer, new RegExp(label));
  }
  assert.match(composer, /<TaskRepeatEditor/);
  assert.match(composer, /taskRepeatEditorValueToUpdate/);
  for (const repeatLabel of ["No Repeat", "Daily", "Daily Until Complete", "Weekly", "Monthly", "Custom", "Weekdays"]) {
    assert.match(repeatEditor, new RegExp(repeatLabel));
  }
  for (const field of [
    "due_on", "due_time", "energy", "priority_level", "repeat_day_of_month", "repeat_days_of_week",
    "repeat_frequency", "repeat_interval", "repeat_monthly_mode", "repeat_monthly_ordinal",
    "repeat_monthly_weekday", "tags",
  ]) {
    assert.match(`${composer}\n${repeatLib}`, new RegExp(field));
  }
  assert.match(composer, /export function TaskChildCreationComposer/);
  assert.match(composer, /submitLabel=\{`Add \$\{childLabel\}`\}/);
  assert.match(composer, /titleLabel=\{`\$\{childLabel\} title`\}/);
  assert.match(composer, /onCreateChildTask\(parentTaskId, draft\.title, draft\.taskTypeSelection, draft\.metadata\)/);
});

test("shared creation composer is shellless and locally suppresses input focus styling", () => {
  const composer = read("../src/components/task-app/task-creation-composer.tsx");
  const home = read("../src/components/task-app/home-page.tsx");
  const globals = read("../src/app/globals.css");
  assert.match(composer, /data-task-creation-composer/);
  assert.match(composer, /className="flex flex-wrap items-end gap-2 bg-white dark:bg-\[#181226\]"/);
  assert.match(composer, /className=\{`\$\{TASK_TABLE_INPUT_CLASS\} task-creation-input h-12`\}/);
  assert.doesNotMatch(composer, /health-input|task-creation-title-input|presentation|rounded-\[1rem\] border border-\[#e4def2\] bg-\[#fcfbff\] p-2\.5/);
  assert.match(home, /\{isCreateOpen \? \([\s\S]*<div className="mt-3">[\s\S]*<TaskCreationComposer/);
  assert.doesNotMatch(globals, /task-creation-title-input/);
  assert.match(globals, /\[data-task-creation-composer\][\s\S]*task-creation-input[\s\S]*border-color: #e5e0f5 !important/);
  assert.match(globals, /input\.health-input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="range"\]\):focus-visible[\s\S]*border-color: var\(--accent\) !important/);
});

test("composer keyboard focus uses control-native emphasis without changing selection wiring", () => {
  const composer = read("../src/components/task-app/task-creation-composer.tsx");
  const primitives = read("../src/components/ui/task-table-primitives.tsx");
  const globals = read("../src/app/globals.css");
  assert.match(composer, /data-task-creation-composer/);
  assert.match(composer, /<TaskTypeSelect[\s\S]*openOnFocus/);
  assert.match(globals, /\[data-task-creation-composer\] button:focus,[\s\S]*button:focus-visible \{[\s\S]*outline: none !important[\s\S]*box-shadow: none !important/);
  assert.match(globals, /button\[data-task-chip-button\]:focus-visible > \[data-task-chip-surface\][\s\S]*background: #f1ecff !important/);
  assert.match(globals, /button\[data-task-chip-button\]:focus-visible \{[\s\S]*background: transparent !important/);
  assert.match(primitives, /data-task-chip-button="true"/);
  assert.match(primitives, /data-task-chip-surface="true"/);
  assert.match(globals, /button\[data-task-icon-surface\]:focus-visible/);
  assert.match(read("../src/components/ui-system/adhd-icon-button.tsx"), /data-task-icon-surface="true"/);
  assert.match(composer, /onClick=\{\(\) => setPriority\(value\)\}/);
  assert.match(composer, /onClick=\{\(\) => setEnergy\(option\.value\)\}/);
});

test("Task Type selector options are title/icon only while descriptions remain available", () => {
  const identity = read("../src/components/task-app/task-type-identity.tsx");
  const settings = read("../src/components/task-app/task-type-behavior-settings.tsx");
  assert.match(identity, /showDescription = true/);
  assert.match(identity, /const detail = showDescription \? description \?\? option\.description : undefined/);
  assert.match(identity, /<TaskTypeIdentity compact=\{isCompact\} dense=\{isCompact\} option=\{option\} showDescription=\{false\}/);
  assert.match(settings, /<TaskTypeIdentity option=\{selectedOption\} \/>/);
});

test("Task Type open-on-focus is opt-in and keeps the default selector behavior", () => {
  const taskTypeSelect = read("../src/components/task-app/task-type-identity.tsx");
  assert.match(taskTypeSelect, /openOnFocus = false/);
  assert.match(taskTypeSelect, /openOnFocus\?: boolean/);
  assert.match(taskTypeSelect, /if \(openOnFocus && !isOpen\) openMenu\(\)/);
  assert.match(taskTypeSelect, /if \(event\.key === "Tab"\)[\s\S]*if \(isOpen\) closeMenu\(\)/);
  assert.match(taskTypeSelect, /event\.key === "ArrowDown" \|\| event\.key === "ArrowUp"/);
  assert.match(taskTypeSelect, /event\.key === "Enter" \|\| event\.key === " "/);
  assert.doesNotMatch(taskTypeSelect, /openOnFocus: true/);
});

test("Table, List, Task Type menu, and keyboard New Task share the corrected full-editor route", () => {
  const app = read("../src/components/task-app.tsx");
  const tasksPage = read("../src/components/task-app/tasks-page.tsx");
  assert.match(app, /onOpenComposer: openInlineNewListTaskComposer/);
  assert.match(app, /<TasksTableAdapter[\s\S]*panelProps=\{listPanelProps\}/);
  assert.match(app, /<TasksListAdapter[\s\S]*panelProps=\{listPanelProps\}/);
  assert.match(tasksPage, /onOpenTaskComposerForType\(option\.value\)/);
  assert.match(app, /onOpenTaskComposerForType: openTaskComposerForType/);
  assert.match(app, /void openInlineNewListTaskComposer\(\)/);
  assert.match(app, /onOpenComposer: openInlineNewListTaskComposer/);
  assert.match(app, /const openTaskComposerForType = useCallback\(\(selectionValue: string\) =>/);
  assert.match(app, /openTaskComposerForType[\s\S]*createTaskAndOpenSharedEditor\([\s\S]*task_type: selection\.taskType/);
  assert.doesNotMatch(app, /onOpenComposer: \(\) => <TaskCreationComposer/);
});

test("Home keeps its own creation behavior while reusing the shared form", () => {
  const home = read("../src/components/task-app/home-page.tsx");
  assert.match(home, /<TaskCreationComposer/);
  assert.match(home, /onCreate=\{handleCreateTask\}/);
  assert.match(home, /createHomeTodoTask\(/);
  assert.match(home, /activeHomeTab === "todo"/);
  assert.match(home, /onSetRoutineMembership\(createdTask\.id, true\)/);
});
