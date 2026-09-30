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
  for (const label of ["Task title", "Task Type", "Due date", "Due time", "Priority", "Energy", "Repeat", "Tags", "Add", "Cancel"]) {
    assert.match(composer, new RegExp(label));
  }
  for (const repeatLabel of ["No Repeat", "Daily", "Daily Until Complete", "Weekly", "Monthly", "Custom Cadence", "Weekdays"]) {
    assert.match(composer, new RegExp(repeatLabel));
  }
  for (const field of [
    "due_on", "due_time", "energy", "priority_level", "repeat_day_of_month", "repeat_days_of_week",
    "repeat_frequency", "repeat_interval", "repeat_monthly_mode", "repeat_monthly_ordinal",
    "repeat_monthly_weekday", "tags",
  ]) {
    assert.match(composer, new RegExp(field));
  }
  assert.match(composer, /export function TaskChildCreationComposer/);
  assert.match(composer, /submitLabel=\{`Add \$\{childLabel\}`\}/);
  assert.match(composer, /titleLabel=\{`\$\{childLabel\} title`\}/);
  assert.match(composer, /onCreateChildTask\(parentTaskId, draft\.title, draft\.taskTypeSelection, draft\.metadata\)/);
  assert.match(composer, /presentation="inline-child"/);
  assert.match(composer, /rounded-\[1rem\] border border-\[#e4def2\]/);
  assert.match(composer, /presentation === "inline-child"[\s\S]*bg-white/);
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
