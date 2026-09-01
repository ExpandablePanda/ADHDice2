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

test("MetadataPanelId and full inspector navigation put Summary first without adding it to quick edit", () => {
  assert.match(tableSource, /export type MetadataPanelId = [^;]*"summary"/);
  const optionsStart = tableSource.indexOf("const metadataPanelOptions");
  const optionsEnd = tableSource.indexOf("function metadataFieldHasValue", optionsStart);
  const options = tableSource.slice(optionsStart, optionsEnd);
  assert.ok(options.indexOf('{ id: "summary", label: "Summary" }') < options.indexOf('{ id: "delay", label: "Delay" }'));
  assert.match(options, /\{ id: "notes", label: "Notes" \}/);
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
  assert.match(tableSource, /case "summary":\s*return false;/);
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
