"use client";

import type { ReactNode } from "react";

import type {
  HealthCheckIn,
  HealthJournalSignal,
  HealthJournalSignalOccurrence,
  HealthSymptom,
  HealthSymptomEntry,
} from "@/lib/database.types";
import {
  formatHealthJournalOccurrenceReference,
  formatHealthJournalSleepLink,
  getHealthJournalEntryTypeLabel,
  normalizeHealthJournalStructuredAnswers,
} from "@/lib/health-journal-checkins";
import { formatHealthNutritionNumber } from "@/lib/health-utils";

function SummaryLine({ children, label }: { children: ReactNode; label: string }) {
  return <p className="mt-1 text-xs text-[#68738c] dark:text-white/60"><span className="font-semibold">{label}:</span> {children}</p>;
}

export function JournalEntrySummary({
  entry,
  journalSignalOccurrences,
  journalSignals,
  symptomEntries,
  symptoms,
}: {
  entry: HealthCheckIn;
  journalSignalOccurrences: readonly HealthJournalSignalOccurrence[];
  journalSignals: readonly HealthJournalSignal[];
  symptomEntries: readonly HealthSymptomEntry[];
  symptoms: readonly HealthSymptom[];
}) {
  const answers = normalizeHealthJournalStructuredAnswers(entry.structured_answers);
  const ownedSymptomOccurrences = symptomEntries.filter((occurrence) => occurrence.journal_entry_id === entry.id);
  const ownedFeelingOccurrences = journalSignalOccurrences.filter((occurrence) => occurrence.journal_entry_id === entry.id);
  const linkedOccurrenceKeys = new Set((answers.linked_occurrence_ids ?? []).map((reference) => `${reference.kind}:${reference.id}`));
  const occurrenceLines = [
    ...ownedSymptomOccurrences.map((occurrence) => {
      const symptom = symptoms.find((candidate) => candidate.id === occurrence.symptom_id);
      const signal = journalSignals.find((candidate) => candidate.kind === "symptom" && candidate.symptom_id === occurrence.symptom_id);
      return {
        key: `symptom:${occurrence.id}`,
        text: formatHealthJournalOccurrenceReference({ name: symptom?.name ?? "Archived symptom", occurredAt: occurrence.logged_at, score: occurrence.severity, signal }),
      };
    }),
    ...ownedFeelingOccurrences.map((occurrence) => {
      const signal = journalSignals.find((candidate) => candidate.id === occurrence.signal_id);
      return {
        key: `feeling:${occurrence.id}`,
        text: formatHealthJournalOccurrenceReference({ name: signal?.name ?? "Archived feeling", occurredAt: occurrence.occurred_at, score: occurrence.score, signal }),
      };
    }),
  ];
  for (const reference of answers.linked_occurrence_ids ?? []) {
    const key = `${reference.kind}:${reference.id}`;
    if (occurrenceLines.some((line) => line.key === key)) continue;
    const symptomOccurrence = reference.kind === "symptom" ? symptomEntries.find((occurrence) => occurrence.id === reference.id) : undefined;
    const feelingOccurrence = reference.kind === "feeling" ? journalSignalOccurrences.find((occurrence) => occurrence.id === reference.id) : undefined;
    if (symptomOccurrence) {
      const symptom = symptoms.find((candidate) => candidate.id === symptomOccurrence.symptom_id);
      const signal = journalSignals.find((candidate) => candidate.kind === "symptom" && candidate.symptom_id === symptomOccurrence.symptom_id);
      occurrenceLines.push({ key, text: formatHealthJournalOccurrenceReference({ name: symptom?.name ?? "Archived symptom", occurredAt: symptomOccurrence.logged_at, score: symptomOccurrence.severity, signal }) });
    } else if (feelingOccurrence) {
      const signal = journalSignals.find((candidate) => candidate.id === feelingOccurrence.signal_id);
      occurrenceLines.push({ key, text: formatHealthJournalOccurrenceReference({ name: signal?.name ?? "Archived feeling", occurredAt: feelingOccurrence.occurred_at, score: feelingOccurrence.score, signal }) });
    }
  }

  const freeFormLines = entry.entry_type === "event"
    ? [{ label: "Event", value: answers.event_description }, { label: "Event notes", value: answers.event_record }]
    : entry.entry_type === "end_of_day"
      ? [{ label: "How today went", value: answers.evening_reflection }, { label: "What went well", value: answers.went_well }, { label: "Difficult", value: answers.difficult_today }, { label: "Still on my mind", value: answers.still_on_mind }, { label: "Tomorrow", value: answers.remember_tomorrow }]
      : [{ label: "Morning thoughts", value: answers.morning_thoughts }, { label: "Matters most", value: answers.matters_most }, { label: "Could make today harder", value: answers.harder_today }, { label: "Success", value: answers.successful_today }];
  const hasStructuredContent = Boolean(
    answers.sleep_link
    || answers.breakfast_state
    || answers.sleep_quality_score
    || answers.energy_now
    || answers.focus_now
    || answers.energy_overall
    || answers.focus_overall
    || answers.wins?.some(Boolean)
    || answers.morning_reframes?.some((row) => row.negative || row.positive)
    || answers.evening_reframes?.some((row) => row.negative || row.positive)
    || answers.custom_answers?.some((answer) => answer.value !== null && answer.value !== "" && (!Array.isArray(answer.value) || answer.value.length > 0))
    || occurrenceLines.length > 0
    || freeFormLines.some((line) => line.value?.trim())
    || answers.anything_else?.trim()
  );
  if (!hasStructuredContent) return null;

  return <div className="mt-2 grid gap-1.5 rounded-[0.9rem] bg-[#faf9ff] px-3 py-2 dark:bg-white/[0.03]">
    <p className="text-xs font-semibold text-[#4f5a76] dark:text-white/75">{getHealthJournalEntryTypeLabel(entry.entry_type ?? "event")} · structured Journal details</p>
    {answers.sleep_link ? <SummaryLine label="Sleep">{formatHealthJournalSleepLink(answers.sleep_link)}</SummaryLine> : null}
    {answers.sleep_quality_score ? <SummaryLine label="Sleep quality">{answers.sleep_quality_score}/10{answers.sleep_quality_note ? ` · ${answers.sleep_quality_note}` : ""}</SummaryLine> : null}
    {answers.breakfast_state ? <SummaryLine label="Breakfast">{answers.breakfast_state === "already_ate" ? `${answers.breakfast_meals?.map((meal) => `${meal.food_name} (${formatHealthNutritionNumber(meal.calories)} kcal)`).join(", ") || "Already ate"}` : answers.breakfast_state === "planning_to_eat" ? `Planning to eat${answers.planned_breakfast ? ` · ${answers.planned_breakfast}` : ""}` : answers.breakfast_state === "skipping" ? "Skipping / not having breakfast" : "Not sure yet"}</SummaryLine> : null}
    {answers.energy_now || answers.energy_overall ? <SummaryLine label="Energy">{answers.energy_now ?? answers.energy_overall}/10{answers.energy_note ? ` · ${answers.energy_note}` : ""}</SummaryLine> : null}
    {answers.focus_now || answers.focus_overall ? <SummaryLine label="Focus">{answers.focus_now ?? answers.focus_overall}/10{answers.focus_note ? ` · ${answers.focus_note}` : ""}</SummaryLine> : null}
    {occurrenceLines.length > 0 ? <SummaryLine label="Feeling occurrences"><span className="inline-flex flex-wrap gap-x-2 gap-y-1">{occurrenceLines.map((line) => <span key={line.key}>{line.text}</span>)}</span></SummaryLine> : linkedOccurrenceKeys.size > 0 ? <SummaryLine label="Feeling occurrences">Linked occurrence details are retained.</SummaryLine> : null}
    {answers.wins?.filter(Boolean).length ? <SummaryLine label="Wins">{answers.wins.filter(Boolean).join(" · ")}</SummaryLine> : null}
    {answers.morning_reframes?.some((row) => row.negative || row.positive) ? <SummaryLine label="Morning reframes">{answers.morning_reframes.filter((row) => row.negative || row.positive).map((row) => `${row.negative} → ${row.positive}`).join(" · ")}</SummaryLine> : null}
    {answers.evening_reframes?.some((row) => row.negative || row.positive) ? <SummaryLine label="Evening reframes">{answers.evening_reframes.filter((row) => row.negative || row.positive).map((row) => `${row.negative} → ${row.positive}`).join(" · ")}</SummaryLine> : null}
    {answers.custom_answers?.filter((answer) => answer.value !== null && answer.value !== "" && (!Array.isArray(answer.value) || answer.value.length > 0)).map((answer) => <SummaryLine key={answer.question_id} label={answer.question}>{Array.isArray(answer.value) ? answer.value.join(", ") : String(answer.value)}</SummaryLine>)}
    {freeFormLines.filter((line) => line.value?.trim()).map((line) => <SummaryLine key={line.label} label={line.label}>{line.value}</SummaryLine>)}
    {answers.anything_else?.trim() ? <SummaryLine label="Anything else">{answers.anything_else}</SummaryLine> : null}
  </div>;
}
