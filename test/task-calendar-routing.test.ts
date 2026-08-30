import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Calendar is wired through the existing Tasks view shell and editor flows", () => {
  const app = read("../src/components/task-app.tsx");
  const shell = read("../src/components/task-app/tasks-non-list-shell.tsx");
  const content = read("../src/components/task-app/tasks-non-list-content.tsx");
  const views = read("../src/components/task-app/tasks-page.tsx");
  const calendar = read("../src/components/task-app/task-calendar-view.tsx");

  assert.match(views, /\{ label: "Calendar", value: "calendar" \}/);
  assert.match(shell, /calendarNode: ReactNode/);
  assert.match(content, /view === "calendar"/);
  assert.match(app, /import \{ TaskCalendarView \} from "\.\/task-app\/task-calendar-view"/);
  assert.match(app, /taskUiState\.includeStepsByView\.calendar/);
  assert.match(app, /calendarNode=\{calendarContentNode\}/);
  assert.match(app, /onAddTask=\{openCalendarDateTaskEditor\}/);
  assert.match(app, /onOpenTask=\{openExistingTaskEditor\}/);
  assert.match(app, /setTaskEditorInitialDraft\(\{ dueOn \}\)/);
  assert.match(app, /childTaskPreviewByParentTaskId/);
  assert.match(calendar, /groupTasksByCalendarDate\(tasks\)/);
  assert.match(calendar, /aria-label=\{`Add task due \$\{formatTaskCalendarDate\(day\.date\)\}`\}/);
  assert.match(calendar, /aria-label=\{`Show \$\{overflowTasks\.length\} more tasks/);
  assert.match(calendar, /No Due Date ·/);
  assert.match(calendar, /noDueDateTasks\.length/);
});

test("Calendar remains a metadata projection without its own scheduling authority", () => {
  const calendar = read("../src/components/task-app/task-calendar-view.tsx");
  assert.doesNotMatch(calendar, /localStorage|supabase|from\(|scheduled_on|repeat_frequency|repeat_interval|calendar_date|calendar_time/);
  assert.doesNotMatch(calendar, /onDrop|draggable|drag-to-reschedule/i);
});

test("Calendar TaskApp derivation stays before boot and auth render guards", () => {
  const app = read("../src/components/task-app.tsx");
  const taskApp = app.slice(app.indexOf("export function TaskApp()"));
  const calendarTasksIndex = taskApp.indexOf("const calendarTasks = useMemo");
  const earlyReturnIndexes = [
    taskApp.indexOf("if (!supabase) {\n    return <ConfigSplash />;"),
    taskApp.indexOf("if (!isAuthResolved) {\n    return <WorkspaceLoadingScreen theme={theme} />;"),
    taskApp.indexOf("if (!session?.user) {\n    return (\n      <AuthSplash"),
    taskApp.indexOf("if (shouldBlockAuthenticatedAppBody) {\n    return <WorkspaceLoadingScreen theme={theme} />;"),
  ];

  assert.notEqual(calendarTasksIndex, -1);
  assert.ok(earlyReturnIndexes.every((index) => index !== -1));
  assert.ok(calendarTasksIndex < Math.min(...earlyReturnIndexes));
});
