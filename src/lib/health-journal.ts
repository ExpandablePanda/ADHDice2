import type {
  HealthJournalSignal,
  HealthJournalSignalKind,
  HealthJournalSignalValue,
  HealthSymptom,
} from "@/lib/database.types";

export const HEALTH_JOURNAL_SIGNAL_KINDS: readonly HealthJournalSignalKind[] = ["symptom", "emotion", "other"];
export const HEALTH_JOURNAL_SCORE_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export const DEFAULT_HEALTH_JOURNAL_LOW_LABEL = "None";
export const DEFAULT_HEALTH_JOURNAL_HIGH_LABEL = "Extreme";

export type HealthJournalDraftValue = {
  id?: string;
  signal_id: string;
  score: number | null;
};

export function normalizeHealthJournalLabel(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized || fallback;
}

export function normalizeHealthJournalSignal(signal: HealthJournalSignal): HealthJournalSignal {
  return {
    ...signal,
    kind: signal.kind,
    low_label: normalizeHealthJournalLabel(signal.low_label, DEFAULT_HEALTH_JOURNAL_LOW_LABEL),
    high_label: normalizeHealthJournalLabel(signal.high_label, DEFAULT_HEALTH_JOURNAL_HIGH_LABEL),
    name: signal.kind === "symptom" ? null : signal.name?.trim().replace(/\s+/g, " ") || null,
    symptom_id: signal.kind === "symptom" ? signal.symptom_id : null,
    in_template: signal.in_template === true,
    template_sort_order: Number.isInteger(signal.template_sort_order) ? signal.template_sort_order : null,
  };
}

export function sortHealthJournalSignals(left: HealthJournalSignal, right: HealthJournalSignal) {
  const leftOrder = left.in_template && left.template_sort_order !== null ? left.template_sort_order : Number.MAX_SAFE_INTEGER;
  const rightOrder = right.in_template && right.template_sort_order !== null ? right.template_sort_order : Number.MAX_SAFE_INTEGER;
  return leftOrder - rightOrder
    || Number(Boolean(left.archived_at)) - Number(Boolean(right.archived_at))
    || left.kind.localeCompare(right.kind)
    || getHealthJournalSignalDisplayName(left).localeCompare(getHealthJournalSignalDisplayName(right));
}

export function getHealthJournalSignalDisplayName(signal: HealthJournalSignal, symptoms: readonly HealthSymptom[] = []) {
  if (signal.kind === "symptom") {
    return symptoms.find((symptom) => symptom.id === signal.symptom_id)?.name ?? "Archived symptom";
  }
  return signal.name ?? "Unnamed signal";
}

export function normalizeHealthJournalScore(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const score = typeof value === "number" ? value : Number(value);
  return Number.isInteger(score) && score >= 0 && score <= 10 ? score : null;
}

export function buildHealthJournalDraftValues({
  signals,
  values,
  journalEntryId,
}: {
  signals: readonly HealthJournalSignal[];
  values: readonly HealthJournalSignalValue[];
  journalEntryId: string | null;
}): HealthJournalDraftValue[] {
  const savedBySignal = new Map(
    values
      .filter((value) => journalEntryId !== null && value.journal_entry_id === journalEntryId)
      .map((value) => [value.signal_id, value] as const),
  );
  const orderedSignals = [...signals]
    .filter((signal) => (signal.archived_at === null && signal.in_template) || savedBySignal.has(signal.id))
    .sort(sortHealthJournalSignals);
  return orderedSignals.map((signal) => {
    const saved = savedBySignal.get(signal.id);
    return {
      id: saved?.id,
      score: saved?.score ?? null,
      signal_id: signal.id,
    };
  });
}

export function getHealthJournalTemplateSignals(signals: readonly HealthJournalSignal[]) {
  return signals
    .filter((signal) => signal.archived_at === null && signal.in_template)
    .sort(sortHealthJournalSignals);
}
