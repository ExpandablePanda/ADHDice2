import type {
  HealthCheckIn,
  HealthJournalCustomAnswer,
  HealthJournalCustomAnswerValue,
  HealthJournalCustomInputType,
  HealthJournalCustomQuestion,
  HealthJournalEntryType,
  HealthJournalLinkedOccurrence,
  HealthJournalQuestionTarget,
  HealthJournalReframe,
  HealthJournalSleepLink,
  HealthJournalStructuredAnswers,
  HealthJournalSignal,
  HealthMetricEntry,
} from "@/lib/database.types";
import {
  formatHealthSleepDuration,
  formatHealthTimestampDate,
  formatHealthTimestampTime,
  getHealthSleepStartTimestamp,
  getSleepFocusSessions,
  shiftHealthDate,
} from "@/lib/health-utils";
import type { FocusCategory, HistoricalFocusSession } from "@/lib/types";

export const HEALTH_JOURNAL_ENTRY_TYPES: readonly HealthJournalEntryType[] = ["start_of_day", "end_of_day", "event"];
export const HEALTH_JOURNAL_CUSTOM_INPUT_TYPES: readonly HealthJournalCustomInputType[] = [
  "short_text",
  "long_text",
  "number",
  "scale_1_10",
  "yes_no",
  "single_choice",
  "multiple_choice",
];
export const HEALTH_JOURNAL_CUSTOM_QUESTION_TARGETS: readonly HealthJournalQuestionTarget[] = ["start_of_day", "end_of_day", "both"];

export type HealthJournalBreakfastState = NonNullable<HealthJournalStructuredAnswers["breakfast_state"]>;

export type HealthJournalSleepContext = HealthJournalSleepLink & {
  records: Array<{
    id: string;
    minutes: number;
    source: "focus" | "apple_health";
    started_at: string | null;
  }>;
};

export type HealthJournalOccurrenceDisplay = {
  id: string;
  kind: "symptom" | "feeling";
  name: string;
  score: number;
  denominator: number;
  occurredAt: string;
};

export function normalizeHealthJournalEntryType(value: unknown): HealthJournalEntryType {
  return HEALTH_JOURNAL_ENTRY_TYPES.includes(value as HealthJournalEntryType)
    ? value as HealthJournalEntryType
    : "event";
}

export function getHealthJournalEntryType(entry: Pick<HealthCheckIn, "entry_type"> | null | undefined) {
  return normalizeHealthJournalEntryType(entry?.entry_type);
}

export function getHealthJournalEntryTypeLabel(type: HealthJournalEntryType) {
  switch (type) {
    case "start_of_day":
      return "Start of Day";
    case "end_of_day":
      return "End of Day";
    case "event":
      return "Event";
  }
}

function normalizeQuestionText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function normalizeQuestionOptions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((option): option is string => typeof option === "string").map(normalizeQuestionText).filter(Boolean))];
}

export function normalizeHealthJournalCustomQuestions(value: unknown): HealthJournalCustomQuestion[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .filter((value): value is Partial<HealthJournalCustomQuestion> => Boolean(value && typeof value === "object"))
    .map((question, index) => {
      const id = typeof question.id === "string" && question.id.trim() ? question.id : `journal-question-${index}`;
      const inputType = HEALTH_JOURNAL_CUSTOM_INPUT_TYPES.includes(question.input_type as HealthJournalCustomInputType)
        ? question.input_type as HealthJournalCustomInputType
        : "short_text";
      const target = HEALTH_JOURNAL_CUSTOM_QUESTION_TARGETS.includes(question.target as HealthJournalQuestionTarget)
        ? question.target as HealthJournalQuestionTarget
        : "both";
      const timestamp = typeof question.created_at === "string" ? question.created_at : new Date(0).toISOString();
      return {
        created_at: timestamp,
        enabled: question.enabled !== false,
        id,
        input_type: inputType,
        options: normalizeQuestionOptions(question.options),
        question: normalizeQuestionText(question.question),
        sort_order: Number.isFinite(question.sort_order) ? Number(question.sort_order) : index,
        target,
        updated_at: typeof question.updated_at === "string" ? question.updated_at : timestamp,
      } satisfies HealthJournalCustomQuestion;
    })
    .filter((question) => question.question && !seen.has(question.id) && Boolean(seen.add(question.id)))
    .sort((left, right) => left.sort_order - right.sort_order || left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id));
}

export function getHealthJournalCustomQuestionsForEntry(
  questions: readonly HealthJournalCustomQuestion[],
  entryType: HealthJournalEntryType,
) {
  const target = entryType === "start_of_day" ? "start_of_day" : entryType === "end_of_day" ? "end_of_day" : null;
  if (!target) return [];
  return normalizeHealthJournalCustomQuestions(questions).filter((question) => question.enabled && (question.target === target || question.target === "both"));
}

export function buildHealthJournalCustomAnswer(
  question: HealthJournalCustomQuestion,
  value: HealthJournalCustomAnswerValue,
): HealthJournalCustomAnswer {
  return {
    input_type: question.input_type,
    options: [...question.options],
    question: question.question,
    question_id: question.id,
    target: question.target,
    value,
  };
}

export function normalizeHealthJournalStructuredAnswers(value: unknown): HealthJournalStructuredAnswers {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const customAnswers = Array.isArray(record.custom_answers)
    ? record.custom_answers.filter((answer): answer is HealthJournalCustomAnswer => Boolean(answer && typeof answer === "object" && typeof (answer as HealthJournalCustomAnswer).question_id === "string"))
    : [];
  const linkedEventIds = Array.isArray(record.linked_event_ids)
    ? [...new Set(record.linked_event_ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0))]
    : [];
  const normalizedRecord = { ...record };
  delete normalizedRecord.linked_event_ids;
  return {
    ...normalizedRecord,
    custom_answers: customAnswers,
    ...(Array.isArray(record.linked_event_ids) ? { linked_event_ids: linkedEventIds } : {}),
    schema_version: 1,
  } as HealthJournalStructuredAnswers;
}

export function buildEmptyHealthJournalStructuredAnswers(): HealthJournalStructuredAnswers {
  return { custom_answers: [], schema_version: 1 };
}

export function getHealthJournalScaleDenominator(signal: Pick<HealthJournalSignal, "scale_labels"> | null | undefined) {
  const denominator = (signal?.scale_labels?.length ?? 0) - 1;
  return Number.isInteger(denominator) && denominator > 0 ? denominator : 10;
}

function formatHealthJournalOccurrenceDateTime(occurredAt: string) {
  const date = formatHealthTimestampDate(occurredAt);
  const time = formatHealthTimestampTime(occurredAt);
  return date && time ? `${date} · ${time}` : "Time unavailable";
}

export function formatHealthJournalOccurrenceReference({
  name,
  occurredAt,
  score,
  signal,
}: {
  name: string;
  occurredAt: string;
  score: number;
  signal?: Pick<HealthJournalSignal, "scale_labels"> | null;
}) {
  return `${name} (${score}/${getHealthJournalScaleDenominator(signal)}) · ${formatHealthJournalOccurrenceDateTime(occurredAt)}`;
}

export function getHealthJournalOccurrenceDisplay(
  occurrence: HealthJournalOccurrenceDisplay,
) {
  return `${occurrence.name} (${occurrence.score}/${occurrence.denominator}) · ${formatHealthJournalOccurrenceDateTime(occurrence.occurredAt)}`;
}

export function findRelevantHealthSleepContext({
  date,
  focusCategories,
  focusHistory,
  metricEntries,
}: {
  date: string;
  focusCategories: readonly FocusCategory[];
  focusHistory: readonly HistoricalFocusSession[];
  metricEntries: readonly HealthMetricEntry[];
}): HealthJournalSleepContext | null {
  const sleepSessions = getSleepFocusSessions([...focusHistory], [...focusCategories]);
  const candidateDates = [...new Set([date, shiftHealthDate(date, -1)])];
  for (const candidateDate of candidateDates) {
    const focusRecords = sleepSessions
      .filter((session) => session.date === candidateDate && Number.isFinite(session.durationSeconds) && session.durationSeconds > 0)
      .map((session) => ({
        id: session.id,
        minutes: session.durationSeconds / 60,
        source: "focus" as const,
        started_at: getHealthSleepStartTimestamp(session),
      }));
    const importedRecords = metricEntries
      .filter((entry) => entry.metric_type === "sleep_minutes" && entry.metric_date === candidateDate && Number.isFinite(entry.metric_value) && entry.metric_value > 0)
      .map((entry) => ({
        id: entry.id,
        minutes: entry.metric_value,
        source: "apple_health" as const,
        started_at: null,
      }));
    const records = [...focusRecords, ...importedRecords];
    if (records.length === 0) continue;
    const sources = [...new Set(records.map((record) => record.source))];
    return {
      date: candidateDate,
      focus_session_ids: focusRecords.map((record) => record.id),
      imported_metric_ids: importedRecords.map((record) => record.id),
      records,
      sources,
      total_minutes: Math.round(records.reduce((total, record) => total + record.minutes, 0)),
    };
  }
  return null;
}

export function buildHealthJournalSleepLink(context: HealthJournalSleepContext | null): HealthJournalSleepLink | null {
  if (!context) return null;
  return {
    date: context.date,
    focus_session_ids: [...context.focus_session_ids],
    imported_metric_ids: [...context.imported_metric_ids],
    sources: [...context.sources],
    total_minutes: context.total_minutes,
  };
}

export function formatHealthJournalSleepLink(link: HealthJournalSleepLink | null | undefined) {
  if (!link) return "No sleep data linked";
  const sourceLabel = link.sources.includes("focus") && link.sources.includes("apple_health")
    ? "Sleep Focus + Apple Health"
    : link.sources.includes("focus")
      ? "Sleep Focus"
      : "Apple Health";
  return `${formatHealthSleepDuration(link.total_minutes)} · ${sourceLabel} · ${link.date}`;
}

export function normalizeHealthJournalLinkedOccurrences(value: unknown): HealthJournalLinkedOccurrence[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((reference): reference is HealthJournalLinkedOccurrence => {
    if (!reference || typeof reference !== "object") return false;
    const candidate = reference as HealthJournalLinkedOccurrence;
    if (typeof candidate.id !== "string" || (candidate.kind !== "symptom" && candidate.kind !== "feeling")) return false;
    const key = `${candidate.kind}:${candidate.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeHealthJournalReframes(value: unknown): HealthJournalReframe[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 5).map((row) => ({
    negative: row && typeof row === "object" && typeof (row as HealthJournalReframe).negative === "string" ? (row as HealthJournalReframe).negative : "",
    positive: row && typeof row === "object" && typeof (row as HealthJournalReframe).positive === "string" ? (row as HealthJournalReframe).positive : "",
  }));
}

export function normalizeHealthJournalWins(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 5).map((win) => typeof win === "string" ? win : "");
}
