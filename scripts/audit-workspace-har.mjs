#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const FANOUT_REQUEST_THRESHOLD = 5;
const CLASS_NAMES = [
  "TASK_ENTITY_READ",
  "PROJECTION_READ",
  "SCHEDULE_BOUNDARY_READ",
  "BOUNDED_HISTORY_READ",
  "HOME_CURRENT_DAY_HISTORY",
  "HISTORY_DELTA_READ",
  "COMMAND_LEDGER_READ",
  "TASK_ACTIVITY_SUMMARY_RPC",
  "RECORDS_FRESHNESS_RPC",
  "RECORDS_PERSISTED_CURRENT_READ",
  "RECORDS_PERSISTED_VALID_EVENT_READ",
  "INVALIDATED_RECORD_EVENT_READ",
  "RECORDS_EDGE_RECALC",
  "PROJECTION_EDGE_REBUILD",
  "FOCUS_SESSION_READ",
];

const DATE_FILTER_NAMES = new Set([
  "logical_date",
  "entry_date",
  "session_date",
  "credited_date",
  "occurred_at",
  "started_at",
  "ended_at",
  "created_at",
  "updated_at",
]);

function emptyBucket() {
  return { requests: 0, knownRows: 0, unknownRows: 0 };
}

function createBuckets() {
  return Object.fromEntries(CLASS_NAMES.map((name) => [name, emptyBucket()]));
}

function finiteNonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function byteLength(value) {
  return Buffer.byteLength(value, "utf8");
}

function decodeContentText(content) {
  if (!content || typeof content.text !== "string") return null;
  if (content.encoding === "base64") {
    try {
      return Buffer.from(content.text, "base64").toString("utf8");
    } catch {
      return null;
    }
  }
  return content.text;
}

function knownRequestBytes(request) {
  const bodySize = finiteNonNegativeNumber(request?.bodySize);
  if (bodySize !== null) return bodySize;
  if (typeof request?.postData?.text === "string") return byteLength(request.postData.text);
  if (!request?.postData) return 0;
  return null;
}

function knownResponseBytes(response) {
  const bodySize = finiteNonNegativeNumber(response?.bodySize);
  if (bodySize !== null) return bodySize;
  const contentSize = finiteNonNegativeNumber(response?.content?.size);
  if (contentSize !== null) return contentSize;
  const text = decodeContentText(response?.content);
  return text === null ? null : byteLength(text);
}

function responseRowCount(response) {
  const text = decodeContentText(response?.content);
  if (text === null || text.trim() === "") return null;
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (Array.isArray(value)) return value.length;
  if (!value || typeof value !== "object") return null;
  for (const key of ["data", "rows", "results", "items"]) {
    if (Array.isArray(value[key])) return value[key].length;
  }
  return null;
}

function parseEntryUrl(entry) {
  const rawUrl = entry?.request?.url;
  if (typeof rawUrl !== "string" || rawUrl.length === 0) return null;
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

function collectQueryParams(entry, url) {
  const params = new Map();
  const add = (name, value) => {
    if (typeof name !== "string") return;
    const key = name.toLowerCase();
    const values = params.get(key) ?? [];
    values.push(typeof value === "string" ? value : "");
    params.set(key, values);
  };
  if (Array.isArray(entry?.request?.queryString)) {
    for (const pair of entry.request.queryString) add(pair?.name, pair?.value);
  }
  if (url) {
    for (const [name, value] of url.searchParams.entries()) add(name, value);
  }
  return params;
}

function collectHeaders(entry) {
  const headers = new Map();
  if (!Array.isArray(entry?.request?.headers)) return headers;
  for (const header of entry.request.headers) {
    if (typeof header?.name !== "string") continue;
    headers.set(header.name.toLowerCase(), typeof header.value === "string" ? header.value : "");
  }
  return headers;
}

function hasFilter(params, name, operators = null) {
  const values = params.get(name) ?? [];
  if (!operators) return values.length > 0;
  return values.some((value) => operators.some((operator) => value === operator || value.startsWith(`${operator}.`)));
}

function hasDateConstraint(params) {
  return [...DATE_FILTER_NAMES].some((name) => hasFilter(params, name));
}

function hasEntityConstraint(params) {
  return hasFilter(params, "entity_id") || hasFilter(params, "task_id");
}

function tableName(url) {
  if (!url) return null;
  const match = url.pathname.match(/\/rest\/v1\/([^/]+)/i);
  return match ? decodeURIComponent(match[1]).toLowerCase() : null;
}

function rpcName(url) {
  if (!url) return null;
  const match = url.pathname.match(/\/rest\/v1\/rpc\/([^/]+)/i);
  return match ? decodeURIComponent(match[1]).toLowerCase() : null;
}

function edgeFunctionName(url) {
  if (!url) return null;
  const match = url.pathname.match(/\/functions\/v1\/([^/]+)/i);
  return match ? decodeURIComponent(match[1]).toLowerCase() : null;
}

function isSupabaseRequest(url) {
  if (!url) return false;
  const hostname = url.hostname.toLowerCase();
  return (hostname === "supabase.co" || hostname.endsWith(".supabase.co"))
    || /\/(?:rest\/v1|functions\/v1|realtime\/v1)(?:\/|$)/i.test(url.pathname);
}

function isRealtimeHandshake(entry, url, headers) {
  const protocol = url?.protocol?.toLowerCase();
  return protocol === "ws:" || protocol === "wss:"
    || /\/realtime(?:\/|$)/i.test(url?.pathname ?? "")
    || entry?.response?.status === 101
    || headers.get("upgrade")?.toLowerCase() === "websocket";
}

function websocketMessages(entry) {
  const messages = entry?._webSocketMessages ?? entry?.webSocketMessages;
  return Array.isArray(messages) ? messages.length : null;
}

function addBucket(buckets, name, rowCount) {
  if (!buckets[name]) return;
  buckets[name].requests += 1;
  if (rowCount === null) buckets[name].unknownRows += 1;
  else buckets[name].knownRows += rowCount;
}

function classifyEntry(entry) {
  const url = parseEntryUrl(entry);
  const params = collectQueryParams(entry, url);
  const headers = collectHeaders(entry);
  const table = tableName(url);
  const rpc = rpcName(url);
  const edge = edgeFunctionName(url);
  const rowCount = responseRowCount(entry?.response);
  const labels = [];

  if (table === "adhdice_clean_tasks") labels.push("TASK_ENTITY_READ");
  if (table === "adhdice_task_current_projections") labels.push("PROJECTION_READ");
  if (table === "adhdice_task_schedule_boundaries") labels.push("SCHEDULE_BOUNDARY_READ");
  if (table === "adhdice_focus_sessions") labels.push("FOCUS_SESSION_READ");
  if (table === "adhdice_task_history_changes" || rpc === "adhdice_get_task_history_delta") labels.push("HISTORY_DELTA_READ");
  if (table === "adhdice_task_command_operations") {
    labels.push("COMMAND_LEDGER_READ");
  }
  if (rpc === "adhdice_get_task_activity_summary") labels.push("TASK_ACTIVITY_SUMMARY_RPC");
  if (rpc === "adhdice_get_records_source_state" || rpc === "adhdice_get_latest_completed_records_run") labels.push("RECORDS_FRESHNESS_RPC");
  if (table === "adhdice_record_current") labels.push("RECORDS_PERSISTED_CURRENT_READ");
  if (table === "adhdice_record_events") {
    const validity = params.get("validity_state") ?? [];
    if (validity.some((value) => /invalid|superseded/.test(value))) labels.push("INVALIDATED_RECORD_EVENT_READ");
    if (validity.some((value) => value === "valid" || value.startsWith("eq.valid"))) labels.push("RECORDS_PERSISTED_VALID_EVENT_READ");
  }
  if (edge === "records-recalculate") labels.push("RECORDS_EDGE_RECALC");
  if (edge === "task-current-projection-backfill") labels.push("PROJECTION_EDGE_REBUILD");

  const isHistoryRead = table === "adhdice_task_history_facts";
  const historyIsEntityOrDateBound = hasEntityConstraint(params) || hasDateConstraint(params);
  if (isHistoryRead && historyIsEntityOrDateBound) labels.push("BOUNDED_HISTORY_READ");
  if (isHistoryRead && hasFilter(params, "logical_date", ["eq"])) labels.push("HOME_CURRENT_DAY_HISTORY");

  const requestBodyBytes = knownRequestBytes(entry?.request);
  const responseBodyBytes = knownResponseBytes(entry?.response);
  const websocketMessageCount = websocketMessages(entry);
  const referer = headers.get("referer") ?? headers.get("referrer") ?? "";

  return {
    edge,
    historyIsEntityOrDateBound,
    isHistoryRead,
    labels,
    requestBodyBytes,
    responseBodyBytes,
    rowCount,
    rpc,
    table,
    url,
    websocketMessageCount,
    referer,
    commandLedgerIsEntityBound: hasEntityConstraint(params),
    historyEntityBound: hasEntityConstraint(params),
  };
}

function buildFlags(classifications, measurements) {
  const flags = [];
  const historyEntries = classifications.filter((item) => item.isHistoryRead);
  const fullHistoryEntries = historyEntries.filter((item) => !item.historyIsEntityOrDateBound);
  const entityHistoryEntries = historyEntries.filter((item) => item.historyEntityBound);
  const commandLedgerEntries = classifications.filter((item) => item.table === "adhdice_task_command_operations");
  const sourceTables = new Set(classifications.map((item) => item.table));
  const summaryPresent = measurements.classes.TASK_ACTIVITY_SUMMARY_RPC.requests > 0;
  const pageHints = classifications.some((item) => /(?:stats|games|achievements)/i.test(item.referer));

  if (fullHistoryEntries.length > 0) {
    flags.push({ name: "FULL_WORKSPACE_HISTORY", status: "VIOLATION", count: fullHistoryEntries.length });
  }
  const broadCommandReads = commandLedgerEntries.filter((item) => !item.commandLedgerIsEntityBound);
  if (broadCommandReads.length > 0) {
    flags.push({ name: "COMMAND_LEDGER_BULK_READ", status: "VIOLATION", count: broadCommandReads.length });
  }
  if (entityHistoryEntries.length >= FANOUT_REQUEST_THRESHOLD) {
    flags.push({ name: "PER_TASK_HISTORY_FANOUT", status: "VIOLATION", count: entityHistoryEntries.length });
  }
  if (sourceTables.has("adhdice_clean_tasks") && sourceTables.has("adhdice_task_history_facts") && sourceTables.has("adhdice_focus_sessions")) {
    flags.push({ name: "BROWSER_RECORDS_BULK_RECALC", status: "VIOLATION", count: 1 });
  }
  if (fullHistoryEntries.length > 0 && (summaryPresent || pageHints)) {
    flags.push({ name: "FULL_HISTORY_FOR_STATS", status: "VIOLATION", count: fullHistoryEntries.length });
  }

  if (measurements.classes.RECORDS_EDGE_RECALC.requests > 0) {
    flags.push({ name: "RECORDS_EDGE_RECALC", status: "INFO", count: measurements.classes.RECORDS_EDGE_RECALC.requests });
  }
  if (measurements.classes.RECORDS_FRESHNESS_RPC.requests > 0
    && measurements.classes.RECORDS_PERSISTED_CURRENT_READ.requests > 0
    && measurements.classes.RECORDS_PERSISTED_VALID_EVENT_READ.requests > 0
    && measurements.classes.RECORDS_EDGE_RECALC.requests === 0) {
    flags.push({ name: "RECORDS_PERSISTED_FAST_PATH", status: "INFO", count: 1 });
  }
  if (measurements.classes.PROJECTION_EDGE_REBUILD.requests > 0) {
    flags.push({ name: "PROJECTION_EDGE_REBUILD", status: "INFO", count: measurements.classes.PROJECTION_EDGE_REBUILD.requests });
  }

  return flags;
}

function validateHar(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("HAR must be a JSON object.");
  if (!value.log || typeof value.log !== "object" || !Array.isArray(value.log.entries)) {
    throw new Error("HAR must contain log.entries as an array.");
  }
  return value;
}

export function analyzeHar(har) {
  const validHar = validateHar(har);
  const entries = validHar.log.entries;
  const classes = createBuckets();
  const classifications = [];
  let totalKnownTransferredBytes = 0;
  let totalKnownResponseBytes = 0;
  let unknownSizeRequestCount = 0;
  let supabaseRequestCount = 0;
  let edgeFunctionRequestCount = 0;
  let realtimeHandshakeCount = 0;
  let realtimeMessageCount = 0;
  let realtimeMessagesMeasurable = false;

  for (const entry of entries) {
    const classification = classifyEntry(entry);
    classifications.push(classification);
    const requestBytes = classification.requestBodyBytes;
    const responseBytes = classification.responseBodyBytes;
    if (requestBytes === null) unknownSizeRequestCount += 1;
    if (requestBytes !== null) totalKnownTransferredBytes += requestBytes;
    if (responseBytes !== null) {
      totalKnownTransferredBytes += responseBytes;
      totalKnownResponseBytes += responseBytes;
    }
    if (isSupabaseRequest(classification.url)) supabaseRequestCount += 1;
    if (classification.edge) edgeFunctionRequestCount += 1;
    const headers = collectHeaders(entry);
    if (isRealtimeHandshake(entry, classification.url, headers)) realtimeHandshakeCount += 1;
    if (classification.websocketMessageCount !== null) {
      realtimeMessagesMeasurable = true;
      realtimeMessageCount += classification.websocketMessageCount;
    }
    for (const label of classification.labels) addBucket(classes, label, classification.rowCount);
  }

  const flags = buildFlags(classifications, { classes });
  return {
    requestCount: entries.length,
    supabaseRequestCount,
    edgeFunctionRequestCount,
    realtimeHandshakeCount,
    realtimeMessagesMeasurable,
    realtimeMessageCount: realtimeMessagesMeasurable ? realtimeMessageCount : null,
    totalKnownTransferredBytes,
    totalKnownResponseBytes,
    unknownSizeRequestCount,
    classes,
    flags,
  };
}

function formatBytes(value) {
  if (value === 0) return "0 B";
  if (value < 1024) return `${value} B`;
  const units = ["KiB", "MiB", "GiB"];
  let size = value;
  let unit = "B";
  for (const nextUnit of units) {
    size /= 1024;
    unit = nextUnit;
    if (size < 1024) break;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${unit}`;
}

function formatRows(bucket) {
  const rows = bucket.unknownRows > 0 && bucket.knownRows === 0 ? "unknown" : bucket.knownRows.toLocaleString("en-US");
  const unknown = bucket.unknownRows > 0 ? `; unknown=${bucket.unknownRows}` : "";
  return `${bucket.requests} request(s), rows=${rows}${unknown}`;
}

function formatClassLine(report, name) {
  return `- ${name}: ${formatRows(report.classes[name])}`;
}

function formatNamedClassLine(report, label, name) {
  return formatClassLine(report, name).replace(name, label);
}

function formatFlagLine(report, name) {
  const flag = report.flags.find((candidate) => candidate.name === name);
  return `- ${name}: ${flag ? `${flag.status} (${flag.count})` : "not observed"}`;
}

export function formatAuditReport(report) {
  const lines = [
    "Workspace Efficiency Audit",
    "",
    "Requests",
    `- total request count: ${report.requestCount}`,
    `- Supabase request count: ${report.supabaseRequestCount}`,
    `- Edge Function request count: ${report.edgeFunctionRequestCount}`,
    `- Realtime/WebSocket handshake count: ${report.realtimeHandshakeCount}`,
    "",
    "Transfer",
    `- total known transferred bytes: ${formatBytes(report.totalKnownTransferredBytes)}`,
    `- total known response/body bytes: ${formatBytes(report.totalKnownResponseBytes)}`,
    `- unknown-size request count: ${report.unknownSizeRequestCount}`,
    "",
    "Key read classes",
    formatNamedClassLine(report, "Task entity reads", "TASK_ENTITY_READ"),
    formatNamedClassLine(report, "current projection reads", "PROJECTION_READ"),
    formatNamedClassLine(report, "schedule-boundary reads", "SCHEDULE_BOUNDARY_READ"),
    formatNamedClassLine(report, "bounded History reads", "BOUNDED_HISTORY_READ"),
    formatNamedClassLine(report, "Home bounded current-day History reads", "HOME_CURRENT_DAY_HISTORY"),
    formatNamedClassLine(report, "Task History delta/change reads", "HISTORY_DELTA_READ"),
    formatNamedClassLine(report, "command/audit-ledger reads", "COMMAND_LEDGER_READ"),
    formatNamedClassLine(report, "Task Activity Summary RPCs", "TASK_ACTIVITY_SUMMARY_RPC"),
    formatNamedClassLine(report, "Records freshness RPCs", "RECORDS_FRESHNESS_RPC"),
    formatNamedClassLine(report, "persisted Records current reads", "RECORDS_PERSISTED_CURRENT_READ"),
    formatNamedClassLine(report, "persisted valid Record-event reads", "RECORDS_PERSISTED_VALID_EVENT_READ"),
    formatNamedClassLine(report, "invalid/superseded Record-event reads", "INVALIDATED_RECORD_EVENT_READ"),
    formatNamedClassLine(report, "Records Edge recalculation", "RECORDS_EDGE_RECALC"),
    formatNamedClassLine(report, "Focus Session reads", "FOCUS_SESSION_READ"),
    "",
    "Architecture classifications",
    formatClassLine(report, "HISTORY_DELTA_READ"),
    formatClassLine(report, "BOUNDED_HISTORY_READ"),
    formatClassLine(report, "HOME_CURRENT_DAY_HISTORY"),
    formatClassLine(report, "PROJECTION_READ"),
    formatClassLine(report, "PROJECTION_EDGE_REBUILD"),
    formatClassLine(report, "RECORDS_EDGE_RECALC"),
    formatFlagLine(report, "RECORDS_PERSISTED_FAST_PATH"),
    "",
    "Realtime",
    `- Realtime connection visible in HAR: ${report.realtimeHandshakeCount > 0 ? `yes (${report.realtimeHandshakeCount})` : "no"}`,
    report.realtimeMessagesMeasurable
      ? `- Realtime message activity measurable: yes (${report.realtimeMessageCount} represented frame(s))`
      : "- Realtime message activity measurable: no (HAR contains no WebSocket message frames)",
    "",
    "Architecture flags",
  ];

  if (report.flags.length === 0) {
    lines.push("- none");
  } else {
    for (const flag of report.flags) lines.push(`- ${flag.name}: ${flag.status} (${flag.count})`);
  }
  return `${lines.join("\n")}\n`;
}

function readHarFile(filePath) {
  let text;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    throw new Error("Could not read the HAR file.");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("HAR file is not valid JSON.");
  }
}

export function main(argv = process.argv.slice(2)) {
  const filePath = argv[0];
  if (!filePath) {
    console.error("Usage: npm run audit:workspace-har -- <path-to-har>");
    return 2;
  }
  try {
    const report = analyzeHar(readHarFile(path.resolve(filePath)));
    process.stdout.write(formatAuditReport(report));
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Could not analyze HAR.");
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main();
}
