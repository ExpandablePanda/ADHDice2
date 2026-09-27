import assert from "node:assert/strict";
import test from "node:test";

import { analyzeHar, formatAuditReport } from "../scripts/audit-workspace-har.mjs";

const SUPABASE_ORIGIN = "https://example.supabase.co";

function har(entries = []) {
  return { log: { version: "1.2", creator: { name: "synthetic-test" }, entries } };
}

function entry({
  path,
  method = "GET",
  responseBody,
  responseContent = true,
  requestBody,
  requestBodySize,
  responseBodySize,
  headers = [],
  webSocketMessages,
}) {
  const url = path.startsWith("http") ? path : `${SUPABASE_ORIGIN}${path}`;
  const response = { status: 200 };
  if (responseContent) {
    response.content = { mimeType: "application/json" };
    if (responseBody !== undefined) response.content.text = JSON.stringify(responseBody);
  }
  if (responseBodySize !== undefined) response.bodySize = responseBodySize;
  const request = { method, url, headers };
  if (requestBody !== undefined) request.postData = { text: requestBody };
  if (requestBodySize !== undefined) request.bodySize = requestBodySize;
  const result = { request, response };
  if (webSocketMessages !== undefined) result._webSocketMessages = webSocketMessages;
  return result;
}

function flag(report, name) {
  return report.flags.find((candidate) => candidate.name === name);
}

test("rejects malformed HAR values", () => {
  assert.throws(() => analyzeHar(null), /HAR must be a JSON object/);
  assert.throws(() => analyzeHar({ log: {} }), /log\.entries as an array/);
});

test("accepts an empty HAR", () => {
  const report = analyzeHar(har());
  assert.equal(report.requestCount, 0);
  assert.equal(report.totalKnownTransferredBytes, 0);
  assert.equal(report.flags.length, 0);
});

test("counts requests and known request/response bytes", () => {
  const report = analyzeHar(har([
    entry({ path: "/rest/v1/adhdice_clean_tasks", requestBody: "abc", requestBodySize: 3, responseBody: [], responseBodySize: 7 }),
    entry({ path: "/rest/v1/adhdice_task_current_projections", responseBody: [{ id: "task-1" }], responseBodySize: 11 }),
  ]));
  assert.equal(report.requestCount, 2);
  assert.equal(report.supabaseRequestCount, 2);
  assert.equal(report.totalKnownTransferredBytes, 21);
  assert.equal(report.totalKnownResponseBytes, 18);
  assert.equal(report.unknownSizeRequestCount, 0);
});

test("counts safe JSON rows and marks absent response bodies unknown", () => {
  const report = analyzeHar(har([
    entry({ path: "/rest/v1/adhdice_task_current_projections", responseBody: [{ id: "task-1" }, { id: "task-2" }] }),
    entry({ path: "/rest/v1/adhdice_task_schedule_boundaries", responseContent: false }),
  ]));
  assert.equal(report.classes.PROJECTION_READ.knownRows, 2);
  assert.equal(report.classes.PROJECTION_READ.unknownRows, 0);
  assert.equal(report.classes.SCHEDULE_BOUNDARY_READ.unknownRows, 1);
  assert.match(formatAuditReport(report), /current projection reads: 1 request\(s\), rows=2/);
});

test("classifies entity/date History reads as bounded", () => {
  const report = analyzeHar(har([
    entry({ path: "/rest/v1/adhdice_task_history_facts?select=*&entity_id=eq.task-1&logical_date=gte.2026-09-01&logical_date=lte.2026-09-30", responseBody: [] }),
  ]));
  assert.equal(report.classes.BOUNDED_HISTORY_READ.requests, 1);
  assert.equal(report.classes.HOME_CURRENT_DAY_HISTORY.requests, 0);
  assert.equal(flag(report, "FULL_WORKSPACE_HISTORY"), undefined);
});

test("flags an unbounded workspace History read", () => {
  const report = analyzeHar(har([
    entry({ path: "/rest/v1/adhdice_task_history_facts?select=*&order=logical_date.desc", responseBody: [] }),
  ]));
  assert.equal(flag(report, "FULL_WORKSPACE_HISTORY").count, 1);
});

test("flags broad command-ledger reads and full History opened with Stats", () => {
  const report = analyzeHar(har([
    entry({ path: "/rest/v1/adhdice_task_command_operations?select=*", responseBody: [] }),
    entry({ path: "/rest/v1/adhdice_task_history_facts?select=*", headers: [{ name: "Referer", value: "https://app.example/stats" }], responseBody: [] }),
    entry({ path: "/rest/v1/rpc/adhdice_get_task_activity_summary", method: "POST", responseBody: { rows: [] } }),
  ]));
  assert.equal(flag(report, "COMMAND_LEDGER_BULK_READ").status, "VIOLATION");
  assert.equal(flag(report, "FULL_HISTORY_FOR_STATS").status, "VIOLATION");
});

test("flags many separate entity History reads as fanout", () => {
  const entries = Array.from({ length: 5 }, (_, index) => entry({
    path: `/rest/v1/adhdice_task_history_facts?select=*&entity_id=eq.task-${index + 1}`,
    responseBody: [],
  }));
  const report = analyzeHar(har(entries));
  assert.equal(flag(report, "PER_TASK_HISTORY_FANOUT").count, 5);
});

test("classifies projection, delta, and Task Activity Summary reads", () => {
  const report = analyzeHar(har([
    entry({ path: "/rest/v1/adhdice_task_current_projections?select=task_id", responseBody: [] }),
    entry({ path: "/rest/v1/rpc/adhdice_get_task_history_delta", method: "POST", responseBody: { changes: [] } }),
    entry({ path: "/rest/v1/rpc/adhdice_get_task_activity_summary", method: "POST", responseBody: { rows: [] } }),
  ]));
  assert.equal(report.classes.PROJECTION_READ.requests, 1);
  assert.equal(report.classes.HISTORY_DELTA_READ.requests, 1);
  assert.equal(report.classes.TASK_ACTIVITY_SUMMARY_RPC.requests, 1);
});

test("classifies Home current-day History reads", () => {
  const report = analyzeHar(har([
    entry({ path: "/rest/v1/adhdice_task_history_facts?select=*&logical_date=eq.2026-09-26", responseBody: [] }),
  ]));
  assert.equal(report.classes.BOUNDED_HISTORY_READ.requests, 1);
  assert.equal(report.classes.HOME_CURRENT_DAY_HISTORY.requests, 1);
});

test("classifies the fresh persisted Records path", () => {
  const report = analyzeHar(har([
    entry({ path: "/rest/v1/rpc/adhdice_get_latest_completed_records_run", method: "POST", responseBody: {} }),
    entry({ path: "/rest/v1/rpc/adhdice_get_records_source_state", method: "POST", responseBody: {} }),
    entry({ path: "/rest/v1/adhdice_record_current?select=*", responseBody: [] }),
    entry({ path: "/rest/v1/adhdice_record_events?select=*&validity_state=eq.valid", responseBody: [] }),
  ]));
  assert.equal(report.classes.RECORDS_FRESHNESS_RPC.requests, 2);
  assert.equal(flag(report, "RECORDS_PERSISTED_FAST_PATH").status, "INFO");
});

test("classifies Records Edge recalculation", () => {
  const report = analyzeHar(har([
    entry({ path: "/functions/v1/records-recalculate", method: "POST", responseBody: { status: "success" } }),
  ]));
  assert.equal(report.classes.RECORDS_EDGE_RECALC.requests, 1);
  assert.equal(flag(report, "RECORDS_EDGE_RECALC").status, "INFO");
});

test("flags browser Records bulk recalculation", () => {
  const report = analyzeHar(har([
    entry({ path: "/rest/v1/adhdice_clean_tasks?select=*", responseBody: [] }),
    entry({ path: "/rest/v1/adhdice_task_history_facts?select=*", responseBody: [] }),
    entry({ path: "/rest/v1/adhdice_focus_sessions?select=*", responseBody: [] }),
  ]));
  assert.equal(flag(report, "BROWSER_RECORDS_BULK_RECALC").status, "VIOLATION");
});

test("classifies invalidated Record-event pagination", () => {
  const report = analyzeHar(har([
    entry({ path: "/rest/v1/adhdice_record_events?select=*&validity_state=in.(invalid,superseded)&limit=25", responseBody: [] }),
  ]));
  assert.equal(report.classes.INVALIDATED_RECORD_EVENT_READ.requests, 1);
  assert.equal(report.classes.RECORDS_PERSISTED_VALID_EVENT_READ.requests, 0);
});

test("does not emit sensitive request or response values", () => {
  const report = analyzeHar(har([
    entry({
      path: "/rest/v1/adhdice_clean_tasks?user_id=eq.user-secret",
      headers: [{ name: "Authorization", value: "Bearer private-token" }],
      requestBody: JSON.stringify({ title: "private title", note: "private note" }),
      responseBody: [{ user_id: "user-secret", title: "private title" }],
    }),
  ]));
  const output = formatAuditReport(report);
  assert.doesNotMatch(output, /private-token|private title|private note|user-secret/);
});

test("does not fabricate Realtime message counts from a WebSocket handshake", () => {
  const report = analyzeHar(har([
    entry({ path: "wss://example.supabase.co/realtime/v1/websocket?apikey=private-key" }),
  ]));
  assert.equal(report.realtimeHandshakeCount, 1);
  assert.equal(report.realtimeMessagesMeasurable, false);
  assert.equal(report.realtimeMessageCount, null);
  assert.match(formatAuditReport(report), /Realtime message activity measurable: no/);
  assert.doesNotMatch(formatAuditReport(report), /represented frame/);
});
