import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/add_pursuit_task_parent_7_13_1.sql", import.meta.url), "utf8");
const tagsMigration = readFileSync(new URL("../supabase/add_pursuit_tags_7_13_5.sql", import.meta.url), "utf8");
const schemaSource = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const databaseTypesSource = readFileSync(new URL("../src/lib/database.types.ts", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const headerSource = readFileSync(new URL("../src/components/task-app/tasks-page.tsx", import.meta.url), "utf8");
const tableSource = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");
const listSource = readFileSync(new URL("../src/components/task-app/tasks-list-adapter.tsx", import.meta.url), "utf8");
const rowSource = readFileSync(new URL("../src/components/task-app/pursuit-workspace-row.tsx", import.meta.url), "utf8");
const editorSource = readFileSync(new URL("../src/components/task-app/pursuits-workspace.tsx", import.meta.url), "utf8");
const pursuitHookSource = readFileSync(new URL("../src/hooks/usePursuits.ts", import.meta.url), "utf8");

test("7.13.1 migration preserves Task-owned Pursuits on parent deletion", () => {
  assert.match(migration, /add column if not exists parent_task_id uuid/);
  assert.match(migration, /foreign key \(user_id, parent_task_id\)/);
  assert.match(migration, /on delete set null \(parent_task_id\)/);
  assert.match(migration, /check \(not \(parent_pursuit_id is not null and parent_task_id is not null\)\)/);
  assert.match(migration, /adhdice_pursuits_user_task_parent_idx/);
});

test("7.13.5 Pursuit tags migration is additive and does not add Task semantics", () => {
  assert.match(tagsMigration, /add column if not exists tags text\[\] not null default '\{\}'/);
  assert.doesNotMatch(tagsMigration, /due_on|repeat_frequency|next_target_date|occurrence/i);
  assert.match(schemaSource, /tags text\[\] not null default '\{\}'/);
  assert.match(databaseTypesSource, /tags: string\[\];/);
  assert.match(pursuitHookSource, /tags: input\.tags \?\? \[\]/);
});

test("creation and child-step routing keep Task and Pursuit paths separate", () => {
  assert.match(headerSource, /New/);
  assert.match(headerSource, /onOpenTaskComposer\(\)/);
  assert.match(headerSource, /onOpenPursuitComposer\(\)/);
  assert.match(tableSource, /ChildTypeChooser/);
  assert.match(tableSource, /onCreateChildPursuit/);
  assert.match(appSource, /onCreateChildPursuit=\{openNewPursuitEditorFromTaskEditor\}/);
  assert.match(appSource, /onCreateChildPursuit: openNewPursuitEditor/);
  assert.match(appSource, /initialParentTaskId=\{pursuitEditorState\.parentTaskId\}/);
  assert.match(appSource, /onCreate=\{pursuitData\.createPursuit\}/);
});

test("Table/List use a dedicated Pursuit rendering path and searchable domain rows", () => {
  assert.match(tableSource, /PursuitTableWorkspaceRow/);
  assert.match(tableSource, /filterPursuitsForTaskWorkspace/);
  assert.match(listSource, /PursuitListWorkspaceRow/);
  assert.match(listSource, /filterPursuitsForTaskWorkspace/);
  assert.match(rowSource, /pursuit: Pursuit/);
  assert.doesNotMatch(rowSource, /PrototypeTaskRow/);
  assert.match(editorSource, /export function PursuitEditorModal/);
  assert.match(editorSource, /Mark Done Today/);
  assert.match(editorSource, /Pursuit calendar/);
  assert.match(editorSource, /Pursuit history/);
  assert.match(rowSource, /Compass/);
  assert.doesNotMatch(rowSource, /Infinity/);
  assert.doesNotMatch(editorSource, /Infinity/);
  assert.match(editorSource, /onOpenPursuit\?\.\(child\.id\)/);
  assert.match(editorSource, /Next target/);
  assert.doesNotMatch(editorSource, /Log Activity|durationMinutes|Duration minutes|session-oriented/i);
  assert.match(appSource, /onOpenPursuit: openPursuitEditor/);
  assert.match(appSource, /onCreatePursuitChild: openNewPursuitEditorFromPursuit/);
  assert.match(appSource, /returnToTaskEditorId/);
  assert.match(appSource, /openPursuitEditorFromTaskEditor/);
  assert.match(appSource, /openNewPursuitEditorFromTaskEditor/);
  assert.match(appSource, /onClose=\{closePursuitEditor\}/);
});

test("Pursuit table metadata reuses Task authorities and keeps the title row compact", () => {
  assert.match(rowSource, /TASK_TABLE_VISIBLE_TITLE_TEXT_CLASS/);
  assert.match(rowSource, /TaskCurrentStreakChip/);
  assert.match(rowSource, /formatPursuitLastCompletionDate/);
  assert.match(rowSource, /formatPursuitRevisitCadence/);
  assert.match(rowSource, /formatTaskTableEntryTimestamp/);
  assert.match(rowSource, /TASK_TABLE_TAG_CHIP_CLASS/);
  assert.doesNotMatch(rowSource, /Needs attention/);
  assert.doesNotMatch(rowSource, /formatPursuitLastCompletion\(/);
  assert.match(editorSource, /TagsQuickPanel/);
  assert.match(editorSource, /buildPursuitDescendantRows/);
  assert.match(editorSource, /Footprints/);
  assert.match(editorSource, /setChildEditorParentId\(child\.id\)/);
  assert.match(editorSource, /AdhdDropdownSelect/);
  assert.doesNotMatch(editorSource, /<select/);
});

test("Pursuit completion controls and quick actions stay row-local", () => {
  assert.match(rowSource, /PursuitCompletionControl/);
  assert.match(rowSource, /Compass/);
  assert.doesNotMatch(rowSource, /CheckCircle2/);
  assert.match(rowSource, /GREEN_ICON_CLASS/);
  assert.match(rowSource, /GREEN_COMPLETION_CHIP_CLASS/);
  assert.match(rowSource, /YELLOW_ICON_CLASS/);
  assert.match(rowSource, /formatPursuitTargetDate/);
  assert.match(rowSource, /PursuitRowActions/);
  assert.match(rowSource, /onCreateChildPursuit/);
  assert.match(rowSource, /onOpenCalendar/);
  assert.match(rowSource, /stopPropagation/);
  assert.match(tableSource, /onCreatePursuitChild/);
  assert.match(listSource, /onCreatePursuitChild/);
  assert.match(listSource, /onOpenQuickPanel/);
});

test("Pursuit Calendar contains history and day-note controls in one surface", () => {
  assert.match(editorSource, /function PursuitCalendar/);
  assert.match(editorSource, /selectedDayNote/);
  assert.match(editorSource, /Chronological completed days/);
  assert.match(editorSource, /Pursuit history/);
  assert.doesNotMatch(editorSource, /setActiveSection\("history"\)/);
  assert.doesNotMatch(editorSource, /aria-label="History"/);
  assert.match(editorSource, /selectedDayCompleted/);
  assert.match(editorSource, /onRemoveCompletionOnLogicalDay/);
});

test("Pursuit presentation follows Task disclosure and search context without becoming a Task match", () => {
  assert.match(tableSource, /shouldRenderTaskPursuitChildren\(sourceStepsExpanded, pursuitRows\)/);
  assert.match(tableSource, /pursuitSearchContextTaskIdSet\.has\(task\.id\)/);
  assert.match(tableSource, /highlightedTaskIdSet\.has\(task\.id\)/);
  assert.match(listSource, /shouldRenderTaskPursuitChildren\(isStepSectionExpanded, pursuitRows\)/);
  assert.match(listSource, /pursuitSearchContextTaskIdSet\.has\(task\.id\)/);
  assert.match(listSource, /highlightedTaskIdSet\.has\(task\.id\)/);
  assert.match(appSource, /pursuitSearchContextTasks/);
  assert.match(appSource, /pursuits: taskWorkspacePursuits/);
});

test("Pursuit presentation wiring does not feed rows into Task completion inputs", () => {
  assert.match(tableSource, /buildPursuitWorkspaceIndex/);
  assert.match(tableSource, /renderPursuitRows\(pursuitWorkspaceIndex/);
  assert.match(appSource, /tasks: tasksForActiveStatusRead/);
  assert.match(appSource, /pursuits: taskWorkspacePursuits/);
  assert.doesNotMatch(appSource, /adhdice_task_list_manual_memberships.*pursuit/i);
  assert.doesNotMatch(rowSource, /TaskStatus|TaskHistory|occurrence|adhdice_clean_tasks/);
  assert.match(rowSource, /onMarkDoneToday/);
  assert.doesNotMatch(rowSource, /session|duration|activity-time/i);
  assert.match(rowSource, /aria-pressed=\{completedToday\}/);
  assert.doesNotMatch(rowSource, /gridTemplateColumns: `\$\{gridTemplateColumns\} 2\.5rem`/);
});

test("Pursuit target derivation stays outside Task due and completion authorities", () => {
  assert.match(appSource, /buildPursuitAttentionMap/);
  assert.match(appSource, /togglePursuitDoneToday/);
  assert.doesNotMatch(appSource, /pursuit.*due_on|due_on.*pursuit/i);
  assert.doesNotMatch(pursuitHookSource, /adhdice_task_history|adhdice_focus|reward/i);
});

test("all Task child controls share the Task/Pursuit chooser authority", () => {
  assert.match(tableSource, /function ChildTypeChooser/);
  assert.match(tableSource, /onChoosePursuit=\{onCreateChildPursuit/);
  assert.match(tableSource, /onCreateChildPursuit=\{onCreateChildPursuit\}/);
  assert.match(listSource, /ChildTypeChooser/);
  assert.match(appSource, /onCreateChildPursuit=\{openNewPursuitEditorFromTaskEditor\}/);
  assert.match(appSource, /onCreateChildPursuit: openNewPursuitEditor/);
});

test("Pursuit completion writes a nullable check-in event without Task or Focus side effects", () => {
  const completionSource = pursuitHookSource.slice(pursuitHookSource.indexOf("const insertCompletion"), pursuitHookSource.indexOf("const markDoneToday"));
  assert.match(completionSource, /duration_seconds: null/);
  assert.match(completionSource, /notes: options\.notes\?\.trim\(\) \|\| null/);
  assert.match(completionSource, /occurred_at: occurredAt/);
  assert.doesNotMatch(completionSource, /adhdice_clean_tasks|adhdice_task_history|adhdice_focus/i);
  assert.match(pursuitHookSource, /getActivityForLogicalDay/);
  assert.match(pursuitHookSource, /updateExistingCompletion/);
  assert.match(pursuitHookSource, /notes: nextNotes/);
});
