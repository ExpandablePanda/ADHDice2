import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the legacy TaskEditorModal and its production routes are retired", () => {
  assert.equal(existsSync(new URL("../src/components/task-app/task-editor-modal.tsx", import.meta.url)), false);

  const productionSources = [
    read("../src/components/task-app.tsx"),
    read("../src/components/task-app/task-edit-flows.tsx"),
    read("../src/hooks/useTaskEditorImportController.ts"),
    read("../src/hooks/useTaskUiState.ts"),
  ];
  for (const source of productionSources) {
    for (const legacyContract of [
      "TaskEditorModal",
      "openNewTaskEditor",
      "openEditTaskEditor",
      "isTaskEditorOpen",
      "taskEditorMode",
      "taskEditorTaskId",
      "taskEditorInitialDraft",
      "taskEditorFlow",
      "pendingTaskEditorRestore",
    ]) {
      assert.doesNotMatch(source, new RegExp(`\\b${legacyContract}\\b`), legacyContract);
    }
  }

  const app = productionSources[0];
  assert.match(app, /sharedTaskEditorOverlayTaskId/);
  assert.match(app, /<TaskManagementTableV2[\s\S]*requestedOpenTaskId=\{sharedTaskEditorOverlayTaskId\}/);
  assert.doesNotMatch(read("../src/lib/task-ui-state.ts"), /TASK_EDITOR_UI_STORAGE_KEY|PersistedTaskEditorUiState/);
});

test("all migrated creation routes create canonically before opening the shared editor", () => {
  const app = read("../src/components/task-app.tsx");
  const helper = app.slice(app.indexOf("const createTaskAndOpenSharedEditor"), app.indexOf("const openCalendarDateTaskEditor"));
  assert.match(helper, /await addTask\(initialTaskValues\)/);
  assert.ok(helper.indexOf("await addTask(initialTaskValues)") < helper.indexOf("openExistingTaskEditor(createdTask)"));

  const calendar = app.slice(app.indexOf("const openCalendarDateTaskEditor"), app.indexOf("const openInlineNewListTaskComposer"));
  assert.match(calendar, /createTaskAndOpenSharedEditor\([\s\S]*due_on: dueOn/);
  assert.match(calendar, /routeToCurrentBucket: true/);

  const normal = app.slice(app.indexOf("const openInlineNewListTaskComposer"), app.indexOf("const duplicateTaskInPlace"));
  assert.match(normal, /createTaskAndOpenSharedEditor\(buildNewTaskDraft\("New Task"\)/);
  assert.match(normal, /routeToCurrentBucket: true/);

  const health = app.slice(app.indexOf("const openHealthReminderTemplate"), app.indexOf("const openScratchLinkedTaskTemplate"));
  assert.match(health, /estimated_minutes: template\.estimatedMinutes/);
  assert.match(health, /repeat_day_of_month: template\.repeatDayOfMonth/);
  assert.match(health, /repeat_days_of_week: template\.repeatDaysOfWeek/);
  assert.match(health, /repeat_frequency: template\.repeatFrequency/);
  assert.match(health, /repeat_interval: template\.repeatInterval/);
  assert.match(health, /tags: template\.tags/);
  assert.match(health, /createTaskAndOpenSharedEditor/);

  const scratch = app.slice(app.indexOf("const openScratchLinkedTaskTemplate"), app.indexOf("const {\n    deferTask"));
  assert.match(scratch, /createTaskAndOpenSharedEditor\(buildNewTaskDraft\(title\)\)/);
});
