import {
  RECORD_METRICS,
  type PersistedRecordCurrent,
  type PersistedRecordEvent,
  type RecordMetricKey,
  type RecordUnit,
} from "@/lib/records/types";

export type ReportDateRange = {
  endDateKey: string | null;
  startDateKey: string | null;
};

export type RecordsReportData = {
  currentRecords: PersistedRecordCurrent[];
  events: PersistedRecordEvent[];
  warning?: string | null;
};

function parseReportDate(value: string) {
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  return new Date(value);
}

export function toReportDateKey(value: string) {
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnlyMatch) return value;
  const date = parseReportDate(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function formatReportDate(value: string, options: { includeWeekday?: boolean; short?: boolean } = {}) {
  const date = parseReportDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", options.short
    ? { day: "numeric", month: "short" }
    : {
        day: "numeric",
        month: "short",
        weekday: options.includeWeekday ? "short" : undefined,
        year: "numeric",
      }).format(date);
}

export function isReportDateInRange(value: string, range: ReportDateRange) {
  const dateKey = toReportDateKey(value);
  return Boolean(
    dateKey
    && (!range.startDateKey || dateKey >= range.startDateKey)
    && (!range.endDateKey || dateKey <= range.endDateKey),
  );
}

export function formatReportRecordValue(value: number, unit: RecordUnit) {
  if (unit !== "seconds") {
    const singularUnits: Record<Exclude<RecordUnit, "seconds">, string> = {
      days: "day",
      occurrences: "occurrence",
      sessions: "session",
      steps: "step",
      tasks: "task",
    };
    return `${value.toLocaleString("en-US")} ${value === 1 ? singularUnits[unit] : unit}`;
  }
  const safeValue = Math.max(0, value);
  const hours = Math.floor(safeValue / 3600);
  const minutes = Math.floor((safeValue % 3600) / 60);
  const seconds = safeValue % 60;
  return hours ? `${hours}h ${minutes}m` : minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function matchesRecordIdentity(
  left: Pick<PersistedRecordCurrent | PersistedRecordEvent, "metric_key" | "scope_id" | "scope_kind">,
  right: Pick<PersistedRecordCurrent | PersistedRecordEvent, "metric_key" | "scope_id" | "scope_kind">,
) {
  return left.metric_key === right.metric_key
    && left.scope_kind === right.scope_kind
    && left.scope_id === right.scope_id;
}

function getRecordCategory(metricKey: RecordMetricKey) {
  const section = RECORD_METRICS[metricKey].section;
  if (section === "tasks") return "Global Tasks";
  if (section === "streaks") return "Streaks";
  if (section === "focus") return "Focus";
  return "Per-task";
}

function findPreviousValue(
  record: PersistedRecordCurrent | PersistedRecordEvent,
  events: PersistedRecordEvent[],
) {
  if ("event_kind" in record && record.event_kind === "tie") return record.value;
  return events
    .filter((event) => (
      event.validity_state === "valid"
      && matchesRecordIdentity(event, record)
      && event.value < record.value
      && event.first_achieved_at < record.first_achieved_at
    ))
    .reduce<number | null>((highest, event) => highest === null ? event.value : Math.max(highest, event.value), null);
}

function shortenScopeId(scopeId: string | null) {
  return scopeId ? scopeId.slice(0, 8) : null;
}

function formatRecordScope(
  record: PersistedRecordCurrent | PersistedRecordEvent,
  taskPathById: Readonly<Record<string, string>>,
) {
  if (record.scope_kind !== "task") return "Global";
  const scopeId = record.scope_id;
  const path = scopeId ? taskPathById[scopeId]?.trim() : null;
  if (path) return `Task — ${path}`;
  const title = record.title_snapshot?.trim() || "Unknown task";
  const shortId = shortenScopeId(scopeId);
  return `Task — ${title}${shortId ? ` [${shortId}]` : ""}`;
}

export function formatRecordsReportSection(
  data: RecordsReportData,
  range: ReportDateRange,
  taskPathById: Readonly<Record<string, string>> = {},
) {
  const validEvents = data.events.filter((event) => event.validity_state === "valid");
  const globalRecords = data.currentRecords
    .filter((record) => record.scope_kind === "global")
    .sort((left, right) => (
      RECORD_METRICS[left.metric_key].label.localeCompare(RECORD_METRICS[right.metric_key].label)
      || left.first_achieved_at.localeCompare(right.first_achieved_at)
      || left.id.localeCompare(right.id)
    ));
  const perTaskRecords = data.currentRecords.filter((record) => record.scope_kind === "task");
  const rangedEvents = validEvents
    .filter((event) => isReportDateInRange(event.credited_date, range))
    .sort((left, right) => (
      left.credited_date.localeCompare(right.credited_date)
      || left.first_achieved_at.localeCompare(right.first_achieved_at)
      || left.id.localeCompare(right.id)
    ));
  const taskIdsWithRangedEvents = new Set(rangedEvents
    .filter((event) => event.scope_kind === "task" && event.scope_id)
    .map((event) => event.scope_id!));
  const perTaskHighlights = [...perTaskRecords].sort((left, right) => (
    Number(taskIdsWithRangedEvents.has(right.scope_id ?? "")) - Number(taskIdsWithRangedEvents.has(left.scope_id ?? ""))
    || right.first_achieved_at.localeCompare(left.first_achieved_at)
    || RECORD_METRICS[left.metric_key].label.localeCompare(RECORD_METRICS[right.metric_key].label)
    || formatRecordScope(left, taskPathById).localeCompare(formatRecordScope(right, taskPathById))
    || left.id.localeCompare(right.id)
  )).slice(0, 12);
  const countsByDefinition = new Map<string, number>();
  for (const record of perTaskRecords) {
    const label = RECORD_METRICS[record.metric_key].label;
    countsByDefinition.set(label, (countsByDefinition.get(label) ?? 0) + 1);
  }
  const distinctTaskCount = new Set(perTaskRecords.map((record) => record.scope_id).filter(Boolean)).size;
  const lines = ["## Records", "", "### Current global Records"];
  if (data.warning) lines.push(`- Warning: ${data.warning}`);
  if (globalRecords.length === 0) {
    lines.push("- No persisted current global Records.");
  } else {
    for (const record of globalRecords) {
      const previousValue = findPreviousValue(record, validEvents);
      lines.push(
        `- ${RECORD_METRICS[record.metric_key].label} — Current: ${formatReportRecordValue(record.value, record.unit)}`
        + ` — Achieved: ${formatReportDate(record.first_achieved_at)}`
        + `${previousValue === null ? "" : ` — Previous: ${formatReportRecordValue(previousValue, record.unit)}`}`
        + ` — Category: ${getRecordCategory(record.metric_key)} — Scope: ${formatRecordScope(record, taskPathById)}`,
      );
    }
  }

  lines.push(
    "",
    "### Current per-task Records summary",
    `- Total persisted per-task Record rows: ${perTaskRecords.length}`,
    `- Distinct Tasks represented: ${distinctTaskCount}`,
  );
  if (countsByDefinition.size === 0) {
    lines.push("- Counts by Record title: none");
  } else {
    lines.push("- Counts by Record title:");
    for (const [label, count] of [...countsByDefinition].sort(([left], [right]) => left.localeCompare(right))) {
      lines.push(`  - ${label}: ${count}`);
    }
  }

  lines.push("", "### Per-task highlights");
  if (perTaskHighlights.length === 0) {
    lines.push("- No persisted current per-task Records.");
  } else {
    for (const record of perTaskHighlights) {
      const previousValue = findPreviousValue(record, validEvents);
      lines.push(
        `- ${RECORD_METRICS[record.metric_key].label} — Current: ${formatReportRecordValue(record.value, record.unit)}`
        + ` — Achieved: ${formatReportDate(record.first_achieved_at)}`
        + `${previousValue === null ? "" : ` — Previous: ${formatReportRecordValue(previousValue, record.unit)}`}`
        + ` — Scope: ${formatRecordScope(record, taskPathById)}`,
      );
    }
    const omittedCount = perTaskRecords.length - perTaskHighlights.length;
    if (omittedCount > 0) lines.push(`- ${omittedCount} additional current per-task Record${omittedCount === 1 ? " was" : "s were"} omitted.`);
  }

  lines.push("", "### Record events within the selected range");
  if (rangedEvents.length === 0) {
    lines.push("- No persisted Record events in the selected range.");
  } else {
    for (const event of rangedEvents) {
      const previousValue = findPreviousValue(event, validEvents);
      const eventLabel = event.event_kind === "tie" ? "Tied" : previousValue === null ? "Set" : "Broken";
      lines.push(
        `- ${eventLabel}: ${RECORD_METRICS[event.metric_key].label} — ${formatReportDate(event.credited_date)}`
        + ` — Current: ${formatReportRecordValue(event.value, event.unit)}`
        + `${previousValue === null ? "" : ` — Previous: ${formatReportRecordValue(previousValue, event.unit)}`}`
        + ` — Category: ${getRecordCategory(event.metric_key)} — Scope: ${formatRecordScope(event, taskPathById)}`,
      );
    }
  }
  return lines;
}

export async function copyReportMarkdown(
  markdown: string,
  clipboard: Pick<Clipboard, "writeText">,
) {
  await clipboard.writeText(markdown);
}
