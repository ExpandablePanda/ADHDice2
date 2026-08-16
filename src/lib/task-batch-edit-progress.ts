export type BatchEditProgressPhase = "complete" | "running" | "warning";

export type BatchEditProgress = {
  failed: number;
  fallbackCount: number;
  firstErrorMessage: string | null;
  finalizationErrorMessage: string | null;
  phase: BatchEditProgressPhase;
  processed: number;
  remaining: number;
  total: number;
  updated: number;
};

export function createBatchEditProgress(total: number): BatchEditProgress {
  return {
    failed: 0,
    fallbackCount: 0,
    firstErrorMessage: null,
    finalizationErrorMessage: null,
    phase: "running",
    processed: 0,
    remaining: total,
    total,
    updated: 0,
  };
}

export function recordBatchEditPlan(
  progress: BatchEditProgress,
  result: { errorMessage?: string | null; fallbackUsed?: boolean; success: boolean },
): BatchEditProgress {
  const processed = progress.processed + 1;
  return {
    ...progress,
    failed: progress.failed + (result.success ? 0 : 1),
    fallbackCount: progress.fallbackCount + (result.fallbackUsed ? 1 : 0),
    firstErrorMessage: progress.firstErrorMessage ?? result.errorMessage ?? null,
    processed,
    remaining: progress.total - processed,
    updated: progress.updated + (result.success ? 1 : 0),
  };
}

export function completeBatchEditProgress(progress: BatchEditProgress): BatchEditProgress {
  return { ...progress, phase: "complete", remaining: progress.total - progress.processed };
}

export function warnBatchEditProgress(progress: BatchEditProgress, errorMessage: string): BatchEditProgress {
  return {
    ...progress,
    finalizationErrorMessage: errorMessage,
    phase: "warning",
    remaining: progress.total - progress.processed,
  };
}

export function formatBatchEditProgressText(progress: BatchEditProgress): string {
  if (progress.phase === "complete") {
    return `${progress.updated} updated${progress.failed > 0 ? ` · ${progress.failed} failed` : ""}`;
  }

  const failureText = progress.failed > 0 ? ` · ${progress.failed} failed` : "";
  const phaseText = progress.phase === "warning" ? " · Finalization warning" : "";
  return `Batch Edit: ${progress.processed}/${progress.total} processed · ${progress.remaining} remaining${failureText}${phaseText}`;
}

export function formatBatchEditProgressDetail(progress: BatchEditProgress): string | null {
  const details: string[] = [];
  if (progress.finalizationErrorMessage) {
    details.push(progress.finalizationErrorMessage);
  }
  if (progress.firstErrorMessage) {
    details.push(progress.firstErrorMessage);
  }
  if (progress.fallbackCount > 0) {
    details.push(`${progress.fallbackCount} task${progress.fallbackCount === 1 ? "" : "s"} used low energy because your database is missing the newer "none" energy level.`);
  }
  return details.length > 0 ? details.join(" ") : null;
}
