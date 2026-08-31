import type {
  HealthJournalSignal,
  HealthJournalSignalKind,
  HealthJournalSignalValue,
  HealthSymptom,
} from "@/lib/database.types";
import { ADHDICE_ACCENT_COLORS } from "@/lib/accent-colors";
import { normalizeHealthSymptomColor } from "@/lib/health-utils";

export const HEALTH_JOURNAL_SIGNAL_KINDS: readonly HealthJournalSignalKind[] = ["symptom", "emotion", "other"];
export const HEALTH_JOURNAL_SCORE_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export const DEFAULT_HEALTH_JOURNAL_LOW_LABEL = "None";
export const DEFAULT_HEALTH_JOURNAL_HIGH_LABEL = "Extreme";
export const DEFAULT_HEALTH_JOURNAL_FEELING_COLOR = ADHDICE_ACCENT_COLORS[0];

export const HEALTH_JOURNAL_DEFAULT_SCALE_LABELS: Readonly<Record<HealthJournalSignalKind, readonly string[]>> = {
  symptom: [
    "None",
    "Barely noticeable",
    "Very mild",
    "Mild",
    "Mild to moderate",
    "Moderate",
    "Moderately strong",
    "Strong",
    "Severe",
    "Very severe",
    "Extreme",
  ],
  emotion: [
    "None",
    "Barely",
    "Very slight",
    "Slight",
    "Mild",
    "Moderate",
    "Noticeable",
    "Strong",
    "Very strong",
    "Intense",
    "Extreme",
  ],
  other: [
    "None",
    "Very low",
    "Low",
    "Slightly low",
    "Below average",
    "Moderate",
    "Above average",
    "High",
    "Very high",
    "Intense",
    "Extreme",
  ],
};

export type HealthJournalDraftValue = {
  id?: string;
  signal_id: string;
  score: number | null;
};

export function normalizeHealthJournalSignalColor(color: string | null | undefined) {
  const normalized = color?.trim().toLowerCase() ?? "";
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : DEFAULT_HEALTH_JOURNAL_FEELING_COLOR;
}

export function normalizeHealthJournalLabel(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized || fallback;
}

export function getDefaultHealthJournalScaleLabels(kind: HealthJournalSignalKind) {
  return [...HEALTH_JOURNAL_DEFAULT_SCALE_LABELS[kind]];
}

export function normalizeHealthJournalScaleLabels(
  value: unknown,
  kind: HealthJournalSignalKind,
  lowLabel?: unknown,
  highLabel?: unknown,
) {
  const defaults = getDefaultHealthJournalScaleLabels(kind);
  const hasCompleteScale = Array.isArray(value) && value.length === HEALTH_JOURNAL_SCORE_OPTIONS.length;
  const labels = defaults.map((fallback, index) => normalizeHealthJournalLabel(
    Array.isArray(value) && value.length === HEALTH_JOURNAL_SCORE_OPTIONS.length ? value[index] : undefined,
    fallback,
  ));

  if (!hasCompleteScale) {
    labels[0] = normalizeHealthJournalLabel(lowLabel, labels[0] ?? DEFAULT_HEALTH_JOURNAL_LOW_LABEL);
    labels[10] = normalizeHealthJournalLabel(highLabel, labels[10] ?? DEFAULT_HEALTH_JOURNAL_HIGH_LABEL);
  }

  return labels;
}

export function normalizeHealthJournalSignal(signal: HealthJournalSignal): HealthJournalSignal {
  const scaleLabels = normalizeHealthJournalScaleLabels(
    signal.scale_labels,
    signal.kind,
    signal.low_label,
    signal.high_label,
  );
  return {
    ...signal,
    color: signal.kind === "symptom" ? null : normalizeHealthJournalSignalColor(signal.color),
    kind: signal.kind,
    high_label: scaleLabels[10] ?? DEFAULT_HEALTH_JOURNAL_HIGH_LABEL,
    low_label: scaleLabels[0] ?? DEFAULT_HEALTH_JOURNAL_LOW_LABEL,
    name: signal.kind === "symptom" ? null : signal.name?.trim().replace(/\s+/g, " ") || null,
    scale_labels: scaleLabels,
    symptom_id: signal.kind === "symptom" ? signal.symptom_id : null,
    in_template: signal.in_template === true,
    template_sort_order: Number.isInteger(signal.template_sort_order) ? signal.template_sort_order : null,
  };
}

export function getHealthJournalSignalDisplayColor(
  signal: HealthJournalSignal,
  symptom?: Pick<HealthSymptom, "color"> | null,
) {
  return signal.kind === "symptom"
    ? normalizeHealthSymptomColor(symptom?.color)
    : normalizeHealthJournalSignalColor(signal.color);
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
  return signal.name ?? "Unnamed feeling";
}

export function normalizeHealthJournalScore(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const score = typeof value === "number" ? value : Number(value);
  return Number.isInteger(score) && score >= 0 && score <= 10 ? score : null;
}

export function replaceHealthJournalReflectionTag(
  reflection: string,
  start: number,
  end: number,
  replacement: string,
) {
  return `${reflection.slice(0, start)}${replacement}${reflection.slice(end)}`;
}

export function ensureHealthJournalDraftValue(
  values: readonly HealthJournalDraftValue[],
  signalId: string,
) {
  let found = false;
  const nextValues: HealthJournalDraftValue[] = [];
  for (const value of values) {
    if (value.signal_id !== signalId) {
      nextValues.push(value);
      continue;
    }
    if (!found) {
      nextValues.push(value);
      found = true;
    }
  }
  return found ? nextValues : [...nextValues, { score: null, signal_id: signalId }];
}

export function updateHealthJournalDraftValue(
  values: readonly HealthJournalDraftValue[],
  signalId: string,
  score: number | null,
) {
  let found = false;
  const nextValues: HealthJournalDraftValue[] = [];
  for (const value of values) {
    if (value.signal_id !== signalId) {
      nextValues.push(value);
      continue;
    }
    if (!found) {
      nextValues.push({ ...value, score });
      found = true;
    }
  }
  return found ? nextValues : [...nextValues, { score, signal_id: signalId }];
}

export function buildHealthJournalDraftValues({
  signals,
  values,
  journalEntryId,
  symptoms,
}: {
  signals: readonly HealthJournalSignal[];
  values: readonly HealthJournalSignalValue[];
  journalEntryId: string | null;
  symptoms?: readonly HealthSymptom[];
}): HealthJournalDraftValue[] {
  const savedBySignal = new Map(
    values
      .filter((value) => journalEntryId !== null && value.journal_entry_id === journalEntryId)
      .map((value) => [value.signal_id, value] as const),
  );
  const orderedSignals = [...signals]
    .filter((signal) => {
      if (savedBySignal.has(signal.id)) return true;
      if (signal.archived_at !== null || !signal.in_template) return false;
      return signal.kind !== "symptom"
        || symptoms === undefined
        || symptoms.some((symptom) => symptom.id === signal.symptom_id && symptom.archived_at === null);
    })
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

export function getHealthJournalTemplateSignals(
  signals: readonly HealthJournalSignal[],
  symptoms?: readonly HealthSymptom[],
) {
  return signals
    .filter((signal) => signal.archived_at === null && signal.in_template && (
      signal.kind !== "symptom"
      || symptoms === undefined
      || symptoms.some((symptom) => symptom.id === signal.symptom_id && symptom.archived_at === null)
    ))
    .sort(sortHealthJournalSignals);
}
