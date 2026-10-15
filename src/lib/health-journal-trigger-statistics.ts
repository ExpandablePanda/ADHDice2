import type {
  HealthCheckIn,
  HealthJournalSignal,
  HealthJournalSignalOccurrence,
  HealthJournalTrigger,
  HealthJournalTriggerEffect,
  HealthJournalTriggerLink,
  HealthSymptom,
  HealthSymptomEntry,
} from "@/lib/database.types";

export type HealthJournalTriggerStatisticsRange = "7_days" | "30_days" | "90_days" | "all_time";
export type HealthJournalTriggerTimelineGrouping = "day" | "week" | "month";

type JournalEntryIdentity = Pick<HealthCheckIn, "id" | "user_id">;
type TriggerDefinition = Pick<HealthJournalTrigger, "id" | "user_id" | "name" | "archived_at">;
type TriggerAssociation = Pick<HealthJournalTriggerLink,
  "id" | "user_id" | "trigger_id" | "symptom_occurrence_id" | "journal_signal_occurrence_id" | "effect" | "previous_score" | "created_at"
>;
type SymptomOccurrence = Pick<HealthSymptomEntry,
  "id" | "user_id" | "journal_entry_id" | "entry_date" | "logged_at" | "symptom_id" | "severity"
>;
type FeelingOccurrence = Pick<HealthJournalSignalOccurrence,
  "id" | "user_id" | "journal_entry_id" | "entry_date" | "occurred_at" | "signal_id" | "score"
>;
type FeelingDefinition = Pick<HealthJournalSignal, "id" | "user_id" | "name">;
type SymptomDefinition = Pick<HealthSymptom, "id" | "user_id" | "name">;

export type HealthJournalTriggerStatisticsInput = {
  checkIns: readonly JournalEntryIdentity[];
  journalSignals: readonly FeelingDefinition[];
  journalSignalOccurrences: readonly FeelingOccurrence[];
  journalTriggers: readonly TriggerDefinition[];
  journalTriggerLinks: readonly TriggerAssociation[];
  range: HealthJournalTriggerStatisticsRange;
  symptomEntries: readonly SymptomOccurrence[];
  symptoms: readonly SymptomDefinition[];
  todayDate: string;
};

export type HealthJournalTriggerEffectCounts = Record<HealthJournalTriggerEffect, number>;

export type HealthJournalTriggerTimelinePeriod = {
  key: string;
  startDate: string;
  endDate: string;
  count: number;
};

export type HealthJournalTriggerAssociationHistoryItem = {
  associationId: string;
  entryDate: string;
  journalEntryId: string;
  feelingOccurrenceId: string;
  feelingName: string;
  feelingKind: "symptom" | "feeling";
  occurredAt: string;
  effect: HealthJournalTriggerEffect;
  previousScore: number | null;
  recordedScore: number;
  scoreDifference: number | null;
};

export type HealthJournalTriggerDetail = {
  trigger: TriggerDefinition;
  associationCount: number;
  uniqueJournalEntryCount: number;
  effects: HealthJournalTriggerEffectCounts;
  feelings: Array<{ name: string; occurrenceCount: number }>;
  history: HealthJournalTriggerAssociationHistoryItem[];
  timeline: HealthJournalTriggerTimelinePeriod[];
};

export type HealthJournalTriggerStatistics = {
  range: HealthJournalTriggerStatisticsRange;
  rangeStartDate: string | null;
  rangeEndDate: string;
  grouping: HealthJournalTriggerTimelineGrouping;
  totalAssociationCount: number;
  distinctTriggerCount: number;
  distinctJournalEntryCount: number;
  effects: HealthJournalTriggerEffectCounts;
  rankedTriggers: HealthJournalTriggerDetail[];
  triggerOptions: HealthJournalTriggerDetail[];
  timeline: HealthJournalTriggerTimelinePeriod[];
  ignoredAssociationCount: number;
};

type ValidAssociation = {
  association: TriggerAssociation;
  trigger: TriggerDefinition;
  entryDate: string;
  journalEntryId: string;
  feelingOccurrenceId: string;
  feelingName: string;
  feelingKind: "symptom" | "feeling";
  occurredAt: string;
  recordedScore: number;
};

const EFFECT_VALUES = new Set<HealthJournalTriggerEffect>(["associated", "improved", "worsened"]);

function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function addCalendarDays(dateKey: string, amount: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return date.toISOString().slice(0, 10);
}

function monthStart(dateKey: string): string {
  return dateKey.slice(0, 7) + "-01";
}

function nextMonthStart(dateKey: string): string {
  const [year, month] = dateKey.slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}

function mondayOfWeek(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return addCalendarDays(dateKey, -daysSinceMonday);
}

function isScore(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 10;
}

function isSymptomSeverity(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 10;
}

function resolveAssociations(input: HealthJournalTriggerStatisticsInput) {
  const entryById = new Map(input.checkIns.map((entry) => [entry.id, entry] as const));
  const triggerById = new Map(input.journalTriggers.map((trigger) => [trigger.id, trigger] as const));
  const symptomOccurrenceById = new Map(input.symptomEntries.map((occurrence) => [occurrence.id, occurrence] as const));
  const feelingOccurrenceById = new Map(input.journalSignalOccurrences.map((occurrence) => [occurrence.id, occurrence] as const));
  const symptomById = new Map(input.symptoms.map((symptom) => [symptom.id, symptom] as const));
  const signalById = new Map(input.journalSignals.map((signal) => [signal.id, signal] as const));
  const seenAssociationIds = new Set<string>();
  const valid: ValidAssociation[] = [];
  let ignoredAssociationCount = 0;

  for (const association of input.journalTriggerLinks) {
    const associationId = association.id?.trim() ?? "";
    if (!associationId) {
      ignoredAssociationCount += 1;
      continue;
    }
    if (seenAssociationIds.has(associationId)) continue;
    seenAssociationIds.add(associationId);

    const trigger = triggerById.get(association.trigger_id);
    const hasSymptomOccurrence = Boolean(association.symptom_occurrence_id);
    const hasFeelingOccurrence = Boolean(association.journal_signal_occurrence_id);
    if (!trigger || hasSymptomOccurrence === hasFeelingOccurrence || !EFFECT_VALUES.has(association.effect)) {
      ignoredAssociationCount += 1;
      continue;
    }

    let occurrenceId = "";
    let occurrenceEntryId = "";
    let occurrenceUserId = "";
    let entryDate = "";
    let occurredAt = "";
    let recordedScore: number;
    let feelingName = "";
    let feelingKind: ValidAssociation["feelingKind"];

    if (hasSymptomOccurrence) {
      const occurrence = symptomOccurrenceById.get(association.symptom_occurrence_id!);
      if (!occurrence || !isSymptomSeverity(occurrence.severity)) {
        ignoredAssociationCount += 1;
        continue;
      }
      const symptom = symptomById.get(occurrence.symptom_id);
      occurrenceId = occurrence.id;
      occurrenceEntryId = occurrence.journal_entry_id;
      occurrenceUserId = occurrence.user_id;
      entryDate = occurrence.entry_date;
      occurredAt = occurrence.logged_at;
      recordedScore = occurrence.severity;
      feelingName = symptom?.name.trim() || "Archived symptom";
      feelingKind = "symptom";
      if (symptom && symptom.user_id !== association.user_id) {
        ignoredAssociationCount += 1;
        continue;
      }
    } else {
      const occurrence = feelingOccurrenceById.get(association.journal_signal_occurrence_id!);
      if (!occurrence || !isScore(occurrence.score)) {
        ignoredAssociationCount += 1;
        continue;
      }
      const signal = signalById.get(occurrence.signal_id);
      occurrenceId = occurrence.id;
      occurrenceEntryId = occurrence.journal_entry_id;
      occurrenceUserId = occurrence.user_id;
      entryDate = occurrence.entry_date;
      occurredAt = occurrence.occurred_at;
      recordedScore = occurrence.score;
      feelingName = signal?.name?.trim() || "Archived Feeling";
      feelingKind = "feeling";
      if (signal && signal.user_id !== association.user_id) {
        ignoredAssociationCount += 1;
        continue;
      }
    }

    const entry = entryById.get(occurrenceEntryId);
    const previousScore = association.previous_score;
    if (
      !entry
      || !isDateKey(entryDate)
      || entry.user_id !== association.user_id
      || occurrenceUserId !== association.user_id
      || trigger.user_id !== association.user_id
      || (previousScore !== null && !isScore(previousScore))
    ) {
      ignoredAssociationCount += 1;
      continue;
    }

    valid.push({
      association,
      trigger,
      entryDate,
      journalEntryId: entry.id,
      feelingOccurrenceId: occurrenceId,
      feelingName,
      feelingKind,
      occurredAt,
      recordedScore,
    });
  }

  return { associations: valid, ignoredAssociationCount };
}

function getGrouping(range: HealthJournalTriggerStatisticsRange): HealthJournalTriggerTimelineGrouping {
  if (range === "7_days") return "day";
  if (range === "all_time") return "month";
  return "week";
}

function getRangeBounds(
  range: HealthJournalTriggerStatisticsRange,
  todayDate: string,
  associations: readonly ValidAssociation[],
) {
  if (range !== "all_time") {
    const days = range === "7_days" ? 7 : range === "30_days" ? 30 : 90;
    return { startDate: addCalendarDays(todayDate, -(days - 1)), endDate: todayDate };
  }
  if (associations.length === 0) return { startDate: null, endDate: todayDate };
  const sortedDates = associations.map((association) => association.entryDate).sort();
  const latestAssociationDate = sortedDates[sortedDates.length - 1]!;
  return {
    startDate: sortedDates[0]!,
    endDate: latestAssociationDate > todayDate ? latestAssociationDate : todayDate,
  };
}

function dateIsInRange(date: string, startDate: string | null, endDate: string) {
  return (startDate === null || date >= startDate) && date <= endDate;
}

function buildTimeline(
  associations: readonly ValidAssociation[],
  grouping: HealthJournalTriggerTimelineGrouping,
  startDate: string | null,
  endDate: string,
): HealthJournalTriggerTimelinePeriod[] {
  if (!startDate) return [];

  const firstPeriodStart = grouping === "day"
    ? startDate
    : grouping === "week"
      ? mondayOfWeek(startDate)
      : monthStart(startDate);
  const periodKeyForDate = (date: string) => grouping === "day"
    ? date
    : grouping === "week"
      ? mondayOfWeek(date)
      : date.slice(0, 7);
  const counts = new Map<string, number>();
  for (const association of associations) {
    const key = periodKeyForDate(association.entryDate);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const periods: HealthJournalTriggerTimelinePeriod[] = [];
  let periodStart = firstPeriodStart;
  while (periodStart <= endDate) {
    const periodEnd = grouping === "day"
      ? periodStart
      : grouping === "week"
        ? addCalendarDays(periodStart, 6)
        : addCalendarDays(nextMonthStart(periodStart), -1);
    periods.push({
      key: grouping === "month" ? periodStart.slice(0, 7) : periodStart,
      startDate: periodStart,
      endDate: periodEnd,
      count: counts.get(grouping === "month" ? periodStart.slice(0, 7) : periodStart) ?? 0,
    });
    periodStart = grouping === "day"
      ? addCalendarDays(periodStart, 1)
      : grouping === "week"
        ? addCalendarDays(periodStart, 7)
        : nextMonthStart(periodStart);
  }
  return periods;
}

function createEmptyEffects(): HealthJournalTriggerEffectCounts {
  return { associated: 0, improved: 0, worsened: 0 };
}

export function buildHealthJournalTriggerStatistics(
  input: HealthJournalTriggerStatisticsInput,
): HealthJournalTriggerStatistics {
  const currentDate = new Date();
  const fallbackTodayDate = [
    String(currentDate.getFullYear()).padStart(4, "0"),
    String(currentDate.getMonth() + 1).padStart(2, "0"),
    String(currentDate.getDate()).padStart(2, "0"),
  ].join("-");
  const todayDate = isDateKey(input.todayDate) ? input.todayDate : fallbackTodayDate;
  const resolved = resolveAssociations(input);
  const bounds = getRangeBounds(input.range, todayDate, resolved.associations);
  const associations = resolved.associations.filter((association) => dateIsInRange(association.entryDate, bounds.startDate, bounds.endDate));
  const effects = createEmptyEffects();
  const triggerEntries = new Map<string, ValidAssociation[]>();

  for (const association of associations) {
    effects[association.association.effect] += 1;
    const rows = triggerEntries.get(association.trigger.id) ?? [];
    rows.push(association);
    triggerEntries.set(association.trigger.id, rows);
  }

  const grouping = getGrouping(input.range);
  const triggerOptions = input.journalTriggers
    .filter((trigger) => trigger.id.trim().length > 0)
    .map((trigger) => {
      const triggerAssociations = triggerEntries.get(trigger.id) ?? [];
      const triggerEffects = createEmptyEffects();
      const entryIds = new Set<string>();
      const occurrenceIdsByFeelingName = new Map<string, Set<string>>();
      for (const association of triggerAssociations) {
        triggerEffects[association.association.effect] += 1;
        entryIds.add(association.journalEntryId);
        const occurrenceIds = occurrenceIdsByFeelingName.get(association.feelingName) ?? new Set<string>();
        occurrenceIds.add(association.feelingOccurrenceId);
        occurrenceIdsByFeelingName.set(association.feelingName, occurrenceIds);
      }
      const history = triggerAssociations
        .map((association): HealthJournalTriggerAssociationHistoryItem => ({
          associationId: association.association.id,
          entryDate: association.entryDate,
          journalEntryId: association.journalEntryId,
          feelingOccurrenceId: association.feelingOccurrenceId,
          feelingName: association.feelingName,
          feelingKind: association.feelingKind,
          occurredAt: association.occurredAt,
          effect: association.association.effect,
          previousScore: association.association.previous_score,
          recordedScore: association.recordedScore,
          scoreDifference: association.association.previous_score === null
            ? null
            : association.recordedScore - association.association.previous_score,
        }))
        .sort((left, right) => left.entryDate.localeCompare(right.entryDate)
          || Date.parse(left.occurredAt) - Date.parse(right.occurredAt)
          || left.associationId.localeCompare(right.associationId));
      const feelings = [...occurrenceIdsByFeelingName.entries()]
        .map(([name, occurrenceIds]) => ({ name, occurrenceCount: occurrenceIds.size }))
        .sort((left, right) => right.occurrenceCount - left.occurrenceCount || left.name.localeCompare(right.name));
      return {
        trigger,
        associationCount: triggerAssociations.length,
        uniqueJournalEntryCount: entryIds.size,
        effects: triggerEffects,
        feelings,
        history,
        timeline: buildTimeline(triggerAssociations, grouping, bounds.startDate, bounds.endDate),
      } satisfies HealthJournalTriggerDetail;
    })
    .sort((left, right) => left.trigger.name.localeCompare(right.trigger.name) || left.trigger.id.localeCompare(right.trigger.id));
  const rankedTriggers = [...triggerOptions]
    .filter((trigger) => trigger.associationCount > 0)
    .sort((left, right) => right.associationCount - left.associationCount
      || left.trigger.name.localeCompare(right.trigger.name)
      || left.trigger.id.localeCompare(right.trigger.id));

  return {
    range: input.range,
    rangeStartDate: bounds.startDate,
    rangeEndDate: bounds.endDate,
    grouping,
    totalAssociationCount: associations.length,
    distinctTriggerCount: rankedTriggers.length,
    distinctJournalEntryCount: new Set(associations.map((association) => association.journalEntryId)).size,
    effects,
    rankedTriggers,
    triggerOptions,
    timeline: buildTimeline(associations, grouping, bounds.startDate, bounds.endDate),
    ignoredAssociationCount: resolved.ignoredAssociationCount,
  };
}

export function getHealthJournalTriggerTimelineForSelection(
  statistics: HealthJournalTriggerStatistics,
  selectedTriggerId: string | null,
): HealthJournalTriggerTimelinePeriod[] {
  if (!selectedTriggerId) return statistics.timeline;
  return statistics.triggerOptions.find((trigger) => trigger.trigger.id === selectedTriggerId)?.timeline ?? [];
}
