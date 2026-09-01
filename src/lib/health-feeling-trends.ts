import type {
  HealthJournalSignal,
  HealthJournalSignalOccurrence,
  HealthSymptom,
  HealthSymptomEntry,
} from "@/lib/database.types";
import {
  getHealthJournalSignalDisplayColor,
  getHealthJournalSignalDisplayName,
  getDefaultHealthJournalScaleLabels,
} from "@/lib/health-journal";
import {
  HEALTH_SYMPTOM_TREND_RANGES,
  normalizeHealthSymptomColor,
  shiftHealthDate,
  type HealthSymptomTrendRange,
} from "@/lib/health-utils";

export const ALL_HEALTH_FEELINGS_VALUE = "__all_feelings__";
export const HEALTH_FEELING_TREND_RANGES = HEALTH_SYMPTOM_TREND_RANGES;
export type HealthFeelingTrendRange = HealthSymptomTrendRange;
export type HealthFeelingTrendKind = "symptom" | "emotion" | "other";

export type FeelingTrendDefinition = {
  archived: boolean;
  color: string;
  key: string;
  kind: HealthFeelingTrendKind;
  name: string;
  scaleLabels: readonly string[];
};

export type FeelingTrendPoint = {
  entryDate: string;
  feelingKey: string;
  id: string;
  kind: HealthFeelingTrendKind;
  note: string | null;
  occurredAt: string;
  score: number;
};

export type HealthFeelingTrendModel = {
  definitions: FeelingTrendDefinition[];
  points: FeelingTrendPoint[];
};

export function toggleHealthFeelingTrendSelection(
  selectedKeys: ReadonlySet<string>,
  definitionKeys: readonly string[],
) {
  const next = new Set(selectedKeys);
  const shouldSelect = definitionKeys.some((key) => !next.has(key));
  definitionKeys.forEach((key) => {
    if (shouldSelect) {
      next.add(key);
    } else {
      next.delete(key);
    }
  });
  return next;
}

export function getHealthFeelingTrendSelectionSummary(
  definitions: readonly FeelingTrendDefinition[],
  selectedKeys: ReadonlySet<string>,
) {
  const selectedDefinitions = definitions.filter((definition) => selectedKeys.has(definition.key));
  if (definitions.length > 0 && selectedDefinitions.length === definitions.length) {
    return "All Feelings";
  }
  if (selectedDefinitions.length === 0) {
    return "Select Feelings";
  }
  if (selectedDefinitions.length <= 2) {
    return selectedDefinitions.map((definition) => `${definition.name}${definition.archived ? " (archived)" : ""}`).join(" + ");
  }
  return `${selectedDefinitions.length} Feelings`;
}

function sortFeelingTrendPoints(left: FeelingTrendPoint, right: FeelingTrendPoint) {
  return left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id);
}

function getSymptomSignal(symptom: HealthSymptom, journalSignals: readonly HealthJournalSignal[]) {
  return journalSignals.find((signal) => signal.kind === "symptom" && signal.symptom_id === symptom.id) ?? null;
}

export function buildHealthFeelingTrendModel({
  journalSignalOccurrences,
  journalSignals,
  symptomEntries,
  symptoms,
}: {
  journalSignalOccurrences: readonly HealthJournalSignalOccurrence[];
  journalSignals: readonly HealthJournalSignal[];
  symptomEntries: readonly HealthSymptomEntry[];
  symptoms: readonly HealthSymptom[];
}): HealthFeelingTrendModel {
  const definitions: FeelingTrendDefinition[] = [];
  const points: FeelingTrendPoint[] = [];
  const symptomEntriesById = new Map<string, HealthSymptomEntry[]>();
  const ownedJournalSignalOccurrences = journalSignalOccurrences.filter((occurrence) => Boolean(occurrence.journal_entry_id));

  symptomEntries
    .filter((entry) => Boolean(entry.journal_entry_id))
    .forEach((entry) => {
      const entries = symptomEntriesById.get(entry.symptom_id) ?? [];
      entries.push(entry);
      symptomEntriesById.set(entry.symptom_id, entries);
    });

  symptoms.forEach((symptom) => {
    const entries = symptomEntriesById.get(symptom.id) ?? [];
    if (symptom.archived_at !== null && entries.length === 0) return;
    const signal = getSymptomSignal(symptom, journalSignals);
    const key = `symptom:${symptom.id}`;
    definitions.push({
      archived: symptom.archived_at !== null,
      color: normalizeHealthSymptomColor(symptom.color),
      key,
      kind: "symptom",
      name: symptom.name,
      scaleLabels: signal?.scale_labels ?? getDefaultHealthJournalScaleLabels("symptom"),
    });
    entries.forEach((entry) => points.push({
      entryDate: entry.entry_date,
      feelingKey: key,
      id: entry.id,
      kind: "symptom",
      note: entry.note,
      occurredAt: entry.logged_at,
      score: entry.severity,
    }));
  });

  const signalIdsWithHistory = new Set(ownedJournalSignalOccurrences.map((occurrence) => occurrence.signal_id));
  journalSignals
    .filter((signal) => (signal.kind === "emotion" || signal.kind === "other") && (signal.archived_at === null || signalIdsWithHistory.has(signal.id)))
    .forEach((signal) => {
      const key = `signal:${signal.id}`;
      definitions.push({
        archived: signal.archived_at !== null,
        color: getHealthJournalSignalDisplayColor(signal),
        key,
        kind: signal.kind,
        name: getHealthJournalSignalDisplayName(signal, symptoms),
        scaleLabels: signal.scale_labels,
      });
      ownedJournalSignalOccurrences
        .filter((occurrence) => occurrence.signal_id === signal.id)
        .forEach((occurrence) => points.push({
          entryDate: occurrence.entry_date,
          feelingKey: key,
          id: occurrence.id,
          kind: signal.kind,
          note: occurrence.note,
          occurredAt: occurrence.occurred_at,
          score: occurrence.score,
        }));
    });

  return { definitions, points: points.sort(sortFeelingTrendPoints) };
}

export function getHealthFeelingTrendRangeStartDate(range: HealthFeelingTrendRange, asOfDate: string) {
  if (range === "All") return null;
  const days = range === "7D" ? 7 : range === "30D" ? 30 : 90;
  return shiftHealthDate(asOfDate, -(days - 1));
}

export function getHealthFeelingTrendPoints({
  asOfDate,
  model,
  range,
  feelingKey,
}: {
  asOfDate: string;
  model: HealthFeelingTrendModel;
  range: HealthFeelingTrendRange;
  feelingKey?: string;
}) {
  const rangeStartDate = getHealthFeelingTrendRangeStartDate(range, asOfDate);
  return model.points.filter((point) => (
    (!feelingKey || point.feelingKey === feelingKey)
    && (rangeStartDate === null || (point.entryDate >= rangeStartDate && point.entryDate <= asOfDate))
  ));
}

export function getHealthFeelingTrendPointsByDefinition({
  asOfDate,
  model,
  range,
}: {
  asOfDate: string;
  model: HealthFeelingTrendModel;
  range: HealthFeelingTrendRange;
}) {
  return model.definitions
    .map((definition) => ({
      definition,
      points: getHealthFeelingTrendPoints({ asOfDate, feelingKey: definition.key, model, range }),
    }))
    .filter(({ points }) => points.length > 0);
}

export function getHealthFeelingTrendAverage(points: readonly FeelingTrendPoint[]) {
  if (points.length === 0) return null;
  return Math.round((points.reduce((total, point) => total + point.score, 0) / points.length) * 10) / 10;
}

export function formatHealthFeelingTrendScore(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
