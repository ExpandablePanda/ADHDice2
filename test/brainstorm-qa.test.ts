import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  addQaItem,
  clearPassedQaItems,
  createQaSession,
  deleteQaItem,
  deleteQaSession,
  deriveQaProgress,
  duplicateQaSession,
  generateQaFailuresReport,
  generateQaFullReport,
  importQaItems,
  normalizeBrainstormQaState,
  parseQaChecklist,
  reorderQaItems,
  resetQaSession,
  updateQaItem,
  type QaSession,
} from "../src/lib/brainstorm-qa.ts";
import { normalizeBrainstormState, serializeBrainstormStateUpdate, updateBrainstormState } from "../src/lib/brainstorm-state.ts";

const now = new Date("2026-07-19T14:00:00.000Z");
function ids(...values: string[]) { let index = 0; return () => values[index++] ?? `id-${index}`; }
function session(): QaSession {
  return {
    appVersion: "7.2.0", createdAt: now.toISOString(), environment: "Mobile PWA", id: "session-1",
    items: [
      { appVersion: "7.2.0", id: "a", notes: "", status: "pass", text: "Parent Task opens in overlay" },
      { appVersion: "7.2.0", id: "b", notes: "Tray closed and navigated to Tasks.", status: "fail", text: "Archived task keeps tray open" },
      { appVersion: "7.2.0", id: "c", notes: "No suitable stale task available.", status: "blocked", text: "Test stale occurrence" },
      { appVersion: "7.2.0", id: "d", notes: "", status: "not_tested", text: "Step opens in overlay" },
    ], observations: "Timer remained visible.", sessionDate: "2026-07-19", title: "7.2.0 Active Timer Open Task", updatedAt: now.toISOString(),
  };
}

test("parses ordered, unordered, and Markdown checkbox formats as Not Tested imports", () => {
  const source = "1. Parent opens\n2) Step opens\n- Timer runs\n* Page stays\n+ Tray stays\n[ ] Unavailable\n[x] Close\n[X] Reopen";
  assert.deepEqual(parseQaChecklist(source), ["Parent opens", "Step opens", "Timer runs", "Page stays", "Tray stays", "Unavailable", "Close", "Reopen"]);
  const result = importQaItems(createQaSession({}, now, ids("s")), source, "append", "", now, ids("1", "2", "3", "4", "5", "6", "7", "8"));
  assert.equal(result.count, 8);
  assert.ok(result.session.items.every((item) => item.status === "not_tested"));
});

test("normalizes BOM and CRLF", () => assert.deepEqual(parseQaChecklist("\uFEFF- One\r\n- Two\rThree"), ["One", "Two", "Three"]));

test("joins indented wrapped text and flattens nested bullets", () => {
  assert.deepEqual(parseQaChecklist("- Parent line\n  wrapped detail\n  - Nested item\n    nested wrap"), ["Parent line wrapped detail", "Nested item nested wrap"]);
});

test("ignores generic headings but retains meaningful headings", () => {
  assert.deepEqual(parseQaChecklist("# QA Checklist\n## Test Steps\n### Manual QA\n## Overlay behavior\n- Opens"), ["Overlay behavior", "Opens"]);
});

test("preserves duplicate imported items with distinct IDs", () => {
  const result = importQaItems(createQaSession({}, now, ids("s")), "- Same\n- Same", "append", "", now, ids("one", "two"));
  assert.deepEqual(result.session.items.map((item) => item.text), ["Same", "Same"]);
  assert.notEqual(result.session.items[0].id, result.session.items[1].id);
});

test("rejects an empty parsed import without changing the session", () => {
  const original = session();
  const result = importQaItems(original, "\n# QA Checklist\n", "replace", "", now);
  assert.equal(result.count, 0);
  assert.equal(result.session, original);
});

test("recovers malformed or missing persisted QA state to valid V2", () => {
  assert.deepEqual(normalizeBrainstormQaState(null, now), { activeSessionId: null, schemaVersion: 2, sessions: [] });
  assert.deepEqual(normalizeBrainstormQaState({ schemaVersion: 99, activeSessionId: "bad", sessions: [{ id: "", items: "bad" }, null] }, now), { activeSessionId: null, schemaVersion: 2, sessions: [] });
});

test("creates and duplicates sessions with new IDs, current date, and preserved content", () => {
  const created = createQaSession({ appVersion: "7.2.1" }, now, ids("created"));
  assert.deepEqual([created.id, created.appVersion, created.sessionDate], ["created", "7.2.1", "2026-07-19"]);
  const copy = duplicateQaSession(session(), now, ids("copy", "a2", "b2", "c2", "d2"));
  assert.equal(copy.title, "7.2.0 Active Timer Open Task Copy");
  assert.deepEqual(copy.items.map((item) => item.id), ["a2", "b2", "c2", "d2"]);
  assert.deepEqual(copy.items.map((item) => [item.text, item.status, item.notes]), session().items.map((item) => [item.text, item.status, item.notes]));
});

test("deletes only the requested QA session and selects a remaining session", () => {
  const first = { ...session(), id: "first" };
  const second = { ...session(), id: "second", title: "Second" };
  const state = { activeSessionId: "first", schemaVersion: 2 as const, sessions: [first, second] };
  assert.deepEqual(deleteQaSession(state, "first"), { ...state, activeSessionId: "second", sessions: [second] });
  assert.deepEqual(deleteQaSession({ ...state, activeSessionId: "second" }, "missing"), { ...state, activeSessionId: "second" });
  assert.deepEqual(deleteQaSession({ ...state, sessions: [first] }, "first"), { activeSessionId: null, schemaVersion: 2, sessions: [] });
});

test("reset clears statuses while preserving notes, metadata, order, and observations", () => {
  const reset = resetQaSession(session(), new Date("2026-07-19T15:00:00Z"));
  assert.ok(reset.items.every((item) => item.status === "not_tested"));
  assert.deepEqual(reset.items.map((item) => [item.id, item.text, item.notes]), session().items.map((item) => [item.id, item.text, item.notes]));
  assert.equal(reset.observations, session().observations);
});

test("Clear Passed removes only passed items while preserving remaining data, order, and session metadata", () => {
  const original = session();
  const cleared = clearPassedQaItems(original);
  assert.deepEqual(cleared.items, original.items.slice(1));
  assert.deepEqual({ ...cleared, items: original.items }, original);
  assert.equal(clearPassedQaItems({ ...original, items: original.items.filter((item) => item.status !== "pass") }).items.length, 3);
  assert.deepEqual(clearPassedQaItems({ ...original, items: [] }).items, []);
  assert.deepEqual(clearPassedQaItems({ ...original, items: original.items.filter((item) => item.status === "pass") }).items, []);
});

test("derives tested progress, completion, and follow-up without treating empty as complete", () => {
  assert.deepEqual(deriveQaProgress({ ...session(), items: [] }), { blocked: 0, fail: 0, followUp: false, label: "Not started", notTested: 0, pass: 0, tested: 0, total: 0 });
  assert.deepEqual(deriveQaProgress(session()), { blocked: 1, fail: 1, followUp: true, label: "In progress", notTested: 1, pass: 1, tested: 3, total: 4 });
  assert.equal(deriveQaProgress({ ...session(), items: session().items.slice(0, 3) }).label, "Complete");
});

test("adds, edits, deletes, and reorders items", () => {
  let changed = addQaItem({ ...session(), items: [] }, "  New item  ", now, ids("new"));
  changed = updateQaItem(changed, "new", { notes: "note", status: "pass", text: "Edited" }, now);
  changed = addQaItem(changed, "Second", now, ids("second"));
  changed = reorderQaItems(changed, 1, 0, now);
  assert.deepEqual(changed.items.map((item) => item.text), ["Second", "Edited"]);
  assert.deepEqual(deleteQaItem(changed, "second", now).items, [{ appVersion: "7.2.0", id: "new", notes: "note", status: "pass", text: "Edited" }]);
});

test("new QA items default to Not Tested", () => {
  const added = addQaItem({ ...session(), items: [] }, "Fresh QA item", now, ids("fresh"));
  assert.equal(added.items[0].status, "not_tested");
});

test("generates exact full report output", () => {
  assert.equal(generateQaFullReport(session()), "7.2.0 Active Timer Open Task\nApp version: 7.2.0\nEnvironment: Mobile PWA\nSession date: 2026-07-19\n3 / 4 tested\nPass: 1 | Fail: 1 | Blocked: 1 | Not Tested: 1\n\nPASS — [7.2.0] Parent Task opens in overlay\nFAIL — [7.2.0] Archived task keeps tray open\nNote: Tray closed and navigated to Tasks.\nBLOCKED — [7.2.0] Test stale occurrence\nNote: No suitable stale task available.\nNOT TESTED — [7.2.0] Step opens in overlay\n\nGeneral problems:\nTimer remained visible.\n");
});

test("generates exact failures and blocked output including empty fallback", () => {
  assert.equal(generateQaFailuresReport(session()), "FAIL — [7.2.0] Archived task keeps tray open\nNote: Tray closed and navigated to Tasks.\nBLOCKED — [7.2.0] Test stale occurrence\nNote: No suitable stale task available.\n");
  assert.equal(generateQaFailuresReport({ ...session(), items: session().items.filter((item) => item.status === "pass") }), "No failed or blocked items.");
});

test("narrow QA and Questionnaire updates preserve sibling fields", () => {
  const base = normalizeBrainstormState({ answers: { q: { other: "", selected: [], text: "answer", type: "short-text" } }, source_markdown: "# Current", client_updated_at: now.toISOString() });
  const qaState = { activeSessionId: "session-1", schemaVersion: 2 as const, sessions: [session()] };
  const withQa = updateBrainstormState(base, { qaState }, "2026-07-19T15:00:00Z");
  assert.equal(withQa.sourceMarkdown, "# Current");
  assert.equal(withQa.answers.q.text, "answer");
  assert.deepEqual(Object.keys(serializeBrainstormStateUpdate(withQa, ["qaState"])).sort(), ["client_updated_at", "qa_state"]);
  const withQuestionnaire = updateBrainstormState(withQa, { sourceMarkdown: "# New" }, "2026-07-19T16:00:00Z");
  assert.deepEqual(withQuestionnaire.qaState, qaState);
  assert.deepEqual(Object.keys(serializeBrainstormStateUpdate(withQuestionnaire, ["sourceMarkdown"])).sort(), ["client_updated_at", "source_markdown"]);
});

test("V1 persisted items inherit their session app version during V2 normalization", () => {
  const normalized = normalizeBrainstormQaState({ activeSessionId: "s", schemaVersion: 1, sessions: [{ ...session(), id: "s", items: [{ id: "legacy", notes: "", status: "pass", text: "Legacy item" }] }] }, now);
  assert.equal(normalized.schemaVersion, 2);
  assert.equal(normalized.sessions[0].items[0].appVersion, "7.2.0");
});

test("V2 normalization preserves item versions and safely clears malformed versions", () => {
  const normalized = normalizeBrainstormQaState({ activeSessionId: "s", schemaVersion: 2, sessions: [{ ...session(), id: "s", items: [{ appVersion: "7.2.3", id: "v2", notes: "", status: "pass", text: "Versioned" }, { appVersion: 42, id: "bad", notes: "", status: "pass", text: "Malformed" }] }] }, now);
  assert.deepEqual(normalized.sessions[0].items.map((item) => item.appVersion), ["7.2.3", ""]);
  const unversioned = normalizeBrainstormQaState({ activeSessionId: "u", sessions: [{ ...session(), appVersion: "", id: "u", items: [{ appVersion: 42, id: "bad", notes: "", status: "pass", text: "Malformed" }] }] }, now);
  assert.equal(unversioned.sessions[0].items[0].appVersion, "");
});

test("imports assign their version draft without altering earlier items and replacement uses the current draft", () => {
  const first = importQaItems({ ...session(), items: [] }, "- First", "append", "7.2.1", now, ids("first")).session;
  const second = importQaItems(first, "- Second", "append", "7.2.3", now, ids("second")).session;
  assert.deepEqual(second.items.map((item) => item.appVersion), ["7.2.1", "7.2.3"]);
  const replaced = importQaItems(second, "- Replacement", "replace", "7.2.4", now, ids("replacement")).session;
  assert.deepEqual(replaced.items.map((item) => item.appVersion), ["7.2.4"]);
});

test("manual items inherit the session version and editing one item version stays local to that item", () => {
  const created = addQaItem({ ...session(), items: [] }, "Manual", now, ids("manual"));
  assert.equal(created.items[0].appVersion, "7.2.0");
  const edited = updateQaItem({ ...session(), items: [{ ...session().items[0] }, { ...session().items[1] }] }, "a", { appVersion: " 7.2.4 " }, now);
  assert.deepEqual(edited.items.map((item) => item.appVersion), ["7.2.4", "7.2.0"]);
  assert.equal(edited.appVersion, "7.2.0");
});

test("duplicate and reset preserve item versions", () => {
  const mixed = { ...session(), items: [{ ...session().items[0], appVersion: "7.2.1" }, { ...session().items[1], appVersion: "7.2.3" }] };
  const copy = duplicateQaSession(mixed, now, ids("copy", "one", "two"));
  const reset = resetQaSession(mixed, now);
  assert.deepEqual(copy.items.map((item) => item.appVersion), ["7.2.1", "7.2.3"]);
  assert.deepEqual(reset.items.map((item) => item.appVersion), ["7.2.1", "7.2.3"]);
});

test("mixed and unversioned reports identify every item version", () => {
  const mixed = { ...session(), items: [{ ...session().items[0], appVersion: "7.2.1" }, { ...session().items[1], appVersion: "7.2.3" }, { ...session().items[2], appVersion: "7.2.1" }] };
  assert.match(generateQaFullReport(mixed), /Versions: 7\.2\.1, 7\.2\.3/);
  assert.match(generateQaFullReport(mixed), /PASS — \[7\.2\.1\]/);
  assert.equal(generateQaFailuresReport(mixed), "FAIL — [7.2.3] Archived task keeps tray open\nNote: Tray closed and navigated to Tasks.\nBLOCKED — [7.2.1] Test stale occurrence\nNote: No suitable stale task available.\n");
  const unversioned = { ...session(), appVersion: "", items: session().items.map((item) => ({ ...item, appVersion: "" })) };
  assert.match(generateQaFullReport(unversioned), /Versions: Unversioned/);
  assert.match(generateQaFullReport(unversioned), /\[Unversioned\]/);
});

test("workspace exposes accessible labels and live import, save, and clipboard feedback", async () => {
  const source = `${await readFile(new URL("../src/components/task-app/brainstorm-workspace.tsx", import.meta.url), "utf8")}\n${await readFile(new URL("../src/components/task-app/brainstorm-qa-workspace.tsx", import.meta.url), "utf8")}`;
  assert.match(source, /aria-label="Brainstorm workspace navigation"/);
  assert.match(source, /aria-label=\{`QA item status: \$\{item\.text\}`\}/);
  assert.match(source, /<span className=\{labelClass\}>Notes<\/span>/);
  assert.match(source, /<span className=\{labelClass\}>Paste QA steps<\/span>/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /items imported|item.*imported/);
  assert.match(source, /Full report copied/);
  assert.match(source, /Checklist order saved/);
});

async function qaWorkspaceSource() {
  return readFile(new URL("../src/components/task-app/brainstorm-qa-workspace.tsx", import.meta.url), "utf8");
}

test("Pass transitions collapse QA items through local expansion state", async () => {
  const source = await qaWorkspaceSource();
  assert.match(source, /if \(status === "pass"\) next\.delete\(itemId\)/);
  assert.match(source, /const \[expandedItemIds, setExpandedItemIds\] = useState<Set<string>>/);
});

test("existing passed QA items default to collapsed after hydration", async () => {
  const source = await qaWorkspaceSource();
  assert.match(source, /const isItemExpanded = \(itemId: string, status: QaStatus\) => status !== "pass" \|\| expandedItemIds\.has\(itemId\)/);
});

test("manual expansion toggles a passed item without persisting visual state", async () => {
  const source = await qaWorkspaceSource();
  assert.match(source, /const toggleItemExpansion = \(itemId: string, status: QaStatus\)/);
  assert.match(source, /if \(next\.has\(itemId\)\) next\.delete\(itemId\);\s*else next\.add\(itemId\);/);
  assert.doesNotMatch(source, /qaState:\s*\{[^}]*expandedItemIds/);
});

test("changing away from Pass expands the QA item", async () => {
  const source = await qaWorkspaceSource();
  assert.match(source, /if \(status === "pass"\) next\.delete\(itemId\);\s*else next\.add\(itemId\);/);
});

test("Collapse passed affects only passed QA items", async () => {
  const source = await qaWorkspaceSource();
  assert.match(source, /activeSession\?\.items\.filter\(\(item\) => item\.status === "pass"\)\.forEach\(\(item\) => next\.delete\(item\.id\)\)/);
  assert.match(source, />Collapse passed<\/TaskTableChipButton>/);
});

test("Expand all expands every QA item for the mounted workspace", async () => {
  const source = await qaWorkspaceSource();
  assert.match(source, /const expandAllItems = \(\) => setExpandedItemIds\(new Set\(activeSession\?\.items\.map\(\(item\) => item\.id\) \?\? \[\]\)\)/);
  assert.match(source, />Expand all<\/TaskTableChipButton>/);
});

test("collapsed QA items show a notes indicator only when notes exist", async () => {
  const source = await qaWorkspaceSource();
  assert.match(source, /!expanded && item\.notes\.trim\(\) \? <span aria-label="Notes present"/);
});

test("interactive child controls do not accidentally toggle collapsed item expansion", async () => {
  const source = await qaWorkspaceSource();
  assert.match(source, /const handleCompactRowClick = \(event: ReactMouseEvent<HTMLDivElement>[\s\S]*?closest\("button, input, select, textarea, label"\)/);
  assert.match(source, /onClick=\{\(event\) => handleCompactRowClick\(event, item\.id, item\.status, expanded\)\}/);
  assert.match(source, /aria-label=\{`Expand QA item: \$\{item\.text\}`\}/);
});

test("reorder controls remain outside the collapsible editing fields", async () => {
  const source = await qaWorkspaceSource();
  const moveControl = source.indexOf("aria-label={`Move ${item.text} up`}");
  const editingFields = source.indexOf("{expanded ? <><div className");
  assert.ok(moveControl >= 0 && editingFields >= 0 && moveControl < editingFields);
});

test("QA items no longer render the old Status dropdown", async () => {
  const source = await qaWorkspaceSource();
  assert.doesNotMatch(source, /<select aria-label=\{`Status for \$\{item\.text\}`\}/);
  assert.doesNotMatch(source, /<span className=\{labelClass\}>Status<\/span>/);
});

test("all four inline QA status options render with one selected value", async () => {
  const source = await qaWorkspaceSource();
  assert.match(source, /\{ label: "Not Tested", value: "not_tested" \}/);
  assert.match(source, /\{ label: "Pass", value: "pass" \}/);
  assert.match(source, /\{ label: "Fail", value: "fail" \}/);
  assert.match(source, /\{ label: "Blocked", value: "blocked" \}/);
  assert.match(source, /const selected = item\.status === option\.value/);
  assert.match(source, /checked=\{selected\}/);
});

test("inline Pass selects the existing collapse behavior and other statuses expand", async () => {
  const source = await qaWorkspaceSource();
  assert.match(source, /onChange=\{\(\) => setItemStatus\(item\.id, option\.value\)\}/);
  assert.match(source, /if \(status === "pass"\) next\.delete\(itemId\);\s*else next\.add\(itemId\);/);
});

test("collapsed passed rows keep all inline status controls available", async () => {
  const source = await qaWorkspaceSource();
  const statusGroup = source.indexOf("<fieldset aria-label={`QA item status: ${item.text}`}");
  const collapsedText = source.indexOf("{!expanded ? <button");
  assert.ok(statusGroup >= 0 && collapsedText >= 0 && statusGroup < collapsedText);
});

test("inline status controls expose accessible native radio-group semantics", async () => {
  const source = await qaWorkspaceSource();
  assert.match(source, /<fieldset aria-label=\{`QA item status: \$\{item\.text\}`\}/);
  assert.match(source, /name=\{`qa-status-\$\{item\.id\}`\}/);
  assert.match(source, /type="radio"/);
});

test("status controls are guarded from compact row expansion and can wrap on mobile", async () => {
  const source = await qaWorkspaceSource();
  assert.match(source, /closest\("button, input, select, textarea, label"\)/);
  assert.match(source, /flex min-w-0 flex-wrap items-center gap-2/);
  assert.match(source, /flex min-w-0 flex-wrap items-center gap-1\.5/);
  assert.match(source, /\$\{TASK_TABLE_CHIP_BASE_CLASS\} cursor-pointer/);
});

test("workspace renders import and item Version controls plus version chips in every item header", async () => {
  const source = await qaWorkspaceSource();
  assert.match(source, /const \[importVersionDraft, setImportVersionDraft\] = useState/);
  assert.match(source, /const importVersion = importVersionSessionId === activeSession\?\.id \? importVersionDraft : activeSession\?\.appVersion \?\? ""/);
  assert.match(source, /<span className=\{labelClass\}>Version<\/span>/);
  assert.match(source, /importQaItems\(activeSession, importDraft, mode, importVersion\)/);
  assert.match(source, /\{item\.appVersion \|\| "No version"\}/);
  assert.match(source, /updateQaItem\(activeSession, item\.id, \{ appVersion: event\.target\.value \}\)/);
});

test("version chips and status controls reuse approved shared chip styling", async () => {
  const source = await qaWorkspaceSource();
  assert.match(source, /TASK_TABLE_CHIP_BASE_CLASS, TASK_TABLE_ICON_LABEL_GAP_CLASS, TASK_TABLE_INPUT_CLASS, TASK_TABLE_LIST_CHIP_CLASS/);
  assert.match(source, /\$\{TASK_TABLE_CHIP_BASE_CLASS\} \$\{TASK_TABLE_LIST_CHIP_CLASS\}/);
  assert.match(source, /\$\{TASK_TABLE_CHIP_BASE_CLASS\} cursor-pointer/);
  const statusControls = source.slice(source.indexOf('<fieldset aria-label={`QA item status'), source.indexOf('{!expanded ? <button'));
  assert.doesNotMatch(statusControls, /min-h-9|px-2\.5|text-xs|font-semibold/);
  assert.doesNotMatch(source, /inactiveStatusControlClass/);
});

test("copy report chips use the approved icon-label gap", async () => {
  const source = await qaWorkspaceSource();
  const wrappers = source.match(/inline-flex min-w-0 items-center gap-1\.5/g) ?? [];
  assert.ok(wrappers.length >= 2);
  assert.match(source, /<Copy className="shrink-0" size=\{13\} \/> Copy Full Report/);
  assert.match(source, /<Copy className="shrink-0" size=\{13\} \/> Copy Failures and Blocked/);
});

test("New Session uses the shared icon-label chip gap and QA session deletion confirms its narrow scope", async () => {
  const source = await qaWorkspaceSource();
  assert.match(source, /TASK_TABLE_ICON_LABEL_GAP_CLASS/);
  assert.match(source, /<Plus aria-hidden="true" size=\{13\} \/>New Session/);
  assert.match(source, /requestConfirmation\("delete-session"\)/);
  assert.match(source, /deleteQaSession\(qaState, activeSession\.id\)/);
  assert.match(source, /Questionnaire content and other QA sessions will remain/);
});

test("Clear Passed is disabled without passes and confirms the active-session removal count", async () => {
  const source = await qaWorkspaceSource();
  assert.match(source, /disabled=\{!progress\?\.pass\}/);
  assert.match(source, /requestConfirmation\("clear-passed"\)/);
  assert.match(source, /\$\{progress\?\.pass \?\? 0\} passed item/);
  assert.match(source, /clearPassedQaItems\(activeSession\)/);
  assert.match(source, /Fail, Blocked, and Not Tested items will remain/);
});
