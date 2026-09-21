import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildTaskTypeSelectionOptions,
  formatTaskTypeLabel,
  isTaskType,
  matchesTaskTypeSelection,
  matchesTaskTypeSelections,
  normalizeTaskType,
  parseTaskType,
  resolveTaskTypeSelection,
  TASK_TYPE_OPTIONS,
  taskTypeSelectionValue,
  type TaskType,
} from "../src/lib/task-type.ts";
import { DEFAULT_CUSTOM_TASK_TYPE_PRESENTATION, resolveTaskTypeAccent, resolveTaskTypeIcon } from "../src/lib/task-type-presentation.ts";
import { createTask } from "../src/lib/task-buckets.ts";
import { buildNewTaskDraft } from "../src/components/task-app/task-editor-model.ts";
import { buildChildTaskCreationDraft } from "../src/lib/task-child-creation.ts";

test("TaskType exposes only current Task and named Custom values", () => {
  assert.deepEqual(TASK_TYPE_OPTIONS.map((option) => option.value), ["task"]);
  for (const taskType of ["task", "custom"] as TaskType[]) {
    assert.equal(isTaskType(taskType), true);
    assert.equal(normalizeTaskType(taskType), taskType);
    assert.equal(formatTaskTypeLabel(taskType), taskType === "custom" ? "Custom Task Type (legacy)" : taskType[0].toUpperCase() + taskType.slice(1));
  }
  assert.equal(isTaskType("goal"), false);
  assert.equal(parseTaskType("goal"), null);
  assert.throws(() => normalizeTaskType("goal"), /retired/);
  assert.throws(() => formatTaskTypeLabel("goal"), /retired/);
  assert.equal(isTaskType("pursuit"), false);
  assert.equal(parseTaskType("pursuit"), null);
  assert.equal(normalizeTaskType(undefined), "task");
  assert.equal(normalizeTaskType(null), "task");
  assert.equal(normalizeTaskType("legacy"), "task");
});

test("named Custom Task Types extend the shared selection model without becoming TaskType values", () => {
  const rulesets = [
    { id: "routine", name: "Routine", task_type: "custom" as const, icon_key: "repeat", accent_key: "blue", description: "Repeats" },
    { id: "practice", name: "Practice", task_type: "custom" as const, icon_key: "music", accent_key: "teal", description: "Practice time" },
  ];
  assert.deepEqual(buildTaskTypeSelectionOptions(rulesets).map((option) => option.label), ["Task", "Practice", "Routine"]);
  assert.deepEqual(buildTaskTypeSelectionOptions(rulesets).find((option) => option.value === "practice"), { accentKey: "teal", description: "Practice time", iconKey: "music", label: "Practice", value: "practice" });
  assert.deepEqual(resolveTaskTypeSelection("practice", rulesets), { taskType: "custom", customRulesetId: "practice" });
  assert.equal(resolveTaskTypeSelection("custom", rulesets), null);
  assert.deepEqual(resolveTaskTypeSelection("task", rulesets), { taskType: "task", customRulesetId: null });
  assert.equal(resolveTaskTypeSelection("goal", rulesets), null);
  assert.equal(taskTypeSelectionValue("custom", "practice", rulesets), "practice");
  assert.equal(formatTaskTypeLabel("custom", "practice", rulesets), "Practice");
  assert.equal(formatTaskTypeLabel("custom", "practice", [{ id: "practice", name: "Guitar Practice", task_type: "custom" }]), "Guitar Practice");
  assert.equal(formatTaskTypeLabel("custom", null, rulesets), "Custom Task Type (legacy)");
});

test("Task Type presentation registry fails closed for unknown persisted keys", () => {
  const option = buildTaskTypeSelectionOptions([{ id: "legacy", name: "Legacy", task_type: "custom" as const, icon_key: "unknown-icon", accent_key: "unknown-accent", description: "  legacy copy  " }])[1];
  assert.equal(option?.iconKey, DEFAULT_CUSTOM_TASK_TYPE_PRESENTATION.iconKey);
  assert.equal(option?.accentKey, DEFAULT_CUSTOM_TASK_TYPE_PRESENTATION.accentKey);
  assert.equal(option?.description, "legacy copy");
  assert.equal(resolveTaskTypeIcon("unknown-icon"), resolveTaskTypeIcon("list-todo"));
  assert.equal(resolveTaskTypeAccent("unknown-accent").key, "purple");
});

test("deleted named rulesets stay available to historical labels but not current selectors", () => {
  const rulesets = [{ id: "retired", name: "Practice", task_type: "custom" as const, deleted_at: "2026-09-11T00:00:00.000Z" }];
  assert.deepEqual(buildTaskTypeSelectionOptions(rulesets).map((option) => option.label), ["Task"]);
  assert.equal(resolveTaskTypeSelection("retired", rulesets), null);
  assert.equal(taskTypeSelectionValue("custom", "retired", rulesets), "custom");
  assert.equal(formatTaskTypeLabel("custom", "retired", rulesets), "Practice");
});

test("Task Type filters distinguish Task and named rulesets by projection", () => {
  assert.equal(matchesTaskTypeSelection("task", null, "task"), true);
  assert.equal(matchesTaskTypeSelection("custom", null, "custom"), false);
  assert.equal(matchesTaskTypeSelection("custom", "practice", "custom"), false);
  assert.equal(matchesTaskTypeSelection("custom", "practice", "practice"), true);
  assert.equal(matchesTaskTypeSelection("custom", "discipline", "practice"), false);
  assert.equal(matchesTaskTypeSelections("custom", "practice", ["task", "practice"]), true);
  assert.equal(matchesTaskTypeSelections("custom", null, ["task", "practice"]), false);
});

test("Table View owns a Task Type column and reuses the shared label/filter authorities", () => {
  const tableSource = readFileSync("src/components/ui/task-management-table-v2.tsx", "utf8");
  const taskAppSource = readFileSync("src/components/task-app.tsx", "utf8");
  const uiStateSource = readFileSync("src/lib/task-ui-state.ts", "utf8");
  assert.match(tableSource, /id: "task_type", label: "Task Type"/);
  assert.match(tableSource, /buildTaskTypeSelectionOptions\(customBehaviorRulesets\)/);
  assert.match(tableSource, /formatTaskTypeLabel\(task\.taskType, task\.customRulesetId, customBehaviorRulesets\)/);
  assert.match(tableSource, /matchesTaskTypeSelections\(task\.taskType, task\.customRulesetId, structuredFilters\.task_type\)/);
  assert.doesNotMatch(tableSource, /Custom Default/);
  assert.match(tableSource, /const missingColumns = HEADER_COLUMNS\.map/);
  assert.match(tableSource, /return \[\.\.\.validStoredOrder, \.\.\.missingColumns\]/);
  assert.match(taskAppSource, /setActivePage\("Tasks"\)/);
  assert.match(taskAppSource, /taskType: \[rulesetId\]/);
  assert.match(taskAppSource, /moveAssignedTasksToTaskAndDeleteRuleset/);
  assert.match(taskAppSource, /updateTask\(taskId, \{ task_type: "task", custom_ruleset_id: null \}\)/);
  assert.match(taskAppSource, /deleteRuleset: \(\) => deleteCustomRuleset\(rulesetId\)/);
  assert.match(uiStateSource, /task_type/);
  assert.match(uiStateSource, /withNotes\.includes\("task_type"\)/);
});

test("Batch Edit exposes shared Task Type choices with an unchanged option", () => {
  const modalSource = readFileSync("src/components/task-app/task-batch-edit-modal.tsx", "utf8");
  const batchHookSource = readFileSync("src/hooks/useTaskBatchEditAction.ts", "utf8");
  assert.match(modalSource, /buildTaskTypeSelectionOptions\(customBehaviorRulesets\)/);
  assert.match(modalSource, /label: "Leave unchanged", value: "unchanged"/);
  assert.match(modalSource, /<TaskTypeSelect/);
  assert.match(modalSource, /value=\{draft\.taskType\}/);
  assert.match(batchHookSource, /resolveTaskTypeSelection\(draft\.taskType, customBehaviorRulesets\)/);
  assert.match(batchHookSource, /deferBehaviorSelectionRefresh: hasBehaviorSelectionMutation/);
  assert.match(batchHookSource, /refreshCustomBehaviorRulesets\(\)/);
  assert.doesNotMatch(batchHookSource, /Promise\.all/);
});

test("anonymous Custom assignments are invalid while named Custom display remains authoritative", () => {
  const migration = readFileSync("supabase/20260913000000_remove_anonymous_custom_task_type_7_13_58.sql", "utf8");
  const schema = readFileSync("supabase/schema.sql", "utf8");
  assert.match(migration, /update\s+public\.adhdice_clean_tasks[\s\S]*where task_type = 'custom'[\s\S]*custom_ruleset_id is null/i);
  assert.match(migration, /update\s+public\.adhdice_task_behavior_selections[\s\S]*where task_type = 'custom'[\s\S]*custom_ruleset_id is null/i);
  assert.match(migration, /delete\s+from\s+public\.adhdice_task_type_behavior_profiles[\s\S]*where task_type = 'custom'/i);
  assert.doesNotMatch(migration, /custom_ruleset_id is not null[\s\S]*set task_type = 'task'/i);
  assert.match(schema, /\(task_type = 'custom' and custom_ruleset_id is not null\)[\s\S]*\(task_type = 'task' and custom_ruleset_id is null\)/i);
  assert.match(schema, /Custom behavior selections require a named Custom Task Type/i);
  assert.doesNotMatch(schema, /constraint adhdice_task_type_behavior_profiles_task_type_check\s*\n\s*check \(task_type in \('task', 'goal', 'custom'\)\)/i);
});

test("normal and child Task creation default TaskType to task", () => {
  assert.equal(buildNewTaskDraft("New Task").task_type, "task");
  const child = buildChildTaskCreationDraft({ parentTaskId: "parent-1", title: "Step" });
  assert.equal(child.ok, true);
  assert.equal(child.draft?.task_type, "task");
  assert.equal(child.draft?.custom_ruleset_id, null);
  assert.equal(createTask({ id: "task-1", title: "Task", status: "pending", created_at: "2026-09-08", sort_order: 0 }).task_type, "task");
});

test("child Task creation persists the resolved type in its initial draft and fails closed for stale choices", () => {
  const rulesets = [{ id: "practice", name: "Practice", task_type: "custom" as const }];
  const namedSelection = resolveTaskTypeSelection("practice", rulesets);
  const namedChild = buildChildTaskCreationDraft({ parentTaskId: "parent-1", taskTypeSelection: namedSelection, title: "Practice step" });
  assert.equal(namedChild.ok, true);
  assert.equal(namedChild.draft?.task_type, "custom");
  assert.equal(namedChild.draft?.custom_ruleset_id, "practice");

  const staleChild = buildChildTaskCreationDraft({ parentTaskId: "parent-1", taskTypeSelection: null, title: "Stale step" });
  assert.deepEqual(staleChild, { draft: null, error: "invalid_task_type", ok: false });
});

test("Table and List child creators expose shared Task Type choices and pass them to canonical creation", () => {
  const appSource = readFileSync("src/components/task-app.tsx", "utf8");
  const tableSource = readFileSync("src/components/ui/task-management-table-v2.tsx", "utf8");
  const listSource = readFileSync("src/components/task-app/tasks-list-adapter.tsx", "utf8");
  assert.match(appSource, /const taskTypeSelection = resolveTaskTypeSelection\(selectionValue, customBehaviorRulesets\)/);
  assert.match(appSource, /taskTypeSelection,\s*title/);
  assert.match(appSource, /invalid_task_type/);
  assert.match(tableSource, /<TaskTypeSelect[\s\S]*options=\{taskTypeFilterOptions\}/);
  assert.match(listSource, /<TaskTypeSelect[\s\S]*options=\{taskTypeOptions\}/);
  assert.match(tableSource, /onCreateChildTask\(parentTaskId, nextTitle, tableStepDraftTaskTypeValues/);
  assert.match(listSource, /onCreateChildTask\(parentTaskId, nextTitle, taskTypeSelectionValue\)/);
  assert.match(listSource, /onCreateChildTask\?\.\(parentTaskId, title, substepTaskTypeSelectionValue\)/);
  assert.match(tableSource, /setTaskTypeSelectionValue\("task"\)/);
  assert.match(tableSource, /setTableStepDraftTaskTypeValues\(\(current\) =>/);
  assert.match(listSource, /setSubstepTaskTypeSelectionValue\("task"\)/);
  assert.match(listSource, /setParentStepTaskTypeSelectionValues\(\(current\) =>/);
  assert.doesNotMatch(appSource.slice(appSource.indexOf("const createChildTaskFromPreview"), appSource.indexOf("const openChildTaskFromPreview")), /updateTask\(/);
});

test("active Task creation and hierarchy surfaces expose no retired Pursuit action", () => {
  const appSource = readFileSync("src/components/task-app.tsx", "utf8");
  const newMenuSource = readFileSync("src/components/task-app/tasks-page.tsx", "utf8");
  const tableSource = readFileSync("src/components/ui/task-management-table-v2.tsx", "utf8");
  const listSource = readFileSync("src/components/task-app/tasks-list-adapter.tsx", "utf8");

  assert.match(newMenuSource, /taskTypeOptions\.map\(\(option\) =>/);
  assert.match(newMenuSource, /role="menuitem"/);
  assert.match(newMenuSource, /onOpenTaskComposerForType\(option\.value\)/);
  assert.match(newMenuSource, /<TaskTypeIdentity option=\{option\}/);
  assert.match(tableSource, /export function ChildTypeChooser/);
  assert.match(tableSource, /onChooseTask/);
  for (const source of [appSource, newMenuSource, tableSource, listSource]) {
    assert.doesNotMatch(source, /pursuit/i);
  }
});

test("Tasks New menu uses shared Task Type choices and canonical typed creation", () => {
  const appSource = readFileSync("src/components/task-app.tsx", "utf8");
  const newMenuSource = readFileSync("src/components/task-app/tasks-page.tsx", "utf8");
  const creationHandlerStart = appSource.indexOf("const openTaskComposerForType");
  const creationHandlerEnd = appSource.indexOf("const duplicateTaskInPlace", creationHandlerStart);
  const creationHandler = appSource.slice(creationHandlerStart, creationHandlerEnd);

  assert.ok(creationHandlerStart >= 0);
  assert.ok(creationHandlerEnd > creationHandlerStart);
  assert.match(appSource, /const taskTypeOptions = useMemo\([\s\S]*buildTaskTypeSelectionOptions\(customBehaviorRulesets\)/);
  assert.match(appSource, /onOpenTaskComposerForType: openTaskComposerForType/);
  assert.match(newMenuSource, /taskTypeOptions\.map\(\(option\) =>/);
  assert.match(creationHandler, /resolveTaskTypeSelection\(selectionValue, customBehaviorRulesets\)/);
  assert.match(creationHandler, /custom_ruleset_id: selection\.customRulesetId/);
  assert.match(creationHandler, /task_type: selection\.taskType/);
  assert.match(creationHandler, /createTaskAndOpenSharedEditor\([\s\S]*buildNewTaskDraft\("New Task"\)/);
  assert.match(creationHandler, /routeToCurrentBucket: true/);
  assert.doesNotMatch(creationHandler, /updateTask\(/);
});

test("Pursuit retirement deletes only typed/domain data and tightens current TaskType constraints", () => {
  const migration = readFileSync("supabase/retire_pursuit_experiment_7_13_54.sql", "utf8");
  const schema = readFileSync("supabase/schema.sql", "utf8");
  assert.match(migration, /task_type\s*=\s*'pursuit'/i);
  assert.match(migration, /adhdice_pursuit_activities/i);
  assert.match(migration, /adhdice_pursuits/i);
  assert.match(migration, /delete\s+from\s+public\.adhdice_clean_tasks/i);
  assert.match(migration, /delete\s+from\s+public\.adhdice_task_type_behavior_profiles[\s\S]*task_type\s*=\s*'pursuit'/i);
  assert.match(migration, /delete\s+from\s+public\.adhdice_task_behavior_selections[\s\S]*task_type\s*=\s*'pursuit'/i);
  assert.match(migration, /truncate\s+table\s+public\.adhdice_pursuit_activities\s*,\s*public\.adhdice_pursuits\s*;/i);
  assert.doesNotMatch(migration, /truncate\s+table\s+public\.adhdice_pursuit_activities\s*;/i);
  assert.doesNotMatch(migration, /truncate\s+table\s+public\.adhdice_pursuits\s*;/i);
  assert.doesNotMatch(migration, /truncate\s+table\s+[^;]*\bcascade\b/i);
  assert.match(migration, /drop table if exists public\.adhdice_pursuit_activities/i);
  assert.match(migration, /drop table if exists public\.adhdice_pursuits/i);
  assert.match(migration, /'task', 'goal', 'custom'/i);
  assert.match(migration, /\bbegin;\s*[\s\S]*\bcommit;\s*$/i);
  assert.match(migration, /do \$postconditions\$[\s\S]*Pursuit retirement left task_type=pursuit rows behind/i);
  assert.match(migration, /Pursuit retirement left standalone persistence behind/i);
  assert.doesNotMatch(migration, /update\s+public\.adhdice_task_schedule_boundaries[\s\S]*prior_boundary_id\s*=\s*null/i);
  assert.doesNotMatch(migration, /update\s+public\.adhdice_task_schedule_boundaries[\s\S]*command_id\s*=\s*null/i);
  assert.doesNotMatch(migration, /update\s+public\.adhdice_task_history_facts[\s\S]*command_id\s*=\s*null/i);
  assert.match(migration, /update\s+public\.adhdice_task_occurrences\s+occurrence[\s\S]*set\s+resolved_history_id\s*=\s*null/i);
  assert.doesNotMatch(migration, /update\s+public\.adhdice_task_occurrences[\s\S]*command_id\s*=\s*null/i);
  assert.match(migration, /update\s+public\.adhdice_task_schedule_boundaries\s+boundary\s+set\s+affected_occurrence_id\s*=\s*null/i);
  assert.match(migration, /for\s+boundary_row\s+in[\s\S]*order\s+by\s+boundary\.user_id,\s*boundary\.entity_id,\s*boundary\.boundary_sequence\s+desc[\s\S]*delete\s+from\s+public\.adhdice_task_schedule_boundaries/i);
  const historyDelete = migration.indexOf("delete from public.adhdice_task_history_facts history");
  const occurrenceDelete = migration.indexOf("delete from public.adhdice_task_occurrences occurrence");
  const boundaryDelete = migration.indexOf("delete from public.adhdice_task_schedule_boundaries boundary");
  const commandDelete = migration.indexOf("delete from public.adhdice_task_command_operations command");
  const taskDelete = migration.indexOf("delete from public.adhdice_clean_tasks task");
  assert.ok(historyDelete > migration.indexOf("set resolved_history_id = null"));
  assert.ok(occurrenceDelete > historyDelete);
  assert.ok(boundaryDelete > occurrenceDelete);
  assert.ok(commandDelete > boundaryDelete);
  assert.ok(taskDelete > commandDelete);
  assert.doesNotMatch(migration, /insert\s+into[\s\S]*task_type\s*=\s*'task'/i);
  assert.doesNotMatch(migration, /update[\s\S]*task_type\s*=\s*'task'/i);
  assert.match(schema, /task_type text not null default 'task'/i);
  assert.match(schema, /constraint adhdice_clean_tasks_task_type_check/i);
  assert.match(schema, /task_type in \('task', 'custom'\)/i);
  assert.doesNotMatch(schema, /task_type in \([^)]*'pursuit'/i);
  assert.doesNotMatch(schema, /create table public\.adhdice_pursuits/i);
  assert.doesNotMatch(schema, /create table public\.adhdice_pursuit_activities/i);
});

test("Task duplication preserves TaskType through the shared editor draft", () => {
  const taskApp = readFileSync("src/components/task-app.tsx", "utf8");
  const duplicateBranch = taskApp.slice(taskApp.indexOf("const duplicateValues: TaskDraft"), taskApp.indexOf("const duplicateTask = await saveTaskEditor", taskApp.indexOf("const duplicateValues: TaskDraft")));
  assert.match(duplicateBranch, /task_type: task\.task_type/);
});

test("Task Engine remains TaskType-agnostic while direct normalization owns policy resolution", () => {
  const engine = readFileSync("src/lib/task-state-engine/engine.ts", "utf8");
  const directInput = readFileSync("src/lib/task-state-engine/direct-input.ts", "utf8");
  assert.doesNotMatch(engine, /task_type|taskType/);
  assert.match(directInput, /normalizeTaskType\(task\.task_type\)/);
  assert.match(directInput, /const taskType = normalizeTaskType\(task\.task_type\)/);
  assert.match(directInput, /resolveTaskBehaviorPolicyForTask\(/);
  assert.match(directInput, /customRulesetId:\s*taskType === "custom"\s*\?\s*task\.custom_ruleset_id\s*:\s*null/);
});
