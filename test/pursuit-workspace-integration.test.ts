import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildPursuitInlineCreateInput, getPursuitCompletionTone } from "@/lib/pursuit-ui";
import { AdhdIconButton } from "@/components/ui-system/adhd-icon-button";
import { TaskCurrentStreakChip, TaskTableInlineActionRow } from "@/components/ui/task-table-primitives";

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
const appVersionSource = readFileSync(new URL("../src/lib/app-version.ts", import.meta.url), "utf8");
const publicVersionSource = readFileSync(new URL("../public/app-version.json", import.meta.url), "utf8");
const packageSource = readFileSync(new URL("../package.json", import.meta.url), "utf8");
const packageLockSource = readFileSync(new URL("../package-lock.json", import.meta.url), "utf8");
const currentStateSource = readFileSync(new URL("../docs/CURRENT_STATE.md", import.meta.url), "utf8");
const iconButtonSource = readFileSync(new URL("../src/components/ui-system/adhd-icon-button.tsx", import.meta.url), "utf8");
const secondaryViewsSource = readFileSync(new URL("../src/components/task-app/task-secondary-views.tsx", import.meta.url), "utf8");
const gridWidgetsSource = readFileSync(new URL("../src/components/task-app/task-grid-widgets.tsx", import.meta.url), "utf8");
const viewAdaptersSource = readFileSync(new URL("../src/components/task-app/task-view-adapters.tsx", import.meta.url), "utf8");
const calendarSource = readFileSync(new URL("../src/components/task-app/task-calendar-view.tsx", import.meta.url), "utf8");
const streakPrimitiveSource = readFileSync(new URL("../src/components/ui/task-table-primitives.tsx", import.meta.url), "utf8");

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
  assert.match(editorSource, /historyTitle="Pursuit History"/);
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
  assert.match(rowSource, /GREEN_COMPLETION_CHIP_CLASS/);
  assert.doesNotMatch(rowSource, /GREEN_ICON_CLASS|YELLOW_ICON_CLASS|MUTED_ICON_CLASS/);
  assert.match(rowSource, /getPursuitCompletionTone/);
  assert.match(rowSource, /tone=\{tone\}/);
  assert.match(rowSource, /disabled=\{disabled\}/);
  assert.match(rowSource, /formatPursuitTargetDate/);
  assert.match(rowSource, /PursuitRowActions/);
  assert.match(rowSource, /onCreateChildPursuit/);
  assert.match(rowSource, /onOpenCalendar/);
  assert.match(rowSource, /stopPropagation/);
  assert.match(tableSource, /onCreatePursuitChild/);
  assert.match(listSource, /onCreatePursuitChild/);
  assert.match(listSource, /onOpenQuickPanel/);
});

test("Pursuit Calendar contains history and day-note controls in one shared surface", () => {
  assert.match(editorSource, /function PursuitCalendar/);
  assert.match(editorSource, /selectedDayNote/);
  assert.match(editorSource, /historyDescription="Chronological completed days/);
  assert.match(editorSource, /historyTitle="Pursuit History"/);
  assert.match(editorSource, /PursuitCalendarPresentation/);
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

test("7.13.12 runtime version authorities agree and HUD reads the shared authority", () => {
  for (const source of [appVersionSource, publicVersionSource, packageSource, packageLockSource, currentStateSource]) {
    assert.match(source, /7\.13\.12/);
    assert.doesNotMatch(source, /7\.13\.(?:5|6|9|10)/);
  }
  assert.match(appSource, /const HUD_VERSION = APP_VERSION/);
});

test("AdhdIconButton keeps existing tones and adds semantic success and warning states", () => {
  for (const tone of ["default", "purple", "success", "warning", "danger", "ghost"]) {
    assert.match(iconButtonSource, new RegExp(`\\b${tone}:`));
  }
  assert.match(iconButtonSource, /ROW_TOOLBAR_TONE_CLASS/);
  assert.match(iconButtonSource, /ROW_TOOLBAR_SELECTED_CLASS/);
  assert.match(iconButtonSource, /success:\s*"border/);
  assert.match(iconButtonSource, /warning:\s*"border/);
  assert.match(iconButtonSource, /dark:border/);
});

test("canonical icon tones, streak projection, and Table action rows render their shared geometry", () => {
  const successButton = renderToStaticMarkup(createElement(AdhdIconButton, { "aria-label": "Complete", tone: "success", variant: "rowToolbar" }, createElement("span", null, "icon")));
  const warningButton = renderToStaticMarkup(createElement(AdhdIconButton, { "aria-label": "Needs attention", tone: "warning", variant: "rowToolbar" }, createElement("span", null, "icon")));
  const dangerButton = renderToStaticMarkup(createElement(AdhdIconButton, { "aria-label": "Delete", tone: "danger" }, createElement("span", null, "icon")));
  const streak = renderToStaticMarkup(createElement(TaskCurrentStreakChip, { currentStreak: 3 }));
  const noStreak = renderToStaticMarkup(createElement(TaskCurrentStreakChip, { currentStreak: 0 }));
  const actionRow = renderToStaticMarkup(createElement(TaskTableInlineActionRow, { ariaLabel: "Pursuit actions", heading: "Actions", rowId: "pursuit-1" }, createElement("span", null, "content")));

  assert.match(successButton, /text-\[#3f8b5a\]/);
  assert.match(warningButton, /text-\[#b1811c\]/);
  assert.match(dangerButton, /text-\[#d65775\]/);
  assert.match(streak, /3/);
  assert.equal(noStreak, "");
  assert.match(actionRow, /data-task-table-inline-action-row="true"/);
  assert.match(actionRow, /data-task-table-inline-editor="pursuit-1"/);
});

test("Pursuit completion controls use a row-safe shared note panel and preserve clear/attention states", () => {
  assert.match(rowSource, /export function PursuitCompletionNotePanel/);
  assert.match(rowSource, /data-pursuit-completion-note-panel/);
  assert.match(rowSource, /onRequestCompletionNote/);
  assert.match(rowSource, /completionNoteOpen \? <PursuitCompletionNotePanel/);
  assert.match(rowSource, /TaskTableInlineActionRow/);
  assert.match(rowSource, /Optional note for today/);
  assert.doesNotMatch(rowSource, /GREEN_ICON_CLASS|YELLOW_ICON_CLASS/);
  assert.match(rowSource, /onRemoveCompletionOnLogicalDay/);
  assert.match(editorSource, /PursuitCompletionNotePanel/);
  assert.doesNotMatch(editorSource, /isCompletionNoteOpen[^\n]*absolute right-0 top/);
});

test("Pursuit completion presentation keeps Table rows separate from the editor", () => {
  const panelSource = rowSource.slice(rowSource.indexOf("export function PursuitCompletionNotePanel"), rowSource.indexOf("export function PursuitCompletionControl"));
  const sharedContentSource = panelSource.slice(panelSource.indexOf("const content"), panelSource.indexOf('if (presentation === "dropdown" || presentation === "inline")'));
  const nonTableBranch = panelSource.slice(panelSource.indexOf('if (presentation === "dropdown" || presentation === "inline")'), panelSource.indexOf("return (\n    <TaskTableInlineActionRow"));
  const editorPanelStart = editorSource.indexOf("<PursuitCompletionNotePanel");
  const editorPanelSource = editorSource.slice(editorPanelStart, editorSource.indexOf(" />", editorPanelStart) + 3);

  assert.match(rowSource, /presentation\?: "dropdown" \| "inline" \| "table"/);
  assert.match(panelSource, /if \(presentation === "dropdown" \|\| presentation === "inline"\)/);
  assert.match(panelSource, /<TaskTableInlineActionRow[\s\S]*heading="Mark done today"/);
  assert.doesNotMatch(nonTableBranch, /TaskTableInlineActionRow|TASK_TABLE_GRID_ORIGIN_CLASS|viewportMetrics|w-max|min-w-full|translateX/);
  assert.match(nonTableBranch, /data-pursuit-completion-note-panel/);
  assert.match(sharedContentSource, /Optional note for today/);
  assert.match(sharedContentSource, /Confirm/);
  assert.match(sharedContentSource, /Close completion note/);
  assert.match(editorPanelSource, /presentation="inline"/);
  assert.doesNotMatch(editorPanelSource, /presentation="table"/);
});

test("Pursuit completion presentation leaves the Calendar surface independent", () => {
  const calendarFunctionSource = editorSource.slice(editorSource.indexOf("function PursuitCalendar"));
  assert.doesNotMatch(calendarFunctionSource, /PursuitCompletionNotePanel|TaskTableInlineActionRow/);
  assert.match(calendarFunctionSource, /selectedDayCompleted/);
  assert.match(calendarFunctionSource, /onToggleSelectedDay/);
  assert.match(calendarFunctionSource, /onSaveSelectedDayNote/);
});

test("ChildTypeChooser is portal-layered above clipped Table/List rows with dismissal behavior", () => {
  assert.match(tableSource, /createPortal/);
  assert.match(tableSource, /data-child-type-chooser-menu/);
  assert.match(tableSource, /position: "fixed"/);
  assert.match(tableSource, /event\.key === "Escape"/);
  assert.match(tableSource, /document\.addEventListener\("pointerdown"/);
  assert.match(tableSource, /onChoosePursuit/);
  assert.match(tableSource, /onChooseTask/);
});

test("Pursuit Table/List metadata cells share one inline quick-edit authority", () => {
  assert.match(rowSource, /export type PursuitQuickEditMode/);
  assert.match(rowSource, /export function PursuitQuickEditPanel/);
  for (const label of ["Due", "Repeat", "Tags", "Notes", "Lifecycle"]) {
    assert.match(rowSource, new RegExp(`label=\\"${label}\\"|Edit ${label}`));
  }
  assert.match(rowSource, /data-pursuit-quick-edit/);
  assert.match(rowSource, /data-pursuit-metadata-row/);
  assert.doesNotMatch(rowSource, /PursuitQuickMetadata|<Ellipsis/);
  assert.match(rowSource, /onOpenCalendar/);
  assert.match(rowSource, /onCreateChildPursuit/);
  assert.match(rowSource, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(rowSource, /TaskTableInlineActionRow/);
  assert.match(rowSource, /TaskListQuickPanelShell/);
  assert.doesNotMatch(rowSource, /QUICK_PANEL_SHELL_CLASS|QUICK_PANEL_PRIMARY_CLASS/);
});

test("Pursuit semantic tones and inline parent payloads are domain-safe", () => {
  const completedAttention = { completionSummary: { completedToday: true }, needsAttention: false } as never;
  const attention = { completionSummary: { completedToday: false }, needsAttention: true } as never;
  const normal = { completionSummary: { completedToday: false }, needsAttention: false } as never;
  assert.equal(getPursuitCompletionTone(completedAttention, { status: "active" }), "success");
  assert.equal(getPursuitCompletionTone(attention, { status: "active" }), "warning");
  assert.equal(getPursuitCompletionTone(normal, { status: "active" }), "default");
  assert.equal(getPursuitCompletionTone(normal, { status: "paused" }), "ghost");
  assert.deepEqual(buildPursuitInlineCreateInput("  Child Pursuit  ", { taskId: "task-1" }), {
    notes: null,
    parent_pursuit_id: null,
    parent_task_id: "task-1",
    revisit_interval_days: null,
    tags: [],
    title: "Child Pursuit",
  });
  assert.deepEqual(buildPursuitInlineCreateInput("Child", { pursuitId: "pursuit-1" }).parent_pursuit_id, "pursuit-1");
});

test("Task and Pursuit inline rows use shared shells and drafts", () => {
  assert.match(streakPrimitiveSource, /export function TaskTableInlineActionRow/);
  assert.match(streakPrimitiveSource, /export function TaskInlineChildDraft/);
  assert.match(tableSource, /TaskTableInlineActionRow/);
  assert.match(tableSource, /TaskInlineChildDraft/);
  assert.match(tableSource, /onCreatePursuitInline/);
  assert.match(tableSource, /buildPursuitInlineCreateInput\(title, \{ taskId: parentTaskId \}\)/);
  assert.match(rowSource, /buildPursuitInlineCreateInput\(title, \{ pursuitId: pursuit\.id \}\)/);
  assert.match(listSource, /TaskInlineChildDraft/);
  assert.match(listSource, /buildPursuitInlineCreateInput\(nextTitle, \{ taskId: parentTaskId \}\)/);
  assert.match(appSource, /createInlinePursuit/);
});

test("Pursuit editor metadata uses the approved compact chip primitive", () => {
  assert.match(rowSource, /TASK_TABLE_CHIP_BASE_CLASS/);
  assert.match(rowSource, /AdhdChip/);
  assert.match(editorSource, /<AdhdChip tone=\{getStatusTone\(status\)\}/);
  assert.match(editorSource, /<AdhdChip key=\{tag\}/);
  assert.match(editorSource, /<AdhdChip tone=\{getStatusTone\(child\.status\)\}/);
  assert.doesNotMatch(editorSource, /rounded-full[^\n]*px-3 py-1\.5[^\n]*AdhdChip/);
  assert.match(editorSource, /<AdhdChip[^>]*onClick=\{\(\) => setIsTagsPanelOpen/);
  assert.match(editorSource, /<AdhdChip icon=\{<Plus/);
  assert.match(editorSource, /setChildEditorParentId\(pursuit\.id\)/);
});

test("TaskCurrentStreakChip is projected into every individual-task view without local history recomputation", () => {
  assert.match(tableSource, /TaskCurrentStreakChip/);
  assert.match(listSource, /TaskCurrentStreakChip/);
  assert.match(secondaryViewsSource, /TaskCurrentStreakChip/);
  assert.match(gridWidgetsSource, /TaskCurrentStreakChip/);
  assert.match(calendarSource, /TaskCurrentStreakChip/);
  assert.match(viewAdaptersSource, /currentStreakByTaskId/);
  assert.match(appSource, /currentStreakByTaskId=\{currentStreakByTaskId\}/);
  assert.match(streakPrimitiveSource, /if \(currentStreak <= 0\) return null/);
  assert.doesNotMatch(secondaryViewsSource, /computeTaskSpecificHistoryStats|deduplicateTaskHistory/);
  assert.doesNotMatch(gridWidgetsSource, /computeTaskSpecificHistoryStats|deduplicateTaskHistory/);
  assert.match(calendarSource, /currentStreakByTaskId\[task\.id\] \?\? 0/);
});
