import type { Task, TaskHistory } from "@/lib/database.types";
import { logicalDateForTimestamp, shiftDateKey } from "./calendar.ts";
import { evaluateTaskState, isSuccessfulTaskHistoryOutcome } from "./engine.ts";
import { adaptLegacyTaskState } from "./legacy-adapter.ts";
import { nextFixedOccurrence, occurrenceIdentity, recurrenceAfterSuccess, scheduledOccurrences } from "./recurrence.ts";
import type { TaskHistoryOutcome, TaskRecurrence } from "./types.ts";

export const RECURRING_DATE_REPAIR_TASK_IDS = [
  "96d688b4-54f5-4884-9971-38b43cba4aa5",
  "40dfaed0-4c1c-4ab0-a930-3bc0accbed94",
  "b421f72a-2745-46df-81a1-d8c8416e1951",
  "87a9e225-b385-44c7-b336-c3b9c6c5ea1b",
  "8ee7441c-2e4d-439a-be7f-d1e19fdb2a41",
  "81b64697-4291-4d3d-913a-c9d0e2f8d804",
  "27035f67-c008-4e54-9761-c7f01cf0604d",
  "0c3ccc7b-fcce-4a6a-aa77-9c5cfd471fc7",
  "723be9b2-64c0-43a9-b49a-5b7f648f57ea",
  "a1eb2348-99ed-42bd-867b-ceb246128066",
  "b4940db0-5217-4f53-99d0-60e46933e58e",
  "09180da0-58bb-46e4-8ec2-53c1cc4d2f21",
  "7fb30d0c-1d12-4c3e-9c82-f39a82ff6055",
  "f4e11d51-6bba-4eff-a05f-7c2e81f19a92",
  "c72a281c-5932-4b7b-8e49-4ee4397acf6e",
  "058390ab-cc42-49ec-a458-8da05773732b",
  "8b50fb4b-a634-4c15-afb3-70307ebc528a",
  "d5d2d1ba-94f1-47d3-a7af-11fd3f208db1",
  "df4ef91d-fcee-4411-970c-0c1cf9520ff5",
  "dba6e6d4-981f-4941-a5c9-e78e8def250f",
  "a3e34bd7-35dd-44b0-82e0-7677c957c5f0",
  "713cfd40-287c-4531-bba5-46d9f6f2a496",
  "a415dc65-b841-448b-b8a8-4b299987cb8a",
  "01eda993-ddfc-4fb1-b817-1fb986d1b7b2",
  "52e90aba-364a-4b9f-8c03-e512a099fe44",
  "46c06353-7930-4ed3-9449-4ae2084ffa57",
  "c48c40ee-296a-4bd5-aec4-eec75ccf48ba",
  "9f69b644-4943-4329-9162-53fefe1bc7dc",
] as const;

export type RecurringDateRepairConfidence = "High" | "Medium" | "Low";

export type RecurringDateRepairHistoryEntry = {
  id: string;
  entryDate: string;
  status: string;
  successful: boolean;
  countedAsDueOccurrence: boolean;
  occurrenceKey: string | null;
  occurrenceDueOn: string | null;
  updatedAt: string;
};

export type RecurringDateRepairTaskReport = {
  taskId: string;
  taskTitle: string | null;
  recurrenceType: string | null;
  recurrenceConfiguration: Record<string, unknown> | null;
  currentPersistedDueOn: string | null;
  latestSuccessfulHistoryDate: string | null;
  recentRelevantHistorySequence: RecurringDateRepairHistoryEntry[];
  inferredLastLegitimateConsumedOccurrence: string | null;
  latestValidatedExplicitOccurrence: string | null;
  latestOccurrenceRelevantHistoryOutcome: RecurringDateRepairHistoryEntry | null;
  replaySeedOccurrence: string | null;
  firstReplayedHistoryRow: RecurringDateRepairHistoryEntry | null;
  lastReplayedHistoryRow: RecurringDateRepairHistoryEntry | null;
  proposedNextDueDate: string | null;
  proposalBasis: string | null;
  rejectedEvidence: { historyId: string; reason: string }[];
  confidence: RecurringDateRepairConfidence;
  reasoning: string;
  ambiguityOrMissingEvidence: string[];
};

export type RecurringDateRepairReport = {
  schemaVersion: 1;
  logicalDate: string;
  affectedTaskIds: string[];
  summary: {
    totalAffectedIds: number;
    foundTasks: number;
    missingTasks: number;
    highConfidenceProposals: number;
    mediumConfidenceProposals: number;
    lowConfidenceProposals: number;
    noSafeProposal: number;
  };
  tasks: RecurringDateRepairTaskReport[];
};

type BuildRecurringDateRepairReportInput = {
  tasks: readonly Task[];
  history: readonly TaskHistory[];
  now: string | Date;
  timezone: string;
  rolloverTime: string;
  affectedTaskIds?: readonly string[];
};

const ENGINE_HISTORY_OUTCOMES = new Set<TaskHistoryOutcome>(["done", "did_my_best", "missed", "delayed", "complete"]);
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function isSuccessfulStatus(status: string) {
  return ENGINE_HISTORY_OUTCOMES.has(status as TaskHistoryOutcome)
    && isSuccessfulTaskHistoryOutcome(status as TaskHistoryOutcome);
}

function recurrenceConfiguration(task: Task, recurrence: TaskRecurrence): Record<string, unknown> {
  if (recurrence.kind === "rolling") {
    return {
      intervalDays: recurrence.intervalDays,
      untilComplete: recurrence.untilComplete === true,
    };
  }
  if (recurrence.kind === "weekly") {
    return {
      intervalWeeks: recurrence.intervalWeeks ?? 1,
      weekdays: [...recurrence.weekdays],
      untilComplete: recurrence.untilComplete === true,
    };
  }
  if (recurrence.kind === "monthly") {
    return {
      intervalMonths: recurrence.intervalMonths ?? 1,
      mode: recurrence.mode,
      dayOfMonth: recurrence.dayOfMonth ?? null,
      ordinal: recurrence.ordinal ?? null,
      weekday: recurrence.weekday ?? null,
      untilComplete: recurrence.untilComplete === true,
    };
  }
  return { repeatFrequency: task.repeat_frequency };
}

function historyOrder(left: TaskHistory, right: TaskHistory) {
  return left.entry_date.localeCompare(right.entry_date)
    || left.updated_at.localeCompare(right.updated_at)
    || left.id.localeCompare(right.id);
}

function historySummary(row: TaskHistory): RecurringDateRepairHistoryEntry {
  return {
    id: row.id,
    entryDate: row.entry_date,
    status: row.status,
    successful: isSuccessfulStatus(row.status),
    countedAsDueOccurrence: row.counted_as_due_occurrence,
    occurrenceKey: row.occurrence_key,
    occurrenceDueOn: row.occurrence_due_on,
    updatedAt: row.updated_at,
  };
}

type OccurrenceKeyEvidence = {
  date: string;
  kind: "occurrence" | "derived_missed";
};

function occurrenceEvidenceFromKey(taskId: string, key: string | null): OccurrenceKeyEvidence | null {
  if (!key) return null;
  const compact = key.match(/^occurrence:(\d{4}-\d{2}-\d{2})$/);
  if (compact) return { date: compact[1], kind: "occurrence" };
  const engine = key.match(/^task:([^:]+):occurrence:(\d{4}-\d{2}-\d{2})$/);
  if (engine?.[1] === taskId) return { date: engine[2], kind: "occurrence" };
  const derivedMissed = key.match(/^derived-missed:(\d{4}-\d{2}-\d{2})$/);
  return derivedMissed ? { date: derivedMissed[1], kind: "derived_missed" } : null;
}

function fixedWithAnchor(
  recurrence: Extract<TaskRecurrence, { kind: "weekly" | "monthly" }>,
  anchorDate: string,
) {
  return { ...recurrence, anchorDate };
}

function isFixedOccurrence(
  recurrence: Extract<TaskRecurrence, { kind: "weekly" | "monthly" }>,
  anchorDate: string,
  date: string,
) {
  return scheduledOccurrences(fixedWithAnchor(recurrence, anchorDate), anchorDate, date, date).includes(date);
}

function missingTaskReport(taskId: string): RecurringDateRepairTaskReport {
  return {
    taskId,
    taskTitle: null,
    recurrenceType: null,
    recurrenceConfiguration: null,
    currentPersistedDueOn: null,
    latestSuccessfulHistoryDate: null,
    recentRelevantHistorySequence: [],
    inferredLastLegitimateConsumedOccurrence: null,
    latestValidatedExplicitOccurrence: null,
    latestOccurrenceRelevantHistoryOutcome: null,
    replaySeedOccurrence: null,
    firstReplayedHistoryRow: null,
    lastReplayedHistoryRow: null,
    proposedNextDueDate: null,
    proposalBasis: null,
    rejectedEvidence: [],
    confidence: "Low",
    reasoning: "The affected task is not present in the currently loaded task snapshot.",
    ambiguityOrMissingEvidence: ["Missing loaded task; no inference was attempted."],
  };
}

function reportForTask(
  task: Task,
  taskHistory: readonly TaskHistory[],
  logicalDate: string,
  now: string | Date,
  timezone: string,
  rolloverTime: string,
): RecurringDateRepairTaskReport {
  const sortedHistory = [...taskHistory].sort(historyOrder);
  const recent = sortedHistory.slice(-12).reverse().map(historySummary);
  const successful = sortedHistory.filter((row) => isSuccessfulStatus(row.status));
  const latestSuccessfulHistoryDate = successful.at(-1)?.entry_date ?? null;
  const adapted = adaptLegacyTaskState(task, sortedHistory, {
    now,
    timezone,
    logicalDayRollover: rolloverTime,
  });
  const recurrence = adapted.engineInput.task.recurrence;
  const base = {
    taskId: task.id,
    taskTitle: task.title,
    recurrenceType: task.repeat_frequency,
    recurrenceConfiguration: recurrenceConfiguration(task, recurrence),
    currentPersistedDueOn: task.due_on,
    latestSuccessfulHistoryDate,
    recentRelevantHistorySequence: recent,
    latestValidatedExplicitOccurrence: null,
    latestOccurrenceRelevantHistoryOutcome: recent.find((row) => ENGINE_HISTORY_OUTCOMES.has(row.status as TaskHistoryOutcome)) ?? null,
    replaySeedOccurrence: null,
    firstReplayedHistoryRow: null,
    lastReplayedHistoryRow: null,
    proposalBasis: null,
    rejectedEvidence: [] as { historyId: string; reason: string }[],
  };
  const ambiguity = [
    ...adapted.warnings.map((item) => `${item.path}: ${item.message}`),
    ...adapted.unsupported
      .filter((item) => item.code !== "recurrence_cursor_unavailable" && item.code !== "satisfied_occurrence_identity_unavailable")
      .map((item) => `${item.path}: ${item.message}`),
  ];

  if (recurrence.kind === "none") {
    return {
      ...base,
      inferredLastLegitimateConsumedOccurrence: null,
      proposedNextDueDate: null,
      confidence: "Low",
      reasoning: "The loaded task is not a supported recurring task, so no date is proposed.",
      ambiguityOrMissingEvidence: [...ambiguity, "No supported recurrence configuration."],
    };
  }

  if (recurrence.kind === "rolling") {
    const latestSuccess = successful.at(-1);
    if (latestSuccess) {
      const nextDue = recurrenceAfterSuccess(recurrence, task.due_on, latestSuccess.entry_date, new Set()).nextDue;
      return {
        ...base,
        inferredLastLegitimateConsumedOccurrence: latestSuccess.entry_date,
        proposedNextDueDate: nextDue,
        confidence: "Medium",
        reasoning: `The latest successful History date rebases the rolling ${recurrence.intervalDays}-day interval through the Task State Engine recurrence helper.`,
        ambiguityOrMissingEvidence: ambiguity.length > 0 ? ambiguity : ["Rolling recurrence has no fixed occurrence identity independent of its successful action date."],
      };
    }
    if (task.due_on && task.due_on > logicalDate) {
      return {
        ...base,
        inferredLastLegitimateConsumedOccurrence: null,
        proposedNextDueDate: task.due_on,
        confidence: "Low",
        reasoning: "No successful History is loaded; the report can only preserve the existing future rolling due date.",
        ambiguityOrMissingEvidence: [...ambiguity, "Missing successful History needed to rebase the rolling interval."],
      };
    }
    return {
      ...base,
      inferredLastLegitimateConsumedOccurrence: null,
      proposedNextDueDate: null,
      confidence: "Low",
      reasoning: "No successful History anchors the rolling interval, so no date can safely be proposed.",
      ambiguityOrMissingEvidence: [...ambiguity, "Missing successful History needed to rebase the rolling interval."],
    };
  }

  const relevantRows = sortedHistory.filter((row) => ENGINE_HISTORY_OUTCOMES.has(row.status as TaskHistoryOutcome));
  const explicitDates: { date: string; kind: OccurrenceKeyEvidence["kind"]; row: TaskHistory }[] = [];
  const rejectedEvidence: { historyId: string; reason: string }[] = [];
  for (const row of relevantRows) {
    const keyEvidence = occurrenceEvidenceFromKey(task.id, row.occurrence_key);
    if (row.occurrence_key && !keyEvidence) {
      rejectedEvidence.push({ historyId: row.id, reason: "Malformed or task-mismatched occurrence key." });
    }
    if (row.occurrence_due_on && !DATE_KEY.test(row.occurrence_due_on)) {
      rejectedEvidence.push({ historyId: row.id, reason: "Malformed occurrence due date." });
    }
    if (keyEvidence && row.occurrence_due_on && keyEvidence.date !== row.occurrence_due_on) {
      rejectedEvidence.push({ historyId: row.id, reason: "Occurrence key and occurrence due date disagree." });
    }
    if (keyEvidence?.kind === "derived_missed" && isSuccessfulStatus(row.status)) {
      rejectedEvidence.push({ historyId: row.id, reason: "Derived Missed identity cannot identify a successful consumed occurrence." });
    }
    const date = DATE_KEY.test(row.occurrence_due_on ?? "") ? row.occurrence_due_on : keyEvidence?.date ?? null;
    if (date && !(keyEvidence && row.occurrence_due_on && keyEvidence.date !== row.occurrence_due_on)) {
      explicitDates.push({ date, kind: keyEvidence?.kind ?? "occurrence", row });
    }
  }
  const explicitByHistoryDate = new Map<string, Set<string>>();
  for (const item of explicitDates) {
    const dates = explicitByHistoryDate.get(item.row.entry_date) ?? new Set<string>();
    dates.add(item.date);
    explicitByHistoryDate.set(item.row.entry_date, dates);
  }
  for (const [entryDate, dates] of explicitByHistoryDate) {
    if (dates.size <= 1) continue;
    for (const item of explicitDates.filter((candidate) => candidate.row.entry_date === entryDate)) {
      rejectedEvidence.push({ historyId: item.row.id, reason: "Duplicate action date claims incompatible occurrence identities." });
    }
  }

  const explicitAnchor = explicitDates.map((item) => item.date).sort()[0] ?? null;
  if (explicitAnchor) {
    for (const item of explicitDates) {
      if (!isFixedOccurrence(recurrence, explicitAnchor, item.date)) {
        rejectedEvidence.push({ historyId: item.row.id, reason: "Occurrence is invalid for the configured recurrence rule." });
      }
    }
  }
  if (rejectedEvidence.length > 0) {
    return {
      ...base,
      inferredLastLegitimateConsumedOccurrence: null,
      latestValidatedExplicitOccurrence: null,
      proposedNextDueDate: null,
      confidence: "Low",
      reasoning: "History contains contradictory, malformed, or off-schedule occurrence identity, so no repair date is proposed.",
      rejectedEvidence: rejectedEvidence.slice(0, 12),
      ambiguityOrMissingEvidence: [...ambiguity, "Rejected explicit History occurrence evidence."],
    };
  }

  const consumed = new Set(explicitDates
    .filter((item) => item.kind === "occurrence" && isSuccessfulStatus(item.row.status) && item.row.status !== "complete")
    .map((item) => item.date));
  let anchor = explicitAnchor;
  let hasAmbiguousUnkeyedSuccess = false;
  for (const row of successful.filter((item) => !item.occurrence_due_on && !item.occurrence_key)) {
    const candidateAnchor = anchor ?? row.entry_date;
    if (isFixedOccurrence(recurrence, candidateAnchor, row.entry_date)) {
      anchor ??= row.entry_date;
      consumed.add(row.entry_date);
    } else if (!anchor || row.entry_date > [...consumed].sort().at(-1)!) {
      hasAmbiguousUnkeyedSuccess = true;
    }
  }
  if (hasAmbiguousUnkeyedSuccess) {
    return {
      ...base,
      inferredLastLegitimateConsumedOccurrence: [...consumed].sort().at(-1) ?? null,
      latestValidatedExplicitOccurrence: explicitDates.map((item) => item.date).sort().at(-1) ?? null,
      proposedNextDueDate: null,
      confidence: "Low",
      reasoning: "A successful unkeyed History row does not land on the fixed schedule and may represent early completion, so advancing from it would be a guess.",
      ambiguityOrMissingEvidence: [...ambiguity, "Unkeyed successful History cannot be mapped to one fixed occurrence."],
    };
  }

  const lastConsumed = [...consumed].sort().at(-1) ?? null;
  if (anchor && (lastConsumed || explicitDates.length > 0)) {
    const normalizedIdentityByHistoryId = new Map(explicitDates.map((item) => [item.row.id, item.date]));
    const replaySeed = lastConsumed
      ? nextFixedOccurrence(fixedWithAnchor(recurrence, anchor), anchor, shiftDateKey(lastConsumed, 1), consumed)
      : anchor;
    const replayRows = lastConsumed
      ? relevantRows.filter((row) => {
        if (row.status === "complete") return true;
        const occurrenceDate = normalizedIdentityByHistoryId.get(row.id);
        return occurrenceDate ? occurrenceDate > lastConsumed : false;
      })
      : relevantRows;
    const replayRowIds = new Set(replayRows.map((row) => row.id));
    const replaySummaries = replayRows.map(historySummary);
    if (!replaySeed && !replayRows.some((row) => row.status === "complete")) {
      return {
        ...base,
        inferredLastLegitimateConsumedOccurrence: lastConsumed,
        latestValidatedExplicitOccurrence: explicitDates.map((item) => item.date).sort().at(-1) ?? null,
        proposedNextDueDate: null,
        confidence: "Low",
        reasoning: "The Task State Engine replay boundary has no safe next fixed occurrence.",
        ambiguityOrMissingEvidence: [...ambiguity, "No safe replay seed occurrence was available."],
      };
    }
    const replay = evaluateTaskState({
      ...adapted.engineInput,
      task: {
        ...adapted.engineInput.task,
        activeOccurrenceDueOn: null,
        activeStatus: "pending",
        dueOn: replaySeed,
        recurrence: fixedWithAnchor(recurrence, anchor),
      },
      history: adapted.engineInput.history.filter((row) => replayRowIds.has(row.id)).map((row) => {
        const date = normalizedIdentityByHistoryId.get(row.id);
        return date
          ? { ...row, occurrenceIdentity: occurrenceIdentity(task.id, date) }
          : { ...row, occurrenceIdentity: null };
      }),
    });
    const nextDue = replay.nextDueDate;
    if (replay.validationErrors.length > 0 || (nextDue && lastConsumed && nextDue <= lastConsumed)) {
      return {
        ...base,
        inferredLastLegitimateConsumedOccurrence: lastConsumed,
        latestValidatedExplicitOccurrence: explicitDates.map((item) => item.date).sort().at(-1) ?? null,
        proposedNextDueDate: null,
        confidence: "Low",
        reasoning: "The Task State Engine replay could not produce a safe unresolved occurrence.",
        ambiguityOrMissingEvidence: [...ambiguity, ...replay.validationErrors, "No safe unresolved occurrence was available."],
      };
    }
    const latestRelevant = relevantRows.at(-1) ?? null;
    const explicitWasLatestEvidence = Boolean(lastConsumed && explicitDates.some((item) => item.date === lastConsumed));
    const confidence: RecurringDateRepairConfidence = explicitWasLatestEvidence ? "High" : "Medium";
    const latestOutcomeSummary = latestRelevant ? historySummary(latestRelevant) : null;
    return {
      ...base,
      inferredLastLegitimateConsumedOccurrence: lastConsumed,
      latestValidatedExplicitOccurrence: explicitDates.map((item) => item.date).sort().at(-1) ?? null,
      latestOccurrenceRelevantHistoryOutcome: latestOutcomeSummary,
      replaySeedOccurrence: replaySeed,
      firstReplayedHistoryRow: replaySummaries[0] ?? null,
      lastReplayedHistoryRow: replaySummaries.at(-1) ?? null,
      proposedNextDueDate: nextDue,
      confidence,
      proposalBasis: replaySummaries.length > 0
        ? `Task State Engine replay from ${replaySeed ?? "termination"} through ${replaySummaries.at(-1)?.entryDate} ${replaySummaries.at(-1)?.status}.`
        : `Task State Engine seed ${replaySeed ?? "termination"}; no History rows were replayed after the excluded consumed-occurrence boundary at ${lastConsumed ?? "the validated boundary"}.`,
      reasoning: `${explicitWasLatestEvidence ? "Explicit History occurrence identity" : "Successful on-schedule legacy History"} identifies ${lastConsumed ?? "no occurrence"} as consumed; the replay seeds at ${replaySeed ?? "recurrence termination"} and excludes consuming outcomes at or before that occurrence-identity boundary. The Task State Engine returns ${nextDue ?? "no next due date"} as the current unresolved occurrence${task.due_on === nextDue ? ", matching the persisted due date" : ""}.`,
      ambiguityOrMissingEvidence: ambiguity,
    };
  }

  if (task.active_occurrence_due_on && isFixedOccurrence(recurrence, task.active_occurrence_due_on, task.active_occurrence_due_on)) {
    return {
      ...base,
      inferredLastLegitimateConsumedOccurrence: null,
      proposedNextDueDate: task.active_occurrence_due_on,
      confidence: "Medium",
      reasoning: "No successful occurrence is loaded, but the persisted live-occurrence date matches the fixed recurrence configuration.",
      ambiguityOrMissingEvidence: [...ambiguity, "No successful History confirms whether the live occurrence was consumed."],
    };
  }
  if (task.due_on && task.due_on > logicalDate && isFixedOccurrence(recurrence, task.due_on, task.due_on)) {
    return {
      ...base,
      inferredLastLegitimateConsumedOccurrence: null,
      proposedNextDueDate: task.due_on,
      confidence: "Low",
      reasoning: "No successful History is loaded; the report can only preserve the existing future due date because it matches the fixed recurrence configuration.",
      ambiguityOrMissingEvidence: [...ambiguity, "Missing History prevents confirmation that this is the immediate next occurrence."],
    };
  }
  return {
    ...base,
    inferredLastLegitimateConsumedOccurrence: null,
    proposedNextDueDate: null,
    confidence: "Low",
    reasoning: "The loaded evidence does not identify a legitimate consumed occurrence or a safely preservable future due date.",
    ambiguityOrMissingEvidence: [...ambiguity, "Insufficient recurrence evidence."],
  };
}

export function buildRecurringDateRepairReport(input: BuildRecurringDateRepairReportInput): RecurringDateRepairReport {
  const affectedTaskIds = [...(input.affectedTaskIds ?? RECURRING_DATE_REPAIR_TASK_IDS)];
  const affectedTaskIdSet = new Set(affectedTaskIds);
  const tasksById = new Map(input.tasks.map((task) => [task.id, task]));
  const historyByTaskId = new Map<string, TaskHistory[]>();
  for (const row of input.history) {
    if (!affectedTaskIdSet.has(row.task_id)) continue;
    const rows = historyByTaskId.get(row.task_id) ?? [];
    rows.push(row);
    historyByTaskId.set(row.task_id, rows);
  }
  const logicalDate = logicalDateForTimestamp(input.now, input.timezone, input.rolloverTime);
  const reports = affectedTaskIds.map((taskId) => {
    const task = tasksById.get(taskId);
    return task
      ? reportForTask(task, historyByTaskId.get(taskId) ?? [], logicalDate, input.now, input.timezone, input.rolloverTime)
      : missingTaskReport(taskId);
  });
  const count = (confidence: RecurringDateRepairConfidence) => reports.filter(
    (report) => report.proposedNextDueDate !== null && report.confidence === confidence,
  ).length;
  return {
    schemaVersion: 1,
    logicalDate,
    affectedTaskIds,
    summary: {
      totalAffectedIds: affectedTaskIds.length,
      foundTasks: reports.filter((report) => report.taskTitle !== null).length,
      missingTasks: reports.filter((report) => report.taskTitle === null).length,
      highConfidenceProposals: count("High"),
      mediumConfidenceProposals: count("Medium"),
      lowConfidenceProposals: count("Low"),
      noSafeProposal: reports.filter((report) => report.proposedNextDueDate === null).length,
    },
    tasks: reports,
  };
}
