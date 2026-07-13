import type { TaskActualTimeEntry } from "@/lib/database.types";

export type LearnedTaskDurationStatistics = {
  averageSeconds: number | null;
  completedSampleCount: number;
  latestSeconds: number | null;
  typicalSeconds: number | null;
};

/** Builds statistics from already-loaded task evidence; callers should memoize by task. */
export function computeLearnedTaskDurationStatistics(entries: TaskActualTimeEntry[]): LearnedTaskDurationStatistics {
  const occurrences = new Map<string, { completionAt: string; seconds: number }>();
  for (const entry of entries) {
    if (
      (entry.source !== "task_timer" && entry.source !== "manual")
      || !entry.estimate_eligible
      || entry.exclusion_reason !== null
      || !entry.completion_history_id
      || !entry.occurrence_key
      || entry.duration_seconds <= 0
    ) continue;
    const occurrenceId = `${entry.task_id}:completion:${entry.completion_history_id}`;
    const existing = occurrences.get(occurrenceId);
    occurrences.set(occurrenceId, {
      completionAt: existing?.completionAt && existing.completionAt > (entry.completion_completed_at ?? "")
        ? existing.completionAt
        : entry.completion_completed_at ?? "",
      seconds: (existing?.seconds ?? 0) + entry.duration_seconds,
    });
  }
  const samples = [...occurrences.values()];
  if (!samples.length) return { averageSeconds: null, completedSampleCount: 0, latestSeconds: null, typicalSeconds: null };
  const durations = samples.map((sample) => sample.seconds).sort((a, b) => a - b);
  const middle = Math.floor(durations.length / 2);
  const median = durations.length % 2 ? durations[middle] : Math.round((durations[middle - 1] + durations[middle]) / 2);
  const latest = samples.reduce((current, sample) => sample.completionAt > current.completionAt ? sample : current);
  return {
    averageSeconds: Math.round(durations.reduce((sum, seconds) => sum + seconds, 0) / durations.length),
    completedSampleCount: samples.length,
    latestSeconds: latest.seconds,
    typicalSeconds: samples.length >= 3 ? median : null,
  };
}
