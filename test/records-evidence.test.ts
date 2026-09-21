import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTaskEvidenceByRecordIdentity,
  formatRecordTaskEvidenceEntityKind,
  formatRecordTaskEvidenceOutcome,
  getRecordTaskEvidenceCount,
  parseRecordTaskEvidenceSourceRows,
  recordIdentity,
} from "../src/lib/records/evidence.ts";

function row(id: string, taskId: string, date: string, extra: Record<string, unknown> = {}) {
  return {
    canonical_occurrence_identity: `occurrence:${id}`,
    counted_as_due_occurrence: false,
    entity_kind: "parent",
    entry_date: date,
    event_type: "status",
    occurrence_due_on: date,
    source_row_id: id,
    status: "done",
    task_id: taskId,
    title: taskId,
    ...extra,
  };
}

function candidate(metricKey: string, sourceRows: Record<string, unknown>[]) {
  return { evidence: { identities: sourceRows.map((sourceRow) => String(sourceRow.canonical_occurrence_identity)), sourceRows }, metricKey, scopeId: null, scopeKind: "global" } as never;
}

test("parent day evidence retains exact occurrence rows", () => {
  const evidence = parseRecordTaskEvidenceSourceRows("parent_tasks_day", [row("row-2", "Clean kitchen", "2026-09-07"), row("row-1", "Morning medication", "2026-09-07", { status: "did_my_best" })]);
  assert.deepEqual(evidence.map((item) => [item.title, item.outcome, item.sourceRowId]), [["Clean kitchen", "done", "row-2"], ["Morning medication", "did_my_best", "row-1"]]);
});

test("Step evidence preserves Step identity and label", () => {
  const evidence = parseRecordTaskEvidenceSourceRows("steps_day", [row("step-1", "Call dentist", "2026-09-07", { entity_kind: "step" })]);
  assert.equal(evidence[0]?.entityKind, "step");
  assert.equal(formatRecordTaskEvidenceEntityKind(evidence[0]!.entityKind), "Step");
});

test("permanent Complete evidence maps to Completed", () => {
  const evidence = parseRecordTaskEvidenceSourceRows("permanent_completes_day", [row("complete-1", "File taxes", "2026-09-07", { status: "complete", event_type: "completed_permanently" })]);
  assert.equal(evidence[0]?.outcome, "complete");
  assert.equal(formatRecordTaskEvidenceOutcome(evidence[0]!.outcome), "Completed");
});

test("week and month evidence retain repeated occurrences of the same Task without task-id dedupe", () => {
  const rows = [row("row-1", "Recurring Task", "2026-09-01"), row("row-2", "Recurring Task", "2026-09-03"), row("row-3", "Recurring Task", "2026-09-05")];
  assert.equal(buildTaskEvidenceByRecordIdentity([candidate("parent_tasks_week", rows)])[recordIdentity("parent_tasks_week", "global", null)]?.length, 3);
  assert.equal(buildTaskEvidenceByRecordIdentity([candidate("parent_tasks_month", rows)])[recordIdentity("parent_tasks_month", "global", null)]?.length, 3);
});

test("all supported Task aggregate metrics are recognized", () => {
  for (const metricKey of ["parent_tasks_day", "parent_tasks_week", "parent_tasks_month", "steps_day", "steps_week", "steps_month", "permanent_completes_day"] as const) {
    const key = recordIdentity(metricKey, "global", null);
    assert.equal(buildTaskEvidenceByRecordIdentity([candidate(metricKey, [row(metricKey, "Task", "2026-09-07")])])[key]?.length, 1);
  }
  assert.deepEqual(parseRecordTaskEvidenceSourceRows("focus_duration_day", [row("focus", "Focus", "2026-09-07")]), []);
});

test("malformed source rows are ignored without inventing evidence", () => {
  const evidence = parseRecordTaskEvidenceSourceRows("parent_tasks_day", [row("valid", "Valid", "2026-09-07"), null, "not a row", { ...row("bad", "Bad", "2026-09-07"), source_row_id: 42 }, { ...row("bad-date", "Bad Date", "2026-09-07"), occurrence_due_on: undefined }]);
  assert.deepEqual(evidence.map((item) => item.sourceRowId), ["valid"]);
  assert.deepEqual(parseRecordTaskEvidenceSourceRows("parent_tasks_day", null), []);
});

test("evidence ordering is chronological, then title, and count state is explicit", () => {
  const evidence = parseRecordTaskEvidenceSourceRows("parent_tasks_month", [row("later", "Alpha", "2026-09-03"), row("earlier-b", "Beta", "2026-09-01"), row("earlier-a", "Alpha", "2026-09-01")]);
  assert.deepEqual(evidence.map((item) => item.sourceRowId), ["earlier-a", "earlier-b", "later"]);
  assert.deepEqual(getRecordTaskEvidenceCount(3, evidence), { matches: true, text: "3 of 3 counted occurrences", warning: null });
  assert.deepEqual(getRecordTaskEvidenceCount(4, evidence), { matches: false, text: "3 evidence items found for a Record value of 4", warning: "Record evidence is out of sync. Refresh Records to recalculate." });
});

test("outcome labels remain exact", () => {
  assert.deepEqual(["done", "did_my_best", "complete"].map((outcome) => formatRecordTaskEvidenceOutcome(outcome as "done" | "did_my_best" | "complete")), ["Done", "Did My Best", "Completed"]);
});
