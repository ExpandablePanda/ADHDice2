import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": path.resolve(process.cwd(), "src") },
  jsx: { runtime: "automatic" },
});
const { buildTaskMetadataSummary } = await jiti.import<typeof import("../src/components/ui/task-management-table-v2.tsx")>(
  "../src/components/ui/task-management-table-v2.tsx",
);
const tableSource = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");

const baseTask = {
  actualSeconds: 0,
  dueOn: "",
  dueTime: "",
  energy: "none" as const,
  estimatedMinutes: null,
  linkLabel: "",
  linkUrl: "",
  lists: [],
  linkedNotes: [],
  notes: "",
  priorities: [],
  repeat: "none" as const,
  repeatDayOfMonth: null,
  repeatDaysOfWeek: [],
  repeatInterval: 1,
  repeatMonthlyMode: "day_of_month" as const,
  repeatMonthlyOrdinal: null,
  repeatMonthlyWeekday: null,
  status: "pending" as const,
  tags: [],
  title: "",
};

function summaryByLabel(task = baseTask, actualSeconds = task.actualSeconds) {
  return Object.fromEntries(buildTaskMetadataSummary(task, actualSeconds).map((row) => [row.label, row]));
}

test("MetadataPanelId remains available while the full inspector no longer renders a metadata navigation strip", () => {
  assert.match(tableSource, /export type MetadataPanelId = [^;]*"summary"/);
  assert.match(tableSource, /const metadataPanelLabels: Record<MetadataPanelId, string>/);
  assert.doesNotMatch(tableSource, /metadataPanelOptions\.map/);
  assert.doesNotMatch(tableSource, /metadataFieldHasValue/);
  assert.doesNotMatch(tableSource.slice(tableSource.indexOf("type TaskRowContextMenuQuickEditMode"), tableSource.indexOf("type TaskEditorInitialField")), /summary/);
  assert.doesNotMatch(tableSource.slice(tableSource.indexOf("const BATCH_QUICK_EDIT_MODES"), tableSource.indexOf("const TABLE_REVEAL_TOP_PADDING")), /summary/);
});

test("new parent, Step, and fresh full-editor targets default to Summary while explicit focus still selects Estimated", () => {
  assert.match(tableSource, /activeMetadataPanelByTaskId\[resolvedMetadataTask\.id\] \?\? "summary"/);
  assert.match(tableSource, /activeMetadataPanelByTaskId\[metadataTask\.id\] \?\? "summary"/);
  const openInspector = tableSource.slice(tableSource.indexOf("function openInspector"), tableSource.indexOf("function revealChildTaskInParentEditor"));
  assert.match(openInspector, /setActiveMetadataPanelByTaskId\(\{\}\)/);
  const childRoute = tableSource.slice(tableSource.indexOf("function revealChildTaskInParentEditor"), tableSource.indexOf("function toggleInlineActionRow"));
  assert.match(childRoute, /setActiveMetadataPanelByTaskId\(\{\}\)/);
  assert.match(tableSource, /selectMetadataPanel\(resolvedMetadataTask\.id, "estimated"\)/);
});

test("Summary is derived from the active metadataTask and exposes every property route", () => {
  const summaryBranch = tableSource.slice(tableSource.indexOf('if (metadataPanelId === "summary")'), tableSource.indexOf('} else if (metadataPanelId === "due")'));
  assert.match(summaryBranch, /selectMetadataPanel\(metadataTask\.id, row\.panelId/);
  const summaryHelper = tableSource.slice(tableSource.indexOf("export type TaskMetadataSummaryRow"), tableSource.indexOf("function statusSortValue"));
  assert.match(summaryHelper, /buildTaskMetadataSummary/);
  for (const panelId of ["status", "priority", "energy", "due", "repeat", "estimated", "actual", "lists", "tags", "link", "notes"]) {
    assert.match(summaryHelper, new RegExp(`panelId: "${panelId}"`));
  }
  assert.match(tableSource, /const metadataTask = overlayMode === "full" \? metadataTargetTask \?\? selectedTask : selectedTask/);
});

test("full-editor property panels expose one Back to Summary control without changing metadata", () => {
  const fullEditor = tableSource.slice(tableSource.indexOf("const fullDesktopEditorContent"), tableSource.indexOf("const fullDesktopEditorNode"));
  assert.match(fullEditor, /aria-label="Back to Summary"/);
  assert.match(fullEditor, /onClick=\{\(\) => selectMetadataPanel\(metadataTask\.id, "summary"\)\}/);
  assert.match(fullEditor, /metadataPanelId !== "summary"/);
  assert.match(fullEditor, /<ArrowLeft className=/);
  assert.match(tableSource, /grid min-w-0 grid-cols-1 gap-1 sm:grid-cols-2 xl:grid-cols-3/);
  assert.match(tableSource, /px-2\.5 py-1\.5/);
  assert.match(tableSource, /mt-0\.5 block min-w-0 break-words/);
});

test("full-editor finishing actions return to Summary while intermediate editors stay open", () => {
  const metadataBranch = tableSource.slice(tableSource.indexOf("const isFullMetadataEditor"), tableSource.indexOf("const childTaskPreviewGroup"));
  assert.match(tableSource, /const returnMetadataToSummary = useCallback/);
  assert.match(metadataBranch, /const returnFullMetadataToSummary = \(\) =>/);
  assert.ok(metadataBranch.includes('setTaskDue(metadataTask.id, "", ""); returnFullMetadataToSummary()'));
  assert.match(metadataBranch, /setTaskEstimatedMinutes\(metadataTask\.id, metadataTask\.estimatedMinutes === minutes \? null : minutes\);\s*returnFullMetadataToSummary\(\)/);
  assert.ok(metadataBranch.includes('setTaskPriorities(metadataTask.id, []); returnFullMetadataToSummary()'));
  assert.ok(metadataBranch.includes('setTaskEnergy(metadataTask.id, option.value); returnFullMetadataToSummary()'));
  assert.match(metadataBranch, /setTaskDisplayStatus\(metadataTask\.id, status\);\s*returnFullMetadataToSummary\(\)/);
  assert.match(metadataBranch, /value === "none" \|\| value === "daily" \|\| value === "daily_until_complete"/);
  assert.match(metadataBranch, /setTaskRepeat\(metadataTask\.id, "weekly", \{ repeatDaysOfWeek/);
  assert.match(metadataBranch, /commitTaskLink\(metadataTask\.id\); returnFullMetadataToSummary\(\)/);
  assert.match(metadataBranch, /clearTaskNotes\(metadataTask\.id\); returnFullMetadataToSummary\(\)/);
  assert.match(metadataBranch, /onKeyDown=\{\(event\) => \{ if \(event\.key !== "Enter"\) return; event\.preventDefault\(\); applyMetadataEstimatedMinutes\(\); \}\}/);
  assert.match(metadataBranch, /onBlur=\{\(\) => commitTaskLink\(metadataTask\.id\)\}/);
  const multiSelectBranch = metadataBranch.slice(metadataBranch.indexOf('metadataPanelId === "lists"'), metadataBranch.indexOf('metadataPanelId === "link"'));
  assert.doesNotMatch(multiSelectBranch, /returnFullMetadataToSummary/);
  const actualBranch = metadataBranch.slice(metadataBranch.indexOf('metadataPanelId === "actual"'), metadataBranch.indexOf('metadataPanelId === "priority"'));
  assert.doesNotMatch(actualBranch, /returnFullMetadataToSummary/);
  const notesBranch = metadataBranch.slice(metadataBranch.indexOf('metadataPanelId === "notes"'));
  assert.doesNotMatch(notesBranch, /onKeyDown/);
  assert.match(tableSource, /if \(didDelay !== false\) \{\s*if \(options\?\.returnToSummary\) \{\s*returnMetadataToSummary\(taskId\);\s*\} else \{\s*closeInspector\(\);/);
  assert.match(metadataBranch, /onSave=\{\(nextDueOn\) => applyTaskDelay\(metadataTask\.id, nextDueOn, \{ returnToSummary: isFullMetadataEditor \}\)\}/);
  assert.match(metadataBranch, /onKeyDown=\{\(event\) => \{\s*if \(event\.key !== "Enter"\) return;\s*event\.preventDefault\(\);\s*saveMetadataDueDraft\(\);/);
});

test("full-editor Description follows metadataTask for parent, Step, and Substep without a parallel field", () => {
  const fullEditor = tableSource.slice(tableSource.indexOf("const fullDesktopEditorContent"), tableSource.indexOf("const fullDesktopEditorNode"));
  const metadataCard = fullEditor.slice(fullEditor.indexOf("<section className={fullMetadataCardClass}>"));
  const leftColumn = fullEditor.slice(0, fullEditor.indexOf("<section className={fullMetadataCardClass}>"));
  assert.doesNotMatch(leftColumn, /Description/);
  assert.match(metadataCard, /<label className="mt-3 block">[\s\S]*?Description[\s\S]*?commitTaskNotes\(metadataTask\.id\)[\s\S]*?value=\{metadataDescriptionDraft\}/);
  assert.match(tableSource, /const metadataDescriptionDraft = notesDrafts\[metadataTask\.id\] \?\? metadataTask\.notes/);
  assert.match(tableSource, /const metadataTask = overlayMode === "full" \? metadataTargetTask \?\? selectedTask : selectedTask/);
  assert.doesNotMatch(tableSource, /useState[^\n]*description/i);
});

test("Summary formatting keeps configured values visible and uses displayed actual seconds", () => {
  const summary = summaryByLabel({
    ...baseTask,
    actualSeconds: 1,
    dueOn: "2026-12-24",
    dueTime: "18:00",
    energy: "medium",
    estimatedMinutes: 45,
    linkLabel: "Project brief",
    lists: ["Work", "Today"],
    linkedNotes: [{ id: "n1", title: "Review" }, { id: "n2", title: "Plan" }],
    notes: "Needs final review",
    priorities: ["3"],
    repeat: "monthly",
    repeatMonthlyMode: "ordinal_weekday",
    repeatMonthlyOrdinal: "first",
    repeatMonthlyWeekday: 2,
    status: "delayed",
    tags: ["calls", "urgent"],
    title: "Finish quarterly report",
  }, 1320);

  assert.equal(summary.Title.value, "Finish quarterly report");
  assert.equal(summary.Status.value, "Delayed");
  assert.equal(summary.Priority.value, "3");
  assert.equal(summary.Energy.value, "Medium");
  assert.match(summary.Due.value, /12-24-2026 · 6:00pm/);
  assert.equal(summary.Repeat.value, "First Tuesday monthly");
  assert.equal(summary.Estimated.value, "45m");
  assert.equal(summary.Actual.value, "22m");
  assert.equal(summary.Lists.value, "Work · Today");
  assert.equal(summary.Tags.value, "#calls · #urgent");
  assert.equal(summary.Link.value, "Project brief");
  assert.equal(summary.Notes.value, "Needs final review · 2 linked notes");
});

test("Summary keeps empty metadata rows readable and falls back from link label to URL", () => {
  const summary = summaryByLabel({ ...baseTask, linkUrl: "https://example.com/brief" }, 0);
  for (const label of ["Priority", "Energy", "Estimated", "Lists", "Tags", "Notes"]) {
    assert.equal(summary[label].value, "None", label);
  }
  assert.equal(summary.Due.value, "No date");
  assert.equal(summary.Repeat.value, "No repeat");
  assert.equal(summary.Actual.value, "0m");
  assert.equal(summary.Link.value, "https://example.com/brief");
});
