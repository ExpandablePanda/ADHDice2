import type { FocusSession, Task, TaskHistory } from "@/lib/database.types";
import { getRecordMonth, getRecordWeek, isConsecutiveRecordDate } from "@/lib/records/calendar";
import {
  buildPeriodCandidateIdentity,
  buildRecordEventIdentity,
  buildRunCandidateIdentity,
  getTaskOccurrenceIdentity,
  stableRecordFingerprint,
} from "@/lib/records/identity";
import {
  RECORDS_RULES_VERSION,
  type DurableCurrentRecord,
  type DurableRecordEvent,
  type EvaluatedRecordCandidate,
  type ProvisionalRecordCandidate,
  type RecordMetricKey,
  type RecordUnit,
  type RecordsEvaluation,
  type RecordsEvaluationInput,
} from "@/lib/records/types";

type TaskOccurrence = {
  canonicalIdentity: string;
  creditedDate: string;
  entityKind: "parent" | "step";
  firstQualifiedAt: string;
  history: TaskHistory;
  identity: string;
  isOrdinarySuccess: boolean;
  isPermanentComplete: boolean;
  isRecurring: boolean;
  orderedDate: string;
  task: Task;
};

type CandidateSeed = Omit<EvaluatedRecordCandidate, "evidenceFingerprint">;

function finishCandidate(seed: CandidateSeed): EvaluatedRecordCandidate {
  return { ...seed, evidenceFingerprint: stableRecordFingerprint(seed.evidence) };
}

function sourceTimestamp(row: Pick<TaskHistory, "created_at" | "updated_at">) {
  return row.updated_at || row.created_at;
}

function compareHistoryAuthority(left: TaskHistory, right: TaskHistory) {
  return sourceTimestamp(left).localeCompare(sourceTimestamp(right)) || left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id);
}

function isOrdinarySuccess(row: TaskHistory) {
  return row.status === "done" || row.status === "did_my_best" || (row.status === "complete" && row.counted_as_due_occurrence);
}

function isPermanentComplete(row: TaskHistory) {
  return row.status === "complete" && row.event_type === "completed_permanently";
}

function isFinalized(row: TaskHistory) {
  return isOrdinarySuccess(row) || row.status === "missed" || isPermanentComplete(row);
}

export function collapseTaskHistory(input: Pick<RecordsEvaluationInput, "taskHistory" | "tasks">): TaskOccurrence[] {
  const taskById = new Map(input.tasks.map((task) => [task.id, task]));
  const authoritative = new Map<string, { history: TaskHistory; task: Task; canonicalIdentity: string }>();
  for (const history of input.taskHistory) {
    const task = taskById.get(history.task_id);
    if (!task) continue;
    const canonicalIdentity = getTaskOccurrenceIdentity(history, task);
    const dedupeKey = `${task.id}:${canonicalIdentity}`;
    const current = authoritative.get(dedupeKey);
    if (!current || compareHistoryAuthority(current.history, history) < 0) authoritative.set(dedupeKey, { canonicalIdentity, history, task });
  }
  return [...authoritative.values()].map(({ canonicalIdentity, history, task }) => ({
    canonicalIdentity,
    creditedDate: history.entry_date,
    entityKind: task.parent_task_id ? "step" : "parent",
    firstQualifiedAt: sourceTimestamp(history),
    history,
    identity: `task:${task.id}:${canonicalIdentity}`,
    isOrdinarySuccess: isOrdinarySuccess(history),
    isPermanentComplete: isPermanentComplete(history),
    isRecurring: task.repeat_frequency !== "none",
    orderedDate: history.occurrence_due_on ?? history.entry_date,
    task,
  })).sort((left, right) => left.orderedDate.localeCompare(right.orderedDate) || left.firstQualifiedAt.localeCompare(right.firstQualifiedAt) || left.identity.localeCompare(right.identity));
}

function evidenceForOccurrences(items: readonly TaskOccurrence[]) {
  return {
    identities: items.map((item) => item.identity).sort(),
    sourceRows: items.map((item) => ({
      canonical_occurrence_identity: item.canonicalIdentity,
      counted_as_due_occurrence: item.history.counted_as_due_occurrence,
      entry_date: item.history.entry_date,
      event_type: item.history.event_type,
      occurrence_due_on: item.history.occurrence_due_on,
      source_row_id: item.history.id,
      status: item.history.status,
      task_id: item.task.id,
      title: item.task.title,
      entity_kind: item.entityKind,
    })),
  };
}

function evidenceForFocus(items: readonly FocusSession[]) {
  return {
    identities: items.map((item) => `focus:${item.id}`).sort(),
    sourceRows: items.map((item) => ({
      category_id: item.category_id,
      duration_seconds: item.duration_seconds,
      runtime_session_id: item.runtime_session_id,
      session_date: item.session_date,
      source: item.source,
      source_row_id: item.id,
      title: item.title_snapshot,
    })),
  };
}

function makeAggregateCandidates<T>(input: {
  creditedDate: (item: T) => string;
  evidence: (items: readonly T[]) => { identities: string[]; sourceRows: Array<Record<string, unknown>> };
  firstQualifiedAt: (item: T) => string;
  items: readonly T[];
  metricKey: RecordMetricKey;
  openLogicalDate: string;
  period: "day" | "week" | "month";
  unit: RecordUnit;
  value: (items: readonly T[]) => number;
}): { closed: EvaluatedRecordCandidate[]; open: EvaluatedRecordCandidate[] } {
  const grouped = new Map<string, { end: string; items: T[]; start: string }>();
  for (const item of input.items) {
    const date = input.creditedDate(item);
    const grouping = input.period === "day" ? { end: date, key: date, start: date } : input.period === "week" ? getRecordWeek(date) : getRecordMonth(date);
    const current = grouped.get(grouping.key) ?? { end: grouping.end, items: [], start: grouping.start };
    current.items.push(item);
    grouped.set(grouping.key, current);
  }
  const currentPeriod = input.period === "day" ? { key: input.openLogicalDate } : input.period === "week" ? getRecordWeek(input.openLogicalDate) : getRecordMonth(input.openLogicalDate);
  const closed: EvaluatedRecordCandidate[] = [];
  const open: EvaluatedRecordCandidate[] = [];
  for (const [periodKey, group] of grouped) {
    const evidence = input.evidence(group.items);
    const candidate = finishCandidate({
      candidateIdentity: buildPeriodCandidateIdentity(input.metricKey, "global", null, periodKey, evidence.identities),
      creditedDate: group.end,
      evidence,
      firstQualifiedAt: group.items.map(input.firstQualifiedAt).sort().at(-1)!,
      metricKey: input.metricKey,
      periodEnd: group.end,
      periodKey,
      periodStart: group.start,
      scopeId: null,
      scopeKind: "global",
      titleSnapshot: null,
      unit: input.unit,
      value: input.value(group.items),
    });
    if (periodKey === currentPeriod.key) open.push(candidate);
    else if (group.end < input.openLogicalDate) closed.push(candidate);
  }
  return { closed, open };
}

function makeDayStreakCandidates(input: {
  dates: Map<string, { identities: string[]; sourceRows: Array<Record<string, unknown>>; timestamp: string }>;
  metricKey: RecordMetricKey;
}): EvaluatedRecordCandidate[] {
  const candidates: EvaluatedRecordCandidate[] = [];
  let run: string[] = [];
  for (const date of [...input.dates.keys()].sort()) {
    if (run.length && !isConsecutiveRecordDate(run.at(-1)!, date)) run = [];
    run.push(date);
    const parts = run.map((item) => input.dates.get(item)!);
    const identities = parts.flatMap((item) => item.identities).sort();
    const evidence = { identities, sourceRows: parts.flatMap((item) => item.sourceRows) };
    candidates.push(finishCandidate({
      candidateIdentity: buildRunCandidateIdentity("streak", run[0], date, identities),
      creditedDate: date,
      evidence,
      firstQualifiedAt: parts.map((item) => item.timestamp).sort().at(-1)!,
      metricKey: input.metricKey,
      periodEnd: date,
      periodKey: `${run[0]}:${date}`,
      periodStart: run[0],
      scopeId: null,
      scopeKind: "global",
      titleSnapshot: null,
      unit: "days",
      value: run.length,
    }));
  }
  return candidates;
}

function taskDayMap(items: readonly TaskOccurrence[]) {
  const result = new Map<string, { identities: string[]; sourceRows: Array<Record<string, unknown>>; timestamp: string }>();
  for (const item of items) {
    const evidence = evidenceForOccurrences([item]);
    const current = result.get(item.creditedDate) ?? { identities: [], sourceRows: [], timestamp: item.firstQualifiedAt };
    current.identities.push(...evidence.identities);
    current.sourceRows.push(...evidence.sourceRows);
    if (current.timestamp < item.firstQualifiedAt) current.timestamp = item.firstQualifiedAt;
    result.set(item.creditedDate, current);
  }
  return result;
}

function focusDayMap(items: readonly FocusSession[]) {
  const result = new Map<string, { identities: string[]; sourceRows: Array<Record<string, unknown>>; timestamp: string }>();
  for (const item of items) {
    const evidence = evidenceForFocus([item]);
    const timestamp = item.ended_at ?? item.started_at ?? item.created_at;
    const current = result.get(item.session_date) ?? { identities: [], sourceRows: [], timestamp };
    current.identities.push(...evidence.identities);
    current.sourceRows.push(...evidence.sourceRows);
    if (current.timestamp < timestamp) current.timestamp = timestamp;
    result.set(item.session_date, current);
  }
  return result;
}

function perTaskCandidates(occurrences: readonly TaskOccurrence[]) {
  const candidates: EvaluatedRecordCandidate[] = [];
  const byTask = new Map<string, TaskOccurrence[]>();
  for (const occurrence of occurrences) {
    const list = byTask.get(occurrence.task.id) ?? [];
    list.push(occurrence);
    byTask.set(occurrence.task.id, list);
  }
  for (const [taskId, items] of byTask) {
    const task = items[0].task;
    const scope = { scopeId: taskId, scopeKind: "task" as const, titleSnapshot: task.title };
    if (!items[0].isRecurring) {
      const success = items.find((item) => item.isOrdinarySuccess);
      if (success) candidates.push(occurrenceRunCandidate("task_occurrence_streak", scope, [success]));
      continue;
    }
    let successfulRun: TaskOccurrence[] = [];
    let missedRun: TaskOccurrence[] = [];
    for (const item of items) {
      if (item.isOrdinarySuccess) {
        successfulRun.push(item);
        candidates.push(occurrenceRunCandidate("task_occurrence_streak", scope, successfulRun));
        if (missedRun.length && !item.isPermanentComplete) {
          const comebackItems = [...missedRun, item];
          const evidence = evidenceForOccurrences(comebackItems);
          candidates.push(finishCandidate({
            candidateIdentity: buildRunCandidateIdentity("comeback", missedRun[0].orderedDate, item.orderedDate, evidence.identities),
            creditedDate: item.creditedDate,
            evidence,
            firstQualifiedAt: item.firstQualifiedAt,
            metricKey: "task_biggest_comeback",
            periodEnd: item.orderedDate,
            periodKey: `${missedRun[0].orderedDate}:${item.orderedDate}`,
            periodStart: missedRun[0].orderedDate,
            ...scope,
            unit: "occurrences",
            value: missedRun.length,
          }));
        }
        missedRun = [];
      } else if (item.history.status === "missed" && isFinalized(item.history)) {
        successfulRun = [];
        missedRun.push(item);
      } else {
        successfulRun = [];
        missedRun = [];
      }
    }
  }
  return candidates;
}

function occurrenceRunCandidate(metricKey: "task_occurrence_streak", scope: { scopeId: string; scopeKind: "task"; titleSnapshot: string }, run: TaskOccurrence[]) {
  const evidence = evidenceForOccurrences(run);
  return finishCandidate({
    candidateIdentity: buildRunCandidateIdentity("streak", run[0].orderedDate, run.at(-1)!.orderedDate, evidence.identities),
    creditedDate: run.at(-1)!.creditedDate,
    evidence,
    firstQualifiedAt: run.at(-1)!.firstQualifiedAt,
    metricKey,
    periodEnd: run.at(-1)!.orderedDate,
    periodKey: `${run[0].orderedDate}:${run.at(-1)!.orderedDate}`,
    periodStart: run[0].orderedDate,
    ...scope,
    unit: "occurrences",
    value: run.length,
  });
}

function processCandidates(candidates: readonly EvaluatedRecordCandidate[], evaluatedAt: string) {
  const currentByScope = new Map<string, DurableCurrentRecord>();
  const events: DurableRecordEvent[] = [];
  const seenCandidates = new Set<string>();
  const sorted = [...candidates].sort((left, right) => left.creditedDate.localeCompare(right.creditedDate) || left.firstQualifiedAt.localeCompare(right.firstQualifiedAt) || left.candidateIdentity.localeCompare(right.candidateIdentity));
  for (const candidate of sorted) {
    const scopeKey = `${candidate.metricKey}:${candidate.scopeKind}:${candidate.scopeId ?? "global"}`;
    const replayKey = `${scopeKey}:${candidate.candidateIdentity}:${candidate.value}`;
    if (seenCandidates.has(replayKey)) continue;
    seenCandidates.add(replayKey);
    const current = currentByScope.get(scopeKey);
    if (current && candidate.value < current.value) continue;
    const eventKind = current && candidate.value === current.value ? "tie" : "break";
    const firstAchievedAt = eventKind === "tie" ? current!.firstAchievedAt : candidate.firstQualifiedAt;
    events.push({
      ...candidate,
      eventIdentity: buildRecordEventIdentity(candidate),
      eventKind,
      firstAchievedAt,
      rulesVersion: RECORDS_RULES_VERSION,
      validityState: "valid",
    });
    if (eventKind === "break") {
      currentByScope.set(scopeKey, { ...candidate, firstAchievedAt, recalculatedAt: evaluatedAt, rulesVersion: RECORDS_RULES_VERSION });
    }
  }
  return { currentRecords: [...currentByScope.values()], events };
}

export function evaluateRecords(input: RecordsEvaluationInput): RecordsEvaluation {
  const evaluatedAt = input.evaluatedAt ?? new Date().toISOString();
  const occurrences = collapseTaskHistory(input);
  const ordinary = occurrences.filter((item) => item.isOrdinarySuccess);
  const parent = ordinary.filter((item) => item.entityKind === "parent");
  const steps = ordinary.filter((item) => item.entityKind === "step");
  const permanent = occurrences.filter((item) => item.isPermanentComplete);
  const focus = input.focusSessions.filter((item) => item.duration_seconds > 0);
  const closed: EvaluatedRecordCandidate[] = [];
  const open: EvaluatedRecordCandidate[] = [];
  const aggregate = <T,>(items: readonly T[], metricKey: RecordMetricKey, period: "day" | "week" | "month", unit: RecordUnit, dates: (item: T) => string, evidence: (values: readonly T[]) => { identities: string[]; sourceRows: Array<Record<string, unknown>> }, timestamp: (item: T) => string, value: (values: readonly T[]) => number = (values) => values.length) => {
    const result = makeAggregateCandidates({ creditedDate: dates, evidence, firstQualifiedAt: timestamp, items, metricKey, openLogicalDate: input.openLogicalDate, period, unit, value });
    closed.push(...result.closed);
    open.push(...result.open);
  };
  aggregate(parent, "parent_tasks_day", "day", "tasks", (item) => item.creditedDate, evidenceForOccurrences, (item) => item.firstQualifiedAt);
  aggregate(parent, "parent_tasks_week", "week", "tasks", (item) => item.creditedDate, evidenceForOccurrences, (item) => item.firstQualifiedAt);
  aggregate(parent, "parent_tasks_month", "month", "tasks", (item) => item.creditedDate, evidenceForOccurrences, (item) => item.firstQualifiedAt);
  aggregate(permanent, "permanent_completes_day", "day", "tasks", (item) => item.creditedDate, evidenceForOccurrences, (item) => item.firstQualifiedAt);
  aggregate(steps, "steps_day", "day", "steps", (item) => item.creditedDate, evidenceForOccurrences, (item) => item.firstQualifiedAt);
  aggregate(steps, "steps_week", "week", "steps", (item) => item.creditedDate, evidenceForOccurrences, (item) => item.firstQualifiedAt);
  aggregate(steps, "steps_month", "month", "steps", (item) => item.creditedDate, evidenceForOccurrences, (item) => item.firstQualifiedAt);
  aggregate(focus, "focus_duration_day", "day", "seconds", (item) => item.session_date, evidenceForFocus, (item) => item.ended_at ?? item.started_at ?? item.created_at, (items) => items.reduce((sum, item) => sum + item.duration_seconds, 0));
  aggregate(focus, "focus_duration_week", "week", "seconds", (item) => item.session_date, evidenceForFocus, (item) => item.ended_at ?? item.started_at ?? item.created_at, (items) => items.reduce((sum, item) => sum + item.duration_seconds, 0));
  aggregate(focus, "focus_duration_month", "month", "seconds", (item) => item.session_date, evidenceForFocus, (item) => item.ended_at ?? item.started_at ?? item.created_at, (items) => items.reduce((sum, item) => sum + item.duration_seconds, 0));
  aggregate(focus, "focus_sessions_day", "day", "sessions", (item) => item.session_date, evidenceForFocus, (item) => item.ended_at ?? item.started_at ?? item.created_at);

  closed.push(...makeDayStreakCandidates({ dates: taskDayMap(parent), metricKey: "parent_completion_day_streak" }));
  closed.push(...makeDayStreakCandidates({ dates: taskDayMap(steps), metricKey: "step_completion_day_streak" }));
  closed.push(...makeDayStreakCandidates({ dates: taskDayMap(ordinary), metricKey: "combined_completion_day_streak" }));
  closed.push(...makeDayStreakCandidates({ dates: focusDayMap(focus), metricKey: "focus_active_day_streak" }));
  for (const session of focus) {
    const evidence = evidenceForFocus([session]);
    closed.push(finishCandidate({
      candidateIdentity: session.id,
      creditedDate: session.session_date,
      evidence,
      firstQualifiedAt: session.ended_at ?? session.started_at ?? session.created_at,
      metricKey: "longest_focus_session",
      periodEnd: null,
      periodKey: null,
      periodStart: null,
      scopeId: null,
      scopeKind: "global",
      titleSnapshot: session.title_snapshot,
      unit: "seconds",
      value: session.duration_seconds,
    }));
  }
  closed.push(...perTaskCandidates(occurrences));
  const durable = processCandidates(closed, evaluatedAt);
  const durableByScope = new Map(durable.currentRecords.map((record) => [`${record.metricKey}:${record.scopeKind}:${record.scopeId ?? "global"}`, record]));
  const provisionalCandidates: ProvisionalRecordCandidate[] = open.filter((candidate) => {
    const current = durableByScope.get(`${candidate.metricKey}:${candidate.scopeKind}:${candidate.scopeId ?? "global"}`);
    return !current || candidate.value >= current.value;
  }).map((candidate) => ({ ...candidate, status: "provisional" }));
  const warnings = [
    "Records use the currently available Task History and Focus data; past hard deletions cannot be reconstructed.",
    "Historical recurrence and parent/Step changes were not previously snapshotted; older rows may use fallback occurrence identity.",
  ];
  if (input.taskHistory.some((row) => !row.occurrence_key)) warnings.push("Some Task History rows use fallback occurrence identity.");
  return { ...durable, evaluatedAt, provisionalCandidates, warnings };
}
